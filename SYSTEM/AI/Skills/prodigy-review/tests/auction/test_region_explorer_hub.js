"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../../");
const REGION_ROOT = "PARA/RESOURCES/Auction Regions/";
const HUB_PATH = "HUB/15 Region.md";
const REGISTRY_PATHS = [
  "SYSTEM/SCRIPTS/region-metrics-manifest-index.json",
  "SYSTEM/SCRIPTS/region-metrics-busan-manifest.json",
  "SYSTEM/SCRIPTS/region-metrics-seoul-manifest.json",
  "SYSTEM/SCRIPTS/region-metrics-gyeonggi-manifest.json",
  "SYSTEM/SCRIPTS/region-metrics-incheon-manifest.json"
];
const MODULE_PATHS = [
  "SYSTEM/Views/workspace-navigation.js",
  "SYSTEM/SCRIPTS/region-metrics-registry-core.js",
  "SYSTEM/Views/region-explorer-projection.js",
  "SYSTEM/Views/region-explorer-data-source.js",
  "SYSTEM/Views/region-explorer-state.js",
  "SYSTEM/Views/region-explorer-view.js"
];
const REGION_EXPERIENCE_MODULE_PATHS = [
  "SYSTEM/Views/region-experience-contract.js",
  "SYSTEM/Views/journal-core.js",
  "SYSTEM/Views/region-experience-store.js",
  "SYSTEM/Views/ai-provider-response.js",
  "SYSTEM/Views/ai-provider-schema.js",
  "SYSTEM/Views/ai-provider-service.js",
  "SYSTEM/Views/prodigy-config-service.js",
  "SYSTEM/Views/project-workflow-draft-service.js",
  "SYSTEM/Views/region-experience-provider-endpoint-guard.js",
  "SYSTEM/Views/region-experience-ai.js",
  "SYSTEM/Views/journal-store.js",
  "SYSTEM/Views/daily-reflection-knowledge-handoff.js",
  "SYSTEM/Views/knowledge-explorer-registry.js",
  "SYSTEM/Views/knowledge-candidate-core.js",
  "SYSTEM/Views/evidence-quality-core.js",
  "SYSTEM/Views/knowledge-candidate-store.js",
  "SYSTEM/Views/region-experience-handoff.js",
  "SYSTEM/Views/region-experience-modal.js"
];

class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.text = "";
    this.attr = {};
    this.clientWidth = 1280;
    this.scrollWidth = 0;
    this.focusCalls = 0;
    this.focusOptions = [];
    this.isConnected = true;
    this.onclick = null;
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = String(options.text ?? "");
    child.attr = { ...(options.attr || {}) };
    child.clientWidth = this.clientWidth;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  createDiv(options = {}) { return this.createEl("div", options); }
  createSpan(options = {}) { return this.createEl("span", options); }
  empty() { this.children = []; this.text = ""; }
  setText(value) { this.text = String(value ?? ""); }
  setAttr(name, value) { this.attr[name] = value; }
  addClass() {}
  addEventListener(_event, handler) { this.onclick = handler; }
  focus(options) { this.focusCalls += 1; this.focusOptions.push(options); }
}

function renderedText(node) {
  return [node && node.text, ...((node && node.children) || []).map(renderedText)].filter(Boolean).join(" ");
}

function walk(node, predicate, found = []) {
  if (node && predicate(node)) found.push(node);
  for (const child of (node && node.children) || []) walk(child, predicate, found);
  return found;
}

function controlLayout(container, width) {
  const controls = walk(container, (node) => node.attr && node.attr.class === "region-explorer-controls")[0];
  const style = walk(container, (node) => node.tag === "style" && node.attr && node.attr["data-region-explorer-style"] === "true")[0];
  const narrow = width <= 599;
  const stacked = Boolean(controls && controls.attr && controls.attr["data-control-layout"] === "stacked");
  const fullWidthRule = style && /\.region-explorer-control,\.region-explorer-add-action\{min-inline-size:100%;inline-size:100%/.test(style.text);
  const items = (controls && controls.children || []).filter((node) => node.attr && /(region-explorer-control|region-explorer-add-action)/.test(node.attr.class || ""));
  const itemWidths = items.map(() => narrow && stacked && fullWidthRule ? width : Math.min(width, 192));
  const scrollWidth = itemWidths.length ? Math.max(...itemWidths) : 0;
  return { clientWidth: width, scrollWidth, rows: narrow && stacked && fullWidthRule ? itemWidths.length : 1, itemCount: itemWidths.length, stacked };
}

function extractDataviewBlock(markdown) {
  const match = markdown.match(/```dataviewjs\n([\s\S]*?)\n```/);
  assert.ok(match, "Region Hub needs one executable dataviewjs host block");
  return match[1];
}

function validRegion({ sido, sigungu, history = null }) {
  const regionKey = `${sido}-${sigungu}`;
  const payload = history === null ? {
    schema_version: 1,
    region_key: regionKey,
    snapshots: [{ schema_version: 1, region_key: regionKey, metrics_as_of: "2026-05-01", metrics: {} }]
  } : history;
  return `---\ntype: auction_region\ntitle: ${sido} ${sigungu}\nregion_sido: ${sido}\nregion_sigungu: ${sigungu}\nmetrics_as_of: 2026-05-01\nsource_as_of: 2026-06-01\nverification_status: unverified\nsale_volume_3m: 12\n---\n\n<!-- PRODIGY_REGION_METRICS_HISTORY -->\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n`;
}

function invalidRegionType({ sido, sigungu, type = "auction_case" }) {
  return `---\ntype: ${type}\ntitle: ${sido} ${sigungu}\nregion_sido: ${sido}\nregion_sigungu: ${sigungu}\n---\n`;
}

async function runHub(notes, runtime = {}) {
  const markdown = fs.readFileSync(path.join(ROOT, HUB_PATH), "utf8");
  const unavailable = new Set(runtime.unavailableModulePaths || []);
  const sourceOverrides = runtime.sourceOverrides || {};
  const sourceByPath = Object.fromEntries([...MODULE_PATHS, ...REGION_EXPERIENCE_MODULE_PATHS, ...REGISTRY_PATHS].filter((modulePath) => !unavailable.has(modulePath)).map((modulePath) => [
    modulePath,
    Object.hasOwn(sourceOverrides, modulePath) ? sourceOverrides[modulePath] : fs.readFileSync(path.join(ROOT, modulePath), "utf8")
  ]));
  const reads = [];
  const writes = [];
  const providers = [];
  const container = runtime.container || new FakeElement("section");
  const window = runtime.window || {};
  window.window = window;
  if (runtime.obsidian) window.obsidian = runtime.obsidian;
  if (typeof window.setTimeout !== "function") window.setTimeout = runtime.setTimeout || ((callback) => { callback(); return 0; });
  window.fetch = (...args) => { providers.push(args); throw new Error("provider/network calls are forbidden in the Region Hub"); };
  const moduleMtimes = runtime.moduleMtimes || {};
  const files = Object.keys(notes).map((notePath) => ({ path: notePath, extension: "md" }));
  const vault = {
    getAbstractFileByPath(filePath) {
      if (Object.hasOwn(sourceByPath, filePath)) return { path: filePath, extension: "js", stat: { mtime: moduleMtimes[filePath] || 1 } };
      return files.find((file) => file.path === filePath) || null;
    },
    getMarkdownFiles() { return files; },
    async read(file) {
      reads.push(file.path);
      if (Object.hasOwn(sourceByPath, file.path)) return sourceByPath[file.path];
      return notes[file.path];
    },
    async create() { writes.push("create"); throw new Error("write forbidden"); },
    async modify() { writes.push("modify"); throw new Error("write forbidden"); },
    async rename() { writes.push("rename"); throw new Error("write forbidden"); },
    async delete() { writes.push("delete"); throw new Error("write forbidden"); }
  };
  const app = {
    vault,
    metadataCache: { getFileCache() { return { frontmatter: {} }; } },
    fileManager: { processFrontMatter() { writes.push("frontmatter"); throw new Error("write forbidden"); } }
  };
  const execute = new Function("app", "container", "window", "require", "obsidian", `return (async function () {\n${extractDataviewBlock(markdown)}\n}).call({ container });`);
  const runtimeRequire = Object.hasOwn(runtime, "require") ? runtime.require : require;
  await execute(app, container, window, runtimeRequire, {});
  return { container, reads, writes, providers, window };
}

test("Auction Hub loads only the read-only Region projection needed by the decision packet and issues no Region write", () => {
  const auction = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  const initialEngine = auction.match(/```js-engine\n([\s\S]*?)\n```/)?.[1] || "";

  assert.match(initialEngine, /region-explorer-projection\.js/);
  assert.match(initialEngine, /auction-region-packet\.js/);
  assert.doesNotMatch(initialEngine, /region-explorer-(?:state|view)\.js/);
  assert.doesNotMatch(initialEngine, /openOrCreateRegionNote|region-metrics-(?:apply|refresh)|region-research-apply/);
});

test("Region Hub mounts the actual read-only fixture path in module order, including stale remount and malformed diagnostics", async () => {
  const notes = {
    [`${REGION_ROOT}busan.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }),
    [`${REGION_ROOT}incheon.md`]: validRegion({ sido: "인천광역시", sigungu: "부평구" }),
    [`${REGION_ROOT}malformed.md`]: validRegion({ sido: "경기도", sigungu: "수원시", history: "not-json" })
  };
  const first = await runHub(notes);

  assert.deepEqual(first.reads.slice(0, MODULE_PATHS.length), MODULE_PATHS, "dependencies load before the Explorer consumer mounts");
  assert.match(renderedText(first.container), /부산광역시 해운대구/);
  assert.match(renderedText(first.container), /인천광역시 부평구/);
  assert.match(renderedText(first.container), /히스토리.*올바르지/);
  assert.deepEqual(first.writes, []);
  assert.deepEqual(first.providers, []);

  const second = await runHub(notes, { container: first.container, window: first.window });
  assert.equal(walk(second.container, (node) => node.attr && node.attr["data-shell"] === "region-explorer-shell").length, 1, "a stale Hub container cannot retain a second Explorer mount");
  assert.deepEqual(second.writes, []);
  assert.deepEqual(second.providers, []);
});

test("Given a selected canonical Region When 지역 경험 추가 is opened and cancelled Then only click-path modules load with no provider or vault action", async () => {
  const modals = [];
  class FakeModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const notes = {
    [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }),
    [`${REGION_ROOT}인천광역시-부평구.md`]: validRegion({ sido: "인천광역시", sigungu: "부평구" })
  };

  const hub = await runHub(notes, { obsidian: { Modal: FakeModal } });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  assert.ok(trigger, "the Hub exposes the Korean Region Experience trigger");
  assert.equal(trigger.text, "지역 경험 추가");
  assert.equal(trigger.attr["aria-label"], "지역 경험 추가");
  assert.doesNotMatch(hub.reads.join("\n"), /region-experience-|journal-store|knowledge-candidate|ai-provider-service|project-workflow-draft-service/);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);

  await trigger.onclick({ preventDefault() {} });
  assert.deepEqual(hub.reads.filter((item) => REGION_EXPERIENCE_MODULE_PATHS.includes(item)), REGION_EXPERIENCE_MODULE_PATHS);
  assert.equal(modals.length, 1);
  assert.deepEqual(modals[0].options.selectedRegions, []);
  assert.match(renderedText(modals[0].contentEl), /유효한 권역을 하나 선택한 뒤 계속해 주세요.|권역 선택/);
  walk(modals[0].contentEl, (node) => node.text === "취소")[0].onclick();

  const select = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "select-region" && node.attr["data-region-key"] === "부산광역시-해운대구")[0];
  select.onclick({ preventDefault() {} });
  const selectedTrigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  await selectedTrigger.onclick({ preventDefault() {} });

  assert.deepEqual(hub.reads.filter((item) => REGION_EXPERIENCE_MODULE_PATHS.includes(item)), REGION_EXPERIENCE_MODULE_PATHS);
  assert.equal(modals.length, 2);
  assert.deepEqual(modals[1].options.selectedRegions.map((region) => region.region_key), ["부산광역시-해운대구"]);
  assert.deepEqual(modals[1].options.regions.map((region) => region.region_key), ["부산광역시-해운대구", "인천광역시-부평구"]);
  assert.equal(modals[1].options.returnFocus, selectedTrigger);
  const cancel = walk(modals[1].contentEl, (node) => node.text === "취소")[0];
  cancel.onclick();
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given Region Experience is opened through the Hub loader When its current dependency list is evaluated Then the endpoint guard loads before AI without a lazy-load failure", async () => {
  const modals = [];
  class FakeModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, { obsidian: { Modal: FakeModal } });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];

  await trigger.onclick({ preventDefault() {} });

  assert.deepEqual(hub.reads.filter((item) => REGION_EXPERIENCE_MODULE_PATHS.includes(item)), REGION_EXPERIENCE_MODULE_PATHS);
  assert.equal(typeof hub.window.RegionExperienceProviderEndpointGuard.assertTrustedProviderEndpoint, "function");
  assert.equal(modals.length, 1);
  assert.doesNotMatch(renderedText(hub.container), /지역 경험 기능을 불러오지 못했습니다/);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given a fresh Hub runtime without CommonJS globals When Region Experience opens Then ordered lazy dependencies load and the modal opens", async () => {
  const modals = [];
  class FakeModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, {
    obsidian: { Modal: FakeModal },
    require: undefined
  });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];

  assert.deepEqual(hub.reads.slice(0, MODULE_PATHS.length), MODULE_PATHS);
  assert.equal(typeof hub.window.ProdigyWorkspaceNavigation.mount, "function");
  await trigger.onclick({ preventDefault() {} });

  assert.deepEqual(hub.reads.filter((item) => REGION_EXPERIENCE_MODULE_PATHS.includes(item)), REGION_EXPERIENCE_MODULE_PATHS);
  assert.equal(typeof hub.window.KnowledgeExplorerRegistry.normalizeDomain, "function");
  assert.equal(modals.length, 1);
  assert.doesNotMatch(renderedText(hub.container), /지역 경험 기능을 불러오지 못했습니다/);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given a 599px Region Hub fixture When the experience trigger renders Then its CJK control contract has no horizontal-overflow signal", async () => {
  const container = new FakeElement("section");
  container.clientWidth = 599;
  const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, { container });
  const shell = walk(hub.container, (node) => node.attr && node.attr["data-shell"] === "region-explorer-shell")[0];
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  const css = walk(hub.container, (node) => node.tag === "style" && node.attr && node.attr["data-region-explorer-style"] === "true")[0].text;

  assert.equal(shell.attr["data-layout"], "narrow");
  assert.equal(trigger.attr["aria-label"], "지역 경험 추가");
  assert.match(css, /\.region-explorer-button\{[^}]*min-inline-size:0[^}]*word-break:keep-all[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.region-explorer-control,\.region-explorer-add-action\{min-inline-size:100%;inline-size:100%/);
});

test("Given 375px and 599px Hub fixtures When the Region Experience trigger renders Then controls stack without a horizontal-overflow signal", async () => {
  for (const width of [375, 599]) {
    const container = new FakeElement("section");
    container.clientWidth = width;
    const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, { container });
    const layout = controlLayout(hub.container, width);
    const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];

    assert.equal(layout.clientWidth, width);
    assert.equal(layout.stacked, true, `${width}px fixture renders the controls in their narrow stacked state`);
    assert.ok(layout.scrollWidth <= layout.clientWidth, `${width}px fixture must not signal horizontal overflow`);
    assert.equal(layout.rows, layout.itemCount, `${width}px fixture stacks every control`);
    assert.equal(trigger.text, "지역 경험 추가");
  }
});

test("Given concurrent and keyboard trigger activation When the modal opens, closes, or fails Then one active modal, focus return, and later reopen remain available without writes", async () => {
  const modals = [];
  let modalOpens = 0;
  class FakeModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { modalOpens += 1; if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const notes = { [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) };
  const hub = await runHub(notes, { obsidian: { Modal: FakeModal } });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];

  await Promise.all([trigger.onclick({ preventDefault() {} }), trigger.onclick({ preventDefault() {} })]);
  assert.equal(modalOpens, 1, "one click burst opens one modal");
  assert.deepEqual(hub.reads.filter((item) => REGION_EXPERIENCE_MODULE_PATHS.includes(item)), REGION_EXPERIENCE_MODULE_PATHS);
  modals[0].close();
  assert.equal(trigger.focusCalls, 1, "modal close returns focus to its invoking trigger");

  await trigger.onkeydown({ key: "Enter", preventDefault() {} });
  assert.equal(modalOpens, 2);
  modals[1].close();
  await trigger.onkeydown({ key: " ", preventDefault() {} });
  assert.equal(modalOpens, 3);
  modals[2].close();
  assert.equal(trigger.focusCalls, 3);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);

  let shouldFail = true;
  let failedOpenAttempts = 0;
  class FailingOnceModal {
    constructor() { this.contentEl = new FakeElement("div"); }
    open() { failedOpenAttempts += 1; if (shouldFail) { shouldFail = false; throw new Error("modal-open-raw-731"); } if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const retryHub = await runHub(notes, { obsidian: { Modal: FailingOnceModal } });
  const retryTrigger = walk(retryHub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  await retryTrigger.onclick({ preventDefault() {} });
  assert.match(renderedText(retryHub.container), /지역 경험 기능을 불러오지 못했습니다/);
  await retryTrigger.onclick({ preventDefault() {} });
  assert.equal(failedOpenAttempts, 2, "a failed opening releases the guard for a later explicit retry");
  assert.deepEqual(retryHub.writes, []);
  assert.deepEqual(retryHub.providers, []);
});

test("Given an Obsidian-style deferred modal close When the focus trap releases after onClose Then the still-connected Hub trigger receives deferred prevent-scroll focus and can reopen", async () => {
  const deferredClose = [];
  const deferredTimers = [];
  const modals = [];
  let modalOpens = 0;
  let trapActive = true;
  class DeferredModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { modalOpens += 1; if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() { deferredClose.push(() => { if (typeof this.onClose === "function") this.onClose(); trapActive = false; }); }
  }
  const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, {
    obsidian: { Modal: DeferredModal },
    setTimeout(callback) { deferredTimers.push(callback); return deferredTimers.length; }
  });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  const focusAttempts = [];
  trigger.focus = (options) => {
    focusAttempts.push({ trapActive, options });
    if (!trapActive) { trigger.focusCalls += 1; trigger.focusOptions.push(options); }
  };

  await trigger.onclick({ preventDefault() {} });
  modals[0].close();
  assert.equal(trigger.focusCalls, 0, "close schedules rather than focuses while the trap remains active");
  deferredClose.shift()();
  assert.equal(trigger.focusCalls, 0, "the modal's own synchronous return focus remains trapped");
  assert.equal(deferredTimers.length, 1, "Hub schedules a post-close focus handoff");
  deferredTimers.shift()();
  assert.equal(trigger.focusCalls, 0, "the first post-close turn yields to Obsidian cleanup");
  assert.equal(deferredTimers.length, 1, "Hub queues the final focus after the cleanup turn");
  deferredTimers.shift()();
  assert.equal(trigger.focusCalls, 1);
  assert.deepEqual(trigger.focusOptions[0], { preventScroll: true });
  assert.equal(focusAttempts[focusAttempts.length - 1].trapActive, false);

  await trigger.onclick({ preventDefault() {} });
  assert.equal(modalOpens, 2, "a legitimate later click opens exactly one new modal");
  trapActive = true;
  modals[1].close();
  deferredClose.shift()();
  trigger.isConnected = false;
  deferredTimers.shift()();
  assert.equal(trigger.focusCalls, 1, "a stale or remounted trigger is not focused after close");
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given Obsidian schedules root focus after onClose When the Hub restores focus Then the later trigger handoff wins and Enter opens one modal", async () => {
  const deferredClose = [];
  const deferredTimers = [];
  const modals = [];
  let modalOpens = 0;
  let focused = "modal";
  class RootAfterCloseModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { modalOpens += 1; if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() {
      deferredClose.push(() => {
        if (typeof this.onClose === "function") this.onClose();
        deferredTimers.push(() => { focused = "root"; });
      });
    }
  }
  const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, {
    obsidian: { Modal: RootAfterCloseModal },
    setTimeout(callback) { deferredTimers.push(callback); return deferredTimers.length; }
  });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  trigger.focus = (options) => { focused = "trigger"; trigger.focusCalls += 1; trigger.focusOptions.push(options); };

  await trigger.onclick({ preventDefault() {} });
  modals[0].close();
  deferredClose.shift()();
  while (deferredTimers.length) deferredTimers.shift()();

  assert.equal(focused, "trigger", "the Hub must restore the trigger after Obsidian's later root focus");
  assert.deepEqual(trigger.focusOptions.at(-1), { preventScroll: true });
  await trigger.onkeydown({ key: "Enter", preventDefault() {} });
  assert.equal(modalOpens, 2, "Return from the restored trigger opens exactly one modal");
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given Obsidian Modal.open returns void When the modal opens and closes Then success has no generic failure notice and the exact trigger can reopen once with Enter", async () => {
  const deferredTimers = [];
  const modals = [];
  let modalOpens = 0;
  let focused = "modal";
  class VoidOpenModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { modalOpens += 1; if (typeof this.onOpen === "function") this.onOpen(); }
    close() {
      if (typeof this.onClose === "function") this.onClose();
      deferredTimers.push(() => { focused = "root"; });
    }
  }
  const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, {
    obsidian: { Modal: VoidOpenModal },
    setTimeout(callback) { deferredTimers.push(callback); return deferredTimers.length; }
  });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  trigger.focus = (options) => { focused = "trigger"; trigger.focusCalls += 1; trigger.focusOptions.push(options); };

  await trigger.onclick({ preventDefault() {} });
  assert.equal(modalOpens, 1);
  assert.doesNotMatch(renderedText(hub.container), /지역 경험 기능을 불러오지 못했습니다/);
  modals[0].close();
  while (deferredTimers.length) deferredTimers.shift()();
  assert.equal(focused, "trigger");
  await trigger.onkeydown({ key: "Enter", preventDefault() {} });
  assert.equal(modalOpens, 2);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given a Hub reopen after the Region modal source changes When the same window opens Region Experience again Then the current module source is reevaluated instead of a resolved stale loader promise", async () => {
  const modals = [];
  let modalOpens = 0;
  class VoidOpenModal {
    constructor() { this.contentEl = new FakeElement("div"); modals.push(this); }
    open() { modalOpens += 1; if (typeof this.onOpen === "function") this.onOpen(); }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const notes = { [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) };
  const modalPath = "SYSTEM/Views/region-experience-modal.js";
  const currentModalSource = fs.readFileSync(path.join(ROOT, modalPath), "utf8");
  const staleModalSource = currentModalSource.replace(
    "if (typeof modal.open === \"function\") modal.open();\n    return modal;",
    "return typeof modal.open === \"function\" ? modal.open() : modal;"
  );
  assert.notEqual(staleModalSource, currentModalSource, "the fixture must model the previous void-return bug");

  const first = await runHub(notes, {
    obsidian: { Modal: VoidOpenModal },
    sourceOverrides: { [modalPath]: staleModalSource },
    moduleMtimes: { [modalPath]: 1 }
  });
  const firstTrigger = walk(first.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  await firstTrigger.onclick({ preventDefault() {} });
  assert.match(renderedText(first.container), /지역 경험 기능을 불러오지 못했습니다/, "the stale source reproduces the observed false generic failure");

  const second = await runHub(notes, {
    container: first.container,
    window: first.window,
    obsidian: { Modal: VoidOpenModal },
    moduleMtimes: { [modalPath]: 2 }
  });
  const secondTrigger = walk(second.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  await secondTrigger.onclick({ preventDefault() {} });

  assert.deepEqual(second.reads.filter((item) => REGION_EXPERIENCE_MODULE_PATHS.includes(item)), REGION_EXPERIENCE_MODULE_PATHS, "a changed module revision reloads every lazy dependency");
  assert.doesNotMatch(renderedText(second.container), /지역 경험 기능을 불러오지 못했습니다/);
  assert.deepEqual(second.writes, []);
  assert.deepEqual(second.providers, []);
});

test("Given a canonical Region with malformed history When Region Experience is requested Then Korean recovery is shown without opening a modal", async () => {
  let modalOpens = 0;
  class FakeModal {
    constructor() { this.contentEl = new FakeElement("div"); }
    open() { modalOpens += 1; if (typeof this.onOpen === "function") this.onOpen(); return this; }
    close() { if (typeof this.onClose === "function") this.onClose(); }
  }
  const hub = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구", history: "not-json" }) }, { obsidian: { Modal: FakeModal } });
  const trigger = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  await trigger.onclick({ preventDefault() {} });

  assert.equal(modalOpens, 0);
  assert.match(renderedText(hub.container), /지표 히스토리|유효한 Region Object/);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given a malformed startup registry When the Hub fails to mount Then only concise Korean recovery copy is exposed", async () => {
  const hub = await runHub({}, { sourceOverrides: { "SYSTEM/SCRIPTS/region-metrics-manifest-index.json": "{ registry-raw-31415" } });

  assert.match(renderedText(hub.container), /지역 비교 화면을 불러오지 못했습니다/);
  assert.doesNotMatch(renderedText(hub.container), /registry-raw-31415|Unexpected token|SyntaxError/);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given no valid Region or a missing click-path module When 지역 경험 추가 is requested Then Korean recovery copy is shown without a provider or vault action", async () => {
  const empty = await runHub({ [`${REGION_ROOT}not-region.md`]: "---\ntype: auction_case\n---\n" });
  const emptyTrigger = walk(empty.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  await emptyTrigger.onclick({ preventDefault() {} });
  assert.match(renderedText(empty.container), /유효한 Region Object|유효한 권역/);
  assert.deepEqual(empty.writes, []);
  assert.deepEqual(empty.providers, []);

  const broken = await runHub({ [`${REGION_ROOT}부산광역시-해운대구.md`]: validRegion({ sido: "부산광역시", sigungu: "해운대구" }) }, {
    unavailableModulePaths: ["SYSTEM/Views/region-experience-modal.js"]
  });
  const brokenTrigger = walk(broken.container, (node) => node.attr && node.attr["data-action"] === "add-region-experience")[0];
  await brokenTrigger.onclick({ preventDefault() {} });
  assert.match(renderedText(broken.container), /지역 경험 기능을 불러오지 못했습니다/);
  assert.deepEqual(broken.writes, []);
  assert.deepEqual(broken.providers, []);
});

test("Region Hub provides Korean empty coverage without writer or provider actions", async () => {
  const empty = await runHub({
    [`${REGION_ROOT}not-region.md`]: "---\ntype: auction_case\n---\n"
  });

  assert.match(renderedText(empty.container), /읽을 수 있는 지역 Object가 없습니다|지역 Object.*없습니다/);
  assert.match(renderedText(empty.container), /읽기 전용/);
  assert.deepEqual(empty.writes, []);
  assert.deepEqual(empty.providers, []);
});

test("Given a registered area without a valid Region Object When the actual Hub mounts and the area is selected Then Korean no-object coverage remains visible without a write", async () => {
  const hub = await runHub({
    [`${REGION_ROOT}not-region.md`]: "---\ntype: auction_case\n---\n"
  });
  const regionKey = "부산광역시-중구";
  const coverageRow = walk(hub.container, (node) => node.attr && node.attr["data-region"] === regionKey)[0];
  const select = walk(hub.container, (node) => node.attr && node.attr["data-action"] === "select-region" && node.attr["data-region-key"] === regionKey)[0];

  assert.ok(coverageRow, "a registry area with no valid Object must stay inspectable in the Hub");
  assert.ok(select, "a registry coverage row must be selectable");
  select.onclick({ preventDefault() {} });
  assert.match(renderedText(hub.container), /유효한 Region Object가 없습니다/);
  assert.deepEqual(hub.reads.filter((item) => REGISTRY_PATHS.includes(item)), REGISTRY_PATHS, "coverage must come from the checked-in registry reads");
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Given registry-area notes with region fields but an invalid or missing type When the actual Hub mounts Then neither satisfies coverage and Korean recovery diagnostics remain without a write", async () => {
  const hub = await runHub({
    [`${REGION_ROOT}wrong-type.md`]: invalidRegionType({ sido: "부산광역시", sigungu: "중구" }),
    [`${REGION_ROOT}missing-type.md`]: "---\nregion_sido: 부산광역시\nregion_sigungu: 서구\n---\n"
  });
  const regionKeys = ["부산광역시-중구", "부산광역시-서구"];

  assert(regionKeys.every((regionKey) => walk(hub.container, (node) => node.attr && node.attr["data-region"] === regionKey)[0]), "invalid and missing-type notes must not hide their registered coverage areas");
  assert.match(renderedText(hub.container), /유효한 Region Object가 없습니다/);
  assert.match(renderedText(hub.container), /type Frontmatter.*auction_region/);
  assert.deepEqual(hub.writes, []);
  assert.deepEqual(hub.providers, []);
});

test("Auction Hub exposes the concise Region Hub link and the Region host has no writer/provider route", () => {
  const auction = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  const hub = fs.readFileSync(path.join(ROOT, HUB_PATH), "utf8");

  assert.match(auction, /\[\[15 Region\|지역 비교\]\]/);
  assert.doesNotMatch(hub, /openOrCreateRegionNote|processFrontMatter|vault\.(?:create|modify|rename|delete)|region-(?:metrics|research)-(?:apply|refresh)|fetch\s*\(|XMLHttpRequest|collector/i);
});
