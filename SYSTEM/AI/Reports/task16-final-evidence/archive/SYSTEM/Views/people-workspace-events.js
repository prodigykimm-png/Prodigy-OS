(function (root) {
  "use strict";

  function create() {
    let disposed = false;
    const cleanups = [];

    function track(cleanup) {
      if (typeof cleanup !== "function") return cleanup;
      if (disposed) cleanup();
      else cleanups.push(cleanup);
      return cleanup;
    }

    function property(target, name, handler) {
      if (!target) return handler;
      const previous = target[name];
      target[name] = handler;
      track(() => {
        if (target[name] === handler) target[name] = previous || null;
      });
      return handler;
    }

    function observe(Observer, target, callback) {
      if (typeof Observer !== "function" || !target) return null;
      const observer = new Observer(callback);
      observer.observe(target);
      track(() => observer.disconnect());
      return observer;
    }

    function timeout(callback, delay) {
      if (typeof setTimeout !== "function") return null;
      const id = setTimeout(() => {
        if (!disposed) callback();
      }, delay);
      track(() => clearTimeout(id));
      return id;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      while (cleanups.length) {
        const cleanup = cleanups.pop();
        try { cleanup(); } catch (_error) { /* teardown must continue */ }
      }
    }

    return Object.freeze({
      track,
      property,
      observe,
      timeout,
      dispose,
      isDisposed: () => disposed
    });
  }

  const api = Object.freeze({ create });
  root.PeopleWorkspaceEvents = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
