"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const paths = [
  "SYSTEM/Views/home-styles.js",
  "SYSTEM/Views/home-view.js",
];
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

function validateHomePresentation(sources) {
  const joined = Object.values(sources).join("\n");
  assert.doesNotMatch(joined, /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i, "Home owns no local palette literal");
  assert.doesNotMatch(joined, /(?:box|text)-shadow\s*:\s*(?!none\b)/i, "Home owns no chrome shadow");
  assert.doesNotMatch(joined, /(?:linear|radial|conic)-gradient\s*\(/i, "Home owns no decorative gradient");
  assert.doesNotMatch(joined.replace(/font-size:\s*(?:1\.2|0\.95)em/g, ""), /font-size\s*:\s*[0-9.]/, "Home type must use shared type roles; only icon scale may use em");
  assert.doesNotMatch(joined, /border-radius\s*:\s*[0-9.]/, "Home radii must use shared radius roles");
  assert.doesNotMatch(joined, /@media\s*\([^)]*(?:width)\s*:\s*\d+px/i, "Home owns no private numeric breakpoint");
  assert.doesNotMatch(joined, /BREAKPOINTS\.(?:medium|wide)/, "Home must consume the shared Apple breakpoint API");
  assert.doesNotMatch(joined, /transform\s*:\s*translateY|\.on(?:mouse|pointer)(?:down|up|leave)\s*=/, "one activation must use the shared one-event control behavior");

  assert.match(sources["SYSTEM/Views/home-styles.js"], /RESPONSIVE_BREAKPOINTS/);
  assert.match(joined, /var\(--ke-color-interactive/);
  assert.match(joined, /var\(--ke-color-surface/);
  assert.match(joined, /var\(--ke-type-(?:body|title|heading|label)/);
  assert.match(joined, /var\(--ke-space-/);
  assert.match(joined, /var\(--ke-radius-/);
  assert.match(joined, /var\(--ke-touch-target/);
  assert.match(joined, /scale\(0\.95\)/);
  assert.match(joined, /focus-visible/);
  assert.match(joined, /forced-colors:\s*active/);
  assert.match(joined, /prefers-reduced-motion:\s*reduce/);
  assert.match(sources["SYSTEM/Views/home-view.js"], /home-focus-card prodigy-full-bleed/);
}

test("Home consumes the shared Apple presentation contract", () => {
  validateHomePresentation(Object.fromEntries(paths.map((relative) => [relative, read(relative)])));
});

test("Home presentation oracle turns local literal, shadow, breakpoint, and multi-event drift RED", () => {
  const clean = Object.fromEntries(paths.map((relative) => [relative, read(relative)]));
  const target = "SYSTEM/Views/home-styles.js";
  const mutations = [
    ".mutation{color:#fff}",
    ".mutation{box-shadow:0 2px 8px currentColor}",
    ".mutation{font-size:13px;border-radius:7px}",
    "@media (max-width:700px){.mutation{display:block}}",
    ".mutation{transform:translateY(1px)}",
  ];
  for (const mutation of mutations) {
    assert.throws(() => validateHomePresentation({ ...clean, [target]: `${clean[target]}\n${mutation}` }), /Home|activation|breakpoint/);
  }
});
