(function (root) {
  "use strict";

  const MAX_GUIDANCE_LENGTH = 4000;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (root.LLMWikiOperationContract?.isOperationRecord?.(value) || root.LLMWikiRiskApprovalPacket?.isRiskApprovalPacket?.(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function fail(reason, extras = {}) { return freeze({ ok: false, status: "rejected", reason, write_counts: { canonical: 0, audit: 0, refresh: 0, git: 0 }, ...extras }); }

  function create(options = {}) {
    const packetApi = options.packetApi || root.LLMWikiRiskApprovalPacket;
    const operationApi = options.operationApi || root.LLMWikiOperationContract;
    const hashApi = options.hashApi || root.LLMWikiHash;
    if (!packetApi || !operationApi || !hashApi || typeof options.transform !== "function" || typeof options.invalidateRun !== "function") throw new TypeError("typed_repacket_dependencies_required");
    let active = false;

    async function requestRevision(packet, rawGuidance) {
      if (active) return fail("repacket_in_progress");
      const verified = packetApi.verifyRiskApprovalPacket(packet);
      if (!verified.ok) return fail(verified.reason);
      const guidance = typeof rawGuidance === "string" ? rawGuidance.trim() : "";
      if (!guidance || guidance.length > MAX_GUIDANCE_LENGTH) return fail("natural_language_guidance_required");
      active = true;
      const invalidated = packetApi.invalidateRiskApprovalPacket(packet);
      if (!invalidated.ok) { active = false; return fail(invalidated.reason); }
      const priorIdentity = freeze({ run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id, packet_hash: packet.packet_hash, packet_revision: packet.packet_revision, operation_id: packet.operation.operation_id });
      const runInvalidation = await options.invalidateRun(priorIdentity);
      if (runInvalidation && runInvalidation.ok === false) { active = false; return fail(runInvalidation.reason || "run_invalidation_failed", { invalidated_packet_id: packet.packet_id }); }
      try {
        let transformed;
        try {
          transformed = await options.transform(freeze({
            guidance,
            operation: packet.operation,
            original_packet_identity: priorIdentity,
            source_lineage: packet.source_lineage,
            before_after: packet.before_after,
            risk: packet.risk,
            conflict: packet.conflict,
          }));
        } catch (_error) { return fail("typed_repacket_failed", { invalidated_packet_id: packet.packet_id }); }
        const candidate = transformed && transformed.ok === true ? transformed.value : transformed;
        let parsed;
        if (operationApi.isOperationRecord(candidate)) parsed = { ok: true, value: candidate };
        else if (typeof candidate === "string") parsed = operationApi.parseOperation(candidate);
        else if (plain(candidate) && typeof candidate.serialized_operation === "string") parsed = operationApi.parseOperation(candidate.serialized_operation);
        else return fail("typed_operation_required", { invalidated_packet_id: packet.packet_id });
        if (!parsed.ok) return fail(parsed.reason || "typed_operation_required", { invalidated_packet_id: packet.packet_id });
        const nextOperation = parsed.value;
        if (typeof options.activateReplacement === "function") {
          const activated = await options.activateReplacement(nextOperation, priorIdentity);
          if (!activated || activated.ok !== true || activated.run_id !== packet.run_id || activated.run_revision !== packet.run_revision + 1) return fail(activated?.reason || "replacement_run_activation_failed", { invalidated_packet_id: packet.packet_id });
        }
        const originalSources = packet.source_lineage.map((item) => item.source_id).sort();
        const nextSources = nextOperation.source_citations.map((item) => item.source_id).sort();
        if (originalSources.join("\0") !== nextSources.join("\0")) return fail("repacket_source_lineage_mismatch", { invalidated_packet_id: packet.packet_id });
        const guidanceHash = hashApi.sha256(guidance);
        const provenance = {
          ...packet.provenance,
          source_ids: nextSources,
          repacket_lineage: [...(Array.isArray(packet.provenance.repacket_lineage) ? packet.provenance.repacket_lineage : []), {
            original_packet_id: packet.packet_id,
            original_packet_hash: packet.packet_hash,
            original_run_revision: packet.run_revision,
            guidance_hash: guidanceHash,
          }],
        };
        return packetApi.buildRiskApprovalPacket({
          run_id: packet.run_id,
          run_revision: packet.run_revision + 1,
          packet_revision: packet.packet_revision + 1,
          operation: nextOperation,
          summary: plain(transformed) && typeof transformed.summary === "string" && transformed.summary.trim() ? transformed.summary.trim() : packet.summary,
          provenance,
          repacket: { original_packet_id: packet.packet_id, original_packet_hash: packet.packet_hash, guidance_hash: guidanceHash, invalidated_run_revision: packet.run_revision },
        });
      } finally { active = false; }
    }

    return Object.freeze({ requestRevision, repacket: requestRevision });
  }

  const api = Object.freeze({ MAX_GUIDANCE_LENGTH, create });
  root.LLMWikiApprovalRepacketService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
