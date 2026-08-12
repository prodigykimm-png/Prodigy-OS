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
    if (!isSavedDailyFile(app, dailyPath)) { onNotice("Evidence는 저장되었습니다. 저장된 Daily를 확인할 수 없어 후보 생성은 진행하지 않았습니다."); return { pendingPeopleReview: false }; }
    var pendingPeopleReview = false;
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
          const peopleLinks = (modal.proposal.object_linking_suggestions || []).filter(function (s) { const k = String(s.object_kind || "").trim().toLowerCase(); return k === "people" || k === "person"; }).map(function (s) { var name = s.object_name || s.name || ""; var rp = s.resolved_path || s.person_path || ""; if (!rp && name && core.peoplePath) { try { rp = core.peoplePath(name); } catch (_e) { rp = ""; } } return { name: name, resolved_path: rp, source_evidence_ids: Array.isArray(s.source_evidence_ids) ? s.source_evidence_ids : [] }; }).filter(function (l) { return l.resolved_path && l.name; });
          var writtenCount = 0;
          for (var pi = 0; pi < peopleLinks.length; pi++) {
            var link = peopleLinks[pi];
            var personPath = link.resolved_path;
            var personName = link.name || personPath.split("/").pop().replace(/\.md$/i, "");
            var insights = [];
            var linkedEvidenceIds = new Set(link.source_evidence_ids);
            for (var bi = 0; bi < approvedPeopleBlocks.length; bi++) {
              var blk = approvedPeopleBlocks[bi];
              if (linkedEvidenceIds.size && !linkedEvidenceIds.has(blk.evidence_id)) continue;
              var insight = blk.interpretation || blk.title || blk.experience || "";
              if (insight.trim()) insights.push(insight.trim());
            }
            if (!insights.length) continue;
            var personFile = app.vault.getAbstractFileByPath(personPath);
            var content = "";
            if (personFile) {
              content = await app.vault.read(personFile);
            } else {
              // Missing People never inherit Daily approval as write authority. When the
              // Daily Confirm event was captured by the live mount, it may create and render
              // the exact People review; only a later Confirm control can write it.
              try {
                var captureRuntime = root.CaptureActionRuntime;
                if (!captureRuntime) throw new Error("Capture proposal runtime unavailable");
                let missingProposal;
                let reviewResult = null;
                if (extraOptions && extraOptions.missingPeopleHuman && extraOptions.reviewContainer
                  && store && typeof store.createPeopleWithCapture === "function") {
                  reviewResult = await store.createPeopleWithCapture(app, personName, extraOptions.missingPeopleHuman);
                  missingProposal = reviewResult && reviewResult.capture && reviewResult.capture.record;
                  if (!missingProposal || missingProposal.state !== "human_review") throw new Error("Missing People review was not rendered.");
                  pendingPeopleReview = true;
                  captureRuntime.renderReview(extraOptions.reviewContainer, missingProposal, {
                    confirm: async function () {
                      try {
                        await store.createPeopleWithCapture(app, personName, captureRuntime.humanConfirmation("people-create", missingProposal.approval_evidence.review.session_id), missingProposal);
                        if (typeof extraOptions.onMissingPeopleCommitted === "function") extraOptions.onMissingPeopleCommitted(missingProposal);
                      } catch (error) { onNotice(error.message || String(error)); }
                    },
                    reject: function () {
                      captureRuntime.decideHumanReview(missingProposal, captureRuntime.humanConfirmation("people-create", missingProposal.approval_evidence.review.session_id), "people-create", "reject");
                      if (typeof extraOptions.onMissingPeopleTerminal === "function") extraOptions.onMissingPeopleTerminal("rejected", missingProposal);
                    },
                    cancel: function () {
                      captureRuntime.decideHumanReview(missingProposal, captureRuntime.humanConfirmation("people-create", missingProposal.approval_evidence.review.session_id), "people-create", "cancel");
                      if (typeof extraOptions.onMissingPeopleTerminal === "function") extraOptions.onMissingPeopleTerminal("cancelled", missingProposal);
                    }
                  });
                } else {
                  missingProposal = await captureRuntime.prepareProposal({
                    action_id: "daily-reflection-missing-people", operation: "create", target_path: personPath,
                    payload: { name: personName, source_daily: dailyPath }, source_id: "daily-reflection-approved-evidence",
                    locator: dailyPath + "#people-handoff", readRevision: async function () { return app.vault.getAbstractFileByPath(personPath) ? "conflict" : null; }
                  });
                }
                if (!Array.isArray(modal.pendingPeopleCaptureProposals)) modal.pendingPeopleCaptureProposals = [];
                modal.pendingPeopleCaptureProposals.push({ proposal: missingProposal, name: personName, path: personPath });
                if (extraOptions && typeof extraOptions.onMissingPeopleProposal === "function") extraOptions.onMissingPeopleProposal(missingProposal, { name: personName, path: personPath });
                onNotice(pendingPeopleReview ? "새 사람 제안을 검토한 뒤 별도의 확인 버튼을 눌러 주세요." : "새 사람은 자동 생성하지 않았습니다. 별도 검토 화면에서 명시적으로 확인해 주세요.");
              } catch (_ce) { /* fail closed: no People write */ }
              continue;
            }
            if (!personFile) continue;
            var originalContent = content;
            for (var ii = 0; ii < insights.length; ii++) {
              var line = core.formatPeopleInsightLine({ insight: insights[ii] });
              content = core.appendPeopleInteractionToContent(content, line);
            }
            if (content === originalContent) continue;
            await app.vault.modify(personFile, content);
            writtenCount++;
          }
          if (writtenCount > 0) onNotice("사람 통찰 " + writtenCount + "건을 기록했습니다.");
        }
      } catch (_error) { onNotice("Evidence는 저장되었습니다. 사람 통찰 기록은 완료하지 못했습니다."); }
    }
    return { pendingPeopleReview: pendingPeopleReview };
  }
  root.DailyReflectionPostSave = Object.freeze({ safeDailyPath, isSavedDailyFile, isVenueHandoffEligible, resolveSavedDailyPath, runHandoffs, isPeopleHandoffEligible });
})(typeof globalThis !== "undefined" ? globalThis : this);
