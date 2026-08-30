"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const core = require("./auction-dong-profile-core.js");
const index = JSON.parse(fs.readFileSync("PARA/RESOURCES/Auction Regions/auction-dong-profiles.json", "utf8"));
const busanProfiles = index.profiles.filter((profile) => profile.region_sido === "부산광역시");

core.validateIndex(index);
assert.equal(index.profile_count, 1393);
assert.deepEqual(index.by_sido, { 부산광역시: 206, 서울특별시: 427, 인천광역시: 158, 경기도: 602 });
assert.equal(new Set(index.profiles.map((profile) => profile.key)).size, 1393);
assert.equal(new Set(index.profiles.map((profile) => `${profile.region_sido}/${profile.region_sigungu}/${profile.admin_dong}`)).size, 1393);

const evergreenFields = ["identity", "spatial_structure", "mobility_structure", "structural_cautions"];
const evergreenForbidden = /20\d{2}년|세대수|주택 재고|건물 수|준공연도|노후도|재개발 단계|재건축 단계|착공|입주 예정|가격|거래량|공실률|영업 중|OSM 객체/u;
for (const profile of index.profiles) {
  const summary = profile.stable_profile && profile.stable_profile.evergreen_summary;
  assert.ok(summary, `${profile.key}: 영구 기본요약 필요`);
  for (const field of evergreenFields) {
    assert.ok(summary[field] && summary[field].text, `${profile.key}: ${field} 필요`);
    assert.ok(summary[field].text.length <= 90, `${profile.key}: ${field} 90자 이하`);
    assert.doesNotMatch(summary[field].text, evergreenForbidden, `${profile.key}: ${field} 변동·상세정보 제외`);
  }
}
for (const field of evergreenFields) {
  assert.equal(new Set(index.profiles.map((profile) => profile.stable_profile.evergreen_summary[field].text)).size, 1393, `${field}: 행정동별 고유 문장 필요`);
}

const nampo = core.profileCandidates(index, { region_sigungu: "중구", region_dong: "남포동" });
assert.equal(nampo.status, "exact");
assert.equal(nampo.selected.admin_dong, "남포동");

const yeongju = core.profileCandidates(index, { region_sigungu: "중구", region_dong: "영주동" });
assert.equal(yeongju.status, "ambiguous");
assert.deepEqual(yeongju.candidates.map((profile) => profile.admin_dong), ["영주1동", "영주2동"]);

const yeongju1 = core.profileCandidates(index, { region_sigungu: "중구", region_dong: "영주동", region_admin_dong: "영주1동" });
assert.equal(yeongju1.status, "exact");
assert.equal(yeongju1.selected.admin_dong, "영주1동");

const woo = core.profileCandidates(index, { region_sigungu: "해운대구", region_dong: "우동" });
assert.equal(woo.status, "ambiguous");
assert.deepEqual(woo.candidates.map((profile) => profile.admin_dong), ["우1동", "우2동", "우3동"]);
assert.equal(core.profileCandidates(index, { region_sigungu: "해운대구", region_dong: "우동", region_admin_dong: "우2동" }).selected.admin_dong, "우2동");

const gupo = core.profileCandidates(index, { region_sigungu: "북구", region_dong: "구포동" });
assert.equal(gupo.status, "ambiguous");
assert.deepEqual(gupo.candidates.map((profile) => profile.admin_dong), ["구포1동", "구포2동", "구포3동"]);
const gupoLegalSummary = core.legalDongSummary(gupo, "구포동");
assert.equal(gupoLegalSummary.legal_dong, "구포동");
assert.deepEqual(gupoLegalSummary.admin_dongs, ["구포1동", "구포2동", "구포3동"]);
assert.equal(gupoLegalSummary.candidate_summaries.length, 3);
assert.ok(gupoLegalSummary.candidate_summaries.every((candidate) => candidate.role));
assert.match(gupoLegalSummary.limitation, /단정하지 않는다/);
const auction101214 = core.profileCandidates(index, { region_sigungu: "북구", region_dong: "구포동", region_admin_dong: "구포2동" });
assert.equal(auction101214.status, "exact");
assert.equal(auction101214.selected.admin_dong, "구포2동");
assert.equal(core.legalDongSummary(auction101214, "구포동"), null);

const central = index.profiles.find((profile) => profile.key === "부산광역시-중구-중앙동");
assert.equal(core.decisionLens(central), central.deep_profile.auction_decision_lens, "수작업 판단 렌즈를 우선해야 한다");

const choryang = index.profiles.find((profile) => profile.key === "부산광역시-동구-초량1동");
const generatedLens = core.decisionLens(choryang);
assert.equal(generatedLens, choryang.deep_profile.auction_decision_lens, "저장된 파생 판단 렌즈를 우선해야 한다");
assert.match(generatedLens.position_summary, /초량1동/);
assert.match(generatedLens.position_summary, /초량 권역/);
assert.ok(generatedLens.demand_base.includes("부산역"));
assert.ok(generatedLens.works_for.length > 0);
assert.ok(generatedLens.be_conservative_when.length > 0);
assert.ok(generatedLens.reject_signals.length > 0);
assert.ok(generatedLens.field_questions.length >= 4);
assert.equal(generatedLens.confidence, "low");
assert.deepEqual(generatedLens.basis, ["deep_profile", "official_sources", "persisted_conservative_lens"]);
const busanIndex = { ...index, profile_count: 206, profiles: busanProfiles };
assert.equal(core.coverageSummary(busanIndex).manual, 22);
assert.equal(core.coverageSummary(busanIndex).generated, 184);
assert.equal(core.coverageSummary(busanIndex).total, 206);

const collisionIndex = {
  schema_version: 1, profile_count: 2, profiles: [
    { key: "가시도-A구-중앙동", region_sido: "가시도", region_sigungu: "A구", admin_dong: "중앙동" },
    { key: "나시도-A구-중앙동", region_sido: "나시도", region_sigungu: "A구", admin_dong: "중앙동" }
  ]
};
assert.equal(core.profileCandidates(collisionIndex, { region_sido: "가시도", region_sigungu: "A구", region_admin_dong: "중앙동" }).selected.region_sido, "가시도");
assert.equal(core.profileCandidates(collisionIndex, { region_sido: "나시도", region_sigungu: "A구", region_admin_dong: "중앙동" }).selected.region_sido, "나시도");

const validStable = {
  status: "complete",
  city_role: { text: "도시의 장기 주거 중심지", sources: ["A1"] },
  district_role: { text: "구 내부 생활 중심지", sources: ["A1"] },
  urban_form: { text: "평지 격자형 주거지", sources: ["A1"] },
  transport_structure: { text: "운행 중인 도시철도와 간선도로", sources: ["A1"] },
  daily_life_structure: { text: "시장·병원·학교 생활권", sources: ["A2"] },
  housing_structure: { text: "공동주택과 저층주택 혼재", sources: ["A2"] },
  demand_anchors: { text: "대학과 업무지의 지속 수요", sources: ["A2"] },
  structural_risks: { text: "간선도로 소음축", sources: ["A1"] },
  micro_zones: [{ name: "역 생활권", text: "평지 역세권", sources: ["A1"] }, { name: "내부 주거지", text: "저층 주거 골목", sources: ["A2"] }],
  property_type_notes: { apartment: "실거주", low_rise: "주차 확인", officetel: "업무 수요", retail: "가시성 확인" },
  field_checks: ["도로 폭 확인"],
  sources: [{ id: "A1", grade: "A", url: "https://example.com/a" }, { id: "A2", grade: "B", url: "https://example.com/b" }],
  researched_at: "2026-08-30",
  review_due: "2029-08-30",
  unknowns: []
};
assert.equal(core.validateStableProfile(validStable).status, "complete");
assert.throws(() => core.validateStableProfile({ ...validStable, micro_zones: validStable.micro_zones.slice(0, 1) }), /미시권역/);
assert.throws(() => core.validateStableProfile({ ...validStable, city_role: { text: "2026년 재개발 조합설립 단계", sources: ["A1"] } }), /시점정보/);
const validGisStable = {
  ...validStable,
  city_role: { text: "철도·도로·생활거점이 결합한 행정동", sources: ["B1", "B2"] },
  sources: [
    { id: "B1", grade: "B", url: "https://nominatim.openstreetmap.org/" },
    { id: "B2", grade: "B", url: "https://overpass-api.de/" }
  ],
  unknowns: ["OSM 누락·오분류 가능성"]
};
assert.equal(core.validateStableProfile(validGisStable).status, "complete");
const stableCoverage = core.stableCoverageSummary(busanIndex);
assert.equal(stableCoverage.total, 206);
assert.equal(stableCoverage.complete, 206);
assert.equal(stableCoverage.partial, 0);
assert.equal(stableCoverage.unresearched, 0);
assert.equal(stableCoverage.partial + stableCoverage.unresearched + stableCoverage.needsReview + stableCoverage.complete, 206);
busanProfiles.filter((profile) => profile.stable_profile?.status === "complete")
  .forEach((profile) => core.validateStableProfile(profile.stable_profile));

console.log("auction dong profile tests: PASS");
