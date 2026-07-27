(function (root) {
  "use strict";

  function openPath(app, path) { return app.workspace.openLinkText(String(path || "").replace(/\.md$/, ""), "", false); }
  function addButton(parent, text, primary) { return root.ProdigyUI ? root.ProdigyUI.button(parent, text, primary ? { primary: true } : undefined) : parent.createEl("button", { text, attr: { type: "button", class: "prodigy-btn" + (primary ? " prodigy-btn-primary" : "") } }); }
  function shiftDate(dateStr, days) {
    var parts = String(dateStr || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (n) { return !Number.isFinite(n); })) return dateStr;
    var d = new Date(parts[0], parts[1] - 1, parts[2] + days);
    return root.JournalCore.todayIsoDate(d);
  }
  function renderPreview(parent, review, blocks, onStageDelete) {
    var preview = parent.createEl("div", { attr: { "class": "journal-preview" } });
    if (!blocks.length && review.status === "empty") return preview.setText("\uC544\uC9C1 \uAE30\uB85D\uB41C \uACBD\uD5D8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \u300C+ \uACBD\uD5D8 \uCD94\uAC00\u300D\uB85C \uAC00\uBE58\uAC8C \uB0A8\uAE30\uC138\uC694.");
    if (!blocks.length) {
      preview.createEl("div", { text: "\uC131\uCC30: " + (review.fields.reflection || "\u2014") });
      preview.createEl("div", { text: "\uBCC0\uD654: " + (review.fields.change || "\u2014") });
      return preview.createEl("div", { text: "\uB2E4\uC74C \uC2E4\uD5D8: " + (review.fields.next_experiment || "\u2014") });
    }
    blocks.forEach(function (block) {
      var item = preview.createEl("div", { attr: { "class": "journal-block" } });
      var head = item.createEl("div", { attr: { "class": "journal-block-head" } });
      head.createEl("div", { text: block.evidence_id, attr: { "class": "bid" } });
      if (typeof onStageDelete === "function") {
        var remove = addButton(head, "\uC0AD\uC81C");
        remove.setAttribute("aria-label", (block.title || block.evidence_id) + " \uC0AD\uC81C");
        remove.addClass("journal-block-delete");
        remove.onclick = function () { return onStageDelete(block); };
      }
      item.createEl("div", { text: block.title || "(\uC81C\uBAA9 \uC5C6\uC74C)", attr: { style: "font-weight:600;" } });
      item.createEl("div", { text: block.experience || "", attr: { style: "color:var(--text-muted);margin-top:2px;" } });
    });
  }
  function renderRecentCard(container, title, items, emptyText, value) {
    var card = container.createEl("div", { attr: { "class": "journal-card" } });
    card.createEl("h2", { text: title });
    if (!items.length) return card.createEl("div", { text: emptyText, attr: { "class": "journal-meta" } });
    items.forEach(function (item) {
      var row = card.createEl("div", { attr: { "class": "journal-row" } });
      row.createEl("strong", { text: item.date, attr: { style: "display:block;margin-bottom:4px;" } });
      row.createEl("div", { text: value(item), attr: { "class": "journal-preview" } });
    });
  }
  async function renderDashboard(app, container, openProposeEvidenceModal, dashboardState, selectedDate) {
    if (!app || !container || !root.JournalCore || !root.JournalStore) return;
    var state = dashboardState || { pendingDeletedEvidenceIds: new Set() };
    if (!(state.pendingDeletedEvidenceIds instanceof Set)) state.pendingDeletedEvidenceIds = new Set(state.pendingDeletedEvidenceIds || []);
    container.empty();
    container.addClass("prodigy-journal-workspace");
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    container.createEl("style").textContent = ".prodigy-journal-workspace{max-width:920px;margin:0 auto;padding:8px 8px 40px}.journal-card{border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);padding:14px;margin-bottom:12px}.journal-card h2{margin:0 0 10px;font-size:1.05em}.journal-meta{color:var(--text-muted);font-size:0.82em;margin-bottom:8px}.journal-preview{font-size:0.88em;line-height:1.45;color:var(--text-normal);white-space:pre-wrap}.journal-primary-actions{margin:var(--ke-space-3) 0}.journal-pending-delete .prodigy-btn{margin-left:var(--ke-space-3)}.journal-row{padding:10px 0;border-top:1px solid var(--background-modifier-border)}.journal-row:first-child{border-top:0}.journal-badge{display:inline-flex;align-items:center;min-height:22px;padding:2px 8px;border-radius:999px;font-size:0.75em;font-weight:700}.journal-badge.complete{background:rgba(34,197,94,.12);color:#16a34a}.journal-badge.partial{background:rgba(249,115,22,.12);color:#ea580c}.journal-badge.empty{background:var(--background-modifier-hover);color:var(--text-muted)}.journal-block{border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px 10px;margin:6px 0;background:var(--background-primary);font-size:0.86em}.journal-block-head{display:flex;align-items:center;gap:var(--ke-space-3)}.journal-block-delete{margin-left:auto}.journal-block .bid{font-size:0.72em;color:var(--text-muted)}.journal-date-nav{display:flex;align-items:center;gap:8px;margin-bottom:10px}.journal-date-nav input[type=date]{border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px 8px;background:var(--background-primary);color:var(--text-normal);font-size:0.88em}@media(max-width:600px){.prodigy-journal-workspace{padding:4px 4px 36px}.journal-card{padding:10px;margin-bottom:8px}.journal-card h2{font-size:1em}.journal-meta{font-size:0.85em}.journal-preview{font-size:0.92em;line-height:1.5}.journal-primary-actions,.journal-actions{flex-wrap:wrap;gap:6px}.journal-primary-actions .prodigy-btn,.journal-actions .prodigy-btn{flex:1 1 calc(50% - 6px);min-height:44px;font-size:0.88em;text-align:center;box-sizing:border-box}.journal-block{padding:10px 12px;font-size:0.9em}.journal-block-head{flex-wrap:wrap;gap:4px}.journal-block .bid{font-size:0.78em}.journal-block-delete{min-height:36px;padding:4px 12px}.journal-row{flex-wrap:wrap;gap:6px}.journal-row .prodigy-btn{min-height:36px;padding:4px 12px}.journal-badge{font-size:0.8em;min-height:24px}.journal-date-nav{flex-wrap:wrap;gap:6px}.journal-date-nav input[type=date]{flex:1 1 140px;min-height:36px}}";
    var today = root.JournalCore.todayIsoDate();
    var activeDate = selectedDate || today;
    var isToday = activeDate === today;
    var activeReview = await root.JournalStore.loadReview(app, activeDate);
    var recent = await root.JournalStore.listRecentReviews(app, { limitDays: 14 });
    var blocks = (activeReview.blocks || []).filter(function (block) { return !block.legacy; });
    var visibleBlocks = blocks.filter(function (block) { return !state.pendingDeletedEvidenceIds.has(block.evidence_id); });
    var dateNav = container.createEl("div", { attr: { "class": "journal-date-nav" } });
    var prevBtn = addButton(dateNav, "\u2190");
    prevBtn.setAttribute("aria-label", "\uC774\uC804 \uB0A0");
    prevBtn.onclick = function () { return renderDashboard(app, container, openProposeEvidenceModal, state, shiftDate(activeDate, -1)); };
    var dateInput = dateNav.createEl("input", { attr: { type: "date", value: activeDate, "aria-label": "\uB0A0\uC9DC \uC120\uD0DD" } });
    dateInput.onchange = function () { return renderDashboard(app, container, openProposeEvidenceModal, state, dateInput.value || activeDate); };
    var nextBtn = addButton(dateNav, "\u2192");
    nextBtn.setAttribute("aria-label", "\uB2E4\uC74C \uB0A0");
    nextBtn.onclick = function () { return renderDashboard(app, container, openProposeEvidenceModal, state, shiftDate(activeDate, 1)); };
    if (!isToday) {
      var todayBtn = addButton(dateNav, "\uC624\uB298");
      todayBtn.onclick = function () { return renderDashboard(app, container, openProposeEvidenceModal, state, today); };
    }
    var todayCard = container.createEl("div", { attr: { "class": "journal-card" } });
    todayCard.createEl("h2", { text: isToday ? "\uC624\uB298 \uACBD\uD5D8 \u00B7 \uC99D\uAC70" : activeDate + " \uACBD\uD5D8 \u00B7 \uC99D\uAC70" });
    var meta = todayCard.createEl("div", { attr: { "class": "journal-meta" } });
    meta.createEl("span", { text: activeDate });
    meta.createEl("span", { text: activeReview.statusLabel, attr: { "class": "journal-badge " + activeReview.status, style: "margin-left:8px;" } });
    meta.createEl("span", { text: " \u00B7 \uBE14\uB85D " + visibleBlocks.length + "\uAC1C", attr: { style: "margin-left:4px;" } });
    var primaryActions = todayCard.createEl("div", { attr: { "class": "journal-primary-actions prodigy-btn-row" } });
    root.JournalCompletionAction.render(primaryActions, {
      app: app,
      today: activeDate,
      todayReview: activeReview,
      blocks: visibleBlocks,
      deleteEvidenceIds: Array.from(state.pendingDeletedEvidenceIds),
      completeDaily: function (targetApp, date) { return root.JournalStore.markDailyComplete(targetApp, date); },
      openProposeEvidenceModal: openProposeEvidenceModal,
      refresh: function () { return renderDashboard(app, container, openProposeEvidenceModal, state, activeDate); }
    });
    if (state.pendingDeletedEvidenceIds.size) {
      var pending = todayCard.createEl("div", { text: "\uC0AD\uC81C \uC608\uC815 " + state.pendingDeletedEvidenceIds.size + "\uAC1C \u00B7 \uC99D\uAC70 \uD655\uC815 \uC804\uAE4C\uC9C0 Daily\uC5D0\uB294 \uBC18\uC601\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", attr: { "class": "journal-meta journal-pending-delete", "aria-live": "polite" } });
      var undo = addButton(pending, "\uC0AD\uC81C \uCDE8\uC18C");
      undo.onclick = function () {
        state.pendingDeletedEvidenceIds.clear();
        return renderDashboard(app, container, openProposeEvidenceModal, state, activeDate);
      };
    }
    renderPreview(todayCard, activeReview, visibleBlocks, function (block) {
      state.pendingDeletedEvidenceIds.add(block.evidence_id);
      return renderDashboard(app, container, openProposeEvidenceModal, state, activeDate);
    });
    var actions = todayCard.createEl("div", { attr: { "class": "journal-actions prodigy-btn-row" } });
    var add = addButton(actions, "+ \uACBD\uD5D8 \uCD94\uAC00");
    add.onclick = function () { return root.JournalEvidenceBlockModal.open(app, root.JournalCore.emptyBlock(activeDate, blocks), async function (block) {
      await root.JournalStore.appendEvidenceBlock(app, activeDate, block);
      if (window.Notice) new Notice("\uACBD\uD5D8\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
      await renderDashboard(app, container, openProposeEvidenceModal, state, activeDate);
    }); };
    var legacy = addButton(actions, "\uB2E8\uC77C \uC131\uCC30");
    legacy.onclick = function () { return root.JournalReviewModal.open(app, activeReview.fields, async function (values) {
      await root.JournalStore.saveReview(app, activeDate, values);
      if (window.Notice) new Notice(activeDate + " \uC131\uCC30\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
      await renderDashboard(app, container, openProposeEvidenceModal, state, activeDate);
    }); };
    var open = addButton(actions, isToday ? "\uC624\uB298 \uB178\uD2B8 \uC5F4\uAE30" : activeDate + " \uB178\uD2B8 \uC5F4\uAE30");
    open.onclick = async function () { await root.JournalStore.ensureDailyNote(app, activeDate); openPath(app, activeReview.path); };
    renderRecentCard(container, "\uCD5C\uADFC \uBCC0\uD654", recent.filter(function (item) { return item.fields.change; }).slice(0, 7), "\uCD5C\uADFC 7\uC77C\uAC04 \uAE30\uB85D\uB41C \uBCC0\uD654\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", function (item) { return item.fields.change; });
    renderRecentCard(container, "\uB2E4\uC74C \uC2E4\uD5D8", recent.filter(function (item) { return item.fields.next_experiment; }).slice(0, 7), "\uCD5C\uADFC \uC791\uC131\uB41C \uB2E4\uC74C \uC2E4\uD5D8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", function (item) { return item.fields.next_experiment; });
    var recentCard = container.createEl("div", { attr: { "class": "journal-card" } });
    recentCard.createEl("h2", { text: "\uCD5C\uADFC \uAE30\uB85D" });
    recent.slice(0, 14).forEach(function (item) {
      var row = recentCard.createEl("div", { attr: { "class": "journal-row", style: "display:flex;justify-content:space-between;gap:12px;align-items:center;cursor:pointer;" } });
      var left = row.createEl("div");
      left.createEl("strong", { text: item.date });
      left.createEl("span", { text: item.statusLabel, attr: { "class": "journal-badge " + item.status, style: "margin-left:8px;" } });
      if (item.blockCount) left.createEl("span", { text: " \u00B7 " + item.blockCount + "\uBE14\uB85D", attr: { style: "color:var(--text-muted);font-size:0.82em;margin-left:4px;" } });
      var button = addButton(row, "\uC5F4\uAE30");
      button.onclick = function (event) { event.stopPropagation(); openPath(app, item.path); };
      row.onclick = function () { return openPath(app, item.path); };
    });
  }

  var api = { openPath: openPath, renderDashboard: renderDashboard };
  root.JournalDashboardView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
