(function (root) {
  "use strict";

  const Core = root.KnowledgeExplorerBriefCore;
  const Policy = root.KnowledgeExplorerBriefPolicy;
  if (!Core || !Policy) throw new Error("Knowledge Explorer Brief core and policy modules must load before its service module.");

  const DEFAULT_TIMEOUT_MS = 5000;

  function buildAiPayload(packet, deterministic, requestTag) {
    return {
      schema_version: Core.BRIEF_SCHEMA_VERSION, domain: deterministic.domain, domain_label: deterministic.domain_label,
      request_tag: requestTag || "", allowed_source_ids: deterministic.source_ids,
      facts: {
        recent_additions: packet.recent_additions, explicit_link_frequency: packet.explicit_link_frequency,
        repeated_related_topics: packet.repeated_related_topics, unclassified_items: packet.unclassified_items
      },
      constraints: [
        "Return strict JSON only.", "Use only the provided facts and allowed source ids.",
        "Do not create, approve, mutate, use, apply, or validate any Knowledge.",
        "If there is no useful summary, return empty summary_lines."
      ]
    };
  }

  function buildBriefPrompt(packet, deterministic, requestTag) {
    return [
      "You are the Knowledge Explorer Brief summarizer.", "Return only JSON matching the schema.",
      "Summarize the provided bounded facts without inventing new sources or claims.",
      "Do not create, approve, mutate, use, apply, or validate any Knowledge.", "", "Payload:",
      JSON.stringify(buildAiPayload(packet, deterministic, requestTag), null, 2)
    ].join("\n");
  }

  function providerLoader(inputs) {
    if (typeof inputs.loadProviderConfig === "function") return inputs.loadProviderConfig;
    const configService = inputs.providerConfigService;
    return configService && typeof configService.loadProviderConfig === "function"
      ? configService.loadProviderConfig.bind(configService)
      : null;
  }

  function createKnowledgeExplorerBriefService(deps) {
    const inputs = Core.isPlainObject(deps) ? deps : {};
    const aiProviderService = inputs.aiProviderService || null;
    const loadProviderConfig = providerLoader(inputs);
    const redact = typeof inputs.redactError === "function"
      ? inputs.redactError
      : aiProviderService && typeof aiProviderService.redactError === "function"
        ? aiProviderService.redactError.bind(aiProviderService)
        : Policy.redactBriefError;
    const timeoutDefault = Number.isFinite(inputs.timeoutMs) ? Math.max(0, inputs.timeoutMs) : DEFAULT_TIMEOUT_MS;
    let nextRequestId = 0;
    let latestRequestId = 0;
    let latestBrief = Core.deepFreeze({ request_id: 0, status: "idle", applied: false, redacted_status: "idle", brief_lines: [], deterministic: null, ai_summary: null });

    async function resolveProvider(options) {
      if (options && Core.isPlainObject(options.provider)) return options.provider;
      if (!loadProviderConfig) return null;
      const config = options && Core.isPlainObject(options.config) ? options.config : await loadProviderConfig(options && options.app);
      const key = options && options.providerKey || config && config.defaultProvider;
      return config && config.providers && key ? config.providers[key] || null : null;
    }

    function markLatest(result, requestId) {
      if (requestId !== latestRequestId) return Core.deepFreeze({ ...result, applied: false, status: "stale", redacted_status: "stale response ignored" });
      latestBrief = Core.deepFreeze(result);
      return latestBrief;
    }

    async function runAiSummary(normalizedPacket, deterministic, options) {
      if (!aiProviderService || typeof aiProviderService.requestStructuredJson !== "function") return { status: "deterministic", ai_summary: null, redacted_status: "provider missing; deterministic brief only" };
      const provider = await resolveProvider(options || {});
      if (!provider || !provider.model) return { status: "deterministic", ai_summary: null, redacted_status: "provider missing; deterministic brief only" };
      const controller = new AbortController();
      const timeoutMs = Number.isFinite(options && options.timeoutMs) ? Math.max(0, options.timeoutMs) : timeoutDefault;
      const externalSignal = options && options.signal;
      if (externalSignal && externalSignal.aborted) return { status: "cancelled", ai_summary: null, redacted_status: "request cancelled" };
      let timer = null;
      let onAbort = null;
      let cancelRequest = null;
      const cancelled = new Promise((resolve) => { cancelRequest = resolve; });
      if (externalSignal) {
        onAbort = () => { controller.abort(); cancelRequest({ kind: "cancelled" }); };
        externalSignal.addEventListener("abort", onAbort, { once: true });
      }
      const providerRequest = Promise.resolve().then(() => aiProviderService.requestStructuredJson({
        app: options && options.app, provider, prompt: buildBriefPrompt(normalizedPacket, deterministic, options && options.requestTag),
        schema: Policy.BRIEF_AI_SUMMARY_SCHEMA, signal: controller.signal, requestTag: options && options.requestTag
      })).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
      const timeout = new Promise((resolve) => {
        if (timeoutMs === 0) { controller.abort(); resolve({ kind: "timeout" }); return; }
        timer = setTimeout(() => { controller.abort(); resolve({ kind: "timeout" }); }, timeoutMs);
      });
      const result = await Promise.race([providerRequest, timeout, cancelled]);
      if (timer) clearTimeout(timer);
      if (externalSignal && onAbort) externalSignal.removeEventListener("abort", onAbort);
      if (result.kind === "cancelled") return { status: "cancelled", ai_summary: null, redacted_status: "request cancelled" };
      if (result.kind === "timeout") return { status: "timeout", ai_summary: null, redacted_status: `timeout after ${timeoutMs}ms; deterministic brief only` };
      if (!result.ok) {
        const message = redact(result.error || new Error("Unknown brief provider error"));
        const status = /valid json|parse|json/i.test(message) ? "invalid_response" : "provider_error";
        return { status, ai_summary: null, redacted_status: `${status.replace(/_/g, " ")}: ${message}` };
      }
      try {
        return { status: "ai", ai_summary: Policy.normalizeAiSummary(result.value, new Set(deterministic.source_ids)), redacted_status: "ai summary accepted" };
      } catch (error) {
        const message = redact(error);
        return { status: "invalid_response", ai_summary: null, redacted_status: `invalid response: ${message}` };
      }
    }

    async function generateBrief(packet, options) {
      const requestId = ++nextRequestId;
      latestRequestId = requestId;
      const normalizedPacket = Core.normalizeSignalBundle(packet);
      const deterministic = Core.buildDeterministicBrief(normalizedPacket);
      let aiOutcome;
      try { aiOutcome = await runAiSummary(normalizedPacket, deterministic, options || {}); }
      catch (error) { aiOutcome = { status: "provider_error", ai_summary: null, redacted_status: redact(error) }; }
      const response = {
        request_id: requestId, schema_version: Core.BRIEF_SCHEMA_VERSION, domain: deterministic.domain, domain_label: deterministic.domain_label,
        status: aiOutcome.status, applied: true, redacted_status: aiOutcome.redacted_status, brief_lines: deterministic.lines.slice(),
        deterministic: { lines: deterministic.lines.slice(), source_ids: deterministic.source_ids.slice() },
        ai_summary: aiOutcome.ai_summary ? { status: "success", summary_lines: aiOutcome.ai_summary.summary_lines.slice(), source_ids: aiOutcome.ai_summary.source_ids.slice() } : null
      };
      return markLatest(response, requestId);
    }

    return Core.deepFreeze({
      generateBrief, getLatestBrief: () => latestBrief, buildBrief: generateBrief,
      buildDeterministicBrief: Core.buildDeterministicBrief, normalizeAiSummary: Policy.normalizeAiSummary,
      redactBriefError: Policy.redactBriefError, BRIEF_AI_SUMMARY_SCHEMA: Policy.BRIEF_AI_SUMMARY_SCHEMA
    });
  }

  root.KnowledgeExplorerBriefRuntime = Object.freeze({ createKnowledgeExplorerBriefService });
})(typeof window !== "undefined" ? window : globalThis);
