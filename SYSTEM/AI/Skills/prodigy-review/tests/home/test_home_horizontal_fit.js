"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const STYLES_PATH = path.join(ROOT, "SYSTEM/Views/home-styles.js");
const VIEW_PATH = path.join(ROOT, "SYSTEM/Views/home-view.js");

function styleSource() {
  return fs.readFileSync(STYLES_PATH, "utf8");
}

function ruleBody(source, selector) {
  const index = source.indexOf(selector);
  if (index < 0) return "";
  const open = source.indexOf("{", index);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

test("Given Home sets an explicit pixel width, When it also carries horizontal padding, Then it must use border-box so the padding cannot push content past the viewport", () => {
  const source = styleSource();
  const view = fs.readFileSync(VIEW_PATH, "utf8");

  assert.match(view, /container\.style\.width = `\$\{homeWidth\}px`/);

  const body = ruleBody(source, ".prodigy-home {");
  assert.match(body, /padding:/);
  assert.match(body, /box-sizing:\s*border-box/);
});

test("Given a narrow phone width, When Home renders, Then it keeps a horizontal gutter instead of pinning cards to the screen edge", () => {
  const source = styleSource();
  const narrow = ruleBody(source, ".prodigy-home.home-narrow {");

  assert.doesNotMatch(narrow, /padding-inline:\s*0(?![.\d])/);
});

test("Given Home content, When any child is wider than its column, Then Home must not produce a horizontal scrollbar", () => {
  const source = styleSource();
  const body = ruleBody(source, ".prodigy-home {");

  assert.match(body, /max-inline-size:\s*100%|max-width:\s*100%/);
  assert.match(body, /overflow-x:\s*hidden|overflow-x:\s*clip/);
});

test("Given Home type sizes, When rendered on a phone, Then no declared em size falls below the legibility floor", () => {
  const sources = [styleSource(), fs.readFileSync(VIEW_PATH, "utf8")];
  const FLOOR_EM = 0.72;
  const offenders = [];

  for (const source of sources) {
    const matches = source.matchAll(/font-size:\s*(0\.\d+)em/g);
    for (const match of matches) {
      const value = Number(match[1]);
      if (value < FLOOR_EM) offenders.push(match[0]);
    }
  }

  assert.deepEqual(offenders, [], "본문·배지 글자가 " + FLOOR_EM + "em 미만이면 모바일에서 판독이 어렵다: " + offenders.join(", "));
});
