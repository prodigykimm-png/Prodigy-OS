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
    excluded: Object.freeze(["fleeting_note"]),
    related: Object.freeze(["people", "project", "journal", "reading"])
  });

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
    normalizeDomain,
    normalizeTopics,
    resolveResourceRole,
    domainLabel,
    topicLabel,
    resourceLabel
  });

  root.KnowledgeExplorerRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
