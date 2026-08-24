"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("iPhone Home uses quiet toolbar controls and a 50px primary decision", () => {
  const styles = read("SYSTEM/Views/home-styles.js");
  assert.match(
    styles,
    /\.prodigy-home \.home-toolbar \.action-btn\s*\{[\s\S]*?border-color:\s*transparent\s*!important[\s\S]*?background:\s*transparent\s*!important/
  );
  assert.match(
    styles,
    /\.prodigy-home \.home-toolbar \.home-toolbar-primary\s*\{[\s\S]*?color:\s*var\(--ke-color-interactive\)\s*!important/
  );
  assert.match(
    styles,
    /\.prodigy-home\.home-compact \.home-stale-badge\s*\{[\s\S]*?margin-inline-start:\s*0[\s\S]*?max-inline-size:\s*100%/
  );
  assert.match(
    styles,
    /\.prodigy-home\.home-compact \.focus-footer \.action-btn-primary[\s\S]*?min-height:\s*var\(--home-primary-cta-height\)\s*!important/
  );
  assert.match(read("SYSTEM/Views/home-view.js"), /--home-primary-cta-height[\s\S]*?DEVICE_TABLE\.primaryCta\.phone\.visualHeight/);
});

test("iPad Home keeps the briefing full width and the workspace dock at the bottom", () => {
  const styles = read("SYSTEM/Views/home-styles.js");
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\][\s\S]*?\.home-mc-stack\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*?"dock"/
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\][\s\S]*?\.home-ws-dock\s*\{[\s\S]*?grid-area:\s*dock;[\s\S]*?margin-block-start:\s*var\(--ke-space-5\)/
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\][\s\S]*?\.home-ws-dock-btn:first-child\s*\{[\s\S]*?color-mix\(in srgb,\s*var\(--ke-color-interactive\)\s*12%/
  );
});

test("iPad Auction expands the briefing full width and stacks status counts beneath it", () => {
  const styles = read("SYSTEM/Views/auction-hub-styles.js");
  assert.match(
    styles,
    /\.markdown-preview-view\.prodigy-hub-note:has\(\.prodigy-app-shell\[data-tier="medium"\]\) \.auction-hub-section\.auction-hub-today\s*\{\s*display:\s*block;/
  );
  assert.match(
    styles,
    /\.markdown-preview-view\.prodigy-hub-note:has\(\.prodigy-app-shell\[data-tier="wide"\]\)[\s\S]*?\.auction-hub-section\.auction-hub-today[\s\S]*?grid-template-columns:\s*260px\s+minmax\(0,\s*1fr\)/
  );
  assert.match(
    styles,
    /\.markdown-preview-view\.prodigy-hub-note:has\(\.prodigy-app-shell\[data-tier="compact"\]\)[\s\S]*?\.auction-hub-stat-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.auction-native-sidebar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
  );
  assert.match(
    styles,
    /\.auction-native-detail-pane \.auction-native-sidebar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.auction-native-home\s*\{[\s\S]*?grid-template-columns:\s*1fr/
  );
  assert.match(
    styles,
    /\.auction-hub-stat-row\s*\{[\s\S]*?word-break:\s*keep-all/
  );
  assert.match(
    styles,
    /\.auction-hub-stat-row > \*\s*\{[\s\S]*?overflow-wrap:\s*normal[\s\S]*?word-break:\s*keep-all/
  );
});

test("responsive AppShell actions remain borderless accent controls", () => {
  const shell = read("SYSTEM/Views/prodigy-app-shell.js");
  assert.match(
    shell,
    /\.prodigy-app-shell \.prodigy-context-action\s*\{[\s\S]*?border-color:\s*transparent[\s\S]*?background:\s*transparent[\s\S]*?color:\s*var\(--ke-color-accent/
  );
  assert.match(shell, /\.prodigy-context-action:focus-visible/);
});
