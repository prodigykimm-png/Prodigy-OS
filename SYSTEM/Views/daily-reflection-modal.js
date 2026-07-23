(function (root) {
  "use strict";
  function showNotice(message) { const NoticeClass = root.Notice || (typeof window !== "undefined" && window.Notice); if (typeof NoticeClass === "function") new NoticeClass(message); }
  function showUnavailable(browserWindow) { const message = "AI 성찰 제안 화면을 불러오지 못했습니다. Obsidian을 다시 열어 주세요."; const NoticeClass = root.Notice || browserWindow.Notice; if (typeof NoticeClass === "function") new NoticeClass(message); else if (typeof browserWindow.alert === "function") browserWindow.alert(message); }
  function openPath(app, path) { if (root.JournalView && typeof root.JournalView.openPath === "function") root.JournalView.openPath(app, path); }
  function ready() { return root.DailyReflectionModalStyles && root.DailyReflectionModalState && root.DailyReflectionProposalInputView && root.DailyReflectionProposalCandidatesView && root.DailyReflectionEvidenceReviewView && root.DailyReflectionCandidateHandoffView && root.DailyReflectionPostSave; }
  function openProposeEvidenceModal(app, dateStr, onConfirm, options) {
    const opts = options || {};
    const browserWindow = typeof window !== "undefined" ? window : root;
    const obsidianModule = root.obsidian || browserWindow.obsidian;
    if (!obsidianModule || !obsidianModule.Modal || !ready()) return showUnavailable(browserWindow);
    class ProposeModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.freeText = ""; this.proposal = null; this.selectedIds = new Set(); this.selectedObjectPaths = new Set();
        this.candidateHandoff = root.DailyReflectionCandidateHandoffView.createState(); this.savedEvidence = null; this.focusEvidenceId = "";
        this.selectedVenueCandidates = new Set(); this.selectedPlaceCandidates = new Set(); this.revisionRequest = ""; this.phase = "input"; this.busy = false;
      }
      onOpen() { this.render(); }
      onClose() { this.contentEl.empty(); }
      resetProposalSelection() { root.DailyReflectionModalState.reset(this); }
      refreshApprovalFooter() {
        const count = this.selectedIds.size;
        const label = `${count}개 Evidence 승인·반영`;
        if (this.approvalCountEl) this.approvalCountEl.setText(label);
        if (this.confirmButton) {
          if (typeof this.confirmButton.setText === "function") this.confirmButton.setText(label);
          else this.confirmButton.textContent = label;
          this.confirmButton.disabled = this.busy || count === 0;
          this.confirmButton.setAttribute("aria-disabled", String(this.confirmButton.disabled));
          this.confirmButton.setAttribute("aria-label", label);
        }
      }
      async finishSavedEvidence() {
        const saveResult = this.savedEvidence.saveResult;
        this.close();
        const dailyPath = await root.DailyReflectionPostSave.resolveSavedDailyPath(app, dateStr, saveResult);
        if (!dailyPath) { if (this.selectedVenueCandidates.size || this.selectedPlaceCandidates.size) showNotice("Evidence는 저장되었습니다. 저장된 Daily를 확인할 수 없어 후보 생성은 진행하지 않았습니다."); return; }
        await root.DailyReflectionPostSave.runHandoffs(this, app, dailyPath, showNotice);
      }
      async confirmEvidence() {
        const ai = root.DailyReflectionAI;
        const valid = ai.selectEvidenceBlocks(this.proposal, Array.from(this.selectedIds), Array.from(this.selectedObjectPaths)).filter((block) => String(block.experience || "").trim());
        if (!valid.length) return showNotice("반영할 증거를 선택해 주세요.");
        this.confirmButton.disabled = true;
        try {
          const saveResult = await onConfirm(valid);
          if (saveResult === false) { this.confirmButton.disabled = false; return showNotice("Evidence 저장에 실패했습니다."); }
          this.savedEvidence = { saveResult, selectedEvidenceIds: valid.map((block) => block.evidence_id) };
          if (typeof opts.onEvidenceSaved === "function") { this.phase = "handoff"; this.render(); return; }
          await this.finishSavedEvidence();
        } catch (error) { this.confirmButton.disabled = false; showNotice(error.message || String(error)); }
      }
      renderHandoff() {
        root.DailyReflectionCandidateHandoffView.renderHandoff({
          contentEl: this.contentEl, proposal: this.proposal, state: this.candidateHandoff, savedEvidence: this.savedEvidence, styleText: root.DailyReflectionModalStyles,
          onNotice: showNotice, onCancel: () => this.close(), onImprove: (evidenceId) => { this.focusEvidenceId = evidenceId; this.phase = "confirm"; this.render(); }, onFinish: async () => this.finishSavedEvidence(),
          onSave: async ({ selectedKnowledgeCandidateIndexes, thinOverrides }) => {
            const result = await opts.onEvidenceSaved({ proposal: this.proposal, selectedKnowledgeCandidateIndexes, selectedEvidenceIds: this.savedEvidence.selectedEvidenceIds, selectedObjectPaths: Array.from(this.selectedObjectPaths), thinOverrides, saveResult: this.savedEvidence.saveResult });
            if (!result || !result.blocked || !result.blocked.length) await this.finishSavedEvidence();
            return result;
          }
        });
      }
      render() {
        if (this.phase === "handoff") return this.renderHandoff();
        this.contentEl.empty();
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        this.contentEl.addClass("prodigy-reflection-modal");
        this.contentEl.createEl("style").textContent = root.DailyReflectionModalStyles;
        if (this.phase === "input") return root.DailyReflectionProposalInputView.render({ modal: this, app, dateStr, existingBlocks: Array.isArray(opts.existingBlocks) ? opts.existingBlocks : [], onNotice: showNotice });
        root.DailyReflectionEvidenceReviewView.render({ modal: this, app, dateStr, existingBlocks: Array.isArray(opts.existingBlocks) ? opts.existingBlocks : [], openPath, onNotice: showNotice, onConfirm: () => this.confirmEvidence() });
      }
    }
    new ProposeModal(app).open();
  }
  const api = { openProposeEvidenceModal, safeDailyPath: (value) => root.DailyReflectionPostSave.safeDailyPath(value), isSavedDailyFile: (app, value) => root.DailyReflectionPostSave.isSavedDailyFile(app, value), isVenueHandoffEligible: (ai, candidate, proposal) => root.DailyReflectionPostSave.isVenueHandoffEligible(ai, candidate, proposal) };
  root.DailyReflectionModal = api;
  root.openDailyReflectionProposalModal = openProposeEvidenceModal;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
