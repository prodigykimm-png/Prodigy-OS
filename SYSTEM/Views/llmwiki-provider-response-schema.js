(function (root) {
  "use strict";

  const MAX_SERIALIZED_PROVIDER_RESPONSE_BYTES = 6295552;
  const MAX_SERIALIZED_OPERATION_BYTES = 1048576;
  const BRANDED_TYPED_RESPONSES = new WeakSet();

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function result(ok, value, reason) {
    return ok ? Object.freeze({ ok: true, value }) : Object.freeze({ ok: false, field: "provider_response", reason });
  }
  function isTypedOperationResponse(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function") && BRANDED_TYPED_RESPONSES.has(value);
  }
  function utf8ByteLength(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).byteLength;
    let length = 0;
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit <= 0x7f) length += 1;
      else if (unit <= 0x7ff) length += 2;
      else if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { length += 4; index += 1; }
        else length += 3;
      } else length += 3;
    }
    return length;
  }
  function decodeUtf8Fallback(input) {
    const characters = [];
    function continuation(index) {
      const byte = input[index];
      if (!Number.isInteger(byte) || byte < 0x80 || byte > 0xbf) throw new Error("invalid UTF-8 continuation");
      return byte;
    }
    for (let index = 0; index < input.length; index += 1) {
      const first = input[index];
      if (first <= 0x7f) { characters.push(String.fromCharCode(first)); continue; }
      if (first >= 0xc2 && first <= 0xdf) {
        const second = continuation(++index);
        characters.push(String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f)));
        continue;
      }
      if (first >= 0xe0 && first <= 0xef) {
        const second = continuation(++index);
        const third = continuation(++index);
        if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second > 0x9f)) throw new Error("invalid UTF-8 scalar");
        characters.push(String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f)));
        continue;
      }
      if (first >= 0xf0 && first <= 0xf4) {
        const second = continuation(++index);
        const third = continuation(++index);
        const fourth = continuation(++index);
        if ((first === 0xf0 && second < 0x90) || (first === 0xf4 && second > 0x8f)) throw new Error("invalid UTF-8 scalar");
        const codePoint = ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
        characters.push(String.fromCodePoint(codePoint));
        continue;
      }
      throw new Error("invalid UTF-8 lead byte");
    }
    return characters.join("");
  }
  function decodeUtf8(input) {
    const Decoder = globalThis.TextDecoder;
    if (typeof Decoder === "function") return new Decoder("utf-8", { fatal: true }).decode(input);
    return decodeUtf8Fallback(input);
  }
  function decodeProviderResponse(input) {
    if (isTypedOperationResponse(input)) return result(true, input);
    let text;
    if (typeof input === "string") text = input;
    else if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(input)
      && typeof Uint8Array !== "undefined" && input instanceof Uint8Array) {
      try { text = decodeUtf8(input); }
      catch (_error) { return result(false, null, "malformed_provider_response_encoding"); }
    } else return result(false, null, "serialized_provider_response_required");
    if (utf8ByteLength(text) > MAX_SERIALIZED_PROVIDER_RESPONSE_BYTES) return result(false, null, "serialized_provider_response_too_large");
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_error) { return result(false, null, "malformed_provider_response_json"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
      return result(false, null, "malformed_provider_response");
    }
    if (Object.hasOwn(parsed, "serialized_operation") && typeof parsed.serialized_operation === "string"
      && utf8ByteLength(parsed.serialized_operation) > MAX_SERIALIZED_OPERATION_BYTES) {
      return result(false, null, "serialized_operation_too_large");
    }
    const branded = freeze(parsed);
    BRANDED_TYPED_RESPONSES.add(branded);
    return result(true, branded);
  }

  const schemaDefinition = freeze({
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
      typedOperationResponse: {
        type: "object",
        additionalProperties: false,
        required: ["status", "serialized_operation", "canonical_proposal"],
        properties: {
          status: { const: "ok" },
          serialized_operation: { type: "string", minLength: 2, maxLength: 1048576, contentMediaType: "application/json" },
          canonical_proposal: { type: "object" },
          provider_confidence: { type: "number", minimum: 0, maximum: 1 },
          response_metadata: {
            type: "object",
            additionalProperties: false,
            properties: {
              response_id: { type: "string" },
              request_id: { type: "string" },
              provider_status: { type: "string" },
              latency_ms: { type: "number", minimum: 0 }
            }
          }
        }
      },
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
          operation: { type: "string", minLength: 2, maxLength: 1048576, contentMediaType: "application/json" },
          canonical_proposal: { type: "object" },
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
  const schema = Object.assign({}, schemaDefinition);
  Object.defineProperties(schema, {
    MAX_SERIALIZED_PROVIDER_RESPONSE_BYTES: { value: MAX_SERIALIZED_PROVIDER_RESPONSE_BYTES },
    utf8ByteLength: { value: utf8ByteLength },
    parseTypedOperationResponse: { value: decodeProviderResponse },
    isTypedOperationResponse: { value: isTypedOperationResponse },
  });
  Object.freeze(schema);

  root.LLMWikiProviderResponseSchema = schema;
  if (typeof module !== "undefined" && module.exports) module.exports = schema;
})(typeof globalThis !== "undefined" ? globalThis : this);
