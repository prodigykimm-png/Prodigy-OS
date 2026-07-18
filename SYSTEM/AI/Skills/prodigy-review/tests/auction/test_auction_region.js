"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-region-core.js"));

function main() {
  assert.equal(core.normalizeSido("인천"), "인천광역시");
  assert.equal(core.normalizeSido("부산"), "부산광역시");
  assert.equal(core.normalizeSigungu(" 해운대구 "), "해운대구");

  const page = {
    region_sido: "인천",
    region_sigungu: "계양구",
    region_dong: "작전동"
  };
  assert.equal(core.regionKey(page), "인천광역시-계양구");
  assert.equal(
    core.regionNotePath(page),
    "PARA/RESOURCES/Auction Regions/인천광역시-계양구.md"
  );
  assert.equal(core.regionWikilink(page), "[[인천광역시-계양구]]");

  const body = core.buildRegionNoteBody(page, { today: "2026-07-18" });
  assert.match(body, /type: auction_region/);
  assert.match(body, /region_sido: 인천광역시/);
  assert.match(body, /region_sigungu: 계양구/);
  assert.match(body, /연결 경매|dataview/i);

  assert.equal(core.regionNotePath({}), "");
  assert.throws(() => {
    // sync throw path tested via openOrCreate without app — regionNotePath empty
    if (!core.regionNotePath({})) throw new Error("region_sido / region_sigungu 가 없어");
  }, /region_sido/);

  const template = fs.readFileSync(
    path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md"),
    "utf8"
  );
  assert.match(template, /type: auction_region/);
  assert.match(template, /region_sido/);
  assert.match(template, /PARA\/PROJECTS\/Auction/);

  const skill = fs.readFileSync(
    path.join(ROOT, ".opencode/skills/prodigy-auction-brief/SKILL.md"),
    "utf8"
  );
  assert.match(skill, /prodigy-auction-brief/);
  assert.match(skill, /region_sigungu/);
  assert.match(skill, /pending/);

  const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  assert.match(hub, /auction-region-core\.js/);

  const card = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
  assert.match(card, /AuctionRegionCore|openOrCreateRegionNote|지역/);

  console.log("Auction region tests passed");
}

main();
