(function (root) {
  "use strict";

  const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
  const RETRY_DELAYS_MS = Object.freeze([1000, 2500]);
  const CHAT_TIMEOUT_MS = 30000;
  const STRUCTURED_TIMEOUT_MS = 60000;
  const SUBSCRIPTION_REJECTION = /구독|subscription|session|cookie|web[-_ ]ui|automation|consumer[-_ ]login|google[-_ ]account|chatgpt[-_ ](?:login|session|account)/i;

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
  function contextEnvelopeApi() {
    if (root.AIContextEnvelope) return root.AIContextEnvelope;
    if (typeof require === "function") return require("./ai-context-envelope.js");
    throw new Error("AIContextEnvelope must load before contextual chat.");
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

  function providerSecurityError(message) {
    const error = new Error(message);
    error.name = "ProviderSecurityError";
    return error;
  }

  function validateProviderSecurity(provider) {
    const source = provider || {};
    const serialized = JSON.stringify(source).toLowerCase();
    if (serialized.includes("antigravity") || /"agy"/.test(serialized)) {
      throw providerSecurityError("Antigravity 또는 agy 제공자는 지원하지 않습니다.");
    }
    if (/consumer.*oauth|oauth.*consumer/i.test(String(source.authMode || "")) || source.reuseConsumerOAuth === true || source.consumerOAuthReuse === true) {
      throw providerSecurityError("소비자 OAuth 재사용은 허용되지 않습니다.");
    }
    if (source.adapter === "subscription" || source.authMode === "subscription" || source.authMode === "consumer-session") {
      throw providerSecurityError("소비자 구독 로그인 세션은 API 자격증명이 아니며, 3rd-party wrapping은 약관 위반입니다. Gemini API 키 또는 로컬 OpenAI-compatible endpoint를 사용하세요.");
    }
    if (SUBSCRIPTION_REJECTION.test(String(source.name || "")) || SUBSCRIPTION_REJECTION.test(String(source.description || ""))) {
      throw providerSecurityError("구독 세션·쿠키·웹 UI 자동화를 provider로 등록할 수 없습니다. Gemini API 키 또는 로컬 OpenAI-compatible endpoint를 사용하세요.");
    }
    const bindValue = [source.bind, source.bindAddress, source.listen, source.host, source.hostname, source.publicBind, source.lanBind]
      .find((value) => value !== undefined && value !== null && String(value).trim());
    if (bindValue && !/^(?:127\.0\.0\.1|localhost|::1)$/i.test(String(bindValue).trim())) {
      throw providerSecurityError("AI 제공자는 로컬 루프백 주소에만 bind할 수 있습니다. 공개·LAN 바인딩은 보안상 허용되지 않으며, 원격 접근이 필요하면 Tailscale Serve를 사용하세요.");
    }
    const baseURL = String(source.localBaseURL || source.baseURL || "");
    if (/^https?:\/\/(?:0\.0\.0\.0|\[?::\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::|\/|$)/i.test(baseURL)) {
      throw providerSecurityError("공개 또는 LAN bind 주소는 허용되지 않습니다. 로컬 루프백을 사용해 주세요.");
    }
    return true;
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
    if (error && error.formatRejection === true) return true;
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

  function chatPayload(options) {
    return JSON.stringify({ message: String(options.prompt || ""), context: options.contextEnvelope });
  }

  async function requestGeminiChat(options, apiKey) {
    return httpRequest(options.app, {
      url: options.provider.endpointURL || GEMINI_ENDPOINT,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ model: options.provider.model, input: chatPayload(options) }),
      signal: options.signal
    });
  }

  async function requestOpenAiCompatibleChat(options, apiKey) {
    const provider = options.provider;
    const baseURL = resolveBaseURL(provider, options.app);
    if (!baseURL) throw new Error(`${provider.name || "Provider"} baseURL is not configured.`);
    const body = { model: provider.model, stream: false, messages: [{ role: "user", content: chatPayload(options) }] };
    if (Number(provider.maxTokens) > 0) body.max_tokens = Number(provider.maxTokens);
    return httpRequest(options.app, {
      url: `${baseURL.replace(/\/$/, "")}${provider.endpointPath || "/chat/completions"}`,
      headers: authHeaders(provider, apiKey),
      body: JSON.stringify(body),
      signal: options.signal
    });
  }

  async function requestProviderChatText(options) {
    const provider = options && options.provider;
    if (!provider || !provider.model) throw new Error("AI provider model is not configured.");
    if (provider.adapter === "openai-compatible" && !provider.model && provider.authMode !== "none") {
      throw new Error("로컬 AI 제공자에 모델 ID가 설정되지 않았습니다. 설정 → AI → 해당 제공자의 모델 ID를 입력해 주세요.");
    }
    validateProviderSecurity(provider);
    const apiKey = provider.authMode === "none" ? "" : await getProviderSecret(options.app, provider);
    if (provider.authMode !== "none" && !apiKey) {
      const providerName = provider.name || "AI 제공자";
      const secretField = provider.apiKeySecret || "API 키";
      throw new Error(`설정 → AI → ${providerName} API 키가 없습니다. ${secretField}을(를) 설정해 주세요.`);
    }
    const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : (Number(provider.chatTimeoutMs) > 0 ? Number(provider.chatTimeoutMs) : CHAT_TIMEOUT_MS);
    const sleep = typeof options.sleep === "function" ? options.sleep : (ms) => wait(ms, options.signal);
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      if (Date.now() >= deadline) throw new Error("AI 요청 시간이 초과되었습니다. 네트워크 상태와 제공자 설정을 확인해 주세요.");
      try {
        const response = provider.adapter === "gemini"
          ? await requestGeminiChat(options, apiKey)
          : await requestOpenAiCompatibleChat(options, apiKey);
        const text = extractJsonText(response).trim();
        if (!text) throw new Error("AI 제공자가 빈 응답을 반환했습니다.");
        return text;
      } catch (error) {
        const status = Number(error && error.status || 0);
        if (!TRANSIENT_HTTP_STATUSES.has(status) || attempt >= RETRY_DELAYS_MS.length) throw error;
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw new Error("AI 요청을 완료하지 못했습니다.");
  }

  async function requestProviderStructuredJson(options) {
    const provider = options && options.provider;
    if (!provider || !provider.model) throw new Error("AI provider model is not configured.");
    validateProviderSecurity(provider);
    const apiKey = provider.authMode === "none" ? "" : await getProviderSecret(options.app, provider);
    if (provider.authMode !== "none" && !apiKey) {
      const providerName = provider.name || "AI 제공자";
      const secretField = provider.apiKeySecret || "API 키";
      throw new Error(`설정 → AI → ${providerName} API 키가 없습니다. ${secretField}을(를) 설정해 주세요.`);
    }
    const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : (Number(provider.structuredTimeoutMs) > 0 ? Number(provider.structuredTimeoutMs) : STRUCTURED_TIMEOUT_MS);
    const sleep = typeof options.sleep === "function"
      ? options.sleep
      : (ms) => wait(ms, options.signal);
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      if (Date.now() >= deadline) throw new Error("AI 요청 시간이 초과되었습니다. 네트워크 상태와 제공자 설정을 확인해 주세요.");
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

  async function requestChatText(options) {
    const provider = options && options.provider;
    if (!provider) throw new Error("AI provider is not configured.");
    const contextEnvelope = contextEnvelopeApi().validateContextEnvelope(options.contextEnvelope);
    const requestOptions = Object.assign({}, options, { contextEnvelope });
    const fallback = root.AIProviderFallback;
    try {
      const result = !fallback || typeof fallback.requestWithFallback !== "function"
        ? { payload: await requestProviderChatText(requestOptions) }
        : await fallback.requestWithFallback({
            provider,
            request: (candidate) => requestProviderChatText(Object.assign({}, requestOptions, { provider: candidate })),
            isConfigured: (candidate) => isProviderConfigured(options.app, candidate)
          });
      return { text: result.payload, citations: contextEnvelope.citations.slice() };
    } catch (error) {
      throw userFacingProviderError(error, provider, options && options.app);
    }
  }

  async function listModels(options) {
    const provider = options && options.provider;
    validateProviderSecurity(provider);
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

  const api = { GEMINI_ENDPOINT, RETRY_DELAYS_MS, CHAT_TIMEOUT_MS, STRUCTURED_TIMEOUT_MS, SUBSCRIPTION_REJECTION, redactError, providerHttpError, userFacingProviderError, httpRequest, getSecret, setSecret, getProviderSecret, extractJsonText, parseJsonPayload, authHeaders, normalizeGeminiSchema, normalizeStructuredSchema, isMobileRuntime, resolveBaseURL, validateProviderSecurity, listModels, requestChatText, requestStructuredJson };

  root.AIProviderService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
