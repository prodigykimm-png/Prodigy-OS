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

test("quality summary exposes only actionable counts", () => {
  const summary = quality.summarize({ inventory_claims: [{ role: "reusable_claim" }, { role: "source_summary" }], pages: [{}, {}], source_only_claim_ids: ["a"], possible_gaps: [{}, {}], holds: [{}] });
  assert.equal(summary.text, "claims 2 · draft 2 · source-only 1 · 누락 후보 2 · hold 1");
});

test("short generic map fragments do not create noisy gaps", () => {
  const result = quality.audit({ map_claims: [{ claim_id: "x", text: "중요하다", evidence_quote: "중요하다" }], inventory_claims: [] });
  assert.equal(result.possible_gaps.length, 0);
});
