(function (root) {
  "use strict";

  function responsiveTokens() {
    var tokens = root.ProdigyTokens;
    if (!tokens && typeof require === "function") tokens = require("./design-tokens.js");
    if (!tokens || !tokens.BREAKPOINTS || !tokens.CONTROL_HEIGHTS) throw new Error("저널 반응형 토큰을 불러오지 못했습니다.");
    return tokens;
  }

  function openPath(app, path) { return app.workspace.openLinkText(String(path || "").replace(/\.md$/, ""), "", false); }
  function addButton(parent, text, primary) { return root.ProdigyUI ? root.ProdigyUI.button(parent, text, primary ? { primary: true } : undefined) : parent.createEl("button", { text, attr: { type: "button", class: "prodigy-btn" + (primary ? " prodigy-btn-primary" : "") } }); }
  function displayText(value) { return String(value || "").replace(/\\n/g, "\n"); }
  function shiftDate(dateStr, days) {
    var parts = String(dateStr || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (n) { return !Number.isFinite(n); })) return dateStr;
    var d = new Date(parts[0], parts[1] - 1, parts[2] + days);
    return root.JournalCore.todayIsoDate(d);
  }
  function renderPreview(parent, review, blocks, onStageDelete) {
    var preview = parent.createEl("div", { attr: { "class": "journal-preview" } });
    if (!blocks.length && review.status === "empty") return preview.setText("\uC544\uC9C1 \uAE30\uB85D\uB41C \uACBD\uD5D8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \u300C+ \uACBD\uD5D8 \uCD94\uAC00\u300D\uB85C \uAC00\uBCCD\uAC8C \uB0A8\uAE30\uC138\uC694.");
    if (!blocks.length) {
      preview.createEl("div", { text: "\uC131\uCC30: " + (displayText(review.fields.reflection) || "\u2014") });
      preview.createEl("div", { text: "\uBCC0\uD654: " + (displayText(review.fields.change) || "\u2014") });
      return preview.createEl("div", { text: "\uB2E4\uC74C \uC2E4\uD5D8: " + (displayText(review.fields.next_experiment) || "\u2014") });
    }
    blocks.forEach(function (block) {
      var item = preview.createEl("div", { attr: { "class": "journal-block prodigy-utility-card" } });
      var head = item.createEl("div", { attr: { "class": "journal-block-head" } });
      head.createEl("div", { text: block.evidence_id, attr: { "class": "bid" } });
      if (typeof onStageDelete === "function") {
        var remove = addButton(head, "\uC0AD\uC81C");
        remove.setAttribute("aria-label", (block.title || block.evidence_id) + " \uC0AD\uC81C");
        remove.addClass("journal-block-delete");
        remove.onclick = function () { return onStageDelete(block); };
      }
      item.createEl("div", { text: displayText(block.title) || "(\uC81C\uBAA9 \uC5C6\uC74C)", attr: { "class": "journal-font-weight-600" } });
      item.createEl("div", { text: displayText(block.experience), attr: { "class": "journal-text-muted-mt-2" } });
    });
  }
  function renderRecentCard(container, title, items, emptyText, value) {
    var card = container.createEl("div", { attr: { "class": "journal-card prodigy-utility-card" } });
    card.createEl("h2", { text: title });
    if (!items.length) return card.createEl("div", { text: emptyText, attr: { "class": "journal-meta" } });
    items.forEach(function (item) {
      var row = card.createEl("div", { attr: { "class": "journal-row" } });
      row.createEl("strong", { text: item.date, attr: { "class": "journal-display-block-mb-4" } });
      row.createEl("div", { text: displayText(value(item)), attr: { "class": "journal-preview" } });
    });
  }
  async function renderDashboardPaint(app, container, openProposeEvidenceModal, dashboardState, selectedDate, request) {
    if (!app || !container || !root.JournalCore || !root.JournalStore) return;
    var state = dashboardState || { pendingDeletedEvidenceIds: new Set() };
    if (!(state.pendingDeletedEvidenceIds instanceof Set)) state.pendingDeletedEvidenceIds = new Set(state.pendingDeletedEvidenceIds || []);

    var today = root.JournalCore.todayIsoDate();
    var activeDate = selectedDate || today;
    var isToday = activeDate === today;
    var activeReview = await root.JournalStore.loadReview(app, activeDate);
    var recent = await root.JournalStore.listRecentReviews(app, { limitDays: 14 });
    if (request && !request.isCurrent()) return null;
    container.empty();
    container.addClass("prodigy-journal-workspace");
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    if (root.JournalStyles && typeof root.JournalStyles.ensureJournalStyles === "function") {
      root.JournalStyles.ensureJournalStyles();
    }

    var tokens = responsiveTokens();
    var breakpoints = tokens.BREAKPOINTS;
    var heights = tokens.CONTROL_HEIGHTS;

    var blocks = (activeReview.blocks || []).filter(function (block) { return !block.legacy; });
    var visibleBlocks = blocks.filter(function (block) { return !state.pendingDeletedEvidenceIds.has(block.evidence_id); });
    var dateNav = container.createEl("div", { attr: { "class": "journal-date-nav", "role": "toolbar", "aria-label": "날짜 이동" } });
    var prevBtn = addButton(dateNav, "\u2190");
    prevBtn.setAttribute("aria-label", "\uC774\uC804 \uB0A0");
    prevBtn.onclick = function () { return state.__controller.refresh(shiftDate(activeDate, -1)); };
    var dateInput = dateNav.createEl("input", { attr: { type: "date", value: activeDate, "aria-label": "\uB0A0\uC9DC \uC120\uD0DD" } });
    dateInput.onchange = function () { return state.__controller.refresh(dateInput.value || activeDate); };
    var nextBtn = addButton(dateNav, "\u2192");
    nextBtn.setAttribute("aria-label", "\uB2E4\uC74C \uB0A0");
    nextBtn.onclick = function () { return state.__controller.refresh(shiftDate(activeDate, 1)); };
    if (!isToday) {
      var todayBtn = addButton(dateNav, "\uC624\uB298");
      todayBtn.onclick = function () { return state.__controller.refresh(today); };
    }
    container.createEl("p", { text: "오늘 무엇이 나를 변화시켰는지 기록합니다.", attr: { "class": "journal-meta journal-period-role", style: "font-size:var(--ke-type-body);line-height:var(--ke-leading-body);" } });
    var todayCard = container.createEl("div", { attr: { "class": "journal-card prodigy-full-bleed" } });
    todayCard.createEl("h2", { text: isToday ? "\uC624\uB298 \uACBD\uD5D8 \u00B7 \uC99D\uAC70" : activeDate + " \uACBD\uD5D8 \u00B7 \uC99D\uAC70" });
    var meta = todayCard.createEl("div", { attr: { "class": "journal-meta" } });
    meta.createEl("span", { text: activeDate });
    meta.createEl("span", { text: activeReview.statusLabel, attr: { "class": "journal-status prodigy-status-line journal-status-ml-8", "data-state": activeReview.status } });
    meta.createEl("span", { text: " \u00B7 \uBE14\uB85D " + visibleBlocks.length + "\uAC1C", attr: { "class": "journal-status-ml-4" } });
    var primaryActions = todayCard.createEl("div", { attr: { "class": "journal-primary-actions prodigy-btn-row" } });
    root.JournalCompletionAction.render(primaryActions, {
      app: app,
      today: activeDate,
      todayReview: activeReview,
      blocks: visibleBlocks,
      deleteEvidenceIds: Array.from(state.pendingDeletedEvidenceIds),
      completeDaily: function (targetApp, date) { return root.JournalStore.markDailyComplete(targetApp, date); },
      openProposeEvidenceModal: openProposeEvidenceModal,
      refresh: function () { return state.__controller.refresh(activeDate); }
    });
    if (state.pendingDeletedEvidenceIds.size) {
      var pending = todayCard.createEl("div", { text: "\uC0AD\uC81C \uC608\uC815 " + state.pendingDeletedEvidenceIds.size + "\uAC1C \u00B7 \uC99D\uAC70 \uD655\uC815 \uC804\uAE4C\uC9C0 Daily\uC5D0\uB294 \uBC18\uC601\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", attr: { "class": "journal-meta journal-pending-delete", "aria-live": "polite" } });
      var undo = addButton(pending, "\uC0AD\uC81C \uCDE8\uC18C");
      undo.onclick = function () {
        state.pendingDeletedEvidenceIds.clear();
        return state.__controller.refresh(activeDate);
      };
    }
    renderPreview(todayCard, activeReview, visibleBlocks, function (block) {
      state.pendingDeletedEvidenceIds.add(block.evidence_id);
      return state.__controller.refresh(activeDate);
    });
    var actions = todayCard.createEl("div", { attr: { "class": "journal-actions prodigy-btn-row" } });
    var add = addButton(actions, "+ \uACBD\uD5D8 \uCD94\uAC00");
    add.onclick = function () { return root.JournalEvidenceBlockModal.open(app, root.JournalCore.emptyBlock(activeDate, blocks), async function (block) {
      await root.JournalStore.appendEvidenceBlock(app, activeDate, block);
      if (window.Notice) new Notice("\uACBD\uD5D8\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
      await state.__controller.refresh(activeDate);
    }); };
    var legacy = addButton(actions, "\uB2E8\uC77C \uC131\uCC30");
    legacy.onclick = function () { return root.JournalReviewModal.open(app, activeReview.fields, async function (values) {
      await root.JournalStore.saveReview(app, activeDate, values);
      if (window.Notice) new Notice(activeDate + " \uC131\uCC30\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
      await state.__controller.refresh(activeDate);
    }); };
    var open = addButton(actions, isToday ? "\uC624\uB298 \uB178\uD2B8 \uC5F4\uAE30" : activeDate + " \uB178\uD2B8 \uC5F4\uAE30");
    open.onclick = async function () { await root.JournalStore.ensureDailyNote(app, activeDate); openPath(app, activeReview.path); };
    if (root.JournalHeatmap && typeof root.JournalHeatmap.render === "function") {
      root.JournalHeatmap.render(container, recent, function (targetDate) { return state.__controller.refresh(targetDate); });
    }
    renderRecentCard(container, "\uCD5C\uADFC \uBCC0\uD654", recent.filter(function (item) { return item.fields.change; }).slice(0, 7), "\uCD5C\uADFC 7\uC77C\uAC04 \uAE30\uB85D\uB41C \uBCC0\uD654\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", function (item) { return item.fields.change; });
    renderRecentCard(container, "\uB2E4\uC74C \uC2E4\uD5D8", recent.filter(function (item) { return item.fields.next_experiment; }).slice(0, 7), "\uCD5C\uADFC \uC791\uC131\uB41C \uB2E4\uC74C \uC2E4\uD5D8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", function (item) { return item.fields.next_experiment; });
    var recentCard = container.createEl("div", { attr: { "class": "journal-card" } });
    recentCard.createEl("h2", { text: "\uCD5C\uADFC \uAE30\uB85D" });
    recent.slice(0, 14).forEach(function (item) {
      var row = recentCard.createEl("div", { attr: { "class": "journal-row journal-flex-between-center" } });
      var left = row.createEl("div");
      left.createEl("strong", { text: item.date });
      left.createEl("span", { text: item.statusLabel, attr: { "class": "journal-status prodigy-status-line journal-status-ml-8", "data-state": item.status } });
      if (item.blockCount) left.createEl("span", { text: " \u00B7 " + item.blockCount + "\uBE14\uB85D", attr: { "class": "journal-status-ml-4", style: "color:var(--text-muted);" } });
      var button = addButton(row, "\uC5F4\uAE30");
      button.setAttribute("aria-label", item.date + " 기록 열기");
      button.onclick = function () { return openPath(app, item.path); };
    });
    return { date: activeDate, review: activeReview, recent: recent };
  }

  function renderDashboard(app, container, openProposeEvidenceModal, options, selectedDate) {
    if (!app || !container || !root.JournalCore || !root.JournalStore) return null;
    var opts = options && (typeof options.onStateChange === "function" || options.signal || options.dashboardState)
      ? options
      : {};
    var dashboardState = opts.dashboardState || (options && options.pendingDeletedEvidenceIds ? options : null) || { pendingDeletedEvidenceIds: new Set() };
    if (!(dashboardState.pendingDeletedEvidenceIds instanceof Set)) dashboardState.pendingDeletedEvidenceIds = new Set(dashboardState.pendingDeletedEvidenceIds || []);
    var listeners = new Set();
    if (typeof opts.onStateChange === "function") listeners.add(opts.onStateChange);
    var destroyed = false;
    var generation = 0;
    var current = {
      phase: "idle",
      busy: false,
      date: selectedDate || root.JournalCore.todayIsoDate(),
      error: "",
      review: null,
      recent: []
    };
    var currentReady = Promise.resolve(null);
    var abortHandler = null;

    function snapshot() {
      return Object.freeze({
        phase: current.phase,
        busy: current.busy,
        date: current.date,
        error: current.error,
        review: current.review,
        recent: current.recent.slice()
      });
    }
    function emit(patch) {
      if (destroyed) return snapshot();
      current = Object.assign({}, current, patch || {});
      var next = snapshot();
      listeners.forEach(function (listener) { listener(next); });
      return next;
    }
    function refresh(date) {
      if (destroyed) return Promise.resolve(null);
      var token = ++generation;
      var activeDate = date || current.date || root.JournalCore.todayIsoDate();
      emit({ phase: "loading", busy: true, date: activeDate, error: "" });
      var request = { isCurrent: function () { return !destroyed && token === generation; } };
      currentReady = renderDashboardPaint(app, container, openProposeEvidenceModal, dashboardState, activeDate, request).then(function (result) {
        if (!result || !request.isCurrent()) return null;
        var phase = result.review && result.review.status === "empty" && !result.recent.length ? "empty" : "normal";
        emit({ phase: phase, busy: false, date: result.date, error: "", review: result.review, recent: result.recent });
        return result;
      }, function (error) {
        if (!request.isCurrent()) return null;
        emit({ phase: "error", busy: false, date: activeDate, error: String(error && (error.message || error) || error) });
        throw error;
      });
      return currentReady;
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      listeners.clear();
      if (opts.signal && abortHandler && typeof opts.signal.removeEventListener === "function") opts.signal.removeEventListener("abort", abortHandler);
    }
    var controller = {
      get ready() { return currentReady; },
      refresh: refresh,
      getState: snapshot,
      subscribe: function (listener) {
        if (typeof listener !== "function" || destroyed) return function () {};
        listeners.add(listener);
        return function () { listeners.delete(listener); };
      },
      destroy: destroy
    };
    dashboardState.__controller = controller;
    if (opts.signal && typeof opts.signal.addEventListener === "function") {
      abortHandler = destroy;
      opts.signal.addEventListener("abort", abortHandler, { once: true });
      if (opts.signal.aborted) destroy();
    }
    if (!destroyed) refresh(current.date);
    return controller;
  }

  var api = { openPath: openPath, displayText: displayText, renderDashboard: renderDashboard };
  root.JournalDashboardView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
