(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const scopeApi = root.LLMWikiAnalysisScope || (typeof require === "function" ? require("./llmwiki-analysis-scope.js") : null);
  const MANIFEST_VERSION = "llmwiki_chunk_manifest_v1";
  const DEFAULT_MAX_BYTES = 12 * 1024;

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function fail(reason) { return Object.freeze({ ok: false, reason }); }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function byteLength(text) { return hashApi.utf8ByteLength(text); }
  function safeEnd(text, start, limit) {
    let end = Math.min(text.length, Math.max(start + 1, limit));
    if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end -= 1;
    return end;
  }
  function sliceEnd(text, start, maxBytes) {
    let end = start;
    while (end < text.length) {
      let next = end + 1;
      if (text.charCodeAt(end) >= 0xd800 && text.charCodeAt(end) <= 0xdbff && text.charCodeAt(end + 1) >= 0xdc00 && text.charCodeAt(end + 1) <= 0xdfff) next += 1;
      if (byteLength(text.slice(start, next)) > maxBytes) break;
      end = next;
    }
    return safeEnd(text, start, end);
  }
  function lastBoundary(text, start, end, kind) {
    const section = text.slice(start, end);
    const expression = kind === "heading" ? /(?:^|\n)#{1,6}[ \t]+[^\n]+/gu
      : kind === "paragraph" ? /\n[ \t]*\n/gu
        : kind === "sentence" ? /[.!?](?:[ \t]+|\n|$)/gu
          : /\n/gu;
    for (const match of section.matchAll(expression)) {
      let boundary;
      if (kind === "heading") boundary = start + match.index + (match[0].startsWith("\n") ? 1 : 0);
      else boundary = start + match.index + match[0].length;
      if (boundary > start && boundary <= end) return boundary;
    }
    return -1;
  }
  function nextChunk(text, start, maxBytes) {
    const limit = sliceEnd(text, start, maxBytes);
    const heading = lastBoundary(text, start, limit, "heading");
    if (heading > start) return { end: heading, boundary_kind: "heading" };
    if (limit === text.length) return { end: text.length, boundary_kind: "complete" };
    for (const kind of ["paragraph", "sentence", "line"]) {
      const boundary = lastBoundary(text, start, limit, kind);
      if (boundary > start) return { end: boundary, boundary_kind: kind };
    }
    return { end: limit, boundary_kind: "slice" };
  }
  function assertExactCoverage(manifest, scope) {
    const chunks = manifest?.chunks;
    if (!Array.isArray(chunks) || chunks.length === 0) throw new TypeError("malformed_chunk_manifest");
    const start = scope ? scope.start : manifest.start;
    const end = scope ? scope.end : manifest.end;
    let expected = start;
    for (const chunk of chunks) {
      if (!Number.isSafeInteger(chunk?.start) || !Number.isSafeInteger(chunk?.end) || chunk.start >= chunk.end) throw new TypeError("malformed_chunk_span");
      if (chunk.start < expected) throw new TypeError("overlap_in_chunk_coverage");
      if (chunk.start > expected) throw new TypeError("gap_in_chunk_coverage");
      expected = chunk.end;
    }
    if (expected < end) throw new TypeError("gap_in_chunk_coverage");
    if (expected > end) throw new TypeError("overlap_in_chunk_coverage");
    return true;
  }
  function createChunkManifest(scope, options = {}) {
    const valid = scopeApi?.validateAnalysisScope(scope);
    if (!valid?.ok) throw new TypeError(valid?.reason || "invalid_analysis_scope");
    const maxBytes = Number.isSafeInteger(options.max_bytes) && options.max_bytes > 0 ? Math.min(options.max_bytes, DEFAULT_MAX_BYTES) : DEFAULT_MAX_BYTES;
    if (maxBytes < 4) throw new TypeError("invalid_chunk_size");
    const chunks = [];
    const occurrences = new Map();
    let localStart = 0;
    while (localStart < scope.text.length) {
      const next = nextChunk(scope.text, localStart, maxBytes);
      if (next.end <= localStart || byteLength(scope.text.slice(localStart, next.end)) > maxBytes) throw new TypeError("invalid_chunk_boundary");
      const text = scope.text.slice(localStart, next.end);
      const semanticId = `semantic_${hashApi.sha256(text.trim().normalize("NFC")).slice(0, 24)}`;
      const occurrence = (occurrences.get(semanticId) || 0) + 1;
      occurrences.set(semanticId, occurrence);
      const textHash = hashApi.sha256(text);
      chunks.push(freeze({
        semantic_id: semanticId,
        instance_id: `instance_${hashApi.sha256(stable({ semantic_id: semanticId, occurrence, text_hash: textHash })).slice(0, 24)}`,
        occurrence, start: scope.start + localStart, end: scope.start + next.end, text, text_hash: textHash, boundary_kind: next.boundary_kind,
      }));
      localStart = next.end;
    }
    const body = { scope_id: scope.scope_id, max_bytes: maxBytes, chunks: chunks.map(chunk => ({ semantic_id: chunk.semantic_id, instance_id: chunk.instance_id, start: chunk.start, end: chunk.end, text_hash: chunk.text_hash })) };
    const manifest = freeze({
      manifest_version: MANIFEST_VERSION, manifest_id: `manifest_${hashApi.sha256(stable(body)).slice(0, 24)}`,
      scope_id: scope.scope_id, source_id: scope.source_id, source_path: scope.source_path, content_hash: scope.content_hash,
      start: scope.start, end: scope.end, max_bytes: maxBytes, chunks,
    });
    assertExactCoverage(manifest, scope);
    return manifest;
  }
  function validateChunkManifest(manifest, scope) {
    try {
      const validScope = scopeApi?.validateAnalysisScope(scope);
      if (!validScope?.ok || !manifest || manifest.manifest_version !== MANIFEST_VERSION || !Number.isSafeInteger(manifest.max_bytes)
        || manifest.max_bytes < 4 || manifest.max_bytes > DEFAULT_MAX_BYTES) return fail("invalid_chunk_manifest");
      const expected = createChunkManifest(scope, { max_bytes: manifest.max_bytes });
      if (stable(manifest) !== stable(expected)) return fail("invalid_chunk_manifest");
      return Object.freeze({ ok: true, value: manifest });
    } catch (error) { return fail(error.message); }
  }
  function serializableManifest(manifest, scope) {
    const valid = validateChunkManifest(manifest, scope);
    if (!valid.ok) throw new TypeError(valid.reason);
    return freeze({ ...manifest, chunks: manifest.chunks.map(({ text: _text, ...chunk }) => chunk) });
  }

  const api = Object.freeze({ MANIFEST_VERSION, DEFAULT_MAX_BYTES, createChunkManifest, validateChunkManifest, assertExactCoverage, serializableManifest });
  root.LLMWikiChunkManifest = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
