(function (root) {
  "use strict";

  const DEFAULT_MAX_BYTES = 2048;

  function create(value, options = {}) {
    const source = String(value || "");
    const maxBytes = Number.isSafeInteger(options.max_bytes) && options.max_bytes > 0 ? options.max_bytes : DEFAULT_MAX_BYTES;
    const candidates = [];
    const expression = /[^.!?。！？\n]+(?:[.!?。！？]+|(?=\n|$))/gu;
    for (const match of source.matchAll(expression)) {
      let start = match.index;
      let end = start + match[0].length;
      while (start < end && /\s/u.test(source[start])) start += 1;
      while (end > start && /\s/u.test(source[end - 1])) end -= 1;
      let cursor = start;
      while (cursor < end) {
        let sliceEnd = cursor;
        let bytes = 0;
        while (sliceEnd < end) {
          const code = source.charCodeAt(sliceEnd);
          const paired = code >= 0xd800 && code <= 0xdbff && source.charCodeAt(sliceEnd + 1) >= 0xdc00 && source.charCodeAt(sliceEnd + 1) <= 0xdfff;
          const width = paired ? 2 : 1;
          const cost = paired ? 4 : code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
          if (bytes + cost > maxBytes) break;
          bytes += cost;
          sliceEnd += width;
        }
        if (sliceEnd <= cursor) break;
        candidates.push(Object.freeze({ key: `evidence_${candidates.length + 1}`, text: source.slice(cursor, sliceEnd), start: cursor, end: sliceEnd }));
        cursor = sliceEnd;
        if (candidates.length >= 999) return Object.freeze(candidates);
      }
    }
    if (candidates.length === 0 && source.trim()) {
      const start = source.indexOf(source.trim());
      const text = source.trim();
      candidates.push(Object.freeze({ key: "evidence_1", text, start, end: start + text.length }));
    }
    return Object.freeze(candidates);
  }

  const api = Object.freeze({ DEFAULT_MAX_BYTES, create });
  root.LLMWikiEvidenceCandidates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
