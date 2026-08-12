(function (root) {
  "use strict";

  const running = root.WorkoutRunningCore || (typeof require === "function" ? require("./workout-running-core.js") : null);
  const projection = root.WorkoutRunningProjection || (typeof require === "function" ? require("./workout-running-projection.js") : null);
  const healthStoreApi = root.WorkoutHealthStore || (typeof require === "function" ? require("./workout-health-store.js") : null);
  const storeApi = root.WorkoutStore || (typeof require === "function" ? require("./workout-store.js") : null);
  const captureWriter = root.WorkoutCaptureWriter || (typeof require === "function" ? require("./workout-capture-writer.js") : null);
  const captureRuntime = root.CaptureActionRuntime || (typeof require === "function" ? require("./capture-action-runtime.js") : null);

  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function clean(v) { return String(v == null ? "" : v).trim(); }

  /**
   * Render the running tab panel.
   */
async function renderRunningPanel(app, panel) {
  // options is optional — { width, breakpoint }
  const opts = arguments[2] || {};
  if (!running || !projection || !healthStoreApi || !storeApi) throw new Error("Running modules are unavailable.");
  const isCurrent = typeof opts.isCurrent === "function" ? opts.isCurrent : () => true;

  const adapter = storeApi.createObsidianAdapter(app);
  const store = healthStoreApi.createHealthStore(adapter);
  const strengthStore = storeApi.createWorkoutStore(adapter);
  let renderGeneration = 0;

  async function loadAll() {
    const [activities, sessions] = await Promise.all([
      store.list("runActivities"),
      strengthStore.listSessions(),
    ]);
    return projection.buildRunningModel(activities, sessions);
  }

  function render() {
    const generation = ++renderGeneration;
    const previousError = panel.querySelector && panel.querySelector(".workout-panel-error");
    if (previousError) panel.empty();
    if (panel.setAttribute) panel.setAttribute("aria-busy", "true");
    let loading = panel.querySelector && panel.querySelector(".workout-panel-loading");
    if (!loading) {
      loading = panel.createEl("p", { text: "러닝 데이터를 불러오는 중…", attr: { class: "workout-muted workout-panel-loading", role: "status", "aria-live": "polite" } });
    }
    return loadAll().then(({ activities, legacy, all }) => {
      if (!isCurrent() || generation !== renderGeneration) return;
      if (panel.setAttribute) panel.setAttribute("aria-busy", "false");
      panel.empty();

      // Latest activity summary
      if (all.length) {
        const latest = all[0];
        const summaryCard = panel.createDiv({ attr: { class: "workout-running-latest prodigy-utility-card" } });
        summaryCard.createEl("h3", { text: "최근 활동" });
        const grid = summaryCard.createDiv({ attr: { class: "workout-running-stats" } });
        const stats = [
          { label: "거리", value: running.formatDistance(latest.distance_m) },
          { label: "시간", value: running.formatDuration(latest.elapsed_s) },
          { label: "페이스", value: running.formatPace(latest.pace_s_per_km) },
        ];
        if (latest.avg_hr) stats.push({ label: "평균 심박", value: `${latest.avg_hr} bpm` });
        if (latest.elevation_gain_m) stats.push({ label: "획득 고도", value: `${latest.elevation_gain_m} m` });
        if (latest.calories_kcal) stats.push({ label: "칼로리", value: `${latest.calories_kcal} kcal` });
        stats.forEach((s) => {
          const chip = grid.createDiv({ attr: { class: "workout-running-stat prodigy-utility-card" } });
          chip.createEl("span", { text: s.label, attr: { class: "workout-running-stat-label" } });
          chip.createEl("strong", { text: s.value, attr: { class: "workout-running-stat-value" } });
        });
        summaryCard.createEl("p", { text: clean(latest.start_time).slice(0, 16).replace("T", " "), attr: { class: "workout-muted" } });
        if (latest.data_quality === "summary_only") {
          summaryCard.createEl("p", { text: "요약 기록 (구간 정보 없음)", attr: { class: "workout-muted workout-running-quality" } });
        }

        // Splits
        if (latest.splits && latest.splits.length) {
          const splitsArea = panel.createDiv({ attr: { class: "workout-running-splits" } });
          splitsArea.createEl("h3", { text: "구간" });
          const table = splitsArea.createEl("table", { attr: { class: "workout-running-split-table" } });
          const thead = table.createEl("thead");
          const headRow = thead.createEl("tr");
          ["#", "거리", "시간", "페이스"].forEach((h) => headRow.createEl("th", { text: h }));
          const tbody = table.createEl("tbody");
          latest.splits.forEach((s) => {
            const row = tbody.createEl("tr");
            row.createEl("td", { text: String(s.split_index + 1) });
            row.createEl("td", { text: running.formatDistance(s.distance_m) });
            row.createEl("td", { text: running.formatDuration(s.duration_s) });
            row.createEl("td", { text: running.formatPace(s.pace_s_per_km) });
          });
        }
      } else {
        panel.createEl("p", { text: "러닝 기록이 없습니다. 파일을 가져오거나 직접 기록하세요.", attr: { class: "workout-empty" } });
      }

      // Weekly trends
      if (all.length) {
        const trends = running.weeklyTrends(all, today(), 6);
        const trendArea = panel.createDiv({ attr: { class: "workout-running-trends" } });
        trendArea.createEl("h3", { text: "최근 6주" });
        const trendGrid = trendArea.createDiv({ attr: { class: "workout-running-trend-grid" } });
        trends.forEach((w) => {
          const cell = trendGrid.createDiv({ attr: { class: "workout-running-trend-cell" } });
          cell.createEl("span", { text: w.start.slice(5), attr: { class: "workout-muted" } });
          cell.createEl("strong", { text: w.distance_m > 0 ? `${(w.distance_m / 1000).toFixed(1)} km` : "—" });
          cell.createEl("span", { text: w.count ? `${w.count}회` : "", attr: { class: "workout-muted" } });
        });

        // Weighted pace
        const avgPace = running.weightedAveragePace(all, today(), 4);
        if (avgPace) {
          trendArea.createEl("p", { text: `최근 4주 평균 페이스: ${running.formatPace(avgPace)}`, attr: { class: "workout-muted workout-running-avg-pace" } });
        }
      }

      // History list
      if (all.length > 1) {
        const historyArea = panel.createDiv({ attr: { class: "workout-running-history" } });
        historyArea.createEl("h3", { text: "활동 기록" });
        all.slice(0, 20).forEach((act) => {
          const row = historyArea.createDiv({ attr: { class: "workout-running-history-row" } });
          const info = row.createDiv({ attr: { class: "workout-running-history-info" } });
          info.createEl("strong", { text: running.formatDistance(act.distance_m) });
          info.createEl("span", { text: `${running.formatDuration(act.elapsed_s)} · ${running.formatPace(act.pace_s_per_km)}`, attr: { class: "workout-muted" } });
          const meta = row.createDiv({ attr: { class: "workout-running-history-meta" } });
          meta.createEl("span", { text: clean(act.start_time).slice(0, 10), attr: { class: "workout-muted" } });
          if (act.source === "legacy_quick_session") {
            meta.createEl("span", { text: act._legacy_title || "빠른 운동", attr: { class: "workout-running-legacy-tag" } });
          } else if (act.data_quality === "summary_only") {
            meta.createEl("span", { text: "요약", attr: { class: "workout-running-summary-tag" } });
          }
        });
      }

      // Actions
      const actions = panel.createDiv({ attr: { class: "workout-running-actions" } });
      const importBtn = actions.createEl("button", { text: "러닝 기록 가져오기", attr: { class: "prodigy-btn prodigy-btn-primary workout-button mod-cta", type: "button" } });
      const manualBtn = actions.createEl("button", { text: "직접 기록", attr: { class: "prodigy-btn workout-button", type: "button" } });
      const appleBtn = actions.createEl("button", { text: "Apple Health 과거 기록 1회 가져오기", attr: { class: "prodigy-btn workout-button", type: "button" } });

      importBtn.onclick = () => openRunImportModal(app, store, render);
      manualBtn.onclick = () => openRunManualModal(app, store, render);
      appleBtn.onclick = () => openAppleHealthModal(app, store, render);
    }).catch((err) => {
      if (!isCurrent() || generation !== renderGeneration) return;
      if (panel.setAttribute) panel.setAttribute("aria-busy", "false");
      panel.empty();
      panel.createEl("p", { text: `러닝 데이터를 불러오지 못했습니다: ${err.message}`, attr: { class: "workout-error" } });
      const retryBtn = panel.createEl("button", { text: "다시 시도", attr: { class: "prodigy-btn workout-button", type: "button" } });
      retryBtn.onclick = render;
    });
  }

  return render();
}

  function openRunImportModal(app, store, onDone) {
    const ModalBase = (root.obsidian && root.obsidian.Modal) || (typeof root.Modal === "function" ? root.Modal : null);
    if (!ModalBase) return;

    class RunImportModal extends ModalBase {
      onOpen() {
        this.contentEl.addClass("workout-modal");
        this.contentEl.createEl("h2", { text: "러닝 기록 가져오기" });
        this.contentEl.createEl("p", { text: "FIT, TCX, GPX 파일을 선택하세요. 위치 좌표는 저장되지 않습니다.", attr: { class: "workout-muted" } });
        const input = this.contentEl.createEl("input", { attr: { type: "file", accept: ".fit,.tcx,.gpx", "aria-label": "러닝 파일 선택" } });
        const previewArea = this.contentEl.createDiv({ attr: { class: "workout-import-preview" } });

        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          previewArea.empty();
          previewArea.createEl("p", { text: "파일을 분석하는 중…" });

          try {
            const ext = file.name.split(".").pop().toLowerCase();
            let result;

            if (ext === "tcx") {
              const text = await file.text();
              result = running.parseTcx(text);
              if (result.errors.length) { previewArea.empty(); result.errors.forEach((e) => previewArea.createEl("p", { text: e, attr: { class: "workout-error" } })); return; }
              this.showActivityPreview(previewArea, result.activity, file, store, onDone);
            } else if (ext === "gpx") {
              const text = await file.text();
              result = running.parseGpx(text);
              if (result.errors.length) { previewArea.empty(); result.errors.forEach((e) => previewArea.createEl("p", { text: e, attr: { class: "workout-error" } })); return; }
              this.showActivityPreview(previewArea, result.activity, file, store, onDone);
            } else if (ext === "fit") {
              const fitParser = root.WorkoutFitParser || (typeof require === "function" ? require("./workout-fit-parser.js") : null);
              if (!fitParser) { previewArea.empty(); previewArea.createEl("p", { text: "FIT 파서를 불러오지 못했습니다.", attr: { class: "workout-error" } }); return; }
              const arrayBuf = await file.arrayBuffer();
              const parsed = fitParser.parseFit(arrayBuf);
              const fitResult = fitParser.fitToRunActivity(parsed, {});
              if (fitResult.errors.length) { previewArea.empty(); fitResult.errors.forEach((e) => previewArea.createEl("p", { text: e, attr: { class: "workout-error" } })); return; }
              this.showActivityPreview(previewArea, fitResult.activity, file, store, onDone);
            } else {
              previewArea.empty();
              previewArea.createEl("p", { text: `지원하지 않는 형식입니다 (.${ext}). TCX, GPX를 사용하세요.`, attr: { class: "workout-error" } });
            }
          } catch (err) {
            previewArea.empty();
            previewArea.createEl("p", { text: `파일을 읽지 못했습니다: ${err.message}`, attr: { class: "workout-error" } });
          }
        };
      }

      showActivityPreview(area, activity, file, store, onDone) {
        area.empty();
        area.createEl("h3", { text: "활동 미리보기" });
        const stats = area.createEl("div", { attr: { class: "workout-running-stats" } });
        [
          { label: "거리", value: running.formatDistance(activity.distance_m) },
          { label: "시간", value: running.formatDuration(activity.elapsed_s) },
          { label: "페이스", value: running.formatPace(activity.pace_s_per_km) },
        ].forEach((s) => {
          const chip = stats.createDiv({ attr: { class: "workout-running-stat prodigy-utility-card" } });
          chip.createEl("span", { text: s.label, attr: { class: "workout-running-stat-label" } });
          chip.createEl("strong", { text: s.value });
        });
        area.createEl("p", { text: `시작: ${clean(activity.start_time).slice(0, 16).replace("T", " ")}`, attr: { class: "workout-muted" } });
        if (activity.splits && activity.splits.length) area.createEl("p", { text: `구간 ${activity.splits.length}개`, attr: { class: "workout-muted" } });

        const actions = area.createDiv({ attr: { class: "workout-modal-actions" } });
        const confirmBtn = actions.createEl("button", { text: "저장", attr: { class: "prodigy-btn prodigy-btn-primary workout-button mod-cta", type: "button" } });
        confirmBtn.onclick = async () => {
          confirmBtn.disabled = true;
          try {
            const importedAt = new Date().toISOString();
            const seed = running.buildRunImportReceipt({ file_basename: file.name, format: file.name.split(".").pop(), imported_at: importedAt });
            const outcome = await captureWriter.importRunning(
              store, projection, running, [activity], seed,
              captureRuntime.humanConfirmation("workout-running-import", importedAt)
            );
            if (outcome.review_required) {
              const review = outcome.capture.record;
              captureRuntime.renderReview(area, review, {
                confirm: async () => { await captureWriter.importRunning(store, projection, running, [activity], seed, captureRuntime.humanConfirmation("workout-running-import", importedAt), review); this.close(); if (onDone) onDone(); },
                reject: () => { captureRuntime.decideHumanReview(review, captureRuntime.humanConfirmation("workout-running-import", importedAt), "workout-running-import", "reject"); this.close(); },
                cancel: () => { captureRuntime.decideHumanReview(review, captureRuntime.humanConfirmation("workout-running-import", importedAt), "workout-running-import", "cancel"); this.close(); }
              });
              return;
            }
            this.close();
            const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
            if (Notice) new Notice("러닝 기록을 저장했습니다.");
            if (onDone) onDone();
          } catch (err) {
            confirmBtn.disabled = false;
            area.createEl("p", { text: `저장 실패: ${err.message}`, attr: { class: "workout-error" } });
          }
        };
      }
    }
    new RunImportModal(app).open();
  }

  function openRunManualModal(app, store, onDone) {
    const ModalBase = (root.obsidian && root.obsidian.Modal) || (typeof root.Modal === "function" ? root.Modal : null);
    if (!ModalBase) return;

    class RunManualModal extends ModalBase {
      onOpen() {
        this.contentEl.addClass("workout-modal");
        this.contentEl.createEl("h2", { text: "러닝 직접 기록" });
        const fields = this.contentEl.createDiv({ attr: { class: "workout-modal-grid" } });
        const dateInput = fields.createEl("input", { attr: { type: "date", value: today(), "aria-label": "날짜" } });
        const distInput = fields.createEl("input", { attr: { type: "number", min: "0", step: "0.01", placeholder: "거리 km (필수)", "aria-label": "거리" } });
        const durInput = fields.createEl("input", { attr: { placeholder: "시간 (예: 28:31 또는 1:02:03)", "aria-label": "시간" } });
        const rpeInput = fields.createEl("input", { attr: { type: "number", min: "1", max: "10", placeholder: "RPE 1-10 (선택)", "aria-label": "RPE" } });
        const notesInput = fields.createEl("input", { attr: { placeholder: "메모 (선택)", "aria-label": "메모" } });

        const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
        actions.createEl("button", { text: "취소", attr: { class: "prodigy-btn workout-button", type: "button" } }).onclick = () => this.close();
        const saveBtn = actions.createEl("button", { text: "저장", attr: { class: "prodigy-btn prodigy-btn-primary workout-button mod-cta", type: "button" } });
        saveBtn.onclick = async () => {
          const distKm = Number(distInput.value);
          if (!Number.isFinite(distKm) || distKm <= 0) { distInput.focus(); return; }
          const durParts = clean(durInput.value).split(":").map(Number);
          let durationS = null;
          if (durParts.length === 2 && durParts.every(Number.isFinite)) durationS = durParts[0] * 60 + durParts[1];
          else if (durParts.length === 3 && durParts.every(Number.isFinite)) durationS = durParts[0] * 3600 + durParts[1] * 60 + durParts[2];
          if (!durationS || durationS <= 0) { durInput.focus(); return; }

          const activityId = `run_manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          try {
            const activity = running.normalizeActivity({
              activity_id: activityId,
              start_time: `${dateInput.value}T07:00:00+09:00`,
              distance_m: Math.round(distKm * 1000),
              elapsed_s: durationS,
              rpe: rpeInput.value || null,
              notes: clean(notesInput.value),
              source: "manual",
            });
            await projection.saveActivities(store, [activity]);
            this.close();
            const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
            if (Notice) new Notice("러닝 기록을 저장했습니다.");
            if (onDone) onDone();
          } catch (err) {
            const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
            if (Notice) new Notice(`저장 실패: ${err.message}`);
          }
        };
      }
    }
    new RunManualModal(app).open();
  }

  function openAppleHealthModal(app, store, onDone) {
    const ModalBase = (root.obsidian && root.obsidian.Modal) || (typeof root.Modal === "function" ? root.Modal : null);
    if (!ModalBase) return;

    class AppleHealthModal extends ModalBase {
     onOpen() {
       this.contentEl.addClass("workout-modal");
       this.contentEl.createEl("h2", { text: "Apple Health 과거 기록 1회 가져오기" });
       // Apple Health import UX: manual, one-time, running-only, confirm-first
       const infoBanner = this.contentEl.createDiv({ attr: { class: "workout-ah-info" } });
       infoBanner.createEl("div", { text: "수동 파일 가져오기 (1회)", attr: { class: "workout-ah-info-title" } });
       infoBanner.createEl("p", { text: "iPhone 건강 앱 → 프로필 → 모든 건강 데이터 내보내기 → 생성된 export.xml 파일을 직접 선택하세요. 자동 동기화가 아닌 수동 1회 파일 가져오기입니다.", attr: { class: "workout-muted" } });
       const badges = infoBanner.createDiv({ attr: { class: "workout-ah-badges" } });
       badges.createEl("span", { text: "러닝만", attr: { class: "workout-ah-badge is-info" } });
       badges.createEl("span", { text: "자동 아님", attr: { class: "workout-ah-badge is-warn" } });
       badges.createEl("span", { text: "확인 후 저장", attr: { class: "workout-ah-badge is-warn" } });
       this.contentEl.createEl("p", { text: "HKWorkoutActivityTypeRunning 항목만 가져옵니다. 위치 좌표는 저장되지 않습니다.", attr: { class: "workout-muted" } });
        const input = this.contentEl.createEl("input", { attr: { type: "file", accept: ".xml", "aria-label": "Apple Health XML 선택" } });
        const statusArea = this.contentEl.createDiv({ attr: { class: "workout-import-preview" } });

        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          statusArea.empty();
          statusArea.createEl("p", { text: "큰 파일을 읽는 중… (수 초 소요될 수 있습니다)" });

          try {
            const text = await file.text();
            const result = running.parseAppleHealthXml(text);
            statusArea.empty();

            if (result.errors.length) {
              result.errors.forEach((e) => statusArea.createEl("p", { text: e, attr: { class: "workout-error" } }));
              return;
            }

            if (!result.activities.length) {
              statusArea.createEl("p", { text: "러닝 기록을 찾지 못했습니다.", attr: { class: "workout-muted" } });
              if (result.warnings.length) result.warnings.forEach((w) => statusArea.createEl("p", { text: w, attr: { class: "workout-muted" } }));
              return;
            }

            statusArea.createEl("p", { text: `러닝 기록 ${result.activities.length}개를 찾았습니다.` });
            if (result.warnings.length) {
              const warnList = statusArea.createEl("ul");
              result.warnings.slice(0, 5).forEach((w) => warnList.createEl("li", { text: w, attr: { class: "workout-muted" } }));
            }

            const actions = statusArea.createDiv({ attr: { class: "workout-modal-actions" } });
            const confirmBtn = actions.createEl("button", { text: `${result.activities.length}개 가져오기`, attr: { class: "prodigy-btn prodigy-btn-primary workout-button mod-cta", type: "button" } });
            confirmBtn.onclick = async () => {
              confirmBtn.disabled = true;
              confirmBtn.textContent = "가져오는 중…";
              try {
                const importedAt = new Date().toISOString();
                const seed = running.buildRunImportReceipt({ source: "apple_health", file_basename: file.name, format: "xml", imported_at: importedAt });
                const outcome = await captureWriter.importRunning(
                  store, projection, running, result.activities, seed,
                  captureRuntime.humanConfirmation("workout-apple-health-import", importedAt)
                );
                if (outcome.review_required) {
                  const review = outcome.capture.record;
                  captureRuntime.renderReview(statusArea, review, {
                    confirm: async () => { await captureWriter.importRunning(store, projection, running, result.activities, seed, captureRuntime.humanConfirmation("workout-apple-health-import", importedAt), review); this.close(); if (onDone) onDone(); },
                    reject: () => { captureRuntime.decideHumanReview(review, captureRuntime.humanConfirmation("workout-apple-health-import", importedAt), "workout-apple-health-import", "reject"); this.close(); },
                    cancel: () => { captureRuntime.decideHumanReview(review, captureRuntime.humanConfirmation("workout-apple-health-import", importedAt), "workout-apple-health-import", "cancel"); this.close(); }
                  });
                  return;
                }
                const saved = outcome.result.saved;
                const createdCount = saved.filter((item) => item.created).length;
                const duplicateCount = saved.filter((item) => item.duplicate).length;
                this.close();
                const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
                if (Notice) new Notice(`Apple Health 러닝 ${createdCount}개 추가 · 중복 ${duplicateCount}개`);
                if (onDone) onDone();
              } catch (err) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "다시 시도";
                statusArea.createEl("p", { text: `저장 실패: ${err.message}`, attr: { class: "workout-error" } });
              }
            };
          } catch (err) {
            statusArea.empty();
            statusArea.createEl("p", { text: `파일을 읽지 못했습니다: ${err.message}`, attr: { class: "workout-error" } });
          }
        };
      }
    }
    new AppleHealthModal(app).open();
  }

  const api = { renderRunningPanel };
  root.WorkoutRunningView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
