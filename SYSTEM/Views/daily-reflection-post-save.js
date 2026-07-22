(function (root) {
  "use strict";
  function safeDailyPath(value) { const path = String(value == null ? "" : value).trim().replace(/\\/g, "/"); return /^DAILY\/DAILY\/[^/]+\.md$/i.test(path) ? path : ""; }
  function isSavedDailyFile(app, value) { const path = safeDailyPath(value); const file = path && app && app.vault && app.vault.getAbstractFileByPath && app.vault.getAbstractFileByPath(path); return Boolean(file && safeDailyPath(file.path) === path && String(file.extension || "").toLowerCase() === "md"); }
  function isVenueHandoffEligible(ai, candidate, proposal) { return Boolean(ai && typeof ai.isVenueEligibleCandidate === "function" && ai.isVenueEligibleCandidate(candidate, proposal && proposal.evidence_blocks)); }
  async function resolveSavedDailyPath(app, dateStr, saveResult) {
    const path = safeDailyPath(saveResult && saveResult.path);
    if (path && isSavedDailyFile(app, path)) return path;
    if (!root.JournalStore || typeof root.JournalStore.loadReview !== "function") return "";
    try { const saved = await root.JournalStore.loadReview(app, dateStr); const loaded = safeDailyPath(saved && saved.path); return loaded && saved && saved.exists !== false && isSavedDailyFile(app, loaded) ? loaded : ""; } catch (_error) { return ""; }
  }
  async function runHandoffs(modal, app, dailyPath, onNotice) {
    if (!isSavedDailyFile(app, dailyPath)) return onNotice("Evidence는 저장되었습니다. 저장된 Daily를 확인할 수 없어 후보 생성은 진행하지 않았습니다.");
    for (const candidate of Array.from(modal.selectedVenueCandidates)) {
      if (!isVenueHandoffEligible(root.DailyReflectionAI, candidate, modal.proposal)) { modal.selectedVenueCandidates.delete(candidate); onNotice("Evidence는 저장되었습니다. 현재 편집 내용에서 Venue 조건이 충족되지 않아 Venue 생성은 진행하지 않았습니다."); continue; }
      try { const result = await root.VenueCreator.open(app, { title: candidate.name, dailyPath }); if (!result || result.ok !== true) onNotice("Evidence는 저장되었습니다. Venue 생성은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); } catch (_error) { onNotice("Evidence는 저장되었습니다. Venue 생성은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); }
    }
    for (const candidate of Array.from(modal.selectedPlaceCandidates)) {
      try { const result = await root.PlaceCandidateStore.openConfirmation(app, { name: candidate.name, daily_path: dailyPath }); if (!result || result.ok !== true) onNotice("Evidence는 저장되었습니다. 장소 후보 보관은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); } catch (_error) { onNotice("Evidence는 저장되었습니다. 장소 후보 보관은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); }
    }
  }
  root.DailyReflectionPostSave = Object.freeze({ safeDailyPath, isSavedDailyFile, isVenueHandoffEligible, resolveSavedDailyPath, runHandoffs });
})(typeof globalThis !== "undefined" ? globalThis : this);
