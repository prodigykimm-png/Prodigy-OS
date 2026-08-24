(function (root) {
  "use strict";

  const KNOWLEDGE_DOMAINS = Object.freeze(["real_estate", "wedding", "coding", "workout", "reading", "business", "personal_growth"]);
  const KNOWLEDGE_TOPICS = Object.freeze(["rights_analysis", "site_visit", "bidding", "public_auction", "tax", "precedent", "shooting", "lighting", "editing", "equipment", "electron", "react", "typescript", "python", "ai", "prompt_engineering", "obsidian_plugin", "claude_code", "codex", "gemini"]);
  const PROPOSAL_FIELDS = Object.freeze(["type", "title", "statement", "knowledge_kind", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "connections", "invalidation_conditions", "summary", "created", "updated", "body"]);
  const CANONICAL_PROPOSAL_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: PROPOSAL_FIELDS,
    properties: {
      type: { const: "knowledge" },
      title: { type: "string", minLength: 1, maxLength: 200 },
      statement: { type: "string", minLength: 1, maxLength: 2000 },
      knowledge_kind: { type: "string", enum: ["claim", "principle", "procedure", "concept"] },
      knowledge_domain: { type: "string", enum: KNOWLEDGE_DOMAINS },
      knowledge_topics: { type: "array", uniqueItems: true, maxItems: 12, items: { type: "string", enum: KNOWLEDGE_TOPICS } },
      application_trigger: { type: "string", minLength: 1, maxLength: 500 },
      application_contexts: { type: "array", uniqueItems: true, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 100 } },
      connections: { type: "array", uniqueItems: true, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 300 } },
      invalidation_conditions: { type: "array", uniqueItems: true, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 500 } },
      summary: { type: "string", minLength: 1, maxLength: 1000 },
      created: { type: "string", minLength: 20, maxLength: 40 },
      updated: { type: "string", minLength: 20, maxLength: 40 },
      body: { type: "string", minLength: 1, maxLength: 200000 },
    },
  });
  const TYPED_SCHEMA = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "prodigy://llmwiki/typed-operation-response-v1",
    type: "object",
    additionalProperties: false,
    required: ["status", "serialized_operation", "canonical_proposal", "provider_confidence"],
    properties: {
      status: { const: "ok" },
      serialized_operation: { type: "string", minLength: 2, maxLength: 1048576 },
      canonical_proposal: CANONICAL_PROPOSAL_SCHEMA,
      provider_confidence: { type: "number", minimum: 0, maximum: 1 },
      response_metadata: { type: "object", additionalProperties: false, properties: { response_id: { type: "string" }, request_id: { type: "string" }, provider_status: { type: "string" }, latency_ms: { type: "number", minimum: 0 } } },
    },
  });
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function failure(reason, details = {}) { return Object.freeze({ ok: false, status: "provider_unavailable", reason, ...details }); }
  function providerPrompt(input, sourceId, contentHash, locator) {
    const now = new Date().toISOString();
    return JSON.stringify({
      task: "Create exactly one conservative LLMWiki create operation and canonical_proposal for human review. Return no prose and perform no tools or writes.",
      run_id: input.run_id,
      selected_source: { source_id: sourceId, content_hash: contentHash, locator, text: trim(input.extracted_text) },
      canonical_proposal_contract: {
        exact_fields: PROPOSAL_FIELDS,
        type: "knowledge",
        knowledge_kind_allowed: ["claim", "principle", "procedure", "concept"],
        knowledge_domains: KNOWLEDGE_DOMAINS,
        knowledge_topics: KNOWLEDGE_TOPICS,
        created_and_updated: now,
        body_rule: "Markdown beginning with '# <title>'.",
      },
      serialized_operation_contract: {
        exact_fields: ["contract_version", "operation_id", "kind", "destination_ids", "base_revisions", "before_bytes", "after_bytes", "source_citations", "conflicts", "risk_tier", "effects"],
        contract_version: "llmwiki_operation_contract_v1",
        kind: "create",
        destination_rule: "Use one safe path under ZETA/PERMANENT ending in .md.",
        base_revisions: {},
        before_bytes: {},
        source_citation: { source_id: sourceId, content_hash: contentHash, source_url: null, locators: [locator], source_archive_id: null, confidence: "explicit" },
        conflicts: [],
        risk_tier: "low",
        effects: { deprecations: [], supersessions: [] },
        after_bytes_rule: "JSON object keyed by the one destination path. Its value must exactly equal canonical_bytes.",
      },
      canonical_bytes_rule: {
        field_order: ["type", "title", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "statement", "connections", "invalidation_conditions", "summary", "created", "updated"],
        scalar_format: "Each scalar is JSON.stringify(value), except the exact first line is 'type: knowledge'.",
        list_format: "Empty list is 'key: []'. Non-empty list is 'key:' followed by lines '  - ' + JSON.stringify(item).",
        template: "---\\ntype: knowledge\\ntitle: <JSON title>\\nknowledge_domain: <JSON domain>\\nknowledge_topics: <yaml list>\\napplication_trigger: <JSON trigger>\\napplication_contexts: <yaml list>\\nstatement: <JSON statement>\\nconnections: <yaml list>\\ninvalidation_conditions: <yaml list>\\nsummary: <JSON summary>\\ncreated: <JSON created>\\nupdated: <JSON updated>\\n---\\n<body>",
      },
      response_rule: "serialized_operation is JSON.stringify(operation object). canonical_proposal contains only its exact fields. canonical bytes must render byte-for-byte from canonical_proposal.",
    });
  }
  function createProductionOperationProvider(options = {}) {
    const configApi = options.configApi || root.ProdigyConfigService;
    const service = options.providerService || root.AIProviderService;
    const classifier = options.classifier || root.LLMWikiOperationClassifier;
    const knowledgeKindApi = options.knowledgeKindApi || root.LLMWikiKnowledgeKindContract;
    const candidateCore = options.candidateCore || root.KnowledgeCandidateCore
      || (typeof require === "function" ? require("./knowledge-candidate-core.js") : null);
    const config = options.config;
    return async function productionOperationProvider(input = {}, context = {}) {
      if (input.outbound_allowed !== true) return failure("outbound_consent_required");
      if (!configApi || typeof configApi.resolveAIProfileProviderKey !== "function") return failure("configuration_unavailable");
      if (!service || typeof service.requestStructuredJsonOnce !== "function") return failure("transport_unavailable");
      if (!classifier || typeof classifier.classifyProviderOperation !== "function") return failure("operation_classifier_unavailable");
      const mode = typeof options.getProviderMode === "function" ? options.getProviderMode() : "direct";
      const activeConfig = typeof options.getConfig === "function" ? options.getConfig() : config;
      const selected = configApi.resolveAIProfileProviderKey(activeConfig, "llmwiki", mode);
      if (!selected || selected.ok !== true) return failure(selected && selected.code || "provider_unavailable", { provider_mode: mode });
      const snapshot = input.source_snapshot || {};
      const source = snapshot.source || {};
      const locator = trim(source.source_path || input.source_path);
      const sourceId = trim(source.source_id || input.source_id);
      const contentHash = trim(source.content_hash || input.content_hash);
      if (!sourceId || !contentHash || !locator || !trim(input.extracted_text)) return failure("provider_source_boundary_invalid");
      let response;
      try {
        response = await service.requestStructuredJsonOnce({
          app: options.app,
          provider: selected.provider,
          prompt: providerPrompt(input, sourceId, contentHash, locator),
          schema: TYPED_SCHEMA,
          signal: context.signal,
          timeoutMs: Number(selected.provider && selected.provider.structuredTimeoutMs) || 60000,
        });
      } catch (error) {
        if (error && error.name === "AbortError") return failure("provider_aborted", { provider_mode: selected.provider_mode });
        if (error && error.code === "ANTIGRAVITY_AUTH_REQUIRED") {
          return failure("provider_auth_required", { provider_mode: selected.provider_mode, message: trim(error.message) });
        }
        if (error && error.code === "ANTIGRAVITY_SANDBOX_BLOCKED") {
          return failure("provider_tool_blocked", { provider_mode: selected.provider_mode, message: trim(error.message) });
        }
        if (error && error.code === "ANTIGRAVITY_QUOTA_EXHAUSTED") {
          return failure("provider_quota_exhausted", { provider_mode: selected.provider_mode, message: trim(error.message) });
        }
        return failure("provider_unavailable", { provider_mode: selected.provider_mode });
      }
      if (!knowledgeKindApi || typeof knowledgeKindApi.parseProposal !== "function" || typeof knowledgeKindApi.serializeProposal !== "function") {
        return failure("knowledge_kind_contract_unavailable", { provider_mode: selected.provider_mode });
      }
      try {
        const rawProposal = response && response.canonical_proposal;
        if (rawProposal && typeof rawProposal === "object" && !Array.isArray(rawProposal) && candidateCore && candidateCore.TOPICS) {
          const allowed = new Set(candidateCore.TOPICS[trim(rawProposal.knowledge_domain)] || []);
          const topics = Array.isArray(rawProposal.knowledge_topics)
            ? [...new Set(rawProposal.knowledge_topics.filter((topic) => allowed.has(trim(topic))).map(trim))]
            : [];
          response = { ...response, canonical_proposal: { ...rawProposal, knowledge_topics: topics } };
        }
        const proposal = knowledgeKindApi.parseProposal(response && response.canonical_proposal);
        if (!proposal || proposal.ok !== true) {
          return failure(trim(proposal && proposal.reason) || "invalid_canonical_proposal", { provider_mode: selected.provider_mode });
        }
        const canonicalBytes = knowledgeKindApi.serializeProposal(proposal);
        const operation = JSON.parse(trim(response && response.serialized_operation));
        const destinations = operation && Array.isArray(operation.destination_ids) ? operation.destination_ids : [];
        if (destinations.length !== 1 || !operation.after_bytes || typeof operation.after_bytes !== "object" || Array.isArray(operation.after_bytes)) {
          return failure("canonical_proposal_destination_ambiguous", { provider_mode: selected.provider_mode });
        }
        operation.after_bytes = { ...operation.after_bytes, [destinations[0]]: canonicalBytes };
        response = { ...response, serialized_operation: JSON.stringify(operation) };
      } catch (_error) {
        return failure("canonical_proposal_serialization_failed", { provider_mode: selected.provider_mode });
      }
      const serialized = typeof response === "string" ? response : JSON.stringify(response);
      const classified = classifier.classifyProviderOperation(serialized, {
        selected_sources: [{ source_id: sourceId, content_hash: contentHash, locator }],
        provider_confidence: response && response.provider_confidence,
        current_canonical_revisions: {},
      });
      if (!classified || classified.ok !== true) return failure(classified && classified.reason || "invalid_provider_operation", { provider_mode: selected.provider_mode });
      return Object.freeze({ ok: true, status: classified.value.status, operation: classified.value.operation, provider_mode: selected.provider_mode, provider_key: selected.provider_key, privacy_decision: input.privacy_decision });
    };
  }
  const api = Object.freeze({ TYPED_SCHEMA, createProductionOperationProvider });
  root.LLMWikiProductionOperationProvider = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
