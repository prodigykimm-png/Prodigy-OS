"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const audit = require(path.join(ROOT, "SYSTEM/Views/llmwiki-recall-audit.js"));
const segmenter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-corpus-segmenter.js"));
const lossless = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lossless-corpus.js"));

const sourcePath = "INBOX/audit.md";
const sourceText = `# 감사\n\n## 첫 글\n\n글번호: 1 | 작성자: A | 날짜: 2020.01.01.\n\n정의는 대상을 설명한다.\n- 비용은 2,000만 원이다.\n- 반드시 안전 장비를 확인한다.\n\n## 둘째 글\n\n글번호: 2 | 작성자: B | 날짜: 2020.01.02.\n\n1. 첫 절차를 수행한다.\n2. 둘째 절차를 수행한다.\n\n댓글 1\n**사용자** (2020.01.03.)\n댓글 내용이다.\n`;

function fixture() {
  const segmentation = segmenter.segmentCorpus({ source_path: sourcePath, source_text: sourceText });
  const result = lossless.buildLosslessCorpus({ segmentation });
  assert.equal(result.ok, true, result.reason);
  return result;
}

test("recall audit stratifies positions numbers lists safety and context boundaries", () => {
  const report = audit.auditRecall({ result: fixture(), source_text: sourceText, sample_limit: 20 });
  assert.equal(report.ok, true, report.reason);
  assert.equal(report.metrics.structural_span_accuracy, 1);
  assert.equal(report.metrics.structural_boundary_accuracy, 1);
  assert.equal(report.metrics.critical_structural_recall, 1);
  assert.equal(report.metrics.general_structural_recall, 1);
  assert.equal(report.metrics.context_contamination, 0);
  assert.equal(report.gate, "pass");
  assert.equal(report.samples.some((row) => row.strata.includes("numeric")), true);
  assert.equal(report.samples.some((row) => row.strata.includes("safety")), true);
  assert.equal(report.samples.some((row) => row.strata.includes("ordered_list")), true);
  assert.equal(report.samples.some((row) => row.strata.includes("context_boundary")), true);
  assert.equal(report.samples.some((row) => row.strata.includes("start")), true);
  assert.equal(report.samples.some((row) => row.strata.includes("end")), true);
});

test("recall audit fails closed on a stale span missing critical information", () => {
  const result = fixture();
  const target = result.inventory.claims.find((claim) => /2,000만 원/u.test(claim.text));
  const claims = result.inventory.claims.map((claim) => claim.claim_id === target.claim_id
    ? { ...claim, global_span: { start: claim.global_span.start + 1, end: claim.global_span.end } } : claim);
  const report = audit.auditRecall({ result: { ...result, inventory: { ...result.inventory, claims } }, source_text: sourceText, sample_limit: 20 });
  assert.equal(report.ok, false);
  assert.equal(report.gate, "fail");
  assert.equal(report.metrics.structural_span_accuracy < 1, true);
  assert.equal(report.failures.some((row) => row.claim_id === target.claim_id), true);
});
