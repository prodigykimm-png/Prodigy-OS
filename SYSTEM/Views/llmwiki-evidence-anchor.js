(function (root) {
  "use strict";
  function anchorQuote(text, quote) {
    if (typeof text !== "string" || typeof quote !== "string" || !quote.length || quote.length > text.length) return null;
    const first = text.indexOf(quote);
    if (first < 0 || text.indexOf(quote, first + 1) !== -1) return null;
    return Object.freeze({ start: first, end: first + quote.length });
  }
  function projectedAnchor(text, quote) {
    const project = (value, mapping) => { let out = "", i = 0; while (i < value.length) { if (/\s/u.test(value[i])) { const start = i; while (i < value.length && /\s/u.test(value[i])) i += 1; out += " "; if (mapping) mapping.push([start, i]); } else { out += value[i]; if (mapping) mapping.push([i, i + 1]); i += 1; } } return out; }; const mapping = [], source = project(text, mapping), target = project(quote), first = source.indexOf(target), second = first < 0 ? -1 : source.indexOf(target, first + 1);
    return first < 0 ? { count: 0, anchor: null } : second >= 0 ? { count: 2, anchor: null } : { count: 1, anchor: Object.freeze({ start: mapping[first][0], end: mapping[first + target.length - 1][1] }) };
  }
  const api = Object.freeze({ anchorQuote, projectedAnchor });
  root.LLMWikiEvidenceAnchor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
