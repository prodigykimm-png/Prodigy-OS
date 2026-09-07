"use strict";

const crypto = require("node:crypto");

const IDENTITY_SCHEMA_VERSION = 1;
const PROVIDERS = Object.freeze(["court", "building", "transactions", "official-price", "land-price"]);

function clean(value) { return value === undefined || value === null ? "" : String(value).normalize("NFKC").trim(); }
function compact(value) { return clean(value).replace(/\s+/gu, " "); }
function compareText(value) { return compact(value).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase(); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value === undefined ? null : value);
}
function fingerprint(value) { return crypto.createHash("sha256").update(stable(value)).digest("hex"); }
function validPnu(value) { const normalized = clean(value).replace(/\s+/gu, ""); return /^\d{19}$/u.test(normalized) ? normalized : ""; }
function validCourtCode(value) { const normalized = clean(value).toUpperCase(); return /^B\d{6}$/u.test(normalized) ? normalized : ""; }
function normalizeCaseNumber(value) {
  const text = clean(value).replace(/\s+/gu, "");
  const direct = text.match(/^(\d{4})[-_]?타경[-_]?([0-9]+)$/u);
  if (direct) return `${direct[1]}타경${direct[2]}`;
  const digits = text.match(/^(\d{4})[-_]?([0-9]{4,})$/u);
  return digits ? `${digits[1]}타경${digits[2]}` : text;
}
function parseLotToken(value) {
  const text = clean(value).replace(/,/gu, "").replace(/번지$/u, "");
  const match = text.match(/^(산)?(\d{1,4})(?:-(\d{1,4}))?$/u);
  if (!match) return null;
  return { mountain: Boolean(match[1]), main: match[2], sub: match[3] || "0", text: `${match[1] ? "산 " : ""}${match[2]}${match[3] ? `-${match[3]}` : ""}` };
}
function unitNumber(value) {
  const text = clean(value).replace(/\s+/gu, "");
  const match = text.match(/^(\d+(?:-\d+)?)호$/u) || text.match(/^(\d+(?:-\d+)?)$/u);
  return match ? match[1] : "";
}
function validParcelQueryAddress(value) {
  const parsed = parseCanonicalAddress(value, {});
  const address = compact(parsed.lot_address);
  if (!parsed.lot_number || address.split(/\s+/u).length < 3) return "";
  return address;
}
function buildingDong(value) {
  const text = clean(value).replace(/\s+/gu, "");
  const match = text.match(/^([\p{L}\p{N}-]+)동$/u);
  return match ? match[1] : "";
}
function isRoadPrefix(value) { return /(?:대로|로|길)$/u.test(clean(value)); }
function parseCanonicalAddress(address, fields) {
  const source = compact(address);
  const tokens = source.split(/\s+/u).filter(Boolean);
  const unitToken = tokens.find((token) => /^\d+(?:-\d+)?호$/u.test(token));
  const parsedUnit = unitNumber(fields?.unit_number || fields?.unit || fields?.ho_number || fields?.ho || unitToken);
  const parsedDong = buildingDong(fields?.building_dong || fields?.dong_number || fields?.buildingDong) || (tokens.find((token) => /^\d+동$/u.test(token)) || "").replace(/동$/u, "");
  const withoutUnit = tokens.filter((token) => !/^\d+(?:-\d+)?호$/u.test(token));
  let lotIndex = -1;
  let lot = null;
  withoutUnit.forEach((token, index) => {
    const candidate = parseLotToken(token);
    if (!candidate || isRoadPrefix(withoutUnit[index - 1])) return;
    lotIndex = index;
    lot = candidate;
  });
  const lotAddress = lot ? [...withoutUnit.slice(0, lotIndex), lot.text].join(" ") : compact(fields?.land_address || fields?.lot_address);
  const roadAddress = compact(fields?.road_address) || (lot ? "" : withoutUnit.join(" "));
  return Object.freeze({
    raw: source,
    normalized: withoutUnit.join(" "),
    road_address: roadAddress,
    lot_address: lotAddress,
    lot_number: lot ? lot.text : "",
    lot_main: lot ? lot.main : "",
    lot_sub: lot ? lot.sub : "",
    mountain: lot ? lot.mountain : false,
    building_dong: parsedDong,
    unit_number: parsedUnit
  });
}
function rowCode(row) { return validCourtCode(row?.code || row?.courtCode || row?.cortOfcCd || row?.boCd); }
function rowName(row) { return clean(row?.name || row?.courtName || row?.jiwonNm || row?.court); }
function courtNameKey(value) { return compareText(value).replace(/본원$/u, ""); }
function courtNameAliases(value) {
  const key = courtNameKey(value);
  const branch = key.match(/지방법원(.+지원)$/u);
  return new Set([key, branch?.[1], branch ? key.replace("지방법원", "") : ""].filter(Boolean));
}
function courtNamesMatch(left, right) {
  const rightAliases = courtNameAliases(right);
  return [...courtNameAliases(left)].some((alias) => rightAliases.has(alias));
}
function resolveCourtCode(record, rows) {
  const explicit = validCourtCode(record.court_code);
  if (explicit) return { status: "resolved", method: "object_identifier", selected: { court_code: explicit, court: clean(record.court) }, candidates: [] };
  const name = clean(record.court);
  const candidates = (Array.isArray(rows) ? rows : []).map((row) => ({ code: rowCode(row), name: rowName(row) })).filter((row) => row.code && row.name && (!name || courtNamesMatch(row.name, name)));
  if (candidates.length === 1) return { status: "resolved", method: "unique_court_name", selected: { court_code: candidates[0].code, court: candidates[0].name }, candidates };
  if (candidates.length > 1) return { status: "needs_selection", method: "court_name_ambiguous", selected: {}, candidates: candidates.slice(0, 20), reason: "법원명이 여러 법원사무소 코드와 일치합니다." };
  return { status: "needs_identifier", method: "court_code_missing", selected: {}, candidates: [], reason: "법원사무소 코드와 사건번호가 필요합니다." };
}
function providerPlan(provider, identity) {
  if (provider === "court") {
    return identity.case_number && identity.court_code ? { status: "resolved", method: identity.court_code_source || "object_identifier", query: { court_code: identity.court_code, case_number: identity.case_number }, candidates: [] } : { status: "needs_identifier", method: "court_code_missing", query: { case_number: identity.case_number }, candidates: [], reason: "법원사무소 코드를 확인해야 합니다." };
  }
  if (provider === "building") {
    if (identity.pnu) return { status: "resolved", method: "pnu", query: { pnu: identity.pnu }, candidates: [] };
    return { status: "needs_selection", method: "pnu_required", query: { address: identity.parcel_query_address }, candidates: [], reason: "건축물대장 조회에 사용할 PNU를 선택하거나 입력해야 합니다." };
  }
  if (provider === "transactions") {
    return identity.region_sigungu ? { status: "resolved", method: identity.lawd_cd ? "region_code_exact" : "region_comparison", scope: "region", query: { lawd_cd: identity.lawd_cd, region_sido: identity.region_sido, region_sigungu: identity.region_sigungu, region_dong: identity.region_dong, property_type: identity.property_type }, candidates: [], reason: "실거래가는 동일 지역·유형 비교 근거입니다." } : { status: "needs_identifier", method: "region_missing", query: {}, candidates: [], reason: "실거래 조회에 시·군·구가 필요합니다." };
  }
  if (provider === "official-price") {
    if (identity.is_apartment) {
      const selected = { apt_code: identity.apt_code, apt_notice_date: identity.apt_notice_date, building_name: identity.building_name, building_dong: identity.building_dong, unit_number: identity.unit_number, dong_code: identity.dong_code, ho_code: identity.ho_code };
      return identity.building_name && identity.apt_code && identity.building_dong && identity.unit_number ? { status: "resolved", method: "apartment_unit", query: selected, candidates: [] } : { status: "needs_selection", method: "apartment_unit_required", query: selected, candidates: [], reason: "공동주택 단지·동·호를 확정해야 합니다." };
    }
    return identity.pnu ? { status: "resolved", method: "pnu", query: { pnu: identity.pnu }, candidates: [] } : { status: "needs_selection", method: "pnu_required", query: {}, candidates: [], reason: "개별주택 공시가격 조회에 사용할 PNU가 필요합니다." };
  }
  if (provider === "land-price") {
    return identity.pnu || identity.parcel_query_address ? { status: "resolved", method: identity.pnu ? "pnu_exact" : "lot_address", scope: "parcel", query: { pnu: identity.pnu, lot_address: identity.parcel_query_address, lot_number: identity.lot_number }, candidates: [] } : { status: "needs_selection", method: "lot_required", query: {}, candidates: [], reason: "개별공시지가 조회에 사용할 필지를 확정해야 합니다." };
  }
  return { status: "needs_identifier", method: "unsupported", query: {}, candidates: [], reason: "지원하지 않는 공급자입니다." };
}
function normalizeAuctionIdentity(record, selections) {
  const source = Object.assign({}, record || {}, selections || {});
  const address = parseCanonicalAddress(source.address, source);
  const selectedParcel = parseCanonicalAddress(source.land_address || source.lot_address || (validPnu(source.land_parcel_id) ? "" : source.land_parcel_id), {});
  const parcel = address.lot_number ? address : selectedParcel;
  const pnu = validPnu(source.pnu || source.land_parcel_id);
  const caseNumber = normalizeCaseNumber(source.case_number);
  const identity = {
    case_number: caseNumber,
    court: clean(source.court),
    court_code: validCourtCode(source.court_code),
    court_code_source: validCourtCode(source.court_code) ? "object_identifier" : "",
    address: address.normalized,
    road_address: address.road_address,
    lot_address: parcel.lot_address,
    lot_number: parcel.lot_number,
    lot_main: parcel.lot_main,
    lot_sub: parcel.lot_sub,
    mountain: parcel.mountain,
    parcel_query_address: validParcelQueryAddress(parcel.lot_address),
    pnu,
    region_sido: clean(source.region_sido),
    region_sigungu: clean(source.region_sigungu),
    region_dong: clean(source.region_dong),
    lawd_cd: clean(source.lawd_cd || source.lawdCd),
    property_type: clean(source.property_type),
    building_name: clean(source.building_name || source.complex_name),
    building_dong: buildingDong(source.building_dong || source.dong_number || address.building_dong),
    unit_number: unitNumber(source.unit_number || source.unit || source.ho_number || source.ho || address.unit_number),
    apt_code: clean(source.apt_code),
    apt_notice_date: clean(source.apt_notice_date),
    dong_code: clean(source.dong_code),
    ho_code: clean(source.ho_code),
    is_apartment: /아파트|공동주택/u.test(clean(source.property_type)) || Boolean(source.apt_code || source.complex_name)
  };
  const normalizedInput = Object.freeze({
    case_number: identity.case_number,
    court: identity.court,
    court_code: identity.court_code,
    address: identity.address,
    road_address: identity.road_address,
    lot_address: identity.lot_address,
    lot_number: identity.lot_number,
    pnu: identity.pnu,
    region_sido: identity.region_sido,
    region_sigungu: identity.region_sigungu,
    region_dong: identity.region_dong,
    lawd_cd: identity.lawd_cd,
    property_type: identity.property_type,
    building_name: identity.building_name,
    building_dong: identity.building_dong,
    unit_number: identity.unit_number,
    apt_code: identity.apt_code,
    apt_notice_date: identity.apt_notice_date,
    dong_code: identity.dong_code,
    ho_code: identity.ho_code
  });
  const selectedIdentity = Object.freeze({
    case: { court_code: identity.court_code, case_number: identity.case_number },
    parcel: { pnu: identity.pnu, lot_address: identity.parcel_query_address, lot_number: identity.lot_number },
    building: { complex_name: identity.building_name, apt_code: identity.apt_code, building_dong: identity.building_dong },
    unit: { unit_number: identity.unit_number, dong_code: identity.dong_code, ho_code: identity.ho_code }
  });
  return Object.freeze({ identity, normalized_input: normalizedInput, selected_identity: selectedIdentity, query_fingerprint: fingerprint(normalizedInput) });
}
function sameAddress(left, right) {
  const a = validParcelQueryAddress(left); const b = validParcelQueryAddress(right);
  return Boolean(a && b) && compareText(a) === compareText(b);
}
function verifyReturnedIdentity(provider, identity, payload, query) {
  const body = payload && typeof payload === "object" ? payload : {};
  if (provider === "transactions") {
    const returnedQuery = body.query || {};
    const verified = Boolean(query?.lawd_cd && returnedQuery.lawd_cd) && clean(returnedQuery.lawd_cd) === clean(query.lawd_cd) && (!query.asset_type || clean(returnedQuery.asset_type) === clean(query.asset_type));
    return { match_verified: verified, scope: "region", reason: verified ? "region_query_exact" : "region_query_mismatch" };
  }
  if (provider === "court") {
    const item = Array.isArray(body.items) ? body.items[0] || {} : {};
    const result = Object.assign({}, body.caseInfo || {}, item);
    const returnedCase = normalizeCaseNumber(result.userCaseNumber || result.printCaseNumber || result.printCsNo || result.caseNumber || result.case_number || body.caseNumber);
    const returnedCourt = validCourtCode(result.courtCode || result.court_code || result.boCd);
    const caseMatch = Boolean(returnedCase && returnedCase === identity.case_number);
    const courtMatch = Boolean(returnedCourt && identity.court_code) && returnedCourt === identity.court_code;
    return { match_verified: caseMatch && courtMatch, reason: caseMatch && courtMatch ? "case_identity_exact" : "case_identity_mismatch" };
  }
  if (provider === "building") {
    const item = Array.isArray(body.items) ? body.items[0] || {} : body.record || {};
    const returnedPnu = validPnu(item.pnu || item.PNU || item.pnu19 || body.query?.pnu);
    const returnedAddress = clean(item.address || item.platPlc || item.newPlatPlc || body.address);
    const verified = Boolean(identity.pnu && returnedPnu && returnedPnu === identity.pnu);
    return { match_verified: verified, reason: verified ? "parcel_identity_exact" : "parcel_identity_mismatch" };
  }
  if (provider === "official-price") {
    const selected = body.selected || {};
    const candidate = selected.candidate || body.candidate || {};
    const unit = selected.unit || body.unit || {};
    if (!identity.is_apartment) {
      const returnedPnu = validPnu(selected.pnu || body.pnu);
      const verified = Boolean(identity.pnu && returnedPnu && returnedPnu === identity.pnu);
      return { match_verified: verified, reason: verified ? "pnu_identity_exact" : "pnu_identity_mismatch" };
    }
    const returnedAptCode = clean(candidate.aptCode || candidate.apt_code);
    const returnedBuildingName = clean(candidate.complexName || candidate.complex_name);
    const returnedDongCode = clean(unit.dongCode || unit.dong_code);
    const returnedDongName = buildingDong(unit.dongName || unit.dong_name);
    const returnedHoCode = clean(unit.hoCode || unit.ho_code);
    const returnedHoName = unitNumber(unit.hoName || unit.ho_name);
    const aptMatch = Boolean(identity.apt_code && returnedAptCode && returnedAptCode === identity.apt_code);
    const nameMatch = Boolean(identity.building_name && returnedBuildingName && compareText(returnedBuildingName) === compareText(identity.building_name));
    const dongMatch = identity.dong_code ? returnedDongCode === identity.dong_code : Boolean(identity.building_dong && returnedDongName && returnedDongName === identity.building_dong);
    const hoMatch = identity.ho_code ? returnedHoCode === identity.ho_code : Boolean(identity.unit_number && returnedHoName && returnedHoName === identity.unit_number);
    const verified = aptMatch && nameMatch && dongMatch && hoMatch;
    return { match_verified: verified, reason: verified ? "apartment_unit_exact" : "apartment_unit_mismatch" };
  }
  if (provider === "land-price") {
    const returnedPnu = validPnu(body.pnu || body.PNU || body.query?.pnu);
    const returned = clean(body.address || body.jibun || body.query?.address);
    const pnuMatch = Boolean(identity.pnu && returnedPnu && returnedPnu === identity.pnu);
    const addressMatch = Boolean(query?.lot_address && returned) && sameAddress(returned, query.lot_address);
    const verified = pnuMatch || addressMatch;
    return { match_verified: verified, scope: "parcel", reason: verified ? "lot_identity_exact" : "lot_identity_mismatch" };
  }
  return { match_verified: false, reason: "unsupported_provider" };
}
function buildMatchResolution(identityContext, providerResolutions, candidateSources) {
  const providers = Object.fromEntries(PROVIDERS.map((provider) => [provider, providerResolutions?.[provider] || { status: "needs_identifier", method: "not_run", query: {}, candidates: [], match_verified: false, reason: "provider_not_run" }]));
  return Object.freeze({
    schema_version: IDENTITY_SCHEMA_VERSION,
    normalized_input: identityContext.normalized_input,
    resolution_method: "canonical_identity_preflight",
    selected_identity: identityContext.selected_identity,
    candidate_list: [],
    provider_query_identity: Object.fromEntries(PROVIDERS.map((provider) => [provider, providers[provider].query || {}])),
    query_fingerprint: identityContext.query_fingerprint,
    match_verified: Object.values(providers).every((provider) => provider.match_verified === true),
    candidate_sources: Object.fromEntries(Object.entries(candidateSources || {}).map(([key, names]) => [key, [...new Set(names)].filter((name) => PROVIDERS.includes(name))])),
    evidence_refs: [],
    providers
  });
}

module.exports = Object.freeze({ IDENTITY_SCHEMA_VERSION, PROVIDERS, buildMatchResolution, buildingDong, clean, compareText, fingerprint, normalizeAuctionIdentity, normalizeCaseNumber, parseCanonicalAddress, parseLotToken, providerPlan, resolveCourtCode, unitNumber, validCourtCode, validPnu, validParcelQueryAddress, verifyReturnedIdentity });
