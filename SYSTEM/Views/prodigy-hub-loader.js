"use strict";

/** Shared, scope-safe post-bootstrap loader for Prodigy workspaces. */
(function (root) {
  var vaultCaches = new WeakMap();
  var containerScopes = new WeakMap();
  var containerMounts = new WeakMap();
  var ownerScopes = new WeakMap();
  var ownerMounts = new WeakMap();
  var scopeGenerations = new WeakMap();
  var nextAttemptId = 1;
  var nextMountGeneration = 1;
  var nextIdentity = 1;
  var identities = new WeakMap();
  var lastConfig = null;

  function identity(value, prefix) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return null;
    if (!identities.has(value)) identities.set(value, String(prefix || "identity") + "-" + nextIdentity++);
    return identities.get(value);
  }

  function defaultEvaluate(source) { return (new Function("require", source))(undefined); }

  function mountOwner(container) {
    if (!container || typeof container.closest !== "function") return container;
    return container.closest(".workspace-leaf-content") || container;
  }

  function hostGeneration(container) {
    if (!container || typeof container.getAttribute !== "function") return null;
    var value = container.getAttribute("data-task13a-generation");
    return value === null || value === undefined ? null : String(value);
  }

  function activeMarkdownOwner(app, fallback) {
    var workspace = app && app.workspace;
    var leaf = workspace && (workspace.activeLeaf || (typeof workspace.getMostRecentLeaf === "function" && workspace.getMostRecentLeaf()));
    var host = leaf && leaf.containerEl;
    if (host && typeof host.matches === "function" && host.matches('.workspace-leaf-content[data-type="markdown"]')) return host;
    if (host && typeof host.querySelector === "function") {
      var markdown = host.querySelector('.workspace-leaf-content[data-type="markdown"]');
      if (markdown) return markdown;
    }
    return fallback && fallback.isConnected !== false ? fallback : null;
  }

  function activeFilePath(app) {
    var workspace = app && app.workspace;
    var file = workspace && typeof workspace.getActiveFile === "function" ? workspace.getActiveFile() : null;
    return file && typeof file.path === "string" ? file.path : "";
  }

  function bindObsidianDisposal(app, container, owner, sourcePath, scope, transferOwner) {
    var checkDetached = scope.guard(function () {
      if (!container) { scope.dispose(); return; }
      var sameSource = sourcePath && activeFilePath(app) === sourcePath;
      var nextOwner = sameSource ? activeMarkdownOwner(app, owner) : null;
      if (nextOwner && nextOwner.isConnected !== false && typeof nextOwner.appendChild === "function") {
        if (nextOwner !== owner && transferOwner(nextOwner) === false) return;
        if (container.isConnected === false || !nextOwner.contains(container)) nextOwner.appendChild(container);
        return;
      }
      if (container.isConnected === false || !sameSource) scope.dispose();
    });
    var workspace = app && app.workspace;
    if (workspace && typeof workspace.on === "function" && typeof workspace.offref === "function") {
      var layoutRef;
      try { layoutRef = workspace.on("layout-change", checkDetached); } catch (_) { layoutRef = null; }
      if (layoutRef) scope.track(function () { workspace.offref(layoutRef); });
    }
    var documentRef = container && container.ownerDocument;
    var removalRoot = documentRef && (documentRef.body || documentRef.documentElement);
    var view = documentRef && documentRef.defaultView || root;
    var Observer = view && view.MutationObserver;
    if (removalRoot && typeof Observer === "function") {
      var observer;
      try { observer = new Observer(checkDetached); observer.observe(removalRoot, { childList: true, subtree: true }); } catch (_) { observer = null; }
      if (observer) scope.track(function () { observer.disconnect(); });
    }
  }

  var HOST_ADAPTERS = Object.freeze({
    "dataviewjs": Object.freeze({
      container: function (options) { return options.container || (options.context && options.context.container) || null; },
      evaluate: defaultEvaluate,
      bindDisposal: bindObsidianDisposal
    }),
    "js-engine": Object.freeze({
      container: function (options) { return options.container || null; },
      evaluate: defaultEvaluate,
      bindDisposal: bindObsidianDisposal
    })
  });

  function manifestApi() {
    if (root.ProdigyWorkspaceManifest) return root.ProdigyWorkspaceManifest;
    if (typeof require === "function") {
      try { return require("./prodigy-workspace-manifest.js"); } catch (_) { /* bootstrap supplies it in Obsidian */ }
    }
    throw new Error("Workspace manifest registry is not bootstrapped");
  }

  function lifecycleApi() {
    if (root.ProdigyMountLifecycle) return root.ProdigyMountLifecycle;
    if (typeof require === "function") {
      try { return require("./prodigy-mount-lifecycle.js"); } catch (_) { /* fall through */ }
    }
    return null;
  }

  function fallbackScope(host) {
    var aborted = false;
    var cleanups = [];
    return {
      host: host || null,
      signal: { get aborted() { return aborted; } },
      get disposed() { return aborted; },
      guard: function (callback) { return function () { if (!aborted) return callback.apply(this, arguments); }; },
      track: function (cleanup) { if (typeof cleanup !== "function") return function () {}; if (aborted) cleanup(); else cleanups.push(cleanup); return cleanup; },
      observe: function (observer) { if (observer && typeof observer.disconnect === "function") this.track(function () { observer.disconnect(); }); return observer; },
      dispose: function () { if (aborted) return false; aborted = true; cleanups.splice(0).reverse().forEach(function (cleanup) { try { cleanup(); } catch (_) {} }); return true; }
    };
  }

  function createMountScope(host) {
    var lifecycle = lifecycleApi();
    return lifecycle && typeof lifecycle.createMountScope === "function" ? lifecycle.createMountScope(host) : fallbackScope(host);
  }

  function bindCaptureLifecycle(manifest, container, scope) {
    var required = manifest && manifest.required;
    if (!Array.isArray(required) || required.indexOf("SYSTEM/Views/capture-action-runtime.js") === -1) return null;
    var runtime = root.CaptureActionRuntime;
    if (!runtime || typeof runtime.mountTrustedInteractions !== "function") return null;
    return runtime.mountTrustedInteractions({
      root: container,
      document: container && container.ownerDocument || root.document || null,
      scope: scope,
      session_id: String(manifest.workspaceId || "workspace")
    });
  }

  function normalizePath(path) {
    if (typeof path !== "string") return null;
    var normalized = path.replace(/\\/g, "/");
    if (!normalized || normalized !== path || normalized.indexOf("..") !== -1 || normalized.indexOf("//") !== -1 || normalized.charAt(0) === "/") return null;
    return normalized;
  }

  function cacheFor(vault, realm) {
    if (!vault || (typeof vault !== "object" && typeof vault !== "function")) throw new TypeError("Hub loader requires a Vault identity");
    if (!realm || (typeof realm !== "object" && typeof realm !== "function")) throw new TypeError("Hub loader requires an evaluator realm identity");
    var realms = vaultCaches.get(vault);
    if (!realms) { realms = new WeakMap(); vaultCaches.set(vault, realms); }
    var paths = realms.get(realm);
    if (!paths) { paths = new Map(); realms.set(realm, paths); }
    return paths;
  }

  function recordFor(paths, path) {
    var record = paths.get(path);
    if (!record) { record = { generation: 0, state: "empty", promise: null, failure: null, version: "" }; paths.set(path, record); }
    return record;
  }

  function fileVersion(file) {
    var stat = file && file.stat;
    var mtime = Number(stat && stat.mtime);
    var size = Number(stat && stat.size);
    if (!Number.isFinite(mtime) || mtime <= 0) return "";
    return String(mtime) + ":" + (Number.isFinite(size) && size >= 0 ? String(size) : "");
  }

  function safeFailure(path, code, generation) {
    var messages = {
      sync_pending: "모듈 파일이 이 기기에 없습니다 — 동기화가 끝나지 않았을 수 있습니다",
      throw: "모듈 실행 실패",
      load_failed: "모듈 로드 실패",
      stale: "모듈 로드 시도가 만료되었습니다",
      invalid: "모듈 경로 입력 오류"
    };
    return Object.freeze({ path: path || "<invalid>", summary: (path || "<invalid>") + ": " + (messages[code] || messages.load_failed), code: code || "load_failed", generation: generation });
  }

  function evaluateConfig(app, options) {
    var config = options && typeof options === "object" ? options : {};
    var host = config.host || "dataviewjs";
    var adapter = HOST_ADAPTERS[host];
    if (!adapter) throw new TypeError("Hub loader: invalid host");
    var evaluate = typeof config.evaluate === "function" ? config.evaluate : adapter.evaluate;
    var realm = config.realm || evaluate;
    var resolved = { app: app, vault: app && app.vault, host: host, adapter: adapter, evaluate: evaluate, realm: realm, recorder: config.recorder || config.hooks || null };
    if (resolved.vault) lastConfig = resolved;
    return resolved;
  }

  function emit(config, name, payload) {
    var recorder = config && config.recorder;
    if (!recorder) return;
    var names = name === "start" ? ["onModuleEvaluationStart", "moduleEvaluationStart"] : name === "end" ? ["onModuleEvaluationEnd", "moduleEvaluationEnd"] : name === "retry" ? ["onRetry", "retry"] : ["onLoadOutcome", "loadOutcome"];
    for (var i = 0; i < names.length; i++) {
      if (typeof recorder[names[i]] === "function") { try { recorder[names[i]](payload); } catch (_) {} break; }
    }
    var specialized = payload && payload.outcome === "sync_pending" ? ["onSyncPending", "syncPending"] : payload && payload.outcome === "stale" ? ["onStale", "stale"] : [];
    for (var j = 0; j < specialized.length; j++) {
      if (typeof recorder[specialized[j]] === "function") { try { recorder[specialized[j]](payload); } catch (_) {} break; }
    }
  }

  function loadShared(app, modulePath, options) {
    var path = normalizePath(modulePath);
    var config = evaluateConfig(app, options);
    if (!path) return Promise.resolve({ ok: false, failure: safeFailure("<invalid>", "invalid", 0) });
    var paths = cacheFor(config.vault, config.realm);
    var record = recordFor(paths, path);
    var file;
    try { file = config.vault && config.vault.getAbstractFileByPath(path); } catch (_) { file = null; }
    var version = fileVersion(file);
    if ((record.state === "loaded" || record.state === "failed") && version && record.version !== version) {
      record.generation += 1;
      record.state = "empty";
      record.promise = null;
      record.failure = null;
    }
    if (record.state === "loaded") {
      emit(config, "outcome", { type: "load_outcome", path: path, module_path: path, outcome: "cached", ok: true, cached: true });
      return Promise.resolve({ ok: true, path: path, cached: true, generation: record.generation });
    }
    if (record.state === "failed") {
      emit(config, "outcome", { type: "load_outcome", path: path, module_path: path, outcome: record.failure.code, ok: false, code: record.failure.code, cached: true });
      return Promise.resolve({ ok: false, failure: record.failure, cached: true, generation: record.generation });
    }
    if (record.state === "loading" && record.promise) return record.promise;

    var generation = record.generation;
    if (!file) {
      var missing = safeFailure(path, "sync_pending", generation);
      if (record.generation === generation) { record.state = "failed"; record.failure = missing; record.version = ""; }
      emit(config, "outcome", { type: "load_outcome", path: path, module_path: path, outcome: "sync_pending", ok: false, code: missing.code, cached: false });
      return Promise.resolve({ ok: false, failure: missing, generation: generation });
    }

    var read;
    try { read = config.vault.read(file); } catch (error) { read = Promise.reject(error); }
    record.state = "loading";
    record.promise = Promise.resolve(read).then(function (source) {
      if (record.generation !== generation) {
        var stale = safeFailure(path, "stale", generation);
        emit(config, "outcome", { type: "load_outcome", path: path, module_path: path, outcome: "stale", ok: false, code: stale.code, cached: false });
        return { ok: false, failure: stale, stale: true, generation: generation };
      }
      emit(config, "start", { type: "module_evaluation_start", path: path, module_path: path });
      try {
        var entry = root.__prodigyMeasurementEntry;
        var session = entry && entry.session;
        var operation = function () { return config.evaluate(source, path, app); };
        if (session && session.available !== false && typeof session.measureModule === "function") session.measureModule(path, operation);
        else operation();
      } catch (_) {
        var thrown = safeFailure(path, "throw", generation);
        if (record.generation === generation) { record.state = "failed"; record.failure = thrown; record.promise = null; record.version = version; }
        emit(config, "end", { type: "module_evaluation_end", path: path, module_path: path, ok: false, code: thrown.code });
        emit(config, "outcome", { type: "load_outcome", path: path, module_path: path, outcome: "failed", ok: false, code: thrown.code, cached: false });
        return { ok: false, failure: thrown, generation: generation };
      }
      if (record.generation === generation) { record.state = "loaded"; record.failure = null; record.promise = null; record.version = version; }
      emit(config, "end", { type: "module_evaluation_end", path: path, module_path: path, ok: true });
      emit(config, "outcome", { type: "load_outcome", path: path, module_path: path, outcome: "loaded", ok: true, cached: false });
      return { ok: true, path: path, generation: generation };
    }, function () {
      var failure = safeFailure(path, "load_failed", generation);
      if (record.generation === generation) { record.state = "failed"; record.failure = failure; record.promise = null; record.version = version; }
      emit(config, "outcome", { type: "load_outcome", path: path, module_path: path, outcome: "load_failed", ok: false, code: failure.code, cached: false });
      return { ok: false, failure: failure, generation: generation };
    });
    return record.promise;
  }

  async function loadSequence(app, paths, options, failFast) {
    var loaded = [];
    var failures = [];
    for (var i = 0; i < paths.length; i++) {
      var result = await loadShared(app, paths[i], options);
      if (result.ok) { if (!result.cached) loaded.push(paths[i]); }
      else { failures.push(result.failure); if (failFast) break; }
    }
    return { loaded: loaded, failures: failures };
  }

  function resultShape(required, optional, attemptId, optionalReady) {
    var value = {
      loaded: Object.freeze(required.loaded.concat(optional ? optional.loaded : [])),
      required_failures: Object.freeze(required.failures.slice()),
      optional_failures: Object.freeze(optional ? optional.failures.slice() : []),
      attempt_id: attemptId,
      sync_pending: required.failures.concat(optional ? optional.failures : []).some(function (failure) { return failure.code === "sync_pending"; })
    };
    if (optionalReady) Object.defineProperty(value, "optional_ready", { value: optionalReady, enumerable: true });
    return Object.freeze(value);
  }

  async function loadManifest(app, manifest, options) {
    var required = manifest && Array.isArray(manifest.required) ? manifest.required : [null];
    var optional = manifest && Array.isArray(manifest.optional) ? manifest.optional : manifest && Object.prototype.hasOwnProperty.call(manifest, "optional") ? [null] : [];
    var attemptId = options && Number.isInteger(options.attempt_id) ? options.attempt_id : nextAttemptId++;
    var requiredResult = await loadSequence(app, required, options, true);
    var optionalResult = requiredResult.failures.length ? { loaded: [], failures: [] } : await loadSequence(app, optional, options, false);
    return resultShape(requiredResult, optionalResult, attemptId);
  }

  function recordMeasurementFailures(failures) {
    var selected = observedList(failures).filter(function (failure) {
      return failure && /\/(?:prodigy-performance-|prodigy-workspace-(?:readiness|measurement)\.js$)/.test(failure.path || "");
    }).map(function (failure) {
      return Object.freeze({ path: failure.path, code: failure.code || "measurement_load_failed", message: failure.summary || "measurement module unavailable" });
    });
    if (!selected.length) return;
    var current = Array.isArray(root.__prodigyMeasurementLoadFailures) ? root.__prodigyMeasurementLoadFailures : [];
    root.__prodigyMeasurementLoadFailures = current.concat(selected);
  }

  function cleanupFor(value) {
    if (typeof value === "function") return value;
    if (!value || typeof value !== "object") return null;
    var names = ["cleanup", "dispose", "destroy", "unload"];
    var callbacks = names.filter(function (name) { return typeof value[name] === "function"; }).map(function (name) { return value[name].bind(value); });
    if (!callbacks.length) return null;
    var called = false;
    return function () { if (called) return; called = true; callbacks.forEach(function (callback) { callback(); }); };
  }

  function createRecoveryNode(parent, tag, options) {
    if (parent && typeof parent.createEl === "function") return parent.createEl(tag, options || {});
    var documentRef = parent && parent.ownerDocument;
    if (!documentRef || typeof documentRef.createElement !== "function" || typeof parent.appendChild !== "function") return null;
    var node = documentRef.createElement(tag);
    if (options && options.text !== undefined) node.textContent = String(options.text);
    var attrs = options && options.attr || {};
    Object.keys(attrs).forEach(function (name) { if (typeof node.setAttribute === "function") node.setAttribute(name, attrs[name]); else node[name] = attrs[name]; });
    parent.appendChild(node);
    return node;
  }

  function recoveryFailureDetail(category, recoveryError) {
    var failure = recoveryError && recoveryError.failure;
    return Object.freeze({
      type: "loader_recovery",
      category: category,
      path: failure && failure.path || "<invalid>",
      code: failure && failure.code || "retry_failed"
    });
  }

  function reportRetryFailure(category, thrown, recoveryError, container, loadOptions) {
    var activeError = preserveRequiredRecovery(thrown, container) ? thrown : recoveryError;
    var activeScope = activeError && activeError.recoveryScope;
    if (!activeScope || activeScope.signal.aborted || containerScopes.get(container) !== activeScope) return;
    var detail = recoveryFailureDetail(category, activeError);
    try { emit({ recorder: loadOptions && loadOptions.recorder }, "outcome", detail); } catch (_) {}
    if (!container || typeof container.dispatchEvent !== "function") return;
    try {
      var view = container.ownerDocument && container.ownerDocument.defaultView || root;
      var event = view && typeof view.CustomEvent === "function" ? new view.CustomEvent("prodigy-loader-recovery", { detail: detail }) : { type: "prodigy-loader-recovery", detail: detail };
      container.dispatchEvent(event);
    } catch (_) {}
  }

  function invokeRecoveryRetry(retry, onFailure) {
    var result;
    try { result = retry(); }
    catch (error) { onFailure("retry_sync_throw", error); return Promise.resolve(undefined); }
    if (!result || typeof result.then !== "function") return Promise.resolve(result);
    return Promise.resolve(result).then(function (value) { return value; }, function (error) { onFailure("retry_rejected", error); return undefined; });
  }

  function renderRetry(container, error, retry, scope, loadOptions) {
    if (!container) return;
    if (typeof container.empty === "function") container.empty(); else if ("textContent" in container) container.textContent = "";
    var ownedSurface = createRecoveryNode(container, "section", { attr: { class: "prodigy-required-recovery", role: "alert" } });
    var surface = ownedSurface || container;
    if (ownedSurface) scope.track(function () {
      if (typeof ownedSurface.remove === "function") ownedSurface.remove();
      else if (ownedSurface.parentElement && typeof ownedSurface.parentElement.removeChild === "function") ownedSurface.parentElement.removeChild(ownedSurface);
    });
    createRecoveryNode(surface, "h2", { text: "필수 워크스페이스 리소스를 불러오지 못했습니다." });
    createRecoveryNode(surface, "p", { text: error.message });
    var button = createRecoveryNode(surface, "button", { text: "다시 시도", attr: { type: "button", "aria-label": "워크스페이스 다시 시도" } });
    if (!button) return;
    var activating = false;
    var activate = scope.guard(function (event) {
      if (event && event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (activating) return;
      activating = true;
      return invokeRecoveryRetry(retry, function (category, thrown) { reportRetryFailure(category, thrown, error, container, loadOptions); }).then(function (value) {
        if (!scope.signal.aborted) activating = false;
        return value;
      });
    });
    if (typeof button.addEventListener === "function") {
      button.addEventListener("click", activate);
      button.addEventListener("keydown", activate);
      scope.track(function () { button.removeEventListener("click", activate); button.removeEventListener("keydown", activate); });
    } else button.onclick = activate;
    button.__prodigyError = error;
    button.__prodigyRetry = retry;
  }

  function preserveRequiredRecovery(error, container) {
    return Boolean(error && error.prodigyRequiredRecovery === true && error.failure && typeof error.retry === "function" && error.recoveryContainer === container);
  }

  function normalizeMountArguments(appOrOptions, manifest, options) {
    if (arguments.length === 1 && appOrOptions && appOrOptions.app) return { app: appOrOptions.app, manifest: appOrOptions.manifest, options: appOrOptions };
    return { app: appOrOptions, manifest: manifest, options: options || {} };
  }

  async function mountWorkspace(appOrOptions, manifestArg, optionsArg) {
    var args = normalizeMountArguments.apply(null, arguments);
    var app = args.app;
    var manifest = args.manifest;
    var options = args.options;
    var adapter = HOST_ADAPTERS[manifest && manifest.host];
    if (!adapter) throw new TypeError("Hub loader: invalid host");
    var renderers = options.renderers;
    manifestApi().validate(manifest, renderers);
    var renderer = renderers[manifest.renderer];
    var container = adapter.container(options);
    if (!container || (typeof container !== "object" && typeof container !== "function")) throw new TypeError("Hub loader: invalid mount container");
    if (!app || !app.vault) throw new TypeError("Hub loader: invalid app");

    var owner = mountOwner(container);
    var sourcePath = activeFilePath(app);
    var existing = ownerMounts.get(owner);
    var generation = hostGeneration(container);
    if (existing && existing.signal && !existing.signal.aborted && existing.manifest && existing.manifest.workspaceId === manifest.workspaceId && existing.sourcePath === sourcePath && existing.hostGeneration === generation) return existing;
    var prior = ownerScopes.get(owner);
    if (prior) prior.dispose();
    var scope = createMountScope(container);
    var mountGeneration = nextMountGeneration++;
    scopeGenerations.set(scope, mountGeneration);
    function transferOwner(nextOwner) {
      if (!nextOwner || nextOwner === owner) return true;
      var previousOwner = owner;
      var competing = ownerScopes.get(nextOwner);
      if (competing && competing !== scope) {
        if ((scopeGenerations.get(competing) || 0) > mountGeneration) { scope.dispose(); return false; }
        competing.dispose();
      }
      if (ownerScopes.get(previousOwner) === scope) ownerScopes.delete(previousOwner);
      var existingMount = containerMounts.get(container);
      if (existingMount && ownerMounts.get(previousOwner) === existingMount) ownerMounts.delete(previousOwner);
      owner = nextOwner;
      ownerScopes.set(owner, scope);
      if (existingMount) ownerMounts.set(owner, existingMount);
      return true;
    }
    ownerScopes.set(owner, scope);
    containerScopes.set(container, scope);
    scope.track(function () {
      if (ownerScopes.get(owner) === scope) ownerScopes.delete(owner);
      if (containerScopes.get(container) === scope) containerScopes.delete(container);
    });
    if (typeof adapter.bindDisposal === "function") adapter.bindDisposal(app, container, owner, sourcePath, scope, transferOwner, options);
    var loadOptions = Object.assign({}, options, { app: app, host: manifest.host });
    var required = await loadSequence(app, manifest.required, loadOptions, true);
    if (scope.signal.aborted) return Object.freeze({ aborted: true, scope: scope });
    if (required.failures.length) {
      var error = new Error(required.failures[0].summary);
      error.failure = required.failures[0];
      error.prodigySyncPending = required.failures[0].code === "sync_pending";
      error.prodigyRequiredRecovery = true;
      error.recoveryContainer = container;
      error.recoveryScope = scope;
      var retryMount = scope.guard(function () { retry(required.failures, loadOptions); return mountWorkspace(app, manifest, options); });
      error.retry = retryMount;
      renderRetry(container, error, retryMount, scope, loadOptions);
      throw error;
    }
    try { bindCaptureLifecycle(manifest, container, scope); }
    catch (error) { scope.dispose(); throw error; }

    var optionalListeners = [];
    var optionalTasks = [];
    var initialRenderTasks = [];
    var registrationSealed = false;
    var settledOptional = null;
    function registerTask(list, task) {
      if (registrationSealed) throw new Error("Hub loader: initial task registration is sealed");
      var promise = Promise.resolve(typeof task === "function" ? task() : task);
      list.push(promise);
      return promise;
    }
    var optionalPromise = loadSequence(app, manifest.optional, loadOptions, false).then(function (optional) {
      recordMeasurementFailures(optional.failures);
      var optionalResult = resultShape({ loaded: [], failures: [] }, optional, nextAttemptId++);
      settledOptional = optionalResult;
      if (!scope.signal.aborted) optionalListeners.splice(0).forEach(function (callback) { scope.guard(callback)(optionalResult); });
      return optionalResult;
    });
    var context = Object.freeze({
      app: app,
      container: container,
      manifest: manifest,
      scope: scope,
      signal: scope.signal,
      mountGeneration: mountGeneration,
      optional_ready: optionalPromise,
      onOptionalReady: function (callback) {
        if (typeof callback !== "function" || scope.signal.aborted) return Promise.resolve();
        if (registrationSealed) throw new Error("Hub loader: initial task registration is sealed");
        var task;
        if (settledOptional) {
          task = Promise.resolve().then(scope.guard(function () { return callback(settledOptional); }));
          optionalTasks.push(task);
        } else {
          task = new Promise(function (resolve, reject) {
            optionalListeners.push(function (result) { Promise.resolve(callback(result)).then(resolve, reject); });
          });
          optionalTasks.push(task);
        }
        return task;
      },
      registerInitialRenderTask: function (task) { return registerTask(initialRenderTasks, task); },
      retry: scope.guard(function (failures) { retry(failures || required.failures, loadOptions); return mountWorkspace(app, manifest, options); }),
      reloadRequired: scope.guard(async function (path) {
        if (manifest.required.indexOf(path) === -1) throw new TypeError("Hub loader: reload path is not required");
        retry([path], Object.assign({}, loadOptions, { rerun_loaded: true }));
        var result = await loadShared(app, path, loadOptions);
        if (!result.ok) throw new Error(result.failure.summary);
        return result;
      })
    });
    var rendered;
    try {
      rendered = await renderer(context);
    } catch (error) {
      scope.dispose();
      throw error;
    }
    registrationSealed = true;
    var optionalResult = await optionalPromise;
    await Promise.all(optionalTasks.concat(initialRenderTasks));
    if (scope.signal.aborted) return Object.freeze({ aborted: true, scope: scope });
    var cleanup = cleanupFor(rendered);
    if (cleanup) scope.track(cleanup);
    var mounted = Object.freeze({ manifest: manifest, scope: scope, signal: scope.signal, optional_ready: optionalPromise, onOptionalReady: context.onOptionalReady, dispose: scope.dispose, rendered: rendered, sourcePath: sourcePath, hostGeneration: generation, mountGeneration: mountGeneration });
    if (!scope.signal.aborted) {
      ownerMounts.set(owner, mounted);
      containerMounts.set(container, mounted);
      scope.track(function () {
        if (ownerMounts.get(owner) === mounted) ownerMounts.delete(owner);
        if (containerMounts.get(container) === mounted) containerMounts.delete(container);
      });
      var block = container && typeof container.closest === "function" ? container.closest(".block-language-dataviewjs,.block-language-js-engine") || container : container;
      var detail = Object.freeze({
        workspaceId: manifest.workspaceId,
        generation: mountGeneration,
        hostId: identity(container, "host"),
        blockId: identity(block, "block"),
        mountId: identity(mounted, "mount"),
        ownerId: identity(owner, "owner"),
        sourceFile: sourcePath,
        sourceHash: container && container.dataset && container.dataset.task13aSourceHash || null,
        requiredTerminal: true,
        optionalTerminal: Boolean(optionalResult),
        rendererTerminal: true,
        optionalCallbacksTerminal: optionalTasks.length,
        initialRenderTasksTerminal: initialRenderTasks.length,
        registrationSealed: registrationSealed,
        live: !scope.signal.aborted
      });
      if (container && container.dataset) {
        container.dataset.prodigyMountClosedGeneration = String(mountGeneration);
        container.dataset.prodigyMountClosedId = detail.mountId;
      }
      var documentRef = container && container.ownerDocument;
      var view = documentRef && documentRef.defaultView || root;
      if (container && typeof container.dispatchEvent === "function" && view && typeof view.CustomEvent === "function") container.dispatchEvent(new view.CustomEvent("prodigy-mount-closed", { bubbles: true, detail: detail }));
    }
    return mounted;
  }

  function observedList(paths) { return Array.isArray(paths) ? paths : []; }
  function retry(paths, options) {
    var config;
    try { config = options && options.app ? evaluateConfig(options.app, options) : lastConfig ? Object.assign({}, lastConfig, options || {}) : null; } catch (_) { config = null; }
    var invalidated = [];
    if (!config) return Object.freeze({ invalidated: Object.freeze(invalidated) });
    var cache = cacheFor(config.vault, config.realm);
    observedList(paths).forEach(function (observed) {
      var path = normalizePath(typeof observed === "string" ? observed : observed && observed.path);
      if (!path) return;
      var record = cache.get(path);
      if (!record || (record.state === "loaded" && !(options && options.rerun_loaded === true))) return;
      var expected = observed && typeof observed === "object" ? observed.generation : record.generation;
      if (record.generation !== expected) return;
      record.generation += 1;
      record.state = "empty";
      record.failure = null;
      record.promise = null;
      invalidated.push(path);
    });
    emit(config, "retry", { type: "retry", paths: observedList(paths).map(function (item) { return typeof item === "string" ? item : item && item.path; }).filter(Boolean), invalidated: invalidated.slice() });
    return Object.freeze({ invalidated: Object.freeze(invalidated) });
  }

  function loadScript(app, path, options) {
    return loadShared(app, path, options).then(function (result) { if (!result.ok) throw new Error(result.failure.summary); });
  }

  async function loadScripts(app, paths, options) {
    var errors = [];
    for (var i = 0; i < paths.length; i++) {
      try { await loadScript(app, paths[i], options); } catch (error) { errors.push({ path: paths[i], error: error }); }
    }
    if (errors.length) { var aggregate = new Error("Hub loader: " + errors.length + "개 모듈 로드 실패"); aggregate.errors = errors; throw aggregate; }
  }

  function resetLoaded() { vaultCaches = new WeakMap(); containerScopes = new WeakMap(); containerMounts = new WeakMap(); ownerScopes = new WeakMap(); ownerMounts = new WeakMap(); scopeGenerations = new WeakMap(); identities = new WeakMap(); nextMountGeneration = 1; nextIdentity = 1; lastConfig = null; }
  function currentWorkspace(container) {
    if (!container) return null;
    var direct = containerMounts.get(container);
    if (direct) return direct;
    var owner = mountOwner(container);
    return owner === container ? ownerMounts.get(owner) || null : null;
  }
  function disposeWorkspace(container) {
    var mounted = currentWorkspace(container);
    var scope = mounted && mounted.scope || container && containerScopes.get(container);
    return scope && typeof scope.dispose === "function" ? scope.dispose() : false;
  }
  function isLoaded(path, options) {
    try { var config = options && options.app ? evaluateConfig(options.app, options) : lastConfig; if (!config) return false; var record = cacheFor(config.vault, config.realm).get(normalizePath(path)); return Boolean(record && record.state === "loaded"); } catch (_) { return false; }
  }

  var api = Object.freeze({
    version: 2,
    mountWorkspace: mountWorkspace,
    loadManifest: loadManifest,
    loadScript: loadScript,
    loadScripts: loadScripts,
    retry: retry,
    resetLoaded: resetLoaded,
    isLoaded: isLoaded,
    createMountScope: createMountScope,
    currentWorkspace: currentWorkspace,
    disposeWorkspace: disposeWorkspace,
    preserveRequiredRecovery: preserveRequiredRecovery,
    hostAdapters: HOST_ADAPTERS
  });
  root.ProdigyHubLoader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
