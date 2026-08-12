(function (root) {
  "use strict";

  function authoringCore() {
    if (!root.KnowledgeAuthoringCore && typeof require === "function") root.KnowledgeAuthoringCore = require("./knowledge-authoring-core.js");
    if (!root.KnowledgeAuthoringCore) throw new Error("Knowledge authoring core를 먼저 불러와야 합니다.");
    return root.KnowledgeAuthoringCore;
  }
  function formRenderer() {
    if (!root.KnowledgeDirectAuthoringForm && typeof require === "function") root.KnowledgeDirectAuthoringForm = require("./knowledge-direct-authoring-form.js");
    if (!root.KnowledgeDirectAuthoringForm) throw new Error("Knowledge direct authoring form을 먼저 불러와야 합니다.");
    return root.KnowledgeDirectAuthoringForm;
  }
  function registryTopics(domain) {
    const registry = root.KnowledgeExplorerRegistry || (typeof require === "function" ? require("./knowledge-explorer-registry.js") : null);
    return registry && Array.isArray(registry.TOPICS_BY_DOMAIN[domain]) ? registry.TOPICS_BY_DOMAIN[domain] : [];
  }

  function clean(value) { return typeof value === "string" ? value.trim() : ""; }
  function unique(values) {
    const result = [];
    for (const value of values) { const item = clean(value); if (item && !result.includes(item)) result.push(item); }
    return result;
  }
  function contexts(value) { return Array.isArray(value) ? unique(value) : unique(String(value || "").split(/[\n,]/)); }
  function topics(value) { return Array.isArray(value) ? unique(value) : unique(String(value || "").split(",")); }
  function links(value) { return Array.isArray(value) ? unique(value) : unique(String(value || "").split(/[\n,]/)); }
  function regionOptions(value) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item.value === "string" && typeof item.label === "string")
      .map((item) => ({ value: item.value, label: item.label })) : [];
  }
  function copyValues(value) {
    const source = value || {};
    return {
      title: String(source.title || ""), statement: String(source.statement || ""), body: String(source.body || ""), reason: String(source.reason || ""),
      source_claim: String(source.source_claim || ""),
      my_interpretation: String(source.my_interpretation || source.interpretation || ""),
      reusable_knowledge: String(source.reusable_knowledge || ""),
      source_note: String(source.source_note || ""), suggested_domain: String(source.suggested_domain || ""), suggested_topics: topics(source.suggested_topics),
      application_trigger: String(source.application_trigger || ""), application_contexts: contexts(source.application_contexts),
      connections: links(source.connections), invalidation_conditions: contexts(source.invalidation_conditions)
    };
  }
  function sameValues(left, right) { return JSON.stringify(copyValues(left)) === JSON.stringify(copyValues(right)); }
  function inputForValidation(values) {
    const detail = clean(values.body);
    const reason = clean(values.reason);
    const sourceClaim = clean(values.source_claim);
    const interpretation = clean(values.my_interpretation);
    const reusableKnowledge = clean(values.reusable_knowledge);
    const sections = [];
    if (reason) sections.push(reason);
    if (sourceClaim) sections.push(`## 출처 주장\n\n${sourceClaim}`);
    if (interpretation) sections.push(`## 내 해석\n\n${interpretation}`);
    if (reusableKnowledge) sections.push(`## 재사용 가능한 지식\n\n${reusableKnowledge}`);
    if (detail) sections.push(`## 학습 기록\n\n${detail}`);
    // Candidate storage owns fixed Markdown sections. Keep the structured study record in the existing human-authored reason section.
    const persistedReason = sections.join("\n\n");
    return {
      title: clean(values.title), statement: clean(values.statement), reason: persistedReason,
      source_note: clean(values.source_note), source_type: "manual_study", source_evidence_ids: [], source_objects: [], confidence: "explicit",
      suggested_domain: clean(values.suggested_domain), suggested_topics: topics(values.suggested_topics),
      application_trigger: clean(values.application_trigger), application_contexts: contexts(values.application_contexts),
      connections: links(values.connections), invalidation_conditions: contexts(values.invalidation_conditions)
    };
  }
  function recovery(error) {
    const message = clean(error && error.message) || "저장할 수 없습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.";
    if (/source_note|출처 메모/i.test(message)) return { message: "직접 학습 출처 메모를 입력해 주세요.", focus: "source_note" };
    if (/suggested_topics|세부 주제|지식 주제/i.test(message)) return { message: "선택한 지식 영역의 세부 주제를 확인해 주세요.", focus: "suggested_topics" };
    if (/suggested_domain|knowledge_domain|지식 영역|Domain/i.test(message)) return { message: "지식 영역을 선택해 주세요.", focus: "suggested_domain" };
    if (/application_contexts|적용 맥락/i.test(message)) return { message: "적용 맥락은 지식 영역 또는 지식 영역/세부 주제로 입력해 주세요.", focus: "application_contexts" };
    if (/title/i.test(message)) return { message: "제목을 입력해 주세요.", focus: "title" };
    if (/statement/i.test(message)) return { message: "핵심 요약(지식 문장)을 입력해 주세요.", focus: "statement" };
    if (/my_interpretation|내 해석|interpretation/i.test(message)) return { message: "내 해석을 확인해 주세요.", focus: "my_interpretation" };
    if (/reusable_knowledge|재사용 가능한 지식/i.test(message)) return { message: "재사용 가능한 지식을 확인해 주세요.", focus: "reusable_knowledge" };
    if (/body|학습 기록|학습 맥락/i.test(message)) return { message: "상세 학습 맥락을 확인해 주세요.", focus: "body" };
    if (/reason/i.test(message)) return { message: "제안 이유를 입력해 주세요.", focus: "reason" };
    return { message: "저장하지 못했습니다. 입력 내용은 유지되어 있으니 다시 시도해 주세요.", focus: "" };
  }

  function createDirectAuthoringController(options = {}) {
    const initial = copyValues(options.initialValues);
    let values = copyValues(initial);
    let validator = typeof options.validate === "function" ? options.validate : (input) => authoringCore().normalizeDirectStudy(input);
    let saveCandidate = typeof options.saveCandidate === "function"
      ? options.saveCandidate
      : options.candidateStore && typeof options.candidateStore.saveCandidate === "function"
        ? options.candidateStore.saveCandidate.bind(options.candidateStore)
        : null;
    let mounted = true;
    let pending = false;
    let saved = false;
    let closeArmed = false;
    let message = "";
    let error = "";
    let focus = "";
    let revision = 0;
    let onChange = typeof options.onChange === "function" ? options.onChange : () => {};

    const availableRegions = regionOptions(options.regionOptions);
    function emit(changedField) { if (mounted) onChange(changedField); }
    function state() { return { mounted, pending, saved, closeArmed, message, error, focus, dirty: !sameValues(values, initial) }; }
    function setField(name, value) {
      if (!mounted || pending || !Object.prototype.hasOwnProperty.call(values, name)) return;
      if (name === "suggested_topics") values[name] = topics(value);
      else if (name === "application_contexts") values[name] = contexts(value);
      else if (name === "connections") values[name] = links(value);
      else if (name === "invalidation_conditions") values[name] = contexts(value);
      else values[name] = typeof value === "string" ? value : "";
      if (name === "suggested_domain") {
        const allowed = registryTopics(values.suggested_domain);
        values.suggested_topics = values.suggested_topics.filter((topic) => allowed.includes(topic));
      }
      saved = false;
      error = "";
      focus = "";
      closeArmed = false;
      revision += 1;
      emit(name);
    }
    function setFields(next) { Object.keys(copyValues(next)).forEach((key) => setField(key, copyValues(next)[key])); }
    function valuesSnapshot() { return copyValues(values); }
    function unmount() {
      if (!mounted) return false;
      mounted = false;
      revision += 1;
      if (options.opener && typeof options.opener.focus === "function") options.opener.focus();
      if (typeof options.onClose === "function") options.onClose();
      return true;
    }
    function requestClose() {
      if (!mounted || pending) return false;
      if (!sameValues(values, initial) && !closeArmed) {
        closeArmed = true;
        error = "작성 중인 내용이 있습니다. 한 번 더 취소하거나 Escape를 누르면 저장하지 않고 닫습니다.";
        focus = "";
        emit();
        return false;
      }
      return unmount();
    }
    async function submit() {
      if (!mounted || pending || saved) return false;
      const token = ++revision;
      pending = true;
      error = "";
      focus = "";
      emit();
      let normalized;
      try {
        normalized = await Promise.resolve(validator(inputForValidation(values)));
      } catch (caught) {
        if (!mounted || token !== revision) return false;
        const next = recovery(caught);
        pending = false;
        error = next.message;
        focus = next.focus;
        emit();
        return false;
      }
      if (!mounted || token !== revision) return false;
      if (!saveCandidate) {
        pending = false;
        error = "검증 대기 저장소를 사용할 수 없습니다. 입력 내용은 유지됩니다.";
        emit();
        return false;
      }
      try {
        const result = await saveCandidate(options.app, normalized);
        if (!mounted || token !== revision) return false;
        pending = false;
        saved = true;
        message = "검증 대기에 저장했습니다. 검증 대기에서 검토해 주세요.";
        if (typeof options.onSaved === "function") await options.onSaved(result);
        if (!mounted || token !== revision) return false;
        emit();
        return true;
      } catch (_caught) {
        if (!mounted || token !== revision) return false;
        pending = false;
        error = "저장하지 못했습니다. 입력 내용은 유지되어 있으니 다시 시도해 주세요.";
        emit();
        return false;
      }
    }
    async function review() { if (saved && typeof options.onReview === "function") return options.onReview(); return undefined; }

    return {
      state, values: valuesSnapshot, setField, setFields, submit, review, requestClose, cancel: requestClose, unmount,
      setSaveCandidate(next) { saveCandidate = typeof next === "function" ? next : null; },
      setOnChange(next) { onChange = typeof next === "function" ? next : () => {}; },
      regionOptions() { return availableRegions.slice(); },
      setValidator(next) { validator = typeof next === "function" ? next : validator; }
    };
  }

  function renderDirectAuthoringView(parent, controller) {
    return formRenderer().renderDirectAuthoringForm(parent, controller);
  }
  function mountDirectAuthoringView(parent, controller) {
    if (!parent || !controller) throw new Error("작성 화면과 컨트롤러가 필요합니다.");
    const mounted = {
      render() { return renderDirectAuthoringView(parent, controller); },
      onKeydown(event) { if (event && event.key === "Escape") { if (event.preventDefault) event.preventDefault(); if (controller.requestClose()) parent.empty(); } }
    };
    controller.setOnChange((changedField) => {
      if (changedField === "suggested_domain" || !changedField) mounted.render();
    });
    mounted.render();
    return mounted;
  }
  function openDirectAuthoringModal(app, options = {}) {
    const Modal = options.Modal || (root.obsidian && root.obsidian.Modal);
    if (!Modal) throw new Error("Obsidian Modal을 사용할 수 없습니다.");
    class DirectAuthoringModal extends Modal {
      onOpen() {
        this.controller = createDirectAuthoringController({ ...options, app, opener: options.opener, onClose: () => this.close() });
        this.mounted = mountDirectAuthoringView(this.contentEl, this.controller);
      }
      onClose() {
        if (this.controller && this.controller.state().mounted) this.controller.unmount();
        if (this.contentEl && typeof this.contentEl.empty === "function") this.contentEl.empty();
      }
    }
    const modal = new DirectAuthoringModal(app);
    modal.open();
    return modal;
  }

  const api = Object.freeze({ createDirectAuthoringController, renderDirectAuthoringView, mountDirectAuthoringView, openDirectAuthoringModal });
  root.KnowledgeDirectAuthoringView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
