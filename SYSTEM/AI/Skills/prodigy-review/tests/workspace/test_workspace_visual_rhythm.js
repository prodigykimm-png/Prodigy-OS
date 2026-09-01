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

test("workspace shells preserve canonical phone, iPad, and Mac side gutters", () => {
  const shell = source("SYSTEM/Views/prodigy-app-shell.js");
  assert.match(shell, /--prodigy-gutter-phone:\$\{gutter\.phone \|\| 20\}px/);
  assert.match(shell, /--prodigy-gutter-pad-portrait:\$\{\(gutter\.pad && gutter\.pad\.portrait\) \|\| 32\}px/);
  assert.match(shell, /--prodigy-gutter-pad-landscape:\$\{\(gutter\.pad && gutter\.pad\.landscape\) \|\| 48\}px/);
  assert.match(shell, /--prodigy-gutter-mac:\$\{\(gutter\.mac && gutter\.mac\.default\) \|\| 48\}px/);
  assert.match(shell, /--prodigy-gutter-mac-content-max:\$\{\(gutter\.mac && gutter\.mac\.atContentMax\) \|\| 80\}px/);
  assert.match(shell, /\.prodigy-app-shell\[data-tier="compact"\]\s*\{[^}]*--prodigy-inline-gutter:\s*var\(--prodigy-gutter-phone\)/);
  assert.match(shell, /\.prodigy-app-shell\[data-tier="medium"\]\s*\{[^}]*--prodigy-inline-gutter:\s*var\(--prodigy-gutter-pad-portrait\)/);
  assert.match(shell, /\.prodigy-app-shell\[data-tier="wide"\]\s*\{[^}]*--prodigy-inline-gutter:\s*var\(--prodigy-gutter-mac\)/);
  assert.match(shell, /@media \(min-width: 1024px\) and \(max-width: 1068px\)[\s\S]*?--prodigy-inline-gutter:\s*var\(--prodigy-gutter-pad-landscape\)/);
  assert.match(shell, /@media \(min-width: 1441px\)[\s\S]*?--prodigy-inline-gutter:\s*var\(--prodigy-gutter-mac-content-max\)/);
  assert.match(shell, /\.prodigy-app-shell\.prodigy-app-shell:is\(\[data-tier="compact"\],\[data-tier="medium"\],\[data-tier="wide"\]\)\s*>\s*:is\(\.prodigy-workspace-bar,\.prodigy-context-bar,\.prodigy-app-shell-body\)\s*\{[^}]*padding-inline:\s*var\(--prodigy-inline-gutter\) !important/);
  assert.doesNotMatch(shell, /padding-inline:\s*4px/);
});

test("major workspace surfaces consume semantic typography tokens", () => {
  const surfaces = {
    home: ["SYSTEM/Views/home-styles.js"],
    workout: ["SYSTEM/Views/workout-view.js"],
    personal: ["SYSTEM/Views/people-styles.js"],
    journal: ["SYSTEM/Views/journal-dashboard-view.js"],
    knowledge: ["SYSTEM/Views/knowledge-explorer-responsive.js", "SYSTEM/Views/knowledge-explorer-render.js"],
  };
  for (const [workspace, graph] of Object.entries(surfaces)) {
    const text = graph.map(source).join("\n");
    assert.match(text, /--ke-type-(?:label|body|heading|title)/, workspace + " graph uses the shared type scale");
    assert.match(text, /--ke-leading-(?:body|control)/, workspace + " graph uses the shared leading scale");
  }
});

test("dense reading chrome does not fall below the shared chrome floor", () => {
  const reading = source("SYSTEM/Views/reading-card.js");
  assert.doesNotMatch(reading, /font-size:\s*0\.62em/);
  assert.match(reading, /font-size:\s*var\(--ke-type-chrome/);
});

test("journal period role copy stays explicit in the Daily, Weekly, and Monthly surfaces", () => {
  assert.match(source("SYSTEM/Views/journal-dashboard-view.js"), /오늘 무엇이 나를 변화시켰는지 기록합니다/);
  assert.match(source("SYSTEM/Views/weekly-filter-view.js"), /이번 주에 무엇이 반복되었고 무엇을 배웠는지 살펴봅니다/);
  assert.match(source("SYSTEM/Views/monthly-validation-view.js"), /이번 달의 변화가 반복된 근거로 검증되는지 확인합니다/);
});
