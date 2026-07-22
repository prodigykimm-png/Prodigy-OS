(function (root) {
  "use strict";

  const Core = root.KnowledgeExplorerBriefCore;
  const Policy = root.KnowledgeExplorerBriefPolicy;
  const Runtime = root.KnowledgeExplorerBriefRuntime;
  if (!Core || !Policy || !Runtime) throw new Error("Knowledge Explorer Brief modules must load before the public API.");

  const api = Object.freeze({
    BRIEF_SCHEMA_VERSION: Core.BRIEF_SCHEMA_VERSION,
    BRIEF_AI_SUMMARY_SCHEMA: Policy.BRIEF_AI_SUMMARY_SCHEMA,
    buildDeterministicBrief: Core.buildDeterministicBrief,
    normalizeAiSummary: Policy.normalizeAiSummary,
    normalizeBriefSummary: Policy.normalizeAiSummary,
    redactBriefError: Policy.redactBriefError,
    createKnowledgeExplorerBriefService: Runtime.createKnowledgeExplorerBriefService
  });
  root.KnowledgeExplorerBriefService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
