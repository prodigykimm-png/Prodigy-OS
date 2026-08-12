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
  function focus(element) { if (element && typeof element.focus === "function") element.focus(); }
  function safeRows(value) { return list(value).filter((row) => plain(row) && text(row.path)); }
  function safeStatus(value) { return ["loading", "ready", "empty", "error", "stale"].includes(value) ? value : "error"; }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }

  function injectStyles(container) {
    const doc = container && container.ownerDocument ? container.ownerDocument : typeof document !== "undefined" ? document : null;
    if (!doc || !doc.head || doc.getElementById("llmwiki-wiki-surface-styles")) return;
    const style = doc.createElement("style");
    style.id = "llmwiki-wiki-surface-styles";
    style.textContent = [
      ".llmwiki-wiki-surface{display:grid;gap:12px;inline-size:100%;max-inline-size:100%;min-width:0;color:var(--text-normal);line-height:1.45}",
      ".llmwiki-wiki-surface,.llmwiki-wiki-surface *{box-sizing:border-box}",
      ".llmwiki-wiki-surface__header,.llmwiki-wiki-surface__controls,.llmwiki-wiki-surface__content,.llmwiki-wiki-surface__detail{min-width:0}",
      ".llmwiki-wiki-surface__header h2,.llmwiki-wiki-surface__header p,.llmwiki-wiki-surface__detail h3,.llmwiki-wiki-surface__detail p{margin:0;overflow-wrap:anywhere}",
      ".llmwiki-wiki-surface__controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}",
      ".llmwiki-wiki-surface__search{display:flex;gap:8px;min-width:0}",
      ".llmwiki-wiki-surface input,.llmwiki-wiki-surface select,.llmwiki-wiki-surface button{min-height:44px;font:inherit}",
      ".llmwiki-wiki-surface input,.llmwiki-wiki-surface select{min-width:0;color:var(--text-normal)}",
      ".llmwiki-wiki-surface button{cursor:pointer}",
      ".llmwiki-wiki-surface input:not([type=checkbox]):not([type=radio]),.llmwiki-wiki-surface select,.llmwiki-wiki-surface button:not(.clickable-icon){box-shadow:none}",
      ".llmwiki-wiki-surface button:hover{border-color:var(--text-accent)}",
      ".llmwiki-wiki-surface button:focus-visible,.llmwiki-wiki-surface input:focus-visible,.llmwiki-wiki-surface select:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}",
      ".llmwiki-wiki-surface__filters{display:flex;flex-wrap:wrap;gap:8px}",
      ".llmwiki-wiki-surface__content{display:grid;grid-template-columns:minmax(150px,220px) minmax(0,1fr);gap:12px;min-height:260px}",
      ".llmwiki-wiki-surface__facet-rail,.llmwiki-wiki-surface__results,.llmwiki-wiki-surface__detail{min-inline-size:0}",
      ".llmwiki-wiki-surface__facet-rail{display:grid;align-content:start;gap:8px}",
      ".llmwiki-wiki-surface__facet-group{display:grid;gap:4px}",
      ".llmwiki-wiki-surface__facet-button{width:100%;text-align:left;padding:7px 8px;min-height:44px}",
      ".llmwiki-wiki-surface__facet-button[aria-pressed=\"true\"]{border-color:var(--text-accent);color:var(--text-accent)}",
      ".llmwiki-wiki-surface__result-list{display:grid;gap:6px;list-style:none;margin:0;padding:0;max-height:480px;overflow:auto}",
      ".llmwiki-wiki-surface__result{display:grid;gap:2px;width:100%;text-align:left;min-height:44px;padding:8px;border:1px solid transparent;background:var(--background-secondary)}",
      ".llmwiki-wiki-surface__result[aria-current=\"true\"]{border-color:var(--text-accent)}",
      ".llmwiki-wiki-surface__result-title{min-inline-size:0;font-weight:700;overflow-wrap:anywhere;word-break:keep-all}",
      ".llmwiki-wiki-surface__result-meta,.llmwiki-wiki-surface__muted{min-inline-size:0;color:var(--text-muted);overflow-wrap:anywhere;word-break:keep-all}",
      ".llmwiki-wiki-surface__trust{display:inline-block;margin-inline-end:5px;color:var(--text-accent)}",
      ".llmwiki-wiki-surface__detail{min-height:260px;max-height:480px;overflow:auto;scrollbar-gutter:stable}",
      ".llmwiki-wiki-surface__body{white-space:pre-wrap;overflow-wrap:anywhere}",
      ".llmwiki-wiki-surface__status{padding:8px;border-inline-start:3px solid var(--text-accent);color:var(--text-muted)}",
      ".llmwiki-wiki-surface__status[data-state=\"error\"],.llmwiki-wiki-surface__status[data-state=\"stale\"]{border-inline-start-color:var(--text-error);color:var(--text-error)}",
      "@media(max-width:833px){.llmwiki-wiki-surface__controls{grid-template-columns:1fr}.llmwiki-wiki-surface__content{grid-template-columns:1fr}.llmwiki-wiki-surface__detail{max-height:none}.llmwiki-wiki-surface__result-list{max-height:300px}}",
      "@media(forced-colors:active){.llmwiki-wiki-surface button[aria-current=\"true\"],.llmwiki-wiki-surface button[aria-pressed=\"true\"]{border:2px solid Highlight}.llmwiki-wiki-surface button:focus-visible,.llmwiki-wiki-surface input:focus-visible,.llmwiki-wiki-surface select:focus-visible{outline-color:Highlight}}",
      "@media(prefers-reduced-motion:reduce){.llmwiki-wiki-surface *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}"
    ].join("\n");
    doc.head.appendChild(style);
  }

  function mountLlmWikiWikiSurface(options) {
    const opts = options || {};
    const container = opts.container;
    if (!container) throw new TypeError("container is required");
    const adapter = opts.readAdapter || root.LLMWikiWikiReadAdapter;
    const service = opts.readService || root.LLMWikiWikiReadService;
    if (!adapter || typeof adapter.browseRead !== "function") throw new TypeError("LLMWikiWikiReadAdapter is required");
    injectStyles(container);
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
    function renderDetail(parent) {
      const detail = state.selection && state.selection.path ? safeRows(state.result && (state.result.rows || state.result.results)).find((row) => row.path === state.selection.path) : null;
      if (!detail) {
        createEl(parent, "p", { text: "결과를 선택하면 읽기 전용 상세가 표시됩니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
        return;
      }
      createEl(parent, "h3", { text: detail.title || detail.path });
      createEl(parent, "p", { text: `${TRUST_LABELS[detail.trust] || "읽기"} · ${detail.path}`, attr: { class: "llmwiki-wiki-surface__result-meta" } });
      if (detail.statement || detail.summary) createEl(parent, "p", { text: detail.statement || detail.summary });
      if (state.bodyState === "loading") createEl(parent, "p", { text: "본문을 불러오는 중입니다.", attr: { class: "llmwiki-wiki-surface__status", role: "status", "aria-live": "polite" } });
      else if (state.bodyState === "ready") createEl(parent, "div", { text: state.body, attr: { class: "llmwiki-wiki-surface__body" } });
      else if (state.bodyState === "stale") createEl(parent, "p", { text: "자료가 변경되어 본문을 표시하지 않았습니다. 결과를 다시 선택해 주세요.", attr: { class: "llmwiki-wiki-surface__status", "data-state": "stale", role: "alert" } });
      else if (state.bodyState === "error") createEl(parent, "p", { text: "본문을 불러오지 못했습니다. 결과를 다시 선택해 주세요.", attr: { class: "llmwiki-wiki-surface__status", "data-state": "error", role: "alert" } });
      else createEl(parent, "p", { text: "표시할 본문이 없습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      const back = createEl(parent, "button", { text: "목록으로 돌아가기", attr: { type: "button", "data-action": "back" } });
      back.onclick = () => { const opener = lastResultButton; state = { ...state, selection: { ...state.selection, path: null, detail_state: "rest" }, body: null, bodyState: "empty" }; render(); focus(opener); };
    }
    function render() {
      if (panelHidden()) {
        if (rootEl) empty(rootEl);
        return;
      }
      if (!rootEl) {
        empty(container);
        rootEl = createEl(container, "section", { attr: { class: "llmwiki-wiki-surface prodigy-full-bleed", "data-surface": "llmwiki-browse", "aria-label": "LLMWiki 탐색" } });
        rootEl.onkeydown = (event) => {
          if (!event || event.key !== "Escape") return;
          if (state.selection && state.selection.path) {
            event.preventDefault();
            const opener = lastResultButton;
            state = { ...state, selection: { ...state.selection, path: null, detail_state: "rest" }, body: null, bodyState: "empty" };
            render();
            focus(opener);
          }
        };
      }
      empty(rootEl);
      const header = createEl(rootEl, "header", { attr: { class: "llmwiki-wiki-surface__header" } });
      createEl(header, "h2", { text: "LLMWiki 탐색", attr: { "data-surface-heading": "llmwiki-browse" } });
      createEl(header, "p", { text: "검증된 스냅샷을 검색하고 읽습니다. 이 화면은 저장하지 않습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      const statusText = state.status === "loading" ? "스냅샷을 불러오는 중입니다." : state.status === "error" ? "LLMWiki 탐색을 불러오지 못했습니다. 다시 시도해 주세요." : state.status === "stale" ? "스냅샷이 변경되어 결과를 다시 확인해야 합니다." : state.status === "empty" ? "조건에 맞는 결과가 없습니다." : "읽기 전용 스냅샷입니다.";
      createEl(header, "p", { text: statusText, attr: { class: "llmwiki-wiki-surface__status", "data-state": state.status, role: state.status === "error" || state.status === "stale" ? "alert" : "status", "aria-live": "polite" } });
      const controls = createEl(rootEl, "div", { attr: { class: "llmwiki-wiki-surface__controls" } });
      const form = createEl(controls, "form", { attr: { class: "llmwiki-wiki-surface__search", role: "search" } });
      const input = createEl(form, "input", { attr: { type: "search", value: state.query, placeholder: "검색어를 입력하세요", "aria-label": "LLMWiki 검색어" } });
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
      const rail = createEl(content, "aside", { attr: { class: "llmwiki-wiki-surface__facet-rail prodigy-utility-card", "data-component": "WikiFacetRail", "aria-label": "LLMWiki 필터" } });
      const facets = state.result && state.result.facets ? state.result.facets : { domains: [], topics: [] };
      facetButtons(rail, "도메인", facets.domains, state.domain, "domain");
      facetButtons(rail, "주제", facets.topics, state.topic, "topic");
      const resultsPanel = createEl(content, "section", { attr: { class: "llmwiki-wiki-surface__results prodigy-utility-card", "data-component": "WikiResultList", "aria-label": "LLMWiki 결과" } });
      const rows = state.result ? safeRows(state.result.rows || state.result.results) : [];
      const listEl = createEl(resultsPanel, "ol", { attr: { class: "llmwiki-wiki-surface__result-list" } });
      rows.forEach((row) => {
        const li = createEl(listEl, "li");
        const button = createEl(li, "button", { attr: { type: "button", class: "llmwiki-wiki-surface__result", "aria-current": state.selection.path === row.path ? "true" : "false" } });
        createEl(button, "span", { text: `${TRUST_LABELS[row.trust] || "읽기"} · ${row.title || row.path}`, attr: { class: "llmwiki-wiki-surface__result-title" } });
        createEl(button, "span", { text: `${row.domain || "unclassified"} · ${row.path}`, attr: { class: "llmwiki-wiki-surface__result-meta" } });
        button.onclick = () => { lastResultButton = button; applyBrowse({ selection: { ...state.selection, path: row.path, detail_state: "loading" } , path: row.path }); };
      });
      if (!rows.length) createEl(resultsPanel, "p", { text: state.status === "loading" ? "스냅샷을 준비하는 중입니다." : "표시할 결과가 없습니다.", attr: { class: "llmwiki-wiki-surface__muted" } });
      const detail = createEl(content, "article", { attr: { class: "llmwiki-wiki-surface__detail prodigy-utility-card", "data-component": "WikiDetailPane", "aria-label": "LLMWiki 상세" } });
      renderDetail(detail);
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
