"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const flow = require(path.join(ROOT, "SYSTEM/Views/workout-session-flow.js"));
const workoutHubSource = fs.readFileSync(path.join(ROOT, "HUB/30 Workout.md"), "utf8");

function timerHost() {
  let nextId = 1;
  const intervals = new Map();
  return {
    setInterval(callback) { const id = nextId++; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
    fire() { [...intervals.values()].forEach((callback) => callback()); },
    count: () => intervals.size,
  };
}

function mountScope(host) {
  const cleanups = [];
  return {
    track(cleanup) { cleanups.push(cleanup); return cleanup; },
    setInterval: host.setInterval,
    clearInterval: host.clearInterval,
    dispose() { cleanups.splice(0).reverse().forEach((cleanup) => cleanup()); },
  };
}

test("Workout mount awaits optional modules before its single dashboard and controller publication", () => {
  const optionalAwait = workoutHubSource.indexOf("const optionalResult = await mountContext.optional_ready;");
  const dashboard = workoutHubSource.indexOf("const workoutView = await window.WorkoutView.renderDashboard");
  const publish = workoutHubSource.indexOf("window.WorkoutView.publishMountedController(workoutView, mountContext.scope)");
  assert.ok(optionalAwait >= 0 && optionalAwait < dashboard && dashboard < publish);
  assert.equal((workoutHubSource.match(/WorkoutView\.renderDashboard\(/gu) || []).length, 1, "one generation renders one dashboard");
  assert.doesNotMatch(workoutHubSource, /onOptionalReady|__prodigyWorkoutOptionalContinuation/u, "no detached second dashboard may outlive the mount receipt");
});

test("a view controller owns one rest timer and disposal cancels it", () => {
  const host = timerHost();
  const controller = flow.createViewController({ timerHost: host });
  let ticks = 0;

  controller.startRestTimer(() => { ticks += 1; }, 1000);
  controller.startRestTimer(() => { ticks += 10; }, 1000);
  assert.equal(host.count(), 1, "restarting replaces rather than duplicates the interval");
  host.fire();
  assert.equal(ticks, 10);

  assert.equal(controller.dispose(), true);
  assert.equal(controller.dispose(), false, "disposal is idempotent");
  assert.equal(host.count(), 0);
  host.fire();
  assert.equal(ticks, 10, "a closed view receives no late timer callback");
});

test("mount cleanup supports open-close-open without retaining the prior controller", () => {
  const host = timerHost();
  const firstScope = mountScope(host);
  const first = flow.createViewController({ mountScope: firstScope, timerHost: host });
  first.startRestTimer(() => {}, 1000);
  assert.equal(host.count(), 1);

  firstScope.dispose();
  assert.equal(first.isDisposed(), true);
  assert.equal(host.count(), 0);

  const secondScope = mountScope(host);
  const second = flow.createViewController({ mountScope: secondScope, timerHost: host });
  second.startRestTimer(() => {}, 1000);
  assert.equal(second.isActive(), true);
  assert.equal(host.count(), 1, "the reopened view owns exactly one fresh interval");
  secondScope.dispose();
  assert.equal(host.count(), 0);
});

test("shell replacement and late attachment dispose each shell exactly once", () => {
  const host = timerHost();
  const controller = flow.createViewController({ timerHost: host });
  let firstDisposals = 0;
  let secondDisposals = 0;
  let lateDisposals = 0;

  controller.replaceShell({ dispose() { firstDisposals += 1; } });
  controller.replaceShell({ dispose() { secondDisposals += 1; } });
  assert.equal(firstDisposals, 1);
  assert.equal(secondDisposals, 0);

  controller.dispose();
  assert.equal(secondDisposals, 1);
  controller.replaceShell({ dispose() { lateDisposals += 1; } });
  assert.equal(lateDisposals, 1, "a shell arriving after close is torn down immediately");
});
