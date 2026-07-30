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
}

function findAll(element, predicate, found = []) {
  if (predicate(element)) found.push(element);
  element.children.forEach((child) => findAll(child, predicate, found));
  return found;
}

const ids = core.PERIODS.map((period) => period.id);
assert.deepEqual(ids, ["daily", "weekly", "monthly", "quarterly", "yearly"], "all five Journal questions remain navigable");
assert.equal(core.getPeriod("WEEKLY").question, "무엇이 반복되고 무엇을 배웠는가?");
assert.equal(core.monthPrefix(new Date("2026-07-22T12:00:00")), "2026-07");
assert.equal(core.quarterPrefix(new Date("2026-07-22T12:00:00")), "2026-Q3");
assert.equal(core.yearPrefix(new Date("2026-07-22T12:00:00")), "2026");

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
} finally {
  if (previousCore === undefined) delete global.JournalPeriodCore;
  else global.JournalPeriodCore = previousCore;
  if (previousControls === undefined) delete global.ProdigyAdaptiveControls;
  else global.ProdigyAdaptiveControls = previousControls;
  if (previousTokens === undefined) delete global.ProdigyTokens;
  else global.ProdigyTokens = previousTokens;
}

console.log("Journal period core tests passed");
