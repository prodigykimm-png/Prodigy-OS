(function (root) {
  "use strict";

  var STYLE_ID = "prodigy-workspace-navigation-styles";
  var HOME_PATH = "HUB/00 Home.md";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = ".prodigy-workspace-nav{display:flex;align-items:center;gap:var(--ke-space-2,4px);margin:0 0 var(--ke-space-3,8px);min-inline-size:0}.prodigy-workspace-nav-home{min-height:32px;padding:0 8px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);font-size:var(--ke-type-label,.72rem);font-weight:700;cursor:pointer}.prodigy-workspace-nav-home:hover{background:var(--background-modifier-hover)}.prodigy-workspace-nav-home:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}.prodigy-workspace-nav-title{min-inline-size:0;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);font-weight:700;overflow-wrap:anywhere}@media(max-width:600px){.prodigy-workspace-nav{position:sticky;top:0;z-index:20;padding:var(--ke-space-2,4px) 0;background:var(--background-primary);border-bottom:1px solid var(--background-modifier-border)}.prodigy-workspace-nav-home{min-height:var(--ke-touch-target,44px);padding:0 14px;font-size:var(--ke-type-body,.84rem)}}";
  }

  function openHome(app) {
    if (!app || !app.workspace || typeof app.workspace.openLinkText !== "function") return;
    app.workspace.openLinkText(HOME_PATH, HOME_PATH, false);
  }

  function mount(container, options) {
    if (!container || typeof container.createEl !== "function") return null;
    ensureStyles();
    var opts = options || {};
    var nav = container.createEl("nav", { attr: { class: "prodigy-workspace-nav", "aria-label": "워크스페이스 탐색" } });
    var home = nav.createEl("button", { text: "홈", attr: { type: "button", class: "prodigy-workspace-nav-home", "aria-label": "홈으로 돌아가기" } });
    home.onclick = function () { openHome(opts.app); };
    nav.createEl("span", { text: opts.title || "워크스페이스", attr: { class: "prodigy-workspace-nav-title" } });
    return nav;
  }

  var api = Object.freeze({ HOME_PATH: HOME_PATH, ensureStyles: ensureStyles, openHome: openHome, mount: mount });
  root.ProdigyWorkspaceNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
