(function (root) {
  "use strict";

  const nutrition = root.WorkoutNutritionCore || (typeof require === "function" ? require("./workout-nutrition-core.js") : null);
  const healthStoreApi = root.WorkoutHealthStore || (typeof require === "function" ? require("./workout-health-store.js") : null);
  const storeApi = root.WorkoutStore || (typeof require === "function" ? require("./workout-store.js") : null);

  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function clean(v) { return String(v == null ? "" : v).trim(); }

  const MEAL_LABELS = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식", other: "기타" };

  /**
   * Render the nutrition tab panel.
   * @param app - Obsidian app
   * @param panel - DOM element (tabpanel)
   */
  async function renderNutritionPanel(app, panel) {
    if (!nutrition || !healthStoreApi || !storeApi) throw new Error("Nutrition modules are unavailable.");

    const adapter = storeApi.createObsidianAdapter(app);
    const store = healthStoreApi.createHealthStore(adapter);
    let selectedDate = today();
    let entries = [];

    async function loadEntries() {
      entries = await store.list("nutritionEntries");
    }

    function render() {
      panel.empty();

      // Date navigation
      const dateNav = panel.createDiv({ attr: { class: "workout-nutrition-date-nav" } });
      const prevBtn = dateNav.createEl("button", { text: "←", attr: { class: "workout-button workout-nav-btn", type: "button", "aria-label": "이전 날" } });
      dateNav.createEl("span", { text: selectedDate, attr: { class: "workout-nutrition-date-label" } });
      const nextBtn = dateNav.createEl("button", { text: "→", attr: { class: "workout-button workout-nav-btn", type: "button", "aria-label": "다음 날" } });
      if (selectedDate === today()) dateNav.createEl("span", { text: "오늘", attr: { class: "workout-muted workout-nutrition-today" } });

      prevBtn.onclick = () => { const d = new Date(`${selectedDate}T00:00:00`); d.setDate(d.getDate() - 1); selectedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; render(); };
      nextBtn.onclick = () => { const d = new Date(`${selectedDate}T00:00:00`); d.setDate(d.getDate() + 1); selectedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; render(); };

      // Day totals
      const totals = nutrition.dayTotals(entries, selectedDate);
      const summary = panel.createDiv({ attr: { class: "workout-nutrition-summary" } });
      const macros = [
        { label: "칼로리", value: `${totals.calories_kcal}`, unit: "kcal" },
        { label: "단백질", value: `${totals.protein_g}`, unit: "g" },
        { label: "탄수화물", value: `${totals.carbs_g}`, unit: "g" },
        { label: "지방", value: `${totals.fat_g}`, unit: "g" },
      ];
      macros.forEach((m) => {
        const chip = summary.createDiv({ attr: { class: "workout-nutrition-chip" } });
        chip.createEl("span", { text: m.label, attr: { class: "workout-nutrition-chip-label" } });
        chip.createEl("strong", { text: m.value, attr: { class: "workout-nutrition-chip-value" } });
        chip.createEl("span", { text: m.unit, attr: { class: "workout-nutrition-chip-unit" } });
      });

      // 7-day averages
      const avg = nutrition.sevenDayAverages(entries, selectedDate);
      const avgStrip = panel.createDiv({ attr: { class: "workout-nutrition-avg" } });
      avgStrip.createEl("span", { text: `7일 평균: ${avg.calories_kcal}kcal · 단 ${avg.protein_g}g · 탄 ${avg.carbs_g}g · 지 ${avg.fat_g}g`, attr: { class: "workout-muted" } });

      // Meal sections
      const sections = nutrition.mealSections(entries, selectedDate);
      const mealsArea = panel.createDiv({ attr: { class: "workout-nutrition-meals" } });
      for (const section of sections) {
        const mealDiv = mealsArea.createDiv({ attr: { class: "workout-nutrition-meal" } });
        const mealTotal = section.entries.reduce((sum, e) => sum + (e.calories_kcal || 0), 0);
        mealDiv.createEl("h3", { text: `${MEAL_LABELS[section.meal] || section.meal}${mealTotal ? ` · ${Math.round(mealTotal)}kcal` : ""}` });
        if (!section.entries.length) {
          mealDiv.createEl("p", { text: "기록 없음", attr: { class: "workout-muted workout-nutrition-empty-meal" } });
        } else {
          const list = mealDiv.createEl("ul", { attr: { class: "workout-nutrition-list" } });
          section.entries.forEach((e) => {
            const li = list.createEl("li");
            const nameSpan = li.createEl("span", { text: e.name, attr: { class: "workout-nutrition-food-name" } });
            const detailParts = [`${e.calories_kcal}kcal`];
            if (e.protein_g != null) detailParts.push(`단 ${e.protein_g}g`);
            if (e.carbs_g != null) detailParts.push(`탄 ${e.carbs_g}g`);
            if (e.fat_g != null) detailParts.push(`지 ${e.fat_g}g`);
            li.createEl("span", { text: detailParts.join(" · "), attr: { class: "workout-muted workout-nutrition-food-detail" } });
            if (e.source === "manual") li.createEl("span", { text: "수동", attr: { class: "workout-nutrition-source-tag" } });
          });
        }
      }

      // Actions
      const actions = panel.createDiv({ attr: { class: "workout-nutrition-actions" } });
      const importBtn = actions.createEl("button", { text: "FatSecret CSV 가져오기", attr: { class: "workout-button mod-cta", type: "button" } });
      const manualBtn = actions.createEl("button", { text: "직접 기록", attr: { class: "workout-button", type: "button" } });

      importBtn.onclick = () => openImportModal(app, store, () => { loadEntries().then(render); });
      manualBtn.onclick = () => openManualModal(app, store, selectedDate, () => { loadEntries().then(render); });
    }

    await loadEntries();
    render();
  }

  function openImportModal(app, store, onDone) {
    const ModalBase = (root.obsidian && root.obsidian.Modal) || (typeof root.Modal === "function" ? root.Modal : null);
    if (!ModalBase) { alert("모달을 열 수 없습니다."); return; }

    class NutritionImportModal extends ModalBase {
      onOpen() {
        this.contentEl.addClass("workout-modal");
        this.contentEl.createEl("h2", { text: "FatSecret CSV 가져오기" });
        this.contentEl.createEl("p", { text: "FatSecret 앱 → Food Diary → Export → CSV 파일을 선택하세요.", attr: { class: "workout-muted" } });
        const input = this.contentEl.createEl("input", { attr: { type: "file", accept: ".csv", "aria-label": "CSV 파일 선택" } });
        const previewArea = this.contentEl.createDiv({ attr: { class: "workout-import-preview" } });

        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          previewArea.empty();
          previewArea.createEl("p", { text: "파일을 읽는 중…" });
          try {
            const text = await file.text();
            const result = nutrition.parseFatSecretCsv(text, { import_id: `import_${Date.now().toString(36)}` });
            previewArea.empty();

            if (result.errors.length) {
              result.errors.forEach((e) => previewArea.createEl("p", { text: e, attr: { class: "workout-error" } }));
              return;
            }

            previewArea.createEl("p", { text: `${result.entries.length}개 항목을 찾았습니다.` });
            if (result.warnings.length) {
              const warnList = previewArea.createEl("ul", { attr: { class: "workout-import-warnings" } });
              result.warnings.slice(0, 10).forEach((w) => warnList.createEl("li", { text: w, attr: { class: "workout-muted" } }));
              if (result.warnings.length > 10) warnList.createEl("li", { text: `외 ${result.warnings.length - 10}개 경고`, attr: { class: "workout-muted" } });
            }

            // Preview table (first 5)
            const table = previewArea.createEl("table", { attr: { class: "workout-import-table" } });
            const thead = table.createEl("thead");
            const headRow = thead.createEl("tr");
            ["날짜", "끼니", "음식", "kcal", "단백질"].forEach((h) => headRow.createEl("th", { text: h }));
            const tbody = table.createEl("tbody");
            result.entries.slice(0, 5).forEach((e) => {
              const row = tbody.createEl("tr");
              row.createEl("td", { text: e.date });
              row.createEl("td", { text: MEAL_LABELS[e.meal] || e.meal });
              row.createEl("td", { text: e.name });
              row.createEl("td", { text: String(e.calories_kcal) });
              row.createEl("td", { text: e.protein_g != null ? String(e.protein_g) : "—" });
            });
            if (result.entries.length > 5) previewArea.createEl("p", { text: `외 ${result.entries.length - 5}개 항목`, attr: { class: "workout-muted" } });

            // Confirm
            const actions = previewArea.createDiv({ attr: { class: "workout-modal-actions" } });
            const confirmBtn = actions.createEl("button", { text: `${result.entries.length}개 가져오기`, attr: { class: "workout-button mod-cta", type: "button" } });
            confirmBtn.onclick = async () => {
              confirmBtn.disabled = true;
              confirmBtn.textContent = "가져오는 중…";
              try {
                const results = await store.upsertImported("nutritionEntries", result.entries, "source", "source_key");
                const created = results.filter((r) => r.created).length;
                const updated = results.filter((r) => !r.created && !r.skipped).length;
                // Save receipt
                const receipt = nutrition.buildImportReceipt({
                  import_id: result.entries[0] ? result.entries[0].import_id : "",
                  file_basename: file.name,
                  entry_count: result.entries.length,
                  created_count: created,
                  updated_count: updated,
                  warning_count: result.warnings.length,
                });
                await store.save("nutritionImports", receipt.import_id, receipt);
                this.close();
                const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
                if (Notice) new Notice(`식단 가져오기 완료: 신규 ${created}개, 갱신 ${updated}개`);
                if (onDone) onDone();
              } catch (err) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "다시 시도";
                previewArea.createEl("p", { text: `저장 실패: ${err.message}`, attr: { class: "workout-error" } });
              }
            };
          } catch (err) {
            previewArea.empty();
            previewArea.createEl("p", { text: `파일을 읽지 못했습니다: ${err.message}`, attr: { class: "workout-error" } });
          }
        };
      }
    }
    new NutritionImportModal(app).open();
  }

  function openManualModal(app, store, date, onDone) {
    const ModalBase = (root.obsidian && root.obsidian.Modal) || (typeof root.Modal === "function" ? root.Modal : null);
    if (!ModalBase) { alert("모달을 열 수 없습니다."); return; }

    class ManualEntryModal extends ModalBase {
      onOpen() {
        this.contentEl.addClass("workout-modal");
        this.contentEl.createEl("h2", { text: "식단 직접 기록" });

        const fields = this.contentEl.createDiv({ attr: { class: "workout-modal-grid" } });
        const nameInput = fields.createEl("input", { attr: { placeholder: "음식명 (필수)", "aria-label": "음식명" } });
        const mealSelect = fields.createEl("select", { attr: { "aria-label": "끼니" } });
        Object.entries(MEAL_LABELS).forEach(([key, label]) => mealSelect.createEl("option", { text: label, attr: { value: key } }));
        const calInput = fields.createEl("input", { attr: { type: "number", min: "0", placeholder: "칼로리 kcal (필수)", "aria-label": "칼로리" } });
        const proteinInput = fields.createEl("input", { attr: { type: "number", min: "0", placeholder: "단백질 g (선택)", "aria-label": "단백질" } });
        const carbsInput = fields.createEl("input", { attr: { type: "number", min: "0", placeholder: "탄수화물 g (선택)", "aria-label": "탄수화물" } });
        const fatInput = fields.createEl("input", { attr: { type: "number", min: "0", placeholder: "지방 g (선택)", "aria-label": "지방" } });

        const actions = this.contentEl.createDiv({ attr: { class: "workout-modal-actions" } });
        actions.createEl("button", { text: "취소", attr: { class: "workout-button", type: "button" } }).onclick = () => this.close();
        const saveBtn = actions.createEl("button", { text: "저장", attr: { class: "workout-button mod-cta", type: "button" } });
        saveBtn.onclick = async () => {
          const name = clean(nameInput.value);
          const cal = Number(calInput.value);
          if (!name) { nameInput.focus(); return; }
          if (!Number.isFinite(cal) || cal < 0) { calInput.focus(); return; }
          const entryId = `ne_manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          try {
            const entry = nutrition.normalizeEntry({
              entry_id: entryId,
              date,
              meal: mealSelect.value,
              name,
              calories_kcal: cal,
              protein_g: proteinInput.value || null,
              carbs_g: carbsInput.value || null,
              fat_g: fatInput.value || null,
              source: "manual",
            });
            await store.save("nutritionEntries", entryId, entry);
            this.close();
            const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
            if (Notice) new Notice(`${name} 기록을 저장했습니다.`);
            if (onDone) onDone();
          } catch (err) {
            const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
            if (Notice) new Notice(`저장 실패: ${err.message}`);
          }
        };
      }
    }
    new ManualEntryModal(app).open();
  }

  const api = { renderNutritionPanel, MEAL_LABELS };
  root.WorkoutNutritionView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
