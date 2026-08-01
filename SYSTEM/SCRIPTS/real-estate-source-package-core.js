"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = 1;
const PROVIDERS = Object.freeze(["court", "building", "transactions", "official-price", "land-price"]);
const PROVIDER_STATUSES = new Set(["success", "empty", "failed", "needs_identifier", "needs_selection"]);
const PATCH_KEYS = new Set([
  "case_number", "court", "auction_datetime", "region_sido", "region_sigungu", "region_dong",
  "address", "property_type", "appraisal_price", "minimum_bid", "auction_outcome",
  "auction_result_date", "winning_bid_price"
]);

function isObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
function assertText(value, label) {
  if (!clean(value) || /[\r\n]/u.test(String(value))) throw new Error(`${label}은(는) 한 줄의 비어 있지 않은 값이어야 합니다.`);
}
function assertDate(value, label) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(text)) throw new Error(`${label} 날짜 형식이 올바르지 않습니다.`);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} 날짜가 올바르지 않습니다.`);
}
function assertUrl(value, label) {
  assertText(value, label);
  let parsed;
  try { parsed = new URL(value); } catch (_error) { throw new Error(`${label} URL이 올바르지 않습니다.`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`${label}은(는) 안전한 https URL이어야 합니다.`);
}
function assertAllowedKeys(value, allowed, label) {
  if (!isObject(value)) throw new Error(`${label}가 객체가 아닙니다.`);
  Object.keys(value).forEach((key) => { if (!allowed.has(key)) throw new Error(`${label}에 알 수 없는 필드가 있습니다: ${key}`); });
}
function safeCaseKey(caseNumber, itemNumber) {
  const value = `${clean(caseNumber)}-${clean(itemNumber) || "1"}`.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!value) throw new Error("case_key를 만들 사건번호가 없습니다.");
  return value.slice(0, 160);
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function verifyRawDigest(provider, rawText) { return Boolean(provider && /^[a-f0-9]{64}$/u.test(provider.raw_sha256 || "") && sha256(rawText) === provider.raw_sha256); }
function normalizePatch(patch) {
  const result = {};
  if (!isObject(patch)) throw new Error("candidate_patch가 객체가 아닙니다.");
  Object.keys(patch).forEach((key) => {
    if (!PATCH_KEYS.has(key)) throw new Error(`candidate_patch에 허용되지 않은 필드가 있습니다: ${key}`);
    const value = patch[key];
    if (value === null || value === undefined || value === "") return;
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new Error(`${key}는 0 이상의 유한한 숫자여야 합니다.`);
    result[key] = value;
  });
  if (result.auction_result_date) assertDate(result.auction_result_date, "candidate_patch.auction_result_date");
  if (result.auction_outcome && !new Set(["won", "lost", "skipped"]).has(result.auction_outcome)) throw new Error("auction_outcome 값이 올바르지 않습니다.");
  return Object.freeze(result);
}
function validateProvider(provider, label) {
  assertAllowedKeys(provider, new Set(["status", "source_url", "fetched_at", "raw_path", "raw_sha256", "warnings", "error_code", "message"]), label);
  if (!PROVIDER_STATUSES.has(provider.status)) throw new Error(`${label}.status가 올바르지 않습니다.`);
  if (provider.source_url) assertUrl(provider.source_url, `${label}.source_url`);
  if (provider.fetched_at) assertDate(provider.fetched_at, `${label}.fetched_at`);
  if (provider.raw_path) { assertText(provider.raw_path, `${label}.raw_path`); if (provider.raw_path.includes("..")) throw new Error(`${label}.raw_path가 캐시 경계를 벗어납니다.`); }
  if (provider.raw_sha256 && !/^[a-f0-9]{64}$/u.test(provider.raw_sha256)) throw new Error(`${label}.raw_sha256가 올바르지 않습니다.`);
  if (!Array.isArray(provider.warnings)) throw new Error(`${label}.warnings는 배열이어야 합니다.`);
  if (provider.status === "success" || provider.status === "empty") {
    assertText(provider.raw_path, `${label}.raw_path`);
    assertText(provider.raw_sha256, `${label}.raw_sha256`);
  }
}
function validatePackage(pkg) {
  assertAllowedKeys(pkg, new Set(["schema_version", "package_id", "case_key", "observed_at", "query_identity", "collector", "providers", "candidate_patch", "evidence", "errors"]), "package");
  if (pkg.schema_version !== SCHEMA_VERSION) throw new Error(`schema_version은 ${SCHEMA_VERSION}이어야 합니다.`);
  ["package_id", "case_key"].forEach((key) => assertText(pkg[key], `package.${key}`));
  assertDate(pkg.observed_at, "package.observed_at");
  assertAllowedKeys(pkg.query_identity, new Set(["object_path", "case_number", "court", "address", "region_sido", "region_sigungu", "region_dong"]), "query_identity");
  assertText(pkg.query_identity.object_path, "query_identity.object_path");
  assertText(pkg.query_identity.case_number, "query_identity.case_number");
  assertAllowedKeys(pkg.collector, new Set(["k_skill_repository", "k_skill_commit", "package_version", "selected_skills"]), "collector");
  assertUrl(pkg.collector.k_skill_repository, "collector.k_skill_repository");
  if (!/^[a-f0-9]{40}$/u.test(pkg.collector.k_skill_commit)) throw new Error("collector.k_skill_commit은 Git SHA여야 합니다.");
  assertText(pkg.collector.package_version, "collector.package_version");
  if (!Array.isArray(pkg.collector.selected_skills) || pkg.collector.selected_skills.length !== PROVIDERS.length || JSON.stringify([...pkg.collector.selected_skills].sort()) !== JSON.stringify([...PROVIDERS].sort())) throw new Error("collector.selected_skills가 완전하지 않습니다.");
  assertAllowedKeys(pkg.providers, new Set(PROVIDERS), "providers");
  PROVIDERS.forEach((provider) => validateProvider(pkg.providers[provider], `providers.${provider}`));
  normalizePatch(pkg.candidate_patch);
  if (!isObject(pkg.evidence) || !Array.isArray(pkg.errors)) throw new Error("evidence 또는 errors 형식이 올바르지 않습니다.");
  pkg.errors.forEach((error, index) => { assertAllowedKeys(error, new Set(["provider", "code", "message"]), `errors[${index}]`); assertText(error.provider, `errors[${index}].provider`); assertText(error.code, `errors[${index}].code`); assertText(error.message, `errors[${index}].message`); });
  return true;
}
function buildPackage(input) {
  const pkg = Object.assign({}, input, { schema_version: SCHEMA_VERSION, candidate_patch: normalizePatch(input.candidate_patch || {}) });
  validatePackage(pkg);
  return Object.freeze(pkg);
}

module.exports = Object.freeze({ SCHEMA_VERSION, PROVIDERS, PROVIDER_STATUSES, PATCH_KEYS, buildPackage, normalizePatch, safeCaseKey, sha256, validatePackage, verifyRawDigest });
