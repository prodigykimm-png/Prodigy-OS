(function (root) {
  "use strict";

  const assemblerApi = root.LLMWikiDocumentAssembler || (typeof require === "function" ? require("./llmwiki-document-assembler.js") : null);
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!assemblerApi || typeof assemblerApi.renderDocument !== "function") throw new Error("LLMWikiDocumentAssembler is required.");
  if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWikiHash is required.");
  const PAGE_PLAN_VERSION = "llmwiki_page_plan_v1";
  const CLAIM_INVENTORY_VERSION = "llmwiki_claim_inventory_v1";
  const PLAN_SCHEMA = Object.freeze({
    type: "object", additionalProperties: false,
    required: ["source_guide", "topic_pages", "source_only_claim_ids"],
    properties: {
      source_guide: {
        type: "object", additionalProperties: false,
        required: ["overview", "sections", "key_questions"],
        properties: {
          overview: { type: "string", minLength: 1, maxLength: 2000 },
          sections: {
            type: "array", minItems: 1, maxItems: 16,
            items: {
              type: "object", additionalProperties: false, required: ["heading", "summary", "claim_ids"],
              properties: {
                heading: { type: "string", minLength: 1, maxLength: 120 },
                summary: { type: "string", minLength: 1, maxLength: 1000 },
                claim_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", pattern: "^claim_[0-9a-f]{24}$" } },
              },
            },
          },
          key_questions: {
            type: "array", maxItems: 8, uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 240 },
          },
        },
      },
      topic_pages: {
        type: "array", maxItems: 20,
        items: {
          type: "object", additionalProperties: false,
          required: ["title", "purpose", "claim_ids", "target_candidate_ids"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 120 },
            purpose: { type: "string", minLength: 1, maxLength: 500 },
            claim_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", pattern: "^claim_[0-9a-f]{24}$" } },
            target_candidate_ids: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", pattern: "^cand_[A-Za-z0-9_-]{1,64}$" } },
          },
        },
      },
      source_only_claim_ids: { type: "array", uniqueItems: true, items: { type: "string", pattern: "^claim_[0-9a-f]{24}$" } },
    },
  });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha(value) { return hashApi.sha256(String(value)); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function uniqueRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = JSON.stringify([row.source_id, row.evidence_quote, row.locators]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function claimsOf(documents) { return documents.flatMap((document) => Array.isArray(document.claims) ? document.claims : []); }
  function validDocument(value, role) {
    return plain(value) && value.role === role && clean(value.title) && Array.isArray(value.claims)
      && Array.isArray(value.citations) && Array.isArray(value.sections);
  }
  function sourceTitle(path) {
    const value = clean(path).split("/").pop() || "자료";
    return value.replace(/\.md$/iu, "").trim() || "자료";
  }
  function exactPartition(values, expected) {
    return values.length === expected.size && new Set(values).size === values.length && values.every((id) => expected.has(id));
  }

  function createClaimInventory(input) {
    if (!plain(input) || !plain(input.source) || !Array.isArray(input.documents)) return freeze({ ok: false, reason: "invalid_claim_inventory_input" });
    const source = input.source;
    if (!clean(source.source_id) || !clean(source.source_path) || !/^[0-9a-f]{64}$/u.test(clean(source.content_hash))) {
      return freeze({ ok: false, reason: "invalid_claim_inventory_source" });
    }
    const documents = input.documents;
    if (documents.some((document) => !validDocument(document, document.role)
      || !["source_summary", "reusable_claim"].includes(document.role))) {
      return freeze({ ok: false, reason: "invalid_claim_inventory_document" });
    }
    const citationRows = [];
    const citationByKey = new Map();
    const claims = [];
    for (const document of documents) {
      const documentCitationIds = [];
      for (const citation of document.citations) {
        const key = stable([citation.source_id, citation.content_hash, citation.locators, citation.evidence_quote]);
        let citationId = citationByKey.get(key);
        if (!citationId) {
          citationId = `citation_${sha(key).slice(0, 24)}`;
          citationByKey.set(key, citationId);
          citationRows.push(freeze({ citation_id: citationId, ...citation }));
        }
        documentCitationIds.push(citationId);
      }
      for (let index = 0; index < document.claims.length; index += 1) {
        const text = clean(document.claims[index]?.text);
        if (!text) return freeze({ ok: false, reason: "invalid_claim_inventory_claim" });
        const claimCitationIds = document.citations.length === document.claims.length
          ? [documentCitationIds[index]] : documentCitationIds;
        const identity = stable([source.source_id, document.role, document.title, text, claimCitationIds]);
        const claimId = `claim_${sha(identity).slice(0, 24)}`;
        if (claims.some((claim) => claim.claim_id === claimId)) continue;
        claims.push(freeze({
          claim_id: claimId,
          role: document.role,
          topic: clean(document.title),
          text,
          citation_ids: [...new Set(claimCitationIds)].filter(Boolean),
          suggested_candidate_ids: [...new Set(document.matched_candidate_ids || [])],
        }));
      }
    }
    if (claims.length === 0 || claims.some((claim) => claim.citation_ids.length === 0)) {
      return freeze({ ok: false, reason: "claim_inventory_provenance_required" });
    }
    const body = {
      inventory_version: CLAIM_INVENTORY_VERSION,
      source: { source_id: source.source_id, source_path: source.source_path, content_hash: source.content_hash },
      claims,
      citations: citationRows,
    };
    return freeze({ ok: true, value: freeze({ ...body, inventory_hash: sha(stable(body)) }) });
  }

  function createPagePlanner(options = {}) {
    if (typeof options.requestPlan !== "function") throw new TypeError("page_plan_provider_required");
    const allowed = new Set(Array.isArray(options.allowedCandidateIds) ? options.allowedCandidateIds : []);

    async function plan(input) {
      const inventory = input && input.inventory;
      if (!plain(inventory) || inventory.inventory_version !== CLAIM_INVENTORY_VERSION
        || !Array.isArray(inventory.claims) || !Array.isArray(inventory.citations)
        || inventory.inventory_hash !== sha(stable({
          inventory_version: inventory.inventory_version,
          source: inventory.source,
          claims: inventory.claims,
          citations: inventory.citations,
        }))) return freeze({ ok: false, reason: "invalid_claim_inventory" });
      let draft;
      try {
        draft = await options.requestPlan(freeze({
          source: inventory.source,
          inventory_hash: inventory.inventory_hash,
          claims: inventory.claims,
          citations: inventory.citations,
          allowed_candidate_ids: [...allowed].sort(),
        }));
      } catch (error) {
        return freeze({ ok: false, reason: "page_plan_provider_failed", provider_error: clean(error?.message) || "unknown_provider_error" });
      }
      if (!plain(draft) || Object.keys(draft).some((key) => !["source_guide", "topic_pages", "source_only_claim_ids"].includes(key))
        || !plain(draft.source_guide) || !Array.isArray(draft.topic_pages) || !Array.isArray(draft.source_only_claim_ids)) {
        return freeze({ ok: false, reason: "invalid_page_plan" });
      }
      const guide = draft.source_guide;
      if (Object.keys(guide).some((key) => !["overview", "sections", "key_questions"].includes(key))
        || !clean(guide.overview) || !Array.isArray(guide.sections) || guide.sections.length === 0 || guide.sections.length > 16
        || !Array.isArray(guide.key_questions) || guide.key_questions.length > 8
        || guide.key_questions.some((question) => !clean(question))
        || guide.sections.some((section) => !plain(section)
          || Object.keys(section).some((key) => !["heading", "summary", "claim_ids"].includes(key))
          || !clean(section.heading) || !clean(section.summary) || !Array.isArray(section.claim_ids) || section.claim_ids.length === 0)) {
        return freeze({ ok: false, reason: "invalid_source_guide" });
      }
      const allClaimIds = new Set(inventory.claims.map((claim) => claim.claim_id));
      const reusableClaims = inventory.claims.filter((claim) => claim.role === "reusable_claim");
      const reusableClaimIds = new Set(reusableClaims.map((claim) => claim.claim_id));
      const guideIds = guide.sections.flatMap((section) => section.claim_ids);
      const pageIds = draft.topic_pages.flatMap((page) => plain(page) && Array.isArray(page.claim_ids) ? page.claim_ids : []);
      const partitionIds = [...pageIds, ...draft.source_only_claim_ids];
      const validPageShape = draft.topic_pages.length <= 20 && draft.topic_pages.every((page) => plain(page)
        && !Object.keys(page).some((key) => !["title", "purpose", "claim_ids", "target_candidate_ids"].includes(key))
        && clean(page.title) && clean(page.purpose)
        && Array.isArray(page.claim_ids) && page.claim_ids.length > 0
        && new Set(page.claim_ids).size === page.claim_ids.length
        && page.claim_ids.every((claimId) => reusableClaimIds.has(claimId))
        && Array.isArray(page.target_candidate_ids)
        && new Set(page.target_candidate_ids).size === page.target_candidate_ids.length
        && page.target_candidate_ids.every((candidateId) => allowed.has(candidateId)));
      if (!validPageShape || !exactPartition(guideIds, allClaimIds) || !exactPartition(partitionIds, reusableClaimIds)) {
        return freeze({ ok: false, reason: "invalid_page_plan_coverage" });
      }
      const citationIdsByClaim = new Map(inventory.claims.map((claim) => [claim.claim_id, claim.citation_ids]));
      for (const page of draft.topic_pages) {
        const evidenceIds = new Set(page.claim_ids.flatMap((claimId) => citationIdsByClaim.get(claimId) || []));
        if (page.target_candidate_ids.length === 0 && (page.claim_ids.length < 2 || evidenceIds.size < 2)) {
          return freeze({ ok: false, reason: "new_page_requires_multiple_evidence" });
        }
      }
      const pages = draft.topic_pages.map((page) => {
        const normalized = {
          title: clean(page.title),
          purpose: clean(page.purpose),
          claim_ids: [...page.claim_ids],
          target_candidate_ids: [...page.target_candidate_ids],
        };
        const operationHint = normalized.target_candidate_ids.length > 1 ? "merge"
          : normalized.target_candidate_ids.length === 1 ? "update" : "create";
        return freeze({
          page_id: `page_${sha(stable([inventory.inventory_hash, normalized])).slice(0, 24)}`,
          ...normalized,
          operation_hint: operationHint,
          evidence_count: new Set(normalized.claim_ids.flatMap((claimId) => citationIdsByClaim.get(claimId) || [])).size,
          selected: true,
        });
      });
      const sourceGuide = freeze({
        title: `${sourceTitle(inventory.source.source_path)} 자료 안내`,
        overview: clean(guide.overview),
        sections: guide.sections.map((section) => freeze({
          heading: clean(section.heading),
          summary: clean(section.summary),
          claim_ids: [...section.claim_ids],
        })),
        key_questions: guide.key_questions.map(clean),
      });
      const body = {
        plan_version: PAGE_PLAN_VERSION,
        inventory_hash: inventory.inventory_hash,
        source: inventory.source,
        source_guide: sourceGuide,
        pages,
        source_only_claim_ids: [...draft.source_only_claim_ids],
        status: "pending_review",
        plan_revision: 1,
      };
      return freeze({ ok: true, value: freeze({ ...body, plan_hash: sha(stable(body)) }) });
    }
    return freeze({ plan });
  }

  function createDocumentReducer(options = {}) {
    if (typeof options.requestPlan !== "function") throw new TypeError("document_reduce_provider_required");

    async function reduce(input) {
      const source = input && input.source_document;
      const topics = input && input.topic_documents;
      if (!validDocument(source, "source_summary") || !Array.isArray(topics) || topics.some((document) => !validDocument(document, "reusable_claim"))) {
        return freeze({ ok: false, reason: "invalid_reduce_input" });
      }
      const sourceEntries = source.sections.map((section, index) => freeze({
        entry_id: `source_${String(index + 1).padStart(3, "0")}`,
        topic: clean(section.heading) || "전체 개요",
        claims: Array.isArray(section.claims) ? section.claims.map((claim) => clean(claim.text)).filter(Boolean) : [],
      }));
      const topicEntries = topics.map((document, index) => freeze({
        entry_id: `topic_${String(index + 1).padStart(3, "0")}`,
        topic: clean(document.title),
        claims: document.claims.map((claim) => clean(claim.text)).filter(Boolean),
      }));
      let plan;
      try { plan = await options.requestPlan(freeze({ source_entries: sourceEntries, topic_entries: topicEntries })); }
      catch (_error) { return freeze({ ok: false, reason: "document_reduce_provider_failed" }); }
      if (!plain(plan) || Object.keys(plan).some((key) => !["source_sections", "topic_documents", "source_only_entry_ids"].includes(key))
        || !Array.isArray(plan.source_sections) || !Array.isArray(plan.topic_documents) || !Array.isArray(plan.source_only_entry_ids)) {
        return freeze({ ok: false, reason: "invalid_reduce_plan" });
      }
      const sourceIds = new Set(sourceEntries.map((entry) => entry.entry_id));
      const topicIds = new Set(topicEntries.map((entry) => entry.entry_id));
      const usedSource = plan.source_sections.flatMap((section) => plain(section) && Array.isArray(section.entry_ids) ? section.entry_ids : []);
      const usedTopic = [...plan.topic_documents.flatMap((document) => plain(document) && Array.isArray(document.entry_ids) ? document.entry_ids : []), ...plan.source_only_entry_ids];
      const exactCoverage = (used, expected) => used.length === expected.size && new Set(used).size === used.length && used.every((id) => expected.has(id));
      if (!exactCoverage(usedSource, sourceIds) || !exactCoverage(usedTopic, topicIds)
        || plan.source_sections.length > 16 || plan.topic_documents.length > 20
        || plan.source_sections.some((section) => !plain(section) || !clean(section.heading) || !Array.isArray(section.entry_ids) || section.entry_ids.length === 0)
        || plan.topic_documents.some((document) => !plain(document) || !clean(document.title) || !Array.isArray(document.entry_ids) || document.entry_ids.length < 2)) {
        return freeze({ ok: false, reason: "invalid_reduce_coverage" });
      }
      const sourceById = new Map(sourceEntries.map((entry, index) => [entry.entry_id, source.sections[index]]));
      const topicById = new Map(topicEntries.map((entry, index) => [entry.entry_id, topics[index]]));
      const sourceSections = plan.source_sections.map((section) => freeze({
        heading: clean(section.heading),
        claims: section.entry_ids.flatMap((id) => sourceById.get(id).claims),
      }));
      const sourceOnlyDocuments = plan.source_only_entry_ids.map((id) => topicById.get(id));
      if (sourceOnlyDocuments.length) sourceSections.push(freeze({ heading: "추가 단독 정보", claims: claimsOf(sourceOnlyDocuments) }));
      const sourceClaims = [...source.claims, ...claimsOf(sourceOnlyDocuments)];
      const sourceCitations = uniqueRows([...source.citations, ...sourceOnlyDocuments.flatMap((document) => document.citations)]);
      const sourceDocument = freeze({
        ...source,
        claims: sourceClaims,
        citations: sourceCitations,
        sections: sourceSections,
        body: assemblerApi.renderDocument(source.title, "source_summary", sourceSections, sourceClaims, sourceCitations),
      });
      const topicDocuments = plan.topic_documents.map((documentPlan) => {
        const inputs = documentPlan.entry_ids.map((id) => topicById.get(id));
        const claims = claimsOf(inputs);
        const citations = uniqueRows(inputs.flatMap((document) => document.citations));
        const title = clean(documentPlan.title);
        const sections = [freeze({ heading: title, claims })];
        return freeze({
          contract_version: assemblerApi.CONTRACT_VERSION, role: "reusable_claim", title, sections, claims, citations,
          review_reasons: [...new Set(inputs.flatMap((document) => document.review_reasons || []))],
          related_candidate_ids: [...new Set(inputs.flatMap((document) => document.related_candidate_ids || []))],
          matched_candidate_ids: [...new Set(inputs.flatMap((document) => document.matched_candidate_ids || []))],
          operation_hint: "create",
          body: assemblerApi.renderDocument(title, "reusable_claim", sections, claims, citations),
        });
      });
      const inputClaimCount = source.claims.length + claimsOf(topics).length;
      const documents = [sourceDocument, ...topicDocuments];
      const outputClaimCount = claimsOf(documents).length;
      return freeze({
        ok: true, documents, input_claim_count: inputClaimCount, output_claim_count: outputClaimCount,
        dropped_claim_count: inputClaimCount - outputClaimCount,
      });
    }
    return freeze({ reduce });
  }

  const api = freeze({
    PLAN_SCHEMA,
    PAGE_PLAN_VERSION,
    CLAIM_INVENTORY_VERSION,
    createClaimInventory,
    createPagePlanner,
    createDocumentReducer,
  });
  root.LLMWikiDocumentReducer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
