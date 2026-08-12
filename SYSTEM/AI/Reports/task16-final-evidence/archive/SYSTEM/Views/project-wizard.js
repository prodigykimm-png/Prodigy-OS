(function (root) {
  "use strict";

  const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_project.md";
  const PROJECT_FOLDER = "PARA/PROJECTS";

  const PRESENTATION_CSS = `
.prodigy-project-wizard,.prodigy-project-type-manager{inline-size:100%;max-inline-size:100%;min-inline-size:0;color:var(--ke-color-text);font:400 var(--ke-type-body)/var(--ke-leading-body) var(--ke-font-text);word-break:keep-all;overflow-wrap:anywhere}
.prodigy-project-wizard *,.prodigy-project-type-manager *{box-sizing:border-box;min-inline-size:0}
.prodigy-project-wizard button,.prodigy-project-type-manager button,.prodigy-project-wizard input,.prodigy-project-wizard select,.prodigy-project-wizard textarea,.prodigy-project-type-manager input{min-inline-size:var(--ke-touch-target);min-block-size:var(--ke-touch-target);max-inline-size:100%;box-shadow:none!important}
.prodigy-project-wizard button,.prodigy-project-type-manager button{border-radius:var(--ke-radius-control);white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
.prodigy-project-wizard button:active,.prodigy-project-type-manager button:active{transform:scale(0.95)}
.prodigy-project-wizard button:focus-visible,.prodigy-project-type-manager button:focus-visible,.prodigy-project-wizard input:focus-visible,.prodigy-project-wizard select:focus-visible,.prodigy-project-wizard textarea:focus-visible{outline:var(--ke-focus-ring-width) solid var(--ke-color-accent);outline-offset:var(--ke-space-1)}
.prodigy-project-wizard button:disabled{cursor:not-allowed!important;opacity:var(--ke-opacity-disabled);transform:none}
.prodigy-project-wizard .prodigy-type-name,.prodigy-project-wizard .prodigy-wizard-column{min-inline-size:0;overflow-wrap:anywhere}
.prodigy-project-wizard .prodigy-date-grid>*,.prodigy-project-wizard .prodigy-date-stack input{min-inline-size:0}
.prodigy-project-approval-bar{display:flex;justify-content:flex-end;gap:var(--ke-space-2);min-block-size:var(--ke-action-bar-height);margin-block-start:var(--ke-space-3);padding-block-start:var(--ke-space-3);border-block-start:var(--ke-border-width) solid var(--ke-color-border);flex-wrap:wrap}
.prodigy-project-type-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ke-space-2);align-items:center}
.prodigy-project-wizard[data-density=compact] .prodigy-workflow-row,.prodigy-project-type-manager[data-density=compact] .prodigy-project-type-add,.prodigy-project-wizard[data-density=compact] .prodigy-project-approval-bar,.prodigy-project-type-manager[data-density=compact] .prodigy-project-approval-bar,.prodigy-project-wizard[data-density=compact] .prodigy-workflow-head{display:grid!important;grid-template-columns:minmax(0,1fr)!important}
.prodigy-project-wizard[data-density=compact] .prodigy-workflow-index{text-align:start!important}.prodigy-project-wizard[data-density=compact] .prodigy-workflow-controls{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(var(--ke-touch-target),1fr));inline-size:100%}
.prodigy-project-wizard[data-density=compact] .prodigy-workflow-head-actions{display:flex;flex-wrap:wrap}
.prodigy-project-wizard input,.prodigy-project-wizard textarea,.prodigy-project-wizard select,.prodigy-project-type-manager input{inline-size:100%;box-sizing:border-box;min-block-size:var(--ke-control-height);padding:var(--ke-space-2) var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);font:400 var(--ke-type-body)/var(--ke-leading-body) var(--ke-font-text)}
@media (prefers-reduced-motion: reduce){.prodigy-project-wizard *,.prodigy-project-type-manager *{transition:none!important;animation:none!important;transform:none!important}}
@media (forced-colors: active){.prodigy-project-wizard button:focus-visible,.prodigy-project-type-manager button:focus-visible{outline-color:Highlight}.prodigy-project-wizard [aria-pressed="true"]{border-width:var(--ke-focus-ring-width)}}`;

  function projectLayout(core, element, logicalWidth) {
    const explicit = Number(logicalWidth);
    const measured = Number(element && element.clientWidth);
    const tokens = root.ProdigyTokens;
    const width = Number.isFinite(explicit)
      ? explicit
      : Number.isFinite(measured) && measured > 0 ? measured : tokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax;
    return core.resolveProjectWorkspaceLayout(width);
  }

  function applyPresentationTokens(element) {
    const design = root.ProdigyTokens || {};
    const type = design.TYPE_SCALE || {};
    const space = design.SPACE_SCALE || {};
    const radii = design.RADII || {};
    const heights = design.CONTROL_HEIGHTS || {};
    const colors = design.SEMANTIC_COLORS || {};
    const body = type.body || {};
    const caption = type.caption || {};
    const title = type.tagline || {};
    const properties = {
      "--ke-type-body": `${body.fontSize || 17}px`,
      "--ke-type-title": `${title.fontSize || 21}px`,
      "--ke-type-label": `${caption.fontSize || 14}px`,
      "--ke-leading-body": String(body.lineHeight || 1.47),
      "--ke-leading-control": String(caption.lineHeight || 1.43),
      "--ke-font-text": body.fontFamily || "system-ui, -apple-system, sans-serif",
      "--ke-space-1": `${space.xxs || 4}px`,
      "--ke-space-2": `${space.xs || 8}px`,
      "--ke-space-3": `${space.sm || 12}px`,
      "--ke-border-width": "1px",
      "--ke-focus-ring-width": "2px",
      "--ke-radius-control": `${radii.sm || 8}px`,
      "--ke-opacity-disabled": "0.6",
      "--ke-color-surface": colors.canvas || "var(--background-primary)",
      "--ke-color-surface-secondary": colors.canvasParchment || "var(--background-secondary)",
      "--ke-color-border": colors.border || "var(--background-modifier-border)",
      "--ke-color-text": colors.ink || "var(--text-normal)",
      "--ke-color-muted": colors.muted || "var(--text-muted)",
      "--ke-color-accent": colors.focus || "var(--text-accent)",
      "--ke-color-interactive": colors.action || "var(--interactive-accent)",
      "--ke-color-on-interactive": colors.onAction || "var(--text-on-accent)",
      "--ke-control-height": `${heights.native || 44}px`,
      "--ke-touch-target": `${heights.touchTarget || 44}px`,
      "--ke-action-bar-height": `${heights.actionBar || 52}px`,
    };
    if (element && element.style && typeof element.style.setProperty === "function") {
      Object.entries(properties).forEach(([name, value]) => element.style.setProperty(name, value));
    }
  }

  function applyResponsiveSurface(element, layout) {
    applyPresentationTokens(element);
    element.setAttribute("data-density", layout.density);
  }

  function notice(message, timeout) {
    const Notice = root.Notice || (root.obsidian && root.obsidian.Notice);
    if (Notice) new Notice(message, timeout || 5000);
  }

  function button(parent, text, className) {
    if (root.ProdigyUI && typeof root.ProdigyUI.button === "function") {
      return root.ProdigyUI.button(parent, text, { className: className || "" });
    }
    return parent.createEl("button", {
      text,
      attr: { type: "button", class: `prodigy-btn ${className || ""}`.trim() }
    });
  }

  function iconButton(parent, iconName, label) {
    const el = button(parent, "", "prodigy-icon-button");
    el.setAttribute("aria-label", label);
    el.setAttribute("title", label);
    el.style.inlineSize = "var(--ke-touch-target)";
    el.style.minInlineSize = "var(--ke-touch-target)";
    el.style.padding = "var(--ke-space-2)";
    el.style.display = "inline-flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    const setIcon = root.setIcon || (root.obsidian && root.obsidian.setIcon);
    if (typeof setIcon === "function") setIcon(el, iconName);
    else el.textContent = iconName === "arrow-up" ? "↑" : iconName === "arrow-down" ? "↓" : iconName === "trash-2" ? "×" : iconName === "settings-2" ? "⋮" : "+";
    return el;
  }

  function primaryButton(parent, text) {
    const el = button(parent, text);
    el.classList.add("prodigy-btn-primary");
    el.style.background = "var(--ke-color-interactive)";
    el.style.color = "var(--ke-color-on-interactive)";
    el.style.borderColor = "var(--ke-color-interactive)";
    el.style.fontWeight = "700";
    return el;
  }

  function fieldLabel(parent, text) {
    parent.createEl("div", {
      text,
      attr: { style: "font-size:var(--ke-type-label);font-weight:700;color:var(--ke-color-muted);margin-bottom:4px;" }
    });
  }

  function input(parent, value, placeholder, onChange) {
    const el = parent.createEl("input", {
      attr: {
        value: value || "",
        placeholder: placeholder || "",
        style: "width:100%;box-sizing:border-box;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);padding:7px 8px;font-size:var(--ke-type-body);"
      }
    });
    el.setAttribute("aria-label", placeholder || "Input");
    el.oninput = () => onChange(el.value);
    return el;
  }

  function dateInput(parent, value, label, onChange) {
    const el = input(parent, value, "YYYY-MM-DD", onChange);
    el.type = "date";
    el.style.minWidth = "0";
    el.setAttribute("aria-label", label);
    el.setAttribute("title", `${label} (type YYYY-MM-DD or choose from calendar)`);
    return el;
  }

  function textarea(parent, value, placeholder, onChange) {
    const el = parent.createEl("textarea", {
      attr: {
        placeholder: placeholder || "",
        style: "width:100%;min-height:82px;box-sizing:border-box;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);padding:8px;font-size:var(--ke-type-body);resize:vertical;"
      }
    });
    el.setAttribute("aria-label", placeholder || "Text area");
    el.value = value || "";
    el.oninput = () => onChange(el.value);
    return el;
  }

  function select(parent, value, options, onChange) {
    const el = parent.createEl("select", {
      attr: {
        style: "width:100%;box-sizing:border-box;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);padding:7px 8px;font-size:var(--ke-type-body);"
      }
    });
    options.forEach((option) => {
      const opt = el.createEl("option", { text: option.label, value: option.value });
      if (option.value === value) opt.selected = true;
    });
    el.onchange = () => onChange(el.value);
    return el;
  }

  async function readFile(app, path) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return app.vault.read(file);
  }

  function listExistingProjectPaths(app) {
    return app.vault.getFiles()
      .filter((file) => file.path.startsWith(`${PROJECT_FOLDER}/`) && file.extension === "md")
      .map((file) => file.path);
  }

  async function writeSyncResult(app, path, updater) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`Project file not found: ${path}`);
    const before = await app.vault.read(file);
    const after = updater(before);
    if (after !== before) await app.vault.modify(file, after);
    return after;
  }

  class ProjectTypeManagerModal extends root.obsidian.Modal {
    constructor(app, customPresets, currentWorkflow, onSaved, logicalWidth) {
      super(app);
      this.presets = JSON.parse(JSON.stringify(customPresets || {}));
      this.currentWorkflow = this.coreWorkflow = (currentWorkflow || []).map((item) => ({ label: item.label || "" }));
      this.onSaved = onSaved;
      this.name = "";
      this.status = "";
      this.logicalWidth = logicalWidth;
    }

    onOpen() {
      if (this.modalEl) this.modalEl.style.width = "min(560px, calc(100vw - 32px))";
      this.render();
      const firstInput = this.contentEl && this.contentEl.querySelector && this.contentEl.querySelector("input");
      if (firstInput && typeof firstInput.focus === "function") firstInput.focus();
    }

    onClose() {
      this.contentEl.empty();
    }

    render() {
      const { contentEl } = this;
      contentEl.empty();
      const layout = projectLayout(root.ProjectWizardCore, this.modalEl || contentEl, this.logicalWidth);
      applyResponsiveSurface(contentEl, layout);
      contentEl.createEl("style", { text: PRESENTATION_CSS });
      contentEl.addClass("prodigy-project-type-manager");
      contentEl.createEl("h2", { text: "프로젝트 유형", attr: { style: "margin:0 0 8px;font-size:var(--ke-type-title);" } });
      contentEl.createEl("div", {
        text: "기본 제공 유형은 고정입니다. 추가한 유형은 현재 워크플로를 시작 프리셋으로 사용합니다.",
        attr: { style: "font-size:var(--ke-type-body);color:var(--ke-color-muted);line-height:1.4;margin-bottom:12px;" }
      });

      const addRow = contentEl.createEl("div", { attr: { class: "prodigy-project-type-add", style: "margin-bottom:12px;" } });
      input(addRow, this.name, "새 프로젝트 유형", (value) => { this.name = value; });
      const add = iconButton(addRow, "plus", "프로젝트 유형 추가");
      add.onclick = () => this.addType();

      const list = contentEl.createEl("div", { attr: { style: "display:flex;flex-direction:column;gap:4px;" } });
      const customNames = Object.keys(this.presets);
      if (customNames.length === 0) {
        list.createEl("div", { text: "사용자 정의 프로젝트 유형이 아직 없습니다.", attr: { style: "font-size:var(--ke-type-body);color:var(--ke-color-muted);padding:8px 0;" } });
      }
      customNames.forEach((name) => {
        const row = list.createEl("div", { attr: { style: "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--ke-color-border);" } });
        row.createEl("span", { text: name, attr: { class: "prodigy-type-name" } });
        const remove = iconButton(row, "trash-2", `${name} 삭제`);
        remove.onclick = () => {
          delete this.presets[name];
          this.render();
        };
      });

      if (this.status) contentEl.createEl("div", { text: this.status, attr: { style: "font-size:var(--ke-type-body);color:var(--ke-color-muted);margin-top:8px;" } });
      const footer = contentEl.createEl("div", { attr: { class: "prodigy-project-approval-bar" } });
      button(footer, "취소").onclick = () => this.close();
      primaryButton(footer, "저장").onclick = () => this.save();
    }

    addType() {
      const name = this.name.trim();
      if (!name) {
        this.status = "프로젝트 유형 이름을 입력하세요.";
        this.render();
        return;
      }
      if (root.ProjectWizardCore.getPresetNames().includes(name)) {
        this.status = "기본 제공 프로젝트 유형은 바꿀 수 없습니다.";
        this.render();
        return;
      }
      if (this.coreWorkflow && Object.keys(this.presets).includes(name)) {
        this.status = "이미 있는 사용자 정의 프로젝트 유형입니다.";
        this.render();
        return;
      }
      this.presets[name] = this.coreWorkflow.map((item) => ({ label: item.label || "" }));
      this.name = "";
      this.status = "";
      this.render();
    }

    async save() {
      try {
        if (this.onSaved) await this.onSaved(this.presets);
        this.close();
      } catch (error) {
        this.status = `Save failed: ${error.message}`;
        this.render();
      }
    }
  }

  class ProjectWizardModal extends root.obsidian.Modal {
    /**
     * @param {object} app
     * @param {{ initialProjectName?: string, logicalWidth?: number }} [options]
     *   initialProjectName is applied once at construction (editable; not reset on render).
     */
    constructor(app, options) {
      super(app);
      const core = root.ProjectWizardCore;
      this.core = core;
      const opts = options && typeof options === "object" ? options : {};
      const initialName = typeof core.normalizeInitialProjectName === "function"
        ? core.normalizeInitialProjectName(opts.initialProjectName)
        : String(opts.initialProjectName == null ? "" : opts.initialProjectName).trim();
      this.state = {
        projectName: initialName,
        startDate: core.todayIso(),
        dueDate: "",
        projectKind: "work",
        projectType: "Company",
        description: "",
        startMode: "planning",
        workflow: core.getPresetWorkflow("Company"),
        workflowPresets: {},
        providerKey: "",
        providerConfig: null,
        busy: false,
        status: "",
        createdPath: "",
        createdWorkflow: []
      };
      this.logicalWidth = opts.logicalWidth;
    }

    async onOpen() {
      if (this.modalEl) {
        this.modalEl.setAttribute("data-task13a-owned-prompt", "true");
        this.modalEl.style.width = "min(1040px, calc(100vw - 32px))";
        this.modalEl.style.maxWidth = "calc(100vw - 32px)";
      }
      try {
        this.state.providerConfig = await root.ProjectWorkflowDraftService.loadProviderConfig(this.app);
        this.state.providerKey = this.state.providerConfig.defaultProvider;
        this.state.workflowPresets = this.state.providerConfig.workflowPresets || {};
      } catch (error) {
        this.state.status = error.message;
      }
      this.render();
      const projectName = this.contentEl && this.contentEl.querySelector && this.contentEl.querySelector("input");
      if (projectName && typeof projectName.focus === "function") projectName.focus();
    }

    onClose() {
      this.contentEl.empty();
    }

    render() {
      const { contentEl } = this;
      contentEl.empty();
      contentEl.addClass("prodigy-project-wizard");
      const layout = projectLayout(this.core, this.modalEl || contentEl, this.logicalWidth);
      applyResponsiveSurface(contentEl, layout);
      contentEl.createEl("style", { text: PRESENTATION_CSS });
      contentEl.createEl("h2", { text: "프로젝트 시작", attr: { style: "margin:0 0 12px;font-size:var(--ke-type-title);" } });

      const shell = contentEl.createEl("div", {
        attr: {
          class: "prodigy-wizard-shell",
          "data-layout": layout.density,
          style: `display:grid;grid-template-columns:${layout.columns === 2 ? "minmax(0,0.85fr) minmax(0,1.35fr)" : "minmax(0,1fr)"};gap:16px;align-items:start;`
        }
      });
      const left = shell.createEl("div", { attr: { class: "prodigy-wizard-column", style: "display:flex;flex-direction:column;gap:10px;" } });
      const right = shell.createEl("div", { attr: { class: "prodigy-wizard-column", style: "display:flex;flex-direction:column;gap:10px;" } });

      this.renderContext(left);
      this.renderWorkflow(right);
      this.renderFooter(contentEl);
    }

    renderContext(parent) {
      const state = this.state;
      const display = root.prodigyDisplay;
      const projectBox = parent.createEl("div", {
        attr: { class: "prodigy-project-context prodigy-utility-card" }
      });
      fieldLabel(projectBox, "프로젝트 이름");
      input(projectBox, state.projectName, "3차 운송예산 편성", (value) => { state.projectName = value; });

      const kindBox = projectBox.createEl("div", { attr: { style: "margin-top:10px;" } });
      fieldLabel(kindBox, "프로젝트 유형");
      const kindRow = kindBox.createEl("div", {
        attr: { style: "display:flex;gap:8px;flex-wrap:wrap;" }
      });
      [
        { key: "business", label: "사업" },
        { key: "work", label: "회사" },
        { key: "personal", label: "개인" }
      ].forEach((choice) => {
        const opt = button(kindRow, choice.label);
        opt.style.minHeight = "var(--ke-touch-target)";
        if (state.projectKind === choice.key) {
          opt.style.borderColor = "var(--ke-color-accent)";
          opt.style.background = "color-mix(in srgb, var(--ke-color-accent) 16%, var(--ke-color-surface-secondary))";
          opt.style.fontWeight = "700";
        }
        opt.onclick = () => {
          if (state.projectKind === choice.key) return;
          state.projectKind = choice.key;
          const preset = this.core.defaultWorkflowPresetForProjectType(choice.key);
          if (this.core.getPresetNames(state.workflowPresets).includes(preset)) {
            state.projectType = preset;
            state.workflow = this.core.getPresetWorkflow(preset, state.workflowPresets);
          }
          this.render();
        };
      });

      const layout = projectLayout(this.core, this.modalEl || this.contentEl, this.logicalWidth);
      const dateGridStyle = layout.density === "compact"
        ? "display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:9px;"
        : "display:grid;grid-template-columns:180px minmax(0,1fr);gap:10px;margin-top:9px;";
      const grid = projectBox.createEl("div", {
        attr: {
          class: "prodigy-date-grid",
          style: dateGridStyle
        }
      });
      const typeCell = grid.createEl("div", { attr: { style: "min-width:0;" } });
      const typeHead = typeCell.createEl("div", { attr: { style: "display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;" } });
      typeHead.createEl("span", { text: "워크플로 프리셋", attr: { style: "font-size:var(--ke-type-label);font-weight:700;color:var(--ke-color-muted);" } });
      const manageTypes = iconButton(typeHead, "settings-2", "워크플로 프리셋 관리");
      manageTypes.onclick = () => this.openProjectTypeManager();
      select(typeCell, state.projectType, this.core.getPresetNames(state.workflowPresets).map((name) => ({ value: name, label: name })), (value) => {
        const previous = state.projectType;
        state.projectType = value;
        if (previous !== value) {
          state.workflow = this.core.getPresetWorkflow(value, state.workflowPresets);
          this.render();
        }
      });

      const dateCell = grid.createEl("div", { attr: { class: "prodigy-date-stack", style: "display:flex;flex-direction:column;gap:6px;min-width:0;" } });
      fieldLabel(dateCell, display.property("start_date"));
      dateInput(dateCell, state.startDate, display.property("start_date"), (value) => { state.startDate = value; });
      const dueCell = dateCell.createEl("div");
      fieldLabel(dueCell, display.property("due_date"));
      dateInput(dueCell, state.dueDate, display.property("due_date"), (value) => { state.dueDate = value; });

      const descBox = projectBox.createEl("div", { attr: { style: "margin-top:9px;" } });
      fieldLabel(descBox, "이 프로젝트가 완료되려면 무엇이 충족되어야 하나요?");
      textarea(descBox, state.description, "완료 조건을 한 문단으로 적어주세요.", (value) => { state.description = value; });

      const startBox = parent.createEl("div", {
        attr: { class: "prodigy-project-start-mode prodigy-utility-card" }
      });
      fieldLabel(startBox, "시작 상태");
      const choices = startBox.createEl("div", { attr: { style: "display:flex;gap:8px;flex-wrap:wrap;" } });
      [
        { key: "planning", label: display.status("planning"), hint: "프로젝트만 생성" },
        { key: "start_now", label: "바로 시작", hint: "Todoist 함께 생성" }
      ].forEach((choice) => {
        const opt = button(choices, `${choice.label} - ${choice.hint}`);
        if (state.startMode === choice.key) {
          opt.style.borderColor = "var(--ke-color-accent)";
          opt.style.background = "color-mix(in srgb, var(--ke-color-accent) 16%, var(--ke-color-surface-secondary))";
        }
        opt.onclick = () => {
          state.startMode = choice.key;
          this.render();
        };
      });

      const providerBox = parent.createEl("div", {
        attr: { class: "prodigy-project-provider prodigy-utility-card" }
      });
      fieldLabel(providerBox, "AI 제공자");
      const providerOptions = root.ProjectWorkflowDraftService
        .listProviders(state.providerConfig || undefined)
        .map((provider) => ({
          value: provider.key,
          label: provider.model ? `${provider.name} (${provider.model})` : `${provider.name} (설정되지 않음)`
        }));
      select(providerBox, state.providerKey || (providerOptions[0] && providerOptions[0].value) || "", providerOptions, (value) => {
        state.providerKey = value;
      });
      const aiRow = providerBox.createEl("div", { attr: { style: "display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap;" } });
      const refine = primaryButton(aiRow, state.busy ? "다듬는 중..." : "워크플로 다듬기");
      refine.disabled = state.busy;
      refine.onclick = () => this.refineWorkflow();
      button(aiRow, "설정").onclick = () => this.openSettings();
      button(aiRow, "직접 편집").onclick = () => {
        state.status = "현재 워크플로를 직접 편집할 수 있습니다.";
        this.render();
      };
    }

    openProjectTypeManager() {
      new ProjectTypeManagerModal(this.app, this.state.workflowPresets, this.state.workflow, async (presets) => {
        await root.ProjectWorkflowDraftService.saveProviderSettings(this.app, {
          config: { workflowPresets: presets }
        });
        this.state.workflowPresets = presets;
        if (!this.core.getPresetNames(presets).includes(this.state.projectType)) this.state.projectType = "Company";
        this.state.workflow = this.core.getPresetWorkflow(this.state.projectType, presets);
        this.state.providerConfig = Object.assign({}, this.state.providerConfig, { workflowPresets: presets });
        this.state.status = "프로젝트 유형을 업데이트했습니다.";
        this.render();
      }, this.logicalWidth).open();
    }

    renderWorkflow(parent) {
      const state = this.state;
      const box = parent.createEl("div", {
        attr: { class: "prodigy-project-workflow prodigy-utility-card" }
      });
      const head = box.createEl("div", { attr: { class: "prodigy-workflow-head", style: "display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;" } });
      head.createEl("div", { text: "워크플로 초안", attr: { style: "font-weight:800;color:var(--ke-color-text);" } });
      const headActions = head.createEl("div", { attr: { class: "prodigy-workflow-head-actions", style: "display:flex;gap:6px;" } });
      button(headActions, "프리셋 초기화").onclick = () => {
        state.workflow = this.core.getPresetWorkflow(state.projectType, state.workflowPresets);
        this.render();
      };
      button(headActions, "항목 추가").onclick = () => {
        state.workflow.push({ label: "" });
        this.render();
      };

      const rows = box.createEl("div", { attr: { style: "display:flex;flex-direction:column;gap:6px;" } });
      if (state.workflow.length === 0) {
        rows.createEl("div", {
          text: "빈 프리셋입니다. 프로젝트를 만들기 전에 워크플로 항목을 하나 이상 추가하세요.",
          attr: { style: "font-size:var(--ke-type-body);color:var(--ke-color-muted);padding:8px;border:1px dashed var(--ke-color-border);border-radius:var(--ke-radius-control);" }
        });
      }
      state.workflow.forEach((item, index) => {
        const row = rows.createEl("div", {
          attr: { class: "prodigy-workflow-row", style: "display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:6px;align-items:center;" }
        });
        row.createEl("span", { text: String(index + 1), attr: { class: "prodigy-workflow-index", style: "font-size:var(--ke-type-label);color:var(--ke-color-muted);text-align:right;font-variant-numeric:tabular-nums;" } });
        const workflowInput = row.createEl("textarea", {
          attr: {
            rows: "1",
            class: "prodigy-workflow-input",
            placeholder: "워크플로 항목",
            "aria-label": "워크플로 항목",
            style: "width:100%;min-height:var(--ke-touch-target);box-sizing:border-box;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);padding:var(--ke-space-2) var(--ke-space-3);font-size:var(--ke-type-body);resize:vertical;overflow-wrap:anywhere;"
          }
        });
        workflowInput.value = item.label;
        workflowInput.oninput = () => { item.label = workflowInput.value; };
        const controls = row.createEl("div", { attr: { class: "prodigy-workflow-controls", style: "display:flex;gap:4px;" } });
        const up = iconButton(controls, "arrow-up", index === 0 ? "위로 이동 (불가)" : "위로 이동");
        up.disabled = index === 0;
        up.onclick = () => {
          const tmp = state.workflow[index - 1];
          state.workflow[index - 1] = state.workflow[index];
          state.workflow[index] = tmp;
          this.render();
        };
        const down = iconButton(controls, "arrow-down", index === state.workflow.length - 1 ? "아래로 이동 (불가)" : "아래로 이동");
        down.disabled = index === state.workflow.length - 1;
        down.onclick = () => {
          const tmp = state.workflow[index + 1];
          state.workflow[index + 1] = state.workflow[index];
          state.workflow[index] = tmp;
          this.render();
        };
        iconButton(controls, "trash-2", "워크플로 항목 삭제").onclick = () => {
          state.workflow.splice(index, 1);
          this.render();
        };
      });
    }

    renderFooter(parent) {
      if (this.state.status) {
        parent.createEl("div", {
          text: this.state.status,
          attr: { style: "margin-top:10px;font-size:var(--ke-type-body);color:var(--ke-color-muted);background:var(--ke-color-surface-secondary);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);padding:8px;" }
        });
      }

      const footer = parent.createEl("div", {
        attr: { class: "prodigy-project-approval-bar" }
      });
      if (this.state.createdPath) {
        button(footer, "프로젝트 열기").onclick = () => {
          this.app.workspace.openLinkText(this.state.createdPath, "", false);
        };
        const projectId = this.state.todoistProjectId;
        if (projectId) {
          button(footer, "Todoist 열기").onclick = () => {
            window.open(`https://todoist.com/app/project/${projectId}`);
          };
        }
        if (this.state.startMode === "start_now") {
          button(footer, "Todoist 재시도").onclick = () => this.retryTodoist();
        }
      }
      button(footer, "취소").onclick = () => this.close();
      const create = primaryButton(footer, this.state.busy ? "만드는 중..." : "프로젝트 만들기");
      create.disabled = this.state.busy || !!this.state.createdPath;
      create.onclick = () => this.createProject();
    }

    async refineWorkflow() {
      const validation = this.core.validateWizardInput(Object.assign({}, this.state, {
        workflow: this.state.workflow.length ? this.state.workflow : [{ label: "임시 항목" }]
      }), { presets: this.state.workflowPresets });
      if (!this.state.projectName.trim() || !this.state.dueDate.trim() || !this.core.validateIsoDate(this.state.startDate) || !this.core.validateIsoDate(this.state.dueDate)) {
        this.state.status = "AI 다듬기 전에 프로젝트 이름과 유효한 마감일이 필요합니다.";
        this.render();
        return;
      }
      this.state.busy = true;
      this.state.status = "워크플로 다듬기를 요청하는 중...";
      this.render();
      try {
        const result = await root.ProjectWorkflowDraftService.generateStructuredWorkflow({
          app: this.app,
          config: this.state.providerConfig,
          providerKey: this.state.providerKey,
          projectContext: {
            projectName: this.state.projectName,
            projectType: this.state.projectType,
            description: this.state.description,
            startDate: this.state.startDate,
            dueDate: this.state.dueDate
          },
          baseWorkflow: this.state.workflow.length ? this.state.workflow : this.core.getPresetWorkflow(this.state.projectType, this.state.workflowPresets),
          schema: this.core.WORKFLOW_SCHEMA
        });
        this.state.workflow = this.core.cloneWorkflow(result.workflow);
        this.state.status = `Workflow refined with ${result.provider}.`;
      } catch (error) {
        this.state.status = `AI refinement failed: ${root.ProjectWorkflowDraftService.redactError(error)}`;
      } finally {
        this.state.busy = false;
        this.render();
      }
    }

    openSettings() {
      if (!root.ProdigySettingsModal || typeof root.ProdigySettingsModal.open !== "function") {
        this.state.status = "Prodigy OS 설정을 불러오지 못했습니다.";
        this.render();
        return;
      }
      root.ProdigySettingsModal.open(this.app, { onSaved: async (savedConfig) => {
        this.state.providerConfig = savedConfig;
        this.state.providerKey = savedConfig.defaultProvider;
        this.state.status = "Prodigy OS 설정을 적용했습니다.";
        this.render();
      }});
    }

    async createProject() {
      const validation = this.core.validateWizardInput(this.state, { presets: this.state.workflowPresets });
      if (!validation.ok) {
        this.state.status = validation.errors.join(" ");
        this.render();
        return;
      }
      this.state.busy = true;
      this.state.status = "프로젝트 객체를 만드는 중...";
      this.render();
      try {
        const template = await readFile(this.app, TEMPLATE_PATH);
        const existingPaths = listExistingProjectPaths(this.app);
        const objectPath = this.core.buildProjectPath(validation.value.projectName, existingPaths);
        const rendered = this.core.renderProjectContent(template, validation.value, { presets: this.state.workflowPresets });
        await this.app.vault.create(objectPath, rendered.content);
        this.state.createdPath = objectPath;
        this.state.createdWorkflow = rendered.workflow;
        this.state.status = "프로젝트 객체를 만들었습니다.";
        notice("프로젝트 객체를 만들었습니다.");

        if (validation.value.startMode === "start_now") {
          await this.syncTodoist(objectPath, rendered.workflow, validation.value.projectName, "", validation.value.startDate, validation.value.dueDate);
        }
      } catch (error) {
        this.state.status = `프로젝트 생성 실패: ${error.message}`;
        notice(this.state.status, 9000);
      } finally {
        this.state.busy = false;
        this.render();
      }
    }

    async retryTodoist() {
      if (!this.state.createdPath) return;
      this.state.busy = true;
      this.state.status = "Todoist 동기화를 다시 시도하는 중...";
      this.render();
      try {
        await this.syncTodoist(this.state.createdPath, this.state.createdWorkflow, this.state.projectName, this.state.todoistProjectId || "", this.state.startDate, this.state.dueDate);
      } finally {
        this.state.busy = false;
        this.render();
      }
    }

    async syncTodoist(objectPath, workflow, projectName, existingProjectId, startDate, dueDate) {
      this.state.status = "Todoist 프로젝트와 작업을 만드는 중...";
      this.render();
      try {
        const result = await root.ProjectTodoistAdapter.createExecutionArtifacts({
          app: this.app,
          projectName,
          objectPath,
          workflowItems: workflow,
          todoistProjectId: existingProjectId,
          startDate: startDate || root.ProjectTodoistAdapter.getTodayIsoDate(),
          dueDate
        });
        this.state.todoistProjectId = result.projectId;
        await writeSyncResult(this.app, objectPath, (content) => {
          let next = this.core.setTodoistProjectId(content, result.projectId);
          Object.keys(result.taskIds).forEach((workflowId) => {
            next = this.core.setWorkflowTaskId(next, workflowId, result.taskIds[workflowId]);
          });
          next = this.core.setProjectSyncStatus(next, "synced", "");
          return next;
        });
        this.state.createdWorkflow = workflow.map((item) => Object.assign({}, item, {
          todoist_task_id: result.taskIds[item.id] || item.todoist_task_id || ""
        }));
        this.state.status = "프로젝트를 성공적으로 시작했습니다.";
        notice("프로젝트를 성공적으로 시작했습니다.");
      } catch (error) {
        const message = root.ProjectTodoistAdapter.redactError(error);
        await writeSyncResult(this.app, objectPath, (content) => this.core.setProjectSyncStatus(content, "failed", message));
        this.state.status = `Todoist 동기화 실패: ${message}`;
        notice(this.state.status, 9000);
      }
    }
  }

  /**
   * Public entry: open Project Wizard.
   * @param {{ initialProjectName?: string, logicalWidth?: number }} [options]
   * openProjectWizard() — blank name (existing callers)
   * openProjectWizard({ initialProjectName: "…" }) — prefill once
   */
  function openProjectWizard(options) {
    if (!root.app || !root.obsidian) {
      notice("프로젝트 마법사는 Obsidian 앱 컨텍스트가 필요합니다.", 9000);
      return;
    }
    if (!root.ProjectWizardCore || !root.ProjectWorkflowDraftService || !root.ProjectTodoistAdapter) {
      notice("프로젝트 마법사 스크립트가 아직 모두 로드되지 않았습니다.", 9000);
      return;
    }
    const opts = options && typeof options === "object" ? options : {};
    new ProjectWizardModal(root.app, opts).open();
  }

  root.ProjectWizardModal = ProjectWizardModal;
  root.openProjectWizard = openProjectWizard;
})(typeof globalThis !== "undefined" ? globalThis : this);
