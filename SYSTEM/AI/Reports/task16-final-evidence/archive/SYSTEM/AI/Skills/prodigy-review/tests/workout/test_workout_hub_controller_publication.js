"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = require(path.join(ROOT, "SYSTEM/Views/workout-view.js"));
const hub = fs.readFileSync(path.join(ROOT, "HUB/30 Workout.md"), "utf8");

function scope() {
  const cleanups = [];
  return { track(cleanup) { cleanups.push(cleanup); }, dispose() { cleanups.slice().reverse().forEach((cleanup) => cleanup()); } };
}

const contracts = Object.freeze({
  normal: { expected: [".prodigy-workout-dashboard"], forbidden: [".workout-panel-error", ".workout-panel-loading"], allowedConcurrent: ["[aria-selected=true]"] },
  empty: { expected: [".workout-empty"], forbidden: [".workout-panel-error", ".workout-panel-loading"], allowedConcurrent: ["[aria-selected=true]"] },
  loading: { expected: [".workout-panel-loading"], forbidden: [".workout-panel-error"], allowedConcurrent: ["[aria-selected=true]", "[aria-busy=true]"] },
  error: { expected: [".workout-panel-error[data-state=error]"], forbidden: [".workout-panel-loading"], allowedConcurrent: ["[aria-selected=true]"] },
  "selected-active": { expected: ["[aria-selected=true]"], forbidden: ["[aria-selected=true] [hidden]"], allowedConcurrent: [".workout-empty", ".workout-panel-loading", ".workout-panel-error"] },
  "disabled-busy": { expected: [":disabled"], forbidden: [".capture-confirmed"], allowedConcurrent: ["[aria-selected=true]", "[aria-busy=true]"] },
});

assert.equal(typeof view.publishMountedController, "function");
const firstScope = scope();
const first = Object.freeze({ openTab() {}, dispose() {} });
assert.strictEqual(view.publishMountedController(first, firstScope), first);
assert.strictEqual(globalThis.__prodigyWorkoutController, first, "publication preserves actual controller identity");

const secondScope = scope();
const second = Object.freeze({ openTab() {}, dispose() {} });
view.publishMountedController(second, secondScope);
firstScope.dispose();
assert.strictEqual(globalThis.__prodigyWorkoutController, second, "stale owner cleanup cannot delete current generation");
secondScope.dispose();
assert.equal(Object.hasOwn(globalThis, "__prodigyWorkoutController"), false);

assert.match(hub, /const optionalResult = await mountContext\.optional_ready[\s\S]*const workoutView = await window\.WorkoutView\.renderDashboard[\s\S]*publishMountedController\(workoutView, mountContext\.scope\)/);
assert.doesNotMatch(hub, /continuation\.then|workout-visibility-mount|newDashboard|secondDashboard/);
assert.equal(Object.keys(contracts).length, 6);
assert.equal(contracts.loading.allowedConcurrent.includes("[aria-selected=true]"), true);
assert.equal(contracts["disabled-busy"].forbidden.includes(".capture-confirmed"), true, "state driver forbids import confirmation/writes");
console.log("Workout mount controller publication six-state contract tests passed");
