"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const operationContract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
const routing = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-routing-contract.js"));
const identity = require(path.join(ROOT, "SYSTEM/Views/llmwiki-identity-resolution.js"));

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

function knowledgeUnit(overrides = {}) {
  return {
    unit_id: "unit_knowledge",
    lane: "epistemic",
    semantic_type: "reusable_knowledge",
    promotion_complete: true,
    identity: { identity_key: "principle-routing", content_hash: A, candidates: [] },
    ...overrides,
  };
}

function assertNoWriterAuthority(value) {
  const text = JSON.stringify(value);
  for (const field of ["path", "bytes", "writer", "write_packet", "after_bytes", "before_bytes"]) {
    assert.equal(Object.hasOwn(value, field), false, field);
    assert.equal(text.includes(`\"${field}`), false, field);
  }
}

test("characterization: the existing operation contract exposes the only lifecycle operations", () => {
  assert.deepEqual(operationContract.OPERATION_KINDS, ["create", "update", "merge", "noop"]);
});

test("every lane deterministically reaches only its allowed lifecycle destination", () => {
  const cases = [
    [
      { unit_id: "unit_literature", lane: "epistemic", semantic_type: "source_material", source_bound: true, identity: { identity_key: "literature", content_hash: A, candidates: [] } },
      "epistemic", "literature",
    ],
    [
      { unit_id: "unit_fleeting", lane: "epistemic", semantic_type: "personal_thought", identity: { identity_key: "fleeting", content_hash: A, candidates: [] } },
      "epistemic", "fleeting",
    ],
    [knowledgeUnit({ unit_id: "unit_candidate", promotion_complete: false, identity: { identity_key: "candidate", content_hash: A, candidates: [] } }), "epistemic", "knowledge_candidate"],
    [knowledgeUnit(), "epistemic", "canonical_knowledge"],
    [
      { unit_id: "unit_object", lane: "operational", semantic_type: "object_state", target: { object_type: "project", slot: "progress_note" }, identity: { identity_key: "object", content_hash: A, candidates: [] } },
      "operational", "para_object",
    ],
    [{ unit_id: "unit_none", lane: "none", semantic_type: "none" }, "none", "none"],
  ];
  for (const [unit, lane, destination] of cases) {
    const result = routing.routeLifecycle(unit);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.lane, lane);
    assert.equal(result.value.destination, destination);
    assertNoWriterAuthority(result.value);
  }
});

test("identity relations derive all operation kinds locally without provider operation selection", () => {
  const cases = [
    ["new_identity", { identity_key: "new", content_hash: A, candidates: [] }, "create"],
    ["same_identity", { identity_key: "same", content_hash: A, candidates: [{ identity_id: "identity_same", identity_key: "same", content_hash: B, revision: A }] }, "update"],
    ["consolidation", { identity_key: "consolidate", content_hash: A, candidates: [{ identity_id: "identity_one", identity_key: "consolidate", content_hash: B, revision: A }, { identity_id: "identity_two", identity_key: "consolidate", content_hash: C, revision: B }], consolidation_ids: ["identity_one", "identity_two"] }, "merge"],
    ["exact_duplicate", { identity_key: "duplicate", content_hash: A, candidates: [{ identity_id: "identity_duplicate", identity_key: "duplicate", content_hash: A, revision: A }] }, "noop"],
  ];
  for (const [relation, input, operation] of cases) {
    const resolved = identity.resolveIdentity(input);
    assert.equal(resolved.ok, true, `${relation}: ${JSON.stringify(resolved)}`);
    assert.equal(resolved.value.relation, relation);
    const routed = routing.routeLifecycle(knowledgeUnit({ identity: input }));
    assert.equal(routed.ok, true, `${relation}: ${JSON.stringify(routed)}`);
    assert.equal(routed.value.identity_relation, relation);
    assert.equal(routed.value.operation, operation);
    assert.equal(operationContract.OPERATION_KINDS.includes(routed.value.operation), true);
  }
});

test("stale identity state is re-resolved locally before create or update decisions", () => {
  const createInput = knowledgeUnit({ identity: { identity_key: "fresh", content_hash: A, candidates: [] } });
  assert.equal(routing.routeLifecycle(createInput).value.operation, "create");
  const afterConcurrentCreate = knowledgeUnit({ identity: { identity_key: "fresh", content_hash: A, candidates: [{ identity_id: "identity_fresh", identity_key: "fresh", content_hash: B, revision: B }] } });
  assert.equal(routing.routeLifecycle(afterConcurrentCreate).value.operation, "update");

  const updateInput = knowledgeUnit({ identity: { identity_key: "updated", content_hash: A, candidates: [{ identity_id: "identity_updated", identity_key: "updated", content_hash: B, revision: A }] } });
  assert.equal(routing.routeLifecycle(updateInput).value.operation, "update");
  const afterConcurrentDuplicate = knowledgeUnit({ identity: { identity_key: "updated", content_hash: A, candidates: [{ identity_id: "identity_updated", identity_key: "updated", content_hash: A, revision: B }] } });
  assert.equal(routing.routeLifecycle(afterConcurrentDuplicate).value.operation, "noop");
});

test("consolidation never represents deletion and ambiguity is review-only", () => {
  const consolidation = routing.routeLifecycle(knowledgeUnit({ identity: { identity_key: "consolidate", content_hash: A, candidates: [{ identity_id: "identity_one", identity_key: "consolidate", content_hash: B, revision: A }, { identity_id: "identity_two", identity_key: "consolidate", content_hash: C, revision: B }], consolidation_ids: ["identity_one", "identity_two"] } }));
  assert.equal(consolidation.ok, true);
  assert.equal(consolidation.value.operation, "merge");
  assert.equal(JSON.stringify(consolidation.value).includes("delete"), false);

  const ambiguous = routing.routeLifecycle(knowledgeUnit({ identity: { identity_key: "ambiguous", content_hash: A, candidates: [{ identity_id: "identity_one", identity_key: "ambiguous", content_hash: B, revision: A }, { identity_id: "identity_two", identity_key: "ambiguous", content_hash: C, revision: B }] } }));
  assert.equal(ambiguous.ok, true, JSON.stringify(ambiguous));
  assert.equal(ambiguous.value.identity_relation, "ambiguous");
  assert.equal(ambiguous.value.destination, "canonical_knowledge");
  assert.equal(ambiguous.value.review_state, "hold");
  assert.equal(Object.hasOwn(ambiguous.value, "operation"), false);
  assertNoWriterAuthority(ambiguous.value);
});

test("mixed units split into linked single-authority units and never grant PARA and ZETA to one decision", () => {
  const result = routing.routeLifecycle({
    unit_id: "unit_mixed",
    lane: "mixed",
    components: [
      { unit_id: "unit_mixed_knowledge", lane: "epistemic", semantic_type: "reusable_knowledge", promotion_complete: true, identity: { identity_key: "mixed-knowledge", content_hash: A, candidates: [] } },
      { unit_id: "unit_mixed_object", lane: "operational", semantic_type: "object_state", target: { object_type: "people", slot: "memo" }, identity: { identity_key: "mixed-object", content_hash: B, candidates: [] } },
    ],
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.lane, "mixed");
  assert.equal(result.value.decisions.length, 2);
  assert.deepEqual(result.value.decisions.map((item) => item.destination).sort(), ["canonical_knowledge", "para_object"]);
  assert.equal(new Set(result.value.decisions.map((item) => item.link_id)).size, 1);
  for (const decision of result.value.decisions) {
    assert.equal(["canonical_knowledge", "para_object"].includes(decision.destination), true);
    assert.equal(Array.isArray(decision.destination), false);
    assertNoWriterAuthority(decision);
  }
});

test("untrusted routing instructions, unknown target slots, semantic-only similarity, and malformed input fail closed", () => {
  const forbidden = [
    knowledgeUnit({ destination: "para_object" }),
    knowledgeUnit({ operation: "merge" }),
    knowledgeUnit({ path: "ZETA/PERMANENT/forged.md" }),
    knowledgeUnit({ after_bytes: "forged" }),
    knowledgeUnit({ provider: { destination: "canonical_knowledge" } }),
    { unit_id: "bad_slot", lane: "operational", semantic_type: "object_state", target: { object_type: "project", slot: "unknown_slot" }, identity: { identity_key: "bad-slot", content_hash: A, candidates: [] } },
    knowledgeUnit({ identity: { identity_key: "semantic-only", content_hash: A, candidates: [{ identity_id: "identity_semantic", identity_key: "semantic-only", content_hash: B, revision: A, similarity: 1 }] } }),
    null,
  ];
  for (const unit of forbidden) {
    const result = routing.routeLifecycle(unit);
    assert.equal(result.ok, false, JSON.stringify(result));
    assertNoWriterAuthority(result);
  }

  const semanticOnly = routing.routeLifecycle(knowledgeUnit({ identity: { identity_key: "semantic-only-safe", content_hash: A, candidates: [{ identity_id: "identity_semantic_safe", identity_key: "semantic-only-safe", content_hash: B, revision: A }] } }));
  assert.equal(semanticOnly.ok, true);
  assert.equal(semanticOnly.value.operation, "update");
  assert.notEqual(semanticOnly.value.operation, "noop");
});
