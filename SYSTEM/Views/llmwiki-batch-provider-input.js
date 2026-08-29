(function (root) {
  "use strict";

  const MAX_CHUNKS_PER_PACK = 4;
  const MAX_PACK_BYTES = 24 * 1024;
  const SEMANTIC_MODE = "semantic";
  const SOURCE_ROUTING_MODE = "source_routing";
  const KEY = /^[a-z][a-z0-9_-]{2,127}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
  function utf8Bytes(value) { return new TextEncoder().encode(value).byteLength; }

  function mapTransportError(error) {
    const status = Number(error && error.status) || 0;
    if ((error && error.name) === "AbortError") return "provider_aborted";
    if (error && error.code === "MALFORMED_JSON") return "malformed_json";
    if (status === 429 || (error && error.code === "ANTIGRAVITY_QUOTA_EXHAUSTED")) return "provider_quota_exhausted";
    if ([401, 403].includes(status) || (error && error.code === "ANTIGRAVITY_AUTH_REQUIRED")) return "provider_auth_required";
    if (error && ["ETIMEDOUT", "OUTCOME_UNKNOWN"].includes(error.code)) return "provider_outcome_unknown";
    return "provider_unavailable";
  }

  function normalizeInput(input) {
    if (!plain(input)) return { reason: "input_invalid" };
    if (input.outbound_allowed !== true) return { reason: "outbound_consent_required" };
    if (!Array.isArray(input.chunks) || input.chunks.length === 0 || input.chunks.length > MAX_CHUNKS_PER_PACK) return { reason: "pack_shape_invalid" };
    const mode = input.mode === undefined ? SEMANTIC_MODE : input.mode;
    if (![SEMANTIC_MODE, SOURCE_ROUTING_MODE].includes(mode)) return { reason: "analysis_mode_invalid" };
    const chunksByKey = new Map();
    let sourceBytes = 0;
    for (const chunk of input.chunks) {
      const allowedChunkFields = mode === SOURCE_ROUTING_MODE ? ["key", "text", "source_hint"] : ["key", "text"];
      if (!plain(chunk) || Object.keys(chunk).some((key) => !allowedChunkFields.includes(key))) return { reason: "chunk_invalid" };
      const key = typeof chunk.key === "string" ? chunk.key : "";
      if (!KEY.test(key) || chunksByKey.has(key) || typeof chunk.text !== "string" || chunk.text.length === 0) return { reason: "chunk_invalid" };
      if (mode === SOURCE_ROUTING_MODE && (typeof chunk.source_hint !== "string" || !chunk.source_hint.startsWith("INBOX/")
        || !chunk.source_hint.endsWith(".md") || utf8Bytes(chunk.source_hint) > 512 || /[\u0000-\u001f\u007f]/u.test(chunk.source_hint))) return { reason: "source_hint_invalid" };
      sourceBytes += utf8Bytes(chunk.text);
      chunksByKey.set(key, Object.freeze({
        key,
        text: chunk.text,
        ...(mode === SOURCE_ROUTING_MODE ? { source_hint: chunk.source_hint } : {}),
      }));
    }
    if (sourceBytes > MAX_PACK_BYTES) return { reason: "pack_too_large" };
    const candidateIds = new Set(Array.isArray(input.candidate_ids) ? input.candidate_ids.filter((id) => typeof id === "string") : []);
    return { chunksByKey, candidateIds, mode };
  }

  const api = Object.freeze({ mapTransportError, normalizeInput });
  root.LLMWikiBatchProviderInput = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
