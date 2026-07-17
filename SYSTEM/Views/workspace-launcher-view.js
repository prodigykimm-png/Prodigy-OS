(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-workspace-launcher-styles";

  const CSS = `
.prodigy-workspace-launcher {
  margin: 0;
}
.prodigy-workspace-launcher .home-header {
  margin-bottom: 10px;
}
.prodigy-launcher-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.prodigy-home.home-wide .prodigy-launcher-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.prodigy-launcher-card {
  display: flex;
  flex-direction: column;
  min-height: 148px;
  height: 100%;
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  background: var(--background-primary);
  padding: 12px;
  box-sizing: border-box;
  gap: 6px;
}
.prodigy-launcher-card.is-empty {
  opacity: 0.92;
}
.prodigy-launcher-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.prodigy-launcher-icon {
  font-size: 1.15em;
  line-height: 1;
  flex: none;
}
.prodigy-launcher-name {
  font-weight: 800;
  font-size: 0.95em;
  color: var(--text-normal);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prodigy-launcher-context {
  font-size: 0.78em;
  font-weight: 700;
  color: var(--text-accent);
  margin-top: 2px;
}
.prodigy-launcher-title {
  font-size: 0.92em;
  font-weight: 700;
  color: var(--text-normal);
  overflow-wrap: anywhere;
  line-height: 1.35;
  flex: 1 1 auto;
}
.prodigy-launcher-detail {
  font-size: 0.82em;
  color: var(--text-muted);
  line-height: 1.4;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.3em;
}
.prodigy-launcher-actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
}
.prodigy-launcher-actions button {
  /* Match Home compact action-btn density (Home CSS may further enforce) */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  height: auto;
  min-width: 0;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--text-accent);
  background: var(--background-secondary);
  color: var(--text-accent);
  font-weight: 700;
  font-size: 0.7em;
  line-height: 1.15;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
  white-space: nowrap;
}
.prodigy-launcher-actions button:active {
  transform: translateY(1px);
}
@media (max-width: 520px) {
  .prodigy-launcher-card {
    min-height: 132px;
  }
  .prodigy-launcher-actions button {
    width: auto;
  }
}
`;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = CSS;
  }

  function openPath(app, path) {
    if (!app || !path || !app.workspace || !app.workspace.openLinkText) return;
    app.workspace.openLinkText(path, path, false);
  }

  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {object} options.app
   * @param {Array} options.cards from WorkspaceLauncherCore.buildLauncherCards
   */
  function render(options) {
    const opts = options || {};
    const container = opts.container;
    const app = opts.app || root.app;
    if (!container) return;
    ensureStyles();
    if (typeof container.empty === "function") container.empty();

    const rootEl = container.createEl("div", {
      attr: { class: "prodigy-workspace-launcher home-card emphasis-primary" }
    });
    const headRow = rootEl.createEl("div", {
      attr: { style: "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px;" }
    });
    headRow.createEl("div", {
      text: "🚀 Workspace Launcher",
      attr: { class: "home-header", style: "margin:0;" }
    });
    if (root.ObjectCreatorView && typeof root.ObjectCreatorView.open === "function") {
      const plus = headRow.createEl("button", {
        text: "+ 새 Object",
        attr: { type: "button", title: "Universal Object Creator" }
      });
      plus.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        root.ObjectCreatorView.open(app, { pkg: opts.pkg || null });
      };
    }
    rootEl.createEl("div", {
      text: "What is waiting for me? · 실행은 각 Workspace에서 합니다.",
      attr: { style: "font-size:0.8em;color:var(--text-muted);margin:-4px 0 10px;line-height:1.4;" }
    });

    const grid = rootEl.createEl("div", { attr: { class: "prodigy-launcher-grid" } });
    const cards = Array.isArray(opts.cards) ? opts.cards : [];

    cards.forEach((card) => {
      const el = grid.createEl("div", {
        attr: {
          class: `prodigy-launcher-card${card.empty ? " is-empty" : ""}`
        }
      });

      const top = el.createEl("div", { attr: { class: "prodigy-launcher-top" } });
      top.createEl("span", {
        text: card.icon || "",
        attr: { class: "prodigy-launcher-icon" }
      });
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

      const actions = el.createEl("div", { attr: { class: "prodigy-launcher-actions" } });
      const verb = card.actionVerb || "열기";
      const btn = actions.createEl("button", {
        text: `▶ ${verb}`,
        attr: { type: "button" }
      });
      btn.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        // Launcher navigates to Workspace Dashboard only
        openPath(app, card.path);
      };
    });
  }

  const api = {
    render,
    ensureStyles
  };

  root.WorkspaceLauncherView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
