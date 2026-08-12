"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");

class FakeEvent {
  constructor(type, target, options = {}) { this.type = type; this.target = target; this.key = options.key || ""; this.isTrusted = options.isTrusted !== false; this.timeStamp = options.timeStamp || Date.now(); }
}
class FakeRoot {
  constructor(name) { this.name = name; this.nodes = new Set([this]); }
  append(node) { this.nodes.add(node); return node; }
  contains(node) { return this.nodes.has(node); }
}
class FakeDocument {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  count(type) { return this.listeners.get(type)?.size || 0; }
  dispatch(event) { for (const callback of [...(this.listeners.get(event.type) || [])]) callback(event); }
}
function scope() {
  let disposed = false; const cleanups = [];
  return { get disposed() { return disposed; }, signal: { get aborted() { return disposed; } }, track(cleanup) { if (disposed) cleanup(); else cleanups.push(cleanup); }, dispose() { if (disposed) return false; disposed = true; cleanups.splice(0).reverse().forEach((cleanup) => cleanup()); return true; } };
}
function loadRuntime(runtimeMutation) {
  const document = new FakeDocument();
  const context = vm.createContext({ console, Date, JSON, Object, Array, String, Number, Boolean, Map, Set, WeakMap, WeakSet, Promise, RegExp, Symbol, Uint32Array, encodeURIComponent, unescape, Event: FakeEvent, document });
  context.globalThis = context;
  for (const rel of ["capture-state-contract.js", "capture-authorized-writer.js", "capture-action-runtime.js"]) {
    let source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views", rel), "utf8");
    if (rel === "capture-action-runtime.js" && runtimeMutation) source = runtimeMutation(source);
    vm.runInContext(source, context, { filename: rel });
  }
  return { runtime: context.CaptureActionRuntime, contract: context.CaptureStateContract, document };
}
function proposal(contract, target = "ZETA/FLEETING/lifecycle.md") {
  return contract.createProposal({ operation: "create", target_path: target, payload: { title: "Lifecycle" }, source_evidence: [{ source_id: "test", locator: "test:button" }], rollback_identity: { rollback_id: "rollback-lifecycle", before_revision: "absent" } });
}
function vector(document) { return { click: document.count("click"), keydown: document.count("keydown") }; }

async function lifecycleScenario(runtimeMutation) {
  const { runtime, contract, document } = loadRuntime(runtimeMutation);
  assert.equal(typeof runtime.mountTrustedInteractions, "function", "Capture runtime exposes explicit lifecycle ownership");
  const rootA = new FakeRoot("A"); const nodeA = rootA.append({ name: "A-button" });
  const rootB = new FakeRoot("B"); const nodeB = rootB.append({ name: "B-button" });
  const scopeA = scope(); const scopeB = scope();
  assert.deepEqual(vector(document), { click: 0, keydown: 0 }, "module import has no listener side effect");
  const absent = runtime.mountTrustedInteractions({ root: null, document, scope: scope(), session_id: "absent" });
  assert.equal(absent.active, false, "missing root degrades fail closed");
  assert.deepEqual(vector(document), { click: 0, keydown: 0 });
  const ownerA = runtime.mountTrustedInteractions({ root: rootA, document, scope: scopeA, session_id: "mount-a" });
  assert.deepEqual(vector(document), { click: 1, keydown: 1 });
  const ownerB = runtime.mountTrustedInteractions({ root: rootB, document, scope: scopeB, session_id: "mount-b" });
  assert.deepEqual(vector(document), { click: 1, keydown: 1 }, "concurrent mounts share one document listener pair");

  document.dispatch(new FakeEvent("click", nodeA));
  const startIntent = runtime.humanConfirmation("security-create", "action-a");
  const seed = proposal(contract);
  const record = await runtime.prepareHumanReview({ action_id: "security-create", operation: "create", target_path: seed.target_path, payload: seed.payload, source_id: "test", locator: "test:button", readRevision: async () => null }, startIntent);
  document.dispatch(new FakeEvent("click", nodeA));
  const staleIntent = runtime.humanConfirmation("security-create", "action-a");
  const staleCapability = runtime.bindTrustedConfirmation(staleIntent, record, { action_id: "security-create", session_id: "action-a" });
  scopeA.dispose();
  assert.deepEqual(vector(document), { click: 1, keydown: 1 }, "disposing one owner preserves concurrent owner listeners");
  await assert.rejects(() => runtime.executeHumanConfirmed({ proposal: record, human: staleCapability, action_id: "security-create", session_id: "action-a" }, {}), /mount|owner|disposed|inactive/i);

  document.dispatch(new FakeEvent("click", nodeA));
  assert.throws(() => runtime.humanConfirmation("security-create", "stale-root"), /trusted explicit interaction/i, "disposed root events cannot arm another mount");
  document.dispatch(new FakeEvent("keydown", nodeB, { key: "Enter" }));
  const liveIntent = runtime.humanConfirmation("security-create", "action-b");
  assert.ok(liveIntent);
  ownerB.dispose();
  assert.deepEqual(vector(document), { click: 0, keydown: 0 }, "last owner disposal removes the listener pair");
  assert.throws(() => runtime.bindTrustedConfirmation(liveIntent, record, { action_id: "security-create", session_id: "action-b" }), /mount|owner|disposed|inactive/i);
  assert.equal(ownerA.dispose(), false, "scope cleanup and owner disposal are idempotent");

  const remountScope = scope();
  const remount = runtime.mountTrustedInteractions({ root: rootA, document, scope: remountScope, session_id: "mount-remount" });
  assert.deepEqual(vector(document), { click: 1, keydown: 1 }, "open-close-open registers one pair");
  remountScope.dispose();
  assert.equal(remount.active, false);
  assert.deepEqual(vector(document), { click: 0, keydown: 0 }, "same-root remount cleanup returns to zero");

  assert.throws(() => runtime.mountTrustedInteractions({
    root: rootA, document, session_id: "failed-mount",
    scope: { track(cleanup) { cleanup(); throw new Error("injected mount registration failure"); } }
  }), /injected mount registration failure/);
  assert.deepEqual(vector(document), { click: 0, keydown: 0 }, "failed registration cleans its listener pair");

  const partialDocument = new FakeDocument();
  const add = partialDocument.addEventListener.bind(partialDocument);
  partialDocument.addEventListener = (type, callback) => { if (type === "keydown") throw new Error("injected keydown registration failure"); add(type, callback); };
  assert.throws(() => runtime.mountTrustedInteractions({ root: rootA, document: partialDocument, scope: scope(), session_id: "partial-failure" }), /injected keydown registration failure/);
  assert.deepEqual(vector(partialDocument), { click: 0, keydown: 0 }, "partial document registration rolls back click");
  return true;
}

test("Capture listeners are explicit, reference-counted, mount-bound, and fail closed after disposal", async () => {
  await lifecycleScenario();
});

test("cleanup, reference-counting, and capability-invalidation mutations are executable RED", async (t) => {
  await t.test("listener cleanup removed", async () => {
    await assert.rejects(() => lifecycleScenario((source) => source
      .replace('documentRef.removeEventListener("click", record.click, true);', "")
      .replace('documentRef.removeEventListener("keydown", record.keydown, true);', "")), /last owner disposal/i);
  });
  await t.test("reference count removed", async () => {
    await assert.rejects(() => lifecycleScenario((source) => source.replace("if (!record.owners.size) {", "if (true) {")), /preserves concurrent owner listeners/i);
  });
  await t.test("disposed capability invalidation removed", async () => {
    await assert.rejects(() => lifecycleScenario((source) => source
      .replace("contract().deactivateTrustedOwner(token);", "")
      .replace('if (!owner || !owner.active) throw new Error("Trusted mount owner is inactive or disposed.");\n    const authorized', 'if (!owner) throw new Error("Trusted mount owner is unavailable.");\n    const authorized')), /mount|owner|disposed|inactive/i);
  });
});
