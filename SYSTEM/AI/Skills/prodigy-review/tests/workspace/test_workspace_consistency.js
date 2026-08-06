"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

class Element {
  constructor(tag = "div") { this.tag = tag; this.text = ""; this.children = []; this.attr = {}; this.style = {}; this.offsetWidth = 400; }
  createEl(tag, options = {}) { const item = new Element(tag); item.text = options.text || ""; item.attr = options.attr || {}; this.children.push(item); return item; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; }
  addClass() {}
  setAttr(key, value) { this.attr[key] = value; }
  setAttribute(key, value) { this.attr[key] = value; }
  removeAttribute(key) { delete this.attr[key]; }
  focus() { this.focused = true; }
  addEventListener(type, listener) { (this.listeners ||= {})[type] = listener; }
  removeEventListener(type) { if (this.listeners) delete this.listeners[type]; }
}
function textOf(node) { return [node.text, ...node.children.flatMap(textOf)].filter(Boolean).join(" "); }

const APP_SHELL_HUBS = Object.freeze([
  { path: "HUB/00 Home.md", workspaceId: "home", title: "홈" },
  { path: "HUB/10 Auction.md", workspaceId: "auction", title: "경매" },
  { path: "HUB/15 Region.md", workspaceId: "region", title: "지역 비교" },
  { path: "HUB/30 Workout.md", workspaceId: "workout", title: "운동" },
  { path: "HUB/20 Reading.md", workspaceId: "reading", title: "독서" },
  { path: "HUB/40 Project.md", workspaceId: "project", title: "프로젝트" },
  { path: "HUB/50 Knowledge.md", workspaceId: "knowledge", title: "지식" },
  { path: "HUB/60 Personal.md", workspaceId: "personal", title: "개인" },
  { path: "HUB/70 Journal.md", workspaceId: "journal", title: "저널" },
]);

function assertAppShellAdoption(relativePath, workspaceId, title) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const loaderOrder = [
    "SYSTEM/Views/design-tokens.js",
    "SYSTEM/Views/workspace-registry.js",
    "SYSTEM/Views/prodigy-workspace-state-store.js",
    "SYSTEM/Views/prodigy-app-shell.js",
    "SYSTEM/Views/workspace-navigation.js",
  ].map((modulePath) => source.indexOf(modulePath));
  assert.ok(loaderOrder.every((index) => index >= 0), `${relativePath} loads every App Shell dependency`);
  assert.deepEqual(loaderOrder, [...loaderOrder].sort((a, b) => a - b), `${relativePath} loads App Shell dependencies in order`);
  assert.match(
    source,
    new RegExp(`ProdigyWorkspaceNavigation\\.mount\\([^;]+workspaceId:\\s*"${workspaceId}"[^;]+title:\\s*"${title}"`),
    `${relativePath} mounts its registered lane and Korean title`,
  );
  assert.match(source, /ProdigyWorkspaceNavigation\.renderLoaderError/, `${relativePath} uses the shared loader error state`);
}

async function main() {
  const view = require(path.join(ROOT, "SYSTEM/Views/workspace-list-view.js"));
  const shell = require(path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js"));
  const controls = require(path.join(ROOT, "SYSTEM/Views/prodigy-adaptive-controls.js"));
  const inspector = require(path.join(ROOT, "SYSTEM/Views/ai-inspector.js"));
  const ui = require(path.join(ROOT, "SYSTEM/Views/prodigy-ui.js"));
  const tokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));
  assert.deepEqual(tokens.TYPOGRAPHY, {
    chrome: "0.68rem",
    label: "0.72rem",
    body: "0.84rem",
    heading: "0.92rem",
    title: "1.05rem",
    bodyLeading: 1.45,
    controlLeading: 1.35,
  });
  assert.deepEqual(tokens.SPACING, { xs: 2, sm: 4, md: 8, lg: 12, xl: 16 });
  for (const [name, value] of Object.entries({ ...shell, ...controls, ...inspector, StatusLine: ui.StatusLine, InlineError: ui.InlineError })) {
    assert.equal(typeof value, "function", `${name} export`);
  }
  const shellContainer = new Element();
  const mountedShell = shell.AppShell(shellContainer, { workspaceId: "knowledge", title: "지식" });
  assert.match(
    mountedShell.element.attr.style,
    /--ke-type-body:0\.84rem;--ke-type-title:1\.05rem;--ke-leading-body:1\.45/,
    "App Shell exposes the shared typography contract to every workspace",
  );
  const workspaceRegistry = require(path.join(ROOT, "SYSTEM/Views/workspace-registry.js"));
  assert.equal(mountedShell.switcher.children.length, workspaceRegistry.items().length);
  assert.match(textOf(shellContainer), /경매/);
  for (const item of workspaceRegistry.items()) assert.equal(textOf(shellContainer).includes(item.icon), false);
  let openedPath = "";
  const switcherHost = new Element();
  const switcher = shell.WorkspaceSwitcher(switcherHost, {
    app: { workspace: { openLinkText: async (target) => { openedPath = target; } } },
  });
  switcher.value = "reading";
  await switcher.onchange();
  assert.equal(openedPath, "HUB/20 Reading");
  const navigation = require(path.join(ROOT, "SYSTEM/Views/workspace-navigation.js"));
  const navigationHost = new Element();
  const mountedNavigation = navigation.mount(navigationHost, { app: {}, workspaceId: "reading", title: "독서" });
  assert.equal(mountedNavigation.element.attr["data-workspace-id"], "reading");
  assert.equal(mountedNavigation.body.tag, "main");
  assert.match(textOf(navigationHost), /독서/);
  const errorHost = new Element();
  navigation.renderLoaderError(errorHost, new Error("private provider detail"), { title: "독서" });
  assert.match(textOf(errorHost), /독서 워크스페이스를 불러오지 못했습니다/);
  assert.doesNotMatch(textOf(errorHost), /private provider detail/);
  const tabHost = new Element();
  const firstPanel = new Element();
  const secondPanel = new Element();
  const tabs = controls.AdaptiveTabs(tabHost, { tabs: [
    { id: "first", label: "첫 화면", panel: firstPanel, disabled: true },
    { id: "second", label: "둘째 화면", panel: secondPanel },
  ] });
  assert.equal(tabs.getActiveTab(), "second");
  assert.equal(secondPanel.hidden, false);
  const inspectorHost = new Element();
  const inspectorShell = inspector.AIInspector(inspectorHost);
  inspectorShell.open();
  assert.equal(inspectorShell.isOpen(), true);
  inspectorShell.close();
  assert.equal(inspectorShell.isOpen(), false);
  const container = new Element();
  view.render({
    app: { workspace: { openLinkText: async () => {} } },
    container,
    title: "지식",
    subtitle: "검증된 이해를 찾고 연결합니다.",
    actions: [{ label: "오늘 기록 열기", path: "DAILY/DAILY/2026-07-17.md" }],
    sections: [{ title: "최근 지식", empty: "없음", items: [{ title: "판단 원칙", path: "ZETA/PERMANENT/판단 원칙.md", meta: ["영구 노트"], detail: "검증된 기록" }] }],
  });
  const text = textOf(container);
  for (const label of ["지식", "최근 지식", "판단 원칙", "영구 노트", "열기"]) assert.match(text, new RegExp(label));
  assert.equal(typeof view.openBeside, "function");
  const css = container.children.find((item) => item.tag === "style").text;
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /min-height:44px/);

  for (const hub of APP_SHELL_HUBS) assertAppShellAdoption(hub.path, hub.workspaceId, hub.title);
  const navigationSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workspace-navigation.js"), "utf8");
  assert.match(navigationSource, /BREAKPOINTS/);
  assert.match(navigationSource, /CONTROL_HEIGHTS/);
  assert.doesNotMatch(navigationSource, /\b(?:768|1024|48|52|44)\b/, "navigation must consume canonical responsive tokens");

  // Knowledge uses the dedicated Explorer stack; Personal still uses the shared list workspace.
  const knowledgeHub = fs.readFileSync(path.join(ROOT, "HUB/50 Knowledge.md"), "utf8");
  assert.doesNotMatch(knowledgeHub, /workspace-list-view\.js/);
  assert.match(knowledgeHub, /display-registry\.js/);
  assert.match(knowledgeHub, /knowledge-explorer-registry\.js/);
  assert.match(knowledgeHub, /knowledge-explorer-core\.js/);
  assert.match(knowledgeHub, /knowledge-explorer-relations\.js/);
  assert.match(knowledgeHub, /knowledge-explorer-view\.js/);
  assert.match(knowledgeHub, /KnowledgeExplorerHub\.render/);
  assert.equal(knowledgeHub.includes("dv.table"), false);
  assert.equal(knowledgeHub.includes("Recent Journals"), false);

  const personal = fs.readFileSync(path.join(ROOT, "HUB/60 Personal.md"), "utf8");
  assert.match(personal, /workspace-list-view\.js/);
  assert.match(personal, /people-core\.js|type === "people"/);
  assert.match(personal, /사람/);
  const journalHub = fs.readFileSync(path.join(ROOT, "HUB/70 Journal.md"), "utf8");
  assert.match(journalHub, /journal-view\.js/);
  const providerResponseIndex = journalHub.indexOf("ai-provider-response.js");
  const providerSchemaIndex = journalHub.indexOf("ai-provider-schema.js");
  const providerServiceIndex = journalHub.indexOf("ai-provider-service.js");
  assert.ok(
    providerResponseIndex >= 0 && providerSchemaIndex >= 0 && providerResponseIndex < providerServiceIndex && providerSchemaIndex < providerServiceIndex,
    "Journal must load AI provider parsing dependencies before the provider service"
  );
  const conservativePolicyIndex = journalHub.indexOf("daily-reflection-conservative-policy.js");
  const dailyReflectionAiIndex = journalHub.indexOf("daily-reflection-ai.js");
  assert.ok(
    conservativePolicyIndex >= 0 && conservativePolicyIndex < dailyReflectionAiIndex,
    "Journal must load the Daily Reflection conservative policy before the AI module"
  );
  assert.equal(journalHub.includes("dv.table"), false);
  assert.equal(journalHub.includes("Recent Journals"), false);
  const home = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  assert.match(home, /HUB\/30 Workout\.md/);
  assert.match(home, /HUB\/50 Knowledge\.md/);
  assert.match(home, /workout: "운동"/);

  // Registry consistency: all 9 canonical Hub workspaceIds must exist in registry
  const allRegistryIds = workspaceRegistry.contextWorkspaceIds();
  const canonicalHubIds = APP_SHELL_HUBS.map((hub) => hub.workspaceId);
  const uniqueCanonicalIds = [...new Set(canonicalHubIds)];
  assert.equal(uniqueCanonicalIds.length, 9, "9 unique canonical Hub workspaceIds");
  
  for (const hubId of uniqueCanonicalIds) {
    assert.ok(
      allRegistryIds.includes(hubId),
      `Hub workspaceId "${hubId}" must exist in workspace registry`
    );
  }

  // Region must be AI-context-only: not in launcher and not in dock
  const launcherIds = workspaceRegistry.launcherItems().map((item) => item.id);
  assert.ok(!launcherIds.includes("region"), "Region must not appear in launcher");
  
  const regionItem = workspaceRegistry.find("region");
  assert.ok(regionItem !== null, "Region must exist in registry");
  assert.equal(regionItem.launcher, false, "Region launcher flag must be false");
  assert.equal(regionItem.dock, false, "Region dock flag must be false");
  
  // Home must also be AI-context-only
  const homeItem = workspaceRegistry.find("home");
  assert.ok(homeItem !== null, "Home must exist in registry");
  assert.equal(homeItem.launcher, false, "Home launcher flag must be false");
  assert.equal(homeItem.dock, false, "Home dock flag must be false");
  
  // Verify the 7 standard launcher items
  assert.equal(launcherIds.length, 5, "Exactly 5 workspaces in launcher (excluding non-launcher contexts)");
  console.log("Workspace consistency tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
