(function (root) {
  "use strict";

  const SUPPORTED_KINDS = Object.freeze([
    Object.freeze({ value: "article", label: "기사" }),
    Object.freeze({ value: "column", label: "칼럼" }),
  ]);
  const ROW_FIELDS = new Set([
    "source_title", "creator", "publisher", "published_at", "fallback_text", "ai_summary", "ai_uncertainty",
    "my_interpretation", "reusable_knowledge", "knowledge_domain", "application_trigger",
  ]);

  function clean(value) { return typeof value === "string" ? value.trim().normalize("NFC") : ""; }
  function stringList(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
    return [...new Set(raw.map(clean).filter(Boolean))];
  }
  function sourceCore(options) {
    const core = options && options.authoringCore;
    if (!core || typeof core.normalizeSourceBatch !== "function" || typeof core.normalizeSourceInput !== "function" || typeof core.normalizeStudyMaterialCandidate !== "function") {
      throw new Error("Knowledge authoring core 주입이 필요합니다.");
    }
    return core;
  }
  function rowState(row) {
    const safe = { ...row };
    delete safe._savedInput;
    delete safe._transient;
    safe.knowledge_topics = Array.isArray(row.knowledge_topics) ? row.knowledge_topics.slice() : [];
    safe.application_contexts = Array.isArray(row.application_contexts) ? row.application_contexts.slice() : [];
    if (row.source) safe.source = { ...row.source };
    if (row.candidate) safe.candidate = { ...row.candidate };
    return safe;
  }
  function rowReady(row) { return Boolean(clean(row._transient) || clean(row.fallback_text)); }
  function friendlyError(error, fallback) {
    const message = clean(error && error.message);
    return message && message.length < 180 ? message : fallback;
  }
  function candidateInput(source, sourceLink) {
    return {
      title: source.source_title,
      statement: source.reusable_knowledge || source.my_interpretation,
      reason: source.my_interpretation,
      source_type: "study_material",
      source_evidence_ids: [],
      source_objects: [sourceLink],
      source_note: `오늘의 자료 묶음: ${source.source_title}`,
      application_trigger: source.application_trigger,
      application_contexts: source.application_contexts,
      confidence: "explicit",
      suggested_domain: source.knowledge_domain,
      suggested_topics: source.knowledge_topics,
    };
  }
  function createBatchSession(options, onChange) {
    const config = options || {};
    const initial = config.initialValues && typeof config.initialValues === "object" ? config.initialValues : {};
    let notify = typeof onChange === "function" ? onChange : () => {};
    const data = {
      values: {
        urls_text: String(initial.urls_text || ""), source_kind: initial.source_kind === "column" ? "column" : "article",
        knowledge_domain: clean(initial.knowledge_domain), knowledge_topics: stringList(initial.knowledge_topics),
        application_trigger: clean(initial.application_trigger), application_contexts: stringList(initial.application_contexts),
      },
      rows: [], batchId: "", prepared: null, urlRevision: 0, error: "", message: "", closed: false,
      operation: "idle", activeController: null, epoch: 0, aiRequested: false, saving: false,
    };
    const core = sourceCore(config);
    function hasPendingRow() { return data.rows.some((row) => row.pending); }
    function canSummarize() {
      return !data.closed && data.operation === "idle" && !data.saving && !hasPendingRow() && !data.aiRequested
        && data.rows.length > 0 && data.rows.every(rowReady);
    }
    function state() {
      return Object.freeze({
        values: { ...data.values, knowledge_topics: data.values.knowledge_topics.slice(), application_contexts: data.values.application_contexts.slice() },
        rows: data.rows.map(rowState), batch_id: data.batchId, error: data.error, message: data.message,
        closed: data.closed, operation: data.operation, saving: data.saving, can_summarize: canSummarize(), ai_requested: data.aiRequested,
      });
    }
    function report() { notify(state()); }
    function invalidatePrepared(message) {
      data.rows = [];
      data.batchId = "";
      data.prepared = null;
      data.aiRequested = false;
      data.message = message;
    }
    function setValues(patch) {
      if (data.closed || data.operation !== "idle" || data.saving || !patch || typeof patch !== "object") return state();
      const next = { ...data.values, ...patch };
      next.urls_text = String(next.urls_text || "");
      next.source_kind = next.source_kind === "column" ? "column" : "article";
      next.knowledge_topics = stringList(next.knowledge_topics);
      next.application_contexts = stringList(next.application_contexts);
      const sourceIdentityChanged = next.urls_text !== data.values.urls_text || next.source_kind !== data.values.source_kind;
      data.values = next;
      if (sourceIdentityChanged) {
        data.urlRevision += 1;
        invalidatePrepared("URL 목록이 변경되었습니다. 자료 목록을 다시 확인해 주세요.");
      } else {
        data.message = "";
      }
      data.error = "";
      report();
      return state();
    }
    function prepare() {
      if (data.closed || data.operation !== "idle" || data.saving) return false;
      const urls = data.values.urls_text.split(/\r?\n/).map(clean).filter(Boolean);
      if (urls.length < 1 || urls.length > 20) {
        data.error = "자료 URL은 한 줄에 하나씩 1개 이상 20개 이하로 입력해 주세요.";
        report();
        return false;
      }
      if (new Set(urls).size !== urls.length) {
        data.error = "같은 URL은 한 번만 입력해 주세요.";
        report();
        return false;
      }
      let normalized;
      try {
        normalized = core.normalizeSourceBatch({ items: urls.map((source_url) => ({ source_url, source_kind: data.values.source_kind })) });
      } catch (error) {
        data.error = friendlyError(error, "유효한 HTTP(S) URL을 입력해 주세요.");
        report();
        return false;
      }
      const prior = new Map(data.rows.map((row) => [row.source_url, row]));
      data.batchId = normalized.source_batch_id;
      data.prepared = Object.freeze({ revision: data.urlRevision, token: normalized.items.map((item) => `${item.source_kind}|${item.source_url}`).join("\n") });
      data.rows = normalized.items.map((item) => createRow(item, prior.get(item.source_url), data.values));
      data.aiRequested = data.rows.some((row) => Boolean(row.ai_summary));
      data.error = "";
      data.message = "자료 목록을 확인했습니다. ‘기사 가져오기’를 눌러 공개 기사만 가져오세요.";
      report();
      return true;
    }
    function createRow(item, before, values) {
      return {
        item_id: item.item_id, source_url: item.source_url, source_kind: item.source_kind, status: before && before.source ? before.status : "queued",
        source_title: before ? before.source_title : "", creator: before ? before.creator : "", publisher: before ? before.publisher : "", published_at: before ? before.published_at : "",
        fallback_text: before ? before.fallback_text : "", ai_summary: before ? before.ai_summary : "", ai_uncertainty: before ? before.ai_uncertainty : "",
        my_interpretation: before ? before.my_interpretation : "", reusable_knowledge: before ? before.reusable_knowledge : "",
        knowledge_domain: before ? before.knowledge_domain : values.knowledge_domain, knowledge_topics: before ? before.knowledge_topics.slice() : values.knowledge_topics.slice(),
        application_trigger: before ? before.application_trigger : values.application_trigger, application_contexts: before ? before.application_contexts.slice() : values.application_contexts.slice(),
        selected: before ? before.selected : true, create_candidate: before ? before.create_candidate : false, include_reusable: before ? before.include_reusable : Boolean(before && before.reusable_knowledge),
        source: before ? before.source : null, candidate: before ? before.candidate : null, candidate_error: before ? before.candidate_error : "", row_error: "", pending: false,
        _transient: before ? before._transient : "", _savedInput: before ? before._savedInput : null,
      };
    }
    function currentPreparedToken() { return data.rows.map((row) => `${row.source_kind}|${row.source_url}`).join("\n"); }
    function isPreparedCurrent() {
      return Boolean(data.prepared && data.prepared.revision === data.urlRevision && data.rows.length && data.prepared.token === currentPreparedToken());
    }
    function updateRow(itemId, patch) {
      if (data.closed || data.operation !== "idle" || data.saving || !patch || typeof patch !== "object") return state();
      const row = data.rows.find((item) => item.item_id === itemId);
      if (!row || row.pending || row.source) return state();
      Object.entries(patch).forEach(([key, value]) => {
        if (ROW_FIELDS.has(key)) row[key] = clean(value);
        if (key === "knowledge_topics") row.knowledge_topics = stringList(value);
        if (key === "application_contexts") row.application_contexts = stringList(value);
        if (key === "selected" || key === "create_candidate" || key === "include_reusable") row[key] = value === true;
      });
      row.row_error = "";
      data.error = "";
      report();
      return state();
    }
    function subscribe(listener) { notify = typeof listener === "function" ? listener : () => {}; return () => { notify = () => {}; }; }
    return Object.freeze({ config, core, data, state, report, setValues, prepare, updateRow, canSummarize, isPreparedCurrent, subscribe });
  }

  const api = Object.freeze({ SUPPORTED_KINDS, clean, stringList, rowReady, rowState, friendlyError, candidateInput, createBatchSession });
  root.KnowledgeSourceBatchState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
