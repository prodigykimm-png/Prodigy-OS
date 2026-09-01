"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const READING_PRESENTATION = [
  "HUB/20 Reading.md",
  "SYSTEM/Views/reading-card.js",
  "SYSTEM/Views/reading-checklist-view.js",
  "SYSTEM/Views/reading-memory-view.js",
  "SYSTEM/Views/reading-styles.js",
  "SYSTEM/Views/reading-view.js"
];
const FORBIDDEN_PRIVATE_BREAKPOINT = /@media[^\n{]*(?:480|599|600|760|767)px/i;
const FORBIDDEN_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/i;
const FORBIDDEN_GRADIENT = /(?:linear|radial)-gradient\s*\(/i;
const SHADOW_DECLARATION = /(?:box|text)-shadow\s*:\s*([^;"'`}]+)/gi;

function assertReadingPresentation(source, label) {
  assert.doesNotMatch(source, FORBIDDEN_COLOR, `${label}: raw color`);
  assert.doesNotMatch(source, FORBIDDEN_GRADIENT, `${label}: decorative gradient`);
  assert.doesNotMatch(source, FORBIDDEN_PRIVATE_BREAKPOINT, `${label}: private breakpoint`);
  const declarations = [...source.matchAll(SHADOW_DECLARATION)].map((match) => match[0]);
  assert.deepEqual(declarations, [], `${label}: card/chrome shadow declaration`);
}

function assertActualImageShadowOnly(source) {
  const imageShadowUses = source.match(/T\.SHADOWS\.image/g) || [];
  assert.equal(imageShadowUses.length, 1, "one approved image shadow use");
  assert.match(source, /createEl\(['"]img['"][\s\S]*?T\.SHADOWS\.image/);
  const generatedStart = source.indexOf("reading-generated-cover");
  assert.ok(generatedStart >= 0, "generated cover has a structural class");
  const generatedBlock = source.slice(generatedStart, source.indexOf("cover.onclick", generatedStart));
  assert.doesNotMatch(generatedBlock, /SHADOWS\.image|shadow|gradient|\bhsl/i);
}

function mutationMustDie(base, mutation, reason) {
  assert.throws(() => assertReadingPresentation(`${base}\n${mutation}`, "mutation"), reason);
}

test("Reading presentation removes frozen palette, generated decoration, card shadows, and private breakpoints", () => {
  for (const rel of READING_PRESENTATION) assertReadingPresentation(read(rel), rel);
  const card = read("SYSTEM/Views/reading-card.js");
  assertActualImageShadowOnly(card);
  assert.match(card, /reading-card-content-hero/);
  assert.match(card, /min-(?:height|block-size):\s*(?:var\([^)]*44px\)|44px)/);
  const view = read("SYSTEM/Views/reading-view.js");
  const styles = read("SYSTEM/Views/reading-styles.js");
  assert.doesNotMatch(view, /reading-responsive-pane\{[^}]*overflow:\s*auto/);
  assert.match(styles, /\.prodigy-app-shell\[data-workspace-id="reading"\]\s*>\s*\.prodigy-workspace-bar\s*\{[^}]*padding-inline:\s*var\(--prodigy-inline-gutter/);
  assert.match(read("SYSTEM/Views/prodigy-app-shell.js"), /\.prodigy-app-shell\[data-workspace-id="auction"\] > \.prodigy-workspace-bar,[\s\S]*?\.prodigy-app-shell\[data-workspace-id="reading"\] > \.prodigy-workspace-bar \{[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;/, "Reading title must keep the stacked compact row without shrinking the shared gutter");
});

test("Reading in-progress cards keep comfortable outer and inner spacing", () => {
  const styles = read("SYSTEM/Views/reading-styles.js");
  const card = read("SYSTEM/Views/reading-card.js");
  assert.match(styles, /\.reading-hub-section,\s*\.prodigy-hub-note \.el-h1:has\(\+ \.el-pre > \.reading-hub-section\)\s*\{[^}]*padding-inline:\s*\$\{gutter\.phone \|\| 20\}px/);
  assert.match(styles, /\.prodigy-hub-note \.el-h1:has\(\+ \.el-pre > \.reading-hub-section\)/);
  assert.match(styles, /@media \(min-width: \$\{phoneMax \+ 1\}px\)[\s\S]*?padding-inline:\s*\$\{\(gutter\.pad && gutter\.pad\.portrait\) \|\| 32\}px/);
  assert.match(styles, /@media \(min-width: \$\{utilityTwoColumnMax \+ 1\}px\)[\s\S]*?padding-inline:\s*\$\{\(gutter\.pad && gutter\.pad\.landscape\) \|\| 48\}px/);
  assert.match(styles, /@media \(min-width: \$\{contentMax \+ 1\}px\)[\s\S]*?padding-inline:\s*\$\{\(gutter\.mac && gutter\.mac\.atContentMax\) \|\| 80\}px/);
  assert.match(styles, /\n\.reading-responsive-list\s*\{[^}]*padding:\s*var\(--ke-space-4,\s*17px\)/);
  assert.match(styles, /\.reading-responsive-workspace\[data-reading-layout="compact"\] \.reading-responsive-list,\s*\.reading-responsive-workspace\[data-reading-layout="medium"\] \.reading-responsive-list\s*\{[^}]*padding:\s*var\(--ke-space-4,\s*17px\)/);
  assert.match(styles, /\.reading-card\s*\{[^}]*padding:\s*var\(--ke-space-4,\s*17px\) var\(--ke-space-5,\s*24px\)/);
  assert.match(styles, /\.reading-card-hero\s*\{[^}]*padding:\s*clamp\(24px,\s*5vw,\s*32px\)/);
  assert.match(styles, /\.reading-card\.is-focus\s*\{[^}]*border-inline-start:\s*4px[^}]*outline:\s*none/);
  assert.doesNotMatch(card, /const focusBorder = isFocus/);
  assert.doesNotMatch(card, /reading-card-content-hero[\s\S]{0,400}padding:/);
  assert.doesNotMatch(card, /reading-card-content-hero[\s\S]{0,400}outline:/);
  assert.doesNotMatch(card, /reading-card-content-hero[\s\S]{0,400}style:\s*`border:/);
  assert.doesNotMatch(card, /reading-card-simple[\s\S]{0,400}padding:/);
  assert.doesNotMatch(card, /reading-card-simple[\s\S]{0,400}style:\s*`border:/);
});

test("Reading mutation oracle kills every frozen residual and enforces actual-image-only shadow", () => {
  const clean = ".fixture{color:var(--text-normal)}";
  mutationMustDie(clean, ".x{color:#06b6d4}", /raw color/);
  mutationMustDie(clean, ".x{color:hsl(20,55%,22%)}", /raw color/);
  mutationMustDie(clean, ".x{background:rgba(0,0,0,.1)}", /raw color/);
  mutationMustDie(clean, ".x{background:linear-gradient(red,blue)}", /gradient/);
  mutationMustDie(clean, ".x{box-shadow:0 4px 8px black}", /shadow/);
  mutationMustDie(clean, "@media(max-width:600px){.x{display:block}}", /private breakpoint/);
  assert.throws(() => assertActualImageShadowOnly("const x = T.SHADOWS.image; const y = T.SHADOWS.image; reading-generated-cover; cover.onclick"), /one approved image shadow/);
});
