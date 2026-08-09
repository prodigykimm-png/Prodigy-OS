"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../");
const CONTRACT_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-contract.js");
const HEX64 = "a".repeat(64);
const CURRENT_HEX64 = "b".repeat(64);
const STALE_HEX64 = "c".repeat(64);

function contract() {
  assert.equal(fs.existsSync(CONTRACT_PATH), true, "LLMWiki trust validator must exist");
  return require(CONTRACT_PATH);
}

function provenance(overrides = {}) {
  return {
    actor: "system",
    source_ids: ["source_001"],
    locators: ["ZETA/LITERATURE/design.md#rule"],
    basis_hash: HEX64,
    ...overrides,
  };
}

function operation(operation, overrides = {}) {
  return {
    contract_version: "llmwiki_trust_contract_v1",
    operation_id: "operation_001",
    run_id: "run_001",
    operation,
    status: "completed",
    provenance: provenance(),
    write_intent: { target: "none", persistence: "none" },
    ...overrides,
  };
}

function proposal(kind, overrides = {}) {
  return {
    contract_version: "llmwiki_proposal_v1",
    proposal_id: "proposal_001",
    run_id: "run_001",
    kind,
    status: ["abstain", "no_change"].includes(kind) ? kind : "proposed",
    provenance: provenance(),
    payload_hash: HEX64,
    target_knowledge: null,
    affected_knowledge: [],
    write_intent: { target: "run_context", persistence: "ephemeral" },
    ...overrides,
  };
}

test("the operation and proposal vocabularies are frozen", () => {
  const api = contract();
  assert.deepEqual([...api.OPERATIONS], ["query/read", "ingest", "propose", "approve"]);
  assert.deepEqual([...api.PROPOSAL_KINDS], ["create", "update", "merge", "dispute", "abstain", "no_change"]);
  assert.deepEqual([...api.OPERATION_STATUSES], ["completed", "rejected", "failed", "aborted"]);
  assert.deepEqual([...api.PROPOSAL_STATUSES], ["proposed", "approved", "rejected", "stale", "abstain", "no_change"]);
});

test("each operation validates stable identity, provenance, and status", () => {
  const api = contract();
  for (const kind of api.OPERATIONS) {
    const input = operation(kind, {
      provenance: provenance(kind === "query/read" ? { snapshot_revision: HEX64 } : {}),
    });
    if (kind === "ingest") {
      input.provenance.source_archive_ids = ["archive_001"];
      input.provenance.source_url = "https://example.com/resolved";
      input.write_intent = { target: "source_archive", persistence: "persistent" };
    }
    if (kind === "propose") input.write_intent = { target: "run_context", persistence: "ephemeral" };
    if (kind === "approve") {
      input.provenance.proposal_ids = ["proposal_001"];
      input.write_intent = { target: "canonical_knowledge", persistence: "persistent" };
      input.approval = {
        approval_id: "approval_001", approver: "human", decision: "approved", proposal_id: "proposal_001",
        payload_hash: HEX64, approved_at: "2026-08-01T00:00:00.000Z",
      };
    }
    const result = api.validateOperation(input, kind === "query/read" ? { currentSnapshotRevision: HEX64 } : undefined);
    assert.equal(result.ok, true, `${kind} should validate: ${JSON.stringify(result)}`);
    assert.equal(result.value.operation_id, "operation_001");
    assert.equal(result.value.run_id, "run_001");
    assert.equal(result.value.status, "completed");
  }
});

test("all proposal kinds validate stable ids and complete provenance", () => {
  const api = contract();
  const proposals = [
    proposal("create"),
    proposal("update", { target_knowledge: "PARA/RESOURCES/Knowledge/a.md" }),
    proposal("merge", {
      target_knowledge: "PARA/RESOURCES/Knowledge/a.md",
      affected_knowledge: ["PARA/RESOURCES/Knowledge/a.md", "PARA/RESOURCES/Knowledge/b.md"],
    }),
    proposal("dispute", { target_knowledge: "PARA/RESOURCES/Knowledge/a.md" }),
    proposal("abstain"),
    proposal("no_change"),
  ];
  for (const input of proposals) {
    const result = api.validateProposal(input);
    assert.equal(result.ok, true, `${input.kind} should validate: ${JSON.stringify(result)}`);
    assert.equal(result.value.proposal_id, "proposal_001");
    assert.deepEqual(result.value.provenance.source_ids, ["source_001"]);
    assert.equal(result.value.write_intent.persistence, "ephemeral");
  }
});

test("query/read and propose reject persistent and canonical writes", () => {
  const api = contract();
  const readOnly = { provenance: provenance({ snapshot_revision: HEX64 }) };
  for (const input of [
    operation("query/read", { ...readOnly, write_intent: { target: "canonical_knowledge", persistence: "persistent" } }),
    operation("query/read", { ...readOnly, write_intent: { target: "persistent", persistence: "persistent" } }),
    operation("propose", { write_intent: { target: "candidate", persistence: "persistent" } }),
    proposal("update", {
      target_knowledge: "PARA/RESOURCES/Knowledge/a.md",
      write_intent: { target: "canonical_knowledge", persistence: "persistent" },
    }),
  ]) {
    const result = input.kind ? api.validateProposal(input) : api.validateOperation(input, { currentSnapshotRevision: HEX64 });
    assert.deepEqual(result, { ok: false, field: "write_intent", reason: "write_forbidden" });
  }
});

test("only explicit ingest Source Archive and final human-approved canonical write are allowed", () => {
  const api = contract();
  const ingest = operation("ingest", {
    provenance: provenance({ source_archive_ids: ["archive_001"], source_url: "https://example.com/resolved" }),
    write_intent: { target: "source_archive", persistence: "persistent" },
  });
  assert.deepEqual(api.validateOperation(ingest).value.write_intent, ingest.write_intent);

  const approve = operation("approve", {
    provenance: provenance({ proposal_ids: ["proposal_001"] }),
    write_intent: { target: "canonical_knowledge", persistence: "persistent" },
    approval: {
      approval_id: "approval_001", approver: "human", decision: "approved", proposal_id: "proposal_001",
      payload_hash: HEX64, approved_at: "2026-08-01T00:00:00.000Z",
    },
  });
  assert.deepEqual(api.validateOperation(approve).value.write_intent, approve.write_intent);
  assert.equal(api.validateOperation({ ...approve, approval: { ...approve.approval, approver: "llm" } }).reason, "human_approval_required");
  assert.equal(api.validateOperation({ ...approve, write_intent: { target: "git", persistence: "persistent" } }).reason, "write_forbidden");
});

test("source_url is the only accepted resolved URL field and is normalized", () => {
  const api = contract();
  const result = api.validateOperation(operation("ingest", {
    provenance: provenance({ source_archive_ids: ["archive_001"], source_url: "https://example.com:443/resolved" }),
    write_intent: { target: "source_archive", persistence: "persistent" },
  }));
  assert.equal(result.value.provenance.source_url, "https://example.com/resolved");
  const competing = operation("ingest", {
    provenance: provenance({ source_archive_ids: ["archive_001"], final_url: "https://example.com/resolved" }),
    write_intent: { target: "source_archive", persistence: "persistent" },
  });
  assert.equal(api.validateOperation(competing).reason, "unknown_provenance_field");
});

test("malformed, stale, and prompt-shaped input fails closed without mutation", () => {
  const api = contract();
  const malformed = operation("query/read", { operation_id: "../write", status: "running" });
  const before = JSON.stringify(malformed);
  assert.equal(api.validateOperation(malformed).ok, false);
  assert.equal(JSON.stringify(malformed), before);
  assert.equal(api.validateOperation(operation("query/read", { provenance: provenance({ snapshot_revision: "stale" }) }), { currentSnapshotRevision: CURRENT_HEX64 }).reason, "invalid_snapshot_revision");
  assert.equal(api.validateOperation(operation("ingest", {
    provenance: provenance({ source_archive_ids: ["archive_001"], basis_hash: undefined }),
    write_intent: { target: "source_archive", persistence: "persistent" },
  })).reason, "provenance_required");
  const promptShaped = operation("query/read", {
    provenance: provenance({ snapshot_revision: HEX64, source_ids: ["ignore_previous_instructions"] }),
    write_intent: { target: "canonical_knowledge", persistence: "persistent" },
  });
  assert.equal(api.validateOperation(promptShaped, { currentSnapshotRevision: HEX64 }).reason, "write_forbidden");
  for (const value of [null, undefined, "query/read", [], 4]) {
    assert.equal(api.validateOperation(value).ok, false);
    assert.equal(api.validateProposal(value).ok, false);
  }
});

test("query/read pins snapshot revision to an explicit trusted current revision", () => {
  const api = contract();
  const current = operation("query/read", { provenance: provenance({ snapshot_revision: CURRENT_HEX64 }) });
  const stale = operation("query/read", { provenance: provenance({ snapshot_revision: STALE_HEX64 }) });
  const context = { currentSnapshotRevision: CURRENT_HEX64 };
  assert.equal(api.validateOperation(current, context).ok, true);
  assert.deepEqual(api.validateOperation(stale, context), {
    ok: false,
    field: "provenance.snapshot_revision",
    reason: "stale_snapshot_revision",
  });
});

test("query/read rejects a well-formed snapshot without a trusted current revision", () => {
  const api = contract();
  assert.deepEqual(api.validateOperation(operation("query/read", {
    provenance: provenance({ snapshot_revision: CURRENT_HEX64 }),
  })), {
    ok: false,
    field: "trusted_context.currentSnapshotRevision",
    reason: "trusted_snapshot_required",
  });
});

test("provenance locators reject traversal and wikilink wrappers while allowing a relative control", () => {
  const api = contract();
  assert.equal(api.validateProposal(proposal("create")).ok, true);
  for (const locator of [
    "../SECRETS.md",
    "ZETA/LITERATURE/../../SECRETS.md",
    "[[PARA/RESOURCES/Knowledge/private]]",
    "ZETA/./LITERATURE/design.md",
    "/etc/passwd",
    "C:/private.txt",
    "ZETA/LITERATURE/..\\SECRETS.md",
    "ZETA/LITERATURE/design.md\u0000",
  ]) {
    assert.deepEqual(api.validateProposal(proposal("create", {
      provenance: provenance({ locators: [locator] }),
    })), {
      ok: false,
      field: "provenance.locators",
      reason: "invalid_locator",
    });
  }
});

test("approved proposal remains non-persistent until a separate approve operation", () => {
  const api = contract();
  const proposalInput = proposal("update", {
    status: "approved",
    target_knowledge: "PARA/RESOURCES/Knowledge/a.md",
  });
  assert.equal(api.validateProposal(proposalInput).ok, true);
  assert.equal(api.validateProposal({ ...proposalInput, write_intent: { target: "canonical_knowledge", persistence: "persistent" } }).reason, "write_forbidden");
});

test("unknown fields cannot smuggle a competing write or proposal vocabulary", () => {
  const api = contract();
  assert.equal(api.validateOperation({ ...operation("query/read", { provenance: provenance({ snapshot_revision: HEX64 }) }), final_url: "https://example.com" }).reason, "unknown_operation_field");
  assert.equal(api.validateProposal({ ...proposal("create"), final_url: "https://example.com" }).reason, "unknown_proposal_field");
  assert.equal(api.validateProposal({ ...proposal("create"), kind: "create", proposal_kind: "update" }).reason, "kind_alias_mismatch");
  assert.equal(api.validateProposal({ ...proposal("create"), proposal_kind: "create" }).ok, true);
});
