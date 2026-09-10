(function (root) {
  "use strict";

  var STYLE_ID = "prodigy-journal-styles";

  function ensureJournalStyles() {
    if (typeof document === "undefined") return;
    var T = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : {});
    var breakpoints = T.RESPONSIVE_BREAKPOINTS || { collapsedNavMax: 833, smallDesktopMax: 1440 };

    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
.journal-previous-review { margin: 16px 0; padding: 16px; background: var(--background-secondary, #f5f5f7); border-radius: 12px; overflow-wrap: anywhere; }
.journal-observations { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 16px; }
.journal-observation-group { min-width: 0; padding: 14px; border: 1px solid var(--background-modifier-border, #ddd); border-radius: 12px; }
.journal-observation-group h3 { margin: 0 0 10px; font-size: 15px; }
.journal-observation-group .journal-meta { font-size: 12px; }
.journal-observation-text { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 10px; font-size: 14px; }
.journal-observation-card { margin-top: 10px; }
.journal-observation-card textarea { border-radius: 8px; padding: 10px; font: inherit; line-height: 1.6; resize: vertical; }
.journal-observation-card button { font-size: 12px; }
.journal-human-direction { margin-top: 24px; }
.journal-narrative, .journal-week-nav { max-width: 760px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
.journal-narrative { color: var(--text-normal); line-height: 1.6; }
.journal-narrative [hidden] { display: none !important; }
.journal-narrative h2 { font-size: 22px; letter-spacing: -.035em; margin: 18px 0 12px; }
.journal-narrative [role="status"] { color: var(--text-muted); font-size: 12px; margin: 8px 0; }
.journal-narrative details { border-top: 1px solid var(--background-modifier-border, #ddd); padding: 12px 0; font-size: 13px; }
.journal-narrative summary { cursor: pointer; color: var(--text-muted); }
.journal-narrative-preview, .journal-narrative-editor { background: var(--background-secondary, #f5f5f7); padding: 22px; border-radius: 18px; margin: 14px 0; }
.journal-narrative-preview h3 { font-size: 12px; font-weight: 500; color: var(--text-muted); margin: 14px 0 4px; }
.journal-narrative-preview h3:first-child { margin-top: 0; }
.journal-narrative-excerpt { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 16px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.journal-narrative-field { display: block; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
.journal-narrative-field textarea { margin-top: 7px; border-radius: 10px; padding: 12px; font: inherit; font-weight: 400; line-height: 1.6; border: 1px solid var(--background-modifier-border, #ddd); box-shadow: none; }
.journal-narrative-question { font-size: 14px; margin: 22px 0 12px; }
.journal-narrative button { margin: 4px 8px 4px 0; border-radius: 8px; box-shadow: none; max-width: 100%; height: auto; min-height: 32px; white-space: normal; }
.journal-narrative .journal-narrative-save { background: var(--interactive-accent, #007aff); color: var(--text-on-accent, white); padding: 8px 18px; }
.journal-week-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--background-modifier-border, #ddd); }
.journal-week-heading { flex: 1 1 230px; text-align: center; font-size: 14px; }
.journal-week-heading small { display: block; font-size: 11px; color: var(--text-muted); }
.journal-week-nav button { border-radius: 8px; box-shadow: none; }
.journal-week-nav input { max-width: 100%; min-width: 0; }
@media (max-width: 480px) { .journal-narrative-preview, .journal-narrative-editor { padding: 16px; } .journal-week-heading { flex-basis: calc(100% - 90px); } }

.prodigy-journal-workspace {
  inline-size: 100%;
  max-inline-size: 1440px;
  min-inline-size: 0;
  margin: 0 auto;
  padding-block-start: 0 !important;
  padding-block-end: 48px;
  font-size: var(--ke-type-body, var(--font-text-size));
  line-height: var(--ke-leading-body, var(--line-height-normal));
  overflow-x: clip;
  overflow-wrap: anywhere;
  word-break: keep-all;
}

/* iPad & Tablet Top Whitespace Reduction */
.markdown-preview-view:has([data-workspace-id="journal"]),
.markdown-rendered:has([data-workspace-id="journal"]) {
  padding-top: 0 !important;
  margin-top: 0 !important;
}

.prodigy-app-shell[data-workspace-id="journal"] {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

.prodigy-app-shell[data-workspace-id="journal"] > .prodigy-workspace-bar {
  min-block-size: 40px !important;
  padding-block: 4px 6px !important;
}

.journal-period-mount {
  margin-top: 0 !important;
  padding-top: 0 !important;
}
.journal-card {
  max-inline-size: 100%;
  min-inline-size: 0;
  margin-block-end: 17px;
  border-radius: var(--ke-radius-panel, 12px);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
}
.journal-card h2 {
  max-inline-size: 100%;
  margin: 0 0 12px;
  font-size: var(--ke-type-heading, 1.2em);
  overflow-wrap: anywhere;
}
.journal-meta {
  max-inline-size: 100%;
  min-inline-size: 0;
  color: var(--ke-color-text-muted, var(--text-muted));
  margin-block-end: 8px;
  overflow-wrap: anywhere;
}
.journal-preview {
  max-inline-size: 100%;
  min-inline-size: 0;
  color: var(--ke-color-text, var(--text-normal));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.journal-primary-actions, .journal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-inline-size: 100%;
  min-inline-size: 0;
}
.journal-primary-actions {
  margin: 12px 0;
}

/* GPU Accelerated Interactive Physics */
.prodigy-journal-workspace button.prodigy-btn,
.journal-period-navigation button,
.journal-period-history-row button {
  min-inline-size: var(--ke-touch-target, 44px);
  min-block-size: var(--ke-touch-target, 44px);
  block-size: auto;
  max-inline-size: 100%;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
  box-shadow: none;
  border-radius: var(--ke-radius-control, 8px);
  will-change: transform;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, border-color 0.15s ease;
}
.prodigy-journal-workspace button.prodigy-btn:active,
.journal-period-navigation button:active,
.journal-period-history-row button:active {
  transform: scale(0.95);
}

.journal-pending-delete {
  max-inline-size: 100%;
  overflow-wrap: anywhere;
}
.journal-pending-delete .prodigy-btn {
  margin-inline-start: 12px;
}
.journal-row {
  max-inline-size: 100%;
  min-inline-size: 0;
  padding: 12px 0;
  border-top: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  overflow-wrap: anywhere;
  will-change: transform;
  transition: background-color 0.15s ease;
}
.journal-row:first-child {
  border-top: 0;
}
.journal-status {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--ke-touch-target, 44px);
  color: var(--ke-color-text-muted, var(--text-muted));
  font-weight: 600;
}
.journal-status[data-state="complete"] {
  color: var(--ke-color-success, var(--text-success, var(--text-normal)));
}
.journal-status[data-state="partial"] {
  color: var(--ke-color-warning, var(--text-warning, var(--text-normal)));
}
.journal-block {
  max-inline-size: 100%;
  min-inline-size: 0;
  padding: 12px 0;
  margin: 8px 0;
  border-top: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.journal-block-head {
  display: flex;
  align-items: center;
  gap: 12px;
  max-inline-size: 100%;
  min-inline-size: 0;
}
.journal-block-delete {
  margin-inline-start: auto;
}
.journal-block .bid {
  min-inline-size: 0;
  color: var(--ke-color-text-muted, var(--text-muted));
  overflow-wrap: anywhere;
}

/* Glassmorphism Date Navigation Toolbar */
.journal-date-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  max-inline-size: 100%;
  min-inline-size: 0;
  margin-block-end: 10px;
  padding: 6px 12px;
  flex-wrap: wrap;
  background: var(--ke-color-surface, var(--background-primary));
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 12px);
}
.journal-date-nav input[type=date] {
  flex: 1 1 9rem;
  min-inline-size: var(--ke-touch-target, 44px);
  min-block-size: var(--ke-touch-target, 44px);
  block-size: auto;
  max-inline-size: 100%;
  color: var(--ke-color-text, var(--text-normal));
  font: inherit;
  box-shadow: none;
  border-radius: var(--ke-radius-control, 8px);
}
.journal-card :focus-visible, .journal-date-nav :focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.journal-status-ml-8 { margin-left: 8px; }
.journal-status-ml-4 { margin-left: 4px; }
.journal-text-muted-mt-2 {
  color: var(--ke-color-text-muted, var(--text-muted));
  margin-top: 2px;
}
.journal-font-weight-600 { font-weight: 600; }
.journal-display-block-mb-4 {
  display: block;
  margin-bottom: 4px;
}
.journal-flex-between-center {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

/* Period View Glassmorphic Tabs */
.journal-period-tabs {
  max-inline-size: 100%;
  min-inline-size: 0;
  margin-block-end: 10px;
  border-bottom: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  overflow-x: clip;
}
.journal-period-tabs[data-layout=compact] {
  position: sticky;
  inset-block-start: 0;
  z-index: 19;
  background: var(--ke-color-surface, var(--background-primary));
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}
.journal-period-tabs .prodigy-adaptive-tabs {
  display: flex;
  inline-size: 100%;
  max-inline-size: 100%;
  min-inline-size: 0;
  flex-wrap: wrap;
  overflow: visible;
  scroll-snap-type: none;
  padding-block: 8px;
}
.journal-period-tabs .prodigy-adaptive-tab {
  flex: 1 1 8rem;
  min-inline-size: var(--ke-touch-target, 44px);
  min-block-size: var(--ke-touch-target, 44px);
  block-size: auto;
  max-inline-size: 100%;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
  box-shadow: none;
  scroll-snap-align: none;
  will-change: transform;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.journal-period-tabs .prodigy-adaptive-tab:active {
  transform: scale(0.95);
}
.journal-period-content, .journal-period-panel {
  max-inline-size: 100%;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.journal-period-review {
  display: grid;
  gap: 17px;
  max-inline-size: 100%;
  min-inline-size: 0;
}
.journal-period-navigation {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-inline-size: 100%;
  min-inline-size: 0;
}
.journal-period-navigation button, .journal-period-navigation input {
  min-inline-size: var(--ke-touch-target, 44px);
  min-block-size: var(--ke-touch-target, 44px);
  block-size: auto;
  box-sizing: border-box;
  box-shadow: none;
}
.journal-period-navigation input {
  flex: 1 1 9rem;
  max-inline-size: 100%;
  color: var(--ke-color-text, var(--text-normal));
  font: inherit;
}
.journal-period-label {
  font-weight: 700;
  min-inline-size: 8rem;
}
.journal-period-status, .journal-period-record-meta, .journal-period-empty {
  margin: 0;
  color: var(--ke-color-text-muted, var(--text-muted));
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.journal-period-record, .journal-period-history {
  display: grid;
  gap: 12px;
  max-inline-size: 100%;
  min-inline-size: 0;
}
.journal-period-record h2, .journal-period-history h2 {
  margin: 0;
}
.journal-period-record-content {
  margin: 0;
  max-inline-size: 100%;
  min-inline-size: 0;
  overflow: visible;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font: inherit;
  color: var(--ke-color-text, var(--text-normal));
  border-radius: var(--ke-radius-panel, 10px);
  padding: 12px;
  background: var(--ke-color-surface-secondary, var(--background-secondary));
}
.journal-period-history-list {
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  list-style: none;
  padding: 0;
  margin: 0;
}
.journal-period-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 8px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  min-inline-size: 0;
  will-change: transform;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.journal-period-history-row:hover {
  box-shadow:none;
}
.journal-period-history-row button {
  min-inline-size: var(--ke-touch-target, 44px);
  min-block-size: var(--ke-touch-target, 44px);
  block-size: auto;
  max-inline-size: 100%;
  word-break: keep-all;
  overflow-wrap: anywhere;
  text-align: start;
  box-shadow: none;
}
.journal-period-history-current {
  color: var(--ke-color-interactive, var(--text-accent));
  white-space: nowrap;
  font-weight: 700;
}
.journal-period-review button:focus-visible, .journal-period-review input:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}

@media(max-width: 833px) {
  .journal-primary-actions .prodigy-btn, .journal-actions .prodigy-btn {
    flex: 1 1 calc(50% - 8px);
  }
  .journal-block-head, .journal-row {
    flex-wrap: wrap;
  }
  .journal-period-navigation {
    align-items: stretch;
  }
  .journal-period-navigation button, .journal-period-navigation input {
    flex: 1 1 8rem;
  }
  .journal-period-label {
    flex: 1 1 100%;
    min-block-size: var(--ke-touch-target, 44px);
    display: flex;
    align-items: center;
  }
  .journal-period-history-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .journal-period-history-current {
    margin-inline-start: auto;
  }
}
@media(max-width: 480px) {
  .prodigy-app-shell[data-workspace-id="journal"] > .prodigy-workspace-bar {
    padding-inline: 4px;
  }
  .prodigy-app-shell[data-workspace-id="journal"] .journal-card:not(.prodigy-full-bleed) {
    padding-inline: 2px;
  }
}
@media(max-width: 419px) {
  .journal-card.prodigy-full-bleed {
    padding-inline: 0;
  }
  .journal-primary-actions .prodigy-btn, .journal-actions .prodigy-btn {
    flex-basis: 100%;
  }
  .journal-pending-delete .prodigy-btn {
    margin-inline-start: 0;
  }
}
@media(forced-colors: active) {
  .journal-status[data-state] {
    border: 1px solid CanvasText;
  }
  .journal-card :focus-visible, .journal-date-nav :focus-visible,
  .journal-period-review button:focus-visible, .journal-period-review input:focus-visible, .journal-period-tabs .prodigy-adaptive-tab:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
  .journal-period-tabs .prodigy-adaptive-tab[aria-selected=true], .journal-period-history-current {
    border: 1px solid Highlight;
  }
}
@media(prefers-reduced-motion: reduce) {
  .prodigy-journal-workspace *, .journal-period-review *, .journal-period-history-row, .prodigy-journal-workspace button.prodigy-btn {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
    transform: none !important;
    will-change: auto !important;
  }
}
`;
  }

  root.JournalStyles = { ensureJournalStyles, STYLE_ID };
})(typeof window !== "undefined" ? window : globalThis);
