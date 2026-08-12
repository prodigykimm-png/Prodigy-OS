"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const FILES = [
  "HUB/50 Knowledge.md",
  "SYSTEM/Views/knowledge-explorer-render.js",
  "SYSTEM/Views/knowledge-explorer-responsive.js",
  "SYSTEM/Views/knowledge-workspace-tabs.js",
  "SYSTEM/Views/knowledge-direct-authoring-form.js",
  "SYSTEM/Views/knowledge-source-authoring-form.js",
  "SYSTEM/Views/llmwiki-approval-review-view.js",
  "SYSTEM/Views/llmwiki-lifecycle-view.js",
  "SYSTEM/Views/llmwiki-wiki-surface.js"
];
const source = FILES.map(file => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");

function assertPresentationContract(css) {
  assert.doesNotMatch(css, /box-shadow\s*:\s*(?!none\b)[^;]+/i, "private chrome shadows are forbidden");
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i, "decorative gradients are forbidden");
  assert.doesNotMatch(css, /url\s*\(\s*["']?https?:/i, "remote presentation assets are forbidden");
  assert.doesNotMatch(css, /--ke-(?:type|leading|radius|space|touch|control|panel)-(?:[\w-]+)\s*:/i, "Knowledge cannot declare a local type/radius/spacing/control/panel system");
  assert.doesNotMatch(css, /@media[^\n{]*\b(?:600|760|768|1024)px/i, "private Knowledge breakpoints are forbidden");
}

test("Knowledge presentation consumes shared Apple roles without private grammar", () => {
  assertPresentationContract(source);
  assert.match(source, /prodigy-utility-card/);
  assert.match(source, /prodigy-full-bleed/);
  assert.match(source, /prodigy-configurator-chip/);
  assert.match(source, /prodigy-status-line/);
  assert.match(source, /box-shadow:\s*none/);
  assert.match(source, /\.knowledge-explorer-(?:row-link|detail-item-link|brief-source)[^{]*\{[^}]*min-block-size:\s*44px/s);
});

test("Knowledge presentation oracle rejects shadow, type, radius, spacing, and private-breakpoint mutations", () => {
  for (const mutation of [
    ".x{box-shadow:0 4px 20px black}",
    ".x{--ke-type-private:13px}",
    ".x{--ke-radius-private:9px}",
    ".x{--ke-space-private:7px}",
    ".x{--ke-control-private:41px}",
    "@media(max-width:760px){.x{display:block}}"
  ]) assert.throws(() => assertPresentationContract(mutation), /forbidden|cannot declare|private Knowledge/);
});

test("Knowledge responsive contract uses canonical Apple boundaries and accessibility states", () => {
  const responsive = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-responsive.js"));
  assert.equal(responsive.MEDIUM_MIN, 834);
  assert.equal(responsive.WIDE_MIN, 1024);
  assert.equal(responsive.TOUCH_TARGET, 44);
  for (const width of [390, 834, 1068, 1440]) assert.doesNotThrow(() => responsive.layoutForWidth(width));
  assert.match(responsive.CSS, /forced-colors:\s*active/);
  assert.match(responsive.CSS, /prefers-reduced-motion:\s*reduce/);
  assert.match(responsive.CSS, /focus-visible/);
  assert.match(responsive.CSS, /overflow-wrap:\s*anywhere/);
});
