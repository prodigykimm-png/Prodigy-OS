"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));

class Element {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.children = [];
    this.parent = null;
    this.text = options.text || "";
    this.attr = Object.assign({}, options.attr || {});
    this.value = options.value || this.attr.value || "";
    this.checked = false;
    this.disabled = false;
    this.files = [];
  }
  createEl(tag, options = {}) { const child = new Element(tag, options); child.parent = this; this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; this.text = ""; }
  addClass(name) { this.attr.class = [this.attr.class, name].filter(Boolean).join(" "); }
  setAttribute(name, value) { this.attr[name] = String(value); if (name === "value") this.value = String(value); }
  setAttr(name, value) { this.setAttribute(name, value); }
  getAttribute(name) { return this.attr[name] || ""; }
  findAll(predicate) { return [this, ...this.children.flatMap((child) => child.findAll(predicate))].filter(predicate); }
  findText(text, tag) { return this.findAll((node) => node.text === text && (!tag || node.tag === tag))[0] || null; }
}

class Modal {
  constructor(app) { this.app = app; this.contentEl = new Element(); Modal.instances.push(this); }
  open() { this.opened = true; if (this.onOpen) this.onOpen(); return this; }
  close() { this.closed = true; if (this.onClose) this.onClose(); }
}
Modal.instances = [];

const notices = [];
global.obsidian = { Modal, Notice: class { constructor(message) { notices.push(String(message)); } } };
global.document = { createElement: (tag) => new Element(tag) };
global.confirm = () => true;

const modalsPath = path.join(ROOT, "SYSTEM/Views/workout-modals.js");
const viewPath = path.join(ROOT, "SYSTEM/Views/workout-view.js");
delete global.WorkoutModals;
delete global.WorkoutView;
delete require.cache[require.resolve(modalsPath)];
delete require.cache[require.resolve(viewPath)];
const modals = require(modalsPath);
const view = require(viewPath);

function sampleProgram() {
  return core.normalizeProgram({
    id: "modal-program",
    title: "Modal Program",
    goal: "strength",
    days: [{ id: "w1d1", week: 1, day: 1, exercises: [{ id: "squat", name: "Squat", prescribed_sets: [{ reps: "5", rpe: "7", target: "", rest: "90" }] }] }],
  });
}

function fixture() {
  const exerciseFile = { path: "PARA/RESOURCES/Workout/Exercises/Squat.md", basename: "Squat" };
  const files = [exerciseFile];
  const writes = { exerciseCreates: [], noteOpens: [], capturePrograms: [], refreshes: 0 };
  const leaf = {
    view: {},
    async openFile(file, options) { writes.noteOpens.push({ path: file.path, options }); },
  };
  const app = {
    vault: {
      adapter: {},
      getMarkdownFiles: () => files.slice(),
      getAbstractFileByPath(target) { return files.find((file) => file.path === target) || null; },
      async read() { return "---\ntype: exercise\n---\n# Squat\n\nTechnique"; },
      async createFolder() {},
      async create(target, body) {
        writes.exerciseCreates.push({ target, body });
        const file = { path: target, basename: path.basename(target, ".md") };
        files.push(file);
        return file;
      },
    },
    metadataCache: { getFileCache: () => ({ frontmatter: { type: "exercise", target: "legs", cue: "brace", aliases: [] } }) },
    workspace: {
      getLeavesOfType: () => [leaf],
      getRightLeaf: () => leaf,
      revealLeaf() {},
      async openLinkText(target) { writes.noteOpens.push({ target, fallback: true }); },
    },
  };
  const state = { sessions: [], store: {} };
  const refresh = async () => { writes.refreshes += 1; };
  return { app, state, refresh, writes };
}

function inputs(modal) { return modal.contentEl.findAll((node) => node.tag === "input"); }
function button(modal, label) {
  const found = modal.contentEl.findText(label, "button");
  assert.ok(found, `missing button: ${label}`);
  return found;
}

function injectOwnerBoundary(writes) {
  modals.configureDependencies({
    makePrescribedSets: view.makePrescribedSets,
    appendExerciseToProgram: view.appendExerciseToProgram,
    persistProgram: async (_app, _state, program) => {
      const normalized = core.normalizeProgram(program);
      writes.capturePrograms.push(JSON.parse(JSON.stringify(normalized)));
      return normalized;
    },
    openExercisePopup: view.openExercisePopup,
    openExerciseNoteSide: view.openExerciseNoteSide,
    empty: view.empty,
    iconButton: view.iconButton,
    recordStripText: view.recordStripText,
    loadState: view.loadState,
    startProgram: view.startProgram,
  });
}

test("all five modal dependencies are atomic and omission of each fails closed", () => {
  const complete = {
    makePrescribedSets() {}, appendExerciseToProgram() {}, persistProgram() {},
    openExercisePopup() {}, openExerciseNoteSide() {}, empty() {}, iconButton() {},
    recordStripText() {}, loadState() {}, startProgram() {},
  };
  assert.deepEqual(modals.REQUIRED_DEPENDENCIES, Object.keys(complete).slice(0, 5));
  for (const removed of modals.REQUIRED_DEPENDENCIES) {
    const mutation = Object.assign({}, complete);
    delete mutation[removed];
    assert.throws(() => modals.configureDependencies(mutation), new RegExp(removed), `${removed} removal must be RED`);
  }
});

test("Create Program rejects invalid input, then confirms one exact Capture-boundary write and closes", async () => {
  const fx = fixture();
  injectOwnerBoundary(fx.writes);
  const cancelled = new modals.CreateProgramModal(fx.app, fx.state, fx.refresh).open();
  button(cancelled, "취소").onclick();
  assert.equal(cancelled.closed, true);
  assert.equal(fx.writes.capturePrograms.length, 0);

  const modal = new modals.CreateProgramModal(fx.app, fx.state, fx.refresh).open();
  await button(modal, "만들기").onclick();
  assert.equal(fx.writes.capturePrograms.length, 0);
  assert.equal(modal.closed, undefined);

  const fields = inputs(modal);
  fields[0].value = "Synthetic Program";
  fields[2].value = "Back Squat";
  fields[3].value = "2";
  fields[4].value = "6";
  fields[5].value = "8";
  await button(modal, "만들기").onclick();

  assert.equal(fx.writes.capturePrograms.length, 1);
  assert.deepEqual(
    fx.writes.capturePrograms[0].days[0].exercises[0].prescribed_sets.map(({ set_number, reps, rpe, load, target, rest }) => ({ set_number, reps, rpe, load, target, rest })),
    [
      { set_number: 1, reps: "6", rpe: "8", load: "", target: "", rest: "" },
      { set_number: 2, reps: "6", rpe: "8", load: "", target: "", rest: "" },
    ]
  );
  assert.equal(modal.closed, true);
  assert.equal(fx.writes.refreshes, 1);
});

test("Add Exercise writes nothing while invalid, then creates one note and one confirmed program mutation", async () => {
  const fx = fixture();
  injectOwnerBoundary(fx.writes);
  const cancelled = new modals.AddExerciseToProgramModal(fx.app, sampleProgram(), fx.state, fx.refresh).open();
  button(cancelled, "취소").onclick();
  assert.equal(cancelled.closed, true);
  assert.deepEqual({ notes: fx.writes.exerciseCreates.length, programs: fx.writes.capturePrograms.length }, { notes: 0, programs: 0 });

  const modal = new modals.AddExerciseToProgramModal(fx.app, sampleProgram(), fx.state, fx.refresh).open();
  await button(modal, "운동 추가").onclick();
  assert.deepEqual({ notes: fx.writes.exerciseCreates.length, programs: fx.writes.capturePrograms.length }, { notes: 0, programs: 0 });

  const fields = inputs(modal);
  const name = fields.find((field) => field.attr.placeholder && field.attr.placeholder.includes("스쿼트"));
  name.value = "Hack Squat";
  await button(modal, "운동 추가").onclick();

  assert.equal(fx.writes.exerciseCreates.length, 1);
  assert.equal(fx.writes.capturePrograms.length, 1);
  assert.equal(fx.writes.capturePrograms[0].days[0].exercises.at(-1).name, "Hack Squat");
  assert.equal(modal.closed, true);
  assert.equal(fx.writes.refreshes, 1);
});

test("Program Editor rejects invalid state and confirms exactly one valid program mutation", async () => {
  const fx = fixture();
  injectOwnerBoundary(fx.writes);
  const invalid = new modals.ProgramEditorModal(fx.app, sampleProgram(), fx.state, fx.refresh).open();
  invalid.titleInput.value = "";
  invalid.titleInput.oninput();
  await button(invalid, "변경 저장").onclick();
  assert.equal(fx.writes.capturePrograms.length, 0);
  assert.equal(invalid.closed, undefined);

  const valid = new modals.ProgramEditorModal(fx.app, sampleProgram(), fx.state, fx.refresh).open();
  valid.goalInput.value = "hypertrophy";
  valid.goalInput.oninput();
  await button(valid, "변경 저장").onclick();
  assert.equal(fx.writes.capturePrograms.length, 1);
  assert.equal(fx.writes.capturePrograms[0].goal, "hypertrophy");
  assert.equal(valid.closed, true);
  assert.equal(fx.writes.refreshes, 1);
});

test("Program Editor popup and note controls invoke their actual view owners and preserve editor close semantics", async () => {
  const fx = fixture();
  injectOwnerBoundary(fx.writes);
  const editor = new modals.ProgramEditorModal(fx.app, sampleProgram(), fx.state, fx.refresh).open();
  const before = Modal.instances.length;
  button(editor, "팝업").onclick();
  const detail = Modal.instances.at(-1);
  assert.equal(Modal.instances.length, before + 1);
  assert.equal(detail.constructor.name, "ExerciseDetailModal");
  assert.equal(detail.opened, true);
  button(detail, "닫기").onclick();
  assert.equal(detail.closed, true);

  await button(editor, "노트").onclick();
  assert.deepEqual(fx.writes.noteOpens, [{ path: "PARA/RESOURCES/Workout/Exercises/Squat.md", options: { active: true } }]);
  assert.equal(editor.closed, undefined, "popup/note actions do not discard editor state");
  button(editor, "취소").onclick();
  assert.equal(editor.closed, true);
  assert.equal(fx.writes.capturePrograms.length, 0);
});
