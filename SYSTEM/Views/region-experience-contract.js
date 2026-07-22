(function (root) {
  "use strict";

  // Pure Region Experience value contract. Provider and vault work stay outside this module.
  const CATEGORY_SECTIONS = Object.freeze({
    transport_life: "교통·생활",
    supply_observation: "임장 포인트",
    risk: "리스크·주의",
    site_visit: "임장 포인트"
  });
  const CATEGORIES = new Set(Object.keys(CATEGORY_SECTIONS));
  const EPISTEMIC_STATUSES = new Set(["direct_observation", "user_inference"]);
  const INPUT_KEYS = Object.freeze(["experience_date", "region_key", "region", "category", "epistemic_status", "direct_observation", "subarea", "related_object_links"]);
  const REGION_KEYS = Object.freeze(["type", "region_key", "region_sido", "region_sigungu", "path", "wiki_link"]);
  const PROPOSAL_KEYS = Object.freeze(["evidence", "region_candidates", "knowledge_candidates"]);
  const EVIDENCE_KEYS = Object.freeze(["title", "interpretation", "change", "next_experiment"]);
  const REGION_CANDIDATE_KEYS = Object.freeze(["category", "text", "source_evidence_indexes"]);
  const KNOWLEDGE_CANDIDATE_KEYS = Object.freeze(["title", "statement", "reason", "source_evidence_indexes", "confidence"]);
  const CONFIDENCE = new Set(["explicit", "inferred", "low"]);
  const FORBIDDEN_FIELD = /(?:^|_)(?:metric(?:s)?|numeric(?:s)?|number(?:s)?|official_supply|supply_pipeline|move_in_\d+m|sale_volume_\d+m|housing_stock|households|land_price)(?:$|_)/i;
  const UNSAFE_PROSE = [
    /<!--|-->/,
    /```/,
    /<\/?[a-z][^>]*>/i,
    /^\s*#{1,6}\s/m,
    /^\s*>\s/m,
    /^\s*(?:[-*+]\s+|\d+[.)]\s+)/m,
    /^\s*---+\s*$/m,
    /\[\[[^\]]+\]\]/,
    /\[[^\]]+\]\([^)]+\)/,
    /(?:^|\s)(?:AI:PENDING|AUTO:|HUMAN(?::[A-Z_]+)?|PRODIGY_REGION_METRICS_HISTORY)\b/i,
    /\b(?:evidence_id|region_key|region_sido|region_sigungu|move_in_\d+m|sale_volume_\d+m|housing_stock|official_supply|supply_pipeline)\s*:/i
  ];
  const SUPPLY_QUANTITY = "(?:\\d{1,3}(?:,\\d{3})*|\\d+|[영공일이삼사오육칠팔구십백천만억조]+)";
  const OFFICIAL_SUPPLY_TEXT = [
    /\b(?:move_in_\d+m|sale_volume_\d+m|housing_stock|households|official_supply|supply_pipeline)\b/i,
    /(?:공식|통계)\s*(?:공급|세대|입주)/,
    new RegExp(`(?:공식|통계|공공)\\s*(?:공급|세대|입주)(?:\\s*${SUPPLY_QUANTITY})?`),
    new RegExp(`(?:입주|공급)\\s*(?:예정|물량|계획)\\s*[:：]?\\s*${SUPPLY_QUANTITY}\\s*(?:세대|가구|호|동)?`),
    new RegExp(`${SUPPLY_QUANTITY}\\s*(?:세대|가구|호|동)\\s*(?:(?:공급|입주)\\s*)?(?:예정|물량|계획)`),
    new RegExp(`(?:공급|입주)\\s*${SUPPLY_QUANTITY}\\s*(?:세대|가구|호|동)`)
  ];

  function assertPlainObject(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`); }

  function assertKeys(value, allowed, label) {
    assertPlainObject(value, label);
    assertNoForbiddenFields(value, label);
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
  }

  function assertNoForbiddenFields(value, label) {
    Object.keys(value || {}).forEach((key) => {
      if (FORBIDDEN_FIELD.test(key)) throw new Error(`${label} has a forbidden numeric or official-supply field: ${key}.`);
    });
  }

  function requiredText(value, label) { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`); return value; }

  function optionalText(value, label) { return value === undefined || value === null || value === "" ? "" : requiredText(value, label); }

  function safeProse(value, label, required) {
    const text = required ? requiredText(value, label) : optionalText(value, label);
    if (text && UNSAFE_PROSE.some((pattern) => pattern.test(text))) throw new Error(`${label} contains unsafe Markdown or marker structure.`);
    return text;
  }

  function oneOf(value, label, allowed) {
    if (typeof value !== "string" || !allowed.has(value)) throw new Error(`${label} is invalid.`);
    return value;
  }

  function isoCalendarDate(value, label) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a calendar date in YYYY-MM-DD form.`);
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${label} must be a valid calendar date.`);
    return value;
  }

  function regionKey(value, label) {
    if (typeof value !== "string" || !/^\S(?:.*\S)?-\S(?:.*\S)?$/.test(value) || /[\\/\[\]<>`\r\n]/.test(value)) throw new Error(`${label} is invalid.`);
    const parts = value.split("-");
    if (parts.length !== 2 || parts.some((part) => !part.trim())) throw new Error(`${label} is invalid.`);
    return value;
  }

  function compactRegionPart(value, label) {
    if (typeof value !== "string" || !value.trim() || /[\\/\[\]<>`\r\n]/.test(value)) throw new Error(`${label} is invalid.`);
    return value;
  }

  function canonicalWikiLink(value, label) {
    if (typeof value !== "string" || !value.startsWith("[[") || !value.endsWith("]]")) throw new Error(`${label} must be a canonical wiki link.`);
    const target = value.slice(2, -2);
    if (
      !target ||
      target !== target.trim() ||
      /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\[\]|#<>`\\]/u.test(target) ||
      /(?:<!--|-->|(?:^|\/)\s*!?--|(?:^|\/)\s*(?:AI:PENDING|AUTO:|HUMAN(?::[A-Z_]+)?|PRODIGY_))/i.test(target) ||
      target.split("/").some((segment) => !segment || segment !== segment.trim() || segment === "." || segment === "..")
    ) throw new Error(`${label} must be a safe canonical wiki link.`);
    return value;
  }

  function normalizeRelatedLinks(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error("related_object_links must be an array.");
    const links = value.map((item, index) => canonicalWikiLink(item, `related_object_links[${index}]`));
    return Array.from(new Set(links));
  }

  function normalizeRegion(input, key) {
    assertKeys(input, REGION_KEYS, "region");
    if (input.type !== "auction_region") throw new Error("region.type must be auction_region.");
    const identityKey = regionKey(input.region_key, "region.region_key");
    if (identityKey !== key) throw new Error("region.region_key must match region_key.");
    const sido = compactRegionPart(input.region_sido, "region.region_sido");
    const sigungu = compactRegionPart(input.region_sigungu, "region.region_sigungu");
    if (`${sido}-${sigungu}` !== key) throw new Error("region identity must match region_key.");
    const expectedPath = `PARA/RESOURCES/Auction Regions/${key}.md`;
    if (input.path !== expectedPath) throw new Error("region.path must identify the existing canonical auction_region Object.");
    const expectedLink = `[[${expectedPath.slice(0, -3)}]]`;
    if (input.wiki_link !== expectedLink) throw new Error("region.wiki_link must identify the existing canonical auction_region Object.");
    return Object.freeze({ type: "auction_region", region_key: key, region_sido: sido, region_sigungu: sigungu, path: expectedPath, wiki_link: expectedLink });
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function normalizeInput(input) {
    assertKeys(input, INPUT_KEYS, "Region Experience input");
    const key = regionKey(input.region_key, "region_key");
    const normalized = {
      experience_date: isoCalendarDate(input.experience_date, "experience_date"),
      region_key: key,
      region: normalizeRegion(input.region, key),
      category: oneOf(input.category, "category", CATEGORIES),
      epistemic_status: oneOf(input.epistemic_status, "epistemic_status", EPISTEMIC_STATUSES),
      direct_observation: safeProse(input.direct_observation, "direct_observation", true),
      subarea: safeProse(input.subarea, "subarea", false),
      related_object_links: normalizeRelatedLinks(input.related_object_links)
    };
    return deepFreeze(normalized);
  }

  function sourceEvidenceIndexes(value, evidenceCount, label) {
    if (!Array.isArray(value) || value.length !== 1) throw new Error(`${label} source evidence reference is required.`);
    const index = value[0];
    if (!Number.isInteger(index) || index < 0 || index >= evidenceCount) throw new Error(`${label} has an invalid source evidence reference.`);
    return [index];
  }

  function assertNoOfficialSupplyText(text, label, directObservation) {
    if (text !== directObservation && OFFICIAL_SUPPLY_TEXT.some((pattern) => pattern.test(text))) {
      throw new Error(`${label} contains AI-created official-supply or numeric content.`);
    }
  }

  function assertNoAiCreatedEvidenceText(text, label) {
    if (OFFICIAL_SUPPLY_TEXT.some((pattern) => pattern.test(text))) {
      throw new Error(`${label} contains AI-created official-supply or numeric content.`);
    }
  }

  function inferenceMetadata(status) {
    return status === "user_inference"
      ? { review_status: "pending", inference_notice: "사용자 해석 · 확인 필요" }
      : { review_status: "ready", inference_notice: "" };
  }

  function normalizeEvidence(raw, input) {
    assertKeys(raw, EVIDENCE_KEYS, "evidence");
    const metadata = inferenceMetadata(input.epistemic_status);
    const rawTitle = safeProse(raw.title, "evidence.title", true);
    const interpretation = safeProse(raw.interpretation, "evidence.interpretation", false);
    const change = safeProse(raw.change, "evidence.change", false);
    const nextExperiment = safeProse(raw.next_experiment, "evidence.next_experiment", false);
    [
      [rawTitle, "evidence.title"],
      [interpretation, "evidence.interpretation"],
      [change, "evidence.change"],
      [nextExperiment, "evidence.next_experiment"]
    ].forEach(([text, label]) => assertNoAiCreatedEvidenceText(text, label));
    const title = rawTitle.slice(0, 80);
    return {
      evidence_id: "region-experience-0",
      title,
      context: "auction",
      related_objects: input.related_object_links.slice(),
      experience: input.direct_observation,
      interpretation,
      change,
      next_experiment: nextExperiment,
      epistemic_status: input.epistemic_status,
      review_status: metadata.review_status,
      inference_notice: metadata.inference_notice
    };
  }

  function normalizeRegionCandidates(items, evidenceBlocks, input) {
    if (!Array.isArray(items) || !items.length) throw new Error("region_candidates must contain one or more candidates.");
    const metadata = inferenceMetadata(input.epistemic_status);
    return items.map((item, index) => {
      assertKeys(item, REGION_CANDIDATE_KEYS, `region_candidates[${index}]`);
      const category = oneOf(item.category, `region_candidates[${index}].category`, CATEGORIES);
      if (category !== input.category) throw new Error(`region_candidates[${index}].category must match the selected input category.`);
      const text = safeProse(item.text, `region_candidates[${index}].text`, true);
      if (category === "supply_observation" && text !== input.direct_observation) {
        throw new Error(`region_candidates[${index}].text for supply_observation must exactly match direct_observation.`);
      }
      assertNoOfficialSupplyText(text, `region_candidates[${index}].text`, input.direct_observation);
      const indexes = sourceEvidenceIndexes(item.source_evidence_indexes, evidenceBlocks.length, `region_candidates[${index}]`);
      return {
        category,
        section: CATEGORY_SECTIONS[category],
        text,
        source_evidence_ids: indexes.map((sourceIndex) => evidenceBlocks[sourceIndex].evidence_id),
        epistemic_status: input.epistemic_status,
        review_status: metadata.review_status,
        inference_notice: metadata.inference_notice
      };
    });
  }

  function normalizeKnowledgeCandidates(items, evidenceBlocks, input) {
    if (items === undefined) return [];
    if (!Array.isArray(items)) throw new Error("knowledge_candidates must be an array.");
    return items.map((item, index) => {
      assertKeys(item, KNOWLEDGE_CANDIDATE_KEYS, `knowledge_candidates[${index}]`);
      const indexes = sourceEvidenceIndexes(item.source_evidence_indexes, evidenceBlocks.length, `knowledge_candidates[${index}]`);
      const title = safeProse(item.title, `knowledge_candidates[${index}].title`, true);
      const statement = safeProse(item.statement, `knowledge_candidates[${index}].statement`, true);
      const reason = safeProse(item.reason, `knowledge_candidates[${index}].reason`, true);
      assertNoOfficialSupplyText(title, `knowledge_candidates[${index}].title`, input.direct_observation);
      assertNoOfficialSupplyText(statement, `knowledge_candidates[${index}].statement`, input.direct_observation);
      assertNoOfficialSupplyText(reason, `knowledge_candidates[${index}].reason`, input.direct_observation);
      return {
        title,
        statement,
        reason,
        source_evidence_ids: indexes.map((sourceIndex) => evidenceBlocks[sourceIndex].evidence_id),
        confidence: oneOf(item.confidence, `knowledge_candidates[${index}].confidence`, CONFIDENCE)
      };
    });
  }

  function normalizeProposal(proposal, input) {
    const normalizedInput = normalizeInput(input);
    assertKeys(proposal, PROPOSAL_KEYS, "Region Experience proposal");
    const evidenceBlocks = [normalizeEvidence(proposal.evidence, normalizedInput)];
    const normalized = {
      input: normalizedInput,
      evidence_blocks: evidenceBlocks,
      region_candidates: normalizeRegionCandidates(proposal.region_candidates, evidenceBlocks, normalizedInput),
      knowledge_candidates: normalizeKnowledgeCandidates(proposal.knowledge_candidates, evidenceBlocks, normalizedInput)
    };
    return deepFreeze(normalized);
  }

  const api = Object.freeze({
    CATEGORY_SECTIONS,
    normalizeInput,
    normalizeProposal,
    safeProse
  });
  root.RegionExperienceContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
