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
        modify: async (target, content) => { target.content = content; }
      }
    };

    const before = await store.loadReview(app, "2026-07-26");
    assert.equal(before.status, "partial", "a legacy status alone must not close a Daily");

    const completed = await store.markDailyComplete(app, "2026-07-26");
    assert.equal(completed.status, "complete", "the explicit human action closes the selected Daily");
    assert.match(file.content, /^status: completed$/m);
    assert.match(file.content, /^completed_at: .+$/m);
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
