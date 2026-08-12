"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const FILES = [
  "HUB/70 Journal.md",
  "SYSTEM/Views/journal-dashboard-view.js",
  "SYSTEM/Views/journal-period-view.js",
  "SYSTEM/Views/weekly-filter-styles.js",
  "SYSTEM/Views/monthly-validation-view.js",
  "SYSTEM/Views/daily-reflection-modal-styles.js",
  "SYSTEM/Views/daily-reflection-proposal-input-view.js",
  "SYSTEM/Views/journal-evidence-block-modal.js",
  "SYSTEM/Views/journal-review-modal.js"
];
const source = FILES.map(file => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");
const periodSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/journal-period-view.js"), "utf8");
const dashboardSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/journal-dashboard-view.js"), "utf8");

function assertPresentationContract(css) {
  assert.doesNotMatch(css, /box-shadow\s*:\s*(?!none\b)[^;]+/i, "private shadow grammar is forbidden");
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i);
  assert.doesNotMatch(css, /url\s*\(\s*["']?https?:/i);
  assert.doesNotMatch(css, /--ke-(?:type|leading|radius|space|touch|control|panel)-(?:[\w-]+)\s*:/i, "private type/radius/spacing grammar is forbidden");
  assert.doesNotMatch(css, /@media[^\n{]*\b(?:600|767)px/i, "private Journal breakpoints are forbidden");
  assert.doesNotMatch(css, /\.journal-badge\.(?:complete|partial|empty)\s*\{/i, "private status-color grammar is forbidden");
}

test("Journal presentation consumes shared Apple roles without private card, badge, type, or radius grammar", () => {
  assertPresentationContract(source);
  assert.match(source, /prodigy-full-bleed/);
  assert.match(source, /prodigy-utility-card/);
  assert.match(source, /prodigy-status-line/);
});

test("Journal presentation oracle rejects shadow, type, radius, breakpoint, and state mutations", () => {
  for (const mutation of [
    ".x{box-shadow:0 4px 20px black}",
    ".x{--ke-type-private:13px}",
    ".x{--ke-radius-private:9px}",
    ".x{--ke-space-private:7px}",
    "@media(max-width:600px){.x{display:block}}",
    ".journal-badge.complete{background:green}"
  ]) assert.throws(() => assertPresentationContract(mutation), /forbidden/);
});

test("Journal presentation retains shared focus, forced-color, reduced-motion, and 44px contracts", () => {
  assert.match(source, /focus-visible/);
  assert.match(source, /forced-colors:\s*active/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /(?:min-block-size|min-height):\s*44px/);
  assert.match(source, /overflow-wrap:\s*anywhere/);
});

test("owned Journal controls override native Obsidian geometry and chrome without a horizontal scroller", () => {
  assert.match(periodSource, /\.journal-period-tabs \.prodigy-adaptive-tabs\{[^}]*flex-wrap:wrap[^}]*overflow:visible/);
  assert.match(periodSource, /\.journal-period-tabs \.prodigy-adaptive-tab\{[^}]*min-inline-size:44px[^}]*min-block-size:44px[^}]*block-size:auto[^}]*box-shadow:none/);
  assert.doesNotMatch(periodSource, /\.journal-period-tabs \.prodigy-adaptive-tabs\{[^}]*overflow-x:(?:auto|scroll)/);
  assert.match(dashboardSource, /\.prodigy-journal-workspace button\.prodigy-btn\{[^}]*min-inline-size:44px[^}]*min-block-size:44px[^}]*block-size:auto[^}]*box-shadow:none/);
  assert.match(dashboardSource, /\.journal-date-nav input\[type=date\]\{[^}]*min-inline-size:44px[^}]*min-block-size:44px[^}]*block-size:auto/);
  assert.match(dashboardSource, /@media\(max-width:480px\)\{\.prodigy-app-shell\[data-workspace-id="journal"\]>.prodigy-workspace-bar\{padding-inline:4px\}\.prodigy-app-shell\[data-workspace-id="journal"\] \.journal-card:not\(\.prodigy-full-bleed\)\{padding-inline:2px\}\}/);
});

test("Journal preserves native button semantics and Escape focus return", () => {
  assert.doesNotMatch(dashboardSource, /row\.onclick\s*=/);
  assert.match(dashboardSource, /button\.setAttribute\("aria-label", item\.date \+ " 기록 열기"\)/);
  assert.match(periodSource, /event\.key !== "Escape"/);
  assert.match(periodSource, /active\.focus\(\)/);
});
