"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CORE_PATH = path.join(ROOT, "SYSTEM/Views/project-wizard-core.js");
const TOKENS_PATH = path.join(ROOT, "SYSTEM/Views/design-tokens.js");
const TEMPLATE_PATH = path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_project.md");
const HUB_PATH = path.join(ROOT, "HUB/40 Project.md");

class Element {
  constructor() {
    this.children = [];
    this.attr = {};
    this.classList = { toggle() {}, add() {} };
    this.style = { setProperty(name, value) { this[name] = value; } };
  }

  createEl(tag, options = {}) {
    const child = new Element();
    child.tag = tag;
    child.text = options.text || "";
    child.attr = options.attr || {};
    this.children.push(child);
    return child;
  }

  empty() { this.children = []; }
  addClass() {}
  setAttribute(key, value) { this.attr[key] = value; }
}

function findByText(element, text) {
  if (element.text === text) return element;
  for (const child of element.children) {
    const match = findByText(child, text);
    if (match) return match;
  }
  return null;
}

function findByClass(element, className) {
  if (String(element.attr.class || "").split(/\s+/).includes(className)) return element;
  for (const child of element.children) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

async function main() {
  // Given: Obsidian may execute Project's JS Engine and Dataview blocks concurrently.
  const hubSource = fs.readFileSync(HUB_PATH, "utf8");
  const projectBlocks = [...hubSource.matchAll(/```(?:js-engine|dataviewjs)\n([\s\S]*?)```/g)]
    .map((match) => match[1]);
  const bootstrap = projectBlocks[0];
  const layoutConsumers = projectBlocks.slice(1)
    .filter((source) => source.includes("resolveProjectWorkspaceLayout"));

  // When: the bootstrap and every layout consumer are inspected.
  // Then: readiness is published before the first async load, and consumers await it.
  assert.ok(bootstrap, "Project bootstrap block is missing");
  assert.ok(
    bootstrap.indexOf("window.prodigyProjectReady =") >= 0
      && bootstrap.indexOf("window.prodigyProjectReady =") < bootstrap.indexOf("ProdigyHubLoader.mountWorkspace"),
    "Project readiness must be the shared mount promise consumed by later blocks"
  );
  assert.doesNotMatch(bootstrap, /loadProdigyScript/, "Project must not retain a private module loader");
  assert.ok(layoutConsumers.length >= 4, "expected every Project layout surface to be covered");
  layoutConsumers.forEach((source, index) => {
    assert.match(source, /await window\.prodigyProjectReady/, `Project layout consumer ${index + 1} must await bootstrap readiness`);
  });
  assert.doesNotMatch(hubSource, /setInterval|__prodigyProjectInterval|대시보드 리소스를 불러오는 중/u, "Project sections must use the exact mount promise rather than delayed polling");
  assert.match(hubSource, /\.prodigy-app-shell\[data-workspace-id="project"\]>.prodigy-workspace-bar\{padding-inline:4px\}/, "Project returns enough owned workspace-title width");
  assert.match(fs.readFileSync(path.join(ROOT, "SYSTEM/Views/project-wizard.js"), "utf8"), /modalEl\.setAttribute\("data-task13a-owned-prompt", "true"\)/, "Project wizard declares production ownership of its native Obsidian dialog");
  assert.equal((hubSource.match(/if \(!run\(\)\) \{\n  await window\.prodigyProjectReady;/gu) || []).length, 7, "all seven Project sections have exact readiness authority");

  // Given: canonical tokens and explicit compact/wide logical widths.
  const tokens = require(TOKENS_PATH);
  global.ProdigyTokens = tokens;
  const core = require(CORE_PATH);
  assert.equal(typeof core.resolveProjectWorkspaceLayout, "function", "responsive Project layout resolver is missing");

  // When: the same workspace is resolved at compact and wide widths.
  const compact = core.resolveProjectWorkspaceLayout(tokens.BREAKPOINTS.medium - 1);
  const medium = core.resolveProjectWorkspaceLayout(tokens.BREAKPOINTS.medium);
  const wide = core.resolveProjectWorkspaceLayout(tokens.BREAKPOINTS.wide);

  // Then: compact is one column, wide is multi-column, and control sizes come from tokens.
  assert.equal(compact.density, "compact");
  assert.equal(compact.columns, 1);
  assert.equal(medium.density, "medium");
  assert.equal(medium.columns, 1);
  assert.equal(wide.density, "wide");
  assert.equal(wide.columns, 2);
  assert.equal(compact.actionBarHeight, tokens.CONTROL_HEIGHTS.actionBar);
  assert.equal(compact.touchTarget, tokens.CONTROL_HEIGHTS.touchTarget);

  // Given: a valid Project draft and a vault that records writes.
  let writes = 0;
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const app = {
    vault: {
      getAbstractFileByPath(filePath) {
        if (filePath === "SYSTEM/TEMPLATE/FORMAT/template_project.md") return { path: filePath };
        return null;
      },
      getFiles() { return []; },
      async read() { return template; },
      async create() { writes += 1; },
    },
    workspace: { openLinkText() {} },
  };
  global.obsidian = { Modal: class { constructor(modalApp) { this.app = modalApp; this.contentEl = new Element(); } } };
  global.ProjectWizardCore = core;
  global.prodigyDisplay = { property: (key) => key, status: (key) => key };
  global.ProjectWorkflowDraftService = { listProviders: () => [] };
  require(path.join(ROOT, "SYSTEM/Views/project-wizard.js"));

  // When: the real Wizard render receives explicit wide and compact logical widths.
  const wideModal = new global.ProjectWizardModal(app, { logicalWidth: tokens.BREAKPOINTS.wide });
  wideModal.render();
  const compactModal = new global.ProjectWizardModal(app, { logicalWidth: tokens.BREAKPOINTS.medium - 1 });
  compactModal.render();

  // Then: the rendered shell itself exposes two columns at wide and one at compact.
  const wideShell = findByClass(wideModal.contentEl, "prodigy-wizard-shell");
  const compactShell = findByClass(compactModal.contentEl, "prodigy-wizard-shell");
  assert.match(wideShell.attr.style, /minmax\(0,0\.85fr\) minmax\(0,1\.35fr\)/);
  assert.match(compactShell.attr.style, /grid-template-columns:minmax\(0,1fr\)/);
  assert.equal(compactModal.contentEl.style["--ke-touch-target"], `${tokens.CONTROL_HEIGHTS.touchTarget}px`);
  assert.equal(compactModal.contentEl.style["--ke-control-height"], `${tokens.CONTROL_HEIGHTS.native}px`);
  const workflowInput = findByClass(compactModal.contentEl, "prodigy-workflow-input");
  assert.equal(workflowInput.tag, "textarea", "compact workflow values must wrap rather than create input overflow");

  const modal = new global.ProjectWizardModal(app, { logicalWidth: tokens.BREAKPOINTS.wide });
  modal.render = () => {};
  modal.state.projectName = "승인 경계 검증";
  modal.state.dueDate = "2026-08-30";
  const footer = new Element();

  // When: the approval footer is rendered but its explicit create action is not clicked.
  modal.renderFooter(footer);

  // Then: rendering alone performs no write; clicking the human action performs exactly one write.
  assert.equal(writes, 0, "rendering the wizard must not write a Project");
  const createButton = findByText(footer, "프로젝트 만들기");
  assert.ok(createButton, "human approval button is missing");
  await createButton.onclick();
  assert.equal(writes, 1, "the explicit human approval action must gate the Project write");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
