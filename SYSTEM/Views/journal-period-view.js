(function (root) {
  "use strict";

  var STYLE_ID = "prodigy-journal-period-styles";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = ".journal-period-tabs{display:flex;gap:var(--ke-space-2,4px);margin:0 0 var(--ke-space-4,12px);border-bottom:1px solid var(--background-modifier-border)}.journal-period-tab{min-height:32px;padding:0 var(--ke-space-3,8px);border:0;border-bottom:2px solid transparent;background:transparent;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);font-weight:700;cursor:pointer}.journal-period-tab[data-selected=\"true\"]{color:var(--text-accent);border-bottom-color:var(--text-accent)}.journal-period-tab:focus-visible{outline:2px solid var(--text-accent);outline-offset:-2px}.journal-period-content{min-inline-size:0}.journal-period-readiness{display:grid;gap:var(--ke-space-3,8px);padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary)}.journal-period-readiness h2{margin:0;font-size:var(--ke-type-title,1.05rem)}.journal-period-readiness p{margin:0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}.journal-period-readiness ul{display:grid;gap:var(--ke-space-2,4px);margin:0;padding-inline-start:1.2em;font-size:var(--ke-type-body,.84rem)}@media(max-width:600px){.journal-period-tabs{position:sticky;top:44px;z-index:19;overflow-x:auto;scroll-snap-type:x proximity;padding:var(--ke-space-2,4px) 0;background:var(--background-primary)}.journal-period-tab{flex:0 0 auto;min-height:var(--ke-touch-target,44px);padding-inline:var(--ke-space-4,12px);scroll-snap-align:start;font-size:var(--ke-type-body,.84rem)}.journal-period-readiness{padding:var(--ke-space-4,12px)}}";
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
    ensureStyles();
    var selected = "daily";
    var tabs = container.createEl("nav", { attr: { class: "journal-period-tabs", role: "tablist", "aria-label": "저널 기간 선택" } });
    var content = container.createEl("div", { attr: { class: "journal-period-content" } });
    var buttons = {};

    function render() {
      content.empty();
      Object.keys(buttons).forEach(function (id) { buttons[id].setAttribute("data-selected", String(id === selected)); });
      if (selected === "daily") return opts.renderDaily(content);
      if (selected === "weekly") return opts.renderWeekly(content);
      if (selected === "monthly" && root.MonthlyValidationView) return root.MonthlyValidationView.mount({ app: app, container: content });
      return renderReadiness(content, selected, app);
    }

    root.JournalPeriodCore.PERIODS.forEach(function (period) {
      var button = tabs.createEl("button", { text: period.label, attr: { type: "button", class: "journal-period-tab", role: "tab", "aria-label": period.label + " — " + period.question } });
      buttons[period.id] = button;
      button.onclick = function () { selected = period.id; render(); };
    });
    render();
    return Object.freeze({ select: function (id) { selected = root.JournalPeriodCore.getPeriod(id).id; return render(); } });
  }

  var api = Object.freeze({ ensureStyles: ensureStyles, collectCounts: collectCounts, mount: mount });
  root.JournalPeriodView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
