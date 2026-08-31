(function (root) {
  "use strict";

  const VERSION = "llmwiki_recall_audit_v1";
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function clean(value) { return typeof value === "string" ? value.normalize("NFC").replace(/\s+/gu, " ").trim() : ""; }
  function overlap(left, right) { return left.start < right.end && right.start < left.end; }
  function strataFor(claim, index, total, contextRows) {
    const strata = [];
    if (index === 0) strata.push("start");
    if (index === Math.floor((total - 1) / 2)) strata.push("middle");
    if (index === total - 1) strata.push("end");
    if (/\d[\d,.]*\s*(?:%|원|만\s*원|억\s*원|㎡|평|년|개월|일|mm)|ISO/iu.test(claim.text)) strata.push("numeric");
    if (["procedure"].includes(claim.claim_type)) strata.push("ordered_list");
    if (claim.claim_type === "safety_sensitive" || /안전|주의|위험|반드시/iu.test(claim.text)) strata.push("safety");
    if (contextRows.some((row) => Math.abs(row.global_span.start - claim.global_span.end) < 120
      || Math.abs(claim.global_span.start - row.global_span.end) < 120)) strata.push("context_boundary");
    return strata;
  }
  function selectSamples(claims, contextRows, limit) {
    const decorated = claims.map((claim, index) => ({ claim, index, strata: strataFor(claim, index, claims.length, contextRows) }));
    const selected = []; const used = new Set();
    for (const stratum of ["start", "middle", "end", "numeric", "ordered_list", "safety", "context_boundary"]) {
      const row = decorated.find((candidate) => candidate.strata.includes(stratum) && !used.has(candidate.claim.claim_id));
      if (row) { selected.push(row); used.add(row.claim.claim_id); }
    }
    for (const row of decorated) {
      if (selected.length >= limit) break;
      if (!used.has(row.claim.claim_id)) { selected.push(row); used.add(row.claim.claim_id); }
    }
    return selected.slice(0, limit);
  }
  function auditRecall(input) {
    const result = input?.result;
    const source = input?.source_text;
    if (!result?.ok || typeof source !== "string" || !result.inventory?.claims || !result.segmentation?.subdocuments) {
      return freeze({ ok: false, reason: "invalid_recall_audit_input", gate: "fail" });
    }
    const claims = result.inventory.claims;
    const contextRows = result.ledger.filter((row) => row.classification === "context_only");
    const subdocuments = new Map(result.segmentation.subdocuments.map((row) => [row.subdocument_id, row]));
    const samples = selectSamples(claims, contextRows, Number.isSafeInteger(input.sample_limit) ? input.sample_limit : 40);
    const failures = [];
    const rows = samples.map(({ claim, strata }) => {
      const slice = source.slice(claim.global_span.start, claim.global_span.end);
      const spanMatch = clean(slice) === clean(claim.evidence_quote) || clean(slice).includes(clean(claim.evidence_quote));
      const document = subdocuments.get(claim.subdocument_id);
      const boundaryMatch = Boolean(document) && claim.global_span.start >= document.global_span.start && claim.global_span.end <= document.global_span.end;
      const contaminated = contextRows.some((row) => overlap(row.global_span, claim.global_span));
      const row = freeze({ claim_id: claim.claim_id, strata, span_match: spanMatch, boundary_match: boundaryMatch, context_contaminated: contaminated });
      if (!spanMatch || !boundaryMatch || contaminated) failures.push(row);
      return row;
    });
    const critical = rows.filter((row) => row.strata.some((value) => ["numeric", "ordered_list", "safety"].includes(value)));
    const ratio = (values, check) => values.length ? values.filter(check).length / values.length : 1;
    const nonClaimSamples = result.ledger.filter((row) => row.classification !== "claim")
      .filter((row, index, rows) => index === 0 || index === rows.length - 1 || index % Math.max(1, Math.floor(rows.length / 20)) === 0)
      .slice(0, 22).map((row) => freeze({ classification: row.classification, global_span: row.global_span,
        source_excerpt: source.slice(row.global_span.start, row.global_span.end).slice(0, 240) }));
    const metrics = freeze({
      sample_count: rows.length,
      structural_span_accuracy: ratio(rows, (row) => row.span_match),
      structural_boundary_accuracy: ratio(rows, (row) => row.boundary_match),
      critical_structural_recall: ratio(critical, (row) => row.span_match && row.boundary_match && !row.context_contaminated),
      general_structural_recall: ratio(rows, (row) => row.span_match && row.boundary_match),
      context_contamination: rows.length ? rows.filter((row) => row.context_contaminated).length / rows.length : 0,
    });
    const pass = metrics.critical_structural_recall === 1 && metrics.general_structural_recall >= 0.95
      && metrics.structural_span_accuracy === 1 && metrics.structural_boundary_accuracy === 1 && metrics.context_contamination === 0;
    return freeze({ ok: pass, reason: pass ? null : "recall_audit_failed", gate: pass ? "pass" : "fail", version: VERSION,
      interpretation: "structural_recall_only", metrics, samples: rows, non_claim_samples: nonClaimSamples, failures });
  }

  const api = freeze({ VERSION, auditRecall });
  root.LLMWikiRecallAudit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
