(function (root) {
  "use strict";

  function disposeHome(container, documentRef) {
    if (!container) return;
    const doc = documentRef || (typeof document !== "undefined" ? document : null);
    if (container.__prodigyCreatorKey && doc && typeof doc.removeEventListener === "function") {
      doc.removeEventListener("keydown", container.__prodigyCreatorKey);
    }
    if (container.__prodigyHomeResizeObserver) container.__prodigyHomeResizeObserver.disconnect();
    delete container.__prodigyCreatorKey;
    delete container.__prodigyHomeResizeObserver;
    delete container.__prodigyHomeVariantChange;
    delete container.__prodigyHomeLifecycle;
  }

  function isEditableShortcutTarget(target) {
    let current = target;
    while (current) {
      const tag = current.tagName ? String(current.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || current.isContentEditable) return true;
      const contentEditable = typeof current.getAttribute === "function" ? current.getAttribute("contenteditable") : null;
      if (contentEditable !== null && String(contentEditable).toLowerCase() !== "false") return true;
      current = current.parentElement || current.parentNode || null;
    }
    return false;
  }

  /** Bind the one document-level Home creator shortcut owned by this mount. */
  function bindCreatorShortcut(options) {
    const opts = options || {};
    const container = opts.container;
    const doc = opts.document || (typeof document !== "undefined" ? document : null);
    if (!container || container.__prodigyCreatorKey || !doc || typeof doc.addEventListener !== "function") return null;
    const handler = (event) => {
      if (!event) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || (event.key !== "n" && event.key !== "N") || event.altKey || event.shiftKey) return;
      if (isEditableShortcutTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const creator = typeof opts.getCreator === "function" ? opts.getCreator() : null;
      if (creator && typeof creator.open === "function") creator.open(opts.app, { pkg: opts.pkg });
    };
    container.__prodigyCreatorKey = handler;
    doc.addEventListener("keydown", handler);
    return handler;
  }

  /** Build Home's navigation action with its existing recoverable error route. */
  function createPathOpener(options) {
    const opts = options || {};
    return function openPath(path, openOptions) {
      const actionOptions = Object.assign({
        container: opts.container,
        title: "홈",
        label: "홈"
      }, openOptions || {});
      const navigation = opts.navigation;
      if (navigation && typeof navigation.openPath === "function") {
        return navigation.openPath(opts.app, path, actionOptions);
      }
      if (actionOptions.container && navigation && typeof navigation.renderOpenError === "function") {
        navigation.renderOpenError(actionOptions.container, new Error("workspace navigation unavailable"), {
          title: actionOptions.title,
          retry: () => openPath(path, actionOptions)
        });
      } else if (typeof opts.Notice === "function") {
        new opts.Notice("파일을 열 수 없습니다. 다시 시도해 주세요.");
      }
      return Promise.resolve({ ok: false, path: path || "" });
    };
  }

  const api = Object.freeze({ disposeHome, isEditableShortcutTarget, bindCreatorShortcut, createPathOpener });
  root.HomeController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
