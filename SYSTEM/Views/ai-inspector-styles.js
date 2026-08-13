(function (root) {
  "use strict";

  var STYLE_ID = "prodigy-ai-inspector-styles";
  var SHELL_STYLE_ID = "prodigy-ai-inspector-shell-styles";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      ".prodigy-ai-inspector-body{padding:var(--ke-space-3,8px);min-block-size:0;overflow:auto}",
      ".prodigy-ai-inspector-header{display:flex;align-items:center;justify-content:space-between;gap:var(--ke-space-3,8px);min-block-size:44px;padding-inline:var(--ke-space-3,8px);border-bottom:1px solid var(--background-modifier-border)}",
      ".prodigy-ai-inspector-title{margin:0;font-size:var(--ke-type-title,1.05rem);word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-close{min-block-size:44px}",
      ".prodigy-ai-inspector-close:focus-visible{outline:2px solid var(--ke-color-accent, var(--text-accent));outline-offset:2px}",
      ".prodigy-ai-inspector-transcript{min-block-size:0;overflow:auto;padding:var(--ke-space-3,8px)}",
      ".prodigy-ai-inspector-message{margin-block-end:var(--ke-space-3,8px);word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-message-role{font-size:var(--ke-type-label,.72rem);color:var(--text-muted);margin-block-end:var(--ke-space-1,2px)}",
      ".prodigy-ai-inspector-message-body{font-size:var(--ke-type-body,.84rem);line-height:1.5}",
      ".prodigy-ai-inspector-citations{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,4px);margin-block-start:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-citation{display:inline-flex;align-items:center;min-block-size:32px;padding-inline:var(--ke-space-2,4px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-secondary);color:var(--text-muted);font-size:var(--ke-type-label,.72rem);cursor:pointer}",
      ".prodigy-ai-inspector-citation:focus-visible{outline:2px solid var(--ke-color-accent, var(--text-accent));outline-offset:2px}",
      ".prodigy-ai-inspector-kind{display:inline-block;font-size:var(--ke-type-label,.72rem);padding-inline:var(--ke-space-2,4px);border-radius:var(--ke-radius-control,4px);margin-inline-end:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-kind-explain{background:var(--background-modifier-hover);color:var(--text-muted)}",
      ".prodigy-ai-inspector-kind-suggest{background:var(--background-modifier-hover);color:var(--ke-color-accent, var(--text-accent))}",
      ".prodigy-ai-inspector-kind-approve{background:var(--background-modifier-hover);color:var(--text-warning)}",
      ".prodigy-ai-inspector-input-area{display:grid;gap:var(--ke-space-2,4px);padding:var(--ke-space-3,8px);border-top:1px solid var(--background-modifier-border)}",
      ".prodigy-ai-inspector-input-row{display:flex;gap:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-input{flex:1;min-block-size:44px;min-inline-size:0;padding:var(--ke-space-2,4px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);font-size:var(--ke-type-body,.84rem);resize:none}",
      ".prodigy-ai-inspector-input:focus-visible{outline:2px solid var(--ke-color-accent, var(--text-accent));outline-offset:2px}",
      ".prodigy-ai-inspector-send{min-block-size:44px;min-inline-size:44px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}",
      ".prodigy-ai-inspector-send:focus-visible{outline:2px solid var(--ke-color-accent, var(--text-accent));outline-offset:2px}",
      ".prodigy-ai-inspector-send:disabled{opacity:0.5;cursor:not-allowed}",
      ".prodigy-ai-inspector-prompts{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-prompt{min-block-size:32px;padding-inline:var(--ke-space-2,4px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-secondary);color:var(--text-muted);font-size:var(--ke-type-label,.72rem);cursor:pointer;word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-prompt:focus-visible{outline:2px solid var(--ke-color-accent, var(--text-accent));outline-offset:2px}",
      ".prodigy-ai-inspector-error{display:grid;gap:var(--ke-space-2,4px);padding:var(--ke-space-3,8px);margin:var(--ke-space-3,8px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary);color:var(--text-normal);word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-error-title{color:var(--text-error);font-size:var(--ke-type-title,1.05rem);margin:0}",
      ".prodigy-ai-inspector-error-message{font-size:var(--ke-type-body,.84rem);margin:0}",
      ".prodigy-ai-inspector-error-dismiss{justify-self:start;min-block-size:32px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);cursor:pointer}",
      ".prodigy-ai-inspector-loading{display:flex;align-items:center;justify-content:center;padding:var(--ke-space-4,12px);color:var(--text-muted);font-size:var(--ke-type-body,.84rem)}",
      ".prodigy-ai-inspector-empty{display:flex;align-items:center;justify-content:center;padding:var(--ke-space-4,12px);color:var(--text-muted);font-size:var(--ke-type-body,.84rem)}",
      "@media(max-width:767px){",
      ".prodigy-ai-inspector-prompt{min-block-size:44px}",
      ".prodigy-ai-inspector-citation{min-block-size:44px}",
      "}",
      "@media(prefers-reduced-motion:reduce){",
      ".prodigy-ai-inspector-body *{transition:none!important;animation:none!important}",
      "}"
    ].join("\n");
  }

  function ensureShellStyles() {
    if (typeof document === "undefined") return;
    var style = document.getElementById(SHELL_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = SHELL_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      ".prodigy-ai-inspector{position:fixed;z-index:900;display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-inline-size:0;max-block-size:min(70vh, 560px);inset:auto 0 0;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px) var(--ke-radius-panel,8px) 0 0;background:var(--background-primary);color:var(--text-normal)}",
      ".prodigy-ai-inspector[hidden]{display:none}",
      ".prodigy-ai-inspector-resize{display:none}",
      ".prodigy-ai-inspector-backdrop{display:none}",
      "@media(min-width:768px){",
      ".prodigy-ai-inspector{inset:0 0 0 auto;inline-size:min(38%,420px);max-block-size:none;border-radius:0;border-left:1px solid var(--background-modifier-border)}",
      ".prodigy-ai-inspector-resize{display:block;position:absolute;inset:0 auto 0 -3px;inline-size:6px;cursor:col-resize;z-index:1}",
      ".prodigy-ai-inspector-resize:hover{background:var(--ke-color-accent, var(--text-accent));opacity:0.3}",
      "}",
      "@media(prefers-reduced-motion:reduce){",
      ".prodigy-ai-inspector *{transition:none!important;animation:none!important;transform:none!important}",
      "}"
    ].join("\n");
  }

  var api = Object.freeze({ ensureStyles: ensureStyles, ensureShellStyles: ensureShellStyles });
  root.ProdigyAIInspectorStyles = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
