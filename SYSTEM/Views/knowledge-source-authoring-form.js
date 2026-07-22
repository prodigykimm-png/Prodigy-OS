(function (root) {
  "use strict";

  const SOURCE_KINDS = Object.freeze([
    Object.freeze({ value: "article", label: "기사" }),
    Object.freeze({ value: "column", label: "칼럼" }),
    Object.freeze({ value: "youtube", label: "YouTube" }),
    Object.freeze({ value: "course", label: "강의" }),
    Object.freeze({ value: "paper", label: "논문" }),
    Object.freeze({ value: "official_document", label: "공식 문서" }),
  ]);
  const SOURCE_KIND_FIELDS = Object.freeze({
    article: Object.freeze({ url: "자료 URL", creator: "작성자", publisher: "발행처" }),
    column: Object.freeze({ url: "칼럼 URL", creator: "필자", publisher: "매체" }),
    youtube: Object.freeze({ url: "동영상 URL", creator: "제작자", publisher: "채널" }),
    course: Object.freeze({ url: "강의 URL", creator: "강사", publisher: "강의 제공처" }),
    paper: Object.freeze({ url: "DOI 또는 URL", creator: "저자", publisher: "학술지/출판사" }),
    official_document: Object.freeze({ url: "문서 URL", creator: "작성자", publisher: "발행 기관" }),
  });

  function sourceKindFields(kind) { return SOURCE_KIND_FIELDS[kind] || SOURCE_KIND_FIELDS.article; }

  function createEl(parent, tag, options) {
    const config = options || {};
    if (!parent) return null;
    if (typeof parent.createEl === "function") return parent.createEl(tag, config);
    const element = parent.ownerDocument.createElement(tag);
    if (config.text !== undefined) element.textContent = String(config.text);
    Object.entries(config.attr || {}).forEach(([name, value]) => {
      if (value !== undefined) element.setAttribute(name, value);
    });
    if (config.disabled) element.disabled = true;
    parent.appendChild(element);
    return element;
  }

  function control(parent, controller, options) {
    const details = options || {};
    const input = createEl(parent, details.tag || "input", {
      attr: {
        id: details.name, name: details.name, type: details.type || "text", value: details.value || "",
        class: "knowledge-source-authoring-input", style: "min-width:0;width:100%;max-width:100%;box-sizing:border-box;",
        "aria-label": details.label, "aria-required": details.required ? "true" : undefined,
      },
      disabled: details.disabled,
    });
    input.value = details.value || "";
    input.oninput = (event) => controller.update({ [details.name]: event && event.target ? event.target.value : input.value });
    return input;
  }

  function label(parent, value, inputName) {
    return createEl(parent, "label", { text: value, attr: { for: inputName } });
  }

  function commaList(controlElement, property, controller) {
    controlElement.oninput = (event) => {
      const value = event && event.target ? event.target.value : controlElement.value;
      controller.update({ [property]: String(value).split(",").map((item) => item.trim()).filter(Boolean) });
    };
  }

  function renderMetadataFields(form, controller, draft, disabled) {
    const names = sourceKindFields(draft.source_kind);
    label(form, "자료 제목", "source_title");
    const title = control(form, controller, { name: "source_title", label: "자료 제목", value: draft.source_title, required: true, disabled });
    label(form, names.url, "source_url");
    control(form, controller, { name: "source_url", label: names.url, value: draft.source_url, type: "url", disabled });
    label(form, names.creator, "creator");
    control(form, controller, { name: "creator", label: names.creator, value: draft.creator, disabled });
    label(form, names.publisher, "publisher");
    control(form, controller, { name: "publisher", label: names.publisher, value: draft.publisher, disabled });
    label(form, "발행일", "published_at");
    control(form, controller, { name: "published_at", label: "발행일", value: draft.published_at, disabled });
    return title;
  }

  function renderInterpretationFields(form, controller, draft, disabled) {
    label(form, "출처 주장", "source_claim");
    control(form, controller, { name: "source_claim", label: "출처 주장", value: draft.source_claim, tag: "textarea", disabled });
    label(form, "내 해석 한 줄", "my_interpretation");
    control(form, controller, { name: "my_interpretation", label: "내 해석 한 줄", value: draft.my_interpretation, tag: "textarea", required: true, disabled });
    if (draft.has_ai_summary) {
      label(form, "AI 보조 요약", "ai_summary");
      control(form, controller, { name: "ai_summary", label: "AI 보조 요약", value: draft.ai_summary, tag: "textarea", disabled });
      label(form, "AI 요약 불확실성", "ai_uncertainty");
      control(form, controller, { name: "ai_uncertainty", label: "AI 요약 불확실성", value: draft.ai_uncertainty, disabled });
    }
    label(form, "재사용 가능한 지식", "reusable_knowledge");
    control(form, controller, { name: "reusable_knowledge", label: "재사용 가능한 지식", value: draft.reusable_knowledge, tag: "textarea", disabled });
  }

  function renderClassificationFields(form, controller, draft, disabled) {
    label(form, "지식 도메인", "knowledge_domain");
    control(form, controller, { name: "knowledge_domain", label: "지식 도메인", value: draft.knowledge_domain, disabled });
    label(form, "주제(쉼표로 구분)", "knowledge_topics");
    commaList(control(form, controller, { name: "knowledge_topics_text", label: "주제", value: draft.knowledge_topics.join(", "), disabled }), "knowledge_topics", controller);
    label(form, "적용 계기", "application_trigger");
    control(form, controller, { name: "application_trigger", label: "적용 계기", value: draft.application_trigger, disabled });
    label(form, "적용 맥락(쉼표로 구분)", "application_contexts");
    commaList(control(form, controller, { name: "application_contexts_text", label: "적용 맥락", value: draft.application_contexts.join(", "), disabled }), "application_contexts", controller);
  }

  function renderActions(section, form, controller, current, disabled) {
    const draft = current.draft;
    const optIn = createEl(form, "input", { attr: { type: "checkbox", name: "create_candidate", "aria-label": "후보도 만들어 검토 대기에 추가" }, disabled });
    optIn.checked = draft.create_candidate;
    optIn.onchange = (event) => controller.update({ create_candidate: Boolean(event && event.target && event.target.checked) });
    createEl(form, "span", { text: "후보도 만들어 검토 대기에 추가" });
    if (current.error) createEl(section, "p", { text: current.error, attr: { role: "alert", class: "knowledge-source-authoring-error" } });
    if (current.source) createEl(section, "p", { text: `저장된 자료: ${current.source.link}`, attr: { class: "knowledge-source-authoring-success" } });
    const actions = createEl(section, "div", { attr: { class: "knowledge-source-authoring-actions", style: "display:flex;flex-wrap:wrap;gap:8px;" } });
    const save = createEl(actions, "button", { text: current.pending ? "저장 중" : "자료 저장", attr: { type: "button", "aria-label": "자료 저장" }, disabled: disabled || Boolean(current.source) });
    save.onclick = () => { void controller.submit(); };
    const retry = createEl(actions, "button", { text: "후보 만들기 다시 시도", attr: { type: "button", "aria-label": "후보 만들기 다시 시도" }, disabled: disabled || current.phase !== "source_saved_candidate_error" });
    retry.onclick = () => { void controller.retryCandidate(); };
    const cancel = createEl(actions, "button", { text: "취소", attr: { type: "button", "aria-label": "취소" }, disabled });
    cancel.onclick = () => controller.cancel();
  }

  function renderSourceAuthoringForm(parent, controller, options) {
    if (!parent || !controller || typeof controller.state !== "function") throw new Error("자료 작성 controller가 필요합니다.");
    const current = controller.state();
    const draft = current.draft;
    const disabled = current.pending || current.closed;
    const section = createEl(parent, "section", { attr: { class: "knowledge-source-authoring", "aria-label": "단일 자료 정리" } });
    section.onkeydown = (event) => { if (event && event.key === "Escape" && !current.pending) controller.cancel(); };
    createEl(section, "h2", { text: "단일 자료" });
    createEl(section, "p", { text: "자료를 먼저 저장하고, 필요할 때만 후보를 검토 대기에 추가합니다.", attr: { class: "knowledge-source-authoring-help" } });
    const form = createEl(section, "fieldset", { attr: { class: "knowledge-source-authoring-fields", style: "min-width:0;display:grid;gap:8px;", "aria-label": "단일 자료 입력" }, disabled });
    label(form, "자료 유형", "source_kind");
    const kind = createEl(form, "select", { attr: { id: "source_kind", name: "source_kind", class: "knowledge-source-authoring-input", style: "min-width:0;width:100%;max-width:100%;box-sizing:border-box;", "aria-label": "자료 유형" }, disabled });
    SOURCE_KINDS.forEach((item) => createEl(kind, "option", { text: item.label, attr: { value: item.value, selected: item.value === draft.source_kind ? "selected" : undefined } }));
    kind.value = draft.source_kind;
    kind.onchange = (event) => controller.update({ source_kind: event && event.target ? event.target.value : kind.value });
    const title = renderMetadataFields(form, controller, draft, disabled);
    renderInterpretationFields(form, controller, draft, disabled);
    renderClassificationFields(form, controller, draft, disabled);
    renderActions(section, form, controller, current, disabled);
    if (options && options.focusFirst && typeof title.focus === "function" && !disabled) title.focus();
    return section;
  }

  const api = Object.freeze({ SOURCE_KINDS, sourceKindFields, renderSourceAuthoringForm });
  root.KnowledgeSourceAuthoringForm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
