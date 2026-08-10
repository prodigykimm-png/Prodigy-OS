"use strict";

/**
 * Prodigy Hub Loader — 공통 스크립트 로더
 *
 * 각 HUB가 개별적으로 loadProdigyScript를 정의하지 않고 이 모듈을 사용한다.
 * 로드 순서는 manifest 배열 순서대로 보장되며, 실패 시 명시적 오류와 재시도 상태를 반환한다.
 * polling 없이 Promise 기반으로 동작한다.
 *
 * Recorder hooks are deliberately optional and side-effect free.  A recorder
 * receives only module/attempt/status metadata; source text and Vault writers
 * never cross this boundary.
 */
(function (root) {
  var loaded = new Set();
  var failed = new Map();
  var inFlight = new Map();
  var moduleVersions = new Map();
  var nextAttemptId = 1;

  var HOOK_NAMES = Object.freeze({
    module_evaluation_start: Object.freeze(["onModuleEvaluationStart", "moduleEvaluationStart", "recordModuleEvaluationStart", "module_evaluation_start"]),
    module_evaluation_end: Object.freeze(["onModuleEvaluationEnd", "moduleEvaluationEnd", "recordModuleEvaluationEnd", "module_evaluation_end"]),
    load_outcome: Object.freeze(["onLoadOutcome", "loadOutcome", "recordLoadOutcome", "load_outcome"]),
    retry: Object.freeze(["onRetry", "recordRetry", "retry_event"]),
    stale: Object.freeze(["onStale", "stale", "recordStale", "stale_event"]),
    sync_pending: Object.freeze(["onSyncPending", "syncPending", "recordSyncPending", "sync_pending"])
  });

  function versionOf(modulePath) {
    return moduleVersions.get(modulePath) || 0;
  }

  function bumpVersion(modulePath) {
    var nextVersion = versionOf(modulePath) + 1;
    moduleVersions.set(modulePath, nextVersion);
    return nextVersion;
  }

  function safeFailure(modulePath, err, kind) {
    var path = typeof modulePath === "string" && modulePath ? modulePath : "<invalid>";
    var message = "모듈 로드 실패";
    if (kind === "sync_pending") message = "모듈 파일이 이 기기에 없습니다 — 동기화가 끝나지 않았을 수 있습니다";
    if (kind === "invalid") message = "모듈 경로 입력 오류";
    if (kind === "throw") message = "모듈 실행 실패";
    if (kind === "stale") message = "모듈 로드 시도가 만료되었습니다";
    if (kind === "execution_contract") message = "모듈 실행 계약을 확인할 수 없습니다";
    if (kind === "local_adapter") message = "로컬 어댑터는 공용 로더에서 실행할 수 없습니다";
    return Object.freeze({
      path: path,
      summary: path + ": " + message,
      code: kind || "load_failed"
    });
  }

  function freezeResult(result) {
    var pending = result.optional_failures.concat(result.required_failures).some(function (failure) {
      return failure && failure.code === "sync_pending";
    });
    var frozen = {
      loaded: Object.freeze(result.loaded.slice()),
      optional_failures: Object.freeze(result.optional_failures.slice()),
      required_failures: Object.freeze(result.required_failures.slice()),
      attempt_id: result.attempt_id,
      sync_pending: pending
    };
    /* Keep the historical enumerable result shape stable while exposing an
     * explicitly supplied mount scope to newer callers. */
    if (result.scope) {
      Object.defineProperty(frozen, "scope", { value: result.scope, enumerable: false });
      Object.defineProperty(frozen, "mount_scope", { value: result.scope, enumerable: false });
      Object.defineProperty(frozen, "signal", { value: result.scope.signal, enumerable: false });
      Object.defineProperty(frozen, "dispose", { value: result.scope.dispose, enumerable: false });
    }
    return Object.freeze(frozen);
  }

  function normalizeList(list) {
    return Array.isArray(list) ? list : [];
  }

  function buildManifestEntries(manifest) {
    var entries = [];
    var seen = new Set();
    if (!manifest || typeof manifest !== "object") {
      entries.push({ path: "<invalid>", required: true, valid: false });
      return entries;
    }
    var required = normalizeList(manifest.required);
    var optional = normalizeList(manifest.optional);

    function add(path, requiredFlag) {
      var objectPath = path && typeof path === "object" ? (path.path || path.module_path || path.modulePath) : path;
      var normalized = typeof objectPath === "string" && objectPath.trim() ? objectPath : "<invalid>";
      var key = requiredFlag ? "required:" + normalized : "optional:" + normalized;
      if (normalized !== "<invalid>") key = normalized;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ path: normalized, required: requiredFlag, valid: normalized !== "<invalid>" });
    }

    if (Object.prototype.hasOwnProperty.call(manifest, "required") && !Array.isArray(manifest.required)) add(null, true);
    if (Object.prototype.hasOwnProperty.call(manifest, "optional") && !Array.isArray(manifest.optional)) add(null, false);
    for (var i = 0; i < required.length; i++) add(required[i], true);
    for (var j = 0; j < optional.length; j++) add(optional[j], false);
    return entries;
  }

  function recorderFor(options) {
    if (!options || typeof options !== "object") return null;
    var recorder = options.recorder || options.hooks || options.telemetry;
    if (recorder && (typeof recorder === "object" || typeof recorder === "function")) return recorder;
    return options;
  }

  function emit(context, type, details) {
    var recorder = context && context.recorder;
    if (!recorder) return;
    var names = HOOK_NAMES[type] || [];
    var payload = Object.assign({ type: type }, details || {});
    if (payload.path && !payload.module_path) payload.module_path = payload.path;
    if (payload.outcome && !payload.status) payload.status = payload.outcome;
    /* Do not pass source, Error objects, or Vault handles to optional hooks. */
    for (var i = 0; i < names.length; i++) {
      var hook = recorder[names[i]];
      if (typeof hook !== "function") continue;
      try {
        hook.call(recorder, payload);
      } catch (_) {
        /* Recorder failures must never alter loading or retry semantics. */
      }
      return;
    }
    try {
      if (type === "module_evaluation_start" && typeof recorder.start === "function") {
        if (!context.evaluation_tokens) context.evaluation_tokens = {};
        context.evaluation_tokens[payload.path] = recorder.start("module", {
          module_path: payload.module_path,
          attempt_id: payload.attempt_id,
          cached: Boolean(payload.cached),
          status: payload.status || "evaluating"
        });
      } else if (type === "module_evaluation_end" && typeof recorder.end === "function") {
        var token = context.evaluation_tokens && context.evaluation_tokens[payload.path];
        recorder.end(token, {
          module_path: payload.module_path,
          attempt_id: payload.attempt_id,
          status: payload.ok ? "loaded" : "failed",
          code: payload.code
        });
        if (context.evaluation_tokens) delete context.evaluation_tokens[payload.path];
      } else if (type === "load_outcome" && typeof recorder.mark === "function") {
        recorder.mark("module_load_outcome", payload);
      } else if ((type === "stale" || type === "sync_pending") && typeof recorder.mark === "function") {
        recorder.mark(type, payload);
      } else if (type === "retry" && typeof recorder.retry === "function") {
        recorder.retry({
          module_path: payload.module_path || (payload.paths && payload.paths.length === 1 ? payload.paths[0] : undefined),
          attempt_id: payload.attempt_id,
          reason: "manual_retry",
          paths: payload.paths,
          invalidated: payload.invalidated
        });
      }
    } catch (_) {
      /* Recorder failures must never alter loading or retry semantics. */
    }
  }

  function contractDescriptor(contract, modulePath) {
    if (!contract) return { explicit: false, execution: "global_iife" };
    var source = contract && contract.value && contract.value.modules ? contract.value : contract;
    var modules = source && source.modules;
    var descriptor = null;
    if (Array.isArray(modules)) descriptor = modules.find(function (item) {
      return item && (item.path === modulePath || item.module_path === modulePath || item.modulePath === modulePath);
    });
    else if (modules && typeof modules === "object") descriptor = modules[modulePath];
    if (!descriptor || typeof descriptor !== "object") return { explicit: true, invalid: true };
    var execution = descriptor.execution || descriptor.evaluator || descriptor.kind || descriptor.module_kind;
    if (["global_iife", "commonjs_bridge", "local_adapter"].indexOf(execution) === -1) return { explicit: true, invalid: true };
    return {
      explicit: true,
      execution: execution,
      exports: Array.isArray(descriptor.exports) ? descriptor.exports.slice() : [],
      readiness: descriptor.readiness
    };
  }

  function executeContent(content, modulePath, context) {
    var descriptor = contractDescriptor(context && context.execution_contract, modulePath);
    if (descriptor.invalid) {
      var contractError = new Error("Invalid execution contract for " + modulePath);
      contractError.code = "invalid_execution_contract";
      throw contractError;
    }
    if (descriptor.execution === "local_adapter") {
      var adapters = context && context.local_adapters;
      var adapter = adapters && adapters[modulePath];
      if (typeof adapter === "function") return adapter(context && context.app);
      if (adapter && typeof adapter.load === "function") return adapter.load(context && context.app);
      var localError = new Error("Local adapter is not a global module: " + modulePath);
      localError.code = "local_adapter";
      throw localError;
    }
    if (descriptor.execution === "commonjs_bridge") {
      var moduleRecord = { exports: {} };
      var bridgeRequire = context && typeof context.require === "function" ? context.require : function () {
        var requireError = new Error("CommonJS bridge requires an explicit require function");
        requireError.code = "commonjs_bridge";
        throw requireError;
      };
      (new Function("module", "exports", "require", content))(moduleRecord, moduleRecord.exports, bridgeRequire);
      return moduleRecord.exports;
    }
    /* The legacy path is intentionally the explicit global-IIFE evaluator. */
    (new Function(content))();
    return undefined;
  }

  function reportOutcome(context, modulePath, outcome, result, cached) {
    emit(context, "load_outcome", {
      path: modulePath,
      attempt_id: context && context.attempt_id,
      outcome: outcome,
      ok: Boolean(result && result.ok),
      cached: Boolean(cached),
      code: result && result.failure ? result.failure.code : undefined
    });
  }

  function staleResult(context, modulePath) {
    var failure = safeFailure(modulePath, null, "stale");
    emit(context, "stale", { path: modulePath, attempt_id: context && context.attempt_id, code: failure.code });
    var result = { ok: false, failure: failure, stale: true };
    reportOutcome(context, modulePath, "stale", result, false);
    return result;
  }

  function readAndEvaluate(app, modulePath, token, context) {
    var tFile = app && app.vault && app.vault.getAbstractFileByPath(modulePath);
    if (!tFile) {
      var missingFailure = safeFailure(modulePath, null, "sync_pending");
      if (versionOf(modulePath) === token) failed.set(modulePath, missingFailure);
      emit(context, "sync_pending", { path: modulePath, attempt_id: context && context.attempt_id, code: missingFailure.code });
      var missingResult = { ok: false, failure: missingFailure };
      reportOutcome(context, modulePath, "sync_pending", missingResult, false);
      return Promise.resolve(missingResult);
    }
    var readPromise;
    try {
      readPromise = app.vault.read(tFile);
    } catch (error) {
      readPromise = Promise.reject(error);
    }
    return Promise.resolve(readPromise).then(function (content) {
      if (versionOf(modulePath) !== token || (context && context.scope && context.scope.signal && context.scope.signal.aborted)) {
        return staleResult(context, modulePath);
      }
      var evaluationStarted = false;
      emit(context, "module_evaluation_start", { path: modulePath, attempt_id: context && context.attempt_id });
      evaluationStarted = true;
      try {
        executeContent(content, modulePath, context);
        if (versionOf(modulePath) === token) {
          loaded.add(modulePath);
          failed.delete(modulePath);
        }
        if (evaluationStarted) emit(context, "module_evaluation_end", { path: modulePath, attempt_id: context && context.attempt_id, ok: true });
        var success = { ok: true, path: modulePath };
        reportOutcome(context, modulePath, "loaded", success, false);
        return success;
      } catch (err) {
        var failureKind = err && err.code === "local_adapter" ? "local_adapter" : (err && err.code === "invalid_execution_contract" ? "execution_contract" : "throw");
        var failure = safeFailure(modulePath, err, failureKind);
        if (versionOf(modulePath) === token) failed.set(modulePath, failure);
        if (evaluationStarted) emit(context, "module_evaluation_end", { path: modulePath, attempt_id: context && context.attempt_id, ok: false, code: failure.code });
        var failedResult = { ok: false, failure: failure };
        reportOutcome(context, modulePath, "failed", failedResult, false);
        return failedResult;
      }
    }).catch(function (err) {
      var failure = safeFailure(modulePath, err, "load_failed");
      if (versionOf(modulePath) === token) failed.set(modulePath, failure);
      var failedResult = { ok: false, failure: failure };
      reportOutcome(context, modulePath, "failed", failedResult, false);
      return failedResult;
    });
  }

  function loadModule(app, modulePath, context) {
    if (loaded.has(modulePath)) {
      var cachedSuccess = { ok: true, path: modulePath, cached: true };
      reportOutcome(context, modulePath, "cached", cachedSuccess, true);
      return Promise.resolve(cachedSuccess);
    }
    if (failed.has(modulePath)) {
      var cachedFailure = { ok: false, failure: failed.get(modulePath), cached: true };
      if (cachedFailure.failure && cachedFailure.failure.code === "sync_pending") emit(context, "sync_pending", { path: modulePath, attempt_id: context && context.attempt_id, code: cachedFailure.failure.code, cached: true });
      reportOutcome(context, modulePath, "cached", cachedFailure, true);
      return Promise.resolve(cachedFailure);
    }
    if (inFlight.has(modulePath) && inFlight.get(modulePath).token === versionOf(modulePath)) {
      return inFlight.get(modulePath).promise;
    }

    var token = versionOf(modulePath);
    var promise = readAndEvaluate(app, modulePath, token, context).then(function (result) {
      if (inFlight.get(modulePath) && inFlight.get(modulePath).token === token) {
        inFlight.delete(modulePath);
      }
      return result;
    }, function (err) {
      if (inFlight.get(modulePath) && inFlight.get(modulePath).token === token) {
        inFlight.delete(modulePath);
      }
      var failure = safeFailure(modulePath, err, "load_failed");
      if (versionOf(modulePath) === token) failed.set(modulePath, failure);
      var failedResult = { ok: false, failure: failure };
      reportOutcome(context, modulePath, "failed", failedResult, false);
      return failedResult;
    });
    inFlight.set(modulePath, { token: token, promise: promise });
    return promise;
  }

  function loadScript(app, modulePath, options) {
    var context = {
      recorder: recorderFor(options),
      attempt_id: options && Number.isInteger(options.attempt_id) ? options.attempt_id : undefined,
      execution_contract: options && (options.execution_contract || options.executionContract),
      local_adapters: options && (options.local_adapters || options.localAdapters),
      require: options && options.require,
      app: app,
      scope: options && (options.scope || options.mount_scope)
    };
    if (loaded.has(modulePath)) {
      reportOutcome(context, modulePath, "cached", { ok: true, path: modulePath }, true);
      return Promise.resolve();
    }
    var tFile = app && app.vault && app.vault.getAbstractFileByPath(modulePath);
    if (!tFile) {
      emit(context, "sync_pending", { path: modulePath, attempt_id: context.attempt_id, code: "sync_pending" });
      reportOutcome(context, modulePath, "sync_pending", { ok: false, failure: safeFailure(modulePath, null, "sync_pending") }, false);
      return Promise.reject(new Error("Missing module: " + modulePath));
    }
    var readPromise;
    try { readPromise = app.vault.read(tFile); } catch (error) { readPromise = Promise.reject(error); }
    return Promise.resolve(readPromise).then(function (content) {
      if (context.scope && context.scope.signal && context.scope.signal.aborted) {
        var stale = staleResult(context, modulePath);
        return Promise.reject(new Error(stale.failure.summary));
      }
      emit(context, "module_evaluation_start", { path: modulePath, attempt_id: context.attempt_id });
      try {
        executeContent(content, modulePath, context);
        loaded.add(modulePath);
        emit(context, "module_evaluation_end", { path: modulePath, attempt_id: context.attempt_id, ok: true });
        reportOutcome(context, modulePath, "loaded", { ok: true, path: modulePath }, false);
      } catch (error) {
        emit(context, "module_evaluation_end", { path: modulePath, attempt_id: context.attempt_id, ok: false, code: error && error.code ? error.code : "throw" });
        reportOutcome(context, modulePath, "failed", { ok: false, failure: safeFailure(modulePath, error, error && error.code === "local_adapter" ? "local_adapter" : "throw") }, false);
        throw error;
      }
    });
  }

  function loadScripts(app, modulePaths, options) {
    var chain = Promise.resolve();
    var errors = [];
    for (var i = 0; i < modulePaths.length; i++) {
      (function (path) {
        chain = chain.then(function () {
          return loadScript(app, path, options);
        }).catch(function (err) {
          errors.push({ path: path, error: err });
        });
      })(modulePaths[i]);
    }
    return chain.then(function () {
      if (errors.length) {
        var summary = errors.map(function (e) { return e.path + ": " + (e.error && e.error.message ? e.error.message : String(e.error)); }).join("; ");
        var err = new Error("Hub loader: " + errors.length + "개 모듈 로드 실패 — " + summary);
        err.errors = errors;
        throw err;
      }
    });
  }

  function scopeFor(options) {
    if (!options || typeof options !== "object") return null;
    if (options.scope || options.mount_scope) return options.scope || options.mount_scope;
    if (!options.host) return null;
    var lifecycle = root.ProdigyMountLifecycle;
    if (!lifecycle && typeof require === "function") {
      try { lifecycle = require("./prodigy-mount-lifecycle.js"); } catch (_) { lifecycle = null; }
    }
    return lifecycle && typeof lifecycle.createMountScope === "function" ? lifecycle.createMountScope(options.host) : null;
  }

  function loadManifest(app, manifest, options) {
    var config = options && typeof options === "object" ? options : {};
    var attemptId = Number.isInteger(config.attempt_id) ? config.attempt_id : nextAttemptId++;
    var entries = buildManifestEntries(manifest);
    var scope = scopeFor(config);
    var executionContract = config.execution_contract || config.executionContract || (manifest && (manifest.execution_contract || manifest.executionContract));
    var context = {
      recorder: recorderFor(config),
      attempt_id: attemptId,
      execution_contract: executionContract,
      local_adapters: config.local_adapters || config.localAdapters,
      require: config.require,
      app: app,
      scope: scope
    };
    var result = {
      loaded: [],
      optional_failures: [],
      required_failures: [],
      attempt_id: attemptId,
      scope: scope
    };
    var chain = Promise.resolve();

    for (var i = 0; i < entries.length; i++) {
      (function (entry) {
        chain = chain.then(function () {
          if (!entry.valid) {
            var invalidFailure = safeFailure(entry.path, null, "invalid");
            if (entry.required) result.required_failures.push(invalidFailure);
            else result.optional_failures.push(invalidFailure);
            reportOutcome(context, entry.path, "failed", { ok: false, failure: invalidFailure }, false);
            return;
          }
          if (scope && scope.signal && scope.signal.aborted) {
            var staleFailure = safeFailure(entry.path, null, "stale");
            emit(context, "stale", { path: entry.path, attempt_id: attemptId, code: staleFailure.code });
            reportOutcome(context, entry.path, "stale", { ok: false, failure: staleFailure }, false);
            if (entry.required) result.required_failures.push(staleFailure);
            else result.optional_failures.push(staleFailure);
            return;
          }
          return loadModule(app, entry.path, context).then(function (moduleResult) {
            if (moduleResult.ok) {
              if (!moduleResult.cached) result.loaded.push(entry.path);
              return;
            }
            if (entry.required) result.required_failures.push(moduleResult.failure);
            else result.optional_failures.push(moduleResult.failure);
          });
        });
      })(entries[i]);
    }

    return chain.then(function () {
      return freezeResult(result);
    });
  }

  function retry(paths, options) {
    var invalidated = [];
    var list = Array.isArray(paths) ? paths : [];
    var rerunLoaded = Boolean(options && options.rerun_loaded);
    for (var i = 0; i < list.length; i++) {
      var modulePath = list[i];
      if (typeof modulePath !== "string" || !modulePath.trim()) continue;
      if (failed.has(modulePath)) {
        failed.delete(modulePath);
        bumpVersion(modulePath);
        if (!loaded.has(modulePath)) invalidated.push(modulePath);
      } else if (rerunLoaded && loaded.has(modulePath)) {
        loaded.delete(modulePath);
        bumpVersion(modulePath);
        invalidated.push(modulePath);
      } else if (inFlight.has(modulePath)) {
        bumpVersion(modulePath);
      }
    }
    var recorder = recorderFor(options);
    var retryPaths = list.filter(function (item) { return typeof item === "string" && item.trim(); });
    var directRetry = recorder && HOOK_NAMES.retry.some(function (name) { return typeof recorder[name] === "function"; });
    if (recorder && directRetry) {
      emit({ recorder: recorder, attempt_id: options && options.attempt_id }, "retry", {
        paths: retryPaths,
        module_path: retryPaths.length === 1 ? retryPaths[0] : undefined,
        reason: "manual_retry",
        invalidated: invalidated.slice(),
        rerun_loaded: rerunLoaded
      });
    } else if (recorder) {
      retryPaths.forEach(function (retryPath) {
        emit({ recorder: recorder, attempt_id: options && options.attempt_id }, "retry", {
          paths: [retryPath],
          module_path: retryPath,
          reason: "manual_retry",
          invalidated: invalidated.indexOf(retryPath) !== -1 ? [retryPath] : [],
          rerun_loaded: rerunLoaded
        });
      });
    }
    return Object.freeze({ invalidated: Object.freeze(invalidated) });
  }

  function resetLoaded() {
    loaded.clear();
    failed.clear();
    inFlight.clear();
    moduleVersions.clear();
  }

  function isLoaded(modulePath) {
    return loaded.has(modulePath);
  }

  function createMountScope(host) {
    var lifecycle = root.ProdigyMountLifecycle;
    if (!lifecycle && typeof require === "function") {
      try { lifecycle = require("./prodigy-mount-lifecycle.js"); } catch (_) { lifecycle = null; }
    }
    return lifecycle && typeof lifecycle.createMountScope === "function" ? lifecycle.createMountScope(host) : null;
  }

  var api = Object.freeze({
    loadScript: loadScript,
    loadScripts: loadScripts,
    loadManifest: loadManifest,
    retry: retry,
    resetLoaded: resetLoaded,
    isLoaded: isLoaded,
    createMountScope: createMountScope
  });
  root.ProdigyHubLoader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
