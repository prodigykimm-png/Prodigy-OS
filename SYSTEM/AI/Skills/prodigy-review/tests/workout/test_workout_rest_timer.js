"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));

test("rest timer is event-driven: writes bounded by user actions, not seconds", () => {
  let clock = 1_000_000;
  const timer = core.createRestTimer({ now: () => clock, default_seconds: 90 });

  timer.start(90);
  assert.equal(timer.writeCount, 1);

  // Simulate 90 seconds passing in 1-second increments.
  // A per-second writer would produce ~90 writes; an event-driven timer produces 0.
  for (let i = 0; i < 90; i++) {
    clock += 1000;
    timer.remaining(); // read-only poll, must NOT count as a write
  }
  assert.equal(timer.writeCount, 1, "remaining() polls must not write state");
});

test("remaining() computes from wall clock without writing", () => {
  let clock = 0;
  const timer = core.createRestTimer({ now: () => clock });
  timer.start(60);
  assert.equal(timer.remaining(), 60);
  clock += 30_000;
  assert.equal(timer.remaining(), 30);
  clock += 30_000;
  assert.equal(timer.remaining(), 0);
  assert.ok(timer.isFinished());
  // Only the start event wrote
  assert.equal(timer.writeCount, 1);
});

test("adjust changes total and counts one write", () => {
  let clock = 0;
  const timer = core.createRestTimer({ now: () => clock });
  timer.start(90);
  clock += 10_000; // 80 remaining
  timer.adjust(30); // +30 => 110 remaining
  assert.equal(timer.remaining(), 110);
  assert.equal(timer.writeCount, 2);
  timer.adjust(-30);
  assert.equal(timer.remaining(), 80);
  assert.equal(timer.writeCount, 3);
});

test("pause/resume preserves elapsed time", () => {
  let clock = 0;
  const timer = core.createRestTimer({ now: () => clock });
  timer.start(100);
  clock += 20_000; // 80 remaining
  timer.pause();
  clock += 50_000; // paused — should not drain
  assert.equal(timer.remaining(), 80);
  timer.resume();
  clock += 30_000;
  assert.equal(timer.remaining(), 50);
});

test("skip and complete end the timer with one write each", () => {
  let clock = 0;
  const t1 = core.createRestTimer({ now: () => clock });
  t1.start(90);
  t1.skip();
  assert.equal(t1.state, "done");
  assert.equal(t1.remaining(), 0);

  const t2 = core.createRestTimer({ now: () => clock });
  t2.start(90);
  t2.complete();
  assert.equal(t2.state, "done");
  assert.ok(t2.isFinished());
});

test("resolveRestSeconds parses prescribed formats", () => {
  assert.equal(core.resolveRestSeconds({ rest: "90" }), 90);
  assert.equal(core.resolveRestSeconds({ rest: "90s" }), 90);
  assert.equal(core.resolveRestSeconds({ rest: "1:30" }), 90);
  assert.equal(core.resolveRestSeconds({ rest: "2분" }), 120);
  assert.equal(core.resolveRestSeconds({ rest: "" }), 90);
  assert.equal(core.resolveRestSeconds(null), 90);
});

test("timer events are recorded as discrete lifecycle entries", () => {
  let clock = 0;
  const timer = core.createRestTimer({ now: () => clock });
  timer.start(60);
  timer.adjust(10);
  timer.pause();
  timer.resume();
  timer.complete();
  const types = timer.events.map((e) => e.type);
  assert.deepEqual(types, ["start", "adjust", "pause", "resume", "complete"]);
  assert.equal(timer.writeCount, 5);
});

test("many sessions of polling never exceed action-bounded writes", () => {
  let clock = 0;
  const timer = core.createRestTimer({ now: () => clock });
  timer.start(300);
  // 300 seconds of 1s polling = 300 reads
  for (let i = 0; i < 300; i++) {
    clock += 1000;
    timer.remaining();
  }
  assert.equal(timer.writeCount, 1);
  assert.ok(timer.isFinished());
});
