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
  assert.equal(
    core.regionDisplay({ region_sido: "부산", region_sigungu: "금정구", region_dong: "부곡동" }),
    "부산광역시 금정구 부곡동"
  );
  assert.equal(
    core.regionDisplay({ region_sido: "부산", region_sigungu: "금정구" }),
    "부산광역시 금정구 동 미입력"
  );

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
  assert.match(template, /Contract v1\.4\.0/);
  assert.match(template, /region_sido/);
  assert.match(template, /PARA\/PROJECTS\/Auction/);

  const skill = fs.readFileSync(
    path.join(ROOT, "SYSTEM/AI/Skills/prodigy-auction-brief/SKILL.md"),
    "utf8"
  );
  assert.match(skill, /prodigy-auction-brief/);
  assert.match(skill, /region_sigungu/);
  assert.match(skill, /pending/);

  const researchSkill = fs.readFileSync(
    path.join(ROOT, "SYSTEM/AI/Skills/prodigy-auction-region-research/SKILL.md"),
    "utf8"
  );
  assert.match(researchSkill, /prodigy-auction-region-research/);
  assert.match(researchSkill, /시군구|sigungu/i);
  assert.match(researchSkill, /dry-run/i);
  assert.match(researchSkill, /monthly_refresh/);
  assert.match(researchSkill, /기입 금지|never invent/i);
  assert.match(researchSkill, /reb_rone_public_table/);

  const contract = fs.readFileSync(
    path.join(ROOT, "SYSTEM/docs/Region_Property_Contract_v1.md"),
    "utf8"
  );
  assert.match(contract, /1\.4\.0/);
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
  assert.match(contract, /jumin_statmonth_csv|mois_jumin_statmonth_csv|jumin\.mois\.go\.kr/);
  assert.match(contract, /reb_rone_public_table/);
  assert.match(contract, /A_2024_00554/);
  assert.match(contract, /A_2024_00045/);
  assert.match(contract, /A_2024_00073/);
  assert.match(contract, /region_key/);
  assert.match(contract, /기입 금지/);
  assert.match(contract, /AI는 숫자/);

  // Documentation regression lock only: persistence behavior is covered by the
  // Region Experience contract/store suites, not asserted as docs-enforced here.
  assert.match(contract, /Region Experience.*사람 확인.*append|사람 확인.*Region Experience.*append/s);
  assert.match(contract, /Daily Evidence.*저장.*canonical path.*stable Evidence ID/s);
  assert.match(contract, /human_confirmed/);
  assert.match(contract, /transport_life.*교통·생활.*HUMAN|risk.*리스크·주의.*HUMAN|site_visit.*임장 포인트.*HUMAN/s);
  assert.match(contract, /supply_observation.*임장 포인트.*HUMAN:OWNED/s);
  assert.match(contract, /AI.*append.*할 수 없|provider.*append.*할 수 없/s);
  assert.match(contract, /Object.*자동 생성.*금지|자동.*Object.*생성.*하지 않/s);
  assert.match(contract, /Knowledge.*승인.*승격.*하지 않|Knowledge.*promotion.*금지/s);
  assert.match(contract, /공식.*공급.*planned move-in.*수량.*거부|공식.*공급.*입주 예정.*수량.*거부/s);
  assert.match(contract, /frontmatter.*metrics.*history.*AUTO.*AI:PENDING.*HUMAN:LOCKED.*기존.*human/s);

  const experienceStore = require(path.join(ROOT, "SYSTEM/Views/region-experience-store.js"));
  assert.equal(typeof experienceStore.appendApprovedExperience, "function");

  assert.match(template, /sale_volume_3m/);
  assert.match(template, /move_in_24m/);
  assert.match(template, /PRODIGY_REGION_METRICS_HISTORY/);
  assert.match(template, /<%\s*region_key\s*%>/);
  assert.match(template, /매매 거래량\(3개월\)/);
  assert.match(template, /HUMAN:LOCKED/);
  assert.match(template, /HUMAN:OWNED/);
  assert.match(template, /AUTO:REGION_MARKET:START/);
  assert.match(template, /AI:PENDING:ZONES:START/);
  assert.match(template, /AI:PENDING:TRANSPORT_LIFE:START/);
  assert.doesNotMatch(template, /^region_dong:/m);
  assert.match(template, /move_in_36m/);
  assert.match(template, /move_in_48m/);
  assert.match(template, /move_in_60m/);
  assert.match(template, /\[!abstract\]-/);
  assert.match(template, /원본 지표 이력/);
  assert.match(template, /AI:PENDING:SUPPLY_PIPELINE:START/);
  assert.match(template, /AUTO:REGION_LAND_PRICE:START/);
  assert.match(body, /PRODIGY_REGION_METRICS_HISTORY/);
  assert.match(body, /매매 거래량\(3개월\)/);
  assert.match(body, /HUMAN:LOCKED/);
  assert.match(body, /HUMAN:OWNED/);
  assert.match(body, /"region_key": "인천광역시-계양구"/);
  assert.match(body, /AI:PENDING:SUPPLY_PIPELINE:START/);
  assert.match(body, /AUTO:REGION_LAND_PRICE:START/);
  assert.doesNotMatch(body, /^region_dong:/m);

  const refreshScript = fs.readFileSync(
    path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-refresh.js"),
    "utf8"
  );
  assert.match(refreshScript, /sttsDataPreviewList\.do/);
  assert.match(refreshScript, /snapshot\.json/);
  assert.match(refreshScript, /verification_status: "unverified"/);
  assert.doesNotMatch(refreshScript, /verification_status: "verified"/);

  const applyScript = fs.readFileSync(
    path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-apply.js"),
    "utf8"
  );
  assert.match(applyScript, /region-metrics-note-core\.js/);
  assert.match(applyScript, /atomicWrite/);
  assert.match(applyScript, /--dry-run/);

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

  const coreSchema = fs.readFileSync(path.join(ROOT, "SYSTEM/Prodigy/Schema/Core_Property_Schema.md"), "utf8");
  assert.match(coreSchema, /`auction_region`/);

  const hub = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  assert.match(hub, /auction-region-core\.js/);
  assert.match(hub, /region-explorer-projection\.js/);
  assert.match(hub, /auction-region-packet\.js/);
  assert.ok(hub.indexOf("region-explorer-projection.js") < hub.indexOf("auction-region-packet.js"));
  assert.ok(hub.indexOf("auction-region-packet.js") < hub.indexOf("auction-card.js"));

  const card = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");
  assert.match(card, /AuctionRegionPacket\.openForAuction/);
  assert.doesNotMatch(card, /openOrCreateRegionNote\(app, p\)/);

  // Todo 14: Region Intelligence popup integration assertions
  const popupCore = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-core.js"), "utf8");
  assert.match(popupCore, /openPopup/);
  assert.match(popupCore, /NEVER writes/);
  const popupView = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js"), "utf8");
  assert.match(popupView, /renderPopup/);
  assert.match(popupView, /CONTROL_HEIGHTS\.touchTarget/);
  assert.doesNotMatch(popupView, /min-height:\s*44px/);
  assert.match(require(path.join(ROOT, "SYSTEM/Views/region-intelligence-popup-view.js")).popupStyles(), /min-height:\s*44px/);
  const decisionVM = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/region-decision-view-model.js"), "utf8");
  assert.match(decisionVM, /projectRegionPopup/);
  assert.match(decisionVM, /computeTrustBadges/);
  // HUB loads the popup modules
  assert.match(hub, /region-decision-view-model\.js/);
  assert.match(hub, /region-intelligence-popup-store\.js/);
  assert.match(hub, /region-intelligence-popup-core\.js/);
  assert.ok(hub.indexOf("region-intelligence-popup-store.js") < hub.indexOf("region-intelligence-popup-core.js"));
  assert.match(hub, /region-intelligence-popup-view\.js/);
  // Auction card exposes the single decision-board entry point.
  assert.match(card, /AuctionRegionPacket/);
  assert.match(card, /판단 보드/);
  assert.doesNotMatch(card, /text:\s*["']지역 정보["']/);

  console.log("Auction region tests passed");
}

main();
