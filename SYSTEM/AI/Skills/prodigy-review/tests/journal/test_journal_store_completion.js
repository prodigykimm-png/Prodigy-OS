"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const corePath = path.join(ROOT, "SYSTEM/Views/journal-core.js");
const storePath = path.join(ROOT, "SYSTEM/Views/journal-store.js");

async function main() {
  const previousCore = global.JournalCore;
  try {
    global.JournalCore = require(corePath);
    delete require.cache[require.resolve(storePath)];
    const store = require(storePath);
    const dailyPath = "DAILY/DAILY/2026-07-26.md";
    const file = {
      path: dailyPath,
      content: "---\ntype: journal\nstatus: completed\n---\n# 2026-07-26\n\n## Evidence\n\n### e01 · 기록\n\nExperience:\n작성 중인 기록\n"
    };
    const app = {
      vault: {
        getAbstractFileByPath(target) { return target === dailyPath ? file : null; },
        read: async (target) => target.content,
        modify: async (target, content) => { target.content = content; },
        process: async (target, updater) => { target.content = updater(target.content); }
      }
    };

    const before = await store.loadReview(app, "2026-07-26");
    assert.equal(before.status, "partial", "a legacy status alone must not close a Daily");

    const completed = await store.markDailyComplete(app, "2026-07-26");
    assert.equal(completed.status, "complete", "the explicit human action closes the selected Daily");
    assert.match(file.content, /^status: completed$/m);
    assert.match(file.content, /^completed_at: .+$/m);

    file.content = "---\ntype: journal\nreflection: 이전 성찰\nchange: 기존 변화\nnext_experiment: 기존 실험\n---\n# 2026-07-26\n\n## 성찰 (Reflection)\n이전 성찰\n\n## 변화 (Change)\n기존 변화\n\n## 다음 실험 (Next Experiment)\n기존 실험\n";
    const saved = await store.saveReflection(app, "2026-07-26", "API와 별개로 저장할 원문 일기");
    assert.equal(saved.fields.reflection, "API와 별개로 저장할 원문 일기");
    assert.equal(saved.fields.change, "기존 변화");
    assert.equal(saved.fields.next_experiment, "기존 실험");
    console.log("Journal store completion test passed");
  } finally {
    delete require.cache[require.resolve(storePath)];
    if (previousCore === undefined) delete global.JournalCore;
    else global.JournalCore = previousCore;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
