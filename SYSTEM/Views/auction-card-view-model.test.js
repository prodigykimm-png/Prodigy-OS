"use strict";

const assert = require("node:assert/strict");
const model = require("./auction-card-view-model.js");

assert.equal(model.tierFor(390), "compact");
assert.equal(model.tierFor(640), "compact");
assert.equal(model.tierFor(834), "medium");
assert.equal(model.tierFor(1068), "medium");
assert.equal(model.tierFor(1280), "wide");

assert.deepEqual(model.actionPlan("watching"), {
  primary: "bidding",
  secondary: ["skipped"]
});
assert.deepEqual(model.actionPlan("bidding"), {
  primary: null,
  secondary: ["won", "lost", "skipped"]
});
assert.deepEqual(model.actionPlan("lost"), {
  primary: "reviewing",
  secondary: []
});

assert.deepEqual(model.presentation(390, "watching"), {
  tier: "compact",
  compact: true,
  touch: true,
  action: { primary: "bidding", secondary: ["skipped"] }
});
assert.deepEqual(model.presentation(834, "watching"), {
  tier: "medium",
  compact: false,
  touch: true,
  action: { primary: "bidding", secondary: ["skipped"] }
});
assert.deepEqual(model.presentation(1280, "watching"), {
  tier: "wide",
  compact: false,
  touch: false,
  action: { primary: "bidding", secondary: ["skipped"] }
});

console.log("auction card view model tests: PASS");
