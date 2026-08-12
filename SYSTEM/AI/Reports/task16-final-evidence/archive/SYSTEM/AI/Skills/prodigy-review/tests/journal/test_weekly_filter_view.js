"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/weekly-filter-core.js"));
const render = require(path.join(ROOT, "SYSTEM/Views/weekly-filter-render.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/weekly-review-store.js"));
global.WeeklyFilterCore = core;
global.WeeklyFilterRender = render;
const view = require(path.join(ROOT, "SYSTEM/Views/weekly-filter-view.js"));

class Element {
  constructor(tag, options = {}) {
    this.tag = tag;
    this.children = [];
    this.textContent = options.text || "";
    this.attributes = options.attr || {};
    this.value = this.attributes.value || "";
    this.disabled = Boolean(options.disabled);
  }

  createEl(tag, options = {}) {
    const child = new Element(tag, options);
    this.children.push(child);
    return child;
  }

  empty() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function walk(node, predicate, result = []) {
  if (!node) return result;
  if (predicate(node)) result.push(node);
  node.children.forEach((child) => walk(child, predicate, result));
  return result;
}

function button(root, text) {
  return walk(root, (node) => node.tag === "button" && node.textContent === text)[0] || null;
}

function status(root) {
  return walk(root, (node) => node.attributes.class && String(node.attributes.class).includes("weekly-filter-status"))[0] || null;
}

function makeApp({ withWeeklyFolder = false } = {}) {
  const files = new Map();
  const folders = new Set(["DAILY/DAILY"]);
  const createdFolders = [];
  const createdFiles = [];
  const modifiedFiles = [];
  const dailyFile = { path: "DAILY/DAILY/2026-08-08.md", name: "2026-08-08.md" };
  const dailyContent = [
    "---",
    "type: daily",
    "---",
    "## Evidence",
    "### e01 - 주간 테스트",
    "Experience: Weekly 저장을 검증했다.",
    "Interpretation: 저장 경로가 필요하다.",
    ""
  ].join("\n");
  if (withWeeklyFolder) folders.add("DAILY/WEEKLY");

  const app = { vault: {
    getAbstractFileByPath(target) {
      if (folders.has(target)) return { path: target, children: target === "DAILY/DAILY" ? [dailyFile] : [] };
      if (target === dailyFile.path) return dailyFile;
      if (files.has(target)) return files.get(target);
      return null;
    },
    async cachedRead(file) {
      if (file.path === dailyFile.path) return dailyContent;
      return files.get(file.path)?.content || "";
    },
    async read(file) {
      return this.cachedRead(file);
    },
    async createFolder(target) {
      const separator = target.lastIndexOf("/");
      const parent = separator > 0 ? target.slice(0, separator) : "";
      if (parent && !folders.has(parent)) throw new Error("parent folder missing");
      folders.add(target);
      createdFolders.push(target);
      return { path: target };
    },
    async create(target, content) {
      const file = { path: target, name: target.split("/").pop(), content };
      files.set(target, file);
      createdFiles.push({ target, content });
      return file;
    },
    async modify(file, content) {
      file.content = content;
      modifiedFiles.push({ target: file.path, content });
    }
  } };
  return { app, files, folders, createdFolders, createdFiles, modifiedFiles };
}

async function mountFixture(app, overrides = {}) {
  global.WeeklyReviewStore = overrides.store || store;
  global.WeeklyFilterAI = overrides.ai || { generateWeeklyAI: async () => { throw new Error("provider unavailable"); } };
  const root = new Element("section");
  const mounted = view.mountWeeklyFilter(root, { app, initialDate: "2026-08-09" });
  await mounted.ready;
  return { root, mounted };
}

async function testSuccessfulSaveIsAwaitableAndIdempotent() {
  const fixture = makeApp();
  const { root, mounted } = await mountFixture(fixture.app, { ai: {} });
  const save = button(root, "주간 리뷰 저장");
  assert.ok(save);

  const first = await save.onclick();
  assert.equal(first.created, true);
  assert.equal(first.path, "DAILY/WEEKLY/2026-W32.md");
  assert.deepEqual(fixture.createdFolders, ["DAILY", "DAILY/WEEKLY"]);
  assert.equal(fixture.createdFiles.length, 1);

  const second = await save.onclick();
  assert.equal(second.created, false);
  assert.equal(fixture.createdFiles.length, 1, "re-saving a week updates instead of duplicating the file");
  assert.equal(fixture.modifiedFiles.length, 1);
  assert.match(status(root).textContent, /저장 완료/);
  assert.equal(save.disabled, false);
}

async function testConcurrentSavesCollapseToOneWrite() {
  const fixture = makeApp({ withWeeklyFolder: true });
  let saveCalls = 0;
  let resolveSave;
  const pending = new Promise((resolve) => { resolveSave = resolve; });
  const customStore = {
    read: async () => null,
    save: async () => { saveCalls += 1; await pending; return { path: "DAILY/WEEKLY/2026-W32.md", created: true }; }
  };
  const { mounted } = await mountFixture(fixture.app, { store: customStore, ai: {} });
  const first = mounted.save();
  const second = mounted.save();
  assert.equal(saveCalls, 1);
  assert.equal(await second, null);
  resolveSave();
  assert.deepEqual(await first, { path: "DAILY/WEEKLY/2026-W32.md", created: true });
}
async function testAICanBeCancelledWithoutStaleMerge() {
  const fixture = makeApp({ withWeeklyFolder: true });
  let resolveAI;
  let receivedSignal;
  let merged = false;
  const customAI = {
    generateWeeklyAI: async (options) => {
      receivedSignal = options.signal;
      return new Promise((resolve) => { resolveAI = resolve; });
    },
    mergeAIIntoReview(review, result) {
      merged = true;
      return { ...review, ...result, ai_enhanced: true };
    }
  };
  const { root, mounted } = await mountFixture(fixture.app, { ai: customAI });
  const ai = button(root, "AI 학습 분석");
  const save = button(root, "주간 리뷰 저장");
  const running = mounted.runAI();

  assert.equal(ai.textContent, "AI 분석 취소");
  assert.equal(ai.disabled, false, "the running AI action remains available as cancel");
  assert.ok(receivedSignal);
  assert.equal(await mounted.runAI(), null, "a duplicate AI click does not start another request");

  assert.equal(ai.onclick(), true);
  assert.equal(receivedSignal.aborted, true);
  assert.match(status(root).textContent, /AI 분석을 취소했습니다/);
  assert.equal(save.disabled, false, "cancelling AI restores the save action");

  resolveAI({ key_learnings: [], findings: [], next_week_direction: {}, suggested_principles: [] });
  assert.equal(await running, null);
  assert.equal(merged, false, "a cancelled response cannot overwrite the deterministic review");
  assert.match(status(root).textContent, /AI 분석을 취소했습니다/);
}
async function testDestroyCancelsPendingAI() {
  const fixture = makeApp({ withWeeklyFolder: true });
  let resolveAI;
  let receivedSignal;
  let merged = false;
  const customAI = {
    generateWeeklyAI: async (options) => {
      receivedSignal = options.signal;
      return new Promise((resolve) => { resolveAI = resolve; });
    },
    mergeAIIntoReview(review, result) {
      merged = true;
      return { ...review, ...result };
    }
  };
  const { mounted } = await mountFixture(fixture.app, { ai: customAI });
  const running = mounted.runAI();

  mounted.destroy();
  assert.equal(receivedSignal.aborted, true, "destroying the Weekly view aborts its provider request");
  resolveAI({ key_learnings: [], findings: [], next_week_direction: {}, suggested_principles: [] });
  assert.equal(await running, null);
  assert.equal(merged, false, "a detached Weekly view cannot apply a late AI response");
}

async function testAIErrorKeepsSavePathUsable() {
  const fixture = makeApp({ withWeeklyFolder: true });
  let aiError = true;
  let savedReview = null;
  const customStore = {
    read: async () => null,
    save: async (_app, review) => { savedReview = review; return { path: "DAILY/WEEKLY/2026-W32.md", created: false }; }
  };
  const customAI = {
    async generateWeeklyAI() {
      if (aiError) throw new Error("provider unavailable");
      return { key_learnings: [{ pattern: "저장", learning: "저장 경계를 확인했다.", evidence_refs: ["daily-2026-08-08-e01"] }], findings: [], next_week_direction: {}, suggested_principles: [] };
    },
    mergeAIIntoReview(review, result) { return { ...review, ...result, ai_enhanced: true }; }
  };
  const { root, mounted } = await mountFixture(fixture.app, { store: customStore, ai: customAI });
  const ai = button(root, "AI 학습 분석");
  const save = button(root, "주간 리뷰 저장");
  assert.ok(ai && save);

  await ai.onclick();
  assert.match(status(root).textContent, /AI 분석 실패/);
  assert.equal(save.disabled, false, "AI failure leaves the deterministic review saveable");

  aiError = false;
  await mounted.runAI();
  assert.match(status(root).textContent, /AI 학습 분석 완료/);
  const result = await mounted.save();
  assert.equal(result.created, false);
  assert.equal(savedReview.ai_enhanced, true);
}
async function testEmptyAIResponseKeepsDeterministicReview() {
  const fixture = makeApp({ withWeeklyFolder: true });
  const customAI = {
    generateWeeklyAI: async () => { throw new Error("AI 응답을 해석할 수 없습니다."); }
  };
  const { root } = await mountFixture(fixture.app, { ai: customAI });
  const ai = button(root, "AI 학습 분석");
  const save = button(root, "주간 리뷰 저장");

  await ai.onclick();

  assert.match(status(root).textContent, /AI 분석 실패/);
  assert.match(status(root).textContent, /AI 응답을 해석할 수 없습니다/);
  assert.equal(save.disabled, false, "an empty AI response leaves the deterministic review saveable");
}

async function testSaveFailureCanRetryWithoutLosingReview() {
  const fixture = makeApp({ withWeeklyFolder: true });
  let attempts = 0;
  const savedReviews = [];
  const customStore = {
    read: async () => null,
    save: async (_app, review) => {
      attempts += 1;
      savedReviews.push(review);
      if (attempts === 1) throw new Error("vault write failed");
      return { path: "DAILY/WEEKLY/2026-W32.md", created: true };
    }
  };
  const { root } = await mountFixture(fixture.app, { store: customStore, ai: {} });
  const save = button(root, "주간 리뷰 저장");

  assert.equal(await save.onclick(), null);
  assert.match(status(root).textContent, /저장 실패/);
  assert.equal(save.disabled, false, "a failed write restores the retry action");
  const retry = await save.onclick();
  assert.deepEqual(retry, { path: "DAILY/WEEKLY/2026-W32.md", created: true });
  assert.equal(attempts, 2);
  assert.deepEqual(savedReviews[0], savedReviews[1], "the original review remains available for retry");
  assert.match(status(root).textContent, /저장 완료/);
}

async function main() {
  await testSuccessfulSaveIsAwaitableAndIdempotent();
  await testConcurrentSavesCollapseToOneWrite();
  await testAIErrorKeepsSavePathUsable();
  await testAICanBeCancelledWithoutStaleMerge();
  await testEmptyAIResponseKeepsDeterministicReview();
  await testSaveFailureCanRetryWithoutLosingReview();
  await testDestroyCancelsPendingAI();
  console.log("Weekly filter view tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
