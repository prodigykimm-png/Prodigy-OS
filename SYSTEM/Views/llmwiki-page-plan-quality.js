(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWikiHash is required.");

  const QUALITY_VERSION = "llmwiki_page_plan_quality_v1";
  const WORKFLOW_FAMILIES = Object.freeze({
    enforcement: Object.freeze(["명도", "점유", "강제집행", "보관집행", "부당이득", "인도명령", "매각불허가", "가처분"]),
    rights: Object.freeze(["가등기", "담보가등기", "배당", "권리분석", "명의변경"]),
    construction: Object.freeze(["건축", "직영", "리모델링", "공정", "설계", "단열"]),
  });
  const STOP = new Set(["부동산", "투자", "전략", "관리", "기준", "관련", "정리", "방법", "설명", "실무"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  function tokens(value) {
    return [...new Set((clean(value).toLocaleLowerCase("ko-KR").match(/[가-힣a-z0-9]{2,}/gu) || []).filter((token) => !STOP.has(token)))];
  }
  function familyFor(page) {
    const text = `${page.title} ${page.purpose}`;
    let best = null;
    for (const [family, terms] of Object.entries(WORKFLOW_FAMILIES)) {
      const score = terms.filter((term) => text.includes(term)).length;
      const threshold = family === "enforcement" ? 1 : 2;
      if (score >= threshold && (!best || score > best.score)) best = { family, score };
    }
    return best?.family || null;
  }
  function candidateScore(page, candidate) {
    const pageTokens = tokens(`${page.title} ${page.purpose}`);
    const candidateTokens = new Set(tokens(`${candidate.title || ""} ${candidate.purpose || ""} ${candidate.body || ""}`));
    if (pageTokens.length === 0) return 0;
    return pageTokens.filter((token) => candidateTokens.has(token)).length / pageTokens.length;
  }
  function adaptivePageBudget(reusableClaimCount) {
    return Math.max(1, Math.ceil(Number(reusableClaimCount || 0) / 5) + 1);
  }
  function evaluate(input) {
    const inventory = input?.inventory;
    const plan = input?.plan;
    const candidates = Array.isArray(input?.candidates) ? input.candidates : [];
    if (!plain(inventory) || !Array.isArray(inventory.claims) || !plain(plan) || !Array.isArray(plan.pages)) {
      return freeze({ ok: false, reason: "invalid_quality_input" });
    }
    const selected = plan.pages.filter((page) => page.selected !== false);
    const reusableCount = inventory.claims.filter((claim) => claim.role === "reusable_claim").length;
    const budget = adaptivePageBudget(reusableCount);
    const findings = [];
    if (selected.length > budget) findings.push({
      code: "page_budget_exceeded", severity: "high", page_ids: selected.map((page) => page.page_id),
      actual: selected.length, expected_max: budget,
    });
    const families = new Map();
    for (const page of selected) {
      const family = familyFor(page);
      if (family) families.set(family, [...(families.get(family) || []), page]);
      if (page.target_candidate_ids.length === 1) {
        const candidate = candidates.find((row) => row.candidate_id === page.target_candidate_ids[0]);
        const score = candidate ? candidateScore(page, candidate) : 0;
        if (score < 0.34) findings.push({
          code: "weak_candidate_update", severity: "high", page_ids: [page.page_id],
          candidate_id: page.target_candidate_ids[0], similarity: score,
        });
      }
    }
    for (const [family, pages] of families) {
      const thin = pages.filter((page) => page.claim_ids.length <= 4);
      const fragmented = family === "enforcement" && pages.length >= 2 ? pages : thin;
      if (fragmented.length >= 2) findings.push({
        code: "fragmented_workflow", severity: "high", family,
        page_ids: fragmented.map((page) => page.page_id),
      });
    }
    for (const page of selected) {
      for (const candidateId of page.target_candidate_ids) {
        const candidate = candidates.find((row) => row.candidate_id === candidateId);
        if (!candidate) continue;
        const claimTexts = page.claim_ids.map((claimId) => inventory.claims.find((claim) => claim.claim_id === claimId)?.text).filter(Boolean);
        if (claimTexts.length > 0 && claimTexts.every((text) => clean(candidate.body).includes(clean(text)))) findings.push({
          code: "candidate_duplicate", severity: "high", page_ids: [page.page_id], candidate_id: candidateId,
        });
        const contradiction = claimTexts.some((text) => {
          const normalized = clean(text);
          const negated = normalized.includes("필요") ? normalized.replace("필요", "불필요") : normalized.includes("가능") ? normalized.replace("가능", "불가능") : "";
          return negated && clean(candidate.body).includes(negated);
        });
        if (contradiction) findings.push({
          code: "candidate_contradiction", severity: "high", page_ids: [page.page_id], candidate_id: candidateId,
        });
      }
    }
    const score = Math.max(0, 100 - findings.reduce((sum, finding) => sum + (finding.severity === "high" ? 20 : 8), 0));
    return freeze({
      ok: true,
      quality_version: QUALITY_VERSION,
      status: findings.length ? "revision_required" : "pass",
      score,
      budget: { reusable_claims: reusableCount, page_max: budget, actual_pages: selected.length },
      findings,
      writer_count: 0,
    });
  }
  function revise(input) {
    const quality = evaluate(input);
    if (!quality.ok) return quality;
    let pages = input.plan.pages.map((page) => ({ ...page, claim_ids: [...page.claim_ids], target_candidate_ids: [...page.target_candidate_ids] }));
    let sourceOnly = [...input.plan.source_only_claim_ids];
    for (const finding of quality.findings.filter((row) => row.code === "weak_candidate_update")) {
      pages = pages.map((page) => finding.page_ids.includes(page.page_id)
        ? { ...page, target_candidate_ids: [], operation_hint: "create" }
        : page);
    }
    for (const finding of quality.findings.filter((row) => row.code === "fragmented_workflow")) {
      const members = pages.filter((page) => finding.page_ids.includes(page.page_id));
      if (members.length < 2) continue;
      const firstIndex = pages.findIndex((page) => finding.page_ids.includes(page.page_id));
      const merged = {
        ...members[0],
        page_id: `page_${hashApi.sha256(JSON.stringify([input.plan.inventory_hash, finding.family, finding.page_ids])).slice(0, 24)}`,
        title: finding.family === "enforcement" ? "경공매 낙찰 후 점유·명도·권리집행 실무" : members.map((page) => page.title).join(" · "),
        purpose: members.map((page) => page.purpose).join(" "),
        claim_ids: [...new Set(members.flatMap((page) => page.claim_ids))],
        target_candidate_ids: [],
        operation_hint: "create",
        evidence_count: members.reduce((sum, page) => sum + Number(page.evidence_count || 0), 0),
      };
      pages = pages.filter((page) => !finding.page_ids.includes(page.page_id));
      pages.splice(firstIndex, 0, merged);
    }
    const body = {
      plan_version: input.plan.plan_version,
      inventory_hash: input.plan.inventory_hash,
      source: input.plan.source,
      source_guide: input.plan.source_guide,
      pages,
      source_only_claim_ids: sourceOnly,
      status: "pending_review",
      plan_revision: input.plan.plan_revision + 1,
    };
    return freeze({
      ok: true,
      value: freeze({ ...body, plan_hash: hashApi.sha256(stable(body)) }),
      before: quality,
      after: evaluate({ inventory: input.inventory, plan: { ...body, plan_hash: hashApi.sha256(stable(body)) }, candidates: input.candidates }),
    });
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  const CRITIC_SCHEMA = freeze({
    type: "object", additionalProperties: false, required: ["actions"],
    properties: { actions: { type: "array", maxItems: 16, items: {
      type: "object", additionalProperties: false, required: ["finding_code", "decision"],
      properties: {
        finding_code: { type: "string" },
        decision: { type: "string", enum: ["accept_revision", "keep_source_only", "request_human"] },
      },
    } } },
  });
  const api = freeze({ QUALITY_VERSION, CRITIC_SCHEMA, adaptivePageBudget, candidateScore, evaluate, revise });
  root.LLMWikiPagePlanQuality = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
