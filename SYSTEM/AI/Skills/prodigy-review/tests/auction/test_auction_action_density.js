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

test("Given a bidding case with a bid date, When the card renders, Then 입찰표 열기 sits in the header beside the trash icon rather than the bottom action row", () => {
  const source = cardSource();

  const trashIndex = source.indexOf("text: '🗑️'");
  const bidSheetIndex = source.indexOf("auction-header-bid-sheet");
  assert.ok(trashIndex > 0, "휴지통 아이콘을 찾지 못했다");
  assert.ok(bidSheetIndex > 0, "헤더 입찰표 버튼을 찾지 못했다");

  assert.ok(
    bidSheetIndex < trashIndex,
    "입찰표 열기가 휴지통보다 뒤에 생성되면 하단 액션 행에 남아 있는 것이다 (bidSheet=" + bidSheetIndex + ", trash=" + trashIndex + ")"
  );

  assert.doesNotMatch(
    source.slice(trashIndex),
    /ProdigyUI\.button\(buttonContainer, "입찰표 열기"/,
    "하단 액션 행에 입찰표 열기 칩이 남아 있으면 안 된다"
  );
});

test("Given the header bid-sheet control, When it renders, Then it is small and does not reuse the full-size chip button", () => {
  const source = cardSource();
  const headerRegion = source.slice(0, source.indexOf("text: '🗑️'"));

  assert.match(headerRegion, /auction-header-bid-sheet/, "헤더 입찰표 버튼에 전용 클래스가 있어야 한다");
});
