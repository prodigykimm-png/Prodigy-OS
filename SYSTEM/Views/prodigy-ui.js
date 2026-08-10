(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-ui-styles";

  const CSS = `
/* Prodigy OS shared controls */
.prodigy-btn,
.prodigy-home .action-btn,
.prodigy-journal-workspace .journal-actions button,
.prodigy-journal-workspace .journal-row button,
.reading-loop-actions button,
.prodigy-list-workspace .workspace-list-actions button,
.prodigy-list-workspace .workspace-list-open,
.prodigy-project-type-filter button,
.prodigy-card-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ke-space-1, 2px);
  min-height: 32px;
  height: auto;
  padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px);
  border-radius: var(--ke-radius-control, 4px);
  font-size: var(--ke-type-label, 0.72rem);
  font-weight: 600;
  line-height: var(--ke-leading-control, 1.35);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  cursor: pointer;
  box-sizing: border-box;
  min-inline-size: 0;
  white-space: normal;
  text-align: center;
  word-break: keep-all;
  overflow-wrap: anywhere;
  transition: background-color var(--ke-motion-fast, 150ms) ease, border-color var(--ke-motion-fast, 150ms) ease, opacity var(--ke-motion-fast, 150ms) ease, transform 100ms ease;
  -webkit-appearance: none;
  appearance: none;
}

.prodigy-btn:hover,
.prodigy-home .action-btn:hover,
.prodigy-journal-workspace .journal-actions button:hover,
.prodigy-journal-workspace .journal-row button:hover,
.reading-loop-actions button:hover,
.prodigy-list-workspace .workspace-list-actions button:hover,
.prodigy-list-workspace .workspace-list-open:hover,
.prodigy-project-type-filter button:hover,
.prodigy-card-actions button:hover {
  background: var(--ke-color-hover, var(--background-modifier-hover));
}

.prodigy-btn:active,
.prodigy-home .action-btn:active {
  transform: translateY(1px);
}

.prodigy-btn:disabled,
.prodigy-home .action-btn:disabled,
.reading-loop-actions button:disabled,
.prodigy-card-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.prodigy-btn:focus-visible,
.prodigy-home .action-btn:focus-visible,
.prodigy-journal-workspace .journal-actions button:focus-visible,
.prodigy-journal-workspace .journal-row button:focus-visible,
.reading-loop-actions button:focus-visible,
.prodigy-list-workspace .workspace-list-actions button:focus-visible,
.prodigy-list-workspace .workspace-list-open:focus-visible,
.prodigy-project-type-filter button:focus-visible,
.prodigy-card-actions button:focus-visible,
.auction-header-bid-sheet:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}

/* Primary / CTA */
.prodigy-btn-primary,
.prodigy-btn.mod-cta,
.prodigy-home .action-btn-primary,
.prodigy-home button.action-btn-primary,
.reading-loop-actions button.mod-cta,
.prodigy-journal-workspace .journal-actions button.mod-cta,
.prodigy-card-actions button.prodigy-btn-primary {
  background: var(--ke-color-interactive, var(--interactive-accent)) !important;
  color: var(--ke-color-on-interactive, var(--text-on-accent)) !important;
  border-color: var(--ke-color-interactive, var(--interactive-accent)) !important;
}

.prodigy-btn-primary:hover,
.prodigy-btn.mod-cta:hover,
.prodigy-home .action-btn-primary:hover,
.prodigy-home button.action-btn-primary:hover,
.reading-loop-actions button.mod-cta:hover,
.prodigy-journal-workspace .journal-actions button.mod-cta:hover {
  background: var(--interactive-accent-hover, var(--ke-color-interactive, var(--interactive-accent))) !important;
  filter: brightness(1.03);
}

/* Danger */
.prodigy-btn-danger,
.reading-loop-actions button.prodigy-btn-danger,
.prodigy-card-actions button.prodigy-btn-danger {
  color: var(--ke-color-error, var(--text-error)) !important;
  border-color: color-mix(in srgb, var(--ke-color-error, var(--text-error)) 40%, var(--ke-color-border, var(--background-modifier-border))) !important;
  background: color-mix(in srgb, var(--ke-color-error, var(--text-error)) 8%, var(--ke-color-surface, var(--background-primary))) !important;
}

/* Quiet / secondary */
.prodigy-btn-quiet {
  background: var(--ke-color-hover, var(--background-modifier-hover));
  border-color: transparent;
}

/* Compact chip-style (status change, filters) */
.prodigy-btn-chip,
.prodigy-project-type-filter button {
  min-height: 30px;
  height: auto;
  padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
  border-radius: 999px;
  font-size: var(--ke-type-chrome, 0.68rem);
  line-height: var(--ke-leading-control, 1.35);
}

.prodigy-project-type-filter button.is-active,
.prodigy-btn-chip.is-active {
  border-color: var(--ke-color-accent, var(--text-accent)) !important;
  background: color-mix(in srgb, var(--ke-color-accent, var(--text-accent)) 16%, var(--ke-color-surface-secondary, var(--background-secondary))) !important;
  color: var(--ke-color-text, var(--text-normal)) !important;
  font-weight: 700;
}

/* Button rows */
.prodigy-btn-row,
.prodigy-card-actions,
.reading-loop-actions,
.prodigy-journal-workspace .journal-actions,
.prodigy-home .focus-actions,
.prodigy-home .focus-footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ke-space-2, 4px);
  align-items: center;
}

.prodigy-home .focus-actions,
.prodigy-home .focus-footer {
  gap: var(--ke-space-2, 4px);
}

/* Auction card action row: keep status + site-visit on one compact flow */
.auction-card-actions {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ke-space-2, 4px) !important;
  margin-top: 2px !important;
  padding-top: 2px !important;
}
.auction-card-actions > .prodigy-btn,
.auction-card-actions > button {
  flex: 0 0 auto !important;
  width: auto !important;
  min-height: 32px;
  height: auto !important;
  padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px) !important;
  font-size: var(--ke-type-chrome, 0.68rem) !important;
  line-height: var(--ke-leading-control, 1.35) !important;
}
.auction-card-research-attention {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ke-space-1, 2px);
  min-inline-size: 0;
}
.auction-card-research-badge {
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
  padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: 999px;
  background: var(--ke-color-hover, var(--background-modifier-hover));
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-chrome, .68rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.auction-card[data-navigation-focus="true"] {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 3px;
}

.auction-card-finance-row {
  min-inline-size: 0;
  word-break: keep-all;
}
.auction-card-finance-group {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ke-space-2, 4px);
  min-inline-size: 0;
  padding: 2px 0;
}
.auction-card-finance-group + .auction-card-finance-group {
  padding-inline-start: var(--ke-space-3, 8px);
  border-inline-start: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-card-finance-label {
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-chrome, .68rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  white-space: normal;
  overflow-wrap: anywhere;
}
.auction-card-finance-separator {
  color: var(--ke-color-muted, var(--text-muted));
}
.auction-card-next-action-label {
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-chrome, .68rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  white-space: normal;
  overflow-wrap: anywhere;
  padding-inline-end: var(--ke-space-1, 2px);
}

/* Reading cards: keep cover clear of action buttons */
.reading-card-hero-main {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  min-width: 0;
}
.reading-card-cover {
  flex: 0 0 auto;
  position: relative;
  z-index: 0;
}
.reading-card-meta {
  flex: 1 1 auto;
  min-width: 0;
}
.reading-card-actions {
  width: 100%;
  position: relative;
  z-index: 1;
}

.prodigy-status-line,
.prodigy-inline-error {
  min-inline-size: 0;
  font-size: var(--ke-type-body, .84rem);
  line-height: var(--ke-leading-body, 1.45);
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.prodigy-status-line { color: var(--ke-color-muted, var(--text-muted)); }
.prodigy-status-line.is-busy { color: var(--ke-color-text, var(--text-normal)); }
.prodigy-inline-error {
  display: flex;
  align-items: center;
  gap: var(--ke-space-3, 8px);
  padding: var(--ke-space-3, 8px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 4px);
  color: var(--ke-color-error, var(--text-error));
}
.prodigy-inline-error .prodigy-btn { flex: 0 0 auto; }

@media (max-width: 767px) {
  /* Compact controls retain the shared touch target; only desktop uses dense geometry. */
  .prodigy-btn,
  .reading-loop-actions button,
  .prodigy-journal-workspace .journal-actions button,
  .prodigy-card-actions button,
  .prodigy-list-workspace .workspace-list-actions button,
  .prodigy-list-workspace .workspace-list-open,
  .auction-card-actions > button,
  .prodigy-home .action-btn,
  .prodigy-home .prodigy-launcher-actions button,
  .prodigy-home .home-launcher-mount button,
  .auction-header-bid-sheet {
    min-height: var(--ke-touch-target, 44px) !important;
    height: auto !important;
    padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px) !important;
    font-size: var(--ke-type-label, 0.72rem) !important;
    line-height: var(--ke-leading-control, 1.35) !important;
    border-radius: var(--ke-radius-control, 4px) !important;
  }

  .prodigy-btn-chip,
  .prodigy-project-type-filter button {
    min-height: var(--ke-touch-target, 44px) !important;
    padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px) !important;
    font-size: var(--ke-type-chrome, 0.68rem) !important;
    line-height: var(--ke-leading-control, 1.35) !important;
  }

  .prodigy-btn-row,
  .prodigy-card-actions,
  .reading-loop-actions,
  .prodigy-journal-workspace .journal-actions,
  .prodigy-home .focus-actions,
  .prodigy-home .focus-footer,
  .auction-card-actions {
    gap: var(--ke-space-1, 2px) !important;
  }

  .prodigy-home .action-btn {
    flex: 0 1 auto !important;
  }

  .prodigy-home .focus-actions > .action-btn,
  .prodigy-home .focus-footer > .action-btn,
  .prodigy-home .home-toolbar > .action-btn {
    flex: 0 1 auto !important;
    width: auto !important;
  }

  .reading-card-actions > button,
  .reading-loop-actions > button,
  .prodigy-journal-workspace .journal-actions > button {
    flex: 0 1 auto;
    min-width: 0;
  }

  .reading-card-hero-main {
    gap: 8px;
  }
  .reading-card-cover img,
  .reading-card-cover > div {
    width: 64px !important;
    height: 92px !important;
  }

  .auction-card-actions {
    margin-top: 2px !important;
    padding-top: 2px !important;
  }

  .auction-card-finance-group {
    gap: var(--ke-space-1, 2px);
    padding-block: 1px;
  }
  .auction-card-finance-group + .auction-card-finance-group {
    padding-inline-start: var(--ke-space-2, 4px);
  }

  .prodigy-inline-error .prodigy-btn {
    min-height: var(--ke-touch-target, 44px) !important;
  }
}

.auction-card-actions.is-compact {
  flex-wrap: wrap;
  row-gap: var(--ke-space-2, 4px);
  overflow: visible;
}
.auction-card-actions.is-compact > .prodigy-btn,
.auction-card-actions.is-compact > button {
  min-height: var(--prodigy-auction-touch-target, var(--ke-touch-target, 44px)) !important;
  padding-inline: var(--ke-space-3, 8px) !important;
  font-size: var(--ke-type-label, .72rem) !important;
  word-break: keep-all;
}
.auction-header-bid-sheet {
  flex-shrink: 0;
  min-height: 32px;
  padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 4px);
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-label, 0.72rem);
  line-height: var(--ke-leading-control, 1.35);
  min-inline-size: 0;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.auction-header-bid-sheet:hover {
  background: var(--ke-color-hover, var(--background-modifier-hover));
}
.auction-header-bid-sheet:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .prodigy-btn,
  .prodigy-home .action-btn,
  .reading-loop-actions button,
  .prodigy-journal-workspace .journal-actions button,
  .prodigy-card-actions button,
  .auction-header-bid-sheet {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
}
`;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = CSS;
  }

  function button(parent, text, options) {
    ensureStyles();
    const opts = options || {};
    const classes = ["prodigy-btn"];
    if (opts.primary || opts.cta) classes.push("prodigy-btn-primary");
    if (opts.danger) classes.push("prodigy-btn-danger");
    if (opts.quiet) classes.push("prodigy-btn-quiet");
    if (opts.chip) classes.push("prodigy-btn-chip");
    if (opts.active) classes.push("is-active");
    if (opts.className) classes.push(String(opts.className));
    const btn = parent.createEl("button", {
      text: text || "",
      attr: {
        type: opts.type || "button",
        class: classes.join(" "),
        title: opts.title || ""
      }
    });
    if (opts.disabled) btn.disabled = true;
    if (typeof opts.onClick === "function") {
      btn.onclick = (event) => {
        event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        opts.onClick(event);
      };
    }
    return btn;
  }

  function actionRow(parent, className) {
    ensureStyles();
    return parent.createEl("div", {
      attr: { class: className ? `prodigy-btn-row ${className}` : "prodigy-btn-row prodigy-card-actions" }
    });
  }

  function auctionActionRow(parent, logicalWidth) {
    ensureStyles();
    const breakpoints = root.ProdigyTokens && root.ProdigyTokens.BREAKPOINTS;
    const heights = root.ProdigyTokens && root.ProdigyTokens.CONTROL_HEIGHTS;
    if (!breakpoints || !heights) throw new Error("Prodigy responsive tokens are required");
    if (!Number.isFinite(logicalWidth) || logicalWidth <= 0) {
      throw new TypeError("logicalWidth must be a positive finite number");
    }

    const row = actionRow(parent, "auction-card-actions");
    row.setAttribute("data-action-layout", "inline");
    row.setAttribute(
      "style",
      `--prodigy-auction-action-bar-height:${heights.actionBar}px;--prodigy-auction-touch-target:${heights.touchTarget}px;`
    );
    if (logicalWidth < breakpoints.medium) row.classList.add("is-compact");
    return { mode: "inline", row, actionHost: row };
  }

  function StatusLine(parent, options) {
    ensureStyles();
    const opts = typeof options === "string" ? { text: options } : (options || {});
    const classes = ["prodigy-status-line"];
    if (opts.busy) classes.push("is-busy");
    const line = parent.createEl("div", {
      text: opts.text || "",
      attr: {
        class: classes.join(" "),
        role: "status",
        "aria-live": opts.live || "polite",
        "aria-busy": opts.busy ? "true" : "false"
      }
    });
    return line;
  }

  function InlineError(parent, options) {
    ensureStyles();
    const opts = typeof options === "string" ? { message: options } : (options || {});
    const box = parent.createEl("div", { attr: { class: "prodigy-inline-error", role: "alert" } });
    box.createEl("span", { text: opts.message || "문제가 발생했습니다." });
    if (typeof opts.onRetry === "function") {
      button(box, opts.retryLabel || "다시 시도", { quiet: true, onClick: opts.onRetry });
    }
    return box;
  }

  const api = {
    ensureStyles,
    button,
    actionRow,
    auctionActionRow,
    StatusLine,
    InlineError,
    STYLE_ID
  };

  root.ProdigyUI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  // Auto-inject when loaded in browser/Obsidian
  try { ensureStyles(); } catch (_error) { /* ignore */ }
})(typeof globalThis !== "undefined" ? globalThis : this);
