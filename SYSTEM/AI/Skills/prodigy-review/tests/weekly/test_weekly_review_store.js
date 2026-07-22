"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const store = require(path.join(ROOT, "SYSTEM/Views/weekly-review-store.js"));

function review() {
  return {
    period: { week: "2026-W30", start: "2026-07-20", end: "2026-07-26" },
    question: "무엇이 반복되고 무엇을 배웠는가?",
    summary: "촬영 전 확인 행동이 반복되었다.",
    key_learnings: [{
      pattern: "촬영 전 주변 확인",
      learning: "사전 확인은 현장 실수를 줄인다.",
      evidence_refs: ["daily-2026-07-20-e01", "daily-2026-07-22-e02"]
    }],
    findings: [],
    meaningful_changes: [{ reason: "서두르지 않고 확인한 뒤 진행했다." }],
    experiments: [{ description: "다음 촬영에서도 헬퍼 확인을 먼저 한다." }],
    suggested_principles: [],
    next_week_direction: {
      continue_items: ["사전 확인"],
      observe_items: ["실수 감소"],
      increase_attention: [],
      pending_items: []
    },
    references: ["DAILY/DAILY/2026-07-20.md"]
  };
}

function fakeApp() {
  const files = new Map();
  const folders = new Set();
  return {
    vault: {
      getAbstractFileByPath(target) {
        if (folders.has(target)) return { path: target, children: [] };
        return files.get(target) || null;
      },
      async createFolder(target) { folders.add(target); },
      async create(target, content) {
        const file = { path: target, content };
        files.set(target, file);
        return file;
      },
      async modify(file, content) { file.content = content; }
    },
    files,
    folders
  };
}

async function main() {
  const data = review();
  assert.equal(store.pathFor(data), "DAILY/WEEKLY/2026-W30.md");
  assert.throws(() => store.pathFor({ period: { week: "bad" } }), /주차/);

  const rendered = store.renderReview(data);
 assert.match(rendered, /^journal: weekly$/m);
 assert.match(rendered, /^type: journal$/m);
 assert.match(rendered, /^status: completed$/m);
 assert.match(rendered, /# 2026-W30/);
  assert.match(rendered, /Key Learnings/);
  assert.match(rendered, /DAILY\/DAILY\/2026-07-20\.md/);

  const app = fakeApp();
  const first = await store.save(app, data);
  assert.deepEqual(first, { path: "DAILY/WEEKLY/2026-W30.md", created: true });
  assert.equal(app.folders.has("DAILY/WEEKLY"), true, "folder is created only when the explicit save runs");
  const saved = app.files.get(first.path);
  assert.ok(saved, "the explicit save creates the weekly note");

  data.summary = "수정된 요약";
  const second = await store.save(app, data);
  assert.deepEqual(second, { path: "DAILY/WEEKLY/2026-W30.md", created: false });
  assert.match(saved.content, /수정된 요약/, "saving the same week updates instead of duplicating it");
  console.log("Weekly review store tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
