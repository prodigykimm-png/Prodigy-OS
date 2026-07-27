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

  function resetLoaded() {
    loaded.clear();
  }

  function isLoaded(modulePath) {
    return loaded.has(modulePath);
  }

  var api = Object.freeze({
    loadScript: loadScript,
    loadScripts: loadScripts,
    resetLoaded: resetLoaded,
    isLoaded: isLoaded
  });
  root.ProdigyHubLoader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
