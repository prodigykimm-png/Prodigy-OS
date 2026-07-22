(function (root) {
  "use strict";

  const LOCAL_CONFIG_PATH = "SYSTEM/PRIVATE/project-wizard.local.json";
  const DEFAULT_PROVIDER_CONFIG = Object.freeze({
    defaultProvider: "gemini",
    workflowPresets: {},
    providers: {
      "lm-studio": {
        adapter: "openai-compatible",
        name: "LM Studio",
        baseURL: "http://127.0.0.1:1234/v1",
        endpointPath: "/chat/completions",
        model: "qwen/qwen3.5-9b",
        models: [
          { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B Q4_K_M" },
          { id: "google/gemma-4-12b-qat", label: "Gemma 4 12B QAT" }
        ],
        authMode: "none",
        ttl: 120,
        maxTokens: 4096,
        apiKeySecret: "",
        legacyApiKeySecret: "",
        capabilities: { structuredOutput: "json-schema", strictStructuredOutput: true, schemaDialect: "lm-studio", conservativeProposal: true }
      },
      "opencode-go": {
        adapter: "openai-compatible",
        name: "OpenCode Go",
        baseURL: "",
        endpointPath: "/chat/completions",
        model: "",
        authMode: "bearer",
        apiKeySecret: "prodigy-opencode-go-api-key",
        legacyApiKeySecret: "PRODIGY_OPENCODE_GO_API_KEY",
        capabilities: { structuredOutput: "json-mode" }
      },
      mimo: {
        adapter: "openai-compatible",
        name: "Xiaomi MiMo",
        baseURL: "https://api.xiaomimimo.com/v1",
        endpointPath: "/chat/completions",
        model: "mimo-v2.5-pro",
        models: [{ id: "mimo-v2.5-pro", label: "MiMo V2.5 Pro" }],
        authMode: "bearer",
        apiKeySecret: "prodigy-mimo-api-key",
        legacyApiKeySecret: "PRODIGY_MIMO_API_KEY",
        capabilities: { structuredOutput: "json-mode" }
      },
      gemini: {
        adapter: "gemini",
        name: "Google Gemini",
        model: "gemini-3.5-flash",
        models: [
          { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
          { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
          { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" }
        ],
        apiKeySecret: "prodigy-gemini-api-key",
        legacyApiKeySecret: "PRODIGY_GEMINI_API_KEY",
        capabilities: { structuredOutput: "json-schema" }
      },
      "openai-compatible": {
        adapter: "openai-compatible",
        name: "OpenAI-Compatible",
        baseURL: "",
        endpointPath: "/chat/completions",
        model: "",
        authMode: "bearer",
        apiKeySecret: "prodigy-openai-compatible-api-key",
        legacyApiKeySecret: "PRODIGY_OPENAI_COMPATIBLE_API_KEY",
        capabilities: { structuredOutput: "json-mode" }
      }
    }
  });

  function redactError(error) {
    const text = error && error.message ? error.message : String(error || "Unknown provider error");
    return text.replace(/[A-Za-z0-9_\-]{24,}/g, "[redacted]");
  }

  function requestUrlAdapter(app) {
    if (root.requestUrl) return root.requestUrl;
    if (root.obsidian && root.obsidian.requestUrl) return root.obsidian.requestUrl;
    if (app && app.requestUrl) return app.requestUrl;
    return null;
  }

  async function httpRequest(app, options) {
    const requestUrl = requestUrlAdapter(app);
    if (requestUrl) {
      const response = await requestUrl({
        url: options.url,
        method: options.method || "POST",
        headers: options.headers || {},
        body: options.body,
        throw: false
      });
      const status = response.status;
      const text = typeof response.text === "string" ? response.text : JSON.stringify(response.json || {});
      if (status >= 400) throw new Error(`Provider HTTP ${status}: ${text.slice(0, 180)}`);
      if (response.json !== undefined) return response.json;
      try {
        return JSON.parse(text);
      } catch (_error) {
        return { text };
      }
    }
    if (typeof fetch !== "function") throw new Error("No HTTP request adapter is available.");
    const response = await fetch(options.url, {
      method: options.method || "POST",
      headers: options.headers || {},
      body: options.body,
      signal: options.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${text.slice(0, 180)}`);
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { text };
    }
  }

  async function readVaultJson(app, path) {
    if (!app || !app.vault || !app.vault.getAbstractFileByPath) return null;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    const text = await app.vault.read(file);
    return JSON.parse(text);
  }

  async function ensureFolder(app, folderPath) {
    if (!app || !app.vault || !folderPath) return;
    if (app.vault.getAbstractFileByPath(folderPath)) return;
    if (typeof app.vault.createFolder === "function") {
      await app.vault.createFolder(folderPath);
    }
  }

  async function writeVaultJson(app, path, value) {
    if (!app || !app.vault) throw new Error("Vault access is not available.");
    const text = `${JSON.stringify(value, null, 2)}\n`;
    const folderPath = path.split("/").slice(0, -1).join("/");
    await ensureFolder(app, folderPath);
    const file = app.vault.getAbstractFileByPath(path);
    if (file) {
      await app.vault.modify(file, text);
    } else {
      await app.vault.create(path, text);
    }
  }

  function mergeConfig(base, override) {
    if (!override || typeof override !== "object") return JSON.parse(JSON.stringify(base));
    const merged = JSON.parse(JSON.stringify(base));
    if (override.defaultProvider) merged.defaultProvider = override.defaultProvider;
    if (override.workflowPresets && typeof override.workflowPresets === "object") {
      merged.workflowPresets = JSON.parse(JSON.stringify(override.workflowPresets));
    }
    if (override.providers && typeof override.providers === "object") {
      Object.keys(override.providers).forEach((key) => {
        merged.providers[key] = Object.assign({}, merged.providers[key] || {}, override.providers[key]);
      });
    }
    Object.keys(merged.providers).forEach((key) => {
      merged.providers[key] = applyProviderDefaults(key, merged.providers[key]);
    });
    return merged;
  }

  function getProviderDefaults(providerKey) {
    const defaults = DEFAULT_PROVIDER_CONFIG.providers[providerKey];
    return defaults ? JSON.parse(JSON.stringify(defaults)) : null;
  }

  function applyProviderDefaults(providerKey, provider) {
    const defaults = getProviderDefaults(providerKey);
    if (!defaults) return provider || {};
    return Object.assign({}, provider || {}, {
      adapter: defaults.adapter,
      name: defaults.name,
      baseURL: (provider && provider.baseURL) || defaults.baseURL,
      endpointPath: (provider && provider.endpointPath) || defaults.endpointPath,
      authMode: (provider && provider.authMode) || defaults.authMode,
      apiKeyHeader: (provider && provider.apiKeyHeader) || defaults.apiKeyHeader,
      endpointURL: (provider && provider.endpointURL) || defaults.endpointURL,
      model: normalizeProviderModel(providerKey, provider, defaults),
      apiKeySecret: defaults.apiKeySecret,
      legacyApiKeySecret: defaults.legacyApiKeySecret,
      capabilities: Object.assign({}, defaults.capabilities || {}, provider && provider.capabilities || {}),
      models: normalizeProviderModels(provider, defaults),
      ttl: Number(provider && provider.ttl) > 0 ? Number(provider.ttl) : defaults.ttl,
      maxTokens: Number(provider && provider.maxTokens) > 0 ? Number(provider.maxTokens) : defaults.maxTokens
    });
  }

  function normalizeProviderModels(provider, defaults) {
    const source = Array.isArray(provider && provider.models) && provider.models.length
      ? provider.models
      : defaults.models || [];
    return source.map((item) => typeof item === "string"
      ? { id: item, label: item }
      : { id: String(item && item.id || ""), label: String(item && item.label || item && item.id || "") })
      .filter((item) => item.id);
  }

  function normalizeProviderModel(providerKey, provider, defaults) {
    const configuredModel = provider && provider.model ? provider.model : "";
    return configuredModel || defaults.model;
  }

  function listProviderModels(providerKey, config) {
    const provider = config && config.providers && config.providers[providerKey]
      ? config.providers[providerKey]
      : getProviderDefaults(providerKey);
    if (!provider) return [];
    const models = normalizeProviderModels(provider, provider);
    const configured = String(provider.model || "").trim();
    if (configured && !models.some((item) => item.id === configured)) models.unshift({ id: configured, label: configured });
    return models;
  }

  function isEmbeddingModelId(modelId) {
    return /(^|[\/_.-])(?:text-)?embed(?:ding)?([\/_.-]|$)/i.test(String(modelId || ""));
  }

  async function discoverProviderModels(app, providerKey, config) {
    const provider = config && config.providers && config.providers[providerKey];
    const configured = listProviderModels(providerKey, config);
    if (!provider || providerKey !== "lm-studio") return configured;
    const service = providerService();
    if (!service || typeof service.listModels !== "function") return configured;
    const discovered = await service.listModels({ app, provider });
    const seen = new Set(configured.map((item) => item.id));
    discovered.filter((id) => !isEmbeddingModelId(id)).forEach((id) => {
      if (!seen.has(id)) configured.push({ id, label: id });
    });
    return configured;
  }

  async function loadProviderConfig(app) {
    let local = null;
    try {
      local = await readVaultJson(app, LOCAL_CONFIG_PATH);
    } catch (error) {
      throw new Error(`Provider config is invalid: ${redactError(error)}`);
    }
    const config = mergeConfig(DEFAULT_PROVIDER_CONFIG, local);
    const lastProvider = await getSecret(app, "prodigy-project-wizard-last-provider") || await getSecret(app, "PRODIGY_PROJECT_WIZARD_LAST_PROVIDER");
    if (!(local && local.defaultProvider) && lastProvider && config.providers[lastProvider]) config.defaultProvider = lastProvider;
    return config;
  }

  async function getSecret(app, name) {
    if (!name) return "";
    if (app && app.secretStorage && typeof app.secretStorage.getSecret === "function") {
      const value = await Promise.resolve(app.secretStorage.getSecret(name));
      return value || "";
    }
    return "";
  }

  async function getProviderSecret(app, provider) {
    const current = await getSecret(app, provider.apiKeySecret);
    if (current) return current;
    if (provider.legacyApiKeySecret) return getSecret(app, provider.legacyApiKeySecret);
    return "";
  }

  async function setSecret(app, name, value) {
    if (!name || !app || !app.secretStorage || typeof app.secretStorage.setSecret !== "function") return;
    await Promise.resolve(app.secretStorage.setSecret(name, value));
  }

  async function saveProviderSettings(app, settings) {
    const current = await loadProviderConfig(app);
    const next = mergeConfig(current, settings && settings.config ? settings.config : {});
    if (settings && settings.defaultProvider) next.defaultProvider = settings.defaultProvider;
    await writeVaultJson(app, LOCAL_CONFIG_PATH, {
      defaultProvider: next.defaultProvider,
      workflowPresets: next.workflowPresets || {},
      providers: next.providers
    });
    const secrets = settings && settings.secrets ? settings.secrets : {};
    const keys = Object.keys(secrets);
    for (const key of keys) {
      if (secrets[key]) await setSecret(app, key, secrets[key]);
    }
    if (next.defaultProvider) await setSecret(app, "prodigy-project-wizard-last-provider", next.defaultProvider);
    return next;
  }

  function buildPrompt(projectContext, baseWorkflow) {
    const workflowText = (baseWorkflow || []).map((item, index) => `${index + 1}. ${item.label || item}`).join("\n");
    return [
      "You refine a Prodigy OS Project workflow draft.",
      "Return only JSON matching the provided schema.",
      "Do not create files, Todoist tasks, approvals, deadlines, or people assignments.",
      "Preserve the base workflow unless a step is irrelevant.",
      "Return 4 to 10 short action-oriented Korean labels.",
      "",
      `Project name: ${projectContext.projectName}`,
      `Project type: ${projectContext.projectType}`,
      `Start date: ${projectContext.startDate || "(not provided)"}`,
      `Due date: ${projectContext.dueDate}`,
      `Completion condition: ${projectContext.description || "(not provided)"}`,
      "",
      "Base workflow:",
      workflowText || "(blank)"
    ].join("\n");
  }

  function extractJsonText(response) {
    if (!response) return "";
    if (typeof response === "string") return response;
    if (typeof response.output_text === "string") return response.output_text;
    if (typeof response.text === "string") return response.text;
    if (Array.isArray(response.outputs)) {
      const chunks = [];
      response.outputs.forEach((item) => {
        if (item && typeof item.text === "string") chunks.push(item.text);
        if (item && Array.isArray(item.content)) {
          item.content.forEach((part) => {
            if (part && typeof part.text === "string") chunks.push(part.text);
          });
        }
      });
      if (chunks.length) return chunks.join("\n");
    }
    if (Array.isArray(response.steps)) {
      const chunks = [];
      response.steps.forEach((step) => {
        if (!step || (step.type && step.type !== "model_output")) return;
        if (Array.isArray(step.content)) {
          step.content.forEach((part) => {
            if (part && typeof part.text === "string") chunks.push(part.text);
          });
        }
      });
      if (chunks.length) return chunks.join("\n");
    }
    if (Array.isArray(response.output)) {
      const chunks = [];
      response.output.forEach((item) => {
        if (Array.isArray(item.content)) {
          item.content.forEach((part) => {
            if (typeof part.text === "string") chunks.push(part.text);
          });
        }
      });
      if (chunks.length) return chunks.join("\n");
    }
    if (Array.isArray(response.choices) && response.choices[0]) {
      const message = response.choices[0].message || {};
      if (typeof message.content === "string") return message.content;
      if (Array.isArray(message.content)) {
        return message.content.map((part) => part.text || "").join("\n");
      }
    }
    if (Array.isArray(response.candidates) && response.candidates[0]) {
      const parts = (((response.candidates[0] || {}).content || {}).parts || []);
      return parts.map((part) => part.text || "").join("\n");
    }
    return "";
  }

  function parseJsonPayload(text) {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Provider returned an empty response.");
    try {
      return JSON.parse(raw);
    } catch (_error) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Provider did not return valid JSON.");
      return JSON.parse(match[0]);
    }
  }

  function normalizeProviderPayload(payload) {
    const core = root.ProjectWizardCore;
    if (!core) throw new Error("ProjectWizardCore is not loaded.");
    const result = core.validateProviderWorkflow(payload);
    if (!result.ok) throw new Error(result.errors.join(" "));
    return { workflow: result.workflow.map((item) => ({ label: item.label })) };
  }

  function providerService() {
    if (root.AIProviderService) return root.AIProviderService;
    if (typeof require === "function") return require("./ai-provider-service.js");
    throw new Error("AIProviderService is not loaded.");
  }

  function authHeaders(provider, apiKey) {
    const headers = Object.assign({ "Content-Type": "application/json" }, provider.headers || {});
    if (provider.authMode === "api-key") {
      headers[provider.apiKeyHeader || "api-key"] = apiKey;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
  }

  async function openAiCompatibleAdapter(args) {
    const payload = await providerService().requestStructuredJson({
      app: args.app,
      provider: args.provider,
      prompt: buildPrompt(args.projectContext, args.baseWorkflow),
      schema: args.schema,
      signal: args.signal
    });
    return normalizeProviderPayload(payload);
  }

  async function geminiAdapter(args) {
    const payload = await providerService().requestStructuredJson({
      app: args.app,
      provider: args.provider,
      prompt: buildPrompt(args.projectContext, args.baseWorkflow),
      schema: args.schema || (root.ProjectWizardCore && root.ProjectWizardCore.WORKFLOW_SCHEMA),
      signal: args.signal
    });
    return normalizeProviderPayload(payload);
  }

  const adapters = {
    "openai-compatible": openAiCompatibleAdapter,
    gemini: geminiAdapter
  };

  async function generateStructuredWorkflow(options) {
    const app = options.app;
    const config = options.config || await loadProviderConfig(app);
    const providerKey = options.providerKey || config.defaultProvider;
    const provider = config.providers[providerKey];
    if (!provider) throw new Error(`Unknown provider: ${providerKey}`);
    const adapter = adapters[provider.adapter];
    if (!adapter) throw new Error(`Unsupported provider adapter: ${provider.adapter}`);
    try {
      const result = await adapter({
        app,
        provider,
        projectContext: options.projectContext,
        baseWorkflow: options.baseWorkflow,
        schema: options.schema,
        signal: options.signal
      });
      await setSecret(app, "prodigy-project-wizard-last-provider", providerKey);
      return {
        workflow: result.workflow,
        provider: providerKey,
        model: provider.model || "",
        rawUsage: result.rawUsage
      };
    } catch (error) {
      throw new Error(redactError(error));
    }
  }

  function listProviders(config) {
    const cfg = config || DEFAULT_PROVIDER_CONFIG;
    return Object.keys(cfg.providers).map((key) => ({
      key,
      name: cfg.providers[key].name || key,
      adapter: cfg.providers[key].adapter,
      model: cfg.providers[key].model || ""
    }));
  }

  const api = {
    LOCAL_CONFIG_PATH,
    DEFAULT_PROVIDER_CONFIG,
    loadProviderConfig,
    saveProviderSettings,
    getProviderDefaults,
    applyProviderDefaults,
    listProviders,
    listProviderModels,
    isEmbeddingModelId,
    discoverProviderModels,
    generateStructuredWorkflow,
    buildPrompt,
    extractJsonText,
    parseJsonPayload,
    normalizeProviderPayload,
    adapters,
    redactError
  };

  root.ProjectWorkflowDraftService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
