(function (root) {
  "use strict";
  const VERSION = "llmwiki_quality_signals_v3";
  const STOP = new Set(["한다", "있다", "없다", "위해", "대한", "통해", "경우", "것이다", "중요하다"]);
  function tokens(value) {
    return [...new Set(String(value || "").normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}]+/u).map((word) => word.replace(/(?:은|는|이|가|을|를|에|의|와|과|도|로|으로|에서|에게|보다|마다|까지|부터)$/u, "")).filter((word) => word.length >= 2 && !STOP.has(word)))];
  }
  function covered(mapClaim, inventoryClaims) {
    const wanted = tokens(`${mapClaim.text || ""} ${mapClaim.evidence_quote || ""}`);
    if (wanted.length < 4) return true;
    return inventoryClaims.some((claim) => {
      const actual = new Set(tokens(claim.text));
      const overlap = wanted.filter((token) => actual.has(token)).length;
      return overlap / wanted.length >= 0.6;
    });
  }
  function validSpan(value) {
    return value && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.start >= 0 && value.end > value.start
      ? { start: value.start, end: value.end } : null;
  }
  function citationSpan(citation, sourcePath) {
    if (!citation || typeof citation !== "object") return null;
    for (const locator of Array.isArray(citation.locators) ? citation.locators : []) {
      if (typeof locator !== "string") continue;
      const marker = locator.lastIndexOf("#");
      if (marker < 0 || locator.slice(0, marker).normalize("NFC") !== sourcePath) continue;
      const match = /^(\d+)-(\d+)$/u.exec(locator.slice(marker + 1));
      if (!match) continue;
      const span = validSpan({ start: Number(match[1]), end: Number(match[2]) });
      if (span) return span;
    }
    return null;
  }
  function holdRepresentations(holds) {
    const rows = new Map();
    for (const hold of holds) {
      if (!hold || typeof hold !== "object") continue;
      const spans = [validSpan(hold.span), validSpan(hold.item?.span)].filter(Boolean);
      const keys = [hold.evidence_key, hold.key, hold.item?.evidence_key, hold.item?.key]
        .filter((key) => typeof key === "string" && key.length > 0);
      const explicitIdentity = [hold.hold_id, hold.unit_id, hold.item?.hold_id, hold.item?.unit_id]
        .find((identity) => typeof identity === "string" && identity.length > 0);
      const identity = explicitIdentity
        ? `id:${explicitIdentity}`
        : `detail:${JSON.stringify({ keys: [...new Set(keys)].sort(), spans: spans.map((span) => [span.start, span.end]).sort((left, right) => left[0] - right[0] || left[1] - right[1]) })}`;
      const existing = rows.get(identity) || { identity, spans: [], keys: [] };
      existing.spans.push(...spans);
      existing.keys.push(...keys);
      rows.set(identity, existing);
    }
    return [...rows.values()].map((row) => Object.freeze({
      identity: row.identity,
      spans: Object.freeze([...new Map(row.spans.map((span) => [`${span.start}:${span.end}`, span])).values()]),
      keys: Object.freeze([...new Set(row.keys)]),
    }));
  }
  function citationIdentity(citation) {
    return JSON.stringify([
      typeof citation?.source_id === "string" ? citation.source_id : "",
      typeof citation?.content_hash === "string" ? citation.content_hash : "",
      typeof citation?.evidence_quote === "string" ? citation.evidence_quote.normalize("NFC") : "",
    ]);
  }
  function auditSourceCoverage(input) {
    const sourcePath = typeof input.source_path === "string" ? input.source_path.normalize("NFC") : "";
    const scopeStart = Number.isSafeInteger(input.scope_start) && input.scope_start >= 0 ? input.scope_start : 0;
    const sourceLength = Number.isSafeInteger(input.source_length) && input.source_length >= 0 ? input.source_length : Number.MAX_SAFE_INTEGER;
    const scopeEnd = Number.isSafeInteger(input.scope_end) && input.scope_end >= scopeStart ? input.scope_end : sourceLength;
    const units = Array.isArray(input.semantic_units) ? input.semantic_units : [];
    const citations = Array.isArray(input.inventory_citations) ? input.inventory_citations : [];
    const holds = holdRepresentations(Array.isArray(input.holds) ? input.holds : []);
    const citationRows = citations.map((citation, index) => ({ citation, span: citationSpan(citation, sourcePath), id: citation?.citation_id || `citation_${index + 1}` }))
      .filter((row) => row.span && row.span.start >= scopeStart && row.span.end <= scopeEnd && row.span.end <= sourceLength);
    const rows = units.map((unit, index) => {
      const start = Number.isSafeInteger(unit?.start) && unit.start >= 0 ? unit.start : -1;
      const end = Number.isSafeInteger(unit?.end) && unit.end > start ? unit.end : -1;
      const globalStart = start < 0 ? -1 : scopeStart + start;
      const globalEnd = end < 0 ? -1 : scopeStart + end;
      const inBounds = globalStart >= scopeStart && globalEnd <= scopeEnd && globalEnd <= sourceLength;
      const matchingCitations = inBounds ? citationRows.filter((row) => row.span.start === globalStart && row.span.end === globalEnd) : [];
      const duplicateIdentities = new Set(matchingCitations.map((row) => citationIdentity(row.citation)));
      const held = holds.some((hold) => hold.keys.includes(unit?.key)
        || hold.spans.some((span) => span.start === globalStart && span.end === globalEnd));
      const status = held ? "held" : duplicateIdentities.size > 1 ? "duplicate" : matchingCitations.length ? "covered" : "missing";
      return Object.freeze({
        key: typeof unit?.key === "string" ? unit.key : `evidence_${index + 1}`,
        text: typeof unit?.text === "string" ? unit.text : "",
        span: Object.freeze({ start, end, global_start: globalStart, global_end: globalEnd }),
        citation_ids: Object.freeze(matchingCitations.map((row) => row.id)),
        status,
      });
    });
    const total = rows.length;
    const covered = rows.filter((row) => row.status === "covered").length;
    const missing = rows.filter((row) => row.status === "missing").length;
    const duplicates = rows.filter((row) => row.status === "duplicate").length;
    const holdsCount = holds.length;
    const sourceCoverage = Object.freeze({ total, covered, missing, holds: holdsCount, duplicates });
    const incomplete = missing > 0 || duplicates > 0 || holdsCount > 0 || rows.some((row) => row.span.start < 0);
    return Object.freeze({
      version: VERSION,
      status: incomplete ? "review_required" : "complete",
      ...(incomplete ? { reason: "source_coverage_incomplete" } : {}),
      source_path: sourcePath,
      scope_start: scopeStart,
      source_bytes: Number.isSafeInteger(input.source_bytes) && input.source_bytes >= 0 ? input.source_bytes : 0,
      source_coverage: sourceCoverage,
      total_units: total,
      covered_units: covered,
      missing_units: missing,
      hold_units: holdsCount,
      duplicate_units: duplicates,
      units: Object.freeze(rows),
      possible_gaps: Object.freeze([]),
      blocks_approval: incomplete,
    });
  }
  function audit(input = {}) {
    if (Array.isArray(input.semantic_units)) return auditSourceCoverage(input);
    const mapClaims = Array.isArray(input.map_claims) ? input.map_claims : [];
    const inventoryClaims = Array.isArray(input.inventory_claims) ? input.inventory_claims : [];
    const possibleGaps = mapClaims.filter((claim) => !covered(claim, inventoryClaims)).map((claim) => Object.freeze({ map_claim_id: claim.claim_id, evidence_quote: claim.evidence_quote || "", text: claim.text || "", status: "possible_gap" }));
    return Object.freeze({ version: VERSION, status: "advisory", possible_gaps: Object.freeze(possibleGaps), blocks_approval: false });
  }
  function summarize(input = {}) {
    const claims = Array.isArray(input.inventory_claims) ? input.inventory_claims.length : 0;
    const pages = Array.isArray(input.pages) ? input.pages.length : 0;
    const sourceOnly = Array.isArray(input.source_only_claim_ids) ? input.source_only_claim_ids.length : 0;
    const gaps = Array.isArray(input.possible_gaps) ? input.possible_gaps.length : 0;
    const holds = Array.isArray(input.holds) ? input.holds.length : 0;
    return Object.freeze({ claims, drafts: pages, source_only: sourceOnly, possible_gaps: gaps, holds, text: `claims ${claims} · draft ${pages} · source-only ${sourceOnly} · 누락 후보 ${gaps} · hold ${holds}` });
  }
  const api = Object.freeze({ VERSION, tokens, audit, summarize });
  root.LLMWikiQualitySignals = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
