"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function main() {
  try { load("SYSTEM/Views/object-lifecycle-core.js"); } catch (_e) { /* optional */ }
  const engine = load("SYSTEM/Views/object-engine-core.js");
  const strategy = load("SYSTEM/Views/reading-strategy-core.js");
  const workspace = load("SYSTEM/Views/reading-workspace-core.js");

  // --- Common always (no type) ---
  const commonGuide = strategy.buildGuide("generic", { known: false });
  assert.equal(commonGuide.common, true);
  assert.equal(commonGuide.domain, false);
  assert.ok(commonGuide.prompts.length >= 3);
  assert.ok(commonGuide.prompts.every((p) => String(p.id).startsWith("g_common")));
  assert.match(commonGuide.purpose, /구조|1단계/);

  const commonCheck = strategy.buildChecklist("generic", { known: false });
  assert.equal(commonCheck.domain, false);
  assert.ok(commonCheck.items.some((i) => /용어|명제|논증/.test(i.label)));

  const commonRefl = strategy.buildReflection("generic", { known: false });
  assert.ok(commonRefl.prompts.length <= 3);
  assert.ok(commonRefl.prompts.some((p) => /의의|맞는가|이해/.test(p.label)));

  // --- Typed: common + domain ---
  const pracGuide = strategy.buildGuide("practical", { known: true });
  assert.equal(pracGuide.domain, true);
  assert.ok(pracGuide.prompts.some((p) => p.id.startsWith("g_common")));
  assert.ok(pracGuide.prompts.some((p) => p.id.startsWith("g_prac")));
  assert.ok(pracGuide.prompts.length <= 5);

  const pracCheck = strategy.buildChecklist("practical", { known: true });
  assert.equal(pracCheck.auto_complete, false);
  assert.ok(pracCheck.items.some((i) => i.id.startsWith("c_common")));
  assert.ok(pracCheck.items.some((i) => i.id.startsWith("c_prac")));
  assert.ok(pracCheck.items.every((i) => i.checked === false));

  // --- Bundle: no silent classify ---
  const generic = strategy.buildStrategyBundle({ title: "No Type", category: "자기계발" }, { active: true });
  assert.equal(generic.known, false);
  assert.equal(generic.domain, false);
  assert.equal(generic.common, true);
  assert.match(generic.explain, /공통/);
  assert.ok(generic.guide.prompts.some((p) => /한두 문장|뼈대|분류|질문/.test(p.label)));

  const silent = strategy.resolveStrategy({ category: "철학", title: "철학 입문" });
  assert.equal(silent.known, false);

  const explicit = strategy.buildStrategyBundle({ book_type: "philosophy" }, { active: true });
  assert.equal(explicit.known, true);
  assert.equal(explicit.domain, true);
  assert.equal(explicit.strategy, "philosophy");
  assert.ok(explicit.checklist.items.some((i) => i.id.startsWith("c_common")));
  assert.ok(explicit.checklist.items.some((i) => i.id.startsWith("c_phil")));

  for (const key of ["practical", "philosophy", "history", "science", "literature", "social_science"]) {
    const b = strategy.buildStrategyBundle({ reading_strategy: key }, { active: true });
    assert.equal(b.known, true);
    assert.equal(b.common, true);
    assert.equal(b.domain, true);
    assert.ok(b.guide.prompts.length >= 3);
    assert.ok(b.checklist.items.length >= 4);
  }

  // Inactive
  const inactive = strategy.buildStrategyBundle({}, { active: false });
  assert.equal(inactive.empty, true);
  assert.equal(inactive.guide, null);

  // Workspace
  const session = engine.createRuntimeSession({});
  const model = workspace.buildWorkspaceModel([{
    type: "reading",
    status: "reading",
    path: "PARA/PROJECTS/Reading/atomic.md",
    title: "Atomic Habits",
    reading_strategy: "practical",
    next_action: "Ch.3",
    progress: 50
  }], { session });
  assert.equal(model.strategy.common, true);
  assert.equal(model.strategy.domain, true);
  assert.ok(model.reading_guide.prompts.some((p) => /구조|한두|뼈대|질문|분류/.test(p.label)));

  const untyped = workspace.buildWorkspaceModel([{
    type: "reading",
    status: "reading",
    path: "PARA/PROJECTS/Reading/u.md",
    title: "Unknown"
  }], { session: engine.createRuntimeSession({}) });
  assert.equal(untyped.strategy.known, false);
  assert.equal(untyped.reading_guide.domain, false);
  assert.ok(untyped.reading_checklist.items.every((i) => String(i.id).startsWith("c_common")));

  const hub = fs.readFileSync(path.join(ROOT, "HUB/20 Reading.md"), "utf8");
  assert.match(hub, /reading-strategy-core\.js/);
  assert.equal(/ReadingWorkspaceView\.renderWorkspace/.test(hub), false);

  const guideDoc = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  assert.match(guideDoc, /공통 레이어|분야 레이어|Adler|book_type/);

  console.log("Reading strategy tests passed");
}

main();
