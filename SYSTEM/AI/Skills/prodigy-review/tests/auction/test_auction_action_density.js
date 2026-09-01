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
