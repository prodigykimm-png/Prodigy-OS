"use strict";

const assert = require("node:assert/strict");
const core = require("./auction-key-value-core.js");

const csv = `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n오피스텔,"부산광역시 해운대구 우동 1, 테스트빌 2층 201호",3.2㎡,33.05785㎡,100000000,2026.08.01\n`;
const [record] = core.parseAuctCsv(csv, { sourceFile: "sample.csv" });
assert.equal(record.property_type, "오피스텔");
assert.equal(record.area_sqm, 33.05785);
assert.equal(record.price_won, 100000000);
assert.equal(record.won_per_pyeong, 10000000);
assert.equal(record.legal_dong, "우동");
assert.equal(record.building_key, "부산광역시 해운대구 우동 1|테스트빌");
assert.match(record.record_id, /^[a-f0-9]{64}$/);

assert.equal(core.eligibility({ ...record, won_per_pyeong: 100000 }).reason, "suspicious_unit_price");
assert.equal(core.eligibility(record).eligible, true);
assert.equal(core.canonicalPropertyType("다가구(원룸등)"), "다가구");
assert.equal(core.canonicalPropertyType("아파트형공장"), "지식산업센터");
assert.equal(core.canonicalPropertyType("오피스텔(상업)"), "오피스텔");
assert.equal(core.eligibility({ ...record, property_type: "아파트" }).eligible, true);
assert.equal(core.eligibility({ ...record, property_type: "다가구" }).eligible, true);
assert.equal(core.eligibility({ ...record, property_type: "지식산업센터" }).eligible, true);
assert.equal(core.eligibility({ ...record, property_type: "공장" }).eligible, true);
assert.equal(core.canonicalPropertyType("단독주택"), "주택");
for (const type of ["다세대(빌라)", "주택", "근린상가", "근린주택", "근린시설", "숙박(콘도등)", "숙박시설", "노유자시설"]) {
  assert.equal(core.eligibility({ ...record, property_type: type }).eligible, true, type);
}
assert.equal(core.eligibility({ ...record, property_type: "근린시설", won_per_pyeong: 300000000 }).eligible, true);
assert.equal(core.eligibility({ ...record, property_type: "승용차" }).eligible, false);
assert.equal(core.canonicalSido("제주"), "제주특별자치도");
assert.equal(core.canonicalSido("강원도"), "강원특별자치도");
assert.equal(core.canonicalSido("전라북도"), "전북특별자치도");
assert.equal(core.canonicalPropertyType("숙박시설(생활숙박시설)"), "숙박시설");
const cardRecord = core.buildCardRecord({
  property_type: "다가구(원룸등)", address: "경기도 광주시 신현동 816",
  areaText: "396.51㎡", priceWon: 842000000, dateText: "2026-08-24T10:00",
  sourceFile: "경기-2024타경7347.md"
});
assert.equal(cardRecord.property_type, "다가구");
assert.equal(cardRecord.area_sqm, 396.51);
assert.equal(cardRecord.auction_date, "2026-08-24");
assert.equal(cardRecord.source, "CARD");
assert.equal(cardRecord.legal_dong, "신현동");
assert.equal(core.eligibility(cardRecord).eligible, true);
const [csvSame] = core.parseAuctCsv(
  "물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n다가구(원룸등),경기도 광주시 신현동 816,,396.51,842000000,2026.08.24\n"
);
assert.equal(csvSame.record_id, cardRecord.record_id);
const dongMerged = core.buildKeyValueSnapshot([
  { ...csvSame, legal_dong: "신현동" },
  { ...cardRecord, price_won: 900000000, won_per_pyeong: null, record_id: "other" }
]);
assert.equal(Object.keys(dongMerged.groups).length, 1);
assert.equal(dongMerged.groups["경기도|광주시|신현동|다가구"].building_count, 1);
assert.equal(core.normalizeLegalDong("일산동구 장항동"), "장항동");
assert.equal(core.normalizeLegalDong("수원시 권선구 권선동"), "권선동");
assert.equal(core.parseAreaText("25.4평"), 83.97);
assert.equal(core.parseAreaText("63.93㎡"), 63.93);
assert.equal(core.parseAreaText("84㎡(25.4평)"), 84);
assert.equal(core.parseAreaText(""), null);
assert.equal(core.normalizeLegalDong("장항동"), "장항동");
assert.equal(core.buildCardRecord({ property_type: "아파트", address: "서울특별시 강서구 화곡동 1", areaText: "", priceWon: 400000000, dateText: "2026-08-31" }).area_sqm, null);

const [apartment] = core.parseAuctCsv(
  `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n아파트,"부산광역시 해운대구 좌동 1, 테스트아파트 1층 101호",10㎡,84㎡,400000000,2026.08.31\n`
);
const [multiFamily] = core.parseAuctCsv(
  `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n다가구(원룸등),부산광역시 북구 구포동 1,토지 100㎡,200㎡,300000000,2026.08.18\n`
);
assert.equal(apartment.property_type, "아파트");
assert.equal(multiFamily.property_type, "다가구");
assert.equal(core.eligibility(apartment).eligible, true);
assert.equal(core.eligibility(multiFamily).eligible, true);
const [land] = core.parseAuctCsv(
  `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n농지,부산광역시 강서구 강동동 1537,토지 786㎡,,91190000,2026.09.03\n`
);
assert.equal(land.property_type, "농지");
assert.equal(land.area_sqm, 786);
assert.equal(land.area_basis, "land");
assert.equal(core.eligibility(land).eligible, true);
const [missingArea] = core.parseAuctCsv(
  `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n아파트,경기도 동두천시 생연동 350,미기재(원문 면적 미표기),미기재(원문 면적 미표기),121077000,2026.02.24\n`
);
assert.equal(missingArea.area_sqm, null);
assert.equal(core.eligibility(missingArea).reason, "invalid_required_value");
assert.deepEqual(core.parseRegion("경기도 수원시 권선구 권선동 1"), {
  sido: "경기도",
  sigungu: "수원시 권선구"
});

const cases = [
  ["A", 900], ["A", 1000], ["A", 1100],
  ["B", 1200], ["B", 1300],
  ["C", 1400], ["C", 1500]
].map(([building, unit], index) => ({
  ...record,
  record_id: String(index),
  legal_dong: "우동",
  building_key: building,
  won_per_pyeong: unit * 10000,
  auction_date: `2026-0${(index % 8) + 1}-01`
}));
const snapshot = core.buildKeyValueSnapshot(cases, { asOf: "2026-08-31", source: "AUCT CSV" });
const key = snapshot.groups["부산광역시|해운대구|우동|오피스텔"];
assert.equal(key.case_count, 7);
assert.equal(key.building_count, 3);
assert.equal(key.key_value_won_per_pyeong, 12500000);
assert.equal(key.q1_won_per_pyeong, 11250000);
assert.equal(key.q3_won_per_pyeong, 13500000);
assert.equal(key.confidence, "usable");
assert.equal(key.period_start, "2026-01-01");
assert.equal(key.period_end, "2026-07-01");

const concentrated = core.buildKeyValueSnapshot(cases.filter((row) => row.building_key === "A"), { asOf: "2026-08-31", source: "AUCT CSV" });
assert.equal(concentrated.groups["부산광역시|해운대구|우동|오피스텔"].confidence, "sample_concentrated");

const districtCases = cases.concat([
  { ...record, record_id: "D", legal_dong: "중동", building_key: "D", won_per_pyeong: 20000000, auction_date: "2026-08-01" },
  { ...record, record_id: "E", legal_dong: "중동", building_key: "E", won_per_pyeong: 22000000, auction_date: "2026-08-02" }
]);
const districtSnapshot = core.buildKeyValueSnapshot(districtCases, { asOf: "2026-08-31", source: "AUCT CSV" });
const district = districtSnapshot.districts["부산광역시|해운대구|오피스텔"];
assert.equal(district.case_count, 9);
assert.equal(district.building_count, 5);
assert.equal(district.key_value_won_per_pyeong, 14500000);
assert.equal(district.q1_won_per_pyeong, 12500000);
assert.equal(district.q3_won_per_pyeong, 20000000);

assert.deepEqual(core.comparePrice(90000000, 33.05785, 10000000), {
  won_per_pyeong: 9000000,
  ratio: 0.9,
  position: "키값 근접"
});
console.log("auction key value core tests: PASS");
