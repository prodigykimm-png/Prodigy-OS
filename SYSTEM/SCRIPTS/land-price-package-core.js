"use strict";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const SOURCE_KEYS = new Set(["institution", "title", "url", "accessed_at", "source_type"]);
const CASE_KEYS = new Set(["schema_version", "scope", "target_id", "official_land_price_as_of", "source", "land_parcel_id", "official_land_price_per_sqm", "land_rights_area_sqm"]);
const REGION_KEYS = new Set(["schema_version", "scope", "target_id", "land_price_trend_as_of", "source", "land_price_trend_yoy", "land_price_trend_scope"]);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}가 객체가 아닙니다.`);
}

function rejectUnknown(value, allowed, label) {
  assertObject(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}에 알 수 없는 필드가 있습니다: ${key}`);
}

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) throw new Error(`${label}은(는) 비어 있지 않은 단일 행 문자열이어야 합니다.`);
}

function assertRenderableText(value, label) {
  assertText(value, label);
  if (/[<>\[\]`]/.test(value)) throw new Error(`${label}에 Markdown 또는 HTML 구조 문자를 포함할 수 없습니다.`);
}

function assertDate(value, label) {
  if (typeof value !== "string" || !DATE_RE.test(value)) throw new Error(`${label}은(는) YYYY-MM-DD 날짜여야 합니다.`);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error(`${label}은(는) 실제 달력 날짜여야 합니다.`);
}

function validateSource(source) {
  rejectUnknown(source, SOURCE_KEYS, "source");
  assertRenderableText(source.institution, "source.institution");
  assertRenderableText(source.title, "source.title");
  assertDate(source.accessed_at, "source.accessed_at");
  if (source.source_type !== "official_primary") throw new Error("source.source_type은 official_primary여야 합니다.");
  if (typeof source.url !== "string" || /[\s<>]/.test(source.url)) throw new Error("source.url 형식이 올바르지 않습니다.");
  let parsed;
  try { parsed = new URL(source.url); } catch { throw new Error("source.url 형식이 올바르지 않습니다."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("source.url은 username/password 없는 https URL이어야 합니다.");
}

function validatePackage(pkg) {
  assertObject(pkg, "package");
  if (pkg.scope === "case") {
    rejectUnknown(pkg, CASE_KEYS, "package");
    assertText(pkg.target_id, "target_id");
    assertDate(pkg.official_land_price_as_of, "official_land_price_as_of");
    assertText(pkg.land_parcel_id, "land_parcel_id");
    if (!Number.isFinite(pkg.official_land_price_per_sqm) || pkg.official_land_price_per_sqm < 0) throw new Error("official_land_price_per_sqm은 0 이상의 숫자여야 합니다.");
    if (!Number.isFinite(pkg.land_rights_area_sqm) || pkg.land_rights_area_sqm < 0) throw new Error("land_rights_area_sqm은 0 이상의 숫자여야 합니다.");
  } else if (pkg.scope === "region") {
    rejectUnknown(pkg, REGION_KEYS, "package");
    if (typeof pkg.target_id !== "string" || !/^.+-.+$/.test(pkg.target_id)) throw new Error("region target_id 형식이 올바르지 않습니다.");
    assertDate(pkg.land_price_trend_as_of, "land_price_trend_as_of");
    assertRenderableText(pkg.land_price_trend_scope, "land_price_trend_scope");
    if (!Number.isFinite(pkg.land_price_trend_yoy)) throw new Error("land_price_trend_yoy는 숫자여야 합니다.");
  } else {
    throw new Error("scope은 case 또는 region이어야 합니다.");
  }
  if (pkg.schema_version !== 1) throw new Error("schema_version은 1이어야 합니다.");
  validateSource(pkg.source);
  return true;
}

function renderRegionBlock(pkg) {
  const direction = pkg.land_price_trend_yoy > 0 ? "상승" : pkg.land_price_trend_yoy < 0 ? "하락" : "변동 없음";
  return [
    `> 기준일 ${pkg.land_price_trend_as_of} · 공식 지가 근거 · ${pkg.source.institution}`,
    "",
    `- 공시지가 변동률: ${pkg.land_price_trend_yoy.toFixed(2)}% (${direction})`,
    `- 범위: ${pkg.land_price_trend_scope}`,
    `- 출처: ${pkg.source.title} · <${pkg.source.url}> · 조회 ${pkg.source.accessed_at}`,
    "- 공시지가를 시세·감정가·낙찰가로 해석하지 않음."
  ].join("\n");
}

module.exports = Object.freeze({ CASE_KEYS, REGION_KEYS, SOURCE_KEYS, validatePackage, renderRegionBlock });
