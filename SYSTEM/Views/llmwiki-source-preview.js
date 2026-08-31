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
  function normalizedWhitespaceMatches(sourceText, quote) {
    const parts = quote.split(/\s+/u).filter(Boolean);
    if (parts.length < 2) return [];
    const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
    const matcher = new RegExp(escaped.join("\\s+"), "gu");
    const matches = [];
    for (const match of sourceText.matchAll(matcher)) {
      matches.push(Object.freeze({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      }));
    }
    return matches;
  }
  function normalizedWhitespace(value) {
    return trim(value).replace(/\s+/gu, " ");
  }
  function verifiedGlobalMatches(citation, path, sourceText, quote, current) {
    if (!current || !quote) return [];
    const matches = new Map();
    for (const locator of Array.isArray(citation?.locators) ? citation.locators : []) {
      const value = trim(locator);
      const marker = value.lastIndexOf("#");
      if (marker < 0 || locatorPath(value) !== path) continue;
      const range = /^(\d+)-(\d+)$/u.exec(value.slice(marker + 1));
      if (!range) continue;
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start < 0 || end <= start || end > sourceText.length) continue;
      const actual = sourceText.slice(start, end);
      if (actual !== quote && normalizedWhitespace(actual) !== normalizedWhitespace(quote)) continue;
      matches.set(`${start}:${end}`, Object.freeze({ start, end, text: actual }));
    }
    return [...matches.values()];
  }
  function resolvePreview({ citation, source_text: sourceText }) {
    const path = sourcePath(citation);
    if (!path) return Object.freeze({ ok: false, reason: "SOURCE_PREVIEW_PATH_REQUIRED" });
    const text = typeof sourceText === "string" ? sourceText : "";
    const quote = trim(citation?.evidence_quote);
    const expectedHash = trim(citation?.content_hash);
    const actualHash = sha256(text);
    const status = expectedHash && expectedHash === actualHash ? "current" : "stale";
    let matches = verifiedGlobalMatches(citation, path, text, quote, status === "current");
    let matchMode = matches.length ? "global_span" : "exact";
    if (quote && matches.length === 0) {
      let offset = 0;
      while (offset <= text.length) {
        const index = text.indexOf(quote, offset);
        if (index < 0) break;
        matches.push(Object.freeze({ start: index, end: index + quote.length, text: quote }));
        offset = index + Math.max(1, quote.length);
      }
      if (matches.length === 0) {
        matches = normalizedWhitespaceMatches(text, quote);
        if (matches.length > 0) matchMode = "normalized_whitespace";
      }
    }
    const matchStatus = matches.length === 1 ? "unique" : matches.length > 1 ? "ambiguous" : "missing";
    const uniqueMatch = matchStatus === "unique" ? matches[0] : null;
    return Object.freeze({
      ok: true,
      status,
      match_status: matchStatus,
      match_mode: matchMode,
      match_count: matches.length,
      source_path: path,
      evidence_quote: uniqueMatch ? uniqueMatch.text : quote,
      context: uniqueMatch ? contextAround(text, uniqueMatch.start, uniqueMatch.end - uniqueMatch.start) : "",
      position: uniqueMatch && status === "current" ? positionAt(text, uniqueMatch.start) : null,
      expected_hash: expectedHash,
      actual_hash: actualHash,
      locator: (Array.isArray(citation?.locators) ? citation.locators : []).find((value) => locatorPath(value) === path) || path,
    });
  }

  const api = Object.freeze({ sha256, locatorPath, sourcePath, positionAt, resolvePreview });
  root.LLMWikiSourcePreview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
