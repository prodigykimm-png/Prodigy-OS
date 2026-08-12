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
  gap: var(--ke-space-2, 8px);
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: min(var(--ke-touch-target, 44px), 100%);
  height: auto;
  padding: 8px 15px;
  border-radius: var(--ke-radius-control, 8px);
  font-family: var(--ke-font-text, system-ui, -apple-system, sans-serif);
  font-size: var(--ke-type-label, 14px);
  font-weight: 600;
  line-height: var(--ke-leading-control, 1.35);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  cursor: pointer;
  box-sizing: border-box;
  box-shadow: none;
  white-space: normal;
  text-align: center;
  word-break: keep-all;
  overflow-wrap: anywhere;
  transition: background-color var(--ke-motion-fast, 150ms) ease, border-color var(--ke-motion-fast, 150ms) ease, opacity var(--ke-motion-fast, 150ms) ease, transform 100ms ease;
  -webkit-appearance: none;
  appearance: none;
}

.prodigy-btn.prodigy-btn,
.prodigy-configurator-chip.prodigy-configurator-chip,
.auction-header-bid-sheet.auction-header-bid-sheet {
  box-shadow: none;
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
.prodigy-home .action-btn:active,
.prodigy-journal-workspace .journal-actions button:active,
.prodigy-journal-workspace .journal-row button:active,
.reading-loop-actions button:active,
.prodigy-list-workspace .workspace-list-actions button:active,
.prodigy-list-workspace .workspace-list-open:active,
.prodigy-project-type-filter button:active,
.prodigy-card-actions button:active {
  transform: scale(0.95);
}

.prodigy-btn:disabled,
.prodigy-home .action-btn:disabled,
.reading-loop-actions button:disabled,
.prodigy-card-actions button:disabled {
  opacity: var(--ke-opacity-disabled, 0.6);
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
  outline: var(--ke-focus-ring-width, 2px) solid var(--ke-color-accent, var(--text-accent));
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
  padding: 11px 22px;
  border-radius: var(--ke-radius-pill, 9999px);
  background: var(--ke-color-interactive, var(--interactive-accent)) !important;
  color: var(--ke-color-on-interactive, var(--text-on-accent)) !important;
  border-color: var(--ke-color-interactive, var(--interactive-accent)) !important;
  font-size: var(--ke-type-body, 17px);
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
  min-block-size: var(--ke-touch-target, 44px);
  height: auto;
  padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
  border-radius: var(--ke-radius-pill, 9999px);
  font-size: var(--ke-type-chrome, 14px);
  line-height: var(--ke-leading-control, 1.35);
}

.prodigy-project-type-filter button.is-active,
.prodigy-btn-chip.is-active {
  border-color: var(--ke-color-accent, var(--text-accent)) !important;
  background: color-mix(in srgb, var(--ke-color-accent, var(--text-accent)) 16%, var(--ke-color-surface-secondary, var(--background-secondary))) !important;
  color: var(--ke-color-text, var(--text-normal)) !important;
  font-weight: 700;
}

/* Alpha component grammar: full-bleed gallery, utility, and configurator. */
.prodigy-btn-secondary {
  padding: 11px 22px;
  border-radius: var(--ke-radius-pill, 9999px);
  border-color: var(--ke-color-interactive, var(--interactive-accent));
  background: transparent;
  color: var(--ke-color-interactive, var(--interactive-accent));
  box-shadow: none;
}
.prodigy-btn-dark {
  padding: 8px 15px;
  border-radius: var(--ke-radius-control, 8px);
  background: var(--ke-color-dark, var(--background-secondary-alt));
  color: var(--ke-color-on-interactive, var(--text-on-accent));
  box-shadow: none;
}
.prodigy-btn-hero {
  padding: 14px 28px;
  border-radius: var(--ke-radius-pill, 9999px);
  font-size: 18px;
  font-weight: 300;
}
.prodigy-icon-control {
  inline-size: var(--ke-control-height, 44px);
  min-inline-size: var(--ke-control-height, 44px);
  min-block-size: var(--ke-control-height, 44px);
  padding: 0;
  border-radius: var(--ke-radius-pill, 9999px);
}
.prodigy-search-input {
  inline-size: 100%;
  min-block-size: var(--ke-control-height, 44px);
  padding: 12px 20px;
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-pill, 9999px);
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  font: 400 17px/1.47 var(--ke-font-text, system-ui, -apple-system, sans-serif);
  box-shadow: none;
}
.prodigy-full-bleed {
  inline-size: 100%;
  margin: 0;
  padding: var(--ke-space-section, 80px) max(var(--ke-space-4, 17px), calc((100% - 1440px) / 2));
  border: 0;
  border-radius: 0;
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  box-shadow: none;
}
.prodigy-full-bleed + .prodigy-full-bleed { margin-block-start: 0; }
.prodigy-full-bleed.is-parchment { background: var(--ke-color-surface-secondary, var(--background-secondary)); }
.prodigy-full-bleed.is-dark {
  background: var(--ke-color-dark, var(--background-secondary-alt));
  color: var(--ke-color-on-interactive, var(--text-on-accent));
}
.prodigy-full-bleed.is-dark a,
.prodigy-full-bleed.is-dark .prodigy-btn-secondary { color: var(--ke-color-interactive-dark, var(--text-accent)); }
.prodigy-utility-card {
  min-inline-size: 0;
  padding: var(--ke-space-5, 24px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 18px);
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  box-shadow: none;
}
.prodigy-configurator-chip {
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: min(var(--ke-touch-target, 44px), 100%);
  padding: 12px 16px;
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-pill, 9999px);
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  font-size: 14px;
  box-shadow: none;
  -webkit-appearance: none;
  appearance: none;
}
.prodigy-configurator-chip[aria-selected="true"],
.prodigy-configurator-chip[aria-pressed="true"] {
  border-width: var(--ke-focus-ring-width, 2px);
  border-color: var(--ke-color-accent, var(--text-accent));
}
.prodigy-image-content { box-shadow: var(--ke-shadow-image, none); }
.prodigy-btn[data-state="loading"], .prodigy-btn[aria-busy="true"] { border-style: dashed; cursor: progress; }
.prodigy-btn[data-state="empty"] { border-style: dotted; color: var(--ke-color-muted, var(--text-muted)); }
.prodigy-btn[data-state="error"] { border-style: double; border-width: 3px; color: var(--ke-color-error, var(--text-error)); }
.prodigy-btn[aria-selected="true"], .prodigy-btn[aria-pressed="true"], .prodigy-btn[data-state="selected"] {
  border-width: var(--ke-focus-ring-width, 2px);
  border-color: var(--ke-color-accent, var(--text-accent));
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
  min-height: var(--ke-touch-target, 44px);
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
  border-radius: var(--ke-radius-pill, 9999px);
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
.prodigy-status-line.is-busy,
.prodigy-status-line[data-state="loading"] { color: var(--ke-color-text, var(--text-normal)); }
.prodigy-status-line[data-state="success"] { color: var(--ke-color-success, var(--text-success)); }
.prodigy-status-line[data-state="warning"] { color: var(--ke-color-warning, var(--text-warning)); }
.prodigy-status-line[data-state="error"] { color: var(--ke-color-error, var(--text-error)); }
.prodigy-status-line[data-state="empty"] { color: var(--ke-color-muted, var(--text-muted)); }
.prodigy-inline-error {
  display: flex;
  align-items: center;
  gap: var(--ke-space-3, 8px);
  padding: var(--ke-space-3, 8px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 8px);
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
    border-radius: var(--ke-radius-control, 8px) !important;
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
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: min(var(--ke-touch-target, 44px), 100%);
  padding: var(--ke-space-1, 2px) var(--ke-space-3, 8px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 8px);
  background: var(--ke-color-surface, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-label, 0.72rem);
  line-height: var(--ke-leading-control, 1.35);
  min-inline-size: 0;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
  cursor: pointer;
  box-shadow: none;
  -webkit-appearance: none;
  appearance: none;
}
.auction-header-bid-sheet:hover {
  background: var(--ke-color-hover, var(--background-modifier-hover));
}
.auction-header-bid-sheet:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 1px;
}
@media (forced-colors: active) {
  .prodigy-btn-primary,
  .prodigy-btn.mod-cta,
  .prodigy-project-type-filter button.is-active,
  .prodigy-btn-chip.is-active {
    border-color: Highlight !important;
  }
  .prodigy-btn:disabled,
  .prodigy-home .action-btn:disabled,
  .reading-loop-actions button:disabled,
  .prodigy-card-actions button:disabled {
    color: GrayText;
  }
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
    if (opts.secondary) classes.push("prodigy-btn-secondary");
    if (opts.dark) classes.push("prodigy-btn-dark");
    if (opts.hero) classes.push("prodigy-btn-primary", "prodigy-btn-hero");
    if (opts.icon) classes.push("prodigy-icon-control");
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
    const state = opts.state || (opts.loading ? "loading" : opts.selected ? "selected" : "");
    if (state) btn.setAttribute("data-state", state);
    if (opts.selected) btn.setAttribute("aria-pressed", "true");
    if (opts.loading) btn.setAttribute("aria-busy", "true");
    if (opts.disabled || opts.loading) btn.disabled = true;
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

  function surface(parent, kind, options) {
    ensureStyles();
    const opts = options || {};
    const classes = kind === "fullBleed" ? ["prodigy-full-bleed"]
      : kind === "configurator" ? ["prodigy-configurator-chip"]
        : ["prodigy-utility-card"];
    if (opts.tone === "parchment") classes.push("is-parchment");
    if (opts.tone === "dark") classes.push("is-dark");
    if (opts.className) classes.push(String(opts.className));
    const element = parent.createEl(opts.tag || (kind === "configurator" ? "button" : "section"), {
      attr: { class: classes.join(" ") }
    });
    if (kind === "configurator") {
      element.setAttribute("type", "button");
      element.setAttribute("aria-pressed", opts.selected ? "true" : "false");
    }
    return element;
  }

  function fullBleed(parent, options) { return surface(parent, "fullBleed", options); }
  function utilityCard(parent, options) { return surface(parent, "utility", options); }
  function configuratorChip(parent, text, options) {
    const chip = surface(parent, "configurator", options);
    chip.textContent = text || "";
    const opts = options || {};
    if (opts.disabled) chip.disabled = true;
    if (typeof opts.onClick === "function") chip.onclick = opts.onClick;
    return chip;
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
    const state = opts.state || (opts.busy ? "loading" : "rest");
    const line = parent.createEl("div", {
      text: opts.text || "",
      attr: {
        class: classes.join(" "),
        role: "status",
        "data-state": state,
        "aria-live": opts.live || "polite",
        "aria-busy": opts.busy ? "true" : "false"
      }
    });
    return line;
  }

  function InlineError(parent, options) {
    ensureStyles();
    const opts = typeof options === "string" ? { message: options } : (options || {});
    const box = parent.createEl("div", { attr: { class: "prodigy-inline-error", role: "alert", "data-state": "error" } });
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
    fullBleed,
    utilityCard,
    configuratorChip,
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
