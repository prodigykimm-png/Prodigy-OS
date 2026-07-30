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
   const activeTab = resolveTab(options);
   const rendered = new Set();

   // Apply responsive layout classes
   const Whr = root.WorkoutHealthResponsive;
   const logicalWidth = (options && options.width) || (typeof window !== "undefined" ? window.innerWidth : 1024);
   if (Whr && typeof Whr.applyLayout === "function") {
     Whr.applyLayout(container, logicalWidth);
     if (typeof Whr.injectResponsiveCss === "function") Whr.injectResponsiveCss();
   }

   // Tab list
    const tablist = container.createDiv({ attr: { class: "workout-health-tablist", role: "tablist", "aria-label": "운동 영역" } });
    const tabEls = {};
    const panelEls = {};

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
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          target = TABS[(index + 1) % TABS.length].id;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          target = TABS[(index - 1 + TABS.length) % TABS.length].id;
        } else if (e.key === "Home") {
          target = TABS[0].id;
        } else if (e.key === "End") {
          target = TABS[TABS.length - 1].id;
        }
        if (target) {
          e.preventDefault();
          selectTab(target);
          tabEls[target].focus();
        }
      });
    });

    // Panels
    const panelContainer = container.createDiv({ attr: { class: "workout-health-panels" } });
    TABS.forEach((tab) => {
      const panel = panelContainer.createDiv({
        attr: {
          role: "tabpanel",
          id: `workout-panel-${tab.id}`,
          "aria-labelledby": `workout-tab-${tab.id}`,
          class: "workout-health-panel",
          hidden: tab.id !== activeTab ? "" : undefined,
        },
      });
      if (tab.id !== activeTab) panel.setAttribute("hidden", "");
      panelEls[tab.id] = panel;
    });

    let currentTab = activeTab;

   function renderPanel(tabId) {
     if (rendered.has(tabId)) return;
     const panel = panelEls[tabId];
     const renderer = renderers[tabId];
     if (!renderer) {
       panel.createEl("p", { text: "이 탭은 준비 중입니다.", attr: { class: "workout-empty" } });
       rendered.add(tabId);
       return;
     }
     try {
       // Show loading state
       const loading = panel.createEl("p", { text: "불러오는 중…", attr: { class: "workout-muted workout-panel-loading" } });
       const bp = Whr ? Whr.resolveBreakpoint(logicalWidth) : "wide";
       const result = renderer(panel, { width: logicalWidth, breakpoint: bp });
       // If renderer is async (returns promise), handle loading state
        if (result && typeof result.then === "function") {
          result.then(() => {
            if (loading.parentNode) loading.remove();
          }).catch((err) => {
            loading.remove();
            const errorEl = panel.createDiv({ attr: { class: "workout-panel-error" } });
            errorEl.createEl("p", { text: "탭을 불러오지 못했습니다.", attr: { class: "workout-error" } });
            errorEl.createEl("p", { text: String(err && err.message ? err.message : err), attr: { class: "workout-muted" } });
            const retryBtn = errorEl.createEl("button", { text: "다시 시도", attr: { class: "workout-button", type: "button" } });
            retryBtn.addEventListener("click", () => {
              panel.empty();
              rendered.delete(tabId);
              renderPanel(tabId);
            });
          });
        } else {
          if (loading.parentNode) loading.remove();
        }
      } catch (err) {
        loading.remove();
        const errorEl = panel.createDiv({ attr: { class: "workout-panel-error" } });
        errorEl.createEl("p", { text: "탭을 불러오지 못했습니다.", attr: { class: "workout-error" } });
        errorEl.createEl("p", { text: String(err && err.message ? err.message : err), attr: { class: "workout-muted" } });
        const retryBtn = errorEl.createEl("button", { text: "다시 시도", attr: { class: "workout-button", type: "button" } });
        retryBtn.addEventListener("click", () => {
          panel.empty();
          rendered.delete(tabId);
          renderPanel(tabId);
        });
      }
      rendered.add(tabId);
    }

    function selectTab(tabId) {
      if (!TABS.some((t) => t.id === tabId)) tabId = DEFAULT_TAB;
      currentTab = tabId;
      storeTab(tabId);

      // Update tab states
      TABS.forEach((t) => {
        const el = tabEls[t.id];
        const isActive = t.id === tabId;
        el.setAttribute("aria-selected", isActive ? "true" : "false");
        el.setAttribute("tabindex", isActive ? "0" : "-1");
        if (isActive) el.addClass("is-active");
        else el.removeClass("is-active");

        const panel = panelEls[t.id];
        if (isActive) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
      });

      // Lazy render
      renderPanel(tabId);
    }

    // Initial render
    renderPanel(activeTab);

    return {
      openTab: selectTab,
      getActiveTab: () => currentTab,
    };
  }

  const api = { TABS, DEFAULT_TAB, TAB_STORAGE_KEY, renderShell, resolveTab, getStoredTab, storeTab };
  root.WorkoutHealthShell = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
