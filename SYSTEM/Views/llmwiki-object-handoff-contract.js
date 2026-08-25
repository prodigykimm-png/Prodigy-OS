(function (root) {
  "use strict";

  const OBJECT_TYPES = Object.freeze(["people", "project", "venue", "auction", "region"]);
  const TARGET_SLOTS = Object.freeze({
    people: Object.freeze(["core_interaction", "memo"]),
    project: Object.freeze(["progress_note", "review_lesson", "related_knowledge"]),
    venue: Object.freeze(["memo", "related_knowledge"]),
    auction: Object.freeze(["auction_note", "review_lesson", "related_knowledge"]),
    region: Object.freeze(["direct_experience", "research_reference", "briefing_memo", "related_knowledge"])
  });
  // This is an authority map, not provider input. Domain adapters must dispatch
  // only to these existing Object owners and never accept a path or heading.
  const OBJECT_AUTHORITIES = Object.freeze({
    people: Object.freeze({ core_interaction: "PeopleStore.appendPeopleInsight", memo: "PeopleStore.appendMemo" }),
    project: Object.freeze({ progress_note: "ProjectContextAdapter.appendProgressNote", review_lesson: "ProjectContextAdapter.appendReviewLesson", related_knowledge: "KnowledgeParaProjection.appendRelatedKnowledge" }),
    venue: Object.freeze({ memo: "VenueStore.appendHandoffMemo", related_knowledge: "KnowledgeParaProjection.appendRelatedKnowledge" }),
    auction: Object.freeze({ auction_note: "AuctionContextAdapter.appendAuctionNote", review_lesson: "AuctionContextAdapter.appendReviewLesson", related_knowledge: "KnowledgeParaProjection.appendRelatedKnowledge" }),
    region: Object.freeze({ direct_experience: "RegionExperienceHandoff.appendDirectExperience", research_reference: "RegionExperienceHandoff.appendResearchReference", briefing_memo: "RegionExperienceHandoff.appendBriefingMemo", related_knowledge: "KnowledgeParaProjection.appendRelatedKnowledge" })
  });
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const productionRegistries = new WeakSet();
  const services = new WeakSet();

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function result(value) { return freeze({ ok: true, value }); }
  function failure(reason, field) { return freeze({ ok: false, reason, ...(field ? { field } : {}) }); }
  function exactKeys(value, keys) {
    if (!plain(value)) return false;
    const actual = Object.keys(value);
    return actual.length === keys.length && actual.every((key) => keys.includes(key));
  }
  function hasOnly(value, keys) {
    if (!plain(value)) return failure("malformed_input");
    const unknown = Object.keys(value).find((key) => !keys.includes(key));
    return unknown ? failure("unknown_field", unknown) : null;
  }
  function validId(value) { return ID.test(text(value)); }
  function validateIds(value, field) {
    if (!Array.isArray(value) || value.some((item) => !validId(item)) || new Set(value).size !== value.length) return failure("invalid_lifecycle_links", field);
    return Object.freeze(value.slice());
  }
  function isRelatedKnowledge(slot) { return slot === "related_knowledge"; }
  function unsafeInstruction(value) {
    return /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|above)(?:\s+(?:system|developer))?\s+(?:instructions?|prompts?|rules?)|(?:ignore|disregard|override)\s+(?:system|developer)\s+(?:instructions?|prompts?|rules?)|\b(?:system prompt|developer message)\b|이전\s*(?:지시|명령|규칙).{0,16}(?:무시|덮어)|(?:시스템|개발자)\s*(?:프롬프트|메시지)/iu.test(value);
  }

  function validateDraft(input) {
    const permitted = ["handoff_id", "object_type", "object_id", "slot", "text", "knowledge_id", "linked_lifecycle_ids"];
    const unknown = hasOnly(input, permitted);
    if (unknown) return unknown;
    const handoffId = text(input.handoff_id);
    const objectType = text(input.object_type);
    const objectId = text(input.object_id);
    const slot = text(input.slot);
    if (!validId(handoffId)) return failure("invalid_handoff_id", "handoff_id");
    if (!OBJECT_TYPES.includes(objectType)) return failure("unknown_object_type", "object_type");
    if (!validId(objectId)) return failure("invalid_object_id", "object_id");
    if (!TARGET_SLOTS[objectType].includes(slot)) return failure("unknown_target_slot", "slot");
    const linked = validateIds(input.linked_lifecycle_ids, "linked_lifecycle_ids");
    if (linked && linked.ok === false) return linked;
    if (isRelatedKnowledge(slot)) {
      if (text(input.text) || !validId(input.knowledge_id)) return failure("related_knowledge_requires_local_knowledge_id", "knowledge_id");
      return result({ handoff_id: handoffId, object_type: objectType, object_id: objectId, slot, knowledge_id: text(input.knowledge_id), linked_lifecycle_ids: linked });
    }
    const entry = text(input.text);
    if (!entry || entry.length > 1000 || /[\r\n]/.test(entry)) return failure("invalid_handoff_text", "text");
    if (unsafeInstruction(entry)) return failure("prompt_injection", "text");
    if (text(input.knowledge_id)) return failure("knowledge_id_only_for_related_knowledge", "knowledge_id");
    return result({ handoff_id: handoffId, object_type: objectType, object_id: objectId, slot, text: entry, linked_lifecycle_ids: linked });
  }

  function normalizeObject(raw, objectType, objectId) {
    if (!plain(raw) || text(raw.object_id) !== objectId || text(raw.object_type) !== objectType || !text(raw.path) || typeof raw.revision !== "string" || typeof raw.bytes !== "string") return null;
    return freeze({ object_id: objectId, object_type: objectType, path: text(raw.path), revision: raw.revision, bytes: raw.bytes });
  }
  function normalizeKnowledge(raw, knowledgeId) {
    if (!plain(raw) || text(raw.knowledge_id) !== knowledgeId || !text(raw.path)) return null;
    const path = text(raw.path).replace(/\\/g, "/").replace(/\.md$/i, "");
    if (!path || /(^|\/)\.?(?:\.|$)/.test(path)) return null;
    return freeze({ knowledge_id: knowledgeId, path, link: `[[${path}]]` });
  }

  function createLocalObjectResolver(records) {
    const source = Array.isArray(records) ? records.slice() : [];
    const index = new Map();
    for (const record of source) {
      if (!plain(record) || !validId(record.object_id) || !OBJECT_TYPES.includes(text(record.object_type))) throw new Error("Object resolver requires stable local object records.");
      const key = `${record.object_type}\x1f${record.object_id}`;
      if (index.has(key)) throw new Error("Object resolver cannot contain duplicate stable IDs.");
      index.set(key, record);
    }
    return Object.freeze({ resolve(objectType, objectId) { return index.get(`${objectType}\x1f${objectId}`) || null; } });
  }

  function createLocalKnowledgeResolver(records) {
    const source = Array.isArray(records) ? records.slice() : [];
    const index = new Map();
    for (const record of source) {
      if (!plain(record) || !validId(record.knowledge_id) || !text(record.path) || index.has(record.knowledge_id)) throw new Error("Knowledge resolver requires unique stable local records.");
      index.set(record.knowledge_id, record);
    }
    return Object.freeze({ resolve(knowledgeId) { return index.get(knowledgeId) || null; } });
  }

  function moduleApi(name, path) {
    return root[name] || (typeof require === "function" ? require(path) : null);
  }
  function typedFile(app, object) {
    const file = app && app.vault && typeof app.vault.getAbstractFileByPath === "function" ? app.vault.getAbstractFileByPath(object.path) : null;
    if (!file || file.path !== object.path || file.extension !== "md") throw new Error("object_target_missing");
    return file;
  }
  function requireMethods(api, owner, methods) {
    if (!api || methods.some((method) => typeof api[method] !== "function")) throw new Error(`${owner} authority unavailable.`);
    return api;
  }
  function createProductionAdapterRegistry() {
    const people = requireMethods(moduleApi("PeopleStore", "./people-store.js"), "PeopleStore", ["appendPeopleInsight", "appendMemo"]);
    const project = requireMethods(moduleApi("ProjectContextAdapter", "./project-context-adapter.js"), "ProjectContextAdapter", ["appendProgressNote", "appendReviewLesson"]);
    const venue = requireMethods(moduleApi("VenueStore", "./venue-store.js"), "VenueStore", ["appendHandoffMemo"]);
    const auction = requireMethods(moduleApi("AuctionContextAdapter", "./auction-context-adapter.js"), "AuctionContextAdapter", ["appendAuctionNote", "appendReviewLesson"]);
    const region = requireMethods(moduleApi("RegionExperienceHandoff", "./region-experience-handoff.js"), "RegionExperienceHandoff", ["appendDirectExperience", "appendResearchReference", "appendBriefingMemo"]);
    const links = requireMethods(moduleApi("KnowledgeParaProjection", "./knowledge-para-projection.js"), "KnowledgeParaProjection", ["appendRelatedKnowledge"]);
    const read = async (app, object) => ({ revision: object.revision, bytes: await app.vault.read(typedFile(app, object)) });
    const related = (app, object, entry) => links.appendRelatedKnowledge(app, object, entry);
    const registry = Object.freeze({
      people: Object.freeze({ read, append: (app, object, entry) => entry.slot === "core_interaction" ? people.appendPeopleInsight(app, object.path, { insight: entry.text, handoff_id: entry.handoff_id, linked_lifecycle_ids: entry.linked_lifecycle_ids }) : entry.slot === "memo" ? people.appendMemo(app, object.path, { text: entry.text, handoff_id: entry.handoff_id, linked_lifecycle_ids: entry.linked_lifecycle_ids }) : Promise.reject(new Error("unknown_target_slot")) }),
      project: Object.freeze({ read, append: (app, object, entry) => entry.slot === "progress_note" ? project.appendProgressNote(app, object, entry) : entry.slot === "review_lesson" ? project.appendReviewLesson(app, object, entry) : entry.slot === "related_knowledge" ? related(app, object, entry) : Promise.reject(new Error("unknown_target_slot")) }),
      venue: Object.freeze({ read, append: (app, object, entry) => entry.slot === "memo" ? venue.appendHandoffMemo(app, object, entry) : entry.slot === "related_knowledge" ? related(app, object, entry) : Promise.reject(new Error("unknown_target_slot")) }),
      auction: Object.freeze({ read, append: (app, object, entry) => entry.slot === "auction_note" ? auction.appendAuctionNote(app, object, entry) : entry.slot === "review_lesson" ? auction.appendReviewLesson(app, object, entry) : entry.slot === "related_knowledge" ? related(app, object, entry) : Promise.reject(new Error("unknown_target_slot")) }),
      region: Object.freeze({ read, append: (app, object, entry) => entry.slot === "direct_experience" ? region.appendDirectExperience(app, object, entry) : entry.slot === "research_reference" ? region.appendResearchReference(app, object, entry) : entry.slot === "briefing_memo" ? region.appendBriefingMemo(app, object, entry) : entry.slot === "related_knowledge" ? related(app, object, entry) : Promise.reject(new Error("unknown_target_slot")) })
    });
    productionRegistries.add(registry);
    return registry;
  }

  function approvalFor(value, proposal) {
    if (!exactKeys(value, ["object_type", "handoff_id", "decision"])) return failure("invalid_domain_approval");
    if (value.object_type !== proposal.object_type || value.handoff_id !== proposal.handoff_id) return failure("approval_target_mismatch");
    if (value.decision !== "approve" && value.decision !== "reject") return failure("invalid_domain_approval");
    return result(freeze({ object_type: proposal.object_type, handoff_id: proposal.handoff_id, decision: value.decision }));
  }

  function create(options) {
    const source = options || {};
    const registry = source.registry;
    const objectResolver = source.objectResolver;
    const knowledgeResolver = source.knowledgeResolver || createLocalKnowledgeResolver([]);
    if (!productionRegistries.has(registry) || !objectResolver || typeof objectResolver.resolve !== "function" || typeof knowledgeResolver.resolve !== "function") throw new Error("Production Object registry and local resolvers are required.");
    const issued = new Map();
    const applied = new Set();
    const inFlight = new Map();

    async function propose(input) {
      const draft = validateDraft(input);
      if (draft.ok !== true) return draft;
      if (issued.has(draft.value.handoff_id)) return failure("duplicate_handoff_id", "handoff_id");
      const resolved = normalizeObject(await objectResolver.resolve(draft.value.object_type, draft.value.object_id), draft.value.object_type, draft.value.object_id);
      if (!resolved) return failure("unknown_object", "object_id");
      let knowledge = null;
      if (draft.value.knowledge_id) {
        knowledge = normalizeKnowledge(await knowledgeResolver.resolve(draft.value.knowledge_id), draft.value.knowledge_id);
        if (!knowledge) return failure("unknown_knowledge", "knowledge_id");
      }
      const proposal = freeze({
        contract_version: "llmwiki_object_handoff_v1",
        handoff_id: draft.value.handoff_id,
        object_type: draft.value.object_type,
        object_id: draft.value.object_id,
        target: freeze({ path: resolved.path, slot: draft.value.slot }),
        before: freeze({ revision: resolved.revision, bytes: resolved.bytes }),
        ...(draft.value.text ? { text: draft.value.text } : { knowledge: knowledge }),
        linked_lifecycle_ids: draft.value.linked_lifecycle_ids
      });
      issued.set(proposal.handoff_id, proposal);
      return result(proposal);
    }

    async function apply(app, request) {
      if (!plain(request) || !Object.hasOwn(request, "proposal") || !Object.hasOwn(request, "approval") || Object.keys(request).length !== 2) return failure("malformed_apply_request");
      const proposal = request.proposal;
      if (!proposal || issued.get(proposal.handoff_id) !== proposal) return failure("unissued_proposal");
      const approval = approvalFor(request.approval, proposal);
      if (approval.ok !== true) return approval;
      if (approval.value.decision === "reject") return freeze({ ok: true, status: "rejected", handoff_id: proposal.handoff_id });
      if (applied.has(proposal.handoff_id)) return freeze({ ok: true, status: "unchanged", handoff_id: proposal.handoff_id });
      if (inFlight.has(proposal.handoff_id)) {
        const settled = await inFlight.get(proposal.handoff_id);
        return settled.ok ? freeze({ ok: true, status: "unchanged", handoff_id: proposal.handoff_id }) : settled;
      }
      const execution = (async () => {
        try {
          const adapter = registry[proposal.object_type];
          const object = normalizeObject(await objectResolver.resolve(proposal.object_type, proposal.object_id), proposal.object_type, proposal.object_id);
          if (!object) return freeze({ ok: false, status: "stale", reason: "unknown_object", handoff_id: proposal.handoff_id });
          const current = await adapter.read(app, object);
          if (!plain(current) || typeof current.revision !== "string" || typeof current.bytes !== "string" || current.revision !== proposal.before.revision || current.bytes !== proposal.before.bytes) return freeze({ ok: false, status: "stale", reason: "before_mismatch", handoff_id: proposal.handoff_id });
          await adapter.append(app, object, freeze({ handoff_id: proposal.handoff_id, object_type: proposal.object_type, slot: proposal.target.slot, text: proposal.text || proposal.knowledge.link, linked_lifecycle_ids: proposal.linked_lifecycle_ids }));
          applied.add(proposal.handoff_id);
          return freeze({ ok: true, status: "appended", handoff_id: proposal.handoff_id, target: proposal.target, linked_lifecycle_ids: proposal.linked_lifecycle_ids });
        } catch (error) { return freeze({ ok: false, status: "failed", reason: "domain_append_failed", handoff_id: proposal.handoff_id }); }
      })();
      inFlight.set(proposal.handoff_id, execution);
      try { return await execution; } finally { inFlight.delete(proposal.handoff_id); }
    }
    const service = Object.freeze({ propose, apply });
    services.add(service);
    return service;
  }

  function isService(value) { return Boolean(value && services.has(value)); }

  function splitMixedHandoff(input) {
    const unknown = hasOnly(input, ["unit_id", "operational", "epistemic"]);
    if (unknown) return unknown;
    const unitId = text(input && input.unit_id);
    if (!validId(unitId)) return failure("invalid_unit_id", "unit_id");
    const operational = validateDraft(input.operational);
    if (operational.ok !== true) return operational;
    if (!plain(input.epistemic) || !exactKeys(input.epistemic, ["lifecycle_id", "destination"]) || !validId(input.epistemic.lifecycle_id) || !["knowledge_candidate", "canonical_knowledge"].includes(input.epistemic.destination)) return failure("invalid_epistemic_component", "epistemic");
    const linkId = `link_${unitId}`;
    return result(freeze({
      lane: "mixed",
      link_id: linkId,
      operational: freeze({ ...operational.value, link_id: linkId }),
      epistemic: freeze({ lifecycle_id: input.epistemic.lifecycle_id, destination: input.epistemic.destination, link_id: linkId })
    }));
  }

  const api = freeze({ OBJECT_TYPES, TARGET_SLOTS, OBJECT_AUTHORITIES, createProductionAdapterRegistry, createLocalObjectResolver, createLocalKnowledgeResolver, create, isService, splitMixedHandoff });
  root.LLMWikiObjectHandoffContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
