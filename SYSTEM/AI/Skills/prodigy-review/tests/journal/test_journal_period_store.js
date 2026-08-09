"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/journal-period-core.js"));
global.JournalPeriodCore = core;
const storePath = path.join(ROOT, "SYSTEM/Views/journal-period-store.js");
delete require.cache[require.resolve(storePath)];
const store = require(storePath);

function file(pathname, content) {
  return { path: pathname, name: pathname.split("/").pop(), extension: "md", content };
}

function appFor(files) {
  return {
    vault: {
      getMarkdownFiles: () => files,
      cachedRead: async (target) => target.content,
      read: async (target) => target.content
    }
  };
}

async function main() {
  const files = [
    file("DAILY/MONTHLY/2026-07.md", "---\njournal: monthly\njournal-start-date: 2026-07-01\njournal-section: month\n---\n# 2026-07 Monthly Validation\n"),
    file("DAILY/MONTHLY/2024-November.md", "---\njournal: personal monthly\njournal-start-date: 2024-11-01\njournal-end-date: 2024-11-30\n---\n# Monthly Notes\n"),
    file("DAILY/QUARTERLY/2026-Q2.md", "---\njournal: quarterly\njournal-start-date: 2026-04-01\njournal-section: quarter\n---\n# 2026-Q2\n"),
    file("DAILY/YEARLY/2025.md", "---\njournal: yearly\njournal-start-date: 2025-01-01\njournal-section: year\n---\n# 2025 Yearly Review\n"),
    file("DAILY/MONTHLY/not-a-journal.md", "---\njournal: project\n---\n# Ignore\n")
  ];
  const app = appFor(files);
  const monthly = await store.listRecords(app, "monthly");
  assert.deepEqual(monthly.map((record) => record.key), ["2026-07", "2024-11"]);
  assert.equal(monthly[1].title, "Monthly Notes");
  assert.equal((await store.findRecord(app, "monthly", "2024-11", monthly)).path, "DAILY/MONTHLY/2024-November.md");
  assert.deepEqual((await store.listRecords(app, "quarterly")).map((record) => record.key), ["2026-Q2"]);
  assert.deepEqual((await store.listRecords(app, "yearly")).map((record) => record.key), ["2025"]);
  console.log("Journal period store tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
