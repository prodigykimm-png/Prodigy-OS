(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-workspace-launcher-styles";

  const CSS = `
.prodigy-workspace-launcher {
  inline-size: 100%;
  max-inline-size: 100%;
  min-inline-size: 0;
  color: var(--ke-color-text);
  font-size: var(--ke-type-body, .84rem);
  line-height: var(--ke-leading-body, 1.45);
  overflow-wrap: anywhere;
  padding: min(var(--ke-space-4, 12px), 4%);
}
.prodigy-workspace-launcher,
.prodigy-workspace-launcher * {
  box-sizing: border-box;
  max-inline-size: 100%;
  min-inline-size: 0;
}
.prodigy-workspace-launcher .home-header {
  margin: 0;
  font-size: var(--ke-type-title, 1.05rem);
  line-height: var(--ke-leading-body, 1.45);
}
.prodigy-launcher-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ke-space-3, 8px);
  flex-wrap: wrap;
  margin-block-end: var(--ke-space-2, 4px);
  min-inline-size: 0;
}
.prodigy-launcher-description {
  margin: 0 0 var(--ke-space-4, 12px);
  color: var(--ke-color-muted);
  font-size: var(--ke-type-label, .72rem);
  line-height: var(--ke-leading-body, 1.45);
  overflow-wrap: anywhere;
}
.prodigy-launcher-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: var(--ke-space-3, 8px);
  min-inline-size: 0;
}
.prodigy-launcher-card {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  block-size: 100%;
  box-sizing: border-box;
  gap: var(--ke-space-2, 4px);
  padding: min(var(--ke-space-4, 12px), 4%);
  border: 1px solid var(--ke-color-border);
  border-radius: var(--ke-radius-panel, 8px);
  background: var(--ke-color-surface);
  overflow-wrap: anywhere;
}
.prodigy-launcher-card.is-empty { opacity: .92; }
.prodigy-launcher-top {
  display: flex;
  align-items: center;
  gap: var(--ke-space-2, 4px);
  min-inline-size: 0;
}
.prodigy-launcher-name {
  min-inline-size: 0;
  color: var(--ke-color-text);
  font-size: var(--ke-type-heading, .92rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  overflow-wrap: anywhere;
  word-break: keep-all;
}
.prodigy-launcher-context {
  min-inline-size: 0;
  margin-block-start: var(--ke-space-1, 2px);
  color: var(--ke-color-accent);
  font-size: var(--ke-type-label, .72rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  overflow-wrap: anywhere;
}
.prodigy-launcher-title {
  flex: 1 1 auto;
  min-inline-size: 0;
  color: var(--ke-color-text);
  font-size: var(--ke-type-body, .84rem);
  font-weight: 700;
  line-height: var(--ke-leading-body, 1.45);
  overflow-wrap: anywhere;
  word-break: keep-all;
}
.prodigy-launcher-detail {
  min-inline-size: 0;
  min-block-size: 0;
  color: var(--ke-color-muted);
  font-size: var(--ke-type-label, .72rem);
  line-height: var(--ke-leading-body, 1.45);
  overflow-wrap: anywhere;
  word-break: keep-all;
}
.prodigy-launcher-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ke-space-2, 4px);
  margin-block-start: auto;
  padding-block-start: var(--ke-space-2, 4px);
  min-inline-size: 0;
}
.prodigy-launcher-actions .prodigy-btn {
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: min(var(--ke-touch-target, 44px), 100%);
  max-inline-size: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  box-shadow: none;
}
.prodigy-launcher-actions .prodigy-btn:focus-visible {
  outline: 2px solid var(--ke-color-accent);
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .prodigy-launcher-actions .prodigy-btn {
    flex: 1 1 100%;
    inline-size: 100%;
  }
}
@media (forced-colors: active) {
  .prodigy-workspace-launcher :focus-visible { outline-color: Highlight; }
  .prodigy-launcher-card { border-width: var(--ke-focus-ring-width); }
}
@media (prefers-reduced-motion: reduce) {
  .prodigy-workspace-launcher *,
  .prodigy-workspace-launcher *::before,
  .prodigy-workspace-launcher *::after {
    transition: none !important;
    animation: none !important;
  }
}
`;

  function ensureStyles() {
    if (root.ProdigyUI && typeof root.ProdigyUI.ensureStyles === "function") root.ProdigyUI.ensureStyles();
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = CSS;
  }

  function resolveNavigation() {
    if (root.ProdigyWorkspaceNavigation) return root.ProdigyWorkspaceNavigation;
    if (typeof require === "function") {
      try { return require("./workspace-navigation.js"); } catch (_error) { return null; }
    }
    return null;
  }

  function openPath(app, path, options) {
    const navigation = resolveNavigation();
    if (navigation && typeof navigation.openPath === "function") {
      return navigation.openPath(app, path, options || {});
    }
    const opts = options || {};
    if (opts.container && navigation && typeof navigation.renderOpenError === "function") {
      navigation.renderOpenError(opts.container, new Error("workspace navigation unavailable"), {
        title: opts.title || "워크스페이스",
        retry: () => openPath(app, path, opts)
      });
    } else if (typeof root.Notice === "function") {
      new root.Notice("워크스페이스를 열 수 없습니다. 다시 시도해 주세요.");
    }
    return Promise.resolve({ ok: false, path: path || "" });
  }
  function launcherActionRow(parent) {
    if (root.ProdigyUI && typeof root.ProdigyUI.actionRow === "function") {
      return root.ProdigyUI.actionRow(parent, "prodigy-launcher-actions");
    }
    return parent.createEl("div", { attr: { class: "prodigy-btn-row prodigy-launcher-actions" } });
  }

  function launcherButton(parent, text, options) {
    const opts = options || {};
    if (root.ProdigyUI && typeof root.ProdigyUI.button === "function") {
      return root.ProdigyUI.button(parent, text, {
        quiet: true,
        className: opts.className || "prodigy-launcher-action",
        title: opts.title || ""
      });
    }
    return parent.createEl("button", {
      text,
      attr: {
        type: "button",
        class: `prodigy-btn prodigy-btn-quiet ${opts.className || "prodigy-launcher-action"}`,
        title: opts.title || ""
      }
    });
  }

  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {object} options.app
   * @param {Array} options.cards from WorkspaceLauncherCore.buildLauncherCards
   * @param {boolean} [options.showCreator=true] false when Home already shows a creator
   * @param {boolean} [options.hideEmptyCards=false] true to drop empty context cards (compact Home)
   */
  function render(options) {
    const opts = options || {};
    const container = opts.container;
    const app = opts.app || root.app;
    if (!container) return;
    ensureStyles();
    if (typeof container.empty === "function") container.empty();
    const showCreator = opts.showCreator !== false;

    const rootEl = container.createEl("div", {
      attr: {
        class: "prodigy-workspace-launcher home-card prodigy-utility-card emphasis-secondary",
        "data-state": Array.isArray(opts.cards) && opts.cards.length ? "success" : "empty"
      }
    });
    const headRow = rootEl.createEl("div", {
      attr: { class: "prodigy-launcher-head" }
    });
    headRow.createEl("div", {
      text: "Workspace Launcher",
      attr: { class: "home-header" }
    });
    if (showCreator && root.ObjectCreatorView && typeof root.ObjectCreatorView.open === "function") {
      const plus = launcherButton(headRow, "+ 새 Object", {
        className: "prodigy-launcher-create",
        title: "새 Object 만들기"
      });
      if (typeof plus.setAttribute === "function") plus.setAttribute("aria-label", "새 Object 만들기");
      plus.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        root.ObjectCreatorView.open(app, { pkg: opts.pkg || null });
      };
    }
    rootEl.createEl("div", {
      text: "What is waiting for me? · 실행은 각 Workspace에서 합니다.",
      attr: { class: "prodigy-launcher-description" }
    });

    const grid = rootEl.createEl("div", { attr: { class: "prodigy-launcher-grid" } });
    const allCards = Array.isArray(opts.cards) ? opts.cards : [];
    const cards = opts.hideEmptyCards ? allCards.filter((card) => card && !card.empty) : allCards;

    let emptyStateEmitted = false;
    cards.forEach((card) => {
      const cardAttributes = {
        class: `prodigy-launcher-card${card.empty ? " is-empty" : ""}`
      };
      if (card.empty && !emptyStateEmitted) {
        cardAttributes["data-state"] = "empty";
        emptyStateEmitted = true;
      }
      const el = grid.createEl("div", { attr: cardAttributes });

      const top = el.createEl("div", { attr: { class: "prodigy-launcher-top" } });
      top.createEl("span", {
        text: card.name || "",
        attr: { class: "prodigy-launcher-name" }
      });

      el.createEl("div", {
        text: card.contextLabel || "",
        attr: { class: "prodigy-launcher-context" }
      });

      if (card.title) {
        el.createEl("div", {
          text: card.title,
          attr: { class: "prodigy-launcher-title" }
        });
      } else {
        el.createEl("div", {
          text: card.detail || "—",
          attr: { class: "prodigy-launcher-title" }
        });
      }

      if (card.title && card.detail) {
        el.createEl("div", {
          text: card.detail,
          attr: { class: "prodigy-launcher-detail" }
        });
      } else if (!card.title) {
        el.createEl("div", {
          text: " ",
          attr: { class: "prodigy-launcher-detail" }
        });
      } else {
        el.createEl("div", {
          text: " ",
          attr: { class: "prodigy-launcher-detail" }
        });
      }

      const actions = launcherActionRow(el);
      const verb = card.actionVerb || "열기";
      const actionName = `${card.name || "워크스페이스"} ${verb}`;
      const btn = launcherButton(actions, verb, {
        title: actionName
      });
      if (typeof btn.setAttribute === "function") btn.setAttribute("aria-label", actionName);
      btn.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const exactTarget = card.continuation_path
          || (card.continue_target && (card.continue_target.object_path
            || card.continue_target.target_path
            || card.continue_target.source_path))
          || "";
        const isContinue = verb === "계속" || verb === "이어 읽기";
        const target = isContinue && exactTarget ? exactTarget : card.path;
        openPath(app, target, {
          container: rootEl,
          title: card.name || "워크스페이스",
          label: card.name || "워크스페이스"
        });
      };
    });
  }

  const api = {
    render,
    ensureStyles,
    openPath
  };

  root.WorkspaceLauncherView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
