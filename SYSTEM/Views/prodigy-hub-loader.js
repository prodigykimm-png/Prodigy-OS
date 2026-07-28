"use strict";

/**
 * Prodigy Hub Loader — 공통 스크립트 로더
 *
 * 각 HUB가 개별적으로 loadProdigyScript를 정의하지 않고 이 모듈을 사용한다.
 * 로드 순서는 manifest 배열 순서대로 보장되며, 실패 시 명시적 오류와 재시도 상태를 반환한다.
 * polling 없이 Promise 기반으로 동작한다.
 */
(function (root) {
  var loaded = new Set();
  var failed = new Map();
  var inFlight = new Map();
  var moduleVersions = new Map();
  var nextAttemptId = 1;

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
    if (kind === "missing") message = "모듈 파일이 없습니다";
    if (kind === "invalid") message = "모듈 경로 입력 오류";
    if (kind === "throw") message = "모듈 실행 실패";
    if (kind === "stale") message = "모듈 로드 시도가 만료되었습니다";
    return Object.freeze({
      path: path,
      summary: path + ": " + message,
      code: kind || "load_failed"
    });
  }

  function freezeResult(result) {
    return Object.freeze({
      loaded: Object.freeze(result.loaded.slice()),
      optional_failures: Object.freeze(result.optional_failures.slice()),
      required_failures: Object.freeze(result.required_failures.slice()),
      attempt_id: result.attempt_id
    });
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
      var normalized = typeof path === "string" && path.trim() ? path : "<invalid>";
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

  function readAndEvaluate(app, modulePath, token) {
    var tFile = app && app.vault && app.vault.getAbstractFileByPath(modulePath);
    if (!tFile) {
      var missingFailure = safeFailure(modulePath, null, "missing");
      if (versionOf(modulePath) === token) failed.set(modulePath, missingFailure);
      return Promise.resolve({ ok: false, failure: missingFailure });
    }
    return app.vault.read(tFile).then(function (content) {
      if (versionOf(modulePath) !== token) {
        return { ok: false, failure: safeFailure(modulePath, null, "stale"), stale: true };
      }
      try {
        (new Function(content))();
        if (versionOf(modulePath) === token) {
          loaded.add(modulePath);
          failed.delete(modulePath);
        }
        return { ok: true, path: modulePath };
      } catch (err) {
        var failure = safeFailure(modulePath, err, "throw");
        if (versionOf(modulePath) === token) {
          failed.set(modulePath, failure);
        }
        return { ok: false, failure: failure };
      }
    }).catch(function (err) {
      var failure = safeFailure(modulePath, err, "load_failed");
      if (versionOf(modulePath) === token) {
        failed.set(modulePath, failure);
      }
      return { ok: false, failure: failure };
    });
  }

  function loadModule(app, modulePath) {
    if (loaded.has(modulePath)) return Promise.resolve({ ok: true, path: modulePath, cached: true });
    if (failed.has(modulePath)) return Promise.resolve({ ok: false, failure: failed.get(modulePath), cached: true });
    if (inFlight.has(modulePath) && inFlight.get(modulePath).token === versionOf(modulePath)) {
      return inFlight.get(modulePath).promise;
    }

    var token = versionOf(modulePath);
    var promise = readAndEvaluate(app, modulePath, token).then(function (result) {
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
      return { ok: false, failure: failure };
    });
    inFlight.set(modulePath, { token: token, promise: promise });
    return promise;
  }

  function loadScript(app, modulePath) {
    if (loaded.has(modulePath)) return Promise.resolve();
    var tFile = app.vault.getAbstractFileByPath(modulePath);
    if (!tFile) return Promise.reject(new Error("Missing module: " + modulePath));
    return app.vault.read(tFile).then(function (content) {
      (new Function(content))();
      loaded.add(modulePath);
    });
  }

  function loadScripts(app, modulePaths) {
    var chain = Promise.resolve();
    var errors = [];
    for (var i = 0; i < modulePaths.length; i++) {
      (function (path) {
        chain = chain.then(function () {
          return loadScript(app, path);
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

  function loadManifest(app, manifest, options) {
    var attemptId = options && Number.isInteger(options.attempt_id) ? options.attempt_id : nextAttemptId++;
    var entries = buildManifestEntries(manifest);
    var result = {
      loaded: [],
      optional_failures: [],
      required_failures: [],
      attempt_id: attemptId
    };
    var chain = Promise.resolve();

    for (var i = 0; i < entries.length; i++) {
      (function (entry) {
        chain = chain.then(function () {
          if (!entry.valid) {
            var invalidFailure = safeFailure(entry.path, null, "invalid");
            if (entry.required) result.required_failures.push(invalidFailure);
            else result.optional_failures.push(invalidFailure);
            return;
          }
          if (loaded.has(entry.path)) return;
          return loadModule(app, entry.path).then(function (moduleResult) {
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

  function retry(paths) {
    var invalidated = [];
    var list = Array.isArray(paths) ? paths : [];
    for (var i = 0; i < list.length; i++) {
      var modulePath = list[i];
      if (typeof modulePath !== "string" || !modulePath.trim()) continue;
      if (failed.has(modulePath)) {
        failed.delete(modulePath);
        bumpVersion(modulePath);
        if (!loaded.has(modulePath)) invalidated.push(modulePath);
      } else if (inFlight.has(modulePath)) {
        bumpVersion(modulePath);
      }
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

  var api = Object.freeze({
    loadScript: loadScript,
    loadScripts: loadScripts,
    loadManifest: loadManifest,
    retry: retry,
    resetLoaded: resetLoaded,
    isLoaded: isLoaded
  });
  root.ProdigyHubLoader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
