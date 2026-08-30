(function (root) {
  "use strict";
  const VERSION = "llmwiki_correction_signals_v1";
  const ALLOWED_ACTIONS = Object.freeze(["exclude_page", "include_page", "split_page", "merge_pages", "retitle_page"]);
  const CANDIDATE_THRESHOLD = 3;
  const TAG_PATTERN = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/u;

  function createCorrectionSignals(initial = {}) {
    const counts = new Map(Object.entries(initial.counts || {}).filter(([, value]) => Number.isInteger(value) && value > 0));
    function record(event = {}) {
      const action = String(event.action || "");
      const tag = String(event.taxonomy_tag || "");
      if (!ALLOWED_ACTIONS.includes(action) || !TAG_PATTERN.test(tag)) return { ok: false, reason: "unsupported_correction_event" };
      const key = `${action}::${tag}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      return { ok: true, key, count: counts.get(key) };
    }
    function getSnapshot() {
      return { version: VERSION, counts: Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) };
    }
    function getImprovementCandidates() {
      return [...counts.entries()].filter(([, count]) => count >= CANDIDATE_THRESHOLD).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
        const [action, taxonomyTag] = key.split("::");
        return { action, taxonomy_tag: taxonomyTag, count, status: "review_candidate", applies_automatically: false };
      });
    }
    return Object.freeze({ record, getSnapshot, getImprovementCandidates });
  }

  const api = Object.freeze({ VERSION, ALLOWED_ACTIONS, CANDIDATE_THRESHOLD, createCorrectionSignals });
  root.LLMWikiCorrectionSignals = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
