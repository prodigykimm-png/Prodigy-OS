"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const STYLES_PATH = path.join(ROOT, "SYSTEM/Views/home-styles.js");
const VIEW_PATH = path.join(ROOT, "SYSTEM/Views/home-view.js");
const APP_SHELL_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js");

function styleSource() {
  return fs.readFileSync(STYLES_PATH, "utf8");
}

function ruleBody(source, selector) {
  const trimmed = selector.trim();
  const grouped = trimmed.endsWith(",");
  const target = grouped ? trimmed : trimmed.replace(/\s*\{$/, "") + " {";
  const index = source.lastIndexOf(target);
  if (index < 0) return "";
  const open = grouped ? source.indexOf("{", index + target.length) : index + target.length - 1;
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

function ruleBodies(source, selector) {
  const target = selector.trim().replace(/\s*\{$/, "") + " {";
  const bodies = [];
  let from = 0;
  while (from < source.length) {
    const index = source.indexOf(target, from);
    if (index < 0) break;
    const open = index + target.length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(source.slice(open + 1, i));
          from = i + 1;
          break;
        }
      }
    }
  }
  return bodies;
}

function exactRuleBody(source, selector) {
  const target = selector.trim().replace(/\s*\{$/, "");
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{`, "g").exec(source);
  if (!match) return "";
  const open = source.indexOf("{", match.index + match[0].lastIndexOf(target));
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

function cssNumericValue(body, property, unit) {
  const direct = body.match(new RegExp(property + "\\s*:\\s*([0-9.]+)" + unit));
  if (direct) return Number(direct[1]);
  const tokenFallback = body.match(
    new RegExp(property + "\\s*:\\s*var\\([^,]+,\\s*([0-9.]+)" + unit + "\\)")
  );
  return tokenFallback ? Number(tokenFallback[1]) : null;
}

test("Given Home must fit any leaf width, When it sizes itself, Then it must not pin a pixel width or a calc margin that can go negative", () => {
  const view = fs.readFileSync(VIEW_PATH, "utf8");

  assert.doesNotMatch(view, /container\.style\.width = `\$\{homeWidth\}px`/);
  assert.doesNotMatch(view, /marginLeft = `calc\(\(100% - \$\{homeWidth\}px\) \/ 2\)`/);
});

test("Given Home carries horizontal padding, When it renders, Then border-box keeps the padding inside the measured width", () => {
  const body = exactRuleBody(styleSource(), ".prodigy-home {");

  assert.match(body, /padding:/);
  assert.match(body, /box-sizing:\s*border-box/);
});

test("Given desktop Home, When the leaf is wider than the reading surface, Then measured width cannot stretch content past 1180px", () => {
  const source = styleSource();
  const body = exactRuleBody(source, ".prodigy-home {");
  const shellChildren = ruleBody(source, '.prodigy-app-shell[data-workspace-id="home"] * {');

  assert.match(body, /max-inline-size:\s*min\(100%,\s*1180px\)/);
  assert.doesNotMatch(body, /max-inline-size:[^;]*--home-measured-width/);
  assert.doesNotMatch(shellChildren, /max-inline-size/, "Home shell descendants must not override the Home reading-surface cap");
});

test("Given iPad and compact layouts, When Home and shared workspace bodies render, Then canonical page gutters keep content off the screen edge", () => {
  const home = styleSource();
  const shell = fs.readFileSync(APP_SHELL_PATH, "utf8");
  const mediumHome = exactRuleBody(home, '.prodigy-app-shell[data-tier="medium"] .prodigy-home {');
  const compactHome = exactRuleBody(home, '.prodigy-app-shell[data-tier="compact"] .prodigy-home {');
  const mediumBody = exactRuleBody(shell, '.prodigy-app-shell[data-tier="medium"] > .prodigy-app-shell-body {');

  assert.match(mediumHome, /padding-inline:\s*var\(--ke-space-6,\s*32px\)/);
  assert.match(compactHome, /padding-inline:\s*var\(--ke-space-5,\s*20px\)/);
  assert.match(mediumBody, /padding-inline:\s*var\(--ke-space-6,\s*32px\)/);
});

test("Given Home sections on iPad and desktop, When the command stream renders, Then sections retain canonical breathing space", () => {
  const source = styleSource();
  const medium = exactRuleBody(source, '.prodigy-app-shell[data-tier="medium"] .prodigy-home .home-mc-stack {');
  const wide = exactRuleBody(source, ".prodigy-home.home-wide .home-mc-stack {");

  assert.match(medium, /row-gap:\s*var\(--ke-space-4,\s*17px\)/);
  assert.match(wide, /row-gap:\s*var\(--ke-space-4,\s*17px\)/);
});

test("Given a narrow phone width, When Home renders, Then it keeps a horizontal gutter instead of pinning cards to the screen edge", () => {
  const source = styleSource();
  const narrow = ruleBody(source, ".prodigy-home.home-narrow {");

  assert.doesNotMatch(narrow, /padding-inline:\s*0(?![.\d])/);
});

test("Given Home content, When any child is wider than its column, Then Home fits by sizing and wrapping rather than hiding overflow", () => {
  const source = styleSource();
  const body = exactRuleBody(source, ".prodigy-home {");

  assert.match(body, /max-inline-size:\s*min\(100%/, "Home 폭 상한은 부모를 넘지 않는 min(100%, …) 형태여야 한다");
  assert.match(body, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(body, /overflow-x:\s*(?:hidden|clip)/);
});

test("Given Home recovery at 390px and 200% zoom, When error copy and retry share a row, Then the copy keeps measurable wrapping space", () => {
  const source = styleSource();
  const recovery = ruleBody(source, '.prodigy-app-shell[data-workspace-id="home"] .prodigy-inline-error {');
  const copy = ruleBody(source, '.prodigy-app-shell[data-workspace-id="home"] .prodigy-inline-error > span {');

  assert.match(recovery, /flex-wrap:\s*wrap/);
  assert.match(recovery, /inline-size:\s*100%/);
  assert.match(copy, /flex:\s*1 1/);
  assert.match(copy, /min-inline-size:\s*0/);
});

test("Given an effective 195px Home content viewport, When compact controls reflow, Then owned rows stack without shrinking controls or breaking Korean tokens", () => {
  const source = styleSource();
  assert.doesNotMatch(source, /@media\s*\(max-width:\s*480px\)/);
  const row = ruleBody(source, ".prodigy-home.home-compact .home-evening-close,");
  const action = ruleBody(source, ".prodigy-home.home-compact .continue-row > .home-continue-meta,");
  const actionSemantics = ruleBody(source, ".prodigy-home.home-compact .action-btn {");
  const semantics = ruleBody(source, ".prodigy-home.home-compact .focus-top,");
  assert.match(row, /flex-direction:\s*column/);
  assert.match(row, /align-items:\s*stretch/);
  assert.match(action, /inline-size:\s*100%/);
  assert.match(action, /padding-inline:\s*var\(--ke-space-1,\s*2px\)/);
  assert.match(actionSemantics, /word-break:\s*keep-all/);
  assert.match(actionSemantics, /overflow-wrap:\s*anywhere/);
  assert.match(semantics, /word-break:\s*keep-all/);
  assert.match(semantics, /overflow-wrap:\s*normal/);
  assert.doesNotMatch(row + action + actionSemantics + semantics, /(?:font-size|min-block-size):\s*(?:0|[0-3][0-9]px)/);
});

test("Given Home type sizes, When rendered on a phone, Then no declared em size falls below the legibility floor", () => {
  const sources = [styleSource(), fs.readFileSync(VIEW_PATH, "utf8")];
  const BODY_FLOOR_EM = 0.72;
  const CHROME_FLOOR_EM = 0.64;
  const offenders = [];

  const chromeRules = [
    ".prodigy-home .home-ws-dock-btn {",
    ".prodigy-home .home-ws-dock-icon {"
  ];
  const chromeBodies = chromeRules.map((selector) => ruleBody(styleSource(), selector));

  for (const source of sources) {
    const matches = source.matchAll(/font-size:\s*(0\.\d+)em/g);
    for (const match of matches) {
      const value = Number(match[1]);
      const inChrome = chromeBodies.some((body) => body.includes(match[0]));
      const floor = inChrome ? CHROME_FLOOR_EM : BODY_FLOOR_EM;
      if (value < floor) offenders.push(match[0] + (inChrome ? " (chrome)" : " (body)"));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "본문·배지는 " + BODY_FLOOR_EM + "em, 고정 높이 크롬 라벨은 " + CHROME_FLOOR_EM + "em이 하한이다: " + offenders.join(", ")
  );
});

test("Given compact Home buttons, When text sits inside them, Then padding and line-height leave breathing room instead of hugging the glyphs", () => {
  const source = styleSource();
  const dock = ruleBody(source, ".prodigy-home .home-ws-dock-btn {");

  assert.match(dock, /padding:\s*0 var\(--ke-space-2\)|padding-block:/);
  const lineHeight = cssNumericValue(dock, "line-height", "");
  assert.ok(lineHeight !== null, "버튼 line-height 선언 또는 토큰 fallback이 있어야 한다");
  assert.ok(lineHeight >= 1.3, "버튼 line-height가 1.3 미만이면 글자가 버튼에 딱 붙어 보인다: " + lineHeight);
});

test("Given a fixed-height workspace dock button, When icon and label stack inside it, Then the label is small enough and the icon is not oversized so the text does not fill the button edge to edge", () => {
  const source = styleSource();
  const dock = ruleBody(source, ".prodigy-home .home-ws-dock-btn {");
  const icon = ruleBody(source, ".prodigy-home .home-ws-dock-icon {");

  const dockFont = cssNumericValue(dock, "font-size", "rem");
  assert.ok(dockFont !== null, "버튼 font-size 선언 또는 토큰 fallback이 있어야 한다");
  assert.ok(
    dockFont <= 0.68,
    "44px 고정 높이 버튼에서 0.68rem를 넘으면 글자가 버튼을 꽉 채운다: " + dockFont
  );

  const iconFont = icon.match(/font-size:\s*([0-9.]+)em/);
  assert.ok(iconFont, "아이콘 font-size 선언이 있어야 한다");
  assert.ok(
    Number(iconFont[1]) <= 1.0,
    "아이콘이 1.0em를 넘으면 라벨 공간을 잠식한다: " + iconFont[1]
  );

  assert.doesNotMatch(dock, /font-weight:\s*700/, "700 굵기는 작은 글자를 버튼에 더 붙어 보이게 한다");
});

test("Given Home runs inside the mobile Obsidian chrome, When the user reaches the bottom, Then the last content can clear the action bar and iPhone safe area", () => {
  const source = styleSource();
  const compact = ruleBodies(source, ".prodigy-home.home-compact {").join("\n");
  const scrollOwner = ruleBody(
    source,
    '.prodigy-app-shell[data-workspace-id="home"] > .prodigy-app-shell-body {'
  );

  assert.match(compact, /padding-bottom:\s*var\(--home-mobile-bottom-clearance\)/);
  assert.match(scrollOwner, /--home-mobile-bottom-clearance:\s*calc\(/);
  assert.match(scrollOwner, /var\(--prodigy-action-bar-height,\s*52px\)/);
  assert.match(scrollOwner, /env\(safe-area-inset-bottom,\s*0px\)/);
  assert.match(scrollOwner, /var\(--ke-space-5,\s*16px\)/);
  assert.match(scrollOwner, /scroll-padding-block-end:\s*var\(--home-mobile-bottom-clearance\)/);
});

test("Given the mobile Obsidian toolbar overlays the viewport, When Home defines its bottom clearance, Then the clearance covers the real floating toolbar, not just a 52px action bar", () => {
  const source = styleSource();
  const scrollOwner = ruleBody(
    source,
    '.prodigy-app-shell[data-workspace-id="home"] > .prodigy-app-shell-body {'
  );

  // The iOS Obsidian toolbar floats above the content and is taller than the
  // in-app action bar, so a 52px-only budget still leaves content underneath it.
  assert.match(
    scrollOwner,
    /--home-mobile-toolbar-clearance/,
    "Home must budget the floating mobile toolbar explicitly",
  );
  assert.match(
    scrollOwner,
    /var\(--home-mobile-toolbar-clearance[^)]*\)/,
    "the clearance calc must consume the toolbar budget",
  );
});

test("Given Obsidian already owns the document scroll, When Home renders on mobile, Then Home does not create a nested 100dvb scroll surface", () => {
  const shell = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js"), "utf8");
  const mobileHomeShell = ruleBody(
    shell,
    '.prodigy-app-shell[data-workspace-id="home"] {'
  );
  const mobileHomeBody = ruleBody(
    shell,
    '.prodigy-app-shell[data-workspace-id="home"] > .prodigy-app-shell-body {'
  );

  assert.match(
    shell,
    /--prodigy-mobile-toolbar-clearance/,
    "the App Shell must expose a mobile toolbar clearance token",
  );
  assert.match(mobileHomeShell, /max-block-size\s*:\s*none/, "mobile Home must not remain capped at 100dvb");
  assert.match(mobileHomeShell, /grid-template-rows\s*:\s*auto\s+auto\s+auto/, "mobile Home rows must retain their intrinsic height");
  assert.match(mobileHomeBody, /overflow\s*:\s*visible/, "mobile Home must delegate scrolling to the reading view");
  assert.match(mobileHomeBody, /padding-block-end\s*:\s*0/, "only the Home root should own the final toolbar clearance");
});
