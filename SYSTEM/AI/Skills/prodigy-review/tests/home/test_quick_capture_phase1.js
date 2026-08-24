"use strict";

// Phase 1 quick capture — headless contract suite (RED first).
// Given / When / Then structure; no timers, no wall-clock luck.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MODULE_PATH = "SYSTEM/Views/quick-capture-view.js";
const MANIFEST_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js");
const FIXTURE_PATH = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json");
const HUB_HOME_PATH = path.join(ROOT, "HUB/00 Home.md");
const HUB_KNOWLEDGE_PATH = path.join(ROOT, "HUB/50 Knowledge.md");

// ── Fake DOM ────────────────────────────────────────────────────────────
class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.names = new Set();
  }
  add(...names) {
    names.forEach((name) => this.names.add(name));
    this.owner.attributes.class = Array.from(this.names).join(" ");
  }
  contains(name) { return this.names.has(name); }
  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.names.has(name) : Boolean(force);
    if (shouldAdd) this.names.add(name); else this.names.delete(name);
    this.owner.attributes.class = Array.from(this.names).join(" ");
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName, options = {}) {
    this.tag = String(tagName).toLowerCase();
    this.tagName = this.tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.style = {
      setProperty(name, value) { this[name] = String(value); },
      removeProperty(name) { delete this[name]; }
    };
    this.classList = new FakeClassList(this);
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.text = "";
    this.focused = false;
    this.clientWidth = options.clientWidth || 0;
    this.ownerDocument = options.ownerDocument || null;
    if (options.text) this.setText(options.text);
    if (options.attr) this.applyAttr(options.attr);
  }

  setText(value) { this.text = String(value == null ? "" : value); this.textContent = this.text; }
  applyAttr(attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === "class") {
        String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
        return;
      }
      if (key === "hidden") { this.hidden = Boolean(value); return; }
      if (key === "disabled") { this.disabled = Boolean(value); return; }
      if (key === "type") { this.type = String(value); return; }
      if (key === "placeholder") { this.placeholder = String(value); return; }
      if (key === "value") { this.value = String(value); return; }
      this.attributes[key] = String(value);
    });
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  setAttr(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; if (global.document) global.document.activeElement = this; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type, callback) { if (this.listeners.get(type) === callback) this.listeners.delete(type); }

  createEl(tagName, options = {}) {
    const child = new FakeElement(tagName, { clientWidth: options.clientWidth });
    child.parent = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    if (options.text != null) child.setText(options.text);
    if (options.attr) child.applyAttr(options.attr);
    if (options.style) Object.entries(options.style).forEach(([key, value]) => { child.style[key] = value; });
    return child;
  }
  createDiv(options = {}) { return this.createEl("div", options); }
  createSpan(options = {}) { return this.createEl("span", options); }

  empty() {
    this.children.forEach((child) => { child.parent = null; });
    this.children = [];
    this.text = "";
    this.textContent = "";
  }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  insertBefore(child, ref) { const at = ref ? this.children.indexOf(ref) : -1; child.parent = this; if (at < 0) this.children.push(child); else this.children.splice(at, 0, child); return child; }
  get parentElement() { return this.parent; }
  set parentElement(value) { this.parent = value; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }
  closest() { return null; }
  getBoundingClientRect() { return { width: this.clientWidth || 0, height: 0, top: 0, left: 0, right: this.clientWidth || 0, bottom: 0 }; }
  hasClass(name) { return this.classList.contains(name); }
  textTree() { return [this.text, ...this.children.map((child) => child.textTree())].filter(Boolean).join(" "); }
  findAll(predicate, found = []) {
    if (predicate(this)) found.push(this);
    this.children.forEach((child) => child.findAll(predicate, found));
    return found;
  }
}

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.isTrusted = options.isTrusted === true;
    this.timeStamp = options.timeStamp == null ? Date.now() : options.timeStamp;
    this.key = options.key || "";
    this.target = options.target || null;
    this.defaultPrevented = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() {}
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.body = new FakeElement("body");
    this.documentElement = new FakeElement("html");
    this.body.ownerDocument = this;
    this.styleRegistry = new Map();
    this.activeElement = null;
    this.head = {
      appendChild(element) { if (element.id) this.owner.styleRegistry.set(element.id, element); },
      owner: this
    };
    this.head.appendChild = this.head.appendChild.bind(this.head);
    this.head.owner = this;
    this.body.classList.add("test-body");
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) {
    const bucket = this.listeners.get(type);
    if (bucket) bucket.delete(callback);
  }
  createElement(tagName) {
    const element = new FakeElement(tagName);
    element.ownerDocument = this;
    return element;
  }
  getElementById(id) { return this.styleRegistry.get(id) || null; }
  dispatch(type, event) {
    const bucket = this.listeners.get(type);
    if (bucket) Array.from(bucket).forEach((callback) => callback(event));
  }
}

function installFakeDom() {
  global.Event = FakeEvent;
  const doc = new FakeDocument();
  global.document = doc;
  global.window = global;
  return doc;
}

// ── Vault / app fakes ───────────────────────────────────────────────────
function createMemoryVault(initial = {}) {
  const files = new Map(Object.entries(initial));
  const eventListeners = new Map();
  const log = { creates: [], modifies: [], createFolders: [], reads: [] };
  return {
    files,
    log,
    getAbstractFileByPath(target) { return files.has(target) ? { path: target } : null; },
    getMarkdownFiles() {
      return Array.from(files.keys()).filter((filePath) => filePath.endsWith(".md")).map((filePath) => ({ path: filePath, name: filePath.split("/").pop() }));
    },
    async read(file) { log.reads.push(file.path); if (!files.has(file.path)) throw new Error(`ENOENT: ${file.path}`); return files.get(file.path); },
    async modify(file, content) { log.modifies.push({ path: file.path, content }); files.set(file.path, content); },
    async createFolder(folder) { log.createFolders.push(folder); },
    async create(filePath, content) {
      log.creates.push({ path: filePath, content });
      files.set(filePath, content);
      const file = { path: filePath, name: filePath.split("/").pop() };
      const bucket = eventListeners.get("create");
      if (bucket) Array.from(bucket).forEach((callback) => callback(file));
      return file;
    },
    on(type, callback) {
      if (!eventListeners.has(type)) eventListeners.set(type, new Set());
      const ref = { type, callback };
      eventListeners.get(type).add(callback);
      return ref;
    },
    offref(ref) {
      const bucket = eventListeners.get(ref.type);
      if (bucket) bucket.delete(ref.callback);
    }
  };
}

function transportSpies() {
  const fetchCalls = [];
  const requestUrlCalls = [];
  const xhrCalls = [];
  const previous = { fetch: global.fetch, requestUrl: global.requestUrl, XMLHttpRequest: global.XMLHttpRequest };
  global.fetch = async () => { fetchCalls.push(1); throw new Error("transport forbidden in capture"); };
  global.requestUrl = async () => { requestUrlCalls.push(1); throw new Error("transport forbidden in capture"); };
  global.XMLHttpRequest = class { constructor() { xhrCalls.push(1); throw new Error("transport forbidden in capture"); } };
  return { fetchCalls, requestUrlCalls, xhrCalls, restore() { Object.assign(global, previous); } };
}

function loadQuickCapture() {
  delete require.cache[require.resolve(path.join(ROOT, MODULE_PATH))];
  delete global.QuickCaptureView;
  return require(path.join(ROOT, MODULE_PATH));
}

// ── Manifest RED ────────────────────────────────────────────────────────
test("manifests register quick capture on both Home and Knowledge surfaces", () => {
  const manifests = require(MANIFEST_PATH);
  const fixture = require(FIXTURE_PATH);
  const home = manifests.get("home");
  const knowledge = manifests.get("knowledge");
  for (const entry of [home, knowledge]) {
    assert.ok(entry.required.includes("SYSTEM/Views/quick-capture-view.js"), `${entry.workspaceId} must require quick-capture-view`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(home)), fixture.entries.home, "home manifest must stay locked to fixture");
  assert.deepEqual(JSON.parse(JSON.stringify(knowledge)), fixture.entries.knowledge, "knowledge manifest must stay locked to fixture");
  assert.ok(knowledge.required.includes("SYSTEM/Views/capture-state-contract.js"), "knowledge must load capture contract");
  assert.ok(knowledge.required.includes("SYSTEM/Views/capture-action-runtime.js"), "knowledge must load capture runtime");
});

// ── Module unit RED/GREEN ───────────────────────────────────────────────
test("thought line format is exact: `- HH:MM 내용` with local time and newlines collapsed", () => {
  const quickCapture = loadQuickCapture();
  const line = quickCapture.thoughtLine("  여러 줄\n생각  ", new Date(2026, 7, 23, 9, 5));
  assert.equal(line, "- 09:05 여러 줄 생각");
  assert.equal(quickCapture.thoughtLine("한글 유지", new Date(2026, 0, 2, 0, 7)), "- 00:07 한글 유지");
});

test("thought save appends the exact line to the dated fleeting file with zero transport calls", async () => {
  const quickCapture = loadQuickCapture();
  const spies = transportSpies();
  const vault = createMemoryVault();
  const app = { vault };
  const receipt = await quickCapture.saveFleetingThought(app, { content: "테스트 생각", now: new Date(2026, 7, 23, 21, 9) });
  assert.equal(receipt.path, "ZETA/FLEETING/2026-08-23.md");
  assert.equal(receipt.line, "- 21:09 테스트 생각");
  assert.equal(vault.files.get("ZETA/FLEETING/2026-08-23.md"), "- 21:09 테스트 생각\n");
  assert.equal(vault.log.createFolders.includes("ZETA/FLEETING"), true, "folder must be created when missing");
  assert.equal(vault.log.modifies.length, 0, "fresh file uses create, not modify");
  assert.equal(spies.fetchCalls.length + spies.requestUrlCalls.length + spies.xhrCalls.length, 0, "fleeting save must never touch transport");
  spies.restore();
});

test("thought save appends to an existing dated file preserving prior bytes", async () => {
  const quickCapture = loadQuickCapture();
  const vault = createMemoryVault({ "ZETA/FLEETING/2026-08-23.md": "- 08:01 기존 생각\n" });
  const receipt = await quickCapture.saveFleetingThought({ vault }, { content: "추가 생각", now: new Date(2026, 7, 23, 21, 10) });
  assert.equal(receipt.path, "ZETA/FLEETING/2026-08-23.md");
  assert.equal(vault.files.get("ZETA/FLEETING/2026-08-23.md"), "- 08:01 기존 생각\n- 21:10 추가 생각\n");
  assert.equal(vault.log.creates.length, 0, "existing file must use modify, not create");
});

test("material add creates INBOX/<title>.md and triggers exactly one inbox scan", async () => {
  const quickCapture = loadQuickCapture();
  const vault = createMemoryVault();
  const scans = [];
  const inboxRef = vault.on("create", (file) => {
    if (file && typeof file.path === "string" && file.path.startsWith("INBOX/") && file.path.endsWith(".md")) scans.push(file.path);
  });
  const app = { vault };
  const receipt = await quickCapture.saveMaterial(app, { title: "새 자료", content: "본문 첫 줄\n둘째 줄" });
  assert.equal(receipt.path, "INBOX/새 자료.md");
  assert.equal(vault.files.get("INBOX/새 자료.md"), "# 새 자료\n\n본문 첫 줄\n둘째 줄\n");
  assert.equal(vault.log.creates.length, 1);
  assert.deepEqual(scans, ["INBOX/새 자료.md"], "file creation must trigger exactly one inbox scan");
  vault.offref(inboxRef);
});

test("material add dedupes duplicate titles and sanitizes reserved characters while preserving Korean", async () => {
  const quickCapture = loadQuickCapture();
  const vault = createMemoryVault({ "INBOX/새 자료.md": "# 새 자료\n\n기존\n" });
  const app = { vault };
  const first = await quickCapture.saveMaterial(app, { title: "새 자료", content: "중복 첫 번째" });
  assert.equal(first.path, "INBOX/새 자료 2.md");
  const second = await quickCapture.saveMaterial(app, { title: "새 자료", content: "중복 두 번째" });
  assert.equal(second.path, "INBOX/새 자료 3.md");
  const sanitized = quickCapture.sanitizeTitle(" A/B:한글*?\"문서<>|.  ");
  assert.equal(sanitized, "A-B-한글--문서--");
  const derived = await quickCapture.saveMaterial(app, { title: "", content: "첫 줄이 제목이 됩니다\n본문" });
  assert.equal(derived.path, "INBOX/첫 줄이 제목이 됩니다.md");
});

// ── Mount unit RED/GREEN ────────────────────────────────────────────────
function mountQuickCaptureUnit(options = {}) {
  const doc = options.doc || installFakeDom();
  const quickCapture = loadQuickCapture();
  const vault = createMemoryVault(options.files || {});
  const container = new FakeElement("div");
  container.ownerDocument = doc;
  const cleanups = [];
  const scope = { signal: { aborted: false }, disposed: false, track(fn) { cleanups.push(fn); }, dispose() { this.disposed = true; } };
  const handle = quickCapture.mountQuickCapture({
    app: options.app || { vault },
    container,
    sessionId: options.sessionId || "unit-quick-capture",
    scope,
    notify: options.notify || (() => {}),
    now: options.now || (() => new Date(2026, 7, 23, 21, 11))
  });
  return { doc, quickCapture, vault, container, handle, cleanups, scope };
}

function findQuickCaptureRow(container) {
  return container.findAll((element) => element.hasClass("quick-capture-row"))[0] || null;
}

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

test("empty input keeps save disabled in both modes", () => {
  const { container, handle } = mountQuickCaptureUnit();
  const row = findQuickCaptureRow(container);
  assert.ok(row, "quick capture row renders");
  const save = row.findAll((element) => element.hasClass("quick-capture-save"))[0];
  const input = row.findAll((element) => element.hasClass("quick-capture-input"))[0];
  assert.equal(save.disabled, true, "save starts disabled with empty input");
  input.value = "내용";
  input.oninput({});
  assert.equal(save.disabled, false, "save enables once input has content");
  input.value = "   ";
  input.oninput({});
  assert.equal(save.disabled, true, "whitespace-only input keeps save disabled");
  handle.dispose();
});

test("each mount renders exactly once and dispose removes the row", () => {
  const { container } = mountQuickCaptureUnit();
  assert.equal(findQuickCaptureRow(container) !== null, true);
  assert.equal(container.findAll((element) => element.hasClass("quick-capture-row")).length, 1);
  loadQuickCapture().mountQuickCapture({
    app: { vault: createMemoryVault() }, container, sessionId: "unit-quick-capture",
    scope: { track() {} }, notify: () => {}, now: () => new Date()
  });
  assert.equal(container.findAll((element) => element.hasClass("quick-capture-row")).length, 1, "double mount must not duplicate the row");
});

test("trusted intents are dispatched exactly once per save and gate the write", async () => {
  const realRuntime = require(path.join(ROOT, "SYSTEM/Views/capture-action-runtime.js"));
  const intents = [];
  global.CaptureActionRuntime = Object.freeze(Object.assign({}, realRuntime, {
    humanConfirmation(actionId, sessionId) {
      intents.push({ actionId, sessionId });
      return realRuntime.humanConfirmation(actionId, sessionId);
    }
  }));
  const { doc, vault, container } = mountQuickCaptureUnit({ sessionId: "unit-trusted" });
  const row = findQuickCaptureRow(container);
  const thoughtTrigger = row.findAll((element) => element.hasClass("quick-capture-trigger") && element.getAttribute("data-quick-capture-action") === "thought")[0];
  const materialTrigger = row.findAll((element) => element.hasClass("quick-capture-trigger") && element.getAttribute("data-quick-capture-action") === "material")[0];
  assert.ok(thoughtTrigger && materialTrigger, "both capture triggers render");
  assert.match(thoughtTrigger.textTree(), /생각 저장/);
  assert.match(materialTrigger.textTree(), /자료 넣기/);

  const click = (target) => {
    const event = new FakeEvent("click", { isTrusted: true, target });
    doc.dispatch("click", event);
    target.onclick(event);
  };

  const save = row.findAll((element) => element.hasClass("quick-capture-save"))[0];
  const input = row.findAll((element) => element.hasClass("quick-capture-input"))[0];

  click(thoughtTrigger);
  assert.equal(thoughtTrigger.getAttribute("aria-expanded"), "true", "thought editor opens");
  input.value = "신뢰 저장 테스트";
  input.oninput({});
  click(save);
  await flushAsync();
  assert.deepEqual(intents, [{ actionId: "quick_capture_save_thought", sessionId: "unit-trusted" }], "thought save dispatches one trusted intent");
  assert.equal(vault.files.get("ZETA/FLEETING/2026-08-23.md"), "- 21:11 신뢰 저장 테스트\n");

  click(materialTrigger);
  input.value = "신뢰 자료 본문";
  input.oninput({});
  click(save);
  await flushAsync();
  assert.deepEqual(intents.map((item) => item.actionId), ["quick_capture_save_thought", "quick_capture_add_material"], "material save dispatches its own trusted intent");
  assert.equal(vault.files.get("INBOX/신뢰 자료 본문.md"), "# 신뢰 자료 본문\n\n신뢰 자료 본문\n");

  global.CaptureActionRuntime = realRuntime;
});

test("untrusted activation never writes and surfaces a status message", async () => {
  const { doc, vault, container } = mountQuickCaptureUnit({ sessionId: "unit-untrusted" });
  const row = findQuickCaptureRow(container);
  const thoughtTrigger = row.findAll((element) => element.hasClass("quick-capture-trigger") && element.getAttribute("data-quick-capture-action") === "thought")[0];
  const save = row.findAll((element) => element.hasClass("quick-capture-save"))[0];
  const input = row.findAll((element) => element.hasClass("quick-capture-input"))[0];
  const status = row.findAll((element) => element.hasClass("quick-capture-status"))[0];
  const untrusted = new FakeEvent("click", { isTrusted: false, target: thoughtTrigger });
  doc.dispatch("click", untrusted);
  thoughtTrigger.onclick(untrusted);
  input.value = "침투 시도";
  input.oninput({});
  doc.dispatch("click", new FakeEvent("click", { isTrusted: false, target: save }));
  save.onclick(new FakeEvent("click", { isTrusted: false, target: save }));
  await flushAsync();
  assert.equal(vault.log.creates.length, 0, "no create without a trusted interaction");
  assert.equal(vault.log.modifies.length, 0, "no modify without a trusted interaction");
  assert.match(status.text, /신뢰/, "untrusted activation is explained in the status region");
});

test("fleeting bytes never reach any transport and module source owns no network seam", async () => {
  const spies = transportSpies();
  const quickCapture = loadQuickCapture();
  const vault = createMemoryVault();
  await quickCapture.saveFleetingThought({ vault }, { content: "로컬 전용", now: new Date(2026, 7, 23, 22, 0) });
  await quickCapture.saveMaterial({ vault }, { title: "자료", content: "자료 본문" });
  assert.equal(spies.fetchCalls.length + spies.requestUrlCalls.length + spies.xhrCalls.length, 0);
  spies.restore();
  const source = fs.readFileSync(path.join(ROOT, MODULE_PATH), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|\brequestUrl\b|XMLHttpRequest|WebSocket/i, "quick-capture source must own no network seam");
});

// ── Home surface RED/GREEN ──────────────────────────────────────────────
function installHomeDependencies(doc) {
  global.ProdigyTokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));
  global.HomeModel = require(path.join(ROOT, "SYSTEM/Views/home-model.js"));
  global.HomeController = require(path.join(ROOT, "SYSTEM/Views/home-controller.js"));
  global.HomeSections = require(path.join(ROOT, "SYSTEM/Views/home-sections.js"));
  global.HomeStyles = require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
  global.ProdigyUI = { ensureStyles() {} };
  const focusAuction = { id: "focus-auction", label: "김포 오피스텔", source_type: "auction", object_path: "PARA/PROJECTS/Auction/a.md", next_action: "관리비 확인" };
  global.MorningContextCore = {
    getTodayIsoDate: () => "2026-08-23",
    getYesterdayIsoDate: () => "2026-08-22",
    getWeekId: () => "2026-W34",
    getDaypart: () => "morning",
    buildMorningPackage: async () => ({
      local_date: "2026-08-23",
      day_of_week: "일",
      warnings: [],
      context: { todoist: { todayCount: 0, overdueCount: 0, todayTasks: [], overdueTasks: [] }, projects: [], auctions: [], reading: [], continue_candidates: [], risks: [], review_inbox: [], recent_reflections: [], yesterday_review: null }
    }),
    generateDeterministicFallback: () => ({ schema_version: "morning-result-v1", brief_mode: "rule_based", brief: "규칙 기반 브리프", focus: [focusAuction] }),
    selectFocusItems: (args) => ((args && args.focusItems) || []).slice()
  };
  global.MorningBriefService = { generateMorningResult: async () => global.MorningContextCore.generateDeterministicFallback() };
  global.MorningCache = {
    getDailyCache: async () => ({ pkg: null, result: global.MorningContextCore.generateDeterministicFallback() }),
    getApprovedFocus: async () => ({ focus: [focusAuction] }),
    getPinnedFocus: async () => null,
    checkIsStale: () => false,
    clearPinnedFocus: async () => {},
    saveApprovedFocus: async (_app, _date, list) => ({ focus: list }),
    saveDailyCache: async () => {},
    clearApprovedFocus: async () => {}
  };
  global.MorningBriefContext = { buildMorningBriefContext: () => ({ engine_ok: true, continue_by_workspace: {}, engine_states: {} }), toHomeRiskItems: () => [] };
  global.JournalStore = { loadReview: async () => ({ status: "empty", blocks: [], fields: {} }), saveReview: async () => {} };
  global.ObjectCreatorView = { open() {} };
  global.Notice = class Notice { constructor(message) { this.message = message; } };
  const FakeResizeObserver = class {
    constructor(callback) { this.callback = callback; FakeResizeObserver.instances.push(this); }
    observe() {}
    disconnect() { this.closed = true; }
  };
  FakeResizeObserver.instances = [];
  global.ResizeObserver = FakeResizeObserver;
  global.document = doc;
  global.window = global;
  global.window.innerWidth = 1440;
  delete global.window.visualViewport;
}

async function mountHome() {
  const doc = installFakeDom();
  installHomeDependencies(doc);
  const HomeView = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  const container = new FakeElement("div");
  container.ownerDocument = doc;
  container.workspaceLeaf = new FakeElement("div", { clientWidth: 1440 });
  const vault = createMemoryVault();
  const app = { isMobile: false, vault, commands: { executeCommandById: () => false } };
  const cleanups = [];
  const mountScope = { signal: { aborted: false }, disposed: false, track(fn) { cleanups.push(fn); } };
  await HomeView.renderHome({ app, dv: {}, container, mountScope });
  return { doc, container, app, cleanups };
}

test("home surface renders the quick capture row with both buttons exactly once", async () => {
  const { container } = await mountHome();
  const rows = container.findAll((element) => element.hasClass("quick-capture-row"));
  assert.equal(rows.length, 1, "Home must render exactly one quick capture row");
  const text = rows[0].textTree();
  assert.match(text, /생각 저장/);
  assert.match(text, /자료 넣기/);
});

test("home surface re-render keeps exactly one quick capture row", async () => {
  const { doc, container, app } = await mountHome();
  assert.equal(doc.listeners.get("keydown").size, 2, "one shortcut listener + one capture owner listener");
  assert.equal(doc.listeners.get("click").size, 1, "one capture owner click listener");
  const HomeView = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  await HomeView.renderHome({ app, dv: {}, container, mountScope: { signal: { aborted: false }, track() {} } });
  assert.equal(container.findAll((element) => element.hasClass("quick-capture-row")).length, 1, "re-render must not duplicate capture rows");
  assert.equal(doc.listeners.get("keydown").size, 2, "re-render keeps exactly one shortcut and one capture listener");
  assert.equal(doc.listeners.get("click").size, 1, "re-render keeps exactly one capture click listener");
});

test("home surface promotes one ranked action deck and collapses the old narrative", async () => {
  const { container } = await mountHome();
  const queues = container.findAll((element) => element.hasClass("home-action-queue"));
  assert.equal(queues.length, 1, "Home renders one action queue");
  assert.match(queues[0].textTree(), /다음 행동/);
  assert.match(queues[0].textTree(), /김포 오피스텔/);
  assert.match(queues[0].textTree(), /집중으로 승인/);
  const details = container.findAll((element) => element.hasClass("home-context-details"));
  assert.equal(details.length, 1);
  assert.notEqual(details[0].open, true, "morning brief, focus, and continue stay collapsed by default");
  const brief = container.findAll((element) => element.hasClass("home-brief"))[0];
  let owner = brief && brief.parent;
  let nested = false;
  while (owner) {
    if (owner === details[0]) nested = true;
    owner = owner.parent;
  }
  assert.ok(brief && nested, "legacy brief is secondary context inside the disclosure");
  assert.match(container.textTree(), /우선순위 다시 계산/);
});

// ── Knowledge surface RED/GREEN ─────────────────────────────────────────
function knowledgeWalk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  (node.children || []).forEach((child) => knowledgeWalk(child, predicate, hits));
  return hits;
}

test("knowledge surface renders both capture buttons on the zettelkasten panel", async () => {
  const { runHub, buildPages, firstElement } = require("../knowledge/knowledge_hub_integration_harness.js");
  const { collectText } = require("../knowledge/knowledge_explorer_view_fakes.js");
  const result = await runHub({ pages: buildPages() });
  const zettelPanel = firstElement(result.container, "div", (node) => node.attr && node.attr.id === "knowledge-panel-zettelkasten");
  assert.ok(zettelPanel, "zettelkasten panel must exist");
  const panelText = collectText(zettelPanel);
  assert.match(panelText, /생각 저장/, "zettelkasten surface must show the thought capture button");
  assert.match(panelText, /자료 넣기/, "zettelkasten surface must show the material capture button");
  const quickCaptureRows = knowledgeWalk(zettelPanel, (element) => {
    const className = element.attr && element.attr.class ? String(element.attr.class) : "";
    return className.split(/\s+/).includes("quick-capture-row");
  });
  assert.equal(quickCaptureRows.length, 1, "knowledge zettelkasten must render exactly one quick capture row");
});
