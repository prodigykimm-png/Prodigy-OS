(function (root) {
  "use strict";

  const Core = root.KnowledgeExplorerBriefCore;
  if (!Core) throw new Error("Knowledge Explorer Brief core must load before its policy module.");

  const ALLOWED_SUMMARY_KEYS = new Set(["schema_version", "summary_lines", "source_ids"]);
  const ENGLISH_OUTCOME_CLAIM = /\b(?:used|applied|validated)\b/i;
  const KOREAN_OUTCOME_CLAIM = /(?:사용|활용|적용|검증|확인)(?:되(?:었|는|던|어|며|면|다|습니다|었음)?|됩|됐(?:다|습니다|어요|음)?|하(?:였|는|던|여|고|면|다|습니다|였음)?|해(?:서|도|요)?|했(?:다|습니다|어요|던|고|음)?|된|됨|했다|하였다|했습니다|되었습니다|되었다|되었음)/;

  const BRIEF_AI_SUMMARY_SCHEMA = Object.freeze({
    type: "object",
    properties: {
      schema_version: { type: "integer" },
      summary_lines: { type: "array", maxItems: 3, items: { type: "string" } },
      source_ids: { type: "array", maxItems: 6, items: { type: "string" } }
    },
    required: ["schema_version", "summary_lines", "source_ids"]
  });

  function containsOutcomeClaim(text) {
    return ENGLISH_OUTCOME_CLAIM.test(text) || KOREAN_OUTCOME_CLAIM.test(text);
  }

  function redactBriefError(error) {
    const text = error && error.message ? error.message : String(error || "Unknown brief error");
    return text.replace(/[A-Za-z0-9_\-]{20,}/g, "[redacted]");
  }

  function normalizeAiSummary(raw, allowlist) {
    if (!Core.isPlainObject(raw)) throw new Error("Brief AI response must be a JSON object.");
    for (const key of Object.keys(raw)) if (!ALLOWED_SUMMARY_KEYS.has(key)) throw new Error(`Brief AI response contained unsupported key: ${key}`);
    if (Core.normalizeNumber(raw.schema_version) !== Core.BRIEF_SCHEMA_VERSION) throw new Error("Brief AI response schema version is unsupported.");
    if (!Array.isArray(raw.summary_lines) || !raw.summary_lines.length) throw new Error("Brief AI response is missing summary_lines.");
    if (raw.summary_lines.length > 3) throw new Error("Brief AI response contains too many summary lines.");
    const summary_lines = raw.summary_lines.map((line) => {
      const text = Core.normalizeText(line);
      if (!text) throw new Error("Brief AI response contains an empty summary line.");
      if (containsOutcomeClaim(text)) throw new Error("Brief AI response contains a forbidden outcome claim.");
      return text;
    });
    if (!Array.isArray(raw.source_ids) || !raw.source_ids.length) throw new Error("Brief AI response is missing source_ids.");
    const source_ids = Core.uniqueStable(raw.source_ids.map(Core.canonicalSourceId));
    if (!source_ids.length) throw new Error("Brief AI response is missing valid source_ids.");
    for (const source_id of source_ids) if (!allowlist.has(source_id)) throw new Error(`Brief AI response referenced an unknown source id: ${source_id}`);
    return Core.deepFreeze({ schema_version: Core.BRIEF_SCHEMA_VERSION, summary_lines, source_ids });
  }

  root.KnowledgeExplorerBriefPolicy = Object.freeze({
    BRIEF_AI_SUMMARY_SCHEMA, containsOutcomeClaim, redactBriefError, normalizeAiSummary
  });
})(typeof window !== "undefined" ? window : globalThis);
