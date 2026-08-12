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
    this.attributes = options.attr || {};
    this.children = [];
  }
  createEl(tag, options = {}) {
    const child = new Element(tag, options);
    this.children.push(child);
    return child;
  }
  empty() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { this.focused = true; }
  querySelector(selector) {
    if (selector !== '[role="tab"][aria-selected="true"]') return null;
    return findAll(this, (element) => element.attributes.role === "tab" && element.attributes["aria-selected"] === "true")[0] || null;
  }
}

function findAll(element, predicate, found = []) {
  if (predicate(element)) found.push(element);
  element.children.forEach((child) => findAll(child, predicate, found));
  return found;
}

function monthlyTabId(tabHost) {
  return findAll(tabHost, (element) => element.attributes.role === "tab" && element.text === "Monthly")[0].attributes.id;
}

const ids = core.PERIODS.map((period) => period.id);
assert.deepEqual(ids, ["daily", "weekly", "monthly", "quarterly", "yearly"], "all five Journal questions remain navigable");
assert.equal(core.getPeriod("WEEKLY").question, "무엇이 반복되고 무엇을 배웠는가?");
assert.equal(core.getPeriod("daily").role, "오늘 무엇이 나를 변화시켰는지 기록합니다.");
assert.equal(core.getPeriod("weekly").role, "이번 주에 무엇이 반복되었고 무엇을 배웠는지 살펴봅니다.");
assert.equal(core.getPeriod("monthly").role, "이번 달의 변화가 반복된 근거로 검증되는지 확인합니다.");
assert.equal(core.getPeriod("quarterly").role, "검증된 변화와 결과를 바탕으로 지금의 방향이 맞는지 점검합니다.");
assert.equal(core.getPeriod("yearly").role, "분기별 방향과 변화를 돌아보며 내가 어떤 사람이 되어가는지 성찰합니다.");
assert.equal(core.monthPrefix(new Date("2026-07-22T12:00:00")), "2026-07");
assert.equal(core.quarterPrefix(new Date("2026-07-22T12:00:00")), "2026-Q3");
assert.equal(core.yearPrefix(new Date("2026-07-22T12:00:00")), "2026");
assert.equal(core.periodKey("monthly", "2026-07"), "2026-07");
assert.equal(core.periodKey("quarterly", "2026-Q3"), "2026-Q3");
assert.equal(core.periodKey("yearly", "2026"), "2026");
assert.equal(core.periodInputValue("quarterly", "2026-Q3"), "2026-07");
assert.equal(core.periodKeyFromInput("quarterly", "2026-10"), "2026-Q4");
assert.equal(core.shiftPeriod("monthly", "2026-01", -1), "2025-12");
assert.equal(core.shiftPeriod("quarterly", "2026-Q1", -1), "2025-Q4");
assert.equal(core.shiftPeriod("yearly", "2026", 1), "2027");
assert.deepEqual(core.periodBounds("quarterly", "2026-Q3"), { start: "2026-07-01", end: "2026-09-30" });
assert.equal(core.periodDisplay("monthly", "2026-07"), "2026년 07월");
assert.equal(core.periodPath("yearly", "2026"), "DAILY/YEARLY/2026.md");

const monthly = core.readiness("monthly", { daily: 5, weekly: 2, principles: 1 });
assert.match(monthly.message, /Weekly/);
assert.deepEqual(monthly.inputs, ["이번 달 Daily 5개", "검토 저장된 Weekly 2개", "검증 대기 Principle 1개"]);
assert.match(core.readiness("quarterly", { monthly: 0, directions: 0 }).message, /전략 재정렬/);
assert.match(core.readiness("yearly", { quarterly: 0, directions: 0 }).message, /Identity Lens/);

const previousCore = global.JournalPeriodCore;
const previousControls = global.ProdigyAdaptiveControls;
const previousTokens = global.ProdigyTokens;
try {
  global.JournalPeriodCore = core;
  global.ProdigyAdaptiveControls = controls;
  global.ProdigyTokens = tokens;
  const viewPath = path.join(ROOT, "SYSTEM/Views/journal-period-view.js");
  delete require.cache[require.resolve(viewPath)];
  const view = require(viewPath);
  const root = new Element();
  const mounted = view.mount({
    app: { vault: { getMarkdownFiles: () => [] } },
    container: root,
    logicalWidth: tokens.BREAKPOINTS.medium - 1,
    renderDaily: (container) => container.createEl("p", { text: "Daily" }),
    renderWeekly: (container) => container.createEl("p", { text: "Weekly" })
  });

  const compactHost = findAll(root, (element) => element.attributes.class === "journal-period-tabs")[0];
  assert.equal(compactHost.attributes["data-layout"], "compact", "explicit compact width collapses Journal periods into the adaptive control");
  assert.equal(findAll(compactHost, (element) => element.attributes.class === "prodigy-adaptive-tabs").length, 1, "compact Journal periods use the shared AdaptiveTabs control");

  mounted.select("monthly");
  mounted.setLogicalWidth(tokens.BREAKPOINTS.wide);
  assert.equal(compactHost.attributes["data-layout"], "wide", "explicit wide width expands the Journal period control into a full row");
  assert.equal(findAll(compactHost, (element) => element.attributes.class === "prodigy-adaptive-tab").length, core.PERIODS.length, "wide Journal renders every period in the full tab row");
  assert.equal(mounted.getSelected(), "monthly", "the active Journal period survives compact-to-wide reflow");

  const content = findAll(root, (element) => element.attributes.class === "journal-period-content")[0];
  const mountedPanels = content.children.filter((element) => element.attributes.class === "journal-period-panel");
  assert.equal(mountedPanels.length, 1, "only the active Journal period panel remains mounted");
  assert.equal(mountedPanels[0].attributes.role, "tabpanel", "the mounted period keeps its tabpanel relationship");
  assert.equal(mountedPanels[0].attributes["aria-labelledby"], monthlyTabId(compactHost), "the mounted period remains labelled by the selected tab");
  assert.equal(findAll(content, (element) => ["button", "input", "select", "textarea", "a"].includes(element.tag)).length > 0, true, "the active panel retains its interactive controls");

  mounted.select("daily");
  assert.equal(content.children.filter((element) => element.attributes.class === "journal-period-panel").length, 1, "remounting Daily still leaves exactly one active panel");
  assert.equal(findAll(content, (element) => element.text === "Daily").length, 1, "Daily remounts through its canonical renderer");
  mounted.select("monthly");
  const monthlyTab = findAll(compactHost, (element) => element.attributes.role === "tab" && element.text === "Monthly")[0];
  const quarterlyTab = findAll(compactHost, (element) => element.attributes.role === "tab" && element.text === "Quarterly")[0];
  monthlyTab.onkeydown({ key: "ArrowRight", preventDefault() {} });
  assert.equal(mounted.getSelected(), "quarterly", "keyboard navigation selects the next Journal period");
  assert.equal(quarterlyTab.focused, true, "keyboard selection moves focus with the active period");
  assert.equal(content.children.filter((element) => element.attributes.class === "journal-period-panel").length, 1, "keyboard selection also keeps one mounted panel");
  mounted.select("monthly");
  let prevented = false;
  content.onkeydown({ key: "Escape", defaultPrevented: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true, "Escape from a period panel is handled");
  assert.equal(monthlyTab.focused, true, "Escape returns focus to the selected period tab");
} finally {
  if (previousCore === undefined) delete global.JournalPeriodCore;
  else global.JournalPeriodCore = previousCore;
  if (previousControls === undefined) delete global.ProdigyAdaptiveControls;
  else global.ProdigyAdaptiveControls = previousControls;
  if (previousTokens === undefined) delete global.ProdigyTokens;
  else global.ProdigyTokens = previousTokens;
}

console.log("Journal period core tests passed");
