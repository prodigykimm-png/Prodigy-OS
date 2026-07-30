(function (root) {
  "use strict";

  const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
  const RETRY_DELAYS_MS = Object.freeze([1000, 2500]);

  if (typeof require === "function") {
    if (!root.AIProviderErrorPolicy) root.AIProviderErrorPolicy = require("./ai-provider-error-policy.js");
    if (!root.AIProviderResponse) root.AIProviderResponse = require("./ai-provider-response.js");
    if (!root.AIProviderSchema) root.AIProviderSchema = require("./ai-provider-schema.js");
    if (!root.AIProviderFallback) root.AIProviderFallback = require("./ai-provider-fallback.js");
  }

  function errorPolicy() {
    if (root.AIProviderErrorPolicy) return root.AIProviderErrorPolicy;
    throw new Error("AIProviderErrorPolicy must load before AIProviderService.");
  }
  function redactError(error) { return errorPolicy().redactError(error); }
  const TRANSIENT_HTTP_STATUSES = errorPolicy().TRANSIENT_HTTP_STATUSES;

  function requestUrlAdapter(app) {
    if (root.requestUrl) return root.requestUrl;
    if (root.obsidian && root.obsidian.requestUrl) return root.obsidian.requestUrl;
    if (app && app.requestUrl) return app.requestUrl;
    return null;
  }

  function isMobileRuntime(app) {
    if (app && typeof app.isMobile === "boolean") return app.isMobile;
    const platform = root.obsidian && root.obsidian.Platform;
    return Boolean(platform && (platform.isMobileApp || platform.isMobile));
  }

  function resolveBaseURL(provider, app) {
    if (provider && provider.localBaseURL && !isMobileRuntime(app)) return String(provider.localBaseURL);
    return String(provider && provider.baseURL || "");
  }

  function providerHttpError(status, responseText) { return errorPolicy().providerHttpError(status, responseText); }

  function wait(ms, signal) {
    if (signal && signal.aborted) {
      const error = new Error("AI 요청이 취소되었습니다.");
      error.name = "AbortError";
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      let abortHandler = null;
      const cleanup = () => {
        if (signal && abortHandler && typeof signal.removeEventListener === "function") {
          signal.removeEventListener("abort", abortHandler);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      if (!signal || typeof signal.addEventListener !== "function") return;
      abortHandler = () => {
        clearTimeout(timer);
        cleanup();
        const error = new Error("AI 요청이 취소되었습니다.");
        error.name = "AbortError";
        reject(error);
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    });
  }

  function userFacingProviderError(error, provider, app) {
    return errorPolicy().userFacingProviderError(error, provider, resolveBaseURL(provider, app));
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
      const status = Number(response.status || 0);
      const text = typeof response.text === "string" ? response.text : JSON.stringify(response.json || {});
      if (status >= 400) throw providerHttpError(status, text);
      if (response.json !== undefined) return response.json;
      try { return JSON.parse(text); } catch (_error) { return { text }; }
    }
    if (typeof fetch !== "function") throw new Error("No HTTP request adapter is available.");
    const response = await fetch(options.url, {
      method: options.method || "POST",
      headers: options.headers || {},
      body: options.body,
      signal: options.signal
    });
    const text = await response.text();
    if (!response.ok) throw providerHttpError(response.status, text);
    try { return JSON.parse(text); } catch (_error) { return { text }; }
  }

  async function getSecret(app, name) {
    if (!name || !app || !app.secretStorage || typeof app.secretStorage.getSecret !== "function") return "";
    return (await Promise.resolve(app.secretStorage.getSecret(name))) || "";
  }

  async function setSecret(app, name, value) {
    if (!name || !app || !app.secretStorage || typeof app.secretStorage.setSecret !== "function") return;
    await Promise.resolve(app.secretStorage.setSecret(name, value));
  }

  async function getProviderSecret(app, provider) {
    const current = await getSecret(app, provider && provider.apiKeySecret);
    if (current) return current;
    return getSecret(app, provider && provider.legacyApiKeySecret);
  }

  function extractJsonText(response) { return root.AIProviderResponse.extractJsonText(response); }
  function parseJsonPayload(text) { return root.AIProviderResponse.parseJsonPayload(text); }

  function authHeaders(provider, apiKey) {
    const headers = Object.assign({ "Content-Type": "application/json" }, provider.headers || {});
    if (provider.authMode === "none") return headers;
    if (provider.authMode === "api-key") headers[provider.apiKeyHeader || "api-key"] = apiKey;
    else headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  function normalizeGeminiSchema(schema) { return root.AIProviderSchema.normalizeGeminiSchema(schema); }
  function normalizeStructuredSchema(schema, provider) { return root.AIProviderSchema.normalizeStructuredSchema(schema, provider); }
  function isFormatRejection(error) {
    const haystack = [error && error.message, error && error.responseText, error].map((part) => String(part || "")).join("\n");
    return /요청 형식|response_format|json_schema|output format|JSON 출력 형식|Invalid value for 'response_format'|'response_format'|invalid_request_error/i.test(haystack);
  }

  async function requestGemini(options, apiKey) {
    const body = {
      model: options.provider.model,
      input: options.prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: normalizeGeminiSchema(options.schema)
      }
    };
    return httpRequest(options.app, {
      url: options.provider.endpointURL || GEMINI_ENDPOINT,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body),
      signal: options.signal
    });
  }

  async function requestOpenAiCompatible(options, apiKey) {
    const provider = options.provider;
    const baseURL = resolveBaseURL(provider, options.app);
    if (!baseURL) throw new Error(`${provider.name || "Provider"} baseURL is not configured.`);
    const capabilities = provider.capabilities || {};
    const useJsonSchema = capabilities.structuredOutput === "json-schema" && options.schema;
    const forcePlain = options.forcePlain === true;
    const body = {
      model: provider.model,
      stream: false,
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: options.prompt }
      ],
      response_format: (forcePlain || !useJsonSchema)
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: {
              name: provider.responseSchemaName || "prodigy_response",
              strict: capabilities.strictStructuredOutput === true,
              schema: normalizeStructuredSchema(options.schema, provider)
            }
          }
    };
    if (capabilities.conservativeProposal === true) body.temperature = 0;
    if (provider.reasoningEffort) body.reasoning_effort = provider.reasoningEffort;
    if (Number(provider.ttl) > 0) body.ttl = Number(provider.ttl);
    if (Number(provider.maxTokens) > 0) body.max_tokens = Number(provider.maxTokens);
    return httpRequest(options.app, {
      url: `${baseURL.replace(/\/$/, "")}${provider.endpointPath || "/chat/completions"}`,
      headers: authHeaders(provider, apiKey),
      body: JSON.stringify(body),
      signal: options.signal
    });
  }

  async function requestProviderStructuredJson(options) {
    const provider = options && options.provider;
    if (!provider || !provider.model) throw new Error("AI provider model is not configured.");
    const apiKey = provider.authMode === "none" ? "" : await getProviderSecret(options.app, provider);
    if (provider.authMode !== "none" && !apiKey) throw new Error(`${provider.name || "AI provider"} API key is not configured.`);
    const sleep = typeof options.sleep === "function"
      ? options.sleep
      : (ms) => wait(ms, options.signal);
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = provider.adapter === "gemini"
          ? await requestGemini(options, apiKey)
          : await requestOpenAiCompatible(options, apiKey);
        return parseJsonPayload(extractJsonText(response));
      } catch (error) {
        const status = Number(error && error.status || 0);
        const shouldRetry = TRANSIENT_HTTP_STATUSES.has(status) && attempt < RETRY_DELAYS_MS.length;
        if (shouldRetry) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        if (!options.forcePlain && provider.adapter !== "gemini" && status === 400 && isFormatRejection(error)) {
          try {
            const plainResponse = await requestOpenAiCompatible(Object.assign({}, options, { forcePlain: true }), apiKey);
            return parseJsonPayload(extractJsonText(plainResponse));
          } catch (_plainError) {
            // 형식 거부 다운그레이드도 실패하면 원래 오류를 그대로 표시
          }
        }
        throw error;
      }
    }
    throw new Error("AI 요청을 완료하지 못했습니다.");
  }

  async function isProviderConfigured(app, provider) {
    if (!provider || provider.authMode === "none") return true;
    return Boolean(await getProviderSecret(app, provider));
  }

  async function requestStructuredJson(options) {
    const provider = options && options.provider;
    if (!provider) throw new Error("AI provider is not configured.");
    const fallback = root.AIProviderFallback;
    try {
      if (!fallback || typeof fallback.requestWithFallback !== "function") return await requestProviderStructuredJson(options);
      const result = await fallback.requestWithFallback({
        provider,
        request: (candidate) => requestProviderStructuredJson(Object.assign({}, options, { provider: candidate })),
        isConfigured: (candidate) => isProviderConfigured(options.app, candidate)
      });
      return result.payload;
    } catch (error) {
      const attemptedFallback = error && error.prodigyFallback && error.prodigyFallback.fallback;
      const surfaced = userFacingProviderError(error, attemptedFallback || provider, options && options.app);
      if (attemptedFallback) {
        const primaryName = error.prodigyFallback.primary.name || "기본 AI 제공자";
        const fallbackName = attemptedFallback.name || "보조 AI 제공자";
        surfaced.message = `${primaryName} 요청 실패 후 ${fallbackName}도 응답하지 않았습니다. ${surfaced.message}`;
      }
      throw surfaced;
    }
  }

  async function listModels(options) {
    const provider = options && options.provider;
    const baseURL = resolveBaseURL(provider, options.app);
    if (!provider || !baseURL) throw new Error("AI provider baseURL is not configured.");
    const apiKey = provider.authMode === "none" ? "" : await getProviderSecret(options.app, provider);
    if (provider.authMode !== "none" && !apiKey) throw new Error(`${provider.name || "AI provider"} API key is not configured.`);
    const response = await httpRequest(options.app, {
      url: `${baseURL.replace(/\/$/, "")}/models`,
      method: "GET",
      headers: authHeaders(provider, apiKey),
      signal: options.signal
    });
    return (Array.isArray(response && response.data) ? response.data : [])
      .map((item) => String(item && item.id || "").trim())
      .filter(Boolean);
  }

  const api = { GEMINI_ENDPOINT, RETRY_DELAYS_MS, redactError, providerHttpError, userFacingProviderError, httpRequest, getSecret, setSecret, getProviderSecret, extractJsonText, parseJsonPayload, authHeaders, normalizeGeminiSchema, normalizeStructuredSchema, isMobileRuntime, resolveBaseURL, listModels, requestStructuredJson };

  root.AIProviderService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
