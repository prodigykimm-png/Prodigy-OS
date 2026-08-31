"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const api = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lossless-corpus.js"));
const segmenter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-corpus-segmenter.js"));

const sourcePath = "INBOX/합본.md";
const sourceText = `# 합본\n\n## 건축 경험\n\n글번호: 1 | 작성자: 모멘트 | 날짜: 2020.01.01.\n\n직영 공사는 비용을 줄였다.\n- 철골조는 공사 기간을 단축했다.\n- 현장마다 결과는 달랐다.\n\n## 촬영 절차\n\n글번호: 2 | 작성자: 작가 | 날짜: 2020.01.02.\n\n1. 촬영 전 ISO 1000을 확인한다.\n2. 허리를 무리하게 꺾지 않는다.\n`;

function build() {
  const segmented = segmenter.segmentCorpus({ source_path: sourcePath, source_text: sourceText });
  assert.equal(segmented.ok, true);
  return api.buildLosslessCorpus({ segmentation: segmented });
}

test("inventory preserves every semantic unit and explicitly classifies non-claim text", () => {
  const result = build();
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.coverage.semantic_coverage, 1);
  assert.equal(result.coverage.unassigned_units, 0);
  assert.equal(result.inventory.claims.length, 5);
  assert.deepEqual(new Set(result.inventory.claims.map((claim) => claim.claim_type)), new Set(["experience", "heuristic", "equipment_dependent", "safety_sensitive"]));
  assert.equal(result.inventory.claims.every((claim) => claim.global_span.start < claim.global_span.end), true);
  assert.equal(result.inventory.claims.every((claim) => claim.local_span.start < claim.local_span.end), true);
  assert.equal(result.ledger.every((row) => ["claim", "metadata", "boilerplate", "blank", "context_only"].includes(row.classification)), true);
});

test("routing assigns every claim exactly once without hiding experience or verification", () => {
  const result = build();
  const routed = result.routing.assignments;
  assert.equal(routed.length, result.inventory.claims.length);
  assert.equal(new Set(routed.map((row) => row.claim_id)).size, routed.length);
  assert.equal(result.routing.unassigned_claim_ids.length, 0);
  assert.equal(result.routing.duplicate_claim_ids.length, 0);
  assert.equal(routed.some((row) => row.route === "experience_note"), true);
  assert.equal(routed.some((row) => row.route === "field_guide"), true);
  assert.equal(routed.some((row) => row.route === "verification_queue"), true);
});

test("hierarchy keeps index topic and source-detail lineage bidirectional", () => {
  const result = build();
  assert.equal(result.hierarchy.corpus_index.source_detail_ids.length, 2);
  assert.equal(result.hierarchy.source_details.length, 2);
  assert.equal(result.hierarchy.topic_pages.length > 0, true);
  const allDetailClaims = result.hierarchy.source_details.flatMap((page) => page.claim_ids);
  assert.deepEqual(new Set(allDetailClaims), new Set(result.inventory.claims.map((claim) => claim.claim_id)));
  assert.equal(result.hierarchy.source_details.every((page) => page.corpus_index_id === result.hierarchy.corpus_index.page_id), true);
  assert.equal(result.hierarchy.topic_pages.every((page) => page.source_detail_ids.length > 0), true);
});

test("stage receipts make exact replay deterministic and isolate one changed subdocument", () => {
  const first = build();
  const replay = api.replayLosslessCorpus({ prior: first, segmentation: segmenter.segmentCorpus({ source_path: sourcePath, source_text: sourceText }) });
  assert.equal(replay.ok, true);
  assert.equal(replay.status, "exact_replay");
  assert.equal(replay.provider_calls, 0);
  assert.equal(replay.output_hash, first.output_hash);

  const changedText = sourceText.replace("직영 공사는 비용을 줄였다.", "직영 공사는 직접 관리비를 줄였다.");
  const changed = api.replayLosslessCorpus({ prior: first, segmentation: segmenter.segmentCorpus({ source_path: sourcePath, source_text: changedText }) });
  assert.equal(changed.ok, true);
  assert.equal(changed.status, "partial_rebuild");
  assert.equal(changed.changed_subdocument_ids.length, 1);
  assert.equal(changed.reused_subdocument_ids.length, 1);
  const reusedId = changed.reused_subdocument_ids[0];
  assert.equal(changed.receipts.subdocuments[reusedId].receipt_hash, first.receipts.subdocuments[reusedId].receipt_hash);
  assert.equal(changed.hierarchy.source_details.find((page) => page.subdocument_id === reusedId).page_hash,
    first.hierarchy.source_details.find((page) => page.subdocument_id === reusedId).page_hash);
  assert.equal(changed.provider_calls, 0);
});

test("publication receipt preserves complete lineage and attaches typed warnings", () => {
  const result = build();
  const published = api.finalizeLosslessCorpus({ result });
  assert.equal(published.ok, true, published.reason);
  assert.equal(published.status, "publishable_lossless");
  assert.match(published.publication_receipt.receipt_hash, /^[0-9a-f]{64}$/u);
  assert.equal(published.publication_receipt.claim_count, result.inventory.claims.length);
  assert.equal(published.publication_receipt.semantic_coverage, 1);
  assert.equal(Object.keys(published.warnings).length, result.inventory.claims.length);
  assert.equal(Object.values(published.warnings).flat().includes("안전 조건 확인"), true);
  assert.equal(Object.values(published.warnings).flat().includes("장비·환경 의존"), true);
  assert.equal(published.source_writes, 0);
  assert.equal(published.canonical_writes, 0);
});

test("loss gate rejects missing or duplicated claim lineage", () => {
  const result = build();
  const missing = { ...result.hierarchy, source_details: result.hierarchy.source_details.map((page, index) => index ? page : { ...page, claim_ids: page.claim_ids.slice(1) }) };
  assert.equal(api.auditLosslessOutput({ inventory: result.inventory, hierarchy: missing }).ok, false);
  const duplicated = { ...result.hierarchy, topic_pages: [...result.hierarchy.topic_pages, { ...result.hierarchy.topic_pages[0], page_id: "topic_duplicate" }] };
  assert.equal(api.auditLosslessOutput({ inventory: result.inventory, hierarchy: duplicated }).ok, false);
});
