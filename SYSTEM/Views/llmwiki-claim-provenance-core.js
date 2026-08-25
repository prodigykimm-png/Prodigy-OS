(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;
  const nodeTypes = typeof require === "function" ? require("node:util").types : null;
  const CONTRACT_VERSION = "llmwiki_claim_provenance_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const ORIGINS = new Set(["source_extract", "human_authored", "ai_interpretation", "ai_research", "ai_correction"]);
  const STATUSES = new Set(["unreviewed", "accepted", "rejected", "superseded"]);
  const SOURCE_KINDS = new Set(["immutable_source", "external_ingested_snapshot"]);
  const PROVIDER_IDS = new Set(["claim_id", "citation_id", "provider_id", "provider_claim_id", "provider_citation_id"]);
  const BOUNDARY_LIMITS = Object.freeze({ max_depth: 32, max_nodes: 20000, max_array_items: 512, max_object_fields: 256, max_string_chars: 1048576 });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function parseBoundaryData(value) {
    const seen = new Set();
    let nodes = 0;
    let stringChars = 0;
    function parse(node, depth) {
      nodes += 1;
      if (nodes > BOUNDARY_LIMITS.max_nodes || depth > BOUNDARY_LIMITS.max_depth) throw new TypeError("boundary_limit_exceeded");
      if (node === null || typeof node === "boolean") return node;
      if (typeof node === "string") {
        stringChars += node.length;
        if (stringChars > BOUNDARY_LIMITS.max_string_chars) throw new TypeError("boundary_limit_exceeded");
        return node;
      }
      if (typeof node === "number") {
        if (!Number.isFinite(node)) throw new TypeError("boundary_non_json_number");
        return node;
      }
      if (!node || typeof node !== "object" || (nodeTypes && nodeTypes.isProxy(node)) || seen.has(node)) throw new TypeError("boundary_not_plain_data");
      seen.add(node);
      const descriptors = Object.getOwnPropertyDescriptors(node);
      if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) throw new TypeError("boundary_symbol_key");
      if (Array.isArray(node)) {
        if (Object.getPrototypeOf(node) !== Array.prototype || node.length > BOUNDARY_LIMITS.max_array_items || Reflect.ownKeys(descriptors).length !== node.length + 1) throw new TypeError("boundary_array_limit");
        const parsed = Array.from({ length: node.length }, (_, index) => {
          const descriptor = descriptors[index];
          if (!descriptor || Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) throw new TypeError("boundary_accessor");
          return parse(descriptor.value, depth + 1);
        });
        seen.delete(node);
        return parsed;
      }
      const prototype = Object.getPrototypeOf(node);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) throw new TypeError("boundary_object_prototype");
      const keys = Object.keys(descriptors);
      if (keys.length > BOUNDARY_LIMITS.max_object_fields) throw new TypeError("boundary_object_limit");
      const parsed = {};
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set") || key === "__proto__") throw new TypeError("boundary_accessor");
        Object.defineProperty(parsed, key, { enumerable: true, configurable: true, writable: true, value: parse(descriptor.value, depth + 1) });
      }
      seen.delete(node);
      return parsed;
    }
    try { return Object.freeze({ ok: true, value: parse(value, 0) }); }
    catch (_error) { return Object.freeze({ ok: false, reason: "unsafe_boundary_input" }); }
  }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (value instanceof Map) return value;
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function sha256(value) {
    if (!crypto) throw new Error("crypto unavailable");
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function fail(field, reason) { return freeze({ ok: false, field, reason, writer_count: 0, write_counters: { writer: 0, canonical: 0, maintenance: 0, git: 0 } }); }
  function timestamp(value) {
    const text = trim(value);
    if (!text || !Number.isFinite(Date.parse(text))) return "";
    try { return new Date(text).toISOString() === text ? text : ""; } catch (_) { return ""; }
  }
  function validUrl(value) {
    try {
      const parsed = new URL(trim(value));
      return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : "";
    } catch (_) { return ""; }
  }
  function ownForbiddenId(value) { return plain(value) && [...PROVIDER_IDS].some((field) => Object.hasOwn(value, field)); }
  function hasUnpairedSurrogate(text) {
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (index + 1 >= text.length || text.charCodeAt(index + 1) < 0xdc00 || text.charCodeAt(index + 1) > 0xdfff) return true;
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) return true;
    }
    return false;
  }
  function utf16Boundary(text, index) {
    return index === 0 || index === text.length || !(text.charCodeAt(index - 1) >= 0xd800 && text.charCodeAt(index - 1) <= 0xdbff
      && text.charCodeAt(index) >= 0xdc00 && text.charCodeAt(index) <= 0xdfff);
  }
  function normalizeHumanJustification(value, field) {
    if (!plain(value) || !ID.test(trim(value.author_id)) || !timestamp(value.authored_at) || !trim(value.reason)) return fail(field, "human_justification_required");
    return ok({ kind: "human_authored", author_id: trim(value.author_id), authored_at: timestamp(value.authored_at), reason: trim(value.reason) });
  }
  function hasCitedAncestry(claimIds, claims, citations) {
    const claimMap = new Map(claims.map((claim) => [claim.claim_id, claim]));
    const citationMap = citations instanceof Map ? citations : new Map(list(citations).map((citation) => [citation && citation.citation_id, citation]));
    const visited = new Set();
    function reachesCitation(claimId) {
      if (visited.has(claimId)) return false;
      visited.add(claimId);
      const claim = claimMap.get(claimId);
      if (!claim) return false;
      if (list(claim.citation_ids).some((citationId) => {
        const citation = citationMap.get(citationId);
        return plain(citation) && ID.test(trim(citation.source_id)) && HASH.test(trim(citation.source_revision))
          && HASH.test(trim(citation.extractor_revision)) && HASH.test(trim(citation.source_content_hash));
      })) return true;
      return list(claim.derived_from_claim_ids).some(reachesCitation);
    }
    return list(claimIds).some(reachesCitation);
  }
  function claimPayload(claim) {
    return {
      origin: claim.origin, text: claim.text, citation_ids: claim.citation_ids,
      derived_from_claim_ids: claim.derived_from_claim_ids,
      human_justification: claim.human_justification || null, dispute_target_claim_id: claim.dispute_target_claim_id || null,
    };
  }
  function claimSetSemantic(value) {
    return {
      contract_version: CONTRACT_VERSION,
      sources: value.sources,
      claims: value.claims.map((claim) => ({ claim_id: claim.claim_id, ...claimPayload(claim) })),
      citations: value.citations,
      disputes: value.disputes.map((dispute) => ({ dispute_id: dispute.dispute_id, target_claim_id: dispute.target_claim_id, correction_claim_id: dispute.correction_claim_id })),
    };
  }

  const api = Object.freeze({ CONTRACT_VERSION, ID, HASH, ORIGINS, STATUSES, SOURCE_KINDS, BOUNDARY_LIMITS, plain, parseBoundaryData, trim, list, stable, freeze, sha256, ok, fail, timestamp, validUrl, ownForbiddenId, hasUnpairedSurrogate, utf16Boundary, normalizeHumanJustification, hasCitedAncestry, claimPayload, claimSetSemantic });
  root.LLMWikiClaimProvenanceCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
