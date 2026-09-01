"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const contractAudit = require(path.join(ROOT, "SYSTEM/SCRIPTS/prodigy-contract-audit.js"));
const workspaceManifestFixture = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json")).entries;
const workspaceManifests = { get: (workspaceId) => workspaceManifestFixture[workspaceId] };

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

const CANONICAL_WORKSPACE_IDS = Object.freeze([
  "home", "auction", "region", "reading", "workout", "project", "knowledge", "personal", "journal",
]);
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

const CANONICAL_HUB_TITLES = Object.freeze({
  home: "홈",
  auction: "경매",
  region: "지역 비교",
  reading: "독서",
  workout: "운동",
  project: "프로젝트",
  knowledge: "지식",
  personal: "개인",
  journal: "저널",
});

const WORKSPACE_IDENTITY_MISMATCH = "workspace_id_mismatch";
const EVIDENCE_RELATIVE_PATH = ".omo/evidence/prodigy-os-full-audit-improvement/task-6-workspace-identity.json";

function validateHubWorkspaceIdentity({ hubPath, expectedId, source, registryEntries }) {
  return contractAudit.validateWorkspaceNavigationMount({
    hubPath,
    mappedWorkspaceId: expectedId,
    source,
    registryEntries,
  });
}

function registryExpectedMappings(workspaceRegistry) {
  const contextIds = workspaceRegistry.contextWorkspaceIds();
  assert.deepEqual(
    [...contextIds].sort(),
    [...CANONICAL_WORKSPACE_IDS].sort(),
    "registry must expose exactly the nine canonical AI context workspaces",
  );
  return CANONICAL_WORKSPACE_IDS.map((id) => {
    const record = workspaceRegistry.find(id);
    assert.ok(record, `registry must define canonical workspace "${id}" (${WORKSPACE_IDENTITY_MISMATCH})`);
    assert.equal(record.id, id, `registry record for "${id}" must expose the same id (${WORKSPACE_IDENTITY_MISMATCH})`);
    assert.match(record.path, /^HUB\/.+\.md$/, `registry record "${id}" must point at a Hub Markdown file`);
    return { id: record.id, hub: record.path, title: CANONICAL_HUB_TITLES[id] };
  });
}

function assertAppShellAdoption(relativePath, workspaceId, title) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const dependencySource = workspaceId === "region" ? source : workspaceManifests.get(workspaceId).required.join("\n");
  const loaderOrder = [
    "SYSTEM/Views/design-tokens.js",
    "SYSTEM/Views/workspace-registry.js",
    "SYSTEM/Views/prodigy-workspace-state-store.js",
    "SYSTEM/Views/prodigy-app-shell.js",
    "SYSTEM/Views/workspace-navigation.js",
  ].map((modulePath) => dependencySource.indexOf(modulePath));
  assert.ok(loaderOrder.every((index) => index >= 0), `${relativePath} loads every App Shell dependency`);
  assert.deepEqual(loaderOrder, [...loaderOrder].sort((a, b) => a - b), `${relativePath} loads App Shell dependencies in order`);
  assert.match(
    source,
    new RegExp(`ProdigyWorkspaceNavigation\\.mount\\([^;]+workspaceId:\\s*"${workspaceId}"[^;]+title:\\s*"${title}"`),
    `${relativePath} mounts its registered lane and Korean title`,
  );
  assert.match(source, /ProdigyWorkspaceNavigation\.renderLoaderError/, `${relativePath} uses the shared loader error state`);
}

function assertIdentityDriftIsMachineReadable(expectedMappings, registryEntries) {
  const regionExpected = expectedMappings.find((mapping) => mapping.id === "region");
  assert.ok(regionExpected, "region must be part of the registry-derived expectation set");
  const prefix = [
    'window.__prodigyMeasurementEntry = { workspaceId: "region" };',
    'const mountExample = \'ProdigyWorkspaceNavigation.mount(fake, { workspaceId: "auction" })\';',
    ""
  ].join("\n");
  const mount = (id) => `window.ProdigyWorkspaceNavigation.mount(this.container, {\n  app,\n  workspaceId: ${id},\n  context: { action: () => callWithBalancedParens(")") },\n  title: "지역 비교"\n});`;
  const cases = [
    { label: "Region mounting Auction", source: prefix + mount('"auction"'), reason: "mounted_workspace_mismatch", mountedId: "auction" },
    { label: "duplicate same-ID mounts", source: prefix + mount('"region"') + "\n" + mount('"region"'), reason: "mount_count_mismatch" },
    { label: "duplicate different mounts", source: prefix + mount('"region"') + "\n" + mount('"auction"'), reason: "mount_count_mismatch" },
    { label: "missing mount", source: prefix + "await loadReadOnlyModule('SYSTEM/Views/workspace-navigation.js');", reason: "mount_count_mismatch" },
    { label: "missing workspaceId", source: prefix + 'window.ProdigyWorkspaceNavigation.mount(this.container, { app, title: "지역 비교" });', reason: "mount_workspace_id_unreadable" },
    { label: "empty workspaceId", source: prefix + mount('""'), reason: "mount_workspace_id_unreadable" },
    { label: "malformed workspaceId", source: prefix + mount('"Region!"'), reason: "mount_workspace_id_unreadable" },
    { label: "unknown route", source: prefix + mount('"unknown"'), reason: "unknown_workspace_route" },
  ];
  cases.forEach((testCase) => {
    const result = validateHubWorkspaceIdentity({
      hubPath: regionExpected.hub,
      expectedId: regionExpected.id,
      source: testCase.source,
      registryEntries,
    });
    assert.equal(result.ok, false, testCase.label);
    assert.equal(result.code, WORKSPACE_IDENTITY_MISMATCH, `${testCase.label} keeps the stable machine code`);
    assert.equal(result.reason, testCase.reason, testCase.label);
    if (testCase.mountedId) assert.equal(result.mountedId, testCase.mountedId, testCase.label);
  });

  const callWithOptions = (options) => `window.ProdigyWorkspaceNavigation.mount(this.container, ${options});`;
  const overrideCases = [
    '{ workspaceId: "region", workspaceId: "auction" }',
    '{ workspaceId: "region", "workspaceId": "auction" }',
    '{ workspaceId: "region", ["workspaceId"]: "auction" }',
    '{ ["workspaceId"]: "region" }',
    '{ workspaceId: "region", "workspace\\u0049d": "auction" }',
    '{ workspaceId: "region", [identityKey]: "auction" }',
    '{ ...defaults, workspaceId: "region" }',
    '{ workspaceId: "region", ...overrides }',
    'enabled && { workspaceId: "region" }',
    '{ workspaceId: "region" } || { workspaceId: "auction" }',
    'enabled ? { workspaceId: "region" } : { workspaceId: "auction" }',
    '{ get workspaceId() { return "auction"; }, workspaceId: "region" }',
    '{ workspaceId() { return "auction"; }, workspaceId: "region" }',
  ];
  overrideCases.forEach((options, index) => {
    const result = validateHubWorkspaceIdentity({
      hubPath: regionExpected.hub,
      expectedId: regionExpected.id,
      source: prefix + callWithOptions(options),
      registryEntries,
    });
    assert.equal(result.ok, false, `semantic override ${index}: ${options}`);
    assert.equal(result.code, WORKSPACE_IDENTITY_MISMATCH, `semantic override ${index} keeps the stable machine code`);
    assert.equal(result.reason, "mount_workspace_id_unreadable", `semantic override ${index} fails closed`);
  });

  [
    '{ "workspaceId": "region" }',
    '{ workspaceId: "\\x72egion" }',
    '{ workspaceId: "\\u0072egion" }',
    '{ workspaceId: "\\u{72}egion" }',
    '{ workspaceId: "r\\egion" }',
    "{ 'workspaceId': '\\x72\\u0065\\u{67}ion' }",
  ].forEach((options) => {
    const result = validateHubWorkspaceIdentity({
      hubPath: regionExpected.hub,
      expectedId: regionExpected.id,
      source: prefix + callWithOptions(options),
      registryEntries,
    });
    assert.equal(result.ok, true, `static escaped canonical identity must pass: ${options}`);
    assert.equal(result.mountedId, "region");
  });

  const registryDrift = registryEntries.map((entry) => entry.id === "region" ? { id: entry.id, path: "HUB/10 Auction.md" } : entry);
  const disagreement = validateHubWorkspaceIdentity({
    hubPath: regionExpected.hub,
    expectedId: regionExpected.id,
    source: prefix + mount('"region"'),
    registryEntries: registryDrift,
  });
  assert.equal(disagreement.reason, "registry_map_disagreement");
  assert.equal(disagreement.code, WORKSPACE_IDENTITY_MISMATCH);

  const valid = validateHubWorkspaceIdentity({
    hubPath: regionExpected.hub,
    expectedId: regionExpected.id,
    source: prefix + mount('"region"'),
    registryEntries,
  });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(valid.mounts.length, 1, "the parser returns the one actual mount record");
  assert.equal(valid.mountedId, "region", "measurement metadata preceding the mount is ignored");
}

function assertWorkspaceIdentityConsistency() {
  const workspaceRegistry = require(path.join(ROOT, "SYSTEM/Views/workspace-registry.js"));
  const expectedMappings = registryExpectedMappings(workspaceRegistry);
  const registryEntries = workspaceRegistry.routeTable().map(({ id, path: routePath }) => ({ id, path: routePath }));
  assert.equal(expectedMappings.length, 9, "registry must yield exactly nine canonical workspace expectations");

  const mappings = expectedMappings.map((expected) => {
    const source = fs.readFileSync(path.join(ROOT, expected.hub), "utf8");
    const result = validateHubWorkspaceIdentity({ hubPath: expected.hub, expectedId: expected.id, source, registryEntries });
    assert.equal(
      result.code,
      null,
      `Hub ${expected.hub} mounts workspace id "${result.mountedId}" but the registry expects "${expected.id}" (${result.code})`,
    );
    return { hub: path.basename(expected.hub), mounted_id: result.mountedId, registry_id: expected.id };
  });

  assert.equal(mappings.length, 9, "exactly nine Hub mounts must be independently parsed and verified");
  const mountedIds = mappings.map((mapping) => mapping.mounted_id);
  assert.equal(new Set(mountedIds).size, 9, `the nine mounted workspace ids must be unique (${WORKSPACE_IDENTITY_MISMATCH})`);
  assert.deepEqual(
    [...mountedIds].sort(),
    [...expectedMappings.map((expected) => expected.id)].sort(),
    `mounted workspace ids must equal the registry-derived id set exactly (${WORKSPACE_IDENTITY_MISMATCH})`,
  );
  for (const id of CANONICAL_WORKSPACE_IDS) {
    assert.ok(mountedIds.includes(id), `canonical workspace "${id}" must be mounted by its registry-linked Hub`);
  }

  assertIdentityDriftIsMachineReadable(expectedMappings, registryEntries);

  const regionEntry = workspaceRegistry.find("region");
  assert.ok(regionEntry, "Registry must contain region workspace for AI context");
  assert.equal(regionEntry.launcher, false, "Region must not appear in launcher");
  assert.equal(regionEntry.dock, false, "Region must not appear in dock");
  const regionVisibility = {
    context: workspaceRegistry.contextWorkspaceIds().includes("region"),
    launcher: regionEntry.launcher === true,
    dock: regionEntry.dock === true,
  };
  assert.deepEqual(regionVisibility, { context: true, launcher: false, dock: false }, "Region stays an AI context workspace only");

  return { mappings, regionVisibility, expectedMappings };
}

function writeIdentityReceipt({ mappings, regionVisibility }) {
  assert.equal(mappings.length, 9, "receipt must carry exactly nine verified mappings");
  assert.equal(new Set(mappings.map((mapping) => mapping.mounted_id)).size, 9, "receipt mappings must carry nine unique ids");
  const receipt = { status: "pass", mappings, region_visibility: regionVisibility };
  const target = path.join(ROOT, EVIDENCE_RELATIVE_PATH);
  if (!fs.existsSync(path.join(ROOT, ".omo"))) return null;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return target;
  } catch (_) {
    return null;
  }
}

async function main() {
  const view = require(path.join(ROOT, "SYSTEM/Views/workspace-list-view.js"));
  const shell = require(path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js"));
  const controls = require(path.join(ROOT, "SYSTEM/Views/prodigy-adaptive-controls.js"));
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
  for (const [name, value] of Object.entries({ ...shell, ...controls, StatusLine: ui.StatusLine, InlineError: ui.InlineError })) {
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
  assert.match(css, /@media\(max-width:833px\)/);
  assert.match(css, /min-block-size:var\(--ke-touch-target\)/);

  const identity = assertWorkspaceIdentityConsistency();
  for (const mapping of identity.expectedMappings) assertAppShellAdoption(mapping.hub, mapping.id, mapping.title);
  const navigationSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workspace-navigation.js"), "utf8");
  assert.match(navigationSource, /BREAKPOINTS/);
  assert.match(navigationSource, /CONTROL_HEIGHTS/);
  assert.doesNotMatch(navigationSource, /\b(?:768|1024|48|52|44)\b/, "navigation must consume canonical responsive tokens");

  // Knowledge uses the dedicated Explorer stack; Personal still uses the shared list workspace.
  const knowledgeHub = fs.readFileSync(path.join(ROOT, "HUB/50 Knowledge.md"), "utf8");
  assert.doesNotMatch(knowledgeHub, /workspace-list-view\.js/);
  const knowledgeDependencies = workspaceManifests.get("knowledge").required.join("\n");
  assert.match(knowledgeDependencies, /display-registry\.js/);
  assert.match(knowledgeDependencies, /knowledge-explorer-registry\.js/);
  assert.match(knowledgeDependencies, /knowledge-explorer-core\.js/);
  assert.match(knowledgeDependencies, /knowledge-explorer-relations\.js/);
  assert.match(knowledgeDependencies, /knowledge-explorer-view\.js/);
  assert.match(knowledgeHub, /KnowledgeExplorerHub\.render/);
  assert.equal(knowledgeHub.includes("dv.table"), false);
  assert.equal(knowledgeHub.includes("Recent Journals"), false);

  const personal = fs.readFileSync(path.join(ROOT, "HUB/60 Personal.md"), "utf8");
  const personalDependencies = workspaceManifests.get("personal").required;
  assert.ok(personalDependencies.includes("SYSTEM/Views/workspace-list-view.js"));
  assert.ok(personalDependencies.includes("SYSTEM/Views/people-core.js") || /type === "people"/.test(personal));
  assert.match(personal, /사람/);
  const journalHub = fs.readFileSync(path.join(ROOT, "HUB/70 Journal.md"), "utf8");
  assert.ok(workspaceManifests.get("journal").required.includes("SYSTEM/Views/journal-view.js"));
  for (const workspaceId of ["home", "auction", "project", "knowledge", "reading", "journal"]) {
    const required = workspaceManifests.get(workspaceId).required;
    const hashIndex = required.indexOf("SYSTEM/Views/llmwiki-hash.js");
    const clientIndex = required.indexOf("SYSTEM/Views/prodigy-ai-client.js");
    assert.ok(hashIndex >= 0 && clientIndex > hashIndex, `${workspaceId} must load hash before the AI client`);
    assert.equal(required.some((dependency) => /ai-provider-service|codex-exec-service|antigravity-exec-service/u.test(dependency)), false);
  }
  const journalDependencies = workspaceManifests.get("journal").required.join("\n");
  const conservativePolicyIndex = journalDependencies.indexOf("daily-reflection-conservative-policy.js");
  const dailyReflectionAiIndex = journalDependencies.indexOf("daily-reflection-ai.js");
  assert.ok(
    conservativePolicyIndex >= 0 && conservativePolicyIndex < dailyReflectionAiIndex,
    "Journal must load the Daily Reflection conservative policy before the AI module"
  );
  assert.equal(journalHub.includes("dv.table"), false);
  assert.equal(journalHub.includes("Recent Journals"), false);
  const home = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  assert.match(home, /workspacePathFor/);
  assert.match(home, /workspaceRegistry\.pathFor/);
  assert.equal(workspaceRegistry.pathFor("workout"), "HUB/30 Workout.md");
  assert.equal(workspaceRegistry.pathFor("knowledge"), "HUB/50 Knowledge.md");
  assert.match(home, /workout: "운동"/);
  const homeHub = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
  const homeDependencies = workspaceManifests.get("home").required;
  assert.ok(homeDependencies.includes("SYSTEM/Views/journal-review-modal.js"));
  assert.equal(homeDependencies.some((modulePath) => /daily-reflection-ai\.js|journal-view\.js/.test(modulePath)), false);
  assert.match(home, /JournalReviewModal\.open/);
  const allRegistryIds = workspaceRegistry.contextWorkspaceIds();
  const canonicalHubIds = APP_SHELL_HUBS.map((hub) => hub.workspaceId);
  const uniqueCanonicalIds = [...new Set(canonicalHubIds)];
  assert.equal(uniqueCanonicalIds.length, 9, "9 unique canonical Hub workspaceIds");
  for (const hubId of uniqueCanonicalIds) {
    assert.ok(allRegistryIds.includes(hubId), `Hub workspaceId "${hubId}" must exist in workspace registry`);
  }
  const launcherIds = workspaceRegistry.launcherItems().map((item) => item.id);
  assert.ok(!launcherIds.includes("region"), "Region must not appear in launcher");
  const regionItem = workspaceRegistry.find("region");
  assert.ok(regionItem !== null, "Region must exist in registry");
  assert.equal(regionItem.launcher, false, "Region launcher flag must be false");
  assert.equal(regionItem.dock, false, "Region dock flag must be false");
  const homeItem = workspaceRegistry.find("home");
  assert.ok(homeItem !== null, "Home must exist in registry");
  assert.equal(homeItem.launcher, false, "Home launcher flag must be false");
  assert.equal(homeItem.dock, false, "Home dock flag must be false");
  assert.equal(launcherIds.length, 5, "Exactly 5 workspaces in launcher (excluding non-launcher contexts)");


  const receiptPath = writeIdentityReceipt(identity);
  const receiptNote = receiptPath ? `receipt: ${EVIDENCE_RELATIVE_PATH}` : "receipt skipped (no .omo evidence root)";
  console.log(`Workspace consistency tests passed (${identity.mappings.length} verified workspace mounts, ${receiptNote})`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
