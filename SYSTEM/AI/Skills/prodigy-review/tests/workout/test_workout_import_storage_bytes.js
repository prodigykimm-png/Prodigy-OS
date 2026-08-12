"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

class TrustedEvent {
  constructor() { this.type = "click"; this.isTrusted = true; this.timeStamp = Date.now(); }
}
let trustedClick;
global.Event = TrustedEvent;
global.document = { addEventListener(type, listener) { if (type === "click") trustedClick = listener; }, removeEventListener(type, listener) { if (type === "click" && trustedClick === listener) trustedClick = null; } };

const ROOT = path.resolve(__dirname, "../../../../../..");
const load = (name) => require(path.join(ROOT, `SYSTEM/Views/${name}.js`));
const healthApi = load("workout-health-store");
const workoutStoreApi = load("workout-store");
const authority = load("capture-authorized-writer");
const running = load("workout-running-core");
const projection = load("workout-running-projection");
const nutrition = load("workout-nutrition-core");
const writer = load("workout-capture-writer");
const runtime = load("capture-action-runtime");
runtime.mountTrustedInteractions({ root: global.document, document: global.document, scope: { track() {} }, session_id: "workout-import-test" });

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const RUN_ACTIVITY_SHA256 = "6d5cf4e648f1810625d0211c47c95731c862c3cabea04e28e366acdb95122ba4";
const RUN_RECEIPT_SHA256 = "48ce8a6531705d891766cac5902d4b0b16d9e6d0c7f94f00a58203d1fc240252";
const NUTRITION_ENTRY_SHA256 = "37ab83602c1a8bc3502864a53e911cd1d885c9ad4f87198c3f2e0e8d507a630a";
const NUTRITION_RECEIPT_SHA256 = "5c5ac77af20d88abadda8dedc407b1da28bac1be38051ba1eeaab5fb765e0ec9";

const RUN_ACTIVITY_BYTES = `{
  "schema_version": "prodigy-run-activity-v1",
  "activity_id": "run_tjjks0_e1500_d5000",
  "start_time": "2026-08-10T07:00:00.000Z",
  "timezone_offset": "",
  "distance_m": 5000,
  "elapsed_s": 1500,
  "moving_s": 1440,
  "pace_s_per_km": 288,
  "elevation_gain_m": 25,
  "avg_hr": 151,
  "max_hr": 171,
  "cadence": 174,
  "calories_kcal": 390,
  "rpe": 7,
  "notes": "synthetic",
  "source": "fit",
  "source_key": "fit:synthetic",
  "import_id": "run_import_fixture",
  "data_quality": "full",
  "splits": [],
  "created_at": "2026-08-10T07:25:00.000Z",
  "updated_at": "2026-08-10T07:25:00.000Z",
  "canonical_key": "run_tjjks0_e1500_d5000",
  "_source_refs": [
    {
      "source": "fit",
      "source_key": "fit:synthetic"
    }
  ]
}
`;
const RUN_RECEIPT_BYTES = `{
  "schema_version": "prodigy-run-import-v1",
  "import_id": "run_import_fixture",
  "source": "file",
  "file_basename": "synthetic.fit",
  "file_sha256": "1111111111111111111111111111111111111111111111111111111111111111",
  "format": "fit",
  "imported_at": "2026-08-10T08:00:00.000Z",
  "activity_count": 1,
  "created_count": 1,
  "updated_count": 0,
  "warning_count": 0
}
`;
const NUTRITION_ENTRY_BYTES = `{
  "schema_version": "prodigy-nutrition-entry-v1",
  "entry_id": "nutrition_fixture",
  "date": "2026-08-10",
  "meal": "lunch",
  "name": "Synthetic Bowl",
  "serving": "1 bowl",
  "quantity": 1,
  "calories_kcal": 500,
  "protein_g": 35,
  "carbs_g": 55,
  "fat_g": 15,
  "source": "fatsecret",
  "source_key": "fatsecret:synthetic",
  "import_id": "nutrition_import_fixture",
  "notes": "synthetic",
  "created_at": "2026-08-10T12:00:00.000Z",
  "updated_at": "2026-08-10T12:00:00.000Z"
}
`;
const NUTRITION_RECEIPT_BYTES = `{
  "schema_version": "prodigy-nutrition-import-v1",
  "import_id": "nutrition_import_fixture",
  "source": "fatsecret",
  "file_basename": "synthetic.csv",
  "file_sha256": "2222222222222222222222222222222222222222222222222222222222222222",
  "imported_at": "2026-08-10T12:30:00.000Z",
  "entry_count": 1,
  "created_count": 1,
  "updated_count": 0,
  "warning_count": 1
}
`;

function memoryAdapter(failAt = 0) {
  const files = new Map();
  const folders = new Set();
  const mutations = [];
  let writes = 0;
  return {
    files, mutations,
    adapter: {
      preferDirectWrite: true,
      exists: async (target) => files.has(target) || folders.has(target),
      read: async (target) => files.get(target),
      write: async (target, bytes) => { mutations.push({ kind: "write", target }); writes += 1; if (failAt && writes === failAt) throw new Error(`injected write ${failAt}`); files.set(target, bytes); },
      mkdir: async (target) => { folders.add(target); },
      remove: async (target) => { mutations.push({ kind: "remove", target }); files.delete(target); folders.delete(target); },
    },
    disableFailure() { failAt = 0; },
  };
}

function fileManifest(files) { return [...files.entries()].sort(([left], [right]) => left.localeCompare(right)); }

function confirmation(action, session) {
  assert.equal(typeof trustedClick, "function", "Capture runtime subscribed before the trusted event");
  trustedClick(new TrustedEvent());
  return runtime.humanConfirmation(action, session);
}

function assertPayloadFree(receipt) {
  const forbidden = new Set(["payload", "raw", "raw_content", "activities", "entries"]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `receipt leaked ${key}`);
      visit(child);
    }
  };
  visit(receipt);
}

function runFixture() {
  return running.normalizeActivity({
    activity_id: "source-run", start_time: "2026-08-10T07:00:00.000Z",
    distance_m: 5000, elapsed_s: 1500, moving_s: 1440, elevation_gain_m: 25,
    avg_hr: 151, max_hr: 171, cadence: 174, calories_kcal: 390, rpe: 7,
    notes: "synthetic", source: "fit", source_key: "fit:synthetic",
    import_id: "run_import_fixture", data_quality: "full", splits: [],
    created_at: "2026-08-10T07:25:00.000Z", updated_at: "2026-08-10T07:25:00.000Z",
  });
}
function runReceiptFixture() {
  return running.buildRunImportReceipt({
    import_id: "run_import_fixture", source: "file", file_basename: "synthetic.fit",
    file_sha256: "1".repeat(64), format: "fit", imported_at: "2026-08-10T08:00:00.000Z",
  });
}
function nutritionFixture() {
  return nutrition.normalizeEntry({
    entry_id: "nutrition_fixture", date: "2026-08-10", meal: "lunch", name: "Synthetic Bowl",
    serving: "1 bowl", quantity: 1, calories_kcal: 500, protein_g: 35, carbs_g: 55, fat_g: 15,
    source: "fatsecret", source_key: "fatsecret:synthetic", import_id: "nutrition_import_fixture",
    notes: "synthetic", created_at: "2026-08-10T12:00:00.000Z", updated_at: "2026-08-10T12:00:00.000Z",
  });
}
function nutritionReceiptFixture() {
  return nutrition.buildImportReceipt({
    import_id: "nutrition_import_fixture", file_basename: "synthetic.csv",
    file_sha256: "2".repeat(64), imported_at: "2026-08-10T12:30:00.000Z",
  });
}

async function confirmedRunning(store, projectionApi, session) {
  const first = await writer.importRunning(store, projectionApi, running, [runFixture()], runReceiptFixture(), confirmation("workout-running-import", session));
  assert.equal(first.capture.record.state, "human_review");
  return writer.importRunning(store, projectionApi, running, [runFixture()], runReceiptFixture(), confirmation("workout-running-import", session), first.capture.record);
}
async function confirmedNutrition(store, session, warnings = []) {
  const first = await writer.importNutrition(store, nutrition, [nutritionFixture()], warnings, nutritionReceiptFixture(), confirmation("workout-nutrition-import", session));
  assert.equal(first.capture.record.state, "human_review");
  return writer.importNutrition(store, nutrition, [nutritionFixture()], warnings, nutritionReceiptFixture(), confirmation("workout-nutrition-import", session), first.capture.record);
}

function assertFrozenBytes(actual, expected, expectedHash) {
  assert.equal(runtime.sha256(""), EMPTY_SHA256, "absent pre-import bytes have the frozen empty SHA-256");
  assert.equal(actual, expected, "canonical bytes, key order, indentation, and final newline are frozen");
  assert.equal(runtime.sha256(actual), expectedHash);
}

test("confirmed running import writes the frozen canonical object and payload-free receipt exactly once", async () => {
  const memory = memoryAdapter();
  const store = healthApi.createHealthStore(memory.adapter, "fixture/run");
  const output = await confirmedRunning(store, projection, "run-byte-fixture");
  assert.deepEqual(output.result.saved, [{ created: true, updated: false, duplicate: false, id: "run_tjjks0_e1500_d5000" }]);
  assertFrozenBytes(memory.files.get("fixture/run/run-activities/run_tjjks0_e1500_d5000.json"), RUN_ACTIVITY_BYTES, RUN_ACTIVITY_SHA256);
  assertFrozenBytes(memory.files.get("fixture/run/run-imports/run_import_fixture.json"), RUN_RECEIPT_BYTES, RUN_RECEIPT_SHA256);
  assertPayloadFree(output.result.receipt);
  assertPayloadFree(output.capture.receipt);
  assert.equal(memory.mutations.filter((item) => item.target.includes("run-activities/")).length, 1);
  assert.equal(memory.mutations.filter((item) => item.target.includes("run-imports/")).length, 1);
});

test("confirmed nutrition import writes the frozen canonical object and payload-free receipt exactly once", async () => {
  const memory = memoryAdapter();
  const store = healthApi.createHealthStore(memory.adapter, "fixture/nutrition");
  const output = await confirmedNutrition(store, "nutrition-byte-fixture", ["synthetic warning"]);
  assert.deepEqual(output.result.saved, [{ created: true, id: "nutrition_fixture" }]);
  assertFrozenBytes(memory.files.get("fixture/nutrition/nutrition-entries/nutrition_fixture.json"), NUTRITION_ENTRY_BYTES, NUTRITION_ENTRY_SHA256);
  assertFrozenBytes(memory.files.get("fixture/nutrition/nutrition-imports/nutrition_import_fixture.json"), NUTRITION_RECEIPT_BYTES, NUTRITION_RECEIPT_SHA256);
  assertPayloadFree(output.result.receipt);
  assertPayloadFree(output.capture.receipt);
  assert.equal(memory.mutations.filter((item) => item.target.includes("nutrition-entries/")).length, 1);
  assert.equal(memory.mutations.filter((item) => item.target.includes("nutrition-imports/")).length, 1);
});

test("program save rolls back canonical Markdown and derived storage after every intermediate write", async () => {
  for (const failPoint of ["canonical", "derived-object", "derived-index"]) {
    const memory = memoryAdapter(failPoint === "derived-object" ? 1 : failPoint === "derived-index" ? 2 : 0);
    const store = workoutStoreApi.createWorkoutStore(memory.adapter, `fixture/program-${failPoint}`);
    const vaultFiles = new Map(); let canonicalFailure = failPoint === "canonical";
    const target = "PARA/RESOURCES/WORKOUT/PROGRAMS/Transactional Program.md";
    const app = { vault: {
      getAbstractFileByPath: (value) => vaultFiles.has(value) ? { path: value } : null,
      read: async (file) => vaultFiles.get(file.path),
      create: async (value, bytes) => { vaultFiles.set(value, bytes); return { path: value }; },
      modify: async (file, bytes) => { vaultFiles.set(file.path, bytes); },
      delete: async (file) => { vaultFiles.delete(file.path); },
    } };
    const objects = {
      PROGRAM_FOLDER: "PARA/RESOURCES/WORKOUT/PROGRAMS", safeName: (value) => value,
      saveProgramObject: async (_app, value, options) => {
        const current = vaultFiles.has(target) ? runtime.sha256(vaultFiles.get(target)) : null;
        authority.assertCanonicalWriteRequest(options.captureRequest, current);
        vaultFiles.set(target, `${JSON.stringify(value)}\n`);
        if (canonicalFailure) throw new Error("injected canonical post-write failure");
        return { ...value, source_path: target };
      },
    };
    const program = { id: "transactional_program", title: "Transactional Program", goal: "strength", weeks: 1, days: [{ id: "d1", week: 1, day: 1, label: "Day 1", exercises: [] }] };
    const invoke = async (session) => {
      const first = await writer.saveProgram(app, store, objects, program, confirmation("workout-program-save", session));
      return writer.saveProgram(app, store, objects, program, confirmation("workout-program-save", session), { review: first.capture.record });
    };
    await assert.rejects(() => invoke(`program-failure-${failPoint}`), /injected/);
    assert.deepEqual([...vaultFiles], [], `${failPoint}: canonical preimage restored`);
    assert.deepEqual(fileManifest(memory.files), [], `${failPoint}: derived preimage restored`);
    canonicalFailure = false; memory.disableFailure();
    const retried = await invoke(`program-retry-${failPoint}`);
    assert.equal(retried.capture.record.state, "object_committed");
    assert.deepEqual([...vaultFiles.keys()], [target]);
    assert.equal(memory.files.size, 2, `${failPoint}: one program and one index`);
  }
});

test("running and nutrition imports rollback every intermediate write and retry to the exact authorized delta", async () => {
  for (const kind of ["running", "nutrition"]) for (const failAt of [1, 2, 3, 4]) {
    const memory = memoryAdapter(failAt);
    const store = healthApi.createHealthStore(memory.adapter, `fixture/transaction-${kind}-${failAt}`);
    const before = fileManifest(memory.files);
    const invoke = () => kind === "running"
      ? confirmedRunning(store, projection, `transaction-${kind}-${failAt}`)
      : confirmedNutrition(store, `transaction-${kind}-${failAt}`);
    await assert.rejects(invoke, new RegExp(`injected write ${failAt}`));
    assert.deepEqual(fileManifest(memory.files), before, `${kind}/${failAt}: exact preimage restored`);
    assert.equal([...memory.files.keys()].some((target) => /\.(?:tmp|backup|partial)$/u.test(target)), false);
    memory.disableFailure();
    const retried = await invoke();
    assert.equal(retried.capture.record.state, "object_committed");
    assert.equal(memory.files.size, 3, `${kind}/${failAt}: object, receipt, and one index only`);
  }
});

test("rejected or forged confirmation performs no running or nutrition mutation", async () => {
  for (const kind of ["running", "nutrition"]) {
    const memory = memoryAdapter();
    const store = healthApi.createHealthStore(memory.adapter, `fixture/reject-${kind}`);
    const invoke = kind === "running"
      ? () => writer.importRunning(store, projection, running, [runFixture()], runReceiptFixture(), {})
      : () => writer.importNutrition(store, nutrition, [nutritionFixture()], [], nutritionReceiptFixture(), {});
    await assert.rejects(invoke, /trusted UI intent|forged|confirmation|mount owner/i);
    assert.equal(memory.mutations.length, 0, `${kind} rejection writes zero bytes`);
  }
});

test("stale running and nutrition proposals perform no mutation", async () => {
  for (const kind of ["running", "nutrition"]) {
    let reads = 0;
    let saves = 0;
    const store = {
      basePath: `fixture/stale-${kind}`,
      read: async () => (++reads === 1 ? null : { changed: true }),
      save: async () => { saves += 1; },
      upsertImported: async () => { saves += 1; return []; },
    };
    const projectionSpy = { saveActivities: async () => { saves += 1; return []; } };
    const output = kind === "running"
      ? await confirmedRunning(store, projectionSpy, `stale-${kind}`)
      : await confirmedNutrition(store, `stale-${kind}`);
    assert.equal(output.result, null);
    assert.equal(output.capture.record.state, "stale");
    assert.equal(saves, 0, `${kind} stale proposal writes zero objects or receipts`);
  }
});

test("Capture conflict detection rejects the reviewed Workout import before any canonical write", async () => {
  let writes = 0;
  const target = "fixture/conflict/run-imports/run_import_fixture.json";
  const proposal = await runtime.prepareHumanReview({
    action_id: "workout-running-import",
    operation: "create",
    target_path: target,
    payload: { activities: [runFixture()], receipt_input: runReceiptFixture() },
    source_id: "workout-running-preview",
    locator: "WorkoutRunningImport:explicit-confirm",
    readRevision: async () => null,
  }, confirmation("workout-running-import", "conflict-byte-fixture"));
  const intent = confirmation("workout-running-import", "conflict-byte-fixture");
  const capability = runtime.bindTrustedConfirmation(intent, proposal, {
    action_id: "workout-running-import", session_id: "conflict-byte-fixture",
  });
  const output = await runtime.executeHumanConfirmed({
    proposal, human: capability, action_id: "workout-running-import", session_id: "conflict-byte-fixture",
  }, {
    readRevision: async () => null,
    detectConflict: async () => ({ conflict: true, reason: "synthetic concurrent import" }),
    writeCanonical: async () => { writes += 1; return { path: target, revision: "3".repeat(64) }; },
    readCanonical: async () => null,
  });
  assert.equal(output.record.state, "conflict");
  assert.equal(output.receipt, null);
  assert.equal(writes, 0);
});
