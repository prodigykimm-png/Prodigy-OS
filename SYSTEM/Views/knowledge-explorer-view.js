"use strict";

(function (root) {
  function dependencies() {
    const State = root.KnowledgeExplorerState;
    const Render = root.KnowledgeExplorerRender;
    const Responsive = root.KnowledgeExplorerResponsive;
    const Brief = root.KnowledgeExplorerBriefService;
    const HubAdapter = root.KnowledgeExplorerHubAdapter;
    if (!State || !Render || !Responsive || !Brief) throw new Error("Knowledge Explorer state, render, responsive, and Brief modules must load before the view.");
    return { State, Render, Responsive, Brief, HubAdapter };
  }

  function logicalWidth(container, fallback) {
    if (Number.isFinite(Number(fallback))) return Number(fallback);
    if (container && Number.isFinite(Number(container.clientWidth)) && container.clientWidth > 0) return container.clientWidth;
    if (typeof window !== "undefined" && Number.isFinite(Number(window.innerWidth))) return window.innerWidth;
    return 1280;
  }

  function focusControl(container, selection, returnFocus) {
    const { Render } = dependencies();
    const target = returnFocus
      ? Render.findFocusable(container, returnFocus.group, returnFocus.key)
      : Render.findFocusable(container, selection.focusPane, selection.focusPane === "domain" ? selection.domainKey : selection.focusPane === "middle" ? selection.middleKey : selection.assetPath);
    if (target && typeof target.focus === "function") target.focus();
  }

  function renderKnowledgeExplorer(container, model, options = {}) {
    const { Render, Responsive } = dependencies();
    return Render.renderExplorer(container, model || { domains: [] }, {
      ...options,
      layout: options.layout || Responsive.layoutForWidth(logicalWidth(container, options.logicalWidth))
    });
  }

  function mountKnowledgeExplorer(options = {}) {
    const { State, Responsive, Brief } = dependencies();
    const container = options.container;
    const model = options.model || { domains: [] };
    let query = options.searchQuery !== undefined ? options.searchQuery : options.query;
    if (typeof query !== "string") query = "";
    const filteredModel = () => State.filterModelByQuery(model, query);
    let selection = State.createSelectionState(filteredModel(), options.selection || {});
    let surfaceState = State.normalizeString(options.surfaceState) || "rest";
    let width = logicalWidth(container, options.logicalWidth);
    let returnFocus = null;
    let resizeObserver = null;
    let resizeHandler = null;
    let briefRequestId = 0;
    let briefAbortController = null;
    const briefService = options.briefService || Brief.createKnowledgeExplorerBriefService({ aiProviderService: {}, providerConfigService: {} });
    const briefsByDomain = new Map();
    let hydrationRequestId = 0;
    let selectedHydration = null;
    const CandidateView = root.KnowledgeCandidateView;
    const candidateInbox = CandidateView && typeof CandidateView.createCandidateInboxController === "function"
      ? CandidateView.createCandidateInboxController(options, () => rerender()) : null;

    function selectedAsset() {
      return State.findCurrentAsset(filteredModel(), selection);
    }

    function isCurrentHydration(path, requestId) {
      const asset = selectedAsset();
      return requestId === hydrationRequestId && asset && asset.path === path;
    }

    function modelForRender() {
      const asset = selectedAsset();
      const { HubAdapter } = dependencies();
      if (!asset || !selectedHydration || selectedHydration.path !== asset.path || !HubAdapter) return model;
      const detailSections = model && model.detail_sections_by_asset_path && typeof model.detail_sections_by_asset_path === "object"
        ? model.detail_sections_by_asset_path : {};
      const key = asset.path.toLocaleLowerCase("en-US");
      return {
        ...model,
        detail_sections_by_asset_path: {
          ...detailSections,
          [key]: HubAdapter.appendHydrationSection(detailSections[key], selectedHydration)
        }
      };
    }

    function hydrateSelectedAsset() {
      const asset = selectedAsset();
      if (!asset || typeof options.hydrateAsset !== "function") return null;
      const requestId = ++hydrationRequestId;
      selectedHydration = { status: "loading", path: asset.path };
      rerender();
      return Promise.resolve(options.hydrateAsset(asset)).then((result) => {
        if (isCurrentHydration(asset.path, requestId)) {
          selectedHydration = result && typeof result === "object" ? result : { status: "error", path: asset.path };
          rerender();
        }
        return result;
      }, () => {
        if (isCurrentHydration(asset.path, requestId)) {
          selectedHydration = { status: "error", path: asset.path };
          rerender();
        }
        return null;
      });
    }

    function briefPacket() {
      const domain = State.findCurrentDomain(model, selection);
      const signalsByDomain = model && model.brief_signals_by_domain && typeof model.brief_signals_by_domain === "object" ? model.brief_signals_by_domain : {};
      return { schema_version: 1, domain: domain ? domain.key : "unclassified", domain_label: domain ? State.domainLabel(model, domain.key) : "미분류", signals: signalsByDomain[domain && domain.key] || {} };
    }

    function currentBrief() {
      const packet = briefPacket();
      const key = packet.domain;
      if (!briefsByDomain.has(key)) {
        const deterministic = briefService.buildDeterministicBrief(packet);
        briefsByDomain.set(key, { phase: "deterministic", lines: deterministic.lines.slice(), source_ids: deterministic.source_ids.slice(), ai_summary: null, redacted_status: "" });
      }
      return briefsByDomain.get(key);
    }

    function saveBrief(next) {
      briefsByDomain.set(briefPacket().domain, next);
    }

    async function requestBrief() {
      const requestId = ++briefRequestId;
      briefAbortController = new AbortController();
      const hydration = hydrateSelectedAsset();
      if (hydration) await hydration;
      if (requestId !== briefRequestId) return;
      const packet = briefPacket();
      const deterministic = currentBrief();
      saveBrief({ ...deterministic, phase: "loading", ai_summary: null, redacted_status: "" });
      rerender();
      try {
        const result = await briefService.generateBrief(packet, { app: options.app, signal: briefAbortController.signal, requestTag: `knowledge-explorer:${packet.domain}:${requestId}` });
        if (requestId !== briefRequestId) return;
        const phase = result.status === "ai" ? "ai" : result.status === "cancelled" ? "cancelled" : "fallback";
        saveBrief({ phase, lines: result.brief_lines.slice(), source_ids: result.deterministic && Array.isArray(result.deterministic.source_ids) ? result.deterministic.source_ids.slice() : deterministic.source_ids.slice(), ai_summary: result.ai_summary, redacted_status: result.redacted_status || "" });
      } catch (_error) {
        if (requestId !== briefRequestId) return;
        saveBrief({ ...deterministic, phase: "fallback", redacted_status: "provider error: [redacted]" });
      }
      rerender();
    }

    function cancelBrief() {
      if (briefAbortController) briefAbortController.abort();
      briefRequestId += 1;
      saveBrief({ ...currentBrief(), phase: "cancelled", ai_summary: null, redacted_status: "request cancelled" });
      rerender();
    }

    function layout() {
      return Responsive.layoutForWidth(width);
    }

    function rerender() {
      renderKnowledgeExplorer(container, modelForRender(), {
        ...options,
        selection,
        searchQuery: query,
        surfaceState,
        logicalWidth: width,
        layout: layout(),
        onOpenBeside: options.onOpenBeside,
        onAction: dispatchFromControl,
        brief: { brief: currentBrief(), onRequest: requestBrief, onCancel: cancelBrief },
        candidateInbox: candidateInbox && candidateInbox.renderOptions(surfaceState === "disabled", (action) => { if (action && action.candidateId) returnFocus = { group: "candidate", key: action.candidateId }; })
      });
      if (returnFocus) {
        focusControl(container, selection, returnFocus);
        returnFocus = null;
      }
      return api;
    }

    function controlIdentity(action, event) {
      const target = event && (event.currentTarget || event.target);
      const attr = target && (target.attr || (target.getAttribute ? { group: target.getAttribute("data-group"), key: target.getAttribute("data-key") } : {}));
      if (attr && attr.group) return { group: attr.group, key: attr.key || "" };
      if (action.type === "back") return { group: selection.focusPane === "detail" ? "middle" : "domain", key: selection.focusPane === "detail" ? selection.middleKey : selection.domainKey };
      return null;
    }

    function applyQuery(nextQuery) {
      const previousAsset = selectedAsset();
      query = typeof nextQuery === "string" ? nextQuery : "";
      selection = State.createSelectionState(filteredModel(), selection);
      const nextAsset = selectedAsset();
      if (!previousAsset || !nextAsset || previousAsset.path !== nextAsset.path) {
        hydrationRequestId += 1;
        selectedHydration = null;
      }
      returnFocus = { group: "search", key: "global" };
      rerender();
      return selection;
    }
    function dispatchFromControl(action, event) {
      const next = action || {};
      const type = State.normalizeString(next.type);
      if (["set-query", "search", "clear-query", "clear-search", "set-search", "set-search-query"].includes(type)) return applyQuery(next.query, event);
      const currentLayout = layout();
      const origin = controlIdentity(next, event);
      const nextAction = { ...next };
      if (currentLayout === "compact" && next.type === "set-domain") nextAction.focusPane = "middle";
      if (currentLayout === "compact" && next.type === "set-middle") nextAction.focusPane = "detail";
      selection = State.reduceSelectionState(filteredModel(), selection, nextAction);
      if (nextAction.focusPane) selection = State.reduceSelectionState(filteredModel(), selection, { type: "focus-pane", focusPane: nextAction.focusPane });
      if (next.type === "back") returnFocus = origin;
      rerender();
      if (next.type === "set-middle" || next.type === "set-asset" || next.type === "move-asset") void hydrateSelectedAsset();
      return selection;
    }

    function dispatch(action) {
      const next = action || {};
      if (["set-query", "search", "clear-query", "clear-search", "set-search", "set-search-query"].includes(State.normalizeString(next.type))) return applyQuery(next.query);
      selection = State.reduceSelectionState(filteredModel(), selection, next);
      rerender();
      if (next.type === "set-middle" || next.type === "set-asset" || next.type === "move-asset") void hydrateSelectedAsset();
      return selection;
    }

    function setLogicalWidth(nextWidth) {
      width = logicalWidth(container, nextWidth);
      rerender();
      return layout();
    }

    function observeResize() {
      if (typeof ResizeObserver !== "undefined" && container) {
        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries && entries[0];
          if (entry && entry.contentRect && Number.isFinite(entry.contentRect.width)) setLogicalWidth(entry.contentRect.width);
        });
        resizeObserver.observe(container);
      } else if (typeof window !== "undefined" && window.addEventListener) {
        resizeHandler = () => setLogicalWidth();
        window.addEventListener("resize", resizeHandler);
      }
    }

    const api = {
      container,
      model,
      state: () => selection,
      searchQuery: () => query,
      setSearchQuery: (nextQuery) => applyQuery(nextQuery),
      dispatch,
      render: rerender,
      setLogicalWidth,
      setSurfaceState(nextState) {
        surfaceState = State.normalizeString(nextState) || "rest";
        rerender();
        return surfaceState;
      },
      retrySelectedAsset: hydrateSelectedAsset,
      destroy() {
        if (resizeObserver) resizeObserver.disconnect();
        if (resizeHandler && typeof window !== "undefined" && window.removeEventListener) window.removeEventListener("resize", resizeHandler);
        dependencies().Render.empty(container);
      }
    };

    rerender();
    observeResize();
    return api;
  }

  const Responsive = root.KnowledgeExplorerResponsive;
  const api = Object.freeze({
    STYLE_ID: "knowledge-explorer-view-styles",
    SHELL_CLASS: "knowledge-explorer-shell",
    createSelectionState(model, seed) { return dependencies().State.createSelectionState(model, seed); },
    reduceSelectionState(model, state, action) { return dependencies().State.reduceSelectionState(model, state, action); },
    filterModelByQuery(model, query) { return dependencies().State.filterModelByQuery(model, query); },
    renderKnowledgeExplorer,
    mountKnowledgeExplorer,
    layoutForWidth(width) { return (Responsive || dependencies().Responsive).layoutForWidth(width); }
  });

  root.KnowledgeExplorerView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
