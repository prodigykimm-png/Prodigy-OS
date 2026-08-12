"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
const ACTUAL_BLOCK = HUB.match(/```js-engine\n([\s\S]*?)\n```/)[1];

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

class Element {
  constructor() { this.children = []; this.classList = { add() {}, remove() {}, toggle() {} }; this.style = { setProperty() {} }; this.attr = {}; this.clientWidth = 1280; }
  empty() { this.children = []; }
  createEl() { const child = new Element(); this.children.push(child); return child; }
  createDiv() { return this.createEl(); }
  appendChild(child) { this.children.push(child); return child; }
  setAttr(key, value) { this.attr[key] = value; }
  setAttribute(key, value) { this.attr[key] = value; }
  getAttribute(key) { return this.attr[key] ?? null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  removeEventListener() {}
}

function universal() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, { get(_target, key) { if (key === "then") return undefined; if (key === Symbol.iterator) return function* () {}; if (key === "array") return () => []; if (key === "length") return 0; return proxy; }, construct() { return proxy; } });
  return proxy;
}

function actualAuctionExecution(readiness, initialGlobals = {}) {
  const container = new Element();
  const generic = universal();
  let decisionPacketInitializations = 0;
  let rendererCalls = 0;
  let optionalCallback = null;
  const scope = { signal: { aborted: false }, track() {}, guard: (callback) => callback, timeout() {}, interval() {}, listen() {}, observe() {} };
  const app = {
    workspace: { getActiveFile: () => ({ path: "HUB/10 Auction.md" }) },
    vault: { getAbstractFileByPath: (p) => ({ path: p }), read: async () => "" },
    plugins: { plugins: { dataview: { api: { pages: () => ({ array: () => [] }) } } } }
  };
  const manifest = { workspaceId: "auction", host: "js-engine", required: [], optional: [], renderer: "auction" };
  const known = {
    console, Error, TypeError, Object, Array, String, Number, Boolean, Set, Map, WeakMap, Promise, Date, Math, JSON, RegExp, Symbol,
    app, container, document: undefined, obsidian: {}, setTimeout: () => 1, clearTimeout() {},
    prodigySiteVisitReady: readiness.promise, prodigyDisplay: { status: (v) => v, property: (v) => v, type: (v) => v },
    ProdigyWorkspaceManifest: { get: () => manifest },
    ProdigyWorkspaceNavigation: { mount: () => ({ element: new Element(), body: new Element(), performance: null, readinessSnapshot: (_id, evidence) => evidence }), renderLoaderError(_container, error) { throw error; } },
    AuctionDecisionPacket: { createDashboardContext(pages) { decisionPacketInitializations += 1; return { pages }; } },
    AuctionDecisionMirrorCore: { snapshotAuctionCases: () => ({}) },
    ProdigyHubLoader: { async mountWorkspace(_app, _manifest, options) { rendererCalls += 1; return options.renderers.auction({ app, container, manifest, scope, signal: scope.signal, optional_ready: Promise.resolve({ optional_failures: [] }), onOptionalReady(callback) { optionalCallback = callback; }, retry() {}, reloadRequired: async () => ({ ok: true }) }); } }
  };
  const target = Object.assign({}, known, initialGlobals);
  const sandbox = new Proxy(target, { has: () => true, get(object, key) { if (key === "window" || key === "globalThis") return sandbox; return key in object ? object[key] : generic; }, set(object, key, value) { object[key] = value; return true; } });
  target.window = sandbox; target.globalThis = sandbox;
  const script = new vm.Script(`(async function (app, obsidian, container) {\n${ACTUAL_BLOCK}\n}).call({ container }, app, obsidian, container)`, { filename: "HUB/10 Auction.md" });
  return {
    task: script.runInNewContext(sandbox),
    counts: () => ({ rendererCalls, decisionPacketInitializations }),
    global: (key) => target[key],
    continuation: () => target.__prodigyMeasurementContinuations && target.__prodigyMeasurementContinuations[0],
    settleOptional(session, failures = []) { target.__prodigyMeasurementEntry = session ? { workspaceId: "auction", session } : { workspaceId: "auction" }; optionalCallback({ optional_failures: failures }); }
  };
}

test("the actual Auction Hub block gates decision-packet initialization on site-visit readiness", async () => {
  const readiness = deferred();
  const execution = actualAuctionExecution(readiness);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(execution.counts(), { rendererCalls: 1, decisionPacketInitializations: 0 });
  readiness.resolve();
  await execution.task;
  assert.deepEqual(execution.counts(), { rendererCalls: 1, decisionPacketInitializations: 1 });
});

test("the actual Auction Hub clears a region scope no live handoff owns", async () => {
  const readiness = deferred();
  readiness.resolve();
  const execution = actualAuctionExecution(readiness, {
    prodigyAuctionRegionScope: { region_key: "stale", region_sido: "서울", region_sigungu: "강남구" }
  });
  await execution.task;
  assert.equal(execution.global("prodigyAuctionRegionScope"), undefined);
});

test("the actual Auction Hub makes a fresh Region scope mount-local", async () => {
  const readiness = deferred();
  readiness.resolve();
  const regionScope = { region_key: "fresh", region_sido: "서울", region_sigungu: "강남구" };
  const request = { request_id: "fresh", status: "pending", created_at: new Date().toISOString() };
  const execution = actualAuctionExecution(readiness, {
    prodigyAuctionNavigationRequest: request,
    prodigyAuctionRegionScope: regionScope
  });
  await execution.task;
  assert.equal(JSON.stringify(execution.global("__prodigyAuctionActiveRegionScope")), JSON.stringify(regionScope));
  assert.equal(execution.global("prodigyAuctionNavigationRequest"), undefined);
  assert.equal(execution.global("prodigyAuctionRegionScope"), undefined);
});

test("the actual Auction Hub discards an expired Region handoff", async () => {
  const readiness = deferred();
  readiness.resolve();
  const execution = actualAuctionExecution(readiness, {
    prodigyAuctionNavigationRequest: { request_id: "expired", status: "opened", created_at: "2020-01-01T00:00:00.000Z" },
    prodigyAuctionRegionScope: { region_key: "expired", region_sido: "서울", region_sigungu: "강남구" }
  });
  await execution.task;
  assert.equal(execution.global("__prodigyAuctionActiveRegionScope"), undefined);
  assert.equal(execution.global("prodigyAuctionNavigationRequest"), undefined);
  assert.equal(execution.global("prodigyAuctionRegionScope"), undefined);
});

test("the actual Auction renderer records an explicit continuation when measurement arrives after rendering", async () => {
  const readiness = deferred();
  readiness.resolve();
  const execution = actualAuctionExecution(readiness);
  await execution.task;
  assert.equal(JSON.stringify(execution.continuation()), JSON.stringify({ workspaceId: "auction", state: "pending", unmeasured: ["required_modules_before_session", "renderer_before_session"] }));
  const calls = [];
  const session = {
    available: true,
    recordMissing(phase) { calls.push(["missing", phase]); },
    measureModule(modulePath, operation) { calls.push(["module", modulePath]); return operation(); },
    record(phase, fields) { calls.push(["record", phase, fields.status]); }
  };
  execution.settleOptional(session);
  assert.equal(execution.continuation().state, "continued");
  assert.deepEqual(calls, [
    ["missing", "auction.pre_session_handoff"],
    ["module", "auction:optional_renderer_continuation"],
    ["record", "measurement_handoff", "continued"]
  ]);
});

test("the actual Auction renderer exposes failed late measurement without claiming full coverage", async () => {
  const readiness = deferred(); readiness.resolve();
  const execution = actualAuctionExecution(readiness);
  await execution.task;
  execution.settleOptional(null, [{ path: "SYSTEM/Views/prodigy-workspace-measurement.js", code: "sync_pending" }]);
  assert.equal(execution.continuation().state, "failed");
  assert.equal(JSON.stringify(execution.continuation().failures), JSON.stringify([{ path: "SYSTEM/Views/prodigy-workspace-measurement.js", code: "sync_pending" }]));
  assert.equal(JSON.stringify(execution.continuation().unmeasured), JSON.stringify(["required_modules_before_session", "renderer_before_session"]));
});
