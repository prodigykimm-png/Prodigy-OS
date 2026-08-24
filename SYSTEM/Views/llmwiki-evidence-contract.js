(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;
  const CONTRACT_VERSION = "llmwiki_evidence_contract_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const OWNER_TYPES = new Set(["human", "team"]);
  const STALE_KINDS = new Set(["extractor_revision_changed", "invalidation_condition_met"]);
  const MAINTENANCE_EVIDENCE = new WeakSet();
  const MAX_MAINTENANCE_RECORDS = 500;
  const MAX_SERIALIZED_MAINTENANCE = 4 * 1024 * 1024;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (value instanceof Map) return value;
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) {
    if (!crypto) throw new Error("crypto unavailable");
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function fail(field, reason) { return freeze({ ok: false, field, reason, writer_count: 0 }); }
  function validTimestamp(value) {
    const text = trim(value);
    if (!text || !Number.isFinite(Date.parse(text))) return false;
    try { return new Date(text).toISOString() === text; } catch (_error) { return false; }
  }
  function safeLocator(value) {
    const locator = trim(value);
    const pathPart = locator.split("#", 1)[0];
    if (!locator || /[\u0000-\u001f\u007f]/u.test(locator) || locator.includes("\\") || locator.includes("[[") || locator.includes("]]")) return "";
    if (pathPart.startsWith("/") || /^[A-Za-z]:/u.test(pathPart)) return "";
    if (pathPart.split("/").some((part) => part === "." || part === "..")) return "";
    return locator;
  }
  function stringList(value) { return list(value).map(trim).filter(Boolean); }
  function writeCounters() { return freeze({ canonical: 0, maintenance: 0, writer: 0, git: 0 }); }
  function objectLike(value) { return Boolean(value) && (typeof value === "object" || typeof value === "function"); }

  function createMaintenanceEvidenceRecord(serialized) {
    if (objectLike(serialized) && MAINTENANCE_EVIDENCE.has(serialized)) return Object.freeze({ ok: true, value: serialized });
    if (typeof serialized !== "string") return fail("maintenance_evidence", "serialized_record_required");
    if (!serialized || serialized.length > MAX_SERIALIZED_MAINTENANCE) return fail("maintenance_evidence", "record_limit_exceeded");
    let input;
    try { input = JSON.parse(serialized); } catch (_) { return fail("maintenance_evidence", "malformed_record"); }
    if (!plain(input) || !HASH.test(trim(input.snapshot_revision)) || !Array.isArray(input.records) || input.records.length > MAX_MAINTENANCE_RECORDS) {
      return fail("maintenance_evidence", "malformed_record");
    }
    const records = [];
    const seen = new Set();
    for (const [index, row] of input.records.entries()) {
      if (!plain(row) || !ID.test(trim(row.evidence_id)) || !HASH.test(trim(row.evidence_revision)) || seen.has(trim(row.evidence_id))) {
        return fail(`maintenance_evidence.records.${index}`, "malformed_evidence_record");
      }
      const canonicalIds = stringList(row.canonical_ids);
      const sourceIds = stringList(row.source_ids);
      const status = trim(row.status || "accepted").toLocaleLowerCase("en-US");
      if (canonicalIds.length === 0 || canonicalIds.length !== list(row.canonical_ids).length || new Set(canonicalIds).size !== canonicalIds.length || canonicalIds.some((id) => !ID.test(id))
        || sourceIds.length !== list(row.source_ids).length || new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => !ID.test(id))
        || !Array.isArray(row.citations) || !Array.isArray(row.claims)
        || !["accepted", "stale", "denied", "poisoned"].includes(status)) {
        return fail(`maintenance_evidence.records.${index}`, "malformed_evidence_record");
      }
      const citations = [];
      const citationIds = new Set();
      for (const [citationIndex, citation] of row.citations.entries()) {
        const span = plain(citation) ? citation.source_span : null;
        if (!plain(citation) || !ID.test(trim(citation.citation_id)) || citationIds.has(trim(citation.citation_id)) || !ID.test(trim(citation.source_id))
          || !HASH.test(trim(citation.source_revision)) || !HASH.test(trim(citation.extractor_revision)) || !HASH.test(trim(citation.span_digest))
          || !plain(span) || !safeLocator(span.locator) || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start) {
          return fail(`maintenance_evidence.records.${index}.citations.${citationIndex}`, "malformed_maintenance_citation");
        }
        citationIds.add(trim(citation.citation_id));
        citations.push({
          citation_id: trim(citation.citation_id),
          source_id: trim(citation.source_id),
          source_revision: trim(citation.source_revision),
          extractor_revision: trim(citation.extractor_revision),
          source_span: { locator: safeLocator(span.locator), start: span.start, end: span.end },
          span_digest: trim(citation.span_digest),
        });
      }
      const claims = [];
      const claimIds = new Set();
      const referenced = new Set();
      for (const [claimIndex, claim] of row.claims.entries()) {
        const ids = plain(claim) ? stringList(claim.citation_ids) : [];
        if (!plain(claim) || !ID.test(trim(claim.claim_id)) || claimIds.has(trim(claim.claim_id)) || ids.length === 0 || ids.length !== list(claim.citation_ids).length
          || new Set(ids).size !== ids.length || ids.some((id) => !citationIds.has(id))) {
          return fail(`maintenance_evidence.records.${index}.claims.${claimIndex}`, "malformed_maintenance_claim");
        }
        claimIds.add(trim(claim.claim_id));
        ids.forEach((id) => referenced.add(id));
        claims.push({ claim_id: trim(claim.claim_id), citation_ids: ids.sort((a, b) => a.localeCompare(b, "en")) });
      }
      if (citations.some((citation) => !referenced.has(citation.citation_id)) || citations.some((citation) => !sourceIds.includes(citation.source_id))) {
        return fail(`maintenance_evidence.records.${index}`, "unbound_maintenance_citation");
      }
      citations.sort((a, b) => a.source_id.localeCompare(b.source_id, "en") || a.source_revision.localeCompare(b.source_revision, "en")
        || a.extractor_revision.localeCompare(b.extractor_revision, "en") || a.source_span.locator.localeCompare(b.source_span.locator, "en")
        || a.source_span.start - b.source_span.start || a.source_span.end - b.source_span.end || a.span_digest.localeCompare(b.span_digest, "en")
        || a.citation_id.localeCompare(b.citation_id, "en"));
      claims.sort((a, b) => a.claim_id.localeCompare(b.claim_id, "en") || a.citation_ids.join("\0").localeCompare(b.citation_ids.join("\0"), "en"));
      seen.add(trim(row.evidence_id));
      records.push({
        evidence_id: trim(row.evidence_id), evidence_revision: trim(row.evidence_revision),
        canonical_ids: [...canonicalIds].sort((a, b) => a.localeCompare(b, "en")),
        source_ids: [...sourceIds].sort((a, b) => a.localeCompare(b, "en")), citations, claims, status, authoritative: false,
      });
    }
    records.sort((a, b) => a.canonical_ids.join("\0").localeCompare(b.canonical_ids.join("\0"), "en")
      || a.source_ids.join("\0").localeCompare(b.source_ids.join("\0"), "en")
      || stable(a.citations).localeCompare(stable(b.citations), "en") || a.evidence_revision.localeCompare(b.evidence_revision, "en")
      || a.evidence_id.localeCompare(b.evidence_id, "en"));
    const value = freeze({ contract_version: CONTRACT_VERSION, snapshot_revision: trim(input.snapshot_revision), records, source_data_untrusted: true });
    MAINTENANCE_EVIDENCE.add(value);
    return Object.freeze({ ok: true, value });
  }
  function isMaintenanceEvidenceRecord(value) {
    return objectLike(value) && MAINTENANCE_EVIDENCE.has(value);
  }

  function normalizeVerification(value) {
    if (!plain(value) || !validTimestamp(value.verified_at)) return fail("verification.verified_at", "invalid_verified_at");
    const owner = value.owner;
    if (!plain(owner) || !ID.test(trim(owner.owner_id)) || !OWNER_TYPES.has(trim(owner.owner_type))) {
      return fail("verification.owner", "invalid_verification_owner");
    }
    const validity = stringList(value.validity_conditions);
    if (validity.length === 0 || validity.length !== list(value.validity_conditions).length) {
      return fail("verification.validity_conditions", "validity_conditions_required");
    }
    const invalidation = stringList(value.invalidation_conditions);
    if (invalidation.length === 0 || invalidation.length !== list(value.invalidation_conditions).length) {
      return fail("verification.invalidation_conditions", "invalidation_conditions_required");
    }
    const triggers = [];
    for (const [index, trigger] of list(value.stale_triggers).entries()) {
      if (!plain(trigger) || !ID.test(trim(trigger.trigger_id)) || !STALE_KINDS.has(trim(trigger.kind))) {
        return fail(`verification.stale_triggers.${index}`, "invalid_stale_trigger");
      }
      if (trigger.kind === "extractor_revision_changed" && !ID.test(trim(trigger.source_id))) {
        return fail(`verification.stale_triggers.${index}.source_id`, "invalid_stale_trigger");
      }
      triggers.push({ trigger_id: trim(trigger.trigger_id), kind: trim(trigger.kind), source_id: trigger.source_id ? trim(trigger.source_id) : null });
    }
    return ok({
      verified_at: trim(value.verified_at),
      owner: { owner_id: trim(owner.owner_id), owner_type: trim(owner.owner_type) },
      validity_conditions: validity,
      invalidation_conditions: invalidation,
      stale_triggers: triggers,
    });
  }

  function normalizeCitations(values) {
    const citations = new Map();
    for (const [index, citation] of list(values).entries()) {
      if (!plain(citation) || !ID.test(trim(citation.citation_id)) || !ID.test(trim(citation.source_id))) {
        return fail(`citations.${index}`, "invalid_citation");
      }
      if (citations.has(citation.citation_id)) return fail(`citations.${index}.citation_id`, "duplicate_citation");
      const sourceLength = citation.source_length;
      const sourceContentHash = trim(citation.source_content_hash);
      if (!Number.isSafeInteger(sourceLength) || sourceLength < 0 || !HASH.test(sourceContentHash)) {
        return fail(`citations.${index}.source_identity`, "invalid_source_identity");
      }
      const span = citation.source_span;
      if (!plain(span) || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > sourceLength) {
        return fail(`citations.${index}.source_span`, "invalid_source_span");
      }
      const locator = safeLocator(span.locator);
      if (!locator) return fail(`citations.${index}.source_span.locator`, "invalid_locator");
      if (!HASH.test(trim(citation.extractor_revision))) return fail(`citations.${index}.extractor_revision`, "invalid_extractor_revision");
      citations.set(trim(citation.citation_id), {
        citation_id: trim(citation.citation_id),
        source_id: trim(citation.source_id),
        source_span: { locator, start: span.start, end: span.end },
        source_length: sourceLength,
        source_content_hash: sourceContentHash,
        extractor_revision: trim(citation.extractor_revision),
      });
    }
    return ok(citations);
  }

  function normalizeCurrentSourceSnapshots(value, citations) {
    const input = plain(value) ? value : {};
    const snapshots = new Map();
    for (const citation of citations.values()) {
      if (snapshots.has(citation.source_id)) continue;
      const snapshot = input[citation.source_id];
      if (!plain(snapshot)) return fail(`current_source_snapshots.${citation.source_id}`, "current_source_snapshot_required");
      if (!Number.isSafeInteger(snapshot.source_length) || snapshot.source_length < 0 || !HASH.test(trim(snapshot.content_hash))) {
        return fail(`current_source_snapshots.${citation.source_id}`, "invalid_current_source_identity");
      }
      if (!HASH.test(trim(snapshot.extractor_revision))) {
        return fail(`current_source_snapshots.${citation.source_id}.extractor_revision`, "invalid_extractor_revision");
      }
      snapshots.set(citation.source_id, {
        source_length: snapshot.source_length,
        content_hash: trim(snapshot.content_hash),
        extractor_revision: trim(snapshot.extractor_revision),
      });
    }
    return ok(snapshots);
  }

  function humanJustification(value) {
    if (!plain(value) || trim(value.kind) !== "human_authored") return null;
    if (!ID.test(trim(value.author_id)) || !validTimestamp(value.authored_at) || !trim(value.reason)) return null;
    return { kind: "human_authored", author_id: trim(value.author_id), authored_at: trim(value.authored_at), reason: trim(value.reason) };
  }

  function claimLineage(values, citations) {
    const lineage = [];
    const ineligible = [];
    for (const [index, claim] of list(values).entries()) {
      if (!plain(claim) || !ID.test(trim(claim.claim_id)) || !trim(claim.text)) return fail(`claims.${index}`, "invalid_claim");
      const citationIds = stringList(claim.citation_ids);
      if (new Set(citationIds).size !== citationIds.length) return fail(`claims.${index}.citation_ids`, "duplicate_citation_reference");
      const selected = [];
      for (const citationId of citationIds) {
        if (!citations.has(citationId)) return fail(`claims.${index}.citation_ids`, "unknown_citation");
        selected.push(citations.get(citationId));
      }
      const justification = humanJustification(claim.human_justification);
      const changed = claim.changed === true;
      if (changed && selected.length === 0 && !justification) ineligible.push(trim(claim.claim_id));
      lineage.push(selected.length > 0
        ? { claim_id: trim(claim.claim_id), support_kind: "citation", citations: selected }
        : justification
          ? { claim_id: trim(claim.claim_id), support_kind: "human_justification", human_justification: justification }
          : { claim_id: trim(claim.claim_id), support_kind: "unsupported", citations: [] });
    }
    return ok({ lineage, ineligible });
  }

  function staleReasons(input, verification, citations, currentSnapshots) {
    const reasons = [];
    const seen = new Set();
    function add(reason) {
      const key = `${reason.kind}:${reason.source_id || reason.condition}`;
      if (!seen.has(key)) { seen.add(key); reasons.push(reason); }
    }
    for (const citation of citations.values()) {
      const current = currentSnapshots.get(citation.source_id);
      if (current.extractor_revision !== citation.extractor_revision) {
        add({ trigger_id: `derived_extractor_${sha256(citation.source_id).slice(0, 16)}`, kind: "extractor_revision_changed", source_id: citation.source_id });
      }
      if (current.content_hash !== citation.source_content_hash || current.source_length !== citation.source_length) {
        add({ trigger_id: `derived_source_${sha256(citation.source_id).slice(0, 16)}`, kind: "source_content_changed", source_id: citation.source_id });
      }
    }
    const triggered = new Set(stringList(input.triggered_conditions));
    for (const condition of verification.invalidation_conditions) {
      if (triggered.has(condition)) add({ trigger_id: `condition_${sha256(condition).slice(0, 16)}`, kind: "invalidation_condition_met", condition });
    }
    return reasons;
  }

  function evidenceQuality(lineage, claims) {
    const changedIds = new Set(list(claims).filter((claim) => claim && claim.changed === true).map((claim) => trim(claim.claim_id)));
    const changed = lineage.filter((item) => changedIds.has(item.claim_id));
    const cited = changed.filter((item) => item.support_kind === "citation").length;
    const human = changed.filter((item) => item.support_kind === "human_justification").length;
    const supported = cited + human;
    const score = changed.length === 0 ? 1 : Number(((cited + (human * 0.75)) / changed.length).toFixed(6));
    const label = score === 1 ? "strong" : score >= 0.75 ? "usable" : score > 0 ? "thin" : "invalid";
    return freeze({ score, label, supported_claims: supported, total_changed_claims: changed.length, cited_claims: cited, human_justified_claims: human });
  }

  function maintenanceProposal(input, reasons, claimIds) {
    const body = { operation_id: trim(input.operation_id), stale_reasons: reasons, affected_claim_ids: claimIds };
    return freeze({
      proposal_id: `maintenance_${sha256(stable(body)).slice(0, 24)}`,
      kind: "evidence_maintenance",
      status: "proposed",
      reason: "stale_evidence",
      canonical_mutation: false,
      ...body,
    });
  }

  function evaluateEvidence(input, _options = {}) {
    if (!plain(input) || !ID.test(trim(input.operation_id)) || !Array.isArray(input.claims) || input.claims.length === 0 || !Array.isArray(input.citations)) {
      return fail("evidence", "malformed_evidence");
    }
    const verification = normalizeVerification(input.verification);
    if (verification.ok === false) return verification;
    const citations = normalizeCitations(input.citations);
    if (citations.ok === false) return citations;
    const currentSnapshots = normalizeCurrentSourceSnapshots(input.current_source_snapshots, citations.value);
    if (currentSnapshots.ok === false) return currentSnapshots;
    const claims = claimLineage(input.claims, citations.value);
    if (claims.ok === false) return claims;
    const stale = staleReasons(input, verification.value, citations.value, currentSnapshots.value);
    const changedClaimIds = list(input.claims).filter((claim) => claim && claim.changed === true).map((claim) => trim(claim.claim_id));
    const maintenance = stale.length > 0 ? [maintenanceProposal(input, stale, changedClaimIds)] : [];
    return ok({
      contract_version: CONTRACT_VERSION,
      operation_id: trim(input.operation_id),
      approval_eligible: claims.value.ineligible.length === 0 && stale.length === 0,
      ineligible_claim_ids: claims.value.ineligible,
      claim_lineage: claims.value.lineage,
      verification: verification.value,
      stale: stale.length > 0,
      stale_reasons: stale,
      maintenance_proposals: maintenance,
      evidence_quality: evidenceQuality(claims.value.lineage, input.claims),
      model_confidence: input.model_confidence === undefined ? null : input.model_confidence,
      source_data_untrusted: true,
      write_counters: writeCounters(),
    });
  }

  const api = freeze({ CONTRACT_VERSION, MAX_MAINTENANCE_RECORDS, createMaintenanceEvidenceRecord, isMaintenanceEvidenceRecord, evaluateEvidence });
  root.LLMWikiEvidenceContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
