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
    el(header, "p", { text: "이번 주에 무엇이 반복되었고 무엇을 배웠는지 살펴봅니다.", attr: { class: "weekly-filter-role" } });
    var weekLabel = el(header, "span", { text: "", attr: { class: "weekly-filter-week-label" } });
    var periodControls = el(header, "div", { attr: { class: "weekly-filter-period-controls", "aria-label": "주간 기준 날짜" } });
    var previousWeekBtn = el(periodControls, "button", { text: "이전 주", attr: { type: "button", class: "weekly-filter-btn" } });
    var dateInput = el(periodControls, "input", { attr: { type: "date", class: "weekly-filter-date-input", "aria-label": "주간 기준 날짜" } });
    var nextWeekBtn = el(periodControls, "button", { text: "다음 주", attr: { type: "button", class: "weekly-filter-btn" } });
    var todayBtn = el(periodControls, "button", { text: "오늘", attr: { type: "button", class: "weekly-filter-btn" } });
    var actions = el(header, "div", { attr: { class: "weekly-filter-actions" } });
    var refreshBtn = el(actions, "button", { text: "새로고침", attr: { type: "button", class: "weekly-filter-btn" } });
    var aiBtn = el(actions, "button", { text: "AI 학습 분석", attr: { type: "button", class: "weekly-filter-btn weekly-filter-btn-ai" } });
    var saveBtn = el(actions, "button", { text: "주간 리뷰 저장", attr: { type: "button", class: "weekly-filter-btn" } });
    var statusLine = el(wrapper, "p", { text: "", attr: { class: "weekly-filter-status", role: "status", "aria-live": "polite" } });
    var contentArea = el(wrapper, "div", { attr: { class: "weekly-filter-content" } });

    var selectedDate = options && options.initialDate ? options.initialDate : core.formatDate(new Date());
    var currentWeek = options && options.week ? options.week : core.isoWeekForDate(selectedDate);
    if (!currentWeek) {
      selectedDate = core.formatDate(new Date());
      currentWeek = core.currentISOWeek(new Date());
    }
    dateInput.value = selectedDate;
    var state = { review: null, evidenceItems: [], aiEnhanced: false, loading: false, aiLoading: false, saving: false, aiRequestId: 0, aiAbortController: null, loadRequestId: 0, loadPromise: null, destroyed: false };

    function setStatus(msg, isError) {
      statusLine.textContent = msg || "";
      statusLine.setAttribute("class", "weekly-filter-status" + (isError ? " weekly-filter-status-error" : ""));
    }
    function setBusy(busy) {
      wrapper.setAttribute("aria-busy", busy ? "true" : "false");
      contentArea.setAttribute("aria-busy", busy ? "true" : "false");
    }

    function renderCurrent() {
      contentArea.empty();
      if (state.review) render.renderWeeklyReview(contentArea, state.review);
    }

    function load() {
      if (state.destroyed) return null;
      if (state.loading) return state.loadPromise;
      if (state.saving || state.aiLoading) return null;
      var loadRequestId = state.loadRequestId + 1;
      state.loadRequestId = loadRequestId;
      state.loading = true;
      setBusy(true);
      refreshBtn.textContent = "새로고침";
      refreshBtn.disabled = false;
      aiBtn.disabled = !state.review || !state.evidenceItems.length;
      saveBtn.disabled = !state.review;
      setStatus("주간 Evidence를 분석 중...");
      var promise = (async function () {
        try {
          var result = await buildReviewFromVault(app, currentWeek);
          var savedReview = root.WeeklyReviewStore && typeof root.WeeklyReviewStore.read === "function"
            ? await root.WeeklyReviewStore.read(app, currentWeek)
            : null;
          if (state.destroyed || loadRequestId !== state.loadRequestId) return null;
          if (savedReview) result.review = savedReview;
          state.review = result.review;
          state.evidenceItems = result.evidenceItems;
          state.aiEnhanced = false;
          weekLabel.textContent = result.review.period.week + " (" + result.review.period.start + " ~ " + result.review.period.end + ")";
          setStatus(savedReview ? "저장된 Weekly 리뷰를 불러왔습니다." : "");
          renderCurrent();
          aiBtn.disabled = !state.evidenceItems.length;
          saveBtn.disabled = false;
          return result;
        } catch (err) {
          if (state.destroyed || loadRequestId !== state.loadRequestId) return null;
          var prior = state.review ? " 이전 결과를 유지합니다." : "";
          setStatus("주간 리뷰를 새로고침하지 못했습니다: " + (err.message || err) + "." + prior + " 다시 시도해 주세요.", true);
          refreshBtn.textContent = "다시 시도";
          aiBtn.disabled = !state.review || !state.evidenceItems.length;
          saveBtn.disabled = !state.review;
          return null;
        } finally {
          if (loadRequestId === state.loadRequestId) {
            state.loading = false;
            state.loadPromise = null;
            setBusy(state.aiLoading);
          }
        }
      })();
      state.loadPromise = promise;
      return promise;
    }

    function loadForDate(nextDate) {
      if (state.destroyed || state.loading || state.saving || state.aiLoading) {
        setStatus("현재 작업이 끝난 뒤 주차를 변경해 주세요.", true);
        return Promise.resolve();
      }
      var nextWeek = core.isoWeekForDate(nextDate);
      if (!nextWeek) {
        setStatus("유효한 날짜를 선택해 주세요.", true);
        dateInput.value = selectedDate;
        return Promise.resolve();
      }
      selectedDate = nextDate;
      currentWeek = nextWeek;
      dateInput.value = selectedDate;
      return load();
    }

    async function runAI() {
      if (state.destroyed || state.loading || state.aiLoading || state.saving || !state.review || !state.evidenceItems.length) return null;
      var ai = root.WeeklyFilterAI;
      if (!ai) { setStatus("WeeklyFilterAI 모듈이 로드되지 않았습니다.", true); return null; }
      var requestId = state.aiRequestId + 1;
      state.aiRequestId = requestId;
      var AbortControllerCtor = typeof root.AbortController === "function"
        ? root.AbortController
        : (typeof AbortController === "function" ? AbortController : null);
      var abortController = AbortControllerCtor ? new AbortControllerCtor() : null;
      state.aiAbortController = abortController;
      state.aiLoading = true;
      setBusy(true);
      aiBtn.disabled = false;
      aiBtn.textContent = "AI 분석 취소";
      refreshBtn.disabled = true;
      saveBtn.disabled = true;
      setStatus("AI가 주간 Evidence를 분석 중입니다...");
      try {
        var aiResult = await ai.generateWeeklyAI({
          app: app,
          review: state.review,
          evidenceItems: state.evidenceItems,
          signal: abortController ? abortController.signal : undefined
        });
        if (requestId !== state.aiRequestId || !state.aiLoading) return null;
        state.review = ai.mergeAIIntoReview(state.review, aiResult);
        state.aiEnhanced = true;
        setStatus("AI 학습 분석 완료 (" + (aiResult.provider || "") + " / " + (aiResult.model || "") + ")");
        renderCurrent();
        return aiResult;
      } catch (err) {
        if (requestId !== state.aiRequestId || !state.aiLoading) return null;
        setStatus("AI 분석 실패: " + (err.message || err) + " — deterministic 결과만 표시됩니다.", true);
        return null;
      } finally {
        if (requestId === state.aiRequestId) {
          state.aiLoading = false;
          state.aiAbortController = null;
          aiBtn.disabled = false;
          aiBtn.textContent = "AI 학습 분석";
          refreshBtn.disabled = false;
          saveBtn.disabled = false;
          setBusy(state.loading);
        }
      }
    }

    function cancelAI() {
      if (!state.aiLoading) return false;
      state.aiRequestId += 1;
      if (state.aiAbortController && typeof state.aiAbortController.abort === "function") {
        state.aiAbortController.abort();
      }
      state.aiAbortController = null;
      state.aiLoading = false;
      setBusy(state.loading);
      aiBtn.disabled = false;
      aiBtn.textContent = "AI 학습 분석";
      refreshBtn.disabled = false;
      saveBtn.disabled = false;
      setStatus("AI 분석을 취소했습니다. 결정적 결과를 유지합니다.");
      return true;
    }

    async function saveReview() {
      if (state.destroyed || !state.review || state.loading || state.aiLoading || state.saving) return null;
      var store = root.WeeklyReviewStore;
      if (!store) { setStatus("WeeklyReviewStore 모듈이 로드되지 않았습니다.", true); return null; }
      state.saving = true;
      saveBtn.disabled = true;
      setStatus("주간 리뷰를 저장 중입니다...");
      try {
        var result = await store.save(app, state.review);
        if (!state.destroyed) setStatus("주간 리뷰 저장 완료: " + result.path);
        return result;
      } catch (err) {
        if (!state.destroyed) setStatus("주간 리뷰 저장 실패: " + (err.message || err), true);
        return null;
      } finally {
        state.saving = false;
        if (!state.destroyed) saveBtn.disabled = false;
      }
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.loadRequestId += 1;
      state.aiRequestId += 1;
      if (state.aiAbortController && typeof state.aiAbortController.abort === "function") {
        state.aiAbortController.abort();
      }
      state.aiAbortController = null;
      state.aiLoading = false;
      state.loading = false;
      state.loadPromise = null;
      setBusy(false);
    }

    refreshBtn.onclick = function () { return load(); };
    previousWeekBtn.onclick = function () { return loadForDate(core.shiftISODate(selectedDate, -7)); };
    nextWeekBtn.onclick = function () { return loadForDate(core.shiftISODate(selectedDate, 7)); };
    todayBtn.onclick = function () { return loadForDate(core.formatDate(new Date())); };
    dateInput.onchange = function () { return loadForDate(dateInput.value); };
    aiBtn.onclick = function () { return state.aiLoading ? cancelAI() : runAI(); };
    saveBtn.onclick = function () { return saveReview(); };
    var ready = load();
    return Object.freeze({ wrapper: wrapper, ready: ready, reload: load, selectDate: loadForDate, runAI: runAI, cancelAI: cancelAI, save: saveReview, destroy: destroy });
  }

  var api = Object.freeze({ mountWeeklyFilter: mountWeeklyFilter, buildReviewFromVault: buildReviewFromVault });
  root.WeeklyFilterView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
