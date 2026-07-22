(function (root) {
  "use strict";

  if (typeof require === "function" && !root.KnowledgeSourceBatchState) root.KnowledgeSourceBatchState = require("./knowledge-source-batch-state.js");
  const State = root.KnowledgeSourceBatchState;

  function createSourceBatchController(options, onChange) {
    if (!State) throw new Error("자료 묶음 상태 모듈이 필요합니다.");
    const session = State.createBatchSession(options, onChange);
    const { config, core, data } = session;
    function stopCurrent(markCancelled) {
      const wasSummarizing = data.operation === "summarizing";
      data.epoch += 1;
      if (data.activeController) data.activeController.abort();
      data.activeController = null;
      if (config.batchService && typeof config.batchService.cancelCurrent === "function") config.batchService.cancelCurrent();
      if (!markCancelled) return;
      if (wasSummarizing) data.aiRequested = false;
      data.rows.forEach((row) => { if (row.status === "queued" || row.status === "retrieving") row.status = "cancelled"; });
      data.operation = "idle";
      data.message = "요청을 취소했습니다. 입력한 내용은 유지됩니다.";
    }
    async function retrieve() {
      if (data.closed || data.operation !== "idle" || data.saving || !session.isPreparedCurrent()) return false;
      const service = config.retrievalService;
      if (!service || typeof service.retrieveArticle !== "function") return fail("기사 가져오기 서비스를 사용할 수 없습니다. 사용자 텍스트 또는 메모를 입력해 주세요.");
      const token = ++data.epoch;
      data.activeController = new AbortController();
      data.operation = "retrieving";
      data.error = "";
      data.message = "공개 기사만 가져오는 중입니다. 로그인·유료벽·동영상은 사용자 메모가 필요합니다.";
      data.rows.forEach((row) => { if (!row.source && !State.rowReady(row)) { row.status = "retrieving"; row.pending = true; } });
      session.report();
      for (const row of data.rows) {
        if (isStale(token)) break;
        if (row.source || State.rowReady(row)) { row.pending = false; continue; }
        await retrieveRow(row, service, token);
        if (!isStale(token)) session.report();
      }
      if (isStale(token)) return false;
      data.activeController = null;
      data.operation = "idle";
      data.message = data.rows.every(State.rowReady) ? "AI 요약을 만들 수 있습니다. 저장 전에는 각 자료의 내 한 줄을 작성해 주세요." : "사용자 텍스트 또는 메모가 필요한 자료가 있습니다.";
      session.report();
      return true;
    }
    async function retrieveRow(row, service, token) {
      let transient = "";
      let metadata = {};
      try {
        const result = await service.retrieveArticle({ item_id: row.item_id, url: row.source_url, source_url: row.source_url, source_kind: row.source_kind }, {
          signal: data.activeController.signal,
          onRetrieved(text, details) { transient = State.clean(text); metadata = details && typeof details === "object" ? details : {}; },
        });
        if (isStale(token)) return;
        if (result && result.status === "retrieved" && transient) {
          row._transient = transient;
          row.status = "retrieved";
          row.source_title = row.source_title || State.clean(result.title) || State.clean(metadata.title);
          row.creator = row.creator || State.clean(result.creator) || State.clean(metadata.creator);
          row.publisher = row.publisher || State.clean(result.publisher) || State.clean(metadata.publisher);
          row.published_at = row.published_at || State.clean(result.date) || State.clean(metadata.date);
        } else {
          row.status = "fallback";
          row.row_error = "공개 기사 본문을 가져오지 못했습니다. 사용자 텍스트 또는 메모를 입력해 주세요.";
        }
      } catch (error) {
        if (!isStale(token)) {
          row.status = "error";
          row.row_error = "기사 가져오기에 실패했습니다. 사용자 텍스트 또는 메모를 입력해 주세요.";
        }
      } finally { row.pending = false; }
    }
    async function summarize() {
      if (!session.canSummarize()) return false;
      const service = config.batchService;
      if (!service || typeof service.summarizeSuppliedText !== "function") return fail("AI 요약 서비스를 사용할 수 없습니다. 입력 내용은 유지됩니다.");
      const items = data.rows.map((row) => ({ item_id: row.item_id, text_origin: row._transient ? "explicit_retrieval" : "typed_fallback", text: row._transient || row.fallback_text }));
      const token = ++data.epoch;
      data.activeController = new AbortController();
      data.operation = "summarizing";
      data.aiRequested = true;
      data.error = "";
      data.message = "AI 요약을 만드는 중입니다. 자료별 요약과 불확실성은 저장 전에 고칠 수 있습니다.";
      session.report();
      let result;
      try { result = await service.summarizeSuppliedText(items, { app: config.app, signal: data.activeController.signal, requestTag: data.batchId }); }
      catch (error) { result = null; }
      if (isStale(token)) return false;
      data.activeController = null;
      data.operation = "idle";
      if (!result || result.status !== "ai" || !Array.isArray(result.items)) return aiFailure("AI 요약을 완료하지 못했습니다. 사용자 텍스트와 내 한 줄은 유지됩니다.");
      const summaries = new Map(result.items.filter((item) => item && typeof item === "object").map((item) => [State.clean(item.item_id), item]));
      if (summaries.size !== data.rows.length || data.rows.some((row) => !summaries.has(row.item_id))) return aiFailure("AI 응답 항목을 확인하지 못했습니다. 사용자 입력은 유지됩니다.");
      data.rows.forEach((row) => {
        const summary = summaries.get(row.item_id);
        row.ai_summary = State.clean(summary.summary);
        row.ai_uncertainty = State.stringList(summary.uncertainties).join(" · ");
      });
      data.message = "AI 요약은 보조 참고입니다. 각 자료의 내 한 줄을 확인한 뒤 저장하세요.";
      session.report();
      return true;
    }
    function sourceInput(row) {
      return {
        source_kind: row.source_kind, source_batch_id: data.batchId, source_url: row.source_url, source_title: row.source_title, creator: row.creator, publisher: row.publisher, published_at: row.published_at,
        source_claim: "", my_interpretation: row.my_interpretation, reusable_knowledge: row.include_reusable ? row.reusable_knowledge : "", knowledge_domain: row.knowledge_domain, knowledge_topics: row.knowledge_topics,
        application_trigger: row.application_trigger, application_contexts: row.application_contexts, summary_origin: row.ai_summary ? "ai" : "manual", ai_summary: row.ai_summary, ai_uncertainty: row.ai_uncertainty,
      };
    }
    async function saveCandidateFor(row) {
      if (!row.source || !row.create_candidate || row.candidate || typeof config.createCandidate !== "function") return true;
      const candidate = core.normalizeStudyMaterialCandidate(State.candidateInput(row._savedInput, row.source.link));
      row.pending = true;
      session.report();
      try {
        row.candidate = await config.createCandidate(candidate);
        row.candidate_error = "";
        return true;
      } catch (error) {
        row.candidate_error = "후보를 만들지 못했습니다. 저장된 자료는 유지됩니다. 다시 시도해 주세요.";
        return false;
      } finally { row.pending = false; session.report(); }
    }
    async function saveRow(row) {
      if (!row || row.pending || !row.selected) return true;
      if (!row.source) {
        let normalized;
        try { normalized = core.normalizeSourceInput(sourceInput(row)); }
        catch (error) { row.row_error = State.friendlyError(error, "자료 입력을 확인해 주세요."); session.report(); return false; }
        if (!config.sourceStore || typeof config.sourceStore.saveSource !== "function") { row.row_error = "자료 저장소를 사용할 수 없습니다. 입력 내용은 유지됩니다."; session.report(); return false; }
        row.pending = true;
        session.report();
        try {
          const saved = await config.sourceStore.saveSource(config.app, normalized);
          if (!saved || !State.clean(saved.link)) throw new Error("자료 저장 결과에 링크가 없습니다.");
          row.source = { ...saved, status: "saved" };
          row._savedInput = normalized;
          row.row_error = "";
        } catch (error) {
          row.row_error = "자료를 저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.";
          return false;
        } finally { row.pending = false; session.report(); }
      }
      return saveCandidateFor(row);
    }
    async function saveSelected() {
      if (data.closed || data.saving || data.operation !== "idle") return false;
      const selected = data.rows.filter((row) => row.selected);
      if (!selected.length) return fail("저장할 자료를 하나 이상 선택해 주세요.");
      data.saving = true;
      data.error = "";
      session.report();
      let complete = true;
      try { for (const row of selected) { if (!await saveRow(row)) complete = false; } }
      finally {
        data.saving = false;
        data.message = complete ? "선택한 자료를 저장했습니다. 후보는 선택한 자료에만 별도로 만들었습니다." : "일부 자료를 저장하지 못했습니다. 성공한 자료는 유지되며 실패한 행만 다시 시도할 수 있습니다.";
        session.report();
      }
      return complete;
    }
    async function retryCandidate(itemId) {
      if (data.closed || data.saving || data.operation !== "idle") return false;
      const row = data.rows.find((item) => item.item_id === itemId);
      if (!row || !row.source || !row.create_candidate || row.candidate) return false;
      data.saving = true;
      session.report();
      try { return await saveCandidateFor(row); }
      finally { data.saving = false; session.report(); }
    }
    function isStale(token) { return token !== data.epoch || data.closed || !data.activeController || data.activeController.signal.aborted; }
    function fail(message) { data.error = message; session.report(); return false; }
    function aiFailure(message) { data.aiRequested = false; return fail(message); }
    function cancelActive() { if (data.closed || data.operation === "idle") return false; stopCurrent(true); session.report(); return true; }
    function close() { if (data.closed) return false; stopCurrent(true); data.closed = true; session.report(); return true; }
    function rows() { return data.rows.map(State.rowState); }
    return Object.freeze({ state: session.state, rows, setValues: session.setValues, prepare: session.prepare, updateRow: session.updateRow, retrieve, summarize, saveSelected, retryCandidate, cancelActive, close, canSummarize: session.canSummarize, subscribe: session.subscribe });
  }

  const api = Object.freeze({ createSourceBatchController });
  root.KnowledgeSourceBatchController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
