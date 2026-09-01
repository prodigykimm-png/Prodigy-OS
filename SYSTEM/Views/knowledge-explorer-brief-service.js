(function (root) {
  "use strict";

  const Core = root.KnowledgeExplorerBriefCore;
  const Policy = root.KnowledgeExplorerBriefPolicy;
  if (!Core || !Policy) throw new Error("Knowledge Explorer Brief core and policy modules must load before its service module.");
  if (typeof require === "function" && !root.ProdigyAIConsumerRuntime) {
    root.ProdigyAIConsumerRuntime = require("./prodigy-ai-consumer-runtime.js");
  }
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function buildAiPayload(packet, deterministic, requestTag) {
    return {
      schema_version: Core.BRIEF_SCHEMA_VERSION,
      domain: deterministic.domain,
      domain_label: deterministic.domain_label,
      request_tag: requestTag || "",
      allowed_source_ids: deterministic.source_ids,
      facts: {
        recent_additions: packet.recent_additions,
        explicit_link_frequency: packet.explicit_link_frequency,
        repeated_related_topics: packet.repeated_related_topics,
        unclassified_items: packet.unclassified_items,
      },
      constraints: [
        "Return strict JSON only.",
        "Use only the provided facts and allowed source ids.",
        "Do not create, approve, mutate, use, apply, or validate any Knowledge.",
        "If there is no useful summary, return empty summary_lines.",
      ],
    };
  }

  function buildBriefPrompt(packet, deterministic, requestTag) {
    return [
      "You are the Knowledge Explorer Brief summarizer.",
      "Return only JSON matching the schema.",
      "Summarize the provided bounded facts without inventing new sources or claims.",
      "Do not create, approve, mutate, use, apply, or validate any Knowledge.",
      "",
      "Payload:",
      JSON.stringify(buildAiPayload(packet, deterministic, requestTag), null, 2),
    ].join("\n");
  }

  function createKnowledgeExplorerBriefService(deps) {
    const inputs = plain(deps) ? deps : {};
    const consumerRuntime = inputs.consumerRuntime || root.ProdigyAIConsumerRuntime;
    const redact = typeof inputs.redactError === "function" ? inputs.redactError : Policy.redactBriefError;
    let nextRequestId = 0;
    let latestRequestId = 0;
    let latestBrief = deepFreeze({
      request_id: 0,
      status: "idle",
      applied: false,
      redacted_status: "idle",
      brief_lines: [],
      deterministic: null,
      ai_summary: null,
    });

    function markLatest(result, requestId) {
      if (requestId !== latestRequestId) {
        return deepFreeze({ ...result, applied: false, status: "stale", redacted_status: "stale response ignored" });
      }
      latestBrief = deepFreeze(result);
      return latestBrief;
    }

    async function runAiSummary(normalizedPacket, deterministic, options) {
      if (options.aiRequested !== true) {
        return { status: "deterministic", ai_summary: null, redacted_status: "AI summary not requested" };
      }
      if (!consumerRuntime || typeof consumerRuntime.requestStructured !== "function") {
        return { status: "deterministic", ai_summary: null, redacted_status: "runtime missing; deterministic brief only" };
      }
      try {
        const response = await consumerRuntime.requestStructured({
          app: options.app,
          client: options.client || inputs.client,
          consumerId: "knowledge.explorer_brief",
          prompt: buildBriefPrompt(normalizedPacket, deterministic, options.requestTag),
          schema: Policy.BRIEF_AI_SUMMARY_SCHEMA,
          signal: options.signal,
          confirmConsent: options.confirmConsent,
        });
        return {
          status: "ai",
          ai_summary: Policy.normalizeAiSummary(response.payload, new Set(deterministic.source_ids)),
          redacted_status: "ai summary accepted",
        };
      } catch (error) {
        const code = String(error && error.code || "");
        if (code === "cancel_requested") return { status: "cancelled", ai_summary: null, redacted_status: "request cancelled" };
        if (code === "timeout") return { status: "timeout", ai_summary: null, redacted_status: "runtime timeout; deterministic brief only" };
        return { status: "provider_error", ai_summary: null, redacted_status: `runtime error: ${redact(error)}` };
      }
    }

    async function generateBrief(packet, options) {
      const requestId = ++nextRequestId;
      latestRequestId = requestId;
      const normalizedPacket = Core.normalizeSignalBundle(packet);
      const deterministic = Core.buildDeterministicBrief(normalizedPacket);
      const aiOutcome = await runAiSummary(normalizedPacket, deterministic, options || {});
      return markLatest({
        request_id: requestId,
        schema_version: Core.BRIEF_SCHEMA_VERSION,
        domain: deterministic.domain,
        domain_label: deterministic.domain_label,
        status: aiOutcome.status,
        applied: true,
        redacted_status: aiOutcome.redacted_status,
        brief_lines: deterministic.lines.slice(),
        deterministic: { lines: deterministic.lines.slice(), source_ids: deterministic.source_ids.slice() },
        ai_summary: aiOutcome.ai_summary ? {
          status: "success",
          summary_lines: aiOutcome.ai_summary.summary_lines.slice(),
          source_ids: aiOutcome.ai_summary.source_ids.slice(),
        } : null,
      }, requestId);
    }

    return deepFreeze({
      generateBrief,
      getLatestBrief: () => latestBrief,
      buildBrief: generateBrief,
      buildDeterministicBrief: Core.buildDeterministicBrief,
      normalizeAiSummary: Policy.normalizeAiSummary,
      redactBriefError: Policy.redactBriefError,
      BRIEF_AI_SUMMARY_SCHEMA: Policy.BRIEF_AI_SUMMARY_SCHEMA,
    });
  }

  root.KnowledgeExplorerBriefRuntime = Object.freeze({ createKnowledgeExplorerBriefService });
})(typeof window !== "undefined" ? window : globalThis);
