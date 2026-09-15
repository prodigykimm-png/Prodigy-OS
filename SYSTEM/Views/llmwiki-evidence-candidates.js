(function (root) {
  "use strict";

  const VERSION = "llmwiki_evidence_candidates_v3";
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

  function createSemantic(value, options = {}) {
    const source = String(value || "");
    const maxBytes = Number.isSafeInteger(options.max_bytes) && options.max_bytes > 0 ? options.max_bytes : DEFAULT_MAX_BYTES;
    const result = [];
    let frontmatter = false;
    const isTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
    const appendBody = (rawBody, rawStart) => {
      let first = 0, last = rawBody.length;
      while (first < last && /\s/u.test(rawBody[first])) first += 1;
      while (last > first && /\s/u.test(rawBody[last - 1])) last -= 1;
      const body = rawBody.slice(first, last);
      const bodyStart = rawStart + first;
      let cursor = 0;
      while (cursor < body.length) {
        let end = cursor, bytes = 0;
        while (end < body.length) {
          const code = body.charCodeAt(end); const paired = code >= 0xd800 && code <= 0xdbff && body.charCodeAt(end + 1) >= 0xdc00 && body.charCodeAt(end + 1) <= 0xdfff;
          const width = paired ? 2 : 1; const cost = paired ? 4 : code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
          if (bytes + cost > maxBytes) break; bytes += cost; end += width;
        }
        if (end <= cursor) break;
        result.push(Object.freeze({ key: `evidence_${result.length + 1}`, text: body.slice(cursor, end), start: bodyStart + cursor, end: bodyStart + end }));
        cursor = end;
      }
    };
    for (const match of source.matchAll(/[^\n]*(?:\n|$)/gu)) {
      const line = match[0].replace(/\n$/u, "").replace(/\r$/u, "");
      const lineStart = match.index;
      const nextLine = source.slice(lineStart + match[0].length).split(/\r?\n/u, 1)[0];
      if (line.trim() === "---" && (lineStart === 0 || frontmatter)) { frontmatter = !frontmatter; continue; }
      if (frontmatter || /^\s*#/u.test(line) || !line.trim()) continue;
      if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/u.test(line)) continue;
      if (/^\s*(?:`{3,}|~{3,})/u.test(line)) continue;
      if (isTableSeparator(line) || /^\s*\|.*\|\s*$/u.test(line) && isTableSeparator(nextLine)) continue;
      if (/^\s*>+\s*$/u.test(line)
        || /^\s*>+\s*\[![A-Z0-9_-]+\](?:\s*[+-])?(?:\s+.*)?$/iu.test(line)
        || /^\s*>*\s*!\[\[[^\]]+\]\]\s*$/u.test(line)
        || /^\s*>*\s*!\[[^\]]*\]\([^)]+\)\s*$/u.test(line)) continue;
      const list = line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(.*)$/u);
      const body = list ? list[2] : line.trim();
      if (!body || (!list && /^\s*(?:[-+*]|\d+[.)])\s*$/u.test(line))) continue;
      const bodyStart = lineStart + line.indexOf(body);
      let segmentStart = 0;
      for (const embed of body.matchAll(/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/gu)) {
        appendBody(body.slice(segmentStart, embed.index), bodyStart + segmentStart);
        segmentStart = embed.index + embed[0].length;
      }
      appendBody(body.slice(segmentStart), bodyStart + segmentStart);
    }
    return Object.freeze(result);
  }

  const api = Object.freeze({ VERSION, DEFAULT_MAX_BYTES, create, createSemantic });
  root.LLMWikiEvidenceCandidates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
