"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CARD_PATH = path.join(ROOT, "SYSTEM/Views/auction-card.js");
const UI_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-ui.js");

function cardSource() {
  return fs.readFileSync(CARD_PATH, "utf8");
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

test("Given the auction action row consumes vertical space, When it renders, Then its block padding stays tight", () => {
  const ui = fs.readFileSync(UI_PATH, "utf8");
  const body = ruleBody(ui, ".auction-card-actions {");

  const marginTop = body.match(/margin-top:\s*(\d+)px/);
  const paddingTop = body.match(/padding-top:\s*(\d+)px/);
  assert.ok(marginTop, "margin-top 선언이 있어야 한다");
  assert.ok(paddingTop, "padding-top 선언이 있어야 한다");
  assert.ok(Number(marginTop[1]) <= 2, "액션 행 margin-top이 2px를 넘으면 공간을 더 차지한다: " + marginTop[1]);
  assert.ok(Number(paddingTop[1]) <= 2, "액션 행 padding-top이 2px를 넘으면 공간을 더 차지한다: " + paddingTop[1]);
});

test("Given a bidding case with a bid date, When the card renders, Then 입찰표 stays visible while destructive and external actions move into overflow", () => {
  const source = cardSource();

  const bidSheetIndex = source.indexOf("const headerBidSheet");
  const overflowIndex = source.indexOf("const overflowMenu");
  const deleteIndex = source.indexOf("const deleteBtn");
  assert.ok(bidSheetIndex > 0, "헤더 입찰표 버튼을 찾지 못했다");
  assert.ok(overflowIndex > 0, "헤더 overflow 메뉴를 찾지 못했다");
  assert.ok(deleteIndex > overflowIndex, "삭제 버튼은 overflow 메뉴 내부에서 생성되어야 한다");

  assert.ok(
    bidSheetIndex < overflowIndex,
    "입찰표 열기는 overflow 메뉴보다 먼저 헤더에 생성되어야 한다"
  );

  assert.match(source, /auction-card-overflow/);
  assert.match(source, /auction-card-secondary-transitions/);
});

test("Given the header bid-sheet control, When it renders, Then it is small and does not reuse the full-size chip button", () => {
  const source = cardSource();
  const headerRegion = source.slice(0, source.indexOf("const deleteBtn"));

  assert.match(headerRegion, /auction-header-bid-sheet/, "헤더 입찰표 버튼에 전용 클래스가 있어야 한다");
});

test("Given a card overflow menu opens across the next card, When it is active, Then the owning card gets the higher stacking layer", () => {
  const source = cardSource();
  const activeBody = ruleBody(source, ".auction-card-readable.is-menu-open {");

  assert.match(activeBody, /z-index:\s*\d+/, "열린 메뉴의 카드에 z-index가 있어야 한다");
  assert.match(source, /const syncMenuLayer\s*=/, "두 disclosure 메뉴가 공유하는 layer 동기화가 있어야 한다");
  assert.match(source, /overflowMenu\.ontoggle\s*=\s*syncMenuLayer/, "헤더 더보기 메뉴가 카드 layer를 갱신해야 한다");
  assert.match(source, /secondaryTransitionMenu\.ontoggle\s*=\s*syncMenuLayer/, "결과 입력 메뉴가 카드 layer를 갱신해야 한다");
});

test("Given a wide card, When facts and actions render, Then scan order stays compact and primary-first", () => {
  const source = cardSource();
  const facts = ruleBody(source, ".auction-card-tier-wide .auction-card-property-group {");
  const actions = ruleBody(source, ".auction-card-tier-wide .auction-card-actions {");
  const mediumActions = ruleBody(source, ".auction-card-tier-medium .auction-card-actions,");
  const secondary = ruleBody(source, ".auction-card-tier-wide .auction-card-secondary-transitions {");
  const primary = ruleBody(source, ".auction-card-primary-action {");

  assert.match(facts, /display:\s*grid/);
  assert.match(facts, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(min\(18rem,\s*100%\),\s*auto\)/);
  assert.match(actions, /justify-content:\s*flex-start/);
  assert.match(mediumActions, /display:\s*flex/);
  assert.match(mediumActions, /justify-content:\s*flex-start/);
  assert.match(secondary, /margin-inline-start:\s*auto/);
  assert.match(secondary, /order:\s*3/);
  assert.match(primary, /order:\s*1/);
  assert.match(source, /siteVisitButton\.classList\?\.add\("auction-card-primary-action"\)/);
});

test("Given exact won prices, When a medium card renders, Then the price pair stays on one row above deposit", () => {
  const source = cardSource();
  const pair = ruleBody(source, ":is(.auction-card-tier-medium, .auction-card-tier-wide) .auction-card-price-pair {");
  const priceGroup = ruleBody(source, ".auction-card-tier-compact .auction-card-finance-group-price,");

  assert.match(pair, /flex-wrap:\s*nowrap/);
  assert.match(priceGroup, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(source, /class:\s*'auction-card-deposit'/);
  assert.doesNotMatch(source, /class:\s*'auction-card-finance-separator'[\s\S]{0,120}deposit/);
});

test("Given key value and profit analysis, When a medium card renders, Then both share the right insight column", () => {
  const source = cardSource();
  const finance = ruleBody(source, ":is(.auction-card-tier-medium, .auction-card-tier-wide) .auction-card-finance-row {");
  const insights = ruleBody(source, ":is(.auction-card-tier-medium, .auction-card-tier-wide) .auction-card-finance-insights {");

  assert.match(finance, /minmax\(min\(22rem,\s*100%\),\s*\.9fr\)/);
  assert.match(insights, /grid-template-columns:\s*minmax\(13rem,\s*\.9fr\)\s+minmax\(0,\s*1\.1fr\)/);
  assert.match(source, /const financeInsights = financeRow\.createEl/);
  assert.match(source, /const keyRow = financeInsights\.createEl\('button'/);
  assert.match(source, /const incomeGroup = financeInsights\.createEl\('div'/);
});
