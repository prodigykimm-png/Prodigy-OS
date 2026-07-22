(function (root) {
  "use strict";

  function required(name) {
    var v = root[name];
    if (!v) throw new Error(name + "을(를) 먼저 불러와야 합니다.");
    return v;
  }

  function el(parent, tag, opts) {
    var config = opts || {};
    var element = parent.createEl ? parent.createEl(tag, config) : parent.ownerDocument.createElement(tag);
    if (!parent.createEl && parent.appendChild) {
      if (config.text !== undefined) element.textContent = String(config.text);
      Object.entries(config.attr || {}).forEach(function (e) { if (e[1] !== undefined) element.setAttribute(e[0], e[1]); });
      parent.appendChild(element);
    }
    return element;
  }

  function readDailyNote(app, path) {
    var file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    return app.vault.cachedRead ? app.vault.cachedRead(file) : app.vault.read(file);
  }

  function collectDailyPaths(app, period) {
    var core = required("WeeklyFilterCore");
    var dailyRoot = "DAILY/DAILY";
    var folder = app.vault.getAbstractFileByPath(dailyRoot);
    if (!folder) return [];
    var startStr = core.formatDate(period.start);
    var endStr = core.formatDate(period.end);
    var paths = [];
    var children = folder.children || [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (!child.path || !child.path.endsWith(".md")) continue;
      var stem = child.name.replace(/\.md$/i, "");
      if (stem >= startStr && stem <= endStr) paths.push(child.path);
    }
    return paths.sort();
  }

  async function buildReviewFromVault(app, weekStr) {
    var core = required("WeeklyFilterCore");
    var period = weekStr ? core.parseISOWeek(weekStr) : core.parseISOWeek(core.currentISOWeek(new Date()));
    if (!period) throw new Error("유효하지 않은 주차 형식입니다: " + weekStr);
    var paths = collectDailyPaths(app, period);
    var evidenceItems = [];
    var dailyPaths = [];
    for (var i = 0; i < paths.length; i++) {
      var text = await readDailyNote(app, paths[i]);
      if (!text) continue;
      var day = paths[i].split("/").pop().replace(/\.md$/i, "");
      var blocks = core.parseDailyEvidenceBlocks(text, day);
      for (var j = 0; j < blocks.length; j++) evidenceItems.push(blocks[j]);
      dailyPaths.push(paths[i]);
    }
    var review = core.buildWeeklyReview(evidenceItems, dailyPaths, period);
    return { review: review, evidenceItems: evidenceItems };
  }

  function mountWeeklyFilter(container, options) {
    var app = options && options.app;
    if (!app) throw new Error("app이 필요합니다.");
    var render = required("WeeklyFilterRender");
    var core = required("WeeklyFilterCore");
    if (root.WeeklyFilterStyles) root.WeeklyFilterStyles.ensureStyles();

    var wrapper = el(container, "div", { attr: { class: "weekly-filter-mount" } });
    var header = el(wrapper, "div", { attr: { class: "weekly-filter-header" } });
    el(header, "h2", { text: "주간 학습 리뷰", attr: { class: "weekly-filter-title" } });
    var weekLabel = el(header, "span", { text: "", attr: { class: "weekly-filter-week-label" } });
    var actions = el(header, "div", { attr: { class: "weekly-filter-actions" } });
    var refreshBtn = el(actions, "button", { text: "새로고침", attr: { type: "button", class: "weekly-filter-btn" } });
    var aiBtn = el(actions, "button", { text: "AI 학습 분석", attr: { type: "button", class: "weekly-filter-btn weekly-filter-btn-ai" } });
    var saveBtn = el(actions, "button", { text: "주간 리뷰 저장", attr: { type: "button", class: "weekly-filter-btn" } });
    var statusLine = el(wrapper, "p", { text: "", attr: { class: "weekly-filter-status" } });
    var contentArea = el(wrapper, "div", { attr: { class: "weekly-filter-content" } });

    var currentWeek = options && options.week ? options.week : core.currentISOWeek(new Date());
    var state = { review: null, evidenceItems: [], aiEnhanced: false, loading: false, aiLoading: false };

    function setStatus(msg, isError) {
      statusLine.textContent = msg || "";
      statusLine.setAttribute("class", "weekly-filter-status" + (isError ? " weekly-filter-status-error" : ""));
    }

    function renderCurrent() {
      contentArea.empty();
      if (state.review) render.renderWeeklyReview(contentArea, state.review);
    }

    async function load() {
      if (state.loading) return;
      state.loading = true;
      state.aiEnhanced = false;
      aiBtn.disabled = true;
      saveBtn.disabled = true;
      setStatus("주간 Evidence를 분석 중...");
      contentArea.empty();
      try {
        var result = await buildReviewFromVault(app, currentWeek);
        state.review = result.review;
        state.evidenceItems = result.evidenceItems;
        weekLabel.textContent = result.review.period.week + " (" + result.review.period.start + " ~ " + result.review.period.end + ")";
        setStatus("");
        renderCurrent();
        aiBtn.disabled = false;
        saveBtn.disabled = false;
      } catch (err) {
        setStatus("주간 리뷰를 생성하지 못했습니다: " + (err.message || err), true);
        contentArea.empty();
      } finally {
        state.loading = false;
      }
    }

    async function runAI() {
      if (state.aiLoading || !state.review || !state.evidenceItems.length) return;
      var ai = root.WeeklyFilterAI;
      if (!ai) { setStatus("WeeklyFilterAI 모듈이 로드되지 않았습니다.", true); return; }
      state.aiLoading = true;
      aiBtn.disabled = true;
      refreshBtn.disabled = true;
      saveBtn.disabled = true;
      setStatus("AI가 주간 Evidence를 분석 중입니다...");
      try {
        var aiResult = await ai.generateWeeklyAI({
          app: app,
          review: state.review,
          evidenceItems: state.evidenceItems
        });
        state.review = ai.mergeAIIntoReview(state.review, aiResult);
        state.aiEnhanced = true;
        setStatus("AI 학습 분석 완료 (" + (aiResult.provider || "") + " / " + (aiResult.model || "") + ")");
        renderCurrent();
      } catch (err) {
        setStatus("AI 분석 실패: " + (err.message || err) + " — deterministic 결과만 표시됩니다.", true);
      } finally {
        state.aiLoading = false;
        aiBtn.disabled = false;
        refreshBtn.disabled = false;
        saveBtn.disabled = false;
      }
    }

    async function saveReview() {
      if (!state.review || state.loading || state.aiLoading) return;
      var store = root.WeeklyReviewStore;
      if (!store) { setStatus("WeeklyReviewStore 모듈이 로드되지 않았습니다.", true); return; }
      saveBtn.disabled = true;
      setStatus("주간 리뷰를 저장 중입니다...");
      try {
        var result = await store.save(app, state.review);
        setStatus("주간 리뷰 저장 완료: " + result.path);
      } catch (err) {
        setStatus("주간 리뷰 저장 실패: " + (err.message || err), true);
      } finally {
        saveBtn.disabled = false;
      }
    }

    refreshBtn.onclick = function () { load(); };
    aiBtn.onclick = function () { runAI(); };
    saveBtn.onclick = function () { saveReview(); };
    load();
    return Object.freeze({ wrapper: wrapper, reload: load, runAI: runAI, save: saveReview });
  }

  var api = Object.freeze({ mountWeeklyFilter: mountWeeklyFilter, buildReviewFromVault: buildReviewFromVault });
  root.WeeklyFilterView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
