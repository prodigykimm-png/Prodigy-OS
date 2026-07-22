"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const dp = require(path.join(ROOT, "SYSTEM/Views/workout-decision-packet.js"));

// --- buildWorkoutContext ---
(function testBuildContext() {
  const ctx = dp.buildWorkoutContext(
    { path: "PARA/WORKOUT/Programs/Base One.md", title: "Base One" },
    [{ path: "PARA/RESOURCES/Workout/Exercises/Hack Squat.md", title: "Hack Squat" }]
  );
  assert.equal(ctx.program_path, "PARA/WORKOUT/Programs/Base One.md");
  assert.equal(ctx.program_title, "Base One");
  assert.deepEqual(ctx.exercise_names, ["hack squat"]);
  assert.deepEqual(ctx.exercise_paths, ["PARA/RESOURCES/Workout/Exercises/Hack Squat.md"]);
  console.log("PASS: buildWorkoutContext");
})();

// --- buildWorkoutDecisionPacket empty ---
(function testEmptyPacket() {
  const packet = dp.buildWorkoutDecisionPacket({
    program: { path: "PARA/WORKOUT/Programs/Base One.md", title: "Base One" },
    exercises: [],
    candidates: []
  });
  assert.equal(packet.schema_version, 1);
  assert.equal(packet.knowledge.length, 0);
  assert.equal(packet.prior_workouts.length, 0);
  assert.ok(packet.empty_state);
  console.log("PASS: empty packet");
})();

// --- buildWorkoutDecisionPacket with knowledge ---
(function testKnowledgeMatch() {
  const packet = dp.buildWorkoutDecisionPacket({
    program: { path: "PARA/WORKOUT/Programs/Base One.md", title: "Base One" },
    exercises: [{ path: "PARA/RESOURCES/Workout/Exercises/Hack Squat.md", title: "Hack Squat" }],
    candidates: [
      {
        path: "ZETA/PERMANENT/Squat Form.md",
        title: "Squat Form",
        type: "knowledge",
        knowledge_domain: "workout",
        knowledge_topics: [],
        connections: ["[[PARA/WORKOUT/Programs/Base One]]"],
        updated: "2026-07-20"
      },
      {
        path: "ZETA/PERMANENT/Real Estate Tip.md",
        title: "Real Estate Tip",
        type: "knowledge",
        knowledge_domain: "real_estate",
        connections: [],
        updated: "2026-07-20"
      }
    ]
  });
  assert.equal(packet.knowledge.length, 1);
  assert.equal(packet.knowledge[0].title, "Squat Form");
  assert.equal(packet.knowledge[0].reason, "direct");
  assert.equal(packet.empty_state, null);
  console.log("PASS: knowledge match by direct connection");
})();

// --- buildWorkoutDecisionPacket with prior workout ---
(function testPriorWorkoutMatch() {
  const packet = dp.buildWorkoutDecisionPacket({
    program: { path: "PARA/WORKOUT/Programs/Base One.md", title: "Base One" },
    exercises: [],
    candidates: [
      {
        path: "PARA/WORKOUT/WO-2026-001.md",
        title: "2026-07-15 운동",
        type: "workout",
        connections: ["[[PARA/WORKOUT/Programs/Base One]]"],
        updated: "2026-07-15"
      }
    ]
  });
  assert.equal(packet.prior_workouts.length, 1);
  assert.equal(packet.prior_workouts[0].reason, "program");
  console.log("PASS: prior workout match");
})();

// --- buildWorkoutDecisionPacket domain-only fallback ---
(function testDomainOnlyFallback() {
  const packet = dp.buildWorkoutDecisionPacket({
    program: { path: "PARA/WORKOUT/Programs/Base One.md", title: "Base One" },
    exercises: [],
    candidates: [
      {
        path: "ZETA/PERMANENT/General Fitness.md",
        title: "General Fitness",
        type: "knowledge",
        knowledge_domain: "workout",
        connections: [],
        updated: "2026-07-10"
      }
    ]
  });
  assert.equal(packet.knowledge.length, 1);
  assert.equal(packet.knowledge[0].reason, "domain");
  assert.equal(packet.knowledge[0].score, 10);
  console.log("PASS: domain-only fallback");
})();

// --- cap at 3 knowledge, 2 priors ---
(function testCaps() {
  const candidates = [];
  for (let i = 0; i < 5; i++) {
    candidates.push({
      path: `ZETA/PERMANENT/K${i}.md`,
      title: `Knowledge ${i}`,
      type: "knowledge",
      knowledge_domain: "workout",
      connections: ["[[PARA/WORKOUT/Programs/Base One]]"],
      updated: `2026-07-${10 + i}`
    });
  }
  for (let i = 0; i < 4; i++) {
    candidates.push({
      path: `PARA/WORKOUT/WO-${i}.md`,
      title: `Workout ${i}`,
      type: "workout",
      connections: ["[[PARA/WORKOUT/Programs/Base One]]"],
      updated: `2026-07-${10 + i}`
    });
  }
  const packet = dp.buildWorkoutDecisionPacket({
    program: { path: "PARA/WORKOUT/Programs/Base One.md", title: "Base One" },
    exercises: [],
    candidates
  });
  assert.equal(packet.knowledge.length, 3);
  assert.equal(packet.prior_workouts.length, 2);
  console.log("PASS: caps enforced");
})();

console.log("\nWorkout decision packet tests passed");
