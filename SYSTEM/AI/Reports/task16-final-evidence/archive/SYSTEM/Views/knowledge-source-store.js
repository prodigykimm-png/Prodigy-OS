(function (root) {
  "use strict";

  const LITERATURE_DIR = "ZETA/LITERATURE";

  if (!root.KnowledgeAuthoringCore && typeof require === "function") require("./knowledge-authoring-core.js");
  if (!root.KnowledgeAuthoringValidation && typeof require === "function") require("./knowledge-authoring-validation.js");

  function core() {
    if (!root.KnowledgeAuthoringCore) throw new Error("Knowledge authoring core를 먼저 불러와야 합니다.");
    return root.KnowledgeAuthoringCore;
  }

  function validation() {
    if (!root.KnowledgeAuthoringValidation) throw new Error("Knowledge authoring validation을 먼저 불러와야 합니다.");
    return root.KnowledgeAuthoringValidation;
  }

  function stamp(value) { return value || new Date().toISOString(); }
  function scalar(value) { return JSON.stringify(value == null ? "" : String(value)); }
  function linkFor(entryPath) { return `[[${entryPath.replace(/\.md$/i, "")}]]`; }

  function safeFilename(value) {
    const name = String(value == null ? "" : value).trim().normalize("NFC")
      .replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (!name || name === "." || name === "..") throw new Error("안전한 자료 제목이 필요합니다.");
    return name;
  }

  function sourcePathFor(source) {
    return `${LITERATURE_DIR}/${safeFilename(source.source_title)}.md`;
  }

  function parseValue(value) {
    const text = value.trim();
    if (text === "[]") return [];
    if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
    return text;
  }

  function parseFrontmatter(content) {
    const match = String(content || "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) throw new Error("Literature frontmatter를 읽을 수 없습니다.");
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

  function renderFrontmatter(data, body) {
    const lines = ["---"];
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (!value.length) lines.push(`${key}: []`);
        else { lines.push(`${key}:`); value.forEach((item) => lines.push(`  - ${scalar(item)}`)); }
      } else lines.push(`${key}: ${scalar(value)}`);
    });
    return `${lines.join("\n")}\n---\n${body}`;
  }

  function optionalAiText(input, key) {
    return validation().optionalText(input && input[key], key);
  }

  function normalizeSourceInput(input) {
    const source = core().normalizeSourceInput(input);
    const aiSummary = source.summary_origin === "ai" ? optionalAiText(input, "ai_summary") : "";
    const aiUncertainty = source.summary_origin === "ai" ? optionalAiText(input, "ai_uncertainty") : "";
    return Object.freeze({ ...source, ai_summary: aiSummary, ai_uncertainty: aiUncertainty });
  }

  function sourceBody(source) {
    const lines = [
      `# ${source.source_title}`, "", "## 출처 주장", "", source.source_claim || "-", "",
      "## 내 해석", "", source.my_interpretation,
    ];
    if (source.summary_origin === "ai") {
      lines.push("", "## AI 요약", "", source.ai_summary || source.source_claim || "-");
      if (source.ai_uncertainty) lines.push("", `- 불확실성: ${source.ai_uncertainty}`);
    }
    lines.push("", "## 재사용 가능한 지식", "", source.reusable_knowledge || "-", "");
    return lines.join("\n");
  }

  function renderSourceDocument(source, options) {
    const now = stamp(options && options.now);
    return renderFrontmatter({
      type: "literature_note", status: "active", source_kind: source.source_kind, source_id: source.source_id,
      source_batch_id: source.source_batch_id, source_url: source.source_url, source_title: source.source_title,
      creator: source.creator, publisher: source.publisher, published_at: source.published_at,
      summary_origin: source.summary_origin, knowledge_domain: source.knowledge_domain,
      knowledge_topics: source.knowledge_topics, connections: source.connections, reference: "",
      tags: ["literature_note"], created: now, updated: now,
    }, sourceBody(source));
  }

  async function ensureFolder(app, folder) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    let current = "";
    for (const part of folder.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        try { await app.vault.createFolder(current); }
        catch (error) { if (!app.vault.getAbstractFileByPath(current)) throw error; }
      }
    }
  }

  function withoutTimestamps(content) {
    return String(content || "").replace(/^(?:created|updated):.*\n/gm, "");
  }

  async function ownedSource(app, target, source, expected) {
    const file = app.vault.getAbstractFileByPath(target);
    if (!file) return null;
    const existing = await app.vault.read(file);
    let parsed;
    try { parsed = parseFrontmatter(existing); }
    catch (_error) { throw new Error("기존 Literature Source와 충돌합니다."); }
    if (parsed.data.type !== "literature_note" || parsed.data.source_id !== source.source_id
      || withoutTimestamps(existing) !== withoutTimestamps(expected)) {
      throw new Error("기존 Literature Source가 다른 내용과 충돌합니다.");
    }
    return { file, content: existing };
  }

  function savedResult(path, source, reused) {
    return Object.freeze({ path, link: linkFor(path), source_id: source.source_id, source_batch_id: source.source_batch_id, reused: Boolean(reused) });
  }

  async function saveSource(app, input, options) {
    const source = normalizeSourceInput(input);
    const target = sourcePathFor(source);
    const expected = renderSourceDocument(source, options);
    if (await ownedSource(app, target, source, expected)) return savedResult(target, source, true);
    await ensureFolder(app, LITERATURE_DIR);
    try { await app.vault.create(target, expected); }
    catch (error) {
      if (await ownedSource(app, target, source, expected)) return savedResult(target, source, true);
      throw error;
    }
    return savedResult(target, source, false);
  }

  async function saveSources(app, inputs, options) {
    if (!Array.isArray(inputs)) throw new Error("자료 묶음은 배열이어야 합니다.");
    const result = [];
    for (let index = 0; index < inputs.length; index += 1) {
      try { result.push(await saveSource(app, inputs[index], options)); }
      catch (error) { throw new Error(`자료 ${index + 1} 저장 실패: ${error.message}`); }
    }
    return Object.freeze(result);
  }

  async function readSource(app, sourcePath) {
    const path = String(sourcePath || "").replace(/\\/g, "/");
    if (!path.startsWith(`${LITERATURE_DIR}/`) || path.includes("..")) throw new Error("Literature Source 경로가 필요합니다.");
    const file = app && app.vault && app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error("Literature Source 파일을 찾을 수 없습니다.");
    const parsed = parseFrontmatter(await app.vault.read(file));
    if (parsed.data.type && parsed.data.type !== "literature_note") throw new Error("Literature Source 파일이 아닙니다.");
    return Object.freeze({ ...parsed.data, path, link: linkFor(path), body: parsed.body, legacy: !parsed.data.source_id });
  }

  async function createOptionalCandidate(source, createCandidate) {
    if (!source || typeof source.link !== "string" || !source.link.startsWith(`[[${LITERATURE_DIR}/`)) throw new Error("저장된 Literature Source가 필요합니다.");
    if (typeof createCandidate !== "function") return Object.freeze({ source, source_link: source.link, candidate: null, candidate_error: null });
    const request = Object.freeze({ source, source_link: source.link });
    try { return Object.freeze({ source, source_link: source.link, candidate: await createCandidate(request), candidate_error: null }); }
    catch (error) { return Object.freeze({ source, source_link: source.link, candidate: null, candidate_error: error }); }
  }

  const api = Object.freeze({
    LITERATURE_DIR, safeFilename, sourcePathFor, parseFrontmatter, normalizeSourceInput, renderSourceDocument,
    readSource, saveSource, saveSources, createOptionalCandidate,
  });
  root.KnowledgeSourceStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
