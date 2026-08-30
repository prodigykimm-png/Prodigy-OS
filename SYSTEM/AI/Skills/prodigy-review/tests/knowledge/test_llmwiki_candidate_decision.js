"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const decision = require(path.join(ROOT, "SYSTEM/Views/llmwiki-candidate-decision.js"));

test("candidate relation maps to orthogonal operation decisions", () => {
  const base = { page_identity: "page_real_estate_rights", candidates: [{ candidate_id: "cand_rights", identity_match: "canonical_id", lexical_score: 1 }] };
  assert.equal(decision.decide({ ...base, content_relation: "duplicate" }).action, "no_change");
  assert.equal(decision.decide({ ...base, content_relation: "compatible_new" }).action, "update");
  assert.equal(decision.decide({ ...base, content_relation: "contradiction" }).action, "contradiction");
  assert.equal(decision.decide({ page_identity: "page_new", candidates: [], content_relation: "new" }).action, "create");
  assert.equal(decision.decide({ page_identity: "page_context", candidates: [], content_relation: "new", source_only_authority: true }).action, "source_only");
});

test("ambiguous candidate remains a quality hold without write authority", () => {
  const result = decision.decide({ page_identity: "page_real_estate_rights", content_relation: "compatible_new", candidates: [
    { candidate_id: "cand_a", identity_match: "lexical", lexical_score: 0.82 },
    { candidate_id: "cand_b", identity_match: "lexical", lexical_score: 0.80 },
  ] });
  assert.equal(result.action, "hold");
  assert.equal(result.reason, "candidate_margin_insufficient");
  assert.equal(result.writer_count, 0);
});

test("semantic ordering cannot change the deterministic candidate", () => {
  const candidates = [
    { candidate_id: "cand_exact", identity_match: "registered_alias", lexical_score: 0.2, semantic_score: 0.1 },
    { candidate_id: "cand_semantic", identity_match: "lexical", lexical_score: 0.99, semantic_score: 1 },
  ];
  const result = decision.decide({ page_identity: "page_rights", content_relation: "compatible_new", candidates });
  assert.equal(result.candidate_id, "cand_exact");
  assert.equal(result.action, "update");
});
