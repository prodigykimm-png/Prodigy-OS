(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const SCOPE_VERSION = "llmwiki_analysis_scope_v1";
  const SOURCE_ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const CONTENT_HASH = /^[0-9a-f]{64}$/u;

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function fail(reason) { return Object.freeze({ ok: false, reason }); }
  function validPath(value) {
    return typeof value === "string" && (value.startsWith("INBOX/") || value.startsWith("ZETA/FLEETING/")) && !value.includes("\\")
      && !value.split("/").some(part => !part || part === "." || part === "..");
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function validateScope(scope) {
    if (!scope || typeof scope !== "object" || scope.scope_version !== SCOPE_VERSION
      || !SOURCE_ID.test(scope.source_id) || !validPath(scope.source_path) || !CONTENT_HASH.test(scope.content_hash)
      || !Number.isSafeInteger(scope.start) || !Number.isSafeInteger(scope.end) || scope.start < 0 || scope.end < scope.start
      || typeof scope.text !== "string" || scope.text.length !== scope.end - scope.start
      || !CONTENT_HASH.test(scope.text_hash) || scope.text_hash !== hashApi.sha256(scope.text)) return fail("invalid_analysis_scope");
    const expected = `scope_${hashApi.sha256(stable({ source_id: scope.source_id, source_path: scope.source_path, content_hash: scope.content_hash, start: scope.start, end: scope.end })).slice(0, 24)}`;
    if (scope.scope_id !== expected) return fail("invalid_analysis_scope_identity");
    return Object.freeze({ ok: true, value: scope });
  }
  function createAnalysisScope(input) {
    if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("hash_unavailable");
    const sourceId = typeof input?.source_id === "string" ? input.source_id.trim() : "";
    const sourcePath = typeof input?.source_path === "string" ? input.source_path.trim() : "";
    const contentHash = typeof input?.content_hash === "string" ? input.content_hash.trim() : "";
    const sourceText = typeof input?.source_text === "string" ? input.source_text : "";
    if (!SOURCE_ID.test(sourceId) || !validPath(sourcePath) || !CONTENT_HASH.test(contentHash) || hashApi.sha256(sourceText) !== contentHash) throw new TypeError("invalid_analysis_scope");
    const selection = input.selection;
    const start = selection === undefined ? 0 : selection?.start;
    const end = selection === undefined ? sourceText.length : selection?.end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > sourceText.length
      || (start > 0 && sourceText.charCodeAt(start - 1) >= 0xd800 && sourceText.charCodeAt(start - 1) <= 0xdbff && sourceText.charCodeAt(start) >= 0xdc00 && sourceText.charCodeAt(start) <= 0xdfff)
      || (end < sourceText.length && sourceText.charCodeAt(end - 1) >= 0xd800 && sourceText.charCodeAt(end - 1) <= 0xdbff && sourceText.charCodeAt(end) >= 0xdc00 && sourceText.charCodeAt(end) <= 0xdfff)) throw new TypeError("invalid_analysis_selection");
    const text = sourceText.slice(start, end);
    return freeze({
      scope_version: SCOPE_VERSION,
      scope_id: `scope_${hashApi.sha256(stable({ source_id: sourceId, source_path: sourcePath, content_hash: contentHash, start, end })).slice(0, 24)}`,
      source_id: sourceId, source_path: sourcePath, content_hash: contentHash, start, end, text, text_hash: hashApi.sha256(text),
    });
  }
  function createAnalysisRequestAuthority() {
    const issued = new WeakSet();
    const current = new Map();
    function begin(scope) {
      const valid = validateScope(scope);
      if (!valid.ok) throw new TypeError(valid.reason);
      const prior = current.get(scope.source_id);
      const request = Object.freeze({ source_id: scope.source_id, scope_id: scope.scope_id, generation: (prior?.generation || 0) + 1 });
      issued.add(request);
      current.set(scope.source_id, { ...request, cancelled: false });
      return request;
    }
    function cancel(request) {
      if (!issued.has(request)) return false;
      const active = current.get(request.source_id);
      if (!active || active.generation !== request.generation || active.scope_id !== request.scope_id) return false;
      active.cancelled = true;
      return true;
    }
    function isActive(request) {
      if (!issued.has(request)) return false;
      const active = current.get(request.source_id);
      return Boolean(active) && !active.cancelled && active.generation === request.generation && active.scope_id === request.scope_id;
    }
    return Object.freeze({ begin, cancel, isActive });
  }
  function serializableScope(scope) {
    const valid = validateScope(scope);
    if (!valid.ok) throw new TypeError(valid.reason);
    const { text: _text, ...stored } = scope;
    return freeze(stored);
  }

  const api = Object.freeze({ SCOPE_VERSION, createAnalysisScope, createAnalysisRequestAuthority, validateAnalysisScope: validateScope, serializableScope });
  root.LLMWikiAnalysisScope = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
