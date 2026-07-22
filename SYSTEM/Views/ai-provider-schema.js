(function (root) {
  "use strict";

  const GEMINI_SCHEMA_KEYS = new Set([
    "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum",
    "items", "prefixItems", "anyOf", "oneOf", "properties", "required", "propertyOrdering"
  ]);

  function normalizeGeminiSchema(schema) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
    const normalized = {};
    Object.entries(schema).forEach(([key, value]) => {
      if (key === "const" && normalized.enum === undefined && schema.enum === undefined) {
        normalized.enum = [value];
        return;
      }
      if (!GEMINI_SCHEMA_KEYS.has(key)) return;
      if (key === "properties" || key === "$defs") {
        normalized[key] = Object.fromEntries(Object.entries(value || {}).map(([name, child]) => [name, normalizeGeminiSchema(child)]));
      } else if (key === "items") {
        normalized[key] = normalizeGeminiSchema(value);
      } else if (key === "prefixItems" || key === "anyOf" || key === "oneOf") {
        normalized[key] = Array.isArray(value) ? value.map(normalizeGeminiSchema) : value;
      } else {
        normalized[key] = value;
      }
    });
    return normalized;
  }

  function normalizeStructuredSchema(schema, provider) {
    const capabilities = provider && provider.capabilities || {};
    if (capabilities.schemaDialect !== "lm-studio") return schema;
    const visit = (value) => {
      if (Array.isArray(value)) return value.map(visit);
      if (!value || typeof value !== "object") return value;
      if (value.type === "array" && Number(value.maxItems) === 0) {
        const emptyArray = {};
        Object.entries(value).forEach(([key, child]) => {
          if (key !== "maxItems" && key !== "items") emptyArray[key] = visit(child);
        });
        emptyArray.enum = [[]];
        return emptyArray;
      }
      const normalized = {};
      Object.entries(value).forEach(([key, child]) => {
        normalized[key] = key === "maxLength" && Number(child) >= 2000 ? 1999 : visit(child);
      });
      return normalized;
    };
    return visit(schema);
  }

  const api = { normalizeGeminiSchema, normalizeStructuredSchema };
  root.AIProviderSchema = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
