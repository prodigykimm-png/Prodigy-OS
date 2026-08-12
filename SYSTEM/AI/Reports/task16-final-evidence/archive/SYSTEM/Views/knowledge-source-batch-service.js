(function (root) {
  "use strict";

  if (typeof require === "function" && !root.KnowledgeSourceBatchPolicy) root.KnowledgeSourceBatchPolicy = require("./knowledge-source-batch-policy.js");
  const Policy = root.KnowledgeSourceBatchPolicy;
  if (!Policy) throw new Error("Knowledge source batch policy must load before its service module.");

  const DEFAULT_TIMEOUT_MS = 8000;
  const FALLBACK_MESSAGE = "사용자 텍스트 또는 메모를 입력한 뒤 다시 요약해 주세요.";

  function clean(value) { return typeof value === "string" ? value.trim().normalize("NFC") : ""; }
  function freeze(value) { return Object.freeze(value); }
  function safeErrorStatus(status, message) { return { status, ai: null, redacted_status: message }; }

  function providerLoader(inputs) {
    if (typeof inputs.loadProviderConfig === "function") return inputs.loadProviderConfig;
    const service = inputs.providerConfigService;
    return service && typeof service.loadProviderConfig === "function" ? service.loadProviderConfig.bind(service) : null;
  }

  function publicFallback(item, result) {
    return {
      item_id: clean(item && item.item_id),
      status: "fallback_required",
      title: clean(result && result.title),
      publisher: clean(result && result.publisher),
      date: clean(result && result.date),
      user_message: FALLBACK_MESSAGE
    };
  }

  function publicRetrieved(result) {
    return {
      item_id: clean(result && result.item_id),
      status: "retrieved",
      title: clean(result && result.title),
      publisher: clean(result && result.publisher),
      date: clean(result && result.date),
      text_origin: "explicit_retrieval"
    };
  }

  function isValidSourceBatch(items) {
    if (!Array.isArray(items) || !items.length || items.length > Policy.MAX_BATCH_ITEMS) return false;
    const itemIds = new Set();
    for (const item of items) {
      const itemId = clean(item && item.item_id);
      if (!item || typeof item !== "object" || Array.isArray(item) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(itemId) || itemIds.has(itemId)) return false;
      itemIds.add(itemId);
    }
    return true;
  }

  function createKnowledgeSourceBatchService(deps) {
    const inputs = deps && typeof deps === "object" ? deps : {};
    const fetchService = inputs.fetchService || null;
    const aiProviderService = inputs.aiProviderService || null;
    const loadProviderConfig = providerLoader(inputs);
    const defaultTimeout = Number.isFinite(inputs.timeoutMs) ? Math.max(0, inputs.timeoutMs) : DEFAULT_TIMEOUT_MS;
    let nextRequestId = 0;
    let latestRequestId = 0;
    let currentController = null;
    let latestResult = freeze({ request_id: 0, status: "idle", applied: false, redacted_status: "대기 중", items: [] });

    async function resolveProvider(options) {
      if (options && options.provider && typeof options.provider === "object") return options.provider;
      if (!loadProviderConfig) return null;
      const config = options && options.config && typeof options.config === "object" ? options.config : await loadProviderConfig(options && options.app);
      const key = options && options.providerKey || config && config.defaultProvider;
      return config && config.providers && key ? config.providers[key] || null : null;
    }

    function markLatest(result, requestId) {
      if (requestId !== latestRequestId) return freeze({ ...result, status: "stale", applied: false, redacted_status: "더 최근 요청의 결과를 사용합니다." });
      latestResult = freeze(result);
      return latestResult;
    }

    async function runProvider(items, options, signal) {
      if (!aiProviderService || typeof aiProviderService.requestStructuredJson !== "function") return safeErrorStatus("provider_missing", "AI 제공자를 사용할 수 없습니다. 사용자 텍스트는 유지됩니다.");
      let provider;
      try { provider = await resolveProvider(options || {}); } catch (error) { return safeErrorStatus("provider_error", "AI 제공자 설정을 확인해 주세요."); }
      if (!provider || !provider.model) return safeErrorStatus("provider_missing", "AI 제공자를 사용할 수 없습니다. 사용자 텍스트는 유지됩니다.");
      if (signal && signal.aborted) return safeErrorStatus("cancelled", "요약 요청을 취소했습니다. 사용자 텍스트는 유지됩니다.");
      const controller = new AbortController();
      let timer = null;
      let onAbort = null;
      let cancel;
      const cancelled = new Promise((resolve) => { cancel = resolve; });
      if (signal) {
        onAbort = () => { controller.abort(); cancel({ kind: "cancelled" }); };
        signal.addEventListener("abort", onAbort, { once: true });
      }
      const timeoutMs = Number.isFinite(options && options.timeoutMs) ? Math.max(0, options.timeoutMs) : defaultTimeout;
      const request = Promise.resolve().then(() => aiProviderService.requestStructuredJson({
        app: options && options.app,
        provider,
        prompt: Policy.buildPrompt(items),
        schema: Policy.SOURCE_BATCH_RESPONSE_SCHEMA,
        signal: controller.signal,
        requestTag: options && options.requestTag
      })).then((value) => ({ ok: true, value }), () => ({ ok: false }));
      const timeout = new Promise((resolve) => {
        if (timeoutMs === 0) { controller.abort(); resolve({ kind: "timeout" }); return; }
        timer = setTimeout(() => { controller.abort(); resolve({ kind: "timeout" }); }, timeoutMs);
      });
      const settled = await Promise.race([request, timeout, cancelled]);
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
      if (settled && settled.kind === "cancelled") return safeErrorStatus("cancelled", "요약 요청을 취소했습니다. 사용자 텍스트는 유지됩니다.");
      if (settled && settled.kind === "timeout") return safeErrorStatus("timeout", "요약 시간이 초과되었습니다. 사용자 텍스트는 유지됩니다.");
      if (!settled || !settled.ok) return safeErrorStatus("provider_error", "AI 요약을 완료하지 못했습니다. 사용자 텍스트는 유지됩니다.");
      try { return { status: "ai", ai: Policy.normalizeBatchResponse(settled.value, items), redacted_status: "AI 요약을 준비했습니다." }; }
      catch (error) { return safeErrorStatus("invalid_response", "AI 응답 형식을 확인하지 못했습니다. 사용자 텍스트는 유지됩니다."); }
    }

    function shapeResult(requestId, outcome, itemStates) {
      const summaryById = new Map(outcome.ai ? outcome.ai.items.map((item) => [item.item_id, item]) : []);
      return {
        request_id: requestId,
        status: outcome.status,
        applied: true,
        redacted_status: outcome.redacted_status,
        items: itemStates.map((item) => {
          const summary = summaryById.get(item.item_id);
          return summary ? { ...item, summary: summary.summary, uncertainties: summary.uncertainties.slice() } : item;
        })
      };
    }

    async function summarizeSuppliedText(items, options) {
      const requestId = ++nextRequestId;
      latestRequestId = requestId;
      const controller = new AbortController();
      currentController = controller;
      const settings = options && typeof options === "object" ? options : {};
      let detach = null;
      if (settings.signal) {
        if (settings.signal.aborted) controller.abort();
        else { detach = () => controller.abort(); settings.signal.addEventListener("abort", detach, { once: true }); }
      }
      let normalized;
      try { normalized = Policy.normalizeBatchItems(items); }
      catch (error) {
        if (detach) settings.signal.removeEventListener("abort", detach);
        const fallbackItems = Array.isArray(items) ? items.map((item) => publicFallback(item)) : [];
        return markLatest(shapeResult(requestId, safeErrorStatus("fallback_required", FALLBACK_MESSAGE), fallbackItems), requestId);
      }
      const publicItems = normalized.map((item) => ({ item_id: item.item_id, status: "text_ready", text_origin: item.text_origin }));
      const outcome = await runProvider(normalized, settings, controller.signal);
      if (detach) settings.signal.removeEventListener("abort", detach);
      if (currentController === controller) currentController = null;
      return markLatest(shapeResult(requestId, outcome, publicItems), requestId);
    }

    async function retrieveAndSummarize(items, options) {
      const requestId = ++nextRequestId;
      latestRequestId = requestId;
      const controller = new AbortController();
      currentController = controller;
      const settings = options && typeof options === "object" ? options : {};
      let detach = null;
      if (settings.signal) {
        if (settings.signal.aborted) controller.abort();
        else { detach = () => controller.abort(); settings.signal.addEventListener("abort", detach, { once: true }); }
      }
      const sourceItems = Array.isArray(items) ? items : [];
      const finish = (result) => {
        if (detach) settings.signal.removeEventListener("abort", detach);
        if (currentController === controller) currentController = null;
        return result;
      };
      if (!isValidSourceBatch(items)) {
        const fallbackItems = sourceItems.map((item) => publicFallback(item));
        return finish(markLatest(shapeResult(requestId, safeErrorStatus("fallback_required", FALLBACK_MESSAGE), fallbackItems), requestId));
      }
      const collected = [];
      const states = [];
      for (const item of sourceItems) {
        const fallbackText = clean(item && item.fallback_text);
        if (fallbackText) {
          collected.push({ item_id: clean(item.item_id), text_origin: "typed_fallback", text: fallbackText });
          states.push({ item_id: clean(item.item_id), status: "text_ready", text_origin: "typed_fallback" });
          continue;
        }
        if (!fetchService || typeof fetchService.retrieveArticle !== "function" || controller.signal.aborted) {
          states.push(publicFallback(item));
          continue;
        }
        let transientText = "";
        let fetched = null;
        try {
          fetched = await fetchService.retrieveArticle(item, {
            signal: controller.signal,
            timeoutMs: settings.timeoutMs,
            onRetrieved(text) { transientText = clean(text); }
          });
        } catch (error) {
          fetched = null;
        }
        if (fetched && fetched.status === "retrieved" && transientText) {
          collected.push({ item_id: clean(item.item_id), text_origin: "explicit_retrieval", text: transientText });
          states.push(publicRetrieved(fetched));
        } else {
          states.push(publicFallback(item, fetched));
        }
      }
      if (controller.signal.aborted) return finish(markLatest(shapeResult(requestId, safeErrorStatus("cancelled", "가져오기 요청을 취소했습니다. 사용자 텍스트는 유지됩니다."), states), requestId));
      if (!sourceItems.length || collected.length !== sourceItems.length) return finish(markLatest(shapeResult(requestId, safeErrorStatus("fallback_required", FALLBACK_MESSAGE), states), requestId));
      let normalized;
      try { normalized = Policy.normalizeBatchItems(collected); }
      catch (error) { return finish(markLatest(shapeResult(requestId, safeErrorStatus("fallback_required", FALLBACK_MESSAGE), states), requestId)); }
      const outcome = await runProvider(normalized, settings, controller.signal);
      return finish(markLatest(shapeResult(requestId, outcome, states), requestId));
    }

    return freeze({
      retrieveAndSummarize,
      summarizeSuppliedText,
      cancelCurrent() { if (currentController) currentController.abort(); },
      getLatestResult() { return latestResult; }
    });
  }

  const api = freeze({ createKnowledgeSourceBatchService });
  root.KnowledgeSourceBatchRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
