(function (root) {
  "use strict";

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }

  const schema = freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "prodigy://llmwiki/provider-response-schema-v1",
    title: "LLMWiki provider response v1",
    type: "object",
    additionalProperties: false,
    required: ["status", "proposal_bundle"],
    properties: {
      status: { const: "ok" },
      proposal_bundle: { $ref: "#/$defs/proposalBundle" },
      response_metadata: { type: "object", additionalProperties: { type: ["string", "number", "boolean", "null"] } },
    },
    $defs: {
      proposalBundle: {
        type: "object",
        additionalProperties: false,
        required: ["run_id", "validation_context", "proposals"],
        properties: {
          bundle_version: { type: "string", const: "llmwiki_proposal_bundle_v1" },
          run_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
          validation_context: { type: "object", additionalProperties: true },
          status: { type: "string", enum: ["proposed", "abstain", "no_change"] },
          proposals: { type: "array", minItems: 1, items: { $ref: "#/$defs/proposal" } },
          canonical_serialization: { type: "string" },
          bundle_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
        },
      },
      proposal: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "confidence", "source_citations"],
        properties: {
          proposal_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
          kind: { type: "string", enum: ["create", "update", "merge", "dispute", "abstain", "no_change"] },
          title: { type: "string" },
          status: { type: "string" },
          confidence: { type: "string", enum: ["explicit", "inferred", "low"] },
          source_citations: { type: "array", minItems: 1, items: { $ref: "#/$defs/citation" } },
          claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["claim_id", "text", "source_ids"], properties: { claim_id: { type: "string" }, text: { type: "string" }, source_ids: { type: "array", items: { type: "string" }, minItems: 1 } } } },
          affected_targets: { type: "array", items: { type: "string" } },
          target: { type: ["string", "null"] },
          target_revision: { type: ["string", "null"], pattern: "^[0-9a-f]{64}$" },
          diff: { type: "array", items: { type: "object", additionalProperties: true } },
          conflicts: { type: "array", items: { type: "object", additionalProperties: true } },
          source_input_ids: { type: "array", items: { type: "string" } },
          existing_target_ids: { type: "array", items: { type: "string" } },
          dispute: { type: "object", additionalProperties: true },
          abstention_reason: { type: "string" },
          no_change_reason: { type: "string" },
        },
      },
      citation: {
        type: "object",
        additionalProperties: false,
        required: ["source_id", "content_hash", "locators", "confidence"],
        properties: {
          source_id: { type: "string" },
          content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
          source_url: { type: ["string", "null"] },
          locators: { type: "array", minItems: 1, items: { type: "string" } },
          source_archive_id: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["explicit", "inferred", "low"] },
        },
      },
    },
  });

  root.LLMWikiProviderResponseSchema = schema;
  if (typeof module !== "undefined" && module.exports) module.exports = schema;
})(typeof globalThis !== "undefined" ? globalThis : this);
