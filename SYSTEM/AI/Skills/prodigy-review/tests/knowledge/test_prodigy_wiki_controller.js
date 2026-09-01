"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const api = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-controller.js"));

const SOURCE = Object.freeze({
  path: "INBOX/서울투자반.md",
  title: "서울투자반",
  source_kind: "inbox",
  content_hash: "8".repeat(64),
});

test("one controller snapshot synchronizes every subscribed Prodigy Wiki view", () => {
  const controller = api.createController();
  const left = [];
  const right = [];
  const unsubscribeLeft = controller.subscribe((snapshot) => left.push(snapshot));
  controller.subscribe((snapshot) => right.push(snapshot));

  controller.dispatch({ type: "open_picker", options: [SOURCE] });
  controller.dispatch({ type: "select_source", source: SOURCE });

  assert.strictEqual(left.at(-1), right.at(-1));
  assert.equal(left.at(-1).status, "source_selected");
  assert.equal(left.at(-1).source.path, SOURCE.path);
  unsubscribeLeft();
  controller.dispatch({ type: "request_consent", preflight: { packs: 3 } });
  assert.equal(left.length + 1, right.length);
});

test("ephemeral selection and consent never restore into a fresh app session", () => {
  for (const status of ["source_selected", "range_required", "consent_required"]) {
    const controller = api.createController({
      initialSnapshot: { status, source: SOURCE, picker_open: true },
    });
    assert.equal(controller.getSnapshot().status, "idle");
    assert.equal(controller.getSnapshot().source, null);
    assert.equal(controller.getSnapshot().picker_open, false);
  }
});

test("new source selection atomically clears stale consent range and result", () => {
  const controller = api.createController();
  controller.dispatch({ type: "select_source", source: SOURCE });
  controller.dispatch({ type: "require_range", result: { ranges: [{ range_id: "range_1" }] } });
  controller.dispatch({ type: "select_range", range: { range_id: "range_1", start: 0, end: 120 }, preflight: { packs: 1 } });
  controller.dispatch({ type: "request_consent", preflight: { packs: 1 } });
  controller.dispatch({ type: "open_picker", options: [SOURCE] });

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.status, "idle");
  assert.equal(snapshot.source, null);
  assert.equal(snapshot.range, null);
  assert.equal(snapshot.result, null);
  assert.equal(snapshot.picker_open, true);
});

test("controller rejects running without a pinned source", () => {
  const controller = api.createController();
  const before = controller.getSnapshot();
  const result = controller.dispatch({ type: "start" });
  assert.deepEqual(result, { ok: false, reason: "source_required" });
  assert.strictEqual(controller.getSnapshot(), before);
});

test("lifecycle projection derives one legacy snapshot from controller truth", () => {
  const controller = api.createController();
  controller.dispatch({ type: "select_source", source: SOURCE });
  controller.dispatch({ type: "request_consent", preflight: { packs: 3 } });

  const projected = api.projectLifecycle(controller.getSnapshot());
  assert.equal(projected.status, "consent_required");
  assert.equal(projected.source_selection.source_path, SOURCE.path);
  assert.equal(projected.golden_wiki.status, "consent_required");
  assert.equal(projected.golden_wiki.result.packs, 3);
});

test("every Prodigy Wiki product state derives one canonical primary action", () => {
  const cases = [
    [{ status: "idle", picker_open: false }, "select_source"],
    [{ status: "source_selected", source: SOURCE }, "request_consent"],
    [{ status: "range_required", source: SOURCE }, "select_range"],
    [{ status: "consent_required", source: SOURCE }, "start_run"],
    [{ status: "running", source: SOURCE }, null],
    [{ status: "review_ready", source: SOURCE }, "open_review"],
    [{ status: "interrupted", source: SOURCE, resumable: true }, "resume"],
    [{ status: "source_changed", source: SOURCE }, "reset_source"],
  ];
  for (const [snapshot, primaryAction] of cases) {
    const model = api.deriveViewModel(snapshot);
    assert.equal(model.product_id, "prodigy-wiki");
    assert.equal(model.primary_action, primaryAction, snapshot.status);
    assert.equal(model.state, snapshot.status);
  }
});

test("controller restores only an explicit durable operation snapshot", () => {
  const controller = api.createController();
  const restored = controller.dispatch({
    type: "restore",
    snapshot: {
      status: "interrupted",
      source: SOURCE,
      range: { range_id: "range_1", scope_id: "range_1", title: "첫 장", start: 0, end: 120 },
      reason: "app_reloaded_during_run",
      resumable: true,
      operation_id: "a".repeat(64),
    },
  });
  assert.equal(restored.ok, true);
  assert.equal(controller.getSnapshot().status, "interrupted");
  assert.equal(api.deriveViewModel(controller.getSnapshot()).primary_action, "resume");
});
