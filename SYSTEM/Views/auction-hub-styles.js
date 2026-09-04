/**
 * Prodigy OS Auction Hub shared presentation.
 *
 * Owns every presentation class the Auction Hub note composes (TodaySummary,
 * stat grid, configurator/continue, canonical card list wrapper, calendar
 * wrapper, pipeline/review/history disclosures) plus the hub-wide shell/
 * button/focus/reduced-motion/compact rules. The note keeps orchestration and
 * Dataview queries only; presentation lives here so the markdown file stays
 * thin and the rules stay token-driven.
 *
 * Must load after design-tokens.js (for window.ProdigyTokens) and before the
 * Auction Hub note renders its first section.
 */
(function (root) {
  "use strict";

  const T = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : {});
  const STYLE_ID = "prodigy-auction-hub-styles";

  const compactMax = T.RESPONSIVE_BREAKPOINTS && T.RESPONSIVE_BREAKPOINTS.compactMax;
  if (!Number.isFinite(compactMax)) throw new Error("경매 프레젠테이션 반응형 토큰을 불러오지 못했습니다.");

  // Colors, decoration and breakpoints stay inside token/semantic variables only.
const CSS = `
.auction-native-app {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 100%;
  background: var(--ke-color-surface, var(--background-primary));
}
.auction-native-source-list {
  min-inline-size: 0;
  padding: var(--ke-space-3, 12px) var(--ke-space-2, 8px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  border-inline-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-native-source-label {
  padding: var(--ke-space-2, 8px) var(--ke-space-3, 12px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, 13px);
  font-weight: 600;
}
.auction-native-source-group {
  padding-inline: var(--ke-space-3, 12px);
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-body, 15px);
  font-weight: 600;
}
.auction-native-source-row {
  min-block-size: var(--ke-touch-target, 44px);
  padding-inline: var(--ke-space-3, 12px);
  border: 0 !important;
  border-radius: var(--ke-radius-control, 8px);
  background: transparent !important;
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-body, 15px);
  font-weight: 500;
  text-align: start;
  appearance: none;
}
.auction-native-source-row:hover {
  background: var(--ke-color-hover, var(--background-modifier-hover)) !important;
}
.auction-native-source-row[aria-selected="true"] {
  background: color-mix(in srgb, var(--ke-color-interactive) 12%, var(--ke-color-surface-secondary)) !important;
  font-weight: 600;
}
.auction-native-source-row[aria-selected="true"]:hover {
  background: color-mix(in srgb, var(--ke-color-interactive) 12%, var(--ke-color-surface-secondary)) !important;
}
.auction-native-source-row:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--interactive-accent));
  outline-offset: 2px;
}
.auction-native-scene {
  min-inline-size: 0;
  min-block-size: 0;
}
.auction-native-scene[hidden] {
  display: none;
}
.auction-native-home {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}
.auction-native-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
}
.auction-native-detail-pane,
.auction-native-calendar-pane,
.auction-native-work-pane {
  min-inline-size: 0;
  padding: var(--ke-space-5, 24px);
}
.auction-native-work-pane .auction-card {
  inline-size: 100%;
  max-inline-size: none;
}
.auction-native-detail-pane {
  display: flex;
  flex-direction: column;
  background: var(--ke-color-surface, var(--background-primary));
  border-inline-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-native-calendar-pane {
  background: var(--ke-color-surface, var(--background-primary));
}
.auction-native-work-pane {
  background: var(--ke-color-surface, var(--background-primary));
  border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  padding-block-start: var(--ke-space-4, 17px);
}
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-pane {
  border-inline-end: 0;
  border-block-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-native-work-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}
.auction-native-work-group {
  min-inline-size: 0;
  padding-block: var(--ke-space-5, 24px);
  border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-native-work-group:first-child {
  padding-block-start: 0;
  border-block-start: 0;
}
.auction-native-work-group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ke-space-3, 12px);
  margin: 0;
  cursor: pointer;
  list-style: none;
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-body, 15px);
  line-height: var(--ke-leading-body, 1.35);
  font-weight: 600;
}
.auction-native-work-group-title::-webkit-details-marker {
  display: none;
}
.auction-native-work-group-title::after {
  content: "▾";
  color: var(--ke-color-text-muted, var(--text-muted));
  font-size: var(--ke-type-caption, 12px);
}
.auction-native-work-group:not([open]) > .auction-native-work-group-title::after {
  content: "▸";
}
.auction-native-work-group[open] > .auction-native-work-group-title {
  margin-block-end: var(--ke-space-4, 17px);
}
.auction-native-work-group-body {
  display: grid;
  gap: var(--ke-space-4, 17px);
  min-inline-size: 0;
}
.auction-native-detail-pane .auction-hub-section.auction-hub-today {
  grid-column: 1;
  grid-row: 1;
  grid-template-columns: minmax(0, 1fr);
  border: 0 !important;
  border-radius: var(--ke-radius-none, 0);
  background: transparent !important;
}
.auction-native-detail-pane .auction-native-sidebar {
  inline-size: 100%;
  max-inline-size: none;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ke-space-4, 17px);
  padding: var(--ke-space-3, 12px);
}
.prodigy-app-shell[data-tier="medium"] .auction-native-sidebar {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.auction-native-detail-pane .auction-hub-stat-grid {
  display: block !important;
}
.auction-native-detail-pane .auction-native-sidebar-title {
  display: none;
}
.auction-native-detail-pane .auction-hub-stat-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--ke-space-1, 4px);
}
.auction-native-detail-pane .auction-hub-stat-panel + .auction-hub-stat-panel {
  padding-block-start: var(--ke-space-3, 12px);
  padding-inline-start: 0;
  border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  border-inline-start: 0;
}
.auction-native-detail-pane .auction-hub-stat-row.is-primary {
  padding-block: 0;
}
.auction-native-detail-pane .auction-hub-stat-row.is-primary .auction-hub-stat-label {
  font-size: var(--ke-type-body, 15px);
}
.auction-native-detail-pane .auction-hub-stat-row:not(.is-primary) {
  font-size: var(--ke-type-label, 13px);
}
.auction-native-detail-pane .auction-hub-stat-row.is-primary .auction-hub-stat-value {
  font-size: var(--ke-type-heading, 20px);
}
.auction-native-detail-pane .auction-hub-stat-row,
.auction-native-detail-pane .auction-hub-stat-panel-title {
  overflow-wrap: normal;
  word-break: keep-all;
}
.auction-native-detail-pane .auction-hub-continue {
  padding: var(--ke-space-3, 12px) var(--ke-space-5, 24px);
  border-inline-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-native-pane-title {
  margin: 0 0 var(--ke-space-4, 17px);
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-heading, 20px);
  line-height: var(--ke-leading-body, 1.35);
  letter-spacing: 0;
}
.auction-native-list-body,
.auction-native-detail-body,
.auction-native-calendar-body {
  display: grid;
  gap: var(--ke-space-5, 17px);
  min-inline-size: 0;
}
.prodigy-app-shell[data-tier="medium"] .auction-native-app {
  grid-template-columns: minmax(0, 1fr);
}
.prodigy-app-shell[data-tier="medium"] .auction-native-home {
  grid-template-columns: 1fr;
}
.prodigy-app-shell[data-tier="medium"] .auction-native-overview {
  grid-template-columns: minmax(0, 1fr);
}
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-pane,
.prodigy-app-shell[data-tier="medium"] .auction-native-work-body,
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-body {
  max-inline-size: 100%;
}
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-body {
  gap: 0;
}
.prodigy-app-shell[data-tier="compact"] .auction-native-app {
  grid-template-columns: 1fr;
}
.prodigy-app-shell[data-tier="compact"] .auction-native-source-list {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
  padding: var(--ke-space-2, 8px);
  border-inline-end: 0;
  border-block-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.prodigy-app-shell[data-tier="compact"] .auction-native-source-label {
  display: none;
}
.prodigy-app-shell[data-tier="compact"] .auction-native-source-group {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.prodigy-app-shell[data-tier="compact"] .auction-native-home {
  grid-template-columns: 1fr;
}
.prodigy-app-shell[data-tier="compact"] .auction-native-overview {
  grid-template-columns: minmax(0, 1fr);
}
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-pane .auction-hub-section.auction-hub-today {
  grid-template-columns: minmax(0, 1fr);
}
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-pane,
.prodigy-app-shell[data-tier="compact"] .auction-native-calendar-pane,
.prodigy-app-shell[data-tier="compact"] .auction-native-work-pane {
  padding: var(--ke-space-4, 16px);
  border-inline-end: 0;
}
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-pane,
.prodigy-app-shell[data-tier="compact"] .auction-native-calendar-pane {
  border-block-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.prodigy-app-shell[data-tier="compact"] .auction-native-list-body,
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-body,
.prodigy-app-shell[data-tier="compact"] .auction-native-calendar-body {
  max-inline-size: 100%;
  overflow: hidden;
}
.auction-native-detail-body {
  flex: 1 1 auto;
  grid-template-columns: minmax(250px, 0.78fr) minmax(0, 1.22fr);
  grid-template-rows: auto auto;
  align-items: stretch;
}
.auction-native-detail-body > .auction-native-memo {
  grid-column: 2;
  grid-row: 1;
  min-block-size: 100%;
}
.auction-native-detail-body > .auction-hub-pipeline-section {
  grid-column: 1 / -1;
  grid-row: 2;
}
.auction-native-memo {
  position: relative;
  display: flex;
  flex-direction: column;
  min-block-size: 156px;
  padding: var(--ke-space-4, 16px);
  overflow: hidden;
  border: var(--ke-border-width, 1px) solid color-mix(
    in srgb,
    var(--ke-color-border, var(--background-modifier-border)) 72%,
    var(--ke-color-surface, var(--background-primary))
  );
  border-radius: var(--ke-radius-panel, 18px);
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--ke-color-surface, var(--background-primary)) 92%, var(--ke-color-interactive, var(--interactive-accent))),
      var(--ke-color-surface-secondary, var(--background-secondary))
    );
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--ke-color-text, var(--text-normal)) 7%, transparent),
    0 8px 24px color-mix(in srgb, var(--ke-color-text, var(--text-normal)) 4%, transparent);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}
.auction-native-memo::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--ke-color-surface, var(--background-primary)) 40%, transparent),
    transparent 42%
  );
  content: "";
}
.auction-native-memo:focus-within {
  border-color: color-mix(
    in srgb,
    var(--ke-color-interactive, var(--interactive-accent)) 48%,
    var(--ke-color-border, var(--background-modifier-border))
  );
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--ke-color-text, var(--text-normal)) 7%, transparent),
    0 10px 28px color-mix(in srgb, var(--ke-color-interactive, var(--interactive-accent)) 10%, transparent);
  transform: translateY(-1px);
}
.auction-native-memo-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ke-space-3, 12px);
  margin-block-end: var(--ke-space-3, 12px);
}
.auction-native-memo-title-group {
  display: flex;
  align-items: center;
  min-inline-size: 0;
  gap: var(--ke-space-2, 8px);
}
.auction-native-memo-icon {
  position: relative;
  flex: 0 0 auto;
  inline-size: 28px;
  block-size: 28px;
  border-radius: var(--ke-radius-control, 8px);
  background: color-mix(
    in srgb,
    var(--ke-color-interactive, var(--interactive-accent)) 13%,
    var(--ke-color-surface, var(--background-primary))
  );
}
.auction-native-memo-icon::before {
  position: absolute;
  inset: 8px 7px;
  border-block: 1.5px solid var(--ke-color-interactive, var(--interactive-accent));
  background: linear-gradient(
    to bottom,
    transparent 45%,
    var(--ke-color-interactive, var(--interactive-accent)) 45% 55%,
    transparent 55%
  );
  content: "";
}
.auction-native-memo-title {
  overflow: hidden;
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-label, 13px);
  font-weight: 650;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.auction-native-memo-status {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  padding: var(--ke-space-1, 4px) var(--ke-space-2, 8px);
  border-radius: var(--ke-radius-pill, 999px);
  background: color-mix(
    in srgb,
    var(--ke-color-surface, var(--background-primary)) 72%,
    transparent
  );
  color: var(--ke-color-text-muted, var(--text-muted));
  font-size: var(--ke-type-chrome, 11px);
  line-height: 1.2;
}
.auction-native-memo-status[data-tone="error"] {
  background: color-mix(in srgb, var(--ke-color-error, var(--text-error)) 10%, transparent);
  color: var(--ke-color-error, var(--text-error));
}
.auction-native-memo-input {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  inline-size: 100%;
  min-block-size: 96px;
  margin: 0;
  padding: 0;
  resize: none;
  border: 0 !important;
  border-radius: 0;
  outline: 0;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--ke-color-text, var(--text-normal));
  font-family: var(--font-text);
  font-size: var(--ke-type-body, 15px);
  line-height: 1.55;
}
.auction-native-memo-input::placeholder {
  color: var(--ke-color-text-muted, var(--text-muted));
  opacity: 0.72;
}
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-body,
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-body {
  gap: var(--ke-space-4, 16px);
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto;
}
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-body > .auction-hub-section.auction-hub-today,
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-body > .auction-native-memo,
.prodigy-app-shell[data-tier="medium"] .auction-native-detail-body > .auction-hub-pipeline-section,
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-body > .auction-hub-section.auction-hub-today,
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-body > .auction-native-memo,
.prodigy-app-shell[data-tier="compact"] .auction-native-detail-body > .auction-hub-pipeline-section {
  grid-column: 1;
  grid-row: auto;
}
.prodigy-app-shell[data-tier="compact"] .auction-native-memo {
  min-block-size: 148px;
}
@media (prefers-reduced-motion: reduce) {
  .auction-native-memo {
    transition: none;
  }
  .auction-native-memo:focus-within {
    transform: none;
  }
}
.auction-native-calendar-pane .prodigy-bid-calendar {
  margin: 0;
}
.auction-hub-pipeline-heading {
  margin-block: var(--ke-space-4, 17px) var(--ke-space-2, 8px);
  color: var(--ke-color-text-muted, var(--text-muted));
  font-size: var(--ke-type-caption, 12px);
  font-weight: 600;
}
.auction-hub-pipeline.auction-hub-pipeline-compact {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: stretch;
  justify-content: stretch;
  gap: var(--ke-space-2, 8px);
}
.auction-hub-pipeline-compact .auction-hub-pipeline-step {
  min-block-size: 0;
  min-inline-size: 0;
  padding: var(--ke-space-2, 8px);
}
.auction-hub-pipeline-compact .auction-hub-pipeline-arrow {
  display: none;
}
.auction-hub-pipeline-compact .auction-hub-pipeline-group {
  display: contents;
}
.prodigy-app-shell[data-tier="compact"] .auction-filter-selects {
  grid-template-columns: 1fr !important;
}
.prodigy-app-shell[data-tier="compact"] .auction-filter-bar {
  grid-template-columns: 1fr !important;
}
.prodigy-app-shell[data-tier="compact"] .auction-filter-bar > .auction-filter-select {
  grid-template-columns: minmax(0, 1fr) !important;
}
.prodigy-app-shell[data-tier="compact"] .auction-filter-bar > .auction-filter-select > span {
  inline-size: auto;
}
.prodigy-app-shell[data-tier="compact"] .auction-card {
  max-inline-size: 100%;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-title-row {
  align-items: flex-start;
  gap: var(--ke-space-1, 2px);
}
.prodigy-app-shell[data-tier="compact"] .auction-card-title-wrap {
  flex: 1 1 auto;
  max-inline-size: none;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-title-link {
  font-size: var(--ke-type-label, 12px);
}
.prodigy-app-shell[data-tier="compact"] .auction-card-badges {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: var(--ke-space-1, 2px);
}
.prodigy-app-shell[data-tier="compact"] .auction-card-dday,
.prodigy-app-shell[data-tier="compact"] .auction-card-external-link {
  min-block-size: 28px;
  padding-inline: var(--ke-space-1, 2px);
  font-size: var(--ke-type-chrome, 10px);
  white-space: nowrap;
}
.auction-card .auction-card-delete {
  min-inline-size: var(--ke-touch-target, 44px) !important;
  inline-size: var(--ke-touch-target, 44px) !important;
  min-block-size: var(--ke-touch-target, 44px) !important;
  block-size: var(--ke-touch-target, 44px) !important;
  padding: 0 !important;
  font-size: 0 !important;
}
.auction-card .auction-card-delete::before {
  content: "×";
  font-size: var(--ke-type-label, 12px);
}
.prodigy-app-shell[data-tier="compact"] .auction-card-title-row,
.prodigy-app-shell[data-tier="compact"] .auction-card-title-wrap {
  display: flex;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-badges {
  inline-size: auto;
  justify-content: flex-end;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-title-link,
.prodigy-app-shell[data-tier="compact"] .auction-card-result-price,
.prodigy-app-shell[data-tier="compact"] .auction-card-next-action-label {
  overflow-wrap: anywhere;
  word-break: keep-all;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-finance-row:has(.auction-card-finance-group-income) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: var(--ke-space-3, 8px) !important;
  inline-size: 100% !important;
  white-space: nowrap !important;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-finance-row:has(.auction-card-finance-group-income) .auction-card-finance-group {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  flex-wrap: nowrap !important;
  min-inline-size: 0;
  max-inline-size: 100%;
}
.auction-native-filter-body .auction-filter-bar {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  align-items: stretch !important;
  justify-content: stretch !important;
  gap: var(--ke-space-3, 12px) !important;
  margin-block-end: var(--ke-space-4, 17px) !important;
}
.prodigy-app-shell:is([data-tier="medium"],[data-tier="wide"]) .auction-native-filter-body .auction-filter-bar {
  grid-template-columns: minmax(14rem, 1.4fr) repeat(3, minmax(0, 1fr)) !important;
}
.prodigy-app-shell:is([data-tier="medium"],[data-tier="wide"]) .auction-native-filter-body {
  position: sticky;
  inset-block-start: 0;
  z-index: 8;
  background: var(--ke-color-surface, var(--background-primary));
  border-block-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.prodigy-app-shell:is([data-tier="medium"],[data-tier="wide"]) .auction-native-filter-body .auction-filter-bar {
  position: static;
  padding-block: var(--ke-space-2, 8px);
}
.prodigy-app-shell[data-tier="compact"] .auction-native-filter-body {
  position: static;
}
.auction-native-filter-body .auction-filter-search {
  grid-column: 1 / -1;
  inline-size: 100% !important;
  margin: 0 !important;
}
.prodigy-app-shell:is([data-tier="medium"],[data-tier="wide"]) .auction-native-filter-body .auction-filter-search {
  grid-column: 1;
}
.auction-native-filter-body .auction-filter-selects {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch !important;
  gap: var(--ke-space-2, 8px) !important;
}
.auction-native-filter-body .auction-filter-bar > .auction-filter-select {
  inline-size: 100% !important;
}
.auction-native-filter-body .auction-filter-bar > .auction-filter-separator {
  display: none;
}
.auction-native-filter-body .auction-filter-selects > span {
  display: none;
}
.auction-native-filter-body .auction-filter-select {
  display: grid !important;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center !important;
  gap: var(--ke-space-1, 4px) !important;
  min-inline-size: 0;
}
.auction-native-filter-body .auction-filter-select select {
  inline-size: 100%;
  min-inline-size: 0;
}
.auction-native-filter-body .auction-filter-summary {
  grid-column: 1 / 3;
  align-self: center;
  min-inline-size: 0;
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, 13px);
  overflow-wrap: anywhere;
  word-break: keep-all;
}
.auction-native-filter-body .auction-filter-reset {
  grid-column: 3;
  justify-self: end;
}
.prodigy-app-shell:is([data-tier="medium"],[data-tier="wide"]) .auction-native-filter-body .auction-filter-summary {
  grid-column: 1 / 4;
}
.prodigy-app-shell:is([data-tier="medium"],[data-tier="wide"]) .auction-native-filter-body .auction-filter-reset {
  grid-column: 4;
}
.prodigy-app-shell[data-tier="compact"] .auction-native-filter-body .auction-filter-summary,
.prodigy-app-shell[data-tier="compact"] .auction-native-filter-body .auction-filter-reset {
  grid-column: 1;
}
.prodigy-app-shell[data-workspace-id="auction"]:has(.auction-native-app) .prodigy-workspace-switcher {
  display: none;
}
.markdown-preview-view.prodigy-hub-note:has(.auction-native-app)
  > .markdown-preview-sizer
  > :not(.markdown-preview-pusher):not(.el-pre:has(.auction-native-app)) {
  display: none !important;
}
.auction-native-support {
  margin-block-start: var(--ke-space-6, 24px);
  border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-native-support-summary {
  min-block-size: var(--ke-touch-target, 44px);
  padding-block: var(--ke-space-3, 12px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, 13px);
}
.markdown-preview-view.prodigy-hub-note .el-h1:has(+ .el-pre .auction-hub-section),
.markdown-preview-view.prodigy-hub-note .el-h2:has(+ .el-pre .auction-hub-section) {
  display: none;
}
.markdown-preview-view.prodigy-hub-note .block-language-dataviewjs.auction-hub-section.auction-hub-today {
  padding: 0;
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 18px);
  background: var(--ke-color-surface, var(--background-primary)) !important;
  color: var(--ke-color-text, var(--text-normal));
  overflow: hidden;
}
.block-language-dataviewjs.auction-hub-section.auction-hub-today {
  background-color: var(--background-primary) !important;
}
.markdown-preview-view.prodigy-hub-note .el-h1:has(+ .el-pre .auction-hub-today) {
  display: none;
}
.auction-native-sidebar {
  display: grid;
  align-content: start;
  gap: var(--ke-space-3, 12px);
  padding: var(--ke-space-3, 12px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  border-inline-end: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-native-sidebar-title {
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, 14px);
  font-weight: 600;
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="medium"]) .auction-hub-section.auction-hub-today {
  display: block;
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="wide"]) .auction-hub-section.auction-hub-today {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  grid-template-areas: "stats continue";
  align-items: stretch;
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="medium"]) .auction-hub-stat-grid {
  grid-area: stats;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ke-space-6, 24px);
  margin: 0;
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="medium"]) .auction-hub-stat-panel + .auction-hub-stat-panel {
  padding-block-start: 0;
  padding-inline-start: var(--ke-space-6, 24px);
  border-block-start: 0;
  border-inline-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="wide"]) .auction-hub-stat-grid {
  grid-area: stats;
  display: contents;
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="medium"]) .auction-hub-continue,
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="wide"]) .auction-hub-continue {
  grid-area: continue;
  align-self: stretch;
  margin: 0;
  padding: var(--ke-space-6, 32px);
  border: 0;
  border-radius: 0;
  background: var(--ke-color-surface, var(--background-primary));
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="medium"]) .auction-hub-continue-title,
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="wide"]) .auction-hub-continue-title {
  max-inline-size: 32rem;
  font-size: var(--ke-type-heading, 21px);
  line-height: var(--ke-leading-body, 1.45);
}
@media (min-width: 1069px) {
  .markdown-preview-view.prodigy-hub-note .auction-hub-section.auction-hub-today {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    grid-template-areas: "stats continue";
    align-items: stretch;
  }
  .markdown-preview-view.prodigy-hub-note .auction-hub-stat-grid {
    grid-area: stats;
    display: contents;
  }
  .markdown-preview-view.prodigy-hub-note .auction-hub-continue {
    grid-area: continue;
    align-self: stretch;
    margin: 0;
    padding: var(--ke-space-6, 32px);
    border: 0;
    border-radius: 0;
    background: var(--ke-color-surface, var(--background-primary));
  }
  .markdown-preview-view.prodigy-hub-note .auction-hub-continue-title {
    max-inline-size: 32rem;
    font-size: var(--ke-type-heading, 21px);
    line-height: var(--ke-leading-body, 1.45);
  }
  .markdown-preview-view.prodigy-hub-note .auction-native-detail-pane .auction-hub-section.auction-hub-today {
    grid-template-columns: minmax(min(400px, 100%), 2fr) minmax(min(420px, 100%), 3fr);
  }
}
.auction-hub-shell,
.auction-hub-section {
  min-inline-size: 0;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.auction-hub-shell *:not(.prodigy-context-action),
.auction-hub-section *:not(.prodigy-context-action) {
  box-sizing: border-box;
  min-inline-size: 0;
}
.auction-hub-shell [data-scroll-owner="auction-workspace-body"] {
  scroll-padding-block-end: var(--prodigy-mobile-toolbar-clearance, 0px);
}
.auction-hub-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ke-space-3, 8px);
  min-inline-size: 0;
  margin-block: var(--ke-space-2, 4px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-body, .84rem);
  line-height: var(--ke-leading-body, 1.45);
  overflow-wrap: anywhere;
}
.auction-hub-status > * {
  min-inline-size: 0;
  max-inline-size: 100%;
  overflow-wrap: anywhere;
}
.auction-hub-stat-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ke-space-4, 12px);
  margin-block-end: var(--ke-space-3, 8px);
  min-inline-size: 0;
}
.auction-hub-stat-panel,
.auction-hub-continue,
.auction-hub-review-queue,
.auction-hub-pipeline {
  min-inline-size: 0;
  padding: var(--ke-space-4, 12px);
  border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 8px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  overflow-wrap: anywhere;
}
.auction-hub-stat-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ke-space-2, 4px);
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ke-color-text, var(--text-normal));
}
.auction-hub-stat-panel + .auction-hub-stat-panel {
  padding-block-start: var(--ke-space-4, 17px);
  border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-hub-stat-heading {
  padding-block-end: var(--ke-space-2, 4px);
  border-block-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-label, .72rem);
  font-weight: 600;
  line-height: var(--ke-leading-body, 1.45);
}
.auction-hub-stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ke-space-3, 8px);
  min-inline-size: 0;
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-body, .84rem);
  line-height: var(--ke-leading-body, 1.45);
  word-break: keep-all;
}
.auction-hub-stat-row.is-primary {
  align-items: flex-end;
  padding-block: var(--ke-space-3, 12px);
}
.auction-hub-stat-row.is-primary .auction-hub-stat-label {
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-heading, 1.31rem);
  line-height: var(--ke-leading-body, 1.45);
}
.auction-hub-stat-row.is-primary .auction-hub-stat-value {
  padding: 0;
  background: transparent;
  font-family: var(--ke-font-display, system-ui, -apple-system, sans-serif);
  font-size: clamp(var(--ke-type-heading, 1.31rem), 5vw, var(--ke-type-display, 3.5rem));
  line-height: var(--ke-leading-display, 1.07);
  letter-spacing: 0;
}
.auction-hub-stat-row > * {
  min-inline-size: 0;
  overflow-wrap: normal;
  word-break: keep-all;
}
.auction-hub-stat-label {
  font-weight: 600;
}
.auction-hub-stat-value {
  flex: 0 0 auto;
  padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
  border-radius: var(--ke-radius-control, 4px);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.auction-hub-stat-value.is-highlight { background: var(--ke-color-hover, var(--background-modifier-hover)); }
.auction-hub-stat-value[class*="tone-"] { color: var(--ke-color-text, var(--text-normal)) !important; }
.auction-hub-continue {
  margin-block: var(--ke-space-3, 8px);
  background: var(--ke-color-on-dark, var(--background-primary));
  color: var(--ke-color-text, var(--text-normal));
}
.auction-hub-continue-heading {
  margin-block-end: var(--ke-space-2, 4px);
  color: var(--ke-color-accent, var(--text-accent));
  font-size: var(--ke-type-label, .72rem);
  font-weight: 600;
  line-height: var(--ke-leading-body, 1.45);
}
.auction-hub-continue-title {
  display: block;
  min-inline-size: 0;
  font-size: var(--ke-type-heading, .92rem);
  font-weight: 700;
  line-height: var(--ke-leading-body, 1.45);
  overflow-wrap: anywhere;
}
.auction-hub-continue-action {
  margin-block-start: var(--ke-space-1, 2px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-body, .84rem);
}
.auction-hub-continue-reason {
  margin-block-start: var(--ke-space-2, 4px);
  color: var(--text-faint, var(--ke-color-muted, var(--text-muted)));
  font-size: var(--ke-type-label, .72rem);
}
.auction-hub-next-action {
  margin-block-start: var(--ke-space-2, 4px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-body, .84rem);
  line-height: var(--ke-leading-body, 1.45);
  overflow-wrap: anywhere;
}
.auction-hub-pipeline {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--ke-space-3, 8px);
  overflow-wrap: anywhere;
}
.prodigy-app-shell[data-tier="medium"] .auction-hub-pipeline-section {
  margin-block-start: 0;
}
.prodigy-app-shell[data-tier="medium"] .auction-hub-pipeline-heading {
  margin-block: var(--ke-space-3, 12px) var(--ke-space-2, 8px);
}
.prodigy-app-shell[data-tier="medium"] .auction-hub-pipeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: stretch;
  gap: var(--ke-border-width, 1px);
  padding: var(--ke-border-width, 1px);
  border: 0;
  border-radius: var(--ke-radius-panel, 12px);
  background: var(--ke-color-border, var(--background-modifier-border));
  overflow: hidden;
}
.prodigy-app-shell[data-tier="medium"] .auction-hub-pipeline-arrow {
  display: none;
}
.prodigy-app-shell[data-tier="medium"] .auction-hub-pipeline-group {
  display: contents;
}
.prodigy-app-shell[data-tier="medium"] .auction-hub-pipeline-step {
  min-block-size: 72px;
  justify-content: center;
  padding: var(--ke-space-3, 12px);
  border: 0;
  border-radius: 0;
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  text-align: center;
}
.auction-hub-pipeline-step {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  align-items: center;
  gap: var(--ke-space-1, 2px);
  min-inline-size: 4.5rem;
  max-inline-size: 100%;
  padding: var(--ke-space-2, 4px) var(--ke-space-3, 8px);
  border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 4px);
  background: var(--ke-color-hover, var(--background-modifier-hover));
  overflow-wrap: anywhere;
}
.auction-hub-pipeline-label {
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, .72rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  text-align: center;
  white-space: normal;
}
.auction-hub-pipeline-count {
  font-size: var(--ke-type-heading, .92rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
}
.auction-hub-pipeline-step[class*="tone-"] { border-color: var(--ke-color-border, var(--background-modifier-border)); }
.auction-hub-pipeline-count[class*="tone-"] { color: var(--ke-color-text, var(--text-normal)); }
.auction-hub-pipeline-arrow {
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-heading, .92rem);
  font-weight: 700;
}
.auction-hub-pipeline-group {
  display: flex;
  flex-direction: column;
  gap: var(--ke-space-2, 4px);
  min-inline-size: 0;
}
.auction-hub-disclosure {
  min-inline-size: 0;
  margin-block: var(--ke-space-2, 4px);
  overflow-wrap: anywhere;
}
.auction-hub-disclosure > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ke-space-3, 8px);
  min-block-size: var(--ke-touch-target, 44px);
  padding: var(--ke-space-2, 4px) var(--ke-space-3, 8px);
  border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-panel, 8px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  color: var(--ke-color-accent, var(--text-accent));
  font-size: var(--ke-type-heading, .92rem);
  font-weight: 800;
  line-height: var(--ke-leading-control, 1.35);
  cursor: pointer;
}
.auction-hub-disclosure > summary::-webkit-details-marker { display: none; }
.auction-hub-disclosure > summary::after {
  content: "▾";
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-heading, .92rem);
}
.auction-hub-disclosure:not([open]) > summary::after { content: "▸"; }
.auction-hub-disclosure-body {
  margin-block-start: var(--ke-space-3, 8px);
}
.auction-hub-review-queue {
  margin-block: var(--ke-space-2, 4px) var(--ke-space-4, 12px);
}
.auction-hub-review-heading {
  margin-block-end: var(--ke-space-2, 4px);
  color: var(--ke-color-accent, var(--text-accent));
  font-size: var(--ke-type-heading, .92rem);
  font-weight: 800;
}
.auction-hub-review-copy {
  margin-block-end: var(--ke-space-3, 8px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, .72rem);
  line-height: var(--ke-leading-body, 1.45);
}
.auction-hub-review-empty {
  padding-block: var(--ke-space-2, 4px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-body, .84rem);
  font-style: italic;
}
.auction-hub-review-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ke-space-3, 8px);
  min-inline-size: 0;
  padding-block: var(--ke-space-4, 12px);
  border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-hub-review-detail {
  flex: 1 1 14rem;
  min-inline-size: 0;
}
.auction-hub-review-detail > * {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.auction-hub-review-meta {
  margin-block-start: var(--ke-space-1, 2px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, .72rem);
}
.auction-hub-review-reason {
  margin-block-start: var(--ke-space-2, 4px);
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-body, .84rem);
  line-height: var(--ke-leading-body, 1.45);
}
.auction-hub-review-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ke-space-2, 4px);
  min-inline-size: 0;
}
.auction-hub-review-actions > * {
  min-inline-size: 0;
  max-inline-size: 100%;
}
.auction-hub-shell button:not(.prodigy-btn-chip):not(.auction-card-action),
.auction-hub-section button:not(.prodigy-btn-chip):not(.auction-card-action) {
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: var(--ke-touch-target, 44px);
  height: auto;
  box-shadow: none !important;
}
.auction-hub-shell [role="button"]:not(.prodigy-btn-chip):not(.auction-card-action),
.auction-hub-section [role="button"]:not(.prodigy-btn-chip):not(.auction-card-action) {
  min-block-size: var(--ke-touch-target, 44px);
}
.auction-card button,
.auction-card .prodigy-btn-chip,
.auction-card .auction-card-action,
.auction-card-actions button,
.auction-card-research-attention button {
  min-block-size: var(--ke-touch-target, 44px) !important;
  min-inline-size: var(--ke-touch-target, 44px) !important;
  height: auto !important;
  padding: 2px 8px !important;
  font-size: var(--ke-type-caption, 11px) !important;
  line-height: 20px !important;
  border-radius: var(--ke-radius-chip, 9999px) !important;
  font-weight: 500 !important;
  box-shadow: none !important;
}
.auction-hub-shell input,
.auction-hub-shell select,
.auction-hub-section input,
.auction-hub-section select {
  box-shadow: none !important;
}
.auction-hub-shell button:focus-visible,
.auction-hub-section button:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.auction-hub-shell button:active,
.auction-hub-section button:active { transform: scale(.95); }
.auction-hub-shell .prodigy-context-action:active {
  transform: none;
  background: var(--ke-color-hover, var(--background-modifier-hover));
}
@media (forced-colors: active) {
  .auction-hub-shell button:focus-visible,
  .auction-hub-section button:focus-visible { outline: 2px solid CanvasText; }
}
@media (max-width: ${compactMax}px) {
  .markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="compact"]) .auction-hub-stat-grid {
    grid-template-columns: 1fr;
  }
  .auction-hub-pipeline {
    justify-content: flex-start;
  }
  .auction-hub-review-actions {
    inline-size: 100%;
  }
  .auction-hub-review-actions > button {
    flex: 1 1 12rem;
    min-block-size: var(--ke-touch-target, 44px);
  }
}
.markdown-preview-view.prodigy-hub-note:has(.prodigy-app-shell[data-tier="compact"]) .auction-hub-stat-grid {
  grid-template-columns: 1fr;
}
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-finance-row {
  flex-wrap: wrap !important;
  overflow-x: visible !important;
  white-space: normal !important;
}
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-region-inline-action,
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable.is-mobile .prodigy-btn-chip,
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-finance-group-income [role="button"] {
  min-block-size: var(--ke-touch-target, 44px) !important;
  min-inline-size: var(--ke-touch-target, 44px) !important;
  height: auto !important;
}
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable .auction-card-finance-row {
  flex-wrap: wrap !important;
  overflow-x: visible !important;
  white-space: normal !important;
}
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable .auction-card-finance-group,
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable .auction-card-price-pair {
  flex-wrap: wrap !important;
}
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable .auction-region-inline-action,
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable .prodigy-btn-chip,
.prodigy-app-shell.auction-hub-shell[data-tier="compact"] .auction-card-readable .auction-card-finance-group-income [role="button"] {
  min-block-size: var(--ke-touch-target, 44px) !important;
  min-inline-size: var(--ke-touch-target, 44px) !important;
  height: auto !important;
}
.auction-hub-shell .auction-card-readable .auction-region-inline-action,
.auction-hub-shell .auction-card-readable .prodigy-btn-chip,
.auction-hub-shell .auction-card-readable .auction-card-finance-group-income [role="button"] {
  min-block-size: var(--ke-touch-target, 44px) !important;
  min-inline-size: var(--ke-touch-target, 44px) !important;
  height: auto !important;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-native-overview {
  grid-template-columns: minmax(0, 1fr);
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-native-detail-pane .auction-native-sidebar {
  grid-template-columns: minmax(0, 1fr);
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-hub-stat-row {
  flex-wrap: wrap;
  align-items: flex-start;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-hub-stat-label,
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-hub-stat-value {
  min-inline-size: 0;
  max-inline-size: 100%;
  overflow-wrap: anywhere;
  word-break: normal;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-hub-pipeline {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-hub-pipeline-arrow {
  display: none;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"] .auction-native-detail-pane .auction-hub-section.auction-hub-today {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "stats"
    "continue";
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-card-readable .auction-card-header {
  flex-wrap: wrap !important;
  align-items: flex-start !important;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-card-readable .auction-card-title-wrap,
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-card-readable .auction-card-title {
  flex: 1 1 100% !important;
  min-inline-size: 0 !important;
  max-inline-size: 100% !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-workspace-id="auction"][data-tier="compact"] .auction-card-readable .auction-card-header-actions {
  flex: 1 1 100% !important;
  flex-wrap: wrap !important;
  min-inline-size: 0 !important;
  max-inline-size: 100% !important;
}
/* --- GPU Accelerated Micro-Interactions & Glassmorphism --- */
.auction-card, .auction-stat-card {
  will-change: transform;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.15s ease;
  border-radius: var(--ke-radius-panel, 12px);
}
.auction-card:hover, .auction-stat-card:hover {
  transform: translateY(-1px);
  box-shadow: none;
}
.auction-action-btn, .auction-hub-shell button, .auction-native-source-row {
  will-change: transform;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease;
}
.auction-action-btn:active, .auction-hub-shell button:active, .auction-native-source-row:active {
  transform: scale(0.96);
}
.auction-native-source-list {
  background: color-mix(in srgb, var(--ke-color-surface-secondary, var(--background-secondary)) 85%, transparent);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}

@media (prefers-reduced-motion: reduce) {
  .auction-hub-shell *,
  .auction-hub-section *,
  .auction-card, .auction-stat-card, .auction-action-btn {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
    transform: none !important;
    will-change: auto !important;
  }
}
`;

  function ensure() {
    if (typeof document === "undefined" || !document.head || typeof document.createElement !== "function") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = CSS;
  }

  const api = Object.freeze({
    STYLE_ID,
    CSS,
    ensure
  });

  root.AuctionHubStyles = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
