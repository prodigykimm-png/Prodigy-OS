(function (root) {
  "use strict";

  const TAB_STORAGE_KEY = "prodigy.workout.activeTab.v1";
  const TABS = [
    { id: "strength", label: "근력" },
    { id: "nutrition", label: "식단" },
    { id: "running", label: "러닝" },
  ];
  const DEFAULT_TAB = "strength";

  function getStoredTab() {
    try {
      const stored = (typeof sessionStorage !== "undefined") ? sessionStorage.getItem(TAB_STORAGE_KEY) : null;
      if (stored && TABS.some((t) => t.id === stored)) return stored;
    } catch (_e) { /* storage unavailable */ }
    return null;
  }

  function storeTab(tabId) {
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TAB_STORAGE_KEY, tabId);
    } catch (_e) { /* storage unavailable */ }
  }

  function resolveTab(options) {
    // Explicit initialTab wins over sessionStorage
    if (options && options.initialTab && TABS.some((t) => t.id === options.initialTab)) {
      return options.initialTab;
    }
    return getStoredTab() || DEFAULT_TAB;
  }

  /**
   * Render the three-tab shell.
   * @param container - DOM element to mount into
   * @param renderers - { strength: fn(panel), nutrition: fn(panel), running: fn(panel) }
   * @param options - { initialTab: string }
   * @returns { openTab: fn(tabId), getActiveTab: fn() }
   */
 function renderShell(container, renderers, options) {
  const shellOptions = options || {};
  const activeTab = resolveTab(shellOptions);
  let currentTab = activeTab;
  let disposed = false;
  let mountGeneration = 0;
  let responsiveParticipant = null;

  // Apply responsive layout classes using the mounted pane width, not the window.
    const Whr = root.WorkoutHealthResponsive;
  const measuredWidth = Number(container && (container.clientWidth || container.offsetWidth));
  const logicalWidth = Number(shellOptions.width) || measuredWidth || (typeof window !== "undefined" ? window.innerWidth : 1024);
  if (Whr && typeof Whr.applyLayout === "function") {
    Whr.applyLayout(container, logicalWidth);
    if (root.WorkoutStyles) root.WorkoutStyles.ensureStyles();
    if (Whr && typeof Whr.injectResponsiveCss === "function") Whr.injectResponsiveCss(container.ownerDocument);
    if (shellOptions.scope && typeof shellOptions.scope.observe === "function" && typeof ResizeObserver === "function") {
      let responsiveGeneration = 0;
      const publish = (width) => {
        if (disposed || !(width > 0)) return false;
        const layout = Whr.applyLayout(container, width);
        container.dispatchEvent(new CustomEvent("prodigy-workout-layout-settled", { bubbles: true, detail: {
          workspaceId: "workout", mountGeneration: shellOptions.mountGeneration,
          generation: ++responsiveGeneration, logicalWidth: width, layout,
        } }));
        return true;
      };
      const participant = responsiveParticipant = Object.freeze({ acknowledgeResponsiveLayout(mountGeneration) {
        if (mountGeneration !== shellOptions.mountGeneration) return false;
        return publish(container.getBoundingClientRect().width);
      } });
      container.__prodigyWorkoutResponsiveParticipant = participant;
      shellOptions.scope.track(() => { if (container.__prodigyWorkoutResponsiveParticipant === participant) delete container.__prodigyWorkoutResponsiveParticipant; });
      const observer = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === container);
        if (entry) publish(entry.contentRect.width);
      });
      observer.observe(container);
      shellOptions.scope.observe(observer);
    }
  }

  const tablist = container.createDiv({ attr: { class: "workout-health-tablist", role: "tablist", "aria-label": "운동 영역" } });
  const tabEls = {};
  const panelEls = {};
  const parkedContent = {};
  const panelStates = new Map(TABS.map((tab) => [tab.id, { status: "idle", token: 0 }]));
  const panelContainer = container.createDiv({ attr: { class: "workout-health-panels" } });

  function setTabClass(el, className, enabled) {
    if (enabled) {
      if (el.addClass) el.addClass(className);
      else if (el.classList) el.classList.add(className);
    } else {
      if (el.removeClass) el.removeClass(className);
      else if (el.classList) el.classList.remove(className);
    }
  }

  function createPanel(tab) {
    const panel = panelContainer.createDiv({
      attr: {
        role: "tabpanel",
        id: `workout-panel-${tab.id}`,
        "aria-labelledby": `workout-tab-${tab.id}`,
        class: "workout-health-panel",
      },
    });
    if (tab.id !== currentTab) panel.setAttribute("hidden", "");
    return panel;
  }

  function parkPanel(tabId) {
    const panel = panelEls[tabId];
    if (!panel || !panel.firstChild) return false;
    const doc = panel.ownerDocument || root.document;
    if (!doc || typeof doc.createDocumentFragment !== "function") return false;
    const fragment = parkedContent[tabId] || doc.createDocumentFragment();
    while (panel.firstChild) fragment.appendChild(panel.firstChild);
    parkedContent[tabId] = fragment;
    return true;
  }

  function restorePanel(tabId) {
    const panel = panelEls[tabId];
    const fragment = parkedContent[tabId];
    if (!panel || !fragment) return false;
    panel.appendChild(fragment);
    parkedContent[tabId] = null;
    return true;
  }

  function replacePanel(tabId) {
    const oldPanel = panelEls[tabId];
    if (oldPanel && typeof oldPanel.remove === "function") oldPanel.remove();
    parkedContent[tabId] = null;
    const tab = TABS.find((item) => item.id === tabId);
    panelEls[tabId] = createPanel(tab);
    return panelEls[tabId];
  }

  TABS.forEach((tab, index) => {
    const tabEl = tablist.createEl("button", {
      text: tab.label,
      attr: {
        role: "tab",
        id: `workout-tab-${tab.id}`,
        "aria-controls": `workout-panel-${tab.id}`,
        "aria-selected": tab.id === activeTab ? "true" : "false",
        tabindex: tab.id === activeTab ? "0" : "-1",
        class: `workout-health-tab${tab.id === activeTab ? " is-active" : ""}`,
        "data-tab": tab.id,
      },
    });
    tabEls[tab.id] = tabEl;
    tabEl.addEventListener("click", () => selectTab(tab.id));
    tabEl.addEventListener("keydown", (e) => {
      let target = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") target = TABS[(index + 1) % TABS.length].id;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = TABS[(index - 1 + TABS.length) % TABS.length].id;
      else if (e.key === "Home") target = TABS[0].id;
      else if (e.key === "End") target = TABS[TABS.length - 1].id;
      if (target) {
        e.preventDefault();
        selectTab(target);
        tabEls[target].focus();
      }
    });
  });
  TABS.forEach((tab) => { panelEls[tab.id] = createPanel(tab); });

  function isCurrent(tabId, panel, token) {
    const state = panelStates.get(tabId);
    return !disposed
      && currentTab === tabId
      && panelEls[tabId] === panel
      && state
      && state.token === token
      && mountGeneration > 0;
  }

  function renderRetry(panel, tabId, message, error, externalRetry) {
    panel.empty();
    const errorEl = panel.createDiv({ attr: { class: "workout-panel-error", role: "alert", "data-state": "error" } });
    errorEl.createEl("p", { text: message, attr: { class: "workout-error" } });
    if (error) errorEl.createEl("p", { text: String(error && error.message ? error.message : error), attr: { class: "workout-muted" } });
    const retryBtn = errorEl.createEl("button", { text: "다시 시도", attr: { class: "workout-button", type: "button" } });
    retryBtn.addEventListener("click", () => {
      if (externalRetry && typeof shellOptions.onRetry === "function") {
        retryBtn.disabled = true;
        Promise.resolve().then(() => shellOptions.onRetry(tabId)).catch(() => { retryBtn.disabled = false; });
        return;
      }
      const state = panelStates.get(tabId);
      if (state) {
        state.status = "idle";
        state.token += 1;
      }
      replacePanel(tabId);
      renderPanel(tabId);
    });
  }

  function renderPanel(tabId) {
    if (disposed) return;
    const panel = panelEls[tabId];
    const state = panelStates.get(tabId);
    if (!panel || !state || state.status === "loading" || state.status === "ready" || state.status === "unavailable") return;
    const renderer = renderers && renderers[tabId];
    const token = ++state.token;
    state.status = "loading";
    panel.setAttribute("aria-busy", "true");
    parkedContent[tabId] = null;
    panel.empty();
    const loading = panel.createEl("p", { text: "불러오는 중…", attr: { class: "workout-muted workout-panel-loading", role: "status", "aria-live": "polite", "data-state": "loading" } });
    if (!renderer) {
      state.status = "unavailable";
      if (isCurrent(tabId, panel, token)) {
        const availability = shellOptions.tabAvailability && shellOptions.tabAvailability[tabId];
        panel.setAttribute("aria-busy", "false");
        renderRetry(panel, tabId, availability || "이 탭은 현재 사용할 수 없습니다. 선택 모듈을 동기화한 뒤 다시 시도하세요.", null, true);
      }
      return;
    }
    const bp = Whr && typeof Whr.resolveBreakpoint === "function" ? Whr.resolveBreakpoint(logicalWidth) : "wide";
    const context = {
      width: logicalWidth,
      breakpoint: bp,
      isCurrent: () => isCurrent(tabId, panel, token),
      mountGeneration,
    };
    const settle = (error) => {
      if (!isCurrent(tabId, panel, token)) {
        if (state.token === token) state.status = "idle";
        parkPanel(tabId);
        return;
      }
      if (error) {
        state.status = "error";
        panel.setAttribute("aria-busy", "false");
        renderRetry(panel, tabId, "탭을 불러오지 못했습니다.", error);
        return;
      }
      state.status = "ready";
      panel.setAttribute("aria-busy", "false");
      if (loading.parentNode) loading.remove();
    };
    try {
      const result = renderer(panel, context);
      if (result && typeof result.then === "function") result.then(() => settle()).catch((error) => settle(error));
      else settle();
    } catch (error) {
      settle(error);
    }
  }

  function selectTab(tabId) {
    if (disposed) return;
    if (!TABS.some((t) => t.id === tabId)) tabId = DEFAULT_TAB;
    const activeElement = root.document && root.document.activeElement;
    const focusWasOnTab = Object.values(tabEls).includes(activeElement);
    let focusWasParked = false;
    currentTab = tabId;
    storeTab(tabId);
    TABS.forEach((t) => {
      const el = tabEls[t.id];
      const isActive = t.id === tabId;
      el.setAttribute("aria-selected", isActive ? "true" : "false");
      el.setAttribute("tabindex", isActive ? "0" : "-1");
      setTabClass(el, "is-active", isActive);
      const panel = panelEls[t.id];
      if (isActive) {
        panel.removeAttribute("hidden");
        restorePanel(t.id);
      } else {
        if (activeElement && typeof panel.contains === "function" && panel.contains(activeElement)) focusWasParked = true;
        parkPanel(t.id);
        panel.setAttribute("hidden", "");
      }
    });
    renderPanel(tabId);
    if ((focusWasParked || focusWasOnTab) && tabEls[tabId] && typeof tabEls[tabId].focus === "function") tabEls[tabId].focus();
  }

  mountGeneration = 1;
  renderPanel(activeTab);

  return {
    openTab: selectTab,
    getActiveTab: () => currentTab,
    dispose: () => {
      disposed = true;
      if (container.__prodigyWorkoutResponsiveParticipant === responsiveParticipant) delete container.__prodigyWorkoutResponsiveParticipant;
      mountGeneration += 1;
      TABS.forEach((tab) => {
        const state = panelStates.get(tab.id);
        if (state) {
          state.token += 1;
          state.status = "disposed";
        }
      });
    },
    isDisposed: () => disposed,
  };
 }

  const api = { TABS, DEFAULT_TAB, TAB_STORAGE_KEY, renderShell, resolveTab, getStoredTab, storeTab };
  root.WorkoutHealthShell = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
