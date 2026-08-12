(function (root) {
  "use strict";

  const SCHEMA_VERSION = "prodigy-nutrition-entry-v1";
  const IMPORT_SCHEMA = "prodigy-nutrition-import-v1";

  const MEALS = ["breakfast", "lunch", "dinner", "snack", "other"];
  const MEAL_ALIASES = {
    breakfast: "breakfast", 아침: "breakfast", 조식: "breakfast",
    lunch: "lunch", 점심: "lunch", 중식: "lunch",
    dinner: "dinner", 저녁: "dinner", 석식: "dinner",
    snack: "snack", 간식: "snack", 스낵: "snack",
    other: "other", 기타: "other",
  };

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function nonNegNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }
  function requiredNonNeg(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error("calories_kcal must be a non-negative number.");
    return Math.round(n * 100) / 100;
  }

  function normalizeMeal(value) {
    const key = clean(value).toLowerCase();
    return MEAL_ALIASES[key] || null;
  }

  function isValidDate(str) {
    return /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(new Date(`${str}T00:00:00`).getTime());
  }

  /**
   * Validate and normalize a nutrition entry.
   * @returns normalized entry object
   * @throws on invalid required fields
   */
  function normalizeEntry(input) {
    const entryId = clean(input.entry_id);
    if (!entryId) throw new Error("entry_id is required.");
    const date = clean(input.date);
    if (!isValidDate(date)) throw new Error("date must be YYYY-MM-DD.");
    const meal = normalizeMeal(input.meal);
    if (!meal) throw new Error(`Invalid meal: ${clean(input.meal)}`);
    const name = clean(input.name);
    if (!name) throw new Error("name is required.");
    const calories = requiredNonNeg(input.calories_kcal);
    const source = clean(input.source) || "manual";
    if (source !== "fatsecret" && source !== "manual") throw new Error(`Invalid source: ${source}`);

    return {
      schema_version: SCHEMA_VERSION,
      entry_id: entryId,
      date,
      meal,
      name,
      serving: clean(input.serving) || null,
      quantity: nonNegNumber(input.quantity),
      calories_kcal: calories,
      protein_g: nonNegNumber(input.protein_g),
      carbs_g: nonNegNumber(input.carbs_g),
      fat_g: nonNegNumber(input.fat_g),
      source,
      source_key: clean(input.source_key) || null,
      import_id: clean(input.import_id) || null,
      notes: clean(input.notes) || "",
      created_at: clean(input.created_at) || new Date().toISOString(),
      updated_at: clean(input.updated_at) || new Date().toISOString(),
    };
  }

  /**
   * Stable duplicate key for idempotent imports.
   * Identical rows get an ordinal suffix.
   */
  function duplicateKey(entry) {
    return `${entry.source}:${entry.date}:${entry.meal}:${entry.name}:${entry.calories_kcal}:${entry.serving || ""}:${entry.quantity || ""}`;
  }

  /**
   * Compute day totals for a given date.
   */
  function dayTotals(entries, date) {
    const day = (entries || []).filter((e) => e.date === date);
    const totals = { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, count: day.length };
    for (const e of day) {
      totals.calories_kcal += e.calories_kcal || 0;
      totals.protein_g += e.protein_g || 0;
      totals.carbs_g += e.carbs_g || 0;
      totals.fat_g += e.fat_g || 0;
    }
    totals.calories_kcal = Math.round(totals.calories_kcal * 10) / 10;
    totals.protein_g = Math.round(totals.protein_g * 10) / 10;
    totals.carbs_g = Math.round(totals.carbs_g * 10) / 10;
    totals.fat_g = Math.round(totals.fat_g * 10) / 10;
    return totals;
  }

  /**
   * Last 7 days daily totals ending at `endDate` (inclusive).
   * Returns array of { date, ...totals } sorted ascending.
   */
  function sevenDayTotals(entries, endDate) {
    const results = [];
    const end = new Date(`${endDate}T00:00:00`);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      results.push({ date: dateStr, ...dayTotals(entries, dateStr) });
    }
    return results;
  }

  /**
   * 7-day averages for kcal/P/C/F.
   */
  function sevenDayAverages(entries, endDate) {
    const days = sevenDayTotals(entries, endDate);
    const sum = { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    for (const d of days) {
      sum.calories_kcal += d.calories_kcal;
      sum.protein_g += d.protein_g;
      sum.carbs_g += d.carbs_g;
      sum.fat_g += d.fat_g;
    }
    return {
      calories_kcal: Math.round((sum.calories_kcal / 7) * 10) / 10,
      protein_g: Math.round((sum.protein_g / 7) * 10) / 10,
      carbs_g: Math.round((sum.carbs_g / 7) * 10) / 10,
      fat_g: Math.round((sum.fat_g / 7) * 10) / 10,
    };
  }

  /**
   * Group entries by meal for a given date.
   * Order: breakfast, lunch, dinner, snack, other
   */
  function mealSections(entries, date) {
    const day = (entries || []).filter((e) => e.date === date);
    const sections = {};
    for (const meal of MEALS) sections[meal] = [];
    for (const e of day) {
      const meal = MEALS.includes(e.meal) ? e.meal : "other";
      sections[meal].push(e);
    }
    return MEALS.map((meal) => ({ meal, entries: sections[meal] }));
  }

  // ─── FatSecret CSV Parser ────────────────────────────────────────────

  const FATSECRET_HEADER_ALIASES = {
    date: ["date", "날짜"],
    meal: ["meal", "끼니", "meal_type"],
    name: ["food", "name", "food_name", "음식", "음식명"],
    calories_kcal: ["calories", "kcal", "calories_kcal", "칼로리"],
    serving: ["serving", "serving_size", "1회 제공량"],
    quantity: ["quantity", "qty", "수량"],
    protein_g: ["protein", "protein_g", "단백질"],
    carbs_g: ["carbs", "carbohydrates", "carbs_g", "탄수화물"],
    fat_g: ["fat", "fat_g", "지방"],
  };

  function mapHeader(raw) {
    const key = clean(raw).toLowerCase().replace(/[\s_]+/g, "_");
    for (const [field, aliases] of Object.entries(FATSECRET_HEADER_ALIASES)) {
      if (aliases.some((a) => a.toLowerCase().replace(/[\s_]+/g, "_") === key)) return field;
    }
    return null;
  }

  /**
   * Parse FatSecret CSV text into preview + normalized entries.
   * @returns { headers, mapped, rows, entries, warnings, errors }
   */
  function parseFatSecretCsv(text, options = {}) {
    const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], mapped: {}, rows: [], entries: [], warnings: [], errors: ["CSV에 데이터 행이 없습니다."] };

    const rawHeaders = lines[0].split(",").map((h) => clean(h.replace(/^"|"$/g, "")));
    const mapped = {};
    const unmapped = [];
    rawHeaders.forEach((h, i) => {
      const field = mapHeader(h);
      if (field) mapped[field] = i;
      else unmapped.push(h);
    });

    const errors = [];
    if (mapped.date === undefined) errors.push("날짜(date) 열을 찾을 수 없습니다.");
    if (mapped.name === undefined) errors.push("음식명(food/name) 열을 찾을 수 없습니다.");
    if (mapped.calories_kcal === undefined) errors.push("칼로리(calories) 열을 찾을 수 없습니다.");
    if (errors.length) return { headers: rawHeaders, mapped, rows: [], entries: [], warnings: unmapped.length ? [`인식하지 못한 열: ${unmapped.join(", ")}`] : [], errors };

    const warnings = [];
    if (unmapped.length) warnings.push(`인식하지 못한 열: ${unmapped.join(", ")}`);

    const entries = [];
    const rows = [];
    const dupCounters = new Map();
    const importId = clean(options.import_id) || `import_${Date.now().toString(36)}`;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => clean(c.replace(/^"|"$/g, "")));
      const date = cols[mapped.date] || "";
      const name = cols[mapped.name] || "";
      const caloriesRaw = cols[mapped.calories_kcal] || "";

      if (!date || !name) {
        warnings.push(`행 ${i + 1}: 날짜 또는 음식명이 비어 있어 건너뜀`);
        continue;
      }
      if (!isValidDate(date)) {
        warnings.push(`행 ${i + 1}: 날짜 형식 오류 (${date})`);
        continue;
      }

      const calories = Number(caloriesRaw);
      if (!Number.isFinite(calories) || calories < 0) {
        warnings.push(`행 ${i + 1}: 칼로리 값 오류 (${caloriesRaw})`);
        continue;
      }

      const meal = mapped.meal !== undefined ? (normalizeMeal(cols[mapped.meal]) || "other") : "other";
      const baseKey = `fatsecret:${date}:${meal}:${name}:${calories}`;
      const count = (dupCounters.get(baseKey) || 0) + 1;
      dupCounters.set(baseKey, count);
      const sourceKey = `${baseKey}:${count}`;

      const entry = {
        schema_version: SCHEMA_VERSION,
        entry_id: `ne_${sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}`,
        date,
        meal,
        name,
        serving: mapped.serving !== undefined ? (clean(cols[mapped.serving]) || null) : null,
        quantity: mapped.quantity !== undefined ? nonNegNumber(cols[mapped.quantity]) : null,
        calories_kcal: Math.round(calories * 100) / 100,
        protein_g: mapped.protein_g !== undefined ? nonNegNumber(cols[mapped.protein_g]) : null,
        carbs_g: mapped.carbs_g !== undefined ? nonNegNumber(cols[mapped.carbs_g]) : null,
        fat_g: mapped.fat_g !== undefined ? nonNegNumber(cols[mapped.fat_g]) : null,
        source: "fatsecret",
        source_key: sourceKey,
        import_id: importId,
        notes: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      entries.push(entry);
      rows.push({ line: i + 1, date, meal, name, calories: entry.calories_kcal, status: "new" });
    }

    return { headers: rawHeaders, mapped, rows, entries, warnings, errors: [] };
  }

  /**
   * Build an import receipt (no raw file content stored).
   */
  function buildImportReceipt(options = {}) {
    return {
      schema_version: IMPORT_SCHEMA,
      import_id: clean(options.import_id) || `import_${Date.now().toString(36)}`,
      source: "fatsecret",
      file_basename: clean(options.file_basename) || "",
      file_sha256: clean(options.file_sha256) || "",
      imported_at: clean(options.imported_at) || new Date().toISOString(),
      entry_count: Number(options.entry_count) || 0,
      created_count: Number(options.created_count) || 0,
      updated_count: Number(options.updated_count) || 0,
      warning_count: Number(options.warning_count) || 0,
    };
  }

  const api = {
    SCHEMA_VERSION, IMPORT_SCHEMA, MEALS, MEAL_ALIASES,
    normalizeEntry, normalizeMeal, duplicateKey, isValidDate,
    dayTotals, sevenDayTotals, sevenDayAverages, mealSections,
    parseFatSecretCsv, buildImportReceipt, mapHeader,
  };
  root.WorkoutNutritionCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
