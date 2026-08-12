(function (root) {
  "use strict";
  function button(parent, text, primary) {
    return root.ProdigyUI ? root.ProdigyUI.button(parent, text, primary ? { primary: true } : undefined) : parent.createEl("button", { text, attr: { type: "button", class: `prodigy-btn${primary ? " prodigy-btn-primary" : ""}` } });
  }
  function renderEvidenceCards(body, modal, dateStr, onNotice) {
    modal.proposal.evidence_blocks.forEach((block, index) => {
      const card = body.createEl("article", { attr: { class: "reflection-evidence-card prodigy-utility-card" } });
      const head = card.createEl("div", { attr: { class: "reflection-evidence-head" } });
      const check = head.createEl("input", { attr: { type: "checkbox", "aria-label": `${block.title} 선택` } });
      check.checked = modal.selectedIds.has(block.evidence_id);
      check.onchange = () => { check.checked ? modal.selectedIds.add(block.evidence_id) : modal.selectedIds.delete(block.evidence_id); modal.refreshApprovalFooter(); if (typeof modal.emitState === "function") modal.emitState(""); };
      head.createEl("strong", { text: `${index + 1}. ${block.evidence_id}` });
      const tools = head.createEl("div", { attr: { class: "reflection-evidence-tools" } });
      const split = button(tools, "수동 분할");
      split.onclick = () => { if (root.DailyReflectionModalState.split(modal, index, dateStr)) { modal.render(); onNotice("새 블록으로 분리할 내용을 옮겨 주세요."); } };
     if (index < modal.proposal.evidence_blocks.length - 1) { const merge = button(tools, "아래와 병합"); merge.onclick = () => { if (root.DailyReflectionModalState.merge(modal, index)) modal.render(); }; }
      const dismiss = button(tools, "삭제");
      dismiss.onclick = () => { if (root.DailyReflectionModalState.dismiss(modal, block.evidence_id)) { modal.refreshApprovalFooter(); modal.render(); onNotice("증거를 삭제했습니다."); } };
      const title = card.createEl("input", { attr: { type: "text", "aria-label": "증거 제목" } });
      title.value = block.title || ""; title.placeholder = "증거 제목"; title.oninput = () => { block.title = title.value; };
      const contextWrap = card.createEl("div", { attr: { class: "reflection-field" } });
      contextWrap.createEl("label", { text: "맥락" });
      const context = contextWrap.createEl("input", { attr: { type: "text" } });
      context.value = block.context || ""; context.oninput = () => { block.context = context.value.trim().toLowerCase(); };
      const fields = { context };
      [["경험", "experience", 3], ["해석", "interpretation", 2], ["변화", "change", 2], ["다음 실험", "next_experiment", 2]].forEach(([label, key, rows]) => {
        const wrap = card.createEl("div", { attr: { class: "reflection-field" } });
        wrap.createEl("label", { text: label });
        const field = wrap.createEl("textarea", { attr: { rows: String(rows) } });
        field.value = block[key] || ""; field.oninput = () => { block[key] = field.value; }; fields[key] = field;
      });
      root.DailyReflectionCandidateHandoffView.renderEvidenceQuality(card, block, fields);
      if (modal.focusEvidenceId === block.evidence_id) { modal.focusEvidenceId = ""; (fields.experience || fields.context).focus(); }
    });
  }
  function renderRevision(body, modal, app, dateStr, existingBlocks, onNotice) {
    const revision = body.createEl("div", { attr: { class: "reflection-revision" } });
    revision.createEl("h3", { text: "AI 수정 요청" });
    revision.createEl("div", { text: "현재 제안을 기준으로 고칠 점을 말해 주세요. 예: e01의 해석 삭제, e04와 e05 병합.", attr: { class: "reflection-preview-note" } });
    const input = revision.createEl("textarea", { attr: { rows: "3", "aria-label": "AI 수정 요청 내용" } });
    input.placeholder = "무엇을 어떻게 수정할까요?"; input.value = modal.revisionRequest; input.oninput = () => { modal.revisionRequest = input.value; };
    const revise = button(revision, "제안 다시 만들기", true); revise.style.marginTop = "8px";
    revise.onclick = async () => {
      if (!String(modal.revisionRequest || "").trim()) return onNotice("수정 요청을 입력해 주세요.");
      revise.disabled = true; revise.textContent = "수정 중…";
      try {
        modal.proposal = await root.DailyReflectionAI.generateProposal({ app, dateStr, freeText: modal.freeText, existingBlocks, revisionRequest: modal.revisionRequest, previousProposal: modal.proposal });
        if (modal.dismissedEvidenceIds && modal.dismissedEvidenceIds.size) {
          modal.proposal.evidence_blocks = (modal.proposal.evidence_blocks || []).filter(function (block) { return !modal.dismissedEvidenceIds.has(block.evidence_id); });
        }
        if (modal.dismissedExperienceTexts && modal.dismissedExperienceTexts.size) {
          modal.proposal.evidence_blocks = (modal.proposal.evidence_blocks || []).filter(function (block) { return !modal.dismissedExperienceTexts.has(String(block.experience || "").trim()); });
        }
        modal.revisionRequest = ""; modal.resetProposalSelection(); modal.render();
      }
      catch (error) { revise.disabled = false; revise.textContent = "제안 다시 만들기"; onNotice(error.message || String(error)); }
    };
  }
  function renderFooter(shell, modal, onConfirm) {
    const actions = shell.createEl("div", { attr: { class: "reflection-review-footer" } });
    modal.approvalCountEl = actions.createEl("span", { attr: { class: "reflection-approval-count", "aria-live": "polite" } });
    const all = button(actions, "전체 선택"); all.onclick = () => { modal.selectedIds = new Set(modal.proposal.evidence_blocks.map((block) => block.evidence_id)); modal.render(); if (typeof modal.emitState === "function") modal.emitState(""); };
    const clear = button(actions, "선택 해제"); clear.onclick = () => { modal.selectedIds.clear(); modal.render(); if (typeof modal.emitState === "function") modal.emitState(""); };
    const back = button(actions, "다시 입력"); back.onclick = () => { modal.resetProposalSelection(); modal.phase = "input"; modal.render(); if (typeof modal.emitState === "function") modal.emitState(""); };
    const cancel = button(actions, "취소"); cancel.onclick = () => modal.close();
    modal.confirmButton = button(actions, "0개 Evidence 승인·반영", true); modal.refreshApprovalFooter();
    modal.confirmButton.onclick = onConfirm;
  }
  function render(options) {
    const { modal, app, dateStr, existingBlocks, openPath, onNotice, onConfirm } = options;
    const shell = modal.contentEl.createEl("div", { attr: { class: "reflection-review-shell" } });
    const body = shell.createEl("div", { attr: { class: "reflection-review-body" } });
    body.createEl("h3", { text: "AI 제안 검토" });
    body.createEl("p", { text: `모든 증거 필드는 직접 수정할 수 있습니다. 체크한 증거와 선택한 기존 문서 연결만 저장됩니다. 후보는 제안 상태입니다. · ${modal.proposal.provider} / ${modal.proposal.model}`, attr: { class: "reflection-review-intro", style: "color:var(--text-muted);margin:0 0 12px;" } });
    renderEvidenceCards(body, modal, dateStr, onNotice);
    root.DailyReflectionProposalCandidatesView.render(body, modal, app, openPath);
    renderRevision(body, modal, app, dateStr, existingBlocks, onNotice);
    renderFooter(shell, modal, onConfirm);
  }
  root.DailyReflectionEvidenceReviewView = Object.freeze({ render });
})(typeof globalThis !== "undefined" ? globalThis : this);
