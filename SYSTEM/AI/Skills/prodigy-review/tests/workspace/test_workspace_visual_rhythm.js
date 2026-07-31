"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("shared controls use the canonical type and spacing rhythm", () => {
  const css = source("SYSTEM/Views/prodigy-ui.js");
  assert.match(css, /font-size:\s*var\(--ke-type-label/);
  assert.match(css, /line-height:\s*var\(--ke-leading-control/);
  assert.match(css, /padding:\s*var\(--ke-space-1[^)]*\) var\(--ke-space-3/);
  assert.doesNotMatch(css, /\.prodigy-btn[\s\S]{0,500}font-size:\s*0\.72em/);
});

test("workspace chrome and fixed-height labels keep neutral tracking", () => {
  const home = source("SYSTEM/Views/home-styles.js");
  const people = source("SYSTEM/Views/people-styles.js");
  assert.doesNotMatch(home, /letter-spacing:\s*-/);
  assert.doesNotMatch(people, /letter-spacing:\s*-/);
});

test("major workspace surfaces consume semantic typography tokens", () => {
  const surfaces = [
    "SYSTEM/Views/home-styles.js",
    "SYSTEM/Views/workout-view.js",
    "SYSTEM/Views/people-styles.js",
    "SYSTEM/Views/journal-dashboard-view.js",
    "SYSTEM/Views/knowledge-explorer-responsive.js",
  ];
  for (const relativePath of surfaces) {
    const text = source(relativePath);
    assert.match(text, /--ke-type-(?:label|body|heading|title)/, relativePath + " uses the shared type scale");
    assert.match(text, /--ke-leading-(?:body|control)/, relativePath + " uses the shared leading scale");
  }
});

test("dense reading chrome does not fall below the shared chrome floor", () => {
  const reading = source("SYSTEM/Views/reading-card.js");
  assert.doesNotMatch(reading, /font-size:\s*0\.62em/);
  assert.match(reading, /font-size:\s*var\(--ke-type-chrome/);
});
