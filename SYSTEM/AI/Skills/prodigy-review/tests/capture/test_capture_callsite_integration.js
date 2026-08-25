"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ROOT = path.resolve(__dirname, "../../../../../..");
const load = (rel) => require(path.join(ROOT, rel));
class FakeEvent { constructor(type) { this.type = type; this.isTrusted = true; this.timeStamp = Date.now(); } }
const listeners = new Map();
global.Event = FakeEvent;
global.document = { addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); } };
function human(runtime, action, session) { listeners.get("click")(new FakeEvent("click")); return runtime.humanConfirmation(action, session); }

async function main() {
  const runtime = load("SYSTEM/Views/capture-action-runtime.js");
  const captureOwner = runtime.mountTrustedInteractions({ root: global.document, document: global.document, scope: { track() {} }, session_id: "capture-callsite-test" });
  const contract = load("SYSTEM/Views/capture-state-contract.js");
  const writer = load("SYSTEM/Views/capture-authorized-writer.js");
  const peopleCore = load("SYSTEM/Views/people-core.js");
  const people = load("SYSTEM/Views/people-store.js");
  const workoutCapture = load("SYSTEM/Views/workout-capture-writer.js");
  const workoutObjects = load("SYSTEM/Views/workout-program-objects.js");
  const manifest = load("SYSTEM/Views/prodigy-workspace-manifest.js");

  assert.equal(typeof runtime.prepareProposal, "function");
  assert.equal(runtime.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(typeof runtime.executeHumanConfirmed, "function");
  assert.equal(typeof writer.assertCanonicalWriteRequest, "function");
  assert.equal(typeof people.preparePeopleCreation, "function");
  assert.equal(typeof people.createPeopleWithCapture, "function");
  assert.equal(typeof workoutCapture.saveProgram, "function");
  assert.equal(typeof workoutCapture.importRunning, "function");
  assert.equal(typeof workoutCapture.importNutrition, "function");

  const requiredOrder = (workspace) => {
    const files = manifest.get(workspace).required;
    const state = files.indexOf("SYSTEM/Views/capture-state-contract.js");
    const writerIndex = files.indexOf("SYSTEM/Views/capture-authorized-writer.js");
    const runtimeIndex = files.indexOf("SYSTEM/Views/capture-action-runtime.js");
    assert.ok(state >= 0 && state < writerIndex && writerIndex < runtimeIndex, `${workspace} Capture dependency order`);
    return runtimeIndex;
  };
  const homeManifest = manifest.get("home");
  assert.ok(requiredOrder("home") < homeManifest.required.indexOf("SYSTEM/Views/quick-capture-view.js"));
  assert.equal(homeManifest.required.includes("SYSTEM/Views/object-creator-view.js"), false, "deferred Home creator does not block mount");
  assert.equal(homeManifest.optional.includes("SYSTEM/Views/object-creator-view.js"), true, "deferred Home creator remains loader-owned");
  assert.ok(requiredOrder("personal") < manifest.get("personal").required.indexOf("SYSTEM/Views/people-view.js"));
  assert.ok(requiredOrder("workout") < manifest.get("workout").required.indexOf("SYSTEM/Views/workout-capture-writer.js"));
  assert.ok(requiredOrder("journal") < manifest.get("journal").required.indexOf("SYSTEM/Views/daily-reflection-post-save.js"));

  const files = new Map();
  const writes = [];
  const app = {
    vault: {
      getAbstractFileByPath: (p) => files.has(p) ? { path: p } : null,
      getFiles: () => [...files.keys()].filter((p) => p.endsWith(".md")).map((p) => ({ path: p })),
      read: async (file) => files.get(file.path || file) || "",
      createFolder: async () => {},
      create: async (p, body) => { writes.push({ p, body }); files.set(p, body); return { path: p }; }
    }
  };

  await assert.rejects(() => people.createPeople(app, "홍길동"), /Capture writer authority/i);
  assert.equal(writes.length, 0, "People direct bypass writes zero");

  const peopleReviewResult = await people.createPeopleWithCapture(app, "홍길동", human(runtime, "people-create", "people-session"));
  assert.equal(peopleReviewResult.capture.record.state, "human_review");
  assert.equal(writes.length, 0, "first People event writes zero");
  const created = await people.createPeopleWithCapture(app, "홍길동", human(runtime, "people-create", "people-session"), peopleReviewResult.capture.record);
  assert.equal(created.path, "PARA/RESOURCES/CONTACTS/홍길동.md");
  assert.equal(writes.length, 1, "confirmed People action writes once");
  assert.equal(created.capture.receipt.payload, undefined);
  assert.equal(created.capture.receipt.rollback_identity.before_revision, "absent");

  let peopleTargetReads = 0; let peopleRaceWrites = 0;
  const peopleRaceApp = { vault: {
    getAbstractFileByPath: (target) => {
      if (target === peopleCore.TEMPLATE_PATH) return { path: target };
      peopleTargetReads += 1;
      return peopleTargetReads >= 4 ? { path: target } : null;
    },
    getFiles: () => [],
    read: async (file) => file.path === peopleCore.TEMPLATE_PATH ? "---\ntype: people\n---\n# {{name}}\n" : "raced",
    createFolder: async () => {},
    create: async () => { peopleRaceWrites += 1; }
  } };
  const peopleRaceReview = await people.createPeopleWithCapture(peopleRaceApp, "경합 사람", human(runtime, "people-create", "people-race-session"));
  await assert.rejects(
    () => people.createPeopleWithCapture(peopleRaceApp, "경합 사람", human(runtime, "people-create", "people-race-session"), peopleRaceReview.capture.record),
    /stopped: (conflict|stale)/i
  );
  assert.equal(peopleRaceWrites, 0, "People mutation-boundary collision writes zero notes");

  let directProgramWrites = 0; let directProgramFolders = 0;
  await assert.rejects(() => workoutObjects.saveProgramObject({ vault: {
    getAbstractFileByPath: () => null,
    createFolder: async () => { directProgramFolders += 1; },
    create: async () => { directProgramWrites += 1; }
  } }, { id: "direct_program", title: "Direct Program", goal: "strength", weeks: 1, days: [{ id: "d1", week: 1, day: 1, label: "Day 1", exercises: [{ id: "e1", name: "Squat", prescribed_sets: [{ reps: "5", rpe: "7", rest: "90" }] }] }] }), /Capture writer authority/i);
  assert.equal(directProgramWrites, 0, "direct program creation performs zero mutations");
  assert.equal(directProgramFolders, 0, "direct program creation cannot mutate folders before authority");

  let programWrites = 0;
  let derivedProgramWrites = 0;
  const programFiles = new Map();
  const programApp = { vault: {
    getAbstractFileByPath: (p) => programFiles.has(p) ? { path: p } : null,
    read: async (file) => programFiles.get(file.path || file) || ""
  } };
  const programObjects = {
    PROGRAM_FOLDER: "PARA/RESOURCES/WORKOUT/PROGRAMS",
    safeName: (value) => value,
    saveProgramObject: async (_app, value, options) => {
      const target = `PARA/RESOURCES/WORKOUT/PROGRAMS/${value.title}.md`;
      const current = programFiles.has(target) ? runtime.sha256(programFiles.get(target)) : null;
      writer.assertCanonicalWriteRequest(options && options.captureRequest, current);
      programWrites += 1;
      programFiles.set(target, JSON.stringify(value));
      return Object.assign({}, value, { source_path: target });
    }
  };
  const programStore = { saveProgram: async () => { derivedProgramWrites += 1; } };
  const program = { id: "program_capture", title: "Capture Program", goal: "strength", weeks: 1, days: [{ id: "d1", week: 1, day: 1, label: "Day 1", exercises: [] }] };
  const programReview = await workoutCapture.saveProgram(programApp, programStore, programObjects, program, human(runtime, "workout-program-save", "program-session"));
  assert.equal(programWrites, 0);
  const programResult = await workoutCapture.saveProgram(programApp, programStore, programObjects, program, human(runtime, "workout-program-save", "program-session"), { review: programReview.capture.record });
  assert.equal(programResult.capture.record.state, "object_committed");
  assert.equal(programWrites, 1, "one confirmed program action invokes one canonical object writer");
  assert.equal(derivedProgramWrites, 1, "existing derived storage remains synchronized");

  let conflictReads = 0;
  let conflictWrites = 0;
  const conflictApp = { vault: {
    getAbstractFileByPath: () => { conflictReads += 1; return conflictReads > 1 ? { path: "PARA/RESOURCES/WORKOUT/PROGRAMS/Conflict.md" } : null; },
    read: async () => "changed-after-review"
  } };
  const conflictObjects = Object.assign({}, programObjects, { saveProgramObject: async (_app, _value, options) => { writer.assertCanonicalWriteRequest(options && options.captureRequest, "changed"); conflictWrites += 1; } });
  const conflicting = { id: "program_conflict", title: "Conflict", goal: "strength", weeks: 1, days: [{ id: "d1", week: 1, day: 1, label: "Day 1", exercises: [] }] };
  const conflictReview = await workoutCapture.saveProgram(conflictApp, { saveProgram: async () => {} }, conflictObjects, conflicting, human(runtime, "workout-program-save", "program-conflict-session"));
  const conflictProgram = await workoutCapture.saveProgram(conflictApp, { saveProgram: async () => {} }, conflictObjects, conflicting, human(runtime, "workout-program-save", "program-conflict-session"), { review: conflictReview.capture.record });
  assert.equal(conflictProgram.capture.record.state, "stale");
  assert.equal(conflictWrites, 0, "stale real program adapter writes zero");

  const running = load("SYSTEM/Views/workout-running-core.js");
  const projection = load("SYSTEM/Views/workout-running-projection.js");
  const nutrition = load("SYSTEM/Views/workout-nutrition-core.js");
  const healthData = new Map();
  let healthPhysicalWrites = 0;
  const healthStore = {
    basePath: "SYSTEM/AI/Memory/workout/health",
    read: async (kind, id) => healthData.get(`${kind}:${id}`) || null,
    list: async (kind) => [...healthData.entries()].filter(([key]) => key.startsWith(`${kind}:`)).map(([, value]) => value),
    save: async (kind, id, value) => { healthPhysicalWrites += 1; healthData.set(`${kind}:${id}`, value); return value; },
    remove: async (kind, id) => { healthData.delete(`${kind}:${id}`); },
    upsertImported: async (kind, entries) => {
      const results = [];
      for (const entry of entries) { await healthStore.save(kind, entry.entry_id, entry); results.push({ created: true, id: entry.entry_id }); }
      return results;
    }
  };
  const runActivity = running.normalizeActivity({ activity_id: "run_capture", start_time: "2026-08-10T07:00:00+09:00", distance_m: 5000, elapsed_s: 1800, source: "manual" });
  const runReceipt = running.buildRunImportReceipt({ import_id: "runimport_capture", imported_at: "2026-08-10T12:07:00.000Z" });
  const runningReview = await workoutCapture.importRunning(healthStore, projection, running, [runActivity], runReceipt, human(runtime, "workout-running-import", "running-session"));
  assert.equal(healthPhysicalWrites, 0);
  const runningResult = await workoutCapture.importRunning(healthStore, projection, running, [runActivity], runReceipt, human(runtime, "workout-running-import", "running-session"), runningReview.capture.record);
  assert.equal(runningResult.capture.record.state, "object_committed");
  assert.equal(runningResult.result.saved.length, 1);
  assert.equal(healthPhysicalWrites, 2, "running canonical adapter preserves activity + receipt storage format");

  const food = nutrition.normalizeEntry({ entry_id: "nutrition_capture", date: "2026-08-10", meal: "lunch", name: "김밥", calories_kcal: 500, source: "fatsecret", source_key: "capture-food" });
  const nutritionReceipt = nutrition.buildImportReceipt({ import_id: "import_capture", imported_at: "2026-08-10T12:08:00.000Z" });
  const nutritionReview = await workoutCapture.importNutrition(healthStore, nutrition, [food], [], nutritionReceipt, human(runtime, "workout-nutrition-import", "nutrition-session"));
  assert.equal(healthPhysicalWrites, 2);
  const nutritionResult = await workoutCapture.importNutrition(healthStore, nutrition, [food], [], nutritionReceipt, human(runtime, "workout-nutrition-import", "nutrition-session"), nutritionReview.capture.record);
  assert.equal(nutritionResult.capture.record.state, "object_committed");
  assert.equal(healthPhysicalWrites, 4, "nutrition canonical adapter preserves entry + receipt storage format");

  const rejected = await runtime.prepareProposal({
    action_id: "reject-driver", operation: "create", target_path: "ZETA/FLEETING/reject.md",
    payload: { title: "reject" }, source_id: "test", locator: "test:reject",
    readRevision: async () => null, now: "2026-08-10T12:10:00.000Z"
  });
  const rejectedRecord = contract.systemTransition(rejected, { type: "cancel", occurred_at: new Date().toISOString(), reason: "fixture rejection" });
  let rejectedWrites = 0;
  await assert.rejects(() => writer.writeAuthorizedCapture(rejectedRecord, { readRevision: async () => null, writeCanonical: async () => { rejectedWrites += 1; } }), /human_confirmed authority/i);
  assert.equal(rejectedWrites, 0);


  captureOwner.dispose();
  console.log("Capture callsite integration tests passed: reject=0, stale program=0, people/program/running/nutrition=1 canonical action each.");
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
