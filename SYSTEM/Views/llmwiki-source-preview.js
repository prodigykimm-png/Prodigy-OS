(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function sha256(value) {
    if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWIKI_HASH_REQUIRED");
    return hashApi.sha256(String(value ?? ""));
  }
  function locatorPath(locator) {
    const value = trim(locator);
    if (!value || /^https?:\/\//iu.test(value)) return "";
    const sourcePath = value.split("#", 1)[0].normalize("NFC");
    return /\.md$/iu.test(sourcePath) ? sourcePath : "";
  }
  function sourcePath(citation) {
    const direct = trim(citation?.source_path).normalize("NFC");
    if (direct && /\.md$/iu.test(direct)) return direct;
    for (const locator of Array.isArray(citation?.locators) ? citation.locators : []) {
      const parsed = locatorPath(locator);
      if (parsed) return parsed;
    }
    return "";
  }
  function contextAround(sourceText, start, quoteLength) {
    const before = sourceText.slice(0, start).split(/\r?\n/u);
    const matchedAndAfter = sourceText.slice(start + quoteLength).split(/\r?\n/u);
    const quoteLines = sourceText.slice(start, start + quoteLength).split(/\r?\n/u);
    return [...before.slice(-2), ...quoteLines, ...matchedAndAfter.slice(0, 2)].join("\n").trim();
  }
  function positionAt(sourceText, index) {
    const before = sourceText.slice(0, index);
    const lines = before.split(/\r?\n/u);
    return Object.freeze({ line: lines.length - 1, ch: lines[lines.length - 1].length });
  }
  function resolvePreview({ citation, source_text: sourceText }) {
    const path = sourcePath(citation);
    if (!path) return Object.freeze({ ok: false, reason: "SOURCE_PREVIEW_PATH_REQUIRED" });
    const text = typeof sourceText === "string" ? sourceText : "";
    const quote = trim(citation?.evidence_quote);
    const expectedHash = trim(citation?.content_hash);
    const actualHash = sha256(text);
    const status = expectedHash && expectedHash === actualHash ? "current" : "stale";
    const matches = [];
    if (quote) {
      let offset = 0;
      while (offset <= text.length) {
        const index = text.indexOf(quote, offset);
        if (index < 0) break;
        matches.push(index);
        offset = index + Math.max(1, quote.length);
      }
    }
    const matchStatus = matches.length === 1 ? "unique" : matches.length > 1 ? "ambiguous" : "missing";
    return Object.freeze({
      ok: true,
      status,
      match_status: matchStatus,
      match_count: matches.length,
      source_path: path,
      evidence_quote: quote,
      context: matchStatus === "unique" ? contextAround(text, matches[0], quote.length) : "",
      position: matchStatus === "unique" ? positionAt(text, matches[0]) : null,
      expected_hash: expectedHash,
      actual_hash: actualHash,
      locator: (Array.isArray(citation?.locators) ? citation.locators : []).find((value) => locatorPath(value) === path) || path,
    });
  }

  const api = Object.freeze({ sha256, locatorPath, sourcePath, positionAt, resolvePreview });
  root.LLMWikiSourcePreview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
