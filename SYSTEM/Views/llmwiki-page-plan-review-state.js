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
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function sha(value) { return hashApi.sha256(String(value)); }
  function fail(reason, snapshot) { return freeze({ ok: false, reason, snapshot }); }
  function body(plan) {
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
  function rehash(plan) {
    const nextBody = body(plan);
    return freeze({ ...nextBody, plan_hash: sha(stable(nextBody)) });
  }

  function createPagePlanReviewState(options = {}) {
    const input = options.plan;
    if (!plain(input) || input.plan_version !== "llmwiki_page_plan_v1" || !Array.isArray(input.pages)
      || !Array.isArray(input.source_only_claim_ids) || input.plan_hash !== sha(stable(body(input)))) {
      throw new TypeError("valid_page_plan_required");
    }
    let intrinsicSourceOnly = [...input.source_only_claim_ids];
    let snapshot = freeze(clone(input));

    function publish(next) {
      snapshot = rehash(next);
      if (typeof options.onChange === "function") options.onChange(snapshot);
      return freeze({ ok: true, snapshot });
    }
    function getSnapshot() { return snapshot; }
    function sourceOnlyFor(pages) {
      return [...new Set([
        ...intrinsicSourceOnly,
        ...pages.filter((page) => page.selected === false).flatMap((page) => page.claim_ids),
      ])];
    }
    function dispatch(intent) {
      if (!plain(intent) || intent.expected_plan_hash !== snapshot.plan_hash) return fail("stale_page_plan_action", snapshot);
      if (intent.action === "reopen_plan") {
        if (!["approved", "compiled"].includes(snapshot.status)) return fail("page_plan_not_reopenable", snapshot);
        return publish({ ...snapshot, status: "pending_review", plan_revision: snapshot.plan_revision + 1 });
      }
      if (snapshot.status !== "pending_review") return fail("stale_page_plan_action", snapshot);
      if (intent.action === "toggle_page") {
        const index = snapshot.pages.findIndex((page) => page.page_id === intent.page_id);
        if (index < 0) return fail("unknown_page_plan", snapshot);
        const pages = snapshot.pages.map((page, pageIndex) => pageIndex === index ? { ...page, selected: page.selected === false } : page);
        return publish({ ...snapshot, pages, source_only_claim_ids: sourceOnlyFor(pages), plan_revision: snapshot.plan_revision + 1 });
      }
      if (intent.action === "rename_page") {
        const title = clean(intent.title);
        const purpose = clean(intent.purpose);
        const index = snapshot.pages.findIndex((page) => page.page_id === intent.page_id);
        if (index < 0 || !title || !purpose) return fail("invalid_page_revision", snapshot);
        const pages = snapshot.pages.map((page, pageIndex) => pageIndex === index ? { ...page, title, purpose } : page);
        return publish({ ...snapshot, pages, plan_revision: snapshot.plan_revision + 1 });
      }
      if (intent.action === "assign_candidate") {
        const index = snapshot.pages.findIndex((page) => page.page_id === intent.page_id);
        if (index < 0 || typeof intent.candidate_id !== "string"
          || !/^cand_[a-zA-Z0-9_-]{1,64}$/u.test(intent.candidate_id)) return fail("invalid_candidate_assignment", snapshot);
        const pages = snapshot.pages.map((page, pageIndex) => pageIndex === index
          ? { ...page, target_candidate_ids: [intent.candidate_id], operation_hint: "update" }
          : page);
        return publish({ ...snapshot, pages, plan_revision: snapshot.plan_revision + 1 });
      }
      if (intent.action === "update_source_guide_questions") {
        const questions = Array.isArray(intent.key_questions)
          ? [...new Set(intent.key_questions.map(clean).filter(Boolean))]
          : [];
        if (questions.length === 0 || questions.length > 8) return fail("invalid_source_guide_questions", snapshot);
        return publish({
          ...snapshot,
          source_guide: { ...snapshot.source_guide, key_questions: questions },
          plan_revision: snapshot.plan_revision + 1,
        });
      }
      if (intent.action === "merge_pages") {
        const pageIds = Array.isArray(intent.page_ids) ? [...new Set(intent.page_ids)] : [];
        const selected = snapshot.pages.filter((page) => pageIds.includes(page.page_id));
        const title = clean(intent.title);
        const purpose = clean(intent.purpose);
        if (pageIds.length < 2 || selected.length !== pageIds.length || !title || !purpose) return fail("invalid_page_merge", snapshot);
        const claimIds = [...new Set(selected.flatMap((page) => page.claim_ids))];
        const targetCandidateIds = [...new Set(selected.flatMap((page) => page.target_candidate_ids))];
        const operationHint = targetCandidateIds.length > 1 ? "merge" : targetCandidateIds.length === 1 ? "update" : "create";
        const merged = {
          page_id: `page_${sha(stable([snapshot.inventory_hash, pageIds.sort(), title, purpose, claimIds])).slice(0, 24)}`,
          title,
          purpose,
          claim_ids: claimIds,
          target_candidate_ids: targetCandidateIds,
          operation_hint: operationHint,
          evidence_count: selected.reduce((sum, page) => sum + Number(page.evidence_count || 0), 0),
          selected: selected.some((page) => page.selected !== false),
        };
        const firstIndex = Math.min(...selected.map((page) => snapshot.pages.indexOf(page)));
        const pages = snapshot.pages.filter((page) => !pageIds.includes(page.page_id));
        pages.splice(firstIndex, 0, merged);
        return publish({ ...snapshot, pages, source_only_claim_ids: sourceOnlyFor(pages), plan_revision: snapshot.plan_revision + 1 });
      }
      if (intent.action === "split_page") {
        const index = snapshot.pages.findIndex((page) => page.page_id === intent.page_id);
        const original = snapshot.pages[index];
        const parts = Array.isArray(intent.parts) ? intent.parts : [];
        const sourceOnly = Array.isArray(intent.source_only_claim_ids) ? intent.source_only_claim_ids : [];
        if (index < 0 || original.target_candidate_ids.length > 0 || parts.length === 0
          || new Set(sourceOnly).size !== sourceOnly.length
          || parts.some((part) => !plain(part) || !clean(part.title) || !clean(part.purpose)
            || !Array.isArray(part.claim_ids) || part.claim_ids.length < 2
            || new Set(part.claim_ids).size !== part.claim_ids.length
            || !Number.isSafeInteger(part.evidence_count) || part.evidence_count < 2)) {
          return fail("invalid_page_split_coverage", snapshot);
        }
        const originalIds = new Set(original.claim_ids);
        const used = [...parts.flatMap((part) => part.claim_ids), ...sourceOnly];
        if (used.length !== originalIds.size || new Set(used).size !== used.length || used.some((claimId) => !originalIds.has(claimId))) {
          return fail("invalid_page_split_coverage", snapshot);
        }
        const splitPages = parts.map((part) => ({
          page_id: `page_${sha(stable([snapshot.inventory_hash, original.page_id, clean(part.title), clean(part.purpose), part.claim_ids])).slice(0, 24)}`,
          title: clean(part.title),
          purpose: clean(part.purpose),
          claim_ids: [...part.claim_ids],
          target_candidate_ids: [],
          operation_hint: "create",
          evidence_count: part.evidence_count,
          selected: original.selected !== false,
        }));
        const pages = snapshot.pages.filter((_page, pageIndex) => pageIndex !== index);
        pages.splice(index, 0, ...splitPages);
        intrinsicSourceOnly = [...new Set([...intrinsicSourceOnly, ...sourceOnly])];
        return publish({ ...snapshot, pages, source_only_claim_ids: sourceOnlyFor(pages), plan_revision: snapshot.plan_revision + 1 });
      }
      if (intent.action === "request_plan_revision") {
        const guidance = clean(intent.guidance);
        if (!guidance) return fail("revision_guidance_required", snapshot);
        return publish({ ...snapshot, status: "revision_requested", plan_revision: snapshot.plan_revision + 1 });
      }
      if (intent.action === "approve_plan") {
        if (snapshot.pages.every((page) => page.selected === false)) return fail("approved_page_required", snapshot);
        return publish({ ...snapshot, status: "approved", source_only_claim_ids: sourceOnlyFor(snapshot.pages), plan_revision: snapshot.plan_revision + 1 });
      }
      if (intent.action === "cancel_plan") return publish({ ...snapshot, status: "cancelled", plan_revision: snapshot.plan_revision + 1 });
      return fail("unknown_page_plan_action", snapshot);
    }

    return Object.freeze({ dispatch, getSnapshot });
  }

  const api = freeze({ createPagePlanReviewState });
  root.LLMWikiPagePlanReviewState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
