#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const files = [
  "HUB/60 Personal.md",
  "SYSTEM/Views/people-styles.js",
  "SYSTEM/Views/people-view.js",
  "SYSTEM/Views/people-context-render.js",
  "SYSTEM/Views/venue-view.js",
];
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const production = () => files.map(source).join("\n");

function assertPresentationContract(text) {
  assert.doesNotMatch(text, /color-mix\s*\(/i);
  assert.doesNotMatch(text, /box-shadow\s*:\s*(?!none\b)[^;]+/i);
  assert.doesNotMatch(text, /@media\s*\([^)]*(?:760|900)px/i);
  assert.doesNotMatch(text, /(?:linear|radial|conic)-gradient\s*\(/i);
  assert.doesNotMatch(text, /url\s*\(\s*["']?https?:/i);
}

test("Personal presentation consumes shared Apple roles without local chrome", () => {
  const text = production();
  assertPresentationContract(text);
  assert.match(text, /prodigy-full-bleed/);
  assert.match(text, /prodigy-utility-card/);
  assert.match(text, /prodigy-configurator-chip/);
  assert.match(text, /var\(--ke-touch-target/);
  assert.match(text, /box-shadow:none/);
  assert.match(text, /\.ppw-trash\.ppw-trash,\.ppw-memo-del\.ppw-memo-del\{[^}]*box-shadow:none/, "People icon controls must outrank Obsidian's native button shadow");
  assert.match(text, /\.ppv-venue-search\.ppv-venue-search,\.ppv-venue-select\.ppv-venue-select[^}]*box-shadow:none/, "Venue form controls must outrank Obsidian's native control shadow");
  assert.match(text, /\.ppv-venue-select\{[^}]*flex:1 1 10rem[^}]*max-inline-size:100%/, "Venue selects must wrap and shrink at 200% zoom");
  assert.match(text, /@media\(max-width:\$\{venueSinglePaneMax\(\)\}px\)\{[^}]*\.ppv-venue-toolbar-row\{display:grid;grid-template-columns:minmax\(0,1fr\)/, "Venue filter rows must have stable single-column geometry at compact and 200% zoom widths");
  assert.match(text, /@media\(max-width:480px\)\{\.prodigy-app-shell\[data-workspace-id="personal"\]>.prodigy-workspace-bar\{padding-inline:4px\}\.prodigy-app-shell\[data-workspace-id="personal"\] \.ppv-venue-toolbar\{padding-inline:4px\}\}/, "Personal must return owned bar and filter width at 200% zoom");
  assert.match(text, /\.ppw-detail-back\{display:inline-flex\}/, "People Back exists only while the single pane is active and must remain measurable");
  assert.match(text, /\.ppv-venue-detail-back\{display:inline-flex\}/, "Venue Back exists only while the single pane is active and must remain measurable");
  assert.doesNotMatch(text, /detail-back\{display:none\}/, "conditionally mounted Back controls must not be synthetically hidden");
  assert.match(text, /\.ppw-name[^}]*min-block-size:var\(--ke-touch-target\)/);
  assert.match(text, /:focus-visible/);
  assert.match(text, /:active[^{]*\{[^}]*scale\(0\.95\)/s);
  assert.match(text, /:disabled/);
  assert.match(text, /forced-colors:\s*active/);
  assert.match(text, /prefers-reduced-motion:\s*reduce/);
  assert.match(text, /word-break:\s*keep-all/);
  assert.match(text, /data-state/);
});

test("Personal pane tiers cover requested phone, tablet, and desktop widths", () => {
  const view = require(path.join(ROOT, "SYSTEM/Views/people-view.js"));
  assert.equal(view.resolvePeoplePaneLayout(390).paneMode, "single-pane");
  assert.equal(view.resolvePeoplePaneLayout(834).paneMode, "single-pane");
  assert.equal(view.resolvePeoplePaneLayout(1068).paneMode, "two-pane");
  assert.equal(view.resolvePeoplePaneLayout(1440).paneMode, "two-pane");
  assert.doesNotMatch(source("SYSTEM/Views/venue-view.js"), /data-scroll-owner/);
});

test("Personal mutation oracle rejects local mix, shadow, breakpoint, gradient, and asset", () => {
  for (const mutation of [
    ".x{background:color-mix(in srgb,red 10%,white)}",
    ".x{box-shadow:0 1px 2px black}",
    "@media(max-width:760px){.x{display:none}}",
    ".x{background:radial-gradient(red,blue)}",
    ".x{background:url('https://example.com/a.png')}",
  ]) assert.throws(() => assertPresentationContract(mutation));
});
