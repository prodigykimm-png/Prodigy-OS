"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.MonthlyValidationCore = require(path.join(ROOT, "SYSTEM/Views/monthly-validation-core.js"));
global.WeeklyFilterCore = require(path.join(ROOT, "SYSTEM/Views/weekly-filter-core.js"));
const storePath = path.join(ROOT, "SYSTEM/Views/monthly-validation-store.js");
delete require.cache[require.resolve(storePath)];
const store = require(storePath);

function file(pathname, content, mtime) {
  return { path: pathname, name: pathname.split("/").pop(), extension: "md", content, stat: { mtime } };
}

function appFor(initialFiles) {
  const files = initialFiles.slice();
  const folders = new Set(["DAILY", "DAILY/DAILY", "DAILY/WEEKLY", "DAILY/MONTHLY"]);
  let nextMtime = 5000;
  const vault = {
    getMarkdownFiles: () => files.filter((item) => item.extension === "md"),
    getAbstractFileByPath: (pathname) => files.find((item) => item.path === pathname) || (folders.has(pathname) ? { path: pathname, children: [] } : null),
    read: async (target) => target.content,
    cachedRead: async (target) => target.content,
    createFolder: async (pathname) => { folders.add(pathname); },
    create: async (pathname, content) => {
      const created = file(pathname, content, ++nextMtime);
      files.push(created);
      return created;
    },
    modify: async (target, content) => { target.content = content; target.stat.mtime = ++nextMtime; }
  };
  return { vault, files };
}

const dailyContent = (id) => [
  "---", "journal: personal daily", "---", "# Daily", "", "## Evidence", "",
  `### [e01] 경험 ${id}`,
  `<!-- evidence_id: ${id} -->`,
  "Context: 업무", "Experience: 구조화된 경험", "Interpretation: 의미", "Change: 변화", "Next Experiment: 다음 실험", ""
].join("\n");

async function main() {
  const selectedDaily = file("DAILY/DAILY/2026-07-01.md", dailyContent("daily-2026-07-01-e01"), 101);
  const foreignDaily = file("DAILY/DAILY/2026-06-30.md", dailyContent("daily-2026-06-30-e01"), 102);
  const weekly = file("DAILY/WEEKLY/2026-W27.md", [
    "---", "journal: weekly", "journal-start-date: 2026-06-29", "journal-end-date: 2026-07-05", "journal-section: week", "type: journal", "status: completed", "---", "",
    "## Suggested Principles", "", "- [ ] 먼저 확인하기", "  - 상태: pending", "  - Evidence: daily-2026-07-01-e01", ""
  ].join("\n"), 103);
  const appState = appFor([selectedDaily, foreignDaily, weekly]);
  const projection = await store.listMonthlyDailyEvidence({ vault: appState.vault }, "2026-07");
  assert.deepEqual(projection.evidence, [{
    evidence_id: "daily-2026-07-01-e01",
    date: "2026-07-01",
    context: "업무",
    experience: "구조화된 경험",
    interpretation: "의미",
    change: "변화",
    next_experiment: "다음 실험"
  }]);
  assert.deepEqual(projection.source_snapshots, [{ path: "DAILY/DAILY/2026-07-01.md", mtime: 101 }]);
  assert.equal(Object.prototype.hasOwnProperty.call(projection.evidence[0], "content"), false);

  const weeklyNotes = await store.listWeeklyNotes({ vault: appState.vault }, "2026-07");
  assert.equal(weeklyNotes.length, 1);
  assert.equal(weeklyNotes[0].source_mtime, 103);

  const emptySnapshot = await store.readMonthlySnapshot({ vault: appState.vault }, "2026-07");
  assert.deepEqual(emptySnapshot, { exists: false, path: "DAILY/MONTHLY/2026-07.md", content: "", mtime: null });
  const created = await store.saveWithMtimeGuard({ vault: appState.vault }, "2026-07", "새 월간 기록", { expected_mtime: null });
  assert.equal(created.ok, true);
  assert.equal(created.created, true);
  const opened = await store.readMonthlySnapshot({ vault: appState.vault }, "2026-07");
  assert.equal(opened.exists, true);
  const conflict = await store.saveWithMtimeGuard({ vault: appState.vault }, "2026-07", "오래된 편집본", { expected_mtime: 1 });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "MTIME_CONFLICT");
  const replaced = await store.saveWithMtimeGuard({ vault: appState.vault }, "2026-07", "명시적 교체", { expected_mtime: 1, allow_replace: true });
  assert.equal(replaced.ok, true);
  assert.equal((await store.readMonthlySnapshot({ vault: appState.vault }, "2026-07")).content, "명시적 교체");

  const duplicateFiles = appFor([
    file("DAILY/DAILY/2026-07-01.md", dailyContent("daily-2026-07-01-e01"), 201),
    file("DAILY/DAILY/2026-07-02.md", dailyContent("daily-2026-07-01-e01"), 202),
    weekly
  ]);
  await assert.rejects(
    () => store.listMonthlyDailyEvidence({ vault: duplicateFiles.vault }, "2026-07"),
    (error) => error && error.code === "DUPLICATE_EVIDENCE_ID"
  );
  const collected = await store.collectMonthlyAIInputs({ vault: duplicateFiles.vault }, "2026-07");
  assert.equal(collected.model.readiness.weekly_count, 1);
  assert.equal(collected.context.evidence.length, 0);
  assert.equal(collected.warnings.duplicate_evidence_id, "daily-2026-07-01-e01");
  console.log("Monthly validation store tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
