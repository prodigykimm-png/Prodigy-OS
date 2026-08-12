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
    if (!tokens || !tokens.RESPONSIVE_BREAKPOINTS || !tokens.CONTROL_HEIGHTS || !controls || typeof controls.AdaptiveTabs !== "function") {
      throw new Error("저널 반응형 컨트롤을 불러오지 못했습니다.");
    }
    return { tokens: tokens, controls: controls };
  }

  function layoutForWidth(width, breakpoints) {
    var value = Number(width);
    if (Number.isFinite(value) && value <= breakpoints.collapsedNavMax) return "compact";
    if (Number.isFinite(value) && value <= breakpoints.utilityTwoColumnMax) return "medium";
    return "wide";
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var shared = dependencies();
    var breakpoints = shared.tokens.RESPONSIVE_BREAKPOINTS;
    var heights = shared.tokens.CONTROL_HEIGHTS;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      ".journal-period-tabs{max-inline-size:100%;min-inline-size:0;margin-block-end:17px;border-bottom:1px solid var(--background-modifier-border);overflow-x:clip}",
      ".journal-period-tabs[data-layout=compact]{position:sticky;inset-block-start:0;z-index:19;background:var(--background-primary)}",
      ".journal-period-tabs .prodigy-adaptive-tabs{display:flex;inline-size:100%;max-inline-size:100%;min-inline-size:0;flex-wrap:wrap;overflow:visible;scroll-snap-type:none;padding-block:8px}",
      ".journal-period-tabs .prodigy-adaptive-tab{flex:1 1 8rem;min-inline-size:44px;min-block-size:44px;block-size:auto;max-inline-size:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;box-shadow:none;scroll-snap-align:none}",
      ".journal-period-content,.journal-period-panel{max-inline-size:100%;min-inline-size:0;overflow-wrap:anywhere}.journal-period-review{display:grid;gap:17px;max-inline-size:100%;min-inline-size:0}",
      ".journal-period-navigation{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-inline-size:100%;min-inline-size:0}.journal-period-navigation button,.journal-period-navigation input{min-inline-size:44px;min-block-size:44px;block-size:auto;box-sizing:border-box;box-shadow:none}.journal-period-navigation input{flex:1 1 9rem;max-inline-size:100%;color:var(--text-normal);font:inherit}",
      ".journal-period-label{font-weight:700;min-inline-size:8rem}.journal-period-status,.journal-period-record-meta,.journal-period-empty{margin:0;color:var(--text-muted);word-break:keep-all;overflow-wrap:anywhere}",
      ".journal-period-record,.journal-period-history{display:grid;gap:12px;max-inline-size:100%;min-inline-size:0}.journal-period-record h2,.journal-period-history h2{margin:0}.journal-period-record-content{margin:0;max-inline-size:100%;min-inline-size:0;overflow:visible;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font:inherit;color:var(--text-normal)}",
      ".journal-period-history-list{display:grid;gap:8px;min-inline-size:0}.journal-period-history-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:8px;border-top:1px solid var(--background-modifier-border);min-inline-size:0}.journal-period-history-row:first-child{border-top:0}.journal-period-history-row button{min-inline-size:44px;min-block-size:44px;block-size:auto;max-inline-size:100%;word-break:keep-all;overflow-wrap:anywhere;text-align:start;box-shadow:none}.journal-period-history-current{color:var(--ke-color-interactive,var(--text-accent));white-space:nowrap}",
      ".journal-period-review button:focus-visible,.journal-period-review input:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}",
      "@media(max-width:" + breakpoints.collapsedNavMax + "px){.journal-period-navigation{align-items:stretch}.journal-period-navigation button,.journal-period-navigation input{flex:1 1 8rem}.journal-period-label{flex:1 1 100%;min-block-size:44px;display:flex;align-items:center}.journal-period-history-row{align-items:flex-start;flex-wrap:wrap}.journal-period-history-current{margin-inline-start:auto}}",
      "@media(forced-colors:active){.journal-period-tabs .prodigy-adaptive-tab[aria-selected=true],.journal-period-history-current{border:1px solid Highlight}.journal-period-review button:focus-visible,.journal-period-review input:focus-visible,.journal-period-tabs .prodigy-adaptive-tab:focus-visible{outline:2px solid Highlight;outline-offset:2px}}",
      "@media(prefers-reduced-motion:reduce){.journal-period-review *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}"
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
      var countRecords = typeof core.countRecordsInBounds === "function"
        ? function (sourceId) { return core.countRecordsInBounds(files, sourceId, bounds, { completed: true }); }
        : function (sourceId) { return countByPrefix(files, core.periodFolder(sourceId), selectedKey); };
      return {
        daily: countByDateRange(files, "DAILY/DAILY", bounds),
        weekly: countByPrefix(files, "DAILY/WEEKLY", bounds.start.slice(0, 4)),
        monthly: countRecords("monthly"),
        quarterly: countRecords("quarterly"),
        directions: typeof core.countDirectionRecords === "function" ? core.countDirectionRecords(files, id, bounds) : countRecords("quarterly"),
        principles: 0,
        year: bounds.start.slice(0, 4)
      };
    }
    var yearBounds = core.periodBounds("yearly", year);
    return {
      daily: countByPrefix(files, "DAILY/DAILY", month),
      weekly: countByPrefix(files, "DAILY/WEEKLY", year),
      monthly: countByPrefix(files, "DAILY/MONTHLY", year),
      quarterly: countByPrefix(files, "DAILY/QUARTERLY", year),
      directions: typeof core.countDirectionRecords === "function" ? core.countDirectionRecords(files, "yearly", yearBounds) : countByPrefix(files, "DAILY/QUARTERLY", quarter),
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
    var panel = container.createEl("section", { attr: { class: "journal-period-record prodigy-full-bleed", "aria-label": record.display + " 기록" } });
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
    var panel = container.createEl("section", { attr: { class: "journal-period-history prodigy-utility-card", "aria-label": "저널 기록 목록" } });
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
      if (record.key === selectedKey) row.createEl("span", { text: "현재 선택", attr: { class: "journal-period-history-current", "aria-current": "true" } });
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

  async function renderLongPeriod(container, periodId, selectedKey, app, onSelect, isCurrent, onChildMount, previousRecords, onRetry) {
    var shell = container.createEl("div", { attr: { class: "journal-period-review", "aria-busy": "true" } });
    renderNavigation(shell, periodId, selectedKey, onSelect);
    var status = shell.createEl("p", { text: "기록을 읽는 중...", attr: { class: "journal-period-status prodigy-status-line", role: "status", "aria-live": "polite" } });
    var retry = button(shell, "다시 시도", "기록 읽기 다시 시도");
    retry.hidden = true;
    var body = shell.createEl("div", { attr: { class: "journal-period-panel" } });
    var previous = Array.isArray(previousRecords) ? previousRecords : [];
    var previousRecord = previous.find(function (item) { return item.key === selectedKey; });
    if (previousRecord) renderRecord(body, previousRecord, app);
    try {
      var records = root.JournalPeriodStore ? await root.JournalPeriodStore.listRecords(app, periodId) : [];
      if (typeof isCurrent === "function" && !isCurrent()) return { records: [], status: "stale" };
      shell.setAttribute("aria-busy", "false");
      status.textContent = "";
      retry.hidden = true;
      body.empty();
      var record = records.find(function (item) { return item.key === selectedKey; });
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
      return { records: records, status: "deterministic" };
    } catch (error) {
      if (typeof isCurrent === "function" && !isCurrent()) return { records: [], status: "stale" };
      shell.setAttribute("aria-busy", "false");
      status.textContent = "기록을 읽지 못했습니다. 이전 내용을 유지합니다. 다시 시도해 주세요.";
      status.setAttribute("data-state", "error");
      retry.hidden = false;
      retry.onclick = function () { return typeof onRetry === "function" ? onRetry() : null; };
      return { records: previous, status: "error" };
    }
  }

  function mount(options) {
    var opts = options || {};
    var app = opts.app;
    var container = opts.container;
    if (!app || !container || !root.JournalPeriodCore) throw new Error("Journal Period View를 초기화할 수 없습니다.");
    var shared = dependencies();
    var breakpoints = shared.tokens.RESPONSIVE_BREAKPOINTS;
    ensureStyles();
    var selected = "daily";
    var activeChildController = null;
    var renderVersion = 0;
    var destroyed = false;
    var periodRecordCache = {};
    var pendingIdentity = "";
    var pendingPromise = null;
    var lastIdentity = "";
    var periodKeys = {};
    root.JournalPeriodCore.PERIODS.forEach(function (period) {
      if (period.id === "monthly" || period.id === "quarterly" || period.id === "yearly") periodKeys[period.id] = root.JournalPeriodCore.periodKey(period.id, new Date());
    });
    var width = Number.isFinite(Number(opts.logicalWidth)) ? Number(opts.logicalWidth) : Number(container.clientWidth) || breakpoints.utilityTwoColumnMax + 1;
    var tabs = container.createEl("nav", { attr: { class: "journal-period-tabs", "aria-label": "저널 기간 선택" } });
    var content = container.createEl("div", { attr: { class: "journal-period-content" } });
    var panels = {};
    root.JournalPeriodCore.PERIODS.forEach(function (period) {
      panels[period.id] = content.createEl("section", { attr: { class: "journal-period-panel" } });
    });

    function panelIsMounted(panel) {
      if (!panel) return false;
      if (panel.parentNode === content || panel.parentElement === content || panel.parent === content) return true;
      return Array.isArray(content.children) && content.children.indexOf(panel) !== -1;
    }
    function detachPanel(panel) {
      if (!panel || !panelIsMounted(panel)) return;
      if (panel.parentNode === content && typeof content.removeChild === "function") content.removeChild(panel);
      else if (typeof panel.remove === "function") panel.remove();
      else if (Array.isArray(content.children)) {
        var index = content.children.indexOf(panel);
        if (index !== -1) content.children.splice(index, 1);
        if (panel.parent === content) panel.parent = null;
      }
    }
    function attachPanel(panel) {
      if (!panel || panelIsMounted(panel)) return;
      if (typeof content.appendChild === "function") content.appendChild(panel);
      else if (Array.isArray(content.children)) {
        content.children.push(panel);
        panel.parent = content;
      }
    }
    function mountSelectedPanel() {
      Object.keys(panels).forEach(function (periodId) {
        var panel = panels[periodId];
        var active = periodId === selected;
        panel.hidden = !active;
        if (active) attachPanel(panel);
        else detachPanel(panel);
      });
      return panels[selected];
    }

    function destroyChild() {
      if (activeChildController && typeof activeChildController.destroy === "function") activeChildController.destroy();
      activeChildController = null;
    }
    function snapshotChildren(panel) {
      if (!panel || !panel.children) return null;
      return Array.prototype.slice.call(panel.children);
    }
    function restoreChildren(panel, children) {
      if (!panel || !Array.isArray(children)) return;
      panel.empty();
      if (typeof panel.appendChild === "function") {
        children.forEach(function (child) { panel.appendChild(child); });
      } else if (Array.isArray(panel.children)) {
        panel.children = children.slice();
      }
    }

    function renderFailure(panel, label, retry, children) {
      restoreChildren(panel, children);
      var status = panel.createEl("p", { text: label + " 기록을 읽지 못했습니다. 이전 내용을 유지합니다. 다시 시도해 주세요.", attr: { class: "journal-period-status prodigy-status-line", role: "status", "aria-live": "polite", "data-state": "error" } });
      var control = button(panel, "다시 시도", label + " 기록 다시 시도");
      control.onclick = retry;
      return status;
    }

    function notifyReady(status, period) {
      if (typeof opts.onReady !== "function") return;
      var selector = String(period || selected);
      var successful = status === "deterministic";
      opts.onReady({
        selector: "journal." + selector,
        period: selector,
        selectedPeriod: selector,
        status: successful ? "deterministic" : "error",
        deterministic: successful,
        failed: !successful,
        settled: true,
        enabledAction: { id: "journal." + selector + ".open", enabled: successful }
      });
    }

    function render() {
      if (destroyed) return null;
      mountSelectedPanel();
      var identity = selected + ":" + (periodKeys[selected] || "");
      var period = selected;
      if (pendingIdentity === identity && pendingPromise) return pendingPromise;
      var version = ++renderVersion;
      destroyChild();
      var panel = panels[selected];
      var previousChildren = snapshotChildren(panel);
      if (identity !== lastIdentity || (selected !== "daily" && selected !== "weekly")) panel.empty();
      lastIdentity = identity;
      if (selected === "daily" || selected === "weekly") {
        panel.setAttribute("aria-busy", "true");
        var renderer = selected === "daily" ? opts.renderDaily : opts.renderWeekly;
        var result;
        try {
          result = typeof renderer === "function" ? renderer(panel) : null;
        } catch (_error) {
          panel.setAttribute("aria-busy", "false");
          if (!destroyed && version === renderVersion) {
            renderFailure(panel, selected === "daily" ? "Daily" : "Weekly", function () { return render(); }, previousChildren);
            notifyReady("error", period);
          }
          return null;
        }
        var child = result && typeof result.destroy === "function" ? result : null;
        if (child) activeChildController = child;
        var resultPromise = null;
        if (result && typeof result.then === "function") {
          resultPromise = Promise.resolve(result).then(function (value) {
            if (value === null || value === false) throw new Error("저널 기간 렌더링이 완료되지 않았습니다.");
            return value;
          });
        } else if (result && result.ready && typeof result.ready.then === "function") {
          resultPromise = Promise.resolve(result.ready).then(function (value) {
            if (value === null || value === false) throw new Error("저널 기간 렌더링이 완료되지 않았습니다.");
            return result;
          });
        }
        if (resultPromise) {
          pendingIdentity = identity;
          var renderStatus = "deterministic";
          pendingPromise = resultPromise.catch(function () {
            renderStatus = "error";
            if (!destroyed && version === renderVersion) {
              panel.setAttribute("aria-busy", "false");
              renderFailure(panel, selected === "daily" ? "Daily" : "Weekly", function () { return render(); }, previousChildren);
            }
            return null;
          }).finally(function () {
            if (!destroyed && version === renderVersion) {
              panel.setAttribute("aria-busy", "false");
              notifyReady(renderStatus, period);
            }
            if (pendingIdentity === identity) {
              pendingIdentity = "";
              pendingPromise = null;
            }
          });
          return pendingPromise;
        }
        panel.setAttribute("aria-busy", "false");
        notifyReady(result === null || result === false ? "error" : "deterministic", period);
        return result;
      }
      var selectedKey = periodKeys[selected];
      var previousRecords = periodRecordCache[identity];
      var promise = renderLongPeriod(panel, selected, selectedKey, app, function (nextKey) {
        periodKeys[selected] = nextKey;
        return render();
      }, function () { return !destroyed && version === renderVersion; }, function (childController) {
        if (destroyed || version !== renderVersion) {
          if (childController && typeof childController.destroy === "function") childController.destroy();
          return;
        }
        activeChildController = childController || null;
      }, previousRecords, function () {
        if (!destroyed && version === renderVersion) return render();
      });
      pendingIdentity = identity;
      pendingPromise = Promise.resolve(promise).then(function (result) {
        var status = result && result.status;
        var records = result && Array.isArray(result.records) ? result.records : [];
        if (!destroyed && version === renderVersion && status === "deterministic") periodRecordCache[identity] = records;
        if (!destroyed && version === renderVersion && status !== "stale") {
          notifyReady(status === "deterministic" ? "deterministic" : "error", period);
        }
        return records;
      }, function () {
        if (!destroyed && version === renderVersion) notifyReady("error", period);
        return previousRecords;
      }).finally(function () {
        if (pendingIdentity === identity) {
          pendingIdentity = "";
          pendingPromise = null;
        }
      });
      return pendingPromise;
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
      onChange: function (id) {
        selected = id;
        mountSelectedPanel();
        return render();
      }
    });
    mountSelectedPanel();
    content.onkeydown = function (event) {
      if (!event || event.key !== "Escape" || event.defaultPrevented) return;
      var tablist = adaptive && adaptive.element;
      var active = tablist && typeof tablist.querySelector === "function" ? tablist.querySelector('[role="tab"][aria-selected="true"]') : null;
      if (!active || typeof active.focus !== "function") return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      active.focus();
    };
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
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        renderVersion += 1;
        pendingIdentity = "";
        pendingPromise = null;
        destroyChild();
        if (observer) observer.disconnect();
        if (adaptive && typeof adaptive.destroy === "function") adaptive.destroy();
      }
    });
  }

  var api = Object.freeze({ ensureStyles: ensureStyles, collectCounts: collectCounts, mount: mount });
  root.JournalPeriodView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
