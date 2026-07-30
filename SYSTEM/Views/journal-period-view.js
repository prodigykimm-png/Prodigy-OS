(function (root) {
  "use strict";

  var STYLE_ID = "prodigy-journal-period-styles";

  function dependencies() {
    var tokens = root.ProdigyTokens;
    var controls = root.ProdigyAdaptiveControls;
    if (typeof require === "function") {
      if (!tokens) tokens = require("./design-tokens.js");
      if (!controls) controls = require("./prodigy-adaptive-controls.js");
    }
    if (!tokens || !tokens.BREAKPOINTS || !tokens.CONTROL_HEIGHTS || !controls || typeof controls.AdaptiveTabs !== "function") {
      throw new Error("저널 반응형 컨트롤을 불러오지 못했습니다.");
    }
    return { tokens: tokens, controls: controls };
  }

  function layoutForWidth(width, breakpoints) {
    var value = Number(width);
    if (Number.isFinite(value) && value < breakpoints.medium) return "compact";
    if (Number.isFinite(value) && value < breakpoints.wide) return "medium";
    return "wide";
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var responsive = dependencies().tokens;
    var breakpoints = responsive.BREAKPOINTS;
    var heights = responsive.CONTROL_HEIGHTS;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `.journal-period-tabs{min-inline-size:0;margin:0 0 var(--ke-space-4,12px);border-bottom:1px solid var(--background-modifier-border)}.journal-period-tabs[data-layout="compact"]{position:sticky;inset-block-start:0;z-index:19;background:var(--background-primary)}.journal-period-tabs[data-layout="compact"] .prodigy-adaptive-tabs{inline-size:100%;overflow-x:auto;scroll-snap-type:x proximity;padding-block:var(--ke-space-2,4px)}.journal-period-tabs[data-layout="compact"] .prodigy-adaptive-tab{min-block-size:${heights.touchTarget}px;padding-inline:var(--ke-space-4,12px);scroll-snap-align:start}.journal-period-tabs[data-layout="wide"] .prodigy-adaptive-tabs{overflow-x:visible}.journal-period-tabs[data-layout="wide"] .prodigy-adaptive-tab{flex:1 1 0}.journal-period-content,.journal-period-panel{min-inline-size:0}.journal-period-readiness{display:grid;gap:var(--ke-space-3,8px);padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary)}.journal-period-readiness h2{margin:0;font-size:var(--ke-type-title,1.05rem)}.journal-period-readiness p{margin:0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}.journal-period-readiness ul{display:grid;gap:var(--ke-space-2,4px);margin:0;padding-inline-start:1.2em;font-size:var(--ke-type-body,.84rem)}@media(max-width:${breakpoints.medium - 1}px){.journal-period-readiness{padding:var(--ke-space-4,12px)}}`;
  }

  function countByPrefix(files, folder, prefix) {
    return files.filter(function (file) { return file.path.indexOf(folder + "/" + prefix) === 0; }).length;
  }

  function collectCounts(app) {
    var files = app && app.vault && typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
    var now = new Date();
    var core = root.JournalPeriodCore;
    var month = core.monthPrefix(now);
    var quarter = core.quarterPrefix(now);
    var year = core.yearPrefix(now);
    return {
      daily: countByPrefix(files, "DAILY/DAILY", month),
      weekly: countByPrefix(files, "DAILY/WEEKLY", year),
      monthly: countByPrefix(files, "DAILY/MONTHLY", year),
      quarterly: countByPrefix(files, "DAILY/QUARTERLY", year),
      directions: countByPrefix(files, "DAILY/QUARTERLY", quarter),
      principles: 0,
      year: year
    };
  }

  function renderReadiness(container, periodId, app) {
    var core = root.JournalPeriodCore;
    var model = core.readiness(periodId, collectCounts(app));
    var panel = container.createEl("section", { attr: { class: "journal-period-readiness", "aria-label": model.period.label + " 준비 상태" } });
    panel.createEl("h2", { text: model.period.label + " Review" });
    panel.createEl("p", { text: model.period.question });
    panel.createEl("p", { text: model.message });
    var list = panel.createEl("ul");
    model.inputs.forEach(function (input) { list.createEl("li", { text: input }); });
  }

  function mount(options) {
    var opts = options || {};
    var app = opts.app;
    var container = opts.container;
    if (!app || !container || !root.JournalPeriodCore) throw new Error("Journal Period View를 초기화할 수 없습니다.");
    var shared = dependencies();
    var breakpoints = shared.tokens.BREAKPOINTS;
    ensureStyles();
    var selected = "daily";
    var width = Number.isFinite(Number(opts.logicalWidth)) ? Number(opts.logicalWidth) : Number(container.clientWidth) || breakpoints.wide;
    var tabs = container.createEl("nav", { attr: { class: "journal-period-tabs", "aria-label": "저널 기간 선택" } });
    var content = container.createEl("div", { attr: { class: "journal-period-content" } });
    var panels = {};
    root.JournalPeriodCore.PERIODS.forEach(function (period) {
      panels[period.id] = content.createEl("section", { attr: { class: "journal-period-panel" } });
    });

    function render() {
      var panel = panels[selected];
      panel.empty();
      if (selected === "daily") return opts.renderDaily(panel);
      if (selected === "weekly") return opts.renderWeekly(panel);
      if (selected === "monthly" && root.MonthlyValidationView) return root.MonthlyValidationView.mount({ app: app, container: panel });
      return renderReadiness(panel, selected, app);
    }

    function applyWidth(nextWidth) {
      var numeric = Number(nextWidth);
      if (Number.isFinite(numeric)) width = numeric;
      tabs.setAttribute("data-layout", layoutForWidth(width, breakpoints));
      return width;
    }

    var adaptive = shared.controls.AdaptiveTabs(tabs, {
      label: "저널 기간 선택",
      activeId: selected,
      tabs: root.JournalPeriodCore.PERIODS.map(function (period) {
        return { id: period.id, label: period.label, panel: panels[period.id] };
      }),
      onChange: function (id) { selected = id; return render(); }
    });
    applyWidth(width);
    render();
    var observer = null;
    if (!Number.isFinite(Number(opts.logicalWidth)) && typeof root.ResizeObserver === "function") {
      observer = new root.ResizeObserver(function (entries) {
        var entry = entries && entries[0];
        if (entry && entry.contentRect) applyWidth(entry.contentRect.width);
      });
      observer.observe(container);
    }
    return Object.freeze({
      select: function (id) { return adaptive.select(root.JournalPeriodCore.getPeriod(id).id, true); },
      setLogicalWidth: applyWidth,
      getSelected: function () { return selected; },
      destroy: function () { if (observer) observer.disconnect(); }
    });
  }

  var api = Object.freeze({ ensureStyles: ensureStyles, collectCounts: collectCounts, mount: mount });
  root.JournalPeriodView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
