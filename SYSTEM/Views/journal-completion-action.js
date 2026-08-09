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
    const fields = options.todayReview && options.todayReview.fields || {};
    const openKnowledgeReview = () => {
      const route = root.KnowledgeWorkspaceRoute;
      if (route && typeof route.openReview === "function") return route.openReview(options.app);
      const workspace = options.app && options.app.workspace;
      if (workspace && typeof workspace.openLinkText === "function") return workspace.openLinkText("HUB/50 Knowledge", "", false);
      if (window.Notice) new Notice("Knowledge 워크스페이스를 열 수 없습니다. HUB/50 Knowledge.md에서 검토해 주세요.");
      return false;
    };
    const openDiary = (startClassification) => options.openProposeEvidenceModal(options.app, options.today, async (proposed) => {
      const saved = await saveProposedEvidenceAtCommit(options.app, options.today, proposed, {
        deleteEvidenceIds: Array.isArray(options.deleteEvidenceIds) ? options.deleteEvidenceIds : []
      });
      if (window.Notice) new Notice(`${proposed.length}개 증거를 반영했습니다.`);
      await options.refresh();
      return saved;
    }, {
      existingBlocks: options.blocks,
      initialReflection: fields.reflection,
      startClassification: Boolean(startClassification),
      onReflectionCommit: ({ freeText }) => root.JournalStore.saveReflection(options.app, options.today, freeText),
      onKnowledgeReview: openKnowledgeReview,
      onEvidenceSaved: async (handoff) => {
        const result = await saveSelectedKnowledgeCandidatesAfterEvidence(options.app, Object.assign({}, handoff, { evidenceConfirmed: true, selectedCandidateIndexes: handoff.selectedKnowledgeCandidateIndexes }));
        if (result.blocked.length && window.Notice) new Notice(result.blocked[0].message);
        if (result.saved.length && window.Notice) new Notice(`${result.saved.length}개 지식 후보를 저장했습니다.`);
        return result;
      }
    });
    const write = addButton(actions, "일기 쓰기", true);
    write.onclick = () => openDiary(false);
    const classify = addButton(actions, "AI 분류");
    classify.disabled = !String(fields.reflection || "").trim();
    classify.setAttribute("aria-disabled", String(classify.disabled));
    classify.onclick = () => {
      if (classify.disabled) {
        if (window.Notice) new Notice("먼저 일기를 저장해 주세요.");
        return;
      }
      openDiary(true);
    };
    if (options.todayReview.status === "partial" && typeof options.completeDaily === "function" && !hasStagedDelete) {
      const complete = addButton(actions, "작성 완료");
      complete.onclick = async () => {
        complete.disabled = true;
        try {
          await options.completeDaily(options.app, options.today);
          if (window.Notice) new Notice(`${options.today} Daily 작성을 완료했습니다.`);
          await options.refresh();
        } catch (error) {
          complete.disabled = false;
          if (window.Notice) new Notice(`Daily 완료 처리 실패: ${error.message || error}`);
        }
      };
    }
    if (hasStagedDelete) {
      const review = addButton(actions, "증거 변경 검토");
      review.onclick = () => openDiary(false);
    }
  }

  const api = { render, saveProposedEvidenceAtCommit, saveSelectedKnowledgeCandidatesAfterEvidence };
  root.JournalCompletionAction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
