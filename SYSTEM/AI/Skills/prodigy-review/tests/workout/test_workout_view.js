"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
const importer = require(path.join(ROOT, "SYSTEM/Views/workout-import.js"));

class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.text = ""; this.value = ""; this.files = []; this.checked = false; this.disabled = false; this.attr = {}; }
  createEl(tag, options = {}) { const child = new Element(tag); child.text = options.text || ""; child.value = options.value || ""; child.attr = options.attr || {}; this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; }
  addClass() {}
}

class Modal {
  constructor(app) { this.app = app; this.contentEl = new Element(); }
  open() { if (this.onOpen) this.onOpen(); }
  close() { this.closed = true; }
}

function textOf(element) { return [element.text, ...element.children.flatMap(textOf)].filter(Boolean).join(" "); }
function findText(element, label) { if (element.text === label) return element; for (const child of element.children) { const found = findText(child, label); if (found) return found; } return null; }

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

async function main() {
  global.WorkoutCore = core;
  global.WorkoutStore = storeApi;
  global.WorkoutImport = importer;
  global.obsidian = { Modal, Notice: class {} };
  global.confirm = () => true;
  delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/workout-view.js"))];
  const view = require(path.join(ROOT, "SYSTEM/Views/workout-view.js"));
  const fixture = fakeApp();
  const container = new Element();

  await view.renderDashboard(fixture.app, container);
  assert.match(textOf(container), /진행 중인 프로그램이 없습니다/);
  assert.ok(findText(container, "프로그램 가져오기"));
  assert.ok(findText(container, "빠른 운동"));
  assert.match(textOf(container), /▶ 계속|계속/);

  const store = storeApi.createWorkoutStore(storeApi.createObsidianAdapter(fixture.app));
  const program = sampleProgram();
  const run = core.createProgramRun(program, [], { run_id: "run-mobile" });
  const session = core.createWorkoutSession(program, run, "w1d1", { session_id: "session-mobile" });
  await store.saveProgram(program); await store.saveRun(run); await store.saveSession(session);
  await view.renderDashboard(fixture.app, container);
  const rendered = textOf(container);
  assert.match(rendered, /모바일 근비대/);
  assert.match(rendered, /스미스 머신 스쿼트/);
  assert.match(rendered, /이전 기록 없음|이전 /);
  assert.match(rendered, /세트 추가|운동 완료/);
  assert.match(rendered, /이어서 기록|미완료/);
  assert.ok(findText(container, "운동 완료"));
  assert.ok(findText(container, "초안 버리기"));
  const css = container.children.find((child) => child.tag === "style").text;
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /workout-continue-strip|workout-progress-track|workout-set-row-min/);
  assert.equal(css.includes("table"), false);
  assert.equal([...fixture.files.keys()].some((key) => key.endsWith(".md")), false);
  console.log("Workout Program Runner UI tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
