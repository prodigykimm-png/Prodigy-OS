/**
 * People Workspace CSS — extracted from people-view.js (P2-1)
 * 로드 순서: people-view.js 전에 로드.
 */
(function (root) {
  "use strict";

  const WORKSPACE_STYLE_ID = "prodigy-people-workspace-styles";

  function ensureWorkspaceStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(WORKSPACE_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = WORKSPACE_STYLE_ID;
      document.head.appendChild(style);
    }
    // Always refresh so modal CSS updates after script reload
    style.textContent = `
.prodigy-people-workspace{max-width:980px;margin:0 auto;padding:8px 8px 24px}
.ppw-header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:4px 0 16px;border-bottom:1px solid var(--background-modifier-border);flex-wrap:wrap}
.ppw-header h1{margin:0;font-size:1.45em}
.ppw-header p{margin:6px 0 0;color:var(--text-muted);font-size:.84em;line-height:1.45;max-width:36em}
.ppw-toolbar{display:flex;flex-direction:column;gap:10px;padding:14px 0 8px}
.ppw-toolbar-row{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}
.ppw-toolbar-label{
  flex:0 0 auto;margin-top:6px;font-size:.72em;font-weight:800;
  color:var(--text-muted);letter-spacing:.03em;min-width:2.2em;
}
.ppw-search{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border-radius:8px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);font-size:.95em}
.ppw-filters{display:flex;flex-wrap:wrap;gap:4px;flex:1 1 auto;min-width:0}
.ppw-filter{
  min-height:0;height:auto;padding:3px 10px;border-radius:999px;
  border:1px solid var(--background-modifier-border);background:var(--background-secondary);
  color:var(--text-muted);font-size:.74em;font-weight:700;cursor:pointer;line-height:1.35;
  -webkit-appearance:none;appearance:none;
}
.ppw-filter:hover{background:var(--background-modifier-hover);color:var(--text-normal)}
.ppw-filter.is-active{background:var(--interactive-accent);color:var(--text-on-accent);border-color:var(--interactive-accent)}
.ppw-sorts .ppw-sort{min-width:4.5em}
.ppw-count{font-size:.78em;color:var(--text-muted)}
.ppw-list{display:flex;flex-direction:column;gap:10px;padding:8px 0 4px}
.ppw-card{border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.ppw-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ppw-name-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.ppw-name{margin:0;font-size:1.05em;font-weight:800;color:var(--text-accent);cursor:pointer;border-bottom:1px solid transparent}
.ppw-name:hover{border-bottom-color:var(--text-accent)}
.ppw-trash{cursor:pointer;opacity:0.4;font-size:0.9em;transition:opacity 0.2s;flex-shrink:0;line-height:1;user-select:none}
.ppw-trash:hover{opacity:1}
.ppw-badge{font-size:.7em;font-weight:700;color:var(--text-muted);border:1px solid var(--background-modifier-border);border-radius:4px;padding:2px 6px}
.ppw-meta{font-size:.84em;color:var(--text-normal);line-height:1.4;overflow-wrap:anywhere}
.ppw-sub{font-size:.78em;color:var(--text-muted);line-height:1.4}
.ppw-memo{
  margin-top:2px;padding:8px 10px;border-radius:8px;
  background:var(--background-primary);
  border:1px solid var(--background-modifier-border);
}
.ppw-memo-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px}
.ppw-memo-title{font-size:.72em;font-weight:800;color:var(--text-muted);letter-spacing:.02em}
.ppw-memo-more{font-size:.7em;font-weight:700;color:var(--text-faint)}
.ppw-memo-list{display:flex;flex-direction:column;gap:2px}
.ppw-memo-row{
  display:flex;align-items:flex-start;gap:6px;
  min-width:0;
}
.ppw-memo-line{
  flex:1 1 auto;min-width:0;
  font-size:.88em;line-height:1.45;color:var(--text-normal);
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
  font-size:.74em;font-weight:600;color:var(--text-accent);line-height:1.35;
}
.ppw-classify-hint{color:var(--text-muted);font-weight:500}
.ppw-card-flash{
  box-shadow:0 0 0 2px color-mix(in srgb, var(--interactive-accent) 55%, transparent);
  transition:box-shadow .3s ease;
}
.ppw-context-types{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 6px}
.ppw-ctx-type{
  min-height:0;padding:1px 7px;border-radius:999px;font-size:.68em;font-weight:700;
  border:1px solid var(--background-modifier-border);background:var(--background-primary);
  color:var(--text-muted);cursor:pointer;line-height:1.3;-webkit-appearance:none;appearance:none;
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
.ppw-edit-line-text{flex:1 1 auto;font-size:.9em;line-height:1.45;overflow-wrap:anywhere}
.ppw-edit-line-empty{font-size:.82em;color:var(--text-faint);padding:4px 0}
.ppw-edit-line-add{display:flex;gap:6px;align-items:center}
.ppw-edit-line-add .ppw-edit-input{flex:1 1 auto}
.ppw-undo-toast{
  position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:10000;
  display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;
  background:var(--background-secondary);border:1px solid var(--background-modifier-border);
  box-shadow:0 8px 28px color-mix(in srgb, #000 25%, transparent);
  font-size:.86em;color:var(--text-normal);max-width:min(92vw,420px);
}
.ppw-undo-btn{
  flex:0 0 auto;padding:2px 10px;border-radius:6px;font-size:.82em;font-weight:700;cursor:pointer;
  border:1px solid var(--interactive-accent);background:var(--interactive-accent);color:var(--text-on-accent);
  -webkit-appearance:none;appearance:none;
}
.ppw-context{margin-top:2px;padding-top:8px;border-top:1px solid var(--background-modifier-border)}
.ppw-context-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}
.ppw-context-title{font-size:.72em;font-weight:700;color:var(--text-muted);letter-spacing:.02em}
.ppw-context-count{font-size:.7em;font-weight:600;color:var(--text-faint)}
.ppw-context-item{display:flex;flex-direction:column;gap:1px;padding:4px 0;cursor:pointer;border-radius:4px}
.ppw-context-item:hover{background:var(--background-modifier-hover)}
.ppw-context-item strong{font-size:.86em;overflow-wrap:anywhere}
.ppw-context-item span{font-size:.74em;color:var(--text-muted)}
.ppw-context-more{margin-top:2px;padding-top:4px;border-top:1px dashed var(--background-modifier-border)}
.ppw-context-toggle{
  display:inline-flex;align-items:center;justify-content:center;
  margin-top:4px;padding:1px 8px;min-height:0;height:auto;
  border-radius:999px;border:1px solid var(--background-modifier-border);
  background:var(--background-primary);color:var(--text-muted);
  font-size:.72em;font-weight:700;line-height:1.35;cursor:pointer;
  -webkit-appearance:none;appearance:none;
}
.ppw-context-toggle:hover{background:var(--background-modifier-hover);color:var(--text-normal)}
.ppw-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.ppw-actions button{min-height:0}
.ppw-related-empty,.ppw-empty{padding:18px 4px;color:var(--text-muted);font-size:.88em;line-height:1.5}
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
  box-shadow:0 12px 40px color-mix(in srgb, var(--background-modifier-box-shadow, #000) 28%, transparent);
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
  font-size:.7em;
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
  font-size:1.55em;
  font-weight:800;
  letter-spacing:-0.02em;
  line-height:1.2;
  color:var(--text-normal);
  overflow-wrap:anywhere;
}
.ppw-preview-trash{margin-top:4px;font-size:1em}
.ppw-preview-meta{
  margin-top:8px;
  font-size:.92em;
  font-weight:600;
  color:var(--text-normal);
  line-height:1.45;
  overflow-wrap:anywhere;
}
.ppw-preview-meta.is-empty{
  font-weight:500;
  color:var(--text-faint);
  font-style:italic;
}
.ppw-preview-sub{
  margin-top:4px;
  font-size:.8em;
  color:var(--text-muted);
  line-height:1.4;
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
  font-size:.72em;
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
.ppw-rel-hint{font-size:.74em;color:var(--text-faint);line-height:1.4}
.ppw-rel-chips{display:flex;flex-wrap:wrap;gap:4px}
.ppw-rel-chip{
  display:inline-flex;align-items:center;justify-content:center;
  min-height:0;height:auto;padding:2px 9px;border-radius:999px;
  font-size:.74em;font-weight:700;line-height:1.35;cursor:pointer;
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
  font-size:.76em;line-height:1.4;
}
.ppw-rel-legacy-text{font-weight:700;color:var(--text-normal)}
.ppw-rel-legacy-hint{color:var(--text-muted)}
.ppw-edit-label,
.ppw-edit-section-label{
  display:block;
  font-size:.78em;
  font-weight:700;
  color:var(--text-muted);
  letter-spacing:.01em;
}
.ppw-edit-section-label{margin-bottom:8px;font-size:.82em;color:var(--text-normal)}
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
  font-size:.95em;
  line-height:1.55;
  transition:border-color .12s ease, box-shadow .12s ease;
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
  font-size:.75em;
  color:var(--text-muted);
  min-height:1.1em;
  line-height:1.3;
}
.ppw-preview-footer .prodigy-btn,
.ppw-preview-footer button{
  min-height:0 !important;
  height:auto !important;
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

/* Mobile: narrow to viewport, denser but readable */
@media (max-width: 600px){
  .prodigy-people-workspace{padding:4px 4px 32px}
  .ppw-header{flex-direction:column;align-items:stretch}
  .ppw-filter{min-height:32px}
  .ppw-actions{display:flex;flex-wrap:wrap;gap:3px}
  .ppw-actions button{min-height:0;width:auto}

  .modal.ppw-modal{
    width:calc(100vw - 10px) !important;
    max-width:calc(100vw - 10px) !important;
    max-height:min(94vh, 100%) !important;
    border-radius:10px !important;
  }
  .ppw-preview-shell{max-height:min(94vh, 100%)}
  .ppw-preview-head{padding:12px 12px 10px}
  .ppw-preview-title{font-size:1.28em}
  .ppw-preview-title-row{padding-right:22px;gap:8px}
  .ppw-preview-meta{font-size:.86em}
  .ppw-preview-scroll{padding:10px 10px 12px}
  .ppw-edit-grid{grid-template-columns:1fr;gap:10px}
  .ppw-edit-panel{padding:10px 11px;margin-bottom:10px;border-radius:8px}
  .ppw-edit-input,
  .ppw-edit-textarea{font-size:.92em;padding:8px 9px;border-radius:5px}
  .ppw-edit-textarea{min-height:4.6em}
  .ppw-edit-textarea-lead{min-height:6em}
  .ppw-preview-footer{
    padding:8px 10px 10px;
    gap:8px;
    align-items:stretch;
  }
  .ppw-preview-footer-mid{order:3;width:100%;text-align:left;min-width:0}
  .ppw-preview-footer-left,
  .ppw-preview-footer-right{
    flex:1 1 auto;
  }
  .ppw-preview-footer .prodigy-btn,
  .ppw-preview-footer button{
    padding:1px 7px !important;
    font-size:.72em !important;
  }
}
`;
  }

  root.PeopleStyles = Object.freeze({ WORKSPACE_STYLE_ID, ensureWorkspaceStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.PeopleStyles;
})(typeof globalThis !== "undefined" ? globalThis : this);
