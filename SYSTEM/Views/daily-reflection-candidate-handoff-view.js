(function (root) {
  "use strict";

  function createState() {
    return {
      selectedIndexes: new Set(),
      thinOverrideEvidenceIds: new Set(),
      thinOverrideNotes: {}
    };
  }

  function resetState(state) {
    state.selectedIndexes.clear();
    state.thinOverrideEvidenceIds.clear();
    state.thinOverrideNotes = {};
  }

  function selectedIndexes(state) {
    return Array.from(state.selectedIndexes).sort((left, right) => left - right);
  }

  function removeIndex(state, index) {
    state.selectedIndexes = new Set(
      Array.from(state.selectedIndexes)
        .filter((selectedIndex) => selectedIndex !== index)
        .map((selectedIndex) => selectedIndex > index ? selectedIndex - 1 : selectedIndex)
    );
  }

  function qualityFor(block) {
    const quality = root.EvidenceQualityCore;
    return quality && typeof quality.evaluateEvidenceQuality === "function"
      ? quality.evaluateEvidenceQuality(block)
      : null;
  }

  function sourceBlocks(proposal, state) {
    const sources = new Map();
    selectedIndexes(state).forEach((index) => {
      const candidate = proposal.knowledge_candidates[index] || {};
      (candidate.source_evidence_ids || []).forEach((evidenceId) => {
        const block = proposal.evidence_blocks.find((item) => item.evidence_id === evidenceId);
        if (block) sources.set(evidenceId, block);
      });
    });
    return sources;
  }

  function handoffIssue(proposal, state, savedEvidence) {
    const selectedEvidenceIds = new Set(savedEvidence.selectedEvidenceIds);
    for (const index of selectedIndexes(state)) {
      const candidate = proposal.knowledge_candidates[index] || {};
      const sourceIds = Array.isArray(candidate.source_evidence_ids) ? candidate.source_evidence_ids : [];
      if (!sourceIds.length || sourceIds.some((evidenceId) => !selectedEvidenceIds.has(evidenceId))) {
        return "선택한 후보의 출처 Evidence를 먼저 저장해 주세요.";
      }
      for (const evidenceId of sourceIds) {
        const block = proposal.evidence_blocks.find((item) => item.evidence_id === evidenceId);
        const quality = qualityFor(block);
        if (!quality || quality.status === "invalid") return "Evidence 보완 후 후보를 저장해 주세요.";
        if (quality.status === "thin" && (!state.thinOverrideEvidenceIds.has(evidenceId) || !String(state.thinOverrideNotes[evidenceId] || "").trim())) {
          return "Evidence 보완 후 저장하거나, 보완이 어려우면 명시적 override 사유를 입력해 주세요.";
        }
      }
    }
    return "";
  }

  function thinOverrides(state, savedEvidence) {
    const evidenceIdMap = savedEvidence.saveResult && savedEvidence.saveResult.evidenceIdMap || {};
    const overrides = {};
    state.thinOverrideEvidenceIds.forEach((evidenceId) => {
      const note = String(state.thinOverrideNotes[evidenceId] || "").trim();
      if (note) overrides[evidenceIdMap[evidenceId] || evidenceId] = note;
    });
    return overrides;
  }

  function addButton(container, text, primary) {
    return root.ProdigyUI
      ? root.ProdigyUI.button(container, text, primary ? { primary: true } : undefined)
      : container.createEl("button", { text, attr: { type: "button", class: `prodigy-btn${primary ? " prodigy-btn-primary" : ""}` } });
  }

  function renderEvidenceQuality(card, block, fields) {
    const quality = qualityFor(block);
    if (!quality) return;
    const wrap = card.createEl("div", { attr: { class: "reflection-preview-note" } });
    wrap.createEl("span", { text: `근거 품질: ${quality.label}` });
    if (quality.reasons.length) wrap.createEl("span", { text: ` · ${quality.reasons.join(" ")}` });
    if (!quality.reason_codes.length) return;
    const improve = addButton(wrap, "Evidence 보완");
    improve.onclick = () => {
      const code = quality.reason_codes[0];
      const field = code === "missing_context" ? fields.context
        : code === "missing_next_experiment" ? fields.next_experiment
        : fields.interpretation || fields.experience;
      if (field && typeof field.focus === "function") field.focus();
    };
  }

  function renderHandoff(options) {
    const { contentEl, proposal, state, savedEvidence, styleText, onNotice, onImprove, onFinish, onSave, onReview } = options;
    contentEl.empty();
    contentEl.addClass("prodigy-reflection-modal");
    contentEl.createEl("style").textContent = styleText;
    contentEl.createEl("h3", { text: "Evidence 저장 완료" });
    contentEl.createEl("p", {
      text: `${savedEvidence.selectedEvidenceIds.length}개 Evidence를 저장했습니다. 지식 후보 저장은 별도 승인입니다.`,
      attr: { class: "reflection-preview-note" }
    });
    sourceBlocks(proposal, state).forEach((block, evidenceId) => {
      const quality = qualityFor(block);
      if (!quality) return;
      const row = contentEl.createEl("div", { attr: { class: "reflection-candidate-group" } });
      row.createEl("strong", { text: `${evidenceId}: ${quality.label}` });
      if (quality.reasons.length) row.createEl("div", { text: quality.reasons.join(" "), attr: { class: "reflection-preview-note" } });
      if (quality.reason_codes.length) {
        const improve = addButton(row, "Evidence 보완");
        improve.onclick = () => onImprove(evidenceId);
      }
      if (quality.status !== "thin") return;
      const override = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${evidenceId} 보완 필요 근거를 명시적으로 승인` } });
      override.checked = state.thinOverrideEvidenceIds.has(evidenceId);
      override.onchange = () => override.checked
        ? state.thinOverrideEvidenceIds.add(evidenceId)
        : state.thinOverrideEvidenceIds.delete(evidenceId);
      row.createEl("span", { text: " 명시적 override" });
      const note = row.createEl("textarea", { attr: { rows: "2", "aria-label": `${evidenceId} 승인 사유` } });
      note.value = state.thinOverrideNotes[evidenceId] || "";
      note.oninput = () => { state.thinOverrideNotes[evidenceId] = note.value; };
    });
    const actions = contentEl.createEl("div", { attr: { class: "reflection-review-footer" } });
    const cancel = addButton(actions, "취소");
    cancel.onclick = options.onCancel;
    const done = addButton(actions, "완료");
    done.onclick = onFinish;
    const save = addButton(actions, "선택한 후보 저장", true);
    save.disabled = selectedIndexes(state).length === 0;
    const review = typeof onReview === "function" ? addButton(actions, "검증 대기 열기") : null;
    if (review) {
      review.disabled = true;
      review.onclick = () => onReview();
    }
    save.onclick = async () => {
      const issue = handoffIssue(proposal, state, savedEvidence);
      if (issue) return onNotice(issue);
      save.disabled = true;
      try {
        const result = await onSave({
          selectedKnowledgeCandidateIndexes: selectedIndexes(state),
          thinOverrides: thinOverrides(state, savedEvidence)
        });
        if (result && result.blocked && result.blocked.length) {
          save.disabled = false;
          return onNotice(result.blocked[0].message || "선택한 후보를 저장하지 못했습니다.");
        }
        if (review) review.disabled = false;
      } catch (error) {
        save.disabled = false;
        return onNotice(error.message || String(error));
      }
    };
  }

  root.DailyReflectionCandidateHandoffView = Object.freeze({
    createState,
    resetState,
    selectedIndexes,
    removeIndex,
    qualityFor,
    renderEvidenceQuality,
    renderHandoff
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
