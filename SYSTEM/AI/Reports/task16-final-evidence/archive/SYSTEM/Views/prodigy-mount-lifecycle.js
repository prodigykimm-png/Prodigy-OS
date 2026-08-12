"use strict";

/**
 * Mount-scoped lifecycle helpers shared by Hub surfaces.
 *
 * A scope owns every asynchronous callback and DOM observer/listener attached
 * during a mount.  Disposal is idempotent and aborts the scope before running
 * tracked cleanups, so late callbacks can guard on the same signal.
 */
(function (root) {
  function noop() {}

  function hostWindow(host) {
    if (host && (typeof host.setTimeout === "function" || typeof host.setInterval === "function" || typeof host.addEventListener === "function")) return host;
    if (host && host.ownerDocument && host.ownerDocument.defaultView) return host.ownerDocument.defaultView;
    if (host && host.defaultView) return host.defaultView;
    return root;
  }

  function timerFunction(host, name) {
    var target = hostWindow(host);
    if (target && typeof target[name] === "function") return target[name].bind(target);
    if (typeof root[name] === "function") return root[name].bind(root);
    return null;
  }

  function fallbackSignal() {
    var listeners = [];
    var signal = {
      aborted: false,
      addEventListener: function (type, listener) {
        if (type === "abort" && typeof listener === "function") listeners.push(listener);
      },
      removeEventListener: function (type, listener) {
        if (type !== "abort") return;
        listeners = listeners.filter(function (candidate) { return candidate !== listener; });
      },
      dispatchEvent: function () {
        var current = listeners.slice();
        current.forEach(function (listener) {
          try { listener.call(signal); } catch (_) { /* teardown must continue */ }
        });
        return true;
      }
    };
    return signal;
  }

  function createAbortController(host) {
    var target = hostWindow(host);
    var Controller = target && target.AbortController;
    if (typeof Controller !== "function" && typeof root.AbortController === "function") Controller = root.AbortController;
    if (typeof Controller === "function") {
      try { return new Controller(); } catch (_) { /* use the small fallback below */ }
    }
    return {
      signal: fallbackSignal(),
      abort: function () {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        if (typeof this.signal.dispatchEvent === "function") this.signal.dispatchEvent({ type: "abort" });
      }
    };
  }

  function createMountScope(host) {
    var controller = createAbortController(host);
    var signal = controller.signal;
    var cleanups = [];
    var timeoutIds = new Set();
    var intervalIds = new Set();
    var disposed = false;
    var disposeErrors = [];
    var scope;

    function active() {
      return !disposed && !signal.aborted;
    }

    function track(cleanup) {
      if (typeof cleanup !== "function") return noop;
      if (!active()) {
        try { cleanup(); } catch (error) { disposeErrors.push(error); }
        return noop;
      }
      var called = false;
      var wrapped = function () {
        if (called) return;
        called = true;
        var index = cleanups.indexOf(wrapped);
        if (index !== -1) cleanups.splice(index, 1);
        try { cleanup(); } catch (error) { disposeErrors.push(error); }
      };
      cleanups.push(wrapped);
      return wrapped;
    }

    function guard(callback) {
      if (typeof callback !== "function") return active();
      return function guardedCallback() {
        if (!active()) return undefined;
        return callback.apply(this, arguments);
      };
    }

    function setTimeoutScoped(callback, delay) {
      var set = timerFunction(host, "setTimeout");
      var clear = timerFunction(host, "clearTimeout");
      if (!set || typeof callback !== "function") return null;
      var id;
      var wrapped = guard(function () {
        timeoutIds.delete(id);
        if (removeTimeoutCleanup) removeTimeoutCleanup();
        return callback.apply(this, arguments);
      });
      id = set(wrapped, Number.isFinite(Number(delay)) ? Number(delay) : 0);
      timeoutIds.add(id);
      var removeTimeoutCleanup = track(function () {
        timeoutIds.delete(id);
        if (clear) clear(id);
      });
      return id;
    }

    function setIntervalScoped(callback, delay) {
      var set = timerFunction(host, "setInterval");
      var clear = timerFunction(host, "clearInterval");
      if (!set || typeof callback !== "function") return null;
      var id = set(guard(callback), Number.isFinite(Number(delay)) ? Number(delay) : 0);
      intervalIds.add(id);
      track(function () {
        intervalIds.delete(id);
        if (clear) clear(id);
      });
      return id;
    }

    function clearTimeoutScoped(id) {
      var clear = timerFunction(host, "clearTimeout");
      timeoutIds.delete(id);
      if (clear) clear(id);
    }

    function clearIntervalScoped(id) {
      var clear = timerFunction(host, "clearInterval");
      intervalIds.delete(id);
      if (clear) clear(id);
    }

    function listen(target, type, listener, options) {
      var actualTarget = target;
      var actualType = type;
      var actualListener = listener;
      var actualOptions = options;
      if (typeof target === "string") {
        actualTarget = host;
        actualType = target;
        actualListener = type;
        actualOptions = listener;
      }
      if (!actualTarget || typeof actualTarget.addEventListener !== "function" || typeof actualListener !== "function") return noop;
      actualTarget.addEventListener(actualType, actualListener, actualOptions);
      return track(function () {
        if (typeof actualTarget.removeEventListener === "function") actualTarget.removeEventListener(actualType, actualListener, actualOptions);
      });
    }

    function observe(targetOrObserver, options, callback) {
      if (!targetOrObserver) return noop;
      if (typeof targetOrObserver.disconnect === "function" && options === undefined && callback === undefined) {
        track(function () { targetOrObserver.disconnect(); });
        return targetOrObserver;
      }
      var target = hostWindow(host);
      var Constructor = target && target.MutationObserver;
      if (typeof Constructor !== "function" && typeof root.MutationObserver === "function") Constructor = root.MutationObserver;
      if (typeof Constructor !== "function" || typeof callback !== "function") return noop;
      var observer;
      try { observer = new Constructor(guard(callback)); } catch (_) { return noop; }
      try { observer.observe(targetOrObserver, options || {}); } catch (_) { return noop; }
      track(function () { observer.disconnect(); });
      return observer;
    }

    function dispose() {
      if (disposed) return false;
      disposed = true;
      try { controller.abort(); } catch (error) { disposeErrors.push(error); }
      timeoutIds.forEach(function (id) {
        var clear = timerFunction(host, "clearTimeout");
        if (clear) clear(id);
      });
      intervalIds.forEach(function (id) {
        var clear = timerFunction(host, "clearInterval");
        if (clear) clear(id);
      });
      timeoutIds.clear();
      intervalIds.clear();
      var pending = cleanups.slice().reverse();
      cleanups.length = 0;
      pending.forEach(function (cleanup) { cleanup(); });
      return true;
    }

    scope = {
      host: host || null,
      signal: signal,
      abortSignal: signal,
      get disposed() { return disposed; },
      get active() { return active(); },
      get disposeErrors() { return disposeErrors.slice(); },
      isDisposed: function () { return disposed; },
      isActive: active,
      guard: guard,
      guardCallback: guard,
      track: track,
      cleanup: track,
      trackCleanup: track,
      addCleanup: track,
      setTimeout: setTimeoutScoped,
      trackTimeout: setTimeoutScoped,
      timeout: setTimeoutScoped,
      setInterval: setIntervalScoped,
      trackInterval: setIntervalScoped,
      interval: setIntervalScoped,
      clearTimeout: clearTimeoutScoped,
      clearInterval: clearIntervalScoped,
      listen: listen,
      listenTo: listen,
      addEventListener: listen,
      on: listen,
      observe: observe,
      trackObserver: observe,
      dispose: dispose
    };
    return scope;
  }

  var api = Object.freeze({ createMountScope: createMountScope });
  root.ProdigyMountLifecycle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
