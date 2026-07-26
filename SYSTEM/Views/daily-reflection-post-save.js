(function (root) {
  "use strict";
  function safeDailyPath(value) { const path = String(value == null ? "" : value).trim().replace(/\\/g, "/"); return /^DAILY\/DAILY\/[^/]+\.md$/i.test(path) ? path : ""; }
  function isSavedDailyFile(app, value) { const path = safeDailyPath(value); const file = path && app && app.vault && app.vault.getAbstractFileByPath && app.vault.getAbstractFileByPath(path); return Boolean(file && safeDailyPath(file.path) === path && String(file.extension || "").toLowerCase() === "md"); }
  function isVenueHandoffEligible(ai, candidate, proposal) { return Boolean(ai && typeof ai.isVenueEligibleCandidate === "function" && ai.isVenueEligibleCandidate(candidate, proposal && proposal.evidence_blocks)); }
  function isPeopleHandoffEligible(proposal) { if (!proposal) return false; const blocks = proposal.evidence_blocks || []; return blocks.some(function (b) { return String(b.context || "").trim().toLowerCase() === "people"; }); }
  async function resolveSavedDailyPath(app, dateStr, saveResult) {
    const path = safeDailyPath(saveResult && saveResult.path);
    if (path && isSavedDailyFile(app, path)) return path;
    if (!root.JournalStore || typeof root.JournalStore.loadReview !== "function") return "";
    try { const saved = await root.JournalStore.loadReview(app, dateStr); const loaded = safeDailyPath(saved && saved.path); return loaded && saved && saved.exists !== false && isSavedDailyFile(app, loaded) ? loaded : ""; } catch (_error) { return ""; }
  }
  async function runHandoffs(modal, app, dailyPath, onNotice, extraOptions) {
    if (!isSavedDailyFile(app, dailyPath)) return onNotice("Evidence는 저장되었습니다. 저장된 Daily를 확인할 수 없어 후보 생성은 진행하지 않았습니다.");
    for (const candidate of Array.from(modal.selectedVenueCandidates)) {
      if (!isVenueHandoffEligible(root.DailyReflectionAI, candidate, modal.proposal)) { modal.selectedVenueCandidates.delete(candidate); onNotice("Evidence는 저장되었습니다. 현재 편집 내용에서 Venue 조건이 충족되지 않아 Venue 생성은 진행하지 않았습니다."); continue; }
      try { const result = await root.VenueCreator.open(app, { title: candidate.name, dailyPath }); if (!result || result.ok !== true) onNotice("Evidence는 저장되었습니다. Venue 생성은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); } catch (_error) { onNotice("Evidence는 저장되었습니다. Venue 생성은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); }
    }
    for (const candidate of Array.from(modal.selectedPlaceCandidates)) {
      try { const result = await root.PlaceCandidateStore.openConfirmation(app, { name: candidate.name, daily_path: dailyPath }); if (!result || result.ok !== true) onNotice("Evidence는 저장되었습니다. 장소 후보 보관은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); } catch (_error) { onNotice("Evidence는 저장되었습니다. 장소 후보 보관은 완료하지 못했습니다. Daily에서 다시 시도해 주세요."); }
    }
    // Phase 4 — people interaction writer (automatic, no separate confirmation)
    if (isPeopleHandoffEligible(modal.proposal)) {
      try {
        const core = root.PeopleCore;
        const store = root.PeopleStore;
        if (core && store && app && app.vault) {
          const blocks = (modal.proposal.evidence_blocks || []).filter(function (b) { return String(b.context || "").trim().toLowerCase() === "people"; });
          const selectedIds = new Set(modal.savedEvidence ? modal.savedEvidence.selectedEvidenceIds : []);
          const approvedPeopleBlocks = blocks.filter(function (b) { return selectedIds.has(b.evidence_id); });
          const peopleLinks = (modal.proposal.object_linking_suggestions || []).filter(function (s) { const k = String(s.object_kind || "").trim().toLowerCase(); return k === "people" || k === "person"; }).map(function (s) { var name = s.object_name || s.name || ""; var rp = s.resolved_path || s.person_path || ""; if (!rp && name && core.peoplePath) { try { rp = core.peoplePath(name); } catch (_e) { rp = ""; } } return { name: name, resolved_path: rp }; }).filter(function (l) { return l.resolved_path && l.name; });
          var writtenCount = 0;
          for (var pi = 0; pi < peopleLinks.length; pi++) {
            var link = peopleLinks[pi];
            var personPath = link.resolved_path;
            var personName = link.name || personPath.split("/").pop().replace(/\.md$/i, "");
            var insights = [];
            for (var bi = 0; bi < approvedPeopleBlocks.length; bi++) {
              var blk = approvedPeopleBlocks[bi];
              var insight = blk.interpretation || blk.title || blk.experience || "";
              if (insight.trim()) insights.push(insight.trim());
            }
            if (!insights.length) continue;
            var personFile = app.vault.getAbstractFileByPath(personPath);
            var content = "";
            var created = false;
            if (personFile) {
              content = await app.vault.read(personFile);
            } else {
              try { await store.createPeople(app, personName); personFile = app.vault.getAbstractFileByPath(personPath); content = personFile ? await app.vault.read(personFile) : ""; created = true; } catch (_ce) { continue; }
            }
            if (!personFile) continue;
            for (var ii = 0; ii < insights.length; ii++) {
              var line = core.formatPeopleInsightLine({ insight: insights[ii] });
              content = core.appendPeopleInteractionToContent(content, line);
            }
            await app.vault.modify(personFile, content);
            writtenCount++;
          }
          if (writtenCount > 0) onNotice("사람 통찰 " + writtenCount + "건을 기록했습니다.");
        }
      } catch (_error) { onNotice("Evidence는 저장되었습니다. 사람 통찰 기록은 완료하지 못했습니다."); }
    }
  }
  root.DailyReflectionPostSave = Object.freeze({ safeDailyPath, isSavedDailyFile, isVenueHandoffEligible, resolveSavedDailyPath, runHandoffs, isPeopleHandoffEligible });
})(typeof globalThis !== "undefined" ? globalThis : this);
