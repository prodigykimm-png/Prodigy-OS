(function (root) {
  "use strict";

  function addButton(actions, text, primary) {
    return root.ProdigyUI ? root.ProdigyUI.button(actions, text, primary ? { primary: true } : undefined) : actions.createEl("button", { text, attr: { type: "button", class: `prodigy-btn${primary ? " prodigy-btn-primary" : ""}` } });
  }
  async function saveProposedEvidenceAtCommit(app, dateStr, proposedBlocks, options) {
    return root.JournalStore.mergeProposedEvidenceAtCommit(app, dateStr, proposedBlocks, options);
  }
  async function saveSelectedKnowledgeCandidatesAfterEvidence(app, handoff) {
    const request = handoff || {};
    if (request.evidenceConfirmed !== true) return { saved: [], blocked: [], guidance: [] };
    const ai = root.DailyReflectionAI;
    const store = root.KnowledgeCandidateStore;
    if (!ai || typeof ai.prepareKnowledgeCandidateHandoff !== "function") throw new Error("Daily Reflection AI를 먼저 불러와야 합니다.");
    if (!store || typeof store.saveCandidate !== "function") throw new Error("Knowledge Candidate Store를 먼저 불러와야 합니다.");
    const prepared = ai.prepareKnowledgeCandidateHandoff(request.proposal, { selectedCandidateIndexes: request.selectedCandidateIndexes, selectedEvidenceIds: request.selectedEvidenceIds, savedBlocks: request.saveResult && request.saveResult.blocks, evidenceIdMap: request.saveResult && request.saveResult.evidenceIdMap, dailyPath: request.saveResult && request.saveResult.path, thinOverrides: request.thinOverrides });
    const saved = [];
    for (const candidate of prepared.ready) saved.push(await store.saveCandidate(app, candidate));
    return Object.assign({}, prepared, { saved });
  }
  function render(actions, options) {
    const hasStagedDelete = Array.isArray(options.deleteEvidenceIds) && options.deleteEvidenceIds.length > 0;
    if (options.todayReview.status === "complete" && !hasStagedDelete) return;
    const confirm = addButton(actions, "오늘 증거 검토·확정", true);
    confirm.onclick = () => options.openProposeEvidenceModal(options.app, options.today, async (proposed) => {
      const saved = await saveProposedEvidenceAtCommit(options.app, options.today, proposed, {
        deleteEvidenceIds: Array.isArray(options.deleteEvidenceIds) ? options.deleteEvidenceIds : []
      });
      if (window.Notice) new Notice(`${proposed.length}개 증거를 반영했습니다.`);
      await options.refresh();
      return saved;
    }, {
      existingBlocks: options.blocks,
      onEvidenceSaved: async (handoff) => {
        const result = await saveSelectedKnowledgeCandidatesAfterEvidence(options.app, Object.assign({}, handoff, { evidenceConfirmed: true, selectedCandidateIndexes: handoff.selectedKnowledgeCandidateIndexes }));
        if (result.blocked.length && window.Notice) new Notice(result.blocked[0].message);
        if (result.saved.length && window.Notice) new Notice(`${result.saved.length}개 지식 후보를 저장했습니다.`);
        return result;
      }
    });
  }

  const api = { render, saveProposedEvidenceAtCommit, saveSelectedKnowledgeCandidatesAfterEvidence };
  root.JournalCompletionAction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
