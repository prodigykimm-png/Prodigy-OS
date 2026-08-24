/** People and relation presentation using shared Apple roles. */
(function (root) {
  "use strict";

  const WORKSPACE_STYLE_ID = "prodigy-people-workspace-styles";
  function designTokens() {
    if (root.ProdigyTokens) return root.ProdigyTokens;
    if (typeof require === "function") return require("./design-tokens.js");
    throw new Error("People responsive design tokens are required");
  }
  function responsiveContract() {
    const tokens = designTokens();
    const responsive = tokens.RESPONSIVE_BREAKPOINTS;
    const controls = tokens.CONTROL_HEIGHTS;
    if (!responsive || !controls) throw new Error("People responsive design tokens are incomplete");
    return Object.freeze({
      compactMax: responsive.compactMax,
      mediumMin: responsive.compactMax + 1,
      wideMin: responsive.utilityTwoColumnMax + 1,
      actionBarHeight: controls.actionBar,
      touchTarget: controls.touchTarget,
    });
  }

  function ensureWorkspaceStyles() {
    if (typeof document === "undefined") return;
    const tokens = designTokens();
    const TYPE_SCALE = tokens.TYPE_SCALE || {};
    const SPACE_SCALE = tokens.SPACE_SCALE || {};
    const RADII = tokens.RADII || {};
    const CONTROL_HEIGHTS = tokens.CONTROL_HEIGHTS || {};
    const SEMANTIC_COLORS = tokens.SEMANTIC_COLORS || {};

    const { compactMax, wideMin } = responsiveContract();
    let style = document.getElementById(WORKSPACE_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = WORKSPACE_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
.prodigy-people-workspace,
.modal.ppw-modal,
.ppw-preview-modal,
.ppw-modal-surface,
.ppw-preview-shell {
  --ke-type-body: ${TYPE_SCALE.body?.fontSize || 17}px;
  --ke-leading-body: ${TYPE_SCALE.body?.lineHeight || 1.47};
  --ke-type-label: ${TYPE_SCALE.caption?.fontSize || 14}px;
  --ke-type-title: ${TYPE_SCALE.tagline?.fontSize || 21}px;
  --ke-font-text: ${TYPE_SCALE.body?.fontFamily || "system-ui, -apple-system, sans-serif"};
  --ke-space-1: ${SPACE_SCALE.xxs || 4}px;
  --ke-space-2: ${SPACE_SCALE.xs || 8}px;
  --ke-space-3: ${SPACE_SCALE.sm || 12}px;
  --ke-space-4: ${SPACE_SCALE.md || 17}px;
  --ke-space-5: ${SPACE_SCALE.lg || 24}px;
  --ke-border-width: 1px;
  --ke-focus-ring-width: 2px;
  --ke-radius-control: ${RADII.sm || 8}px;
  --ke-radius-panel: ${RADII.md || 12}px;
  --ke-radius-pill: 9999px;
  --ke-opacity-disabled: 0.6;
  --ke-color-surface: ${SEMANTIC_COLORS.canvas || "var(--background-primary)"};
  --ke-color-surface-secondary: ${SEMANTIC_COLORS.canvasParchment || "var(--background-secondary)"};
  --ke-color-border: ${SEMANTIC_COLORS.border || "var(--background-modifier-border)"};
  --ke-color-text: ${SEMANTIC_COLORS.ink || "var(--text-normal)"};
  --ke-color-muted: ${SEMANTIC_COLORS.muted || "var(--text-muted)"};
  --ke-color-accent: ${SEMANTIC_COLORS.focus || "var(--text-accent)"};
  --ke-color-interactive: ${SEMANTIC_COLORS.action || "var(--interactive-accent)"};
  --ke-color-on-interactive: ${SEMANTIC_COLORS.onAction || "var(--text-on-accent)"};
  --ke-control-height: ${CONTROL_HEIGHTS.native || 44}px;
  --ke-touch-target: ${CONTROL_HEIGHTS.touchTarget || 44}px;
  --ke-action-bar-height: ${CONTROL_HEIGHTS.actionBar || 52}px;
}
.prodigy-people-workspace,.personal-tabpanel{min-inline-size:0;font-family:var(--ke-font-text);font-size:var(--ke-type-body);line-height:var(--ke-leading-body);word-break:keep-all;overflow-wrap:anywhere}
.prodigy-people-workspace *{box-sizing:border-box;min-inline-size:0}
.personal-tabs{margin-block-end:var(--ke-space-4);border-block-end:var(--ke-border-width) solid var(--ke-color-border)}
.ppw-header,.ppw-detail-head,.ppw-card-top,.ppw-name-row,.ppw-preview-title-row,.ppw-preview-title-main,.ppw-preview-footer,.ppw-preview-footer-left,.ppw-preview-footer-right{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:var(--ke-space-3)}

/* Glassmorphism Header & Toolbar */
.ppw-header{
  padding:var(--ke-space-4);
  border-block-end:var(--ke-border-width) solid var(--ke-color-border);
  background: var(--ke-color-surface);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}
.ppw-header h1,.ppw-detail-title,.ppw-preview-title{margin:0;font-family:var(--ke-font-display);font-size:var(--ke-type-title);line-height:var(--ke-leading-control);font-weight:var(--ke-font-weight-strong)}
.ppw-header p,.ppw-meta,.ppw-sub,.ppw-count,.ppw-toolbar-label,.ppw-badge,.ppw-memo-title,.ppw-context-title,.ppw-edit-label,.ppw-edit-status,.ppw-empty,.ppw-related-empty{margin:0;color:var(--ke-color-muted);font-size:var(--ke-type-label);line-height:var(--ke-leading-body);overflow-wrap:anywhere}
.ppw-toolbar,.ppw-toolbar-row,.ppw-filters,.ppw-actions,.ppw-context-types,.ppw-edit-line-add,.ppw-rel-chips{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ke-space-2)}
.ppw-toolbar{align-items:stretch;flex-direction:column;padding-block:var(--ke-space-4)}
.ppw-search,.ppw-modal-surface input,.ppw-modal-surface select,.ppw-modal-surface textarea,.ppw-edit-input,.ppw-edit-textarea{inline-size:100%;min-block-size:var(--ke-touch-target);padding:var(--ke-space-2) var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);font:inherit;word-break:keep-all;overflow-wrap:anywhere}

/* GPU Interactive Physics */
.ppw-filter,.ppw-ctx-type,.ppw-context-toggle,.ppw-rel-chip{
  min-block-size:var(--ke-touch-target);max-inline-size:100%;padding-inline:var(--ke-space-3);
  border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-pill);box-shadow:none;
  background:var(--ke-color-surface);color:var(--ke-color-muted);font:inherit;cursor:pointer;white-space:normal;word-break:keep-all;
  will-change: transform;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease;
}
.ppw-filter:active,.ppw-ctx-type:active,.ppw-context-toggle:active,.ppw-rel-chip:active{transform:scale(0.95)}
.ppw-filter[aria-pressed="true"],.ppw-filter.is-active,.ppw-ctx-type[aria-pressed="true"],.ppw-ctx-type.is-active,.ppw-rel-chip[aria-pressed="true"],.ppw-rel-chip.is-active{border-color:var(--ke-color-interactive);color:var(--ke-color-interactive)}
.ppw-master-detail{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--ke-space-4);min-block-size:0}
.ppw-master-detail[data-pane-mode="two-pane"]{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.ppw-detail-pane{padding-inline-start:var(--ke-space-4);border-inline-start:var(--ke-border-width) solid var(--ke-color-border)}
.ppw-detail-back{display:inline-flex}.ppw-detail-section{padding-block:var(--ke-space-4);border-block-end:var(--ke-border-width) solid var(--ke-color-border)}
.ppw-detail-lines,.ppw-detail-context,.ppw-list,.ppw-memo-list,.ppw-edit-line-list{display:grid;gap:var(--ke-space-2)}
.ppw-list{padding-block:var(--ke-space-2)}

/* Contact Cards GPU Physics */
.ppw-card,.ppw-memo,.ppw-edit-line-row,.ppw-edit-panel{
  padding:var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);
  border-radius:var(--ke-radius-panel);background:var(--ke-color-surface-secondary);
  will-change: transform;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
}
.ppw-card:hover {
  transform: translateY(-1px);
  box-shadow:none;
}
.ppw-card{display:grid;gap:var(--ke-space-2)}
.ppw-card[aria-current="true"],.ppw-card[data-state="selected"]{border-color:var(--ke-color-interactive)}
.ppw-name{display:inline-flex;align-items:center;max-inline-size:100%;min-block-size:var(--ke-touch-target);margin:0;border:0;box-shadow:none;background:transparent;color:var(--ke-color-interactive);font:inherit;font-weight:var(--ke-font-weight-strong);cursor:pointer;text-align:start}
.ppw-trash.ppw-trash,.ppw-memo-del.ppw-memo-del{min-inline-size:var(--ke-touch-target);min-block-size:var(--ke-touch-target);border:0;box-shadow:none;background:transparent;color:var(--ke-color-muted);cursor:pointer}
.ppw-memo-row,.ppw-edit-line-row,.ppw-context-head{display:flex;align-items:flex-start;gap:var(--ke-space-2)}
.ppw-memo-line,.ppw-edit-line-text{flex:1;overflow-wrap:anywhere}
.ppw-context{padding-block-start:var(--ke-space-3);border-block-start:var(--ke-border-width) solid var(--ke-color-border)}
.ppw-context-item{display:grid;gap:var(--ke-space-1);inline-size:100%;min-block-size:var(--ke-touch-target);padding:var(--ke-space-2);border:0;box-shadow:none;background:transparent;color:inherit;text-align:start;cursor:pointer;word-break:keep-all;overflow-wrap:anywhere}
.ppw-context-item:hover{background:var(--ke-color-hover)}
.ppw-header button,.ppw-actions button,.ppw-detail-back,.ppw-edit-line-add button,.ppw-undo-btn,.ppw-finder-result,.ppw-modal-surface button{
  min-inline-size:var(--ke-touch-target);min-block-size:var(--ke-touch-target);box-shadow:none;
  border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-control);
  background:var(--ke-color-surface);color:var(--ke-color-text);cursor:pointer;
  will-change: transform; transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.ppw-header button:active,.ppw-actions button:active,.ppw-detail-back:active,.ppw-modal-surface button:active{transform:scale(0.95)}
.ppw-undo-toast{position:fixed;inset-inline:var(--ke-space-4);inset-block-end:max(var(--ke-space-5), env(safe-area-inset-bottom));z-index:10000;display:flex;align-items:center;justify-content:center;gap:var(--ke-space-3);padding:var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-panel);background:var(--ke-color-surface-secondary);backdrop-filter:blur(16px)}
.modal.ppw-modal{inline-size:min(100%,60rem)!important;max-inline-size:100%!important;padding:0!important;overflow:hidden!important;border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-panel)!important;background:var(--ke-color-surface, var(--background-primary))!important;color:var(--ke-color-text, var(--text-normal))}
.modal.ppw-modal .modal-content{padding:0!important;background:var(--ke-color-surface, var(--background-primary))!important;color:var(--ke-color-text, var(--text-normal))}
.ppw-modal-surface,.ppw-preview-shell{display:flex;flex-direction:column;max-block-size:92vh;min-block-size:0;overflow:hidden;word-break:keep-all;overflow-wrap:anywhere;background:var(--ke-color-surface, var(--background-primary));color:var(--ke-color-text, var(--text-normal))}
.ppw-preview-head,.ppw-preview-footer{flex:0 0 auto;padding:var(--ke-space-4);border-block-end:var(--ke-border-width) solid var(--ke-color-border);background:var(--ke-color-surface, var(--background-primary))}
.ppw-preview-footer{border-block-start:var(--ke-border-width) solid var(--ke-color-border);border-block-end:0;padding-bottom:max(var(--ke-space-4), env(safe-area-inset-bottom))}
.ppw-preview-scroll{flex:1 1 auto;min-block-size:0;overflow:auto;overscroll-behavior:contain;padding:var(--ke-space-4);background:var(--ke-color-surface, var(--background-primary))}
.ppw-edit-group,.ppw-edit-panel{margin-block-end:var(--ke-space-4)}
.ppw-edit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:var(--ke-space-3)}
.ppw-edit-field,.ppw-rel-picker{display:grid;gap:var(--ke-space-2)}
.ppw-edit-textarea{resize:vertical;white-space:pre-wrap}
.ppw-read-loading,.prodigy-people-workspace [data-state="loading"]{color:var(--ke-color-muted);cursor:progress}
.ppw-read-error,.prodigy-people-workspace [data-state="error"]{color:var(--ke-color-error)}
.ppw-empty,.prodigy-people-workspace [data-state="empty"]{color:var(--ke-color-muted)}
.ppw-filter:disabled,.ppw-ctx-type:disabled,.ppw-context-toggle:disabled,.ppw-rel-chip:disabled,.ppw-actions button:disabled{opacity:var(--ke-opacity-disabled);cursor:not-allowed;transform:none}
.ppw-search:focus-visible,.ppw-filter:focus-visible,.ppw-ctx-type:focus-visible,.ppw-context-toggle:focus-visible,.ppw-rel-chip:focus-visible,.ppw-name:focus-visible,.ppw-context-item:focus-visible,.ppw-actions button:focus-visible,.ppw-header button:focus-visible,.ppw-detail-back:focus-visible,.ppw-trash:focus-visible,.ppw-memo-del:focus-visible,.ppw-modal-surface input:focus-visible,.ppw-modal-surface select:focus-visible,.ppw-modal-surface textarea:focus-visible,.ppw-modal-surface button:focus-visible{outline:var(--ke-focus-ring-width) solid var(--ke-color-accent);outline-offset:var(--ke-space-1)}

.ppw-rel-hint{font-size:var(--ke-type-label);color:var(--ke-color-muted);line-height:var(--ke-leading-body)}
.ppw-rel-chips{display:flex;flex-wrap:wrap;gap:var(--ke-space-2)}
.ppw-rel-chip{
  display:inline-flex;align-items:center;justify-content:center;
  min-height:0;height:auto;padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-pill);
  font-size:var(--ke-type-label);font-weight:700;line-height:1.35;cursor:pointer;
  border:var(--ke-border-width) solid var(--ke-color-border);
  background:var(--ke-color-surface);color:var(--ke-color-muted);
}
.ppw-rel-chip:hover{background:var(--ke-color-hover);color:var(--ke-color-text)}
.ppw-rel-chip.is-active{
  border-color:var(--ke-color-interactive) !important;
  background:var(--ke-color-interactive) !important;
  color:var(--ke-color-on-interactive) !important;
}
.ppw-rel-legacy{
  margin-top:var(--ke-space-1);padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);
  background:var(--ke-color-surface-secondary);
  border:var(--ke-border-width) dashed var(--ke-color-border);
  font-size:var(--ke-type-label);line-height:var(--ke-leading-body);
}
.ppw-rel-legacy-text{font-weight:700;color:var(--ke-color-text)}
.ppw-rel-legacy-hint{color:var(--ke-color-muted)}

@media(max-width:${compactMax}px){.ppw-header{align-items:stretch;flex-direction:column}.ppw-master-detail{display:block}.ppw-detail-pane{padding-inline-start:0;border-inline-start:0}.modal.ppw-modal{inline-size:100%!important;max-inline-size:100%!important;border-radius:var(--ke-radius-panel)!important}.ppw-preview-footer{align-items:stretch;flex-direction:column}}
@media(max-width:480px){.prodigy-app-shell[data-workspace-id="personal"]>.prodigy-workspace-bar{padding-inline:4px}.prodigy-app-shell[data-workspace-id="personal"] .ppv-venue-toolbar{padding-inline:4px}}
@media(min-width:${wideMin}px){.ppw-master-detail[data-pane-mode="two-pane"]>.ppw-list-pane,.ppw-master-detail[data-pane-mode="two-pane"]>.ppw-detail-pane{display:block}}
@media(forced-colors:active){.ppw-filter[aria-pressed="true"],.ppw-filter.is-active,.ppw-ctx-type.is-active,.ppw-rel-chip.is-active{forced-color-adjust:auto}.prodigy-people-workspace :focus-visible,.modal.ppw-modal :focus-visible{outline-color:Highlight}}
@media(prefers-reduced-motion:reduce){.prodigy-people-workspace *,.modal.ppw-modal *,.ppw-card,.ppw-filter,.ppw-header button{animation:none!important;transition:none!important;scroll-behavior:auto!important;transform:none!important;will-change:auto!important}}
`;
  }

  root.PeopleStyles = Object.freeze({ WORKSPACE_STYLE_ID, responsiveContract, ensureWorkspaceStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.PeopleStyles;
})(typeof globalThis !== "undefined" ? globalThis : this);
