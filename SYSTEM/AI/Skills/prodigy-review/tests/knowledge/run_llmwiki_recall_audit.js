"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../..");
const segmenter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-corpus-segmenter.js"));
const lossless = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lossless-corpus.js"));
const recall = require(path.join(ROOT, "SYSTEM/Views/llmwiki-recall-audit.js"));
const sources = [
  "INBOX/투놀카페/투놀카페 - 투자일기.md",
  "INBOX/웨딩스냅 숙달하기.md",
  "INBOX/재개발재건축.md",
  "INBOX/웨딩 스냅 워크플로우.md",
  "INBOX/서울투자반.md",
];
const reports = sources.map((sourcePath) => {
  const sourceText = fs.readFileSync(path.join(ROOT, sourcePath), "utf8");
  const segmentation = segmenter.segmentCorpus({ source_path: sourcePath, source_text: sourceText });
  const result = lossless.buildLosslessCorpus({ segmentation });
  const report = recall.auditRecall({ result, source_text: sourceText, sample_limit: 60 });
  return { source_path: sourcePath, source_hash: segmentation.source_hash, subdocuments: segmentation.subdocuments.length,
    claims: result.inventory.claims.length, ledger: result.ledger.length, ...report,
    strata: report.samples.reduce((counts, row) => (row.strata.forEach((value) => counts[value] = (counts[value] || 0) + 1), counts), {}) };
});
const output = path.join(ROOT, "SYSTEM/CACHE/llmwiki/lossless-recall-audit.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
const temp = `${output}.${process.pid}.tmp`;
fs.writeFileSync(temp, JSON.stringify({ audit_version: recall.VERSION, reports }, null, 2));
fs.renameSync(temp, output);
console.log(JSON.stringify(reports.map(({ samples, failures, ...report }) => ({ ...report, failures: failures.length }))));
if (reports.some((report) => !report.ok)) process.exitCode = 1;
