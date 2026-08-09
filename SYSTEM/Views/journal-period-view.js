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
    var shared = dependencies();
    var breakpoints = shared.tokens.BREAKPOINTS;
    var heights = shared.tokens.CONTROL_HEIGHTS;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      ".journal-period-tabs{min-inline-size:0;margin:0 0 var(--ke-space-4,12px);border-bottom:1px solid var(--background-modifier-border)}",
      ".journal-period-tabs[data-layout=compact]{position:sticky;inset-block-start:0;z-index:19;background:var(--background-primary)}",
      ".journal-period-tabs[data-layout=compact] .prodigy-adaptive-tabs{inline-size:100%;overflow-x:auto;scroll-snap-type:x proximity;padding-block:var(--ke-space-2,4px)}",
      ".journal-period-tabs[data-layout=compact] .prodigy-adaptive-tab{min-block-size:" + heights.touchTarget + "px;padding-inline:var(--ke-space-4,12px);scroll-snap-align:start}",
      ".journal-period-tabs[data-layout=wide] .prodigy-adaptive-tabs{overflow-x:visible}",
      ".journal-period-tabs[data-layout=wide] .prodigy-adaptive-tab{flex:1 1 0}",
      ".journal-period-content,.journal-period-panel{min-inline-size:0}",
      ".journal-period-review{display:grid;gap:var(--ke-space-4,12px);min-inline-size:0}",
      ".journal-period-navigation{display:flex;align-items:center;gap:var(--ke-space-2,4px);flex-wrap:wrap;min-inline-size:0}",
      ".journal-period-navigation button,.journal-period-navigation input{min-block-size:" + heights.touchTarget + "px;box-sizing:border-box}",
      ".journal-period-navigation input{min-inline-size:9rem;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);padding-inline:var(--ke-space-3,8px);background:var(--background-primary);color:var(--text-normal);font:inherit;line-height:var(--ke-leading-control,1.35)}",
      ".journal-period-label{font-size:var(--ke-type-title,1.05rem);font-weight:700;min-inline-size:8rem}",
      ".journal-period-status{margin:0;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);line-height:var(--ke-leading-body,1.45)}",
      ".journal-period-record{display:grid;gap:var(--ke-space-3,8px);padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary);min-inline-size:0}",
      ".journal-period-record h2,.journal-period-history h2{margin:0;font-size:var(--ke-type-heading,.92rem);line-height:var(--ke-leading-body,1.45)}",
      ".journal-period-record-meta{margin:0;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);word-break:keep-all;overflow-wrap:anywhere}",
      ".journal-period-record-content{margin:0;max-inline-size:100%;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:var(--ke-leading-body,1.45);color:var(--text-normal)}",
      ".journal-period-history{display:grid;gap:var(--ke-space-3,8px);padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary);min-inline-size:0}",
      ".journal-period-history-list{display:grid;gap:var(--ke-space-2,4px);min-inline-size:0}",
      ".journal-period-history-row{display:flex;align-items:center;justify-content:space-between;gap:var(--ke-space-3,8px);padding-block:var(--ke-space-2,4px);border-top:1px solid var(--background-modifier-border);min-inline-size:0}",
      ".journal-period-history-row:first-child{border-top:0}",
      ".journal-period-history-row button{min-inline-size:0;word-break:keep-all;overflow-wrap:anywhere;text-align:start}",
      ".journal-period-history-current{color:var(--text-accent);font-size:var(--ke-type-label,.72rem);white-space:nowrap}",
      ".journal-period-empty{margin:0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}",
      ".journal-period-review button:focus-visible,.journal-period-review input:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}",
      "@media(max-width:" + (breakpoints.medium - 1) + "px){.journal-period-navigation{align-items:stretch}.journal-period-navigation button,.journal-period-navigation input{flex:1 1 8rem}.journal-period-label{flex:1 1 100%;min-block-size:var(--ke-touch-target,44px);display:flex;align-items:center}.journal-period-record,.journal-period-history{padding:var(--ke-space-4,12px)}.journal-period-history-row{align-items:flex-start;flex-wrap:wrap}.journal-period-history-current{margin-inline-start:auto}}"
    ].join("");
  }

  function countByPrefix(files, folder, prefix) {
    return files.filter(function (file) { return file.path.indexOf(folder + "/" + prefix) === 0; }).length;
  }

  function countByDateRange(files, folder, bounds) {
    return files.filter(function (file) {
      if (file.path.indexOf(folder + "/") !== 0) return false;
      var name = file.name || file.path.split("/").pop();
      var date = name.replace(/\.md$/i, "");
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= bounds.start && date <= bounds.end;
    }).length;
  }

  function collectCounts(app, periodId, key) {
    var files = app && app.vault && typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
    var core = root.JournalPeriodCore;
    var now = new Date();
    var month = core.monthPrefix(now);
    var quarter = core.quarterPrefix(now);
    var year = core.yearPrefix(now);
    if (periodId && periodId !== "daily" && periodId !== "weekly") {
      var id = core.getPeriod(periodId).id;
      var selectedKey = core.periodKey(id, key || now);
      var bounds = core.periodBounds(id, selectedKey);
      return {
        daily: countByDateRange(files, "DAILY/DAILY", bounds),
        weekly: countByPrefix(files, "DAILY/WEEKLY", bounds.start.slice(0, 4)),
        monthly: countByPrefix(files, "DAILY/MONTHLY", id === "monthly" ? selectedKey : bounds.start.slice(0, 4)),
        quarterly: countByPrefix(files, "DAILY/QUARTERLY", id === "quarterly" ? selectedKey : bounds.start.slice(0, 4)),
        directions: countByPrefix(files, "DAILY/QUARTERLY", id === "quarterly" ? selectedKey : bounds.start.slice(0, 4)),
        principles: 0,
        year: bounds.start.slice(0, 4)
      };
    }
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

  function renderReadiness(container, periodId, app, key) {
    var core = root.JournalPeriodCore;
    var model = core.readiness(periodId, collectCounts(app, periodId, key));
    var panel = container.createEl("section", { attr: { class: "journal-period-readiness", "aria-label": model.period.label + " 준비 상태" } });
    panel.createEl("h2", { text: model.period.label + " Review" });
    panel.createEl("p", { text: model.period.role || "" });
    panel.createEl("p", { text: model.period.question });
    panel.createEl("p", { text: model.message });
    var list = panel.createEl("ul");
    model.inputs.forEach(function (input) { list.createEl("li", { text: input }); });
  }

  function openPath(app, path) {
    if (!app || !app.workspace || !path) return;
    return app.workspace.openLinkText(String(path).replace(/\.md$/, ""), "", false);
  }

  function button(parent, text, label) {
    var control = parent.createEl("button", { text: text, attr: { type: "button", class: "prodigy-btn", "aria-label": label || text } });
    return control;
  }

  function renderRecord(container, record, app, onReview) {
    var panel = container.createEl("section", { attr: { class: "journal-period-record", "aria-label": record.display + " 기록" } });
    panel.createEl("h2", { text: record.display + " 기록" });
    panel.createEl("p", { text: record.title, attr: { class: "journal-period-record-meta" } });
    panel.createEl("p", { text: record.path, attr: { class: "journal-period-record-meta" } });
    panel.createEl("pre", { text: record.content, attr: { class: "journal-period-record-content" } });
    var actions = panel.createEl("div", { attr: { class: "prodigy-btn-row" } });
    var open = button(actions, "노트 열기");
    open.onclick = function () { return openPath(app, record.path); };
    if (typeof onReview === "function") {
      var review = button(actions, "검증 화면 열기");
      review.onclick = onReview;
    }
  }

  function renderHistory(container, records, selectedKey, onSelect) {
    var panel = container.createEl("section", { attr: { class: "journal-period-history", "aria-label": "저널 기록 목록" } });
    panel.createEl("h2", { text: "기록 목록" });
    if (!records.length) {
      panel.createEl("p", { text: "저장된 이전 기록이 없습니다.", attr: { class: "journal-period-empty" } });
      return;
    }
    var list = panel.createEl("div", { attr: { class: "journal-period-history-list" } });
    records.forEach(function (record) {
      var row = list.createEl("div", { attr: { class: "journal-period-history-row" } });
      var select = button(row, record.display + " · " + record.title, record.display + " 기록 열기");
      select.onclick = function () { return onSelect(record.key); };
      if (record.key === selectedKey) row.createEl("span", { text: "현재 선택", attr: { class: "journal-period-history-current" } });
    });
  }

  function renderNavigation(container, periodId, selectedKey, onSelect) {
    var core = root.JournalPeriodCore;
    var period = core.getPeriod(periodId);
    var currentKey = core.periodKey(periodId, new Date());
    var navigation = container.createEl("div", { attr: { class: "journal-period-navigation", "aria-label": period.label + " 시점 이동" } });
    navigation.createEl("span", { text: core.periodDisplay(periodId, selectedKey), attr: { class: "journal-period-label" } });
    var previous = button(navigation, "이전 " + (periodId === "monthly" ? "달" : periodId === "quarterly" ? "분기" : "해"));
    previous.onclick = function () { return onSelect(core.shiftPeriod(periodId, selectedKey, -1)); };
    var input = navigation.createEl("input", { attr: { type: periodId === "yearly" ? "number" : "month", value: core.periodInputValue(periodId, selectedKey), min: periodId === "yearly" ? "1900" : undefined, step: periodId === "yearly" ? "1" : undefined, "aria-label": period.label + " 기준 선택" } });
    input.value = core.periodInputValue(periodId, selectedKey);
    input.onchange = function () {
      var nextKey = core.periodKeyFromInput(periodId, input.value);
      if (!nextKey) {
        input.value = core.periodInputValue(periodId, selectedKey);
        return;
      }
      return onSelect(nextKey);
    };
    var next = button(navigation, "다음 " + (periodId === "monthly" ? "달" : periodId === "quarterly" ? "분기" : "해"));
    next.onclick = function () { return onSelect(core.shiftPeriod(periodId, selectedKey, 1)); };
    if (selectedKey !== currentKey) {
      var current = button(navigation, "현재");
      current.onclick = function () { return onSelect(currentKey); };
    }
  }

  async function renderLongPeriod(container, periodId, selectedKey, app, onSelect, isCurrent, onChildMount) {
    var shell = container.createEl("div", { attr: { class: "journal-period-review" } });
    renderNavigation(shell, periodId, selectedKey, onSelect);
    var status = shell.createEl("p", { text: "기록을 읽는 중...", attr: { class: "journal-period-status", role: "status" } });
    var body = shell.createEl("div", { attr: { class: "journal-period-panel" } });
    var records = root.JournalPeriodStore ? await root.JournalPeriodStore.listRecords(app, periodId) : [];
    if (typeof isCurrent === "function" && !isCurrent()) return [];
    var record = records.find(function (item) { return item.key === selectedKey; });
    status.textContent = "";
    if (record) {
      renderRecord(body, record, app, periodId === "monthly" && root.MonthlyValidationView ? function () {
        body.empty();
        var child = root.MonthlyValidationView.mount({ app: app, container: body, initialMonth: selectedKey, initialRecord: record, onSaved: function () { return onSelect(selectedKey); } });
        if (typeof onChildMount === "function") onChildMount(child);
        return child;
      } : null);
    } else if (periodId === "monthly" && root.MonthlyValidationView) {
      var child = root.MonthlyValidationView.mount({ app: app, container: body, initialMonth: selectedKey, onSaved: function () { return onSelect(selectedKey); } });
      if (typeof onChildMount === "function") onChildMount(child);
    } else {
      renderReadiness(body, periodId, app, selectedKey);
    }
    renderHistory(shell, records, selectedKey, onSelect);
    return records;
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
    var activeChildController = null;
    var renderVersion = 0;
    var periodKeys = {};
    root.JournalPeriodCore.PERIODS.forEach(function (period) {
      if (period.id === "monthly" || period.id === "quarterly" || period.id === "yearly") periodKeys[period.id] = root.JournalPeriodCore.periodKey(period.id, new Date());
    });
    var width = Number.isFinite(Number(opts.logicalWidth)) ? Number(opts.logicalWidth) : Number(container.clientWidth) || breakpoints.wide;
    var tabs = container.createEl("nav", { attr: { class: "journal-period-tabs", "aria-label": "저널 기간 선택" } });
    var content = container.createEl("div", { attr: { class: "journal-period-content" } });
    var panels = {};
    root.JournalPeriodCore.PERIODS.forEach(function (period) {
      panels[period.id] = content.createEl("section", { attr: { class: "journal-period-panel" } });
    });

    function destroyChild() {
      if (activeChildController && typeof activeChildController.destroy === "function") activeChildController.destroy();
      activeChildController = null;
    }

    function render() {
      var version = ++renderVersion;
      destroyChild();
      var panel = panels[selected];
      panel.empty();
      if (selected === "daily") return opts.renderDaily(panel);
      if (selected === "weekly") return opts.renderWeekly(panel);
      return renderLongPeriod(panel, selected, periodKeys[selected], app, function (nextKey) {
        periodKeys[selected] = nextKey;
        return render();
      }, function () { return version === renderVersion; }, function (child) {
        if (version !== renderVersion) {
          if (child && typeof child.destroy === "function") child.destroy();
          return;
        }
        activeChildController = child || null;
      });
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
      destroy: function () { renderVersion += 1; destroyChild(); if (observer) observer.disconnect(); }
    });
  }

  var api = Object.freeze({ ensureStyles: ensureStyles, collectCounts: collectCounts, mount: mount });
  root.JournalPeriodView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
