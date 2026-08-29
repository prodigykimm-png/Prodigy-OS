"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const hash = view("llmwiki-hash.js");
const operationApi = view("llmwiki-operation-contract.js");
const packetApi = view("llmwiki-risk-approval-packet.js");
const reviewCommit = view("llmwiki-approval-review-commit.js");
const repacketApi = view("llmwiki-approval-repacket-service.js");
view("llmwiki-risk-write-set.js");
const batchApi = view("llmwiki-safe-batch-approval.js");
view("llmwiki-risk-approval-review-view.js");
const review = view("llmwiki-approval-review-view.js");
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");

function operation(kind, id, overrides = {}) {
  const target = `ZETA/PERMANENT/${id}.md`;
  const before = `${id} before\n`;
  const base = hash.sha256(before);
  const sourcePaths = [`ZETA/PERMANENT/${id}-a.md`, `ZETA/PERMANENT/${id}-b.md`];
  const sourceBytes = { [sourcePaths[0]]: "alpha\n", [sourcePaths[1]]: "beta\n" };
  const mergeBase = Object.fromEntries([[target, before], ...Object.entries(sourceBytes)].map(([key, value]) => [key, hash.sha256(value)]));
  const value = kind === "merge" ? {
    contract_version: operationApi.CONTRACT_VERSION, operation_id: id, kind, destination_ids: [target], source_ids: sourcePaths,
    base_revisions: mergeBase, before_bytes: { [target]: before, ...sourceBytes }, after_bytes: { [target]: `${id} merged\n` },
    source_citations: sourcePaths.map((locator, index) => ({ source_id: `source_${id}_${index}`, content_hash: String(index + 1).repeat(64), source_url: `https://example.com/${id}/${index}`, locators: [`${locator}#claim`], source_archive_id: null, confidence: "explicit" })),
    conflicts: [], risk_tier: "high", effects: { deprecations: [], supersessions: sourcePaths.map((source) => ({ destination_id: source, target_revision: mergeBase[source], before_bytes: sourceBytes[source], replacement_id: target, reason: "merge" })) },
  } : {
    contract_version: operationApi.CONTRACT_VERSION, operation_id: id, kind, destination_ids: [target],
    base_revisions: kind === "create" ? {} : { [target]: base }, before_bytes: kind === "create" ? {} : { [target]: before },
    after_bytes: { [target]: kind === "noop" ? before : `${id} after\n` },
    source_citations: [{ source_id: `source_${id}`, content_hash: "a".repeat(64), source_url: `https://example.com/${id}`, locators: [`ZETA/LITERATURE/${id}.md#claim`], source_archive_id: null, confidence: "explicit" }],
    conflicts: [], risk_tier: kind === "update" ? "medium" : "low", effects: { deprecations: [], supersessions: [] },
  };
  Object.assign(value, overrides);
  const parsed = operationApi.parseOperation(JSON.stringify(value));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.value;
}

function packet(kind, id, overrides = {}) {
  const op = operation(kind, id, overrides.operation || {});
  const built = packetApi.buildRiskApprovalPacket({ run_id: `run_${id}`, run_revision: 1, packet_revision: 1, operation: op, summary: `${kind} summary`, provenance: { source: "librarian", source_ids: op.source_citations.map((row) => row.source_id) } });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.value;
}

function actions(root) {
  const found = [];
  (function walk(node) { if (node.attr?.["data-action"]) found.push(node.attr["data-action"]); for (const child of node.children || []) walk(child); })(root);
  return found;
}
function action(root, name) {
  let found = null;
  (function walk(node) { if (!found && node.attr?.["data-action"] === name) found = node; for (const child of node.children || []) walk(child); })(root);
  return found;
}

function memoryAdapter(failAt = 0) {
  const calls = { preflight: [], commit: [], compensate: [], audit: [] };
  return { calls,
    async preflight(item) { calls.preflight.push(item.packet_id); return { ok: true, snapshot: item.packet_hash }; },
    async commit(item) { calls.commit.push(item.packet_id); if (calls.commit.length === failAt) return { ok: false, reason: "injected_middle_failure" }; return { ok: true, receipt: { packet_id: item.packet_id, actual_touched_paths: item.operation.destination_ids.slice().sort() }, write_counts: { canonical: item.operation.kind === "noop" ? 0 : 1, audit: 1 } }; },
    async compensate(_item, receipt) { calls.compensate.push(receipt.packet_id); return { ok: true }; },
    async auditBatch(record) { calls.audit.push(record); return { ok: true }; },
  };
}

test("risk packets bind deterministic risk, conflicts, exact bytes, provenance, and operation coverage", () => {
  const create = packet("create", "operation_risk_create");
  const update = packet("update", "operation_risk_update");
  const merge = packet("merge", "operation_risk_merge");
  const noop = packet("noop", "operation_risk_noop");
  assert.deepEqual([create.risk.tier, update.risk.tier, merge.risk.tier, noop.risk.tier], ["low", "medium", "high", "low"]);
  assert.deepEqual([create.batch_eligible, update.batch_eligible, merge.batch_eligible, noop.batch_eligible], [true, false, false, false]);
  assert.equal(create.before_after[0].before, null);
  assert.match(update.before_after[0].before, /before/);
  assert.match(update.before_after[0].after, /after/);
  assert.equal(noop.approval_eligible, false);
  assert.equal(packetApi.isRiskApprovalPacket(create), true);
  assert.equal(packetApi.isRiskApprovalPacket({ ...create }), false);
  assert.equal(create.provenance.source_ids[0], create.source_lineage[0].source_id);
  const legacyTarget = operation("create", "operation_legacy_para", { destination_ids: ["PARA/RESOURCES/Knowledge/legacy.md"], after_bytes: { "PARA/RESOURCES/Knowledge/legacy.md": "legacy\n" } });
  assert.equal(packetApi.buildRiskApprovalPacket({ run_id: "run_legacy_para", run_revision: 1, packet_revision: 1, operation: legacyTarget, summary: "legacy", provenance: { source_ids: legacyTarget.source_citations.map((row) => row.source_id) } }).reason, "canonical_target_required");
});

test("dedicated single-risk authorization accepts reviewed high risk, rejects conflicts/no-op/copies, and replays without legacy create-only APIs", async () => {
  const high = packet("merge", "operation_single_high");
  const noop = packet("noop", "operation_single_noop");
  const authorized = reviewCommit.authorizeRiskPacket(high, { action: "approve", packet_id: high.packet_id });
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  assert.equal(reviewCommit.authorizeRiskPacket(noop, { action: "approve", packet_id: noop.packet_id }).reason, "risk_packet_not_approvable");
  assert.equal(reviewCommit.authorizeRiskPacket({ ...high }, { action: "approve", packet_id: high.packet_id }).reason, "branded_risk_packet_required");
  const calls = [];
  const adapter = { async preflight(item) { calls.push(["preflight", item.packet_id]); return { ok: true }; }, async commit(item) { calls.push(["commit", item.packet_id]); return { ok: true, status: "committed", receipt: { operation_id: item.operation.operation_id, actual_touched_paths: global.LLMWikiRiskWriteSet.packetPaths(item, packetApi) }, write_counts: { canonical: item.operation.destination_ids.length + item.operation.effects.supersessions.length, audit: 1, refresh: 0, git: 0 } }; } };
  const committed = await reviewCommit.commitRiskApproved({ packet: high, authorization: authorized.value, adapter });
  assert.equal(committed.status, "committed");
  assert.deepEqual(calls.map((row) => row[0]), ["preflight", "commit"]);
  assert.equal((await reviewCommit.commitRiskApproved({ packet: high, authorization: authorized.value, adapter })).status, "duplicate");
  assert.equal(calls.length, 2);
  assert.equal((await reviewCommit.commitRiskApproved({ packet: high, authorization: { ...authorized.value }, adapter })).reason, "branded_risk_authorization_required");
});

test("high-risk and unresolved-conflict packets cannot enter selection or authorization", () => {
  const low = packet("create", "operation_select_low");
  const high = packet("merge", "operation_select_high");
  const conflict = packet("create", "operation_select_conflict", { operation: { conflicts: [{ conflict_id: "conflict_select", status: "unresolved", source_ids: ["source_operation_select_conflict"], summary: "sources conflict" }] } });
  assert.equal(batchApi.canSelect(high), false);
  assert.equal(batchApi.canSelect(conflict), false);
  assert.equal(batchApi.authorizeExactBatch([low, high], [low.packet_id, high.packet_id]).reason, "ineligible_batch_packet");
  assert.equal(batchApi.authorizeExactBatch([low, conflict], [low.packet_id, conflict.packet_id]).reason, "ineligible_batch_packet");
});

test("natural-language repacket invalidates old packet and callback even with identical rendered bytes", async () => {
  const original = packet("create", "operation_repacket_original");
  let invalidatedRun = null;
  const service = repacketApi.create({ packetApi, operationApi, transform: async ({ operation }) => operation, invalidateRun: (identity) => { invalidatedRun = identity; } });
  const replaced = await service.requestRevision(original, "핵심 문장은 유지하고 출처 설명을 더 명확하게 해줘");
  assert.equal(replaced.ok, true, JSON.stringify(replaced));
  assert.notEqual(replaced.value.packet_id, original.packet_id);
  assert.equal(replaced.value.run_revision, 2);
  assert.equal(replaced.value.packet_revision, 2);
  assert.deepEqual(replaced.value.before_after, original.before_after);
  assert.equal(replaced.value.repacket.original_packet_id, original.packet_id);
  assert.equal(replaced.value.source_lineage.length, original.source_lineage.length);
  assert.equal(packetApi.verifyRiskApprovalPacket(original).reason, "packet_invalidated");
  assert.equal(batchApi.authorizeExactBatch([original], [original.packet_id]).reason, "invalidated_batch_packet");
  assert.equal(invalidatedRun.packet_id, original.packet_id);
  const staleAuthorization = reviewCommit.authorizeRiskPacket(replaced.value, { action: "approve", packet_id: replaced.value.packet_id });
  assert.equal(staleAuthorization.ok, true);
  packetApi.invalidateRiskApprovalPacket(replaced.value);
  let adapterEntries = 0;
  const staleCommit = await reviewCommit.commitRiskApproved({ packet: replaced.value, authorization: staleAuthorization.value, adapter: { preflight() { adapterEntries += 1; }, commit() { adapterEntries += 1; } } });
  assert.equal(staleCommit.reason, "packet_invalidated");
  assert.equal(adapterEntries, 0);
});

test("exact-set batch rejects add, drop, duplicate, reorder, stale, mixed, and copied controls before adapter entry", async () => {
  const a = packet("create", "operation_batch_a");
  const b = packet("create", "operation_batch_b");
  const sorted = [a, b].sort((left, right) => left.packet_id.localeCompare(right.packet_id));
  const ids = sorted.map((item) => item.packet_id);
  assert.equal(batchApi.authorizeExactBatch(sorted, ids.slice().reverse()).reason, "selection_not_canonical_order");
  assert.equal(batchApi.authorizeExactBatch(sorted, [ids[0]]).reason, "selection_set_mismatch");
  assert.equal(batchApi.authorizeExactBatch(sorted, [...ids, ids[1]]).reason, "duplicate_selection");
  assert.equal(batchApi.authorizeExactBatch([sorted[0]], ids).reason, "selection_set_mismatch");
  assert.equal(batchApi.authorizeExactBatch([{ ...sorted[0] }, sorted[1]], ids).reason, "branded_risk_packet_required");
  const approved = batchApi.authorizeExactBatch(sorted, ids);
  assert.equal(approved.ok, true, JSON.stringify(approved));
  const adapter = memoryAdapter();
  assert.equal((await batchApi.commitExactBatch({ packets: sorted.slice().reverse(), authorization: approved.value, adapter })).reason, "packet_order_mismatch");
  assert.equal((await batchApi.commitExactBatch({ packets: [{ ...sorted[0] }, sorted[1]], authorization: approved.value, adapter })).reason, "branded_risk_packet_required");
  assert.deepEqual(adapter.calls, { preflight: [], commit: [], compensate: [], audit: [] });
  packetApi.invalidateRiskApprovalPacket(sorted[1]);
  assert.equal((await batchApi.commitExactBatch({ packets: sorted, authorization: approved.value, adapter })).reason, "invalidated_batch_packet");
  assert.deepEqual(adapter.calls, { preflight: [], commit: [], compensate: [], audit: [] });
});

test("safe batch preflights all, writes only exact deterministic set, audits counters, replays idempotently, and compensates middle failure", async () => {
  const packets = [packet("create", "operation_commit_c"), packet("create", "operation_commit_a"), packet("create", "operation_commit_b")].sort((a, b) => a.packet_id.localeCompare(b.packet_id));
  const approval = batchApi.authorizeExactBatch(packets, packets.map((item) => item.packet_id)).value;
  const successAdapter = memoryAdapter();
  const success = await batchApi.commitExactBatch({ packets, authorization: approval, adapter: successAdapter });
  assert.equal(success.status, "committed");
  assert.deepEqual(successAdapter.calls.preflight, packets.map((item) => item.packet_id));
  assert.deepEqual(successAdapter.calls.commit, packets.map((item) => item.packet_id));
  const approvedDestinations = new Set(packets.flatMap((item) => [...item.operation.destination_ids, ...item.operation.effects.deprecations.map((row) => row.destination_id), ...item.operation.effects.supersessions.map((row) => row.destination_id)]));
  assert.equal(successAdapter.calls.commit.every((packetId) => packets.some((item) => item.packet_id === packetId && item.operation.destination_ids.every((id) => approvedDestinations.has(id)))), true);
  assert.deepEqual(success.write_counts, { canonical: 3, audit: 4, refresh: 0, git: 0 });
  const replay = await batchApi.commitExactBatch({ packets, authorization: approval, adapter: successAdapter });
  assert.equal(replay.status, "duplicate");
  assert.equal(successAdapter.calls.commit.length, 3);

  const failurePackets = [packet("create", "operation_failure_a"), packet("create", "operation_failure_b"), packet("create", "operation_failure_c")].sort((a, b) => a.packet_id.localeCompare(b.packet_id));
  const failureApproval = batchApi.authorizeExactBatch(failurePackets, failurePackets.map((item) => item.packet_id)).value;
  const failureAdapter = memoryAdapter(2);
  const failed = await batchApi.commitExactBatch({ packets: failurePackets, authorization: failureApproval, adapter: failureAdapter });
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "injected_middle_failure");
  assert.deepEqual(failureAdapter.calls.compensate, [failurePackets[0].packet_id]);
  assert.equal(failed.full_success, false);
  assert.equal(failed.write_counts.canonical, 0);
  assert.equal(failureAdapter.calls.audit.length, 1);

  const events = [];
  const preflightFailureAdapter = { async preflight(item) { events.push(`preflight:${item.packet_id}`); return item === packets[2] ? { ok: false, reason: "stale_preflight" } : { ok: true }; }, async commit(item) { events.push(`commit:${item.packet_id}`); return { ok: true }; }, async compensate() { return { ok: true }; }, async auditBatch() { return { ok: true }; } };
  const fresh = [packet("create", "operation_preflight_a"), packet("create", "operation_preflight_b"), packet("create", "operation_preflight_c")].sort((a, b) => a.packet_id.localeCompare(b.packet_id));
  const freshApproval = batchApi.authorizeExactBatch(fresh, fresh.map((item) => item.packet_id)).value;
  const preflightAdapter = { ...preflightFailureAdapter, async preflight(item) { events.push(`preflight:${item.packet_id}`); return item === fresh[2] ? { ok: false, reason: "stale_preflight" } : { ok: true }; } };
  assert.equal((await batchApi.commitExactBatch({ packets: fresh, authorization: freshApproval, adapter: preflightAdapter })).reason, "stale_preflight");
  assert.equal(events.some((event) => event.startsWith("commit:")), false);
});

test("committed batch audit exceptions expose a machine-readable reason after compensation", async () => {
  const item = packet("create", "operation_audit_write_probe");
  const authorization = batchApi.authorizeExactBatch([item], [item.packet_id]).value;
  const adapter = memoryAdapter();
  adapter.auditBatch = async () => { throw new Error("audit_write_probe_failed"); };

  const result = await batchApi.commitExactBatch({ packets: [item], authorization, adapter });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "batch_audit_failed");
  assert.equal(result.audit_reason, "audit_write_probe_failed");
  assert.deepEqual(result.compensation.restored, [item.packet_id]);
  assert.deepEqual(adapter.calls.compensate, [item.packet_id]);
});

test("actual touched-path receipt mutation outside the authorized set rejects and compensates", async () => {
  const packets = [packet("create", "operation_boundary_a"), packet("create", "operation_boundary_b")].sort((a, b) => a.packet_id.localeCompare(b.packet_id));
  const authorization = batchApi.authorizeExactBatch(packets, packets.map((item) => item.packet_id)).value;
  const adapter = memoryAdapter();
  const normalCommit = adapter.commit;
  adapter.commit = async (item) => {
    const written = await normalCommit(item);
    return { ...written, receipt: { ...written.receipt, actual_touched_paths: [...written.receipt.actual_touched_paths, "ZETA/PERMANENT/not-selected.md"] }, write_counts: { canonical: 4, audit: 1 } };
  };
  const result = await batchApi.commitExactBatch({ packets, authorization, adapter });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "unexpected_touched_path");
  assert.equal(result.full_success, false);
  assert.deepEqual(adapter.calls.compensate, [packets[0].packet_id]);
  assert.equal(adapter.calls.commit.length, 1);
});

test("production Knowledge manifest closes the no-Node risk path in exact order and preserves four tabs", () => {
  delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"))];
  const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("knowledge").required;
  const riskPaths = ["llmwiki-hash.js", "llmwiki-operation-contract.js", "llmwiki-write-boundary-policy.js", "llmwiki-risk-approval-packet.js", "llmwiki-approval-repacket-service.js", "llmwiki-risk-write-set.js", "llmwiki-safe-batch-approval.js", "llmwiki-risk-approval-review-view.js"].map((name) => `SYSTEM/Views/${name}`);
  assert.equal(riskPaths.every((modulePath) => manifest.filter((entry) => entry === modulePath).length === 1), true);
  assert.equal(riskPaths.every((modulePath, index) => index === 0 || manifest.indexOf(riskPaths[index - 1]) < manifest.indexOf(modulePath)), true);
  assert.equal(manifest.includes("SYSTEM/Views/llmwiki-approval-packet.js"), false, "legacy PARA packet must stay outside the authoritative risk closure");
  const sandbox = { URL, TextEncoder, AbortController, console }; sandbox.globalThis = sandbox; sandbox.window = sandbox;
  for (const modulePath of riskPaths) vm.runInNewContext(fs.readFileSync(path.join(ROOT, modulePath), "utf8"), sandbox, { filename: modulePath });
  assert.equal(sandbox.require, undefined); assert.equal(sandbox.Buffer, undefined); assert.equal(sandbox.process, undefined);
  const parsed = sandbox.LLMWikiOperationContract.parseOperation(JSON.stringify({
    contract_version: "llmwiki_operation_contract_v1", operation_id: "operation_vm_risk", kind: "create", destination_ids: ["ZETA/PERMANENT/vm-risk.md"], base_revisions: {}, before_bytes: {}, after_bytes: { "ZETA/PERMANENT/vm-risk.md": "after\n" }, source_citations: [{ source_id: "source_vm_risk", content_hash: "a".repeat(64), source_url: "https://example.com/vm", locators: ["ZETA/LITERATURE/vm.md#claim"], source_archive_id: null, confidence: "explicit" }], conflicts: [], risk_tier: "low", effects: { deprecations: [], supersessions: [] },
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const built = sandbox.LLMWikiRiskApprovalPacket.buildRiskApprovalPacket({ run_id: "run_vm_risk", run_revision: 1, packet_revision: 1, operation: parsed.value, summary: "브라우저 위험 검토", provenance: { source: "vm", source_ids: ["source_vm_risk"] } });
  assert.equal(built.ok, true, JSON.stringify(built));
  const root = new FakeElement("section");
  sandbox.LLMWikiRiskApprovalReviewView.mountRiskApprovalReview({ container: root, packets: [built.value], packetApi: sandbox.LLMWikiRiskApprovalPacket, batchApi: sandbox.LLMWikiSafeBatchApproval });
  assert.match(collectText(root), /브라우저 위험 검토|변경 전|변경 후/);
  const tabs = view("knowledge-workspace-tabs.js").TABS;
  assert.deepEqual(tabs.map((tab) => tab.id), ["zettelkasten", "para", "llmwiki", "llmwiki-browse"]);
});

test("beginner review model and DOM expose readable fields/actions without schema or internal editors", () => {
  const low = packet("create", "operation_ui_low");
  const high = packet("merge", "operation_ui_high");
  const root = new FakeElement("section");
  const boundaries = [];
  const surface = review.mountRiskApprovalReview({ container: root, packets: [low, high], packetApi, batchApi, onReject: (value) => boundaries.push({ kind: "reject", packet: value }), onRequestRevision: (value) => boundaries.push({ kind: "revision", ...value }) });
  const text = collectText(root);
  assert.match(text, /새 지식 만들기|요약|출처 흐름|변경 전|변경 후|위험|충돌 상태/);
  assert.deepEqual(actions(root).filter((item) => ["approve", "reject", "request-revision", "approve-batch"].includes(item)).sort(), ["approve", "approve-batch", "reject", "request-revision"]);
  assert.doesNotMatch(text, /schema|packet_hash|operation_id|payload_hash|내부 필드/i);
  assert.equal(surface.model[0].selectable, true);
  assert.equal(surface.model[1].selectable, false);
  assert.equal((function count(node) { return (node.tag === "textarea" || node.tag === "input" && node.attr?.type !== "checkbox" ? 1 : 0) + (node.children || []).reduce((sum, child) => sum + count(child), 0); })(root), 0);
  action(root, "reject").onclick({ preventDefault() {} });
  surface.requestRevision("출처 설명을 초보자에게 더 쉽게 써줘");
  assert.deepEqual(boundaries.map((item) => item.kind), ["reject", "revision"]);
  assert.equal(boundaries[1].guidance, "출처 설명을 초보자에게 더 쉽게 써줘");
});
