---
cssclasses:
  - prodigy-hub-note
  - hide-properties_reading
card_region: 전체지역
card_type: 전체종류
card_sort: dday_asc
---
```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Expose globals for external scripts
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "auction"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "auction" };
// Last reload: 2026-07-12T16:22:00
window.obsidian = obsidian;
window.app = app;
window.__prodigyAuctionSchedule = (callback, delay) => {
  const scope = window.__prodigyAuctionMountScope;
  return scope && typeof scope.timeout === "function" ? scope.timeout(callback, delay) : window.setTimeout(callback, delay);
};
const ensureAuctionHubStyles = async () => {
  if (typeof document === "undefined" || !document.head) return;
  // Presentation lives in the shared module so the Hub note keeps orchestration
  // and Dataview queries only. Load it on demand, then install idempotently.
  if (!window.AuctionHubStyles && typeof loadWorkspaceBootstrap === "function") {
    await loadWorkspaceBootstrap("SYSTEM/Views/auction-hub-styles.js");
  }
  if (window.AuctionHubStyles && typeof window.AuctionHubStyles.ensure === "function") {
    try {
      window.AuctionHubStyles.ensure();
    } catch (_styleError) {
      // Presentation is best-effort; never block the workspace if styling fails.
    }
  }
};

// Mount-scoped, bounded readiness polling shared by every Auction section. A
// section may stay pending while optional scripts arrive, but it can never keep
// a detached timer alive or leave the user with an unbounded spinner.
window.ProdigyAuctionLifecycle = window.ProdigyAuctionLifecycle || (() => {
  const active = new WeakMap();
  const mounted = (container) => {
    if (!container || container.isConnected === false) return false;
    const doc = container.ownerDocument;
    return !doc || !doc.documentElement || typeof doc.documentElement.contains !== "function"
      || doc.documentElement.contains(container);
  };
  const findStatus = (container) => container && typeof container.querySelector === "function"
    ? container.querySelector("[data-auction-loader-status]")
    : null;
  const renderStatus = (state, message, terminal) => {
    if (!mounted(state.container)) return;
    let status = findStatus(state.container);
    if (!status && typeof state.container.createEl === "function") {
      status = state.container.createEl("div", {
        attr: {
          "data-auction-loader-status": "true",
          role: terminal ? "alert" : "status",
          class: "auction-hub-status",
        }
      });
    }
    if (!status) return;
    if (typeof status.empty === "function") status.empty();
    else status.textContent = "";
    if (typeof status.createEl !== "function") {
      status.textContent = message;
      return;
    }
    if (typeof status.setAttr === "function") status.setAttr("role", terminal ? "alert" : "status");
    else if (typeof status.setAttribute === "function") status.setAttribute("role", terminal ? "alert" : "status");
    status.createEl("span", { text: message });
    if (terminal) {
      const retry = status.createEl("button", { text: "다시 시도", attr: { type: "button", class: "prodigy-btn prodigy-btn-chip" } });
      retry.onclick = () => state.retry();
      const cancel = status.createEl("button", { text: "중단", attr: { type: "button", class: "prodigy-btn prodigy-btn-chip" } });
      cancel.onclick = () => {
        if (state.config && typeof state.config.onError === "function") {
          try { state.config.onError(new Error("Auction section load cancelled")); } catch (_) {}
        }
        state.dispose();
        renderStatus(state, "불러오기를 중단했습니다.", false);
      };
    }
  };
  const clear = (state) => {
    if (state.timer !== null) {
      if (state.scope && typeof state.scope.clearTimeout === "function") state.scope.clearTimeout(state.timer);
      else window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.observer && typeof state.observer.disconnect === "function") state.observer.disconnect();
    state.observer = null;
  };
  const start = (config = {}) => {
    const container = config.container;
    if (!container || typeof config.run !== "function") return { dispose() {} };
    const prior = active.get(container);
    if (prior && typeof prior.dispose === "function") prior.dispose();
    const state = {
      container,
      config: { ...config },
      scope: config.scope || window.__prodigyAuctionMountScope || null,
      attempts: 0,
      timer: null,
      observer: null,
      disposed: false,
      errorReported: false,
      rendered: false,
      retry: () => start(state.config),
      dispose: () => {
        if (state.disposed) return;
        state.disposed = true;
        clear(state);
        if (active.get(container) === state) active.delete(container);
      }
    };
    const reportError = (error) => {
      state.error = error || new Error("Auction section render failed");
      if (state.errorReported) return;
      state.errorReported = true;
      if (typeof config.onError === "function") {
        try { config.onError(state.error); } catch (_) {}
      }
    };
    active.set(container, state);
    if (state.scope && typeof state.scope.track === "function") state.scope.track(state.dispose);
    const finish = (result) => {
      if (result === true) {
        state.rendered = true;
        clear(state);
        if (active.get(container) === state) active.delete(container);
        return true;
      }
      return false;
    };
    const attempt = () => {
      if (state.disposed) {
        return;
      }
      if (!mounted(container)) {
        state.attempts += 1;
        if (state.attempts >= (Number(config.maxAttempts) || 100)) {
          reportError(new Error("Auction section container did not connect"));
          state.dispose();
          return;
        }
        state.timer = state.scope && typeof state.scope.timeout === "function"
          ? state.scope.timeout(attempt, Number(config.interval) || 100)
          : window.setTimeout(attempt, Number(config.interval) || 100);
        return;
      }
      state.attempts += 1;
      let result = false;
      try {
        result = config.run() === true;
      } catch (error) {
        reportError(error);
      }
      if (finish(result)) return;
      if (!state.rendered && !findStatus(container)) {
        renderStatus(state, `${config.label || "Auction"} 리소스를 불러오는 중...`, false);
      }
      if (state.attempts >= (Number(config.maxAttempts) || 100)) {
        reportError(state.error || new Error("Auction section render did not settle"));
        renderStatus(state, `${config.label || "Auction"}을 불러오지 못했습니다. ${state.error?.message || "필수 리소스가 준비되지 않았습니다."}`, true);
        state.dispose();
        return;
      }
      state.timer = state.scope && typeof state.scope.timeout === "function"
        ? state.scope.timeout(attempt, Number(config.interval) || 100)
        : window.setTimeout(attempt, Number(config.interval) || 100);
    };
    if (state.scope && typeof state.scope.observe === "function" && container.ownerDocument?.body) {
      state.observer = state.scope.observe(container.ownerDocument.body, { childList: true, subtree: true }, () => {
        if (!mounted(container)) state.dispose();
      });
    } else if (typeof MutationObserver === "function" && container.ownerDocument?.body) {
      state.observer = new MutationObserver(() => {
        if (!mounted(container)) state.dispose();
      });
      state.observer.observe(container.ownerDocument.body, { childList: true, subtree: true });
    }
    attempt();
    return Object.freeze({ dispose: state.dispose, retry: state.retry });
  };
  return Object.freeze({
    start,
    dispose(container) {
      const state = active.get(container);
      if (state) state.dispose();
    }
  });
})();

// Consume one fresh Region → Auction handoff once. The markdown preview mounts
// lower card blocks lazily, so a process-global scope must never outlive its
// Auction mount and filter a later ordinary visit.
const rawAuctionNavigationRequest = window.prodigyAuctionNavigationRequest && typeof window.prodigyAuctionNavigationRequest === "object"
  ? window.prodigyAuctionNavigationRequest
  : null;
const auctionRequestCreatedAt = rawAuctionNavigationRequest && Date.parse(String(rawAuctionNavigationRequest.created_at || ""));
const auctionNavigationRequest = rawAuctionNavigationRequest
  && Number.isFinite(auctionRequestCreatedAt)
  && Date.now() - auctionRequestCreatedAt < 60000
  ? rawAuctionNavigationRequest
  : null;
const auctionRegionScope = auctionNavigationRequest && window.prodigyAuctionRegionScope && typeof window.prodigyAuctionRegionScope === "object"
  ? window.prodigyAuctionRegionScope
  : null;
if (!auctionNavigationRequest) {
  if (window.prodigyAuctionNavigationRequest === rawAuctionNavigationRequest) delete window.prodigyAuctionNavigationRequest;
  delete window.prodigyAuctionRegionScope;
}
const expectedSections = new Set(["bidding", "watching", "reviewing", "won", "lost", "skipped", "archived"]);
const renderedSections = new Set();
const renderFailures = new Set();
let navigationAcknowledged = false;
const maybeMarkAuctionReady = () => {
  if (renderedSections.size !== expectedSections.size || renderFailures.size > 0) return;
  setNavigationStatus("ready");
  const callback = window.__prodigyAuctionReadinessCommit;
  if (typeof callback !== "function") return;
  delete window.__prodigyAuctionReadinessCommit;
  callback();
};
const reportSectionFailure = (status, error) => {
  if (status) renderFailures.add(status);
  if (error) setNavigationStatus("error", error);
  const callback = window.__prodigyAuctionReadinessFailure;
  if (typeof callback === "function") callback(status, error);
};
window.ProdigyAuctionSectionFailure = reportSectionFailure;
const setNavigationStatus = (status, error) => {
  if (!auctionNavigationRequest) return;
  try {
    auctionNavigationRequest.status = status;
    auctionNavigationRequest.updated_at = new Date().toISOString();
    if (error) auctionNavigationRequest.error = String(error && error.message ? error.message : error);
  } catch (_) {
    // A caller may freeze its request object; preserving it is safer than failing load.
  }
};
const acknowledgeNavigation = () => {
  if (navigationAcknowledged || renderedSections.size !== expectedSections.size || renderFailures.size > 0) return;
  navigationAcknowledged = true;
  setNavigationStatus("consumed");
  if (window.prodigyAuctionNavigationRequest === auctionNavigationRequest) delete window.prodigyAuctionNavigationRequest;
  if (auctionRegionScope && window.prodigyAuctionRegionScope === auctionRegionScope) window.prodigyAuctionRegionScope = null;
  window.prodigyAuctionNavigationReceipt = Object.freeze({
    request_id: auctionNavigationRequest && auctionNavigationRequest.request_id || null,
    status: "consumed",
    consumed_at: new Date().toISOString()
  });
};
setNavigationStatus("loading");
window.ProdigyAuctionNavigationFocus = null;
if (auctionNavigationRequest && typeof auctionNavigationRequest.auction_path === "string" && auctionNavigationRequest.auction_path.trim()) {
  const targetPath = auctionNavigationRequest.auction_path.trim();
  let focusCompleted = false;
  let fallbackScheduled = false;
  const locate = () => {
    if (focusCompleted || typeof document === "undefined") return false;
    const card = Array.from(document.querySelectorAll("[data-auction-path]")).find((element) => element.getAttribute("data-auction-path") === targetPath);
    if (!card) return false;
    const collapsed = typeof card.closest === "function" ? card.closest("details") : null;
    if (collapsed) collapsed.open = true;
    card.setAttribute("data-navigation-focus", "true");
    if (typeof card.scrollIntoView === "function") {
      const reduceMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
    if (typeof card.focus === "function") {
      try { card.focus({ preventScroll: true }); }
      catch (_) { card.focus(); }
    }
    focusCompleted = true;
    window.__prodigyAuctionSchedule(() => card.removeAttribute("data-navigation-focus"), 1800);
    return true;
  };
  const scheduleLocate = () => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(locate);
    else window.__prodigyAuctionSchedule(locate, 0);
  };
  const markSection = (status) => {
    if (expectedSections.has(status)) renderedSections.add(status);
    scheduleLocate();
    maybeMarkAuctionReady();
    if (renderedSections.size === expectedSections.size) {
      acknowledgeNavigation();
      if (!fallbackScheduled) {
        fallbackScheduled = true;
        window.__prodigyAuctionSchedule(() => {
          if (locate()) return;
          focusCompleted = true;
          window.ProdigyAuctionNavigationFocus = null;
          if (typeof Notice !== "undefined") new Notice("선택한 경매 카드가 현재 필터에 보이지 않습니다. 지역 필터와 카드 상태를 확인해 주세요.");
        }, 120);
      }
    }
  };
  window.ProdigyAuctionNavigationFocus = Object.freeze({ targetPath, markSection });
} else if (auctionRegionScope) {
  // Scope-only opens still clear once all sections have consumed the destination.
  window.ProdigyAuctionNavigationFocus = Object.freeze({ markSection: (status) => {
    if (expectedSections.has(status)) renderedSections.add(status);
    acknowledgeNavigation();
    maybeMarkAuctionReady();
  } });
} else {
  window.ProdigyAuctionNavigationFocus = Object.freeze({
    markSection: (status) => {
      if (expectedSections.has(status)) renderedSections.add(status);
      maybeMarkAuctionReady();
    }
  });
}

let activeLoadPath = "로더 시작";
const loadWorkspaceBootstrap = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};

const initializeAuctionWorkspace = async () => {
  setNavigationStatus("loading");
  delete window.__prodigyAuctionReadinessCommit;
  delete window.__prodigyAuctionReadinessFailure;
  let performance = null;
  let measurement = null;
  try {
    if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
    if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
    if (!window.ProdigyAuctionNativeScenes) await loadWorkspaceBootstrap("SYSTEM/Views/auction-native-scenes.js");
    const manifest = window.ProdigyWorkspaceManifest.get("auction");
    await window.ProdigyHubLoader.mountWorkspace(app, manifest, {
      container,
      renderers: { auction: async (mountContext) => {
  window.__prodigyAuctionMountScope = mountContext.scope;
  const activeAuctionRegionScope = auctionRegionScope ? { ...auctionRegionScope } : null;
  if (activeAuctionRegionScope) {
    window.__prodigyAuctionActiveRegionScope = activeAuctionRegionScope;
    if (window.prodigyAuctionRegionScope === auctionRegionScope) delete window.prodigyAuctionRegionScope;
    if (window.prodigyAuctionNavigationRequest === auctionNavigationRequest) delete window.prodigyAuctionNavigationRequest;
  } else {
    delete window.__prodigyAuctionActiveRegionScope;
  }
  ensureAuctionHubStyles();
  mountContext.scope.track(() => {
    if (window.__prodigyAuctionMountScope === mountContext.scope) delete window.__prodigyAuctionMountScope;
    if (window.__prodigyAuctionActiveRegionScope === activeAuctionRegionScope) delete window.__prodigyAuctionActiveRegionScope;
    delete window.__prodigyAuctionReadinessCommit;
    delete window.__prodigyAuctionReadinessFailure;
  });
  activeLoadPath = "site-visit-workflow 초기화";
  if (window.prodigySiteVisitReady) await window.prodigySiteVisitReady;
  if (!window.prodigyDisplay) await mountContext.reloadRequired("SYSTEM/Views/display-registry.js");
  if (!window.prodigyDisplay) throw new Error("display-registry 초기화에 실패했습니다.");
  if (typeof window.ensureProdigySiteVisitCardListener === "function") window.ensureProdigySiteVisitCardListener();
  if (typeof window.disposeProdigySiteVisitCardListener === "function") mountContext.scope.track(window.disposeProdigySiteVisitCardListener);
  // Snapshot the full Dataview index once for this dashboard render. Cards and
  // Auction Day only consume this immutable context; they never re-query Vault.
  activeLoadPath = "Dataview 결정 패킷 인덱스";
  performance = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
  measurement = {
    performance: performance || null,
    dataScan: performance && performance.start("data_scan", { scope: "auction" }),
    projection: null,
    domRender: null,
    readinessMarked: false,
    shell: null
  };
  window.__auctionWorkspaceMeasurement = measurement;
  if (!performance) {
    const continuation = { workspaceId: "auction", state: "pending", unmeasured: ["required_modules_before_session", "renderer_before_session"] };
    const continuations = Array.isArray(window.__prodigyMeasurementContinuations) ? window.__prodigyMeasurementContinuations : [];
    window.__prodigyMeasurementContinuations = continuations.concat(continuation);
    mountContext.onOptionalReady((result) => {
      const lateSession = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
      const measurementFailures = (result.optional_failures || []).filter((failure) => /prodigy-(?:performance-|workspace-)/.test(failure.path || ""));
      continuation.state = lateSession && lateSession.available !== false ? "continued" : measurementFailures.length ? "failed" : "unavailable";
      continuation.failures = measurementFailures.map((failure) => ({ path: failure.path, code: failure.code }));
      if (!lateSession || lateSession.available === false) return;
      performance = lateSession;
      measurement.performance = lateSession;
      if (typeof lateSession.recordMissing === "function") lateSession.recordMissing("auction.pre_session_handoff");
      if (typeof lateSession.measureModule === "function") {
        lateSession.measureModule("auction:optional_renderer_continuation", () => {
          if (typeof lateSession.record === "function") lateSession.record("measurement_handoff", { scope: "auction", status: "continued", unmeasured: continuation.unmeasured.slice() });
        });
      }
    });
  }
  const packetDataview = app.plugins?.plugins?.dataview?.api;
  const packetPages = packetDataview && typeof packetDataview.pages === "function"
    ? packetDataview.pages("").array()
    : [];
  if (performance) {
    performance.end(measurement.dataScan, { scope: "auction", status: "loaded" });
    measurement.dataScan = null;
    measurement.projection = performance.start("projection", { scope: "auction" });
  }
  window.AuctionDecisionPacketDashboardContext = window.AuctionDecisionPacket
    ? window.AuctionDecisionPacket.createDashboardContext(packetPages)
    : null;
  window.AuctionDecisionMirrorDashboardContext = window.AuctionDecisionMirrorCore
    ? window.AuctionDecisionMirrorCore.snapshotAuctionCases(packetPages)
    : null;
  if (performance) {
    performance.end(measurement.projection, { scope: "auction", status: "projected" });
    measurement.projection = null;
  }
  activeLoadPath = "워크스페이스 탐색 UI";
  const regionScope = window.prodigyAuctionRegionScope && typeof window.prodigyAuctionRegionScope === "object"
    ? window.prodigyAuctionRegionScope
    : null;
  let domRender = performance && performance.start("dom_render", { scope: "auction" });
  measurement.domRender = domRender;
  try {
    let auctionNativeSceneController = null;
    const calendarAction = {
      label: "달력",
      onClick: () => auctionNativeSceneController?.focusCalendar()
    };
    const stateAdapter = window.ProdigyWorkspaceStateAdapters && window.ProdigyWorkspaceStateAdapters.claim("auction");
    const auctionShell = window.ProdigyWorkspaceNavigation.mount(container, {
      app,
      workspaceId: "auction",
      title: "경매",
      mountScope: mountContext.scope,
      stateAdapter,
      context: {
        label: "현재 문맥",
        items: [],
        actions: [calendarAction]
      }
    });
    if (auctionShell.element && auctionShell.element.classList) auctionShell.element.classList.add("auction-hub-shell");
    if (auctionShell.body) {
      if (typeof auctionShell.body.setAttr === "function") auctionShell.body.setAttr("data-scroll-owner", "auction-workspace-body");
      else if (typeof auctionShell.body.setAttribute === "function") auctionShell.body.setAttribute("data-scroll-owner", "auction-workspace-body");
    }
    const auctionKnowledge = await window.AuctionContextAdapter.mountResurfacing({
      app,
      signal: mountContext.signal,
      container: auctionShell.body
    });
    if (auctionKnowledge && typeof auctionKnowledge.dispose === "function") mountContext.scope.track(auctionKnowledge.dispose);
    auctionNativeSceneController = window.ProdigyAuctionNativeScenes.mount({
      body: auctionShell.body
    });
    const mountedPerformance = auctionShell.performance || performance;
    measurement.shell = auctionShell;
    measurement.performance = mountedPerformance || null;
    if (mountedPerformance) {
      window.__prodigyAuctionReadinessCommit = () => {
        if (measurement.readinessMarked || measurement.dataScan || measurement.projection) return;
        if (measurement.domRender) {
          mountedPerformance.end(measurement.domRender, { scope: "auction", status: "rendered" });
          measurement.domRender = null;
        }
        const evidence = {
          status: "deterministic",
          settled: true,
          enabledAction: { id: "auction.open", enabled: true }
        };
        const snapshot = typeof auctionShell.readinessSnapshot === "function"
          ? auctionShell.readinessSnapshot("auction", evidence)
          : evidence;
        const result = mountedPerformance.markReady("auction", snapshot);
        measurement.readinessMarked = !!(result && result.ready === true);
      };
      window.__prodigyAuctionReadinessFailure = (status, error) => {
        if (measurement.readinessMarked) return;
        if (measurement.domRender) {
          mountedPerformance.end(measurement.domRender, { scope: "auction", status: "failed", section: status });
          measurement.domRender = null;
        }
        if (typeof mountedPerformance.fail === "function") {
          mountedPerformance.fail(error || new Error("Auction section render failed"), { phase: "dom_render", scope: "auction", section: status });
        }
        delete window.__prodigyAuctionReadinessCommit;
        delete window.__prodigyAuctionReadinessFailure;
      };
      maybeMarkAuctionReady();
    }
  } catch (error) {
    if (performance) performance.end(domRender, { scope: "auction", status: "failed" });
    measurement.domRender = null;
    throw error;
  }
      } }
    });
} catch (err) {
  if (window.ProdigyHubLoader && typeof window.ProdigyHubLoader.preserveRequiredRecovery === "function" && window.ProdigyHubLoader.preserveRequiredRecovery(err, container)) return;
  delete window.__prodigyAuctionReadinessCommit;
  delete window.__prodigyAuctionReadinessFailure;
  if (performance && measurement) {
    if (measurement.dataScan) {
      performance.end(measurement.dataScan, { scope: "auction", status: "failed" });
      measurement.dataScan = null;
    }
    if (measurement.projection) {
      performance.end(measurement.projection, { scope: "auction", status: "failed" });
      measurement.projection = null;
    }
    if (measurement.domRender) {
      performance.end(measurement.domRender, { scope: "auction", status: "failed" });
      measurement.domRender = null;
    }
    if (typeof performance.fail === "function") performance.fail(err, { phase: "error", scope: "auction" });
  }
  setNavigationStatus("error", err);
  const failedStage = err && err.prodigyLoadPath ? err.prodigyLoadPath : activeLoadPath;
  window.ProdigyAuctionWorkspaceRetry = initializeAuctionWorkspace;
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(container, err, {
      title: "경매",
      failedStage,
      message: "필수 리소스를 준비하지 못했습니다. 같은 지역 요청을 유지한 채 다시 시도하세요.",
      retry: () => window.ProdigyAuctionWorkspaceRetry()
    });
  } else {
    container.empty();
    const errorBox = container.createEl("p", { text: "경매 워크스페이스를 불러오지 못했습니다.", attr: { class: "auction-hub-status", role: "alert" } });
    const retry = errorBox.createEl("button", { text: "다시 시도", attr: { type: "button" } });
    retry.onclick = () => window.ProdigyAuctionWorkspaceRetry();
  }
}
};
window.ProdigyAuctionWorkspaceRetry = initializeAuctionWorkspace;
window.ProdigyAuctionWorkspaceReady = initializeAuctionWorkspace();
await window.ProdigyAuctionWorkspaceReady;
```

[[15 Region|지역 비교]] — 기존 지역 Object의 지표와 근거를 읽기 전용으로 비교합니다.


---

# 오늘

```dataviewjs
if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-today");
window.ProdigyAuctionNativeScenes.register("today", this.container);
// Calculate counts and progress stats
let todayBiddingCount = 0;
let pendingSiteVisitsCount = 0;
let missingExpectedCount = 0;
let wonThisMonthCount = 0;
let reviewsCompletedThisMonthCount = 0;
// Nearest upcoming (strictly after today) bid date + how many run that day.
let nextBidIso = null;
let nextBidCount = 0;

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth(); // 0-11
const todayStr = `${currentYear}-${String(currentMonth+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const cases = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case");
const toPlainArray = (value) => {
  if (!value) return [];
  if (typeof value.array === "function") return value.array();
  if (Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  return [];
};
const responsiveTokens = window.ProdigyTokens;
const dashboardLogicalWidth = this.container.clientWidth > 0
  ? this.container.clientWidth
  : responsiveTokens.RESPONSIVE_BREAKPOINTS.contentMax;
const compactDashboard = dashboardLogicalWidth <= responsiveTokens.RESPONSIVE_BREAKPOINTS.phoneMax;

toPlainArray(cases).forEach(p => {
  // 1. Today Bidding + nearest upcoming bid
  if (p.status === "bidding" && p.auction_datetime) {
    const cleanStr = String(p.auction_datetime).split(' ')[0].split('T')[0];
    if (cleanStr === todayStr) {
      todayBiddingCount++;
    }
    if (cleanStr > todayStr) {
      if (nextBidIso === null || cleanStr < nextBidIso) {
        nextBidIso = cleanStr;
        nextBidCount = 1;
      } else if (cleanStr === nextBidIso) {
        nextBidCount++;
      }
    }
  }
  
  // 2. Today's Site Visits (Bidding status and site_visit_date is empty)
  if (p.status === "bidding") {
    const svd = p.site_visit_date;
    if (!svd || svd === "정보 없음" || String(svd).trim() === "") {
      pendingSiteVisitsCount++;
    }
  }
  
  // 3. Missing Expected Bid (Bidding status and expected_bid is missing)
  if (p.status === "bidding") {
    const exp = p.expected_bid;
    if (!exp || exp === "정보 없음" || String(exp).trim() === "") {
      missingExpectedCount++;
    }
  }
  
  // 4. Won This Month (Won status updated in the current month)
  if (p.status === "won" && p.updated) {
    const date = new Date(p.updated);
    if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
      wonThisMonthCount++;
    }
  }
  
  // 5. Reviews Completed This Month (Archived status updated in the current month)
  if (p.status === "archived" && p.updated) {
    const date = new Date(p.updated);
    if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
      reviewsCompletedThisMonthCount++;
    }
  }
});

const mainBox = this.container.createEl('div', {
  attr: { class: "auction-hub-stat-grid" }
});
const nativeSidebar = mainBox.createEl("aside", {
  attr: { class: "auction-native-sidebar", "aria-label": "경매 요약" }
});
nativeSidebar.createEl("div", {
  text: "오늘",
  attr: { class: "auction-native-sidebar-title" }
});

// Left Box: Actions Needed
const statsBox = nativeSidebar.createEl('div', {
  attr: { class: "auction-hub-stat-panel" }
});
statsBox.createEl('div', { text: '오늘 할 일', attr: { class: "auction-hub-stat-heading" } });

const addStatItem = (parent, label, count, color, isHighlight, isPrimary = false) => {
  const row = parent.createEl('div', {
    attr: { class: `auction-hub-stat-row${isPrimary ? " is-primary" : ""}` }
  });
  row.createEl('span', { text: label, attr: { class: "auction-hub-stat-label" } });
  row.createEl('span', {
    text: `${count}건`,
    attr: { class: `auction-hub-stat-value tone-${color}${isHighlight ? " is-highlight" : ""}` }
  });
};

addStatItem(statsBox, '오늘 입찰', todayBiddingCount, 'error', todayBiddingCount > 0, true);
addStatItem(statsBox, '임장 미완료', pendingSiteVisitsCount, 'accent', pendingSiteVisitsCount > 0);
addStatItem(statsBox, '예상입찰가 누락', missingExpectedCount, 'warning', missingExpectedCount > 0);

// Nearest upcoming event (today empty state still names it).
const nextBidRow = statsBox.createEl('div', { attr: { class: "auction-hub-stat-row" } });
nextBidRow.createEl('span', { text: '다음 입찰', attr: { class: "auction-hub-stat-label" } });
const nextBidValue = nextBidIso
  ? (nextBidCount > 1 ? `${nextBidIso} · ${nextBidCount}건` : nextBidIso)
  : '없음';
nextBidRow.createEl('span', {
  text: nextBidValue,
  attr: { class: "auction-hub-stat-value" + (nextBidIso ? " tone-accent is-highlight" : " tone-muted") }
});

// Right Box: Monthly Progress
const progressBox = nativeSidebar.createEl('div', {
  attr: { class: "auction-hub-stat-panel" }
});
progressBox.createEl('div', { text: '이번 달 진행 현황', attr: { class: "auction-hub-stat-heading" } });

addStatItem(progressBox, '이번 달 낙찰', wonThisMonthCount, 'success', wonThisMonthCount > 0);
addStatItem(progressBox, '이번 달 복기 완료', reviewsCompletedThisMonthCount, 'warning', reviewsCompletedThisMonthCount > 0);

```

---


---

## 입찰 예정

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-bidding");
  window.ProdigyAuctionNativeScenes.register("bidding", this.container);
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    const logicalWidth = this.container.clientWidth > 0
      ? this.container.clientWidth
      : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.contentMax;
    window.renderDashboardSection({
      dv: dv,
      status: "bidding",
      type: "auction_case",
      container: this.container,
      renderer: (page, target) => window.renderAuctionCard(page, target, {
        decisionPacketContext: window.AuctionDecisionPacketDashboardContext,
        logicalWidth
      }),
      emptyMessage: "해당 조건의 입찰 예정 물건이 없습니다.",
      sortField: "auction_datetime",
      sortOrder: "asc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("bidding");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "입찰 예정",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("bidding", error)
});
```

---


---

## 관심

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-watching");
  window.ProdigyAuctionNativeScenes.register("watching", this.container);
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    const logicalWidth = this.container.clientWidth > 0
      ? this.container.clientWidth
      : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.contentMax;
    window.renderDashboardSection({
      dv: dv,
      status: "watching",
      type: "auction_case",
      container: this.container,
      renderer: (page, target) => window.renderAuctionCard(page, target, {
        decisionPacketContext: window.AuctionDecisionPacketDashboardContext,
        logicalWidth
      }),
      emptyMessage: "해당 조건의 검토 중인 물건이 없습니다.",
      sortField: "auction_datetime",
      sortOrder: "asc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("watching");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "관심",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("watching", error)
});
```

---


---

# 입찰 일정

```dataviewjs
// Bid Calendar: time navigation only (does not edit Objects)
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-calendar");
  window.ProdigyAuctionNativeScenes.register("calendar", this.container);
  if (window.BidCalendarCore && window.BidCalendarView) {
    this.container.empty();
    const pages = dv.pages('"PARA/PROJECTS/Auction"')
      .where(p => p.type === "auction_case")
      .array();
    window.BidCalendarView.render({
      container: this.container,
      pages,
      app: app,
      now: new Date()
    });
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "입찰 일정 캘린더",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("calendar", error)
});
```

---


---

# 경매 진행 현황

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
if (container.classList) container.classList.add("auction-hub-section", "auction-hub-pipeline-section");
window.ProdigyAuctionNativeScenes.register("pipeline", container);
container.empty();

const files = app.vault.getFiles().filter(f =>
  f.path.startsWith("PARA/PROJECTS/Auction/") && f.extension === "md"
);

await window.ProdigyAuctionWorkspaceReady;

const counts = { watching: 0, bidding: 0, skipped: 0, won: 0, lost: 0, reviewing: 0, archived: 0 };

files.forEach(f => {
  const c = app.metadataCache.getFileCache(f);
  const fm = c?.frontmatter;
  if (fm?.type === "auction_case") {
    if (counts[fm.status] !== undefined) {
      counts[fm.status]++;
    }
  }
});

container.createEl('div', {
  text: '경매 진행 현황',
  attr: { class: "auction-hub-pipeline-heading" }
});
const pipelineBox = container.createEl('div', {
  attr: { class: "auction-hub-pipeline auction-hub-pipeline-compact" }
});

const makeStep = (parent, label, count, color) => {
  const step = parent.createEl('div', {
    attr: { class: `auction-hub-pipeline-step tone-${color}` }
  });
  step.createEl('span', { text: label, attr: { class: "auction-hub-pipeline-label" } });
  step.createEl('span', { text: String(count), attr: { class: `auction-hub-pipeline-count tone-${color}` } });
  return step;
};

const makeGroup = (parent) => {
  return parent.createEl('div', {
    attr: { class: "auction-hub-pipeline-group" }
  });
};

const makeArrow = (parent) => {
  parent.createEl('div', {
    text: '→',
    attr: { class: "auction-hub-pipeline-arrow" }
  });
};

const display = window.prodigyDisplay;
const statusStep = (status) => {
  const info = display.statusInfo(status);
  return info.label;
};

makeStep(pipelineBox, statusStep('watching'), counts.watching, 'muted');
makeArrow(pipelineBox);
makeStep(pipelineBox, statusStep('bidding'), counts.bidding, 'accent');
makeArrow(pipelineBox);

const grp1 = makeGroup(pipelineBox);
makeStep(grp1, statusStep('won'), counts.won, 'success');
makeStep(grp1, statusStep('lost'), counts.lost, 'error');

makeArrow(pipelineBox);
makeStep(pipelineBox, statusStep('reviewing'), counts.reviewing, 'warning');
makeArrow(pipelineBox);

const grp2 = makeGroup(pipelineBox);
makeStep(grp2, statusStep('skipped'), counts.skipped, 'muted');
makeStep(grp2, statusStep('archived'), counts.archived, 'muted');
```

---


---

## 복기 대기

```dataviewjs
// Post-result queue: won/lost before reviewing, reviewing in progress, skipped before archive
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-review-queue");
  window.ProdigyAuctionNativeScenes.register("review-queue", this.container);
  if (!window.AuctionDayCore || !window.AuctionDayCore.buildReviewQueue) return false;
  this.container.empty();
  const pages = dv.pages('"PARA/PROJECTS/Auction"')
    .where(p => p.type === "auction_case")
    .array()
    .map(p => Object.assign({}, p, {
      type: p.type || "auction_case",
      path: (p.file && p.file.path) || p.path || "",
      file: p.file
    }));
  const queue = window.AuctionDayCore.buildReviewQueue(pages);
  // Review work is secondary to decision-first Today, so it collapses into a
  // disclosure while its approval/archive behavior stays identical.
  const disclosure = this.container.createEl("details", {
    attr: { class: "auction-hub-disclosure" }
  });
  disclosure.createEl("summary", { text: "복기 대기" });
  const disclosureBody = disclosure.createEl("div", {
    attr: { class: "auction-hub-disclosure-body" }
  });
  const box = disclosureBody.createEl("div", {
    attr: { class: "auction-hub-review-queue" }
  });
  box.createEl("div", {
    text: "복기 대기",
    attr: { class: "auction-hub-review-heading" }
  });
  box.createEl("div", {
    text: "결과 기록 후 닫을 일. 새 Property 없이 기존 status만 사용합니다.",
    attr: { class: "auction-hub-review-copy" }
  });  if (!queue.length) {
    box.createEl("div", {
      text: "복기 대기 물건이 없습니다.",
      attr: { class: "auction-hub-review-empty" }
    });
    return true;
  }
  const stageLabel = {
    pending_review: "복기 시작 전",
    in_progress: "복기 중",
    pending_close: "보관 전"
  };
  const statusLabel = (s) => (window.prodigyDisplay && window.prodigyDisplay.status)
    ? window.prodigyDisplay.status(s)
    : s;
  queue.forEach((item) => {
    const row = box.createEl("div", {
      attr: { class: "auction-hub-review-row" }
    });
    const left = row.createEl("div", { attr: { class: "auction-hub-review-detail" } });
    left.createEl("div", {
      text: item.case_number || item.title,
      attr: { class: "auction-hub-continue-title" }
    });
    left.createEl("div", {
      text: `${statusLabel(item.status)} · ${stageLabel[item.stage] || item.stage}`,
      attr: { class: "auction-hub-review-meta" }
    });
    left.createEl("div", {
      text: item.reason,
      attr: { class: "auction-hub-review-reason" }
    });
    const actions = row.createEl("div", {
      attr: { class: "auction-hub-review-actions" }
    });
    const openBtn = actions.createEl("button", {
      text: "원본 열기",
      attr: { type: "button", class: "prodigy-btn" }
    });
    openBtn.onclick = () => app.workspace.openLinkText(item.path, item.path, false);
    if (item.stage === "pending_review" && item.next_status === "reviewing") {
      const startBtn = actions.createEl("button", {
        text: "복기 시작",
        attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" }
      });
      startBtn.onclick = async () => {
        try {
          startBtn.disabled = true;
          const tFile = app.vault.getAbstractFileByPath(item.path);
          if (!tFile) throw new Error("Object를 찾을 수 없습니다.");
          const today = window.AuctionDayCore.isoToday();
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = "reviewing";
            fm.updated = today;
          });
          if (typeof Notice !== "undefined") new Notice("복기를 시작했습니다.");
          // Dataview will refresh on metadata change
        } catch (err) {
          if (typeof Notice !== "undefined") new Notice(err.message || String(err));
          startBtn.disabled = false;
        }
      };
    } else if (item.stage === "in_progress" || item.stage === "pending_close") {
      const archBtn = actions.createEl("button", {
        text: item.stage === "pending_close" ? "보관" : "복기 완료·보관",
        attr: { type: "button", class: "prodigy-btn" }
      });
      archBtn.onclick = async () => {
        try {
          archBtn.disabled = true;
          const tFile = app.vault.getAbstractFileByPath(item.path);
          if (!tFile) throw new Error("Object를 찾을 수 없습니다.");
          const today = window.AuctionDayCore.isoToday();
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = "archived";
            fm.updated = today;
            if (!fm.review_date) fm.review_date = today;
          });
          if (typeof Notice !== "undefined") new Notice("보관으로 옮겼습니다.");
        } catch (err) {
          if (typeof Notice !== "undefined") new Notice(err.message || String(err));
          archBtn.disabled = false;
        }
      };
    }
  });
  return true;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "복기 대기 큐",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("review_queue", error)
});
```

---


---

## 복기 중

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-reviewing");
  window.ProdigyAuctionNativeScenes.register("reviewing", this.container);
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "reviewing",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 복기 중인 물건이 없습니다.",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("reviewing");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "복기 중",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("reviewing", error)
});
```

---


---

## 낙찰

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-won");
  window.ProdigyAuctionNativeScenes.register("won", this.container);
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "won",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 낙찰 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "낙찰 물건 목록",
      summaryColor: "var(--text-normal)",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("won");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "낙찰",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("won", error)
});
```


---

## 패찰

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-lost");
  window.ProdigyAuctionNativeScenes.register("lost", this.container);
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "lost",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 패찰 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "패찰 물건 목록",
      summaryColor: "var(--text-normal)",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("lost");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "패찰",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("lost", error)
});
```


---

## 입찰 포기

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-skipped");
  window.ProdigyAuctionNativeScenes.register("skipped", this.container);
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "skipped",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 입찰 포기 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "입찰 포기 물건 목록",
      summaryColor: "var(--text-muted)",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("skipped");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "입찰 포기",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("skipped", error)
});
```


---

## 보관

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-archived");
  window.ProdigyAuctionNativeScenes.register("archived", this.container);
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "archived",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 보관 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "보관 물건 목록",
      summaryColor: "var(--ke-color-muted, var(--text-muted))",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("archived");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "보관",
  run,
  onError: (error) => window.ProdigyAuctionSectionFailure?.("archived", error)
});
```
