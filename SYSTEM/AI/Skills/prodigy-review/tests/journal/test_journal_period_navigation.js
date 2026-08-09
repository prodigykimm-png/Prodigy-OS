"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/journal-period-core.js"));
const controls = require(path.join(ROOT, "SYSTEM/Views/prodigy-adaptive-controls.js"));
const tokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

class Element {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.text = options.text || "";
    this.textContent = this.text;
    this.attributes = options.attr || {};
    this.value = this.attributes.value || "";
    this.children = [];
  }
  createEl(tag, options = {}) {
    const child = new Element(tag, options);
    this.children.push(child);
    return child;
  }
  empty() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() {}
}

function findAll(element, predicate, found = []) {
  if (predicate(element)) found.push(element);
  element.children.forEach((child) => findAll(child, predicate, found));
  return found;
}

function waitForRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  const currentMonth = core.periodKey("monthly", new Date());
  const previousMonth = core.shiftPeriod("monthly", currentMonth, -1);
  const previousQuarter = "2026-Q2";
  const previousYear = "2025";
  const previous = {
    JournalPeriodCore: global.JournalPeriodCore,
    ProdigyAdaptiveControls: global.ProdigyAdaptiveControls,
    ProdigyTokens: global.ProdigyTokens,
    JournalPeriodStore: global.JournalPeriodStore,
    MonthlyValidationView: global.MonthlyValidationView
  };
  const records = {
    monthly: [
      { key: currentMonth, display: core.periodDisplay("monthly", currentMonth), title: "현재 월간 기록", path: `DAILY/MONTHLY/${currentMonth}.md`, content: "현재 월간 기록 본문" },
      { key: previousMonth, display: core.periodDisplay("monthly", previousMonth), title: "이전 월간 기록", path: `DAILY/MONTHLY/${previousMonth}.md`, content: "이전 월간 기록 본문" }
    ],
    quarterly: [{ key: previousQuarter, display: core.periodDisplay("quarterly", previousQuarter), title: "이전 분기 기록", path: "DAILY/QUARTERLY/2026-Q2.md", content: "이전 분기 기록 본문" }],
    yearly: [{ key: previousYear, display: core.periodDisplay("yearly", previousYear), title: "이전 연간 기록", path: "DAILY/YEARLY/2025.md", content: "이전 연간 기록 본문" }]
  };
  let monthlyDestroyCount = 0;
  try {
    global.JournalPeriodCore = core;
    global.ProdigyAdaptiveControls = controls;
    global.ProdigyTokens = tokens;
    global.JournalPeriodStore = { listRecords: async (_app, periodId) => records[periodId] || [] };
    global.MonthlyValidationView = {
      mount: ({ container }) => {
        container.createEl("p", { text: "월간 검증" });
        return { destroy: () => { monthlyDestroyCount += 1; } };
      }
    };
    const viewPath = path.join(ROOT, "SYSTEM/Views/journal-period-view.js");
    delete require.cache[require.resolve(viewPath)];
    const view = require(viewPath);
    const root = new Element();
    const controller = view.mount({
      app: { vault: { getMarkdownFiles: () => [] } },
      container: root,
      logicalWidth: tokens.BREAKPOINTS.wide,
      renderDaily: (container) => container.createEl("p", { text: "Daily" }),
      renderWeekly: (container) => container.createEl("p", { text: "Weekly" })
    });

    controller.select("monthly");
    await waitForRender();
    assert.ok(findAll(root, (element) => element.text === "현재 월간 기록 본문").length, "Monthly shows the selected saved record");
    const previousMonthButton = findAll(root, (element) => element.tag === "button" && element.text === "이전 달")[0];
    assert.ok(previousMonthButton, "Monthly exposes previous-period navigation");
    await previousMonthButton.onclick();
    assert.ok(findAll(root, (element) => element.text === "이전 월간 기록 본문").length, "Monthly opens the previous saved record");
    const reviewButton = findAll(root, (element) => element.tag === "button" && element.text === "검증 화면 열기")[0];
    assert.ok(reviewButton, "Monthly saved records expose the validation child view");
    await reviewButton.onclick();

    controller.select("quarterly");
    await waitForRender();
    assert.equal(monthlyDestroyCount, 1, "switching periods destroys the Monthly child controller");
    assert.ok(findAll(root, (element) => element.text.includes("이전 분기 기록")).length, "Quarterly lists a saved prior record");
    const quarterRecordButton = findAll(root, (element) => element.tag === "button" && element.text.includes("이전 분기 기록"))[0];
    await quarterRecordButton.onclick();
    assert.ok(findAll(root, (element) => element.text === "이전 분기 기록 본문").length, "Quarterly opens the saved prior record");

    controller.select("yearly");
    await waitForRender();
    assert.ok(findAll(root, (element) => element.tag === "button" && element.text === "이전 해").length, "Yearly exposes previous-period navigation");
    const yearRecordButton = findAll(root, (element) => element.tag === "button" && element.text.includes("이전 연간 기록"))[0];
    await yearRecordButton.onclick();
    assert.ok(findAll(root, (element) => element.text === "이전 연간 기록 본문").length, "Yearly opens the saved prior record");
    console.log("Journal period navigation tests passed");
  } finally {
    delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/journal-period-view.js"))];
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
