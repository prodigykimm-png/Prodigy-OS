(function (root) {
  "use strict";

  // Task 10 (llmwiki-batch-core-simplification): batch approval application
  // authority for Task 9 lifecycle proposals targeting ZETA/LITERATURE and
  // ZETA/CANDIDATES.
  //
  // Remediation contract (post-review):
  //   - There is NO second authorization format and NO direct vault writer
  //     here. Every selected operation is branded into a retained
  //     LLMWikiRiskApprovalPacket, authorized through the retained
  //     LLMWikiSafeBatchApproval.authorizeExactBatch (batch-eligible creates)
  //     or LLMWikiApprovalReviewCommit.authorizeRiskPacket (reviewed risky
  //     operations), and applied exclusively through the retained
  //     LLMWikiSafeBatchApproval.commitExactBatch /
  //     LLMWikiApprovalReviewCommit.commitRiskApproved chain with real audit
  //     receipt writes and branded writer-core compensation.
  //   - The full operation (kind, destinations, before revisions/bytes, after
  //     bytes) is bound into the retained authorization via the packet hash /
  //     packet snapshots; apply re-verifies the group payload against the
  //     authorized packets and rejects a tampered group before any write.
  //   - Operations are applied independently: stale inputs are partitioned
  //     out as reviewable before entering the retained chain, one failure is
  //     compensated through the retained compensation path without blocking
  //     unrelated approved operations, and no whole-batch rollback happens
  //     merely because one operation is stale.
  //   - Explicit user approval remains mandatory (user_action ===
  //     "explicit_user_approval"); there is no auto-approval path.

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const packetAuthority = root.LLMWikiRiskApprovalPacket
    || (typeof require === "function" ? require("./llmwiki-risk-approval-packet.js") : null);
  const safeBatch = root.LLMWikiSafeBatchApproval
    || (typeof require === "function" ? require("./llmwiki-safe-batch-approval.js") : null);
  const reviewCommit = root.LLMWikiApprovalReviewCommit
    || (typeof require === "function" ? require("./llmwiki-approval-review-commit.js") : null);
  const writeSetApi = root.LLMWikiRiskWriteSet
    || (typeof require === "function" ? require("./llmwiki-risk-write-set.js") : null);
  const writerCore = root.LLMWikiOperationWriterCore
    || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);

  const HASH = /^[0-9a-f]{64}$/u;
  const NONCE = /^[A-Za-z0-9_-]{16,128}$/u;
  const AUDIT_DIRECTORY = ".llmwiki-audit/";
  const EXPLICIT_ACTION = "explicit_user_approval";
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, refresh: 0, git: 0 });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function isBrandedRecord(value) {
    const contract = root.LLMWikiOperationContract;
    return Boolean(value) && typeof value === "object" && typeof contract?.isOperationRecord === "function" && contract.isOperationRecord(value);
  }
  function freeze(value) {
    if (isBrandedRecord(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha(value) { return hashApi.sha256(String(value)); }
  function fail(reason) { return freeze({ ok: false, reason }); }

  // --- grouping ---------------------------------------------------------

  function groupProposalsBySource(input) {
    if (!plain(input) || !plain(input.source) || !plain(input.materializeResult)) return fail("group_input_required");
    if (input.materializeResult.ok !== true) return fail(input.materializeResult.reason || "materialization_failed");
    if (!HASH.test(String(input.source.content_hash || ""))) return fail("invalid_source_hash");
    const materialized = input.materializeResult;
    return freeze({
      ok: true,
      value: freeze({
        source_id: String(input.source.source_id || ""),
        source_path: String(input.source.source_path || ""),
        content_hash: input.source.content_hash,
        proposals: materialized.proposals || [],
        holds: materialized.holds || [],
        para_drafts: materialized.para_drafts || [],
      }),
    });
  }

  // --- related-candidate resolution boundary ----------------------------

  function relatedResolution(allowedIds, relatedRows) {
    const allowed = Array.isArray(allowedIds) ? [...new Set(allowedIds.filter((id) => typeof id === "string"))].sort() : [];
    const known = new Set((Array.isArray(relatedRows) ? relatedRows : []).map((row) => plain(row) ? row.candidate_id : null));
    return { allowed, unresolved: allowed.filter((id) => !known.has(id)).sort() };
  }

  function preselectionMatrix(group, options = {}) {
    if (!plain(group) || !Array.isArray(group.proposals)) return fail("group_required");
    const resolution = relatedResolution(options.allowedCandidateIds, options.relatedCandidates);
    if (resolution.allowed.length > 0 && resolution.allowed.length === resolution.unresolved.length) {
      return fail("related_candidate_index_incomplete");
    }
    const degraded = resolution.unresolved.length > 0;
    const operations = [];
    for (const proposal of group.proposals.slice().sort((a, b) => a.operation.operation_id < b.operation.operation_id ? -1 : 1)) {
      let selected;
      let reason;
      if (degraded && proposal.operation.kind === "create") {
        selected = false;
        reason = "unresolved_related_candidate_hold";
      } else if (proposal.class === "create" && proposal.operation.kind === "create"
        && proposal.operation.risk_tier === "low" && proposal.operation.conflicts.length === 0) {
        selected = true;
        reason = "safe_create_preselected";
      } else {
        selected = false;
        reason = "risky_operation_requires_explicit_review";
      }
      operations.push(freeze({
        operation_id: proposal.operation.operation_id,
        unit_id: proposal.unit_id,
        class: proposal.class,
        kind: proposal.operation.kind,
        risk_tier: proposal.operation.risk_tier,
        destination_ids: [...proposal.operation.destination_ids],
        selected,
        reason,
        operation: proposal.operation,
      }));
    }
    return freeze({
      ok: true,
      value: freeze({
        source_id: group.source_id,
        source_path: group.source_path,
        content_hash: group.content_hash,
        operations,
        unresolved_holds: group.holds.length,
        para_drafts_unresolved: group.para_drafts.length,
        unresolved_related_candidate_ids: resolution.unresolved,
        preselection_only: true,
      }),
    });
  }

  // --- retained-authority branding and exact-set authorization ----------

  function buildPackets(matrix, intent) {
    const runId = typeof intent.run_id === "string" && intent.run_id ? intent.run_id : "run_llmwiki_batch_approval";
    const runRevision = Number.isSafeInteger(intent.run_revision) && intent.run_revision >= 1 ? intent.run_revision : 1;
    const packetRevision = Number.isSafeInteger(intent.packet_revision) && intent.packet_revision >= 1 ? intent.packet_revision : 1;
    const entries = matrix.operations.filter((entry) => intent.selected_operation_ids.includes(entry.operation_id));
    const packets = [];
    for (const entry of entries) {
      const operation = entry.operation;
      const provenance = [...new Set(operation.source_citations.map((citation) => citation.source_id))].sort();
      const built = packetAuthority.buildRiskApprovalPacket({
        operation, run_id: runId, run_revision: runRevision, packet_revision: packetRevision,
        summary: `batch ${operation.kind} for ${matrix.source_id}`,
        provenance: { source_ids: provenance },
      });
      if (!built.ok) return built;
      packets.push(built.value);
    }
    return Object.freeze({ ok: true, value: Object.freeze(packets.slice()) });
  }

  function authorizeBatch(matrix, intent = {}) {
    if (!plain(matrix) || !Array.isArray(matrix.operations)) return fail("matrix_required");
    if (!packetAuthority || !safeBatch || !reviewCommit || !writeSetApi || !writerCore) return fail("retained_authority_missing");
    if (intent.user_action !== EXPLICIT_ACTION) return fail("explicit_user_approval_required");
    if (!Array.isArray(intent.selected_operation_ids) || intent.selected_operation_ids.length === 0) return fail("selection_required");
    const ids = intent.selected_operation_ids;
    if (new Set(ids).size !== ids.length) return fail("duplicate_selection");
    const known = new Set(matrix.operations.map((entry) => entry.operation_id));
    if (ids.some((id) => !known.has(id))) return fail("unknown_operation_selected");

    const built = buildPackets(matrix, intent);
    if (!built.ok) return built;
    const packets = built.value;
    const byOperationId = new Map(packets.map((packet) => [packet.operation.operation_id, packet]));

    const risk_authorizations = {};
    const batchEligible = [];
    for (const packet of packets) {
      if (packet.batch_eligible === true) { batchEligible.push(packet); continue; }
      const authorized = reviewCommit.authorizeRiskPacket(packet, { action: "approve", packet_id: packet.packet_id });
      if (!authorized.ok) return authorized;
      risk_authorizations[packet.operation.operation_id] = authorized.value;
    }
    batchEligible.sort((a, b) => a.packet_id < b.packet_id ? -1 : 1);
    const batchAuthorization = batchEligible.length > 0
      ? safeBatch.authorizeExactBatch(batchEligible, batchEligible.map((packet) => packet.packet_id))
      : { ok: true, value: null };
    if (!batchAuthorization.ok) return batchAuthorization;

    // Retained-branded objects (risk packets, exact-set authorization,
    // per-packet risk authorizations) must keep their object identity -
    // the retained authorities recognize them through WeakSets. Freeze the
    // envelope shallowly and pass those members through by reference.
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        user_action: EXPLICIT_ACTION,
        source_id: matrix.source_id,
        packets: Object.freeze(packets.slice()),
        batch_packets: Object.freeze(batchEligible.slice()),
        batch_authorization: batchAuthorization.value,
        risk_authorizations: Object.freeze({ ...risk_authorizations }),
        selection_set: Object.freeze(ids.slice().sort()),
      }),
    });
  }

  // --- B2 binding: group payload must match the authorized packets ------

  function verifyGroupBinding(group, packets) {
    if (!plain(group) || !Array.isArray(group.proposals) || !Array.isArray(packets)) return fail("tampered_group_payload");
    const proposals = new Map(group.proposals.map((proposal) => [proposal.operation.operation_id, proposal]));
    for (const packet of packets) {
      if (!packetAuthority.isRiskApprovalPacket(packet)) return fail("tampered_group_payload");
      const proposal = proposals.get(packet.operation.operation_id);
      if (!proposal) return fail("tampered_group_payload");
      if (stable(packet.operation) !== stable(proposal.operation)) return fail("tampered_group_payload");
      for (const row of packet.before_after) {
        if (sha(proposal.operation.after_bytes[row.destination_id]) !== row.after_sha256) return fail("tampered_group_payload");
        const expectedBefore = Object.hasOwn(proposal.operation.before_bytes || {}, row.destination_id)
          ? sha(proposal.operation.before_bytes[row.destination_id]) : null;
        if (expectedBefore !== row.before_sha256) return fail("tampered_group_payload");
      }
    }
    return null;
  }

  // --- vault-backed adapter for the retained commit chain ----------------

  async function readLive(vault, targetPath) {
    try {
      const bytes = await vault.readBytes(targetPath);
      return bytes === null || typeof bytes === "string" ? bytes : undefined;
    } catch (_error) { return undefined; }
  }

  function auditPath(key) {
    return typeof key === "string" && NONCE.test(key) ? `${AUDIT_DIRECTORY}${key}.json` : null;
  }

  async function writeAuditRecord(vault, key, body) {
    const targetPath = auditPath(key);
    if (!targetPath) throw new Error("audit_key_invalid");
    const withHash = freeze({ ...body, audit_hash: sha(stable(body)) });
    await vault.writeExact(targetPath, `${JSON.stringify(withHash, null, 2)}\n`);
    return withHash;
  }

  function createVaultAdapter(context) {
    const { vault, nowIso, batchIdentityRef } = context;
    const journals = new Map();
    const stats = { canonical: 0, audits: 0 };

    async function restoreEntry(entry) {
      // Branded restore through the retained writer-core compensation
      // primitives; unbranded or drifted targets refuse to be touched.
      const current = await readLive(vault, entry.path);
      if (current === undefined) return false;
      if (entry.before === null) {
        if (current === null) return true; // already clean
        const request = writerCore.issueRestoreRequest(freeze({
          target_path: entry.path, expected_written_bytes: entry.after, expected_written_sha256: sha(entry.after),
        }));
        try { writerCore.assertRestoreRequest(request, current); } catch (_error) { return false; }
        return (await vault.deleteExact(entry.path))?.ok === true && await readLive(vault, entry.path) === null;
      }
      if (current === entry.before) return true; // already restored
      const request = writerCore.issueRestoreRequest(freeze({
        target_path: entry.path, expected_written_bytes: entry.after, expected_written_sha256: sha(entry.after),
      }));
      try { writerCore.assertRestoreRequest(request, current); } catch (_error) { return false; }
      await vault.writeExact(entry.path, entry.before);
      return await readLive(vault, entry.path) === entry.before;
    }

    return {
      stats,
      async preflight(packet) {
        const operation = packet.operation;
        for (const targetPath of operation.destination_ids) {
          const live = await readLive(vault, targetPath);
          if (live === undefined) return { ok: false, reason: "live_read_failed" };
          const expectedBefore = Object.hasOwn(operation.before_bytes || {}, targetPath) ? operation.before_bytes[targetPath] : null;
          if (operation.kind === "create" ? live !== null : live !== expectedBefore) return { ok: false, reason: "target_revision_mismatch" };
        }
        return { ok: true, snapshot: packet.packet_hash };
      },
      async commit(packet) {
        const operation = packet.operation;
        const journal = [];
        const rollback = async () => { for (const entry of journal.reverse()) await restoreEntry(entry); };
        try {
          for (const targetPath of operation.destination_ids) {
            const live = await readLive(vault, targetPath);
            if (live === undefined) throw Object.assign(new Error("live_read_failed"), { code: "live_read_failed" });
            const expectedBefore = Object.hasOwn(operation.before_bytes || {}, targetPath) ? operation.before_bytes[targetPath] : null;
            if (operation.kind === "create" ? live !== null : live !== expectedBefore) {
              throw Object.assign(new Error("target_revision_mismatch"), { code: "target_revision_mismatch" });
            }
            await vault.writeExact(targetPath, operation.after_bytes[targetPath]);
            const written = await readLive(vault, targetPath);
            if (written !== operation.after_bytes[targetPath]) throw Object.assign(new Error("write_verification_failed"), { code: "write_verification_failed" });
            journal.push(freeze({ path: targetPath, before: live, after: written }));
          }
        } catch (error) {
          await rollback();
          return { ok: false, reason: error.code || "write_failed" };
        }
        journals.set(packet.packet_id, journal);
        stats.canonical += operation.destination_ids.length;
        stats.audits += 1;
        const body = freeze({
          audit_version: "llmwiki_safe_batch_item_audit_v1",
          result: "committed",
          committed_at: nowIso,
          batch_identity: batchIdentityRef.identity,
          authorization_hash: batchIdentityRef.authorization_hash,
          packet_id: packet.packet_id,
          operation_id: operation.operation_id,
          kind: operation.kind,
          destinations: operation.destination_ids.slice().sort().map((targetPath) => ({
            path: targetPath,
            before_sha256: Object.hasOwn(operation.before_bytes || {}, targetPath) ? sha(operation.before_bytes[targetPath]) : null,
            after_sha256: sha(operation.after_bytes[targetPath]),
          })),
        });
        await writeAuditRecord(vault, operation.operation_id, body);
        return {
          ok: true, status: "committed",
          receipt: { packet_id: packet.packet_id, operation_id: operation.operation_id, actual_touched_paths: [...operation.destination_ids].sort() },
          write_counts: { canonical: operation.destination_ids.length, audit: 1, refresh: 0, git: 0 },
        };
      },
      async compensate(packet) {
        const journal = journals.get(packet.packet_id);
        if (!journal) return { ok: true }; // nothing attributed to this packet
        for (const entry of journal.slice().reverse()) {
          if (!await restoreEntry(entry)) return { ok: false, reason: "compensation_restore_failed" };
        }
        journals.delete(packet.packet_id);
        stats.canonical -= journal.length;
        return { ok: true };
      },
      async auditBatch(record) {
        stats.audits += 1;
        await writeAuditRecord(vault, record.batch_identity, freeze({ ...record, recorded_at: nowIso }));
        return { ok: true };
      },
    };
  }

  // --- independent application through the retained chain ----------------

  async function assessOperation(operation, vault) {
    let readsOk = true;
    const states = [];
    for (const targetPath of operation.destination_ids) {
      const live = await readLive(vault, targetPath);
      if (live === undefined) readsOk = false;
      states.push({ targetPath, live });
    }
    if (!readsOk) return { status: "rejected", reason: "live_read_failed", reviewable: true };
    if (states.every((row) => row.live === operation.after_bytes[row.targetPath])) {
      return { status: "duplicate", reviewable: false };
    }
    for (const row of states) {
      const expectedBefore = Object.hasOwn(operation.before_bytes || {}, row.targetPath) ? operation.before_bytes[row.targetPath] : null;
      if (operation.kind === "create" ? row.live !== null : row.live !== expectedBefore) {
        return { status: "stale", reason: operation.kind === "create" ? "create_target_exists" : "target_revision_mismatch", reviewable: true };
      }
    }
    return { status: "ready", reviewable: false };
  }

  async function applyBatch(request = {}) {
    if (!plain(request)) return fail("request_required");
    for (const key of Object.keys(request)) if (!["group", "selection", "vault", "now"].includes(key)) return fail("unknown_request_field");
    if (!plain(request.selection) || !Array.isArray(request.selection.packets) || !safeBatch || !reviewCommit) return fail("retained_selection_required");
    if (request.selection.user_action !== EXPLICIT_ACTION) return fail("explicit_user_approval_required");
    if (!plain(request.group) || !Array.isArray(request.group.proposals)) return fail("group_required");
    if (!plain(request.vault) || typeof request.vault.readBytes !== "function" || typeof request.vault.writeExact !== "function" || typeof request.vault.deleteExact !== "function") {
      return fail("exact_write_vault_required");
    }

    const tampered = verifyGroupBinding(request.group, request.selection.packets);
    if (tampered) return tampered;

    const nowIso = typeof request.now === "string" && !Number.isNaN(Date.parse(request.now)) ? request.now : new Date().toISOString();
    const proposals = new Map(request.group.proposals.map((proposal) => [proposal.operation.operation_id, proposal]));
    const results = [];
    const readyBatch = [];
    const readyRisky = [];

    for (const packet of request.selection.packets) {
      const assessment = await assessOperation(packet.operation, request.vault);
      if (assessment.status === "ready") {
        if (request.selection.batch_authorization && request.selection.batch_packets.some((row) => row.packet_id === packet.packet_id)) readyBatch.push(packet);
        else if (request.selection.risk_authorizations[packet.operation.operation_id]) readyRisky.push(packet);
        else results.push(freeze({ operation_id: packet.operation.operation_id, status: "rejected", reason: "unauthorized_operation", reviewable: true }));
      } else {
        results.push(freeze({
          operation_id: packet.operation.operation_id,
          status: assessment.status,
          ...(assessment.reason ? { reason: assessment.reason } : {}),
          reviewable: assessment.reviewable,
        }));
      }
    }

    const adapter = createVaultAdapter({
      vault: request.vault,
      nowIso,
      batchIdentityRef: { identity: request.selection.batch_authorization?.batch_identity || "unbatched_risk_commit", authorization_hash: request.selection.batch_authorization?.authorization_hash || null },
    });

    // Batch-eligible creates go through the retained exact-set batch commit.
    if (readyBatch.length > 0) {
      const sorted = readyBatch.slice().sort((a, b) => a.packet_id < b.packet_id ? -1 : 1);
      const subAuthorization = safeBatch.authorizeExactBatch(sorted, sorted.map((packet) => packet.packet_id));
      if (!subAuthorization.ok) return subAuthorization;
      const committed = await safeBatch.commitExactBatch({
        packets: sorted,
        authorization: subAuthorization.value,
        adapter: { preflight: adapter.preflight, commit: adapter.commit, compensate: adapter.compensate, auditBatch: adapter.auditBatch },
      });
      // Retained chain semantics: on success every packet committed; on
      // failure the chain already compensated all committed rows back to the
      // pre-apply state, so every packet reports failed and retryable.
      const success = committed.ok && (committed.status === "committed" || committed.status === "duplicate");
      for (const packet of sorted) {
        results.push(freeze({
          operation_id: packet.operation.operation_id,
          status: success ? "committed" : "failed",
          ...(success ? {} : { reason: committed.reason || "batch_commit_failed", compensation_status: committed.compensation_status || "restored", audit_reason: committed.audit_reason || null }),
          reviewable: !success,
          touched_paths: success ? writeSetApi.packetPaths(packet) : [],
        }));
      }
    }

    // Reviewed risky operations flow through the retained single-packet
    // risk commit with their own branded authorizations, independently.
    for (const packet of readyRisky) {
      const outcome = await reviewCommit.commitRiskApproved({
        packet,
        authorization: request.selection.risk_authorizations[packet.operation.operation_id],
        adapter: { preflight: adapter.preflight, commit: adapter.commit, compensate: adapter.compensate },
      });
      results.push(freeze({
        operation_id: packet.operation.operation_id,
        status: outcome.ok && outcome.status === "committed" ? "committed" : outcome.ok && outcome.status === "duplicate" ? "duplicate" : "failed",
        ...(outcome.ok ? {} : { reason: outcome.reason || "risk_commit_failed" }),
        reviewable: !(outcome.ok && (outcome.status === "committed" || outcome.status === "duplicate")),
        touched_paths: outcome.ok && outcome.receipt?.actual_touched_paths ? outcome.receipt.actual_touched_paths : [],
      }));
    }

    const canonical = Math.max(adapter.stats.canonical, 0);
    return freeze({
      ok: true,
      value: freeze({
        source_id: request.group.source_id,
        results: results.sort((a, b) => a.operation_id < b.operation_id ? -1 : 1),
        touched_paths: [...new Set(results.flatMap((row) => row.touched_paths || []))].sort(),
        write_counts: freeze({ ...ZERO_WRITES, canonical, audit: adapter.stats.audits }),
      }),
    });
  }

  // --- archival eligibility ----------------------------------------------

  function archivalEligibility({ group, applyResult } = {}) {
    const reasons = [];
    if (!plain(group) || !Array.isArray(group.proposals)) return freeze({ eligible: false, reasons: ["group_required"] });
    if (group.proposals.length === 0) reasons.push("no_proposals_all_no_change_or_analysis_only");
    if ((group.holds || []).length > 0) reasons.push("unresolved_holds");
    if ((group.para_drafts || []).length > 0) reasons.push("unresolved_para_drafts");
    if (!plain(applyResult) || !Array.isArray(applyResult.results)) reasons.push("not_applied_full_defer");
    else {
      const statuses = new Map(applyResult.results.map((row) => [row.operation_id, row.status]));
      for (const proposal of group.proposals) {
        const status = statuses.get(proposal.operation.operation_id);
        if (status !== "committed" && status !== "duplicate") reasons.push(`proposal_not_resolved:${proposal.operation.operation_id}:${status || "missing"}`);
      }
      for (const row of applyResult.results) {
        if (row.status === "stale") reasons.push(`stale_operation:${row.operation_id}`);
        if (row.status === "rejected" || row.status === "failed") reasons.push(`${row.status}_operation:${row.operation_id}`);
      }
    }
    return freeze({ eligible: reasons.length === 0, reasons });
  }

  const api = freeze({
    groupProposalsBySource,
    preselectionMatrix,
    authorizeBatch,
    verifyGroupBinding,
    applyBatch,
    archivalEligibility,
    EXPLICIT_ACTION,
  });
  root.LLMWikiBatchApprovalAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
