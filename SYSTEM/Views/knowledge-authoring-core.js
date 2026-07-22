(function (root) {
  "use strict";

  // Registry-aware orchestration sits here; text, URL, path, ID, and freeze primitives live in validation.
  const SOURCE_KINDS = Object.freeze(["article", "column", "youtube", "course", "paper", "official_document"]);
  const SOURCE_KINDS_SET = new Set(SOURCE_KINDS);
  const SUMMARY_ORIGINS = Object.freeze(["manual", "ai"]);
  const SUMMARY_ORIGINS_SET = new Set(SUMMARY_ORIGINS);
  const CANDIDATE_SOURCE_TYPES = Object.freeze(["manual_study", "study_material"]);
  const MAX_BATCH_ITEMS = 20;
  const MAX_BATCH_ITEM_TEXT = 12000;
  const MAX_BATCH_TOTAL_TEXT = 60000;
  const registry = root.KnowledgeExplorerRegistry
    || (typeof require === "function" ? require("./knowledge-explorer-registry.js") : null);
  const validation = root.KnowledgeAuthoringValidation
    || (typeof require === "function" ? require("./knowledge-authoring-validation.js") : null);

  if (!registry) throw new Error("KnowledgeExplorerRegistry is required.");
  if (!validation) throw new Error("KnowledgeAuthoringValidation is required.");

  const {
    LITERATURE_PATH, MAX_TITLE_TEXT, freezeDeep, isRecord, optionalText, requiredText,
    hostileMarkup, safeTitle, canonicalId, sourceId, candidateId, url, exactEnum,
    uniqueList, canonicalLiteratureLink, evidenceIds, wikiLink, optionalLinks, optionalMachineId,
  } = validation;

  function taxonomy(domainValue, topicsValue, domainField, topicsField) {
    const domain = requiredText(domainValue, domainField || "knowledge_domain");
    const registeredTopics = registry.TOPICS_BY_DOMAIN[domain];
    if (!registeredTopics || !Array.isArray(topicsValue)) {
      throw new Error("유효하지 않은 지식 주제 경로입니다. 다시 선택해 주세요.");
    }
    const topics = uniqueList(topicsValue, topicsField || "knowledge_topics", (value, field) => {
      const topic = requiredText(value, field);
      if (!registeredTopics.includes(topic)) throw new Error("유효하지 않은 지식 주제 경로입니다. 다시 선택해 주세요.");
      return topic;
    });
    if (registeredTopics.length && !topics.length) {
      throw new Error("유효하지 않은 지식 주제 경로입니다. 다시 선택해 주세요.");
    }
    if (!registeredTopics.length && topics.length) {
      throw new Error("유효하지 않은 지식 주제 경로입니다. 다시 선택해 주세요.");
    }
    return freezeDeep({ domain, topics });
  }

  function normalizeApplicationContexts(value) {
    return freezeDeep(uniqueList(value, "application_contexts", (entry, field) => {
      const context = requiredText(entry, field, MAX_TITLE_TEXT);
      if (hostileMarkup(context)) throw new Error("유효하지 않은 적용 맥락입니다. 다시 선택해 주세요.");
      const parts = context.split("/");
      if (parts.length < 1 || parts.length > 2 || parts.some((part) => !part)) {
        throw new Error("유효하지 않은 적용 맥락입니다. 다시 선택해 주세요.");
      }
      const registeredTopics = registry.TOPICS_BY_DOMAIN[parts[0]];
      if (!registeredTopics || (parts.length === 2 && !registeredTopics.includes(parts[1]))) {
        throw new Error("유효하지 않은 적용 맥락입니다. 다시 선택해 주세요.");
      }
      return context;
    }));
  }

  function normalizeCandidate(input, sourceType) {
    if (!isRecord(input)) throw new Error("candidate must be an object.");
    if (input.source_type !== undefined && input.source_type !== sourceType) {
      throw new Error("유효하지 않은 지식 출처 유형입니다. 다시 선택해 주세요.");
    }
    const classification = taxonomy(
      input.suggested_domain, input.suggested_topics,
      "suggested_domain", "suggested_topics",
    );
    const sourceObjects = sourceType === "study_material"
      ? normalizeStudyMaterialLinks(input.source_objects)
      : optionalLinks(input.source_objects);
    const sourceNote = optionalText(input.source_note, "source_note");
    if (sourceType === "manual_study" && !sourceNote) throw new Error("직접 학습 출처 메모를 입력해 주세요.");
    const normalized = {
      type: "knowledge_candidate",
      candidate_id: "",
      status: "saved",
      title: safeTitle(input.title, "title"),
      statement: requiredText(input.statement, "statement"),
      reason: requiredText(input.reason, "reason"),
      source_type: sourceType,
      source_evidence_ids: evidenceIds(input.source_evidence_ids),
      source_objects: sourceObjects,
      source_note: sourceNote,
      application_trigger: optionalText(input.application_trigger, "application_trigger"),
      application_contexts: normalizeApplicationContexts(input.application_contexts === undefined ? [] : input.application_contexts),
      confidence: exactEnum(input.confidence === undefined ? "explicit" : input.confidence, "confidence", new Set(["explicit", "inferred", "low"])),
      suggested_domain: classification.domain,
      suggested_topics: classification.topics,
    };
    normalized.candidate_id = candidateId(normalized);
    return freezeDeep(normalized);
  }

  function normalizeStudyMaterialLinks(value) {
    if (!Array.isArray(value)) throw new Error("학습 자료 출처를 하나만 선택해 주세요.");
    const links = uniqueList(value, "source_objects", canonicalLiteratureLink);
    if (links.length !== 1) throw new Error("학습 자료 출처를 하나만 선택해 주세요.");
    return links;
  }

  function normalizeDirectStudy(input) {
    return normalizeCandidate(input, "manual_study");
  }

  function normalizeStudyMaterialCandidate(input) {
    return normalizeCandidate(input, "study_material");
  }

  function normalizeSourceInput(input) {
    if (!isRecord(input)) throw new Error("source must be an object.");
    const classification = taxonomy(input.knowledge_domain, input.knowledge_topics);
    const normalized = {
      type: "literature_note",
      status: "active",
      source_kind: exactEnum(input.source_kind, "source_kind", SOURCE_KINDS_SET, "유효하지 않은 자료 유형입니다. 다시 선택해 주세요."),
      source_id: "",
      source_batch_id: optionalMachineId(input.source_batch_id, "source_batch_id"),
      source_url: url(input.source_url, "source_url"),
      source_title: safeTitle(input.source_title, "source_title"),
      creator: optionalText(input.creator, "creator", MAX_TITLE_TEXT),
      publisher: optionalText(input.publisher, "publisher", MAX_TITLE_TEXT),
      published_at: optionalText(input.published_at, "published_at", MAX_TITLE_TEXT),
      summary_origin: exactEnum(input.summary_origin === undefined ? "manual" : input.summary_origin, "summary_origin", SUMMARY_ORIGINS_SET),
      knowledge_domain: classification.domain,
      knowledge_topics: classification.topics,
      connections: input.connections === undefined ? [] : optionalLinks(input.connections, "connections"),
      source_claim: optionalText(input.source_claim, "source_claim"),
      my_interpretation: requiredText(input.my_interpretation, "my_interpretation"),
      reusable_knowledge: optionalText(input.reusable_knowledge, "reusable_knowledge"),
    };
    normalized.source_id = sourceId(normalized);
    return freezeDeep(normalized);
  }

  function normalizeSourceBatch(input) {
    const packet = Array.isArray(input) ? { items: input } : input;
    if (!isRecord(packet) || !Array.isArray(packet.items)) throw new Error("자료 묶음은 배열이어야 합니다.");
    if (packet.items.length < 1 || packet.items.length > MAX_BATCH_ITEMS) {
      throw new Error("자료 묶음은 1개 이상 20개 이하로 입력해 주세요.");
    }
    let totalText = 0;
    const items = packet.items.map((raw, index) => {
      if (!isRecord(raw)) throw new Error(`items[${index}] must be an object.`);
      const fallbackValue = raw.fallback_text === undefined
        ? (raw.source_text === undefined ? raw.text : raw.source_text)
        : raw.fallback_text;
      if (fallbackValue !== undefined && fallbackValue !== null && typeof fallbackValue !== "string") {
        throw new Error(`items[${index}].fallback_text must be a string.`);
      }
      const fallbackText = typeof fallbackValue === "string" ? fallbackValue.trim() : "";
      if (fallbackText.length > MAX_BATCH_ITEM_TEXT) throw new Error("자료 텍스트가 너무 깁니다.");
      totalText += fallbackText.length;
      if (totalText > MAX_BATCH_TOTAL_TEXT) throw new Error("전체 자료 텍스트가 너무 깁니다.");
      const sourceUrl = url(raw.source_url === undefined ? raw.url : raw.source_url, `items[${index}].source_url`);
      if (!sourceUrl) throw new Error("유효하지 않은 출처 URL입니다. HTTP(S) URL을 입력해 주세요.");
      const sourceTitle = raw.source_title === undefined || raw.source_title === "" ? "" : safeTitle(raw.source_title, `items[${index}].source_title`);
      const sourceKind = raw.source_kind === undefined || raw.source_kind === ""
        ? "article"
        : exactEnum(raw.source_kind, `items[${index}].source_kind`, SOURCE_KINDS_SET, "유효하지 않은 자료 유형입니다. 다시 선택해 주세요.");
      return {
        item_id: canonicalId("source-item", [sourceUrl, fallbackText, sourceTitle, sourceKind]),
        source_url: sourceUrl,
        fallback_text: fallbackText,
        source_title: sourceTitle,
        source_kind: sourceKind,
      };
    });
    return freezeDeep({
      source_batch_id: optionalMachineId(packet.source_batch_id, "source_batch_id")
        || canonicalId("source-batch", items.map((item) => item.item_id)),
      items,
      total_text_length: totalText,
    });
  }

  const api = freezeDeep({
    SOURCE_KINDS, SUMMARY_ORIGINS, CANDIDATE_SOURCE_TYPES, LITERATURE_PATH,
    MAX_BATCH_ITEMS, MAX_BATCH_ITEM_TEXT, MAX_BATCH_TOTAL_TEXT,
    freezeDeep, safeTitle, canonicalId, sourceId, candidateId, url,
    taxonomy, normalizeApplicationContexts, wikiLink, canonicalLiteratureLink,
    normalizeDirectStudy, normalizeStudyMaterialCandidate, normalizeSourceInput, normalizeSourceBatch,
  });

  root.KnowledgeAuthoringCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
