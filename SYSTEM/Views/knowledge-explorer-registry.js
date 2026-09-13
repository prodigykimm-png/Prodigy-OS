(function (root) {
  "use strict";

  const UNCLASSIFIED = "unclassified";

  const DOMAIN_ORDER = Object.freeze([
    "real_estate",
    "wedding",
    "coding",
    "workout",
    "reading",
    "business",
    "personal_growth"
  ]);

  const TOPICS_BY_DOMAIN = Object.freeze({
    real_estate: Object.freeze(["rights_analysis", "site_visit", "bidding", "public_auction", "tax", "precedent"]),
    wedding: Object.freeze(["shooting", "lighting", "editing", "equipment"]),
    coding: Object.freeze([
      "electron", "react", "typescript", "python", "ai", "prompt_engineering",
      "obsidian_plugin", "claude_code", "codex", "gemini"
    ]),
    workout: Object.freeze([]),
    reading: Object.freeze([]),
    business: Object.freeze([]),
    personal_growth: Object.freeze([])
  });

  const RESOURCE_ROLES = Object.freeze({
    venue: Object.freeze({ domain: "wedding", section: "Venues" }),
    auction_region: Object.freeze({ domain: "real_estate", section: "Regions" }),
    literature_note: Object.freeze({ domainProperty: "knowledge_domain", section: "References" })
  });

  const SOURCE_TYPE_POLICY = Object.freeze({
    canonical: Object.freeze(["knowledge"]),
    legacy: Object.freeze(["permanent_note"]),
    resource: Object.freeze(["literature_note", "venue", "auction_region"]),
    excluded: Object.freeze(["fleeting_note", "knowledge_candidate"]),
    related: Object.freeze(["people", "project", "journal", "reading"])
  });
  const TRUST_TIERS = Object.freeze({ verified: "verified", legacy_review: "legacy_review", supporting: "supporting", pending: "pending", maintenance: "maintenance" });
  // D3 exact observed-topic mapping (suggestion data, NOT registered-use
  // seeds). Matching is NFC + trim; original labels are never replaced.
  // Row: [exact original topic, domain candidates, kind hint, existing stored topic].
  const OBSERVED_TOPIC_MAP = Object.freeze([
    ["공감각적 광각 점검", ["wedding"], "procedure", "shooting"],
    ["사진 배치 순서", ["wedding"], "procedure", "editing"],
    ["자연스러운 표정 연출", ["wedding"], "procedure", "shooting"],
    ["혼주 촬영 렌즈", ["wedding"], "claim", "equipment"],
    ["카메라 ISO 설정 한도", ["wedding"], "claim", "equipment"],
    ["후보정 화이트 밸런스", ["wedding"], "procedure", "editing"],
    ["포토샵 단축키 - 클리핑화", ["wedding"], "procedure", "editing"],
    ["직영 공사의 비용 절감 효과", ["real_estate"], "claim"],
    ["부동산 거래 시 중개인과의 관계 형성", ["real_estate"], "claim"],
    ["낯선 이와의 거래 시 금전적 유인의 영향력", ["business", "real_estate"], "claim"],
    ["주거지역 내 농지의 재산세 부과 기준", ["real_estate"], "claim", "tax"],
    ["권리산정기준일의 정의", ["real_estate"], "concept", "rights_analysis"],
    ["모아타운 핵심 5단계 절차", ["real_estate"], "procedure"],
  ]);
  const KIND_ORDER = Object.freeze(["claim", "principle", "procedure", "concept"]);

  const domainSet = new Set(DOMAIN_ORDER);
  const topicSets = Object.freeze(Object.fromEntries(
    Object.entries(TOPICS_BY_DOMAIN).map(([domain, topics]) => [domain, new Set(topics)])
  ));

  function normalizeToken(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase().replace(/\s+/g, "_");
  }

  function normalizeDomain(value) {
    const normalized = normalizeToken(value);
    return domainSet.has(normalized) ? normalized : UNCLASSIFIED;
  }

  function topicInputs(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) => typeof item === "string" ? item.split(",") : []);
  }

  function normalizeTopics(value, domain) {
    const normalizedDomain = normalizeDomain(domain);
    const approved = topicSets[normalizedDomain];
    const result = [];
    const seen = new Set();
    const inputs = topicInputs(value);

    if (!inputs.length) return Object.freeze([UNCLASSIFIED]);

    for (const input of inputs) {
      const token = normalizeToken(input);
      const projected = token && approved && approved.has(token) ? token : UNCLASSIFIED;
      if (!seen.has(projected)) {
        seen.add(projected);
        result.push(projected);
      }
    }

    return Object.freeze(result.length ? result : [UNCLASSIFIED]);
  }

  function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  // D2 suggestion envelope: pure mapping from selected original topics.
  // Never invents topics/kinds; abstains (empty domain/kind) unless every
  // topic has exactly one candidate and all agree. Zero mutation.
  function suggestClassification(input) {
    const claims = isPlainObject(input) && Array.isArray(input.claims) ? input.claims : [];
    const topics = [];
    const seenTopics = new Set();
    const basis = [];
    let missingLineage = false;
    for (const claim of claims) {
      if (!isPlainObject(claim) || typeof claim.claim_id !== "string") { missingLineage = true; continue; }
      const refs = Array.isArray(claim.original_topic_refs) ? claim.original_topic_refs : [];
      basis.push(Object.freeze({ claim_id: claim.claim_id, original_topic_refs: Object.freeze(refs.map((row) => Object.freeze({ ...row }))) }));
      if (refs.length === 0) missingLineage = true;
      for (const row of refs) {
        const topic = typeof row?.topic === "string" ? row.topic : "";
        if (!topic.trim()) { missingLineage = true; continue; }
        if (!seenTopics.has(topic)) { seenTopics.add(topic); topics.push(topic); }
      }
    }
    const keyOf = (topic) => topic.normalize("NFC").trim();
    const candidatesFor = (topic) => {
      const found = new Set();
      for (const [observed, domains] of OBSERVED_TOPIC_MAP) {
        if (keyOf(observed) === keyOf(topic)) for (const domain of domains) found.add(domain);
      }
      return [...found].filter((domain) => domainSet.has(domain)).sort();
    };
    const kindsFor = (topic) => {
      const found = [];
      for (const [observed, , hint] of OBSERVED_TOPIC_MAP) {
        if (keyOf(observed) === keyOf(topic) && KIND_ORDER.includes(hint) && !found.includes(hint)) found.push(hint);
      }
      return found;
    };
    const perTopic = topics.map((topic) => ({ topic, domains: candidatesFor(topic), kinds: kindsFor(topic) }));
    const domainSets = perTopic.map((row) => row.domains);
    const kindSets = perTopic.map((row) => row.kinds);
    const unanimous = (sets) => sets.length > 0 && sets.every((set) => set.length === 1) && sets.every((set) => set[0] === sets[0][0]) ? sets[0][0] : "";
    const domain = unanimous(domainSets);
    const kind = unanimous(kindSets);
    const abstain = missingLineage || !domain || !kind;
    const storedTopics = topics.map(topic => OBSERVED_TOPIC_MAP.find(([original]) => keyOf(original) === keyOf(topic))?.[3]);
    const registeredTopics = !abstain && storedTopics.every(topic => topicSets[domain]?.has(topic))
      ? [...new Set(storedTopics)] : [];
    const domainCandidates = [...new Set(perTopic.flatMap((row) => row.domains))].sort((a, b) => DOMAIN_ORDER.indexOf(a) - DOMAIN_ORDER.indexOf(b));
    const kindCandidates = [...new Set(perTopic.flatMap((row) => row.kinds))].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
    return Object.freeze({
      suggestion_version: "llmwiki_classification_suggestions_v1",
      origin: "original_item_topics",
      uncertain: true,
      knowledge_topics: topics,
      stored_knowledge_topics: Object.freeze(registeredTopics),
      knowledge_domain: abstain ? "" : domain,
      domain_candidates: domainCandidates,
      knowledge_kind: abstain ? "" : kind,
      kind_candidates: kindCandidates,
      basis: Object.freeze(basis),
    });
  }

  function isVerifiedCanonical(source) {
    const trust = root.LLMWikiCanonicalTrust || (typeof require === "function" ? (() => { try { return require("./llmwiki-canonical-trust.js"); } catch (_) { return null; } })() : null);
    return Boolean(source) && normalizeToken(source.type) === "knowledge"
      && trust && typeof trust.isVerifiedRow === "function" && trust.isVerifiedRow(source);
  }

  function resolveResourceRole(source) {
    if (!source || typeof source !== "object") return null;
    const type = normalizeToken(source.type);
    const role = RESOURCE_ROLES[type];
    if (!role) return null;
    const domain = role.domain || normalizeDomain(source[role.domainProperty]);
    return Object.freeze({ type, domain, section: role.section });
  }

  function displayApi(display) {
    const resolved = display || root.prodigyDisplay;
    if (!resolved) throw new Error("prodigyDisplay is required");
    return resolved;
  }

  function domainLabel(value, display) {
    return displayApi(display).knowledgeDomain(normalizeDomain(value));
  }

  function topicLabel(value, display) {
    return displayApi(display).knowledgeTopic(normalizeToken(value));
  }

  function resourceLabel(value, display) {
    return displayApi(display).type(normalizeToken(value));
  }

  const api = Object.freeze({
    UNCLASSIFIED,
    DOMAIN_ORDER,
    TOPICS_BY_DOMAIN,
    RESOURCE_ROLES,
    SOURCE_TYPE_POLICY,
    TRUST_TIERS,
    isVerifiedCanonical,
    normalizeDomain,
    normalizeTopics,
    suggestClassification,
    resolveResourceRole,
    domainLabel,
    topicLabel,
    resourceLabel
  });

  root.KnowledgeExplorerRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
