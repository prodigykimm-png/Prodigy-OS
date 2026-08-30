(function (root) {
  "use strict";

  const CONTRACT_VERSION = "llmwiki_operation_contract_v1";
  const MAX_SERIALIZED_OPERATION_BYTES = 1024 * 1024;
  const STRUCTURE_LIMITS = Object.freeze({
    max_nesting_depth: 32,
    max_total_nodes: 4096,
    max_total_array_entries: 2048,
    max_collection_entries: 256,
  });
  const OPERATION_KINDS = Object.freeze(["create", "update", "merge", "noop"]);
  const RISK_TIERS = Object.freeze(["low", "medium", "high"]);
  const CONFLICT_STATUSES = Object.freeze(["resolved", "unresolved", "disputed"]);
  const CONFIDENCE = Object.freeze(["explicit", "inferred", "low"]);
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const RESERVED_IDENTIFIERS = Object.freeze(new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"]));
  const BRANDED_OPERATIONS = new WeakSet();
  const BRANDED_CANONICAL_OPERATIONS = new WeakSet();
  const BRANDED_CANONICAL_PACKET_OPERATIONS = new WeakSet();
  const COMMON_FIELDS = Object.freeze(new Set([
    "contract_version", "operation_id", "kind", "destination_ids", "base_revisions",
    "before_bytes", "after_bytes", "source_citations", "conflicts", "risk_tier", "effects",
    "approval_eligible", "merge_revision_coverage", "revision_binding_state",
  ]));
  const PLAIN_OBJECT_POLICY = Object.freeze({
    accepted_prototypes: Object.freeze(["Object.prototype", "null"]),
    custom_prototypes_accepted: false,
  });

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function snapshotRecord(value, field, malformedReason) {
    if (!value || typeof value !== "object") return fail(field, malformedReason);
    try {
      if (Array.isArray(value)) return fail(field, malformedReason);
      const prototype = Reflect.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return fail(field, "unsupported_object_prototype");
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") return fail(field, "symbol_property_forbidden");
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
        if (!descriptor) return fail("operation", "uninspectable_input");
        if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) return fail(`${field}.${key}`, "accessor_property_forbidden");
        Object.defineProperty(result, key, { value: descriptor.value, enumerable: true, writable: true, configurable: true });
      }
      if (prototype === Object.prototype) {
        for (const key of Reflect.ownKeys(Object.prototype)) {
          const descriptor = Reflect.getOwnPropertyDescriptor(Object.prototype, key);
          if (descriptor?.enumerable) return fail(`${field}.${String(key)}`, "inherited_field_forbidden");
        }
      }
      return result;
    } catch {
      return fail("operation", "uninspectable_input");
    }
  }
  function own(value, key) { return Object.hasOwn(value, key) ? value[key] : undefined; }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    const result = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(result, key, { value: freeze(item), enumerable: true, writable: true, configurable: true });
    }
    return Object.freeze(result);
  }
  function fail(field, reason) { return freeze({ ok: false, field, reason }); }
  function ok(value) { return freeze({ ok: true, value }); }
  function brandedOk(value) { return Object.freeze({ ok: true, value }); }
  function boundaryFailure(value) { return plain(value) && Object.getPrototypeOf(value) === Object.prototype && value.ok === false; }

  function utf8BytesFallback(text, limit) {
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const codeUnit = text.charCodeAt(index);
      if (codeUnit <= 0x7f) bytes += 1;
      else if (codeUnit <= 0x7ff) bytes += 2;
      else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < text.length) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index += 1; }
        else bytes += 3;
      } else bytes += 3;
      if (bytes > limit) return limit + 1;
    }
    return bytes;
  }

  function utf8BytesOverLimit(text, limit) {
    if (text.length > limit) return limit + 1;
    if (typeof root.TextEncoder === "function") {
      try {
        const bytes = new root.TextEncoder().encode(text).byteLength;
        return bytes > limit ? limit + 1 : bytes;
      } catch (_error) {
        // Fall through to deterministic replacement-encoding semantics.
      }
    }
    return utf8BytesFallback(text, limit);
  }

  function parseJsonText(text) {
    let index = 0;
    let totalNodes = 0;
    let totalArrayEntries = 0;
    function complex() { throw new Error("operation_structure_too_complex"); }
    function countNode(depth) {
      totalNodes += 1;
      if (depth > STRUCTURE_LIMITS.max_nesting_depth || totalNodes > STRUCTURE_LIMITS.max_total_nodes) complex();
    }
    function whitespace() { while (/\s/u.test(text[index] || "")) index += 1; }
    function string() {
      const start = index;
      if (text[index] !== '"') throw new Error("malformed_json");
      index += 1;
      while (index < text.length) {
        const character = text[index];
        if (character === '"') {
          index += 1;
          return JSON.parse(text.slice(start, index));
        }
        if (character === "\\") {
          index += 1;
          if (text[index] === "u") index += 4;
        }
        index += 1;
      }
      throw new Error("malformed_json");
    }
    function value(depth = 0) {
      countNode(depth);
      whitespace();
      const character = text[index];
      if (character === "{") return object(depth);
      if (character === "[") return array(depth);
      if (character === '"') return string();
      for (const [token, parsed] of [["true", true], ["false", false], ["null", null]]) {
        if (text.startsWith(token, index)) { index += token.length; return parsed; }
      }
      const number = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)?.[0];
      if (!number) throw new Error("malformed_json");
      index += number.length;
      return Number(number);
    }
    function object(depth) {
      index += 1;
      whitespace();
      const result = Object.create(null);
      const keys = new Set();
      if (text[index] === "}") { index += 1; return result; }
      while (index < text.length) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new Error("duplicate_json_key");
        keys.add(key);
        if (keys.size > STRUCTURE_LIMITS.max_collection_entries) complex();
        whitespace();
        if (text[index] !== ":") throw new Error("malformed_json");
        index += 1;
        const parsed = value(depth + 1);
        Object.defineProperty(result, key, { value: parsed, enumerable: true, writable: true, configurable: true });
        whitespace();
        if (text[index] === "}") { index += 1; return result; }
        if (text[index] !== ",") throw new Error("malformed_json");
        index += 1;
      }
      throw new Error("malformed_json");
    }
    function array(depth) {
      index += 1;
      whitespace();
      const result = [];
      if (text[index] === "]") { index += 1; return result; }
      while (index < text.length) {
        totalArrayEntries += 1;
        if (result.length >= STRUCTURE_LIMITS.max_collection_entries || totalArrayEntries > STRUCTURE_LIMITS.max_total_array_entries) complex();
        result.push(value(depth + 1));
        whitespace();
        if (text[index] === "]") { index += 1; return result; }
        if (text[index] !== ",") throw new Error("malformed_json");
        index += 1;
      }
      throw new Error("malformed_json");
    }
    const parsed = value(0);
    whitespace();
    if (index !== text.length) throw new Error("malformed_json");
    return parsed;
  }
  function withinStructureLimits(rootValue) {
    let totalNodes = 0;
    let totalArrayEntries = 0;
    const stack = [[rootValue, 0]];
    while (stack.length > 0) {
      const [value, depth] = stack.pop();
      totalNodes += 1;
      if (depth > STRUCTURE_LIMITS.max_nesting_depth || totalNodes > STRUCTURE_LIMITS.max_total_nodes) return false;
      if (Array.isArray(value)) {
        if (value.length > STRUCTURE_LIMITS.max_collection_entries) return false;
        totalArrayEntries += value.length;
        if (totalArrayEntries > STRUCTURE_LIMITS.max_total_array_entries) return false;
        for (let index = value.length - 1; index >= 0; index -= 1) stack.push([value[index], depth + 1]);
      } else if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length > STRUCTURE_LIMITS.max_collection_entries) return false;
        for (let index = keys.length - 1; index >= 0; index -= 1) stack.push([value[keys[index]], depth + 1]);
      }
    }
    return true;
  }
  function safeIdentifier(value, field) {
    const id = trim(value);
    const pathPart = id.split("#", 1)[0];
    const segments = pathPart.split("/");
    if (segments.some((part) => RESERVED_IDENTIFIERS.has(part))) return fail(field, "reserved_identifier");
    if (!id || /[\u0000-\u001f\u007f]/u.test(id) || id.includes("\\") || id.includes("[[") || id.includes("]]")
      || id.startsWith("/") || /^[A-Za-z]:/u.test(id) || segments.some((part) => part === "." || part === "..")) {
      return fail(field, "invalid_identifier");
    }
    return id;
  }
  function exactFields(input, allowed, field, reason) {
    for (const key in input) if (!Object.hasOwn(input, key)) return fail(`${field}.${key}`, "inherited_field_forbidden");
    for (const key of Object.keys(input)) if (!allowed.has(key)) return fail(`${field}.${key}`, reason);
    return null;
  }
  function snapshotArray(value, field, reason) {
    try {
      if (!Array.isArray(value)) return fail(field, reason);
      if (Reflect.getPrototypeOf(value) !== Array.prototype) return fail(field, "unsupported_array_prototype");
      const keys = Reflect.ownKeys(value);
      const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
      if (!lengthDescriptor || Object.hasOwn(lengthDescriptor, "get") || Object.hasOwn(lengthDescriptor, "set")) return fail(`${field}.length`, "accessor_property_forbidden");
      const length = lengthDescriptor.value;
      if (!Number.isSafeInteger(length) || length < 0) return fail(`${field}.length`, "invalid_array_length");
      const expected = new Set(["length", ...Array.from({ length }, (_, index) => String(index))]);
      for (const key of keys) if (typeof key === "symbol" || !expected.has(key)) return fail(field, "extra_array_property");
      if (keys.length !== expected.size) return fail(field, "sparse_array_forbidden");
      const result = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) return fail(`${field}.${index}`, "sparse_array_forbidden");
        if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) return fail(`${field}.${index}`, "accessor_property_forbidden");
        result[index] = descriptor.value;
      }
      return result;
    } catch {
      return fail("operation", "uninspectable_input");
    }
  }
  function uniqueIdentifiers(value, field, minimum = 1) {
    const inspected = snapshotArray(value, field, "identifier_list_required");
    if (plain(inspected) && inspected.ok === false) return inspected;
    value = inspected;
    if (value.length < minimum) return fail(field, "identifier_list_required");
    const result = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const id = safeIdentifier(value[index], `${field}.${index}`);
      if (plain(id)) return id;
      if (seen.has(id)) return fail(field, "duplicate_identifier");
      seen.add(id);
      result.push(id);
    }
    return result;
  }
  function normalizedMap(value, field, valueParser) {
    const inspected = snapshotRecord(value, field, `${field}_required`);
    if (plain(inspected) && inspected.ok === false) return inspected;
    const result = Object.create(null);
    for (const [rawId, rawValue] of Object.entries(inspected)) {
      const id = safeIdentifier(rawId, `${field}.${rawId}`);
      if (plain(id)) return id;
      const parsed = valueParser(rawValue, `${field}.${id}`);
      if (plain(parsed) && parsed.ok === false) return parsed;
      result[id] = parsed;
    }
    return result;
  }
  function revision(value, field) {
    const hash = trim(value);
    return HASH.test(hash) ? hash : fail(field, "invalid_base_revision");
  }
  function bytes(value, field) { return typeof value === "string" ? value : fail(field, "bytes_required"); }
  function sameKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }
  function sourceUrl(value, field) {
    let parsed;
    try { parsed = new URL(trim(value)); } catch { return fail(field, "invalid_source_url"); }
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : fail(field, "invalid_source_url");
  }
  function normalizeCitation(input, index) {
    const field = `source_citations.${index}`;
    const inspected = snapshotRecord(input, field, "malformed_source_citation");
    if (plain(inspected) && inspected.ok === false) return inspected;
    input = inspected;
    const unknown = exactFields(input, new Set(["source_id", "content_hash", "source_url", "locators", "source_archive_id", "confidence", "evidence_quote"]), field, "unknown_citation_field");
    if (unknown) return unknown;
    const sourceId = safeIdentifier(own(input, "source_id"), `${field}.source_id`);
    if (plain(sourceId)) return sourceId;
    const contentHash = trim(own(input, "content_hash"));
    if (!HASH.test(contentHash)) return fail(`${field}.content_hash`, "invalid_content_hash");
    const locators = uniqueIdentifiers(own(input, "locators"), `${field}.locators`);
    if (plain(locators)) return locators;
    const confidence = trim(own(input, "confidence"));
    if (!CONFIDENCE.includes(confidence)) return fail(`${field}.confidence`, "invalid_confidence");
    const sourceUrlValue = own(input, "source_url");
    const url = sourceUrlValue === undefined || sourceUrlValue === null ? null : sourceUrl(sourceUrlValue, `${field}.source_url`);
    if (plain(url)) return url;
    const archiveValue = own(input, "source_archive_id");
    const archiveId = archiveValue === undefined || archiveValue === null ? null : safeIdentifier(archiveValue, `${field}.source_archive_id`);
    if (plain(archiveId)) return archiveId;
    const quoteValue = own(input, "evidence_quote");
    const evidenceQuote = quoteValue === undefined ? "" : trim(quoteValue);
    if (quoteValue !== undefined && (!evidenceQuote || evidenceQuote.length > 4096)) return fail(`${field}.evidence_quote`, "invalid_evidence_quote");
    const normalized = { source_id: sourceId, content_hash: contentHash, source_url: url, locators, source_archive_id: archiveId, confidence };
    if (evidenceQuote) normalized.evidence_quote = evidenceQuote;
    return normalized;
  }
  function normalizeCitations(value) {
    const inspected = snapshotArray(value, "source_citations", "source_citations_required");
    if (plain(inspected) && inspected.ok === false) return inspected;
    value = inspected;
    if (value.length === 0) return fail("source_citations", "source_citations_required");
    const result = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const citation = normalizeCitation(value[index], index);
      if (plain(citation) && citation.ok === false) return citation;
      if (seen.has(citation.source_id)) return fail("source_citations", "duplicate_source_citation");
      seen.add(citation.source_id);
      result.push(citation);
    }
    return result;
  }
  function normalizeConflicts(value, citationIds) {
    const inspected = snapshotArray(value, "conflicts", "conflicts_required");
    if (plain(inspected) && inspected.ok === false) return inspected;
    value = inspected;
    const result = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
      let item = value[index];
      const field = `conflicts.${index}`;
      const itemSnapshot = snapshotRecord(item, field, "malformed_conflict");
      if (plain(itemSnapshot) && itemSnapshot.ok === false) return itemSnapshot;
      item = itemSnapshot;
      const unknown = exactFields(item, new Set(["conflict_id", "status", "source_ids", "summary"]), field, "unknown_conflict_field");
      if (unknown) return unknown;
      const conflictId = trim(own(item, "conflict_id"));
      if (!ID.test(conflictId) || seen.has(conflictId)) return fail(`${field}.conflict_id`, seen.has(conflictId) ? "duplicate_conflict" : "invalid_conflict_id");
      seen.add(conflictId);
      const status = trim(own(item, "status"));
      if (!CONFLICT_STATUSES.includes(status)) return fail(`${field}.status`, "invalid_conflict_status");
      const sourceIds = uniqueIdentifiers(own(item, "source_ids"), `${field}.source_ids`);
      if (plain(sourceIds)) return sourceIds;
      if (sourceIds.some((id) => !citationIds.has(id))) return fail(`${field}.source_ids`, "unknown_conflict_source");
      const summary = trim(own(item, "summary"));
      if (!summary) return fail(`${field}.summary`, "conflict_summary_required");
      result.push({ conflict_id: conflictId, status, source_ids: sourceIds, summary });
    }
    return result;
  }
  function normalizeEffectList(value, field, requireReplacement) {
    const inspected = snapshotArray(value, field, "effect_list_required");
    if (plain(inspected) && inspected.ok === false) return inspected;
    value = inspected;
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      let item = value[index];
      const itemField = `${field}.${index}`;
      const itemSnapshot = snapshotRecord(item, itemField, "malformed_effect");
      if (plain(itemSnapshot) && itemSnapshot.ok === false) return itemSnapshot;
      item = itemSnapshot;
      const unknown = exactFields(item, new Set(["destination_id", "target_revision", "before_bytes", "replacement_id", "reason"]), itemField, "unknown_effect_field");
      if (unknown) return unknown;
      const destinationId = safeIdentifier(own(item, "destination_id"), `${itemField}.destination_id`);
      if (plain(destinationId)) return destinationId;
      const targetRevision = revision(own(item, "target_revision"), `${itemField}.target_revision`);
      if (plain(targetRevision)) return targetRevision;
      const beforeBytes = own(item, "before_bytes");
      if (typeof beforeBytes !== "string") return fail(`${itemField}.before_bytes`, "effect_before_bytes_required");
      const replacementValue = own(item, "replacement_id");
      const replacementId = replacementValue === null || replacementValue === undefined ? null : safeIdentifier(replacementValue, `${itemField}.replacement_id`);
      if (plain(replacementId)) return replacementId;
      if (requireReplacement && !replacementId) return fail(`${itemField}.replacement_id`, "replacement_required");
      const reason = trim(own(item, "reason"));
      if (!reason) return fail(`${itemField}.reason`, "effect_reason_required");
      result.push({ destination_id: destinationId, target_revision: targetRevision, before_bytes: beforeBytes, replacement_id: replacementId, reason });
    }
    return result;
  }
  function normalizeEffects(value, kind) {
    const inspected = snapshotRecord(value, "effects", "effects_required");
    if (plain(inspected) && inspected.ok === false) return inspected;
    value = inspected;
    const unknown = exactFields(value, new Set(["deprecations", "supersessions"]), "effects", "unknown_effect_field");
    if (unknown) return unknown;
    const deprecationInput = own(value, "deprecations");
    const supersessionInput = own(value, "supersessions");
    if (!Array.isArray(deprecationInput)) return fail("effects.deprecations", "effect_list_required");
    if (!Array.isArray(supersessionInput)) return fail("effects.supersessions", "effect_list_required");
    if (!["update", "merge"].includes(kind) && (deprecationInput.length > 0 || supersessionInput.length > 0)) return fail("effects", "effects_forbidden");
    const deprecations = normalizeEffectList(deprecationInput, "effects.deprecations", false);
    if (plain(deprecations) && deprecations.ok === false) return deprecations;
    const supersessions = normalizeEffectList(supersessionInput, "effects.supersessions", true);
    if (plain(supersessions) && supersessions.ok === false) return supersessions;
    return { deprecations, supersessions };
  }

  function parseOperationUnsafe(input) {
    const inspected = snapshotRecord(input, "operation", "malformed_operation");
    if (plain(inspected) && inspected.ok === false) return inspected;
    input = inspected;
    const kind = trim(own(input, "kind"));
    if (!OPERATION_KINDS.includes(kind)) return fail("kind", "unknown_operation_kind");
    const allowed = new Set(COMMON_FIELDS);
    if (kind === "merge") allowed.add("source_ids");
    const unknown = exactFields(input, allowed, "operation", "unknown_operation_field");
    if (unknown) return unknown;
    if (trim(own(input, "contract_version")) !== CONTRACT_VERSION) return fail("contract_version", "invalid_contract_version");
    const operationId = trim(own(input, "operation_id"));
    if (!ID.test(operationId)) return fail("operation_id", "invalid_operation_id");
    const destinationIds = uniqueIdentifiers(own(input, "destination_ids"), "destination_ids");
    if (plain(destinationIds)) return destinationIds;
    const sourceIds = kind === "merge" ? uniqueIdentifiers(own(input, "source_ids"), "source_ids", 2) : [];
    if (plain(sourceIds)) return sourceIds;
    if (kind === "merge" && sourceIds.some((id) => destinationIds.includes(id))) return fail("source_ids", "source_destination_overlap");
    const baseRevisions = normalizedMap(own(input, "base_revisions"), "base_revisions", revision);
    if (plain(baseRevisions) && baseRevisions.ok === false) return baseRevisions;
    const beforeBytes = normalizedMap(own(input, "before_bytes"), "before_bytes", bytes);
    if (plain(beforeBytes) && beforeBytes.ok === false) return beforeBytes;
    const afterBytes = normalizedMap(own(input, "after_bytes"), "after_bytes", bytes);
    if (plain(afterBytes) && afterBytes.ok === false) return afterBytes;
    const citations = normalizeCitations(own(input, "source_citations"));
    if (plain(citations) && citations.ok === false) return citations;
    const conflicts = normalizeConflicts(own(input, "conflicts"), new Set(citations.map((item) => item.source_id)));
    if (plain(conflicts) && conflicts.ok === false) return conflicts;
    const riskTier = trim(own(input, "risk_tier"));
    if (!RISK_TIERS.includes(riskTier)) return fail("risk_tier", "invalid_risk_tier");
    const effects = normalizeEffects(own(input, "effects"), kind);
    if (plain(effects) && effects.ok === false) return effects;

    if (kind === "create") {
      if (Object.keys(baseRevisions).length !== 0 || Object.keys(beforeBytes).length !== 0) return fail("base_revisions", "create_requires_absent_base");
      if (!sameKeys(afterBytes, destinationIds)) return fail("after_bytes", "destination_byte_coverage_required");
      if (riskTier !== "low") return fail("risk_tier", "create_risk_must_be_low");
    } else if (kind === "merge") {
      const allIds = [...sourceIds, ...destinationIds];
      if (!sameKeys(baseRevisions, allIds) || !sameKeys(beforeBytes, allIds)) return fail("base_revisions", "merge_revision_coverage_required");
      if (!sameKeys(afterBytes, destinationIds)) return fail("after_bytes", "destination_byte_coverage_required");
      if (riskTier !== "high") return fail("risk_tier", "merge_risk_must_be_high");
    } else {
      if (!sameKeys(baseRevisions, destinationIds)) return fail("base_revisions", "destination_revision_coverage_required");
      if (!sameKeys(beforeBytes, destinationIds) || !sameKeys(afterBytes, destinationIds)) return fail("before_bytes", "destination_byte_coverage_required");
      if (kind === "noop") {
        if (riskTier !== "low") return fail("risk_tier", "noop_risk_must_be_low");
        if (destinationIds.some((id) => beforeBytes[id] !== afterBytes[id])) return fail("after_bytes", "noop_must_preserve_bytes");
      }
    }
    if ((effects.deprecations.length > 0 || effects.supersessions.length > 0) && riskTier !== "high") return fail("risk_tier", "effects_require_high_risk");
    for (const [effectKind, list] of Object.entries(effects)) {
      for (let index = 0; index < list.length; index += 1) {
        const effect = list[index];
        const field = `effects.${effectKind}.${index}`;
        if (!Object.hasOwn(baseRevisions, effect.destination_id) || !Object.hasOwn(beforeBytes, effect.destination_id)) return fail(`${field}.destination_id`, "effect_target_unbound");
        if (baseRevisions[effect.destination_id] !== effect.target_revision) return fail(`${field}.target_revision`, "effect_revision_mismatch");
        if (beforeBytes[effect.destination_id] !== effect.before_bytes) return fail(`${field}.before_bytes`, "effect_before_bytes_mismatch");
      }
    }
    const hasUnresolvedConflict = conflicts.some((item) => item.status === "unresolved");
    const revisionBindingState = kind === "create" ? "not_required" : "unverified";
    const approvalEligible = kind === "create" && !hasUnresolvedConflict;
    const inputEligibility = own(input, "approval_eligible");
    const inputCoverage = own(input, "merge_revision_coverage");
    const inputRevisionState = own(input, "revision_binding_state");
    if (inputEligibility !== undefined && inputEligibility !== approvalEligible) return fail("approval_eligible", "derived_eligibility_mismatch");
    if (inputCoverage !== undefined && inputCoverage !== (kind === "merge")) return fail("merge_revision_coverage", "derived_coverage_mismatch");
    if (inputRevisionState !== undefined && inputRevisionState !== revisionBindingState) return fail("revision_binding_state", "derived_revision_state_mismatch");
    return ok({
      contract_version: CONTRACT_VERSION,
      operation_id: operationId,
      kind,
      destination_ids: destinationIds,
      ...(kind === "merge" ? { source_ids: sourceIds } : {}),
      base_revisions: baseRevisions,
      before_bytes: beforeBytes,
      after_bytes: afterBytes,
      source_citations: citations,
      conflicts,
      risk_tier: riskTier,
      effects,
      approval_eligible: approvalEligible,
      merge_revision_coverage: kind === "merge",
      revision_binding_state: revisionBindingState,
    });
  }

  function weakSetHas(set, value) {
    return ((typeof value === "object" && value !== null) || typeof value === "function") && set.has(value);
  }
  function isOperationRecord(value) { return weakSetHas(BRANDED_OPERATIONS, value); }
  function isCanonicalPacketOperationRecord(value) { return weakSetHas(BRANDED_CANONICAL_PACKET_OPERATIONS, value); }
  function isCanonicalOperationRecord(value) {
    return weakSetHas(BRANDED_CANONICAL_OPERATIONS, value) || isCanonicalPacketOperationRecord(value);
  }

  function decodeSerialized(input) {
    if (typeof input !== "string") return fail("operation", "serialized_operation_required");
    if (utf8BytesOverLimit(input, MAX_SERIALIZED_OPERATION_BYTES) > MAX_SERIALIZED_OPERATION_BYTES) return fail("operation", "serialized_operation_too_large");
    let decoded;
    try {
      decoded = parseJsonText(input);
    } catch (error) {
      const reason = error && error.message;
      if (reason === "duplicate_json_key" || reason === "operation_structure_too_complex") return fail("operation", reason);
      return fail("operation", "malformed_json");
    }
    return withinStructureLimits(decoded) ? decoded : fail("operation", "operation_structure_too_complex");
  }

  function parseOperation(input) {
    if (isOperationRecord(input)) return brandedOk(input);
    const decoded = decodeSerialized(input);
    if (boundaryFailure(decoded)) return decoded;
    try {
      const parsed = parseOperationUnsafe(decoded);
      if (parsed.ok === true) BRANDED_OPERATIONS.add(parsed.value);
      return parsed;
    } catch {
      return fail("operation", "malformed_serialized_operation");
    }
  }

  function parseCanonicalOperation(input) {
    if (isCanonicalOperationRecord(input)) return brandedOk(input);
    const decoded = decodeSerialized(input);
    if (boundaryFailure(decoded)) return decoded;
    const inspected = snapshotRecord(decoded, "operation", "malformed_operation");
    if (plain(inspected) && inspected.ok === false) return inspected;
    const unknown = exactFields(inspected, new Set(["operation_id", "proposal_id", "proposal_kind", "payload_hash"]), "operation", "unknown_operation_field");
    if (unknown) return unknown;
    const operationId = trim(own(inspected, "operation_id"));
    const proposalId = trim(own(inspected, "proposal_id"));
    const kind = trim(own(inspected, "proposal_kind"));
    const payloadHash = trim(own(inspected, "payload_hash"));
    if (!ID.test(operationId)) return fail("operation.operation_id", "invalid_operation_id");
    if (!ID.test(proposalId)) return fail("operation.proposal_id", "invalid_proposal_id");
    if (!["create", "update", "merge", "dispute"].includes(kind)) return fail("operation.proposal_kind", "unsupported_operation_kind");
    if (!HASH.test(payloadHash)) return fail("operation.payload_hash", "invalid_payload_hash");
    const result = ok({ operation_id: operationId, proposal_id: proposalId, proposal_kind: kind, payload_hash: payloadHash });
    BRANDED_CANONICAL_OPERATIONS.add(result.value);
    return result;
  }

  function deriveCanonicalPacketOperation(input) {
    if (isCanonicalPacketOperationRecord(input)) return brandedOk(input);
    if (!weakSetHas(BRANDED_CANONICAL_OPERATIONS, input)) return fail("operation", "branded_canonical_operation_required");
    const create = input.proposal_kind === "create";
    const result = ok({
      operation_id: input.operation_id,
      proposal_id: input.proposal_id,
      proposal_kind: input.proposal_kind,
      payload_hash: input.payload_hash,
      authorization_state: create ? "authorizable" : "disabled",
      authorization_reason: create ? "phase_1_create_only" : "future_existing_target_operation",
    });
    BRANDED_CANONICAL_PACKET_OPERATIONS.add(result.value);
    return result;
  }

  function evaluateApprovalEligibility(input, currentCanonicalRevisions) {
    const parsed = parseOperation(input);
    if (parsed.ok === false) return parsed;
    const operation = parsed.value;
    const unresolved = operation.conflicts.some((item) => item.status === "unresolved");
    if (operation.kind === "create") {
      return ok({ fresh: true, approval_eligible: !unresolved, reason: unresolved ? "unresolved_conflict" : "eligible", stale_ids: [] });
    }
    if (currentCanonicalRevisions === undefined || currentCanonicalRevisions === null) {
      return ok({ fresh: false, approval_eligible: false, reason: "trusted_current_revisions_required", stale_ids: [] });
    }
    const inspectedRevisions = snapshotRecord(currentCanonicalRevisions, "current_canonical_revisions", "trusted_current_revisions_required");
    if (plain(inspectedRevisions) && inspectedRevisions.ok === false) return inspectedRevisions;
    const missingIds = [];
    const staleIds = [];
    for (const [id, expectedRevision] of Object.entries(operation.base_revisions)) {
      if (!Object.hasOwn(inspectedRevisions, id)) {
        missingIds.push(id);
        continue;
      }
      const currentRevision = own(inspectedRevisions, id);
      if (!HASH.test(trim(currentRevision))) return fail(`current_canonical_revisions.${id}`, "invalid_current_revision");
      if (currentRevision !== expectedRevision) staleIds.push(id);
    }
    missingIds.sort();
    staleIds.sort();
    if (missingIds.length > 0) return ok({ fresh: false, approval_eligible: false, reason: "current_revision_missing", stale_ids: missingIds });
    if (staleIds.length > 0) return ok({ fresh: false, approval_eligible: false, reason: "stale_base_revision", stale_ids: staleIds });
    if (unresolved) return ok({ fresh: true, approval_eligible: false, reason: "unresolved_conflict", stale_ids: [] });
    return ok({ fresh: true, approval_eligible: true, reason: "eligible", stale_ids: [] });
  }

  const api = freeze({
    CONTRACT_VERSION,
    MAX_SERIALIZED_OPERATION_BYTES,
    STRUCTURE_LIMITS,
    OPERATION_KINDS,
    RISK_TIERS,
    CONFLICT_STATUSES,
    PLAIN_OBJECT_POLICY,
    parseOperation,
    isOperationRecord,
    parseCanonicalOperation,
    isCanonicalOperationRecord,
    deriveCanonicalPacketOperation,
    isCanonicalPacketOperationRecord,
    validateOperation: parseOperation,
    evaluateApprovalEligibility,
    evaluateRevisionBindings: evaluateApprovalEligibility,
  });
  root.LLMWikiOperationContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
