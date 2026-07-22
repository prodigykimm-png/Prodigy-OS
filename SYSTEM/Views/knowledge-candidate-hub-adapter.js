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
    const candidateInbox = { candidates: [], phase: "ready", error: false };
    try { candidateInbox.candidates = await loadCandidates(); }
    catch (_error) { candidateInbox.error = true; }
    return { candidateInbox, candidateStore: store, loadCandidates };
  }

  const api = Object.freeze({ createCandidateInboxConfig });
  root.KnowledgeCandidateHubAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
