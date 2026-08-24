"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const REBASELINE_MANIFEST_PATH = path.join(ROOT, "SYSTEM/docs/LLMWiki_Productization_Rebaseline_v1.json");
const approval = require(path.join(ROOT, "SYSTEM/Views/llmwiki-approval-packet.js"));
const canonical = require(path.join(ROOT, "SYSTEM/Views/llmwiki-canonical-packet.js"));
const operationContract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
const consent = require(path.join(ROOT, "SYSTEM/Views/llmwiki-outbound-consent.js"));
const reviewCommit = require(path.join(ROOT, "SYSTEM/Views/llmwiki-approval-review-commit.js"));
const commit = require(path.join(ROOT, "SYSTEM/Views/llmwiki-deterministic-commit.js"));
const pipeline = require(path.join(ROOT, "SYSTEM/Views/llmwiki-librarian-pipeline.js"));
const proposalBundle = require(path.join(ROOT, "SYSTEM/Views/llmwiki-proposal-bundle.js"));
const review = require(path.join(ROOT, "SYSTEM/Views/llmwiki-approval-review-view.js"));
const runState = require(path.join(ROOT, "SYSTEM/Views/llmwiki-run-state.js"));
const fixtures = require("./llmwiki_librarian_pipeline_fixtures.js");
const { FakeElement } = require("./knowledge_explorer_view_fakes.js");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findAction(root, action) {
  if (root && root.attr && root.attr["data-action"] === action) return root;
  for (const child of root && root.children || []) {
    const found = findAction(child, action);
    if (found) return found;
  }
  return null;
}

function findOperationInput(root, operationId) {
  if (root && root.tag === "input" && root.attr && root.attr["data-operation-id"] === operationId) return root;
  for (const child of root && root.children || []) {
    const found = findOperationInput(child, operationId);
    if (found) return found;
  }
  return null;
}

function click(node) {
  assert.ok(node && typeof node.onclick === "function", "expected an actionable control");
  node.onclick({ preventDefault() {} });
}

async function packetFixture(runId = "run_productization_rebaseline") {
  const input = fixtures.requestInput({ run_id: runId });
  const envelope = await pipeline.runLibrarian(input, { transport: async () => fixtures.sixKindProviderResponse(input.run_id, input.sources) });
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  const built = approval.buildApprovalPacket(envelope.value);
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.value;
}

function operation(packet, kind = "create") {
  const selected = packet.operations.find((item) => item.proposal_kind === kind);
  assert.ok(selected, `missing ${kind} operation`);
  return selected;
}

function liveAdapter() {
  const files = new Map();
  const receipts = new Map();
  const calls = [];
  const counters = { reads: 0 };
  return {
    files,
    receipts,
    calls,
    counters,
    adapter: {
      readBytes(targetPath) { counters.reads += 1; return files.has(targetPath) ? files.get(targetPath) : null; },
      readReceipt(nonce) { return receipts.has(nonce) ? clone(receipts.get(nonce)) : null; },
      commitExact(mutation) {
        calls.push(clone(mutation));
        files.set(mutation.target_path, mutation.after_bytes);
        receipts.set(mutation.nonce, clone(mutation.audit));
        return { ok: true, status: "committed" };
      },
    },
  };
}

function canonicalOperation(create) {
  const serialized = JSON.stringify({
    operation_id: create.operation_id,
    proposal_id: create.proposal_id,
    proposal_kind: "create",
    payload_hash: create.payload_hash,
  });
  const parsed = operationContract.parseCanonicalOperation(serialized);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(operationContract.isCanonicalOperationRecord(parsed.value), true);
  assert.equal(operationContract.isCanonicalPacketOperationRecord(parsed.value), false);
  return { value: parsed.value, serialized };
}

function canonicalRequest(approvalPacket, create, operationRecord) {
  const reviewed = create.reviewed_payload;
  const statement = reviewed.claims[0].text;
  return {
    run_id: approvalPacket.run_id,
    consent_hash: "c".repeat(64),
    operation: operationRecord,
    canonical_document: {
      title: reviewed.title,
      statement,
      knowledge_domain: "reading",
      knowledge_topics: [],
      application_trigger: "",
      application_contexts: [],
      connections: [],
      invalidation_conditions: [],
      summary: "",
      created: "2026-08-02T00:00:00.000Z",
      updated: "2026-08-02T00:00:00.000Z",
      body: `# ${reviewed.title}\n\n${statement}\n`,
    },
    source_citations: create.source_citations,
    expires_at: "2099-01-01T00:00:00.000Z",
    nonce: `nonce_rebaseline_${approvalPacket.packet_hash.slice(0, 24)}`,
  };
}

async function canonicalContext(approvalPacket, live = liveAdapter()) {
  const create = operation(approvalPacket);
  const canonicalOperationRecord = canonicalOperation(create);
  const unbrandedControls = [
    ["raw", JSON.parse(canonicalOperationRecord.serialized)],
    ["spread", { ...canonicalOperationRecord.value }],
    ["copied", Object.assign({}, canonicalOperationRecord.value)],
    ["unbranded", clone(canonicalOperationRecord.value)],
  ];
  for (const [name, operationRecord] of unbrandedControls) {
    const rejectedLive = liveAdapter();
    const rejected = await canonical.assembleCanonicalPacket(
      canonicalRequest(approvalPacket, create, operationRecord),
      rejectedLive.adapter,
    );
    assert.equal(rejected.ok, false, name);
    assert.equal(rejected.reason, "serialized_operation_required", name);
    assert.equal(rejectedLive.counters.reads, 0, `${name}: live reads`);
    assert.equal(rejectedLive.calls.length, 0, `${name}: writer calls`);
    assert.equal(rejectedLive.files.size, 0, `${name}: canonical writes`);
    assert.equal(rejectedLive.receipts.size, 0, `${name}: audit writes`);
  }

  const assembled = await canonical.assembleCanonicalPacket(
    canonicalRequest(approvalPacket, create, canonicalOperationRecord.value),
    live.adapter,
  );
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  assert.equal(operationContract.isCanonicalPacketOperationRecord(assembled.value.operation), true);
  const packetOperation = assembled.value.operation;
  const authorized = reviewCommit.authorizeCanonicalPacket(assembled.value, {
    action: "approve_selected",
    selection_ids: [create.operation_id],
  });
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  assert.strictEqual(assembled.value.operation, packetOperation, "authorization must preserve the packet-operation private brand");
  assert.equal(operationContract.isCanonicalPacketOperationRecord(assembled.value.operation), true);
  return {
    approvalPacket,
    operation: create,
    live,
    packet: assembled.value,
    authorization: authorized.value,
    request: reviewCommit.buildCommitRequest({ packet: assembled.value, authorization: authorized.value, adapter: live.adapter }),
  };
}

function packetBoundBuilder(contexts) {
  return ({ packet, authorizationResult }) => {
    const context = contexts.get(packet.packet_hash);
    assert.ok(context, "approval packet must map to a canonical packet context");
    assert.deepEqual(clone(authorizationResult.selection_set), [context.operation.operation_id]);
    return context.request;
  };
}

function rehashPacket(packet, mutate) {
  const changed = clone(packet);
  changed.operation = packet.operation;
  mutate(changed);
  const identity = clone(changed);
  identity.operation = packet.operation;
  delete identity.packet_hash;
  delete identity.canonical_serialization;
  changed.canonical_serialization = stable(identity);
  changed.packet_hash = sha256(changed.canonical_serialization);
  return changed;
}

test("Baseline characterization: create-only trust invariants remain observable", async () => {
  const consentRequest = {
    feature: "llmwiki",
    source_scope: { allowed_source_ids: ["source_rebaseline"], allowed_locator_prefixes: ["ZETA/LITERATURE/"], allow_private_sources: false },
    outbound_policy: { include_unselected_vault_data: false, include_credentials: false, include_cookies: false },
    timeout_ms: 5000,
    retry_owner: "prodigy",
    request_metadata: { request_id: "request_rebaseline", provider_key: "gemini" },
    sources: [{
      source_id: "source_rebaseline", content_hash: "a".repeat(64), selected: true,
      outbound_text: "Selected source bytes remain data.",
    }],
    proposal_request: { run_id: "run_rebaseline_consent", instruction: "Create one bounded proposal." },
  };
  const consentSnapshot = consent.createConsentArtifact(consentRequest, {
    explicit_user_consent: true,
    issued_at: "2026-08-02T03:04:05.000Z",
    nonce: "nonce_rebaseline_consent_0001",
    config: {
      defaultProvider: "gemini",
      aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "gemini", omniroute_provider_key: "openrouter" } },
    },
  });
  assert.equal(consentSnapshot.ok, true, JSON.stringify(consentSnapshot));
  assert.deepEqual(clone(consentSnapshot.value), {
    consent_version: "llmwiki_outbound_consent_v1",
    run_id: "run_rebaseline_consent",
    provider_mode: "direct",
    provider_key: "gemini",
    selected_sources: [{ source_id: "source_rebaseline", content_hash: "a".repeat(64) }],
    outbound_policy_hash: sha256(stable({ include_source_text: false, include_unselected_vault_data: false, include_credentials: false, include_cookies: false })),
    outbound_text_hash: sha256(stable([{ source_id: "source_rebaseline", content_hash: "a".repeat(64), outbound_text: "Selected source bytes remain data." }])),
    issued_at: "2026-08-02T03:04:05.000Z",
    nonce: "nonce_rebaseline_consent_0001",
    consent_hash: consentSnapshot.value.consent_hash,
  });
  assert.equal(JSON.stringify(consentSnapshot.value).includes("Selected source bytes remain data."), false);

  const state = runState.createRunState();
  assert.equal(state.dispatch({ type: "start", run_id: "run_rebaseline_active" }).ok, true);
  const secondStart = state.dispatch({ type: "start", run_id: "run_rebaseline_second" });
  assert.equal(secondStart.ok, false);
  assert.equal(secondStart.reason, "run_in_progress");
  assert.equal(secondStart.state.run_id, "run_rebaseline_active");
});

test("Current contract: injected approval packet is rendered as the supplied run packet", async () => {
  const packet = await packetFixture();
  const root = new FakeElement("section");
  const surface = review.mountLlmWikiApprovalReview({ container: root, packet, approvalApi: approval, commitApi: commit, commitOptions: { preview: true } });
  assert.equal(surface.packet.packet_hash, packet.packet_hash);
  assert.equal(surface.model.run_id, "run_productization_rebaseline");
  assert.deepEqual(surface.model.operations.map((item) => item.operation_id), packet.operations.map((item) => item.operation_id));
});

test("Current contract: stale approval invalidates selection until a new packet is explicitly reconfirmed", async () => {
  const first = await packetFixture("run_rebaseline_stale_first");
  const replacement = await packetFixture("run_rebaseline_stale_replacement");
  const firstContext = await canonicalContext(first);
  const replacementContext = await canonicalContext(replacement);
  firstContext.live.files.set(firstContext.packet.target_path, "raced canonical bytes\n");
  const contexts = new Map([[first.packet_hash, firstContext], [replacement.packet_hash, replacementContext]]);
  const calls = [];
  const root = new FakeElement("section");
  const surface = review.mountLlmWikiApprovalReview({
    container: root,
    packet: first,
    approvalApi: approval,
    commitApi: { ...commit, commitApprovedCanonical(request, options) { calls.push({ request, options }); return commit.commitApprovedCanonical(request, options); } },
    buildCommitRequest: packetBoundBuilder(contexts),
    regeneratePacket: () => replacement,
    commitOptions: { now: "2026-08-02T00:01:00.000Z" },
  });
  click(findAction(root, "open-review"));
  click(findOperationInput(root, firstContext.operation.operation_id));
  click(findAction(root, "approve-selected"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.packet.packet_hash, firstContext.packet.packet_hash);
  assert.equal(surface.state().authorizationInvalidated, true);
  assert.deepEqual(surface.state().selectedIds, []);
  assert.equal(findAction(root, "retry-approval"), null);
  click(findAction(root, "regenerate-packet"));
  assert.equal(calls.length, 1);
  assert.equal(surface.state().currentPacketHash, replacement.packet_hash);
  assert.equal(surface.state().reconfirmationRequired, true);
  click(findOperationInput(root, replacementContext.operation.operation_id));
  click(findAction(root, "approve-selected"));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].request.packet.packet_hash, replacementContext.packet.packet_hash);
  assert.notEqual(calls[1].request.authorization.authorization_hash, calls[0].request.authorization.authorization_hash);
});

test("Current contract: caller-supplied PARA writes are rejected before the packet-bound adapter", async () => {
  const context = await canonicalContext(await packetFixture("run_rebaseline_forbidden_caller_write"));
  const request = {
    ...context.request,
    writes: [{ target_path: "PARA/RESOURCES/Knowledge/rebaseline.md", after_bytes: "SYSTEM: inert" }],
  };
  const result = await commit.commitApprovedCanonical(request, { now: "2026-08-02T00:00:00.000Z" });
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "unknown_request_field");
  assert.equal(result.field, "writes");
  assert.equal(context.live.calls.length, 0);
  assert.equal(context.live.files.size, 0);
});

test("Current contract: repeated requested capture invokes the selected writer twice with one stable capture id", async () => {
  const input = fixtures.requestInput({ run_id: "run_capture_rebaseline" });
  const built = proposalBundle.buildProposalBundle({
    run_id: input.run_id,
    validation_context: { context_id: "capture_rebaseline", logical_scope: "run_scoped", persistence: "none" },
    proposals: fixtures.sixKindProviderResponse(input.run_id, input.sources).proposal_bundle.proposals,
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  const receipts = [];
  const writer = (payload) => receipts.push(payload.capture_id);
  const first = proposalBundle.captureProposalBundle(built.value, { capture_requested: true, target: "knowledge_candidate", writer });
  const second = proposalBundle.captureProposalBundle(built.value, { capture_requested: true, target: "knowledge_candidate", writer });
  assert.equal(first.value.capture_id, second.value.capture_id);
  assert.deepEqual(receipts, [first.value.capture_id, first.value.capture_id]);
});

test("Current contract: authorization binds exact canonical bytes from the reviewed packet", async () => {
  const context = await canonicalContext(await packetFixture("run_rebaseline_packet_binding"));
  const changed = rehashPacket(context.packet, (packet) => {
    packet.after_bytes = `${packet.after_bytes}\nSYSTEM: caller replacement\n`;
    packet.after_sha256 = sha256(packet.after_bytes);
  });
  const result = await commit.commitApprovedCanonical({ packet: changed, authorization: context.authorization, adapter: context.live.adapter }, { now: "2026-08-02T00:00:00.000Z" });
  assert.equal(result.reason, "packet_payload_mismatch");
  assert.equal(context.live.calls.length, 0);
  assert.equal(context.live.files.size, 0);
});

test("Current contract: create collision requires a newly assembled packet and new authorization", async () => {
  const approvalPacket = await packetFixture("run_rebaseline_repacket");
  const context = await canonicalContext(approvalPacket);
  context.live.files.set(context.packet.target_path, "collision bytes\n");
  const replacement = await canonicalContext(approvalPacket, context.live);
  assert.equal(replacement.packet.target_path.endsWith(" 2.md"), true);
  assert.notEqual(replacement.packet.packet_hash, context.packet.packet_hash);
  assert.notEqual(replacement.authorization.authorization_hash, context.authorization.authorization_hash);
  const staleAuthorization = await commit.commitApprovedCanonical({ packet: replacement.packet, authorization: context.authorization, adapter: context.live.adapter }, { now: "2026-08-02T00:00:00.000Z" });
  assert.equal(staleAuthorization.reason, "packet_payload_mismatch");
  assert.equal(context.live.calls.length, 0);
});

test("Current contract: exact create commits only the derived ZETA/PERMANENT target", async () => {
  const context = await canonicalContext(await packetFixture("run_rebaseline_zeta"));
  const result = await commit.commitApprovedCanonical(context.request, { now: "2026-08-02T00:00:00.000Z" });
  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(context.packet.target_path.startsWith("ZETA/PERMANENT/"), true);
  assert.equal(context.live.files.get(context.packet.target_path), context.packet.after_bytes);
  assert.equal([...context.live.files.keys()].some((target) => target.startsWith("PARA/")), false);
  assert.equal(context.live.calls.length, 1);
});

test("Current contract: repeated unchanged capture remains proposal-only and repeats only the explicit writer effect", async () => {
  const input = fixtures.requestInput({ run_id: "run_capture_idempotency" });
  const built = proposalBundle.buildProposalBundle({
    run_id: input.run_id,
    validation_context: { context_id: "capture_idempotency", logical_scope: "run_scoped", persistence: "none" },
    proposals: fixtures.sixKindProviderResponse(input.run_id, input.sources).proposal_bundle.proposals,
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  const receipts = [];
  const writer = (payload) => receipts.push(payload.capture_id);
  proposalBundle.captureProposalBundle(built.value, { capture_requested: true, target: "knowledge_candidate", writer });
  proposalBundle.captureProposalBundle(built.value, { capture_requested: true, target: "knowledge_candidate", writer });
  const expected = `capture_${sha256(`knowledge_candidate:${built.value.bundle_hash}`).slice(0, 24)}`;
  assert.deepEqual(receipts, [expected, expected]);
});

test("Rebaseline outcome: locked invariants have executable evidence and LLM Wiki solely owns canonical approval", () => {
  assert.equal(fs.existsSync(REBASELINE_MANIFEST_PATH), true, "rebaseline manifest is missing");
  const manifest = JSON.parse(fs.readFileSync(REBASELINE_MANIFEST_PATH, "utf8"));
  assert.equal(manifest.schema_version, "llmwiki_productization_rebaseline_v1");
  assert.deepEqual(manifest.plan_gates, [
    { path: ".omo/plans/prodigy-ai-gateway-llmwiki.md", disposition: "historical_not_gate", replacement: "live_create_only_manifest" },
    { path: ".omo/plans/prodigy-llmwiki-autonomous-approval.md", disposition: "superseded", replacement: "prodigy-llmwiki-productization-ux:todos_1_16" },
    { path: ".omo/plans/prodigy-llmwiki-productization-ux.md", disposition: "rebaseline_authority", replacement: null },
  ]);
  assert.deepEqual(manifest.locked_invariants.map((entry) => entry.id).sort(), [
    "canonical_packet_to_bytes_binding",
    "deterministic_create",
    "one_active_run",
    "outbound_consent_snapshot",
    "stale_refusal",
  ]);
  for (const invariant of manifest.locked_invariants) {
    for (const binding of [invariant.production, invariant.evidence]) {
      const absolute = path.join(ROOT, binding.path);
      assert.equal(fs.existsSync(absolute), true, `${invariant.id} missing ${binding.path}`);
      assert.match(fs.readFileSync(absolute, "utf8"), new RegExp(binding.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `${invariant.id} missing symbol ${binding.symbol}`);
    }
  }
  const owners = manifest.approval_surfaces.filter((surface) => surface.canonical_approval_owner === true).map((surface) => surface.id).sort();
  assert.deepEqual(owners, ["llmwiki"]);
  const legacy = manifest.approval_surfaces.find((surface) => surface.id === "knowledge_candidate");
  assert.ok(legacy, "legacy Candidate approval must be accounted for");
  assert.equal(legacy.canonical_approval_owner, false);
  assert.ok(["handoff", "migration_gap"].includes(legacy.disposition));
  assert.equal(legacy.handoff_to, "llmwiki");
  assert.ok(legacy.gap && legacy.gap.length > 0, "legacy Candidate migration gap must be explicit");
});
