(function (root) {
  "use strict";

  const CONFIG_PATH = "SYSTEM/PRIVATE/prodigy.local.json";
  const LEGACY_CONFIG_PATH = "SYSTEM/PRIVATE/project-wizard.local.json";
  const LAST_PROVIDER_SECRET = "prodigy-project-wizard-last-provider";
  const SECRET_IDS = Object.freeze({
    gemini: "prodigy-gemini-api-key",
    groq: "prodigy-groq-api-key",
    openrouter: "prodigy-openrouter-api-key",
    mimo: "prodigy-mimo-api-key",
    opencodeGo: "prodigy-opencode-go-api-key",
    openaiCompatible: "prodigy-openai-compatible-api-key",
    antigravityRelay: "prodigy-antigravity-relay-token",
    todoist: "prodigy-todoist-api-token",
    reb: "prodigy-reb-openapi-key",
    // Region Intelligence secret IDs
    dataGoKr: "prodigy-data-go-kr-service-key",
    vworld: "prodigy-vworld-api-key",
    kosis: "prodigy-kosis-api-key",
    seoulOpenapi: "prodigy-seoul-openapi-key",
    naverClientId: "prodigy-naver-client-id",
    naverClientSecret: "prodigy-naver-client-secret",
    youtube: "prodigy-youtube-api-key"
  });
  const LEGACY_SECRET_IDS = Object.freeze({
    [SECRET_IDS.gemini]: "PRODIGY_GEMINI_API_KEY",
    [SECRET_IDS.mimo]: "PRODIGY_MIMO_API_KEY",
    [SECRET_IDS.opencodeGo]: "PRODIGY_OPENCODE_GO_API_KEY",
    [SECRET_IDS.openaiCompatible]: "PRODIGY_OPENAI_COMPATIBLE_API_KEY"
  });
  const DEFAULT_CONFIG = Object.freeze({
    defaultProvider: "gemini",
    fallbackProvider: "",
    workflowPresets: {},
    providers: {
      "lm-studio": {
        adapter: "openai-compatible", name: "LM Studio", baseURL: "http://127.0.0.1:1234/v1", endpointPath: "/chat/completions",
        model: "qwen/qwen3.5-9b", models: [{ id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B Q4_K_M" }, { id: "google/gemma-4-12b-qat", label: "Gemma 4 12B QAT" }],
        authMode: "none", reasoningEffort: "none", ttl: 120, maxTokens: 4096, apiKeySecret: "", legacyApiKeySecret: "",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-schema", strictStructuredOutput: true, schemaDialect: "lm-studio", conservativeProposal: true }
      },
      "opencode-go": {
        adapter: "openai-compatible", name: "OpenCode Go", baseURL: "", endpointPath: "/chat/completions", model: "", authMode: "bearer",
        apiKeySecret: SECRET_IDS.opencodeGo, legacyApiKeySecret: "PRODIGY_OPENCODE_GO_API_KEY",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-mode" }
      },
      mimo: {
        adapter: "openai-compatible", name: "Xiaomi MiMo", baseURL: "https://api.xiaomimimo.com/v1", endpointPath: "/chat/completions", model: "mimo-v2.5-pro",
        models: [{ id: "mimo-v2.5-pro", label: "MiMo V2.5 Pro" }], authMode: "bearer", apiKeySecret: SECRET_IDS.mimo,
        legacyApiKeySecret: "PRODIGY_MIMO_API_KEY",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-mode" }
      },
      gemini: {
        adapter: "gemini", name: "Google Gemini", model: "gemini-3.5-flash",
        models: [{ id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" }, { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" }, { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" }],
        apiKeySecret: SECRET_IDS.gemini, legacyApiKeySecret: "PRODIGY_GEMINI_API_KEY",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-schema" }
      },
      codex: {
        adapter: "codex-exec", name: "Codex 구독", description: "공식 Codex CLI가 저장된 ChatGPT 로그인 세션을 사용합니다.",
        hint: "API 키를 입력하지 않습니다. 데스크톱 터미널에서 codex login을 완료하면 Codex CLI가 해당 로그인 세션을 사용합니다.",
        authMode: "codex-login", command: "", model: "", sandbox: "read-only",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-prompt", strictStructuredOutput: true, conservativeProposal: true }
      },
      antigravity: {
        adapter: "antigravity-exec", name: "Antigravity 구독", description: "공식 Antigravity CLI가 저장된 Google 로그인 세션을 사용합니다.",
        hint: "API 키를 입력하지 않습니다. 데스크톱은 로컬 `agy`, 모바일은 Tailscale 중계 서버의 로그인 세션을 사용합니다.",
        authMode: "antigravity-login", command: "", model: "gemini-3.6-flash-medium",
        relayURL: "", relayTokenSecret: SECRET_IDS.antigravityRelay,
        models: [
          { id: "gemini-3.6-flash-high", label: "Gemini 3.6 Flash · High" },
          { id: "gemini-3.6-flash-medium", label: "Gemini 3.6 Flash · Medium" },
          { id: "gemini-3.6-flash-low", label: "Gemini 3.6 Flash · Low" },
          { id: "gemini-3.5-flash-medium", label: "Gemini 3.5 Flash · Medium" },
          { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro · High" },
          { id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro · Low" },
          { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 · Thinking" },
          { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B · Medium" }
        ],
        sandbox: true, chatTimeoutMs: 30000, structuredTimeoutMs: 120000,
        capabilities: { structuredOutput: "json-schema", strictStructuredOutput: true, conservativeProposal: true }
      },
      groq: {
        adapter: "openai-compatible", name: "Groq", baseURL: "https://api.groq.com/openai/v1", endpointPath: "/chat/completions", model: "qwen/qwen3.6-27b",
        models: [{ id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B (무료 티어)" }, { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (무료 티어)" }, { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (무료 티어)" }],
        authMode: "bearer", apiKeySecret: SECRET_IDS.groq, hint: "무료 한도는 Groq 계정의 Rate limit을 따릅니다.",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-mode" }
      },
      openrouter: {
        adapter: "openai-compatible", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", endpointPath: "/chat/completions", model: "openrouter/free",
        models: [{ id: "openrouter/free", label: "Free Models Router (무료만 사용)" }],
        authMode: "bearer", apiKeySecret: SECRET_IDS.openrouter, hint: "openrouter/free는 무료 모델만 선택합니다. 무료 모델은 한도·가용성이 변동될 수 있습니다.",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-mode" }
      },
      "openai-compatible": {
        adapter: "openai-compatible", name: "OpenAI-Compatible", baseURL: "", endpointPath: "/chat/completions", model: "", authMode: "bearer",
        apiKeySecret: SECRET_IDS.openaiCompatible, legacyApiKeySecret: "PRODIGY_OPENAI_COMPATIBLE_API_KEY",
        chatTimeoutMs: 30000, structuredTimeoutMs: 60000,
        capabilities: { structuredOutput: "json-mode" }
      }
    }
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function isSecretId(value) { return /^[a-z0-9-]{1,64}$/.test(String(value || "")); }
  function redactError(error) { return String(error && error.message || error || "Unknown error").replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]"); }

  function getProviderDefaults(providerKey) {
    const defaults = DEFAULT_CONFIG.providers[providerKey];
    return defaults ? clone(defaults) : null;
  }

  function normalizeModels(provider, defaults) {
    const source = Array.isArray(provider && provider.models) && provider.models.length ? provider.models : defaults.models || [];
    return source.map((item) => typeof item === "string" ? { id: item, label: item } : { id: String(item && item.id || ""), label: String(item && item.label || item && item.id || "") }).filter((item) => item.id);
  }

  function applyProviderDefaults(providerKey, provider) {
    const defaults = getProviderDefaults(providerKey);
    if (!defaults) return clone(provider || {});
    const value = provider || {};
    return Object.assign({}, value, {
      adapter: defaults.adapter,
      name: defaults.name,
      baseURL: value.baseURL || defaults.baseURL,
      endpointPath: value.endpointPath || defaults.endpointPath,
      authMode: value.authMode || defaults.authMode,
      apiKeyHeader: value.apiKeyHeader || defaults.apiKeyHeader,
      endpointURL: value.endpointURL || defaults.endpointURL,
      model: value.model || defaults.model,
      hint: defaults.hint,
      apiKeySecret: defaults.apiKeySecret,
      legacyApiKeySecret: defaults.legacyApiKeySecret,
      relayURL: value.relayURL || defaults.relayURL,
      relayTokenSecret: defaults.relayTokenSecret,
      capabilities: Object.assign({}, defaults.capabilities || {}, value.capabilities || {}),
      models: normalizeModels(value, defaults),
      ttl: Number(value.ttl) > 0 ? Number(value.ttl) : defaults.ttl,
      maxTokens: Number(value.maxTokens) > 0 ? Number(value.maxTokens) : defaults.maxTokens,
      chatTimeoutMs: Number(value.chatTimeoutMs) > 0 ? Number(value.chatTimeoutMs) : (defaults.chatTimeoutMs || 30000),
      structuredTimeoutMs: Number(value.structuredTimeoutMs) > 0 ? Number(value.structuredTimeoutMs) : (defaults.structuredTimeoutMs || 60000)
    });
  }

  function mergeConfig(base, override) {
    const merged = clone(base || DEFAULT_CONFIG);
    if (!override || typeof override !== "object") return normalizeConfig(merged);
    if (override.defaultProvider) merged.defaultProvider = override.defaultProvider;
    if (typeof override.fallbackProvider === "string") merged.fallbackProvider = override.fallbackProvider;
    if (override.workflowPresets && typeof override.workflowPresets === "object") merged.workflowPresets = clone(override.workflowPresets);
    if (override.providers && typeof override.providers === "object") {
      Object.keys(override.providers).forEach((key) => {
        merged.providers[key] = Object.assign({}, merged.providers[key] || {}, override.providers[key]);
      });
    }
    return normalizeConfig(merged);
  }

  function normalizeConfig(config) {
    const normalized = clone(config || DEFAULT_CONFIG);
    normalized.workflowPresets = normalized.workflowPresets && typeof normalized.workflowPresets === "object" ? normalized.workflowPresets : {};
    normalized.providers = normalized.providers && typeof normalized.providers === "object" ? normalized.providers : {};
    Object.keys(DEFAULT_CONFIG.providers).forEach((key) => { normalized.providers[key] = applyProviderDefaults(key, normalized.providers[key]); });
    if (!normalized.providers[normalized.defaultProvider]) normalized.defaultProvider = DEFAULT_CONFIG.defaultProvider;
    normalized.fallbackProvider = normalized.providers[normalized.fallbackProvider] && normalized.fallbackProvider !== normalized.defaultProvider
      ? normalized.fallbackProvider
      : "";
    if (normalized.fallbackProvider) {
      Object.defineProperty(normalized.providers[normalized.defaultProvider], "fallbackProvider", {
        value: normalized.providers[normalized.fallbackProvider], enumerable: false
      });
    }
    return normalized;
  }

  async function readVaultJson(app, path) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") return null;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    return JSON.parse(await app.vault.read(file));
  }

  async function ensureFolder(app, folderPath) {
    if (!app || !app.vault || app.vault.getAbstractFileByPath(folderPath) || typeof app.vault.createFolder !== "function") return;
    await app.vault.createFolder(folderPath);
  }

  async function writeVaultJson(app, path, value) {
    if (!app || !app.vault) throw new Error("Vault access is not available.");
    await ensureFolder(app, path.split("/").slice(0, -1).join("/"));
    const file = app.vault.getAbstractFileByPath(path);
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (file) await app.vault.modify(file, text);
    else await app.vault.create(path, text);
  }

  async function getSecret(app, secretId) {
    if (!secretId || !app || !app.secretStorage || typeof app.secretStorage.getSecret !== "function") return "";
    return (await Promise.resolve(app.secretStorage.getSecret(secretId))) || "";
  }

  async function hasSecret(app, secretId) {
    if (await getSecret(app, secretId)) return true;
    const legacyId = LEGACY_SECRET_IDS[secretId];
    return legacyId ? Boolean(await getSecret(app, legacyId)) : false;
  }

  async function setSecret(app, secretId, value) {
    if (!isSecretId(secretId) || !app || !app.secretStorage || typeof app.secretStorage.setSecret !== "function") return;
    await Promise.resolve(app.secretStorage.setSecret(secretId, String(value || "")));
  }

  async function deleteSecret(app, secretId) {
    if (!isSecretId(secretId) || !app || !app.secretStorage) return;
    const deleteOne = async (id) => {
      if (typeof app.secretStorage.deleteSecret === "function") await Promise.resolve(app.secretStorage.deleteSecret(id));
      else if (typeof app.secretStorage.setSecret === "function") await Promise.resolve(app.secretStorage.setSecret(id, ""));
    };
    await deleteOne(secretId);
    if (LEGACY_SECRET_IDS[secretId]) await deleteOne(LEGACY_SECRET_IDS[secretId]);
  }

  async function load(app) {
    let canonical = null;
    let legacy = null;
    try {
      canonical = await readVaultJson(app, CONFIG_PATH);
      if (!canonical) legacy = await readVaultJson(app, LEGACY_CONFIG_PATH);
    } catch (error) {
      throw new Error(`Provider config is invalid: ${redactError(error)}`);
    }
    const source = canonical || legacy;
    const config = mergeConfig(DEFAULT_CONFIG, source);
    if (!source || source.defaultProvider) return config;
    const lastProvider = await getSecret(app, LAST_PROVIDER_SECRET) || await getSecret(app, "prodigy-project-wizard-last-provider");
    return config.providers[lastProvider] ? normalizeConfig(Object.assign(config, { defaultProvider: lastProvider })) : config;
  }

  async function save(app, settings) {
    const current = await load(app);
    const next = mergeConfig(current, settings && settings.config ? settings.config : {});
    if (settings && settings.defaultProvider) next.defaultProvider = settings.defaultProvider;
    if (settings && typeof settings.fallbackProvider === "string") next.fallbackProvider = settings.fallbackProvider;
    if (!next.providers[next.defaultProvider]) next.defaultProvider = DEFAULT_CONFIG.defaultProvider;
    const normalized = normalizeConfig(next);
    await writeVaultJson(app, CONFIG_PATH, { defaultProvider: normalized.defaultProvider, fallbackProvider: normalized.fallbackProvider, workflowPresets: normalized.workflowPresets, providers: normalized.providers });
    const secrets = settings && settings.secrets || {};
    for (const secretId of Object.keys(secrets)) if (secrets[secretId]) await setSecret(app, secretId, secrets[secretId]);
    for (const secretId of settings && settings.deleteSecretIds || []) await deleteSecret(app, secretId);
    await setSecret(app, LAST_PROVIDER_SECRET, normalized.defaultProvider);
    return normalized;
  }

  async function getDefaultProvider(app) {
    const config = await load(app);
    return config.providers[config.defaultProvider] || null;
  }

  async function getProvider(app, providerKey) {
    const config = await load(app);
    return config.providers[providerKey] || null;
  }

  // Region Intelligence: stable secret IDs for provider auth
  const REGION_SECRET_IDS = Object.freeze({
    reb: SECRET_IDS.reb,
    dataGoKr: SECRET_IDS.dataGoKr,
    vworld: SECRET_IDS.vworld,
    kosis: SECRET_IDS.kosis,
    seoulOpenapi: SECRET_IDS.seoulOpenapi,
    naverClientId: SECRET_IDS.naverClientId,
    naverClientSecret: SECRET_IDS.naverClientSecret,
    youtube: SECRET_IDS.youtube
  });

  /**
   * Check presence of all Region secrets without revealing values.
   * Returns { [secretId]: boolean }.
   */
  async function getRegionSecretStatus(app) {
    const ids = Object.values(REGION_SECRET_IDS);
    const entries = await Promise.all(ids.map(async (id) => [id, await hasSecret(app, id)]));
    return Object.fromEntries(entries);
  }

  const api = { CONFIG_PATH, LEGACY_CONFIG_PATH, LAST_PROVIDER_SECRET, SECRET_IDS, LEGACY_SECRET_IDS, REGION_SECRET_IDS, DEFAULT_CONFIG, isSecretId, redactError, getProviderDefaults, applyProviderDefaults, mergeConfig, load, save, getDefaultProvider, getProvider, getSecret, hasSecret, setSecret, deleteSecret, getRegionSecretStatus };
  root.ProdigyConfigService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
