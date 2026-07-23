(function (root) {
  "use strict";

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

  function normalizeCandidate(data, path) {
    const candidateCore = core();
    let normalized;
    try { normalized = candidateCore.validateCandidate(data); }
    catch (_error) {
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
    const approvalNote = candidate.approval_note || "-";
    return `# ${candidate.title}\n\n## 지식 문장\n\n${candidate.statement}\n\n## 제안 이유\n\n${candidate.reason}\n\n## 출처 메모\n\n${sourceNote}\n\n## 적용 조건\n\n${trigger}\n\n${contexts}\n\n## 승인 메모\n\n${approvalNote}\n`;
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
      approval_note: clean(request.approval_note || candidate.approval_note),
    };
  }

  function knowledgeDocument(input, candidate, candidatePath, now) {
    return renderFrontmatter({
      type: "knowledge", title: input.title, knowledge_domain: input.knowledge_domain, knowledge_topics: input.knowledge_topics,
      application_trigger: input.application_trigger, application_contexts: input.application_contexts,
      statement: input.statement, connections: [linkFor(candidatePath)], summary: "", created: now, updated: now,
    }, candidate.body).replace(/^type: "knowledge"$/m, "type: knowledge");
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
    const targetCandidate = { ...candidate, approval_note: input.approval_note, updated: now };
    const targeted = candidate.promotion_target ? targetCandidate : core().setPromotionTarget(targetCandidate, target);
    const persisted = candidate.status === "approved" || (candidate.promotion_target && candidate.approval_note === input.approval_note)
      ? candidate
      : await writeCandidate(app, candidatePath, candidate, targeted);
    const knowledge = await ownedKnowledge(app, target, candidatePath);
    const document = knowledgeDocument(input, candidate, candidatePath, now);
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

  const api = Object.freeze({ CANDIDATE_DIR, LEGACY_CANDIDATE_DIRS, KNOWLEDGE_DIR, parseFrontmatter, readCandidate, listCandidates, saveCandidate, approveCandidate, rejectCandidate, deferCandidate, resumeCandidate });
  root.KnowledgeCandidateStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
