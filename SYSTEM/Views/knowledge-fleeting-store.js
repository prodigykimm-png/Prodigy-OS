(function (root) {
  "use strict";

  const FLEETING_DIR = "ZETA/FLEETING";
  const BLOCK_ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  const candidateStore = root.KnowledgeCandidateStore || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);

  function lifecycleError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (!value || typeof value !== "object") return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw lifecycleError("malformed_fleeting_date");
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateKey(value) {
    if (value instanceof Date) return localDateKey(value);
    const text = typeof value === "string" ? value : "";
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) throw lifecycleError("malformed_fleeting_date");
    const utc = new Date(`${text}T00:00:00.000Z`);
    const roundTrip = Number.isNaN(utc.getTime()) ? "" : `${String(utc.getUTCFullYear()).padStart(4, "0")}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
    if (roundTrip !== text) throw lifecycleError("malformed_fleeting_date");
    return text;
  }

  function fleetingPathFor(value) {
    return `${FLEETING_DIR}/${dateKey(value)}.md`;
  }

  function text(value) {
    if (typeof value !== "string" || !value.trim()) throw lifecycleError("fleeting_text_required");
    if (value.length > 8192) throw lifecycleError("fleeting_text_too_large");
    return value.trim();
  }

  function sources(value) {
    if (value === undefined) return [];
    if (!candidateStore || typeof candidateStore.validateStructuredBindings !== "function") throw lifecycleError("lifecycle_serializer_required");
    candidateStore.validateStructuredBindings({ sources: value });
    return value;
  }

  function stableBlockId(input) {
    const supplied = typeof input.block_id === "string" ? input.block_id.trim() : "";
    if (supplied) {
      if (!BLOCK_ID.test(supplied)) throw lifecycleError("stable_block_id_required");
      return supplied;
    }
    return `fleeting-${hash(stableJson({ date: input.date, text: input.text, sources: input.sources }))}`;
  }

  function normalizeThought(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw lifecycleError("malformed_fleeting_input");
    const date = dateKey(input.date === undefined ? input.now || new Date() : input.date);
    const body = text(input.text === undefined ? input.content : input.text);
    const sourceMaps = sources(input.sources);
    return Object.freeze({ block_id: stableBlockId({ ...input, date, text: body, sources: sourceMaps }), date, text: body, sources: sourceMaps });
  }

  function renderThoughtBlock(value) {
    const sourceMaps = value.sources.length ? `\n\n<!-- fleeting-sources: ${stableJson(value.sources)} -->` : "";
    return `<!-- fleeting-block-id: ${value.block_id} -->\n## 생각 저장\n\n${value.text}${sourceMaps}\n`;
  }

  function hasBlock(content, blockId) {
    return new RegExp(`<!-- fleeting-block-id: ${blockId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} -->`, "u").test(content);
  }

  async function ensureFolder(app) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") throw lifecycleError("vault_required");
    let current = "";
    for (const part of FLEETING_DIR.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        try { await app.vault.createFolder(current); }
        catch (error) { if (!app.vault.getAbstractFileByPath(current)) throw error; }
      }
    }
  }

  async function saveThought(app, input) {
    const thought = normalizeThought(input);
    const target = fleetingPathFor(thought.date);
    const existing = app && app.vault && app.vault.getAbstractFileByPath(target);
    if (existing) {
      const current = await app.vault.read(existing);
      if (hasBlock(current, thought.block_id)) return Object.freeze({ path: target, block_id: thought.block_id, reused: true });
      const separator = current && !current.endsWith("\n") ? "\n\n" : current ? "\n" : "";
      await app.vault.modify(existing, `${current}${separator}${renderThoughtBlock(thought)}`);
      return Object.freeze({ path: target, block_id: thought.block_id, reused: false });
    }
    await ensureFolder(app);
    const bytes = renderThoughtBlock(thought);
    try { await app.vault.create(target, bytes); }
    catch (error) {
      const raced = app.vault.getAbstractFileByPath(target);
      if (!raced) throw error;
      const current = await app.vault.read(raced);
      if (hasBlock(current, thought.block_id)) return Object.freeze({ path: target, block_id: thought.block_id, reused: true });
      const separator = current && !current.endsWith("\n") ? "\n\n" : current ? "\n" : "";
      await app.vault.modify(raced, `${current}${separator}${bytes}`);
    }
    return Object.freeze({ path: target, block_id: thought.block_id, reused: false });
  }

  const api = Object.freeze({ FLEETING_DIR, dateKey, fleetingPathFor, normalizeThought, renderThoughtBlock, saveThought });
  root.KnowledgeFleetingStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
