(function (root) {
  "use strict";

  // allow: SIZE_OK — packet assembly and verification form one hashed trust boundary and must change atomically.

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const knowledgeApi = root.KnowledgeCandidateStore || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);

  const PACKET_VERSION = "llmwiki_canonical_packet_v1";
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const NONCE = /^[A-Za-z0-9_-]{16,128}$/u;
  const EXISTING_TARGET_KINDS = new Set(["update", "merge", "dispute"]);
  const DOCUMENT_FIELDS = new Set([
    "application_contexts", "application_trigger", "body", "connections", "created", "invalidation_conditions",
    "knowledge_domain", "knowledge_topics", "statement", "summary", "title", "type", "updated",
  ]);
  const CITATION_FIELDS = new Set([
    "confidence", "content_hash", "locator", "locators", "source_archive_id", "source_id", "source_url", "text",
  ]);
  const OPERATION_FIELDS = new Set(["operation_id", "payload_hash", "proposal_id", "proposal_kind"]);
  const REQUEST_FIELDS = new Set([
    "allowed_properties", "canonical_document", "consent_hash", "expires_at", "nonce", "operation", "run_id",
    "source_citations", "target_path",
  ]);
  const ALLOWED_PROPERTIES = Object.freeze([
    "/body",
    "/frontmatter/application_contexts",
    "/frontmatter/application_trigger",
    "/frontmatter/connections",
    "/frontmatter/created",
    "/frontmatter/invalidation_conditions",
    "/frontmatter/knowledge_domain",
    "/frontmatter/knowledge_topics",
    "/frontmatter/statement",
    "/frontmatter/summary",
    "/frontmatter/title",
    "/frontmatter/type",
    "/frontmatter/updated",
  ]);
  const WRITE_COUNTERS = Object.freeze({ canonical: 0, audit: 0, provider: 0, network: 0, git: 0 });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) { return hashApi.sha256(String(value)); }
  function fail(field, reason) { return freeze({ ok: false, status: "rejected", field, reason, write_counters: WRITE_COUNTERS }); }
  function success(status, value, extras = {}) { return freeze({ ok: true, status, value, write_counters: WRITE_COUNTERS, ...extras }); }
  function same(left, right) { return stable(left) === stable(right); }

  function validIso(value) {
    const timestamp = trim(value);
    const milliseconds = Date.parse(timestamp);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === timestamp;
  }

  function safeTitle(value) {
    try { return knowledgeApi.canonicalKnowledgePath(value).slice(targetPrefix().length, -3); }
    catch (_error) { return null; }
  }

  function targetPrefix() { return `${knowledgeApi.canonicalKnowledgeDirectory()}/`; }

  function validTarget(value) {
    return knowledgeApi.isCanonicalKnowledgeTarget(value);
  }

  function validLocator(value) {
    const locator = trim(value);
    const pathPart = locator.split("#", 1)[0];
    const segments = pathPart.split("/");
    return Boolean(locator) && locator === value && !/[\u0000-\u001f\u007f\\]/u.test(locator)
      && !locator.startsWith("/") && !/^[A-Za-z]:/u.test(locator) && !locator.includes("[[") && !locator.includes("]]")
      && segments.every((segment) => segment && segment !== "." && segment !== "..");
  }

  function validateDocument(value) {
    if (!plain(value)) return fail("canonical_document", "malformed_canonical_document");
    for (const key of Object.keys(value)) if (!DOCUMENT_FIELDS.has(key)) return fail(`canonical_document.${key}`, "unknown_document_field");
    if (!safeTitle(value.title)) return fail("canonical_document.title", "invalid_title");
    if (!trim(value.statement) || value.statement !== trim(value.statement)) return fail("canonical_document.statement", "invalid_statement");
    if (!trim(value.knowledge_domain) || value.knowledge_domain !== trim(value.knowledge_domain)) return fail("canonical_document.knowledge_domain", "invalid_knowledge_domain");
    for (const field of ["knowledge_topics", "application_contexts", "connections", "invalidation_conditions"]) {
      if (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string")) return fail(`canonical_document.${field}`, "invalid_document_list");
    }
    for (const field of ["application_trigger", "summary", "body"]) {
      if (typeof value[field] !== "string") return fail(`canonical_document.${field}`, "invalid_document_text");
    }
    if (!validIso(value.created) || !validIso(value.updated)) return fail("canonical_document.timestamp", "invalid_document_timestamp");
    const issue = knowledgeApi.canonicalDocumentIssue(value);
    if (issue) return fail(issue.field, issue.reason);
    return null;
  }

  function validateProperties(value) {
    if (value === undefined) return ALLOWED_PROPERTIES;
    if (!Array.isArray(value) || value.length !== ALLOWED_PROPERTIES.length || new Set(value).size !== value.length) return fail("allowed_properties", "unauthorized_property");
    const normalized = value.slice().sort();
    return same(normalized, ALLOWED_PROPERTIES) ? normalized : fail("allowed_properties", "unauthorized_property");
  }

  function normalizedUrl(value) {
    if (value === null || value === undefined || value === "") return null;
    let parsed;
    try { parsed = new URL(value); } catch (_error) { return null; }
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null;
  }

  function validateCitations(value) {
    if (!Array.isArray(value) || value.length === 0) return fail("source_citations", "source_citation_required");
    const result = [];
    const sourceIds = new Set();
    for (const [index, citation] of value.entries()) {
      if (!plain(citation)) return fail(`source_citations.${index}`, "malformed_source_citation");
      for (const key of Object.keys(citation)) if (!CITATION_FIELDS.has(key)) return fail(`source_citations.${index}.${key}`, "unknown_source_citation_field");
      const sourceId = trim(citation.source_id);
      if (!ID.test(sourceId) || sourceIds.has(sourceId)) return fail(`source_citations.${index}.source_id`, sourceIds.has(sourceId) ? "duplicate_source_id" : "invalid_source_id");
      if (!HASH.test(trim(citation.content_hash))) return fail(`source_citations.${index}.content_hash`, "invalid_source_hash");
      const locators = citation.locators === undefined ? [citation.locator].filter((item) => item !== undefined) : citation.locators;
      if (!Array.isArray(locators) || locators.length === 0 || locators.some((locator) => !validLocator(locator))) {
        return fail(`source_citations.${index}.locators`, "invalid_source_locator");
      }
      if (citation.source_url !== null && citation.source_url !== undefined && normalizedUrl(citation.source_url) === null) {
        return fail(`source_citations.${index}.source_url`, "invalid_source_url");
      }
      if (citation.source_archive_id !== null && citation.source_archive_id !== undefined && !ID.test(trim(citation.source_archive_id))) {
        return fail(`source_citations.${index}.source_archive_id`, "invalid_source_archive_id");
      }
      if (citation.confidence !== undefined && typeof citation.confidence !== "string") return fail(`source_citations.${index}.confidence`, "invalid_source_confidence");
      if (citation.text !== undefined && typeof citation.text !== "string") return fail(`source_citations.${index}.text`, "invalid_source_text");
      sourceIds.add(sourceId);
      result.push(clone({ ...citation, locators: locators.slice() }));
      if (citation.locator !== undefined) delete result[result.length - 1].locator;
    }
    return result;
  }

  function validateOperation(value) {
    if (!plain(value)) return fail("operation", "malformed_operation");
    for (const key of Object.keys(value)) if (!OPERATION_FIELDS.has(key)) return fail(`operation.${key}`, "unknown_operation_field");
    if (!ID.test(trim(value.operation_id))) return fail("operation.operation_id", "invalid_operation_id");
    if (!ID.test(trim(value.proposal_id))) return fail("operation.proposal_id", "invalid_proposal_id");
    const kind = trim(value.proposal_kind);
    if (kind !== "create" && !EXISTING_TARGET_KINDS.has(kind)) return fail("operation.proposal_kind", "unsupported_operation_kind");
    if (!HASH.test(trim(value.payload_hash))) return fail("operation.payload_hash", "invalid_payload_hash");
    return { operation_id: trim(value.operation_id), proposal_id: trim(value.proposal_id), proposal_kind: kind, payload_hash: trim(value.payload_hash) };
  }

  function validateRequest(request, adapter) {
    if (!plain(request)) return fail("request", "malformed_request");
    for (const key of Object.keys(request)) if (!REQUEST_FIELDS.has(key)) return fail(key, "unknown_request_field");
    if (!adapter || typeof adapter.readBytes !== "function") return fail("adapter.readBytes", "live_read_adapter_required");
    if (!ID.test(trim(request.run_id))) return fail("run_id", "invalid_run_id");
    if (!HASH.test(trim(request.consent_hash))) return fail("consent_hash", "invalid_consent_hash");
    if (!validIso(request.expires_at)) return fail("expires_at", "invalid_expiry");
    if (!NONCE.test(trim(request.nonce))) return fail("nonce", "invalid_nonce");
    return validateDocument(request.canonical_document);
  }

  async function readLive(adapter, targetPath) {
    let bytes;
    try { bytes = await adapter.readBytes(targetPath); }
    catch (_error) { return fail("adapter.readBytes", "live_read_failed"); }
    return bytes === null || typeof bytes === "string" ? bytes : fail("adapter.readBytes", "invalid_live_read_result");
  }

  async function createTarget(title, adapter) {
    for (let suffix = 1; suffix <= 1000; suffix += 1) {
      const targetPath = knowledgeApi.canonicalKnowledgePath(title, suffix);
      const bytes = await readLive(adapter, targetPath);
      if (plain(bytes) && bytes.ok === false) return bytes;
      if (bytes === null) return { targetPath, collision: suffix > 1 };
    }
    return fail("target_path", "unique_target_exhausted");
  }

  function liveRevision(targetPath, beforeSha256) { return sha256(stable({ before_sha256: beforeSha256, target_path: targetPath })); }

  function packetBody(request, operation, targetPath, beforeBytes, afterBytes, allowedProperties, citations) {
    const create = operation.proposal_kind === "create";
    return {
      packet_version: PACKET_VERSION,
      run_id: trim(request.run_id),
      operation: {
        ...operation,
        authorization_state: create ? "authorizable" : "disabled",
        authorization_reason: create ? "phase_1_create_only" : "future_existing_target_operation",
      },
      target_path: targetPath,
      allowed_properties: allowedProperties.slice(),
      before_bytes: beforeBytes,
      before_sha256: sha256(beforeBytes),
      after_bytes: afterBytes,
      after_sha256: sha256(afterBytes),
      source_citations: citations,
      consent_hash: trim(request.consent_hash),
      live_revision: liveRevision(targetPath, sha256(beforeBytes)),
      expires_at: trim(request.expires_at),
      nonce: trim(request.nonce),
      write_counters: WRITE_COUNTERS,
    };
  }

  function packetIdentity(value) {
    const body = clone(value);
    delete body.packet_hash;
    delete body.canonical_serialization;
    return body;
  }

  function computePacketHash(value) { return sha256(stable(packetIdentity(value))); }

  function attachHash(body) {
    const canonicalSerialization = stable(body);
    return freeze({ ...body, packet_hash: sha256(canonicalSerialization), canonical_serialization: canonicalSerialization });
  }

  function verifyCanonicalPacket(packet) {
    if (!plain(packet)) return fail("packet", "malformed_packet");
    const identity = packetIdentity(packet);
    const canonicalSerialization = stable(identity);
    if (packet.canonical_serialization !== canonicalSerialization || packet.packet_hash !== sha256(canonicalSerialization)) return fail("packet", "packet_tampered");
    if (!validTarget(packet.target_path) || !same(packet.allowed_properties, ALLOWED_PROPERTIES)) return fail("packet", "packet_payload_invalid");
    if (typeof packet.before_bytes !== "string" || sha256(packet.before_bytes) !== packet.before_sha256) return fail("packet", "packet_payload_invalid");
    if (typeof packet.after_bytes !== "string" || sha256(packet.after_bytes) !== packet.after_sha256) return fail("packet", "packet_payload_invalid");
    if (packet.live_revision !== liveRevision(packet.target_path, packet.before_sha256)) return fail("packet", "packet_payload_invalid");
    if (!same(packet.write_counters, WRITE_COUNTERS)) return fail("packet", "packet_payload_invalid");
    if (!HASH.test(trim(packet.consent_hash)) || !validIso(packet.expires_at) || !NONCE.test(trim(packet.nonce))) return fail("packet", "packet_payload_invalid");
    const citations = validateCitations(packet.source_citations);
    if ((plain(citations) && citations.ok === false) || !same(citations, packet.source_citations)) return fail("packet", "packet_payload_invalid");
    const operation = validateOperation(plain(packet.operation) ? {
      operation_id: packet.operation.operation_id,
      proposal_id: packet.operation.proposal_id,
      proposal_kind: packet.operation.proposal_kind,
      payload_hash: packet.operation.payload_hash,
    } : packet.operation);
    if (plain(operation) && operation.ok === false) return fail("packet", "packet_payload_invalid");
    const create = operation.proposal_kind === "create";
    if (packet.operation.authorization_state !== (create ? "authorizable" : "disabled")) return fail("packet", "packet_payload_invalid");
    if (create && packet.before_bytes !== "") return fail("packet", "packet_payload_invalid");
    try {
      const parsed = knowledgeApi.parseFrontmatter(packet.after_bytes);
      if (knowledgeApi.renderCanonicalDocument({ ...parsed.data, body: parsed.body }) !== packet.after_bytes) return fail("packet", "packet_payload_invalid");
    } catch (_error) { return fail("packet", "packet_payload_invalid"); }
    return success("verified", freeze({ packet_hash: packet.packet_hash }));
  }

  async function assembleCanonicalPacket(request, adapter) {
    const invalid = validateRequest(request, adapter);
    if (invalid) return invalid;
    const operation = validateOperation(request.operation);
    if (plain(operation) && operation.ok === false) return operation;
    const allowedProperties = validateProperties(request.allowed_properties);
    if (plain(allowedProperties) && allowedProperties.ok === false) return allowedProperties;
    const citations = validateCitations(request.source_citations);
    if (plain(citations) && citations.ok === false) return citations;

    const create = operation.proposal_kind === "create";
    if (create && request.target_path !== undefined && request.target_path !== null && request.target_path !== "") {
      return fail("target_path", "target_forbidden_for_create");
    }
    let targetPath;
    let beforeBytes;
    let collision = false;
    if (create) {
      const selected = await createTarget(request.canonical_document.title, adapter);
      if (plain(selected) && selected.ok === false) return selected;
      targetPath = selected.targetPath;
      beforeBytes = "";
      collision = selected.collision;
    } else {
      targetPath = request.target_path;
      if (!validTarget(targetPath)) return fail("target_path", "invalid_target");
      const liveBytes = await readLive(adapter, targetPath);
      if (plain(liveBytes) && liveBytes.ok === false) return liveBytes;
      if (liveBytes === null) return fail("target_path", "existing_target_required");
      beforeBytes = liveBytes;
    }

    const afterBytes = knowledgeApi.renderCanonicalDocument(request.canonical_document);
    const packet = attachHash(packetBody(request, operation, targetPath, beforeBytes, afterBytes, allowedProperties, citations));
    if (collision) return success("stale_reconfirm_required", packet, { reason: "create_target_collision" });
    return success(create ? "ready_for_review" : "authorization_disabled", packet);
  }

  const api = freeze({
    PACKET_VERSION, ALLOWED_PROPERTIES, WRITE_COUNTERS, assembleCanonicalPacket, computePacketHash, verifyCanonicalPacket, sha256,
    canonicalKnowledgeDirectory: knowledgeApi.canonicalKnowledgeDirectory,
    renderCanonicalDocument: knowledgeApi.renderCanonicalDocument,
  });
  root.LLMWikiCanonicalPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
