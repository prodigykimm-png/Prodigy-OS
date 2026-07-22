(function (root) {
  "use strict";

  if (typeof require === "function") {
    if (!root.JournalReviewModal) root.JournalReviewModal = require("./journal-review-modal.js");
    if (!root.JournalEvidenceBlockModal) root.JournalEvidenceBlockModal = require("./journal-evidence-block-modal.js");
    if (!root.JournalCompletionAction) root.JournalCompletionAction = require("./journal-completion-action.js");
    if (!root.JournalDashboardView) root.JournalDashboardView = require("./journal-dashboard-view.js");
  }

  function openProposeEvidenceModal(...args) {
    const openModal = root.openDailyReflectionProposalModal;
    if (typeof openModal !== "function") {
      const message = "AI 성찰 제안 화면을 불러오지 못했습니다. Obsidian을 다시 열어 주세요.";
      const NoticeClass = root.Notice || (typeof window !== "undefined" && window.Notice);
      if (typeof NoticeClass === "function") new NoticeClass(message);
      return;
    }
    return openModal(...args);
  }
  function openPath(...args) { return root.JournalDashboardView.openPath(...args); }
  function openReviewModal(...args) { return root.JournalReviewModal.open(...args); }
  function openEvidenceBlockModal(...args) { return root.JournalEvidenceBlockModal.open(...args); }
  function saveProposedEvidenceAtCommit(...args) { return root.JournalCompletionAction.saveProposedEvidenceAtCommit(...args); }
  function saveSelectedKnowledgeCandidatesAfterEvidence(...args) { return root.JournalCompletionAction.saveSelectedKnowledgeCandidatesAfterEvidence(...args); }
  function renderDashboard(app, container) { return root.JournalDashboardView.renderDashboard(app, container, openProposeEvidenceModal); }

  const api = { openReviewModal, openEvidenceBlockModal, openProposeEvidenceModal, saveProposedEvidenceAtCommit, saveSelectedKnowledgeCandidatesAfterEvidence, renderDashboard, openPath };
  root.JournalView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
