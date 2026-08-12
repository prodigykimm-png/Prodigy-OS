(function (root) {
  "use strict";

  function configService() {
    if (root.ProdigyConfigService) return root.ProdigyConfigService;
    if (typeof require === "function") return require("./prodigy-config-service.js");
    throw new Error("ProdigyConfigService is not loaded.");
  }

  const LOCAL_CONFIG_PATH = "SYSTEM/PRIVATE/prodigy.local.json";
  const DEFAULT_PROVIDER_CONFIG = root.ProdigyConfigService
    ? root.ProdigyConfigService.DEFAULT_CONFIG
    : Object.freeze({ defaultProvider: "gemini", workflowPresets: {}, providers: {} });
  const redactError = (error) => configService().redactError(error);
  const getProviderDefaults = (providerKey) => configService().getProviderDefaults(providerKey);
  const applyProviderDefaults = (providerKey, provider) => configService().applyProviderDefaults(providerKey, provider);
  const loadProviderConfig = (app) => configService().load(app);
  const saveProviderSettings = (app, settings) => configService().save(app, settings);

  function listProviderModels(providerKey, config) {
    const provider = config && config.providers && config.providers[providerKey]
      ? config.providers[providerKey]
      : getProviderDefaults(providerKey);
    if (!provider) return [];
    const models = (provider.models || []).map((item) => typeof item === "string"
      ? { id: item, label: item }
      : { id: String(item && item.id || ""), label: String(item && item.label || item && item.id || "") })
      .filter((item) => item.id);
    const configured = String(provider.model || "").trim();
    if (configured && !models.some((item) => item.id === configured)) models.unshift({ id: configured, label: configured });
    return models;
  }

  function isEmbeddingModelId(modelId) {
    return /(^|[\/_.-])(?:text-)?embed(?:ding)?([\/_.-]|$)/i.test(String(modelId || ""));
  }

  function providerService() {
    if (root.AIProviderService) return root.AIProviderService;
    if (typeof require === "function") return require("./ai-provider-service.js");
    throw new Error("AIProviderService is not loaded.");
  }

  async function discoverProviderModels(app, providerKey, config) {
    const provider = config && config.providers && config.providers[providerKey];
    const configured = listProviderModels(providerKey, config);
    if (!provider || providerKey !== "lm-studio") return configured;
    const service = providerService();
    if (typeof service.listModels !== "function") return configured;
    const discovered = await service.listModels({ app, provider });
    const known = new Set(configured.map((item) => item.id));
    discovered.filter((id) => !isEmbeddingModelId(id)).forEach((id) => {
      if (!known.has(id)) configured.push({ id, label: id });
    });
    return configured;
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
        if (item && Array.isArray(item.content)) item.content.forEach((part) => { if (part && typeof part.text === "string") chunks.push(part.text); });
      });
      if (chunks.length) return chunks.join("\n");
    }
    if (Array.isArray(response.steps)) {
      const chunks = [];
      response.steps.forEach((step) => {
        if (!step || (step.type && step.type !== "model_output")) return;
        if (Array.isArray(step.content)) step.content.forEach((part) => { if (part && typeof part.text === "string") chunks.push(part.text); });
      });
      if (chunks.length) return chunks.join("\n");
    }
    if (Array.isArray(response.output)) {
      const chunks = [];
      response.output.forEach((item) => {
        if (Array.isArray(item.content)) item.content.forEach((part) => { if (typeof part.text === "string") chunks.push(part.text); });
      });
      if (chunks.length) return chunks.join("\n");
    }
    if (Array.isArray(response.choices) && response.choices[0]) {
      const content = (response.choices[0].message || {}).content;
      return Array.isArray(content) ? content.map((part) => part.text || "").join("\n") : String(content || "");
    }
    if (Array.isArray(response.candidates) && response.candidates[0]) return (((response.candidates[0] || {}).content || {}).parts || []).map((part) => part.text || "").join("\n");
    return "";
  }

  function parseJsonPayload(text) {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Provider returned an empty response.");
    try { return JSON.parse(raw); } catch (_error) {
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

  async function generateWorkflowWithProvider(args) {
    const payload = await providerService().requestStructuredJson({
      app: args.app,
      provider: args.provider,
      prompt: buildPrompt(args.projectContext, args.baseWorkflow),
      schema: args.schema || (root.ProjectWizardCore && root.ProjectWizardCore.WORKFLOW_SCHEMA),
      signal: args.signal
    });
    return normalizeProviderPayload(payload);
  }

  const adapters = { "openai-compatible": generateWorkflowWithProvider, gemini: generateWorkflowWithProvider, "codex-exec": generateWorkflowWithProvider, "antigravity-exec": generateWorkflowWithProvider };

  async function generateStructuredWorkflow(options) {
    const config = options.config || await loadProviderConfig(options.app);
    const providerKey = options.providerKey || config.defaultProvider;
    const provider = config.providers[providerKey];
    if (!provider) throw new Error(`Unknown provider: ${providerKey}`);
    const adapter = adapters[provider.adapter];
    if (!adapter) throw new Error(`Unsupported provider adapter: ${provider.adapter}`);
    try {
      const result = await adapter({ app: options.app, provider, projectContext: options.projectContext, baseWorkflow: options.baseWorkflow, schema: options.schema, signal: options.signal });
      return { workflow: result.workflow, provider: providerKey, model: provider.model || "", rawUsage: result.rawUsage };
    } catch (error) {
      throw new Error(redactError(error));
    }
  }

  function listProviders(config) {
    const current = config || DEFAULT_PROVIDER_CONFIG;
    return Object.keys(current.providers).map((key) => ({ key, name: current.providers[key].name || key, adapter: current.providers[key].adapter, model: current.providers[key].model || "" }));
  }

  const api = { LOCAL_CONFIG_PATH, DEFAULT_PROVIDER_CONFIG, loadProviderConfig, saveProviderSettings, getProviderDefaults, applyProviderDefaults, listProviders, listProviderModels, isEmbeddingModelId, discoverProviderModels, generateStructuredWorkflow, buildPrompt, extractJsonText, parseJsonPayload, normalizeProviderPayload, adapters, redactError };
  root.ProjectWorkflowDraftService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
