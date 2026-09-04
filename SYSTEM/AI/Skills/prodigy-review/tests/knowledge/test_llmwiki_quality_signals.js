"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const quality = require(path.join(ROOT, "SYSTEM/Views/llmwiki-quality-signals.js"));

const mapClaims = [
  { claim_id: "map_a", text: "취득세는 취득 시점에 확인한다.", evidence_quote: "취득세는 취득 시점에 확인한다." },
  { claim_id: "map_b", text: "조합원 지위 양도 예외를 검토한다.", evidence_quote: "조합원 지위 양도 예외를 검토한다." },
];

test("quality audit reports only unmatched map evidence as advisory gaps", () => {
  const result = quality.audit({ map_claims: mapClaims, inventory_claims: [{ claim_id: "final_a", text: "취득 시점에는 취득세를 확인한다." }] });
  assert.equal(result.status, "advisory");
  assert.equal(result.possible_gaps.length, 1);
  assert.equal(result.possible_gaps[0].map_claim_id, "map_b");
  assert.equal(result.blocks_approval, false);
});

test("semantic source coverage audits scoped units against final inventory citation spans", () => {
  const sourcePath = "INBOX/웨딩 스냅.md";
  const result = quality.audit({
    source_path: sourcePath,
    scope_start: 10,
    semantic_units: [
      { key: "evidence_1", text: "첫 지시", start: 0, end: 4 },
      { key: "evidence_2", text: "둘 지시", start: 5, end: 9 },
    ],
    inventory_citations: [
      { citation_id: "citation_first", locators: [sourcePath, `${sourcePath}#10-14`] },
      { citation_id: "citation_second", locators: [sourcePath, `${sourcePath}#15-19`] },
    ],
    source_bytes: 10,
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.source_coverage, { total: 2, covered: 2, missing: 0, holds: 0, duplicates: 0 });
  assert.deepEqual(result.units.map((unit) => unit.span), [{ start: 0, end: 4, global_start: 10, global_end: 14 }, { start: 5, end: 9, global_start: 15, global_end: 19 }]);
  assert.equal(result.source_bytes, 10);
  assert.equal(result.blocks_approval, false);
});

test("semantic source coverage fails closed for missing, duplicate, and held units", () => {
  const sourcePath = "INBOX/coverage.md";
  const units = [
    { key: "evidence_1", text: "첫 지시", start: 0, end: 4 },
    { key: "evidence_2", text: "둘 지시", start: 5, end: 9 },
    { key: "evidence_3", text: "셋 지시", start: 10, end: 14 },
  ];
  const result = quality.audit({
    source_path: sourcePath,
    semantic_units: units,
    inventory_citations: [
      { citation_id: "citation_first_a", evidence_quote: "첫 지시", locators: [`${sourcePath}#0-4`] },
      { citation_id: "citation_first_b", evidence_quote: "다른 근거", locators: [`${sourcePath}#0-4`] },
      { citation_id: "citation_second", locators: [`${sourcePath}#5-9`] },
    ],
    holds: [{ item: { span: { start: 10, end: 14 } } }],
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.reason, "source_coverage_incomplete");
  assert.deepEqual(result.source_coverage, { total: 3, covered: 1, missing: 0, holds: 1, duplicates: 1 });
  assert.deepEqual(result.units.map((unit) => unit.status), ["duplicate", "covered", "held"]);
  assert.equal(result.blocks_approval, true);
});

test("semantic source coverage requires an exact in-bounds citation span", () => {
  const sourcePath = "INBOX/exact.md";
  const units = [
    { key: "evidence_1", text: "첫 단위", start: 0, end: 4 },
    { key: "evidence_2", text: "둘 단위", start: 4, end: 8 },
  ];
  const straddling = quality.audit({
    source_path: sourcePath, source_length: 8, scope_end: 8, semantic_units: units,
    inventory_citations: [{ citation_id: "citation_straddle", locators: [`${sourcePath}#2-6`] }],
  });
  assert.equal(straddling.status, "review_required");
  assert.equal(straddling.reason, "source_coverage_incomplete");
  assert.deepEqual(straddling.source_coverage, { total: 2, covered: 0, missing: 2, holds: 0, duplicates: 0 });

  const outOfBounds = quality.audit({
    source_path: sourcePath, scope_start: 10, scope_end: 14, source_length: 20,
    semantic_units: [{ key: "evidence_1", text: "범위", start: 0, end: 4 }],
    inventory_citations: [
      { citation_id: "citation_before_scope", locators: [`${sourcePath}#9-14`] },
      { citation_id: "citation_beyond_source", locators: [`${sourcePath}#10-21`] },
    ],
  });
  assert.equal(outOfBounds.status, "review_required");
  assert.equal(outOfBounds.reason, "source_coverage_incomplete");
  assert.deepEqual(outOfBounds.source_coverage, { total: 1, covered: 0, missing: 1, holds: 0, duplicates: 0 });
});

test("semantic source coverage permits only provenance-compatible exact duplicates", () => {
  const sourcePath = "INBOX/duplicates.md";
  const input = { source_path: sourcePath, source_length: 4, scope_end: 4, semantic_units: [{ key: "evidence_1", text: "근거", start: 0, end: 4 }] };
  const compatible = quality.audit({ ...input, inventory_citations: [
    { citation_id: "citation_a", source_id: "source_a", content_hash: "hash_a", evidence_quote: "근거", locators: [`${sourcePath}#0-4`] },
    { citation_id: "citation_b", source_id: "source_a", content_hash: "hash_a", evidence_quote: "근거", locators: [`${sourcePath}#0-4`] },
  ] });
  assert.equal(compatible.status, "complete");
  assert.deepEqual(compatible.source_coverage, { total: 1, covered: 1, missing: 0, holds: 0, duplicates: 0 });

  const incompatible = quality.audit({ ...input, inventory_citations: [
    { citation_id: "citation_a", source_id: "source_a", content_hash: "hash_a", evidence_quote: "근거", locators: [`${sourcePath}#0-4`] },
    { citation_id: "citation_b", source_id: "source_b", content_hash: "hash_b", evidence_quote: "다른 근거", locators: [`${sourcePath}#0-4`] },
  ] });
  assert.equal(incompatible.status, "review_required");
  assert.equal(incompatible.reason, "source_coverage_incomplete");
  assert.deepEqual(incompatible.source_coverage, { total: 1, covered: 0, missing: 0, holds: 0, duplicates: 1 });
});

test("semantic source coverage unions mixed hold representations by hold identity", () => {
  const sourcePath = "INBOX/holds.md";
  const result = quality.audit({
    source_path: sourcePath, source_length: 12, scope_end: 12,
    semantic_units: [
      { key: "evidence_1", text: "첫 근거", start: 0, end: 4 },
      { key: "evidence_2", text: "둘 근거", start: 4, end: 8 },
      { key: "evidence_3", text: "셋 근거", start: 8, end: 12 },
    ],
    inventory_citations: [
      { citation_id: "citation_1", locators: [`${sourcePath}#0-4`] },
      { citation_id: "citation_2", locators: [`${sourcePath}#4-8`] },
      { citation_id: "citation_3", locators: [`${sourcePath}#8-12`] },
    ],
    holds: [
      { hold_id: "hold_one", span: { start: 0, end: 4 }, item: { span: { start: 0, end: 4 } } },
      { hold_id: "hold_one", item: { span: { start: 0, end: 4 } } },
      { unit_id: "hold_two", item: { evidence_key: "evidence_2" } },
      { hold_id: "hold_three", span: { start: 8, end: 12 } },
    ],
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.reason, "source_coverage_incomplete");
  assert.deepEqual(result.source_coverage, { total: 3, covered: 0, missing: 0, holds: 3, duplicates: 0 });
  assert.deepEqual(result.units.map((unit) => unit.status), ["held", "held", "held"]);
});

test("quality summary exposes only actionable counts", () => {
  const summary = quality.summarize({ inventory_claims: [{ role: "reusable_claim" }, { role: "source_summary" }], pages: [{}, {}], source_only_claim_ids: ["a"], possible_gaps: [{}, {}], holds: [{}] });
  assert.equal(summary.text, "claims 2 · draft 2 · source-only 1 · 누락 후보 2 · hold 1");
});

test("short generic map fragments do not create noisy gaps", () => {
  const result = quality.audit({ map_claims: [{ claim_id: "x", text: "중요하다", evidence_quote: "중요하다" }], inventory_claims: [] });
  assert.equal(result.possible_gaps.length, 0);
});
