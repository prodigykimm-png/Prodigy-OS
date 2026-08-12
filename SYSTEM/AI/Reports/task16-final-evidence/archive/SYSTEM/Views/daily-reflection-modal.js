(function (root) {
  "use strict";
  function showNotice(message) { const NoticeClass = root.Notice || (typeof window !== "undefined" && window.Notice); if (typeof NoticeClass === "function") new NoticeClass(message); }
  function showUnavailable(browserWindow) { const message = "AI 성찰 제안 화면을 불러오지 못했습니다. Obsidian을 다시 열어 주세요."; const NoticeClass = root.Notice || browserWindow.Notice; if (typeof NoticeClass === "function") new NoticeClass(message); else if (typeof browserWindow.alert === "function") browserWindow.alert(message); }
  function openPath(app, path) { if (root.JournalView && typeof root.JournalView.openPath === "function") root.JournalView.openPath(app, path); }
  function activeElement(browserWindow) {
    const doc = root.document || (browserWindow && browserWindow.document);
    return doc && doc.activeElement ? doc.activeElement : null;
  }
  function restoreFocus(element) {
    if (!element || typeof element.focus !== "function" || element.isConnected === false) return;
    try { element.focus(); } catch (_e) { /* ignore */ }
  }
  function ready() { return root.DailyReflectionModalStyles && root.DailyReflectionModalState && root.DailyReflectionProposalInputView && root.DailyReflectionProposalCandidatesView && root.DailyReflectionEvidenceReviewView && root.DailyReflectionCandidateHandoffView && root.DailyReflectionPostSave; }
  function openProposeEvidenceModal(app, dateStr, onConfirm, options) {
    const opts = options || {};
    const browserWindow = typeof window !== "undefined" ? window : root;
    const obsidianModule = root.obsidian || browserWindow.obsidian;
    if (!obsidianModule || !obsidianModule.Modal || !ready()) return showUnavailable(browserWindow);
    class ProposeModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.app = appInstance;
        this.freeText = String(opts.initialReflection || "");
        this.committedReflectionText = this.freeText.trim();
        this.startClassification = Boolean(opts.startClassification);
        this.proposal = null;
        this.selectedIds = new Set();
        this.selectedObjectPaths = new Set();
        this.dismissedEvidenceIds = new Set();
        this.dismissedExperienceTexts = new Set();
        this.candidateHandoff = root.DailyReflectionCandidateHandoffView.createState();
        this.savedEvidence = null;
        this.focusEvidenceId = "";
        this.selectedVenueCandidates = new Set();
        this.selectedPlaceCandidates = new Set();
        this.revisionRequest = "";
        this.phase = "input";
        this.busy = false;
        this.finishPromise = null;
        this.classificationCleanup = null;
        this.closed = false;
        this.stateError = "";
        this.openerEl = opts.openerEl || activeElement(browserWindow);
      }
      stateSnapshot() {
        return Object.freeze({
          phase: this.phase,
          busy: this.busy,
          selectedIds: Object.freeze(Array.from(this.selectedIds)),
          error: this.stateError
        });
      }
      emitState(error) {
        if (error !== undefined) this.stateError = String(error || "");
        const snapshot = this.stateSnapshot();
        if (typeof opts.onStateChange === "function") {
          try { opts.onStateChange(snapshot); } catch (_e) { /* observer only */ }
        }
        return snapshot;
      }
      setClassificationCleanup(cleanup) {
        if (this.classificationCleanup && this.classificationCleanup !== cleanup) this.classificationCleanup();
        this.classificationCleanup = typeof cleanup === "function" ? cleanup : null;
      }
      cancelClassification() {
        const cleanup = this.classificationCleanup;
        this.classificationCleanup = null;
        if (cleanup) cleanup();
      }
      onOpen() { this.render(); this.emitState(); }
      onClose() {
        this.closed = true;
        this.cancelClassification();
        this.busy = false;
        this.phase = "closed";
        this.emitState();
        this.contentEl.empty();
        restoreFocus(this.openerEl);
        if (typeof opts.onClose === "function") {
          try { opts.onClose({ modal: this, savedEvidence: this.savedEvidence }); } catch (_e) { /* observer only */ }
        }
      }
      resetProposalSelection() { root.DailyReflectionModalState.reset(this); this.emitState(""); }
      async commitReflection() {
        const text = String(this.freeText || "").trim();
        if (!text) throw new Error("저장할 일기를 입력해 주세요.");
        if (text === this.committedReflectionText) return { unchanged: true };
        const commit = typeof opts.onReflectionCommit === "function"
          ? opts.onReflectionCommit
          : root.JournalStore && typeof root.JournalStore.saveReflection === "function"
            ? ({ freeText }) => root.JournalStore.saveReflection(app, dateStr, freeText)
            : null;
        if (!commit) throw new Error("일기 저장 기능을 불러오지 못했습니다.");
        const result = await commit({ app, dateStr, freeText: text });
        if (result === false) throw new Error("일기를 저장하지 못했습니다.");
        this.committedReflectionText = text;
        return result;
      }
      refreshApprovalFooter() {
        const count = this.selectedIds.size;
        const peopleCount = (this.proposal && this.proposal.evidence_blocks || []).filter((block) => this.selectedIds.has(block.evidence_id) && String(block.context || "").trim().toLowerCase() === "people").length;
        const label = `${count}개 Evidence 승인·반영`;
        const summary = peopleCount > 0
          ? `선택 ${count}개 · 사람 ${peopleCount}개 · 승인 시 해당 사람의 핵심 상호작용에 자동 반영`
          : `선택 ${count}개`;
        if (this.approvalCountEl) this.approvalCountEl.setText(summary);
        if (this.confirmButton) {
          if (typeof this.confirmButton.setText === "function") this.confirmButton.setText(label);
          else this.confirmButton.textContent = label;
          this.confirmButton.disabled = this.busy || count === 0;
          this.confirmButton.setAttribute("aria-disabled", String(this.confirmButton.disabled));
          this.confirmButton.setAttribute("aria-label", label);
        }
      }
      async finishSavedEvidence() {
        if (!this.savedEvidence) return;
        if (this.finishPromise) return this.finishPromise;
        const saveResult = this.savedEvidence.saveResult;
        this.finishPromise = (async () => {
          const dailyPath = await root.DailyReflectionPostSave.resolveSavedDailyPath(app, dateStr, saveResult);
          if (!dailyPath) {
            if (this.selectedVenueCandidates.size || this.selectedPlaceCandidates.size) {
              showNotice("Evidence는 저장되었습니다. 저장된 Daily를 확인할 수 없어 후보 생성은 진행하지 않았습니다.");
            }
            this.close();
            return;
          }
          const handoff = await root.DailyReflectionPostSave.runHandoffs(this, app, dailyPath, showNotice, {
            missingPeopleHuman: this.missingPeopleReviewIntent,
            reviewContainer: this.contentEl,
            onMissingPeopleCommitted: () => this.close(),
            onMissingPeopleTerminal: () => this.close()
          });
          if (!handoff || !handoff.pendingPeopleReview) this.close();
        })();
        return this.finishPromise;
      }
      async confirmEvidence() {
        const ai = root.DailyReflectionAI;
        if (!this.missingPeopleReviewIntent && root.CaptureActionRuntime) {
          try { this.missingPeopleReviewIntent = root.CaptureActionRuntime.humanConfirmation("people-create", `daily-missing-people-${dateStr}`); }
          catch (_error) { this.missingPeopleReviewIntent = null; }
        }
        const valid = ai.selectEvidenceBlocks(this.proposal, Array.from(this.selectedIds), Array.from(this.selectedObjectPaths)).filter((block) => String(block.experience || "").trim());
        if (!valid.length) return showNotice("반영할 증거를 선택해 주세요.");
        this.confirmButton.disabled = true;
        try {
          const saveResult = await onConfirm(valid);
          if (saveResult === false) { this.confirmButton.disabled = false; return showNotice("Evidence 저장에 실패했습니다."); }
          this.savedEvidence = { saveResult, selectedEvidenceIds: valid.map((block) => block.evidence_id) };
          if (typeof opts.onEvidenceSaved === "function") { this.phase = "handoff"; this.render(); this.emitState(""); return; }
          await this.finishSavedEvidence();
        } catch (error) { this.confirmButton.disabled = false; showNotice(error.message || String(error)); }
      }
      renderHandoff() {
        root.DailyReflectionCandidateHandoffView.renderHandoff({
          contentEl: this.contentEl, proposal: this.proposal, state: this.candidateHandoff, savedEvidence: this.savedEvidence, styleText: root.DailyReflectionModalStyles,
          onNotice: showNotice,
          openerEl: this.openerEl,
          onCancel: () => this.close(),
          onImprove: (evidenceId) => { this.focusEvidenceId = evidenceId; this.phase = "confirm"; this.render(); this.emitState(""); },
          onFinish: async () => this.finishSavedEvidence(),
          onReview: async () => {
            if (typeof opts.onKnowledgeReview !== "function") return null;
            await this.finishSavedEvidence();
            await Promise.resolve();
            return opts.onKnowledgeReview(app);
          },
          onSave: async ({ selectedKnowledgeCandidateIndexes, thinOverrides }) => {
            // Keep the handoff mounted until the human explicitly chooses Review or Done.
            return opts.onEvidenceSaved({
              proposal: this.proposal,
              selectedKnowledgeCandidateIndexes,
              selectedEvidenceIds: this.savedEvidence.selectedEvidenceIds,
              selectedObjectPaths: Array.from(this.selectedObjectPaths),
              thinOverrides,
              saveResult: this.savedEvidence.saveResult
            });
          }
        });
      }
      render() {
        if (this.closed) return null;
        this.cancelClassification();
        if (this.phase === "handoff") return this.renderHandoff();
        this.contentEl.empty();
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        this.contentEl.addClass("prodigy-reflection-modal");
        this.contentEl.addClass("prodigy-full-bleed");
        this.contentEl.createEl("style").textContent = root.DailyReflectionModalStyles;
        if (this.phase === "input") return root.DailyReflectionProposalInputView.render({ modal: this, app, dateStr, existingBlocks: Array.isArray(opts.existingBlocks) ? opts.existingBlocks : [], onNotice: showNotice });
        root.DailyReflectionEvidenceReviewView.render({ modal: this, app, dateStr, existingBlocks: Array.isArray(opts.existingBlocks) ? opts.existingBlocks : [], openPath, onNotice: showNotice, onConfirm: () => this.confirmEvidence() });
      }
    }
    const modal = new ProposeModal(app);
    modal.open();
    return modal;
  }
  const api = { openProposeEvidenceModal, safeDailyPath: (value) => root.DailyReflectionPostSave.safeDailyPath(value), isSavedDailyFile: (app, value) => root.DailyReflectionPostSave.isSavedDailyFile(app, value), isVenueHandoffEligible: (ai, candidate, proposal) => root.DailyReflectionPostSave.isVenueHandoffEligible(ai, candidate, proposal) };
  root.DailyReflectionModal = api;
  root.openDailyReflectionProposalModal = openProposeEvidenceModal;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
