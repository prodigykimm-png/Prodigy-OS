(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-ai-inspector-shell-styles";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `.prodigy-ai-inspector{position:fixed;z-index:900;display:grid;grid-template-rows:auto minmax(0,1fr);min-inline-size:0;max-block-size:min(70vh, 560px);inset:auto 0 0;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px) var(--ke-radius-panel,8px) 0 0;background:var(--background-primary);color:var(--text-normal)}.prodigy-ai-inspector[hidden]{display:none}.prodigy-ai-inspector-header{display:flex;align-items:center;justify-content:space-between;gap:var(--ke-space-3,8px);min-block-size:44px;padding-inline:var(--ke-space-3,8px);border-bottom:1px solid var(--background-modifier-border)}.prodigy-ai-inspector-title{margin:0;font-size:var(--ke-type-title,1.05rem);word-break:keep-all;overflow-wrap:anywhere}.prodigy-ai-inspector-close{min-block-size:44px}.prodigy-ai-inspector-close:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}.prodigy-ai-inspector-body{min-block-size:0;min-inline-size:0;overflow:auto}@media(min-width:768px){.prodigy-ai-inspector{inset:0 0 0 auto;inline-size:min(38%, 420px);max-block-size:none;border-radius:0}}@media(prefers-reduced-motion:reduce){.prodigy-ai-inspector *{transition:none!important;animation:none!important;transform:none!important}}`;
  }

  function AIInspector(parent, options) {
    ensureStyles();
    const opts = options || {};
    const inspector = parent.createEl("aside", { attr: { class: "prodigy-ai-inspector", role: "complementary", "aria-label": opts.label || "AI 인스펙터", hidden: "" } });
    inspector.hidden = true;
    const header = inspector.createEl("header", { attr: { class: "prodigy-ai-inspector-header" } });
    header.createEl("h2", { text: opts.title || "AI 인스펙터", attr: { class: "prodigy-ai-inspector-title" } });
    const closeButton = header.createEl("button", { text: "닫기", attr: { type: "button", class: "prodigy-btn prodigy-ai-inspector-close" } });
    const body = inspector.createEl("div", { attr: { class: "prodigy-ai-inspector-body" } });
    function open() {
      inspector.hidden = false;
      if (typeof inspector.removeAttribute === "function") inspector.removeAttribute("hidden");
      if (typeof closeButton.focus === "function") closeButton.focus();
    }
    function close() {
      inspector.hidden = true;
      if (typeof inspector.setAttribute === "function") inspector.setAttribute("hidden", "");
      if (typeof opts.onClose === "function") opts.onClose();
    }
    closeButton.onclick = close;
    return { element: inspector, body, open, close, isOpen: function () { return !inspector.hidden; } };
  }

  const api = Object.freeze({ AIInspector });
  root.ProdigyAIInspector = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
