(function (root) {
  "use strict";

  function formRenderer() {
    if (!root.KnowledgeSourceAuthoringForm && typeof require === "function") root.KnowledgeSourceAuthoringForm = require("./knowledge-source-authoring-form.js");
    if (!root.KnowledgeSourceAuthoringForm) throw new Error("Knowledge source authoring form을 먼저 불러와야 합니다.");
    return root.KnowledgeSourceAuthoringForm;
  }

  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function list(value) { return Array.isArray(value) ? value.filter((item) => text(item)) : []; }
  function sourceKindSet() { return new Set(formRenderer().SOURCE_KINDS.map((item) => item.value)); }

  function draftFrom(value, aiSummary) {
    const supplied = value && typeof value === "object" ? value : {};
    const ai = aiSummary && typeof aiSummary === "object"
      ? aiSummary
      : text(supplied.ai_summary) ? { summary: supplied.ai_summary, uncertainty: supplied.ai_uncertainty } : null;
    const kind = sourceKindSet().has(supplied.source_kind) ? supplied.source_kind : "article";
    return {
      source_kind: kind, source_url: text(supplied.source_url), source_title: text(supplied.source_title),
      creator: text(supplied.creator), publisher: text(supplied.publisher), published_at: text(supplied.published_at),
      source_claim: text(supplied.source_claim), my_interpretation: text(supplied.my_interpretation),
      reusable_knowledge: text(supplied.reusable_knowledge), knowledge_domain: text(supplied.knowledge_domain),
      knowledge_topics: list(supplied.knowledge_topics), application_trigger: text(supplied.application_trigger),
      application_contexts: list(supplied.application_contexts), create_candidate: supplied.create_candidate === true,
      ai_summary: ai ? text(supplied.ai_summary || ai.summary) : "", ai_uncertainty: ai ? text(supplied.ai_uncertainty || ai.uncertainty) : "",
      has_ai_summary: Boolean(ai),
    };
  }

  function requiredCore(options) {
    const core = options && options.authoringCore;
    if (!core || typeof core.normalizeSourceInput !== "function" || typeof core.normalizeStudyMaterialCandidate !== "function") {
      throw new Error("Knowledge authoring core 주입이 필요합니다.");
    }
    return core;
  }

  function sourceInput(draft) {
    return {
      source_kind: draft.source_kind, source_url: draft.source_url, source_title: draft.source_title,
      creator: draft.creator, publisher: draft.publisher, published_at: draft.published_at,
      source_claim: draft.source_claim, my_interpretation: draft.my_interpretation,
      reusable_knowledge: draft.reusable_knowledge, knowledge_domain: draft.knowledge_domain,
      knowledge_topics: draft.knowledge_topics, application_trigger: draft.application_trigger,
      application_contexts: draft.application_contexts, summary_origin: draft.has_ai_summary ? "ai" : "manual",
      ...(draft.has_ai_summary ? { ai_summary: draft.ai_summary, ai_uncertainty: draft.ai_uncertainty } : {}),
    };
  }

  function candidateInput(source, sourceLink) {
    return {
      title: source.source_title, statement: source.reusable_knowledge || source.my_interpretation,
      reason: source.source_claim || "자료를 읽고 사람이 해석한 내용입니다.", source_type: "study_material",
      source_evidence_ids: [], source_objects: [sourceLink], source_note: `단일 자료: ${source.source_title}`,
      application_trigger: source.application_trigger, application_contexts: source.application_contexts,
      confidence: "explicit", suggested_domain: source.knowledge_domain, suggested_topics: source.knowledge_topics,
    };
  }

  function createSourceAuthoringController(options, onChange) {
    const config = options || {};
    const emit = typeof onChange === "function" ? onChange : () => {};
    const core = requiredCore(config);
    let draft = { ...draftFrom(config.initialDraft, config.aiSummary) };
    let phase = "editing";
    let source = null;
    let candidate = null;
    let error = "";
    let pending = false;
    let closed = false;
    let epoch = 0;
    let lastCandidate = null;

    function state() {
      return Object.freeze({ draft: { ...draft, knowledge_topics: draft.knowledge_topics.slice(), application_contexts: draft.application_contexts.slice() }, phase, source, candidate, error, pending, closed });
    }
    function report() { emit(state()); }
    function update(patch) {
      if (closed || pending || !patch || typeof patch !== "object") return state();
      const next = { ...draft, ...patch };
      if (!sourceKindSet().has(next.source_kind)) next.source_kind = draft.source_kind;
      next.knowledge_topics = list(next.knowledge_topics);
      next.application_contexts = list(next.application_contexts);
      next.create_candidate = next.create_candidate === true;
      draft = next;
      error = "";
      report();
      return state();
    }
    function cancel() {
      epoch += 1;
      closed = true;
      pending = false;
      report();
      return state();
    }
    async function createSavedCandidate(token) {
      if (!source || typeof config.createCandidate !== "function") return false;
      phase = "candidate_pending";
      pending = true;
      error = "";
      report();
      try {
        const normalizedCandidate = core.normalizeStudyMaterialCandidate(candidateInput(source.input, source.link));
        lastCandidate = normalizedCandidate;
        const saved = await config.createCandidate(normalizedCandidate);
        if (closed || token !== epoch) return false;
        candidate = saved || normalizedCandidate;
        phase = "complete";
        return true;
      } catch (_error) {
        if (closed || token !== epoch) return false;
        phase = "source_saved_candidate_error";
        error = "후보를 만들지 못했습니다. 저장된 자료는 유지됩니다. 다시 시도해 주세요.";
        return false;
      } finally {
        if (!closed && token === epoch) {
          pending = false;
          report();
        }
      }
    }
    async function submit() {
      if (closed || pending || source) return false;
      let normalized;
      try {
        normalized = core.normalizeSourceInput(sourceInput(draft));
      } catch (caught) {
        error = caught && caught.message ? caught.message : "입력 내용을 확인해 주세요.";
        phase = "editing";
        report();
        return false;
      }
      const store = config.sourceStore;
      if (!store || typeof store.saveSource !== "function") {
        error = "자료 저장소를 사용할 수 없습니다. 입력 내용은 유지됩니다.";
        report();
        return false;
      }
      const token = epoch;
      phase = "source_pending";
      pending = true;
      error = "";
      report();
      try {
        const saved = await store.saveSource(config.app, normalized);
        if (closed || token !== epoch) return false;
        if (!saved || !text(saved.link)) throw new Error("자료 저장 결과에 링크가 없습니다.");
        source = Object.freeze({
          ...saved,
          input: Object.freeze({ ...normalized, application_trigger: draft.application_trigger, application_contexts: draft.application_contexts.slice() }),
        });
        phase = "source_saved";
        pending = false;
        report();
        return draft.create_candidate ? createSavedCandidate(token) : true;
      } catch (_error) {
        if (closed || token !== epoch) return false;
        phase = "editing";
        error = "자료를 저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.";
        pending = false;
        report();
        return false;
      }
    }
    async function retryCandidate() {
      if (closed || pending || !source || (!lastCandidate && !draft.create_candidate)) return false;
      return createSavedCandidate(epoch);
    }
    return Object.freeze({ state, update, submit, retryCandidate, cancel });
  }

  function renderSourceAuthoringForm(parent, controller, options) {
    return formRenderer().renderSourceAuthoringForm(parent, controller, options);
  }

  function openSourceAuthoringModal(app, options) {
    const ModalBase = root.obsidian && root.obsidian.Modal;
    if (!ModalBase) return null;
    const config = options || {};
    class SourceAuthoringModal extends ModalBase {
      constructor() {
        super(app);
        this.controller = createSourceAuthoringController({ ...config, app }, () => this.render(false));
      }
      onOpen() { this.render(true); }
      onClose() { this.controller.cancel(); this.contentEl.empty(); }
      render(focusFirst) { this.contentEl.empty(); renderSourceAuthoringForm(this.contentEl, this.controller, { focusFirst }); }
    }
    const modal = new SourceAuthoringModal();
    modal.open();
    return modal;
  }

  const form = formRenderer();
  const api = Object.freeze({ SOURCE_KINDS: form.SOURCE_KINDS, sourceKindFields: form.sourceKindFields, createSourceAuthoringController, renderSourceAuthoringForm, openSourceAuthoringModal });
  root.KnowledgeSourceAuthoringView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
