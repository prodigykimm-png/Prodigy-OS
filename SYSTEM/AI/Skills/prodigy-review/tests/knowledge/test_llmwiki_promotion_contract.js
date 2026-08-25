"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const promotion = require(path.join(ROOT, "SYSTEM/Views/llmwiki-promotion-contract.js"));
const candidateCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const query = require(path.join(ROOT, "SYSTEM/Views/llmwiki-query-readonly.js"));

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function completeUnit(kind = "principle", overrides = {}) {
  const evidenceId = `evidence-${kind}-001`;
  const unit = {
    knowledge_kind: kind,
    classification: "epistemic",
    title: `${kind} promotion fixture`,
    statement: "A reusable, source-bound knowledge statement.",
    evidence: [{
      evidence_id: evidenceId,
      source_ref: "INBOX/source.md#section-1",
      strength: "sufficient"
    }],
    claims: [{
      claim_id: `claim-${kind}-001`,
      statement: "The source supports this reusable statement.",
      evidence_refs: [evidenceId],
      origin: "source_extract",
      review_status: "accepted"
    }],
    relation_status: "resolved",
    approval_status: "pending",
    claim_scope: "The claim applies to the stated source conditions.",
    principle_boundaries: {
      conditions: ["The stated conditions hold."],
      exclusions: ["The documented exception is excluded."],
      invalidation_conditions: ["Contrary source evidence is accepted."]
    },
    principle_rationale: "The stated mechanism connects condition and outcome.",
    procedure_preconditions: ["Start from the documented input."],
    procedure_steps: ["Perform the first bounded step.", "Verify the stated outcome."],
    procedure_outcome: "The documented result is produced.",
    concept_definition: "A concept is defined by its distinguishing properties.",
    concept_boundaries: ["It excludes the adjacent but different concept."]
  };
  return { ...unit, ...overrides };
}

function gatesById(receipt) {
  return Object.fromEntries(receipt.gates.map((gate) => [gate.gate_id, gate]));
}

function gapsFromGates(gates) {
  return gates.flatMap((gate) => ["pass", "not_applicable"].includes(gate.state) ? []
    : gate.reason_codes.map((reason_code) => ({
      gate_id: gate.gate_id,
      phase: gate.phase,
      state: gate.state,
      reason_code,
      evidence_refs: gate.evidence_refs
    })));
}

function testEveryCommonAndPerKindGate() {
  const expected = [
    "unit_scope", "statement", "evidence_refs", "claim_support", "ai_claim_review", "relation_resolution", "authorization",
    "claim_scope", "principle_boundaries", "principle_rationale",
    "procedure_preconditions", "procedure_steps", "procedure_outcome",
    "concept_definition", "concept_boundaries"
  ];

  for (const kind of promotion.KNOWLEDGE_KINDS) {
    const receipt = promotion.evaluatePromotion(completeUnit(kind));
    assert.deepEqual(receipt.gates.map((gate) => gate.gate_id), expected);
    assert.equal(receipt.disposition, "canonical_review");
    assert.equal(receipt.canonical_review_eligible, true);
    assert.deepEqual(receipt.blocking_content_gaps, []);
    const gates = gatesById(receipt);
    for (const gateId of expected) {
      const applicable = gateId === "unit_scope" || gateId === "statement" || gateId === "evidence_refs"
        || gateId === "claim_support" || gateId === "ai_claim_review" || gateId === "relation_resolution"
        || gateId === "authorization" || gateId.startsWith(`${kind}_`);
      assert.equal(gates[gateId].state, applicable ? (gateId === "authorization" ? "pending" : "pass") : "not_applicable");
      assert.equal(Array.isArray(gates[gateId].reason_codes), true);
      assert.equal(Array.isArray(gates[gateId].evidence_refs), true);
    }
  }
}

function testIncompletePrincipleRoutesOnlyContentGapsToCandidate() {
  const receipt = promotion.evaluatePromotion(completeUnit("principle", {
    evidence: [],
    claims: [{
      claim_id: "claim-principle-001",
      statement: "Unsupported principle claim.",
      evidence_refs: [],
      origin: "source_extract",
      review_status: "accepted"
    }],
    principle_boundaries: { conditions: [], exclusions: [], invalidation_conditions: [] }
  }));

  assert.equal(receipt.disposition, "candidate");
  assert.equal(receipt.candidate_eligible, true);
  assert.equal(receipt.canonical_review_eligible, false);
  assert.deepEqual(receipt.blocking_content_gaps.map((gap) => gap.reason_code), [
    "missing_evidence_refs", "unsupported_claim", "principle_boundaries_required"
  ]);
  assert.deepEqual(receipt.promotion_gaps.map((gap) => gap.reason_code), [
    "missing_evidence_refs", "unsupported_claim", "approval_required", "principle_boundaries_required"
  ]);
}

function testApprovalOnlyAndTerminalOutcomesAreDeterministic() {
  const pending = promotion.evaluatePromotion(completeUnit());
  const approved = promotion.evaluatePromotion(completeUnit("principle", { approval_status: "approved" }));
  const rejectedInput = completeUnit("principle", { approval_status: "rejected" });
  const rejected = promotion.evaluatePromotion(rejectedInput);

  assert.equal(pending.disposition, "canonical_review");
  assert.equal(pending.candidate_eligible, false);
  assert.equal(pending.canonical_review_eligible, true);
  assert.deepEqual(pending.blocking_content_gaps, []);
  assert.equal(approved.disposition, "canonical_review");
  assert.equal(approved.canonical_write_eligible, true);
  assert.equal(rejected.disposition, "rejected");
  assert.equal(rejected.terminal, true);
  assert.equal(rejected.candidate_eligible, false);
  assert.deepEqual(rejected, promotion.evaluatePromotion(copy(rejectedInput)));
}

function testHardGapsCannotBeOverriddenByApproval() {
  const thin = promotion.evaluatePromotion(completeUnit("claim", {
    approval_status: "approved",
    evidence: [{
      evidence_id: "evidence-claim-001",
      source_ref: "INBOX/source.md#section-1",
      strength: "thin"
    }]
  }));

  assert.equal(thin.disposition, "candidate");
  assert.equal(thin.canonical_review_eligible, false);
  assert.equal(thin.canonical_write_eligible, false);
  assert.deepEqual(thin.blocking_content_gaps.map((gap) => gap.reason_code), ["thin_evidence"]);
  assert.equal(gatesById(thin).evidence_refs.state, "fail");
}

function testDuplicateEvidenceIdentityFailsClosed() {
  const conflicting = completeUnit("claim", {
    approval_status: "approved",
    evidence: [
      { evidence_id: "evidence-claim-001", source_ref: "INBOX/source.md#supports", strength: "sufficient" },
      { evidence_id: "evidence-claim-001", source_ref: "INBOX/source.md#contradicts", strength: "sufficient" }
    ]
  });
  const identical = completeUnit("claim", {
    approval_status: "approved",
    evidence: [
      { evidence_id: "evidence-claim-001", source_ref: "INBOX/source.md#supports", strength: "sufficient" },
      { evidence_id: "evidence-claim-001", source_ref: "INBOX/source.md#supports", strength: "sufficient" }
    ]
  });

  for (const unit of [conflicting, identical]) {
    const receipt = promotion.evaluatePromotion(unit);
    assert.equal(receipt.disposition, "candidate");
    assert.equal(receipt.canonical_review_eligible, false);
    assert.equal(receipt.canonical_write_eligible, false);
    assert.deepEqual(gatesById(receipt).evidence_refs.reason_codes, ["duplicate_evidence_id"]);
    assert.equal(promotion.parseEvidence(unit.evidence).ok, false);
  }
}

function testOperationalAndAuthorizationBlocksDoNotCreateCandidates() {
  const operational = promotion.evaluatePromotion(completeUnit("principle", { classification: "operational" }));
  const unreviewedAi = promotion.evaluatePromotion(completeUnit("principle", {
    claims: [{
      claim_id: "claim-principle-001",
      statement: "AI interpretation requires acceptance.",
      evidence_refs: ["evidence-principle-001"],
      origin: "ai_interpretation",
      review_status: "unreviewed"
    }],
    approval_status: "approved"
  }));

  assert.equal(operational.disposition, "blocked");
  assert.equal(operational.candidate_eligible, false);
  assert.deepEqual(operational.promotion_gaps.map((gap) => gap.reason_code), ["operational_unit", "approval_required"]);
  assert.equal(unreviewedAi.disposition, "canonical_review");
  assert.equal(unreviewedAi.candidate_eligible, false);
  assert.equal(unreviewedAi.canonical_write_eligible, false);
  assert.deepEqual(unreviewedAi.promotion_gaps.map((gap) => gap.reason_code), ["unreviewed_ai_claim"]);
}

function testCandidatePersistenceAndPendingQueryStayBounded() {
  const incompleteUnit = completeUnit("principle", {
    evidence: [],
    claims: [],
    principle_boundaries: { conditions: [], exclusions: [], invalidation_conditions: [] }
  });
  const incomplete = promotion.evaluatePromotion(incompleteUnit);
  const candidateInput = {
    candidate_id: "candidate-promotion-001",
    title: "Incomplete principle",
    statement: "A principle still missing evidence and boundaries.",
    reason: "Promotion receipt reports content gaps.",
    source_type: "manual_study",
    source_evidence_ids: [],
    source_objects: [],
    source_note: "Review fixture",
    confidence: "explicit",
    suggested_domain: "reading",
    suggested_topics: [],
    approval_note: "",
    created: "2026-08-25T00:00:00.000Z",
    updated: "2026-08-25T00:00:00.000Z",
    promotion_unit: incompleteUnit
  };
  const candidate = candidateCore.createCandidateFromPromotion({
    ...candidateInput
  }, incomplete);

  assert.equal(candidate.status, "saved");
  assert.deepEqual(candidate.blocking_content_gaps.map((gap) => gap.reason_code), [
    "missing_evidence_refs", "unsupported_claim", "principle_boundaries_required"
  ]);
  const restarted = candidateCore.validateCandidate(copy(candidate));
  assert.equal(restarted.promotion_input_binding, incomplete.input_binding);
  assert.deepEqual(restarted.promotion_receipt, incomplete);
  assert.throws(
    () => candidateCore.setPromotionTarget(candidate, "ZETA/PERMANENT/incomplete.md"),
    /content or relation promotion gaps/i
  );
  assert.throws(
    () => candidateCore.createCandidateFromPromotion({ ...candidate, candidate_id: "candidate-complete-001" }, promotion.evaluatePromotion(completeUnit())),
    /receipt_mismatch/i
  );
  const forgedKnownGate = copy(incomplete);
  const statementGate = forgedKnownGate.gates.find((gate) => gate.gate_id === "statement");
  statementGate.state = "fail";
  statementGate.reason_codes = ["statement_required"];
  forgedKnownGate.promotion_gaps = gapsFromGates(forgedKnownGate.gates);
  forgedKnownGate.blocking_content_gaps = forgedKnownGate.promotion_gaps.filter((gap) => ["content", "relation"].includes(gap.phase));
  forgedKnownGate.locally_validated = true;
  assert.throws(
    () => candidateCore.createCandidateFromPromotion({ ...candidateInput, candidate_id: "candidate-forged-receipt-known-gate" }, forgedKnownGate),
    /receipt_mismatch/i
  );
  const forgedReceipt = copy(incomplete);
  forgedReceipt.promotion_gaps[0].gate_id = "unrecognized_gate";
  forgedReceipt.blocking_content_gaps[0].gate_id = "unrecognized_gate";
  assert.throws(
    () => candidateCore.createCandidateFromPromotion({ ...candidate, candidate_id: "candidate-forged-receipt-001" }, forgedReceipt),
    /invalid_promotion_receipt:receipt_mismatch/i
  );
  const wrongVersion = copy(incomplete);
  wrongVersion.contract_version = "llmwiki_promotion_contract_v0";
  assert.throws(
    () => candidateCore.createCandidateFromPromotion({ ...candidate, candidate_id: "candidate-forged-receipt-002" }, wrongVersion),
    /invalid_promotion_receipt:contract_version/i
  );
  const inconsistentGaps = copy(incomplete);
  inconsistentGaps.blocking_content_gaps = [];
  assert.throws(
    () => candidateCore.createCandidateFromPromotion({ ...candidate, candidate_id: "candidate-forged-receipt-003" }, inconsistentGaps),
    /invalid_promotion_receipt:receipt_mismatch/i
  );

  const snapshotRevision = "a".repeat(64);
  const result = query.queryRead({
    query: "incomplete",
    mode: "candidate",
    scope: {},
    snapshot: {
      snapshot_revision: snapshotRevision,
      current_revision: snapshotRevision,
      documents: [{
        document_id: candidate.candidate_id,
        type: candidate.type,
        status: candidate.status,
        title: candidate.title,
        statement: candidate.statement,
        path: "ZETA/CANDIDATES/incomplete.md",
        citations: []
      }]
    }
  });
  assert.equal(typeof hash.sha256, "function");
  assert.equal(result.ok, true);
  assert.equal(result.value.results[0].trust_status, "pending_candidate");
  assert.equal(result.value.results[0].canonical, false);
}

function testBoundedBoundaryRejectsHostileObjectGraphsWithoutReadingAccessors() {
  let getterCalls = 0;
  const accessorInput = completeUnit();
  Object.defineProperty(accessorInput, "title", { enumerable: true, get() { getterCalls += 1; return "forged"; } });
  const cyclicInput = completeUnit();
  cyclicInput.self = cyclicInput;
  let deepInput = completeUnit();
  for (let depth = 0; depth < 40; depth += 1) deepInput = { child: deepInput };
  const oversizedInput = completeUnit("principle", {
    claims: Array.from({ length: 1500 }, (_, index) => ({
      claim_id: `claim-${index}`,
      statement: `Statement ${index}`,
      evidence_refs: ["evidence-principle-001"],
      origin: "source_extract",
      review_status: "accepted"
    }))
  });
  const proxiedInput = new Proxy(completeUnit(), {});

  for (const input of [accessorInput, cyclicInput, deepInput, oversizedInput, proxiedInput]) {
    const receipt = promotion.evaluatePromotion(input);
    assert.equal(receipt.disposition, "blocked");
    assert.deepEqual(receipt.gates[0].reason_codes, ["malformed_input"]);
  }
  const accessorEvidence = {};
  Object.defineProperty(accessorEvidence, "evidence_id", { enumerable: true, get() { getterCalls += 1; return "forged"; } });
  assert.equal(promotion.parseEvidence([accessorEvidence]).ok, false);
  assert.throws(() => promotion.validateCandidateReceipt(accessorInput, completeUnit()), /invalid_promotion_receipt/u);
  assert.throws(() => promotion.createCanonicalApprovalPacket(accessorInput), /invalid_promotion_receipt/u);
  assert.equal(getterCalls, 0);
}

function testMalformedStaleAndUntrustedLabelsFailClosed() {
  const malformed = promotion.evaluatePromotion(null);
  const stale = promotion.evaluatePromotion(completeUnit("principle", { state: "stale" }));
  const injected = promotion.evaluatePromotion(completeUnit("principle", {
    classification: "operational",
    lifecycle_label: "verified",
    trust_status: "verified",
    approval_status: "approved"
  }));

  assert.equal(malformed.disposition, "blocked");
  assert.deepEqual(malformed.promotion_gaps.map((gap) => gap.reason_code), ["malformed_input"]);
  assert.equal(stale.disposition, "blocked");
  assert.deepEqual(stale.promotion_gaps.map((gap) => gap.reason_code), ["stale_state", "approval_required"]);
  assert.equal(injected.disposition, "blocked");
  assert.equal(injected.canonical_write_eligible, false);
  assert.equal(injected.trust_status, "unverified");
}

function main() {
  testEveryCommonAndPerKindGate();
  testIncompletePrincipleRoutesOnlyContentGapsToCandidate();
  testApprovalOnlyAndTerminalOutcomesAreDeterministic();
  testHardGapsCannotBeOverriddenByApproval();
  testDuplicateEvidenceIdentityFailsClosed();
  testOperationalAndAuthorizationBlocksDoNotCreateCandidates();
  testCandidatePersistenceAndPendingQueryStayBounded();
  testBoundedBoundaryRejectsHostileObjectGraphsWithoutReadingAccessors();
  testMalformedStaleAndUntrustedLabelsFailClosed();
  console.log("LLMWiki promotion contract tests passed");
}

main();
