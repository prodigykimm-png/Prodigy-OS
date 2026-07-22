"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = global.window || {};
require(path.join(ROOT, "SYSTEM/Views/display-registry.js"));
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-core.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-core.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-policy.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-service.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-hub-adapter.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-state.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-responsive.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-render.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-render.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-view.js"));
const { FakeElement, collectText, findByText } = require("./knowledge_explorer_view_fakes.js");
const { catalog, flattenCatalog } = require("./knowledge_explorer_fixtures.js");

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function buttonText(button) {
  return collectText(button).replace(/\s+/g, " ").trim();
}

function selectedButtons(root, group) {
  return walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-group"] === group && node.attr["aria-selected"] === "true");
}

function findButton(root, group, label) {
  return walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-group"] === group && buttonText(node) === label)[0] || null;
}

function findLink(root, label) {
  return walk(root, (node) => node.tag === "a" && buttonText(node) === label)[0] || null;
}

function assertScrollOwners(root, expectedOwners) {
  const owners = walk(root, (node) => node.attr && node.attr["data-scroll-owner"]);
  assert.equal(owners.length, expectedOwners.length, "each visible pane must expose exactly one scroll owner");
  for (const [owner, className] of expectedOwners) {
    const matches = owners.filter((node) => node.attr["data-scroll-owner"] === owner);
    assert.equal(matches.length, 1, `${owner} must have exactly one rendered scroll owner`);
    assert.ok(matches[0].attr.class.split(/\s+/).includes(className), `${owner} must use ${className}`);
  }
}

function visibleText(element) {
  if (!element || element.tag === "style") return "";
  return [element.text, ...(element.children || []).map(visibleText)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function createModel() {
  const records = flattenCatalog(catalog);
  const snapshot = JSON.stringify(records);
  const model = core.projectKnowledgeExplorer(records, registry);
  assert.equal(JSON.stringify(records), snapshot, "projection must not mutate fixtures");
  return model;
}

function createShell(overrides = {}) {
  const root = new FakeElement("section");
  const model = overrides.model || createModel();
  const opened = [];
  const shell = view.mountKnowledgeExplorer({
    container: root,
    model,
    onOpenBeside: (target) => opened.push(target),
    ...overrides
  });
  return { root, model, opened, shell };
}

function press(target, key) {
  let prevented = false;
  const event = {
    key,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {}
  };
  if (typeof target.onkeydown === "function") target.onkeydown(event);
  return prevented;
}

function click(target) {
  let prevented = false;
  const event = {
    preventDefault() {
      prevented = true;
    }
  };
  if (typeof target.onclick === "function") target.onclick(event);
  return prevented;
}

function testSelectionMachineAndKeyboard() {
  const { root, model, opened, shell } = createShell();
  const before = JSON.stringify(model);

  const initial = shell.state();
  assert.equal(initial.domainKey, model.selection.domain);
  assert.equal(initial.middleKind, model.selection.section_kind);
  assert.equal(initial.middleKey, model.selection.section_key);
  assert.equal(initial.assetPath, model.selection.asset_path);
  assert.equal(root.attr["data-shell"], "knowledge-explorer-shell");
  assert.equal(selectedButtons(root, "domain").length, 1);
  assert.equal(selectedButtons(root, "middle").length, 1);
  assert.equal(selectedButtons(root, "detail").length, 1);
  assertScrollOwners(root, [
    ["domain-nav", "knowledge-explorer-scroll-domain"],
    ["topic-nav", "knowledge-explorer-scroll-topic"],
    ["detail-pane", "knowledge-explorer-scroll-detail"]
  ]);

  const selectedDomain = selectedButtons(root, "domain")[0];
  assert.equal(press(selectedDomain, "Tab"), false, "Tab must not be trapped");

  assert.equal(press(selectedDomain, "ArrowDown"), true, "ArrowDown should be handled on the active domain");
  const nextDomain = shell.state().domainKey;
  assert.notEqual(nextDomain, initial.domainKey);
  assert.equal(selectedButtons(root, "domain").length, 1);
  assert.equal(selectedButtons(root, "middle").length, 1);

  const nextDomainButton = selectedButtons(root, "domain")[0];
  assert.equal(press(nextDomainButton, "Enter"), true, "Enter should advance the active pane");
  assert.equal(shell.state().focusPane, "middle");
  const middleButton = selectedButtons(root, "middle")[0];
  assert.equal(press(middleButton, " "), true, "Space should operate the middle list");
  assert.equal(shell.state().focusPane, "detail");

  const detailButton = selectedButtons(root, "detail")[0];
  const detailLink = detailButton
    ? walk(root, (node) => node.tag === "a" && node.attr && node.attr["data-action"] === "open-beside" && node.attr["data-asset-path"] === detailButton.attr["data-asset-path"])[0] || null
    : null;
  if (detailLink) {
    assert.equal(click(detailLink), true, "Open-beside link should suppress navigation");
    assert.equal(opened.length, 1);
    assert.equal(typeof opened[0], "string");
  }

  shell.dispatch({ type: "back" });
  assert.equal(shell.state().focusPane, "middle");
  shell.dispatch({ type: "back" });
  assert.equal(shell.state().focusPane, "domain");

  assert.equal(JSON.stringify(model), before, "selection updates must not mutate source records");
}

function testRendererStatesAndStress() {
  const model = createModel();
  const root = new FakeElement("section");
  const snapshots = [
    { surfaceState: "rest" },
    { surfaceState: "focus-visible" },
    { surfaceState: "selected" },
    { surfaceState: "loading" },
    { surfaceState: "empty" },
    { surfaceState: "error" },
    { surfaceState: "disabled" }
  ];

  for (const options of snapshots) {
    view.renderKnowledgeExplorer(root, model, options);
    assert.equal(root.attr["data-surface-state"], options.surfaceState);
    const text = visibleText(root);
    assert.match(text, /상태|포커스|선택|로딩|오류|비활성화/, `expected Korean state guidance for ${options.surfaceState}`);
    assert.equal(text.includes(options.surfaceState), false, `surface enum ${options.surfaceState} must not be rendered to users`);
    assert.equal(root.attr["data-shell"], "knowledge-explorer-shell");
  }

  const longModel = createModel();
  const longDomain = longModel.domains.find((domain) => domain.key === "personal_growth");
  assert.ok(longDomain, "fixture domain should exist");
  view.renderKnowledgeExplorer(root, longModel, {
    selection: {
      domainKey: "personal_growth",
      middleKind: "topic",
      middleKey: longDomain.topic_sections[0] ? longDomain.topic_sections[0].key : null,
      assetPath: longDomain.knowledge[0] ? longDomain.knowledge[0].path : null,
      focusPane: "detail"
    },
    surfaceState: "selected",
    layout: "desktop"
  });

  const shellText = collectText(root);
  assert.match(shellText, /Knowledge Explorer|knowledge-explorer-shell/);
  assert.ok(shellText.includes("아주 길고 길고 길고 길고 길고 길고 긴 한국어 제목"), "Korean stress label should render");

  const urlDomain = longModel.domains.find((domain) => domain.key === "reading");
  assert.ok(urlDomain, "reading domain should exist for URL stress");
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, longModel, {
    selection: {
      domainKey: "reading",
      middleKind: urlDomain.topic_sections[0] ? urlDomain.topic_sections[0].kind : "topic",
      middleKey: urlDomain.topic_sections[0] ? urlDomain.topic_sections[0].key : null,
      assetPath: urlDomain.topic_sections[0] && urlDomain.topic_sections[0].assets[0] ? urlDomain.topic_sections[0].assets[0].path : null,
      focusPane: "detail"
    },
    surfaceState: "selected",
    layout: "desktop"
  }));

  const styleBlock = walk(root, (node) => node.tag === "style")[0];
  assert.ok(styleBlock, "view must include a token-driven stylesheet");
  assert.match(styleBlock.text, /min-inline-size:\s*0/);
  assert.match(styleBlock.text, /min-block-size:\s*0/);
  assert.match(styleBlock.text, /overflow-wrap:\s*anywhere/);
  assert.match(styleBlock.text, /word-break:\s*keep-all/);
  assert.match(styleBlock.text, /knowledge-explorer-shell/);
}

async function testSelectedAssetHydrationPreservesFocusAndRetries() {
  // Given: a mounted Explorer with an otherwise cold selected-note body reader.
  let attempts = 0;
  const { root, shell } = createShell({
    hydrateAsset: async (asset) => {
      attempts += 1;
      if (attempts === 1) return Object.freeze({ status: "error", path: asset.path, error: "raw vault failure" });
      return Object.freeze({ status: "ready", path: asset.path, body: "선택한 노트의 지연 본문" });
    }
  });
  const selectedPath = shell.state().assetPath;

  // When: the user explicitly selects the detail asset, then retries that same selection.
  assert.equal(attempts, 0, "mounting must keep every note body cold");
  shell.dispatch({ type: "set-asset", assetPath: selectedPath });
  await Promise.resolve();

  // Then: the read is selected-only, failure uses Korean recovery copy, and focus stays in detail.
  assert.equal(attempts, 1);
  assert.equal(shell.state().focusPane, "detail");
  assert.match(collectText(root), /선택한 노트를 읽지 못했습니다/);
  assert.doesNotMatch(collectText(root), /raw vault failure/);

  // And when: the user retries the same selected asset.
  shell.dispatch({ type: "set-asset", assetPath: selectedPath });
  await Promise.resolve();

  // Then: the failed result was not retained and the selected body appears without focus regression.
  assert.equal(attempts, 2);
  assert.equal(shell.state().focusPane, "detail");
  assert.match(collectText(root), /선택한 노트의 지연 본문/);
}

async function main() {
  testSelectionMachineAndKeyboard();
  testRendererStatesAndStress();
  await testSelectedAssetHydrationPreservesFocusAndRetries();
  console.log("Knowledge Explorer view tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
