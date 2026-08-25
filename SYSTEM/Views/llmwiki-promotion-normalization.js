(function (root) {
  "use strict";

  const nodeTypes = typeof require === "function" ? require("node:util").types : null;
  const BOUNDARY_LIMITS = Object.freeze({ max_depth: 32, max_nodes: 20000, max_array_items: 512, max_object_fields: 256, max_string_chars: 1048576 });

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }

  function parsePromotionData(value) {
    const active = new Set();
    let nodes = 0;
    let stringChars = 0;
    function normalize(node, depth) {
      nodes += 1;
      if (nodes > BOUNDARY_LIMITS.max_nodes || depth > BOUNDARY_LIMITS.max_depth) throw new TypeError("promotion_input_limit_exceeded");
      if (node === null || typeof node === "boolean") return node;
      if (typeof node === "string") {
        stringChars += node.length;
        if (stringChars > BOUNDARY_LIMITS.max_string_chars) throw new TypeError("promotion_input_limit_exceeded");
        return node;
      }
      if (typeof node === "number") {
        if (!Number.isFinite(node)) throw new TypeError("promotion_input_must_be_json");
        return node;
      }
      if (!node || typeof node !== "object" || (nodeTypes && nodeTypes.isProxy(node)) || active.has(node)) throw new TypeError("promotion_input_must_be_plain_data");
      active.add(node);
      const descriptors = Object.getOwnPropertyDescriptors(node);
      if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) throw new TypeError("promotion_input_symbol_key");
      if (Array.isArray(node)) {
        if (Object.getPrototypeOf(node) !== Array.prototype || node.length > BOUNDARY_LIMITS.max_array_items || Reflect.ownKeys(descriptors).length !== node.length + 1) throw new TypeError("promotion_input_array_limit");
        const parsed = Array.from({ length: node.length }, (_, index) => {
          const descriptor = descriptors[index];
          if (!descriptor || Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) throw new TypeError("promotion_input_accessor");
          return normalize(descriptor.value, depth + 1);
        });
        active.delete(node);
        return parsed;
      }
      const prototype = Object.getPrototypeOf(node);
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) throw new TypeError("promotion_input_must_be_plain_object");
      const keys = Object.keys(descriptors).sort();
      if (keys.length > BOUNDARY_LIMITS.max_object_fields) throw new TypeError("promotion_input_object_limit");
      const parsed = {};
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set") || key === "__proto__") throw new TypeError("promotion_input_accessor");
        Object.defineProperty(parsed, key, { enumerable: true, configurable: true, writable: true, value: normalize(descriptor.value, depth + 1) });
      }
      active.delete(node);
      return parsed;
    }
    return freeze(normalize(value, 0));
  }

  function normalizePromotionInput(value) {
    if (!plain(value)) throw new TypeError("promotion_input_must_be_plain_object");
    return parsePromotionData(value);
  }

  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  function evidenceParseFailure(reasonCode, evidenceRefs) {
    return freeze({ ok: false, reason_code: reasonCode, evidence_refs: [...new Set(evidenceRefs || [])], entries: [] });
  }

  function parseEvidence(value) {
    let parsed;
    try { parsed = parsePromotionData(value); }
    catch (_error) { return evidenceParseFailure("malformed_evidence", []); }
    if (!Array.isArray(parsed)) return evidenceParseFailure("malformed_evidence", []);
    const entries = [];
    const seen = new Set();
    for (const item of parsed) {
      if (!plain(item)) return evidenceParseFailure("malformed_evidence", []);
      const evidenceId = text(item.evidence_id);
      const sourceRef = text(item.source_ref);
      const strength = text(item.strength);
      if (!evidenceId || !sourceRef || !strength) return evidenceParseFailure("malformed_evidence", evidenceId ? [evidenceId] : []);
      if (seen.has(evidenceId)) return evidenceParseFailure("duplicate_evidence_id", [evidenceId]);
      seen.add(evidenceId);
      entries.push(freeze({ evidence_id: evidenceId, source_ref: sourceRef, strength }));
    }
    return freeze({ ok: true, reason_code: "", evidence_refs: entries.map((item) => item.evidence_id), entries });
  }

  function normalizedClaims(unit) {
    return list(unit.claims).filter(plain).map((claim) => freeze({
      claim_id: text(claim.claim_id),
      statement: text(claim.statement),
      evidence_refs: list(claim.evidence_refs).map(text).filter(Boolean),
      origin: text(claim.origin),
      review_status: text(claim.review_status)
    }));
  }

  const api = Object.freeze({ BOUNDARY_LIMITS, plain, text, list, freeze, parsePromotionData, normalizePromotionInput, stable, parseEvidence, normalizedClaims });
  root.LLMWikiPromotionNormalizationInternal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
