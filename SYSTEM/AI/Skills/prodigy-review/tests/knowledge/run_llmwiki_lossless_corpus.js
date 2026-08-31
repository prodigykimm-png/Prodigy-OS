"use strict";

const fs = require("node:fs");
const path = require("node:path");
const segmenter = require("../../../../../Views/llmwiki-corpus-segmenter.js");
const lossless = require("../../../../../Views/llmwiki-lossless-corpus.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const OUTPUT = path.join(ROOT, "SYSTEM/CACHE/llmwiki/lossless-corpus-artifact.json");
const SOURCES = [
  "INBOX/투놀카페/투놀카페 - 투자일기.md",
  "INBOX/웨딩스냅 숙달하기.md",
  "INBOX/재개발재건축.md",
  "INBOX/웨딩 스냅 워크플로우.md",
  "INBOX/서울투자반.md",
];

function counts(values) { return values.reduce((map, value) => (map[value] = (map[value] || 0) + 1, map), {}); }
const results = SOURCES.map((sourcePath) => {
  const sourceText = fs.readFileSync(path.join(ROOT, sourcePath), "utf8");
  const segmentation = segmenter.segmentCorpus({ source_path: sourcePath, source_text: sourceText });
  if (!segmentation.ok) throw new Error(`${sourcePath}:${segmentation.reason}`);
  const result = lossless.buildLosslessCorpus({ segmentation });
  if (!result.ok) throw new Error(`${sourcePath}:${result.reason}`);
  const publication = lossless.finalizeLosslessCorpus({ result });
  if (!publication.ok) throw new Error(`${sourcePath}:${publication.reason}`);
  return {
    source_path: sourcePath,
    source_hash: segmentation.source_hash,
    subdocuments: segmentation.subdocuments.length,
    claims: result.inventory.claims.length,
    semantic_coverage: result.coverage.semantic_coverage,
    unassigned_units: result.coverage.unassigned_units,
    claim_types: counts(result.inventory.claims.map((row) => row.claim_type)),
    claim_rows: result.inventory.claims,
    routes: counts(result.routing.assignments.map((row) => row.route)),
    source_details: result.hierarchy.source_details.length,
    topic_pages: result.hierarchy.topic_pages.length,
    corpus_index: result.hierarchy.corpus_index,
    topics: result.hierarchy.topic_pages,
    details: result.hierarchy.source_details,
    warnings: counts(Object.values(publication.warnings).flat()),
    output_hash: publication.output_hash,
    receipt: publication.publication_receipt,
    canonical_writes: publication.canonical_writes,
    source_writes: publication.source_writes,
  };
});
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const serialized = JSON.stringify({ generated_by: "run_llmwiki_lossless_corpus.js", results }, null, 2);
const temporary = `${OUTPUT}.${process.pid}.tmp`;
fs.writeFileSync(temporary, serialized);
fs.renameSync(temporary, OUTPUT);
console.log(JSON.stringify(results.map(({ topics, details, corpus_index, claim_rows, ...summary }) => ({ ...summary, artifact_bytes: Buffer.byteLength(JSON.stringify({ topics, details, corpus_index, claim_rows })) }))));
