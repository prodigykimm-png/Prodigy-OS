(function (root) {
  "use strict";

  /**
   * Reading Guide modal — answer-first.
   * Phases: before / during / after. Inline answers, save to Object.
   * No checkbox homework UI.
   */

  const openModals = new Map();

  function modules() {
    const value = { core: root.ReadingChecklistCore, store: root.ReadingChecklistStore };
    if (!value.core || !value.store) throw new Error("Reading Checklist modules are unavailable.");
    return value;
  }

  function notice(message) {
    const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
    if (Notice) new Notice(message);
  }

  function button(parent, text, primary = false) {
    return parent.createEl("button", {
      text,
      attr: { type: "button", class: primary ? "mod-cta reading-guide-button" : "reading-guide-button" },
    });
  }

  function sourcePath(source) {
    return modules().core.normalizePath(source && (source.source_path || (source.file && source.file.path)));
  }

  function createStore(app) {
    const api = modules().store;
    return api.createChecklistStore(api.createObsidianAdapter(app));
  }

  function strategyLabel(selection) {
    if (!selection) return "공통 독서";
    if (!selection.known || selection.type === "universal") return "공통 독서";
    const map = {
      practical: "공통 + 실용",
      philosophy: "공통 + 철학",
      history: "공통 + 역사",
      science: "공통 + 과학",
      literature: "공통 + 문학",
      social_science: "공통 + 사회과학",
    };
    return map[selection.type] || `공통 + ${selection.type}`;
  }

  async function loadGuide(app, source) {
    const api = modules();
    const path = sourcePath(source);
    if (!api.core.isEligibleReadingPath(path) || !app.vault.getAbstractFileByPath(path)) {
      const error = new Error("Reading source is unavailable.");
      error.code = "SOURCE_UNAVAILABLE";
      throw error;
    }
    const selection = api.core.selectQuestions(source);
    const store = createStore(app);
    const id = api.core.stableSourceId(source);
    const previous = await store.read(id);
    const state = api.store.createState(source, selection, previous);
    // Persisted refined questions override the deterministic selection on reload.
    if (state.questions && Object.keys(state.questions).length) {
      selection.phases.forEach((phase) => {
        if (Array.isArray(state.questions[phase.id]) && state.questions[phase.id].length) {
          phase.questions = state.questions[phase.id];
        }
      });
    }
    if (!previous || previous.source_path !== state.source_path || previous.strategy !== state.strategy) {
      await store.write(id, state);
    }
    return { id, selection, state, store };
  }

  async function openBook(app, source) {
    const path = sourcePath(source);
    const file = modules().core.isEligibleReadingPath(path) && app.vault.getAbstractFileByPath(path);
    if (!file || !String(file.path || "").endsWith(".md")) {
      notice("원본 독서 기록을 찾을 수 없습니다.");
      return false;
    }
    await app.workspace.openLinkText(file.path, "", false);
    return true;
  }

  async function saveNoteToObject(app, source, question, memo) {
    const path = sourcePath(source);
    const file = modules().core.isEligibleReadingPath(path) && app.vault.getAbstractFileByPath(path);
    const clean = String(memo || "").trim();
    if (!file || !String(file.path || "").endsWith(".md")) throw new Error("Reading source was not found.");
    if (!clean) throw new Error("Reading guide note is empty.");
    const content = await app.vault.read(file);
    await app.vault.modify(file, modules().core.upsertReadingGuideNote(content, question, clean));
    return true;
  }

  const ModalBase = root.obsidian && root.obsidian.Modal;

  class ResetAnswersModal extends ModalBase {
    constructor(app, onConfirm) {
      super(app);
      this.onConfirm = onConfirm;
    }
    onOpen() {
      this.contentEl.addClass("reading-guide-confirm");
      this.contentEl.createEl("h2", { text: "임시 답을 초기화할까요?", attr: { style: "margin:0 0 8px;font-size:1.08em;" } });
      this.contentEl.createEl("p", {
        text: "질답에 적어 둔 임시 답만 지웁니다. Reading Object에 이미 저장한 노트는 유지됩니다.",
        attr: { style: "color:var(--text-muted);font-size:.86em;" },
      });
      const actions = this.contentEl.createDiv({ attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:16px;" } });
      button(actions, "취소").onclick = () => this.close();
      button(actions, "초기화 확인", true).onclick = async () => {
        await this.onConfirm();
        this.close();
      };
    }
  }

  const PHASE_TAB_LABELS = Object.freeze({
    before: "읽기 전",
    during: "읽는 중",
    after: "읽은 후",
  });

  class ReadingGuideModal extends ModalBase {
    constructor(app, source) {
      super(app);
      this.source = { ...source, source_path: sourcePath(source) };
      this.data = null;
      this.loadPromise = null;
      this.answerBuffers = {};
      this.saveTimers = {};
      this.activePhaseId = "before";
    }

    onOpen() {
      this.renderLoading();
      this.loadPromise = this.load();
    }

    onClose() {
      Object.values(this.saveTimers).forEach((timer) => clearTimeout(timer));
      if (openModals.get(this.source.source_path) === this) openModals.delete(this.source.source_path);
    }

    phases() {
      if (this.data && this.data.selection && this.data.selection.phases && this.data.selection.phases.length) {
        return this.data.selection.phases;
      }
      return [{ id: "before", label: "읽기 전", question: "", questions: (this.data && this.data.selection && this.data.selection.questions) || [] }];
    }

    ensureActivePhase() {
      const list = this.phases();
      if (!list.some((phase) => phase.id === this.activePhaseId)) {
        this.activePhaseId = list[0] ? list[0].id : "before";
      }
      return list.find((phase) => phase.id === this.activePhaseId) || list[0] || null;
    }

    shell() {
      this.contentEl.empty();
      this.contentEl.addClass("prodigy-reading-guide");
      this.contentEl.createEl("style", {
        text: [
          ".prodigy-reading-guide{max-width:640px}",
          ".prodigy-reading-guide .reading-guide-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px}",
          ".prodigy-reading-guide .reading-guide-tab{flex:1 1 0;min-width:88px;min-height:40px;border-radius:8px;font-weight:700;font-size:.88em}",
          ".prodigy-reading-guide .reading-guide-tab.is-active{outline:2px solid var(--text-accent);outline-offset:0}",
          ".prodigy-reading-guide .reading-guide-meta{font-size:.8em;font-weight:700;color:var(--text-muted);margin-bottom:8px}",
          ".prodigy-reading-guide .reading-guide-body{max-height:62vh;overflow-y:auto;overscroll-behavior:contain;padding-right:2px}",
          ".prodigy-reading-guide .reading-guide-phase-title{font-weight:800;font-size:.92em;color:var(--text-accent);margin:0 0 4px}",
          ".prodigy-reading-guide .reading-guide-phase-q{font-size:.8em;color:var(--text-muted);margin:0 0 12px;line-height:1.4}",
          ".prodigy-reading-guide .reading-guide-item{padding:12px 0;border-bottom:1px solid var(--background-modifier-border)}",
          ".prodigy-reading-guide .reading-guide-question{font-size:.95em;font-weight:650;line-height:1.45;overflow-wrap:anywhere}",
          ".prodigy-reading-guide .reading-guide-hint{color:var(--text-muted);font-size:.78em;line-height:1.45;margin-top:6px}",
          ".prodigy-reading-guide .reading-guide-answer{margin-top:8px}",
          ".prodigy-reading-guide .reading-guide-answer textarea{box-sizing:border-box;width:100%;min-height:88px;max-height:180px;resize:vertical;border-radius:8px;padding:10px;font:inherit;line-height:1.45}",
          ".prodigy-reading-guide .reading-guide-button{min-height:36px;border-radius:6px}",
          ".prodigy-reading-guide .reading-guide-footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;position:sticky;bottom:0;background:var(--background-primary);padding:12px 0 6px;border-top:1px solid var(--background-modifier-border)}",
          ".prodigy-reading-guide .reading-guide-footer .reading-guide-save{flex:1 1 100%;min-height:44px;font-weight:700}",
          ".prodigy-reading-guide .reading-guide-footer-secondary{display:flex;gap:8px;flex-wrap:wrap;width:100%}",
          "@media(max-width:600px){.prodigy-reading-guide{padding-bottom:env(safe-area-inset-bottom)}.prodigy-reading-guide .reading-guide-tabs{flex-direction:column}.prodigy-reading-guide .reading-guide-tab{width:100%;min-height:44px}.prodigy-reading-guide .reading-guide-body{max-height:58vh}.prodigy-reading-guide .reading-guide-answer textarea{font-size:16px;min-height:100px}.prodigy-reading-guide .reading-guide-button{min-height:44px}.prodigy-reading-guide .reading-guide-footer-secondary{flex-direction:column}.prodigy-reading-guide .reading-guide-footer-secondary .reading-guide-button{width:100%}}",
        ].join(""),
      });
      this.contentEl.createEl("h2", { text: "독서 질답", attr: { style: "margin:0 0 4px;font-size:1.18em;" } });
      this.contentEl.createEl("div", {
        text: "단계별로 답을 쓴 뒤, 맨 아래 저장을 누르세요.",
        attr: { style: "color:var(--text-muted);font-size:.86em;margin-bottom:2px;" },
      });
      return this.contentEl;
    }

    renderTabs(parent, phases) {
      const tabs = parent.createDiv({ attr: { class: "reading-guide-tabs", role: "tablist" } });
      phases.forEach((phase) => {
        const answered = (phase.questions || []).filter((q) => String(this.answerValue(q.id) || "").trim()).length;
        const total = (phase.questions || []).length;
        const short = PHASE_TAB_LABELS[phase.id] || phase.label || phase.id;
        const label = total ? `${short} (${answered}/${total})` : short;
        const tab = button(tabs, label, phase.id === this.activePhaseId);
        tab.addClass("reading-guide-tab");
        if (phase.id === this.activePhaseId) tab.addClass("is-active");
        tab.setAttr("role", "tab");
        tab.setAttr("aria-selected", String(phase.id === this.activePhaseId));
        tab.setAttr("data-phase", phase.id);
        tab.onclick = () => {
          if (this.activePhaseId === phase.id) return;
          this.activePhaseId = phase.id;
          this.renderGuide();
        };
      });
      return tabs;
    }

    renderLoading() {
      const root = this.shell();
      root.createEl("p", {
        text: "독서 질답을 준비하고 있습니다…",
        attr: { style: "color:var(--text-muted);padding:14px 0;" },
      });
    }

    async load() {
      try {
        this.data = await loadGuide(this.app, this.source);
        this.renderGuide();
      } catch (error) {
        if (root.prodigyDebugMode === true) console.error(error);
        if (error && error.code === "SOURCE_UNAVAILABLE") this.renderNoSource();
        else this.renderUnavailable();
      }
    }

    answerValue(questionId) {
      if (Object.prototype.hasOwnProperty.call(this.answerBuffers, questionId)) {
        return this.answerBuffers[questionId];
      }
      return (this.data.state.drafts && this.data.state.drafts[questionId]) || "";
    }

    async saveDraft(questionId, value, silent = true) {
      const clean = String(value || "").trim();
      if (clean) this.data.state.drafts[questionId] = clean;
      else delete this.data.state.drafts[questionId];
      this.data.state.updated_at = new Date().toISOString();
      await this.data.store.write(this.data.id, this.data.state);
      if (!silent) notice("임시 답을 저장했습니다.");
    }

    queueDraft(questionId, value) {
      this.answerBuffers[questionId] = value;
      if (this.saveTimers[questionId]) clearTimeout(this.saveTimers[questionId]);
      this.saveTimers[questionId] = setTimeout(() => {
        this.saveDraft(questionId, value, true).catch((error) => {
          if (root.prodigyDebugMode === true) console.error(error);
        });
      }, 450);
    }

    collectAnswers() {
      const map = new Map();
      const questions = (this.data.selection && this.data.selection.questions) || [];
      questions.forEach((question) => {
        const value = String(this.answerValue(question.id) || "").trim();
        if (value) map.set(question.id, { question, value });
      });
      return map;
    }

    async saveAllToObject() {
      // Flush pending debounced drafts first
      Object.keys(this.saveTimers).forEach((id) => {
        clearTimeout(this.saveTimers[id]);
        delete this.saveTimers[id];
      });
      const answers = this.collectAnswers();
      if (!answers.size) {
        notice("저장할 답이 없습니다. 질문을 먼저 작성하세요.");
        return;
      }
      try {
        for (const { question, value } of answers.values()) {
          await this.saveDraft(question.id, value, true);
          await saveNoteToObject(this.app, this.source, question, value);
        }
        notice(`${answers.size}개 답을 Reading Object에 저장했습니다.`);
        this.renderGuide();
      } catch (error) {
        if (root.prodigyDebugMode === true) console.error(error);
        notice("저장에 실패했습니다.");
      }
    }

    renderGuide() {
      const root = this.shell();
      root.createEl("div", {
        text: `전략 · ${strategyLabel(this.data.selection)}`,
        attr: { class: "reading-guide-meta" },
      });

      const phases = this.phases();
      const active = this.ensureActivePhase();
      this.renderTabs(root, phases);

      const body = root.createDiv({ attr: { class: "reading-guide-body", role: "tabpanel" } });
      if (!active) {
        body.createEl("p", { text: "표시할 질문이 없습니다.", attr: { style: "color:var(--text-muted);" } });
      } else {
        body.createEl("div", {
          text: active.label || PHASE_TAB_LABELS[active.id] || active.id,
          attr: { class: "reading-guide-phase-title" },
        });
        if (active.question) {
          body.createEl("div", { text: active.question, attr: { class: "reading-guide-phase-q" } });
        }
        (active.questions || []).forEach((question) => this.renderQuestion(body, question));
      }

      const footer = root.createDiv({ attr: { class: "reading-guide-footer" } });
      const saveBtn = button(footer, "노트에 저장", true);
      saveBtn.addClass("reading-guide-save");
      saveBtn.onclick = () => this.saveAllToObject();
     const secondary = footer.createDiv({ attr: { class: "reading-guide-footer-secondary" } });
     const refineBtn = button(secondary, "AI로 질문 다듬기");
      refineBtn.onclick = () => { refineBtn.disabled = true; refineBtn.textContent = "정교화 중…"; this.requestRefinement().finally(() => { refineBtn.disabled = false; refineBtn.textContent = "AI로 질문 다듬기"; }); };
      if (this._originalQuestions) {
        const restoreBtn = button(secondary, "기본 질문으로 되돌리기");
        restoreBtn.onclick = () => { this.data.selection.phases.forEach((phase) => { if (phase.id === this.activePhaseId && this._originalQuestions[phase.id]) { phase.questions = JSON.parse(JSON.stringify(this._originalQuestions[phase.id])); } }); this.persistSelection().catch(() => {}); this.renderGuide(); notice("기본 질문으로 되돌렸습니다."); };
      }
      button(secondary, "책 열기").onclick = async () => {
        if (await openBook(this.app, this.source)) this.close();
      };
      button(secondary, "임시 답 초기화").onclick = () => this.requestReset();
      button(secondary, "닫기").onclick = () => this.close();
    }

    renderQuestion(parent, question) {
      const item = parent.createDiv({ attr: { class: "reading-guide-item", "data-id": question.id } });
      item.createEl("div", { text: question.label, attr: { class: "reading-guide-question" } });
      if (question.hint) {
        item.createEl("div", { text: question.hint, attr: { class: "reading-guide-hint" } });
      }

      const answer = item.createDiv({ attr: { class: "reading-guide-answer" } });
      const input = answer.createEl("textarea", {
        attr: {
          placeholder: "이 질문에 대한 생각을 바로 적으세요.",
          "aria-label": `${question.label} 답변`,
        },
      });
      input.value = this.answerValue(question.id);
      input.oninput = () => this.queueDraft(question.id, input.value);
      input.onblur = () => {
        this.saveDraft(question.id, input.value, true).catch((error) => {
          if (root.prodigyDebugMode === true) console.error(error);
        });
      };
    }

    async persistSelection() {
      // Sync any buffered answers so a concurrent draft write is not clobbered.
      Object.keys(this.answerBuffers).forEach((questionId) => {
        const value = String(this.answerBuffers[questionId] || "").trim();
        if (value) this.data.state.drafts[questionId] = value;
        else delete this.data.state.drafts[questionId];
      });
      const questions = {};
      this.data.selection.phases.forEach((phase) => {
        questions[phase.id] = (phase.questions || []).map((q) => ({
          id: q.id,
          label: q.label,
          hint: q.hint || "",
          kind: q.kind || "",
          phase: q.phase || phase.id,
          layer: q.layer || "common",
          reason: q.reason || "",
          memory_refs: Array.isArray(q.memory_refs) ? q.memory_refs.slice(0, 3) : [],
        }));
      });
      this.data.state.questions = questions;
      this.data.state.updated_at = new Date().toISOString();
      await this.data.store.write(this.data.id, this.data.state);
    }

    async requestRefinement() {
      if (!root.ReadingQuestionAI || typeof root.ReadingQuestionAI.refineQuestions !== "function") {
        notice("Reading Question AI 모듈이 로드되지 않았습니다.");
        return;
      }
      const active = this.ensureActivePhase();
      if (!active || !active.questions || !active.questions.length) {
        notice("현재 단계에 질문이 없습니다.");
        return;
      }
      const memoryContext = [];
      if (root.ReadingMemoryView && typeof root.ReadingMemoryView.loadForSource === "function") {
        try {
          const result = await root.ReadingMemoryView.loadForSource(this.source.source_path);
          (result.candidates || []).slice(0, 3).forEach(function (c) {
            memoryContext.push({ title: c.title, relation: (c.relation_labels || []).join(", "), evidence: c.evidence_line || "" });
          });
        } catch (_e) { /* memory unavailable is ok */ }
      }
     notice("AI가 질문을 정교화하고 있습니다…");
      if (!this._originalQuestions) this._originalQuestions = {};
      if (!this._originalQuestions[this.activePhaseId]) {
        this._originalQuestions[this.activePhaseId] = JSON.parse(JSON.stringify(active.questions));
      }
      try {
        const result = await root.ReadingQuestionAI.refineQuestions({
          app: this.app,
          title: this.source.title || this.source.book_title || "",
          author: this.source.author || "",
          bookType: (this.data && this.data.selection && this.data.selection.type) || "universal",
          phase: this.activePhaseId || "before",
          deterministicQuestions: active.questions,
          memoryContext: memoryContext
        });
        this.data.selection.phases.forEach(function (phase) {
          if (phase.id === this.activePhaseId) {
            phase.questions = result.questions.filter(function (q) { return q.phase === this.activePhaseId; }.bind(this));
            if (!phase.questions.length) phase.questions = result.questions;
          }
        }.bind(this));
        await this.persistSelection();
        notice("AI 질문 초안이 적용되었습니다. 검토 후 저장하세요.");
        this.renderGuide();
      } catch (error) {
        notice("질문 정교화 실패: " + (error.message || error) + " — 기본 질문이 유지됩니다.");
      }
    }

    requestReset() {
      const hasDrafts = Object.keys(this.data.state.drafts || {}).length > 0
        || Object.values(this.answerBuffers).some((value) => String(value || "").trim());
      const reset = async () => {
        Object.values(this.saveTimers).forEach((timer) => clearTimeout(timer));
        this.saveTimers = {};
        this.answerBuffers = {};
        await this.data.store.remove(this.data.id);
        const refinedQuestions = this.data.state.questions || {};
        this.data.state = modules().store.createState(this.source, this.data.selection);
        this.data.state.questions = refinedQuestions;
        this.renderGuide();
      };
      if (!hasDrafts) return reset();
      new ResetAnswersModal(this.app, reset).open();
    }

    renderNoSource() {
      this.shell().createEl("p", { text: "책 정보를 확인할 수 없습니다." });
    }

    renderUnavailable() {
      const root = this.shell();
      root.createEl("p", { text: "독서 질답을 불러오지 못했습니다." });
      const retry = button(root, "다시 시도", true);
      retry.onclick = () => {
        this.renderLoading();
        this.loadPromise = this.load();
        return this.loadPromise;
      };
    }
  }

  function createModal(app, source) {
    return new ReadingGuideModal(app, source);
  }

  function openForSource(app, source) {
    const path = sourcePath(source);
    if (openModals.has(path)) return openModals.get(path);
    const modal = createModal(app, source);
    openModals.set(path, modal);
    modal.open();
    return modal;
  }

  const api = { createModal, loadGuide, openBook, openForSource, saveNoteToObject };
  root.ReadingChecklistView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
