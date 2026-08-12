(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-workspace-navigation-styles";
  let sharedStateStore = null;

  function resolveModule(globalName, relativePath) {
    if (root[globalName]) return root[globalName];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_error) { return null; }
    }
    return null;
  }

  function registeredWorkspace(workspaceId) {
    const registry = resolveModule("ProdigyWorkspaceRegistry", "./workspace-registry.js");
    return registry && typeof registry.find === "function" ? registry.find(workspaceId) : null;
  }

  function registeredPath(workspaceId) {
    const registry = resolveModule("ProdigyWorkspaceRegistry", "./workspace-registry.js");
    if (registry && typeof registry.pathFor === "function") return registry.pathFor(workspaceId);
    const item = registeredWorkspace(workspaceId);
    return item ? item.path : "";
  }

  const HOME_PATH = registeredPath("home");

  function normalizeTarget(path) {
    const raw = String(path || "").trim();
    if (!raw) return { path: "", filePath: "", linkText: "" };
    const markerIndex = raw.search(/[?#]/);
    const base = markerIndex >= 0 ? raw.slice(0, markerIndex) : raw;
    const suffix = markerIndex >= 0 ? raw.slice(markerIndex) : "";
    const filePath = /\.md$/i.test(base) ? base : `${base}.md`;
    return {
      path: filePath + suffix,
      filePath,
      linkText: filePath.replace(/\.md$/i, "") + suffix
    };
  }

  function normalizePath(path) {
    return normalizeTarget(path).path;
  }

  function responsiveTokens() {
    const tokens = resolveModule("ProdigyTokens", "./design-tokens.js");
    if (!tokens || !tokens.BREAKPOINTS || !tokens.CONTROL_HEIGHTS) {
      throw new Error("반응형 디자인 토큰을 불러오지 못했습니다.");
    }
    return {
      breakpoints: tokens.BREAKPOINTS,
      alpha: tokens.RESPONSIVE_BREAKPOINTS || {
        collapsedNavMax: tokens.BREAKPOINTS.medium - 1,
        contentMax: tokens.BREAKPOINTS.wide
      },
      heights: tokens.CONTROL_HEIGHTS
    };
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    const { alpha, heights } = responsiveTokens();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `.prodigy-loader-error,.prodigy-open-error{display:grid;gap:var(--ke-space-3,12px);margin-block:var(--ke-space-4,17px);padding:var(--ke-space-5,24px);border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-panel,18px);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));box-shadow:none;min-inline-size:0}.prodigy-loader-error-title,.prodigy-open-error-title{margin:0;color:var(--ke-color-error,var(--text-error));font-size:var(--ke-type-title,21px);word-break:keep-all;overflow-wrap:anywhere}.prodigy-loader-error-message,.prodigy-open-error-message{margin:0;font-size:var(--ke-type-body,17px);word-break:keep-all;overflow-wrap:anywhere}.prodigy-loader-error-details,.prodigy-open-error-details{color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label,14px)}.prodigy-loader-error-action,.prodigy-open-error-action{justify-self:start;min-block-size:${heights.touchTarget}px;padding:8px 15px;border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-control,8px);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));box-shadow:none}.prodigy-loader-error-action:active,.prodigy-open-error-action:active{transform:scale(.95)}.prodigy-loader-error-action:focus-visible,.prodigy-open-error-action:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}@media(max-width:${alpha.collapsedNavMax}px){.prodigy-loader-error,.prodigy-open-error{border-radius:var(--ke-radius-configurator,11px)}}@media(min-width:${alpha.contentMax + 1}px){.prodigy-loader-error,.prodigy-open-error{max-inline-size:${alpha.contentMax}px}}@media(forced-colors:active){.prodigy-loader-error-action:focus-visible,.prodigy-open-error-action:focus-visible{outline-color:Highlight}}@media(prefers-reduced-motion:reduce){.prodigy-loader-error *,.prodigy-open-error *{transition:none!important;animation:none!important;transform:none!important}}`;
  }

  function stateStore() {
    if (sharedStateStore) return sharedStateStore;
    const source = resolveModule("ProdigyWorkspaceStateStore", "./prodigy-workspace-state-store.js");
    if (!source || typeof source.WorkspaceStateStore !== "function") return null;
    sharedStateStore = new source.WorkspaceStateStore({});
    return sharedStateStore;
  }

  function clearOpenError(container) {
    if (!container || !container.__prodigyOpenError) return;
    const card = container.__prodigyOpenError;
    if (typeof card.remove === "function") card.remove();
    else card.hidden = true;
    delete container.__prodigyOpenError;
  }

  function renderOpenError(container, error, options) {
    if (!container || typeof container.createEl !== "function") return null;
    try { ensureStyles(); } catch (_styleError) { /* preserve the recovery path */ }
    const opts = options || {};
    clearOpenError(container);
    const title = opts.title || "파일";
    const card = container.createEl("section", {
      attr: {
        class: "prodigy-open-error",
        role: "alert",
        "aria-live": "polite",
        "data-prodigy-open-error": "true"
      }
    });
    card.createEl("h2", {
      text: `${title}을(를) 열지 못했습니다.`,
      attr: { class: "prodigy-open-error-title" }
    });
    card.createEl("p", {
      text: opts.message || "파일을 찾지 못했거나 현재 문맥에서 열 수 없습니다. 다시 시도해 주세요.",
      attr: { class: "prodigy-open-error-message" }
    });
    if (root.prodigyDebugMode === true && error) {
      card.createEl("p", {
        text: `실패 단계: ${error.stage || error.message || error}`,
        attr: { class: "prodigy-open-error-details" }
      });
    }
    if (typeof opts.retry === "function") {
      const retry = card.createEl("button", {
        text: "다시 시도",
        attr: { type: "button", class: "prodigy-open-error-action" }
      });
      retry.onclick = function () {
        retry.disabled = true;
        Promise.resolve().then(function () { return opts.retry(); }).then(function (result) {
          if (!result || result.ok !== false) {
            clearOpenError(container);
            return;
          }
          retry.disabled = false;
        }).catch(function () {
          retry.disabled = false;
        });
      };
    }
    container.__prodigyOpenError = card;
    return card;
  }

  function notifyOpenFailure(app, target, error, options) {
    const opts = options || {};
    const retryOptions = Object.assign({}, opts);
    delete retryOptions.retry;
    const retry = function () {
      return openPath(app, target.path, retryOptions);
    };
    if (opts.container) {
      renderOpenError(opts.container, error, {
        title: opts.title || opts.label || target.linkText || "파일",
        message: opts.message,
        retry
      });
    } else {
      const notice = `${opts.title || opts.label || "파일"}을(를) 열지 못했습니다. 다시 시도해 주세요.`;
      if (typeof root.Notice === "function") new root.Notice(notice);
    }
    return {
      ok: false,
      path: target.path,
      linkText: target.linkText,
      error: error || new Error("open failed")
    };
  }

  function explicitFailure(value) {
    // Obsidian resolves openLinkText/openFile with void; only other falsy values
    // indicate a failed invocation while rejected promises are handled by openPath.
    return !value && value !== undefined;
  }

  async function openFileFallback(app, target) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") return null;
    let file = null;
    try { file = app.vault.getAbstractFileByPath(target.filePath); } catch (_error) { file = null; }
    if (!file || !app.workspace) return null;
    let leaf = null;
    try {
      if (typeof app.workspace.getLeaf === "function") leaf = app.workspace.getLeaf(false);
      if (!leaf && typeof app.workspace.getMostRecentLeaf === "function") leaf = app.workspace.getMostRecentLeaf();
    } catch (_error) { leaf = null; }
    if (!leaf || typeof leaf.openFile !== "function") return null;
    try {
      const result = await leaf.openFile(file);
      if (explicitFailure(result)) return null;
      return { ok: true, method: "leaf.openFile", result };
    } catch (_error) {
      return null;
    }
  }

  async function openPath(app, path, options) {
    const opts = options || {};
    const target = normalizeTarget(path);
    if (!target.path) return notifyOpenFailure(app, target, new Error("empty path"), opts);
    let openError = null;
    if (app && app.workspace && typeof app.workspace.openLinkText === "function") {
      try {
        const sourcePath = opts.sourcePath !== undefined ? opts.sourcePath : "";
        const invocation = app.workspace.openLinkText(target.linkText, sourcePath, false);
        const asynchronous = !!(invocation && typeof invocation.then === "function");
        const result = await invocation;
        if (!explicitFailure(result) && (result !== undefined || asynchronous)) {
          if (opts.container) clearOpenError(opts.container);
          return { ok: true, path: target.path, linkText: target.linkText, sourcePath, method: "openLinkText", result };
        }
        openError = new Error("openLinkText returned a failure value");
      } catch (error) {
        openError = error;
      }
    } else {
      openError = new Error("openLinkText unavailable");
    }

    const fallback = await openFileFallback(app, target);
    if (fallback) {
      if (opts.container) clearOpenError(opts.container);
      return Object.assign({ path: target.path, linkText: target.linkText }, fallback);
    }
    return notifyOpenFailure(app, target, openError || new Error("fallback unavailable"), opts);
  }

  function openHome(app, options) {
    const opts = Object.assign({}, options || {}, { label: (options && options.label) || "홈" });
    return openPath(app, registeredPath("home") || HOME_PATH, opts);
  }

  async function openWorkspace(app, workspaceId, options) {
    const item = registeredWorkspace(workspaceId);
    const opts = Object.assign({}, options || {});
    if (!item) {
      const target = normalizeTarget("");
      return notifyOpenFailure(app, target, new Error("workspace route unavailable"), Object.assign(opts, {
        title: opts.title || "워크스페이스",
        label: opts.label || "워크스페이스"
      }));
    }
    return openPath(app, item.path, Object.assign(opts, {
      title: opts.title || item.label || "워크스페이스",
      label: opts.label || item.label || "워크스페이스"
    }));
  }
  function readinessSnapshot(mounted, workspaceId, selector, evidence) {
    const actions = {
      home: "home.open",
      knowledge: "knowledge.open",
      "journal.daily": "journal.daily.open",
      "journal.weekly": "journal.weekly.open",
      "journal.monthly": "journal.monthly.open",
      reading: "reading.open",
      "personal.people": "personal.people.open",
      "personal.places": "personal.places.open",
      project: "project.open",
      auction: "auction.open",
      workout: "workout.open",
      region: "region.open",
      inbox: "inbox.open"
    };
    const action = actions[selector] || actions[workspaceId] || "";
    const supplied = evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? Object.assign({}, evidence)
      : {};
    if (!Object.prototype.hasOwnProperty.call(supplied, "settled")) supplied.settled = false;
    if (!Object.prototype.hasOwnProperty.call(supplied, "status")) {
      supplied.status = supplied.settled === true ? "deterministic" : "pending";
    }
    if (!Object.prototype.hasOwnProperty.call(supplied, "enabledAction")) {
      supplied.enabledAction = { id: action, enabled: false };
    }
    if (selector === "personal.places" && !Object.prototype.hasOwnProperty.call(supplied, "activated")) {
      supplied.activated = false;
    } else if (!Object.prototype.hasOwnProperty.call(supplied, "activated")) {
      supplied.activated = undefined;
    }
    return supplied;
  }

  function unavailableMeasurement(reason) {
    const run = typeof reason === "string" && reason ? reason : "measurement_unavailable";
    return Object.freeze({
      available: false,
      reason: run,
      mark: function () { return null; },
      record: function () { return null; },
      start: function () { return null; },
      end: function () { return null; },
      measure: function (_phase, operation) { return typeof operation === "function" ? operation() : undefined; },
      retry: function () { return null; },
      fail: function () { return null; },
      readiness: function () { return null; },
      markReady: function () { return null; },
      recordMissing: function () { return null; },
      measureModule: function (_path, operation) { return typeof operation === "function" ? operation() : undefined; },
      finalize: function () { return null; },
      previewExport: function () { return null; },
      createExporter: function () { return null; },
      dispose: function () { return null; }
    });
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
    let measurement = null;
    const measurementModule = resolveModule("ProdigyWorkspaceMeasurement", "./prodigy-workspace-measurement.js");
    const suppliedMeasurement = opts.performanceSession || opts.performance_session;
    if (suppliedMeasurement && typeof suppliedMeasurement === "object") {
      measurement = suppliedMeasurement;
    } else if (measurementModule && typeof measurementModule.getOrCreateSession === "function") {
      try {
        measurement = measurementModule.getOrCreateSession({
          workspace_id: workspaceId,
          run_id: opts.performanceRunId || opts.performance_run_id,
          correlation_id: opts.performanceCorrelationId || opts.performance_correlation_id,
          mount_id: opts.performanceMountId || opts.performance_mount_id,
          clock: opts.performanceClock || opts.performance_clock,
          performance: opts.performanceObject || opts.performance_object,
          cold_warm: opts.coldWarm || opts.cold_warm,
          source_sha256: opts.sourceSha256 || opts.source_sha256,
          settings_sha256: opts.settingsSha256 || opts.settings_sha256,
          configuration_sha256: opts.configurationSha256 || opts.configuration_sha256,
          campaign_id: opts.campaignId || opts.campaign_id
        });
      } catch (_measurementError) {
        measurement = null;
      }
    } else if (measurementModule && typeof measurementModule.createSession === "function") {
      try { measurement = measurementModule.createSession({ workspace_id: workspaceId }); } catch (_measurementError) { measurement = null; }
    }
    if (!measurement) {
      const failures = root && Array.isArray(root.__prodigyMeasurementLoadFailures) ? root.__prodigyMeasurementLoadFailures : [];
      const failure = failures.find((item) => item && item.path);
      measurement = unavailableMeasurement(failure ? `${failure.code}:${failure.path}` : "measurement_module_unavailable");
    }
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
    Object.defineProperty(mounted, "readinessSnapshot", {
      value: function (selector, evidence) { return readinessSnapshot(mounted, workspaceId, selector || workspaceId, evidence); },
      enumerable: false,
      configurable: true
    });
    const campaignFactory = measurementModule && (
      typeof measurementModule.createCampaignController === "function"
        ? measurementModule.createCampaignController
        : typeof measurementModule.createCampaign === "function"
          ? measurementModule.createCampaign
          : null
    );
    let campaign = null;
    if (campaignFactory && measurement && measurement.available === true) {
      try {
        campaign = campaignFactory({
          session: measurement,
          workspace_id: workspaceId,
          workspaceId,
          campaign_id: opts.campaignId || opts.campaign_id
        });
      } catch (_campaignError) {
        campaign = null;
      }
    }
    Object.defineProperty(mounted, "performance", { value: measurement, enumerable: false, configurable: true });
    if (campaign) {
      Object.defineProperty(mounted, "performanceCampaign", { value: campaign, enumerable: false, configurable: true });
      Object.defineProperty(mounted, "campaign", { value: campaign, enumerable: false, configurable: true });
      const campaignRegistry = root && root.ProdigyPerformanceCampaign;
      if (campaignRegistry && typeof campaignRegistry.register === "function") {
        try { campaignRegistry.register(workspaceId, campaign); } catch (_registryError) { /* observability remains local */ }
      }
    }
    if (mounted.element && typeof mounted.element.setAttribute === "function") {
      mounted.element.setAttribute("data-prodigy-measurement", measurement && measurement.available === true ? "available" : "unavailable");
      if (measurement && measurement.reason) mounted.element.setAttribute("data-prodigy-measurement-reason", String(measurement.reason));
    }
    if (measurement && measurement.available === true) {
      measurement.mark("shell_mounted", { scope: workspaceId, status: "mounted" });
    } else if (measurement && typeof measurement.recordMissing === "function") {
      measurement.recordMissing("measurement_module");
    }
    const shellDispose = typeof mounted.dispose === "function" ? mounted.dispose.bind(mounted) : null;
    const scope = opts.mountScope || opts.mount_scope;
    let stateController = null;
    if (opts.stateAdapter && scope && typeof scope.track === "function") {
      scope.track(function () { return stateController ? stateController.dispose() : false; });
    }
    const mountStateController = function () {
      if (!opts.stateAdapter || stateController) return stateController;
      const adapters = resolveModule("ProdigyWorkspaceStateAdapters", "./prodigy-workspace-state-adapters.js");
      if (!adapters || typeof adapters.createController !== "function") {
        if (shellDispose) shellDispose();
        throw new Error("Workspace state adapter module is unavailable.");
      }
      try {
        stateController = adapters.createController({ workspaceId, body: mounted.body, claim: opts.stateAdapter });
        Object.defineProperty(mounted, "stateController", { value: stateController, enumerable: false, configurable: true });
        return stateController;
      } catch (error) {
        if (shellDispose) shellDispose();
        throw error;
      }
    };
    if (opts.stateAdapter) {
      Object.defineProperty(mounted, "mountStateController", { value: mountStateController, enumerable: false, configurable: true });
      if (opts.deferStateAdapter !== true) mountStateController();
    }
    let disposed = false;
    const dispose = function (fields) {
      if (disposed) return false;
      disposed = true;
      let result = false;
      if (campaign && typeof campaign.dispose === "function") result = campaign.dispose(fields);
      else if (measurement && typeof measurement.dispose === "function") result = measurement.dispose(fields);
      if (stateController) stateController.dispose();
      if (shellDispose) shellDispose();
      return result || true;
    };
    Object.defineProperty(mounted, "dispose", { value: dispose, enumerable: false, configurable: true });
    if (scope && typeof scope.track === "function") scope.track(dispose);
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

  const api = Object.freeze({
    HOME_PATH,
    normalizePath,
    registeredPath,
    ensureStyles,
    openPath,
    openWorkspace,
    openHome,
    mount,
    clearOpenError,
    renderOpenError,
    renderLoaderError
  });
  root.ProdigyWorkspaceNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
