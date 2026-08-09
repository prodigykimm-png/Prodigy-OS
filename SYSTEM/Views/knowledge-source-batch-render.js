(function (root) {
  "use strict";

  if (typeof require === "function" && !root.KnowledgeSourceBatchState) root.KnowledgeSourceBatchState = require("./knowledge-source-batch-state.js");
  const State = root.KnowledgeSourceBatchState;

  function createEl(parent, tag, options) {
    const settings = options || {};
    if (!parent) return null;
    if (typeof parent.createEl === "function") return parent.createEl(tag, settings);
    const element = parent.ownerDocument.createElement(tag);
    if (settings.text !== undefined) element.textContent = String(settings.text);
    Object.entries(settings.attr || {}).forEach(([name, value]) => { if (value !== undefined) element.setAttribute(name, value); });
    if (settings.disabled) element.disabled = true;
    parent.appendChild(element);
    return element;
  }
  function control(parent, details, onInput) {
    const element = createEl(parent, details.tag || "input", { attr: { name: details.name, type: details.type || "text", value: details.value || "", "aria-label": details.label, "aria-required": details.required ? "true" : undefined, class: details.className || "knowledge-source-batch-input" }, disabled: details.disabled });
    element.value = details.value || "";
    element.oninput = (event) => onInput(event && event.target ? event.target.value : element.value);
    return element;
  }
  function labeledControl(parent, label, details, onInput) {
    createEl(parent, "label", { text: label, attr: { for: details.name } });
    return control(parent, { ...details, label }, onInput);
  }
  function fieldList(value) { return Array.isArray(value) ? value.join(", ") : ""; }
  function statusLabel(row) { return ({ queued: "대기", retrieving: "가져오는 중", retrieved: "가져옴", fallback: "메모 필요", error: "오류", cancelled: "취소됨" })[row.status] || "대기"; }
  function rowLocked(row, current) { return row.pending || Boolean(row.source) || current.operation !== "idle" || current.saving; }
  function renderRows(parent, controller, current) {
    if (!current.rows.length) return;
    const list = createEl(parent, "div", { attr: { class: "knowledge-source-batch-rows", "aria-live": "polite" } });
    current.rows.forEach((row, index) => {
      const locked = rowLocked(row, current);
      const section = createEl(list, "section", { attr: { class: "knowledge-source-batch-row", "data-status": row.status, "aria-label": `문헌노트 ${index + 1}: ${statusLabel(row)}` } });
      createEl(section, "h3", { text: `문헌노트 ${index + 1}` });
      createEl(section, "p", { text: `${statusLabel(row)} · ${row.source_url}`, attr: { class: "knowledge-source-batch-status" } });
      checkbox(section, `selected-${row.item_id}`, `문헌노트 ${index + 1} 저장`, "이 문헌노트 저장", row.selected, locked, (value) => controller.updateRow(row.item_id, { selected: value }));
      labeledControl(section, "문헌 제목", { name: `source_title-${row.item_id}`, value: row.source_title, required: true, disabled: locked }, (value) => controller.updateRow(row.item_id, { source_title: value }));
      if (row.status === "fallback" || row.status === "error" || row.status === "cancelled") {
        createEl(section, "p", { text: row.row_error || "원문 텍스트 또는 메모를 입력해 주세요.", attr: { class: "knowledge-source-batch-notice" } });
        labeledControl(section, "사용자 텍스트 또는 메모", { name: `fallback-${row.item_id}`, value: row.fallback_text, tag: "textarea", disabled: locked }, (value) => controller.updateRow(row.item_id, { fallback_text: value }));
      }
      labeledControl(section, "AI 요약", { name: `summary-${row.item_id}`, value: row.ai_summary, tag: "textarea", disabled: locked }, (value) => controller.updateRow(row.item_id, { ai_summary: value }));
      labeledControl(section, "불확실성", { name: `uncertainty-${row.item_id}`, value: row.ai_uncertainty, tag: "textarea", disabled: locked }, (value) => controller.updateRow(row.item_id, { ai_uncertainty: value }));
      labeledControl(section, "내 한 줄", { name: `interpretation-${row.item_id}`, value: row.my_interpretation, tag: "textarea", required: true, disabled: locked }, (value) => controller.updateRow(row.item_id, { my_interpretation: value }));
      checkbox(section, `include-reusable-${row.item_id}`, `문헌노트 ${index + 1} 재사용 가능한 지식으로 남기기`, "재사용 가능한 지식으로 남기기", row.include_reusable, locked, (value) => controller.updateRow(row.item_id, { include_reusable: value }));
      if (row.include_reusable) labeledControl(section, "재사용 가능한 지식", { name: `reusable-${row.item_id}`, value: row.reusable_knowledge, tag: "textarea", disabled: locked }, (value) => controller.updateRow(row.item_id, { reusable_knowledge: value }));
      labeledControl(section, "지식 도메인", { name: `domain-${row.item_id}`, value: row.knowledge_domain, required: true, disabled: locked }, (value) => controller.updateRow(row.item_id, { knowledge_domain: value }));
      labeledControl(section, "주제(쉼표로 구분)", { name: `topics-${row.item_id}`, value: fieldList(row.knowledge_topics), disabled: locked }, (value) => controller.updateRow(row.item_id, { knowledge_topics: value }));
      labeledControl(section, "적용 계기", { name: `trigger-${row.item_id}`, value: row.application_trigger, disabled: locked }, (value) => controller.updateRow(row.item_id, { application_trigger: value }));
      labeledControl(section, "적용 맥락(쉼표로 구분)", { name: `contexts-${row.item_id}`, value: fieldList(row.application_contexts), disabled: locked }, (value) => controller.updateRow(row.item_id, { application_contexts: value }));
      checkbox(section, `candidate-${row.item_id}`, `문헌노트 ${index + 1} 후보도 만들기`, "후보도 만들어 검토 대기에 추가", row.create_candidate, row.pending || Boolean(row.candidate) || current.operation !== "idle" || current.saving, (value) => controller.updateRow(row.item_id, { create_candidate: value }));
      if (row.source) createEl(section, "p", { text: `저장된 문헌노트: ${row.source.link}`, attr: { class: "knowledge-source-batch-success" } });
      if (row.row_error || row.candidate_error) createEl(section, "p", { text: row.candidate_error || row.row_error, attr: { role: "alert", class: "knowledge-source-batch-error" } });
      if (row.candidate_error) {
        const retry = createEl(section, "button", { text: "후보 만들기 다시 시도", attr: { type: "button", "aria-label": `문헌노트 ${index + 1} 후보 만들기 다시 시도` }, disabled: row.pending || current.operation !== "idle" || current.saving });
        retry.onclick = () => { void controller.retryCandidate(row.item_id); };
      }
    });
  }
  function checkbox(parent, name, label, text, checked, disabled, onChange) {
    const element = createEl(parent, "input", { attr: { type: "checkbox", name, "aria-label": label }, disabled });
    element.checked = checked;
    element.onchange = (event) => onChange(Boolean(event && event.target && event.target.checked));
    createEl(parent, "span", { text });
    return element;
  }
  function mountSourceBatchView(parent, controller) {
    if (!parent || !controller || typeof controller.state !== "function") throw new Error("문헌노트 묶음 controller가 필요합니다.");
    let firstRender = true;
    let escapeArmed = false;
    function render() {
      parent.empty();
      const current = controller.state();
      if (current.closed) return parent;
      const section = createEl(parent, "section", { attr: { class: "knowledge-source-batch", role: "dialog", "aria-label": "문헌노트 묶음", "aria-busy": current.operation !== "idle" || current.saving ? "true" : "false" } });
      createEl(section, "h2", { text: "문헌노트 묶음" });
      createEl(section, "p", { text: "URL은 한 줄에 하나씩 1개 이상 20개 이하로 입력합니다. 붙여넣기만으로는 가져오거나 AI 요약하지 않습니다.", attr: { class: "knowledge-source-batch-help" } });
      const form = createEl(section, "fieldset", { attr: { class: "knowledge-source-batch-fields", "aria-label": "문헌노트 묶음 입력" }, disabled: current.operation !== "idle" || current.saving });
      const urls = labeledControl(form, "문헌노트 URL 목록", { name: "urls_text", value: current.values.urls_text, tag: "textarea", required: true }, (value) => controller.setValues({ urls_text: value }));
      createEl(form, "p", { text: "한 줄에 하나씩, 최대 20개", attr: { class: "knowledge-source-batch-hint" } });
      createEl(form, "label", { text: "문헌 유형", attr: { for: "source_kind" } });
      const kind = createEl(form, "select", { attr: { name: "source_kind", "aria-label": "문헌 유형", class: "knowledge-source-batch-input" } });
      State.SUPPORTED_KINDS.forEach((item) => createEl(kind, "option", { text: item.label, attr: { value: item.value, selected: item.value === current.values.source_kind ? "selected" : undefined } }));
      kind.value = current.values.source_kind;
      kind.onchange = (event) => controller.setValues({ source_kind: event && event.target ? event.target.value : kind.value });
      if (current.error) createEl(section, "p", { text: current.error, attr: { role: "alert", class: "knowledge-source-batch-error" } });
      if (current.message) createEl(section, "p", { text: current.message, attr: { class: "knowledge-source-batch-message" } });
      renderActions(section, controller, current);
      renderRows(section, controller, current);
      if (firstRender && urls && typeof urls.focus === "function") { urls.focus(); firstRender = false; }
      return parent;
    }
    function onKeydown(event) {
      if (!event || event.key !== "Escape") return;
      if (event.preventDefault) event.preventDefault();
      if (controller.state().operation !== "idle") { controller.cancelActive(); return; }
      if (!escapeArmed && (controller.state().values.urls_text || controller.state().rows.length)) { escapeArmed = true; controller.setValues(controller.state().values); return; }
      controller.close();
    }
    const unsubscribe = controller.subscribe(render);
    render();
    return Object.freeze({ render, onKeydown, unmount() { unsubscribe(); controller.close(); parent.empty(); } });
  }
  function renderActions(section, controller, current) {
    const actions = createEl(section, "div", { attr: { class: "knowledge-source-batch-actions" } });
    const check = createEl(actions, "button", { text: "문헌노트 목록 확인", attr: { type: "button", "aria-label": "문헌노트 목록 확인" }, disabled: current.operation !== "idle" || current.saving });
    check.onclick = () => controller.prepare();
    const retrieve = createEl(actions, "button", { text: current.operation === "retrieving" ? "가져오기 취소" : "공개 자료 가져오기", attr: { type: "button", "aria-label": current.operation === "retrieving" ? "가져오기 취소" : "공개 자료 가져오기" }, disabled: current.saving || (!current.rows.length && current.operation !== "retrieving") });
    retrieve.onclick = () => { if (current.operation === "retrieving") controller.cancelActive(); else { void controller.retrieve(); } };
    const summarize = createEl(actions, "button", { text: current.operation === "summarizing" ? "요약 취소" : "AI 요약", attr: { type: "button", "aria-label": current.operation === "summarizing" ? "요약 취소" : "AI 요약" }, disabled: current.operation === "summarizing" ? false : !current.can_summarize });
    summarize.onclick = () => { if (current.operation === "summarizing") controller.cancelActive(); else { void controller.summarize(); } };
    const save = createEl(actions, "button", { text: current.saving ? "저장 중" : "선택한 문헌노트 저장", attr: { type: "button", "aria-label": "선택한 문헌노트 저장" }, disabled: current.operation !== "idle" || current.saving || !current.rows.length });
    save.onclick = () => { void controller.saveSelected(); };
    const close = createEl(actions, "button", { text: "취소", attr: { type: "button", "aria-label": "취소" }, disabled: current.saving });
    close.onclick = () => controller.close();
  }

  const api = Object.freeze({ mountSourceBatchView });
  root.KnowledgeSourceBatchRender = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
