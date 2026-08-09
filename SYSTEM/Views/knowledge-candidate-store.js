(function (root) {
  "use strict";

  // allow: SIZE_OK — this IIFE is the frozen Candidate storage/promotion authority; splitting canonical serialization would create competing ownership.

  const CANDIDATE_DIR = "PARA/RESOURCES/Knowledge/Candidates";
  const LEGACY_CANDIDATE_DIRS = Object.freeze(["PARA/RESOURCES/Reading/Candidates", "ZETA/FLEETING/Knowledge Candidates"]);
  const KNOWLEDGE_DIR = "ZETA/PERMANENT";

  if (!root.KnowledgeCandidateCore && typeof require === "function") require("./knowledge-candidate-core.js");
  if (!root.EvidenceQualityCore && typeof require === "function") root.EvidenceQualityCore = require("./evidence-quality-core.js");

  function core() {
    if (!root.KnowledgeCandidateCore) throw new Error("Knowledge Candidate core를 먼저 불러와야 합니다.");
    return root.KnowledgeCandidateCore;
  }

  function clean(value) { return typeof value === "string" ? value.trim() : ""; }
  function stamp(value) { return value || new Date().toISOString(); }
  function linkFor(path) { return `[[${path.replace(/\.md$/i, "")}]]`; }
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
    if (!value.startsWith(`${CANDIDATE_DIR}/`)) throw new Error("레거시 Knowledge Candidate는 읽기 전용입니다.");
  }
  function safeName(value) {
    const name = clean(value).replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ");
    if (!name || name === "." || name === "..") throw new Error("안전한 제목이 필요합니다.");
    return name;
  }

  function parseValue(value) {
    const text = value.trim();
    if (text === "[]") return [];
    if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
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

  function renderCanonicalDocument(value) {
    const issue = canonicalDocumentIssue(value);
    if (issue) {
      const error = new Error(issue.reason);
      error.code = issue.reason;
      throw error;
    }
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
    const parsed = parseFrontmatter(await app.vault.read(file));
    if (parsed.data.type && parsed.data.type !== "knowledge_candidate") throw new Error("Knowledge Candidate 파일이 아닙니다.");
    if (!parsed.data.type && !isLegacyPath(file.path)) throw new Error("Knowledge Candidate 파일이 아닙니다.");
    return { ...normalizeCandidate({ ...parsed.data, type: "knowledge_candidate" }, file.path), body: parsed.body };
  }

  async function listCandidates(app, options) {
    const request = options || {};
    const result = [];
    for (const file of await filesIn(app, [CANDIDATE_DIR, ...LEGACY_CANDIDATE_DIRS])) {
      try {
        const candidate = await readCandidate(app, file.path);
        if (request.status === "active" && !core().isActive(candidate)) continue;
        if (request.status && request.status !== "all" && request.status !== "active" && candidate.status !== request.status) continue;
        result.push(candidate);
      } catch (_error) { /* malformed legacy data remains untouched and excluded */ }
    }
    return result.sort((left, right) => String(right.created).localeCompare(String(left.created)) || left.path.localeCompare(right.path));
  }

  async function writeCandidate(app, candidatePath, current, next) {
    requireCanonicalCandidatePath(candidatePath);
    const file = app.vault.getAbstractFileByPath(candidatePath);
    const parsed = parseFrontmatter(await app.vault.read(file));
    const content = renderFrontmatter({ ...parsed.data, ...next }, parsed.body);
    await app.vault.modify(file, content);
    return { ...current, ...next, path: candidatePath };
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
    const now = stamp(options && options.now);
    const candidate = core().createCandidate({ ...input, created: clean(input && input.created) || now, updated: now });
    const existing = await findCanonicalCandidateById(app, candidate.candidate_id);
    if (existing) return existing;
    const candidatePath = await uniquePath(app, CANDIDATE_DIR, candidate.title);
    await ensureFolder(app, CANDIDATE_DIR);
    await app.vault.create(candidatePath, renderFrontmatter(candidate, candidateBody(candidate)));
    return { ...candidate, path: candidatePath };
  }

  function promotionInput(value, candidate) {
    const request = value || {};
    const title = safeName(request.title || candidate.title);
    const statement = clean(request.statement || candidate.statement);
    const domain = clean(request.knowledge_domain || candidate.suggested_domain);
    const topics = Array.isArray(request.knowledge_topics) ? request.knowledge_topics.map(clean).filter(Boolean) : [];
    const registeredTopics = core().TOPICS[domain];
    if (!statement || !core().DOMAINS.includes(domain) || !Array.isArray(registeredTopics)
      || (registeredTopics.length && !topics.length) || (!registeredTopics.length && topics.length)
      || topics.some((topic) => !registeredTopics.includes(topic))) {
      throw new Error("Knowledge 제목, 문장, Domain, Topics를 확인해 주세요.");
    }
    if (request.evidence_quality && root.EvidenceQualityCore) {
      const eligibility = root.EvidenceQualityCore.checkPromotionEligibility(request.evidence_quality, { override: request.thin_override, approval_note: request.approval_note });
      if (!eligibility.allowed) throw new Error(eligibility.reasons.join(" "));
    }
    return {
      title, statement, knowledge_domain: domain, knowledge_topics: [...new Set(topics)],
      application_trigger: candidate.application_trigger, application_contexts: candidate.application_contexts,
      connections: candidate.connections, invalidation_conditions: candidate.invalidation_conditions,
      approval_note: clean(request.approval_note || candidate.approval_note),
    };
  }

  function knowledgeDocument(context) {
    const { input, candidate, candidatePath, now } = context;
    return renderCanonicalDocument({
      ...input, connections: [...new Set([linkFor(candidatePath), ...(input.connections || [])])],
      summary: "", created: now, updated: now, body: candidate.body,
    });
  }

  async function ownedKnowledge(app, target, candidatePath) {
    const file = app.vault.getAbstractFileByPath(target);
    if (!file) return null;
    const parsed = parseFrontmatter(await app.vault.read(file)).data;
    if (parsed.type !== "knowledge" || !Array.isArray(parsed.connections) || !parsed.connections.includes(linkFor(candidatePath))) {
      throw new Error("기존 Knowledge 대상이 다른 Candidate에 속합니다.");
    }
    return file;
  }

  async function approveCandidate(app, candidatePath, request, options) {
    requireCanonicalCandidatePath(candidatePath);
    const now = stamp(options && options.now);
    const candidate = await readCandidate(app, candidatePath);
    if (candidate.status === "rejected") throw new Error("rejected candidates are terminal.");
    const input = promotionInput(request, candidate);
    const target = candidate.promotion_target || await uniquePath(app, KNOWLEDGE_DIR, input.title);
    if (!isCanonicalKnowledgeTarget(target)) throw new Error("canonical_target_required");
    const targetCandidate = { ...candidate, approval_note: input.approval_note, updated: now };
    const targeted = candidate.promotion_target ? targetCandidate : core().setPromotionTarget(targetCandidate, target);
    const persisted = candidate.status === "approved" || (candidate.promotion_target && candidate.approval_note === input.approval_note)
      ? candidate
      : await writeCandidate(app, candidatePath, candidate, targeted);
    const knowledge = await ownedKnowledge(app, target, candidatePath);
    const document = knowledgeDocument({ input, candidate, candidatePath, now });
    if (!knowledge) {
      await ensureFolder(app, KNOWLEDGE_DIR);
      await app.vault.create(target, document);
    } else if (candidate.status !== "approved" && await app.vault.read(knowledge) !== document) {
      await app.vault.modify(knowledge, document);
    }
    const finalized = core().finalizePromotion({ ...persisted, updated: now }, linkFor(target));
    if (persisted.status !== "approved") await writeCandidate(app, candidatePath, persisted, finalized);
    return { path: target, candidate: { ...finalized, path: candidatePath } };
  }

  async function rejectCandidate(app, candidatePath, options) {
    requireCanonicalCandidatePath(candidatePath);
    const candidate = await readCandidate(app, candidatePath);
    const next = core().transitionCandidate({ ...candidate, updated: stamp(options && options.now) }, "rejected");
    return writeCandidate(app, candidatePath, candidate, next);
  }

  async function deferCandidate(app, candidatePath, options) {
    requireCanonicalCandidatePath(candidatePath);
    const candidate = await readCandidate(app, candidatePath);
    const next = core().transitionCandidate({ ...candidate, updated: stamp(options && options.now) }, "needs_more_evidence");
    return writeCandidate(app, candidatePath, candidate, next);
  }

  async function resumeCandidate(app, candidatePath, options) {
    requireCanonicalCandidatePath(candidatePath);
    const candidate = await readCandidate(app, candidatePath);
    const next = core().transitionCandidate({ ...candidate, updated: stamp(options && options.now) }, "saved");
    return writeCandidate(app, candidatePath, candidate, next);
  }

  const api = Object.freeze({
    CANDIDATE_DIR, LEGACY_CANDIDATE_DIRS, KNOWLEDGE_DIR,
    canonicalKnowledgeDirectory, canonicalKnowledgePath, isCanonicalKnowledgeTarget, canonicalDocumentIssue, renderCanonicalDocument,
    parseFrontmatter, readCandidate, listCandidates, saveCandidate, approveCandidate, rejectCandidate, deferCandidate, resumeCandidate,
  });
  root.KnowledgeCandidateStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
