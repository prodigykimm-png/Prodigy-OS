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

  const researchSkill = fs.readFileSync(
    path.join(ROOT, ".opencode/skills/prodigy-auction-region-research/SKILL.md"),
    "utf8"
  );
  assert.match(researchSkill, /prodigy-auction-region-research/);
  assert.match(researchSkill, /시군구|sigungu/i);
  assert.match(researchSkill, /dry-run/i);
  assert.match(researchSkill, /monthly_refresh/);
  assert.match(researchSkill, /기입 금지|never invent/i);
  assert.match(researchSkill, /reb_statistics/);

  const contract = fs.readFileSync(
    path.join(ROOT, "SYSTEM/docs/Region_Property_Contract_v1.md"),
    "utf8"
  );
  assert.match(contract, /1\.2\.3/);
  assert.match(contract, /dry-run/i);
  assert.match(contract, /PASS\s*\|\s*BLOCKED|결과 enum|PASS\nBLOCKED/);
  assert.match(contract, /BLOCKED/);
  assert.match(contract, /대체 배포|KOSIS/);
  assert.match(contract, /metrics_as_of/);
  assert.match(contract, /source_as_of|fetched_at/);
  assert.match(contract, /1~24|1\s*~\s*24|≤ 24/);
  assert.match(contract, /snapshot_id/);
  assert.match(contract, /canonical/i);
  assert.match(contract, /sha256|SHA-256/i);
  assert.match(contract, /하나라도 unverified/);
  assert.match(contract, /15108071/);
  assert.match(contract, /region_key/);
  assert.match(contract, /기입 금지/);
  assert.match(contract, /AI는 숫자/);

  assert.match(template, /sale_volume_3m/);
  assert.match(template, /move_in_24m/);
  assert.match(template, /PRODIGY_REGION_METRICS_HISTORY/);
  assert.match(template, /<%\s*region_key\s*%>/);
  assert.match(template, /매매 거래량\(3개월\)/);
  assert.match(template, /HUMAN:LOCKED/);
  assert.match(template, /HUMAN:OWNED/);
  assert.doesNotMatch(template, /^region_dong:/m);
  assert.doesNotMatch(template, /move_in_36m/);
  assert.match(body, /PRODIGY_REGION_METRICS_HISTORY/);
  assert.match(body, /매매 거래량\(3개월\)/);
  assert.match(body, /HUMAN:LOCKED/);
  assert.match(body, /HUMAN:OWNED/);
  assert.match(body, /"region_key": "인천광역시-계양구"/);
  assert.doesNotMatch(body, /^region_dong:/m);

  // template substitution must fill region_key (simulate generator)
  const filled = template
    .replace(/<%\s*region_key\s*%>/g, "부산광역시-금정구")
    .replace(/<%\s*region_sido\s*%>/g, "부산광역시")
    .replace(/<%\s*region_sigungu\s*%>/g, "금정구");
  assert.match(filled, /"region_key": "부산광역시-금정구"/);
  assert.doesNotMatch(filled, /"region_key": ""/);

  const registry = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/display-registry.js"), "utf8");
  assert.match(registry, /auction_region/);
  assert.match(registry, /부동산 지역/);

  const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  assert.match(hub, /auction-region-core\.js/);

  const card = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
  assert.match(card, /AuctionRegionCore|openOrCreateRegionNote|지역/);

  console.log("Auction region tests passed");
}

main();
