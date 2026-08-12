"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = require(path.join(ROOT, "SYSTEM/Views/reading-view.js"));

class Element {
  constructor() { this.children = []; this.attributes = {}; this.textContent = ""; }
  empty() { this.children = []; this.textContent = ""; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  createEl(_tag, options = {}) {
    const child = new Element();
    child.textContent = options.text || "";
    for (const [name, value] of Object.entries(options.attr || {})) child.setAttribute(name, value);
    this.children.push(child);
    return child;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const contracts = Object.freeze({
  normal: { expected: ["success"], forbidden: ["loading", "empty", "error"], allowedConcurrent: ["selected-active"] },
  empty: { expected: ["empty"], forbidden: ["loading", "success", "error"], allowedConcurrent: ["selected-active"] },
  loading: { expected: ["loading"], forbidden: ["empty", "success", "error"], allowedConcurrent: ["selected-active", "disabled-busy"] },
  error: { expected: ["error"], forbidden: ["loading", "empty", "success"], allowedConcurrent: ["selected-active"] },
  "selected-active": { expected: ["success", "selected-active"], forbidden: ["error"], allowedConcurrent: ["success"] },
  "disabled-busy": { expected: ["loading", "disabled-busy"], forbidden: ["error"], allowedConcurrent: ["loading"] },
});

async function main() {
  assert.equal(typeof view.createDashboardController, "function");
  const container = new Element();
  const reads = [];
  const signals = [];
  let next = [{ file: { path: "PARA/PROJECTS/Reading/One.md" } }];
  let pane = "list";
  let focused = null;
  let responsiveDisposals = 0;
  const provider = { listReadings(detail) { reads.push(detail); return typeof next === "function" ? next(detail) : next; }, page: (value) => ({ value }) };
  const controller = view.createDashboardController({
    container,
    provider,
    generation: 7,
    onProviderRead(detail) { signals.push({ ...detail, readsAtSignal: reads.length }); },
    render({ rows }) {
      return {
        empty: rows.length === 0,
        responsive: {
          selectPane(value) { pane = value; return value; },
          focusCard(value) { focused = value; return { ok: true, path: value }; },
          dispose() { responsiveDisposals += 1; },
        },
      };
    },
  });

  assert.equal(await controller.refresh(), true);
  assert.deepEqual(controller.getState(), { status: "success", generation: 7, nonce: 1, disposed: false, error: null });
  assert.equal(container.getAttribute("data-state"), contracts.normal.expected[0]);
  assert.equal(signals[0].readsAtSignal, 0, "provider event is emitted before the read trigger");
  assert.equal(reads[0].nonce, signals[0].nonce);

  next = [];
  await controller.refresh();
  assert.equal(controller.getState().status, contracts.empty.expected[0]);

  const pending = deferred();
  next = () => pending.promise;
  const loading = controller.refresh();
  assert.equal(controller.getState().status, contracts.loading.expected[0]);
  assert.equal(container.getAttribute("aria-busy"), "true");
  pending.resolve([{ file: { path: "recover.md" } }]);
  await loading;

  next = () => Promise.reject(new Error("closed fixture rejection"));
  assert.equal(await controller.refresh(), false);
  assert.equal(controller.getState().status, contracts.error.expected[0]);
  assert.equal(container.children.at(-1).getAttribute("role"), "alert");

  next = [{ file: { path: "recover.md" } }];
  await controller.refresh();
  controller.selectPane("detail");
  controller.focusCard("recover.md");
  assert.equal(pane, "detail");
  assert.equal(focused, "recover.md");
  assert.equal(controller.getState().status, contracts["selected-active"].expected[0]);

  const stale = deferred();
  next = () => stale.promise;
  const staleRefresh = controller.refresh();
  assert.equal(controller.getState().status, contracts["disabled-busy"].expected[0]);
  assert.equal(controller.dispose(), true);
  assert.equal(controller.dispose(), false);
  stale.resolve([{ file: { path: "stale.md" } }]);
  assert.equal(await staleRefresh, false, "disposed generation rejects late provider settlement");
  assert.equal(controller.getState().disposed, true);
  assert.ok(responsiveDisposals >= 1);
  assert.throws(() => controller.selectPane("list"), /disposed/i);
  assert.equal(Object.keys(contracts).length, 6);
  console.log("Reading single-mount controller six-state tests passed");
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
