(function (root) {
  "use strict";

  const PACKET_VERSION = "llmwiki_risk_approval_packet_v1";
  const boundaryPolicy = root.LLMWikiWriteBoundaryPolicy
    || (typeof require === "function" ? require("./llmwiki-write-boundary-policy.js") : null);
  const PACKETS = new WeakSet();
  const INVALIDATED = new WeakSet();
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function clone(value) {
    if (root.LLMWikiOperationContract?.isOperationRecord?.(value) || PACKETS.has(value)) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  function freeze(value) {
    if (root.LLMWikiOperationContract?.isOperationRecord?.(value) || PACKETS.has(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function counters() { return freeze({ canonical: 0, audit: 0, refresh: 0, git: 0 }); }
  function fail(field, reason) { return freeze({ ok: false, status: "rejected", field, reason, write_counts: counters() }); }
  function ok(value) { return freeze({ ok: true, value }); }
  function sorted(values) { return [...new Set(values.map(trim).filter(Boolean))].sort(); }
  function duplicate(values) { return new Set(values).size !== values.length; }
  function sha256(value) { return root.LLMWikiHash.sha256(String(value)); }
  function markdownParts(bytes) {
    if (typeof bytes !== "string" || !bytes.startsWith("---\n")) return null;
    const end = bytes.indexOf("\n---\n", 4);
    if (end < 0) return null;
    const lines = bytes.slice(4, end).split("\n");
    const blocks = {};
    let key = null;
    for (const line of lines) {
      const match = /^([A-Za-z0-9_-]+):(?:\s.*)?$/u.exec(line);
      if (match) { key = match[1]; blocks[key] = [line]; }
      else if (key) blocks[key].push(line);
      else return null;
    }
    return { body: bytes.slice(end + 5), blocks };
  }
  function metadataOnlyConnection(operation) {
    if (operation.kind !== "update" || operation.destination_ids.length !== 1) return false;
    const target = operation.destination_ids[0];
    const before = markdownParts(operation.before_bytes[target]);
    const after = markdownParts(operation.after_bytes[target]);
    if (!before || !after || before.body !== after.body) return false;
    const keys = sorted([...Object.keys(before.blocks), ...Object.keys(after.blocks)]);
    let changed = false;
    for (const key of keys) {
      if (stable(before.blocks[key] || null) === stable(after.blocks[key] || null)) continue;
      changed = true;
      if (key !== "connections") return false;
    }
    return changed;
  }
  function derivedRisk(operation) {
    const hasEffects = operation.effects.deprecations.length > 0 || operation.effects.supersessions.length > 0;
    if (operation.kind === "merge" || operation.destination_ids.length > 1 || hasEffects || operation.conflicts.length > 0) return "high";
    if (operation.kind === "create" || operation.kind === "noop" || metadataOnlyConnection(operation)) return "low";
    return "medium";
  }
  function reasons(operation, tier) {
    const values = [`operation_${operation.kind}`, `derived_${tier}_risk`];
    if (operation.kind === "create") values.push("new_canonical_document");
    if (metadataOnlyConnection(operation)) values.push("metadata_only_connection");
    else if (operation.kind === "update") values.push("existing_canonical_revision_change");
    if (operation.kind === "merge") values.push("multi_document_supersession");
    if (operation.kind === "noop") values.push("exact_bytes_unchanged");
    if (operation.effects.deprecations.length || operation.effects.supersessions.length) values.push("relation_side_effects");
    if (operation.conflicts.length) values.push("contradiction_resolution");
    if (operation.conflicts.some((item) => item.status !== "resolved")) values.push("conflict_review_required");
    return sorted(values);
  }
  function canonicalPath(value) { return boundaryPolicy?.parseCanonicalWritePath?.(value).ok === true; }
  function citation(value) {
    return { source_id: value.source_id, content_hash: value.content_hash, source_url: value.source_url, locators: value.locators.slice(), source_archive_id: value.source_archive_id, confidence: value.confidence };
  }

  function buildRiskApprovalPacket(input) {
    const operationApi = root.LLMWikiOperationContract;
    if (!plain(input) || !operationApi?.isOperationRecord?.(input.operation)) return fail("operation", "branded_operation_required");
    if (!root.LLMWikiHash) return fail("hash", "hash_contract_required");
    const runId = trim(input.run_id);
    if (!ID.test(runId)) return fail("run_id", "invalid_run_id");
    if (!Number.isSafeInteger(input.run_revision) || input.run_revision < 1) return fail("run_revision", "invalid_run_revision");
    if (!Number.isSafeInteger(input.packet_revision) || input.packet_revision < 1) return fail("packet_revision", "invalid_packet_revision");
    const summary = trim(input.summary);
    if (!summary) return fail("summary", "summary_required");
    if (!plain(input.provenance) || !Array.isArray(input.provenance.source_ids)) return fail("provenance", "complete_provenance_required");
    const operation = input.operation;
    const authorityPaths = [...operation.destination_ids, ...(operation.source_ids || []), ...operation.effects.deprecations.map((item) => item.destination_id), ...operation.effects.supersessions.map((item) => item.destination_id)];
    if (!authorityPaths.every(canonicalPath)) return fail("operation.destination_ids", "canonical_target_required");
    const sourceIds = sorted(operation.source_citations.map((item) => item.source_id));
    if (duplicate(input.provenance.source_ids) || stable(sorted(input.provenance.source_ids)) !== stable(sourceIds)) return fail("provenance.source_ids", "source_lineage_mismatch");
    const conflicts = operation.conflicts.map(clone).sort((a, b) => a.conflict_id < b.conflict_id ? -1 : a.conflict_id > b.conflict_id ? 1 : 0);
    const blocking = conflicts.filter((item) => item.status !== "resolved");
    const beforeAfter = operation.destination_ids.slice().sort().map((destinationId) => ({ destination_id: destinationId, before: Object.hasOwn(operation.before_bytes, destinationId) ? operation.before_bytes[destinationId] : null, after: operation.after_bytes[destinationId], before_sha256: Object.hasOwn(operation.before_bytes, destinationId) ? sha256(operation.before_bytes[destinationId]) : null, after_sha256: sha256(operation.after_bytes[destinationId]) }));
    const tier = derivedRisk(operation);
    const body = {
      packet_version: PACKET_VERSION, run_id: runId, run_revision: input.run_revision, packet_revision: input.packet_revision,
      operation, summary, provenance: clone(input.provenance), source_lineage: operation.source_citations.map(citation).sort((a, b) => a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : 0), before_after: beforeAfter,
      provider_risk_claim: operation.risk_tier,
      risk: { tier, reasons: reasons(operation, tier) },
      conflict: { state: blocking.length ? "review_required" : conflicts.length ? "resolved" : "clear", conflict_ids: conflicts.map((item) => item.conflict_id), blocking_conflict_ids: blocking.map((item) => item.conflict_id) },
      approval_eligible: operation.kind !== "noop" && blocking.length === 0,
      batch_eligible: operation.kind !== "noop" && tier === "low" && blocking.length === 0,
      repacket: plain(input.repacket) ? clone(input.repacket) : null,
    };
    const canonical = stable(body);
    const packetHash = sha256(canonical);
    const packet = freeze({ ...body, packet_id: `packet_${packetHash.slice(0, 24)}`, packet_hash: packetHash, canonical_serialization: canonical });
    PACKETS.add(packet);
    return ok(packet);
  }
  function body(packet) { return Object.fromEntries(Object.entries(packet).filter(([key]) => !["packet_id", "packet_hash", "canonical_serialization"].includes(key))); }
  function verifyRiskApprovalPacket(packet) {
    if (!packet || !PACKETS.has(packet)) return fail("packet", "branded_risk_packet_required");
    if (INVALIDATED.has(packet)) return fail("packet", "packet_invalidated");
    const canonical = stable(body(packet));
    if (canonical !== packet.canonical_serialization || sha256(canonical) !== packet.packet_hash || packet.packet_id !== `packet_${packet.packet_hash.slice(0, 24)}`) return fail("packet", "risk_packet_tampered");
    return ok(packet);
  }
  function invalidateRiskApprovalPacket(packet) {
    const verified = verifyRiskApprovalPacket(packet);
    if (!verified.ok) return verified;
    INVALIDATED.add(packet);
    return ok(freeze({ packet_id: packet.packet_id, status: "invalidated" }));
  }
  function isRiskApprovalPacket(packet) { return Boolean(packet && PACKETS.has(packet)); }

  const api = Object.freeze({ PACKET_VERSION, buildRiskApprovalPacket, verifyRiskApprovalPacket, invalidateRiskApprovalPacket, isRiskApprovalPacket });
  root.LLMWikiRiskApprovalPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
