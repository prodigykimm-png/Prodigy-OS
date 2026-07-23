(function (root) {
  "use strict";

  // Pure Candidate value model. Vault I/O and Knowledge creation belong to the store layer.
  const TYPE = "knowledge_candidate";
  const STATUSES = Object.freeze(["proposed", "saved", "needs_more_evidence", "approved", "rejected"]);
 const SOURCE_TYPES = Object.freeze(["daily_evidence", "reading_session", "manual_study", "study_material", "monthly_validation"]);
  const CONFIDENCE = Object.freeze(["explicit", "inferred", "low"]);
  // Domain/Topic taxonomy has a single source of truth: KnowledgeExplorerRegistry.
  // Candidate keeps DOMAINS/TOPICS as compatibility references, never as copied literals.
  const registry = root.KnowledgeExplorerRegistry
    || (typeof require === "function" ? require("./knowledge-explorer-registry.js") : null);
  if (!registry) throw new Error("KnowledgeExplorerRegistry is required.");
  const DOMAINS = registry.DOMAIN_ORDER;
  const TOPICS = registry.TOPICS_BY_DOMAIN;
  const STATUS_SET = new Set(STATUSES);
  const SOURCE_TYPE_SET = new Set(SOURCE_TYPES);
  const CONFIDENCE_SET = new Set(CONFIDENCE);
  const DOMAIN_SET = new Set(DOMAINS);

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
    return value.trim();
  }

  function optionalText(value, field) {
    if (value === undefined || value === null || value === "") return "";
    return requiredText(value, field);
  }

  function oneOf(value, field, allowed) {
    const normalized = requiredText(value, field);
    if (!allowed.has(normalized)) throw new Error(`${field} is invalid.`);
    return normalized;
  }

  function normalizedList(value, field, item) {
    if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
    const result = [];
    const seen = new Set();
    value.forEach((entry, index) => {
      const normalized = item(entry, `${field}[${index}]`);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    });
    return result;
  }

  function wikiLink(value, field) {
    const text = requiredText(value, field);
    const match = /^\[\[([^\[\]|]+)\]\]$/.exec(text);
    if (!match || !match[1].trim() || /^https?:\/\//i.test(match[1].trim())) {
      throw new Error(`${field} must be a canonical wiki link.`);
    }
    return `[[${match[1].trim()}]]`;
  }

  function canonicalLiteratureLink(value, field) {
    const link = wikiLink(value, field);
    const target = link.slice(2, -2).replace(/\\/g, "/").replace(/\.md$/i, "");
    if (!target.startsWith("ZETA/LITERATURE/") || target.slice("ZETA/LITERATURE/".length).length === 0
      || target.includes("#") || target.includes("..") || target.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("학습 자료 출처를 하나만 선택해 주세요.");
    }
    return `[[${target}]]`;
  }

  function applicationContext(value, field) {
    const context = requiredText(value, field);
    const parts = context.split("/");
    if (parts.length < 1 || parts.length > 2 || parts.some((part) => !/^[a-z][a-z0-9_]*$/.test(part))) {
      throw new Error("유효하지 않은 적용 맥락입니다. 다시 선택해 주세요.");
    }
    const topics = TOPICS[parts[0]];
    if (!topics || (parts.length === 2 && !topics.includes(parts[1]))) {
      throw new Error("유효하지 않은 적용 맥락입니다. 다시 선택해 주세요.");
    }
    return context;
  }

  function targetPath(value) {
    const target = requiredText(value, "promotion_target").replace(/\\/g, "/");
    if (!target.endsWith(".md") || target.startsWith("/") || target.split("/").includes("..") || target.includes("[[")) {
      throw new Error("promotion_target must be a safe canonical Knowledge path.");
    }
    return target;
  }

  function promotionTargetMatches(target, link) {
    const targetKey = target.replace(/\.md$/i, "");
    const linkKey = link.slice(2, -2).replace(/\\/g, "/").replace(/\.md$/i, "");
    return targetKey === linkKey;
  }

  function frozen(candidate) {
    Object.freeze(candidate.source_evidence_ids);
    Object.freeze(candidate.source_objects);
    Object.freeze(candidate.application_contexts);
    Object.freeze(candidate.suggested_topics);
    return Object.freeze(candidate);
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function stableCandidateId(input) {
    if (!isRecord(input)) throw new Error("candidate must be an object.");
    const parts = [input.source_type, input.title, input.statement, input.reason, input.source_note, input.application_trigger]
      .map((value) => typeof value === "string" ? value.trim() : "");
    const evidence = Array.isArray(input.source_evidence_ids) ? input.source_evidence_ids.map(String).map((value) => value.trim()).sort() : [];
    const objects = Array.isArray(input.source_objects) ? input.source_objects.map(String).map((value) => value.trim()).sort() : [];
    const contexts = Array.isArray(input.application_contexts) ? input.application_contexts.map(String).map((value) => value.trim()).sort() : [];
    return `candidate-${hash([...parts, ...evidence, ...objects, ...contexts].join("\u001f"))}`;
  }

  function normalizeCandidate(input, options) {
    if (!isRecord(input)) throw new Error("candidate must be an object.");
    const mode = options || {};
    if (input.type !== TYPE) throw new Error(`candidate.type must be ${TYPE}.`);
    const sourceType = oneOf(input.source_type, "source_type", SOURCE_TYPE_SET);
    const title = requiredText(input.title, "title");
    const statement = requiredText(input.statement, "statement");
    const reason = requiredText(input.reason, "reason");
    const sourceEvidenceIds = normalizedList(input.source_evidence_ids, "source_evidence_ids", requiredText);
    let sourceObjects = normalizedList(input.source_objects, "source_objects", wikiLink);
    const sourceNote = input.source_note === undefined || input.source_note === null
      ? ""
      : typeof input.source_note === "string" ? input.source_note.trim() : optionalText(input.source_note, "source_note");
    if (sourceType === "manual_study" && !sourceNote) throw new Error("직접 학습 출처 메모를 입력해 주세요.");
    if (sourceType === "study_material") {
      if (sourceObjects.length !== 1) throw new Error("학습 자료 출처를 하나만 선택해 주세요.");
      sourceObjects = [canonicalLiteratureLink(sourceObjects[0], "source_objects[0]")];
    }
   if (["daily_evidence", "reading_session"].includes(sourceType) && !sourceEvidenceIds.length && !sourceObjects.length) {
     throw new Error("At least one source evidence id or source object is required.");
   }
   if (sourceType === "monthly_validation" && !sourceObjects.length) {
     throw new Error("Monthly 검증 Candidate는 Monthly Note 출처가 필요합니다.");
   }
    const applicationTrigger = optionalText(input.application_trigger, "application_trigger");
    const applicationContexts = normalizedList(input.application_contexts === undefined ? [] : input.application_contexts, "application_contexts", applicationContext);
    const confidence = oneOf(input.confidence, "confidence", CONFIDENCE_SET);
    const domain = optionalText(input.suggested_domain, "suggested_domain");
    if (domain && !DOMAIN_SET.has(domain)) throw new Error("suggested_domain is invalid.");
    const suggestedTopics = normalizedList(input.suggested_topics, "suggested_topics", requiredText);
    const permittedTopics = new Set(domain ? TOPICS[domain] : []);
    if (suggestedTopics.some((topic) => !permittedTopics.has(topic))) throw new Error("suggested_topics are invalid for suggested_domain.");
    const status = oneOf(input.status, "status", STATUS_SET);
    const target = optionalText(input.promotion_target, "promotion_target");
    const promoted = optionalText(input.promoted_knowledge, "promoted_knowledge");
    const normalizedTarget = target ? targetPath(target) : "";
    const normalizedPromoted = promoted ? wikiLink(promoted, "promoted_knowledge") : "";
    if (status === "approved" && (!normalizedTarget || !normalizedPromoted)) {
      throw new Error("approved candidates require promotion_target and promoted_knowledge.");
    }
    if (status === "approved" && !promotionTargetMatches(normalizedTarget, normalizedPromoted)) {
      throw new Error("promoted_knowledge must match promotion_target.");
    }
    if (status !== "approved" && normalizedPromoted) throw new Error("Only approved candidates may have promoted_knowledge.");
    if (status === "proposed" && normalizedTarget) throw new Error("proposed candidates cannot have a promotion_target.");
    const idInput = {
      source_type: sourceType, title, statement, reason, source_evidence_ids: sourceEvidenceIds, source_objects: sourceObjects,
      source_note: sourceNote, application_trigger: applicationTrigger, application_contexts: applicationContexts,
    };
    const candidateId = optionalText(input.candidate_id, "candidate_id") || stableCandidateId(idInput);
    if (mode.requireId && !input.candidate_id) throw new Error("candidate_id is required.");
    return frozen({
      type: TYPE, candidate_id: candidateId, status, title, statement, reason, source_type: sourceType,
      source_evidence_ids: sourceEvidenceIds, source_objects: sourceObjects, confidence,
      source_note: sourceNote, application_trigger: applicationTrigger, application_contexts: applicationContexts,
      suggested_domain: domain, suggested_topics: suggestedTopics,
      approval_note: optionalText(input.approval_note, "approval_note"),
      promotion_target: normalizedTarget, promoted_knowledge: normalizedPromoted,
      created: requiredText(input.created, "created"), updated: requiredText(input.updated, "updated")
    });
  }

  function createCandidate(input) {
    if (!isRecord(input)) throw new Error("candidate must be an object.");
    if (input.status === "approved") throw new Error("Knowledge candidate creation does not promote Knowledge.");
    if (input.status === "needs_more_evidence") throw new Error("Knowledge candidate creation starts as saved; evidence remediation is a review transition.");
    if (input.promotion_target || input.promoted_knowledge) throw new Error("Knowledge candidate creation does not promote Knowledge.");
    return normalizeCandidate({ ...input, type: TYPE, status: input.status || "saved", promotion_target: "", promoted_knowledge: "" });
  }

  function normalizeLegacyReadingCandidate(input) {
    if (!isRecord(input)) throw new Error("legacy Reading candidate must be an object.");
    const session = optionalText(input.source_session, "source_session");
    const sourceObjects = Array.isArray(input.source_objects) ? input.source_objects : session ? [session] : [];
    return normalizeCandidate({
      ...input, type: TYPE, status: "proposed", source_type: "reading_session",
      source_evidence_ids: Array.isArray(input.source_evidence_ids) ? input.source_evidence_ids : [],
      source_objects: sourceObjects, confidence: input.confidence || "low", suggested_domain: input.suggested_domain || "",
      suggested_topics: Array.isArray(input.suggested_topics) ? input.suggested_topics : [],
      source_note: input.source_note || "", application_trigger: input.application_trigger || "",
      application_contexts: Array.isArray(input.application_contexts) ? input.application_contexts : [],
      approval_note: input.approval_note || "", promotion_target: "", promoted_knowledge: ""
    });
  }

  function validateCandidate(candidate) {
    return normalizeCandidate(candidate, { requireId: true });
  }

  function isActive(candidate) {
    return ["proposed", "saved", "needs_more_evidence"].includes(validateCandidate(candidate).status);
  }

  function isTerminal(candidate) {
    return ["approved", "rejected"].includes(validateCandidate(candidate).status);
  }

  function transitionCandidate(candidate, nextStatus) {
    const current = validateCandidate(candidate);
    const next = oneOf(nextStatus, "next status", STATUS_SET);
    if (current.status === "rejected") throw new Error("rejected candidates are terminal.");
    if (current.status === "approved") throw new Error("approved candidates are terminal.");
    if (current.status === "proposed" && !["saved", "rejected"].includes(next)) throw new Error(`cannot transition proposed candidate to ${next}.`);
    if (current.status === "saved" && !["needs_more_evidence", "approved", "rejected"].includes(next)) throw new Error(`cannot transition saved candidate to ${next}.`);
    if (current.status === "saved" && next === "needs_more_evidence" && current.promotion_target) {
      throw new Error("promotion이 시작된 후보는 보류할 수 없습니다.");
    }
    if (current.status === "needs_more_evidence" && !["saved", "rejected"].includes(next)) throw new Error(`cannot transition needs_more_evidence candidate to ${next}.`);
    if (next === "approved" && (!current.promotion_target || !current.promoted_knowledge)) {
      throw new Error("approved candidates require promotion_target and promoted_knowledge.");
    }
    return normalizeCandidate({ ...current, status: next });
  }

  function setPromotionTarget(candidate, value) {
    const current = validateCandidate(candidate);
    if (current.status === "rejected") throw new Error("rejected candidates are terminal.");
    if (current.status === "needs_more_evidence") throw new Error("needs_more_evidence candidates must be resumed to saved before promotion.");
    if (current.status !== "saved") throw new Error("promotion target may be set only while a candidate is saved.");
    const target = targetPath(value);
    if (current.promotion_target && current.promotion_target !== target) throw new Error("promotion target is already set and cannot be changed.");
    return normalizeCandidate({ ...current, promotion_target: target });
  }

  function finalizePromotion(candidate, link) {
    const current = validateCandidate(candidate);
    const promoted = wikiLink(link, "promoted_knowledge");
    if (current.status === "rejected") throw new Error("rejected candidates are terminal.");
    if (current.status === "approved") {
      if (current.promoted_knowledge !== promoted) throw new Error("candidate was finalized with a different canonical Knowledge link.");
      return validateCandidate(current);
    }
    if (current.status === "needs_more_evidence") throw new Error("needs_more_evidence candidates must be resumed to saved before finalization.");
    if (current.status !== "saved" || !current.promotion_target) throw new Error("saved candidate with a promotion target is required before finalization.");
    if (!promotionTargetMatches(current.promotion_target, promoted)) {
      throw new Error("promoted_knowledge must match promotion_target.");
    }
    return normalizeCandidate({ ...current, status: "approved", promoted_knowledge: promoted });
  }

  root.KnowledgeCandidateCore = Object.freeze({
    TYPE, STATUSES, SOURCE_TYPES, CONFIDENCE, DOMAINS, TOPICS, stableCandidateId,
    createCandidate, normalizeLegacyReadingCandidate, validateCandidate, isActive, isTerminal,
    transitionCandidate, setPromotionTarget, finalizePromotion
  });
})(typeof window !== "undefined" ? window : globalThis);
