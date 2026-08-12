"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const SNAPSHOT_REVISION = "9".repeat(64);
const TRUST_EFFECT_KEYS = Object.freeze([
  "source_archive",
  "provider_network",
  "proposal_capture",
  "canonical",
  "audit",
  "derived_snapshot",
  "derived_failure",
  "memory",
  "index",
  "git",
]);

function trustEffects(overrides = {}) {
  return Object.freeze(Object.fromEntries(
    TRUST_EFFECT_KEYS.map((key) => [key, Number(overrides[key] || 0)]),
  ));
}

const TRUST_FAILURE_ROWS = Object.freeze([
  ["malformed_input", "rejected:malformed_action"],
  ["prompt_shaped_source", "ready_for_review"],
  ["consent_mutation", "rejected:consent_mismatch"],
  ["unresolved_selected_conflict", "rejected:unresolved_conflict"],
  ["stale_repacket", "stale_reconfirm_required"],
  ["create_collision", "rejected:target_revision_mismatch"],
  ["target_mutation", "rejected:packet_payload_mismatch"],
  ["property_mutation", "rejected:packet_payload_mismatch"],
  ["operation_mutation", "rejected:packet_payload_mismatch"],
  ["expiry", "rejected:approval_expired"],
  ["replay", "conflict:nonce_replay_conflict"],
  ["cancel_late_completion", "cancelled:run_cancelled", { provider_network: 1 }],
  ["audit_prepare_failure", "rejected:audit_prepare_failed"],
  ["audit_canonical_failure", "rejected:canonical_write_failed", { audit: 1 }],
  ["audit_finalize_failure", "committed_audit_pending:audit_finalize_failed", { canonical: 1, audit: 1 }],
  ["audit_repair_failure", "rejected:audit_repair_failed", { canonical: 1, audit: 1 }],
  ["refresh_failure", "committed_refresh_failed:source_revision_mismatch", { canonical: 1, audit: 1, derived_failure: 1 }],
  ["dirty_worktree_isolation", "isolated"],
  ["misleading_success_output", "idle"],
  ["repeated_interruption", "cancelled:run_cancelled", { provider_network: 1 }],
  ["non_create_preview_only", "review_only"],
  ["explicit_source_archive", "selecting", { source_archive: 1 }],
  ["explicit_proposal_capture", "review", { provider_network: 1, proposal_capture: 1 }],
  ["exact_create_commit", "committed", { canonical: 1, audit: 1, derived_snapshot: 1, memory: 1, index: 1 }],
].map(([fault_class, expected_state, effects]) => Object.freeze({
  fault_class,
  expected_state,
  effects: trustEffects(effects),
})));

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function countTree(root) {
  const result = [];
  if (!fs.existsSync(root)) return result;
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    result.push(`${entry.isDirectory() ? "d" : "f"}:${entry.name}`);
  }
  return result.sort();
}

function manifest(id, text, overrides = {}) {
  const bytes = Buffer.from(`<article>${text}</article>`, "utf8");
  return {
    source_id: id,
    requested_url: `https://example.com/${id}/start`,
    source_url: `https://example.com/${id}/final`,
    fetched_at: "2026-08-02T00:00:00.000Z",
    parser_version: "literature-fixture-v1",
    content_hash: sha256(bytes),
    extracted_text_hash: sha256(text),
    locator: `ZETA/LITERATURE/${id}.md#claim`,
    refresh_revision: 1,
    raw_bytes: bytes,
    extracted_text: text,
    fetch_metadata: {
      requested_url: `https://example.com/${id}/start`,
      resolved_url: `https://example.com/${id}/final`,
      content_hash: sha256(bytes),
    },
    ...overrides,
  };
}

function sourceFixture(id, text, overrides = {}) {
  return {
    manifest: manifest(id, text, overrides.manifest || {}),
    outbound_text: text,
    selected: overrides.selected !== false,
    sensitivity: overrides.sensitivity || "public",
    confidence: overrides.confidence || "explicit",
  };
}

function citation(source) {
  return {
    source_id: source.manifest.source_id,
    content_hash: source.manifest.content_hash,
    source_url: source.manifest.source_url,
    locator: source.manifest.locator,
    confidence: "explicit",
  };
}

function sixKindProviderResponse(runId, sources) {
  const [first, second, conflictA, conflictB] = sources;
  return {
    status: "ok",
    proposal_bundle: {
      run_id: runId,
      validation_context: { context_id: `validation_context_${runId}`, logical_scope: "run_scoped", persistence: "none" },
      proposals: [
        createProposal(first),
        updateProposal(first),
        mergeProposal(first, second),
        disputeProposal(conflictA, conflictB),
        abstainProposal(first),
        noChangeProposal(second),
      ],
    },
    response_metadata: { provider_status: "ok", latency_ms: 7 },
  };
}

function createProposal(first) {
  return {
    kind: "create",
    title: "새 독서 원칙",
    claims: [{ claim_id: "create_claim", text: "새 지식은 선택된 자료에서만 만든다.", source_ids: [first.manifest.source_id] }],
    source_citations: [citation(first)],
    confidence: "explicit",
    affected_targets: ["PARA/RESOURCES/Knowledge/new-reading-principle.md"],
  };
}

function updateProposal(first) {
  return {
    kind: "update",
    title: "기존 원칙 보강",
    target: "PARA/RESOURCES/Knowledge/existing-reading.md",
    target_revision: "1".repeat(64),
    claims: [{ claim_id: "update_claim", text: "기존 원칙에 근거를 추가한다.", source_ids: [first.manifest.source_id] }],
    source_citations: [citation(first)],
    confidence: "explicit",
    diff: [{ op: "revise", path: "/statement", before: "old", after: "new", source_ids: [first.manifest.source_id] }],
    affected_targets: ["PARA/RESOURCES/Knowledge/existing-reading.md"],
  };
}

function mergeProposal(first, second) {
  return {
    kind: "merge",
    title: "관련 문헌 병합",
    target: "PARA/RESOURCES/Knowledge/merged-reading.md",
    target_revision: "2".repeat(64),
    source_input_ids: [first.manifest.source_id, second.manifest.source_id],
    existing_target_ids: ["PARA/RESOURCES/Knowledge/source-a.md", "PARA/RESOURCES/Knowledge/source-b.md"],
    claims: [{ claim_id: "merge_claim", text: "두 문헌은 같은 독서 루틴 원칙을 지지한다.", source_ids: [first.manifest.source_id, second.manifest.source_id] }],
    source_citations: [citation(first), citation(second)],
    confidence: "explicit",
    conflicts: [{ conflict_id: "merge_overlap", status: "disputed", claims: ["같은 루틴을 서로 다른 표현으로 설명함"], source_ids: [first.manifest.source_id, second.manifest.source_id] }],
    affected_targets: ["PARA/RESOURCES/Knowledge/merged-reading.md", "PARA/RESOURCES/Knowledge/source-a.md", "PARA/RESOURCES/Knowledge/source-b.md"],
  };
}

function disputeProposal(conflictA, conflictB) {
  return {
    kind: "dispute",
    title: "충돌 원천 보류",
    target: "PARA/RESOURCES/Knowledge/conflicting-reading.md",
    target_revision: "3".repeat(64),
    claims: [
      { claim_id: "conflict_a_claim", text: "아침에만 읽어야 한다.", source_ids: [conflictA.manifest.source_id] },
      { claim_id: "conflict_b_claim", text: "밤에만 읽어야 한다.", source_ids: [conflictB.manifest.source_id] },
    ],
    source_citations: [citation(conflictA), citation(conflictB)],
    confidence: "low",
    conflicts: [{ conflict_id: "reading_time_conflict", status: "unresolved", claims: ["아침 전용", "밤 전용"], source_ids: [conflictA.manifest.source_id, conflictB.manifest.source_id] }],
    dispute: { reason: "conflicting_sources_without_winner", source_ids: [conflictA.manifest.source_id, conflictB.manifest.source_id], claim_ids: ["conflict_a_claim", "conflict_b_claim"] },
    affected_targets: ["PARA/RESOURCES/Knowledge/conflicting-reading.md"],
  };
}

function abstainProposal(first) {
  return {
    kind: "abstain",
    title: "근거 부족",
    status: "abstain",
    claims: [],
    source_citations: [citation(first)],
    confidence: "low",
    abstention_reason: "unsupported_claim",
    affected_targets: [],
  };
}

function noChangeProposal(second) {
  return {
    kind: "no_change",
    title: "변경 없음",
    status: "no_change",
    claims: [{ claim_id: "no_change_claim", text: "이미 지원되는 주장이다.", source_ids: [second.manifest.source_id] }],
    source_citations: [citation(second)],
    confidence: "explicit",
    no_change_reason: "already_supported",
    affected_targets: [],
  };
}

function requestInput(overrides = {}) {
  const sources = [
    sourceFixture("source_related_alpha", "독서 루틴은 작은 실행 단위로 묶으면 유지된다."),
    sourceFixture("source_related_beta", "작은 실행 단위는 독서 루틴 유지에 도움이 된다."),
    sourceFixture("source_conflict_morning", "독서는 아침에만 해야 한다."),
    sourceFixture("source_conflict_night", "독서는 밤에만 해야 한다."),
  ];
  return {
    run_id: "run_librarian_todo6",
    sources,
    source_scope: {
      allowed_source_ids: sources.map((source) => source.manifest.source_id),
      allowed_locator_prefixes: ["ZETA/LITERATURE/"],
      allow_private_sources: false,
    },
    retrieval: retrievalFor(sources),
    provider: { mode: "direct", timeout_ms: 5000, retry_owner: "prodigy", request_metadata: { request_id: "request_librarian_todo6", provider_key: "gemini" } },
    proposal_request: { instruction: "선택된 Literature 자료만 사용해 proposal bundle을 만든다." },
    ...overrides,
  };
}

function retrievalFor(sources, overrides = {}) {
  return {
    query: "독서 루틴",
    mode: "literature",
    scope: { paths: ["ZETA/LITERATURE/"], types: ["literature_note"] },
    snapshot: {
      snapshot_revision: SNAPSHOT_REVISION,
      current_revision: SNAPSHOT_REVISION,
      documents: sources.map((source) => ({
        document_id: source.manifest.source_id,
        type: "literature_note",
        path: source.manifest.locator.split("#")[0],
        title: source.manifest.source_id,
        statement: source.outbound_text,
        source_ids: [source.manifest.source_id],
        citations: [{ source_id: source.manifest.source_id, locator: source.manifest.locator }],
        updated: "2026-08-02T00:00:00.000Z",
        revision: source.manifest.content_hash,
      })),
    },
    ...overrides,
  };
}

module.exports = {
  SNAPSHOT_REVISION,
  TRUST_EFFECT_KEYS,
  TRUST_FAILURE_ROWS,
  trustEffects,
  sha256,
  countTree,
  sourceFixture,
  citation,
  sixKindProviderResponse,
  requestInput,
  retrievalFor,
};
