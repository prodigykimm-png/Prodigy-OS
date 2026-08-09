"use strict";

(function (root) {
  function dependency(name) {
    if (!root[name]) throw new Error(`${name} must load before KnowledgeExplorerRender.`);
    return root[name];
  }

  function setAttr(el, name, value) {
    if (!el) return;
    const setter = el.setAttr || el.setAttribute;
    if (typeof setter === "function") return setter.call(el, name, value);
    el[name] = value;
  }

  function setText(el, value) {
    if (!el) return;
    if (typeof el.setText === "function") return el.setText(value);
    el.textContent = String(value ?? "");
  }

  function empty(el) {
    if (!el) return;
    if (typeof el.empty === "function") return el.empty();
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function createEl(parent, tag, options = {}) {
    if (!parent) return null;
    if (typeof parent.createEl === "function") return parent.createEl(tag, options);
    const el = parent.ownerDocument.createElement(tag);
    if (options.text !== undefined) setText(el, options.text);
    for (const [name, value] of Object.entries(options.attr || {})) el.setAttribute(name, value);
    if (options.disabled) el.disabled = true;
    parent.appendChild(el);
    return el;
  }

  const SEARCH_CSS = `
.knowledge-explorer-shell > .knowledge-explorer-search { grid-column:1 / -1; }
.knowledge-explorer-search { display:flex; flex-wrap:wrap; align-items:end; gap:var(--ke-space-2); min-inline-size:0; width:100%; margin-block-end:var(--ke-space-3); }
.knowledge-explorer-search-label { display:flex; flex:1 1 16rem; flex-direction:column; gap:var(--ke-space-2); min-inline-size:0; color:var(--ke-color-muted); font-size:var(--ke-type-label); }
.knowledge-explorer-search-input { width:100%; min-inline-size:0; min-height:var(--ke-touch-target,44px); padding:var(--ke-space-2) var(--ke-space-3); border:1px solid var(--ke-color-border); border-radius:var(--ke-radius-control); background:var(--ke-color-surface); color:var(--ke-color-text); font:inherit; }
.knowledge-explorer-search-input:focus-visible, .knowledge-explorer-search-clear:focus-visible { outline:2px solid var(--ke-color-accent); outline-offset:2px; }
.knowledge-explorer-search-clear { min-height:var(--ke-touch-target,44px); padding:var(--ke-space-2) var(--ke-space-3); border:1px solid var(--ke-color-border); border-radius:var(--ke-radius-control); background:var(--ke-color-surface-secondary); color:var(--ke-color-text); cursor:pointer; font:inherit; }
.knowledge-explorer-search-clear[disabled] { opacity:.5; cursor:not-allowed; }
.knowledge-explorer-search-status { flex:1 1 100%; min-inline-size:0; margin:0; color:var(--ke-color-muted); font-size:var(--ke-type-body); line-height:var(--ke-leading-body); overflow-wrap:anywhere; }
`;
  function ensureStyle(container) {
    const doc = container && container.ownerDocument ? container.ownerDocument : typeof document !== "undefined" ? document : null;
    const styleId = "knowledge-explorer-view-styles";
    if (doc && doc.getElementById && doc.getElementById(styleId)) return;
    const style = createEl(container, "style", { text: `${dependency("KnowledgeExplorerResponsive").CSS}${SEARCH_CSS}` });
    setAttr(style, "id", styleId);
  }

  function button(parent, options) {
    const control = createEl(parent, "button", {
      text: options.text,
      attr: {
        type: "button",
        class: options.className || "knowledge-explorer-button",
        "data-group": options.group || "",
        "data-kind": options.kind || "",
        "data-key": options.key || "",
        "data-asset-path": options.assetPath || "",
        "data-action": options.action || "",
        "data-selected": options.selected ? "true" : "false",
        "aria-selected": options.selected ? "true" : "false",
        "aria-label": options.ariaLabel || options.text
      },
      disabled: options.disabled
    });
    if (options.description) createEl(control, "span", { text: options.description, attr: { class: "knowledge-explorer-meta" } });
    if (!options.disabled) {
      control.onclick = (event) => {
        if (event && event.preventDefault) event.preventDefault();
        if (options.onAction) options.onAction(event);
      };
      control.onkeydown = (event) => {
        if (!event || event.key === "Tab") return;
        if (["ArrowDown", "ArrowRight"].includes(event.key)) {
          if (options.trapArrows === false) return;
          event.preventDefault();
          if (options.onMove) options.onMove(1, event);
          return;
        }
        if (["ArrowUp", "ArrowLeft"].includes(event.key)) {
          if (options.trapArrows === false) return;
          event.preventDefault();
          if (options.onMove) options.onMove(-1, event);
          return;
        }
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          if (options.onActivate) options.onActivate(event);
          else if (options.onAction) options.onAction(event);
        }
      };
    }
    return control;
  }

  function link(parent, options) {
    const control = createEl(parent, "a", {
      text: options.text,
      attr: { href: "#", role: "link", class: options.className || "knowledge-explorer-row-link", "data-action": "open-beside", "data-asset-path": options.assetPath || "", "aria-label": options.ariaLabel || options.text }
    });
    if (options.disabled) setAttr(control, "aria-disabled", "true");
    const activate = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (!options.disabled && options.onOpen) options.onOpen();
    };
    control.onclick = activate;
    control.onkeydown = (event) => {
      if (event && ["Enter", " "].includes(event.key)) activate(event);
    };
    return control;
  }

  function pane(container, name, title, subtitle, surface) {
    const section = createEl(container, name === "domain" || name === "middle" ? "nav" : "section", { attr: { class: `knowledge-explorer-pane knowledge-explorer-${name}-pane`, "data-pane": name, "aria-label": title, "aria-busy": name === "detail" && surface.state === "loading" ? "true" : "false" } });
    const head = createEl(section, "header", { attr: { class: "knowledge-explorer-pane-head" } });
    const titleWrap = createEl(head, "div", { attr: { class: "knowledge-explorer-pane-title" } });
    createEl(titleWrap, "h2", { text: title, attr: { tabindex: "-1", "data-focus-heading": name } });
    if (subtitle) createEl(titleWrap, "p", { text: subtitle });
    createEl(head, "span", { text: "", attr: { class: "knowledge-explorer-count", "data-state": surface.state } });
    return section;
  }

  function renderSearch(container, query, model, surface, onQuery) {
    const value = typeof query === "string" ? query : "";
    const disabled = surface.state === "disabled";
    const form = createEl(container, "form", { attr: { class: "knowledge-explorer-search", role: "search", "aria-label": "Knowledge Explorer 전체 검색", "data-search-state": value.trim() ? "active" : "idle" } });
    const label = createEl(form, "label", { text: "전체 검색", attr: { class: "knowledge-explorer-search-label" } });
    const input = createEl(label, "input", {
      attr: {
        type: "search",
        class: "knowledge-explorer-search-input",
        "data-group": "search",
        "data-key": "global",
        "data-action": "search",
        "aria-label": "Knowledge Explorer 메타데이터 검색",
        placeholder: "제목·경로·유형·도메인·주제 검색",
        "aria-disabled": disabled ? "true" : "false",
        value
      },
      disabled
    });
    if (input) input.value = value;
    const submit = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (!disabled && typeof onQuery === "function") onQuery(input && typeof input.value === "string" ? input.value : value, event);
    };
    if (form && !disabled) form.onsubmit = submit;
    if (input && !disabled) {
      input.oninput = (event) => {
        if (typeof onQuery === "function") onQuery(event && event.target && typeof event.target.value === "string" ? event.target.value : input.value, event);
      };
      input.onkeydown = (event) => {
        if (event && event.key === "Enter") {
          submit(event);
          return;
        }
        if (event && event.key === "Escape") {
          event.preventDefault();
          if (typeof onQuery === "function") onQuery("", event);
        }
      };
    }
    button(form, {
      text: "검색어 지우기",
      className: "knowledge-explorer-search-clear",
      group: "search",
      key: "clear",
      action: "clear-search",
      ariaLabel: "전체 검색어 지우기",
      disabled: disabled || !value.trim(),
      trapArrows: false,
      onAction: (event) => onQuery("", event)
    });
    if (value.trim()) {
      const count = Number(model && model.assets && model.assets.length) || 0;
      createEl(form, "p", {
        text: count ? `검색 결과 ${count}개` : "검색 결과가 없습니다. 검색어를 지우고 다시 시도하세요.",
        attr: { class: "knowledge-explorer-search-status", "data-search-results": String(count), "data-state": count ? "matched" : "no-match", "aria-live": "polite" }
      });
    }
  }
  function addBack(parent, focusPane, onAction, disabled) {
    if (focusPane === "domain") return;
    const label = focusPane === "detail" ? "주제·자료로 돌아가기" : "도메인으로 돌아가기";
    button(parent, { text: label, className: "knowledge-explorer-back knowledge-explorer-drill-back", action: "back", ariaLabel: label, disabled, onAction: (event) => onAction({ type: "back" }, event) });
  }

  function renderDomain(container, model, selection, surface, onAction, drill) {
    const State = dependency("KnowledgeExplorerState");
    const domains = State.listDomains(model);
    const section = pane(container, "domain", "도메인", `${domains.length}개 도메인`, surface);
    const scroll = createEl(section, "div", { attr: { class: "knowledge-explorer-scroll-domain knowledge-explorer-domain-list", "data-scroll-owner": "domain-nav" } });
    domains.forEach((domain) => {
      const selected = State.normalizedKey(domain.key) === State.normalizedKey(selection.domainKey);
      button(scroll, { text: domain.label || domain.key, group: "domain", kind: "domain", key: domain.key, selected, description: String(domain.resource_count ? `${domain.count} / ${domain.resource_count}` : domain.count || 0), disabled: surface.state === "disabled", onMove: (delta, event) => onAction({ type: "move-domain", delta }, event), onAction: (event) => onAction({ type: "set-domain", domainKey: domain.key, drill }, event), onActivate: (event) => onAction({ type: "activate" }, event) });
    });
    if (!domains.length) createEl(scroll, "p", { text: "탐색할 도메인이 없습니다.", attr: { class: "knowledge-explorer-empty" } });
  }

  function renderMiddle(container, model, selection, surface, onAction, drill) {
    const State = dependency("KnowledgeExplorerState");
    const domain = State.findCurrentDomain(model, selection);
    const section = pane(container, "middle", "주제 / 자료", domain ? State.domainLabel(model, domain.key) : "선택한 도메인이 없습니다.", surface);
    const scroll = createEl(section, "div", { attr: { class: "knowledge-explorer-scroll-topic knowledge-explorer-middle-groups", "data-scroll-owner": "topic-nav" } });
    addBack(scroll, selection.focusPane, onAction, surface.state === "disabled");
    for (const group of [{ title: "주제", kind: "topic" }, { title: "자료", kind: "resource" }]) {
      const entries = State.middleSections(domain).filter((item) => item.kind === group.kind);
      const groupEl = createEl(scroll, "section", { attr: { class: "knowledge-explorer-group", "data-kind": group.kind } });
      createEl(groupEl, "h3", { text: `${group.title} ${entries.length}`, attr: { class: "knowledge-explorer-group-title" } });
      if (!entries.length) createEl(groupEl, "p", { text: `${group.title}가 없습니다.`, attr: { class: "knowledge-explorer-empty" } });
      entries.forEach((item) => {
        const selected = State.normalizedKey(item.kind) === State.normalizedKey(selection.middleKind) && State.normalizedKey(item.key) === State.normalizedKey(selection.middleKey);
        button(groupEl, { text: State.sectionLabel(item), group: "middle", kind: item.kind, key: item.key, selected, description: String(item.count), disabled: surface.state === "disabled", onMove: (delta, event) => onAction({ type: "move-middle", delta }, event), onAction: (event) => onAction({ type: "set-middle", middleKind: item.kind, middleKey: item.key, drill }, event), onActivate: (event) => onAction({ type: "activate" }, event) });
      });
    }
  }

  function renderDetailSections(parent, sections, onOpenBeside, disabled) {
    for (const detail of sections) {
      const block = createEl(parent, "section", { attr: { class: "knowledge-explorer-asset-section knowledge-explorer-detail-section", "data-section-key": detail.key || "" } });
      createEl(block, "h3", { text: detail.title || "세부 항목" });
      if (detail.summary) createEl(block, "p", { text: detail.summary, attr: { class: "knowledge-explorer-detail-summary" } });
      const list = Array.isArray(detail.items) ? detail.items : [];
      if (!list.length) createEl(block, "p", { text: detail.empty || "항목이 없습니다.", attr: { class: "knowledge-explorer-detail-empty" } });
      for (const item of list) {
        const title = item.title || item.path || item.label || "제목 없음";
        const row = createEl(block, "article", { attr: { class: "knowledge-explorer-detail-item", "data-category": item.category || "", "data-reason": item.reason || "", "data-clickable": item.clickable === false ? "false" : "true" } });
        if (item.path && item.clickable !== false) link(row, { text: title, className: "knowledge-explorer-detail-item-link", assetPath: item.path, disabled, onOpen: () => onOpenBeside(item.path) });
        else createEl(row, "strong", { text: title, attr: { class: "knowledge-explorer-detail-title" } });
        const metadataLabels = {
          category: "분류",
          reason: "연결 이유",
          provenance_label: "연결 근거",
          provenance_source_path: "근거 문서",
          type: "유형",
          kind: "구분"
        };
        const meta = Object.entries(metadataLabels).filter(([key]) => item[key]).map(([key, label]) => `${label}: ${item[key]}`);
        if (meta.length) createEl(row, "p", { text: meta.join(" · "), attr: { class: "knowledge-explorer-detail-item-meta" } });
        if (item.detail || item.note || item.summary || item.description) createEl(row, "p", { text: item.detail || item.note || item.summary || item.description, attr: { class: "knowledge-explorer-detail-item-note" } });
        if (item.path && item.clickable === false) createEl(row, "p", { text: "존재하지 않는 파일이라 옆 열기가 비활성화되었습니다.", attr: { class: "knowledge-explorer-detail-item-note", "data-state": "warning" } });
      }
    }
  }

  function assetMetadata(item) {
    const labels = {
      knowledge: "지식", permanent_note: "기존 지식", literature_note: "문헌 자료",
      venue: "장소", auction_region: "경매 지역", Venues: "장소", Regions: "경매 지역",
      References: "문헌 자료"
    };
    return labels[item && item.type] || labels[item && item.resource_section] || "";
  }

  function renderDetail(container, model, selection, surface, onAction, onOpenBeside, briefOptions, candidateInbox) {
    const State = dependency("KnowledgeExplorerState");
    const domain = State.findCurrentDomain(model, selection);
    const selectedSection = State.findCurrentSection(model, selection);
    const assets = State.sectionAssets(selectedSection);
    const asset = State.findCurrentAsset(model, selection);
    const section = pane(container, "detail", "상세", domain ? `${State.domainLabel(model, domain.key)} · ${State.sectionLabel(selectedSection)}` : "선택한 항목이 없습니다.", surface);
    const scroll = createEl(section, "div", { attr: { class: "knowledge-explorer-scroll-detail knowledge-explorer-surface", "data-scroll-owner": "detail-pane" } });
    addBack(scroll, selection.focusPane, onAction, surface.state === "disabled");
    const status = createEl(scroll, "div", { attr: { class: "knowledge-explorer-status", "data-state": surface.state } });
    createEl(status, "div", { text: surface.detail, attr: { class: "knowledge-explorer-meta" } });
    dependency("KnowledgeExplorerBriefRender").renderBrief(scroll, {
      ...(briefOptions || {}),
      disabled: surface.state === "disabled",
      onOpenBeside
    });
    if (candidateInbox && root.KnowledgeCandidateView) root.KnowledgeCandidateView.renderCandidateInbox(scroll, candidateInbox);
    renderDetailSections(scroll, State.detailSectionsFor(model, selection), onOpenBeside, surface.state === "disabled");
    const assetSection = createEl(scroll, "section", { attr: { class: "knowledge-explorer-asset-section" } });
    createEl(assetSection, "h3", { text: selectedSection ? State.sectionLabel(selectedSection) : "항목" });
    if (!assets.length) createEl(assetSection, "p", { text: "이 구역에는 항목이 없습니다.", attr: { class: "knowledge-explorer-detail-empty" } });
    assets.forEach((item) => {
      const selected = State.normalizedKey(item.path) === State.normalizedKey(selection.assetPath);
      const card = createEl(assetSection, "article", { attr: { class: "knowledge-explorer-detail-card" } });
      button(card, { text: State.assetLabel(item), group: "detail", kind: item.kind || "asset", key: item.path || "", assetPath: item.path || "", selected, description: assetMetadata(item), disabled: surface.state === "disabled", onMove: (delta, event) => onAction({ type: "move-asset", delta }, event), onAction: (event) => onAction({ type: "set-asset", assetPath: item.path }, event) });
      if (item.path) link(card, { text: "옆에 열기", assetPath: item.path, disabled: surface.state === "disabled", onOpen: () => onOpenBeside(item.path) });
    });
  }

  function renderExplorer(container, model, options = {}) {
    const State = dependency("KnowledgeExplorerState");
    const Responsive = dependency("KnowledgeExplorerResponsive");
    if (!container) return null;
    empty(container);
    ensureStyle(container);
    const sourceModel = model || { domains: [] };
    const query = options.searchQuery !== undefined ? options.searchQuery : options.query;
    const visibleModel = typeof State.filterModelByQuery === "function" ? State.filterModelByQuery(sourceModel, query) : sourceModel;
    const selection = State.createSelectionState(visibleModel, options.selection || options.state || {});
    const surface = State.surfaceCopy(options.surfaceState, visibleModel);
    const layout = options.layout || Responsive.layoutForWidth(options.logicalWidth);
    const visible = Responsive.visiblePanes(layout, selection.focusPane);
    const dispatch = typeof options.onAction === "function" ? options.onAction : () => {};
    const open = typeof options.onOpenBeside === "function" ? options.onOpenBeside : () => {};
    const onQuery = typeof options.onSearch === "function"
      ? options.onSearch
      : (nextQuery, event) => dispatch({ type: "set-query", query: nextQuery }, event);
    setAttr(container, "data-shell", "knowledge-explorer-shell");
    setAttr(container, "data-layout", layout);
    setAttr(container, "data-surface-state", surface.state);
    setAttr(container, "data-focus-pane", selection.focusPane);
    setAttr(container, "data-selected-domain", selection.domainKey || "");
    setAttr(container, "data-selected-middle", selection.middleKey || "");
    setAttr(container, "data-selected-asset", selection.assetPath || "");
    setAttr(container, "data-search-query", typeof query === "string" ? query : "");
    setAttr(container, "data-search-results", String((visibleModel.assets || []).length));
    const searchState = typeof query === "string" && query.trim() ? ((visibleModel.assets || []).length ? "matched" : "no-match") : "idle";
    setAttr(container, "data-search-state", searchState);
    const shell = createEl(container, "section", { attr: { class: "knowledge-explorer-shell", "data-shell": "knowledge-explorer-shell", "data-layout": layout, "data-focus-pane": selection.focusPane } });
    renderSearch(shell, query, visibleModel, surface, onQuery);
    if (visible.includes("domain")) renderDomain(shell, visibleModel, selection, surface, dispatch, layout === "narrow");
    if (visible.includes("middle")) renderMiddle(shell, visibleModel, selection, surface, dispatch, layout === "narrow");
    if (visible.includes("detail")) renderDetail(shell, visibleModel, selection, surface, dispatch, open, options.brief, options.candidateInbox);
    return container;
  }

  function findFocusable(container, group, key) {
    const matches = (node) => {
      if (!node) return null;
      const attr = node.attr || (node.getAttribute ? { "data-group": node.getAttribute("data-group"), "data-key": node.getAttribute("data-key"), "data-action": node.getAttribute("data-action") } : {});
      if ((group === "back" && attr["data-action"] === "back") || (attr["data-group"] === group && (!key || attr["data-key"] === key))) return node;
      for (const child of node.children || []) {
        const found = matches(child);
        if (found) return found;
      }
      return null;
    };
    if (container && container.querySelector) {
      return container.querySelector(group === "back" ? '[data-action="back"]' : `[data-group="${group}"]${key ? `[data-key="${key}"]` : ""}`);
    }
    return matches(container);
  }

  const api = Object.freeze({ renderExplorer, empty, findFocusable });
  root.KnowledgeExplorerRender = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
