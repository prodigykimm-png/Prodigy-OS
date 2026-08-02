"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const identity = require(path.join(ROOT, "SYSTEM/SCRIPTS/real-estate-source-identity-core.js"));

test("Given a unit address, When canonical identity is parsed, Then the unit suffix is never treated as a land lot", () => {
  const parsed = identity.parseCanonicalAddress("서울특별시 강남구 역삼동 123-4 101동 1905호");
  assert.equal(parsed.lot_number, "123-4");
  assert.equal(parsed.unit_number, "1905");
  assert.equal(parsed.lot_address, "서울특별시 강남구 역삼동 123-4");
  assert.equal(parsed.lot_address.includes("1905호"), false);
});

test("Given a road address with a unit suffix, When canonical identity is parsed, Then parcel lookup remains unresolved", () => {
  const parsed = identity.normalizeAuctionIdentity({ address: "서울특별시 강남구 테헤란로 123 1905호", property_type: "아파트" });
  assert.equal(parsed.identity.unit_number, "1905");
  assert.equal(parsed.identity.lot_number, "");
  assert.equal(parsed.identity.parcel_query_address, "");
  assert.equal(identity.providerPlan("land-price", parsed.identity).status, "needs_selection");
});

test("Given one exact court candidate and multiple candidates, When court identity resolves, Then only the unique candidate is auto selected", () => {
  const rows = [{ code: "B000001", name: "서울중앙지방법원" }, { code: "B000002", name: "서울동부지방법원" }];
  assert.deepEqual(identity.resolveCourtCode({ court: "서울중앙지방법원" }, rows).selected, { court_code: "B000001", court: "서울중앙지방법원" });
  const ambiguous = identity.resolveCourtCode({ court: "서울중앙지방법원" }, [{ code: "B000001", name: "서울중앙지방법원" }, { code: "B000002", name: "서울중앙지방법원" }]);
  assert.equal(ambiguous.status, "needs_selection");
  assert.equal(ambiguous.selected.court_code, undefined);
});

test("Given a canonical identity, When provider plans are built, Then exact providers are resolved and apartment units require all selectors", () => {
  const context = identity.normalizeAuctionIdentity({
    case_number: "2026-타경-10001",
    court_code: "B000001",
    address: "서울특별시 강남구 역삼동 123-4 101동 1905호",
    pnu: "1168010100101230004",
    property_type: "아파트",
    building_name: "테스트아파트",
    apt_code: "A1",
    building_dong: "101동",
    unit_number: "1905호"
  });
  assert.equal(context.identity.case_number, "2026타경10001");
  assert.equal(identity.providerPlan("court", context.identity).status, "resolved");
  assert.equal(identity.providerPlan("building", context.identity).method, "pnu");
  assert.equal(identity.providerPlan("official-price", context.identity).status, "resolved");
  const missingUnit = identity.normalizeAuctionIdentity({ property_type: "아파트", building_name: "테스트아파트", apt_code: "A1", building_dong: "101동" });
  assert.equal(identity.providerPlan("official-price", missingUnit.identity).status, "needs_selection");
});

test("Given a provider response with a different parcel, When identity verification runs, Then the result is rejected", () => {
  const context = identity.normalizeAuctionIdentity({ address: "서울특별시 강남구 역삼동 123-4", pnu: "1168010100101230004" });
  const verified = identity.verifyReturnedIdentity("building", context.identity, { items: [{ pnu: "1168010100109990001" }] }, { pnu: context.identity.pnu });
  assert.equal(verified.match_verified, false);
  const land = identity.verifyReturnedIdentity("land-price", context.identity, { address: "서울특별시 강남구 역삼동 999-1" }, { lot_address: context.identity.parcel_query_address });
  assert.equal(land.match_verified, false);
});

test("Given a selected PNU, When the provider omits its returned PNU, Then address fallback cannot verify the parcel", () => {
  const context = identity.normalizeAuctionIdentity({ address: "서울특별시 강남구 역삼동 123-4", pnu: "1168010100101230004" });
  const verified = identity.verifyReturnedIdentity("building", context.identity, { items: [{ address: "서울특별시 강남구 역삼동 123-4" }] }, { pnu: context.identity.pnu });
  assert.equal(verified.match_verified, false);
});

test("Given a selected court and apartment unit, When returned identifiers are missing or different, Then matching fails closed", () => {
  const courtContext = identity.normalizeAuctionIdentity({ case_number: "2026타경10001", court_code: "B000001" });
  assert.equal(identity.verifyReturnedIdentity("court", courtContext.identity, { caseInfo: { caseNumber: "2026타경10001" } }, { court_code: "B000001" }).match_verified, false);
  const apartmentContext = identity.normalizeAuctionIdentity({ property_type: "아파트", building_name: "테스트아파트", apt_code: "A1", building_dong: "101동", unit_number: "1905" });
  const mismatch = identity.verifyReturnedIdentity("official-price", apartmentContext.identity, { selected: { candidate: { aptCode: "A1", complexName: "테스트아파트" }, unit: { dongName: "102동", hoName: "2901" } } }, { apt_code: "A1" });
  assert.equal(mismatch.match_verified, false);
});

test("Given a unit-only lot selection, When the land provider plan is built, Then the value requires explicit parcel selection", () => {
  const context = identity.normalizeAuctionIdentity({ property_type: "아파트", lot_address: "1905", unit_number: "1905호" });
  assert.equal(context.identity.parcel_query_address, "");
  assert.equal(identity.providerPlan("land-price", context.identity).status, "needs_selection");
});

console.log("Real-estate source identity tests loaded");
