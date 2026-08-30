(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWikiHash is required.");

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function sha(value) { return hashApi.sha256(String(value)); }
  function planBody(plan) {
    return {
      plan_version: plan.plan_version,
      inventory_hash: plan.inventory_hash,
      source: plan.source,
      source_guide: plan.source_guide,
      pages: plan.pages,
      source_only_claim_ids: plan.source_only_claim_ids,
      status: plan.status,
      plan_revision: plan.plan_revision,
    };
  }
  function valid(input) {
    const inventory = input?.inventory;
    const plan = input?.plan;
    return plain(inventory) && inventory.inventory_version === "llmwiki_claim_inventory_v3"
      && Array.isArray(inventory.claims) && Array.isArray(inventory.citations)
      && plain(plan) && plan.plan_version === "llmwiki_page_plan_v1"
      && plan.inventory_hash === inventory.inventory_hash && Array.isArray(plan.pages)
      && Array.isArray(plan.source_only_claim_ids) && plan.plan_hash === sha(stable(planBody(plan)));
  }

  function querySourceOnly(input) {
    if (!valid(input) || !clean(input.query)) return freeze({ ok: false, reason: "invalid_source_only_query", writer_count: 0 });
    const terms = [...new Set(clean(input.query).toLocaleLowerCase("ko-KR").split(/[^\p{L}\p{N}_-]+/u).filter(Boolean))];
    const citationById = new Map(input.inventory.citations.map((citation) => [citation.citation_id, citation]));
    const sourceOnly = new Set(input.plan.source_only_claim_ids);
    const results = input.inventory.claims
      .filter((claim) => sourceOnly.has(claim.claim_id))
      .map((claim) => {
        const text = `${claim.topic} ${claim.text}`.toLocaleLowerCase("ko-KR");
        return { claim, score: terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) };
      })
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score || left.claim.claim_id.localeCompare(right.claim.claim_id, "en"))
      .slice(0, 20)
      .map((row) => freeze({
        claim_id: row.claim.claim_id,
        topic: row.claim.topic,
        text: row.claim.text,
        score: row.score,
        citations: row.claim.citation_ids.map((citationId) => citationById.get(citationId)).filter(Boolean),
      }));
    return freeze({ ok: true, status: results.length ? "ok" : "empty", results, writer_count: 0, provider_count: 0 });
  }

  function promoteQueryResult(input) {
    if (!valid(input) || input.plan.status !== "pending_review" || !Array.isArray(input.claim_ids)
      || input.claim_ids.length < 2 || new Set(input.claim_ids).size !== input.claim_ids.length
      || !clean(input.title) || !clean(input.purpose)) return freeze({ ok: false, reason: "invalid_query_promotion" });
    const sourceOnly = new Set(input.plan.source_only_claim_ids);
    if (input.claim_ids.some((claimId) => !sourceOnly.has(claimId))) return freeze({ ok: false, reason: "query_claim_not_source_only" });
    const claimById = new Map(input.inventory.claims.map((claim) => [claim.claim_id, claim]));
    const evidenceIds = new Set(input.claim_ids.flatMap((claimId) => claimById.get(claimId)?.citation_ids || []));
    if (evidenceIds.size < 2) return freeze({ ok: false, reason: "query_promotion_requires_multiple_evidence" });
    const page = {
      page_id: `page_${sha(stable([input.plan.inventory_hash, input.claim_ids, clean(input.title), clean(input.purpose)])).slice(0, 24)}`,
      title: clean(input.title),
      purpose: clean(input.purpose),
      claim_ids: [...input.claim_ids],
      target_candidate_ids: [],
      operation_hint: "create",
      evidence_count: evidenceIds.size,
      selected: true,
    };
    const body = {
      ...planBody(input.plan),
      pages: [...input.plan.pages, page],
      source_only_claim_ids: input.plan.source_only_claim_ids.filter((claimId) => !input.claim_ids.includes(claimId)),
      plan_revision: input.plan.plan_revision + 1,
      status: "pending_review",
    };
    return freeze({ ok: true, value: freeze({ ...body, plan_hash: sha(stable(body)) }) });
  }

  function lintPlan(input) {
    if (!valid(input)) return freeze({ ok: false, reason: "invalid_page_plan_lint", writer_count: 0 });
    const proposals = [];
    const titleCounts = new Map();
    for (const page of input.plan.pages.filter((row) => row.selected !== false)) {
      titleCounts.set(page.title, (titleCounts.get(page.title) || 0) + 1);
      if (page.target_candidate_ids.length > 1) proposals.push(freeze({
        proposal_id: `lint_${sha(`${input.plan.plan_hash}:${page.page_id}:merge`).slice(0, 24)}`,
        page_id: page.page_id,
        risk: "high",
        reason: "explicit_merge_destination_required",
      }));
      if (page.operation_hint === "create" && Number(page.evidence_count || 0) < 2) proposals.push(freeze({
        proposal_id: `lint_${sha(`${input.plan.plan_hash}:${page.page_id}:evidence`).slice(0, 24)}`,
        page_id: page.page_id,
        risk: "medium",
        reason: "new_page_requires_multiple_evidence",
      }));
    }
    for (const page of input.plan.pages) if ((titleCounts.get(page.title) || 0) > 1 && !proposals.some((proposal) => proposal.page_id === page.page_id && proposal.reason === "duplicate_page_title")) {
      proposals.push(freeze({
        proposal_id: `lint_${sha(`${input.plan.plan_hash}:${page.page_id}:title`).slice(0, 24)}`,
        page_id: page.page_id,
        risk: "medium",
        reason: "duplicate_page_title",
      }));
    }
    return freeze({ ok: true, status: proposals.length ? "proposed" : "clean", proposals, writer_count: 0, auto_authorization_count: 0 });
  }

  const api = freeze({ querySourceOnly, promoteQueryResult, lintPlan });
  root.LLMWikiPagePlanFeedback = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
