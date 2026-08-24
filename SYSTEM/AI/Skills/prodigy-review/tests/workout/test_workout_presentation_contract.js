#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const files = [
  "HUB/30 Workout.md",
  "SYSTEM/Views/workout-view.js",
  "SYSTEM/Views/workout-session-ui.js",
  "SYSTEM/Views/workout-modals.js",
  "SYSTEM/Views/workout-health-responsive.js",
  "SYSTEM/Views/workout-nutrition-view.js",
  "SYSTEM/Views/workout-running-view.js",
  "SYSTEM/Views/workout-styles.js",
];
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const production = () => files.map(source).join("\n");

function assertPresentationContract(text) {
  assert.doesNotMatch(text, /color-mix\s*\(/i);
  for (const declaration of text.matchAll(/box-shadow\s*:\s*([^;}]+)/gi)) {
    assert.match(declaration[1].trim(), /^none(?:\s*!important)?$/i);
  }
  assert.doesNotMatch(text, /@media\s*\([^)]*(?:600|767)px/i);
  assert.doesNotMatch(text, /(?:linear|radial|conic)-gradient\s*\(/i);
  assert.doesNotMatch(text, /url\s*\(\s*["']?https?:/i);
}

test("Workout presentation consumes shared Apple roles without private systems", () => {
  const text = production();
  assertPresentationContract(text);
  assert.match(text, /prodigy-full-bleed/);
  assert.match(text, /prodigy-utility-card/);
  assert.match(text, /prodigy-configurator-chip/);
  assert.match(text, /var\(--ke-touch-target/);
  assert.match(text, /:focus-visible/);
  assert.match(text, /:active[^{]*\{[^}]*scale\(0\.95\)/s);
  assert.match(text, /:disabled/);
  assert.match(text, /forced-colors:\s*active/);
  assert.match(text, /prefers-reduced-motion:\s*reduce/);
  assert.match(text, /word-break:\s*keep-all/);
  assert.match(text, /min-inline-size:\s*var\(--ke-touch-target/);
  assert.match(text, /box-shadow:\s*none\s*!important/);
});

test("Workout mutation oracle rejects each forbidden local declaration", () => {
  for (const mutation of [
    ".x{background:color-mix(in srgb,red 10%,white)}",
    ".x{box-shadow:0 1px 2px black}",
    "@media(max-width:600px){.x{display:none}}",
    ".x{background:linear-gradient(red,blue)}",
    ".x{background:url(https://example.com/a.png)}",
  ]) assert.throws(() => assertPresentationContract(mutation));
});
