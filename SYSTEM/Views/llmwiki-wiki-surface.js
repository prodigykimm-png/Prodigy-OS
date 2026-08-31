(function (root) {
  "use strict";

  const MODE_LABELS = Object.freeze({ verified: "검증된 지식", literature: "문헌 자료", pending: "검토 대기", all: "전체 읽기" });
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
    let activeModalPath = "";
    let requestSequence = 0;
    let visibilityObserver = null;
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
      if (!activeModal || !activeModal.contentEl) return;
      const parent = activeModal.contentEl;
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
      createEl(header, "p", { text: detail.path, attr: { class: "llmwiki-wiki-surface__result-meta" } });
      const scroll = createEl(article, "div", { attr: { class: "llmwiki-wiki-detail-modal__scroll" } });
      if (detail.statement || detail.summary) createEl(scroll, "p", { text: detail.statement || detail.summary, attr: { class: "llmwiki-wiki-detail-modal__summary" } });
      if (state.bodyState === "loading") createEl(scroll, "p", { text: "본문을 불러오는 중입니다.", attr: { class: "llmwiki-wiki-surface__status", role: "status", "aria-live": "polite" } });
      else if (state.bodyState === "ready") createEl(scroll, "div", { text: state.body, attr: { class: "llmwiki-wiki-surface__body" } });
      else if (state.bodyState === "stale") createEl(scroll, "p", { text: "자료가 변경되어 본문을 표시하지 않았습니다. 닫은 뒤 다시 선택해 주세요.", attr: { class: "llmwiki-wiki-surface__status", "data-state": "stale", role: "alert" } });
      else if (state.bodyState === "error") createEl(scroll, "p", { text: "본문을 불러오지 못했습니다. 닫은 뒤 다시 선택해 주세요.", attr: { class: "llmwiki-wiki-surface__status", "data-state": "error", role: "alert" } });
      else createEl(scroll, "p", { text: "표시할 본문이 없습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      const footer = createEl(article, "footer", { attr: { class: "llmwiki-wiki-detail-modal__footer" } });
      const close = createEl(footer, "button", { text: "닫기", attr: { type: "button", "data-action": "close-detail-modal" } });
      close.onclick = closeDetailModal;
    }
    function openDetailModal(path) {
      if (!Modal || !appRef || !path) return false;
      const modal = new Modal(appRef);
      activeModal = modal;
      activeModalPath = path;
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
        activeModalPath = "";
        clearSelection(true);
      };
      modal.open();
      render();
      return true;
    }
    function render() {
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
      createEl(header, "h2", { text: "Prodigy Wiki 검토", attr: { "data-surface-heading": "llmwiki-browse" } });
      createEl(header, "p", { text: "검증된 스냅샷을 검색하고 읽습니다. 이 화면은 저장하지 않습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      const statusText = state.status === "loading" ? "정리 결과를 불러오는 중입니다." : state.status === "error" ? "Prodigy Wiki 결과를 불러오지 못했습니다. 다시 시도해 주세요." : state.status === "stale" ? "원문이 변경되어 결과를 다시 확인해야 합니다." : state.status === "empty" ? "조건에 맞는 결과가 없습니다." : "읽기 전용 결과입니다.";
      createEl(header, "p", { text: statusText, attr: { class: "llmwiki-wiki-surface__status", "data-state": state.status, role: state.status === "error" || state.status === "stale" ? "alert" : "status", "aria-live": "polite" } });
      const controls = createEl(rootEl, "div", { attr: { class: "llmwiki-wiki-surface__controls" } });
      const form = createEl(controls, "form", { attr: { class: "llmwiki-wiki-surface__search", role: "search" } });
      const input = createEl(form, "input", { attr: { type: "search", value: state.query, placeholder: "검색어를 입력하세요", "aria-label": "Prodigy Wiki 검색어" } });
      input.value = state.query;
      input.oninput = (event) => { state = { ...state, query: event && event.target ? event.target.value : input.value }; };
      form.onsubmit = (event) => { if (event && event.preventDefault) event.preventDefault(); applyBrowse({ query: input.value, selection: { ...state.selection, path: null, detail_state: "rest" } }); };
      const searchButton = createEl(form, "button", { text: "검색", attr: { type: "submit" } });
      const filterRow = createEl(controls, "div", { attr: { class: "llmwiki-wiki-surface__filters" } });
      const mode = createEl(filterRow, "select", { attr: { "aria-label": "읽기 모드" } });
      Object.entries(MODE_LABELS).forEach(([value, label]) => createEl(mode, "option", { text: label, attr: { value, selected: value === state.mode ? "selected" : undefined } }));
      mode.value = state.mode;
      mode.onchange = () => applyBrowse({ mode: mode.value, domain: "", topic: "", selection: { ...state.selection, path: null, detail_state: "rest" } });
      const reset = createEl(filterRow, "button", { text: "필터 초기화", attr: { type: "button" } });
      reset.onclick = () => applyBrowse({ query: "", mode: "verified", domain: "", topic: "", reset: true, selection: { domain: "", topic: "", mode: "verified", path: null, detail_state: "rest" } });
      const content = createEl(rootEl, "div", { attr: { class: "llmwiki-wiki-surface__content" } });
      const rail = createEl(content, "aside", { attr: { class: "llmwiki-wiki-surface__facet-rail prodigy-utility-card", "data-component": "WikiFacetRail", "aria-label": "Prodigy Wiki 필터" } });
      const facets = state.result && state.result.facets ? state.result.facets : { domains: [], topics: [] };
      facetButtons(rail, "도메인", facets.domains, state.domain, "domain");
      facetButtons(rail, "주제", facets.topics, state.topic, "topic");
      const resultsPanel = createEl(content, "section", { attr: { class: "llmwiki-wiki-surface__results prodigy-utility-card", "data-component": "WikiResultList", "aria-label": "Prodigy Wiki 결과" } });
      const rows = state.result ? safeRows(state.result.rows || state.result.results) : [];
      const listEl = createEl(resultsPanel, "ol", { attr: { class: "llmwiki-wiki-surface__result-list" } });
      rows.forEach((row) => {
        const li = createEl(listEl, "li");
        const button = createEl(li, "button", { attr: { type: "button", class: "llmwiki-wiki-surface__result", "aria-haspopup": "dialog", "aria-expanded": activeModalPath === row.path ? "true" : "false", "data-result-path": row.path } });
        createEl(button, "span", { text: `${TRUST_LABELS[row.trust] || "읽기"} · ${row.title || row.path}`, attr: { class: "llmwiki-wiki-surface__result-title" } });
        createEl(button, "span", { text: `${row.domain || "unclassified"} · ${row.path}`, attr: { class: "llmwiki-wiki-surface__result-meta" } });
        button.onclick = () => {
          lastResultButton = button;
          lastResultPath = row.path;
          applyBrowse({ selection: { ...state.selection, path: row.path, detail_state: "loading" }, path: row.path });
          openDetailModal(row.path);
        };
      });
      if (!rows.length) createEl(resultsPanel, "p", { text: state.status === "loading" ? "스냅샷을 준비하는 중입니다." : "표시할 결과가 없습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      renderDetailModal();
    }

    const api = Object.freeze({
      refresh,
      update(next) { if (next && next.snapshot) snapshot = next.snapshot; state = { ...state, ...(next || {}) }; render(); return state; },
      getState() { return clone(state); },
      setQuery(value) { return applyBrowse({ query: text(value), path: "", selection: { ...state.selection, path: null, detail_state: "rest" } }); },
      setMode(value) { return applyBrowse({ mode: text(value) || "verified", path: "", selection: { ...state.selection, path: null, detail_state: "rest" } }); },
      setFacet(key, value) { return applyBrowse({ [key]: text(value), path: "", selection: { ...state.selection, path: null, detail_state: "rest" } }); },
      select(path) { return applyBrowse({ path, selection: { ...state.selection, path, detail_state: "loading" } }); },
      destroy() {
        if (visibilityObserver) visibilityObserver.disconnect();
        visibilityObserver = null;
        if (activeModal && typeof activeModal.close === "function") {
          activeModal.onClose = null;
          activeModal.close();
        }
        activeModal = null;
        activeModalPath = "";
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
