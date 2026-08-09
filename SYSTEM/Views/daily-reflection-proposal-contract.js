(function (root) {
  "use strict";

  if (!root.DailyReflectionVenuePolicy && typeof require === "function") {
    root.DailyReflectionVenuePolicy = require("./daily-reflection-venue-policy.js");
  }
  if (!root.KnowledgeExplorerRegistry && typeof require === "function") {
    root.KnowledgeExplorerRegistry = require("./knowledge-explorer-registry.js");
  }

  const TOP_LEVEL_KEYS = Object.freeze(["evidence_blocks", "knowledge_candidates", "resource_candidates", "object_linking_suggestions", "pre_routing_suggestions", "uncertainties"]);
  const BLOCK_KEYS = Object.freeze(["title", "context", "experience", "interpretation", "change", "next_experiment", "related_objects"]);
  const CONTEXTS = new Set(["", "people", "auction", "workout", "reading", "project", "work", "personal", "health", "decision", "integrity"]);
  const CONFIDENCE = new Set(["explicit", "inferred", "low"]);
  const CANDIDATE_TYPES = new Set(["resource", "venue"]);
  const DOMAIN_ORDER = new Set(root.KnowledgeExplorerRegistry.DOMAIN_ORDER);
  const TOPICS_BY_DOMAIN = root.KnowledgeExplorerRegistry.TOPICS_BY_DOMAIN;

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function taxonomy(item, label) {
    const suggested_domain = clean(item.suggested_domain).toLowerCase();
    const suggested_topics = Array.from(new Set((Array.isArray(item.suggested_topics) ? item.suggested_topics : []).map(clean).filter(Boolean)));
    if (!suggested_domain && suggested_topics.length) throw new Error(`${label} topics require a valid domain.`);
    if (suggested_domain && !DOMAIN_ORDER.has(suggested_domain)) throw new Error(`${label} domain is invalid.`);
    const permitted = suggested_domain ? new Set(TOPICS_BY_DOMAIN[suggested_domain] || []) : new Set();
    if (suggested_topics.some((topic) => !permitted.has(topic))) throw new Error(`${label} topics are invalid for the domain.`);
    return { suggested_domain, suggested_topics };
  }
  function assertPlainObject(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`); }
  function assertKeys(value, allowed, label) {
    assertPlainObject(value, label);
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
  }
  function safeText(value, label, required) {
    const text = clean(value);
    if (required && !text) throw new Error(`${label} is required.`);
    if (/<!--|-->|<script|evidence_id\s*:|^#{1,3}\s/im.test(text)) throw new Error(`${label} contains unsafe Markdown structure.`);
    return text;
  }
  function sourceIndexes(value, evidenceCount, label) {
    if (!Array.isArray(value) || !value.length) throw new Error(`${label} source references are required.`);
    const indexes = value.map(Number);
    if (indexes.some((item) => !Number.isInteger(item) || item < 0 || item >= evidenceCount)) throw new Error(`${label} has an invalid source reference.`);
    return Array.from(new Set(indexes));
  }
  function nextEvidenceNumber(existingBlocks) {
    return (existingBlocks || []).reduce((max, block) => {
      const match = String((block || {}).evidence_id || "").match(/-e(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  }
  function normalizeEvidenceBlocks(items, options) {
    if (!Array.isArray(items) || !items.length) throw new Error("evidence_blocks must contain at least one item.");
    let number = nextEvidenceNumber(options.existingBlocks);
    return items.map((item, index) => {
      assertKeys(item, BLOCK_KEYS, `evidence_blocks[${index}]`);
      if (!Array.isArray(item.related_objects) || item.related_objects.length) throw new Error(`evidence_blocks[${index}].related_objects must stay empty until Object existence is checked.`);
      const context = clean(item.context).toLowerCase();
      if (!CONTEXTS.has(context)) throw new Error(`evidence_blocks[${index}].context is invalid.`);
      const block = { evidence_id: `daily-${options.dateStr}-e${String(number).padStart(2, "0")}`, title: safeText(item.title, `evidence_blocks[${index}].title`, true).slice(0, 80), context, related_objects: [], experience: safeText(item.experience, `evidence_blocks[${index}].experience`, true), interpretation: safeText(item.interpretation, `evidence_blocks[${index}].interpretation`, false), change: safeText(item.change, `evidence_blocks[${index}].change`, false), next_experiment: safeText(item.next_experiment, `evidence_blocks[${index}].next_experiment`, false) };
      number += 1;
      return block;
    });
  }
  function normalizeKnowledge(items, blocks) {
    if (!Array.isArray(items)) throw new Error("knowledge_candidates must be an array.");
    return items.map((item, index) => {
      const label = `knowledge_candidates[${index}]`;
      const hasNewShape = Object.prototype.hasOwnProperty.call(item || {}, "title")
        || Object.prototype.hasOwnProperty.call(item || {}, "detail");
      const allowed = hasNewShape
        ? ["title", "detail", "source_evidence_indexes", "confidence", "suggested_domain", "suggested_topics"]
        : ["label", "source_evidence_indexes", "confidence", "suggested_domain", "suggested_topics"];
      assertKeys(item, allowed, label);
      const confidence = clean(item.confidence).toLowerCase();
      if (!CONFIDENCE.has(confidence)) throw new Error(`${label}.confidence is invalid.`);
      const refs = sourceIndexes(item.source_evidence_indexes, blocks.length, label);
      const taxonomyFields = taxonomy(item, label);
      if (hasNewShape) {
        const title = safeText(item.title, `${label}.title`, true).slice(0, 160);
        const detail = safeText(item.detail, `${label}.detail`, true).slice(0, 2000);
        if (title === detail) throw new Error(`${label}.title and detail must be distinct.`);
        return { title, detail, ...taxonomyFields, source_evidence_ids: refs.map((ref) => blocks[ref].evidence_id), confidence };
      }
      return { label: safeText(item.label, `${label}.label`, true).slice(0, 500), ...taxonomyFields, source_evidence_ids: refs.map((ref) => blocks[ref].evidence_id), confidence };
    });
  }
  function normalizeResources(items, blocks) {
    if (!Array.isArray(items)) throw new Error("resource_candidates must be an array.");
    return items.map((item, index) => {
      assertKeys(item, ["name", "suggested_type", "source_evidence_indexes"], `resource_candidates[${index}]`);
      const refs = sourceIndexes(item.source_evidence_indexes, blocks.length, `resource_candidates[${index}]`);
      const suggested_type = clean(item.suggested_type).toLowerCase();
      if (!CANDIDATE_TYPES.has(suggested_type)) throw new Error(`resource_candidates[${index}].suggested_type must be resource or venue.`);
      const candidate = { name: safeText(item.name, `resource_candidates[${index}].name`, true), suggested_type, source_evidence_ids: refs.map((ref) => blocks[ref].evidence_id) };
      if (suggested_type === "venue" && !root.DailyReflectionVenuePolicy.isVenueEligibleCandidate(candidate, blocks)) throw new Error(`resource_candidates[${index}] must be an explicit wedding shooting venue.`);
      return candidate;
    });
  }
  function normalizeObjectLinks(items, blocks) {
    if (!Array.isArray(items)) throw new Error("object_linking_suggestions must be an array.");
    return items.map((item, index) => {
      assertKeys(item, ["name", "object_kind", "source_evidence_indexes", "existence"], `object_linking_suggestions[${index}]`);
      if (item.existence !== "unknown") throw new Error(`object_linking_suggestions[${index}].existence must be unknown.`);
      const refs = sourceIndexes(item.source_evidence_indexes, blocks.length, `object_linking_suggestions[${index}]`);
      return { name: safeText(item.name, `object_linking_suggestions[${index}].name`, true), object_kind: safeText(item.object_kind, `object_linking_suggestions[${index}].object_kind`, true), source_evidence_ids: refs.map((ref) => blocks[ref].evidence_id), existence: "unknown" };
    });
  }
  function normalizeRouting(items, blocks) {
    if (!Array.isArray(items)) throw new Error("pre_routing_suggestions must be an array.");
    return items.map((item, index) => {
      assertKeys(item, ["source_evidence_indexes", "path", "confidence"], `pre_routing_suggestions[${index}]`);
      const confidence = clean(item.confidence).toLowerCase();
      if (!CONFIDENCE.has(confidence)) throw new Error(`pre_routing_suggestions[${index}].confidence is invalid.`);
      if (!Array.isArray(item.path) || item.path.length < 1 || item.path.length > 4) throw new Error(`pre_routing_suggestions[${index}].path is invalid.`);
      const refs = sourceIndexes(item.source_evidence_indexes, blocks.length, `pre_routing_suggestions[${index}]`);
      return { source_evidence_ids: refs.map((ref) => blocks[ref].evidence_id), path: item.path.map((part, pathIndex) => safeText(part, `pre_routing_suggestions[${index}].path[${pathIndex}]`, true).toLowerCase()), confidence };
    });
  }
  function sourceIndexesFromIds(ids, indexById) { return (Array.isArray(ids) ? ids : []).map((id) => indexById.get(id)).filter(Number.isInteger); }
  function providerProposal(proposal) {
    if (!proposal) return null;
    const blocks = Array.isArray(proposal.evidence_blocks) ? proposal.evidence_blocks : [];
    const indexById = new Map(blocks.map((block, index) => [block.evidence_id, index]));
    return {
      evidence_blocks: blocks.map((block) => ({ title: clean(block.title), context: clean(block.context), experience: clean(block.experience), interpretation: clean(block.interpretation), change: clean(block.change), next_experiment: clean(block.next_experiment), related_objects: [] })),
      knowledge_candidates: (proposal.knowledge_candidates || []).map((item) => {
        const refs = sourceIndexesFromIds(item.source_evidence_ids, indexById);
        const taxonomyFields = taxonomy(item, "knowledge_candidates");
        if (clean(item.title) || clean(item.detail)) {
          return { title: clean(item.title), detail: clean(item.detail), suggested_domain: taxonomyFields.suggested_domain, suggested_topics: taxonomyFields.suggested_topics, source_evidence_indexes: refs, confidence: clean(item.confidence) };
        }
        return { label: clean(item.label), suggested_domain: taxonomyFields.suggested_domain, suggested_topics: taxonomyFields.suggested_topics, source_evidence_indexes: refs, confidence: clean(item.confidence) };
      }),
      resource_candidates: (proposal.resource_candidates || []).map((item) => ({ name: clean(item.name), suggested_type: clean(item.suggested_type), source_evidence_indexes: sourceIndexesFromIds(item.source_evidence_ids, indexById) })),
      object_linking_suggestions: (proposal.object_linking_suggestions || []).map((item) => ({ name: clean(item.name), object_kind: clean(item.object_kind), source_evidence_indexes: sourceIndexesFromIds(item.source_evidence_ids, indexById), existence: "unknown" })),
      pre_routing_suggestions: (proposal.pre_routing_suggestions || []).map((item) => ({ source_evidence_indexes: sourceIndexesFromIds(item.source_evidence_ids, indexById), path: Array.isArray(item.path) ? item.path.map(clean).filter(Boolean) : [], confidence: clean(item.confidence) })),
      uncertainties: (proposal.uncertainties || []).map(clean).filter(Boolean)
    };
  }
  function normalizeProposal(payload, options) {
    const opts = options || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(opts.dateStr || ""))) throw new Error("dateStr must be YYYY-MM-DD.");
    assertKeys(payload, TOP_LEVEL_KEYS, "reflection proposal");
    const evidenceBlocks = normalizeEvidenceBlocks(payload.evidence_blocks, opts);
    if (!Array.isArray(payload.uncertainties)) throw new Error("uncertainties must be an array.");
    return { evidence_blocks: evidenceBlocks, knowledge_candidates: normalizeKnowledge(payload.knowledge_candidates, evidenceBlocks), resource_candidates: normalizeResources(payload.resource_candidates, evidenceBlocks), object_linking_suggestions: normalizeObjectLinks(payload.object_linking_suggestions, evidenceBlocks), pre_routing_suggestions: normalizeRouting(payload.pre_routing_suggestions, evidenceBlocks), uncertainties: payload.uncertainties.map((item, index) => safeText(item, `uncertainties[${index}]`, true)) };
  }
  function selectEvidenceBlocks(proposal, selectedIds, selectedObjectPaths) {
    const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
    const objectPaths = new Set(Array.isArray(selectedObjectPaths) ? selectedObjectPaths : []);
    const linksByEvidence = new Map();
    (proposal && Array.isArray(proposal.object_linking_suggestions) ? proposal.object_linking_suggestions : []).filter((item) => item.existence === "existing" && item.resolved_path && item.wiki_link && objectPaths.has(item.resolved_path)).forEach((item) => (item.source_evidence_ids || []).forEach((id) => {
      const links = linksByEvidence.get(id) || [];
      if (!links.includes(item.wiki_link)) links.push(item.wiki_link);
      linksByEvidence.set(id, links);
    }));
    return (proposal && Array.isArray(proposal.evidence_blocks) ? proposal.evidence_blocks : []).filter((block) => selected.has(block.evidence_id)).map((block) => {
      const context = clean(block.context).toLowerCase();
      if (!CONTEXTS.has(context)) throw new Error(`Evidence ${block.evidence_id} context is invalid.`);
      const experience = safeText(block.experience, `Evidence ${block.evidence_id}.experience`, true);
      return { evidence_id: block.evidence_id, title: safeText(block.title, `Evidence ${block.evidence_id}.title`, false).slice(0, 80) || experience.slice(0, 80), context, related_objects: linksByEvidence.get(block.evidence_id) || [], experience, interpretation: safeText(block.interpretation, `Evidence ${block.evidence_id}.interpretation`, false), change: safeText(block.change, `Evidence ${block.evidence_id}.change`, false), next_experiment: safeText(block.next_experiment, `Evidence ${block.evidence_id}.next_experiment`, false) };
    });
  }

  function coerceIndexes(item) {
    if (Array.isArray(item.source_evidence_indexes)) return item.source_evidence_indexes.map(Number).filter(Number.isInteger);
    if (Number.isInteger(item.source_evidence_indexes)) return [item.source_evidence_indexes];
    if (Array.isArray(item.source_evidence_index)) return item.source_evidence_index.map(Number).filter(Number.isInteger);
    if (Number.isInteger(item.source_evidence_index)) return [item.source_evidence_index];
    return [];
  }
  function hasValidRefs(indexes, blockCount) {
    return Array.isArray(indexes) && indexes.length > 0 && indexes.every((n) => Number.isInteger(n) && n >= 0 && n < blockCount);
  }
  function sanitizeEvidenceBlock(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const experience = clean(item.experience);
    const title = clean(item.title) || experience.slice(0, 80);
    const context = clean(item.context).toLowerCase();
    return { title, context: CONTEXTS.has(context) ? context : "", experience: experience || clean(item.title), interpretation: clean(item.interpretation), change: clean(item.change), next_experiment: clean(item.next_experiment), related_objects: [] };
  }
  function sanitizeKnowledge(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const hasNewShape = Object.prototype.hasOwnProperty.call(item, "title")
      || Object.prototype.hasOwnProperty.call(item, "detail");
    const confidence = clean(item.confidence).toLowerCase();
    const base = { source_evidence_indexes: coerceIndexes(item), confidence: CONFIDENCE.has(confidence) ? confidence : "inferred" };
    try {
      const taxonomyFields = taxonomy(item, "knowledge_candidates");
      if (hasNewShape) {
        const title = clean(item.title);
        const detail = clean(item.detail);
        if (!title || !detail || title === detail) return null;
        return { title, detail, ...taxonomyFields, ...base };
      }
      const label = clean(item.label) || clean(item.statement) || clean(item.name);
      return label ? { label, ...taxonomyFields, ...base } : null;
    } catch (_error) {
      return null;
    }
  }
  function sanitizeResource(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    return { name: clean(item.name) || clean(item.title), suggested_type: clean(item.suggested_type) || clean(item.type), source_evidence_indexes: coerceIndexes(item) };
  }
  function sanitizeObject(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    return { name: clean(item.name) || clean(item.title), object_kind: clean(item.object_kind) || clean(item.kind) || "object", source_evidence_indexes: coerceIndexes(item), existence: "unknown" };
  }
  function sanitizeRouting(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const path = Array.isArray(item.path) ? item.path.map(clean).filter(Boolean) : (clean(item.path) ? [clean(item.path)] : []);
    const confidence = clean(item.confidence).toLowerCase();
    return { source_evidence_indexes: coerceIndexes(item), path, confidence: CONFIDENCE.has(confidence) ? confidence : "inferred" };
  }
  function sanitizeProviderPayload(payload) {
    const empty = { evidence_blocks: [], knowledge_candidates: [], resource_candidates: [], object_linking_suggestions: [], pre_routing_suggestions: [], uncertainties: [] };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return empty;
    const evidenceBlocks = (Array.isArray(payload.evidence_blocks) ? payload.evidence_blocks : []).map(sanitizeEvidenceBlock).filter((block) => block && clean(block.experience));
    const blockCount = evidenceBlocks.length;
    const filterRefs = (item) => item && hasValidRefs(item.source_evidence_indexes, blockCount);
    const resources = (Array.isArray(payload.resource_candidates) ? payload.resource_candidates : []).map(sanitizeResource).filter((item) => filterRefs(item) && CANDIDATE_TYPES.has(clean(item.suggested_type).toLowerCase()));
    return {
      evidence_blocks: evidenceBlocks,
      knowledge_candidates: (Array.isArray(payload.knowledge_candidates) ? payload.knowledge_candidates : []).map(sanitizeKnowledge).filter(filterRefs),
      resource_candidates: resources,
      object_linking_suggestions: (Array.isArray(payload.object_linking_suggestions) ? payload.object_linking_suggestions : []).map(sanitizeObject).filter(filterRefs),
      pre_routing_suggestions: (Array.isArray(payload.pre_routing_suggestions) ? payload.pre_routing_suggestions : []).map(sanitizeRouting).filter((item) => filterRefs(item) && item.path.length >= 1 && item.path.length <= 4),
      uncertainties: Array.isArray(payload.uncertainties) ? payload.uncertainties.map((value) => clean(value)).filter(Boolean) : []
    };
  }

  const api = { clean, normalizeProposal, providerProposal, selectEvidenceBlocks, sanitizeProviderPayload };
  root.DailyReflectionProposalContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
