/**
 * People Workspace CSS — extracted from people-view.js (P2-1)
 * 로드 순서: people-view.js 전에 로드.
 */
(function (root) {
  "use strict";

  const WORKSPACE_STYLE_ID = "prodigy-people-workspace-styles";

  function designTokens() {
    if (root.ProdigyTokens) return root.ProdigyTokens;
    if (typeof require === "function") {
      try { return require("./design-tokens.js"); } catch (_error) { /* handled below */ }
    }
    throw new Error("People 반응형 디자인 토큰을 불러오지 못했습니다.");
  }

  function responsiveContract() {
    const tokens = designTokens();
    if (!tokens.BREAKPOINTS || !tokens.CONTROL_HEIGHTS) {
      throw new Error("People 반응형 디자인 토큰이 완전하지 않습니다.");
    }
    return Object.freeze({
      compactMax: tokens.BREAKPOINTS.medium - 1,
      mediumMin: tokens.BREAKPOINTS.medium,
      wideMin: tokens.BREAKPOINTS.wide,
      actionBarHeight: tokens.CONTROL_HEIGHTS.actionBar,
      touchTarget: tokens.CONTROL_HEIGHTS.touchTarget
    });
  }

  function ensureWorkspaceStyles() {
    if (typeof document === "undefined") return;
    const { compactMax, wideMin, actionBarHeight, touchTarget } = responsiveContract();
    let style = document.getElementById(WORKSPACE_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = WORKSPACE_STYLE_ID;
      document.head.appendChild(style);
    }
    // Always refresh so modal CSS updates after script reload
    style.textContent = `
.prodigy-people-workspace{max-width:none;margin:0 auto;padding:8px 8px 24px;min-inline-size:0;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;word-break:keep-all;overflow-wrap:anywhere}
.personal-tabs{min-inline-size:0;margin-block-end:var(--ke-space-4,12px);border-block-end:1px solid var(--ke-color-border,var(--background-modifier-border));overflow:visible}
.personal-tabs .prodigy-adaptive-tabs{min-inline-size:0;overflow:visible;padding-block:var(--ke-space-2,4px)}
.personal-tabs .prodigy-adaptive-tab{padding-inline:var(--ke-space-4,12px);font:inherit;line-height:var(--ke-leading-control,1.35);word-break:keep-all;overflow-wrap:anywhere}
.personal-tabpanel{min-inline-size:0;min-block-size:0;word-break:keep-all;overflow-wrap:anywhere}
.ppw-header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:4px 0 16px;border-bottom:1px solid var(--background-modifier-border);flex-wrap:wrap}
.ppw-header h1{margin:0;font-size:var(--ke-type-title,1.05rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0}
.ppw-header p{margin:6px 0 0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);max-width:36em}
.ppw-toolbar{display:flex;flex-direction:column;gap:var(--ke-space-3,8px);padding:var(--ke-space-4,12px) 0 var(--ke-space-2,4px)}
.ppw-toolbar-row{display:flex;align-items:flex-start;gap:var(--ke-space-2,4px);flex-wrap:wrap}
.ppw-toolbar-label{
  flex:0 0 auto;margin-top:6px;font-size:var(--ke-type-label,.72rem);font-weight:800;
  color:var(--text-muted);line-height:var(--ke-leading-control,1.35);letter-spacing:0;min-width:2.2em;
}
.ppw-search{width:100%;box-sizing:border-box;min-block-size:var(--ke-touch-target,44px);padding:var(--ke-space-3,8px) var(--ke-space-4,12px);border-radius:var(--ke-radius-control,4px);border:1px solid var(--ke-color-border,var(--background-modifier-border));background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);word-break:keep-all;overflow-wrap:anywhere}
.ppw-filters{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,4px);flex:1 1 auto;min-width:0}
.ppw-filter{
  min-block-size:32px;height:auto;padding:var(--ke-space-1,2px) var(--ke-space-3,8px);border-radius:999px;
  border:1px solid var(--ke-color-border,var(--background-modifier-border));background:var(--ke-color-surface-secondary,var(--background-secondary));
  color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label,.72rem);font-weight:700;cursor:pointer;line-height:var(--ke-leading-control,1.35);letter-spacing:0;word-break:keep-all;overflow-wrap:anywhere;
  -webkit-appearance:none;appearance:none;
}
.ppw-filter:hover{background:var(--background-modifier-hover);color:var(--text-normal)}
.ppw-filter.is-active{background:var(--ke-color-interactive,var(--interactive-accent));color:var(--ke-color-on-interactive,var(--text-on-accent));border-color:var(--ke-color-interactive,var(--interactive-accent))}
.ppw-search:focus-visible,.ppw-filter:focus-visible,.ppw-ctx-type:focus-visible,.ppw-context-toggle:focus-visible,.ppw-actions button:focus-visible,.ppw-memo-del:focus-visible,.ppw-undo-btn:focus-visible,.ppw-trash:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}
.ppw-filter,.ppw-ctx-type,.ppw-context-toggle,.ppw-rel-chip{max-inline-size:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
.ppw-sorts .ppw-sort{min-width:4.5em}
.ppw-count{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);color:var(--text-muted)}
.ppw-master-detail{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-inline-size:0;min-block-size:0}
.ppw-master-detail[data-pane-mode="two-pane"]{grid-template-columns:minmax(min(22rem,100%),.88fr) minmax(min(24rem,100%),1.12fr)}
.ppw-list-pane,.ppw-detail-pane{min-inline-size:0;min-block-size:0}
.ppw-list-pane[hidden],.ppw-detail-pane[hidden]{display:none!important}
.ppw-detail-pane{border-inline-start:1px solid var(--background-modifier-border);padding-inline-start:12px}
.ppw-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-block:8px;border-bottom:1px solid var(--background-modifier-border)}
.ppw-detail-title{margin:0;font-size:var(--ke-type-title,1.05rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;word-break:keep-all;overflow-wrap:anywhere}
.ppw-detail-back{display:none}
.ppw-detail-section{padding-block:12px;border-bottom:1px solid var(--background-modifier-border)}
.ppw-detail-section h3{margin:0 0 6px;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);letter-spacing:0;color:var(--text-muted)}
.ppw-detail-lines{display:flex;flex-direction:column;gap:4px;margin:0;padding-inline-start:1.2em}
.ppw-detail-context{display:flex;flex-direction:column;gap:4px}
.ppw-detail-context button.ppw-context-item{inline-size:100%;border:0;background:transparent;color:inherit;text-align:start;word-break:keep-all;overflow-wrap:anywhere}
.ppw-list{display:flex;flex-direction:column;gap:10px;padding:8px 0 4px}
.ppw-card{border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.ppw-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ppw-name-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.ppw-name{margin:0;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45);letter-spacing:0;font-weight:800;color:var(--text-accent);cursor:pointer;border-bottom:1px solid transparent}
.ppw-name:hover{border-bottom-color:var(--text-accent)}
.ppw-trash{display:inline-flex;align-items:center;justify-content:center;min-block-size:32px;min-inline-size:32px;padding:var(--ke-space-1,2px);border:1px solid transparent;border-radius:var(--ke-radius-control,4px);background:transparent;color:var(--ke-color-muted,var(--text-muted));cursor:pointer;opacity:0.4;font-size:0.9em;line-height:1;user-select:none;transition:opacity var(--ke-motion-fast,150ms) ease;-webkit-appearance:none;appearance:none}
.ppw-trash:hover{opacity:1}
.ppw-badge{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);font-weight:700;color:var(--text-muted);border:1px solid var(--background-modifier-border);border-radius:4px;padding:var(--ke-space-1,2px) var(--ke-space-2,4px)}
.ppw-meta{font-size:var(--ke-type-body,.84rem);color:var(--text-normal);line-height:var(--ke-leading-body,1.45);overflow-wrap:anywhere}
.ppw-sub{font-size:var(--ke-type-label,.72rem);color:var(--text-muted);line-height:var(--ke-leading-body,1.45)}
.ppw-memo{
  margin-top:2px;padding:8px 10px;border-radius:8px;
  background:var(--background-primary);
  border:1px solid var(--background-modifier-border);
}
.ppw-memo-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px}
.ppw-memo-title{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);font-weight:800;color:var(--text-muted);letter-spacing:0}
.ppw-memo-more{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);font-weight:700;color:var(--text-faint)}
.ppw-memo-list{display:flex;flex-direction:column;gap:2px}
.ppw-memo-row{
  display:flex;align-items:flex-start;gap:6px;
  min-width:0;
}
.ppw-memo-line{
  flex:1 1 auto;min-width:0;
  font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);color:var(--text-normal);
  overflow-wrap:anywhere;
  padding-left:0.85em;position:relative;
}
.ppw-memo-line::before{
  content:"·";position:absolute;left:0;color:var(--text-muted);font-weight:700;
}
.ppw-memo-del{
  flex:0 0 auto;
  display:inline-flex;align-items:center;justify-content:center;
  width:1.35em;height:1.35em;margin-top:1px;padding:0;
  border-radius:4px;border:1px solid transparent;
  background:transparent;color:var(--text-faint);
  font-size:.95em;font-weight:700;line-height:1;cursor:pointer;
  opacity:0.55;-webkit-appearance:none;appearance:none;
}
.ppw-memo-del:hover{
  opacity:1;color:var(--text-error);
  background:color-mix(in srgb, var(--text-error) 10%, transparent);
  border-color:color-mix(in srgb, var(--text-error) 25%, var(--background-modifier-border));
}
.ppw-events{border-style:dashed}
.ppw-search-hint,.ppw-classify-hint{
  font-size:var(--ke-type-label,.72rem);font-weight:600;color:var(--text-accent);line-height:var(--ke-leading-control,1.35);
}
.ppw-classify-hint{color:var(--text-muted);font-weight:500}
.ppw-card-flash{
  box-shadow:0 0 0 2px color-mix(in srgb, var(--interactive-accent) 55%, transparent);
  transition:box-shadow var(--ke-motion-fast,150ms) ease;
}
.ppw-context-types{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 6px}
.ppw-ctx-type{
  min-height:0;padding:var(--ke-space-1,2px) var(--ke-space-3,8px);border-radius:999px;font-size:var(--ke-type-chrome,.68rem);font-weight:700;
  border:1px solid var(--background-modifier-border);background:var(--background-primary);
  color:var(--text-muted);cursor:pointer;line-height:var(--ke-leading-control,1.35);letter-spacing:0;-webkit-appearance:none;appearance:none;
}
.ppw-ctx-type.is-active{
  border-color:var(--interactive-accent);
  background:color-mix(in srgb, var(--interactive-accent) 16%, var(--background-secondary));
  color:var(--text-normal);
}
.ppw-edit-line-list{display:flex;flex-direction:column;gap:4px;margin:6px 0 8px}
.ppw-edit-line-row{
  display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border-radius:6px;
  background:var(--background-primary);border:1px solid var(--background-modifier-border);
}
.ppw-edit-line-text{flex:1 1 auto;font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);overflow-wrap:anywhere}
.ppw-edit-line-empty{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);color:var(--text-faint);padding:4px 0}
.ppw-edit-line-add{display:flex;gap:6px;align-items:center}
.ppw-edit-line-add .ppw-edit-input{flex:1 1 auto}
.ppw-undo-toast{
  position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:10000;
  display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;
  background:var(--background-secondary);border:1px solid var(--background-modifier-border);
  box-shadow:0 8px 28px color-mix(in srgb, var(--background-modifier-box-shadow) 25%, transparent);
  font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);color:var(--text-normal);max-width:min(92vw,420px);
}
.ppw-undo-btn{
  flex:0 0 auto;padding:var(--ke-space-1,2px) var(--ke-space-3,8px);border-radius:6px;font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);font-weight:700;cursor:pointer;
  border:1px solid var(--interactive-accent);background:var(--interactive-accent);color:var(--text-on-accent);
  -webkit-appearance:none;appearance:none;
}
.ppw-context{margin-top:2px;padding-top:8px;border-top:1px solid var(--background-modifier-border)}
.ppw-context-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}
.ppw-context-title{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-control,1.35);font-weight:700;color:var(--text-muted);letter-spacing:0}
.ppw-context-count{font-size:var(--ke-type-chrome,.68rem);line-height:var(--ke-leading-control,1.35);font-weight:600;color:var(--text-faint)}
.ppw-context-item{display:flex;flex-direction:column;gap:1px;padding:4px 0;cursor:pointer;border-radius:4px}
.ppw-context-item:hover{background:var(--background-modifier-hover)}
.ppw-context-item strong{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);overflow-wrap:anywhere}
.ppw-context-item span{font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);color:var(--text-muted)}
.ppw-context-more{margin-top:2px;padding-top:4px;border-top:1px dashed var(--background-modifier-border)}
.ppw-context-toggle{
  display:inline-flex;align-items:center;justify-content:center;
  margin-top:4px;padding:1px 8px;min-height:0;height:auto;
  border-radius:999px;border:1px solid var(--background-modifier-border);
  background:var(--background-primary);color:var(--text-muted);
  font-size:var(--ke-type-label,.72rem);font-weight:700;line-height:var(--ke-leading-control,1.35);letter-spacing:0;cursor:pointer;
  -webkit-appearance:none;appearance:none;
}
.ppw-context-toggle:hover{background:var(--background-modifier-hover);color:var(--text-normal)}
.ppw-actions{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,4px);margin-top:var(--ke-space-2,4px)}
.ppw-related-empty,.ppw-empty{padding:18px 4px;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.ppw-areas{margin-top:28px;padding-top:12px;border-top:1px solid var(--background-modifier-border);opacity:.92}
.ppw-areas summary{cursor:pointer;font-weight:700;font-size:.95em;color:var(--text-muted);list-style:none}
.ppw-areas summary::-webkit-details-marker{display:none}

/* ===== Relation edit modal (desktop-first, mobile-narrow) ===== */
.modal.ppw-modal{
  width:min(960px, calc(100vw - 48px)) !important;
  max-width:960px !important;
  height:auto !important;
  max-height:min(92vh, 1040px) !important;
  padding:0 !important;
  display:flex !important;
  flex-direction:column !important;
  overflow:hidden !important;
  border-radius:12px !important;
  border:1px solid var(--background-modifier-border);
  background:var(--modal-background, var(--background-primary));
  box-shadow:0 12px 40px color-mix(in srgb, var(--background-modifier-box-shadow) 28%, transparent);
}
.modal.ppw-modal .modal-close-button{z-index:3;top:10px;right:12px}
.modal.ppw-modal .modal-content,
.ppw-preview-modal{
  display:flex !important;
  flex-direction:column !important;
  flex:1 1 auto !important;
  min-height:0 !important;
  max-height:inherit !important;
  margin:0 !important;
  padding:0 !important;
  overflow:hidden !important;
}
.ppw-modal-surface{max-block-size:min(82vh,760px);overflow:auto;overscroll-behavior:contain;min-inline-size:0;word-break:keep-all;overflow-wrap:anywhere;color:var(--ke-color-text,var(--text-normal));font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}
.ppw-modal-surface input,.ppw-modal-surface select,.ppw-modal-surface textarea{box-sizing:border-box;inline-size:100%;min-block-size:var(--ke-touch-target,44px);padding:var(--ke-space-2,4px) var(--ke-space-3,8px);border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-control,4px);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));font:inherit;line-height:var(--ke-leading-body,1.45);word-break:keep-all;overflow-wrap:anywhere}
.ppw-modal-surface textarea{resize:vertical;white-space:pre-wrap}
.ppw-modal-surface button{box-sizing:border-box;min-block-size:var(--ke-touch-target,44px);padding:var(--ke-space-2,4px) var(--ke-space-3,8px);word-break:keep-all;overflow-wrap:anywhere}
.ppw-modal-surface input:focus-visible,.ppw-modal-surface select:focus-visible,.ppw-modal-surface textarea:focus-visible,.ppw-modal-surface button:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}
.ppw-preview-shell{
  display:flex;
  flex-direction:column;
  min-height:0;
  flex:1 1 auto;
  max-height:min(92vh, 1040px);
}
.ppw-preview-head{
  flex:0 0 auto;
  padding:18px 22px 14px;
  border-bottom:1px solid var(--background-modifier-border);
  background:var(--background-primary);
}
.ppw-preview-kicker{
  font-size:var(--ke-type-chrome,.68rem);
  line-height:var(--ke-leading-control,1.35);
  font-weight:700;
  color:var(--text-muted);
  letter-spacing:.06em;
  text-transform:uppercase;
  margin:0 0 8px;
}
.ppw-preview-title-row{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  padding-right:28px; /* room for Obsidian close */
}
.ppw-preview-title-main{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
  flex-wrap:wrap;
}
.ppw-preview-title{
  margin:0;
  font-size:var(--ke-type-title,1.05rem);
  font-weight:800;
  letter-spacing:0;
  line-height:var(--ke-leading-body,1.45);
  color:var(--text-normal);
  overflow-wrap:anywhere;
}
.ppw-preview-trash{margin-top:4px;font-size:1em}
.ppw-preview-meta{
  margin-top:8px;
  font-size:var(--ke-type-body,.84rem);
  font-weight:600;
  color:var(--text-normal);
  line-height:var(--ke-leading-body,1.45);
  overflow-wrap:anywhere;
}
.ppw-preview-meta.is-empty{
  font-weight:500;
  color:var(--text-faint);
  font-style:italic;
}
.ppw-preview-sub{
  margin-top:4px;
  font-size:var(--ke-type-label,.72rem);
  color:var(--text-muted);
  line-height:var(--ke-leading-body,1.45);
}
.ppw-preview-scroll{
  flex:1 1 auto;
  min-height:0;
  overflow:auto;
  padding:16px 22px 18px;
  -webkit-overflow-scrolling:touch;
  background:var(--background-primary);
}
.ppw-edit-group{margin:0 0 18px}
.ppw-edit-group:last-child{margin-bottom:4px}
.ppw-edit-group-title,
.ppw-edit-panel-title{
  font-size:var(--ke-type-label,.72rem);
  line-height:var(--ke-leading-control,1.35);
  font-weight:800;
  letter-spacing:.04em;
  text-transform:uppercase;
  color:var(--text-muted);
  margin:0 0 10px;
}
.ppw-edit-group-secondary{
  opacity:.96;
  padding-top:4px;
  border-top:1px dashed var(--background-modifier-border);
}
.ppw-edit-panel{
  margin:0 0 12px;
  padding:14px 16px;
  border-radius:10px;
  background:var(--background-secondary);
  border:1px solid var(--background-modifier-border);
}
.ppw-edit-panel:last-child{margin-bottom:0}
.ppw-edit-props{padding:14px 16px 16px}
.ppw-edit-field-full{margin-bottom:12px}
.ppw-edit-grid{
  display:grid;
  grid-template-columns:repeat(3, minmax(0, 1fr));
  gap:12px 14px;
}
.ppw-edit-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.ppw-rel-picker{display:flex;flex-direction:column;gap:6px}
.ppw-rel-hint{font-size:var(--ke-type-label,.72rem);color:var(--text-faint);line-height:var(--ke-leading-body,1.45)}
.ppw-rel-chips{display:flex;flex-wrap:wrap;gap:4px}
.ppw-rel-chip{
  display:inline-flex;align-items:center;justify-content:center;
  min-height:0;height:auto;padding:2px 9px;border-radius:999px;
  font-size:var(--ke-type-label,.72rem);font-weight:700;line-height:var(--ke-leading-control,1.35);letter-spacing:0;cursor:pointer;
  border:1px solid var(--background-modifier-border);
  background:var(--background-primary);color:var(--text-muted);
  -webkit-appearance:none;appearance:none;
}
.ppw-rel-chip:hover{background:var(--background-modifier-hover);color:var(--text-normal)}
.ppw-rel-chip.is-active{
  border-color:var(--interactive-accent) !important;
  background:color-mix(in srgb,var(--interactive-accent) 18%, var(--background-secondary)) !important;
  color:var(--text-normal) !important;
}
.ppw-rel-legacy{
  margin-top:2px;padding:6px 8px;border-radius:6px;
  background:color-mix(in srgb, var(--text-accent) 8%, var(--background-primary));
  border:1px dashed var(--background-modifier-border);
  font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45);
}
.ppw-rel-legacy-text{font-weight:700;color:var(--text-normal)}
.ppw-rel-legacy-hint{color:var(--text-muted)}
.ppw-edit-label,
.ppw-edit-section-label{
  display:block;
  font-size:var(--ke-type-label,.72rem);
  line-height:var(--ke-leading-control,1.35);
  font-weight:700;
  color:var(--text-muted);
  letter-spacing:0;
}
.ppw-edit-section-label{margin-bottom:8px;font-size:var(--ke-type-body,.84rem);color:var(--text-normal)}
.ppw-edit-input,
.ppw-edit-textarea{
  width:100%;
  box-sizing:border-box;
  padding:9px 11px;
  border-radius:6px;
  border:1px solid var(--background-modifier-border);
  background:var(--background-primary);
  color:var(--text-normal);
  font-family:var(--font-text, var(--font-interface, inherit));
  font-size:var(--ke-type-body,.84rem);
  line-height:var(--ke-leading-body,1.45);
  transition:border-color var(--ke-motion-fast,150ms) ease, box-shadow var(--ke-motion-fast,150ms) ease;
}
.ppw-edit-input{min-height:2.4em}
.ppw-edit-textarea{
  resize:vertical;
  min-height:5.2em;
  white-space:pre-wrap;
  word-break:break-word;
}
.ppw-edit-textarea-lead{min-height:7.5em;font-size:.98em;line-height:1.6}
.ppw-edit-input:focus,
.ppw-edit-textarea:focus{
  outline:none;
  border-color:var(--interactive-accent);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--interactive-accent) 22%, transparent);
}
.ppw-edit-input::placeholder,
.ppw-edit-textarea::placeholder{color:var(--text-faint);opacity:.9}
.ppw-preview-footer{
  flex:0 0 auto;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px 14px;
  flex-wrap:wrap;
  padding:10px 16px 12px;
  border-top:1px solid var(--background-modifier-border);
  background:var(--background-secondary);
}
.ppw-preview-footer-left,
.ppw-preview-footer-right{
  display:flex;
  gap:4px;
  flex-wrap:wrap;
  align-items:center;
}
.ppw-preview-footer-mid{flex:1 1 auto;min-width:4em;text-align:center}
.ppw-edit-status{
  font-size:var(--ke-type-label,.72rem);
  color:var(--text-muted);
  min-height:1.1em;
  line-height:var(--ke-leading-control,1.35);
}
.ppw-preview-footer .prodigy-btn,
.ppw-preview-footer button{
  min-block-size:32px;
  height:auto;
}

/* Tablet */
@media (max-width: 900px){
  .modal.ppw-modal{
    width:min(100%, calc(100vw - 24px)) !important;
    max-width:calc(100vw - 24px) !important;
  }
  .ppw-edit-grid{grid-template-columns:repeat(2, minmax(0, 1fr))}
  .ppw-preview-head{padding:14px 16px 12px}
  .ppw-preview-scroll{padding:12px 14px 14px}
}

/* Compact: canonical narrow workspace tier */
@media (max-width: ${compactMax}px){
  .prodigy-people-workspace{padding:4px 4px 32px}
  .ppw-header{flex-direction:column;align-items:stretch}
  .ppw-master-detail{display:block}
  .ppw-detail-pane{border-inline-start:0;padding-inline-start:0}
  .ppw-detail-back{display:inline-flex}
  .ppw-filter,.ppw-ctx-type,.ppw-context-toggle,.ppw-detail-back,.ppw-detail-context .ppw-context-item,.ppw-rel-chip,.ppw-memo-del,.ppw-undo-btn,.ppw-trash{min-block-size:${touchTarget}px}
  .ppw-actions{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,4px)}
  .ppw-actions button{min-block-size:${touchTarget}px;width:auto;word-break:keep-all;overflow-wrap:anywhere}
  .ppw-detail-actions{position:sticky;inset-block-end:0;min-block-size:${actionBarHeight}px;align-items:center;padding-block:var(--ke-space-1,2px);background:var(--ke-color-surface,var(--background-primary));border-top:1px solid var(--ke-color-border,var(--background-modifier-border))}

  .modal.ppw-modal{
    width:calc(100vw - 10px) !important;
    max-width:calc(100vw - 10px) !important;
    max-height:min(94vh, 100%) !important;
    border-radius:10px !important;
  }
  .modal.ppw-modal .modal-close-button{min-block-size:${touchTarget}px;min-inline-size:${touchTarget}px}
  .ppw-preview-shell{max-height:min(94vh, 100%)}
  .ppw-preview-head{padding:12px 12px 10px}
  .ppw-preview-title{font-size:var(--ke-type-title,1.05rem)}
  .ppw-preview-title-row{padding-right:22px;gap:8px}
  .ppw-preview-meta{font-size:var(--ke-type-body,.84rem)}
  .ppw-preview-scroll{padding:10px 10px 12px}
  .ppw-edit-grid{grid-template-columns:1fr;gap:10px}
  .ppw-edit-panel{padding:10px 11px;margin-bottom:10px;border-radius:8px}
  .ppw-edit-input,
  .ppw-edit-textarea{font-size:.92em;padding:var(--ke-space-2,4px) var(--ke-space-3,8px);border-radius:var(--ke-radius-control,4px);min-block-size:${touchTarget}px}
  .ppw-edit-textarea{min-height:4.6em}
  .ppw-edit-textarea-lead{min-height:6em}
  .ppw-preview-footer{
    padding:var(--ke-space-2,4px) var(--ke-space-3,8px) var(--ke-space-3,8px);
    gap:var(--ke-space-2,4px);
    align-items:stretch;
  }
  .ppw-preview-footer-mid{order:3;width:100%;text-align:left;min-width:0}
  .ppw-preview-footer-left,
  .ppw-preview-footer-right{
    flex:1 1 auto;
  }
  .ppw-preview-footer .prodigy-btn,
  .ppw-preview-footer button{
    min-block-size:${touchTarget}px !important;
    padding:var(--ke-space-1,2px) var(--ke-space-3,8px) !important;
    font-size:var(--ke-type-label,.72rem) !important;
    line-height:var(--ke-leading-control,1.35) !important;
  }
}
@media(prefers-reduced-motion:reduce){
  .prodigy-people-workspace *,.modal.ppw-modal *{transition:none!important;animation:none!important;scroll-behavior:auto!important}
}

@media (min-width: ${wideMin}px){
  .ppw-master-detail[data-pane-mode="two-pane"]>.ppw-list-pane,
  .ppw-master-detail[data-pane-mode="two-pane"]>.ppw-detail-pane{display:block}
}
`;
  }

  root.PeopleStyles = Object.freeze({ WORKSPACE_STYLE_ID, responsiveContract, ensureWorkspaceStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.PeopleStyles;
})(typeof globalThis !== "undefined" ? globalThis : this);
