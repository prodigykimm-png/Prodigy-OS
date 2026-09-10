(function (root) {
  "use strict";

  const MODE_LABELS = Object.freeze({ verified: "적용한 문서", literature: "문헌 자료", pending: "검토 대기", all: "기타 자료" });
  let wikiUI = root.ProdigyWikiWorkspaceView || (typeof require === "function" ? require("./prodigy-wiki-workspace-view.js") : null);
  const TRUST_LABELS = Object.freeze({ verified: "검증됨", legacy_verified: "레거시 검증됨", literature: "문헌", pending: "검토 대기" });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function empty(element) {
    if (!element) return;
    if (typeof element.empty === "function") element.empty();
    else while (element.firstChild) element.removeChild(element.firstChild);
  }
  function createEl(parent, tag, options) {
    if (!parent) return null;
    const config = options || {};
    if (typeof parent.createEl === "function") return parent.createEl(tag, config);
    const doc = parent.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc) return null;
    const element = doc.createElement(tag);
    if (config.text !== undefined) element.textContent = String(config.text);
    Object.entries(config.attr || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) element.setAttribute(key, String(value));
    });
    if (config.disabled) element.disabled = true;
    parent.appendChild(element);
    return element;
  }
  function setAttr(element, key, value) {
    if (!element) return;
    if (typeof element.setAttr === "function") element.setAttr(key, value);
    else if (typeof element.setAttribute === "function") element.setAttribute(key, String(value));
    else { element.attr = element.attr || {}; element.attr[key] = value; }
  }
  function removeAttr(element, key) {
    if (!element) return;
    if (typeof element.removeAttribute === "function") element.removeAttribute(key);
    else if (element.attr) delete element.attr[key];
  }
  function addClass(element, name) {
    if (!element || !name) return;
    if (typeof element.addClass === "function") element.addClass(name);
    else if (element.classList && typeof element.classList.add === "function") element.classList.add(name);
    else {
      const current = typeof element.getAttribute === "function" ? element.getAttribute("class") : element.attributes && element.attributes.class;
      setAttr(element, "class", `${current || ""} ${name}`.trim());
    }
  }
  function focus(element) { if (element && typeof element.focus === "function") element.focus(); }
  function safeRows(value) { return list(value).filter((row) => plain(row) && text(row.path)); }
  function safeStatus(value) { return ["loading", "ready", "empty", "error", "stale"].includes(value) ? value : "error"; }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }


  function mountLlmWikiWikiSurface(options) {
    wikiUI ||= root.ProdigyWikiWorkspaceView;
    const opts = options || {};
    const container = opts.container;
    if (!container) throw new TypeError("container is required");
    const adapter = opts.readAdapter || root.LLMWikiWikiReadAdapter;
    const service = opts.readService || root.LLMWikiWikiReadService;
    const appRef = opts.app || root.app;
    const Modal = opts.obsidian && opts.obsidian.Modal || root.obsidian && root.obsidian.Modal;
    if (!adapter || typeof adapter.browseRead !== "function") throw new TypeError("LLMWikiWikiReadAdapter is required");
    const styles = root.KnowledgeStyles || (typeof require === "function" ? require("./knowledge-styles.js") : null);
    if (styles && typeof styles.ensureStyles === "function") styles.ensureStyles(container.ownerDocument);
    const initialSnapshot = opts.snapshot && opts.snapshot.ok === true && opts.snapshot.value ? opts.snapshot.value : opts.snapshot;
    let snapshot = initialSnapshot || null;
    let result = null;
    let state = {
      status: snapshot ? "ready" : "loading",
      query: "",
      mode: "verified",
      domain: "",
      topic: "",
      selection: { domain: "", topic: "", mode: "verified", path: null, detail_state: "rest" },
      body: null,
      bodyState: snapshot ? "empty" : "loading",
      error: "",
    };
    let rootEl = null;
    let lastResultButton = null;
    let lastResultPath = "";
    let activeModal = null;
    let inlineDetailHost = null, chatOpen = false;
    let requestSequence = 0;
    let visibilityObserver = null;
    const session = opts.conversationSession || {};
    const chatApi = root.AIChatSessionStore || (typeof require === "function" ? require("./ai-chat-session-store.js") : null);
    if (!session.store && chatApi) session.store = new chatApi.ChatSessionStore({ sessionStorage: null, rejectOverflow: true });
    session.sources ||= []; session.turns ||= []; session.epoch ||= 1; session.listeners ||= new Set();
    let disposed = false;
    let questionResult = session.result || null, questionStage = session.stage || "", questionBusy = session.busy || false,
      questionAbort = session.abort || null, questionProposal = session.proposal || null, questionReviewError = session.reviewError || null;
    const questionStages = { source_ready: "원문 준비됨", searching: "근거 검색 중", calling_provider: "AI 응답 대기 중", validating_answer: "인용 검증 중", preparing_proposal: "제안 준비 중", review: "사용자 검토 대기" };
    function publishQuestion() {
      Object.assign(session, { result: questionResult, stage: questionStage, busy: questionBusy, abort: questionAbort, proposal: questionProposal, reviewError: questionReviewError });
      for (const listener of session.listeners) listener();
    }
    function syncQuestion() {
      questionResult = session.result || null; questionStage = session.stage || ""; questionBusy = session.busy || false;
      questionAbort = session.abort || null; questionProposal = session.proposal || null; questionReviewError = session.reviewError || null;
      if (!disposed) render();
    }
    session.listeners.add(syncQuestion);
    function resetConversation() {
      if (session.stage === "preparing_proposal") return { ok: false, reason: "action_in_progress" };
      session.epoch += 1; questionAbort?.abort(); session.store?.clear(); session.turns = []; session.sources = [];
      session.draft = ""; session.failedQuestion = null; session.citationError = null; session.includeVerified = false; session.scopeInitialized = false; session.scopeNotice = "";
      questionResult = null; questionProposal = null; questionReviewError = null; questionBusy = false; questionStage = ""; publishQuestion();
    }
    function addSelectedSource() {
      if (session.busy) return { ok: false, reason: "action_in_progress" };
      const source = opts.getSelectedSource?.();
      if (!source?.path || !source.content_hash) return { ok: false, reason: "source_selection_required" };
      session.scopeInitialized = true;
      const previous = session.sources.find(row => row.path === source.path);
      if (previous && previous.content_hash !== source.content_hash) {
        session.store?.clear(); session.scopeNotice = "자료 revision이 바뀌어 이전 대화는 새 요청에서 제외했습니다. 과거 인용은 당시 revision을 가리킵니다.";
        session.sources = session.sources.filter(row => row.path !== source.path);
      }
      if (!session.sources.some(row => row.path === source.path)) session.sources.push({ path: source.path, content_hash: source.content_hash });
      render(); return { ok: true };
    }
    function removeSource(path) {
      // Excluded evidence may remain visible in old turns, but none of its
      // user/assistant context is silently reused after a scope reduction.
      session.scopeInitialized = true; session.epoch += 1; questionAbort?.abort(); session.sources = session.sources.filter(row => row.path !== path);
      session.store?.clear(); session.scopeNotice = "자료 범위가 줄어 이전 대화는 새 요청의 맥락에서 제외했습니다. 필요한 조건을 다시 알려주세요.";
      questionResult = null; questionProposal = null; questionBusy = false; questionStage = ""; publishQuestion();
    }
    async function askQuestion(question, retry = false) {
      if (session.busy) return { ok: false, reason: "action_in_progress" };
      question = String(question || "").trim();
      if (!question) return { ok: false, reason: "invalid_query" };
      if (!session.scopeInitialized && !session.sources.length && session.includeVerified !== true) addSelectedSource();
      const history = session.store?.getMessages() || [];
      // Failed requests are retained as drafts, not appended twice on retry.
      if (history.length >= 28 || session.turns.length >= 14) { questionResult = { ok: false, reason: "context_limit", stage: "context" }; publishQuestion(); return questionResult; }
      const epoch = session.epoch;
      questionBusy = true; questionProposal = null; questionReviewError = null; questionAbort = new AbortController();
      session.draft = question; publishQuestion();
      let received;
      try {
        // Route canonical selections through fresh finalized-authority resolution,
        // not the INBOX-only unverified source adapter. A path is not a trust grant.
        const verifiedPaths = session.sources.filter(source => source.path.startsWith("ZETA/PERMANENT/")).map(source => source.path);
        received = await root.LLMWikiWikiReadService.answerSourceQuestion({ app: appRef, question,
          sources: session.sources.filter(source => !verifiedPaths.includes(source.path)), verified_paths: verifiedPaths,
          includeVerified: session.includeVerified === true, history,
          signal: questionAbort.signal, confirmConsent: opts.confirmConsent,
          onProgress(stage) { if (epoch === session.epoch) { questionStage = stage; publishQuestion(); } } });
        if (epoch !== session.epoch) return { ok: false, reason: "conversation_changed" };
        if (received.ok) {
          const body = (received.conversation_text || (received.answers || []).map((row, index) => `${index + 1}. ${row.text}`).join("\n"))
            + (received.review_notes || []).map(note => `\n확인 필요: ${note}`).join("");
          session.store?.persist([...history, { role: "user", body: question }, { role: "assistant", body: body || "현재 근거로 답할 수 없습니다.", citations: (received.answers || []).map(row => row.citation) }]);
          session.turns.push({ question, result: received }); session.failedQuestion = null; session.draft = "";
          const unresolvedScope = Array.isArray(received.scope?.unresolved_paths) ? received.scope.unresolved_paths : [];
          if (unresolvedScope.length) session.scopeNotice = `읽을 수 없는 지정 범위: ${unresolvedScope.join(", ")}. 검증된 문서 경로와 정확히 일치해야 합니다.`;
        } else session.failedQuestion = question;
        questionResult = received;
      } catch (error) {
        if (epoch !== session.epoch) return { ok: false, reason: "conversation_changed" };
        questionResult = { ok: false, reason: error.code || "provider_transport_error", stage: questionStage }; session.failedQuestion = question;
      } finally {
        if (epoch === session.epoch) { questionBusy = false; questionStage = ""; publishQuestion(); }
      }
      return questionResult;
    }
    async function openQuestionCitation(citation) {
      const checked = typeof root.LLMWikiWikiReadService?.validateQuestionCitation === "function"
        ? await root.LLMWikiWikiReadService.validateQuestionCitation({ app: appRef, citation })
        : { ok: false, reason: "source_unavailable", stage: "citation" };
      session.citationError = checked.ok ? null : checked;
      for (const listener of session.listeners) listener();
      if (!checked.ok) return checked;
      return opts.onOpenCitation ? opts.onOpenCitation(citation) : opts.onOpenBeside?.(citation.source_path);
    }
    async function prepareReview() {
      if (questionBusy) return { ok: false, reason: "action_in_progress" };
      if (questionStage === "review" && (!questionProposal.handoff?.reopenable || questionProposal.handoff.isOpen?.())) return questionProposal.handoff;
      if (!questionResult?.ok || !questionResult.answers?.length) return { ok: false, reason: "proposal_validation_failed" };
      questionBusy = true; questionReviewError = null; questionStage = "preparing_proposal"; publishQuestion();
      try {
        // Keep the original branded answer and prepared proposal across handoff failures.
        // The handoff revalidates source revision on every explicit attempt.
        if (!questionProposal?.ok) questionProposal = await root.LLMWikiWikiReadService.prepareQuestionProposal({ app: appRef, answer: questionResult });
        if (questionProposal?.ok && typeof root.LLMWikiWikiReadService.validateQuestionEvidence === "function") {
          const checked = await root.LLMWikiWikiReadService.validateQuestionEvidence({ app: appRef, answer: questionResult, proposal: questionProposal });
          if (!checked.ok) { questionReviewError = checked; return checked; }
        }
        const handoff = questionProposal.ok && typeof opts.openQuestionReview === "function"
          ? await opts.openQuestionReview(questionProposal, { onClose() { for (const listener of session.listeners) listener(); } }) : questionProposal.ok
            ? { ok: false, reason: "review_handoff_failed" } : questionProposal;
        if (!handoff?.ok) questionReviewError = { ok: false, reason: handoff?.reason || "review_handoff_failed", stage: "review" };
        else { questionStage = "review"; questionProposal = { ...questionProposal, handoff }; }
        return handoff;
      } catch (error) {
        questionReviewError = { ok: false, reason: error.code || "review_handoff_failed", stage: "review" };
        return questionReviewError;
      } finally { questionBusy = false; if (questionStage !== "review") questionStage = ""; publishQuestion(); }
    }
    const panel = typeof container.closest === "function" ? container.closest('[role="tabpanel"]') : null;

    function panelHidden() {
      return Boolean(panel && (panel.hidden || typeof panel.hasAttribute === "function" && panel.hasAttribute("hidden")));
    }

    function read(input) {
      if (service && typeof service.browseRead === "function") return service.browseRead(input);
      return adapter.browseRead(input);
    }
    function statusForRead(value) {
      if (!value || value.ok === false) return "error";
      if (["stale", "stale_snapshot"].includes(value.status) || value.reason === "stale_snapshot") return "stale";
      if (value.status === "empty" || value.total === 0) return "empty";
      return "ready";
    }
    function applyBrowse(patch) {
      const next = { ...state, ...(patch || {}) };
      const reset = next.reset === true;
      requestSequence += 1;
      const baseNext = { ...next };
      delete baseNext.reset;
      if (!snapshot) {
        state = { ...baseNext, status: "error", error: "snapshot_unavailable", body: null, bodyState: "empty" };
        render();
        return state;
      }
      const response = read({ snapshot, query: next.query, mode: next.mode, domain: next.domain, topic: next.topic, path: next.path || next.selection && next.selection.path || "", reset });
      if (!response || response.ok === false) {
        state = { ...baseNext, status: "error", error: response && response.reason || "browse_failed", result: null, body: null, bodyState: "empty" };
      } else {
        result = response.value || response;
        state = { ...baseNext, status: statusForRead(result), error: "", result, selection: result.selection || next.selection, body: null, bodyState: result.selection && result.selection.path ? "loading" : "empty" };
      }
      render();
      if (state.selection && state.selection.path) hydrate(state.selection.path);
      return state;
    }
    async function hydrate(path) {
      const requestId = ++requestSequence;
      if (!path) return;
      state = { ...state, bodyState: "loading", body: null };
      render();
      let response;
      try {
        if (!service || typeof service.hydrateBody !== "function") response = { ok: false, reason: "body_service_unavailable", status: "error" };
        else response = await service.hydrateBody({ path, snapshot_revision: snapshot.snapshot_revision, row_revision: (safeRows(snapshot.rows || snapshot.documents).find((row) => row.path === path) || {}).row_revision });
      } catch (_error) {
        response = { ok: false, reason: "body_read_failed", status: "error" };
      }
      if (requestId !== requestSequence) return;
      const value = response && response.ok === true && response.value ? response.value : response;
      const status = value && value.status;
      if (response && response.ok !== false && status === "ready") state = { ...state, bodyState: value.body ? "ready" : "empty", body: value.body || "" };
      else if (status === "stale" || response && response.reason === "stale_snapshot") state = { ...state, bodyState: "stale", body: null };
      else if (status === "empty") state = { ...state, bodyState: "empty", body: "" };
      else state = { ...state, bodyState: "error", body: null };
      render();
    }
    async function refresh() {
      state = { ...state, status: "loading", error: "" };
      render();
      try {
        const input = typeof opts.collectSnapshot === "function" ? await opts.collectSnapshot() : opts.snapshotInput || {};
        const published = service && typeof service.publishSnapshot === "function" ? await service.publishSnapshot(input) : adapter.buildSnapshot(input);
        if (!published || published.ok === false) throw new Error(published && published.reason || "snapshot_failed");
        snapshot = published.snapshot || published.value || published;
        applyBrowse({ query: "", mode: "verified", domain: "", topic: "", reset: true });
      } catch (_error) {
        state = { ...state, status: "error", error: "snapshot_failed" };
        render();
      }
      return state;
    }
    function facetButtons(parent, title, values, selected, key) {
      if (!values.length) return;
      const group = createEl(parent, "div", { attr: { class: "llmwiki-wiki-surface__facet-group" } });
      createEl(group, "strong", { text: title });
      values.forEach((facet) => {
        const value = typeof facet === "string" ? facet : text(facet.key);
        if (!value) return;
        const count = typeof facet === "object" ? Number(facet.count || 0) : 0;
        const button = createEl(group, "button", { text: `${value}${count ? ` (${count})` : ""}`, attr: { type: "button", class: "llmwiki-wiki-surface__facet-button", "aria-pressed": value === selected ? "true" : "false", "data-facet-key": key, "data-facet-value": value } });
        button.onclick = () => applyBrowse({ [key]: value, path: "", selection: { ...state.selection, path: null, detail_state: "rest" } });
      });
    }
    function clearSelection(restoreFocus) {
      requestSequence += 1;
      state = { ...state, selection: { ...state.selection, path: null, detail_state: "rest" }, body: null, bodyState: "empty" };
      render();
      if (restoreFocus !== false) {
        const current = rootEl && typeof rootEl.querySelector === "function" && lastResultPath
          ? rootEl.querySelector(`[data-result-path="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(lastResultPath) : lastResultPath}"]`)
          : null;
        focus(current || lastResultButton);
      }
    }
    function closeDetailModal() {
      if (!activeModal || typeof activeModal.close !== "function") return;
      activeModal.close();
    }
    function renderDetailModal() {
      if (!inlineDetailHost && (!activeModal || !activeModal.contentEl)) return;
      const parent = inlineDetailHost || activeModal.contentEl;
      empty(parent);
      addClass(parent, "llmwiki-wiki-detail-modal__content");
      const detail = state.selection && state.selection.path ? safeRows(state.result && (state.result.rows || state.result.results)).find((row) => row.path === state.selection.path) : null;
      if (!detail) {
        createEl(parent, "p", { text: "선택한 지식을 표시할 수 없습니다.", attr: { class: "llmwiki-wiki-surface__status", "data-state": "error", role: "alert" } });
        return;
      }
      const article = createEl(parent, "article", { attr: { class: "llmwiki-wiki-detail-modal__article", "aria-labelledby": "llmwiki-wiki-detail-title" } });
      const header = createEl(article, "header", { attr: { class: "llmwiki-wiki-detail-modal__header" } });
      createEl(header, "p", { text: `${TRUST_LABELS[detail.trust] || "읽기"} · ${detail.domain || "미분류"}`, attr: { class: "llmwiki-wiki-surface__result-meta" } });
      createEl(header, "h2", { text: detail.title || "제목 없음", attr: { id: "llmwiki-wiki-detail-title" } });
      if (detail.trust === "verified" && typeof opts.onContentAdd === "function") {
        const add = createEl(header, "button", { text: "내용 추가", attr: { type: "button", "data-action": "add-document-content" } }); add.onclick = () => opts.onContentAdd(detail);
      }
      const documentDetails = createEl(header, "details"); createEl(documentDetails, "summary", { text: "상세 정보" }); createEl(documentDetails, "p", { text: detail.path });
      const scroll = createEl(article, "div", { attr: { class: "llmwiki-wiki-detail-modal__scroll" } });
      if (detail.statement || detail.summary) createEl(scroll, "p", { text: detail.statement || detail.summary, attr: { class: "llmwiki-wiki-detail-modal__summary" } });
      if (state.bodyState === "loading") createEl(scroll, "p", { text: "본문을 불러오는 중입니다.", attr: { class: "llmwiki-wiki-surface__status", role: "status", "aria-live": "polite" } });
      else if (state.bodyState === "ready") wikiUI.markdown(scroll, state.body, opts.renderMarkdown);
      else if (state.bodyState === "stale") createEl(scroll, "p", { text: "자료가 변경되어 본문을 표시하지 않았습니다. 닫은 뒤 다시 선택해 주세요.", attr: { class: "llmwiki-wiki-surface__status", "data-state": "stale", role: "alert" } });
      else if (state.bodyState === "error") createEl(scroll, "p", { text: "본문을 불러오지 못했습니다. 닫은 뒤 다시 선택해 주세요.", attr: { class: "llmwiki-wiki-surface__status", "data-state": "error", role: "alert" } });
      else createEl(scroll, "p", { text: "표시할 본문이 없습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      const footer = createEl(article, "footer", { attr: { class: "llmwiki-wiki-detail-modal__footer" } });
      const close = createEl(footer, "button", { text: "닫기", attr: { type: "button", "data-action": "close-detail-modal" } });
      close.onclick = opts.inlineDetail ? () => clearSelection(true) : closeDetailModal;
    }
    function openDetailModal(path) {
      if (opts.inlineDetail) { render(); return true; }
      if (!Modal || !appRef || !path) return false;
      const modal = new Modal(appRef);
      activeModal = modal;
      modal.onOpen = () => {
        if (modal.modalEl) {
          addClass(modal.modalEl, "llmwiki-wiki-detail-modal");
          setAttr(modal.modalEl, "data-surface", "llmwiki-knowledge-detail-modal");
        }
        renderDetailModal();
      };
      modal.onClose = () => {
        if (activeModal !== modal) return;
        activeModal = null;
        clearSelection(true);
      };
      modal.open();
      render();
      return true;
    }
    function render() {
      if (disposed) return;
      if (panelHidden()) {
        if (rootEl) empty(rootEl);
        return;
      }
      if (!rootEl) {
        empty(container);
        rootEl = createEl(container, "section", { attr: { class: "llmwiki-wiki-surface prodigy-full-bleed", "data-surface": "llmwiki-browse", "aria-label": "LLMWiki 탐색" } });
      }
      empty(rootEl);
      const header = createEl(rootEl, "header", { attr: { class: "llmwiki-wiki-surface__header" } });
      if (!opts.inlineDetail) createEl(header, "h2", { text: MODE_LABELS[state.mode], attr: { "data-surface-heading": "llmwiki-browse" } });
      const statusText = state.status === "loading" ? "정리 결과를 불러오는 중입니다." : state.status === "error" ? "Prodigy Wiki 결과를 불러오지 못했습니다. 다시 시도해 주세요." : state.status === "stale" ? "원문이 변경되어 결과를 다시 확인해야 합니다." : state.status === "empty" ? "조건에 맞는 결과가 없습니다." : "읽기 전용 결과입니다.";
      if (state.status !== "ready") createEl(header, "p", { text: statusText, attr: { class: "llmwiki-wiki-surface__status", "data-state": state.status, role: state.status === "error" || state.status === "stale" ? "alert" : "status", "aria-live": "polite" } });
      const controls = createEl(rootEl, "div", { attr: { class: "llmwiki-wiki-surface__controls" } });
      const form = createEl(controls, "form", { attr: { class: "llmwiki-wiki-surface__search", role: "search" } });
      const input = createEl(form, "input", { attr: { type: "search", value: state.query, placeholder: "검색어를 입력하세요", "aria-label": "Prodigy Wiki 검색어" } });
      input.value = state.query;
      input.oninput = (event) => { state = { ...state, query: event && event.target ? event.target.value : input.value }; };
      form.onsubmit = (event) => { if (event && event.preventDefault) event.preventDefault(); applyBrowse({ query: input.value, selection: { ...state.selection, path: null, detail_state: "rest" } }); };
      const searchButton = createEl(form, "button", { text: "검색", attr: { type: "submit" } });
      if (typeof opts.getSelectedSource === "function") {
        const toggle = createEl(controls, "button", { text: chatOpen ? "질문 닫기" : "원문에 질문", attr: { type: "button", "data-action": "toggle-source-question", "aria-expanded": String(chatOpen) } }); toggle.onclick = () => { chatOpen = !chatOpen; render(); };
      }
      if (chatOpen && typeof opts.getSelectedSource === "function") {
        const ask = createEl(form, "button", { text: "선택한 원문에 질문", attr: { type: "button", "data-action": "ask-source-question" } });
        ask.disabled = questionBusy;
        ask.onclick = () => askQuestion(input.value);
        const chatInput = createEl(controls, "textarea", { attr: { placeholder: "후속 질문이나 정정을 입력하세요", "aria-label": "Wiki 대화 입력", rows: "3", style: "width:100%;box-sizing:border-box" } });
        chatInput.value = session.draft || ""; chatInput.disabled = questionBusy;
        let composing = false;
        chatInput.oncompositionstart = () => { composing = true; };
        chatInput.oncompositionend = () => { composing = false; };
        chatInput.oninput = () => { session.draft = chatInput.value; };
        chatInput.onkeydown = event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !composing && event.keyCode !== 229) { event.preventDefault(); return askQuestion(chatInput.value); } };
        const send = createEl(controls, "button", { text: "질문 보내기", attr: { type: "button" } }); send.disabled = questionBusy; send.onclick = () => askQuestion(chatInput.value);
        const add = createEl(controls, "button", { text: "선택한 자료 추가", attr: { type: "button" } }); add.disabled = questionBusy; add.onclick = addSelectedSource;
        const wiki = createEl(controls, "button", { text: session.includeVerified ? "검증된 Wiki 제외" : "검증된 Wiki 포함", attr: { type: "button" } });
        wiki.disabled = questionBusy; wiki.onclick = () => { if (session.includeVerified) { session.includeVerified = false; removeSource(""); } else { session.includeVerified = true; render(); } };
        const fresh = createEl(controls, "button", { text: "새 대화", attr: { type: "button" } }); fresh.onclick = resetConversation;
        createEl(controls, "p", { text: `현재 범위: ${session.includeVerified ? "검증된 Wiki + " : ""}${session.sources.map(row => row.path + (row.path.startsWith("ZETA/PERMANENT/") ? " (Wiki 범위)" : " (미승인 자료)")).join(", ") || "선택 자료 없음"}. 대화는 앱 종료 후 복원되지 않습니다.` });
        for (const source of session.sources) { const remove = createEl(controls, "button", { text: `${source.path} 제외`, attr: { type: "button" } }); remove.onclick = () => removeSource(source.path); }
        if (session.scopeNotice) createEl(controls, "p", { text: session.scopeNotice, attr: { role: "status" } });
        if (session.failedQuestion) { const retry = createEl(controls, "button", { text: "실패한 질문 다시 시도", attr: { type: "button" } }); retry.disabled = questionBusy; retry.onclick = () => askQuestion(session.failedQuestion, true); }
        for (const turn of session.turns.filter(turn => turn.result !== questionResult)) {
          const previous = createEl(controls, "section", { attr: { "data-component": "PreviousWikiTurn" } });
          createEl(previous, "p", { text: `질문: ${turn.question}` });
          for (const row of turn.result.answers || []) { createEl(previous, "p", { text: row.text }); const cite = createEl(previous, "button", { text: row.citation.locator, attr: { type: "button" } }); cite.onclick = () => openQuestionCitation(row.citation); }
          for (const note of turn.result.review_notes || []) createEl(previous, "p", { text: `확인 필요: ${note}` });
        }
        const answerPanel = createEl(controls, "section", { attr: { "data-component": "SourceGroundedAnswer", style: "overflow-wrap:anywhere;min-width:0" } });
        createEl(answerPanel, "p", { text: "선택한 원문의 관련 근거만 AI에 전송합니다. 답변은 미승인 요약입니다." });
        if (questionStage) createEl(answerPanel, "p", { text: questionStages[questionStage] || questionStage, attr: { role: "status" } });
        if (session.citationError) createEl(answerPanel, "p", { text: root.LLMWikiUIRecovery?.mapRecovery(session.citationError)?.copy || "원문 근거를 확인할 수 없습니다. 이전 인용을 현재 원문에 다시 연결하지 않았습니다. 자료를 확인하고 다시 선택해 주세요.", attr: { role: "alert" } });
        if (questionReviewError) createEl(answerPanel, "p", { text: root.LLMWikiUIRecovery?.mapRecovery(questionReviewError)?.copy || `검토 전달 실패: ${questionReviewError.reason}. 답변은 보존되었습니다. 다시 시도할 수 있습니다.`, attr: { role: "alert" } });
        if (questionResult) {
          if (!questionResult.ok || questionResult.status === "abstain") createEl(answerPanel, "p", { text: questionResult.reason === "context_limit" ? "현재 대화·자료 한도를 넘었습니다. 내용을 삭제하지 않았습니다. 자료를 줄이거나 새 대화를 시작해 주세요." : questionResult.reason === "document_review_required" ? "여러 자료 또는 기존 Wiki를 반영하는 초안은 자료 정리의 문서 변경 검토에서 만들어 주세요." : root.LLMWikiUIRecovery?.mapRecovery(questionResult)?.copy || `실패 단계: ${questionResult.stage || "검증"} · ${questionResult.reason}. 저장하지 않았습니다.`, attr: { role: "status" } });
          if (questionResult.context?.coverage_complete === false) createEl(answerPanel, "p", { text: "선택 자료 일부 근거만 확인했습니다. 조건·예외를 포함한 전체 요약은 아닙니다.", attr: { role: "status", "data-question-warning": "incomplete_coverage" } });
          const groups = new Map();
          for (const answer of questionResult.answers || []) { const key = answer.title || "답변"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(answer); }
          let groupNumber = 0;
          for (const [title, grouped] of groups) {
            createEl(answerPanel, "h3", { text: `${++groupNumber}. ${title}` });
            for (const answer of grouped) {
            createEl(answerPanel, "p", { text: answer.text });
            createEl(answerPanel, "blockquote", { text: answer.citation.excerpt });
            const cite = createEl(answerPanel, "button", { text: answer.citation.locator, attr: { type: "button", "data-action": "open-answer-citation", style: "white-space:normal;max-width:100%;overflow-wrap:anywhere;height:auto" } });
            cite.onclick = () => openQuestionCitation(answer.citation);
          }
          }
          for (const note of questionResult.review_notes || []) createEl(answerPanel, "p", { text: `추가 확인: ${note}`, attr: { role: "status" } });
          if (questionResult.ok && questionResult.answers?.length) {
            createEl(answerPanel, "p", { text: "확신도: 원문에서 요약·추론함. 기존 관련 지식 및 충돌: 자동 비교 미실시 — 검토 필요." });
            const review = createEl(answerPanel, "button", { text: questionReviewError ? "검토 전달 다시 시도" : questionStage === "review" && questionProposal?.handoff?.reopenable ? "검토 다시 열기" : "답변과 조건을 지식 초안으로 검토", attr: { type: "button", "data-action": "review-question-proposal" } });
            review.disabled = questionBusy || questionStage === "review" && (!questionProposal?.handoff?.reopenable || questionProposal.handoff.isOpen?.());
            review.onclick = prepareReview;
          }
        }
      }
      const filterDetails = createEl(controls, "details", { attr: { "data-library-filter": "" } }); createEl(filterDetails, "summary", { text: "필터" });
      const filterRow = createEl(filterDetails, "div", { attr: { class: "llmwiki-wiki-surface__filters" } });
      const mode = createEl(filterRow, "select", { attr: { "aria-label": "읽기 모드" } });
      Object.entries(MODE_LABELS).forEach(([value, label]) => createEl(mode, "option", { text: label, attr: { value, selected: value === state.mode ? "selected" : undefined } }));
      mode.value = state.mode;
      mode.onchange = () => applyBrowse({ mode: mode.value, domain: "", topic: "", selection: { ...state.selection, path: null, detail_state: "rest" } });
      const reset = createEl(filterRow, "button", { text: "필터 초기화", attr: { type: "button" } });
      reset.onclick = () => applyBrowse({ query: "", mode: "verified", domain: "", topic: "", reset: true, selection: { domain: "", topic: "", mode: "verified", path: null, detail_state: "rest" } });
      const content = createEl(rootEl, "div", { attr: { class: "llmwiki-wiki-surface__content" } });
      const rail = createEl(filterDetails, "aside", { attr: { class: "llmwiki-wiki-surface__facet-rail prodigy-utility-card", "data-component": "WikiFacetRail", "aria-label": "Prodigy Wiki 필터" } });
      const facets = state.result && state.result.facets ? state.result.facets : { domains: [], topics: [] };
      facetButtons(rail, "분야", facets.domains, state.domain, "domain");
      facetButtons(rail, "주제", facets.topics, state.topic, "topic");
      const resultsPanel = createEl(content, "section", { attr: { class: "llmwiki-wiki-surface__results prodigy-utility-card", "data-component": "WikiResultList", "aria-label": "Prodigy Wiki 결과" } });
      const rows = state.result ? safeRows(state.result.rows || state.result.results) : [];
      const listEl = createEl(resultsPanel, "ol", { attr: { class: "llmwiki-wiki-surface__result-list" } });
      rows.forEach((row) => {
        const li = createEl(listEl, "li");
        const button = createEl(li, "button", { attr: { type: "button", class: "llmwiki-wiki-surface__result", "aria-haspopup": opts.inlineDetail ? "false" : "dialog", "aria-expanded": state.selection?.path === row.path ? "true" : "false", "data-result-path": row.path } });
        createEl(button, "span", { text: `${TRUST_LABELS[row.trust] || "읽기"} · ${row.title || row.path}`, attr: { class: "llmwiki-wiki-surface__result-title" } });
        createEl(button, "span", { text: `${row.domain || "미분류"} · ${(row.sources || []).map(source => wikiUI.title(source.source_path || source.locator || "")).filter(Boolean).join(" · ")}`, attr: { class: "llmwiki-wiki-surface__result-meta" } });
        button.onclick = () => {
          lastResultButton = button;
          lastResultPath = row.path;
          if (row.trust === "verified" || row.trust === "legacy_verified") opts.onReadCanonical?.(row);
          applyBrowse({ selection: { ...state.selection, path: row.path, detail_state: "loading" }, path: row.path });
          openDetailModal(row.path);
        };
      });
      if (!rows.length) createEl(resultsPanel, "p", { text: state.status === "loading" ? "스냅샷을 준비하는 중입니다." : "표시할 결과가 없습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      inlineDetailHost = opts.inlineDetail && state.selection?.path ? createEl(rootEl, "section", { attr: { "data-inline-document": state.selection.path } }) : null;
      if (inlineDetailHost) resultsPanel.hidden = true;
      renderDetailModal();
    }

    const api = Object.freeze({
      askQuestion, prepareReview, openQuestionCitation, resetConversation, addSelectedSource, removeSource,
      getConversation() { return { messages: session.store?.getMessages() || [], sources: session.sources.slice(), turns: session.turns.slice(), draft: session.draft || "" }; },
      getQuestionState() { return { result: questionResult, proposal: questionProposal, stage: questionStage, reviewError: questionReviewError }; },
      refresh,
      update(next) { if (next && next.snapshot) snapshot = next.snapshot; state = { ...state, ...(next || {}) }; render(); return state; },
      getState() { return clone(state); },
      setQuery(value) { return applyBrowse({ query: text(value), path: "", selection: { ...state.selection, path: null, detail_state: "rest" } }); },
      setMode(value) { return applyBrowse({ mode: text(value) || "verified", path: "", selection: { ...state.selection, path: null, detail_state: "rest" } }); },
      setFacet(key, value) { return applyBrowse({ [key]: text(value), path: "", selection: { ...state.selection, path: null, detail_state: "rest" } }); },
      select(path) { return applyBrowse({ path, selection: { ...state.selection, path, detail_state: "loading" } }); },
      destroy() {
        disposed = true; session.listeners.delete(syncQuestion);
        if (visibilityObserver) visibilityObserver.disconnect();
        visibilityObserver = null;
        if (activeModal && typeof activeModal.close === "function") {
          activeModal.onClose = null;
          activeModal.close();
        }
        activeModal = null;
        empty(container);
        rootEl = null;
      }
    });
    if (panel && typeof MutationObserver === "function") {
      visibilityObserver = new MutationObserver(() => render());
      visibilityObserver.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    }
    render();
    if (!snapshot) refresh();
    return api;
  }

  const api = Object.freeze({ MODE_LABELS, TRUST_LABELS, mountLlmWikiWikiSurface, createWikiSurface: mountLlmWikiWikiSurface });
  root.LLMWikiWikiSurface = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
