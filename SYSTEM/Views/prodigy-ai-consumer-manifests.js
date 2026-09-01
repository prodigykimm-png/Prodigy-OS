(function (root) {
  "use strict";

  const CAPABILITIES = new Set(["chat-text", "structured-loose", "structured-strict"]);
  const SENSITIVITIES = new Set(["internal", "mixed", "mixed-private", "private", "highly-private"]);
  const ROUTE_POLICIES = new Set(["local-preferred", "local-required", "external-allowed"]);
  const CONSENT_CADENCES = new Set([
    "explicit-action",
    "standing-grant-with-explicit-action",
    "per-operation-range",
  ]);
  const KEYS = Object.freeze([
    "background_allowed",
    "capability",
    "consent_cadence",
    "consumer_id",
    "contract_version",
    "max_input_bytes",
    "max_output_bytes",
    "max_schema_bytes",
    "route_policy",
    "schema_version",
    "sensitivity",
    "timeout_ms",
  ]);

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(freeze);
    return value;
  }

  function manifest(consumerId, sensitivity, consentCadence, overrides = {}) {
    return freeze({
      schema_version: 1,
      consumer_id: consumerId,
      contract_version: 1,
      capability: "structured-strict",
      sensitivity,
      route_policy: "local-preferred",
      consent_cadence: consentCadence,
      background_allowed: false,
      max_input_bytes: 65536,
      max_output_bytes: 131072,
      max_schema_bytes: 32768,
      timeout_ms: 60000,
      ...overrides,
    });
  }

  const registry = freeze({
    "auction.decision_support": manifest("auction.decision_support", "mixed-private", "standing-grant-with-explicit-action"),
    "auction.region_experience": manifest("auction.region_experience", "highly-private", "standing-grant-with-explicit-action"),
    "auction.research_summary": manifest("auction.research_summary", "internal", "explicit-action"),
    "journal.daily_reflection": manifest("journal.daily_reflection", "highly-private", "standing-grant-with-explicit-action"),
    "journal.monthly_validation": manifest("journal.monthly_validation", "highly-private", "standing-grant-with-explicit-action"),
    "journal.weekly_filter": manifest("journal.weekly_filter", "highly-private", "standing-grant-with-explicit-action"),
    "knowledge.explorer_brief": manifest("knowledge.explorer_brief", "internal", "explicit-action"),
    "knowledge.source_batch": manifest("knowledge.source_batch", "mixed", "per-operation-range", { max_input_bytes: 131072, timeout_ms: 120000 }),
    "project.workflow_draft": manifest("project.workflow_draft", "private", "standing-grant-with-explicit-action"),
    "reading.question": manifest("reading.question", "private", "standing-grant-with-explicit-action"),
    "reading.thinking_delta": manifest("reading.thinking_delta", "private", "standing-grant-with-explicit-action"),
    "wiki.article_compile": manifest("wiki.article_compile", "private", "per-operation-range", { max_input_bytes: 131072, timeout_ms: 120000 }),
    "wiki.batch_analysis": manifest("wiki.batch_analysis", "private", "per-operation-range", { max_input_bytes: 131072, timeout_ms: 120000 }),
    "wiki.page_plan": manifest("wiki.page_plan", "private", "per-operation-range", { max_input_bytes: 131072, timeout_ms: 120000 }),
  });

  function validate(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return freeze({ ok: false, reason: "manifest_object_required" });
    const unknown = Object.keys(value).filter((key) => !KEYS.includes(key));
    if (unknown.length) return freeze({ ok: false, reason: "unknown_manifest_field", field: unknown[0] });
    if (value.schema_version !== 1 || value.contract_version !== 1) return freeze({ ok: false, reason: "unsupported_manifest_version" });
    if (!/^[a-z]+(?:[._][a-z]+)+$/u.test(String(value.consumer_id || ""))) return freeze({ ok: false, reason: "invalid_consumer_id" });
    if (!CAPABILITIES.has(value.capability)) return freeze({ ok: false, reason: "invalid_capability" });
    if (!SENSITIVITIES.has(value.sensitivity)) return freeze({ ok: false, reason: "invalid_sensitivity" });
    if (!ROUTE_POLICIES.has(value.route_policy)) return freeze({ ok: false, reason: "invalid_route_policy" });
    if (!CONSENT_CADENCES.has(value.consent_cadence)) return freeze({ ok: false, reason: "invalid_consent_cadence" });
    if (value.background_allowed !== false) return freeze({ ok: false, reason: "background_not_allowed" });
    for (const key of ["max_input_bytes", "max_output_bytes", "max_schema_bytes", "timeout_ms"]) {
      if (!Number.isSafeInteger(value[key]) || value[key] <= 0) return freeze({ ok: false, reason: "invalid_manifest_limit", field: key });
    }
    return freeze({ ok: true });
  }

  function list() {
    return freeze(Object.keys(registry).sort((left, right) => left.localeCompare(right, "en")).map((id) => registry[id]));
  }

  function get(consumerId) {
    return registry[String(consumerId || "")] || null;
  }

  const api = freeze({ SCHEMA_VERSION: 1, get, list, validate });
  root.ProdigyAIConsumerManifests = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
