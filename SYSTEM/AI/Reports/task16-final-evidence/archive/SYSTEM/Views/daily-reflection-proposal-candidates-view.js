(function (root) {
  "use strict";
  function removeButton(row, items, index, modal) {
    const button = row.createEl("button", { text: "삭제", attr: { type: "button", class: "prodigy-btn prodigy-btn-danger" } });
    button.onclick = () => { items.splice(index, 1); modal.render(); };
  }
  function confidenceSelect(row, item) {
    const select = row.createEl("select", { attr: { "aria-label": "신뢰도" } });
    [["explicit", "명시됨"], ["inferred", "추론"], ["low", "낮음"]].forEach(([value, text]) => select.createEl("option", { text, value }));
    select.value = item.confidence || "inferred";
    select.onchange = () => { item.confidence = select.value; };
  }
  function renderKnowledge(group, modal) {
    const items = modal.proposal.knowledge_candidates;
    if (!items.length) return;
    group.createEl("h4", { text: "지식 후보" });
    items.forEach((item, index) => {
      const row = group.createEl("div", { attr: { class: "reflection-candidate-row is-knowledge" } });
      const title = item.title || item.label || "지식 후보";
      const check = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${title} 저장 후보 선택` } });
      check.checked = modal.candidateHandoff.selectedIndexes.has(index);
      check.onchange = () => check.checked ? modal.candidateHandoff.selectedIndexes.add(index) : modal.candidateHandoff.selectedIndexes.delete(index);
      const titleInput = row.createEl("input", { attr: { type: "text", "aria-label": "지식 후보 표제" } });
      titleInput.value = item.title || item.label || "";
      titleInput.oninput = () => { if ("title" in item || "detail" in item) item.title = titleInput.value; else item.label = titleInput.value; };
      if ("title" in item || "detail" in item) {
        const detailInput = row.createEl("input", { attr: { type: "text", "aria-label": "지식 후보 세부내용" } });
        detailInput.value = item.detail || "";
        detailInput.oninput = () => { item.detail = detailInput.value; };
      }
      confidenceSelect(row, item);
      const remove = row.createEl("button", { text: "삭제", attr: { type: "button", class: "prodigy-btn prodigy-btn-danger" } });
      remove.onclick = () => { items.splice(index, 1); root.DailyReflectionCandidateHandoffView.removeIndex(modal.candidateHandoff, index); modal.render(); };
    });
  }
  function renderResources(group, modal) {
    const items = modal.proposal.resource_candidates;
    if (!items.length) return;
    group.createEl("h4", { text: "리소스 후보" });
    items.forEach((item, index) => {
      const row = group.createEl("div", { attr: { class: "reflection-candidate-row" } });
      const name = row.createEl("input", { attr: { type: "text", "aria-label": "리소스 이름" } });
      name.value = item.name || "";
      name.oninput = () => { item.name = name.value; };
      const venueEligible = Boolean(root.DailyReflectionAI && root.DailyReflectionAI.isVenueEligibleCandidate && root.DailyReflectionAI.isVenueEligibleCandidate(item, modal.proposal.evidence_blocks));
      if (venueEligible || item.suggested_type === "resource") {
        const handoff = row.createEl("label", { attr: { class: "reflection-candidate-handoff" } });
        const check = handoff.createEl("input", { attr: { type: "checkbox", "aria-label": venueEligible ? `${item.name} 승인 후 Venue 만들기` : `${item.name} 승인 후 장소 후보 보관` } });
        const selection = venueEligible ? modal.selectedVenueCandidates : modal.selectedPlaceCandidates;
        check.checked = selection.has(item);
        check.onchange = () => check.checked ? selection.add(item) : selection.delete(item);
        handoff.appendText(venueEligible ? "승인 후 Venue 만들기" : "승인 후 장소 후보 보관");
      } else row.createEl("span", { text: item.suggested_type || "resource", attr: { class: "reflection-candidate-status" } });
      const remove = row.createEl("button", { text: "삭제", attr: { type: "button", class: "prodigy-btn prodigy-btn-danger" } });
      remove.onclick = () => { modal.selectedVenueCandidates.delete(item); modal.selectedPlaceCandidates.delete(item); items.splice(index, 1); modal.render(); };
    });
  }
  function renderObjects(group, modal, app, openPath) {
    const items = modal.proposal.object_linking_suggestions;
    if (!items.length) return;
    group.createEl("h4", { text: "문서 연결 후보" });
    items.forEach((item, index) => {
      const row = group.createEl("div", { attr: { class: "reflection-candidate-row is-object" } });
      const link = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${item.name} 문서 연결` } });
      link.disabled = item.existence !== "existing";
      link.checked = item.existence === "existing" && modal.selectedObjectPaths.has(item.resolved_path);
      link.onchange = () => link.checked ? modal.selectedObjectPaths.add(item.resolved_path) : modal.selectedObjectPaths.delete(item.resolved_path);
      const name = row.createEl("input", { attr: { type: "text", "aria-label": "문서 이름" } });
      name.value = item.name || "";
      name.oninput = () => { item.name = name.value; };
      name.onchange = async () => { item.existence = "unknown"; item.resolved_path = ""; item.wiki_link = ""; await root.DailyReflectionAI.resolveObjectLinks(app, modal.proposal); modal.selectedObjectPaths = new Set(items.filter((candidate) => candidate.existence === "existing" && candidate.resolved_path).map((candidate) => candidate.resolved_path)); modal.render(); };
      const label = { existing: `연결됨 · ${item.wiki_link}`, missing: "일치 문서 없음", ambiguous: `후보 ${item.match_count || 0}개 · 선택 필요`, unknown: "지원하지 않는 문서 유형" };
      const status = row.createEl("div", { text: label[item.existence] || "미확인", attr: { class: `reflection-candidate-status${item.existence === "existing" ? " is-existing" : ""}` } });
      if (item.existence === "existing") { status.onclick = () => openPath(app, item.resolved_path); status.style.cursor = "pointer"; }
      removeButton(row, items, index, modal);
    });
  }
  function renderSimple(group, title, items, inputLabel, value, update, modal, select) {
    if (!items.length) return;
    group.createEl("h4", { text: title });
    items.forEach((item, index) => {
      const row = group.createEl("div", { attr: { class: "reflection-candidate-row" } });
      const input = row.createEl("input", { attr: { type: "text", "aria-label": inputLabel } });
      input.value = value(item);
      input.oninput = () => update(item, input.value);
      if (select) confidenceSelect(row, item); else row.createEl("span");
      removeButton(row, items, index, modal);
    });
  }
  function render(body, modal, app, openPath) {
    const candidates = body.createEl("div", { attr: { class: "reflection-candidates" } });
    candidates.createEl("h3", { text: "연결 후보" });
    candidates.createEl("div", { text: "후보 문구는 수정·삭제할 수 있습니다. 지식·리소스·PRE 분류 후보는 아직 저장되지 않습니다.", attr: { class: "reflection-preview-note" } });
    const group = candidates.createEl("div", { attr: { class: "reflection-candidate-group" } });
    renderKnowledge(group, modal); renderResources(group, modal); renderObjects(group, modal, app, openPath);
    renderSimple(group, "PRE 분류 제안", modal.proposal.pre_routing_suggestions, "PRE 분류 경로", (item) => (item.path || []).join(" → "), (item, text) => { item.path = text.split(/\s*(?:→|>)\s*/).map((part) => part.trim()).filter(Boolean).slice(0, 4); }, modal, true);
    renderSimple(group, "확인 필요", modal.proposal.uncertainties, "불확실성", (item) => item || "", (items, text) => { const index = modal.proposal.uncertainties.indexOf(items); modal.proposal.uncertainties[index] = text; }, modal, false);
  }
  root.DailyReflectionProposalCandidatesView = Object.freeze({ render });
})(typeof globalThis !== "undefined" ? globalThis : this);
