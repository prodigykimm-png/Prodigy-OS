(function (root) {
  "use strict";

  // allow: SIZE_OK — this IIFE owns Candidate storage and the exact LLM Wiki review handoff boundary.

  const CANDIDATE_DIR = "ZETA/CANDIDATES";
  const LEGACY_CANDIDATE_DIRS = Object.freeze(["PARA/RESOURCES/Knowledge/Candidates", "PARA/RESOURCES/Reading/Candidates", "ZETA/FLEETING/Knowledge Candidates"]);
  const KNOWLEDGE_DIR = "ZETA/PERMANENT";

  if (!root.KnowledgeCandidateCore && typeof require === "function") require("./knowledge-candidate-core.js");
  const canUseCommonJsRequire = typeof require === "function"
    && !(typeof process !== "undefined" && process && process.type === "renderer");
  if (!root.EvidenceQualityCore && canUseCommonJsRequire) root.EvidenceQualityCore = require("./evidence-quality-core.js");

  function core() {
    if (!root.KnowledgeCandidateCore) throw new Error("Knowledge Candidate core를 먼저 불러와야 합니다.");
    return root.KnowledgeCandidateCore;
  }

  function promotionContract() {
    const contract = root.LLMWikiPromotionContract || (typeof require === "function" ? require("./llmwiki-promotion-contract.js") : null);
    if (!contract || typeof contract.evaluatePromotion !== "function") throw lifecycleError("promotion_contract_required");
    return contract;
  }

  function clean(value) { return typeof value === "string" ? value.trim() : ""; }
  function stamp(value) { return value || new Date().toISOString(); }
  function canonicalKnowledgeDirectory() { return KNOWLEDGE_DIR; }
  function canonicalKnowledgePath(title, suffix) {
    const name = typeof title === "string" ? title : "";
    const sequence = suffix === undefined ? 1 : suffix;
    if (!name || name !== name.trim() || name === "." || name === ".." || name.length > 180
      || /[\u0000-\u001f\u007f\\/:*?"<>|]/u.test(name) || name.includes("[[") || name.includes("]]")) {
      throw new Error("invalid_title");
    }
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 1000) throw new Error("invalid_target_suffix");
    return `${KNOWLEDGE_DIR}/${name}${sequence === 1 ? "" : ` ${sequence}`}.md`;
  }
  function isCanonicalKnowledgeTarget(value) {
    if (typeof value !== "string" || !value.startsWith(`${KNOWLEDGE_DIR}/`) || !value.endsWith(".md")) return false;
    const name = value.slice(KNOWLEDGE_DIR.length + 1, -3);
    if (!name || name.includes("/")) return false;
    try { return canonicalKnowledgePath(name) === value; } catch (_error) { return false; }
  }
  function isLegacyPath(value) { return LEGACY_CANDIDATE_DIRS.some((folder) => value === folder || value.startsWith(`${folder}/`)); }
  function requireCanonicalCandidatePath(value) {
    if (!value.startsWith(`${CANDIDATE_DIR}/`)) throw lifecycleError("legacy_read_only: 레거시 Knowledge Candidate는 읽기 전용입니다.");
  }
  function safeName(value) {
    const name = clean(value).replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ");
    if (!name || name === "." || name === "..") throw new Error("안전한 제목이 필요합니다.");
    return name;
  }

  function lifecycleError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }
  function structured(value) { return value.startsWith("[") || value.startsWith("{"); }
  function parseValue(value) {
    const text = value.trim();
    if (structured(text)) {
      try { return JSON.parse(text); }
      catch (_error) { throw lifecycleError("malformed_structured_value"); }
    }
    if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
    if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text)) return JSON.parse(text);
    return text;
  }

  function parseFrontmatter(content) {
    const match = String(content || "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) throw new Error("Candidate frontmatter를 읽을 수 없습니다.");
    const data = {};
    const lines = match[1].split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const property = /^([a-z][a-z0-9_]*):\s*(.*)$/.exec(lines[index]);
      if (!property) continue;
      const [, key, raw] = property;
      if (raw) { data[key] = parseValue(raw); continue; }
      const values = [];
      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        values.push(parseValue(lines[index].replace(/^\s+-\s+/, "")));
      }
      data[key] = values;
    }
    return { data, body: match[2] };
  }

  function scalar(value) { return JSON.stringify(value == null ? "" : String(value)); }
  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (!value || typeof value !== "object") return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  function renderFrontmatter(data, body) {
    const lines = ["---"];
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (!value.length) lines.push(`${key}: []`);
        else { lines.push(`${key}:`); value.forEach((item) => lines.push(`  - ${scalar(item)}`)); }
      } else lines.push(`${key}: ${scalar(value)}`);
    });
    return `${lines.join("\n")}\n---\n${body || ""}`;
  }

  const LIFECYCLE_TYPES = new Set(["literature_note", "fleeting_note", "knowledge_candidate", "knowledge"]);
  const LIFECYCLE_IDS = Object.freeze({ literature_note: "source_id", fleeting_note: "fleeting_id", knowledge_candidate: "candidate_id", knowledge: "canonical_id" });
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const MAX_STRUCTURED_ENTRIES = 64;
  const MAX_STRUCTURED_BYTES = 32 * 1024;
  const MAX_STRUCTURED_TEXT = 1024;
  const LIFECYCLE_FIELD_ORDER = Object.freeze({
    fleeting_note: ["schema_version", "type", "fleeting_id", "created", "updated", "blocks"],
    literature_note: ["schema_version", "type", "source_id", "source_batch_id", "source_kind", "source_url", "creator", "publisher", "published_at", "summary_origin", "knowledge_domain", "knowledge_topics", "connections", "sources", "relations", "created", "updated"],
    knowledge_candidate: ["schema_version", "type", "candidate_id", "status", "statement", "reason", "source_type", "source_evidence_ids", "source_objects", "source_note", "application_trigger", "application_contexts", "confidence", "suggested_domain", "suggested_topics", "connections", "invalidation_conditions", "promotion_input", "promotion_input_binding", "promotion_receipt", "promotion_gaps", "blocking_content_gaps", "approval_note", "promotion_target", "promoted_knowledge", "review_handoff", "sources", "relations", "created", "updated"],
    knowledge: ["schema_version", "type", "canonical_id", "knowledge_kind", "status", "statement", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "connections", "invalidation_conditions", "sources", "relations", "claim_set_hash", "promotion_receipt_hash", "ai_enrichment_status", "created", "updated"],
  });
  const STRUCTURED_FIELDS = Object.freeze({ source: new Set(["source_id", "span", "locator"]), relation: new Set(["relation_id", "target_id", "type"]) });
  const PROMOTION_GAP_FIELDS = new Set(["gate_id", "phase", "state", "reason_code", "evidence_refs"]);
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function boundedText(value, code) {
    if (typeof value !== "string" || !value || value.length > MAX_STRUCTURED_TEXT) throw lifecycleError(code);
    return value;
  }
  function boundedJson(value) {
    if (new TextEncoder().encode(stableJson(value)).length > MAX_STRUCTURED_BYTES) throw lifecycleError("structured_value_too_large");
  }
  function span(value, code) {
    if (!plain(value) || Object.keys(value).some((key) => key !== "start" && key !== "end")
      || !Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || value.start < 0 || value.end < value.start) throw lifecycleError(code);
  }
  function structuredEntries(entries, kind) {
    if (!Array.isArray(entries) || entries.length > MAX_STRUCTURED_ENTRIES) throw lifecycleError("structured_value_too_large");
    boundedJson(entries);
    const id = kind === "source" ? "source_id" : "relation_id";
    const seen = new Set();
    for (const entry of entries) {
      if (!plain(entry)) throw lifecycleError(`malformed_structured_${kind}`);
      for (const key of Object.keys(entry)) if (!STRUCTURED_FIELDS[kind].has(key)) throw lifecycleError(`unknown_structured_${kind}_field`);
      if (!ID.test(boundedText(entry[id], `malformed_structured_${kind}`)) || seen.has(entry[id])) throw lifecycleError("duplicate_stable_id");
      seen.add(entry[id]);
      if (kind === "source") {
        if ((entry.span === undefined) === (entry.locator === undefined)) throw lifecycleError("malformed_structured_source");
        span(entry.span === undefined ? entry.locator : entry.span, "malformed_structured_source");
      } else {
        if (!ID.test(boundedText(entry.target_id, "malformed_structured_relation")) || !/^[a-z][a-z0-9_-]{2,127}$/u.test(boundedText(entry.type, "malformed_structured_relation"))) throw lifecycleError("malformed_structured_relation");
      }
    }
  }
  function validateStructuredBindings(data) {
    if (data.sources !== undefined) structuredEntries(data.sources, "source");
    if (data.relations !== undefined) structuredEntries(data.relations, "relation");
  }
  function promotionGaps(entries) {
    if (!Array.isArray(entries) || entries.length > MAX_STRUCTURED_ENTRIES) throw lifecycleError("structured_value_too_large");
    boundedJson(entries);
    const gates = new Set();
    for (const entry of entries) {
      if (!plain(entry)) throw lifecycleError("malformed_promotion_gap");
      for (const key of Object.keys(entry)) if (!PROMOTION_GAP_FIELDS.has(key)) throw lifecycleError("unknown_promotion_gap_field");
      for (const key of ["gate_id", "phase", "state", "reason_code"]) boundedText(entry[key], "malformed_promotion_gap");
      if (gates.has(entry.gate_id)) throw lifecycleError("duplicate_stable_id");
      gates.add(entry.gate_id);
      if (!Array.isArray(entry.evidence_refs) || entry.evidence_refs.length > MAX_STRUCTURED_ENTRIES) throw lifecycleError("malformed_promotion_gap");
      for (const evidenceRef of entry.evidence_refs) boundedText(evidenceRef, "malformed_promotion_gap");
    }
  }
  function lifecycleBodyTitle(body) {
    const match = String(body || "").match(/^#\s+(.+)$/m);
    return match ? match[1] : "";
  }
  function validateLifecycle(data, body) {
    if (data.schema_version === undefined || data.schema_version === 1) return { ...data, body, legacy: true };
    if (data.schema_version !== 2) throw lifecycleError("unknown_schema_version");
    if (!LIFECYCLE_TYPES.has(data.type)) throw lifecycleError("unknown_lifecycle_type");
    const id = LIFECYCLE_IDS[data.type];
    if (!ID.test(boundedText(data[id], "stable_id_required"))) throw lifecycleError("stable_id_required");
    if (data.type === "knowledge" && data.summary !== undefined) throw lifecycleError("duplicate_v2_summary");
    const allowed = new Set(LIFECYCLE_FIELD_ORDER[data.type]);
    for (const key of Object.keys(data)) if (!allowed.has(key)) throw lifecycleError("unknown_lifecycle_field");
    validateStructuredBindings(data);
    if (data.type === "knowledge_candidate") {
      if (data.promotion_gaps !== undefined) promotionGaps(data.promotion_gaps);
      if (data.blocking_content_gaps !== undefined) promotionGaps(data.blocking_content_gaps);
      if (data.review_handoff !== undefined) reviewHandoffShape(data.review_handoff);
      if (data.promotion_input !== undefined || data.promotion_receipt !== undefined || data.promotion_input_binding !== undefined) {
        boundedJson(data.promotion_input);
        boundedJson(data.promotion_receipt);
        const binding = promotionContract().validateCandidateReceipt(data.promotion_receipt, data.promotion_input);
        if (data.promotion_input_binding !== binding.promotion_input_binding) throw lifecycleError("invalid_promotion_packet");
      }
    }
    if (data.type === "knowledge" && (!/^[0-9a-f]{64}$/u.test(data.claim_set_hash || "") || !/^[0-9a-f]{64}$/u.test(data.promotion_receipt_hash || "")
      || typeof data.ai_enrichment_status !== "string" || !data.ai_enrichment_status || !["active", "superseded", "quarantined"].includes(data.status))) {
      throw lifecycleError("invalid_lifecycle_metadata");
    }
    if (data.type === "fleeting_note" && data.blocks !== undefined) {
      if (!Array.isArray(data.blocks) || data.blocks.length > MAX_STRUCTURED_ENTRIES) throw lifecycleError("structured_value_too_large");
      for (const block of data.blocks) {
        if (!plain(block) || Object.keys(block).some((key) => !["block_id", "sources", "text"].includes(key)) || !ID.test(boundedText(block.block_id, "malformed_fleeting_block"))) throw lifecycleError("malformed_fleeting_block");
        if (block.sources !== undefined) structuredEntries(block.sources, "source");
        if (block.text !== undefined) boundedText(block.text, "malformed_fleeting_block");
      }
    }
    return { ...data, title: data.title || lifecycleBodyTitle(body), body, legacy: false };
  }
  function parseLifecycleDocument(content) {
    const parsed = parseFrontmatter(content);
    return validateLifecycle(parsed.data, parsed.body);
  }
  function validateLifecycleDocument(value) {
    if (!plain(value)) throw lifecycleError("malformed_lifecycle_document");
    const { body, title: _title, legacy: _legacy, ...data } = value;
    return validateLifecycle(data, body || "");
  }
  function renderLifecycleDocument(value) {
    const input = validateLifecycleDocument(value);
    const lines = ["---"];
    for (const key of LIFECYCLE_FIELD_ORDER[input.type]) {
      const item = input[key];
      if (item === "" || item === undefined || item === null || (Array.isArray(item) && !item.length)) continue;
      lines.push(`${key}: ${item && typeof item === "object" ? stableJson(item) : typeof item === "string" ? scalar(item) : String(item)}`);
    }
    return `${lines.join("\n")}\n---\n${input.body || ""}`;
  }
  function renderFleetingDocument(value) {
    return renderLifecycleDocument({ ...value, type: "fleeting_note" });
  }
  function renderLifecycleCandidateDocument(value) {
    return renderLifecycleDocument({ ...value, type: "knowledge_candidate" });
  }

  function renderCanonicalDocument(value) {
    const issue = canonicalDocumentIssue(value);
    if (issue) {
      const error = new Error(issue.reason);
      error.code = issue.reason;
      throw error;
    }
    if (value.schema_version === 2) return renderLifecycleDocument({ ...value, type: "knowledge" });
    return renderFrontmatter({
      type: "knowledge", title: value.title, knowledge_domain: value.knowledge_domain, knowledge_topics: value.knowledge_topics,
      application_trigger: value.application_trigger || "", application_contexts: value.application_contexts || [],
      statement: value.statement, connections: value.connections || [], invalidation_conditions: value.invalidation_conditions || [],
      summary: value.summary || "", created: value.created, updated: value.updated,
    }, value.body).replace(/^type: "knowledge"$/m, "type: knowledge");
  }

  function canonicalDocumentIssue(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { field: "canonical_document", reason: "malformed_canonical_document" };
    if (value.type !== undefined && value.type !== "knowledge") return { field: "canonical_document.type", reason: "canonical_type_required" };
    const candidateCore = core();
    if (!candidateCore.DOMAINS.includes(value.knowledge_domain)) {
      return { field: "canonical_document.knowledge_domain", reason: "unregistered_knowledge_domain" };
    }
    if (Array.isArray(value.knowledge_topics)
      && value.knowledge_topics.some((topic) => !candidateCore.TOPICS[value.knowledge_domain].includes(topic))) {
      return { field: "canonical_document.knowledge_topics", reason: "unregistered_knowledge_topic" };
    }
    return null;
  }

  async function ensureFolder(app, folder) {
    let current = "";
    for (const part of folder.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        try { await app.vault.createFolder(current); } catch (error) { if (!app.vault.getAbstractFileByPath(current)) throw error; }
      }
    }
  }

  async function filesIn(app, folders) {
    const result = [];
    const seen = new Set();
    for (const folder of folders) {
      const node = app.vault.getAbstractFileByPath(folder);
      for (const file of node && Array.isArray(node.children) ? node.children : []) {
        if (file && file.extension === "md" && !seen.has(file.path)) { seen.add(file.path); result.push(file); }
      }
    }
    return result;
  }

  async function findCanonicalCandidateById(app, candidateId) {
    const id = clean(candidateId);
    if (!id) return null;
    for (const file of await filesIn(app, [CANDIDATE_DIR])) {
      try {
        const candidate = await readCandidate(app, file.path);
        if (candidate.candidate_id === id) return candidate;
      } catch (_error) { /* malformed files remain untouched and do not block a new save */ }
    }
    return null;
  }

  function normalizeCandidate(data, path) {
    const candidateCore = core();
    let normalized;
    try { normalized = candidateCore.validateCandidate(data); }
    catch (error) {
      if (!isLegacyPath(path)) throw error;
      const legacy = candidateCore.normalizeLegacyReadingCandidate({
        ...data,
        title: clean(data.title) || "Legacy Reading Candidate",
        statement: clean(data.statement) || clean(data.title) || "Legacy Reading Candidate",
        reason: clean(data.reason) || clean(data.source_book) || "Legacy Reading Candidate",
        source_evidence_ids: Array.isArray(data.source_evidence_ids) ? data.source_evidence_ids : [],
        source_objects: Array.isArray(data.source_objects) ? data.source_objects : clean(data.source_session) ? [data.source_session] : []
      });
      normalized = ["saved", "rejected"].includes(data.status) ? candidateCore.validateCandidate({ ...legacy, status: data.status }) : legacy;
    }
    return { ...data, ...normalized, path };
  }

  function candidateBody(candidate) {
    const sourceNote = candidate.source_note || "-";
    const trigger = candidate.application_trigger || "-";
    const contexts = candidate.application_contexts.length ? candidate.application_contexts.map((context) => `- ${context}`).join("\n") : "-";
    const connections = candidate.connections.length ? candidate.connections.map((connection) => `- ${connection}`).join("\n") : "-";
    const invalidation = candidate.invalidation_conditions.length ? candidate.invalidation_conditions.map((condition) => `- ${condition}`).join("\n") : "-";
    const approvalNote = candidate.approval_note || "-";
    return `# ${candidate.title}\n\n## 지식 문장\n\n${candidate.statement}\n\n## 제안 이유\n\n${candidate.reason}\n\n## 출처 메모\n\n${sourceNote}\n\n## 적용 조건\n\n${trigger}\n\n${contexts}\n\n## 무효화 조건\n\n${invalidation}\n\n## 연결된 Region\n\n${connections}\n\n## 승인 메모\n\n${approvalNote}\n`;
  }

  async function readCandidate(app, candidatePath) {
    const file = app.vault.getAbstractFileByPath(candidatePath);
    if (!file) throw new Error("Knowledge Candidate 파일을 찾을 수 없습니다.");
    const content = await app.vault.read(file);
    const parsed = parseFrontmatter(content);
    if (parsed.data.schema_version === 2) {
      const lifecycle = parseLifecycleDocument(content);
      if (lifecycle.type !== "knowledge_candidate") throw new Error("Knowledge Candidate 파일이 아닙니다.");
      return Object.freeze({
        ...lifecycle,
        promotion_unit: lifecycle.promotion_input,
        source_evidence_ids: lifecycle.source_evidence_ids || [], source_objects: lifecycle.source_objects || [],
        application_contexts: lifecycle.application_contexts || [], suggested_topics: lifecycle.suggested_topics || [],
        connections: lifecycle.connections || [], invalidation_conditions: lifecycle.invalidation_conditions || [],
        promotion_gaps: lifecycle.promotion_gaps || [], blocking_content_gaps: lifecycle.blocking_content_gaps || [],
        source_note: lifecycle.source_note || "", application_trigger: lifecycle.application_trigger || "",
        approval_note: lifecycle.approval_note || "", promotion_target: lifecycle.promotion_target || "", promoted_knowledge: lifecycle.promoted_knowledge || "",
        path: file.path, legacy_read_only: false,
      });
    }
    if (parsed.data.schema_version !== undefined && parsed.data.schema_version !== 1) parseLifecycleDocument(content);
    if (parsed.data.type && parsed.data.type !== "knowledge_candidate") throw new Error("Knowledge Candidate 파일이 아닙니다.");
    if (!parsed.data.type && !isLegacyPath(file.path)) throw new Error("Knowledge Candidate 파일이 아닙니다.");
    return Object.freeze({ ...normalizeCandidate({ ...parsed.data, type: "knowledge_candidate" }, file.path), body: parsed.body, legacy_read_only: true });
  }

  async function listCandidates(app, options) {
    const request = options || {};
    const byId = new Map();
    for (const file of await filesIn(app, [CANDIDATE_DIR, ...LEGACY_CANDIDATE_DIRS])) {
      try {
        const candidate = await readCandidate(app, file.path);
        if (request.status === "active" && !(candidate.legacy_read_only ? core().isActive(candidate) : ["proposed", "saved", "needs_more_evidence"].includes(candidate.status))) continue;
        if (request.status && request.status !== "all" && request.status !== "active" && candidate.status !== request.status) continue;
        const prior = byId.get(candidate.candidate_id);
        if (!prior || (prior.legacy_read_only && !candidate.legacy_read_only)) byId.set(candidate.candidate_id, candidate);
      } catch (_error) { /* malformed files remain untouched and excluded */ }
    }
    return [...byId.values()].sort((left, right) => String(right.created).localeCompare(String(left.created)) || left.path.localeCompare(right.path));
  }

  function requireMutableCandidate(candidate) {
    if (!candidate || candidate.legacy_read_only !== false) throw lifecycleError("legacy_read_only");
  }

  async function writeCandidate(app, candidatePath, current, next) {
    requireCanonicalCandidatePath(candidatePath);
    requireMutableCandidate(current);
    const file = app.vault.getAbstractFileByPath(candidatePath);
    const parsed = parseFrontmatter(await app.vault.read(file));
    if (parsed.data.schema_version !== 2) throw lifecycleError("legacy_read_only");
    const { promotion_unit: _promotionUnit, path: _path, legacy_read_only: _legacyReadOnly, ...nextFields } = next;
    const content = renderLifecycleCandidateDocument({ ...parsed.data, ...nextFields, body: parsed.body });
    await app.vault.modify(file, content);
    return { ...current, ...next, path: candidatePath, legacy_read_only: false };
  }

  async function uniquePath(app, folder, title) {
    const base = safeName(title);
    let suffix = 1;
    let candidatePath = `${folder}/${base}.md`;
    while (app.vault.getAbstractFileByPath(candidatePath)) {
      suffix += 1;
      candidatePath = `${folder}/${base} ${suffix}.md`;
    }
    return candidatePath;
  }

  async function saveCandidate(app, input, options) {
    const request = options || {};
    const unit = input && input.promotion_unit;
    const suppliedReceipt = request.promotion_receipt || input && input.promotion_receipt;
    const now = stamp(request.now);
    let candidate;
    if (unit || suppliedReceipt) {
      if (!unit || !suppliedReceipt) throw lifecycleError("promotion_gap_packet_required");
      const contract = promotionContract();
      const receipt = contract.evaluatePromotion(unit);
      if (stableJson(receipt) !== stableJson(suppliedReceipt)) throw lifecycleError("invalid_promotion_packet");
      if (receipt.disposition === "canonical_review") {
        return Object.freeze({ disposition: "canonical_review", candidate: null, candidate_id: null, reused: true });
      }
      if (receipt.disposition !== "candidate") throw lifecycleError("candidate_promotion_gap_required");
      candidate = core().createCandidateFromPromotion({
        ...input, created: clean(input && input.created) || now, updated: request.updated || now,
      }, receipt);
    } else {
      candidate = core().createCandidate({ ...input, created: clean(input && input.created) || now, updated: request.updated || now });
    }
    const existing = await findCanonicalCandidateById(app, candidate.candidate_id);
    if (existing) return existing;
    const candidatePath = await uniquePath(app, CANDIDATE_DIR, candidate.title);
    await ensureFolder(app, CANDIDATE_DIR);
    const { promotion_unit, promotion_input_binding, promotion_receipt, ...candidateFields } = candidate;
    await app.vault.create(candidatePath, renderLifecycleCandidateDocument({
      ...candidateFields, schema_version: 2, ...(promotion_unit ? {
        promotion_input: promotion_unit, promotion_input_binding, promotion_receipt,
      } : {}), body: candidateBody(candidate),
    }));
    return { ...candidate, path: candidatePath, legacy_read_only: false };
  }

  const REVIEW_HANDOFF_VERSION = "llmwiki_candidate_review_handoff_v1";
  const REVIEW_HANDOFF_FIELDS = Object.freeze(["handoff_version", "candidate_id", "candidate_path", "candidate_binding"]);

  function reviewHandoffShape(value) {
    if (!plain(value) || Object.keys(value).length !== REVIEW_HANDOFF_FIELDS.length
      || REVIEW_HANDOFF_FIELDS.some((key) => !Object.hasOwn(value, key))
      || value.handoff_version !== REVIEW_HANDOFF_VERSION
      || !ID.test(value.candidate_id)
      || !isCanonicalCandidatePath(value.candidate_path)
      || typeof value.candidate_binding !== "string" || !value.candidate_binding || value.candidate_binding.length > MAX_STRUCTURED_BYTES) {
      throw lifecycleError("invalid_llmwiki_handoff");
    }
    return value;
  }

  function isCanonicalCandidatePath(value) {
    return typeof value === "string" && value.startsWith(`${CANDIDATE_DIR}/`) && value.endsWith(".md")
      && !value.slice(CANDIDATE_DIR.length + 1, -3).includes("/");
  }

  function reviewPacket(candidate, candidatePath) {
    const record = Object.fromEntries(Object.entries(candidate).filter(([key]) => !["body", "path", "legacy_read_only", "promotion_unit", "review_handoff"].includes(key)));
    const binding = stableJson({ candidate_path: candidatePath, candidate: record });
    return Object.freeze({ handoff_version: REVIEW_HANDOFF_VERSION, candidate_id: candidate.candidate_id, candidate_path: candidatePath, candidate_binding: binding });
  }

  function validatedReviewPacket(candidate, candidatePath, receipt) {
    reviewHandoffShape(receipt);
    const expected = reviewPacket(candidate, candidatePath);
    if (receipt.candidate_id !== expected.candidate_id || receipt.candidate_path !== expected.candidate_path || receipt.candidate_binding !== expected.candidate_binding) {
      throw lifecycleError("invalid_llmwiki_handoff");
    }
    return expected;
  }

  function llmWikiHandoff(options) {
    if (options && typeof options.llmWikiHandoff === "function") return options.llmWikiHandoff;
    const hub = root.KnowledgeExplorerHub || (typeof globalThis !== "undefined" && globalThis.KnowledgeExplorerHub);
    return hub && typeof hub.handoffCandidateToLlmWiki === "function" ? hub.handoffCandidateToLlmWiki.bind(hub) : null;
  }

  async function approveCandidate(app, candidatePath, _request, options) {
    requireCanonicalCandidatePath(candidatePath);
    const candidate = await readCandidate(app, candidatePath);
    requireMutableCandidate(candidate);
    if (candidate.status === "rejected" || candidate.status === "approved") throw new Error(`${candidate.status} candidates are terminal.`);
    if (candidate.status !== "saved") throw lifecycleError("candidate_review_unavailable");
    if (candidate.promotion_target || candidate.promoted_knowledge) throw lifecycleError("canonical_promotion_ownership_retired");
    if (candidate.review_handoff) {
      const receipt = validatedReviewPacket(candidate, candidatePath, candidate.review_handoff);
      return Object.freeze({ path: candidatePath, candidate, handoff: "llmwiki", receipt, reused: true });
    }
    const handoff = llmWikiHandoff(options);
    if (!handoff) throw lifecycleError("llmwiki_handoff_unavailable");
    const receipt = reviewPacket(candidate, candidatePath);
    const result = await handoff(candidate, receipt);
    if (!result || result.ok !== true || result.status !== "review") throw lifecycleError(`llmwiki_handoff_failed:${clean(result && result.reason) || "review_unavailable"}`);
    const persisted = await writeCandidate(app, candidatePath, candidate, { ...candidate, review_handoff: receipt });
    return Object.freeze({ path: candidatePath, candidate: persisted, handoff: "llmwiki", receipt, reused: false });
  }

  async function rejectCandidate(app, candidatePath, options) {
    requireCanonicalCandidatePath(candidatePath);
    const candidate = await readCandidate(app, candidatePath);
    requireMutableCandidate(candidate);
    const next = core().transitionCandidate({ ...candidate, updated: stamp(options && options.now) }, "rejected");
    return writeCandidate(app, candidatePath, candidate, next);
  }

  async function deferCandidate(app, candidatePath, options) {
    requireCanonicalCandidatePath(candidatePath);
    const candidate = await readCandidate(app, candidatePath);
    requireMutableCandidate(candidate);
    const next = core().transitionCandidate({ ...candidate, updated: stamp(options && options.now) }, "needs_more_evidence");
    return writeCandidate(app, candidatePath, candidate, next);
  }

  async function resumeCandidate(app, candidatePath, options) {
    requireCanonicalCandidatePath(candidatePath);
    const candidate = await readCandidate(app, candidatePath);
    requireMutableCandidate(candidate);
    const next = core().transitionCandidate({ ...candidate, updated: stamp(options && options.now) }, "saved");
    return writeCandidate(app, candidatePath, candidate, next);
  }

  const api = Object.freeze({
    CANDIDATE_DIR, LEGACY_CANDIDATE_DIRS, KNOWLEDGE_DIR,
    canonicalKnowledgeDirectory, canonicalKnowledgePath, isCanonicalKnowledgeTarget, canonicalDocumentIssue, renderCanonicalDocument,
    LIFECYCLE_FIELD_ORDER, validateStructuredBindings, validateLifecycleDocument,
    parseFrontmatter, parseLifecycleDocument, renderFleetingDocument, renderLifecycleCandidateDocument,
    isCanonicalCandidatePath, readCandidate, listCandidates, saveCandidate, approveCandidate, rejectCandidate, deferCandidate, resumeCandidate,
  });
  root.KnowledgeCandidateStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
