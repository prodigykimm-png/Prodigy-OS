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

  // ─── Evidence Blocks ───
  const day = "2026-07-18";
  const multi = `---
type: journal
date: ${day}
---
# ${day}

## Evidence

### e01 · 운동 완료
<!-- evidence_id: daily-${day}-e01 -->

Context: workout

Experience:
운동을 완료했다.

### e02 · 말투 갈등
<!-- evidence_id: daily-${day}-e02 -->

Related Objects:
- [[여자친구]]

Experience:
말투 때문에 다퉜다.

Change:
감정을 먼저 확인한다.
`;
  const blocks = core.parseDailyEvidenceBlocks(multi, day);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].evidence_id, `daily-${day}-e01`);
  assert.equal(blocks[0].context, "workout");
  assert.equal(blocks[1].related_objects.includes("[[여자친구]]"), true);
  assert.equal(core.evidenceStatus(blocks), "partial");

  const nextId = core.nextEvidenceId(blocks, day);
  assert.equal(nextId, `daily-${day}-e03`);

  const withNew = blocks.concat([
    Object.assign(core.emptyBlock(day, blocks), {
      evidence_id: nextId,
      title: "추가",
      experience: "새 경험"
    })
  ]);
  const rendered = core.upsertEvidenceSection(multi, withNew);
  const again = core.parseDailyEvidenceBlocks(rendered, day);
  assert.equal(again.length, 3);
  assert.equal(again[0].evidence_id, `daily-${day}-e01`);
  assert.equal(again[2].evidence_id, `daily-${day}-e03`);

  // propose free text — no write
  const proposed = core.proposeBlocksFromFreeText(
    "운동했다.\n\n경매 분석했다.\n\n유튜브 때문에 독서 실패.",
    day
  );
  assert.equal(proposed.length, 3);
  assert.ok(proposed.every((b) => b.experience));

  // legacy still works
  const legacyBlocks = core.parseDailyEvidenceBlocks(source, "2026-07-17");
  assert.equal(legacyBlocks.length, 1);
  assert.equal(legacyBlocks[0].legacy, true);

  // empty evidence
  const emptyDaily = `# ${day}\n\n## Evidence\n\n`;
  assert.deepEqual(core.parseDailyEvidenceBlocks(emptyDaily, day), []);

  // aggregate for YAML mirror
  const agg = core.aggregateLegacyFieldsFromBlocks(blocks);
  assert.ok(agg.reflection.includes("운동"));
  assert.ok(agg.change.includes("감정"));

  console.log("Journal core tests passed");
}

main();
