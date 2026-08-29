(function (root) {
  "use strict";

  // Task 4: one global-provider capability and frozen-identity gate for the
  // LLM Wiki batch core. Local readiness only — no network, no paid probe,
  // no fallback, no separate selector. Resolves only the existing global
  // defaultProvider; legacy aiProfiles.llmwiki.direct_provider_key is ignored
  // by ProdigyConfigService.resolveAIProfileProviderKey and therefore here.

  function configService() {
    if (root.ProdigyConfigService) return root.ProdigyConfigService;
    if (typeof module !== "undefined" && module.exports) return require("./prodigy-config-service.js");
    throw new Error("ProdigyConfigService must load before the LLM Wiki capability gate.");
  }
  function hashApi() {
    if (root.LLMWikiHash) return root.LLMWikiHash;
    if (typeof module !== "undefined" && module.exports) return require("./llmwiki-hash.js");
    throw new Error("LLMWikiHash must load before the LLM Wiki capability gate.");
  }

  const SUPPORTED_STRUCTURED_MODES = Object.freeze(["json-schema", "json-mode", "json-prompt"]);
  const EXEC_ADAPTERS = Object.freeze(["codex-exec", "antigravity-exec"]);
  // Adapters whose structured-output dialect this product validates locally.
  const SUPPORTED_ADAPTERS = Object.freeze(["openai-compatible", "gemini", "codex-exec", "antigravity-exec"]);

  function stableJson(value) {
    if (value === undefined) return "null";
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function schemaDialectFor(provider) {
    const capabilities = provider && provider.capabilities || {};
    const mode = String(capabilities.structuredOutput || "").trim();
    if (mode !== "json-schema") return "";
    if (provider.adapter === "gemini") return "gemini";
    return String(capabilities.schemaDialect || "").trim() || "openai-strict";
  }

  function normalizeBaseURL(value) { return String(value || "").trim().replace(/\/+$/, ""); }
  function routingFields(providerKey, config) {
    const provider = config.providers[providerKey] || {};
    return {
      adapter: String(provider.adapter || "").trim(),
      auth_mode: String(provider.authMode || "").trim(),
      base_url: normalizeBaseURL(provider.baseURL),
      endpoint_path: String(provider.endpointPath || "").trim(),
      endpoint_url: String(provider.endpointURL || "").trim(),
      api_key_header: String(provider.apiKeyHeader || "").trim(),
      // Secret identifier only — never the secret value.
      api_key_secret_id: String(provider.apiKeySecret || "").trim()
    };
  }

  function profileRevision(providerKey, config) {
    const payload = stableJson({
      default_provider: config.defaultProvider,
      ai_profiles: config.aiProfiles || null,
      provider: Object.assign(
        { key: providerKey, model: String(config.providers[providerKey].model || ""), capabilities: config.providers[providerKey].capabilities || null },
        routingFields(providerKey, config)
      )
    });
    return hashApi().sha256(payload);
  }

  function freezeIdentity(value) {
    const identity = Object.freeze({
      feature: "llmwiki-batch",
      provider_key: value.provider_key,
      provider_name: value.provider_name,
      model: value.model,
      mode: "direct",
      adapter: value.adapter,
      auth_mode: value.auth_mode,
      base_url: value.base_url,
      endpoint_path: value.endpoint_path,
      endpoint_url: value.endpoint_url,
      api_key_header: value.api_key_header,
      api_key_secret_id: value.api_key_secret_id,
      structured_mode: value.structured_mode,
      schema_dialect: value.schema_dialect,
      schema_capability: `${value.structured_mode}${value.schema_dialect ? `:${value.schema_dialect}` : ""}`,
      profile_revision: value.profile_revision
    });
    return Object.freeze(Object.getOwnPropertyNames(identity).reduce((acc, key) => { acc[key] = identity[key]; return acc; }, {}));
  }

  function unavailable(code, field, reasonDetail) {
    return {
      ok: false,
      call_allowed: false,
      code,
      field: field || "",
      reason: reasonDetail || "",
      network_calls: 0
    };
  }

  // Pure local resolution and static validation. No secret storage, no network.
  function resolveBatchCapability(config) {
    try {
      const resolved = configService().resolveAIProfileProviderKey(config, "llmwiki", "direct");
      if (!resolved.ok) {
        return unavailable(resolved.code, resolved.field, resolved.message);
      }
      const provider = resolved.provider;
      const adapter = String(provider.adapter || "").trim();
      if (!SUPPORTED_ADAPTERS.includes(adapter)) {
        return unavailable("adapter_unsupported", "providers.adapter", `제공자 어댑터(${adapter})는 구조화된 분석을 지원하지 않습니다.`);
      }
      const model = String(provider.model || "").trim();
      if (!model) {
        return unavailable("model_missing", "providers.model", "선택한 제공자에 모델 ID가 설정되지 않았습니다.");
      }
      const structuredMode = String(provider.capabilities && provider.capabilities.structuredOutput || "").trim();
      if (!SUPPORTED_STRUCTURED_MODES.includes(structuredMode)) {
        return unavailable("structured_mode_unsupported", "providers.capabilities.structuredOutput", `구조화 출력 모드(${structuredMode || "없음"})는 지원되지 않습니다.`);
      }
      const routing = routingFields(resolved.provider_key, { providers: config.providers });
      return {
        ok: true,
        call_allowed: true,
        network_calls: 0,
        provider_key: resolved.provider_key,
        provider_name: String(provider.name || resolved.provider_key),
        adapter,
        auth_mode: String(provider.authMode || ""),
        base_url: routing.base_url,
        endpoint_path: routing.endpoint_path,
        endpoint_url: routing.endpoint_url,
        api_key_header: routing.api_key_header,
        api_key_secret_id: routing.api_key_secret_id,
        model,
        structured_mode: structuredMode,
        schema_dialect: schemaDialectFor(provider)
      };
    } catch (error) {
      return unavailable("config_invalid", "config", configService().redactError(error));
    }
  }

  function blockedReceipt(capability, code, field, reasonDetail) {
    return Object.assign(unavailable(code, field, reasonDetail), { network_calls: 0 });
  }

  // Full local readiness including secret/session availability. Still zero network.
  async function resolveBatchReadiness(_app, config) {
    const capability = resolveBatchCapability(config);
    if (!capability.ok) return capability;
    if (EXEC_ADAPTERS.includes(capability.adapter)) {
      // CLI-login session providers carry no HTTP secret; availability is
      // validated at call time by the exec service, never probed here. The
      // frozen identity must use the SAME computed profile_revision contract
      // as assertIdentityMatches so an identical exec config self-check passes.
      const identity = freezeIdentity(Object.assign({}, capability, { profile_revision: profileRevision(capability.provider_key, config) }));
      return { ok: true, call_allowed: true, network_calls: 0, identity };
    }
    const service = configService();
    const provider = config.providers[capability.provider_key];
    if (provider.authMode !== "none") {
      const secretId = String(provider.apiKeySecret || "").trim();
      if (!secretId) return blockedReceipt(capability, "secret_missing", "providers.apiKeySecret", `${capability.provider_name} API 키가 설정되지 않았습니다.`);
      const present = await service.hasSecret(_app, secretId);
      if (!present) return blockedReceipt(capability, "secret_missing", "providers.apiKeySecret", `${capability.provider_name} API 키가 없습니다. 설정 → AI에서 키를 입력해 주세요.`);
    }
    const identity = freezeIdentity(Object.assign({}, capability, { profile_revision: profileRevision(capability.provider_key, config) }));
    return { ok: true, call_allowed: true, network_calls: 0, identity };
  }

  function resolveBatchReadinessFromError(error) {
    return unavailable("config_invalid", "config", configService().redactError(error));
  }

  // Mid-run drift guard: recompute the frozen fields from current config and
  // compare with the run's frozen identity. Never calls the network.
  function assertIdentityMatches(frozenIdentity, config) {
    const capability = resolveBatchCapability(config);
    if (!capability.ok) {
      return { ok: false, call_allowed: false, code: "identity_drift", changed_fields: ["config"], reason: capability.reason, network_calls: 0 };
    }
    const current = freezeIdentity(Object.assign({}, capability, { profile_revision: profileRevision(capability.provider_key, config) }));
    const changed = Object.keys(current).filter((key) => key !== "feature" && current[key] !== frozenIdentity[key]);
    if (changed.length) {
      return {
        ok: false,
        call_allowed: false,
        code: "identity_drift",
        changed_fields: Object.freeze(changed.sort()),
        reason: `실행 중 제공자 식별이 변경되었습니다: ${changed.join(", ")}`,
        network_calls: 0
      };
    }
    return { ok: true, call_allowed: true, changed_fields: [], network_calls: 0 };
  }

  // Local Gemini-schema normalization readiness for a frozen identity.
  function normalizeSchemaForIdentity(identity, schema) {
    const schemaApi = root.AIProviderSchema
      || (typeof module !== "undefined" && module.exports && require("./ai-provider-schema.js"));
    if (!schemaApi || typeof schemaApi.normalizeGeminiSchema !== "function") {
      throw new Error("AIProviderSchema must load before schema normalization.");
    }
    const dialect = identity.schema_dialect;
    if (dialect === "gemini") return schemaApi.normalizeGeminiSchema(schema);
    if (dialect && dialect !== "openai-strict") return schemaApi.normalizeStructuredSchema(schema, { capabilities: { schemaDialect: dialect } });
    return schema;
  }

  const api = { SUPPORTED_STRUCTURED_MODES, resolveBatchCapability, resolveBatchReadiness, resolveBatchReadinessFromError, assertIdentityMatches, normalizeSchemaForIdentity };
  root.LLMWikiProviderCapability = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
