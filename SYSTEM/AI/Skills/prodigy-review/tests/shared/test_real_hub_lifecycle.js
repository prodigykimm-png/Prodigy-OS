"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const FIXTURE_PATH = path.join(__dirname, "fixtures/real-hub-blocks-v1.json");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const BLOCK_FIXTURE = deepFreeze(JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")));
const HUBS = BLOCK_FIXTURE.entries;

function executableBlock(entry, sourceOverride) {
  const source = sourceOverride === undefined ? fs.readFileSync(path.join(ROOT, entry.hubPath), "utf8") : sourceOverride;
  const matches = [...source.matchAll(/```(dataviewjs|js-engine)\n([\s\S]*?)\n```/g)];
  const selected = matches[entry.executableBlock.ordinal - 1];
  assert.ok(selected, `${entry.workspaceId}: missing executable block ordinal ${entry.executableBlock.ordinal}`);
  assert.equal(selected[1], entry.executableBlock.language, `${entry.workspaceId}: executable block language`);
  return selected[2];
}

function rendererIdentity(block) {
  const match = block.match(/renderers:\s*\{\s*([a-z][a-z0-9_-]*)\s*:/);
  return match && match[1];
}

function verifyFixtureEntry(entry, block = executableBlock(entry)) {
  assert.equal(crypto.createHash("sha256").update(block).digest("hex"), entry.blockSha256, `${entry.workspaceId}: block SHA-256`);
  assert.equal(rendererIdentity(block), entry.renderer.identity, `${entry.workspaceId}: renderer identity`);
  assert.ok(block.includes(entry.renderer.sentinel), `${entry.workspaceId}: renderer sentinel`);
  return block;
}

function oneByteMutation(block) {
  const bytes = Buffer.from(block, "utf8");
  assert.ok(bytes.length > 0);
  bytes[0] = bytes[0] === 0x78 ? 0x79 : 0x78;
  return bytes.toString("utf8");
}

function waitForExactSignal(label, subscribe, timeoutMs = 2000) {
  let timer = null;
  let settled = false;
  let settleResolve;
  let settleReject;
  const promise = new Promise((resolve, reject) => { settleResolve = resolve; settleReject = reject; });
  const settle = (callback, value) => {
    if (settled) return;
    settled = true;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    callback(value);
  };
  timer = setTimeout(() => settle(settleReject, new Error(`Timed out waiting for exact signal: ${label}`)), timeoutMs);
  try { subscribe((value) => settle(settleResolve, value), (error) => settle(settleReject, error)); }
  catch (error) { settle(settleReject, error); }
  Object.defineProperty(promise, "guardActive", { value: () => timer !== null });
  promise.catch(() => {}); // Keep an abandoned failure guard handled; awaiting the original still rejects.
  return promise;
}

function createRuntime(entry, mutation = "none", environment = {}) {
  const { workspaceId, hubPath: relative } = entry;
  const mobile = environment.mobile === true;
  const globalIife = environment.globalIife === true;
  const lexicalApp = !globalIife && environment.lexicalApp !== false;
  const thisApp = environment.thisApp === true || (!globalIife && environment.thisApp !== false);
  const dvApp = environment.dvApp === true;
  const missingRequiredPath = mutation === "missing-home-core"
    ? "SYSTEM/Views/home-model.js"
    : "SYSTEM/Views/design-tokens.js";
  let missingLookups = 0;
  let resolveRetryLookup;
  const retryLookupSignal = new Promise((resolve) => { resolveRetryLookup = resolve; });
  let resolveShellMount;
  const shellMountSignal = new Promise((resolve) => { resolveShellMount = resolve; });
  const listenerTargets = new Map();
  const resourceWaiters = [];
  const connectedListenerCount = () => {
    let total = 0;
    for (const [eventTarget, types] of listenerTargets) {
      if (typeof Element !== "undefined" && eventTarget instanceof Element && !body.contains(eventTarget)) continue;
      for (const callbacks of types.values()) for (const count of callbacks.values()) total += count;
    }
    return total;
  };
  const notifyResourceWaiters = () => resourceWaiters.slice().forEach((waiter) => { if (waiter.predicate()) waiter.resolve(); });
  const timers = new Map();
  const observers = new Map();
  const mutationObservers = new Map();
  const notifyMutation = (node, record) => {
    for (const [observer, registration] of mutationObservers) {
      const inScope = node === registration.target || (registration.options.subtree && registration.target.contains(node));
      if (!inScope) continue;
      if (record.type === "attributes" && !registration.options.attributes) continue;
      if (record.type === "childList" && !registration.options.childList) continue;
      observer.callback([Object.assign({ target: node }, record)]);
    }
  };
  const native = { setTimeout, clearTimeout, setInterval, clearInterval };
  const trackListeners = (target, type, callback, add) => {
    let types = listenerTargets.get(target);
    if (!types && add) { types = new Map(); listenerTargets.set(target, types); }
    let callbacks = types && types.get(type);
    if (!callbacks && add) { callbacks = new Map(); types.set(type, callbacks); }
    if (add) callbacks.set(callback, (callbacks.get(callback) || 0) + 1);
    else if (callbacks && callbacks.has(callback)) {
      const count = callbacks.get(callback) - 1;
      if (count) callbacks.set(callback, count); else callbacks.delete(callback);
      if (!callbacks.size) types.delete(type);
      if (!types.size) listenerTargets.delete(target);
    }
    notifyResourceWaiters();
  };

  class Element {
    constructor(tag = "div", options = {}, ownerDocument = null) {
      this.tagName = String(tag).toUpperCase(); this.tag = String(tag); this.ownerDocument = ownerDocument;
      this.children = []; this.parentElement = null; this.attr = Object.assign({}, options.attr || {}); this.textContent = options.text || "";
      this.clientWidth = 1280; this.scrollTop = 0; this.scrollLeft = 0; this.dataset = {};
      this.style = { setProperty: (key, value) => { this.style[key] = value; }, removeProperty: (key) => { delete this.style[key]; } };
      this.classList = { add: (...names) => this._classes(names, true), remove: (...names) => this._classes(names, false), toggle: (name, force) => { const has = this._classSet().has(name); const next = force === undefined ? !has : !!force; this._classes([name], next); return next; }, contains: (name) => this._classSet().has(name) };
    }
    get isConnected() { return Boolean(this.ownerDocument && this.ownerDocument.body && this.ownerDocument.body.contains(this)); }
    _classSet() { return new Set(String(this.attr.class || "").split(/\s+/).filter(Boolean)); }
    _classes(names, add) { const set = this._classSet(); names.forEach((name) => add ? set.add(name) : set.delete(name)); this.attr.class = [...set].join(" "); }
    createEl(tag, options = {}) { const child = new Element(tag, options, this.ownerDocument); return this.appendChild(child); }
    createDiv(options = {}) { return this.createEl("div", options); }
    createSpan(options = {}) { return this.createEl("span", options); }
    setText(value) { this.textContent = String(value); }
    appendText(value) { this.textContent += String(value); }
    appendChild(child) { child.parentElement = this; this.children.push(child); if (child.classList.contains("prodigy-app-shell")) resolveShellMount(child); notifyMutation(this, { type: "childList", addedNodes: [child], removedNodes: [] }); notifyResourceWaiters(); return child; }
    replaceChildren(...children) { this.empty(); children.forEach((child) => this.appendChild(child)); }
    empty() { const removed = this.children.splice(0); removed.forEach((child) => { child.parentElement = null; }); this.textContent = ""; if (removed.length) notifyMutation(this, { type: "childList", addedNodes: [], removedNodes: removed }); }
    remove() { if (!this.parentElement) return; const parent = this.parentElement; const index = parent.children.indexOf(this); if (index >= 0) parent.children.splice(index, 1); this.parentElement = null; notifyMutation(parent, { type: "childList", addedNodes: [], removedNodes: [this] }); }
    setAttribute(key, value) { this.attr[key] = String(value); if (key === "id") this.id = String(value); notifyMutation(this, { type: "attributes", attributeName: key }); }
    setAttr(key, value) { this.setAttribute(key, value); }
    getAttribute(key) { return this.attr[key] ?? null; }
    removeAttribute(key) { delete this.attr[key]; }
    addClass(...names) { this.classList.add(...names); }
    removeClass(...names) { this.classList.remove(...names); }
    toggleClass(name, force) { return this.classList.toggle(name, force); }
    addEventListener(type, callback) { trackListeners(this, type, callback, true); }
    removeEventListener(type, callback) { trackListeners(this, type, callback, false); }
    dispatchEvent(event) { const value = Object.assign({ type: "", key: "", preventDefault() {}, stopPropagation() {} }, event || {}); const callbacks = listenerTargets.get(this)?.get(value.type); let result; if (callbacks) [...callbacks.keys()].forEach((callback) => { result = callback.call(this, value); }); return result; }
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
    click() { if (typeof this.onclick === "function") this.onclick({ preventDefault() {}, stopPropagation() {} }); }
    closest(selector) { let node = this; while (node) { if (node.matches(selector)) return node; node = node.parentElement; } return null; }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    matches(selector) { if (selector.startsWith(".")) return this.classList.contains(selector.slice(1)); return this.tag === selector.toLowerCase(); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const own = this.matches(selector) ? [this] : [];
      return own.concat(this.children.flatMap((child) => child.querySelectorAll(selector)));
    }
  }

  const head = new Element("head"); const body = new Element("body");
  if (mobile) body.classList.add("is-mobile");
  const document = {
    head, body, activeElement: null,
    createElement: (tag) => new Element(tag, {}, document),
    getElementById(id) { return [...head.querySelectorAll("style"), ...body.querySelectorAll("*")].find((node) => node.id === id || node.attr.id === id) || null; },
    addEventListener(type, callback) { trackListeners(document, type, callback, true); },
    removeEventListener(type, callback) { trackListeners(document, type, callback, false); }
  };
  head.ownerDocument = document; body.ownerDocument = document;
  const leaf = new Element("section", { attr: { class: "workspace-leaf-content" } }, document);
  const container = leaf.createDiv({ attr: { class: "block-language-dataviewjs" } });
  if (mobile) { leaf.clientWidth = 390; container.clientWidth = 390; }
  body.appendChild(leaf);

  const windowEvents = {};
  windowEvents.addEventListener = (type, callback) => trackListeners(windowEvents, type, callback, true);
  windowEvents.removeEventListener = (type, callback) => trackListeners(windowEvents, type, callback, false);
  const trackedSetTimeout = (callback, delay, ...args) => {
    let handle;
    handle = native.setTimeout(() => { timers.delete(handle); callback(...args); }, delay);
    timers.set(handle, { kind: "timeout", callback });
    return handle;
  };
  const trackedSetInterval = (callback, delay, ...args) => {
    const handle = native.setInterval(callback, delay, ...args);
    timers.set(handle, { kind: "interval", callback });
    return handle;
  };
  const trackedClearTimeout = (handle) => { timers.delete(handle); native.clearTimeout(handle); };
  const trackedClearInterval = (handle) => { timers.delete(handle); native.clearInterval(handle); };
  class TrackedResizeObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.set(this, callback); }
    observe(target) { this.target = target; }
    unobserve() {}
    disconnect() { this.disconnected = true; observers.delete(this); }
  }

  const files = new Map();
  const reads = [];
  for (const entry of fs.readdirSync(path.join(ROOT, "SYSTEM/Views"))) {
    if (entry.endsWith(".js")) files.set(`SYSTEM/Views/${entry}`, fs.readFileSync(path.join(ROOT, "SYSTEM/Views", entry), "utf8"));
  }
  const requiredSource = files.get(missingRequiredPath);
  if (mutation === "missing-required" || mutation === "missing-home-core" || mutation === "sync-retry-throw") files.delete(missingRequiredPath);
  if (mutation === "sync-retry-throw") {
    const key = "SYSTEM/Views/prodigy-hub-loader.js";
    files.set(key, files.get(key).replace(
      "var retryMount = scope.guard(function () { retry(required.failures, loadOptions); return mountWorkspace(app, manifest, options); });",
      "var retryMount = scope.guard(function () { throw new Error('injected raw retry secret'); });"
    ));
  }
  if (mutation === "app-shell-failure" || mutation === "capture-failed-cleanup-removed") {
    const key = "SYSTEM/Views/workspace-navigation.js";
    files.set(key, files.get(key).replace("if (scope && typeof scope.track === \"function\") scope.track(dispose);", "if (scope && typeof scope.track === \"function\") scope.track(dispose); throw new Error(\"injected AppShell failure\");"));
  }
  if (mutation === "capture-failed-cleanup-removed") {
    const key = "SYSTEM/Views/prodigy-hub-loader.js";
    files.set(key, files.get(key).replace(
      "    } catch (error) {\n      scope.dispose();\n      throw error;\n    }\n    registrationSealed = true;",
      "    } catch (error) {\n      throw error;\n    }\n    registrationSealed = true;"
    ));
  }
  const workspaceEvents = new Map();
  const workspace = {
    getActiveFile: () => ({ path: relative }),
    on(name, callback) { if (!workspaceEvents.has(name)) workspaceEvents.set(name, new Map()); const ref = { name, callback }; workspaceEvents.get(name).set(ref, callback); return ref; },
    offref(ref) { workspaceEvents.get(ref && ref.name)?.delete(ref); },
    openLinkText: async () => true,
    getLeaf: () => ({ openFile: async () => true })
  };
  const emitWorkspace = (name) => { const callbacks = workspaceEvents.get(name); if (callbacks) [...callbacks.values()].forEach((callback) => callback()); };
  const app = {
    vault: {
      adapter: { exists: async () => false, read: async () => "", write: async () => {}, mkdir: async () => {}, remove: async () => {}, rename: async () => {}, list: async () => ({ files: [], folders: [] }), stat: async () => null },
      getAbstractFileByPath(modulePath) { if (modulePath === missingRequiredPath) { missingLookups += 1; if (missingLookups >= 2) resolveRetryLookup(); } return files.has(modulePath) ? { path: modulePath, extension: path.extname(modulePath).slice(1) } : null; },
      async read(file) { reads.push(file.path); return files.get(file.path) || ""; }, async cachedRead(file) { return files.get(file.path) || ""; }, getFiles: () => []
    },
    isMobile: mobile,
    workspace,
    metadataCache: { getFileCache: () => ({ frontmatter: {} }), on: () => null, offref() {} },
    plugins: { plugins: { dataview: { api: { pages: () => ({ array: () => [] }) } } } }
  };
  const target = {
    console, Error, TypeError, Object, Array, String, Number, Boolean, Set, Map, WeakMap, Promise, Date, Math, JSON, RegExp, Symbol,
    document, container,
    AbortController, ResizeObserver: TrackedResizeObserver, MutationObserver: mutation === "no-removal-observer" ? undefined : class { constructor(callback) { this.callback = callback; } observe(target, options) { mutationObservers.set(this, { target, options: options || {} }); } disconnect() { mutationObservers.delete(this); } },
    setTimeout: trackedSetTimeout, clearTimeout: trackedClearTimeout, setInterval: trackedSetInterval, clearInterval: trackedClearInterval,
    requestAnimationFrame: (callback) => callback(), cancelAnimationFrame() {}, innerWidth: mobile ? 390 : 1280,
    visualViewport: mobile ? { width: 390, height: 844 } : undefined,
    addEventListener: windowEvents.addEventListener, removeEventListener: windowEvents.removeEventListener,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    require: undefined, module: undefined, exports: undefined, Notice: class {}, moment: () => ({ format: () => "2026-08-10" })
  };
  if (!globalIife) {
    target.app = app;
    target.obsidian = { Modal: class { constructor() { this.contentEl = new Element("section", {}, document); } open() {} close() {} } };
  }
  const lexicalAmbientUnavailable = !Object.hasOwn(target, "app") && !Object.hasOwn(target, "obsidian");
  const dataviewContext = { container };
  if (thisApp) dataviewContext.app = app;
  const sandbox = target;
  target.window = sandbox; target.globalThis = sandbox; target.__dataviewContext = dataviewContext;
  target.dv = {
    pages: () => ({ array: () => [] }), io: { load: async () => "" }, current: () => ({}),
    ...(dvApp ? { app } : {})
  };
  const context = vm.createContext(sandbox);
  target.Function = vm.runInContext("Function", context);
  target.eval = vm.runInContext("eval", context);

  let block = executableBlock(entry);
  let leakedCallback = null;
  if (mutation === "legacy-ambient-prelude") block = `window.obsidian = obsidian;\nwindow.app = app;\n${block}`;
  if (mutation === "listener-leak") {
    leakedCallback = function leakedProductionRegistration() {};
    target.__task6LeakedCallback = leakedCallback;
    block = block.replace(/([a-z]+):\s*async\s*\(mountContext\)\s*=>\s*\{/, "$& window.addEventListener(\"task6-leak\", window.__task6LeakedCallback);");
  }
  const invocation = globalIife
    ? `(async function () {\n${block}\n}).call(__dataviewContext)`
    : `(async function (app, dv, obsidian, container) {\n${block}\n}).call(__dataviewContext, ${lexicalApp ? "app" : "undefined"}, dv, obsidian, container)`;
  const script = new vm.Script(invocation, { filename: relative });

  function rawListenerCount() { let total = 0; for (const types of listenerTargets.values()) for (const callbacks of types.values()) for (const count of callbacks.values()) total += count; return total; }
  function vector() {
    const listenerCount = connectedListenerCount();
    return { shells: container.querySelectorAll(".prodigy-app-shell").length, listeners: listenerCount, timers: timers.size, observers: observers.size };
  }
  async function run() {
    try { await script.runInContext(context); } catch (error) { if (!(target.ProdigyHubLoader && target.ProdigyHubLoader.currentWorkspace(container))) throw error; }
    const loader = target.ProdigyHubLoader;
    const mounted = loader && loader.currentWorkspace(container);
    if (mounted) await mounted.optional_ready;
    if (target.__prodigyWorkoutOptionalContinuation) await target.__prodigyWorkoutOptionalContinuation;
    return mounted;
  }
  async function awaitResourceCommit() {
    if (workspaceId !== "workout" || connectedListenerCount() >= 6) return;
    let waiter;
    const signal = waitForExactSignal(`${workspaceId} resource commit`, (resolve) => {
      waiter = { predicate: () => connectedListenerCount() >= 6, resolve };
      resourceWaiters.push(waiter);
    });
    try { await signal; }
    finally { const index = resourceWaiters.indexOf(waiter); if (index >= 0) resourceWaiters.splice(index, 1); }
  }
  function retryLookup() { return waitForExactSignal(`${workspaceId} retry lookup`, (resolve) => retryLookupSignal.then(resolve)); }
  function shellMount() { return waitForExactSignal(`${workspaceId} shell mount`, (resolve) => shellMountSignal.then(resolve)); }
  function dispose() { return target.ProdigyHubLoader && target.ProdigyHubLoader.disposeWorkspace(container); }
  function cleanupLeak() { if (leakedCallback) windowEvents.removeEventListener("task6-leak", leakedCallback); }
  function detachLeaf() { leaf.remove(); container.empty(); }
  function emitLayoutChange() { emitWorkspace("layout-change"); }
  function closeLeaf() { detachLeaf(); emitLayoutChange(); }
  function shutdown() {
    dispose(); cleanupLeak();
    for (const handle of [...timers.keys()]) { trackedClearTimeout(handle); trackedClearInterval(handle); }
    for (const observer of [...observers.keys()]) observer.disconnect();
  }
  function findTags(node, tag, found = []) { if (node.tag === tag) found.push(node); for (const child of node.children) findTags(child, tag, found); return found; }
  function findTag(node, tag) { return findTags(node, tag)[0] || null; }
  function text(node = container) { return [node.textContent].concat(node.children.map((child) => text(child))).join(" ").trim(); }
  function restoreRequired() { files.set(missingRequiredPath, requiredSource); }
  function listenerDetails() { const out = []; for (const [eventTarget, types] of listenerTargets) for (const [type, callbacks] of types) if (!(eventTarget instanceof Element) || body.contains(eventTarget)) out.push({ target: eventTarget.tag || (eventTarget === document ? "document" : "window"), type, count: callbacks.size, className: eventTarget.attr && eventTarget.attr.class, error: eventTarget.__prodigyError && eventTarget.__prodigyError.message }); return out; }
  function recoveryNodes() { return container.querySelectorAll(".prodigy-required-recovery"); }
  function recoveryState() { const surfaces = recoveryNodes(); return { surfaces: surfaces.length, buttons: surfaces.reduce((sum, surface) => sum + surface.querySelectorAll("button").length, 0), headings: surfaces.reduce((sum, surface) => sum + surface.querySelectorAll("h2").length, 0) }; }
  function mobileBootstrapContract() {
    return {
      appIsMobile: app.isMobile,
      viewportWidth: target.innerWidth,
      visualViewportWidth: target.visualViewport && target.visualViewport.width,
      commonJsGlobalsUnavailable: typeof target.require === "undefined" && typeof target.module === "undefined",
      lexicalAmbientUnavailable,
      lexicalAppInjected: lexicalApp,
      dvAppInjected: target.dv.app === app,
      thisAppInjected: dataviewContext.app === app,
      bootstrapReads: reads.slice(0, 2),
      manifestBootstrapped: Boolean(target.ProdigyWorkspaceManifest),
      loaderBootstrapped: Boolean(target.ProdigyHubLoader),
      shells: container.querySelectorAll(".prodigy-app-shell").length,
      compactHomes: container.querySelectorAll(".home-compact").length,
      recovery: recoveryState(),
      genericRecovery: text().includes("홈 워크스페이스를 불러오지 못했습니다."),
      genericRecoveryAlerts: findTags(container, "p").filter((node) => node.attr.role === "alert" && node.textContent === "홈 워크스페이스를 불러오지 못했습니다.").length
    };
  }
  return { run, awaitResourceCommit, dispose, detachLeaf, emitLayoutChange, closeLeaf, vector, rawListenerCount, listenerDetails, recoveryState, mobileBootstrapContract, cleanupLeak, shutdown, workspaceListenerCount: () => [...workspaceEvents.values()].reduce((sum, refs) => sum + refs.size, 0), restoreRequired, retryLookup, shellMount, missingLookups: () => missingLookups, button: () => findTag(container, "button"), buttonCount: () => findTags(container, "button").length, onRecovery: (callback) => container.addEventListener("prodigy-loader-recovery", callback), offRecovery: (callback) => container.removeEventListener("prodigy-loader-recovery", callback), text, renderer: () => target.ProdigyHubLoader.currentWorkspace(container)?.manifest.renderer || null };
}

test("exact-signal guards reject with labels and clear timers on every settlement", async () => {
  const absent = waitForExactSignal("absent lifecycle signal", () => {}, 20);
  assert.equal(absent.guardActive(), true);
  await assert.rejects(absent, /absent lifecycle signal/);
  assert.equal(absent.guardActive(), false, "timeout rejection must leave no timer residue");

  let emitSuccess;
  const successful = waitForExactSignal("successful lifecycle signal", (resolve) => { emitSuccess = resolve; });
  assert.equal(successful.guardActive(), true);
  emitSuccess("observed");
  assert.equal(await successful, "observed");
  assert.equal(successful.guardActive(), false, "successful signal must clear its failure guard");

  let emitFailure;
  const rejected = waitForExactSignal("rejected lifecycle signal", (_resolve, reject) => { emitFailure = reject; });
  const rejectionCheck = assert.rejects(rejected, /expected signal rejection/);
  emitFailure(new Error("expected signal rejection"));
  await rejectionCheck;
  assert.equal(rejected.guardActive(), false, "signal rejection must clear its failure guard");
});

test("the frozen oracle independently binds all eight production blocks and renderer callbacks", async (t) => {
  assert.equal(BLOCK_FIXTURE.schemaVersion, 1);
  assert.equal(HUBS.length, 8);
  let executableBlockCount = 0;
  for (const entry of HUBS) {
    const source = fs.readFileSync(path.join(ROOT, entry.hubPath), "utf8");
    const currentBlocks = [...source.matchAll(/```(dataviewjs|js-engine)\n([\s\S]*?)\n```/g)];
    assert.equal(currentBlocks.length, entry.executableBlockCount, `${entry.workspaceId}: executable block count`);
    executableBlockCount += currentBlocks.length;
    await t.test(entry.workspaceId, () => {
      const block = verifyFixtureEntry(entry);
      assert.throws(() => verifyFixtureEntry(entry, oneByteMutation(block)), new RegExp(`${entry.workspaceId}: block SHA-256`));
      const wrongIdentity = Object.assign({}, entry, { renderer: Object.assign({}, entry.renderer, { identity: `${entry.renderer.identity}-mutated` }) });
      assert.throws(() => verifyFixtureEntry(wrongIdentity, block), new RegExp(`${entry.workspaceId}: renderer identity`));
      const wrongSentinel = Object.assign({}, entry, { renderer: Object.assign({}, entry.renderer, { sentinel: `${entry.renderer.sentinel}/*mutated*/` }) });
      assert.throws(() => verifyFixtureEntry(wrongSentinel, block), new RegExp(`${entry.workspaceId}: renderer sentinel`));
    });
  }
  assert.equal(executableBlockCount, BLOCK_FIXTURE.currentExecutableBlockCount, "exact current production executable block count");
  assert.equal(new Set(HUBS.map((entry) => entry.blockSha256)).size, 8, "raw production block hashes must be distinct");
});

test("exact Home dataviewjs bootstrap mounts compact Home through every supported app injection path", async (t) => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  verifyFixtureEntry(home);
  const paths = [
    ["lexical app", { mobile: true, lexicalApp: true, thisApp: false }, { lexicalAmbientUnavailable: false, lexicalAppInjected: true, thisAppInjected: false, dvAppInjected: false }],
    ["this.app", { mobile: true, globalIife: true, thisApp: true }, { lexicalAmbientUnavailable: true, lexicalAppInjected: false, thisAppInjected: true, dvAppInjected: false }],
    ["dv.app", { mobile: true, globalIife: true, dvApp: true }, { lexicalAmbientUnavailable: true, lexicalAppInjected: false, thisAppInjected: false, dvAppInjected: true }]
  ];
  for (const [name, environment, injection] of paths) {
    await t.test(name, async () => {
      const runtime = createRuntime(home, "none", environment);
      try {
        const mounted = await runtime.run();
        assert.ok(mounted, `${name}: the exact Home block must retain its production mount`);
        assert.equal(runtime.renderer(), "home");
        assert.deepEqual(runtime.mobileBootstrapContract(), {
          appIsMobile: true,
          viewportWidth: 390,
          visualViewportWidth: 390,
          commonJsGlobalsUnavailable: true,
          ...injection,
          bootstrapReads: [
            "SYSTEM/Views/prodigy-workspace-manifest.js",
            "SYSTEM/Views/prodigy-hub-loader.js"
          ],
          manifestBootstrapped: true,
          loaderBootstrapped: true,
          shells: 1,
          compactHomes: 1,
          recovery: { surfaces: 0, buttons: 0, headings: 0 },
          genericRecovery: false,
          genericRecoveryAlerts: 0
        });
      } finally { runtime.shutdown(); }
    });
  }
});

test("exact Home mobile global-IIFE bootstrap renders recovery when no Dataview app context is injected", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  verifyFixtureEntry(home);
  const runtime = createRuntime(home, "none", { mobile: true, globalIife: true });
  try {
    assert.equal(await runtime.run(), undefined);
    assert.deepEqual(runtime.mobileBootstrapContract(), {
      appIsMobile: true,
      viewportWidth: 390,
      visualViewportWidth: 390,
      commonJsGlobalsUnavailable: true,
      lexicalAmbientUnavailable: true,
      lexicalAppInjected: false,
      dvAppInjected: false,
      thisAppInjected: false,
      bootstrapReads: [],
      manifestBootstrapped: false,
      loaderBootstrapped: false,
      shells: 0,
      compactHomes: 0,
      recovery: { surfaces: 0, buttons: 0, headings: 0 },
      genericRecovery: true,
      genericRecoveryAlerts: 1
    });
  } finally { runtime.shutdown(); }
});

test("the mobile global-IIFE context regression is red for the pre-fix ambient app and obsidian prelude", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  const runtime = createRuntime(home, "legacy-ambient-prelude", { mobile: true, globalIife: true, dvApp: true });
  try {
    await assert.rejects(() => runtime.run(), /obsidian is not defined/);
    assert.deepEqual(runtime.mobileBootstrapContract().bootstrapReads, []);
    assert.equal(runtime.mobileBootstrapContract().genericRecovery, false);
  } finally { runtime.shutdown(); }
});

test("exact Home mobile bootstrap renders required-core recovery before a restored retry remounts", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  verifyFixtureEntry(home);
  const runtime = createRuntime(home, "missing-home-core", { mobile: true });
  try {
    await runtime.run();
    assert.equal(runtime.renderer(), null, "missing required Home core must block the renderer");
    assert.deepEqual(runtime.mobileBootstrapContract(), {
      appIsMobile: true,
      viewportWidth: 390,
      visualViewportWidth: 390,
      commonJsGlobalsUnavailable: true,
      lexicalAmbientUnavailable: false,
      lexicalAppInjected: true,
      dvAppInjected: false,
      thisAppInjected: true,
      bootstrapReads: [
        "SYSTEM/Views/prodigy-workspace-manifest.js",
        "SYSTEM/Views/prodigy-hub-loader.js"
      ],
      manifestBootstrapped: true,
      loaderBootstrapped: true,
      shells: 0,
      compactHomes: 0,
      recovery: { surfaces: 1, buttons: 1, headings: 1 },
      genericRecovery: false,
      genericRecoveryAlerts: 0
    });
    assert.match(runtime.text(), /SYSTEM\/Views\/home-model\.js/);

    const button = runtime.button();
    runtime.restoreRequired();
    const retryLookup = runtime.retryLookup();
    const shellMount = runtime.shellMount();
    const retry = button.dispatchEvent({ type: "click", preventDefault() {} });
    await retryLookup;
    await retry;
    await shellMount;

    assert.equal(runtime.renderer(), "home");
    assert.deepEqual(runtime.mobileBootstrapContract().recovery, { surfaces: 0, buttons: 0, headings: 0 });
    assert.equal(runtime.mobileBootstrapContract().shells, 1);
    assert.equal(runtime.mobileBootstrapContract().compactHomes, 1);
  } finally { runtime.shutdown(); }
});

test("Home leaf close disposes the actual dataviewjs mount after container detachment", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  const runtime = createRuntime(home);
  try {
    const mounted = await runtime.run();
    await runtime.awaitResourceCommit();
    assert.ok(mounted);
    assert.equal(mounted.scope.disposed, false);
    assert.equal(mounted.signal.aborted, false);
    assert.ok(runtime.rawListenerCount() > 0, "mounted Home must own live listeners before close");
    runtime.detachLeaf();
    assert.deepEqual({
      shells: runtime.vector().shells,
      disposed: mounted.scope.disposed,
      aborted: mounted.signal.aborted,
      listeners: runtime.vector().listeners,
      renderer: runtime.renderer()
    }, { shells: 0, disposed: true, aborted: true, listeners: 0, renderer: null });
  } finally { runtime.shutdown(); }
});

test("Home layout-change disposes when Obsidian detaches before a DOM removal observer can run", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  const runtime = createRuntime(home, "no-removal-observer");
  try {
    const mounted = await runtime.run();
    await runtime.awaitResourceCommit();
    runtime.detachLeaf();
    assert.deepEqual({ shells: runtime.vector().shells, disposed: mounted.scope.disposed, aborted: mounted.signal.aborted }, { shells: 0, disposed: false, aborted: false });
    runtime.emitLayoutChange();
    assert.deepEqual({ disposed: mounted.scope.disposed, aborted: mounted.signal.aborted, listeners: runtime.vector().listeners, renderer: runtime.renderer() }, { disposed: true, aborted: true, listeners: 0, renderer: null });
  } finally { runtime.shutdown(); }
});

test("all eight production Hub catches preserve the structured required-module recovery surface", async (t) => {
  for (const entry of HUBS) {
    await t.test(entry.workspaceId, async () => {
      const runtime = createRuntime(entry, "missing-required");
      try {
        await runtime.run();
        const button = runtime.button();
        assert.ok(button, `${entry.workspaceId}: native retry button`);
        assert.equal(button.attr.type, "button");
        assert.equal(button.__prodigyRetry, button.__prodigyError.retry, `${entry.workspaceId}: exact memoized retry`);
        assert.match(runtime.text(), /필수 워크스페이스 리소스를 불러오지 못했습니다/);
        assert.match(runtime.text(), /SYSTEM\/Views\/design-tokens\.js/);
        assert.match(runtime.text(), /동기화/);
        assert.equal(runtime.vector().shells, 0);
      } finally { runtime.shutdown(); }
    });
  }
});

test("a rejected missing-module retry stays handled and replaces recovery exactly once", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  const runtime = createRuntime(home, "missing-required");
  const events = [];
  const unhandled = [];
  const onRecovery = (event) => events.push(event.detail);
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  runtime.onRecovery(onRecovery);
  try {
    await runtime.run();
    const initialButton = runtime.button();
    const initialVector = runtime.vector();
    const activation = initialButton.dispatchEvent({ type: "click", preventDefault() {} });
    const duplicate = initialButton.dispatchEvent({ type: "click", preventDefault() {} });
    assert.equal(duplicate, undefined);
    await activation;
    await Promise.resolve();
    assert.deepEqual(unhandled, []);
    assert.equal(runtime.buttonCount(), 1);
    assert.notEqual(runtime.button(), initialButton);
    assert.deepEqual(runtime.vector(), initialVector);
    assert.equal(initialButton.dispatchEvent({ type: "click", preventDefault() {} }), undefined);
    assert.equal(events.length, 1);
    assert.match(runtime.text(), /필수 워크스페이스 리소스를 불러오지 못했습니다/);
    assert.match(runtime.text(), /SYSTEM\/Views\/design-tokens\.js/);
    assert.equal(JSON.stringify(events), JSON.stringify([{ type: "loader_recovery", category: "retry_rejected", path: "SYSTEM/Views/design-tokens.js", code: "sync_pending" }]));
    assert.doesNotMatch(JSON.stringify(events), /secret|source|injected/i);
  } finally {
    runtime.offRecovery(onRecovery);
    process.removeListener("unhandledRejection", onUnhandled);
    runtime.shutdown();
  }
});

test("a synchronous retry throw stays handled, sanitized, and leaves one current recovery control", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  const runtime = createRuntime(home, "sync-retry-throw");
  const events = [];
  const unhandled = [];
  const onRecovery = (event) => events.push(event.detail);
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  runtime.onRecovery(onRecovery);
  try {
    await runtime.run();
    const initialButton = runtime.button();
    const initialVector = runtime.vector();
    const activation = initialButton.dispatchEvent({ type: "click", preventDefault() {} });
    const duplicate = initialButton.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
    assert.equal(duplicate, undefined);
    await activation;
    await Promise.resolve();
    assert.deepEqual(unhandled, []);
    assert.equal(runtime.buttonCount(), 1);
    assert.equal(runtime.button(), initialButton);
    assert.deepEqual(runtime.vector(), initialVector);
    assert.equal(JSON.stringify(events), JSON.stringify([{ type: "loader_recovery", category: "retry_sync_throw", path: "SYSTEM/Views/design-tokens.js", code: "sync_pending" }]));
    assert.doesNotMatch(JSON.stringify(events), /secret|source|injected/i);
  } finally {
    runtime.offRecovery(onRecovery);
    process.removeListener("unhandledRejection", onUnhandled);
    runtime.shutdown();
  }
});

test("Home rejected Enter recovery is removed after restored Space retry mounts", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  const runtime = createRuntime(home, "missing-required");
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    await runtime.run();
    const staleInitial = runtime.button();
    const rejected = staleInitial.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
    await rejected;
    await Promise.resolve();
    const staleRejected = runtime.button();
    assert.notEqual(staleRejected, staleInitial);
    assert.deepEqual(runtime.recoveryState(), { surfaces: 1, buttons: 1, headings: 1 });

    runtime.restoreRequired();
    const shellMount = runtime.shellMount();
    const recovered = staleRejected.dispatchEvent({ type: "keydown", key: " ", preventDefault() {} });
    await recovered;
    await shellMount;
    await Promise.resolve();

    assert.equal(runtime.renderer(), "home");
    assert.deepEqual(runtime.vector(), { shells: 1, listeners: 5, timers: 0, observers: 2 });
    assert.deepEqual(runtime.recoveryState(), { surfaces: 0, buttons: 0, headings: 0 });
    assert.deepEqual(unhandled, []);

    const lookups = runtime.missingLookups();
    const resources = runtime.vector();
    assert.equal(staleInitial.dispatchEvent({ type: "click", preventDefault() {} }), undefined);
    assert.equal(staleRejected.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} }), undefined);
    await Promise.resolve();
    assert.equal(runtime.missingLookups(), lookups);
    assert.deepEqual(runtime.vector(), resources);
    assert.equal(runtime.renderer(), "home");
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
    runtime.shutdown();
  }
});

test("Home required recovery supports Enter, Space, and duplicate-click CAS remount", async (t) => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  for (const key of ["Enter", " "]) {
    await t.test(key === " " ? "Space" : key, async () => {
      const runtime = createRuntime(home, "missing-required");
      try {
        await runtime.run();
        const button = runtime.button();
        runtime.restoreRequired();
        const retryLookup = runtime.retryLookup();
        const shellMount = runtime.shellMount();
        const remount = button.dispatchEvent({ type: "keydown", key, preventDefault() {} });
        await retryLookup;
        await remount;
        await shellMount;
        assert.equal(runtime.missingLookups(), 2);
        assert.equal(runtime.vector().shells, 1);
        assert.equal(runtime.renderer(), "home");
      } finally { runtime.shutdown(); }
    });
  }
  await t.test("duplicate click", async () => {
    const runtime = createRuntime(home, "missing-required");
    try {
      await runtime.run();
      const button = runtime.button();
      runtime.restoreRequired();
      const retryLookup = runtime.retryLookup();
      const shellMount = runtime.shellMount();
      const remount = button.dispatchEvent({ type: "click", preventDefault() {} });
      const duplicate = button.dispatchEvent({ type: "click", preventDefault() {} });
      assert.equal(duplicate, undefined);
      await retryLookup;
      await remount;
      await shellMount;
      assert.equal(runtime.missingLookups(), 2);
      assert.equal(runtime.vector().shells, 1);
      assert.equal(runtime.renderer(), "home");
    } finally { runtime.shutdown(); }
  });
});

test("all eight production Hub catches retain generic safe fallback for unexpected renderer errors", async (t) => {
  for (const entry of HUBS) {
    await t.test(entry.workspaceId, async () => {
      const runtime = createRuntime(entry, "app-shell-failure");
      try {
        await runtime.run();
        assert.match(runtime.text(), /워크스페이스를 불러오지 못했습니다/);
        assert.equal(runtime.vector().shells, 0);
      } finally { runtime.shutdown(); }
    });
  }
});

test("all eight production Hub blocks use the actual loader/navigation/AppShell lifecycle without resource growth", async (t) => {
  const observed = {};
  for (const entry of HUBS) {
    const { workspaceId } = entry;
    await t.test(workspaceId, async () => {
      verifyFixtureEntry(entry);
      const runtime = createRuntime(entry);
      try {
        const firstMount = await runtime.run();
        assert.ok(firstMount, `${workspaceId}: actual loader did not retain its production mount`);
        assert.equal(runtime.renderer(), entry.renderer.identity);
        await runtime.awaitResourceCommit();
        const first = runtime.vector();
        const captureEnabled = ["home", "workout", "personal", "journal"].includes(workspaceId);
        const firstCapturePair = runtime.listenerDetails().filter((item) => item.target === "document" && (item.type === "click" || item.type === "keydown"));
        assert.deepEqual(firstCapturePair.map((item) => item.type).sort(), captureEnabled ? ["click", "keydown"] : [], `${workspaceId}: exact Capture listener pair`);
        assert.deepEqual(firstCapturePair.map((item) => [item.type, item.count]).sort(), captureEnabled ? [["click", 1], ["keydown", workspaceId === "home" ? 2 : 1]] : [], `${workspaceId}: Capture pair plus known domain listeners only`);
        const secondMount = await runtime.run();
        assert.ok(secondMount, `${workspaceId}: second production mount missing`);
        assert.equal(runtime.renderer(), entry.renderer.identity);
        await runtime.awaitResourceCommit();
        const second = runtime.vector();
        const secondCapturePair = runtime.listenerDetails().filter((item) => item.target === "document" && (item.type === "click" || item.type === "keydown"));
        assert.deepEqual(secondCapturePair.map((item) => item.type).sort(), captureEnabled ? ["click", "keydown"] : [], `${workspaceId}: remount Capture listener pair`);
        assert.deepEqual(secondCapturePair.map((item) => [item.type, item.count]).sort(), captureEnabled ? [["click", 1], ["keydown", workspaceId === "home" ? 2 : 1]] : [], `${workspaceId}: remount has no duplicate Capture callbacks`);
        assert.deepEqual(second, first, `${workspaceId}: resources grew on replacement mount ${JSON.stringify(runtime.listenerDetails())}`);
        runtime.dispose();
        assert.deepEqual(runtime.vector(), { shells: 0, listeners: 0, timers: 0, observers: 0 }, `${workspaceId}: final disposal`);
        observed[workspaceId] = first;
      } finally { runtime.shutdown(); }
    });
  }
  t.diagnostic(JSON.stringify(observed));
});

test("an injected failure after the production AppShell registers disposal reaches zero for every real renderer", async (t) => {
  for (const entry of HUBS) {
    const { workspaceId } = entry;
    await t.test(workspaceId, async () => {
      const runtime = createRuntime(entry, "app-shell-failure");
      try {
        await runtime.run();
        assert.deepEqual(runtime.vector(), { shells: 0, listeners: 0, timers: 0, observers: 0 }, workspaceId);
      } finally { runtime.shutdown(); }
    });
  }
});

test("negative mutations detect failed-mount cleanup and callback-identity listener leaks", async () => {
  const home = HUBS.find((entry) => entry.workspaceId === "home");
  const failedMount = createRuntime(home, "capture-failed-cleanup-removed");
  try {
    await failedMount.run();
    const captureListeners = failedMount.listenerDetails().filter((item) => item.target === "document" && (item.type === "click" || item.type === "keydown"));
    assert.deepEqual(captureListeners.map((item) => item.type).sort(), ["click", "keydown"], "failed-cleanup mutation leaves the Capture pair live and therefore RED");
    assert.throws(() => assert.deepEqual(failedMount.vector(), { shells: 0, listeners: 0, timers: 0, observers: 0 }), /listeners/);
  } finally { failedMount.shutdown(); }

  const callbackLeak = createRuntime(home, "listener-leak");
  try {
    await callbackLeak.run();
    callbackLeak.dispose();
    const leaked = callbackLeak.vector();
    assert.equal(leaked.shells, 0);
    assert.equal(leaked.listeners, 1);
    callbackLeak.cleanupLeak();
    assert.deepEqual(callbackLeak.vector(), { shells: 0, listeners: 0, timers: 0, observers: 0 });
  } finally { callbackLeak.shutdown(); }
});
