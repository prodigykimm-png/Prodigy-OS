(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-workspace-navigation-styles";
  const HOME_PATH = "HUB/00 Home.md";
  let sharedStateStore = null;

  function resolveModule(globalName, relativePath) {
    if (root[globalName]) return root[globalName];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_error) { return null; }
    }
    return null;
  }

  function responsiveTokens() {
    const tokens = resolveModule("ProdigyTokens", "./design-tokens.js");
    if (!tokens || !tokens.BREAKPOINTS || !tokens.CONTROL_HEIGHTS) {
      throw new Error("반응형 디자인 토큰을 불러오지 못했습니다.");
    }
    return { breakpoints: tokens.BREAKPOINTS, heights: tokens.CONTROL_HEIGHTS };
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    const { breakpoints, heights } = responsiveTokens();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `.prodigy-loader-error{display:grid;gap:var(--ke-space-3,8px);margin-block:var(--ke-space-4,12px);padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary);color:var(--text-normal);min-inline-size:0}.prodigy-loader-error-title{margin:0;color:var(--text-error);font-size:var(--ke-type-title,1.05rem);word-break:keep-all;overflow-wrap:anywhere}.prodigy-loader-error-message{margin:0;font-size:var(--ke-type-body,.84rem);word-break:keep-all;overflow-wrap:anywhere}.prodigy-loader-error-details{color:var(--text-muted);font-size:var(--ke-type-label,.72rem)}.prodigy-loader-error-action{justify-self:start;min-block-size:32px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal)}.prodigy-loader-error-action:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}@media(max-width:${breakpoints.medium - 1}px){.prodigy-loader-error-action{min-block-size:${heights.touchTarget}px}}@media(min-width:${breakpoints.medium}px){.prodigy-loader-error{max-inline-size:${breakpoints.wide}px}}@media(prefers-reduced-motion:reduce){.prodigy-loader-error *{transition:none!important;animation:none!important}}`;
  }

  function stateStore() {
    if (sharedStateStore) return sharedStateStore;
    const source = resolveModule("ProdigyWorkspaceStateStore", "./prodigy-workspace-state-store.js");
    if (!source || typeof source.WorkspaceStateStore !== "function") return null;
    sharedStateStore = new source.WorkspaceStateStore({});
    return sharedStateStore;
  }

  function registeredWorkspace(workspaceId) {
    const registry = resolveModule("ProdigyWorkspaceRegistry", "./workspace-registry.js");
    return registry && typeof registry.find === "function" ? registry.find(workspaceId) : null;
  }

  function openHome(app) {
    if (!app || !app.workspace || typeof app.workspace.openLinkText !== "function") return null;
    return app.workspace.openLinkText(HOME_PATH, HOME_PATH, false);
  }

  function mount(container, options) {
    if (!container || typeof container.createEl !== "function") return null;
    const opts = options || {};
    const shellModule = resolveModule("ProdigyAppShell", "./prodigy-app-shell.js");
    if (!shellModule || typeof shellModule.AppShell !== "function") {
      throw new Error("App Shell 모듈을 불러오지 못했습니다.");
    }
    const tokens = responsiveTokens();
    const store = opts.stateStore || stateStore();
    const workspaceId = String(opts.workspaceId || "");
    if (store && registeredWorkspace(workspaceId)) store.setActiveWorkspace(workspaceId);
    const suppliedContext = opts.context || {};
    const homeAction = workspaceId === "home" ? [] : [{ label: "홈", onClick: function () { return openHome(opts.app); } }];
    const mounted = shellModule.AppShell(container, {
      app: opts.app,
      workspaceId,
      title: opts.title || "워크스페이스",
      stateStore: store,
      replace: opts.replace === true,
      onWorkspaceChange: opts.onWorkspaceChange,
      context: {
        label: suppliedContext.label || "현재 문맥",
        items: suppliedContext.items || [],
        actions: homeAction.concat(suppliedContext.actions || []),
      },
    });
    if (mounted.element && mounted.element.style && typeof mounted.element.style.setProperty === "function") {
      mounted.element.style.setProperty("--prodigy-workspace-bar-height", `${tokens.heights.workspaceBar}px`);
      mounted.element.style.setProperty("--prodigy-action-bar-height", `${tokens.heights.actionBar}px`);
      mounted.element.style.setProperty("--prodigy-touch-target", `${tokens.heights.touchTarget}px`);
    }
    ensureStyles();
    return mounted;
  }

  function renderLoaderError(container, error, options) {
    if (!container || typeof container.createEl !== "function") return null;
    ensureStyles();
    const opts = options || {};
    const title = opts.title || "워크스페이스";
    if (typeof container.empty === "function") container.empty();
    const card = container.createEl("section", { attr: { class: "prodigy-loader-error", role: "alert" } });
    card.createEl("h2", { text: `${title} 워크스페이스를 불러오지 못했습니다.`, attr: { class: "prodigy-loader-error-title" } });
    card.createEl("p", {
      text: opts.message || "화면을 다시 열거나 Obsidian을 재시작한 뒤 다시 시도해 주세요.",
      attr: { class: "prodigy-loader-error-message" },
    });
    if (root.prodigyDebugMode === true) {
      const stage = opts.failedStage || (error && error.prodigyLoadPath) || "알 수 없는 단계";
      card.createEl("p", { text: `실패 단계: ${stage}`, attr: { class: "prodigy-loader-error-details" } });
    }
    if (typeof opts.retry === "function") {
      const retry = card.createEl("button", { text: "다시 시도", attr: { type: "button", class: "prodigy-loader-error-action" } });
      retry.onclick = opts.retry;
    }
    return card;
  }

  const api = Object.freeze({ HOME_PATH, ensureStyles, openHome, mount, renderLoaderError });
  root.ProdigyWorkspaceNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
