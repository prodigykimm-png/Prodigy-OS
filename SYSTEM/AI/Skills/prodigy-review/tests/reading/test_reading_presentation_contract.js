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
  assert.doesNotMatch(view, /reading-responsive-pane\{[^}]*overflow:\s*auto/);
  assert.match(view, /\.prodigy-app-shell\[data-workspace-id="reading"\]>.prodigy-workspace-bar\{padding-inline:4px\}/);
  assert.match(read("SYSTEM/Views/prodigy-app-shell.js"), /\.prodigy-app-shell\[data-workspace-id="auction"\] > \.prodigy-workspace-bar,[\s\S]*?\.prodigy-app-shell\[data-workspace-id="reading"\] > \.prodigy-workspace-bar \{[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;[\s\S]*?padding-inline: 4px;/, "Reading title must own the full AppShell compact row without type shrink");
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
