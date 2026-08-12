"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = 1;
const PROVIDERS = Object.freeze(["court", "building", "transactions", "official-price", "land-price"]);
const SELECTED_SKILLS = Object.freeze(["court-auction-notice-search", "building-register-search", "real-estate-search", "housing-official-price", "gongsijiga-search"]);
const PROVIDER_STATUSES = new Set(["success", "empty", "failed", "needs_identifier", "needs_selection"]);
const PATCH_KEYS = new Set([
  "case_number", "court", "auction_datetime", "region_sido", "region_sigungu", "region_dong",
  "address", "property_type", "appraisal_price", "minimum_bid", "auction_outcome",
  "auction_result_date", "winning_bid_price"
]);
const TEXT_PATCH_KEYS = new Set(["case_number", "court", "auction_datetime", "region_sido", "region_sigungu", "region_dong", "address", "property_type", "auction_outcome", "auction_result_date"]);
const NUMBER_PATCH_KEYS = new Set(["appraisal_price", "minimum_bid", "winning_bid_price"]);

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
    if (typeof value === "object" || typeof value === "boolean") throw new Error(`${key} 값 형식이 올바르지 않습니다.`);
    if (TEXT_PATCH_KEYS.has(key)) assertText(value, `candidate_patch.${key}`);
    if (NUMBER_PATCH_KEYS.has(key)) {
      const numeric = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(numeric) || numeric < 0 || (typeof value === "string" && !/^\d+(?:\.\d+)?$/u.test(value.trim()))) throw new Error(`${key}는 0 이상의 유한한 숫자여야 합니다.`);
    }
    result[key] = value;
  });
  if (result.auction_result_date) assertDate(result.auction_result_date, "candidate_patch.auction_result_date");
  if (result.auction_outcome && !new Set(["won", "lost", "skipped"]).has(result.auction_outcome)) throw new Error("auction_outcome 값이 올바르지 않습니다.");
  return Object.freeze(result);
}
function validateProvider(provider, label) {
  assertAllowedKeys(provider, new Set(["status", "source_url", "fetched_at", "raw_path", "raw_sha256", "warnings", "error_code", "message", "match_verified", "match_scope", "match_method", "match_reason", "transport"]), label);
  if (!PROVIDER_STATUSES.has(provider.status)) throw new Error(`${label}.status가 올바르지 않습니다.`);
  if (provider.source_url) assertUrl(provider.source_url, `${label}.source_url`);
  if (provider.fetched_at) assertDate(provider.fetched_at, `${label}.fetched_at`);
  if (provider.raw_path) { assertText(provider.raw_path, `${label}.raw_path`); if (!provider.raw_path.startsWith("raw/") || provider.raw_path.includes("..") || provider.raw_path.startsWith("/")) throw new Error(`${label}.raw_path가 캐시 경계를 벗어납니다.`); }
  if (provider.raw_sha256 && !/^[a-f0-9]{64}$/u.test(provider.raw_sha256)) throw new Error(`${label}.raw_sha256가 올바르지 않습니다.`);
  if (!Array.isArray(provider.warnings)) throw new Error(`${label}.warnings는 배열이어야 합니다.`);
  if (provider.match_verified !== undefined && typeof provider.match_verified !== "boolean") throw new Error(`${label}.match_verified는 boolean이어야 합니다.`);
  if (provider.match_scope !== undefined) assertText(provider.match_scope, `${label}.match_scope`);
  if (provider.match_method !== undefined) assertText(provider.match_method, `${label}.match_method`);
  if (provider.match_reason !== undefined) assertText(provider.match_reason, `${label}.match_reason`);
  if (provider.transport !== undefined && !new Set(["direct", "proxy"]).has(provider.transport)) throw new Error(`${label}.transport가 올바르지 않습니다.`);
  if (provider.status === "success" || provider.status === "empty") {
    assertText(provider.raw_path, `${label}.raw_path`);
    assertText(provider.raw_sha256, `${label}.raw_sha256`);
  }
}
function validateCandidateSources(resolution, candidatePatch, providerMetadata) {
  if (!isObject(resolution.candidate_sources)) throw new Error("match_resolution.candidate_sources가 객체가 아닙니다.");
  const patchKeys = Object.keys(candidatePatch || {});
  Object.keys(resolution.candidate_sources).forEach((key) => {
    if (!PATCH_KEYS.has(key)) throw new Error(`match_resolution.candidate_sources에 허용되지 않은 필드가 있습니다: ${key}`);
    const sources = resolution.candidate_sources[key];
    if (!Array.isArray(sources) || sources.length === 0 || sources.some((provider) => !PROVIDERS.includes(provider))) throw new Error(`match_resolution.candidate_sources.${key}가 올바르지 않습니다.`);
    if (!patchKeys.includes(key)) throw new Error(`match_resolution.candidate_sources.${key}에 대응하는 후보 필드가 없습니다.`);
    if (!sources.some((provider) => resolution.providers[provider]?.match_verified === true && providerMetadata?.[provider]?.match_verified === true)) throw new Error(`candidate_patch.${key}는 매칭 검증을 통과한 source가 없습니다.`);
  });
  patchKeys.forEach((key) => {
    const sources = resolution.candidate_sources[key];
    if (!Array.isArray(sources) || sources.length === 0) throw new Error(`candidate_patch.${key}의 source 매칭 정보가 없습니다.`);
  });
}
function validateMatchResolution(resolution, candidatePatch, providerMetadata) {
  if (resolution === undefined || resolution === null) throw new Error("match_resolution이 필요합니다.");
  assertAllowedKeys(resolution, new Set(["schema_version", "normalized_input", "resolution_method", "selected_identity", "candidate_list", "provider_query_identity", "query_fingerprint", "match_verified", "evidence_refs", "providers", "candidate_sources"]), "match_resolution");
  if (resolution.schema_version !== 1) throw new Error("match_resolution.schema_version은 1이어야 합니다.");
  ["normalized_input", "selected_identity", "provider_query_identity"].forEach((key) => { if (!isObject(resolution[key])) throw new Error(`match_resolution.${key}가 객체가 아닙니다.`); });
  assertText(resolution.resolution_method, "match_resolution.resolution_method");
  if (!Array.isArray(resolution.candidate_list) || !Array.isArray(resolution.evidence_refs)) throw new Error("match_resolution 배열 형식이 올바르지 않습니다.");
  if (!/^[a-f0-9]{64}$/u.test(resolution.query_fingerprint || "")) throw new Error("match_resolution.query_fingerprint가 올바르지 않습니다.");
  if (typeof resolution.match_verified !== "boolean") throw new Error("match_resolution.match_verified는 boolean이어야 합니다.");
  assertAllowedKeys(resolution.providers, new Set(PROVIDERS), "match_resolution.providers");
  PROVIDERS.forEach((provider) => {
    const item = resolution.providers[provider];
    assertAllowedKeys(item, new Set(["status", "method", "scope", "query", "selected", "candidates", "match_verified", "reason", "transport"]), `match_resolution.providers.${provider}`);
    assertText(item.status, `match_resolution.providers.${provider}.status`);
    assertText(item.method, `match_resolution.providers.${provider}.method`);
    if (item.scope !== undefined) assertText(item.scope, `match_resolution.providers.${provider}.scope`);
    if (item.query !== undefined && !isObject(item.query)) throw new Error(`match_resolution.providers.${provider}.query가 객체가 아닙니다.`);
    if (item.selected !== undefined && !isObject(item.selected)) throw new Error(`match_resolution.providers.${provider}.selected가 객체가 아닙니다.`);
    if (item.candidates !== undefined && !Array.isArray(item.candidates)) throw new Error(`match_resolution.providers.${provider}.candidates가 배열이 아닙니다.`);
    if (item.match_verified !== undefined && typeof item.match_verified !== "boolean") throw new Error(`match_resolution.providers.${provider}.match_verified가 boolean이 아닙니다.`);
    if (item.reason !== undefined) assertText(item.reason, `match_resolution.providers.${provider}.reason`);
  });
  validateCandidateSources(resolution, candidatePatch, providerMetadata);
}
function validatePackage(pkg) {
  assertAllowedKeys(pkg, new Set(["schema_version", "package_id", "case_key", "observed_at", "query_identity", "collector", "providers", "candidate_patch", "evidence", "errors", "match_resolution"]), "package");
  if (pkg.schema_version !== SCHEMA_VERSION) throw new Error(`schema_version은 ${SCHEMA_VERSION}이어야 합니다.`);
  ["package_id", "case_key"].forEach((key) => { assertText(pkg[key], `package.${key}`); if (/[\\/]/u.test(pkg[key])) throw new Error(`package.${key}에 경로 구분자가 들어갈 수 없습니다.`); });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(clean(pkg.observed_at))) throw new Error("package.observed_at은 UTC ISO 형식이어야 합니다.");
  assertDate(pkg.observed_at, "package.observed_at");
  assertAllowedKeys(pkg.query_identity, new Set(["object_path", "object_fingerprint", "case_number", "court", "court_code", "address", "normalized_address", "road_address", "lot_address", "lot_number", "pnu", "region_sido", "region_sigungu", "region_dong", "lawd_cd", "property_type", "building_name", "building_dong", "unit_number", "apt_code", "apt_notice_date", "dong_code", "ho_code"]), "query_identity");
  assertText(pkg.query_identity.object_path, "query_identity.object_path");
  if (pkg.query_identity.object_path.startsWith("/") || pkg.query_identity.object_path.includes("..")) throw new Error("query_identity.object_path가 Vault 상대 경로가 아닙니다.");
  if (!/^[a-f0-9]{64}$/u.test(pkg.query_identity.object_fingerprint || "")) throw new Error("query_identity.object_fingerprint가 올바르지 않습니다.");
  assertText(pkg.query_identity.case_number, "query_identity.case_number");
  assertAllowedKeys(pkg.collector, new Set(["k_skill_repository", "k_skill_commit", "package_version", "selected_skills"]), "collector");
  assertUrl(pkg.collector.k_skill_repository, "collector.k_skill_repository");
  if (!/^[a-f0-9]{40}$/u.test(pkg.collector.k_skill_commit)) throw new Error("collector.k_skill_commit은 Git SHA여야 합니다.");
  assertText(pkg.collector.package_version, "collector.package_version");
  if (!Array.isArray(pkg.collector.selected_skills) || pkg.collector.selected_skills.length !== SELECTED_SKILLS.length || JSON.stringify([...pkg.collector.selected_skills].sort()) !== JSON.stringify([...SELECTED_SKILLS].sort())) throw new Error("collector.selected_skills가 완전하지 않습니다.");
  assertAllowedKeys(pkg.providers, new Set(PROVIDERS), "providers");
  PROVIDERS.forEach((provider) => validateProvider(pkg.providers[provider], `providers.${provider}`));
  normalizePatch(pkg.candidate_patch);
  if (!isObject(pkg.evidence) || !Array.isArray(pkg.errors)) throw new Error("evidence 또는 errors 형식이 올바르지 않습니다.");
  validateMatchResolution(pkg.match_resolution, pkg.candidate_patch, pkg.providers);
  pkg.errors.forEach((error, index) => { assertAllowedKeys(error, new Set(["provider", "code", "message"]), `errors[${index}]`); assertText(error.provider, `errors[${index}].provider`); assertText(error.code, `errors[${index}].code`); assertText(error.message, `errors[${index}].message`); });
  return true;
}
function canApplyCandidatePatch(pkg, keys) {
  const selected = Array.isArray(keys) ? keys : Object.keys(pkg?.candidate_patch || {});
  const errors = [];
  if (!pkg?.match_resolution?.candidate_sources || !isObject(pkg.match_resolution.providers)) return { ok: false, errors: ["candidate source 매칭 정보가 없습니다."] };
  selected.forEach((key) => {
    if (!PATCH_KEYS.has(key)) errors.push(`${key}는 승인 가능한 필드가 아닙니다.`);
    if (pkg.candidate_patch?.[key] === undefined || pkg.candidate_patch?.[key] === null || pkg.candidate_patch?.[key] === "") errors.push(`${key} 후보 값이 없습니다.`);
    const sources = pkg.match_resolution.candidate_sources[key];
    if (!Array.isArray(sources) || !sources.some((provider) => pkg.match_resolution.providers[provider]?.match_verified === true && pkg.providers?.[provider]?.match_verified === true)) errors.push(`${key}는 exact identity가 검증된 source가 없습니다.`);
  });
  return { ok: errors.length === 0, errors };
}
function buildPackage(input) {
  const pkg = Object.assign({}, input, { schema_version: SCHEMA_VERSION, candidate_patch: normalizePatch(input.candidate_patch || {}) });
  validatePackage(pkg);
  return Object.freeze(pkg);
}

module.exports = Object.freeze({ SCHEMA_VERSION, PROVIDERS, SELECTED_SKILLS, PROVIDER_STATUSES, PATCH_KEYS, buildPackage, canApplyCandidatePatch, normalizePatch, safeCaseKey, sha256, validateMatchResolution, validatePackage, verifyRawDigest });
