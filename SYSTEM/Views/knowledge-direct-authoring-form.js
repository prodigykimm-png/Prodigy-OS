(function (root) {
  "use strict";

  const DOMAIN_LABELS = Object.freeze({
    real_estate: "부동산", wedding: "웨딩", coding: "코딩", workout: "운동",
    reading: "독서", business: "비즈니스", personal_growth: "개인 성장"
  });
  const TOPIC_LABELS = Object.freeze({
    rights_analysis: "권리 분석", site_visit: "현장 조사", bidding: "입찰", public_auction: "공매", tax: "세금", precedent: "판례",
    shooting: "촬영", lighting: "조명", editing: "편집", equipment: "장비",
    electron: "Electron", react: "React", typescript: "TypeScript", python: "Python", ai: "인공지능", prompt_engineering: "프롬프트 설계",
    obsidian_plugin: "Obsidian 플러그인", claude_code: "Claude Code", codex: "Codex", gemini: "Gemini"
  });

  function registryTopics(domain) {
    const registry = root.KnowledgeExplorerRegistry || (typeof require === "function" ? require("./knowledge-explorer-registry.js") : null);
    return registry && Array.isArray(registry.TOPICS_BY_DOMAIN[domain]) ? registry.TOPICS_BY_DOMAIN[domain] : [];
  }
  function setNodeText(node, value) {
    if (node && typeof node.setText === "function") node.setText(value);
    else if (node) node.textContent = String(value || "");
  }
  function setNodeAttr(node, name, value) {
    if (!node) return;
    if (typeof node.setAttr === "function") node.setAttr(name, value);
    else if (typeof node.setAttribute === "function") node.setAttribute(name, String(value));
  }
  function selectedLabels(options, values) {
    const selected = Array.isArray(values) ? values : [values];
    return options.filter((option) => selected.includes(option.value)).map((option) => option.label);
  }
  function pickerField(parent, config) {
    parent.createEl("label", { text: config.label, attr: { for: `knowledge-direct-${config.name}`, style: "display:block;font-weight:600;margin:10px 0 4px;" } });
    const wrap = parent.createEl("div", { attr: { class: "knowledge-direct-picker", style: "position:relative;min-width:0;" } });
    const options = Array.isArray(config.options) ? config.options : [];
    let selected = Array.isArray(config.value) ? config.value.slice() : [config.value || ""];
    let query = "";
    let open = false;
    const trigger = wrap.createEl("button", { text: "", attr: {
      id: `knowledge-direct-${config.name}`, name: config.name, type: "button", "data-picker-trigger": config.name,
      "aria-label": config.label, title: "클릭해 목록 열기", "aria-haspopup": "listbox", "aria-expanded": "false",
      style: "display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:40px;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);text-align:left;white-space:normal;cursor:pointer;"
    } });
    trigger.disabled = Boolean(config.disabled);
    const triggerValue = trigger.createEl("span", { attr: { style: "min-width:0;overflow-wrap:anywhere;line-height:1.4;" } });
    const menuStyle = "position:absolute;z-index:20;left:0;right:0;bottom:calc(100% + 4px);padding:8px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);box-shadow:var(--shadow-s);";
    const menuMount = wrap.createEl("div", { attr: { class: "knowledge-direct-picker-menu", style: `${menuStyle}display:none;` } });
    function displayValue() {
      const labels = selectedLabels(options, config.multiple ? selected : selected[0]);
      return labels.length ? labels.join(", ") : "선택하세요";
    }
    function renderOptions(optionsMount) {
      optionsMount.empty();
      const needle = query.trim().toLocaleLowerCase();
      const visible = options.filter((option) => !needle || `${option.label} ${option.value}`.toLocaleLowerCase().includes(needle));
      if (!visible.length) {
        optionsMount.createEl("p", { text: options.length ? "검색 결과가 없습니다." : "선택할 항목이 없습니다.", attr: { style: "margin:6px;color:var(--text-muted);" } });
        return;
      }
      visible.forEach((option) => {
        const isSelected = selected.includes(option.value);
        const item = optionsMount.createEl("button", { text: `${isSelected ? "✓ " : ""}${option.label}`, attr: {
          type: "button", "data-picker-option": option.value, role: "option", "aria-selected": isSelected ? "true" : "false",
          style: "display:block;width:100%;padding:8px;border:0;border-radius:5px;background:transparent;color:var(--text-normal);text-align:left;cursor:pointer;"
        } });
        item.onclick = (event) => {
          if (event && event.preventDefault) event.preventDefault();
          if (config.multiple) {
            selected = isSelected ? selected.filter((value) => value !== option.value) : [...selected, option.value];
            config.onChange(selected.slice());
            setNodeText(triggerValue, `${displayValue()}  ▼`);
            renderOptions(optionsMount);
          } else {
            selected = [option.value];
            open = false;
            config.onChange(option.value);
            render();
          }
        };
      });
    }
    function render() {
      setNodeText(triggerValue, `${displayValue()}  ▼`);
      setNodeAttr(trigger, "aria-expanded", open ? "true" : "false");
      setNodeAttr(menuMount, "style", open ? menuStyle : `${menuStyle}display:none;`);
      menuMount.empty();
      if (!open) return;
      const search = menuMount.createEl("input", { attr: {
        type: "search", "data-picker-search": config.name, placeholder: "검색…", "aria-label": `${config.label} 검색`,
        style: "width:100%;box-sizing:border-box;margin-bottom:6px;padding:7px;border:1px solid var(--background-modifier-border);border-radius:5px;background:var(--background-primary);color:var(--text-normal);"
      } });
      search.value = query;
      const optionsMount = menuMount.createEl("div", { attr: { role: "listbox", style: "max-height:220px;overflow:auto;" } });
      search.oninput = (event) => { query = event && event.target ? event.target.value : search.value; renderOptions(optionsMount); };
      renderOptions(optionsMount);
    }
    trigger.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (trigger.disabled) return; open = !open; query = ""; render(); };
    render();
    if (config.help) parent.createEl("p", { text: config.help, attr: { id: `knowledge-direct-${config.name}-help`, style: "margin:4px 0;color:var(--text-muted);font-size:0.85em;" } });
    return trigger;
  }
  function field(parent, config) {
    if (config.select) return pickerField(parent, config);
    parent.createEl("label", { text: config.label, attr: { for: `knowledge-direct-${config.name}`, style: "display:block;font-weight:600;margin:10px 0 4px;" } });
    const input = parent.createEl(config.rows ? "textarea" : "input", { attr: {
      id: `knowledge-direct-${config.name}`, name: config.name, type: config.rows ? undefined : "text", rows: config.rows ? String(config.rows) : undefined,
      required: config.required ? "true" : undefined, "aria-required": config.required ? "true" : undefined, "aria-label": config.label,
      "aria-describedby": config.help ? `knowledge-direct-${config.name}-help` : undefined,
      style: "width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);"
    } });
    input.value = config.value == null ? "" : config.value;
    input.disabled = Boolean(config.disabled);
    input.oninput = (event) => config.onChange(event && event.target ? event.target.value : input.value);
    input.onchange = (event) => config.onChange(event && event.target ? event.target.value : input.value);
    if (config.help) parent.createEl("p", { text: config.help, attr: { id: `knowledge-direct-${config.name}-help`, style: "margin:4px 0;color:var(--text-muted);font-size:0.85em;" } });
    return input;
  }
  function domainOptions() { return Object.keys(DOMAIN_LABELS).map((value) => ({ value, label: DOMAIN_LABELS[value] })); }
  function topicOptions(domain) { return registryTopics(domain).map((value) => ({ value, label: TOPIC_LABELS[value] || value })); }
  function findNamed(parent, name) {
    if (!parent) return null;
    if (parent.attr && parent.attr.name === name) return parent;
    for (const child of parent.children || []) {
      const found = findNamed(child, name);
      if (found) return found;
    }
    return null;
  }

  function renderDirectAuthoringForm(parent, controller) {
    if (!parent || !controller) throw new Error("작성 화면과 컨트롤러가 필요합니다.");
    parent.empty();
    const current = controller.values();
    const status = controller.state();
    if (!status.mounted) return parent;
    const form = parent.createEl("form", { attr: { class: "knowledge-direct-authoring-view", "aria-label": "직접 지식 작성", novalidate: "true" } });
    form.onsubmit = (event) => { if (event && event.preventDefault) event.preventDefault(); void controller.submit(); };
    form.onkeydown = (event) => { if (event && event.key === "Escape") { if (event.preventDefault) event.preventDefault(); if (controller.requestClose()) parent.empty(); } };
    form.createEl("h2", { text: "+ 지식 작성" });
    form.createEl("p", { text: "직접 학습한 내용을 사람이 작성해 검증 대기에 보냅니다. 자동 생성이나 승인 없이 직접 입력합니다.", attr: { style: "color:var(--text-muted);" } });
    const disabled = status.pending || status.saved;
    field(form, { label: "제목", name: "title", value: current.title, required: true, disabled, onChange: (value) => controller.setField("title", value) });
    field(form, { label: "지식 문장", name: "statement", value: current.statement, rows: 3, required: true, disabled, onChange: (value) => controller.setField("statement", value) });
    field(form, { label: "상세 학습 기록", name: "body", value: current.body, rows: 5, disabled, help: "긴 학습 기록은 Candidate의 사람 작성 제안 이유에 함께 보존됩니다.", onChange: (value) => controller.setField("body", value) });
    field(form, { label: "제안 이유", name: "reason", value: current.reason, rows: 3, required: true, disabled, onChange: (value) => controller.setField("reason", value) });
    field(form, { label: "직접 학습 출처 메모", name: "source_note", value: current.source_note, rows: 3, required: true, disabled, help: "직접 학습한 날짜, 실습 또는 참고 맥락을 남겨 주세요.", onChange: (value) => controller.setField("source_note", value) });
    field(form, { label: "지식 영역", name: "suggested_domain", value: current.suggested_domain, select: true, required: true, disabled, options: [{ value: "", label: "선택하세요" }, ...domainOptions()], onChange: (value) => controller.setField("suggested_domain", value) });
    const availableTopics = topicOptions(current.suggested_domain);
    if (current.suggested_domain && !availableTopics.length) form.createEl("p", { text: "이 지식 영역은 세부 주제를 선택할 필요가 없습니다.", attr: { "data-state": "topicless", style: "color:var(--text-muted);" } });
    else if (current.suggested_domain) field(form, { label: "세부 주제", name: "suggested_topics", value: current.suggested_topics, select: true, multiple: true, required: true, disabled, options: availableTopics, help: "클릭해 목록을 열고 필요한 주제를 검색·선택하세요.", onChange: (value) => controller.setField("suggested_topics", value) });
    field(form, { label: "적용 계기", name: "application_trigger", value: current.application_trigger, rows: 2, disabled, onChange: (value) => controller.setField("application_trigger", value) });
    field(form, { label: "적용 맥락", name: "application_contexts", value: current.application_contexts.join("\n"), rows: 3, disabled, help: "한 줄에 하나씩 지식 영역 또는 지식 영역/세부 주제를 입력하세요.", onChange: (value) => controller.setField("application_contexts", value) });
    field(form, { label: "연결 Region", name: "connections", value: current.connections, select: true, multiple: true, disabled,
      options: controller.regionOptions ? controller.regionOptions() : [], help: "클릭해 목록을 열고 지역명으로 검색·선택하세요. 선택한 Region만 정확한 wikilink로 저장됩니다.",
      onChange: (value) => controller.setField("connections", value) });
    field(form, { label: "무효화 조건", name: "invalidation_conditions", value: Array.isArray(current.invalidation_conditions) ? current.invalidation_conditions.join("\n") : "", rows: 2, disabled, help: "이 지식이 더 이상 유효하지 않게 되는 조건을 한 줄에 하나씩 입력하세요.", onChange: (value) => controller.setField("invalidation_conditions", value) });
    if (status.error) form.createEl("p", { text: status.error, attr: { role: "alert", "aria-live": "assertive", "data-state": "error" } });
    if (status.message) form.createEl("p", { text: status.message, attr: { role: "status", "aria-live": "polite", "data-state": "saved" } });
    const actions = form.createEl("div", { attr: { style: "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px;" } });
    const cancel = actions.createEl("button", { text: "취소", attr: { type: "button" }, disabled: status.pending });
    cancel.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (controller.requestClose()) parent.empty(); };
    if (status.saved) {
      const review = actions.createEl("button", { text: "검증 대기에서 검토", attr: { type: "button" } });
      review.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); return controller.review(); };
    } else {
      const submit = actions.createEl("button", { text: status.pending ? "저장 중…" : "검증 대기에 저장", attr: { type: "submit" }, disabled: status.pending });
      submit.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); void controller.submit(); };
    }
    if (status.focus) {
      const target = findNamed(form, status.focus);
      if (target && typeof target.focus === "function") target.focus();
    }
    return parent;
  }

  const api = Object.freeze({ renderDirectAuthoringForm });
  root.KnowledgeDirectAuthoringForm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
