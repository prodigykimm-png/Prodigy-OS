"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/journal-period-core.js"));

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

console.log("Journal period core tests passed");
