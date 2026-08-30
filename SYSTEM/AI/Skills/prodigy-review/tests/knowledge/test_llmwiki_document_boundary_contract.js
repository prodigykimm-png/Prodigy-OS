"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const boundary = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-boundary-contract.js"));

function page(id, key, archetype, question, claimIds) {
  return { page_id: `page_${id.padStart(24, "0")}`, canonical_key: key, archetype, reader_question: question, claim_ids: claimIds };
}

test("stable page identity ignores title prose", () => {
  const first = boundary.createPageIdentity({ canonical_key: "real-estate/enforcement", archetype: "procedure_workflow", reader_question: "낙찰 후 점유를 어떻게 인도받는가?" });
  const second = boundary.createPageIdentity({ canonical_key: "real-estate/enforcement", archetype: "procedure_workflow", reader_question: "낙찰 뒤 점유 인도 절차는?" });
  assert.equal(first.ok, true);
  assert.equal(first.value.page_id, second.value.page_id);
  assert.equal(first.writer_count, 0);
});

test("investment constraints reject mixed tax rights and case pages", () => {
  const plan = [
    page("1", "real-estate/mixed", "concept_reference", "거래 전 무엇을 확인하는가?", ["tax", "lien"]),
    page("2", "real-estate/case", "case_context", "특수 사례는 무엇인가?", ["location", "heater", "floorplan"]),
  ];
  const result = boundary.validatePlan({ pages: plan, must_link: [], cannot_link: [["tax", "lien"], ["location", "heater"], ["heater", "floorplan"]] });
  assert.equal(result.ok, true);
  assert.equal(result.status, "revision_required");
  assert.deepEqual(result.findings.map((row) => row.code), ["cannot_link_violation", "cannot_link_violation", "cannot_link_violation"]);
  assert.equal(result.writer_count, 0);
});

test("song constraints preserve enforcement flow but split cancellation workflow", () => {
  const valid = [
    page("1", "real-estate/enforcement", "procedure_workflow", "낙찰 후 점유를 어떻게 인도받는가?", ["negotiation", "delivery_order", "injunction", "execution"]),
    page("2", "real-estate/sale-cancellation", "procedure_workflow", "매각 결정에 어떻게 대응하는가?", ["denial", "public_sale_cancel", "field_report"]),
  ];
  const result = boundary.validatePlan({ pages: valid, must_link: [["delivery_order", "execution"]], cannot_link: [["execution", "denial"], ["public_sale_cancel", "title_change"]] });
  assert.equal(result.status, "pass");
  const broad = [
    { ...valid[0], claim_ids: [...valid[0].claim_ids, "denial"] },
    { ...valid[1], claim_ids: valid[1].claim_ids.filter((claimId) => claimId !== "denial") },
  ];
  assert.equal(boundary.validatePlan({ pages: broad, must_link: [], cannot_link: [["execution", "denial"]] }).status, "revision_required");
});
