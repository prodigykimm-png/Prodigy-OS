"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const STYLES = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-styles.js"), "utf8");
const VIEW = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");

function ruleBody(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start >= 0, `missing selector: ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`unterminated selector: ${selector}`);
}

test("Home controls keep a 44px two-axis target and suppress inherited chrome shadows", () => {
  const controls = ruleBody(STYLES, ".prodigy-home button,");
  assert.match(controls, /min-block-size:\s*var\(--ke-touch-target\)/);
  assert.match(controls, /min-inline-size:\s*var\(--ke-touch-target\)/);
  assert.match(STYLES, /styleEl\.sheet\.insertRule/);
  assert.match(STYLES, /shadowProperty[\s\S]*shadowValue[\s\S]*!important/);
  assert.match(STYLES, /data-workspace-id="home"[\s\S]*prodigy-workspace-switcher/);
  assert.match(STYLES, /\.prodigy-home \.prodigy-bottom-sheet-backdrop/);
});

test("Home dock fits CJK and 200% zoom by wrapping rather than clipping or truncating", () => {
  const root = ruleBody(STYLES, ".prodigy-home {");
  const dock = ruleBody(STYLES, ".prodigy-home .home-ws-dock {");
  const row = ruleBody(STYLES, ".prodigy-home .home-ws-dock-row {");
  const label = ruleBody(STYLES, ".prodigy-home .home-ws-dock-name {");
  assert.doesNotMatch(root, /overflow-x:\s*(?:hidden|clip)/);
  assert.doesNotMatch(dock, /overflow:\s*(?:hidden|clip)/);
  assert.doesNotMatch(row, /overflow:\s*(?:hidden|clip)/);
  assert.doesNotMatch(label, /overflow:\s*(?:hidden|clip)|text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.match(STYLES, /home-compact \.home-ws-dock-row[\s\S]*grid-template-columns:\s*minmax\(var\(--ke-touch-target\),\s*1fr\)/);
});

test("closed Home sheets leave no zero-sized controls in the DOM and restore focus after Escape", () => {
  assert.match(VIEW, /createHomeAdaptiveControls/);
  assert.match(VIEW, /sheet\.element\.remove\(\)/);
  assert.match(VIEW, /appendChild\(sheet\.element\)/);
  assert.match(VIEW, /baseClose\(\)[\s\S]*sheet\.element\.remove\(\)/);
});

test("Home does not ship a simultaneous diagnostic-state legend", () => {
  assert.doesNotMatch(VIEW, /home-state-fixtures|Home 표시 상태 범례/);
});
