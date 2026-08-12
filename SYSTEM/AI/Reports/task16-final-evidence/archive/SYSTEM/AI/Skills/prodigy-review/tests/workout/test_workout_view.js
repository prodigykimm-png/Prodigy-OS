"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
const importer = require(path.join(ROOT, "SYSTEM/Views/workout-import.js"));
const objects = require(path.join(ROOT, "SYSTEM/Views/workout-program-objects.js"));
const modals = require(path.join(ROOT, "SYSTEM/Views/workout-modals.js"));
const flow = require(path.join(ROOT, "SYSTEM/Views/workout-session-flow.js"));

class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.text = ""; this.value = ""; this.files = []; this.checked = false; this.disabled = false; this.attr = {}; }
  createEl(tag, options = {}) { const child = new Element(tag); child.text = options.text || ""; child.value = options.value || ""; child.attr = options.attr || {}; this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; }
  addClass() {}
}

class Modal {
  constructor(app) { this.app = app; this.contentEl = new Element(); Modal.instances.push(this); }
  open() { this.opened = true; if (this.onOpen) this.onOpen(); }
  close() { this.closed = true; }
}
Modal.instances = [];

function textOf(element) { return [element.text, ...element.children.flatMap(textOf)].filter(Boolean).join(" "); }
function findText(element, label) { if (element.text === label) return element; for (const child of element.children) { const found = findText(child, label); if (found) return found; } return null; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function fakeApp() {
  const files = new Map();
  const folders = new Set();
  const adapter = {
    exists: async (target) => files.has(target) || folders.has(target),
    read: async (target) => files.get(target),
    write: async (target, value) => files.set(target, value),
    mkdir: async (target) => folders.add(target),
    remove: async (target) => { files.delete(target); folders.delete(target); },
    rename: async (from, to) => { const value = files.get(from); files.delete(from); files.set(to, value); },
  };
  return { app: { vault: { adapter } }, files };
}

function sampleProgram() {
  return core.normalizeProgram({
    id: "mobile-program", title: "모바일 근비대", source: "fixture.xlsx",
    days: [{ id: "w1d1", week: 1, day: 1, exercises: [{ id: "squat", name: "스미스 머신 스쿼트", prescribed_sets: [{ reps: "8~12", rpe: "7" }] }] }],
  });
}

async function testWeekdayAssignmentRoundTrip() {
  // Given: a persisted Program, completed session, and immutable run snapshot.
  const fixture = fakeApp();
  const store = storeApi.createWorkoutStore(storeApi.createObsidianAdapter(fixture.app));
  const program = sampleProgram();
  const run = core.createProgramRun(program, [], { run_id: "run-schedule-proof", started_at: "2026-07-30T01:00:00Z" });
  const draft = core.createWorkoutSession(program, run, "w1d1", { session_id: "completed-schedule-proof" });
  const completed = core.completeWorkoutSession(draft, program, run, [], "2026-07-30T02:00:00Z").session;
  await store.saveProgram(program);
  await store.saveRun(run);
  await store.saveSession(completed);
  const completedBefore = hash(await store.readSession(completed.session_id));
  const snapshotBefore = hash((await store.readRun(run.run_id)).program_snapshot);

  // When: the existing week/day fields are reassigned, saved, and reloaded.
  const assigned = flow.assignProgramDay(program, "w1d1", 2, 3);
  const note = objects.renderProgramNote(assigned, "2026-07-30");
  const parsed = objects.parseProgramSection(note, { id: assigned.id, title: assigned.title });
  await store.saveProgram(parsed);
  const reloaded = await store.readProgram(program.id);
  const matches = flow.queryProgramDays(reloaded, 2, 3);

  // Then: Wednesday query round-trips and unrelated records remain byte-identical.
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "w1d1");
  assert.equal(flow.scheduleLabel(matches[0]), "2주차 수요일");
  const completedAfter = hash(await store.readSession(completed.session_id));
  const snapshotAfter = hash((await store.readRun(run.run_id)).program_snapshot);
  assert.equal(completedAfter, completedBefore);
  assert.equal(snapshotAfter, snapshotBefore);
  console.log(`COMPLETED-SESSION-HASH-BEFORE ${completedBefore}`);
  console.log(`COMPLETED-SESSION-HASH-AFTER ${completedAfter}`);
  console.log(`PROGRAM-SNAPSHOT-HASH-BEFORE ${snapshotBefore}`);
  console.log(`PROGRAM-SNAPSHOT-HASH-AFTER ${snapshotAfter}`);
}

async function testPersistedSessionSubstitution() {
  // Given: a prescribed Program session and a replacement from the exercise library.
  const fixture = fakeApp();
  const replacementFile = { path: `${objects.EXERCISE_FOLDER}/핵 스쿼트.md`, basename: "핵 스쿼트" };
  fixture.app.vault.getMarkdownFiles = () => [replacementFile];
  fixture.app.metadataCache = { getFileCache: () => ({ frontmatter: { type: "exercise", target: "legs" } }) };
  const store = storeApi.createWorkoutStore(storeApi.createObsidianAdapter(fixture.app));
  const program = sampleProgram();
  program.days[0].exercises[0].prescribed_sets[0].rest = "120초";
  const programBefore = hash(program);
  const run = core.createProgramRun(program, [], { run_id: "run-substitution-proof" });
  const session = core.createWorkoutSession(program, run, "w1d1", { session_id: "session-substitution-proof" });
  const prescriptionBefore = hash(session.exercise_results[0].prescribed_sets);
  const resultsBefore = hash(session.exercise_results[0].set_results);
  const replacement = objects.searchExercises(fixture.app, "핵 스쿼트", 10, {})[0];
  assert.equal(replacement.name, "핵 스쿼트");

  // When: the draft-only substitution is applied, recorded, saved, and reloaded.
  const proposal = modals.buildSubstitutionDraft(session, "squat", replacement);
  const applied = modals.applySubstitutionDraft(session, proposal);
  const recorded = flow.recordSubstitution(session, applied, "squat", "2026-07-30T03:00:00Z");
  await store.saveSession(recorded);
  const reloaded = await store.readSession(session.session_id);

  // Then: identity changes only in the session; prescription and Program stay immutable.
  assert.equal(reloaded.exercise_results[0].name, "핵 스쿼트");
  assert.equal(hash(reloaded.exercise_results[0].prescribed_sets), prescriptionBefore);
  assert.equal(hash(reloaded.exercise_results[0].set_results), resultsBefore);
  assert.equal(reloaded.exercise_results[0].prescribed_sets[0].reps, "8~12");
  assert.equal(reloaded.exercise_results[0].prescribed_sets[0].rpe, "7");
  assert.equal(reloaded.exercise_results[0].prescribed_sets[0].rest, "120초");
  assert.equal(hash(program), programBefore);
  assert.deepEqual(reloaded.exercise_substitutions[0].before, { name: "스미스 머신 스쿼트", target: "" });
  assert.deepEqual(reloaded.exercise_substitutions[0].after, { name: "핵 스쿼트", target: "legs" });
  assert.equal(flow.substitutionText(reloaded), "스미스 머신 스쿼트 → 핵 스쿼트");
  console.log(`SUBSTITUTION-PROGRAM-HASH-BEFORE ${programBefore}`);
  console.log(`SUBSTITUTION-PROGRAM-HASH-AFTER ${hash(program)}`);
}

async function testAllSessionKindsAndConflictRecovery() {
  // Given: one Program run whose bytes must only change for programmed completion.
  const fixture = fakeApp();
  const store = storeApi.createWorkoutStore(storeApi.createObsidianAdapter(fixture.app));
  const program = sampleProgram();
  const run = core.createProgramRun(program, [], { run_id: "run-kind-proof" });
  await store.saveRun(run);
  const runBeforeNonProgram = hash(await store.readRun(run.run_id));

  // When/Then: Program starts, reloads (resume), logs, and completes through the shared runner model.
  const programmed = core.createWorkoutSession(program, run, "w1d1", { session_id: "programmed-kind-proof" });
  await flow.resolveDraftConflict({ store, sessions: [] }, programmed, "start");
  const programmedReloaded = await store.readSession(programmed.session_id);
  const programmedLogged = core.updateSetResult(programmedReloaded, "squat", 0, { completed: true, weight: "90", reps: "10", rpe: "7" });
  const programmedResult = core.completeWorkoutSession(programmedLogged, program, run, [], "2026-07-30T04:00:00Z");
  await store.saveSession(programmedResult.session);
  await store.saveRun(programmedResult.run);
  assert.equal((await store.readSession(programmed.session_id)).status, "completed");

  // When/Then: free adds/reorders a library exercise, saves, reloads, logs, and completes without Program ids.
  const freeBase = core.createFreeWorkout({ session_id: "free-kind-proof", title: "QA-THROWAWAY-free-headless" });
  let free = flow.addFreeExercise(freeBase, { id: "row", name: "바벨 로우", target: "back" });
  free = flow.addFreeExercise(free, { id: "pulldown", name: "랫 풀다운", target: "back" });
  free = flow.moveFreeExercise(free, "pulldown", -1);
  free = flow.removeFreeExercise(free, "row");
  await flow.resolveDraftConflict({ store, sessions: [programmedResult.session] }, free, "start");
  const freeDraft = await store.readSession(free.session_id);
  const freeLogged = core.updateSetResult(freeDraft, "pulldown", 0, { completed: true, weight: "45", reps: "12", rpe: "8" });
  await store.saveSession(freeLogged);
  const freeReloaded = await store.readSession(free.session_id);
  const freeResult = core.completeWorkoutSession(freeReloaded, program, programmedResult.run, [], "2026-07-30T05:00:00Z");
  await store.saveSession(freeResult.session);
  assert.equal(freeResult.session.program_id, null);
  assert.equal(freeResult.session.program_run_id, null);
  assert.equal(freeResult.session.exercise_results[0].set_results[0].weight, "45");
  assert.equal(hash(await store.readRun(run.run_id)), hash(programmedResult.run));

  // When/Then: quick starts, reloads, and completes minimally without changing Program progress.
  const quick = core.createQuickWorkout({ session_id: "quick-kind-proof", title: "걷기", duration: "20:00" });
  await store.saveSession(quick);
  const quickReloaded = await store.readSession(quick.session_id);
  const quickResult = core.completeWorkoutSession(quickReloaded, program, programmedResult.run, [], "2026-07-30T06:00:00Z");
  await store.saveSession(quickResult.session);
  assert.equal(quickResult.session.status, "completed");
  assert.equal(hash(quickResult.run), hash(programmedResult.run));
  assert.notEqual(hash(programmedResult.run), runBeforeNonProgram, "programmed completion alone advances the run");
  assert.equal(flow.kindLabel(programmedResult.session), "프로그램");
  assert.equal(flow.kindLabel(freeResult.session), "자유운동");
  assert.equal(flow.kindLabel(quickResult.session), "빠른 기록");
  console.log(`RUN-HASH-AFTER-PROGRAMMED ${hash(programmedResult.run)}`);
  console.log(`RUN-HASH-AFTER-FREE ${hash(freeResult.run)}`);
  console.log(`RUN-HASH-AFTER-QUICK ${hash(quickResult.run)}`);

  // Given/When/Then: conflict cancel preserves both records; preserve/discard require explicit decisions.
  const active = { ...freeBase, session_id: "conflict-active", runner_active: true };
  const candidate = { ...freeBase, session_id: "conflict-candidate", runner_active: false };
  await store.saveSession(active);
  await store.saveSession(candidate);
  const activeBefore = hash(await store.readSession(active.session_id));
  const candidateBefore = hash(await store.readSession(candidate.session_id));
  const cancelled = await flow.resolveDraftConflict({ store, sessions: [active, candidate] }, candidate, "cancel");
  assert.equal(cancelled.action, "cancelled");
  assert.equal(hash(await store.readSession(active.session_id)), activeBefore);
  assert.equal(hash(await store.readSession(candidate.session_id)), candidateBefore);
  const preserved = await flow.resolveDraftConflict({ store, sessions: [active] }, candidate, "preserve");
  assert.equal(preserved.action, "started");
  assert.equal((await store.readSession(active.session_id)).runner_active, false);
  assert.equal((await store.readSession(candidate.session_id)).runner_active, true);
  const discardCandidate = { ...freeBase, session_id: "conflict-discard", runner_active: false };
  await flow.resolveDraftConflict({ store, sessions: [candidate] }, discardCandidate, "discard");
  assert.equal(await store.readSession(candidate.session_id), null);
  assert.equal((await store.readSession(discardCandidate.session_id)).runner_active, true);
}

async function main() {
  await testWeekdayAssignmentRoundTrip();
  await testPersistedSessionSubstitution();
  await testAllSessionKindsAndConflictRecovery();
  global.WorkoutCore = core;
  global.WorkoutStore = storeApi;
  global.WorkoutImport = importer;
  global.obsidian = { Modal, Notice: class {} };
  global.confirm = () => true;
  const modalsPath = path.join(ROOT, "SYSTEM/Views/workout-modals.js");
  delete require.cache[require.resolve(modalsPath)];
  global.WorkoutModals = require(modalsPath);
  delete global.WorkoutSessionUI;
  delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/workout-session-ui.js"))];
  delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/workout-view.js"))];
  const view = require(path.join(ROOT, "SYSTEM/Views/workout-view.js"));

  const freeFixture = fakeApp();
  const freeStore = storeApi.createWorkoutStore(storeApi.createObsidianAdapter(freeFixture.app));
  const freeDraft = flow.addFreeExercise(
    core.createFreeWorkout({ session_id: "free-render", title: "자유운동 렌더" }),
    { id: "row-render", name: "바벨 로우", target: "back" },
  );
  await freeStore.saveSession({ ...freeDraft, runner_active: true });
  const freeContainer = new Element();
  await view.renderDashboard(freeFixture.app, freeContainer);
  assert.match(textOf(freeContainer), /자유운동 · 자유운동 렌더/);
  assert.ok(findText(freeContainer, "운동 변경"));
  assert.ok(findText(freeContainer, "운동 추가"));
  assert.ok(findText(freeContainer, "운동 삭제"));

  const fixture = fakeApp();
  const container = new Element();

  const firstController = await view.renderDashboard(fixture.app, container);
  assert.equal(firstController.isActive(), true);
  assert.match(textOf(container), /진행 중인 프로그램이 없습니다/);
  assert.ok(findText(container, "프로그램 가져오기"));
  assert.ok(findText(container, "빠른 운동"));
  assert.match(textOf(container), /▶ 계속|계속/);
  const quickAction = findText(container, "빠른 기록");
  quickAction.onclick();
  const quickModal = Modal.instances.at(-1);
  assert.equal(quickModal.opened, true, "the rendered card opens the real quick-workout modal");
  quickModal.close();
  assert.equal(quickModal.closed, true, "the modal closes through its real lifecycle");

  const store = storeApi.createWorkoutStore(storeApi.createObsidianAdapter(fixture.app));
  const program = sampleProgram();
  await store.saveProgram(program);
  const secondController = await view.renderDashboard(fixture.app, container);
  assert.equal(firstController.isDisposed(), true, "refresh disposes the prior container-scoped controller");
  assert.equal(secondController.isActive(), true);
  assert.ok(
    findText(container, "주차·요일 배정"),
    "활성 run이 없어도 저장된 Program의 주차·요일 배정 화면에 도달해야 합니다.",
  );

  const run = core.createProgramRun(program, [], { run_id: "run-mobile" });
  const session = core.createWorkoutSession(program, run, "w1d1", { session_id: "session-mobile" });
  await store.saveRun(run); await store.saveSession(session);
  const historyProposal = modals.buildSubstitutionDraft(session, "squat", { name: "핵 스쿼트", target: "legs" });
  const historyApplied = modals.applySubstitutionDraft(session, historyProposal);
  const historySession = flow.recordSubstitution(session, historyApplied, "squat", "2026-07-30T07:00:00Z");
  historySession.session_id = "session-history-substitution";
  historySession.status = "completed";
  historySession.completed_at = "2026-07-30T08:00:00Z";
  await store.saveSession(historySession);
  const thirdController = await view.renderDashboard(fixture.app, container);
  assert.equal(secondController.isDisposed(), true);
  assert.equal(thirdController.isActive(), true, "open-close-open leaves only the current controller active");
  const rendered = textOf(container);
  assert.match(rendered, /모바일 근비대/);
  assert.match(rendered, /스미스 머신 스쿼트/);
  assert.match(rendered, /이전 기록 없음|이전 /);
  assert.match(rendered, /세트 추가|운동 완료/);
  assert.match(rendered, /이어서 기록|미완료/);
  assert.ok(findText(container, "운동 완료"));
  assert.ok(findText(container, "초안 버리기"));
  assert.match(rendered, /스미스 머신 스쿼트 → 핵 스쿼트/);
  const css = container.children.find((child) => child.tag === "style").text;
  assert.doesNotMatch(css, /@media\([^)]*(?:600|767)px/);
  assert.match(css, /min-block-size:var\(--ke-touch-target\)/);
  assert.match(css, /prodigy-workout-dashboard|workout-progress-track|workout-set-row/);
  // No generic table element styling (class names like .workout-split-table are fine)
  assert.equal(/(?:^|[,{\s])table(?:[,{\s:]|$)/.test(css), false, "no generic table element styling");
  assert.equal([...fixture.files.keys()].some((key) => key.endsWith(".md")), false);
  console.log("Workout Program Runner UI tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
