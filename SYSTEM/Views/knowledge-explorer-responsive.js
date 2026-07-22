"use strict";

(function (root) {
  const WIDE_MIN = 1024;
  const COMPACT_MIN = 640;
  const CSS = `
.knowledge-explorer-shell { display:grid; grid-template-columns:minmax(min(var(--ke-nav-min),100%),var(--ke-nav-max)) minmax(min(var(--ke-topic-min),100%),1fr) minmax(min(var(--ke-detail-min),100%),1.3fr); gap:var(--ke-space-4); min-inline-size:0; min-block-size:0; color:var(--ke-color-text); background:var(--ke-color-surface); container-type:inline-size; container-name:knowledge-explorer; }
.knowledge-explorer-shell *, .knowledge-explorer-shell *::before, .knowledge-explorer-shell *::after { box-sizing:border-box; }
.knowledge-explorer-pane { display:flex; flex-direction:column; min-inline-size:0; min-block-size:0; background:var(--ke-color-surface); border:1px solid var(--ke-color-border); border-radius:var(--ke-radius-panel); }
.knowledge-explorer-pane-head { display:flex; align-items:center; justify-content:space-between; gap:var(--ke-space-2); padding:var(--ke-space-3) var(--ke-space-4); border-bottom:1px solid var(--ke-color-border); min-inline-size:0; }
.knowledge-explorer-pane-title { min-inline-size:0; }
.knowledge-explorer-pane-title h2, .knowledge-explorer-pane-title h3, .knowledge-explorer-pane-title p, .knowledge-explorer-group-title, .knowledge-explorer-brief-panel h3, .knowledge-explorer-asset-section h3 { margin:0; overflow-wrap:anywhere; }
.knowledge-explorer-pane-title h2, .knowledge-explorer-pane-title h3, .knowledge-explorer-brief-panel h3, .knowledge-explorer-asset-section h3 { font-size:var(--ke-type-title); line-height:1.2; }
.knowledge-explorer-pane-title p, .knowledge-explorer-meta, .knowledge-explorer-status, .knowledge-explorer-empty, .knowledge-explorer-detail-empty, .knowledge-explorer-detail-error, .knowledge-explorer-row-note, .knowledge-explorer-row-meta, .knowledge-explorer-detail-summary { font-size:var(--ke-type-body); line-height:var(--ke-leading-body); color:var(--ke-color-muted); overflow-wrap:anywhere; }
.knowledge-explorer-scroll-domain, .knowledge-explorer-scroll-topic, .knowledge-explorer-scroll-detail { display:flex; flex-direction:column; gap:var(--ke-space-3); min-inline-size:0; min-block-size:0; overflow:auto; padding:var(--ke-space-3); }
.knowledge-explorer-domain-list, .knowledge-explorer-middle-groups, .knowledge-explorer-detail-list, .knowledge-explorer-group, .knowledge-explorer-detail-sections, .knowledge-explorer-brief-panel, .knowledge-explorer-asset-section, .knowledge-explorer-detail-card { display:flex; flex-direction:column; gap:var(--ke-space-2); min-inline-size:0; }
.knowledge-explorer-group-title, .knowledge-explorer-detail-header, .knowledge-explorer-detail-item-head { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--ke-space-2); min-inline-size:0; }
.knowledge-explorer-group-title { color:var(--ke-color-muted); font-size:var(--ke-type-label); line-height:1.25; }
.knowledge-explorer-button, .knowledge-explorer-open, .knowledge-explorer-back { display:inline-flex; align-items:center; justify-content:space-between; gap:var(--ke-space-2); min-inline-size:0; min-height:32px; padding:4px 8px; border:1px solid var(--ke-color-border); border-radius:var(--ke-radius-control); background:var(--ke-color-surface-secondary); color:var(--ke-color-text); cursor:pointer; transition:background-color var(--ke-motion-fast) ease,border-color var(--ke-motion-fast) ease,transform var(--ke-motion-fast) ease; }
.knowledge-explorer-button:hover, .knowledge-explorer-open:hover, .knowledge-explorer-back:hover, .knowledge-explorer-button[data-selected="true"], .knowledge-explorer-open[data-selected="true"] { background:var(--ke-color-hover); }
.knowledge-explorer-button[data-selected="true"], .knowledge-explorer-open[data-selected="true"] { border-color:var(--ke-color-accent); color:var(--ke-color-accent); }
.knowledge-explorer-button:focus-visible, .knowledge-explorer-open:focus-visible, .knowledge-explorer-back:focus-visible, .knowledge-explorer-row-link:focus-visible, .knowledge-explorer-detail-item-link:focus-visible, .knowledge-explorer-brief-source:focus-visible { outline:2px solid var(--ke-color-accent); outline-offset:2px; }
.knowledge-explorer-button[disabled], .knowledge-explorer-open[aria-disabled="true"], .knowledge-explorer-back[disabled] { opacity:.5; cursor:not-allowed; }
.knowledge-explorer-button-label, .knowledge-explorer-open-label, .knowledge-explorer-row-title, .knowledge-explorer-row-path, .knowledge-explorer-row-note, .knowledge-explorer-row-meta, .knowledge-explorer-detail-title, .knowledge-explorer-status, .knowledge-explorer-detail-item-meta, .knowledge-explorer-detail-item-note, .knowledge-explorer-detail-item-link, .knowledge-explorer-brief-source { min-inline-size:0; overflow-wrap:anywhere; word-break:keep-all; }
.knowledge-explorer-count { color:var(--ke-color-muted); font-size:var(--ke-type-label); flex:0 0 auto; }
.knowledge-explorer-detail-card, .knowledge-explorer-status, .knowledge-explorer-empty, .knowledge-explorer-detail-empty, .knowledge-explorer-detail-error { padding:var(--ke-space-3); border:1px solid var(--ke-color-border); border-radius:var(--ke-radius-panel); background:var(--ke-color-surface-secondary); }
.knowledge-explorer-status[data-state="error"], .knowledge-explorer-detail-error, .knowledge-explorer-detail-item-note[data-state="warning"] { color:var(--ke-color-error); }
.knowledge-explorer-detail-item { padding:var(--ke-space-2) 0; border-top:1px solid var(--ke-color-border); min-inline-size:0; }
.knowledge-explorer-detail-item:first-child { border-top:0; padding-top:0; }
.knowledge-explorer-row-actions { display:flex; flex-wrap:wrap; gap:var(--ke-space-2); }
.knowledge-explorer-brief-sources { display:flex; flex-direction:column; gap:var(--ke-space-2); min-inline-size:0; }
.knowledge-explorer-brief-source-list { display:flex; flex-direction:column; gap:var(--ke-space-2); min-inline-size:0; margin:0; padding:0; list-style:none; }
.knowledge-explorer-brief-source-row { display:block; min-inline-size:0; overflow-wrap:anywhere; word-break:keep-all; }
.knowledge-explorer-brief-source-row .knowledge-explorer-brief-source { display:block; min-inline-size:0; overflow-wrap:anywhere; }
.knowledge-explorer-row-link, .knowledge-explorer-detail-item-link, .knowledge-explorer-brief-source { color:var(--ke-color-accent); text-decoration:none; }
.knowledge-explorer-row-link:hover, .knowledge-explorer-detail-item-link:hover, .knowledge-explorer-brief-source:hover { text-decoration:underline; }
.knowledge-explorer-drill-back { min-height:var(--ke-touch-target); }
@media (min-width: ${COMPACT_MIN}px) and (max-width: ${WIDE_MIN - 1}px) { .knowledge-explorer-shell[data-layout="compact"] { grid-template-columns:minmax(min(var(--ke-nav-min),100%),var(--ke-nav-max)) minmax(0,1fr); } }
@media (max-width: ${COMPACT_MIN - 1}px) { .knowledge-explorer-shell[data-layout="narrow"] { grid-template-columns:minmax(0,1fr); } .knowledge-explorer-button, .knowledge-explorer-open, .knowledge-explorer-back { min-height:var(--ke-touch-target); } }
@container knowledge-explorer (max-width: ${WIDE_MIN - 1}px) { .knowledge-explorer-pane-title h2 { line-height:var(--ke-leading-body); } }
@media (prefers-reduced-motion: reduce) { .knowledge-explorer-button, .knowledge-explorer-open, .knowledge-explorer-back { transition:none; transform:none; } }
`;

  function layoutForWidth(width) {
    const logicalWidth = Number(width);
    if (!Number.isFinite(logicalWidth) || logicalWidth >= WIDE_MIN) return "wide";
    return logicalWidth >= COMPACT_MIN ? "compact" : "narrow";
  }

  function visiblePanes(layout, focusPane) {
    if (layout === "wide") return ["domain", "middle", "detail"];
    if (layout === "compact") return focusPane === "detail" ? ["domain", "detail"] : ["domain", "middle"];
    return [focusPane === "detail" ? "detail" : focusPane === "middle" ? "middle" : "domain"];
  }

  function previousPane(focusPane) {
    return focusPane === "detail" ? "middle" : "domain";
  }

  const api = Object.freeze({ CSS, WIDE_MIN, COMPACT_MIN, layoutForWidth, visiblePanes, previousPane });
  root.KnowledgeExplorerResponsive = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
