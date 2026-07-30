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

test("Given Home must fit any leaf width, When it sizes itself, Then it must not pin a pixel width or a calc margin that can go negative", () => {
  const view = fs.readFileSync(VIEW_PATH, "utf8");

  assert.doesNotMatch(view, /container\.style\.width = `\$\{homeWidth\}px`/);
  assert.doesNotMatch(view, /marginLeft = `calc\(\(100% - \$\{homeWidth\}px\) \/ 2\)`/);
});

test("Given Home carries horizontal padding, When it renders, Then border-box keeps the padding inside the measured width", () => {
  const body = ruleBody(styleSource(), ".prodigy-home {");

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

  assert.match(body, /max-inline-size:\s*min\(100%/, "Home 폭 상한은 부모를 넘지 않는 min(100%, …) 형태여야 한다");
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

test("Given compact Home buttons, When text sits inside them, Then padding and line-height leave breathing room instead of hugging the glyphs", () => {
  const source = styleSource();
  const dock = ruleBody(source, ".prodigy-home .home-ws-dock-btn {");

  assert.match(dock, /padding:\s*0 var\(--ke-space-2\)|padding-block:/);
  assert.match(dock, /line-height:\s*1\.[3-9]/, "버튼 line-height가 1.3 미만이면 글자가 버튼에 딱 붙어 보인다");
});
