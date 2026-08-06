#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const core = require("./real-estate-source-package-core.js");
const identityCore = require("./real-estate-source-identity-core.js");

const LOCK_PATH = path.resolve(__dirname, "../CONFIG/k-skill-real-estate-lock.json");
const CACHE_ROOT = "SYSTEM/CACHE/real-estate-source-packages";
const KSKILL_REPOSITORY = "https://github.com/NomaDamas/k-skill";
const PROVIDER_FILES = Object.freeze({
  court: "court-auction.json",
  building: "building-register.json",
  transactions: "real-estate-transactions.json",
  "official-price": "housing-official-price.json",
  "land-price": "land-price.json"
});

function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
function nowIso() { return new Date().toISOString(); }
function validateObservedAt(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) || Number.isNaN(Date.parse(text))) throw new Error("observed_at은 UTC ISO 형식이어야 합니다.");
  return text;
}
function parseScalar(block, key) {
  const match = String(block).match(new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, "mu"));
  if (!match) return "";
  return match[1].replace(/^['"]|['"]$/gu, "").trim();
}
function readAuctionObject(objectPath) {
  const content = fs.readFileSync(objectPath, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u);
  if (!match) throw new Error("Auction Object의 YAML Frontmatter를 찾을 수 없습니다.");
  const block = match[1];
  if (parseScalar(block, "type") !== "auction_case") throw new Error("대상 파일이 auction_case Object가 아닙니다.");
  const result = {};
  ["case_number", "court", "court_code", "auction_datetime", "region_sido", "region_sigungu", "region_dong", "address", "road_address", "land_address", "land_parcel_id", "pnu", "property_type", "appraisal_price", "minimum_bid", "item_number", "building_name", "complex_name", "building_dong", "dong_number", "unit_number", "unit", "ho_number", "ho", "apt_code", "apt_notice_date", "dong_code", "ho_code"].forEach((key) => {
    const value = parseScalar(block, key);
    if (value) result[key] = value;
  });
  result.object_path = objectPath;
  return result;
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function resolveCasePath(vaultRoot, candidate) {
  const resolved = path.resolve(vaultRoot, candidate);
  if (!fs.existsSync(resolved)) throw new Error("--case는 Vault 안의 기존 파일이어야 합니다.");
  const realResolved = fs.realpathSync(resolved);
  if (!inside(vaultRoot, realResolved)) throw new Error("--case는 Vault 안의 기존 파일이어야 합니다.");
  return realResolved;
}
function readLock(lockPath = LOCK_PATH) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (lock.schema_version !== 1 || lock.repository !== KSKILL_REPOSITORY || !/^[a-f0-9]{40}$/u.test(lock.commit)) throw new Error("k-skill 잠금 manifest가 올바르지 않습니다.");
  if (!lock.cli_package || !lock.cli_package.name || !lock.cli_package.version) throw new Error("k-skill CLI 버전이 잠겨 있지 않습니다.");
  const selectedSkills = Object.keys(lock.selected_skills || {});
  if (selectedSkills.length !== core.SELECTED_SKILLS.length || JSON.stringify([...selectedSkills].sort()) !== JSON.stringify([...core.SELECTED_SKILLS].sort())) throw new Error("k-skill 선택 목록이 5개 skill과 일치하지 않습니다.");
  for (const skill of core.SELECTED_SKILLS) {
    const hashes = lock.selected_skills[skill];
    if (!hashes || !/^[a-f0-9]{64}$/u.test(hashes.skill_json_sha256 || "") || !/^[a-f0-9]{64}$/u.test(hashes.instruction_sha256 || "")) throw new Error(`k-skill ${skill} 파일 해시가 잠겨 있지 않습니다.`);
  }
  return lock;
}
function installPackage(packageSpec) {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-real-estate-") );
  const result = spawnSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--prefix", prefix, packageSpec], { encoding: "utf8", timeout: 180000 });
  if (result.error || result.status !== 0) { fs.rmSync(prefix, { recursive: true, force: true }); throw new Error(`${packageSpec} 설치 실패: ${clean(result.stderr) || result.error?.message || "알 수 없는 오류"}`); }
  return { prefix, require: createRequire(path.join(prefix, "package.json")) };
}
function verifyKSkillFiles(lock, packageRoot) {
  for (const skill of Object.keys(lock.selected_skills || {})) {
    const expected = lock.selected_skills[skill];
    for (const file of ["skill_json_sha256", "instruction_sha256"]) {
      const relative = file === "skill_json_sha256" ? "skill.json" : "instruction.md";
      const target = path.join(packageRoot, "skills", skill, relative);
      if (!fs.existsSync(target) || core.sha256(fs.readFileSync(target)) !== expected[file]) throw new Error(`k-skill ${skill}/${relative} 해시가 잠금 manifest와 다릅니다.`);
    }
  }
}
function installKSkillCli(lock) {
  const installed = installPackage(`${lock.cli_package.name}@${lock.cli_package.version}`);
  const packageRoot = installed.require.resolve(`${lock.cli_package.name}/package.json`).replace(/\/package\.json$/u, "");
  verifyKSkillFiles(lock, packageRoot);
  return { bin: path.join(packageRoot, "bin", "k-skill.js"), packageRoot, prefix: installed.prefix };
}
const CHILD_ENV_KEYS = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "NO_COLOR", "NODE_ENV", "PRODIGY_REAL_ESTATE_ALLOW_PROXY", "KSKILL_PROXY_BASE_URL", "KSKILL_API_KEY", "DATA_GO_KR_API_KEY", "DATA_GO_KR_SERVICE_KEY", "REALTY_PRICE_API_KEY"]);
function runKSkillScript(cli, skill, script, args, env) {
  const childEnv = {};
  CHILD_ENV_KEYS.forEach((key) => { if (process.env[key] !== undefined) childEnv[key] = process.env[key]; });
  Object.entries(env || {}).forEach(([key, value]) => { if (CHILD_ENV_KEYS.has(key)) childEnv[key] = String(value); });
  const result = spawnSync(process.execPath, [cli.bin, "exec", skill, script, "--", ...args], { encoding: "utf8", env: childEnv, timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error(`${skill} 실행 실패: ${clean(result.stderr) || result.error?.message || "알 수 없는 오류"}`);
  try { return JSON.parse(result.stdout); } catch (_error) { const error = new Error(`${skill} 응답이 JSON이 아닙니다.`); error.raw = "[NON_JSON_RESPONSE]"; throw error; }
}
function installAndLoad(packageName, version) {
  const installed = installPackage(`${packageName}@${version}`);
  return { module: installed.require(packageName), prefix: installed.prefix };
}
function pnuOf(record) {
  const candidate = clean(record.pnu || record.land_parcel_id);
  return /^\d{19}$/u.test(candidate) ? candidate : "";
}
function firstItem(payload) { return Array.isArray(payload?.items) ? payload.items[0] || null : null; }
function normalizeAddress(record, payload) {
  const item = firstItem(payload) || {};
  return clean(item.address || item.platPlc || item.newPlatPlc || record.address);
}
function regionFromAddress(address) {
  const parts = clean(address).split(/\s+/u).filter(Boolean);
  return { region_sido: parts.find((value) => /(?:특별시|광역시|자치시|자치도|도)$/u.test(value)) || "", region_sigungu: parts.find((value) => /(?:시|군|구)$/u.test(value) && !/(?:특별시|광역시|자치시)$/u.test(value)) || "", region_dong: parts.find((value) => /(?:동|읍|면|리)$/u.test(value)) || "" };
}
function providerMeta(status, sourceUrl, raw, warnings, error, match) {
  const rawText = serializeRaw(raw ?? null);
  const result = { status, source_url: sourceUrl, fetched_at: nowIso(), raw_sha256: core.sha256(rawText), warnings: (warnings || []).map((warning) => clean(redactSensitive(warning))) };
  if (error) { result.error_code = error.code || "PROVIDER_ERROR"; result.message = clean(redactSensitive(error.message || String(error))); }
  if (match) {
    result.match_verified = match.match_verified === true;
    if (match.scope) result.match_scope = match.scope;
    if (match.method) result.match_method = match.method;
    if (match.reason) result.match_reason = match.reason;
    if (match.transport) result.transport = match.transport;
  }
  return result;
}
const SENSITIVE_KEY = /(?:secret|token|password|cookie|authorization|api[_-]?key)/iu;
function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(item)]));
  if (typeof value === "string") return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]");
  return value;
}
function serializeRaw(value) {
  const text = `${JSON.stringify(redactSensitive(value), null, 2)}\n`;
  if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("공급자 원문이 허용된 크기를 초과했습니다.");
  return text;
}
function normalizeCourt(record, payload) {
  if (!payload || payload.found === false) return { status: "empty", candidate: {}, evidence: { result: null }, raw: payload, source_url: "https://www.courtauction.go.kr" };
  const item = firstItem(payload) || {};
  const schedule = Array.isArray(payload.schedule) ? payload.schedule : [];
  const latest = schedule[schedule.length - 1] || {};
  const result = Object.assign({}, item, latest, payload.caseInfo || {});
  const explicitOutcome = clean(result.auctionOutcome || result.outcome || result.result).toLowerCase();
  const candidate = {
    case_number: result.userCaseNumber || result.printCaseNumber || result.printCsNo || record.case_number,
    court: result.courtName || record.court,
    address: result.address || record.address,
    property_type: result.usage || record.property_type,
    appraisal_price: result.appraisedPrice || result.appraisalPrice,
    minimum_bid: result.minimumSalePrice || result.minimumBid,
    auction_datetime: result.saleDate || result.auctionDate || result.dspslDxdyYmd,
    auction_outcome: ["won", "lost", "skipped"].includes(explicitOutcome) ? explicitOutcome : undefined,
    auction_result_date: result.resultDate || result.saleResultDate,
    winning_bid_price: result.winningBidPrice || result.salePrice || result.resultPrice
  };
  return { status: Object.keys(candidate).some((key) => candidate[key]) ? "success" : "empty", candidate, evidence: { case_info: payload.caseInfo || null, schedule }, raw: payload, source_url: "https://www.courtauction.go.kr" };
}
function deriveCourtParcelSelection(record, payload) {
  const data = payload?.raw?.data || payload?.data || {};
  const primary = Array.isArray(data.dlt_rletCsDspslObjctLst) ? data.dlt_rletCsDspslObjctLst : [];
  const fallback = Array.isArray(data.dlt_dstrtDemnLstprdDts) ? data.dlt_dstrtDemnLstprdDts : [];
  let rows = primary.length ? primary : fallback;
  const itemNumber = clean(record?.item_number);
  if (itemNumber) rows = rows.filter((row) => clean(row.dspslObjctSeq || row.itemSeq) === itemNumber);
  if (rows.length !== 1) return {};
  const row = rows[0];
  const legalCodeParts = [clean(row.rprsAdongSdCd), clean(row.rprsAdongSggCd), clean(row.rprsAdongEmdCd), clean(row.rprsAdongRiCd || "00")];
  const legalCode = legalCodeParts.join("");
  const lot = identityCore.parseLotToken(row.rprsLtnoAddr);
  const pnu = /^\d{10}$/u.test(legalCode) && lot
    ? `${legalCode}${lot.mountain ? "2" : "1"}${lot.main.padStart(4, "0")}${lot.sub.padStart(4, "0")}`
    : "";
  const lotAddress = lot ? [row.adongSdNm, row.adongSggNm, row.adongEmdNm, row.adongRiNm, lot.text].map(clean).filter(Boolean).join(" ") : "";
  const unitMatch = clean(row.bldDtlDts).replace(/\s+/gu, "").match(/(\d+(?:-\d+)?)호/u);
  return Object.fromEntries(Object.entries({
    pnu,
    lot_address: lotAddress,
    building_name: clean(row.bldNm),
    unit_number: unitMatch ? unitMatch[1] : "",
    lawd_cd: /^\d{10}$/u.test(legalCode) ? legalCode.slice(0, 5) : ""
  }).filter(([, value]) => value));
}
function normalizeBuilding(record, payload) {
  const item = firstItem(payload) || {};
  if (!item || Object.keys(item).length === 0) return { status: "empty", candidate: {}, evidence: { records: [] }, raw: payload, source_url: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo" };
  return { status: "success", candidate: { address: normalizeAddress(record, payload), property_type: item.mainPurpsCdNm || undefined }, evidence: { records: [item] }, raw: payload, source_url: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo" };
}
function normalizeTransactions(payload) { const items = Array.isArray(payload?.items) ? payload.items : []; return { status: items.length ? "success" : "empty", candidate: {}, evidence: { items, summary: payload?.summary || null, query: payload?.query || null }, raw: payload, source_url: "https://k-skill-proxy.nomadamas.org/v1/real-estate" }; }
function normalizeOfficialPrice(payload) { const history = Array.isArray(payload?.history) ? payload.history : []; return { status: history.length ? "success" : "empty", candidate: {}, evidence: { status: payload?.status || null, selected: payload?.selected || null, history, source: payload?.source || null }, raw: payload, source_url: "https://www.realtyprice.kr" }; }
function normalizeLandPrice(payload) { const history = Array.isArray(payload?.history) ? payload.history : []; return { status: payload?.latest || history.length ? "success" : "empty", candidate: {}, evidence: { address: payload?.address || null, latest: payload?.latest || null, history, yoy_change_pct: payload?.yoy_change_pct ?? null }, raw: payload, source_url: payload?.source_url || "https://www.realtyprice.kr/notice/gsindividual/search.htm" }; }
async function lookupLandPriceByIdentity(identity, land) {
  const pnu = identityCore.validPnu(identity?.pnu);
  const parts = pnu.match(/^(\d{8})(\d{2})([12])(\d{4})(\d{4})$/u);
  if (!parts || typeof land?.fetchGsiSearchList !== "function") return land.lookupGongsijiga(identity.parcel_query_address);
  const main = String(Number(parts[4]));
  const sub = Number(parts[5]) ? String(Number(parts[5])) : "";
  const san = parts[3] === "2";
  const rows = await land.fetchGsiSearchList({ regCode: parts[1].slice(0, 5), eubCode: parts[1], san, bun1: main, bun2: sub });
  const history = rows.map((row) => land.normalizeSearchResult(row));
  const base = history.length
    ? land.buildResponse({ address: identity.parcel_query_address, jibun: sub ? `${main}-${sub}번지` : `${main}번지`, san, history })
    : { address: identity.parcel_query_address, jibun: sub ? `${main}-${sub}번지` : `${main}번지`, san, latest: null, history: [], yoy_change_pct: null, source_url: "https://www.realtyprice.kr/notice/gsindividual/search.htm" };
  return Object.assign({}, base, { pnu, query: { pnu, address: identity.parcel_query_address } });
}
async function httpJson(url, options = {}) {
  const attempts = Number.isInteger(options.attempts) ? Math.max(1, Math.min(options.attempts, 3)) : 2;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "ProdigyOS-real-estate-source/1.0" }, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`외부 조회가 HTTP ${response.status}로 실패했습니다.`); error.retryable = response.status === 429 || response.status >= 500; throw error;
      }
      try { return JSON.parse(text); } catch (_error) { const error = new Error("외부 응답이 JSON이 아닙니다."); error.raw = "[REDACTED_RESPONSE]"; throw error; }
    } catch (error) {
      lastError = error;
      if (!error.retryable && error.name !== "AbortError") throw error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally { clearTimeout(timer); }
  }
  throw lastError || new Error("외부 조회가 실패했습니다.");
}
function proxyBaseUrl() {
  const value = clean(process.env.KSKILL_PROXY_BASE_URL || "https://k-skill-proxy.nomadamas.org").replace(/\/$/u, "");
  let parsed;
  try { parsed = new URL(value); } catch (_error) { throw new Error("k-skill 프록시 URL이 올바르지 않습니다."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hostname !== "k-skill-proxy.nomadamas.org") throw new Error("허용되지 않은 k-skill 프록시 URL입니다.");
  return value;
}
function buildingProxyUrl(identity, baseUrl = proxyBaseUrl()) {
  const pnu = identityCore.validPnu(identity?.pnu);
  if (!pnu) return "";
  return `${clean(baseUrl).replace(/\/$/u, "")}/v1/building-register/title?pnu=${encodeURIComponent(pnu)}`;
}
function recentMonths(count) {
  const result = []; const date = new Date(); date.setUTCDate(1);
  for (let index = 0; index < count; index += 1) { result.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`); date.setUTCMonth(date.getUTCMonth() - 1); }
  return result;
}
function resultWithMatch(result, match) { return Object.assign({}, result, { match: Object.assign({}, match || {}, result.match || {}) }); }
function unresolvedResult(status, match, sourceUrl, warning, evidence) { return { status, candidate: {}, evidence: evidence || {}, raw: { status, match, warning }, source_url: sourceUrl, warnings: [warning], match }; }
function verifiedResult(name, result, record, identity, payload, query, plan) {
  const verification = identityCore.verifyReturnedIdentity(name, identity, payload, query);
  const match = Object.assign({}, plan, { query: query || plan?.query || {}, match_verified: verification.match_verified, reason: verification.reason, scope: verification.scope || plan?.scope });
  if (!verification.match_verified && result.status === "success") {
    const error = new Error(`${identityCore.clean(name)} 공급자가 반환한 식별자가 선택한 물건과 일치하지 않습니다.`);
    error.code = "IDENTITY_MISMATCH";
    return { status: "failed", candidate: {}, evidence: result.evidence || {}, raw: payload, source_url: result.source_url, warnings: ["공급자 반환 식별자가 선택한 물건과 일치하지 않아 후보 생성을 차단했습니다."], error, match };
  }
  return resultWithMatch(result, match);
}
async function liveProvider(name, record, dependencies, identityContext) {
  const identity = identityContext.identity;
  const directOrProxy = process.env.PRODIGY_REAL_ESTATE_ALLOW_PROXY === "1" ? "proxy" : "direct";
  const sourceUrls = { court: "https://www.courtauction.go.kr", building: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo", transactions: "https://k-skill-proxy.nomadamas.org/v1/real-estate", "official-price": "https://www.realtyprice.kr", "land-price": "https://www.realtyprice.kr/notice/gsindividual/search.htm" };
  if (name === "court") {
    const court = dependencies.court;
    let plan = identityCore.providerPlan(name, identity);
    if (plan.status !== "resolved" && court?.getCourtCodes) {
      const codes = await court.getCourtCodes();
      const rows = codes.items || codes.courts || codes.rows || [];
      plan = identityCore.resolveCourtCode(record, rows);
      if (plan.status === "resolved") {
        identity.court_code = plan.selected.court_code;
        identity.court_code_source = plan.method;
        plan = Object.assign({}, plan, { query: { court_code: identity.court_code, case_number: identity.case_number } });
      }
    }
    if (plan.status !== "resolved") return unresolvedResult(plan.status, plan, sourceUrls.court, plan.reason || "법원사무소 코드와 사건번호가 필요합니다.", { candidates: plan.candidates || [] });
    const payload = await court.getCaseByCaseNumber({ courtCode: identity.court_code, caseNumber: identity.case_number, includeRaw: true });
    const normalized = normalizeWithRaw((value) => normalizeCourt(record, value), payload);
    if (normalized.status === "empty") return resultWithMatch(normalized, Object.assign({}, plan, { match_verified: true, reason: "case_query_empty" }));
    return verifiedResult(name, normalized, record, identity, payload, plan.query, plan);
  }
  if (name === "building") {
    const queryAddress = identity.road_address || identity.parcel_query_address || identity.address;
    if (!identity.pnu && directOrProxy !== "proxy") return unresolvedResult("needs_selection", identityCore.providerPlan(name, identity), sourceUrls.building, "건축물대장 공식 직접 조회에는 19자리 PNU가 필요합니다.");
    let payload;
    if (directOrProxy === "proxy" && identity.pnu) {
      payload = await httpJson(buildingProxyUrl(identity));
    } else {
      const args = ["title", identity.pnu ? "--pnu" : "--address", identity.pnu || queryAddress, "--json"];
      if (directOrProxy === "proxy") args.push("--proxy-base-url", proxyBaseUrl()); else args.push("--direct");
      payload = runKSkillScript(dependencies.cli, "building-register-search", "scripts/building_register.py", args);
    }
    const normalized = normalizeWithRaw((value) => normalizeBuilding(record, value), payload);
    if (normalized.status === "empty") return resultWithMatch(normalized, Object.assign({}, identityCore.providerPlan(name, identity), { match_verified: true, transport: directOrProxy, reason: "parcel_query_empty" }));
    return verifiedResult(name, normalized, record, identity, payload, identityCore.providerPlan(name, identity).query, Object.assign({}, identityCore.providerPlan(name, identity), { transport: directOrProxy }));
  }
  if (name === "transactions") {
    const plan = identityCore.providerPlan(name, identity);
    if (plan.status !== "resolved") return unresolvedResult(plan.status, plan, sourceUrls.transactions, plan.reason || "실거래 조회에 시·군·구가 필요합니다.");
    if (directOrProxy !== "proxy") return unresolvedResult("needs_identifier", Object.assign({}, plan, { method: "proxy_opt_in_required", reason: "실거래 비교는 명시적인 프록시 허용 후 실행합니다." }), sourceUrls.transactions, "실거래 k-skill 프록시는 PRODIGY_REAL_ESTATE_ALLOW_PROXY=1일 때만 사용합니다.");
    const base = proxyBaseUrl();
    let lawd = clean(identity.lawd_cd);
    if (!lawd) {
      const codePayload = await httpJson(`${base}/v1/real-estate/region-code?q=${encodeURIComponent(identity.region_sigungu)}`);
      const rows = Array.isArray(codePayload.results) ? codePayload.results : [];
      const exact = rows.filter((row) => identityCore.compareText(row.name).endsWith(identityCore.compareText(identity.region_sigungu)));
      if (exact.length !== 1) return unresolvedResult("needs_selection", Object.assign({}, plan, { method: "region_code_selection", candidates: rows.slice(0, 20), reason: "시·군·구 법정동 코드를 하나로 확정하지 못했습니다." }), `${base}/v1/real-estate/region-code`, "시·군·구 법정동 코드를 하나로 확정하지 못했습니다.", { candidates: rows });
      lawd = clean(exact[0].lawd_cd);
    }
    if (!/^\d{5}$/u.test(lawd)) return unresolvedResult("needs_selection", Object.assign({}, plan, { method: "region_code_selection", reason: "법정동 코드 형식을 확인해야 합니다." }), `${base}/v1/real-estate/region-code`, "법정동 코드 형식을 확인해야 합니다.");
    const assetType = /아파트|공동주택/u.test(identity.property_type) ? "apartment" : /오피스텔/u.test(identity.property_type) ? "officetel" : /상가|상업/u.test(identity.property_type) ? "commercial" : /빌라|연립|다세대/u.test(identity.property_type) ? "villa" : "single-house";
    const months = recentMonths(3);
    const responses = await Promise.all(months.map(async (month) => httpJson(`${base}/v1/real-estate/${assetType}/trade?lawd_cd=${lawd}&deal_ymd=${month}`)));
    const payload = { items: responses.flatMap((response) => response.items || []), summary: { sample_count: responses.reduce((sum, response) => sum + Number(response.summary?.sample_count || response.items?.length || 0), 0) }, query: { asset_type: assetType, deal_type: "trade", lawd_cd: lawd, months } };
    const normalized = normalizeWithRaw(normalizeTransactions, payload);
    return verifiedResult(name, normalized, record, identity, payload, payload.query, Object.assign({}, plan, { query: payload.query, transport: directOrProxy, scope: "region_comparison", method: "region_code_exact" }));
  }
  if (name === "official-price") {
    const plan = identityCore.providerPlan(name, identity);
    if (!identity.is_apartment) {
      if (!identity.pnu) return unresolvedResult(plan.status, plan, sourceUrls["official-price"], plan.reason || "개별주택 공시가격 조회에 PNU가 필요합니다.");
      const payload = await dependencies.housing.lookupIndividualHousePriceByPnu(identity.pnu);
      const normalized = normalizeWithRaw(normalizeOfficialPrice, payload);
      if (normalized.status === "empty") return resultWithMatch(normalized, Object.assign({}, plan, { match_verified: true, reason: "pnu_query_empty" }));
      return verifiedResult(name, normalized, record, identity, payload, plan.query, plan);
    }
    if (!identity.building_name) return unresolvedResult("needs_selection", plan, sourceUrls["official-price"], "공동주택 단지명을 선택해야 합니다.");
    let candidate = identity.apt_code ? { aptCode: identity.apt_code, noticeDate: identity.apt_notice_date, complexName: identity.building_name } : null;
    let candidatePayload = null;
    if (!candidate) {
      candidatePayload = await dependencies.housing.searchApartmentCandidates({ complexName: identity.building_name });
      const candidates = Array.isArray(candidatePayload?.candidates) ? candidatePayload.candidates : [];
      if (candidates.length !== 1) return unresolvedResult("needs_selection", Object.assign({}, plan, { method: "apartment_candidate_selection", candidates: candidates.slice(0, 20), reason: candidates.length ? "공동주택 후보를 하나로 선택해야 합니다." : "공동주택 후보를 찾지 못했습니다." }), sourceUrls["official-price"], candidates.length ? "공동주택 후보를 하나로 선택해야 합니다." : "공동주택 후보를 찾지 못했습니다.", { candidates });
      candidate = candidates[0];
      identity.apt_code = clean(candidate.aptCode);
      identity.apt_notice_date = clean(candidate.noticeDate);
    }
    if (!identity.building_dong || !identity.unit_number) return unresolvedResult("needs_selection", Object.assign({}, plan, { method: "apartment_unit_selection", selected: { candidate, building_dong: identity.building_dong, unit_number: identity.unit_number }, reason: "공동주택 동·호를 선택해야 합니다." }), sourceUrls["official-price"], "공동주택 동·호를 선택해야 합니다.", { candidate });
    let payload;
    try {
      payload = await dependencies.housing.lookupApartmentOfficialPrice({ candidate, dongCode: identity.dong_code || undefined, dongName: identity.building_dong, hoCode: identity.ho_code || undefined, hoName: identity.unit_number });
    } catch (error) {
      if (/AMBIGUOUS|INVALID_SELECTOR/u.test(clean(error.code))) return unresolvedResult("needs_selection", Object.assign({}, plan, { method: "apartment_unit_selection", candidates: error.candidates || [], reason: error.message }), sourceUrls["official-price"], error.message, { candidates: error.candidates || [] });
      throw error;
    }
    const normalized = normalizeWithRaw(normalizeOfficialPrice, payload);
    const resolvedPlan = identityCore.providerPlan(name, identity);
    return verifiedResult(name, normalized, record, identity, payload, { candidate, building_dong: identity.building_dong, unit_number: identity.unit_number }, Object.assign({}, resolvedPlan, { query: { candidate, building_dong: identity.building_dong, unit_number: identity.unit_number } }));
  }
  if (name === "land-price") {
    const plan = identityCore.providerPlan(name, identity);
    if (!identity.parcel_query_address) return unresolvedResult("needs_selection", plan, sourceUrls["land-price"], "개별공시지가 조회에 사용할 지번 필지를 선택해야 합니다.");
    const payload = await lookupLandPriceByIdentity(identity, dependencies.land);
    const normalized = normalizeWithRaw(normalizeLandPrice, payload);
    if (normalized.status === "empty") return resultWithMatch(normalized, Object.assign({}, plan, { match_verified: true, reason: "lot_query_empty" }));
    return verifiedResult(name, normalized, record, identity, payload, { lot_address: identity.parcel_query_address }, plan);
  }
  throw new Error(`지원하지 않는 provider입니다: ${name}`);
}
function normalizeResult(record, result) {
  const address = clean(result.candidate?.address || record.address);
  const addressRegion = regionFromAddress(address);
  const region = Object.assign({}, addressRegion, { region_sido: result.candidate?.region_sido || record.region_sido || addressRegion.region_sido, region_sigungu: result.candidate?.region_sigungu || record.region_sigungu || addressRegion.region_sigungu, region_dong: result.candidate?.region_dong || record.region_dong || addressRegion.region_dong });
  const candidate = Object.assign({}, result.candidate, region);
  Object.keys(candidate).forEach((key) => { if (candidate[key] === undefined || candidate[key] === "") delete candidate[key]; });
  return Object.assign({}, result, { candidate });
}
function normalizeWithRaw(normalizer, payload) {
  try { return normalizer(payload); } catch (error) { error.raw = payload; throw error; }
}
function atomicWrite(target, text) { const temp = `${target}.tmp-${process.pid}`; fs.writeFileSync(temp, text, "utf8"); fs.renameSync(temp, target); }
function writePackage(vaultRoot, record, observedAt, providerResults, lock, identityContext, objectIdentityContext) {
  validateObservedAt(observedAt);
  const caseKey = core.safeCaseKey(record.case_number, record.item_number);
  const packageId = `${caseKey}-${observedAt.replace(/[^0-9TZ]/gu, "")}`;
  const directory = path.join(vaultRoot, CACHE_ROOT, caseKey, observedAt);
  const cacheRoot = path.resolve(vaultRoot, CACHE_ROOT);
  if (!inside(cacheRoot, directory)) throw new Error("조사 패키지 경로가 캐시 경계를 벗어납니다.");
  fs.mkdirSync(path.join(directory, "raw"), { recursive: true });
  const providers = {}; const evidence = {}; const errors = []; const candidatePatch = {}; const candidateSources = {};
  for (const name of core.PROVIDERS) {
    const result = providerResults[name]; const fileName = PROVIDER_FILES[name]; const rawText = serializeRaw(result.raw ?? result); const rawPath = `raw/${fileName}`;
    atomicWrite(path.join(directory, rawPath), rawText);
    const meta = providerMeta(result.status, result.source_url, result.raw ?? result, result.warnings, result.error, result.match);
    meta.raw_path = rawPath; providers[name] = meta; evidence[name] = result.evidence || {};
    if (result.match?.match_verified === true) {
      Object.entries(result.candidate || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        candidatePatch[key] = value;
        candidateSources[key] = [...new Set([...(candidateSources[key] || []), name])];
      });
    }
    if (result.status !== "success" && result.status !== "empty") errors.push({ provider: name, code: result.error?.code || result.status.toUpperCase(), message: clean(redactSensitive((result.warnings || [])[0] || result.error?.message || `${name} 조회를 완료하지 못했습니다.`)) });
  }
  const identity = identityContext.identity;
  const resolutionProviders = Object.fromEntries(core.PROVIDERS.map((name) => [name, providerResults[name].match || identityCore.providerPlan(name, identity)]));
  const matchResolution = identityCore.buildMatchResolution(identityContext, resolutionProviders, candidateSources);
  const pkg = core.buildPackage({ package_id: packageId, case_key: caseKey, observed_at: observedAt, query_identity: { object_path: record.object_path, object_fingerprint: objectIdentityContext?.query_fingerprint || identityContext.query_fingerprint, case_number: identity.case_number, court: identity.court, court_code: identity.court_code, address: clean(record.address), normalized_address: identity.address, road_address: identity.road_address, lot_address: identity.lot_address, lot_number: identity.lot_number, pnu: identity.pnu, region_sido: identity.region_sido, region_sigungu: identity.region_sigungu, region_dong: identity.region_dong, lawd_cd: identity.lawd_cd, property_type: identity.property_type, building_name: identity.building_name, building_dong: identity.building_dong, unit_number: identity.unit_number, apt_code: identity.apt_code, apt_notice_date: identity.apt_notice_date, dong_code: identity.dong_code, ho_code: identity.ho_code }, collector: { k_skill_repository: KSKILL_REPOSITORY, k_skill_commit: lock.commit, package_version: lock.cli_package.version, selected_skills: core.SELECTED_SKILLS.slice() }, providers, match_resolution: matchResolution, candidate_patch: candidatePatch, evidence, errors });
  atomicWrite(path.join(directory, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  return { package_path: path.join(directory, "package.json"), package: pkg };
}
function parseArgs(argv) { const options = { vaultRoot: process.cwd(), providers: core.PROVIDERS.slice(), fixtureDir: "", observedAt: nowIso(), selection: {} }; const selectionArgs = { "--court-code": "court_code", "--pnu": "pnu", "--lot-address": "lot_address", "--building-name": "building_name", "--building-dong": "building_dong", "--unit-number": "unit_number", "--apt-code": "apt_code", "--apt-notice-date": "apt_notice_date", "--dong-code": "dong_code", "--ho-code": "ho_code", "--lawd-cd": "lawd_cd" }; for (let index = 0; index < argv.length; index += 1) { const arg = argv[index]; const next = argv[index + 1]; if (arg === "--case") options.casePath = next; else if (arg === "--vault") options.vaultRoot = next; else if (arg === "--providers") options.providers = next.split(",").map((item) => item.trim()).filter(Boolean); else if (arg === "--fixture-dir") options.fixtureDir = next; else if (arg === "--observed-at") options.observedAt = next; else if (selectionArgs[arg]) options.selection[selectionArgs[arg]] = next; else throw new Error(`지원하지 않는 인자입니다: ${arg}`); index += 1; } if (!options.casePath) throw new Error("--case가 필요합니다."); options.providers.forEach((provider) => { if (!core.PROVIDERS.includes(provider)) throw new Error(`지원하지 않는 provider입니다: ${provider}`); }); validateObservedAt(options.observedAt); return options; }
async function collect(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot)); const objectPath = resolveCasePath(vaultRoot, options.casePath); const record = readAuctionObject(objectPath); record.object_path = path.relative(vaultRoot, objectPath).split(path.sep).join("/"); const objectIdentityContext = identityCore.normalizeAuctionIdentity(record, {}); const autoSelections = Object.assign({}, options.selection || {}); let identityContext = identityCore.normalizeAuctionIdentity(record, autoSelections); const lock = readLock(); const providerResults = {}; let dependencies = null; const temporaryRoots = [];
  try {
    if (!options.fixtureDir) {
      const cli = installKSkillCli(lock); temporaryRoots.push(cli.prefix);
      const court = installAndLoad("court-auction-notice-search", lock.packages["court-auction-notice-search"]); temporaryRoots.push(court.prefix);
      const housing = installAndLoad("housing-official-price", lock.packages["housing-official-price"]); temporaryRoots.push(housing.prefix);
      const land = installAndLoad("gongsijiga-search", lock.packages["gongsijiga-search"]); temporaryRoots.push(land.prefix);
      dependencies = { cli, court: court.module, housing: housing.module, land: land.module };
    }
    for (const name of core.PROVIDERS) {
      if (!options.providers.includes(name)) { providerResults[name] = { status: "needs_identifier", candidate: {}, evidence: {}, source_url: "https://www.realtyprice.kr", warnings: ["이번 실행에서 선택하지 않은 provider입니다."], match: Object.assign({}, identityCore.providerPlan(name, identityContext.identity), { status: "needs_identifier", match_verified: false, reason: "provider_not_selected" }) }; continue; }
      try {
        const fixture = options.fixtureDir ? JSON.parse(fs.readFileSync(path.join(options.fixtureDir, PROVIDER_FILES[name]), "utf8")) : null;
        const result = fixture || await liveProvider(name, record, dependencies, identityContext);
        const normalized = normalizeResult(record, result);
        const plan = identityCore.providerPlan(name, identityContext.identity);
        const match = result.match || (options.fixtureDir && result.status === "success" ? identityCore.verifyReturnedIdentity(name, identityContext.identity, normalized.raw || result.raw || result, plan.query) : null);
        const fixtureResultWithMatch = options.fixtureDir && !result.match
          ? (result.status === "success" ? verifiedResult(name, normalized, record, identityContext.identity, result.raw || result, plan.query, Object.assign({}, plan, { status: result.status, method: "fixture_identity_exact" })) : resultWithMatch(normalized, Object.assign({}, plan, { status: result.status, match_verified: result.status === "empty" && plan.status === "resolved", reason: result.status === "empty" && plan.status === "resolved" ? "fixture_query_empty" : "fixture_unresolved" })))
          : Object.assign({}, normalized, { match: match || Object.assign({}, plan, { status: result.status, match_verified: false, reason: "match_missing" }) });
        providerResults[name] = fixtureResultWithMatch;
        providerResults[name].raw = options.fixtureDir ? result : result.raw || result;
        if (name === "court" && providerResults[name].match?.match_verified === true) {
          const derived = deriveCourtParcelSelection(record, providerResults[name].raw);
          const courtCode = providerResults[name].match?.selected?.court_code || identityContext.identity.court_code;
          for (const [key, value] of Object.entries(Object.assign({ court_code: courtCode }, derived))) {
            if (!clean(autoSelections[key]) && clean(value)) autoSelections[key] = value;
          }
          identityContext = identityCore.normalizeAuctionIdentity(record, autoSelections);
        }
      } catch (error) { providerResults[name] = { status: "failed", candidate: {}, evidence: {}, raw: error.raw || { error: clean(redactSensitive(error.message)) }, source_url: "https://www.realtyprice.kr", warnings: [], error, match: Object.assign({}, identityCore.providerPlan(name, identityContext.identity), { status: "failed", match_verified: false, reason: error.code || "provider_error" }) }; }
    }
    Object.assign(autoSelections, { court_code: autoSelections.court_code || providerResults.court?.match?.selected?.court_code || identityContext.identity.court_code, apt_code: autoSelections.apt_code || providerResults["official-price"]?.match?.selected?.candidate?.aptCode || identityContext.identity.apt_code, apt_notice_date: autoSelections.apt_notice_date || providerResults["official-price"]?.match?.selected?.candidate?.noticeDate || identityContext.identity.apt_notice_date, lawd_cd: autoSelections.lawd_cd || providerResults.transactions?.match?.query?.lawd_cd || identityContext.identity.lawd_cd });
    const finalIdentity = identityCore.normalizeAuctionIdentity(record, autoSelections);
    return writePackage(vaultRoot, record, validateObservedAt(options.observedAt), providerResults, lock, finalIdentity, objectIdentityContext);
  } finally { temporaryRoots.forEach((directory) => { try { fs.rmSync(directory, { recursive: true, force: true }); } catch (_error) {} }); }
}
if (require.main === module) collect(parseArgs(process.argv.slice(2))).then((result) => process.stdout.write(`${JSON.stringify({ package_path: result.package_path, package_id: result.package.package_id }, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });

module.exports = Object.freeze({ CACHE_ROOT, PROVIDER_FILES, buildingProxyUrl, collect, deriveCourtParcelSelection, lookupLandPriceByIdentity, normalizeBuilding, normalizeCourt, normalizeLandPrice, normalizeOfficialPrice, normalizeResult, normalizeTransactions, parseArgs, readAuctionObject, readLock, safeCaseKey: core.safeCaseKey, serializeRaw, validateObservedAt, verifyKSkillFiles });
