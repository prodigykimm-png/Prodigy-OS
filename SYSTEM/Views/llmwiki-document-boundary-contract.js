(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWikiHash is required.");

  const CONTRACT_VERSION = "llmwiki_document_boundary_contract_v1";
  const ARCHETYPES = Object.freeze(["concept_reference", "procedure_workflow", "decision_guide", "case_context", "source_guide"]);
  const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function fail(reason, field) { return freeze({ ok: false, status: "invalid", reason, field: field || null, writer_count: 0 }); }
  function normalizeKey(value) { return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : ""; }
  function pair(value) {
    return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "string" && item.length > 0) && value[0] !== value[1]
      ? [...value].sort((a, b) => a.localeCompare(b, "en")) : null;
  }

  function createPageIdentity(input) {
    if (!plain(input)) return fail("page_identity_required", "input");
    const canonicalKey = normalizeKey(input.canonical_key);
    if (!KEY.test(canonicalKey)) return fail("invalid_canonical_key", "canonical_key");
    if (!ARCHETYPES.includes(input.archetype)) return fail("invalid_page_archetype", "archetype");
    if (typeof input.reader_question !== "string" || !input.reader_question.trim()) return fail("reader_question_required", "reader_question");
    const identityHash = hashApi.sha256(`${CONTRACT_VERSION}:${canonicalKey}:${input.archetype}`);
    return freeze({
      ok: true,
      status: "valid",
      contract_version: CONTRACT_VERSION,
      value: {
        page_id: `page_${identityHash.slice(0, 24)}`,
        canonical_key: canonicalKey,
        archetype: input.archetype,
        reader_question: input.reader_question.trim(),
      },
      writer_count: 0,
    });
  }

  function validatePlan(input) {
    if (!plain(input) || !Array.isArray(input.pages) || !Array.isArray(input.must_link) || !Array.isArray(input.cannot_link)) {
      return fail("invalid_boundary_plan", "input");
    }
    const membership = new Map();
    for (let pageIndex = 0; pageIndex < input.pages.length; pageIndex += 1) {
      const page = input.pages[pageIndex];
      if (!plain(page) || typeof page.page_id !== "string" || !KEY.test(normalizeKey(page.canonical_key))
        || !ARCHETYPES.includes(page.archetype) || typeof page.reader_question !== "string" || !page.reader_question.trim()
        || !Array.isArray(page.claim_ids) || new Set(page.claim_ids).size !== page.claim_ids.length
        || page.claim_ids.some((claimId) => typeof claimId !== "string" || !claimId)) {
        return fail("invalid_boundary_page", `pages.${pageIndex}`);
      }
      for (const claimId of page.claim_ids) {
        if (!membership.has(claimId)) membership.set(claimId, []);
        membership.get(claimId).push(page.page_id);
      }
    }
    const duplicateClaims = [...membership.entries()].filter(([, pageIds]) => pageIds.length > 1).map(([claimId]) => claimId).sort();
    if (duplicateClaims.length) return fail("claim_owner_not_unique", "pages");
    const mustLinks = input.must_link.map(pair);
    const cannotLinks = input.cannot_link.map(pair);
    if (mustLinks.some((row) => !row) || cannotLinks.some((row) => !row)) return fail("invalid_boundary_constraint", "constraints");
    const findings = [];
    for (const [left, right] of mustLinks) {
      const leftPages = membership.get(left) || [];
      const rightPages = membership.get(right) || [];
      if (leftPages.length && rightPages.length && leftPages[0] !== rightPages[0]) findings.push({ code: "must_link_violation", claim_ids: [left, right], page_ids: [leftPages[0], rightPages[0]] });
    }
    for (const [left, right] of cannotLinks) {
      const leftPages = membership.get(left) || [];
      const rightPages = membership.get(right) || [];
      if (leftPages.length && rightPages.length && leftPages[0] === rightPages[0]) findings.push({ code: "cannot_link_violation", claim_ids: [left, right], page_ids: [leftPages[0]] });
    }
    findings.sort((a, b) => a.code.localeCompare(b.code, "en") || a.claim_ids.join("\0").localeCompare(b.claim_ids.join("\0"), "en"));
    return freeze({ ok: true, status: findings.length ? "revision_required" : "pass", contract_version: CONTRACT_VERSION, findings, writer_count: 0 });
  }

  const api = freeze({ CONTRACT_VERSION, ARCHETYPES, createPageIdentity, validatePlan });
  root.LLMWikiDocumentBoundaryContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
