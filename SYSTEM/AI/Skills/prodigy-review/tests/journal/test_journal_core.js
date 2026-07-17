"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/journal-core.js"));

function main() {
  const empty = core.normalizeReviewFields({});
  assert.equal(core.reviewStatus(empty), "empty");

  const partial = core.normalizeReviewFields({ reflection: "배웠다", daily_reflection: "ignored" });
  assert.equal(partial.reflection, "배웠다");
  assert.equal(core.reviewStatus(partial), "partial");

  const legacy = core.normalizeReviewFields({
    learning: "legacy reflection",
    delta: "legacy change",
    next_step: "legacy experiment"
  });
  assert.equal(legacy.reflection, "legacy reflection");
  assert.equal(legacy.change, "legacy change");
  assert.equal(legacy.next_experiment, "legacy experiment");
  assert.equal(core.reviewStatus(legacy), "complete");

  const source = `---
type: journal
date: 2026-07-17
status: completed
---
# 2026-07-17

# Reflection

## 성찰 (Reflection)
*hint*
- old

## 변화 (Change)
- old change

## 다음 실험 (Next Experiment)
- old experiment

# Tasks
keep this
`;
  const updated = core.applyReviewToDailyContent(source, {
    reflection: "새 성찰",
    change: "새 변화",
    next_experiment: "새 실험"
  });
  assert.match(updated, /reflection: 새 성찰/);
  assert.match(updated, /change: 새 변화/);
  assert.match(updated, /next_experiment: 새 실험/);
  assert.match(updated, /# Tasks\nkeep this/);
  assert.match(updated, /새 성찰/);
  assert.equal(updated.includes("*hint*"), false);

  const extracted = core.extractReviewFromDaily(updated, core.parseFrontmatter(updated).data);
  assert.equal(extracted.reflection.includes("새 성찰"), true);
  assert.equal(core.reviewStatus(extracted), "complete");

  console.log("Journal core tests passed");
}

main();
