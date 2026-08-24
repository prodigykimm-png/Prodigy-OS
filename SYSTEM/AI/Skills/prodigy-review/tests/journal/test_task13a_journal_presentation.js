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
  "SYSTEM/Views/journal-styles.js",
  "SYSTEM/Views/weekly-filter-styles.js",
  "SYSTEM/Views/monthly-validation-view.js",
  "SYSTEM/Views/daily-reflection-modal-styles.js",
  "SYSTEM/Views/daily-reflection-proposal-input-view.js",
  "SYSTEM/Views/journal-evidence-block-modal.js",
  "SYSTEM/Views/journal-review-modal.js"
];
const source = FILES.map(file => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");
const shellSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js"), "utf8");
const periodSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/journal-period-view.js"), "utf8");
const dashboardSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/journal-dashboard-view.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/journal-styles.js"), "utf8");

function assertPresentationContract(css) {
  for (const declaration of css.matchAll(/box-shadow\s*:\s*([^;}]+)/gi)) {
    assert.match(declaration[1].trim(), /^none(?:\s*!important)?$/i, "private shadow grammar is forbidden");
  }
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
  assert.match(stylesSource, /\.journal-period-tabs \.prodigy-adaptive-tabs\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible/);
  assert.match(stylesSource, /\.journal-period-tabs \.prodigy-adaptive-tab\s*\{[^}]*min-inline-size:[^;]*44px[^}]*min-block-size:[^;]*44px[^}]*block-size:\s*auto[^}]*box-shadow:\s*none/);
  assert.doesNotMatch(stylesSource, /\.journal-period-tabs \.prodigy-adaptive-tabs\s*\{[^}]*overflow-x:\s*(?:auto|scroll)/);
  assert.match(stylesSource, /\.prodigy-journal-workspace button\.prodigy-btn[^{}]*\{[^}]*min-inline-size:[^;]*44px[^}]*min-block-size:[^;]*44px[^}]*block-size:\s*auto[^}]*box-shadow:\s*none/);
  assert.match(stylesSource, /\.journal-date-nav input\[type=date\]\s*\{[^}]*min-inline-size:[^;]*44px[^}]*min-block-size:[^;]*44px[^}]*block-size:\s*auto/);
  assert.match(stylesSource, /@media\(max-width:\s*480px\)\s*\{[\s\S]*?\.prodigy-app-shell\[data-workspace-id="journal"\]\s*>\s*\.prodigy-workspace-bar\s*\{\s*padding-inline:\s*4px[\s\S]*?\.prodigy-app-shell\[data-workspace-id="journal"\] \.journal-card:not\(\.prodigy-full-bleed\)\s*\{\s*padding-inline:\s*2px/);
});

test("Journal delegates iPad vertical scrolling to the enclosing Markdown preview", () => {
  assert.match(
    shellSource,
    /\.prodigy-app-shell\[data-workspace-id="journal"\]\s*\{\s*grid-template-rows:\s*auto auto auto;\s*max-block-size:\s*none;\s*overflow:\s*visible;\s*\}/,
  );
  assert.match(
    shellSource,
    /\.prodigy-app-shell\[data-workspace-id="journal"\]\s*>\s*\.prodigy-app-shell-body\s*\{\s*overflow:\s*visible;\s*overscroll-behavior-block:\s*auto;\s*\}/,
  );
});

test("Journal preserves native button semantics and Escape focus return", () => {
  assert.doesNotMatch(dashboardSource, /row\.onclick\s*=/);
  assert.match(dashboardSource, /button\.setAttribute\("aria-label", item\.date \+ " 기록 열기"\)/);
  assert.match(periodSource, /event\.key !== "Escape"/);
  assert.match(periodSource, /active\.focus\(\)/);
});
