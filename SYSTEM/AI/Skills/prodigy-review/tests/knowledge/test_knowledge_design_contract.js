"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const DESIGN_PATH = path.join(ROOT, "DESIGN.md");
const STATE_PATH = path.join(ROOT, ".omo/frontend-design/state.md");

const REQUIRED_PRIMITIVES = [
  "knowledge-explorer-shell",
  "domain-nav",
  "topic-nav",
  "detail-pane",
  "brief-panel",
  "asset-section",
  "drill-down",
  "back",
];
const REQUIRED_STATES = ["rest", "focus-visible", "selected", "loading", "empty", "error", "disabled"];
const REQUIRED_LAYOUT_CONTRACTS = [
  "scroll-owner:domain-nav",
  "scroll-owner:topic-nav",
  "scroll-owner:detail-pane",
  "constraint:min-block-size-0",
  "constraint:min-inline-size-0",
  "constraint:overflow-safe-grid",
];
const REQUIRED_INPUT_CONTRACTS = [
  "input:keyboard",
  "input:touch",
  "motion:reduced",
  "text:korean-cjk-wrap",
  "qa:device-limitation-accepted",
];
const REQUIRED_SHELL_CONTRACTS = [
  "AppShell",
  "ContextBar",
  "WorkspaceSwitcher",
  "AdaptiveTabs",
  "AdaptiveActionBar",
  "BottomSheet",
  "StatusLine",
  "InlineError",
  "AIInspector",
  "prodigy.ui.workspace-state.v1",
  "prodigy.ui.scroll-state.v1",
  "prodigy.ai.chat-session.v1",
];
const REQUIRED_STATE_RECORDS = [
  "journey:domain-topic-detail-object",
  "persona:keyboard-only",
  "persona:low-vision-large-text",
  "persona:touch-narrow-window",
  "stress:korean-cjk",
  "adaptive:reduced-motion",
  "adaptive:contrast",
  "verification:matrix",
  "debt:empty",
];

function assertIncludesAll(source, values, label) {
  for (const value of values) assert.ok(source.includes(`\`${value}\``), `${label}: ${value}`);
}

function compositionBody(source) {
  const match = source.match(/<!-- explorer-composition:start -->([\s\S]*?)<!-- explorer-composition:end -->/);
  assert.ok(match, "missing Explorer composition block");
  return match[1];
}

function validateDesign(source) {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|\brgba?\s*\(/i, "raw hex/rgb color");
  assert.doesNotMatch(source, /\p{Extended_Pictographic}/u, "emoji icon");
  assertIncludesAll(source, REQUIRED_PRIMITIVES, "missing primitive");
  assertIncludesAll(source, REQUIRED_STATES, "missing state");
  assertIncludesAll(source, REQUIRED_LAYOUT_CONTRACTS, "missing layout contract");
  assertIncludesAll(source, REQUIRED_INPUT_CONTRACTS, "missing input/adaptive contract");
  assertIncludesAll(source, REQUIRED_SHELL_CONTRACTS, "missing shared shell contract");
  for (const value of ["768px", "1024px", "48px", "52px", "44px", "min(70vh, 560px)", "min(38%, 420px)"]) {
    assert.ok(source.includes(`\`${value}\``), `missing responsive value: ${value}`);
  }

  const declaredTokens = new Set(
    [...source.matchAll(/^\|\s*`(--ke-[a-z0-9-]+)`\s*\|/gm)].map((match) => match[1]),
  );
  assert.ok(declaredTokens.size >= 10, "spacing/radius/type/color tokens are incomplete");
  for (const match of source.matchAll(/var\((--ke-[a-z0-9-]+)(?:\)|,)/g)) {
    assert.ok(declaredTokens.has(match[1]), `orphan token: ${match[1]}`);
  }

  const compositionNames = [...compositionBody(source).matchAll(/`([a-z][a-z0-9-]+)`/g)]
    .map((match) => match[1]);
  const documented = new Set(REQUIRED_PRIMITIVES);
  const repeated = compositionNames.filter((name, index) => compositionNames.indexOf(name) !== index);
  const undocumentedRepeated = repeated.find((name) => !documented.has(name));
  assert.equal(undocumentedRepeated, undefined, `undocumented repeated primitive: ${undocumentedRepeated}`);
}

function validateState(source) {
  assertIncludesAll(source, REQUIRED_STATE_RECORDS, "missing design-state record");
}

// Given: the current design contract and operating ledger.
// When: the canonical contract validator reads both artifacts.
// Then: every Explorer primitive, state, layout rule, and persona record is declared.
const design = fs.readFileSync(DESIGN_PATH, "utf8");
const state = fs.readFileSync(STATE_PATH, "utf8");
validateDesign(design);
validateState(state);

// Given: a fixture copy that references an undeclared Explorer token.
// When: the token graph is validated.
// Then: the orphan token is rejected without changing the real contract.
assert.throws(
  () => validateDesign(`${design}\nToken fixture: var(--ke-color-orphan)\n`),
  /orphan token: --ke-color-orphan/,
);

// Given: a fixture copy with an unnamed primitive repeated in the composition.
// When: the primitive registry is validated.
// Then: the repeated undocumented primitive is rejected.
const repeatedPrimitiveFixture = design.replace(
  "<!-- explorer-composition:end -->",
  "- `temporary-row` + `temporary-row`\n<!-- explorer-composition:end -->",
);
assert.throws(
  () => validateDesign(repeatedPrimitiveFixture),
  /undocumented repeated primitive: temporary-row/,
);

console.log("Knowledge design contract tests passed");
