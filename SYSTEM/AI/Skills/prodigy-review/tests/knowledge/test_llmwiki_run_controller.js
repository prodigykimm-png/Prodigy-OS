"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const fixtures = require("./llmwiki_librarian_pipeline_fixtures.js");
const { NOW, EXPIRES_AT, DERIVED_ROOT, createResponse, terminalResponse, runInput, harness } = require("./llmwiki_run_controller_fixtures.js");

function assertNoCanonicalEffects(subject, expectedProvider = 0, allowedCanonicalPaths = []) {
  const counters = subject.controller.getSnapshot().counters;
  assert.deepEqual(counters, {
    provider: expectedProvider,
    network: expectedProvider,
    canonical: 0,
    audit: 0,
    refresh: 0,
    git: 0,
    authorization: 0,
  });
  assert.equal(subject.vault.filePaths().some((filePath) => filePath.startsWith("ZETA/PERMANENT/") && !allowedCanonicalPaths.includes(filePath)), false);
  assert.equal(subject.vault.filePaths().some((filePath) => filePath.startsWith(".llmwiki-audit/")), false);
  assert.equal(subject.vault.filePaths().some((filePath) => filePath.startsWith(DERIVED_ROOT)), false);
}

test("Given one explicit synthetic source and consent, When reviewed and approved, Then one provider call commits exact packet bytes and links audit plus snapshot", async () => {
  const source = runInput().sources[0];
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, source));
  const hubBefore = globalThis.KnowledgeExplorerHub;
  try {
    globalThis.KnowledgeExplorerHub = Object.freeze({ sentinel: "unchanged" });
    const review = await subject.controller.startRun(runInput());
    assert.equal(review.ok, true, JSON.stringify(review));
    assert.equal(review.status, "review");
    assert.equal(subject.providerCalls.length, 1);
    assert.equal(subject.providerCalls[0].provider_mode, "direct");
    assert.equal(review.review_packets.length, 1);
    assert.equal(review.review_packets[0].operation.proposal_kind, "create");
    assert.equal(review.review_packets[0].allowed_properties.includes("/frontmatter/admin"), false);
    assert.deepEqual(globalThis.KnowledgeExplorerHub, { sentinel: "unchanged" });

    const packet = review.review_packets[0];
    const committed = await subject.controller.approve({
      action: "approve_selected",
      packet_hash: packet.packet_hash,
    });
    assert.equal(committed.ok, true, JSON.stringify(committed));
    assert.equal(committed.status, "committed");
    assert.equal(subject.vault.bytes(packet.target_path), packet.after_bytes);
    assert.equal(JSON.parse(subject.vault.bytes(committed.links.audit.path)).packet_hash, packet.packet_hash);
    assert.equal(JSON.parse(subject.vault.bytes(committed.links.snapshot.path)).snapshot_revision, committed.links.snapshot.id.slice("snapshot_".length));
    assert.deepEqual(subject.controller.getSnapshot().counters, { provider: 1, network: 1, canonical: 1, audit: 1, refresh: 1, git: 0, authorization: 1 });
    assert.equal(committed.links.canonical.sha256, packet.after_sha256);
    assert.match(committed.result_id, /^result_[0-9a-f]{24}$/u);
    console.log(`TASK11_E2E result=${committed.result_id} packet=${packet.packet_hash} canonical=${packet.after_sha256} audit=${committed.links.audit.id} snapshot=${committed.links.snapshot.id} path=${packet.target_path}`);
  } finally {
    if (hubBefore === undefined) delete globalThis.KnowledgeExplorerHub;
    else globalThis.KnowledgeExplorerHub = hubBefore;
    subject.vault.cleanup();
  }
});

test("Given selected source without explicit consent, When start is requested, Then it remains consent-required with every external counter zero", async () => {
  const source = runInput().sources[0];
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, source));
  const result = await subject.controller.startRun(runInput("run_controller_missing_consent", { explicit_user_consent: false }));
  assert.equal(result.status, "consent_required");
  assert.equal(subject.providerCalls.length, 0);
  assertNoCanonicalEffects(subject);
});

test("Given a controller-selected source awaiting consent, When the same run resumes with explicit consent, Then it reaches review without losing source context", async () => {
  const input = runInput("run_controller_consent_resume");
  input.sources[0].display_name = "긴 한국어 자료 제목과 https://example.invalid/controller-backed-source";
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, input.sources[0]));

  const selected = await subject.controller.startRun({ ...input, explicit_user_consent: false });
  assert.equal(selected.status, "consent_required");
  assert.deepEqual(subject.controller.getSnapshot().source_selection, {
    selected: true,
    display_name: input.sources[0].display_name,
  });
  assert.equal(subject.providerCalls.length, 0);

  const reviewed = await subject.controller.startRun({ ...input, explicit_user_consent: true });
  assert.equal(reviewed.status, "review");
  assert.equal(subject.providerCalls.length, 1);
  assert.equal(subject.controller.getSnapshot().source_selection.display_name, input.sources[0].display_name);
  assertNoCanonicalEffects(subject, 1);
});

test("Given provider 429, When the bounded call fails, Then no fallback, packet, authorization, or persistent effect occurs", async () => {
  const subject = harness(() => { throw Object.assign(new Error("rate limited"), { status: 429 }); });
  const result = await subject.controller.startRun(runInput("run_controller_429"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_rate_limited");
  assert.equal(subject.providerCalls.length, 1);
  assertNoCanonicalEffects(subject, 1);
});

test("Given a provider that pre-throws ETIMEDOUT, When invoked, Then the explicit timeout failure remains fail-closed", async () => {
  const subject = harness(() => { throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }); });
  const result = await subject.controller.startRun(runInput("run_controller_prethrown_timeout"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_timeout");
  assert.equal(subject.providerCalls.length, 1);
  assertNoCanonicalEffects(subject, 1);
});

test("Given a genuinely never-settling provider, When timeout_ms is 20, Then startRun settles fail-closed before the 100ms guard", async () => {
  const subject = harness(() => new Promise(() => {}));
  const startedAt = Date.now();
  let guardTimer;
  const observed = await Promise.race([
    subject.controller.startRun(runInput("run_controller_hung_timeout", { advanced_settings: { timeout_ms: 20 } }))
      .then((result) => ({ kind: "result", result })),
    new Promise((resolve) => { guardTimer = setTimeout(() => resolve({ kind: "guard" }), 100); }),
  ]);
  clearTimeout(guardTimer);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(observed.kind, "result", `hung provider remained pending after ${elapsedMs}ms`);
  assert.equal(observed.result.ok, false);
  assert.equal(observed.result.reason, "provider_timeout");
  assert.equal(subject.providerCalls.length, 1);
  assert.equal(elapsedMs >= 15 && elapsedMs < 100, true, `unexpected timeout boundary: ${elapsedMs}ms`);
  assert.equal(subject.controller.getSnapshot().run_state.state, "failed");
  assertNoCanonicalEffects(subject, 1);
  console.log(`TASK11_TIMEOUT_ASSERT declared_ms=20 elapsed_ms=${elapsedMs} settled=1 reason=${observed.result.reason} counters=${JSON.stringify(subject.controller.getSnapshot().counters)}`);
});

test("Given a six-kind provider response, When create-only filtering runs, Then exactly one create packet reaches review", async () => {
  const input = fixtures.requestInput({
    run_id: "run_controller_six_kind",
    explicit_user_consent: true,
    consent: { issued_at: NOW, nonce: "consent_controller_six_kind_01" },
    approval: { expires_at: EXPIRES_AT, nonce: "approval_controller_six_kind_01" },
    canonical_defaults: runInput().canonical_defaults,
  });
  const subject = harness((request) => fixtures.sixKindProviderResponse(request.outbound_payload.proposal_request.run_id, input.sources));
  const result = await subject.controller.startRun(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.filtered_kinds, ["update", "merge", "dispute", "abstain", "no_change"]);
  assert.equal(result.review_packets.length, 1);
  assert.equal(result.review_packets[0].operation.proposal_kind, "create");
  assertNoCanonicalEffects(subject, 1);
});

test("Given a selected create with unresolved conflict, When proposals are filtered, Then it stays review-only and cannot authorize", async () => {
  const input = runInput("run_controller_conflict");
  const source = input.sources[0];
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, source, {
    conflicts: [{ conflict_id: "conflict_selected", status: "unresolved", claims: ["A", "B"], source_ids: [source.manifest.source_id] }],
  }));
  const result = await subject.controller.startRun(input);
  assert.equal(result.status, "review_only");
  assert.equal(result.reason, "unresolved_conflict");
  assert.deepEqual(result.review_packets, []);
  const approval = await subject.controller.approve({ action: "approve_selected", packet_hash: "a".repeat(64) });
  assert.equal(approval.reason, "unresolved_conflict");
  assertNoCanonicalEffects(subject, 1);
});

test("Given abstain, no-change, or non-create proposals, When the run completes, Then canonical authorization never exists", async () => {
  for (const kind of ["abstain", "no_change"]) {
    const input = runInput(`run_controller_${kind}`);
    const source = input.sources[0];
    const subject = harness((request) => terminalResponse(request.outbound_payload.proposal_request.run_id, source, kind));
    const result = await subject.controller.startRun(input);
    assert.equal(result.status, kind === "abstain" ? "abstained" : "review_only", kind);
    assert.deepEqual(result.review_packets, [], kind);
    assertNoCanonicalEffects(subject, 1);
  }
});

test("Given a reviewed create whose target becomes stale, When approval is attempted, Then it requires reconfirmation before authorization or write", async () => {
  const input = runInput("run_controller_stale");
  const source = input.sources[0];
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, source));
  const review = await subject.controller.startRun(input);
  const packet = review.review_packets[0];
  subject.vault.put(packet.target_path, "raced canonical bytes\n");
  const result = await subject.controller.approve({ action: "approve_selected", packet_hash: packet.packet_hash });
  assert.equal(result.status, "stale_reconfirm_required");
  assert.equal(result.reason, "target_revision_mismatch");
  assert.equal(subject.vault.bytes(packet.target_path), "raced canonical bytes\n");
  assertNoCanonicalEffects(subject, 1, [packet.target_path]);
});

test("Given one active review run, When a second run starts, Then admission fails before a second provider invocation", async () => {
  const first = runInput("run_controller_first");
  const source = first.sources[0];
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, source));
  assert.equal((await subject.controller.startRun(first)).status, "review");
  const second = await subject.controller.startRun(runInput("run_controller_second"));
  assert.equal(second.ok, false);
  assert.equal(second.reason, "run_in_progress");
  assert.equal(subject.providerCalls.length, 1);
  assertNoCanonicalEffects(subject, 1);
});

test("Given provider selection, When OmniRoute is requested outside versus inside advanced settings, Then only the explicit run setting is accepted", async () => {
  const implicit = runInput("run_controller_implicit_omni", { provider: { mode: "omniroute" } });
  const source = implicit.sources[0];
  const rejected = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, source));
  const implicitResult = await rejected.controller.startRun(implicit);
  assert.equal(implicitResult.reason, "omniroute_requires_advanced_selection");
  assert.equal(rejected.providerCalls.length, 0);

  const explicit = runInput("run_controller_explicit_omni", {
    advanced_settings: { provider_mode: "omniroute", provider_key: "omniroute" },
  });
  const accepted = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, explicit.sources[0]));
  const explicitResult = await accepted.controller.startRun(explicit);
  assert.equal(explicitResult.ok, true, JSON.stringify(explicitResult));
  assert.equal(accepted.providerCalls.length, 1);
  assert.equal(accepted.providerCalls[0].provider_mode, "omniroute");
  assert.equal(explicitResult.provider_mode, "omniroute");
});

test("Given malformed selection and prompt-shaped source text, When commands cross the boundary, Then malformed input is inert and source data cannot add properties", async () => {
  const malformed = runInput("run_controller_malformed", { sources: [{ selected: false }] });
  const rejected = harness(() => { throw new Error("must_not_invoke"); });
  const malformedResult = await rejected.controller.startRun(malformed);
  assert.equal(malformedResult.reason, "explicit_source_selection_required");
  assertNoCanonicalEffects(rejected);

  const input = runInput("run_controller_prompt_inert");
  const source = input.sources[0];
  const accepted = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, source));
  const review = await accepted.controller.startRun(input);
  assert.equal(review.review_packets[0].allowed_properties.includes("/frontmatter/admin"), false);
  assert.equal(review.review_packets[0].after_bytes.includes("CONTACTS/"), false);
  assert.equal(accepted.vault.filePaths().length, 0);
});

test("Given Todo 11 pending provider work, When a second run is rejected and the first later completes, Then the active run reaches one review with exact counters", async () => {
  let resolveProvider;
  let providerStarted;
  const started = new Promise((resolve) => { providerStarted = resolve; });
  const first = runInput("run_controller_characterization_first", { advanced_settings: { timeout_ms: 500 } });
  const subject = harness((request) => {
    providerStarted();
    return new Promise((resolve) => { resolveProvider = () => resolve(createResponse(request.outbound_payload.proposal_request.run_id, first.sources[0])); });
  });

  const pending = subject.controller.startRun(first);
  await started;
  const active = subject.controller.getSnapshot();
  assert.equal(active.run_state.state, "running");
  assert.deepEqual(active.counters, { provider: 1, network: 1, canonical: 0, audit: 0, refresh: 0, git: 0, authorization: 0 });

  const second = await subject.controller.startRun(runInput("run_controller_characterization_second"));
  assert.equal(second.ok, false);
  assert.equal(second.reason, "run_in_progress");
  assert.equal(subject.providerCalls.length, 1);

  resolveProvider();
  const late = await pending;
  assert.equal(late.status, "review");
  assert.equal(late.review_packets.length, 1);
  assert.deepEqual(subject.controller.getSnapshot().counters, { provider: 1, network: 1, canonical: 0, audit: 0, refresh: 0, git: 0, authorization: 0 });
  console.log(`TASK12_BASELINE input=${first.run_id} active=${active.run_state.state} second=${second.reason} late=${late.status} provider=1 network=1 canonical=0 audit=0 refresh=0 authorization=0 git=0`);
});

test("Given a genuinely pending provider Promise, When cancel aborts and the provider resolves late, Then the cancelled run stays inert and a second run can proceed", async () => {
  let resolveFirst;
  let firstStarted;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const first = runInput("run_controller_cancel_pending", { advanced_settings: { timeout_ms: 500 } });
  const second = runInput("run_controller_after_cancel");
  const subject = harness((request) => {
    const runId = request.outbound_payload.proposal_request.run_id;
    if (runId === first.run_id) {
      firstStarted();
      return new Promise((resolve) => { resolveFirst = () => resolve(createResponse(runId, first.sources[0])); });
    }
    return createResponse(runId, second.sources[0]);
  });

  const pending = subject.controller.startRun(first);
  await started;
  const cancelled = await subject.controller.cancel({ action: "cancel" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(subject.providerSignals[0].aborted, true);
  assert.equal((await pending).status, "cancelled");

  const resumed = await subject.controller.startRun(second);
  assert.equal(resumed.status, "review");
  resolveFirst();
  await new Promise((resolve) => setImmediate(resolve));
  const snapshot = subject.controller.getSnapshot();
  assert.equal(snapshot.run_id, second.run_id);
  assert.equal(snapshot.status, "review");
  assert.equal(subject.providerCalls.length, 2);
  assert.deepEqual(snapshot.counters, { provider: 2, network: 2, canonical: 0, audit: 0, refresh: 0, git: 0, authorization: 0 });
  assert.equal(subject.vault.filePaths().length, 0);
  console.log(`TASK12_CANCEL cancelled=1 aborted=1 late_ignored=1 resumed=${snapshot.run_id} provider=2 canonical=0 audit=0 refresh=0 authorization=0 git=0`);
});

test("Given review state, When reload occurs, Then proposal state and controller counters return to clean idle without writes", async () => {
  const input = runInput("run_controller_reload_review");
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, input.sources[0]));
  const review = await subject.controller.startRun(input);
  assert.equal(review.status, "review");

  const reloaded = await subject.controller.reload({ action: "reload" });
  const snapshot = subject.controller.getSnapshot();
  assert.equal(reloaded.status, "idle");
  assert.equal(snapshot.status, "idle");
  assert.equal(snapshot.run_id, undefined);
  assert.deepEqual(snapshot.review_packets, []);
  assert.deepEqual(snapshot.proposals, []);
  assert.deepEqual(snapshot.counters, { provider: 0, network: 0, canonical: 0, audit: 0, refresh: 0, git: 0, authorization: 0 });
  assert.equal(subject.vault.filePaths().length, 0);
  console.log("TASK12_RELOAD from=review to=idle proposals=0 packets=0 canonical=0 audit=0 refresh=0 authorization=0 git=0");
});

test("Given one review packet, When tabs round-trip, Then the same active in-memory run and packet are retained", async () => {
  const input = runInput("run_controller_tab_roundtrip");
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, input.sources[0]));
  await subject.controller.startRun(input);
  const before = subject.controller.getSnapshot();
  assert.equal((await subject.controller.tabSwitch({ action: "tab_switch", tab_id: "para" })).ok, true);
  assert.equal((await subject.controller.tabSwitch({ action: "tab_switch", tab_id: "llm_wiki" })).ok, true);
  assert.deepEqual(subject.controller.getSnapshot(), before);
  console.log(`TASK12_TAB run=${before.run_id} packet=${before.review_packets[0].packet_hash} retained=1 provider=1`);
});

test("Given a committed canonical with pending audit finalization, When local audit repair is requested, Then only one repair runs and provider is not rerun", async () => {
  const input = runInput("run_controller_audit_repair");
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, input.sources[0]));
  const review = await subject.controller.startRun(input);
  const packet = review.review_packets[0];
  subject.vault.failOnce("modify", `.llmwiki-audit/${packet.nonce}.json`);
  const pending = await subject.controller.approve({ action: "approve_selected", packet_hash: packet.packet_hash });
  assert.equal(pending.status, "committed_audit_pending");

  const repaired = await subject.controller.repairAudit({ action: "repair_audit" });
  const snapshot = subject.controller.getSnapshot();
  assert.equal(repaired.status, "committed_refresh_failed");
  assert.equal(subject.providerCalls.length, 1);
  assert.deepEqual(snapshot.recovery_counters, { audit_repair: 1, refresh_retry: 0, stale_repacket: 0 });
  assert.deepEqual(snapshot.counters, { provider: 1, network: 1, canonical: 1, audit: 2, refresh: 0, git: 0, authorization: 1 });
  assert.equal(subject.vault.filePaths().some((filePath) => filePath.startsWith(DERIVED_ROOT)), false);
  console.log("TASK12_AUDIT_REPAIR state=committed_refresh_failed audit_repair=1 provider=1 canonical=1 audit=2 refresh=0 git=0");
});

test("Given committed_refresh_failed, When derived refresh is retried, Then only one deterministic refresh runs without provider, canonical, or audit duplication", async () => {
  const input = runInput("run_controller_refresh_retry");
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, input.sources[0]));
  const review = await subject.controller.startRun(input);
  subject.vault.failOnce("create", `${DERIVED_ROOT}/snapshots/`);
  const failed = await subject.controller.approve({ action: "approve_selected", packet_hash: review.review_packets[0].packet_hash });
  assert.equal(failed.status, "committed_refresh_failed");
  const before = subject.controller.getSnapshot().counters;

  const [retried, duplicate] = await Promise.all([
    subject.controller.retryRefresh({ action: "retry_refresh" }),
    subject.controller.retryRefresh({ action: "retry_refresh" }),
  ]);
  const snapshot = subject.controller.getSnapshot();
  assert.equal(retried.status, "committed");
  assert.equal(duplicate.reason, "recovery_in_progress");
  assert.equal(subject.providerCalls.length, 1);
  assert.equal(snapshot.counters.provider, before.provider);
  assert.equal(snapshot.counters.network, before.network);
  assert.equal(snapshot.counters.canonical, before.canonical);
  assert.equal(snapshot.counters.audit, before.audit);
  assert.equal(snapshot.counters.refresh, 1);
  assert.deepEqual(snapshot.recovery_counters, { audit_repair: 0, refresh_retry: 1, stale_repacket: 0 });
  console.log("TASK12_REFRESH_RETRY state=committed refresh_retry=1 provider=1 canonical=1 audit=1 refresh=1 git=0 duplicate=0");
});

test("Given a stale create packet, When deterministic repacket runs, Then its hash changes and approval stays disabled until exact reconfirmation", async () => {
  const input = runInput("run_controller_stale_repacket");
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, input.sources[0]));
  const review = await subject.controller.startRun(input);
  const oldPacket = review.review_packets[0];
  subject.vault.put(oldPacket.target_path, "raced canonical bytes\n");
  assert.equal((await subject.controller.approve({ action: "approve_selected", packet_hash: oldPacket.packet_hash })).status, "stale_reconfirm_required");

  const repacketed = await subject.controller.repacketStale({ action: "repacket_stale" });
  assert.equal(repacketed.ok, true, JSON.stringify(repacketed));
  const newPacket = repacketed.review_packets[0];
  assert.notEqual(newPacket.packet_hash, oldPacket.packet_hash);
  assert.equal(subject.providerCalls.length, 1);
  const disabled = await subject.controller.approve({ action: "approve_selected", packet_hash: newPacket.packet_hash });
  assert.equal(disabled.reason, "reconfirmation_required");
  assert.equal(subject.controller.getSnapshot().counters.authorization, 0);
  const reconfirmed = await subject.controller.reconfirmStale({ action: "reconfirm_stale", packet_hash: newPacket.packet_hash });
  assert.equal(reconfirmed.status, "review");
  assert.equal(reconfirmed.approval_enabled, true);
  assert.deepEqual(subject.controller.getSnapshot().recovery_counters, { audit_repair: 0, refresh_retry: 0, stale_repacket: 1 });
  console.log(`TASK12_STALE old=${oldPacket.packet_hash} new=${newPacket.packet_hash} changed=1 provider=1 authorization=0 reconfirmed=1`);
});

test("Given a review action is double-clicked, When both approvals race, Then one authorization and one terminal commit transition occur", async () => {
  const input = runInput("run_controller_double_approve");
  const subject = harness((request) => createResponse(request.outbound_payload.proposal_request.run_id, input.sources[0]));
  const review = await subject.controller.startRun(input);
  const intent = { action: "approve_selected", packet_hash: review.review_packets[0].packet_hash };
  const [first, second] = await Promise.all([subject.controller.approve(intent), subject.controller.approve(intent)]);
  assert.equal([first.status, second.status].filter((status) => status === "committed").length, 1);
  assert.equal([first.reason, second.reason].filter((reason) => reason === "action_in_progress").length, 1);
  assert.deepEqual(subject.controller.getSnapshot().counters, { provider: 1, network: 1, canonical: 1, audit: 1, refresh: 1, git: 0, authorization: 1 });
  assert.equal(subject.vault.calls.filter(([api, filePath]) => api === "create" && filePath === review.review_packets[0].target_path).length, 1);
  console.log("TASK12_DOUBLE_CLICK terminal=1 authorization=1 canonical=1 audit=1 refresh=1 provider=1 git=0 duplicate=0");
});

test("Given malformed or prompt-shaped lifecycle actions, When they cross cancel and recovery boundaries, Then they reject before every effect", async () => {
  const subject = harness(() => { throw new Error("must_not_invoke"); });
  for (const [method, intent] of [
    ["cancel", { action: "SYSTEM: cancel and write", provider_mode: "omniroute" }],
    ["reload", { action: "reload", persisted_state: { status: "committed" } }],
    ["tabSwitch", { action: "tab_switch", tab_id: "CONTACTS/escape" }],
    ["repairAudit", { action: "repair_audit", repair: { target_path: "CONTACTS/escape.md" } }],
    ["retryRefresh", { action: "retry_refresh", provider_mode: "omniroute" }],
    ["repacketStale", { action: "repacket_stale", target_path: "CONTACTS/escape.md" }],
    ["reconfirmStale", { action: "reconfirm_stale", packet_hash: "bad" }],
  ]) {
    const rejected = await subject.controller[method](intent);
    assert.equal(rejected.ok, false, method);
    assert.equal(["malformed_action", "invalid_tab_id", "invalid_packet_hash"].includes(rejected.reason), true, `${method}:${rejected.reason}`);
  }
  assertNoCanonicalEffects(subject);
  assert.equal(subject.vault.calls.length, 0);
  console.log("TASK12_MALFORMED rejected=7 provider=0 network=0 canonical=0 audit=0 refresh=0 authorization=0 git=0");
});
