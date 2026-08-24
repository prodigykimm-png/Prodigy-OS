"use strict";

(function (root) {
  function candidateStore() {
    const globalRoot = typeof globalThis !== "undefined" ? globalThis : root;
    return root.KnowledgeCandidateStore || globalRoot.KnowledgeCandidateStore || null;
  }

  async function createCandidateInboxConfig(app) {
    const store = candidateStore();
    const loadCandidates = async () => store && typeof store.listCandidates === "function"
      ? store.listCandidates(app, { status: "active" }) : [];
    const candidateInbox = { candidates: [], phase: "ready", error: false, expanded: false };
    try { candidateInbox.candidates = await loadCandidates(); }
    catch (_error) { candidateInbox.error = true; }
    const onLlmWikiHandoff = async (candidate) => {
      const hub = root.KnowledgeExplorerHub || (typeof globalThis !== "undefined" && globalThis.KnowledgeExplorerHub);
      if (!hub || typeof hub.handoffCandidateToLlmWiki !== "function") return { ok: false, status: "failed", reason: "llmwiki_handoff_unavailable" };
      return hub.handoffCandidateToLlmWiki(candidate);
    };
    return { candidateInbox, candidateStore: store, loadCandidates, onLlmWikiHandoff };
  }

  const api = Object.freeze({ createCandidateInboxConfig });
  root.KnowledgeCandidateHubAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
