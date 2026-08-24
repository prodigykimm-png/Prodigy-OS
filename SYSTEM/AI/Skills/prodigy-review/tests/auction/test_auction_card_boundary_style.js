"use strict";

/**
 * Todo 8 — deterministic Auction Card boundary style contract (non-CDP).
 *
 * Instead of launching a real Obsidian/Cdp runtime (which Todo 9 owns), this
 * suite evaluates the REAL production auction-card.js in the in-memory sandbox,
 * captures the CSS emitted into document.head by ensureAuctionCardStyles(), then
 * resolves the semantic tokens to fixed Default-theme values so the assertions
 * are deterministic:
 *
 *   1. semantic 1px card boundary (border-width >= 1px) that is distinguishable
 *      from the card surface AND the canvas (light + dark).
 *   2. card-list gap: compact tier >= 12px, medium/wide tier >= 17px.
 *   3. focus outline width >= 2px (card level and interactive controls).
 *   4. no box-shadow / gradient on the card.
 *
 * Red discipline — each mutation must fail a named assertion:
 *   * boundary color == surface color         -> distinguishability fails
 *   * gap set to 0                            -> compact/wide gap fails
 *   * focus outline removed                   -> focus width fails
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CARD_PATH = path.join(ROOT, "SYSTEM/Views/auction-card.js");
const SOURCE = fs.readFileSync(CARD_PATH, "utf8");

// Fixed Default-theme resolved values the card's "computed" styles collapse to.
// Boundary must differ from both surface and canvas in light and dark.
const RESOLVED = Object.freeze({
  light: {
    surface: "#f5f5f7",
    canvas: "#ffffff",
    border: "#d2d2d7",
    accent: "#0071e3",
    space3: "12px",
    space4: "17px",
  },
  dark: {
    surface: "#272729",
    canvas: "#000000",
    border: "#424245",
    accent: "#0071e3",
    space3: "12px",
    space4: "17px",
  },
});

const STATUS_LABELS = {
  watching: "관심 경매",
  bidding: "입찰",
  skipped: "입찰 포기",
  won: "낙찰",
  lost: "패찰",
};

const PROPERTY_LABELS = {
  my_opinion: "내 의견",
  expected_bid: "입찰 예정가",
  minimum_bid: "최저가",
  exit_price: "매도 목표가",
  expected_monthly_rent: "예상 월세",
  loan_ratio: "대출비율",
  interest_rate: "이율",
  decision_reason: "판단 근거",
};

function makeElement(tag, options) {
  const el = {
    tag,
    children: [],
    attrs: {},
    _text: (options && options.text) || "",
    _html: "",
    onclick: null,
    _handlers: {},
    title: "",
    hidden: false,
    isConnected: true,
    createEl: (childTag, childOptions) => {
      const child = makeElement(childTag, childOptions);
      el.children.push(child);
      return child;
    },
    createSpan: (childOptions) => el.createEl("span", childOptions),
    setAttribute: (key, value) => { el.attrs[key] = String(value); if (key === "title") el.title = String(value); },
    getAttribute: (key) => (el.attrs[key] != null ? el.attrs[key] : null),
    addEventListener: (type, fn) => { el._handlers[type] = el._handlers[type] || []; el._handlers[type].push(fn); },
    empty: () => { el.children = []; },
    click: () => {},
    removeAttribute: () => {},
    appendChild: (child) => el.children.push(child),
  };
  Object.defineProperty(el, "innerHTML", {
    get: () => el._html,
    set: (value) => { el._html = String(value); },
  });
  if (options && options.attr) for (const key of Object.keys(options.attr)) el.setAttribute(key, options.attr[key]);
  if (options && options.text) el._text = String(options.text);
  if (options && options.href) el.setAttribute("href", options.href);
  return el;
}

function buildSandbox() {
  let capturedCss = "";
  const windowObj = {
    ProdigyTokens: { BREAKPOINTS: { wide: 1024, medium: 640, compact: 320 } },
    prodigyDisplay: {
      property: (key) => (Object.prototype.hasOwnProperty.call(PROPERTY_LABELS, key) ? PROPERTY_LABELS[key] : key),
      status: (value) => STATUS_LABELS[value] || "미등록 상태",
      statusInfo: (value) => ({ label: STATUS_LABELS[value] || "미등록 상태" }),
    },
    parsePrice: (value) => (Number.isFinite(Number(value)) ? Number(value) : value),
    AuctionRegionPacket: { openForAuction: async () => {} },
    AuctionCardPriceProjection: undefined,
    obsidianPrompt: async () => null,
    obsidian: {},
    app: { workspace: {}, vault: {}, fileManager: {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    document: {
      getElementById: () => null,
      createElement: (tag) => (tag === "style"
        ? (() => { const s = makeElement("style"); Object.defineProperty(s, "textContent", { set(v) { capturedCss = String(v); }, get: () => capturedCss }); return s; })()
        : makeElement(tag)),
      head: { appendChild() {} },
      querySelectorAll: () => [],
    },
  };
  return { window: windowObj, captured: () => capturedCss };
}

const FIXTURE = {
  status: "watching",
  type: "auction_case",
  case_number: "2026-12345",
  file: { name: "2026-12345.md", path: "INBOX/2026-12345.md" },
  address: "서울특별시 강남구 역삼동 123-45 상가",
  source: { naver: "https://land.naver.com/x/2026-12345", cafe: "https://cafe.naver.com/y/2026-12345" },
  auction_datetime: "2026-08-20",
  court: "서울중앙지방법원",
  property_type: "아파트",
  region_sido: "서울",
  region_sigungu: "강남구",
  region_dong: "역삼동",
  appraisal_price: "1000000000",
  minimum_bid: "300000000",
  expected_bid: "350000000",
  expected_monthly_rent: "3000000",
  loan_ratio: 0.8,
  interest_rate: 0.06,
  auction_note: "권리 분석 완료",
  recommend_note: "추천 등급: A",
};

function captureCss() {
  const { window: windowObj, captured } = buildSandbox();
  const container = makeElement("root");
  const context = {
    window: windowObj,
    app: windowObj.app,
    console: { error() {}, log() {}, warn() {} },
    isValid: (val) => val && val !== "정보 없음" && val !== "메모 없음" && String(val).trim() !== "",
    Notice: function Notice() {},
    confirm: () => false,
  };
  vm.runInNewContext(SOURCE, context, { filename: "auction-card.js" });
  windowObj.renderAuctionCard(FIXTURE, container, { logicalWidth: 1024 });
  const css = captured();
  assert.ok(css && css.includes(".auction-card"), "card styles must be emitted into document.head");
  return css;
}

// Extract the declaration block that owns `selectorSubstring`, using brace
// depth so composite selectors (which end in a shared `{ ... }`) resolve.
function groupBody(css, selectorSubstring) {
  const start = css.indexOf(selectorSubstring);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0 || close < open) return "";
  return css.slice(open + 1, close);
}

// Extract the declaration block for the FIRST rule matched by `selectorPrefix`,
// respecting nested braces (e.g. a pseudo-class with no nested braces is fine
// for this shallow subset).
function ruleBody(css, selectorMatch) {
  const index = css.indexOf(selectorMatch);
  if (index < 0) return "";
  const open = css.indexOf("{", index);
  if (open < 0) return "";
  const close = css.indexOf("}", open);
  if (close < 0) return "";
  return css.slice(open + 1, close);
}

function num(resolvedValue) {
  const m = String(resolvedValue).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function resolveVar(value, resolved) {
  if (!value) return null;
  const m = value.match(/var\(--([a-z0-9-]+)\s*(?:,\s*([^)]*))?\)/);
  if (!m) return value.trim();
  const map = {
    "ke-color-surface-secondary": resolved.surface,
    "ke-color-surface": resolved.canvas,
    "ke-color-border": resolved.border,
    "ke-color-accent": resolved.accent,
    "ke-space-3": resolved.space3,
    "ke-space-4": resolved.space4,
  };
  return map[m[1]] != null ? map[m[1]] : (m[2] ? resolveVar(m[2], resolved) : null);
}

// The base .auction-card rule is the FIRST occurrence of ".auction-card {".
function baseCardRule(css) {
  return ruleBody(css, ".auction-card {");
}

// The compact tier owns the tight 12px gap; medium/wide own 17px.
function compactGapDecl(css) {
  const idx = css.indexOf('.prodigy-app-shell[data-tier="compact"] .auction-card');
  if (idx < 0) return "";
  return ruleBody(css, css.slice(idx, idx + 60));
}

test("GREEN — card boundary is 1px+ and distinguishable from surface and canvas (light+dark)", () => {
  const css = captureCss();
  const body = baseCardRule(css);
  const widthDecl = body.match(/border:\s*(1px)\s+solid/);
  assert.ok(widthDecl, "the card must declare a 1px semantic boundary");
  assert.ok(num(widthDecl[1]) >= 1, "boundary width must be >= 1px");

  const borderColorRaw = body.match(/border:\s*(?:1px\s+solid\s+)([^;}]+)/);
  assert.ok(borderColorRaw, "card boundary must declare a border color");
  const surfaceRaw = body.match(/background:\s*([^;}]+)/);
  assert.ok(surfaceRaw, "card must declare a surface background");

  for (const theme of ["light", "dark"]) {
    const resolved = RESOLVED[theme];
    const borderColor = resolveVar(borderColorRaw[1].trim(), resolved);
    const surface = resolveVar(surfaceRaw[1].trim(), resolved);
    assert.notEqual(borderColor, surface, `boundary must differ from card surface (${theme})`);
    assert.notEqual(borderColor, resolved.canvas, `boundary must differ from canvas (${theme})`);
  }
});

test("GREEN — card-list gap is >=12px compact and >=17px medium/wide", () => {
  const css = captureCss();
  const base = baseCardRule(css);
  const compact = compactGapDecl(css);

  // Base (medium/wide) owns 17px.
  const baseGap = base.match(/margin-block-end:\s*([^;}]+)/);
  assert.ok(baseGap, "card must own an inter-card gap via margin-block-end");
  const basePx = num(resolveVar(baseGap[1].trim(), RESOLVED.light));
  assert.ok(basePx >= 17, `medium/wide gap must be >= 17px, got ${basePx}`);

  // Compact tier overrides to >=12px.
  assert.ok(compact.length > 0, "compact tier must override the card gap");
  const compactGap = compact.match(/margin-block-end:\s*([^;}]+)/);
  assert.ok(compactGap, "compact override must set margin-block-end");
  const compactPx = num(resolveVar(compactGap[1].trim(), RESOLVED.light));
  assert.ok(compactPx >= 12 && compactPx < basePx, `compact gap must be 12px (>=12 and <17), got ${compactPx}`);
});

test("GREEN — focus outline is >=2px for card and interactive controls", () => {
  const css = captureCss();
  const focusIdxs = [
    css.indexOf(".auction-card a:focus-visible"),
    css.indexOf(".auction-card button:focus-visible"),
    css.indexOf(".auction-card:focus-visible"),
  ];
  const present = focusIdxs.filter((i) => i >= 0);
  assert.ok(present.length >= 2, "card and interactive elements must each expose a focus state");
  const samples = present.slice(0, 3);
  for (const idx of samples) {
    const body = groupBody(css, css.slice(idx, idx + 30));
    const width = body.match(/outline:\s*(\d+)px/);
    assert.ok(width, "focus must declare a px outline");
    assert.ok(num(width[1]) >= 2, `focus outline must be >= 2px, got ${width[1]}`);
  }
});

test("GREEN — card has no box-shadow or gradient", () => {
  const css = captureCss();
  const body = baseCardRule(css);
  const shadow = body.match(/box-shadow\s*:\s*([^;}]+)/);
  assert.ok(!shadow || /^none(?:\s*!important)?$/.test(shadow[1].trim()), "card must carry no box-shadow");
  assert.doesNotMatch(body, /linear-gradient/, "card must carry no gradient");
});

test("RED — boundary equal to surface is detected by the distinguishability contract", () => {
  const mutated = SOURCE.replace(
    "background: var(--ke-color-surface-secondary, var(--background-secondary));",
    "background: var(--ke-color-border, var(--background-modifier-border));",
  );
  assert.notEqual(mutated, SOURCE, "surface-equals-boundary mutation must have applied");
  const css = captureCssFor(mutated);
  const body = baseCardRule(css);
  const borderColorRaw = body.match(/border:\s*(?:1px\s+solid\s+)([^;}]+)/);
  const surfaceRaw = body.match(/background:\s*([^;}]+)/);
  const resolved = RESOLVED.light;
  // Red discipline: a mutation that collapses boundary onto the surface must be
  // caught — the distinguishability guard must see identical colors and fail.
  assert.equal(
    resolveVar(borderColorRaw[1].trim(), resolved),
    resolveVar(surfaceRaw[1].trim(), resolved),
    "mutation collapses boundary onto surface; the card separation oracle must flag it",
  );
});

test("RED — collapsing the medium/wide gap to zero is detected", () => {
  const mutated = SOURCE.replace(
    "margin-block-end: var(--ke-space-4, 17px);",
    "margin-block-end: 0;",
  );
  assert.notEqual(mutated, SOURCE, "gap-to-zero mutation must have applied");
  const css = captureCssFor(mutated);
  const base = baseCardRule(css);
  const baseGap = base.match(/margin-block-end:\s*([^;}]+)/);
  assert.ok(baseGap, "card must own the inter-card gap");
  const px = num(resolveVar(baseGap[1].trim(), RESOLVED.light));
  assert.ok(px < 17, `gap-to-zero mutation yields ${px}px which violates the >=17px contract`);
});

test("RED — removing the 2px focus outline is detected", () => {
  const mutated = SOURCE.replace(
    "outline: 2px solid var(--ke-color-accent, var(--text-accent));",
    "outline: 1px solid var(--ke-color-accent, var(--text-accent));",
  );
  assert.notEqual(mutated, SOURCE, "focus-thinning mutation must have applied");
  const css = captureCssFor(mutated);
  const focusIdx = css.indexOf(".auction-card a:focus-visible");
  assert.ok(focusIdx >= 0, "focus rule must remain present");
  const focusBody = groupBody(css, css.slice(focusIdx, focusIdx + 30));
  const width = focusBody.match(/outline:\s*(\d+)px/);
  assert.ok(width, "focus rule must remain present");
  assert.ok(num(width[1]) < 2, `focus must be >= 2px; thinned to ${width[1]}px must be caught`);
});

function captureCssFor(source) {
  const { window: windowObj, captured } = buildSandbox();
  const container = makeElement("root");
  const context = {
    window: windowObj,
    app: windowObj.app,
    console: { error() {}, log() {}, warn() {} },
    isValid: (val) => val && val !== "정보 없음" && val !== "메모 없음" && String(val).trim() !== "",
    Notice: function Notice() {},
    confirm: () => false,
  };
  vm.runInNewContext(source, context, { filename: "auction-card.js" });
  windowObj.renderAuctionCard(FIXTURE, container, { logicalWidth: 1024 });
  return captured();
}
