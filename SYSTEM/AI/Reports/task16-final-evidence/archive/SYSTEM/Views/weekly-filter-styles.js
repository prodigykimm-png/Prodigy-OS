(function (root) {
  "use strict";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var id = "prodigy-weekly-filter-styles";
    if (document.getElementById(id)) return;
    var style = document.createElement("style");
    style.id = id;
    style.textContent = ".weekly-filter-mount,.weekly-filter-view{display:grid;gap:17px;min-inline-size:0}.weekly-filter-header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.weekly-filter-title,.weekly-filter-view>h2,.weekly-filter-section h3,.weekly-filter-section h4{margin:0}.weekly-filter-week-label,.weekly-filter-status,.weekly-filter-period,.weekly-filter-question,.weekly-filter-meta,.weekly-filter-refs,.weekly-filter-body,.weekly-filter-empty{color:var(--text-muted);overflow-wrap:anywhere;word-break:keep-all}.weekly-filter-actions{display:flex;gap:8px;margin-inline-start:auto;flex-wrap:wrap}.weekly-filter-btn{min-block-size:44px;cursor:pointer}.weekly-filter-btn-ai,.weekly-filter-heading-primary{color:var(--ke-color-interactive,var(--text-accent))}.weekly-filter-btn:disabled{opacity:.5;cursor:not-allowed}.weekly-filter-view>*{min-inline-size:0}.weekly-filter-view>p,.weekly-filter-section p{margin:0}.weekly-filter-section{display:grid;gap:8px;padding-block-start:12px;border-block-start:1px solid var(--background-modifier-border)}.weekly-filter-learning-card,.weekly-filter-pattern-card,.weekly-filter-principle-card{display:grid;gap:4px;min-inline-size:0}.weekly-filter-list{display:grid;gap:8px;margin:0;padding-inline-start:1.2em}.weekly-filter-item{overflow-wrap:anywhere}.weekly-filter-status-error{color:var(--text-error)}.weekly-filter-evidence>summary{min-block-size:44px;display:flex;align-items:center;cursor:pointer;font-weight:700}.weekly-filter-mount :focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}@media(max-width:833px){.weekly-filter-header{align-items:stretch}.weekly-filter-week-label{order:2;inline-size:100%}.weekly-filter-actions{order:3;margin-inline-start:0;inline-size:100%;display:grid;grid-template-columns:1fr 1fr}}@media(max-width:419px){.weekly-filter-actions{grid-template-columns:1fr}}@media(forced-colors:active){.weekly-filter-heading-primary{border-inline-start:2px solid Highlight}.weekly-filter-mount :focus-visible{outline-color:Highlight}}@media(prefers-reduced-motion:reduce){.weekly-filter-mount *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}";
    document.head.appendChild(style);
  }

  root.WeeklyFilterStyles = Object.freeze({ ensureStyles: ensureStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.WeeklyFilterStyles;
})(typeof window !== "undefined" ? window : globalThis);
