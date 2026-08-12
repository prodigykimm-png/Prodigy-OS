"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");

class Element {
  constructor(tag = "div", options = {}) { this.tag = tag; this.children = []; this.text = String(options.text || ""); this.attributes = Object.assign({}, options.attr || {}); this.style = {}; this.disabled = false; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this.text = String(value == null ? "" : value); }
  createEl(tag, options = {}) { const child = new Element(tag, options); this.children.push(child); return child; }
  empty() { this.children = []; }
  addClass() {}
  setText(value) { this.text = String(value == null ? "" : value); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function review(status) {
  const empty = status === "empty";
  return { path: "DAILY/DAILY/2026-08-10.md", exists: !empty, status, statusLabel: empty ? "비어 있음" : "완료", fields: { reflection: empty ? "" : "오늘 기록", change: empty ? "" : "변화", next_experiment: empty ? "" : "다음 실험" }, blocks: empty ? [] : [{ evidence_id: "daily-2026-08-10-e01", title: "촬영 기록", experience: "촬영을 진행했다.", legacy: false }] };
}

test("Dashboard controller signals loading, normal, stale cancellation, error, empty recovery, and destroy on one mount", async () => {
  const previous = { JournalCore: global.JournalCore, JournalStore: global.JournalStore, JournalCompletionAction: global.JournalCompletionAction, ProdigyUI: global.ProdigyUI };
  const reads = [];
  let currentRead = deferred();
  let recent = [];
  global.JournalCore = { todayIsoDate: () => "2026-08-10", emptyBlock: () => ({}) };
  global.JournalStore = {
    loadReview: () => { reads.push(currentRead); return currentRead.promise; },
    listRecentReviews: async () => recent
  };
  global.JournalCompletionAction = { render() {} };
  global.ProdigyUI = { ensureStyles() {}, button(parent, text, options = {}) { return parent.createEl("button", { text, attr: { type: "button", class: options.primary ? "prodigy-btn prodigy-btn-primary" : "prodigy-btn" } }); } };
  const host = new Element();
  const signals = [];
  try {
    delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/journal-dashboard-view.js"))];
    const view = require(path.join(ROOT, "SYSTEM/Views/journal-dashboard-view.js"));
    const controller = view.renderDashboard({}, host, () => {}, { onStateChange: (state) => signals.push(state) });
    assert.equal(controller.getState().phase, "loading", "loading is synchronous");
    currentRead.resolve(review("complete"));
    await controller.ready;
    assert.equal(controller.getState().phase, "normal");
    assert.match(host.textContent, /촬영 기록/);

    const stale = deferred();
    currentRead = stale;
    const staleReady = controller.refresh("2026-08-09");
    const recovery = deferred();
    currentRead = recovery;
    const recoveryReady = controller.refresh("2026-08-10");
    recovery.resolve(review("empty"));
    await recoveryReady;
    stale.resolve(review("complete"));
    await staleReady;
    assert.equal(controller.getState().date, "2026-08-10");
    assert.equal(controller.getState().phase, "empty", "stale completion cannot overwrite the current empty state");

    currentRead = deferred();
    const failed = controller.refresh("2026-08-11");
    currentRead.reject(new Error("dashboard offline"));
    await assert.rejects(failed, /dashboard offline/);
    assert.equal(controller.getState().phase, "error");
    assert.match(controller.getState().error, /dashboard offline/);

    currentRead = deferred();
    const emptyReady = controller.refresh("2026-08-10");
    currentRead.resolve(review("empty"));
    await emptyReady;
    assert.equal(controller.getState().phase, "empty");
    assert.ok(signals.some((state) => state.phase === "loading" && state.busy));
    assert.ok(signals.some((state) => state.phase === "error" && !state.busy));

    currentRead = deferred();
    const pending = controller.refresh("2026-08-12");
    const stateAtDestroy = controller.getState();
    controller.destroy();
    controller.destroy();
    currentRead.resolve(review("complete"));
    await pending;
    assert.deepEqual(controller.getState(), stateAtDestroy, "destroy ignores pending terminal work");
  } finally {
    delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/journal-dashboard-view.js"))];
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete global[key] : global[key] = value;
  }
});
