"use strict";

(function (root) {
  function responsiveTokens() {
    const tokens = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
    if (!tokens || !tokens.RESPONSIVE_BREAKPOINTS || !tokens.CONTROL_HEIGHTS) throw new Error("Knowledge Explorer responsive tokens must load before the responsive module.");
    return tokens;
  }

  const { RESPONSIVE_BREAKPOINTS, CONTROL_HEIGHTS } = responsiveTokens();
  const MEDIUM_MIN = RESPONSIVE_BREAKPOINTS.collapsedNavMax + 1;
  const WIDE_MIN = RESPONSIVE_BREAKPOINTS.utilityTwoColumnMax + 1;
  const TOUCH_TARGET = CONTROL_HEIGHTS.touchTarget;
  const CSS = `
.knowledge-explorer-hub-mount,.knowledge-explorer-shell{box-sizing:border-box;inline-size:100%;max-inline-size:100%;min-inline-size:0;min-block-size:0}
.knowledge-explorer-shell{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1fr) minmax(0,1.3fr);gap:17px;font-size:var(--ke-type-body);line-height:var(--ke-leading-body);container-type:inline-size;container-name:knowledge-explorer}
.knowledge-explorer-shell*,.knowledge-explorer-shell*::before,.knowledge-explorer-shell*::after{box-sizing:border-box}
.knowledge-explorer-pane{display:flex;flex-direction:column;max-inline-size:100%;min-inline-size:0;min-block-size:0;padding:0}
.knowledge-explorer-pane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:clamp(4px,2cqi,17px);border-bottom:1px solid var(--background-modifier-border);max-inline-size:100%;min-inline-size:0}
.knowledge-explorer-pane-title{min-inline-size:0}.knowledge-explorer-pane-title h2,.knowledge-explorer-pane-title h3,.knowledge-explorer-pane-title p,.knowledge-explorer-group-title,.knowledge-explorer-brief-panel h3,.knowledge-explorer-asset-section h3{margin:0;overflow-wrap:anywhere}
.knowledge-explorer-meta,.knowledge-explorer-status,.knowledge-explorer-empty,.knowledge-explorer-detail-empty,.knowledge-explorer-detail-error,.knowledge-explorer-row-note,.knowledge-explorer-row-meta,.knowledge-explorer-detail-summary,.knowledge-explorer-group-title,.knowledge-explorer-count{color:var(--text-muted);overflow-wrap:anywhere}
.knowledge-explorer-scroll-domain,.knowledge-explorer-scroll-topic,.knowledge-explorer-scroll-detail{display:flex;flex-direction:column;gap:12px;max-inline-size:100%;min-inline-size:0;min-block-size:0;overflow:auto;padding:clamp(4px,2cqi,17px);overscroll-behavior:contain}
.knowledge-explorer-domain-list,.knowledge-explorer-middle-groups,.knowledge-explorer-detail-list,.knowledge-explorer-group,.knowledge-explorer-detail-sections,.knowledge-explorer-brief-panel,.knowledge-explorer-asset-section,.knowledge-explorer-detail-card{display:flex;flex-direction:column;gap:8px;max-inline-size:100%;min-inline-size:0}
.knowledge-explorer-brief-lines{max-inline-size:100%;min-inline-size:0;margin:0;padding:0;list-style:none}.markdown-rendered .knowledge-explorer-brief-lines>li{min-inline-size:0;margin-inline-start:0;overflow-wrap:anywhere;word-break:keep-all}
.knowledge-explorer-group-title,.knowledge-explorer-detail-header,.knowledge-explorer-detail-item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-inline-size:0}
button.knowledge-explorer-button,button.knowledge-explorer-open,button.knowledge-explorer-back{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;inline-size:100%;max-inline-size:100%;min-inline-size:0;min-block-size:44px;box-shadow:none;cursor:pointer;white-space:normal;overflow-wrap:anywhere;word-break:keep-all}
.knowledge-explorer-button[data-selected="true"],.knowledge-explorer-open[data-selected="true"]{border-color:var(--ke-color-interactive,var(--text-accent));color:var(--ke-color-interactive,var(--text-accent))}
.knowledge-explorer-button:focus-visible,.knowledge-explorer-open:focus-visible,.knowledge-explorer-back:focus-visible,.knowledge-explorer-row-link:focus-visible,.knowledge-explorer-detail-item-link:focus-visible,.knowledge-explorer-brief-source:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}
.knowledge-explorer-button[disabled],.knowledge-explorer-open[aria-disabled="true"],.knowledge-explorer-back[disabled]{opacity:.5;cursor:not-allowed}
.knowledge-explorer-button-label,.knowledge-explorer-open-label,.knowledge-explorer-row-title,.knowledge-explorer-row-path,.knowledge-explorer-row-note,.knowledge-explorer-row-meta,.knowledge-explorer-detail-title,.knowledge-explorer-status,.knowledge-explorer-detail-item-meta,.knowledge-explorer-detail-item-note,.knowledge-explorer-detail-item-link,.knowledge-explorer-brief-source{min-inline-size:0;overflow-wrap:anywhere;word-break:keep-all}
.knowledge-explorer-count{flex:0 0 auto}.knowledge-explorer-status[data-state="error"],.knowledge-explorer-detail-error,.knowledge-explorer-detail-item-note[data-state="warning"]{color:var(--text-error)}
.knowledge-explorer-detail-item{padding:8px 0;border-top:1px solid var(--background-modifier-border);min-inline-size:0}.knowledge-explorer-detail-item:first-child{border-top:0;padding-top:0}
.knowledge-explorer-row-actions,.knowledge-explorer-brief-sources,.knowledge-explorer-brief-source-list{display:flex;flex-wrap:wrap;gap:8px;min-inline-size:0}.knowledge-explorer-brief-source-list{flex-direction:column;margin:0;padding:0;list-style:none}
.knowledge-explorer-brief-source-row,.knowledge-explorer-brief-source-row .knowledge-explorer-brief-source{display:block;min-inline-size:0;overflow-wrap:anywhere;word-break:keep-all}
.knowledge-explorer-row-link,.knowledge-explorer-detail-item-link,.knowledge-explorer-brief-source{display:inline-flex;align-items:center;max-inline-size:100%;min-block-size:44px;color:var(--ke-color-interactive,var(--text-accent));text-decoration:none}.knowledge-explorer-row-link:hover,.knowledge-explorer-detail-item-link:hover,.knowledge-explorer-brief-source:hover{text-decoration:underline}
.knowledge-explorer-shell[data-layout="medium"]{grid-template-columns:minmax(0,.7fr) minmax(0,1fr)}
.knowledge-explorer-shell[data-layout="compact"]{grid-template-columns:minmax(0,1fr)}
.knowledge-explorer-shell[data-layout="compact"] .knowledge-explorer-scroll-domain{padding-inline:4px}
.knowledge-explorer-shell[data-layout="compact"] .knowledge-explorer-domain-list>button.knowledge-explorer-button{justify-content:flex-start;gap:4px;padding-inline:4px}
@container knowledge-explorer (max-width:${WIDE_MIN - 1}px){.knowledge-explorer-pane-head{align-items:flex-start}}
@media(max-width:${MEDIUM_MIN - 1}px){.knowledge-growth-summary>div{grid-template-columns:minmax(0,1fr)!important;max-inline-size:100%;min-inline-size:0}}@media(max-width:419px){#knowledge-panel-zettelkasten>.knowledge-workspace-role-panel,#knowledge-panel-zettelkasten>.knowledge-candidate-review-launcher{padding-inline:4px}.knowledge-growth-summary.prodigy-full-bleed{padding-inline:0}.knowledge-growth-summary .knowledge-growth-stat{padding-inline:4px}}
@media(max-width:480px){.prodigy-app-shell[data-workspace-id="knowledge"]>.prodigy-workspace-bar{padding-inline:4px}}
@media(forced-colors:active){.knowledge-explorer-button[data-selected="true"],.knowledge-explorer-open[data-selected="true"]{border:2px solid Highlight}.knowledge-explorer-button:focus-visible,.knowledge-explorer-open:focus-visible,.knowledge-explorer-back:focus-visible{outline-color:Highlight}}
@media(prefers-reduced-motion:reduce){.knowledge-explorer-shell *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;

  function layoutForWidth(width) {
    const logicalWidth = Number(width);
    if (!Number.isFinite(logicalWidth) || logicalWidth >= WIDE_MIN) return "wide";
    return logicalWidth >= MEDIUM_MIN ? "medium" : "compact";
  }

  function visiblePanes(layout, focusPane) {
    if (layout === "wide") return ["domain", "middle", "detail"];
    if (layout === "medium") return focusPane === "detail" ? ["domain", "detail"] : ["domain", "middle"];
    return [focusPane === "detail" ? "detail" : focusPane === "middle" ? "middle" : "domain"];
  }

  function previousPane(focusPane) {
    return focusPane === "detail" ? "middle" : "domain";
  }

  const api = Object.freeze({ CSS, MEDIUM_MIN, WIDE_MIN, TOUCH_TARGET, layoutForWidth, visiblePanes, previousPane });
  root.KnowledgeExplorerResponsive = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
