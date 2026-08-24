"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("native approval note binds official app references to current pilot artifacts", () => {
  const note = read("HUB/Apple 기본 앱 UI 승인.md");
  const css = read(".obsidian/snippets/base.css");

  assert.match(note, /cssclasses:\s*\n\s*-\s*prodigy-native-approval/);
  assert.match(note, /id:\s*"home"/);
  assert.match(note, /id:\s*"auction"/);
  assert.match(note, /"data-native-screen":\s*screen\.id/);
  assert.match(note, /id1110145103/);
  assert.match(note, /id1108187841/);
  assert.match(note, /id1110145109/);
  assert.match(note, /\.omo\/evidence\/apple-ui-native-pilot\/screenshots\/home-mac-1440-light\.png/);
  assert.match(note, /\.omo\/evidence\/apple-ui-native-pilot\/screenshots\/auction-mac-1440-light\.png/);
  assert.match(note, /\.omo\/evidence\/apple-ui-native-pilot\/screenshots\/auction-calendar-mac-1440-light\.png/);
  assert.match(note, /for \(const pilot of screen\.pilots\)/);
  assert.doesNotMatch(note, /apple\.com\/kr\/(?:macbook-air|apple-vision-pro)/);

  assert.match(css, /\.markdown-preview-view\.prodigy-native-approval/);
  assert.match(css, /\.markdown-preview-view\.prodigy-native-approval \.metadata-container,[\s\S]*?\.markdown-preview-view\.prodigy-native-approval \.inline-title[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /\.native-approval-comparison[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*800px\)[\s\S]*?\.native-approval-comparison[\s\S]*?grid-template-columns:\s*1fr/);
});
