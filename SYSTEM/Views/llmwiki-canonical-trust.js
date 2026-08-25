(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const knowledgeApi = root.KnowledgeCandidateStore || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);
  const claimApi = root.LLMWikiClaimProvenance || (typeof require === "function" ? require("./llmwiki-claim-provenance.js") : null);
  function obsidianApi() { return root.LLMWikiObsidianAdapter || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null); }
  const HASH = /^[0-9a-f]{64}$/u;
  const ACTIVE = "active";
  const DECISIONS = new WeakSet();
  const VERIFIED_ROWS = new WeakSet();

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim().normalize("NFC") : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) { return hashApi && typeof hashApi.sha256 === "function" ? hashApi.sha256(String(value)) : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function decision(tier, status, extra) {
    const value = freeze({ tier, status, verified: tier === "verified", ...(plain(extra) ? extra : {}) });
    DECISIONS.add(value);
    return value;
  }
  function documentFor(input) {
    if (typeof input.bytes === "string") {
      if (!knowledgeApi || typeof knowledgeApi.parseLifecycleDocument !== "function") return null;
      try { return knowledgeApi.parseLifecycleDocument(input.bytes); } catch (_) { return null; }
    }
    return plain(input.document) ? input.document : null;
  }
  function sourceRevisionMap(value) {
    const result = new Map();
    if (plain(value)) for (const [sourceId, revision] of Object.entries(value)) result.set(trim(sourceId), trim(revision));
    else for (const item of list(value)) if (plain(item)) result.set(trim(item.source_id), trim(item.source_revision));
    return result;
  }
  function same(left, right) { return stable(left) === stable(right); }
  function authorityFailure(document, input, authority) {
    if (!plain(authority)) return "missing_immutable_authority";
    if (document.schema_version !== 2 || document.type !== "knowledge") return "invalid_canonical_document";
    const revision = trim(input.revision);
    if (!HASH.test(revision)) return "canonical_revision_invalid";
    if (authority.canonical_sha256 !== revision) return "canonical_revision_mismatch";
    if (typeof input.bytes !== "string" || sha256(input.bytes) !== revision) return "canonical_bytes_mismatch";
    if (authority.schema_version !== 2 || authority.canonical_id !== document.canonical_id) return "canonical_identity_mismatch";
    if (authority.claim_set_hash !== document.claim_set_hash || !HASH.test(trim(document.claim_set_hash))) return "claim_set_hash_mismatch";
    if (authority.promotion_receipt_hash !== document.promotion_receipt_hash || !HASH.test(trim(document.promotion_receipt_hash))) return "promotion_receipt_hash_mismatch";
    if (!same(document.sources, authority.sources) || !Array.isArray(document.sources) || document.sources.length === 0) return "source_binding_mismatch";
    if (!same(document.relations || [], authority.relations || [])) return "relation_binding_mismatch";
    if (document.ai_enrichment_status !== authority.ai_enrichment_status) return "enrichment_status_mismatch";
    if (!claimApi || typeof claimApi.validateClaimSet !== "function") return "claim_authority_unavailable";
    const claims = claimApi.validateClaimSet(authority.claim_set);
    if (!claims || claims.ok !== true || authority.claim_set.claim_set_hash !== authority.claim_set_hash
      || authority.claim_set.status !== "accepted" || list(authority.claim_set.claims).some((claim) => claim.status !== "accepted")) return "claim_set_invalid";
    if (!plain(authority.promotion_receipt) || sha256(stable(authority.promotion_receipt)) !== authority.promotion_receipt_hash) return "promotion_receipt_invalid";
    const revisions = sourceRevisionMap(input.source_revisions);
    for (const source of authority.claim_set.sources) {
      const sourceId = trim(source && source.source_id);
      const expected = trim(source && source.source_revision);
      if (!sourceId || !HASH.test(expected)) return "claim_source_invalid";
      if (revisions.has(sourceId) && revisions.get(sourceId) !== expected) return "stale_source";
    }
    return "";
  }
  function nonCanonicalDecision(input) {
    const document = documentFor(input);
    const type = trim(document && document.type);
    if (type === "literature_note") return decision("supporting", "supporting_only");
    if (type === "fleeting_note" || type === "knowledge_candidate") return decision("excluded", "pending");
    if (type === "permanent_note") return decision("legacy_readable", "legacy_review");
    if (type !== "knowledge") return decision("maintenance", document ? "unknown_type" : "malformed_canonical_document");
    if (document.schema_version !== 2) return decision("legacy_review", "legacy_review");
    if (document.status === "superseded" || document.status === "quarantined") return decision("maintenance", document.status);
    return decision("maintenance", document.status === ACTIVE ? "missing_immutable_authority" : "inactive");
  }
  function decide(input) {
    if (!plain(input)) return decision("maintenance", "malformed_input");
    return nonCanonicalDecision(input);
  }
  function decideFinalized(input) {
    if (!plain(input)) return decision("maintenance", "malformed_input");
    const receipt = input.receipt;
    const obsidian = obsidianApi();
    if (!obsidian || typeof obsidian.isFinalizedCanonicalAuthority !== "function"
      || !obsidian.isFinalizedCanonicalAuthority(receipt)) return nonCanonicalDecision(input);
    const binding = obsidian.finalizedCanonicalAuthorityData(receipt);
    const authority = binding && binding.canonical_v2_authority;
    const document = documentFor(input);
    if (!document || document.status === "superseded" || document.status === "quarantined" || document.status !== ACTIVE) return nonCanonicalDecision(input);
    const failure = authorityFailure(document, input, authority);
    return failure ? decision("maintenance", failure) : decision("verified", ACTIVE, {
      canonical_id: document.canonical_id,
      canonical_revision: trim(input.revision),
      source_ids: Object.freeze(list(document.sources).map((source) => trim(source && source.source_id)).filter(Boolean).sort()),
    });
  }
  function bindVerifiedRow(row, value) {
    if (plain(row) && isVerified(value)) VERIFIED_ROWS.add(row);
    return row;
  }
  function isVerified(value) { return Boolean(value) && DECISIONS.has(value) && value.tier === "verified"; }
  function isVerifiedRow(value) { return Boolean(value) && VERIFIED_ROWS.has(value); }

  const api = Object.freeze({ decide, decideFinalized, bindVerifiedRow, isVerified, isVerifiedRow, stable, sha256 });
  root.LLMWikiCanonicalTrust = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
