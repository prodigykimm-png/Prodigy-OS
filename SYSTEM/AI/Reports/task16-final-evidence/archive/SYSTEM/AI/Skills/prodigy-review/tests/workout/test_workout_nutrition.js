"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const nutrition = require(path.join(ROOT, "SYSTEM/Views/workout-nutrition-core.js"));

function testNormalizeEntry() {
  const entry = nutrition.normalizeEntry({
    entry_id: "ne_001",
    date: "2026-07-20",
    meal: "lunch",
    name: "닭가슴살 샐러드",
    calories_kcal: 350,
    protein_g: 42,
    carbs_g: 15,
    fat_g: 8,
    source: "manual",
  });
  assert.equal(entry.schema_version, "prodigy-nutrition-entry-v1");
  assert.equal(entry.entry_id, "ne_001");
  assert.equal(entry.meal, "lunch");
  assert.equal(entry.calories_kcal, 350);
  assert.equal(entry.protein_g, 42);
  assert.equal(entry.source, "manual");
  assert.equal(entry.source_key, null);
}

function testInvalidEntries() {
  // Missing entry_id
  assert.throws(() => nutrition.normalizeEntry({ date: "2026-07-20", meal: "lunch", name: "X", calories_kcal: 100 }), /entry_id/);
  // Invalid date
  assert.throws(() => nutrition.normalizeEntry({ entry_id: "x", date: "20-07-2026", meal: "lunch", name: "X", calories_kcal: 100 }), /date/);
  // Invalid meal
  assert.throws(() => nutrition.normalizeEntry({ entry_id: "x", date: "2026-07-20", meal: "brunch", name: "X", calories_kcal: 100 }), /meal/i);
  // Missing name
  assert.throws(() => nutrition.normalizeEntry({ entry_id: "x", date: "2026-07-20", meal: "lunch", name: "", calories_kcal: 100 }), /name/);
  // Negative calories
  assert.throws(() => nutrition.normalizeEntry({ entry_id: "x", date: "2026-07-20", meal: "lunch", name: "X", calories_kcal: -5 }), /calories/);
  // NaN calories
  assert.throws(() => nutrition.normalizeEntry({ entry_id: "x", date: "2026-07-20", meal: "lunch", name: "X", calories_kcal: "abc" }), /calories/);
  // Invalid source
  assert.throws(() => nutrition.normalizeEntry({ entry_id: "x", date: "2026-07-20", meal: "lunch", name: "X", calories_kcal: 100, source: "myfitnesspal" }), /source/);
}

function testZeroVsNull() {
  const entry = nutrition.normalizeEntry({
    entry_id: "ne_zero",
    date: "2026-07-20",
    meal: "snack",
    name: "제로 콜라",
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: null,
    fat_g: "",
  });
  assert.equal(entry.calories_kcal, 0);
  assert.equal(entry.protein_g, 0);
  assert.equal(entry.carbs_g, null);
  assert.equal(entry.fat_g, null);
}

function testMealAliases() {
  assert.equal(nutrition.normalizeMeal("아침"), "breakfast");
  assert.equal(nutrition.normalizeMeal("점심"), "lunch");
  assert.equal(nutrition.normalizeMeal("저녁"), "dinner");
  assert.equal(nutrition.normalizeMeal("간식"), "snack");
  assert.equal(nutrition.normalizeMeal("Breakfast"), "breakfast");
  assert.equal(nutrition.normalizeMeal("LUNCH"), "lunch");
  assert.equal(nutrition.normalizeMeal("기타"), "other");
  assert.equal(nutrition.normalizeMeal("brunch"), null);
}

function testDayTotals() {
  const entries = [
    { date: "2026-07-20", meal: "breakfast", calories_kcal: 400, protein_g: 20, carbs_g: 50, fat_g: 10 },
    { date: "2026-07-20", meal: "lunch", calories_kcal: 600, protein_g: 40, carbs_g: 70, fat_g: 15 },
    { date: "2026-07-20", meal: "dinner", calories_kcal: 500, protein_g: 35, carbs_g: 55, fat_g: 12 },
    { date: "2026-07-21", meal: "breakfast", calories_kcal: 300, protein_g: 15, carbs_g: 40, fat_g: 8 },
  ];
  const totals = nutrition.dayTotals(entries, "2026-07-20");
  assert.equal(totals.calories_kcal, 1500);
  assert.equal(totals.protein_g, 95);
  assert.equal(totals.carbs_g, 175);
  assert.equal(totals.fat_g, 37);
  assert.equal(totals.count, 3);

  // Empty day
  const empty = nutrition.dayTotals(entries, "2026-07-19");
  assert.equal(empty.calories_kcal, 0);
  assert.equal(empty.count, 0);
}

function testSevenDayTotals() {
  const entries = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 6, 14 + i); // July 14-20
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    entries.push({ date: dateStr, meal: "lunch", calories_kcal: 500 + i * 100, protein_g: 30, carbs_g: 60, fat_g: 10 });
  }
  const days = nutrition.sevenDayTotals(entries, "2026-07-20");
  assert.equal(days.length, 7);
  assert.equal(days[0].date, "2026-07-14");
  assert.equal(days[6].date, "2026-07-20");
  assert.equal(days[0].calories_kcal, 500);
  assert.equal(days[6].calories_kcal, 1100);
}

function testSevenDayAverages() {
  const entries = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 6, 14 + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    entries.push({ date: dateStr, meal: "lunch", calories_kcal: 700, protein_g: 50, carbs_g: 80, fat_g: 20 });
  }
  const avg = nutrition.sevenDayAverages(entries, "2026-07-20");
  assert.equal(avg.calories_kcal, 700);
  assert.equal(avg.protein_g, 50);
  assert.equal(avg.carbs_g, 80);
  assert.equal(avg.fat_g, 20);
}

function testMealSections() {
  const entries = [
    { date: "2026-07-20", meal: "dinner", name: "A", calories_kcal: 100 },
    { date: "2026-07-20", meal: "breakfast", name: "B", calories_kcal: 200 },
    { date: "2026-07-20", meal: "breakfast", name: "C", calories_kcal: 150 },
    { date: "2026-07-20", meal: "snack", name: "D", calories_kcal: 50 },
    { date: "2026-07-21", meal: "lunch", name: "E", calories_kcal: 300 },
  ];
  const sections = nutrition.mealSections(entries, "2026-07-20");
  assert.equal(sections.length, 5); // breakfast, lunch, dinner, snack, other
  assert.equal(sections[0].meal, "breakfast");
  assert.equal(sections[0].entries.length, 2);
  assert.equal(sections[1].meal, "lunch");
  assert.equal(sections[1].entries.length, 0);
  assert.equal(sections[2].meal, "dinner");
  assert.equal(sections[2].entries.length, 1);
  assert.equal(sections[3].meal, "snack");
  assert.equal(sections[3].entries.length, 1);
}

function testDuplicateKey() {
  const e1 = { source: "fatsecret", date: "2026-07-20", meal: "lunch", name: "밥", calories_kcal: 300, serving: "1공기", quantity: 1 };
  const e2 = { source: "fatsecret", date: "2026-07-20", meal: "lunch", name: "밥", calories_kcal: 300, serving: "1공기", quantity: 1 };
  const e3 = { source: "manual", date: "2026-07-20", meal: "lunch", name: "밥", calories_kcal: 300, serving: "1공기", quantity: 1 };
  assert.equal(nutrition.duplicateKey(e1), nutrition.duplicateKey(e2));
  assert.notEqual(nutrition.duplicateKey(e1), nutrition.duplicateKey(e3));
}

function testFatSecretCsvParse() {
  const csv = [
    "Date,Meal,Food,Calories,Protein,Carbs,Fat,Serving",
    "2026-07-20,Breakfast,계란후라이,150,12,1,10,1개",
    "2026-07-20,Lunch,닭가슴살 샐러드,350,42,15,8,1볼",
    "2026-07-20,Dinner,김치찌개,450,25,30,20,1그릇",
    "2026-07-21,Snack,프로틴바,200,20,15,5,1개",
  ].join("\n");

  const result = nutrition.parseFatSecretCsv(csv, { import_id: "imp_test" });
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 4);
  assert.equal(result.entries[0].meal, "breakfast");
  assert.equal(result.entries[0].name, "계란후라이");
  assert.equal(result.entries[0].calories_kcal, 150);
  assert.equal(result.entries[0].protein_g, 12);
  assert.equal(result.entries[0].source, "fatsecret");
  assert.equal(result.entries[0].import_id, "imp_test");
  assert.equal(result.entries[1].meal, "lunch");
  assert.equal(result.entries[3].date, "2026-07-21");
}

function testFatSecretCsvKoreanHeaders() {
  const csv = [
    "날짜,끼니,음식명,칼로리,단백질,탄수화물,지방",
    "2026-07-20,아침,토스트,250,8,35,7",
    "2026-07-20,점심,비빔밥,550,20,80,12",
  ].join("\n");

  const result = nutrition.parseFatSecretCsv(csv);
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].meal, "breakfast");
  assert.equal(result.entries[1].meal, "lunch");
  assert.equal(result.entries[1].carbs_g, 80);
}

function testFatSecretCsvErrors() {
  // Missing required columns
  const csv1 = "Food,Protein\n밥,10";
  const r1 = nutrition.parseFatSecretCsv(csv1);
  assert.ok(r1.errors.length > 0);
  assert.ok(r1.errors.some((e) => /날짜|date/i.test(e)));

  // Empty CSV
  const r2 = nutrition.parseFatSecretCsv("");
  assert.ok(r2.errors.length > 0);

  // Invalid rows get warnings, not errors
  const csv3 = [
    "Date,Food,Calories",
    "2026-07-20,밥,300",
    "invalid-date,국,100",
    "2026-07-20,,200",
    "2026-07-20,반찬,abc",
  ].join("\n");
  const r3 = nutrition.parseFatSecretCsv(csv3);
  assert.equal(r3.errors.length, 0);
  assert.equal(r3.entries.length, 1); // only the valid row
  assert.ok(r3.warnings.length >= 2);
}

function testSourceSeparation() {
  // Manual entries have source=manual, imported have source=fatsecret
  const manual = nutrition.normalizeEntry({ entry_id: "m1", date: "2026-07-20", meal: "lunch", name: "수정된 밥", calories_kcal: 280, source: "manual" });
  assert.equal(manual.source, "manual");
  assert.equal(manual.source_key, null);

  const csv = "Date,Food,Calories\n2026-07-20,밥,300";
  const parsed = nutrition.parseFatSecretCsv(csv);
  assert.equal(parsed.entries[0].source, "fatsecret");
  assert.ok(parsed.entries[0].source_key);
}

function testImportReceipt() {
  const receipt = nutrition.buildImportReceipt({
    import_id: "imp_001",
    file_basename: "diet_export.csv",
    file_sha256: "abc123",
    entry_count: 10,
    created_count: 8,
    updated_count: 2,
    warning_count: 1,
  });
  assert.equal(receipt.schema_version, "prodigy-nutrition-import-v1");
  assert.equal(receipt.source, "fatsecret");
  assert.equal(receipt.file_basename, "diet_export.csv");
  assert.equal(receipt.entry_count, 10);
  // No raw file content
  assert.ok(!receipt.raw_content);
  assert.ok(!receipt.csv_text);
}

function main() {
  testNormalizeEntry();
  testInvalidEntries();
  testZeroVsNull();
  testMealAliases();
  testDayTotals();
  testSevenDayTotals();
  testSevenDayAverages();
  testMealSections();
  testDuplicateKey();
  testFatSecretCsvParse();
  testFatSecretCsvKoreanHeaders();
  testFatSecretCsvErrors();
  testSourceSeparation();
  testImportReceipt();
  console.log("Workout Nutrition Core tests passed");
}

main();
