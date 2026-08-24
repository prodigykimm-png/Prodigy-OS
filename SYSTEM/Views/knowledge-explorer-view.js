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
  function readNodeAttr(node, name) {
    if (!node) return "";
    if (node.attr && node.attr[name] !== undefined) return String(node.attr[name]);
    if (node.getAttribute) return String(node.getAttribute(name) || "");
    return "";
  }

  function walkNodes(node, visitor) {
    if (!node) return;
    visitor(node);
    Array.from(node.children || []).forEach((child) => walkNodes(child, visitor));
  }

  function focusIdentity(node) {
    if (!node) return null;
    const group = readNodeAttr(node, "data-group");
    const key = readNodeAttr(node, "data-key");
    const action = readNodeAttr(node, "data-action");
    if (group) return { group, key };
    if (action === "back") return { group: "back", key: "" };
    return null;
  }

  function isContained(container, node) {
    if (!container || !node) return false;
    if (typeof container.contains === "function") return container.contains(node);
    let found = false;
    walkNodes(container, (candidate) => { if (candidate === node) found = true; });
    return found;
  }

  function captureProjection(container, fallbackFocus) {
    const snapshot = { focus: fallbackFocus || null, scroll: [] };
    const documentRef = container && container.ownerDocument;
    const active = documentRef && documentRef.activeElement;
    if (active && isContained(container, active)) snapshot.focus = focusIdentity(active) || snapshot.focus;
    walkNodes(container, (node) => {
      const owner = readNodeAttr(node, "data-scroll-owner");
      if (!owner) return;
      snapshot.scroll.push({
        owner,
        top: Number.isFinite(Number(node.scrollTop)) ? Number(node.scrollTop) : null,
        left: Number.isFinite(Number(node.scrollLeft)) ? Number(node.scrollLeft) : null
      });
    });
    return snapshot;
  }

  function restoreProjection(container, snapshot, selection, returnFocus) {
    if (!snapshot) return false;
    const { Render } = dependencies();
    const focus = returnFocus || snapshot.focus;
    let focused = false;
    if (focus) {
      const target = focus.group === "back"
        ? Render.findFocusable(container, "back", "")
        : Render.findFocusable(container, focus.group, focus.key);
      if (target && typeof target.focus === "function") {
        target.focus();
        focused = true;
      }
    }
    if (!focused && selection && (returnFocus || snapshot.focus)) {
      const target = Render.findFocusable(container, selection.focusPane, selection.focusPane === "domain" ? selection.domainKey : selection.focusPane === "middle" ? selection.middleKey : selection.assetPath);
      if (target && typeof target.focus === "function") {
        target.focus();
        focused = true;
      }
    }
    const restored = {};
    (snapshot.scroll || []).forEach((position) => { restored[position.owner] = position; });
    walkNodes(container, (node) => {
      const owner = readNodeAttr(node, "data-scroll-owner");
      const position = owner && restored[owner];
      if (!position) return;
      if (position.top !== null) node.scrollTop = position.top;
      if (position.left !== null) node.scrollLeft = position.left;
    });
    return focused;
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
    const resizeTarget = options.resizeTarget || container;
    const model = options.model || { domains: [] };
    let query = options.searchQuery !== undefined ? options.searchQuery : options.query;
    if (typeof query !== "string") query = "";
    const filteredModel = () => State.filterModelByQuery(model, query);
    let selection = State.createSelectionState(filteredModel(), options.selection || {});
    let surfaceState = State.normalizeString(options.surfaceState) || "rest";
    let width = logicalWidth(resizeTarget, options.logicalWidth);
    let layoutGeneration = 0;
    let returnFocus = null;
    let lastFocus = null;
    let destroyed = false;
    let resizeObserver = null;
    let resizeHandler = null;
    let briefRequestId = 0;
    let briefAbortController = null;
    let briefInFlight = null;
    const briefService = options.briefService || Brief.createKnowledgeExplorerBriefService({ aiProviderService: {}, providerConfigService: {} });
    const briefsByDomain = new Map();
    let hydrationRequestId = 0;
    let hydrationAbortController = null;
    let hydrationInFlight = null;
    let selectedHydration = null;
    const CandidateView = root.KnowledgeCandidateView;
    let candidateRenderSuppressed = false;
    const candidateInbox = CandidateView && typeof CandidateView.createCandidateInboxController === "function"
      ? CandidateView.createCandidateInboxController({
        ...options,
        onCandidateRemoved: (info) => {
          if (info && info.next && info.next.candidate_id) {
            returnFocus = { group: "candidate", key: info.next.candidate_id };
            return;
          }
          const configured = typeof options.candidateFocusFallback === "function"
            ? options.candidateFocusFallback(info)
            : options.candidateFocusFallback;
          returnFocus = configured && configured.group
            ? { group: configured.group, key: configured.key || "" }
            : { group: "search", key: "global" };
        }
      }, () => { if (!candidateRenderSuppressed) rerender(); }) : null;

    function selectedAsset() {
      return State.findCurrentAsset(filteredModel(), selection);
    }

    function isCurrentHydration(path, requestId) {
      const asset = selectedAsset();
      return !destroyed && requestId === hydrationRequestId && asset && asset.path === path;
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
      if (destroyed || !asset || typeof options.hydrateAsset !== "function") return null;
      if (hydrationInFlight && hydrationInFlight.path === asset.path) return hydrationInFlight.promise;
      if (hydrationInFlight && hydrationAbortController && typeof hydrationAbortController.abort === "function") hydrationAbortController.abort();
      const requestId = ++hydrationRequestId;
      const AbortControllerCtor = typeof AbortController === "function" ? AbortController : null;
      hydrationAbortController = AbortControllerCtor ? new AbortControllerCtor() : null;
      selectedHydration = { status: "loading", path: asset.path };
      const projection = captureProjection(container, lastFocus);
      rerender(projection);
      let hydrationResult;
      try {
        hydrationResult = options.hydrateAsset(asset, {
          signal: hydrationAbortController ? hydrationAbortController.signal : undefined,
          requestTag: `knowledge-explorer-hydration:${asset.path}:${requestId}`
        });
      } catch (error) {
        hydrationResult = Promise.reject(error);
      }
      const settleHydration = () => {
        if (hydrationInFlight && hydrationInFlight.requestId === requestId) {
          hydrationInFlight = null;
          hydrationAbortController = null;
        }
      };
      const promise = Promise.resolve(hydrationResult).then((result) => {
        if (isCurrentHydration(asset.path, requestId)) {
          selectedHydration = result && typeof result === "object" ? result : { status: "error", path: asset.path };
          settleHydration();
          rerender();
        }
        return result;
      }, () => {
        if (isCurrentHydration(asset.path, requestId)) {
          selectedHydration = { status: "error", path: asset.path };
          settleHydration();
          rerender();
        }
        return null;
      }).finally(settleHydration);
      hydrationInFlight = { path: asset.path, requestId, promise };
      return promise;
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

    function requestBrief() {
      if (destroyed) return Promise.resolve(null);
      if (briefInFlight) return briefInFlight;
      const requestId = ++briefRequestId;
      if (briefAbortController && typeof briefAbortController.abort === "function") briefAbortController.abort();
      const AbortControllerCtor = typeof AbortController === "function" ? AbortController : null;
      briefAbortController = AbortControllerCtor ? new AbortControllerCtor() : null;
      const operation = (async () => {
        const hydration = hydrateSelectedAsset();
        if (hydration) await hydration;
        if (destroyed || requestId !== briefRequestId) return null;
        const packet = briefPacket();
        const deterministic = currentBrief();
        saveBrief({ ...deterministic, phase: "loading", ai_summary: null, redacted_status: "" });
        rerender();
        try {
          const result = await briefService.generateBrief(packet, {
            app: options.app,
            signal: briefAbortController ? briefAbortController.signal : undefined,
            requestTag: `knowledge-explorer:${packet.domain}:${requestId}`
          });
          if (destroyed || requestId !== briefRequestId) return null;
          const phase = result.status === "ai" ? "ai" : result.status === "cancelled" ? "cancelled" : "fallback";
          saveBrief({
            phase,
            lines: Array.isArray(result.brief_lines) ? result.brief_lines.slice() : deterministic.lines.slice(),
            source_ids: result.deterministic && Array.isArray(result.deterministic.source_ids) ? result.deterministic.source_ids.slice() : deterministic.source_ids.slice(),
            ai_summary: result.ai_summary,
            redacted_status: result.redacted_status || ""
          });
        } catch (_error) {
          if (destroyed || requestId !== briefRequestId) return null;
          saveBrief({ ...deterministic, phase: "fallback", redacted_status: "provider error: [redacted]" });
        }
        if (!destroyed && requestId === briefRequestId) rerender();
        return null;
      })();
      const wrapped = operation.finally(() => {
        if (briefInFlight === wrapped) {
          briefInFlight = null;
          briefAbortController = null;
        }
      });
      briefInFlight = wrapped;
      return wrapped;
    }

    function cancelBrief() {
      if (destroyed) return false;
      if (briefAbortController && typeof briefAbortController.abort === "function") briefAbortController.abort();
      briefAbortController = null;
      briefRequestId += 1;
      briefInFlight = null;
      saveBrief({ ...currentBrief(), phase: "cancelled", ai_summary: null, redacted_status: "request cancelled" });
      rerender();
      return true;
    }

    function layout() {
      return Responsive.layoutForWidth(width);
    }

    function rerender(projection) {
      if (destroyed) return api;
      const snapshot = projection || captureProjection(container, lastFocus);
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
      restoreProjection(container, snapshot, selection, returnFocus);
      if (returnFocus) returnFocus = null;
      return api;
    }

    function controlIdentity(action, event) {
      const target = event && (event.currentTarget || event.target);
      const attr = target && (target.attr || (target.getAttribute ? { group: target.getAttribute("data-group"), key: target.getAttribute("data-key") } : {}));
      if (attr && attr.group) return { group: attr.group, key: attr.key || "" };
      if (action.type === "back") return { group: selection.focusPane === "detail" ? "middle" : "domain", key: selection.focusPane === "detail" ? selection.middleKey : selection.domainKey };
      return null;
    }
    function invalidateBrief() {
      briefRequestId += 1;
      if (briefAbortController && typeof briefAbortController.abort === "function") briefAbortController.abort();
      briefAbortController = null;
      briefInFlight = null;
    }

    function invalidateHydration() {
      hydrationRequestId += 1;
      if (hydrationAbortController && typeof hydrationAbortController.abort === "function") hydrationAbortController.abort();
      hydrationAbortController = null;
      hydrationInFlight = null;
    }
    function applyQuery(nextQuery, event) {
      const previousAsset = selectedAsset();
      const origin = controlIdentity({ type: "set-query" }, event) || { group: "search", key: "global" };
      query = typeof nextQuery === "string" ? nextQuery : "";
      selection = State.createSelectionState(filteredModel(), selection);
      const nextAsset = selectedAsset();
      if (!previousAsset || !nextAsset || previousAsset.path !== nextAsset.path) {
        invalidateHydration();
        selectedHydration = null;
      }
      invalidateBrief();
      lastFocus = origin;
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
      if (origin) lastFocus = origin;
      const nextAction = { ...next };
      if (currentLayout === "compact" && next.type === "set-domain") nextAction.focusPane = "middle";
      if (currentLayout === "compact" && next.type === "set-middle") nextAction.focusPane = "detail";
      if (["set-domain", "set-middle", "set-asset", "move-domain", "move-middle", "move-asset"].includes(type)) invalidateBrief();
      selection = State.reduceSelectionState(filteredModel(), selection, nextAction);
      if (nextAction.focusPane) selection = State.reduceSelectionState(filteredModel(), selection, { type: "focus-pane", focusPane: nextAction.focusPane });
      if (next.type === "back") returnFocus = origin;
      rerender();
      if (["set-middle", "set-asset", "move-asset"].includes(type)) void hydrateSelectedAsset();
      return selection;
    }
    function dispatch(action) {
      const next = action || {};
      const type = State.normalizeString(next.type);
      if (["set-query", "search", "clear-query", "clear-search", "set-search", "set-search-query"].includes(type)) return applyQuery(next.query);
      if (["set-domain", "set-middle", "set-asset", "move-domain", "move-middle", "move-asset"].includes(type)) invalidateBrief();
      selection = State.reduceSelectionState(filteredModel(), selection, next);
      rerender();
      if (["set-middle", "set-asset", "move-asset"].includes(type)) void hydrateSelectedAsset();
      return selection;
    }
    const responsiveOwner = container && typeof container.closest === "function" ? container.closest('.prodigy-app-shell[data-workspace-id="knowledge"]') : null;
    const acknowledgeLayout = (event) => {
      const detail = event && event.detail || {};
      if (Number(detail.mountGeneration) !== (Number(options.mountGeneration) || 0)) return;
      emitLayoutSettled();
    };
    function emitLayoutSettled() {
      const detail = Object.freeze({ workspaceId: "knowledge", mountGeneration: Number(options.mountGeneration) || 0, generation: ++layoutGeneration, logicalWidth: width, layout: layout() });
      if (typeof options.onLayoutSettled === "function") options.onLayoutSettled(detail);
      const settledOwner = responsiveOwner;
      if (settledOwner && settledOwner.dataset) {
        settledOwner.dataset.prodigyResponsiveMountGeneration = String(detail.mountGeneration);
        settledOwner.dataset.prodigyResponsiveGeneration = String(detail.generation);
        settledOwner.dataset.prodigyResponsiveLogicalWidth = String(detail.logicalWidth);
        settledOwner.dataset.prodigyResponsiveLayout = String(detail.layout);
      }
      const documentRef = container && container.ownerDocument;
      const view = documentRef && documentRef.defaultView || (typeof window !== "undefined" ? window : null);
      const eventOwner = responsiveOwner || container;
      if (eventOwner && typeof eventOwner.dispatchEvent === "function" && view && typeof view.CustomEvent === "function") {
        eventOwner.dispatchEvent(new view.CustomEvent("prodigy-responsive-layout-settled", { bubbles: true, detail }));
      }
      return detail;
    }
    function setLogicalWidth(nextWidth) {
      const measured = logicalWidth(resizeTarget, nextWidth);
      if (measured === width) return layout();
      width = measured;
      rerender();
      emitLayoutSettled();
      return layout();
    }


    function observeResize() {
      if (typeof ResizeObserver !== "undefined" && resizeTarget) {
        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries && entries[0];
          if (entry && entry.contentRect && Number.isFinite(entry.contentRect.width)) setLogicalWidth(entry.contentRect.width);
        });
        resizeObserver.observe(resizeTarget);
      } else if (typeof window !== "undefined" && window.addEventListener) {
        resizeHandler = () => setLogicalWidth(logicalWidth(resizeTarget));
        window.addEventListener("resize", resizeHandler);
      }
    }

    function candidateInboxOpen() {
      return Boolean(candidateInbox && candidateInbox.state().expanded);
    }

    function setCandidateInboxOpen(nextOpen) {
      if (!candidateInbox || typeof candidateInbox.setExpanded !== "function") return false;
      return candidateInbox.setExpanded(nextOpen);
    }

    function openCandidateInbox() {
      if (!candidateInbox || typeof candidateInbox.setExpanded !== "function") return false;
      candidateRenderSuppressed = true;
      try {
        candidateInbox.setExpanded(true);
        selection = State.reduceSelectionState(filteredModel(), selection, { type: "focus-pane", focusPane: "detail" });
      } finally {
        candidateRenderSuppressed = false;
      }
      rerender();
      return candidateInboxOpen();
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
      acknowledgeResponsiveLayout(mountGeneration) {
        if (Number(mountGeneration) !== (Number(options.mountGeneration) || 0) || destroyed) return false;
        const box = resizeTarget && typeof resizeTarget.getBoundingClientRect === "function" ? resizeTarget.getBoundingClientRect() : null;
        const documentRef = resizeTarget && resizeTarget.ownerDocument;
        const view = documentRef && documentRef.defaultView;
        const zoom = view && view.getComputedStyle ? Number.parseFloat(view.getComputedStyle(documentRef.documentElement).zoom) || 1 : 1;
        const measured = box && Number.isFinite(Number(box.width)) && box.width > 0 ? box.width / zoom : width;
        if (measured === width) emitLayoutSettled();
        else setLogicalWidth(measured);
        return true;
      },
      candidateInboxOpen,
      setCandidateInboxOpen,
      openCandidateInbox,
      setSurfaceState(nextState) {
        surfaceState = State.normalizeString(nextState) || "rest";
        rerender();
        return surfaceState;
      },
      retrySelectedAsset: hydrateSelectedAsset,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        briefRequestId += 1;
        hydrationRequestId += 1;
        if (briefAbortController && typeof briefAbortController.abort === "function") briefAbortController.abort();
        if (hydrationAbortController && typeof hydrationAbortController.abort === "function") hydrationAbortController.abort();
        briefAbortController = null;
        hydrationAbortController = null;
        briefInFlight = null;
        hydrationInFlight = null;
        if (resizeObserver) resizeObserver.disconnect();
        if (resizeHandler && typeof window !== "undefined" && window.removeEventListener) window.removeEventListener("resize", resizeHandler);
        if (responsiveOwner && typeof responsiveOwner.removeEventListener === "function") responsiveOwner.removeEventListener("prodigy-responsive-layout-request", acknowledgeLayout);
        dependencies().Render.empty(container);
      }
    };

    rerender();
    if (responsiveOwner && typeof responsiveOwner.addEventListener === "function") responsiveOwner.addEventListener("prodigy-responsive-layout-request", acknowledgeLayout);
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
