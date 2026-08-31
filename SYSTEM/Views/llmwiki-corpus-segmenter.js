(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const VERSION = "llmwiki_corpus_segmenter_v1";
  const HEADING = /^##\s+(.+?)\s*$/gmu;
  const ARTICLE_META = /^(?:글번호|작성자|날짜)\s*:/mu;

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  function sha(value) { return hashApi.sha256(String(value)); }
  function fail(reason) { return freeze({ ok: false, reason }); }
  function headingRows(text) {
    return [...text.matchAll(HEADING)].map((match) => ({ start: match.index, title: clean(match[1]) }));
  }
  function articleRows(text, headings) {
    const rows = headings.filter((heading, index) => {
      const end = headings[index + 1]?.start ?? text.length;
      return ARTICLE_META.test(text.slice(heading.start, Math.min(end, heading.start + 500)));
    });
    return rows.length >= 2 ? rows : headings;
  }
  function stableIdentity(path, title, sourceText) {
    const normalized = sourceText.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
    return `subdoc_${sha(`${path.normalize("NFC")}|${title.normalize("NFC")}|${normalized}`).slice(0, 24)}`;
  }

  function segmentCorpus(input) {
    if (!input || typeof input.source_path !== "string" || !input.source_path.endsWith(".md")
      || typeof input.source_text !== "string" || input.source_text.length === 0) return fail("invalid_corpus_source");
    const text = input.source_text;
    const boundaries = articleRows(text, headingRows(text));
    if (boundaries.length === 0) return fail("subdocument_boundaries_not_found");
    const ledger = [];
    if (boundaries[0].start > 0) ledger.push(freeze({
      kind: "preamble", classification: "non_content", global_span: { start: 0, end: boundaries[0].start },
    }));
    const occurrences = new Map();
    const subdocuments = boundaries.map((boundary, index) => {
      const end = boundaries[index + 1]?.start ?? text.length;
      const sourceText = text.slice(boundary.start, end);
      const identity = stableIdentity(input.source_path, boundary.title, sourceText);
      const occurrence = occurrences.get(identity) || 0;
      occurrences.set(identity, occurrence + 1);
      const document = freeze({
        subdocument_id: occurrence === 0 ? identity : `subdoc_${sha(`${identity}|${occurrence}`).slice(0, 24)}`,
        source_path: input.source_path.normalize("NFC"),
        title: boundary.title,
        global_span: { start: boundary.start, end },
        local_span: { start: 0, end: sourceText.length },
        content_hash: sha(sourceText),
        source_text: sourceText,
      });
      ledger.push(freeze({
        kind: "subdocument", classification: "content", subdocument_id: document.subdocument_id,
        global_span: document.global_span,
      }));
      return document;
    });
    ledger.sort((left, right) => left.global_span.start - right.global_span.start);
    let cursor = 0; let overlap = 0; let uncovered = 0;
    for (const row of ledger) {
      if (row.global_span.start > cursor) uncovered += row.global_span.start - cursor;
      if (row.global_span.start < cursor) overlap += cursor - row.global_span.start;
      cursor = Math.max(cursor, row.global_span.end);
    }
    if (cursor < text.length) uncovered += text.length - cursor;
    const covered = text.length - uncovered;
    return freeze({
      ok: uncovered === 0 && overlap === 0,
      reason: uncovered || overlap ? "invalid_corpus_coverage" : null,
      version: VERSION,
      source_path: input.source_path.normalize("NFC"),
      source_hash: sha(text),
      subdocuments,
      ledger,
      coverage: { total_chars: text.length, covered_chars: covered, uncovered_chars: uncovered, overlap_chars: overlap },
    });
  }

  const api = freeze({ VERSION, segmentCorpus });
  root.LLMWikiCorpusSegmenter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
