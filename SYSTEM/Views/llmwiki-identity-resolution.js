(function (root) {
  "use strict";

  const IDENTITY_RESOLUTION_VERSION = "llmwiki_identity_resolution_v1";
  const IDENTITY_RELATIONS = Object.freeze(["new_identity", "same_identity", "consolidation", "exact_duplicate", "ambiguous"]);
  const OPERATION_BY_RELATION = Object.freeze({
    new_identity: "create",
    same_identity: "update",
    consolidation: "merge",
    exact_duplicate: "noop",
  });
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function fail(field, reason) { return freeze({ ok: false, field, reason }); }
  function allowed(input, fields, field) {
    if (!plain(input)) return fail(field, "malformed_input");
    for (const key of Object.keys(input)) if (!fields.has(key)) return fail(`${field}.${key}`, "unknown_field");
    return null;
  }
  function id(value, field) {
    const normalized = trim(value);
    return ID.test(normalized) ? normalized : fail(field, "invalid_identity_id");
  }
  function hash(value, field) {
    const normalized = trim(value);
    return HASH.test(normalized) ? normalized : fail(field, "invalid_content_hash");
  }
  function failure(value) { return plain(value) && value.ok === false; }

  function candidate(raw, index) {
    const field = `candidates.${index}`;
    const unknown = allowed(raw, new Set(["identity_id", "identity_key", "content_hash", "revision"]), field);
    if (unknown) return unknown;
    const identityId = id(raw.identity_id, `${field}.identity_id`);
    if (failure(identityId)) return identityId;
    const identityKey = id(raw.identity_key, `${field}.identity_key`);
    if (failure(identityKey)) return identityKey;
    const contentHash = hash(raw.content_hash, `${field}.content_hash`);
    if (failure(contentHash)) return contentHash;
    const revision = hash(raw.revision, `${field}.revision`);
    if (failure(revision)) return revision;
    return { identity_id: identityId, identity_key: identityKey, content_hash: contentHash, revision };
  }

  function resolveIdentity(input) {
    const unknown = allowed(input, new Set(["identity_key", "content_hash", "candidates", "consolidation_ids"]), "identity");
    if (unknown) return unknown;
    const identityKey = id(input.identity_key, "identity.identity_key");
    if (failure(identityKey)) return identityKey;
    const contentHash = hash(input.content_hash, "identity.content_hash");
    if (failure(contentHash)) return contentHash;
    if (!Array.isArray(input.candidates)) return fail("identity.candidates", "candidates_required");
    const candidates = [];
    const seen = new Set();
    for (let index = 0; index < input.candidates.length; index += 1) {
      const parsed = candidate(input.candidates[index], index);
      if (failure(parsed)) return parsed;
      if (seen.has(parsed.identity_id)) return fail("identity.candidates", "duplicate_identity_candidate");
      seen.add(parsed.identity_id);
      candidates.push(parsed);
    }
    const matching = candidates.filter((item) => item.identity_key === identityKey).sort((left, right) => left.identity_id.localeCompare(right.identity_id, "en"));
    let consolidationIds = [];
    if (input.consolidation_ids !== undefined) {
      if (!Array.isArray(input.consolidation_ids) || input.consolidation_ids.length < 2) return fail("identity.consolidation_ids", "consolidation_ids_required");
      const selected = new Set();
      for (let index = 0; index < input.consolidation_ids.length; index += 1) {
        const selectedId = id(input.consolidation_ids[index], `identity.consolidation_ids.${index}`);
        if (failure(selectedId)) return selectedId;
        if (selected.has(selectedId)) return fail("identity.consolidation_ids", "duplicate_consolidation_identity");
        selected.add(selectedId);
      }
      const selectedCandidates = candidates.filter((item) => selected.has(item.identity_id));
      if (selectedCandidates.length !== selected.size || selectedCandidates.some((item) => item.identity_key !== identityKey)) return fail("identity.consolidation_ids", "consolidation_identity_not_current");
      consolidationIds = [...selected].sort();
    }
    let relation;
    let selectedCandidates;
    if (consolidationIds.length > 0) {
      relation = "consolidation";
      selectedCandidates = matching.filter((item) => consolidationIds.includes(item.identity_id));
    } else if (matching.length === 0) {
      relation = "new_identity";
      selectedCandidates = [];
    } else if (matching.length > 1) {
      relation = "ambiguous";
      selectedCandidates = matching;
    } else if (matching[0].content_hash === contentHash) {
      relation = "exact_duplicate";
      selectedCandidates = matching;
    } else {
      relation = "same_identity";
      selectedCandidates = matching;
    }
    return ok({
      identity_resolution_version: IDENTITY_RESOLUTION_VERSION,
      relation,
      identity_key: identityKey,
      candidate_ids: selectedCandidates.map((item) => item.identity_id),
      candidate_revisions: selectedCandidates.map((item) => ({ identity_id: item.identity_id, revision: item.revision })),
    });
  }

  function deriveOperation(relation) {
    const normalized = trim(relation);
    if (!IDENTITY_RELATIONS.includes(normalized)) return fail("relation", "unknown_identity_relation");
    if (normalized === "ambiguous") return fail("relation", "ambiguous_requires_review");
    return ok({ relation: normalized, operation: OPERATION_BY_RELATION[normalized] });
  }

  const api = freeze({ IDENTITY_RESOLUTION_VERSION, IDENTITY_RELATIONS, OPERATION_BY_RELATION, resolveIdentity, deriveOperation });
  root.LLMWikiIdentityResolution = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
