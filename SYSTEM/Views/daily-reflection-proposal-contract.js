(function (root) {
  "use strict";

  if (!root.DailyReflectionVenuePolicy && typeof require === "function") {
    root.DailyReflectionVenuePolicy = require("./daily-reflection-venue-policy.js");
  }

  const TOP_LEVEL_KEYS = Object.freeze(["evidence_blocks", "knowledge_candidates", "resource_candidates", "object_linking_suggestions", "pre_routing_suggestions", "uncertainties"]);
  const BLOCK_KEYS = Object.freeze(["title", "context", "experience", "interpretation", "change", "next_experiment", "related_objects"]);
  const CONTEXTS = new Set(["", "people", "auction", "workout", "reading", "project", "work", "personal", "health", "decision", "integrity"]);
  const CONFIDENCE = new Set(["explicit", "inferred", "low"]);
  const CANDIDATE_TYPES = new Set(["resource", "venue"]);

  function clean(value) { return String(value == null ? "" : value).trim(); }
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
      assertKeys(item, ["label", "source_evidence_indexes", "confidence"], `knowledge_candidates[${index}]`);
      const confidence = clean(item.confidence).toLowerCase();
      if (!CONFIDENCE.has(confidence)) throw new Error(`knowledge_candidates[${index}].confidence is invalid.`);
      const refs = sourceIndexes(item.source_evidence_indexes, blocks.length, `knowledge_candidates[${index}]`);
      return { label: safeText(item.label, `knowledge_candidates[${index}].label`, true), source_evidence_ids: refs.map((ref) => blocks[ref].evidence_id), confidence };
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
      knowledge_candidates: (proposal.knowledge_candidates || []).map((item) => ({ label: clean(item.label), source_evidence_indexes: sourceIndexesFromIds(item.source_evidence_ids, indexById), confidence: clean(item.confidence) })),
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

  const api = { clean, normalizeProposal, providerProposal, selectEvidenceBlocks };
  root.DailyReflectionProposalContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
