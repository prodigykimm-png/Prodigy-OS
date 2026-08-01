#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const core = require("./real-estate-source-package-core.js");

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
function parseScalar(block, key) {
  const match = String(block).match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "mu"));
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
  ["case_number", "court", "court_code", "auction_datetime", "region_sido", "region_sigungu", "region_dong", "address", "property_type", "appraisal_price", "minimum_bid", "land_parcel_id", "pnu", "item_number", "building_name"].forEach((key) => {
    const value = parseScalar(block, key);
    if (value) result[key] = /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : value;
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
  return lock;
}
function installPackage(packageSpec) {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-real-estate-") );
  const result = spawnSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--prefix", prefix, packageSpec], { encoding: "utf8", timeout: 180000 });
  if (result.error || result.status !== 0) throw new Error(`${packageSpec} 설치 실패: ${clean(result.stderr) || result.error?.message || "알 수 없는 오류"}`);
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
  return { bin: path.join(packageRoot, "bin", "k-skill.js"), packageRoot };
}
function runKSkillScript(cli, skill, script, args, env) {
  const result = spawnSync(process.execPath, [cli.bin, "exec", skill, script, "--", ...args], { encoding: "utf8", env: Object.assign({}, process.env, env || {}), timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error(`${skill} 실행 실패: ${clean(result.stderr) || result.error?.message || "알 수 없는 오류"}`);
  try { return JSON.parse(result.stdout); } catch (_error) { const error = new Error(`${skill} 응답이 JSON이 아닙니다.`); error.raw = result.stdout; throw error; }
}
function installAndLoad(packageName, version) {
  const installed = installPackage(`${packageName}@${version}`);
  return installed.require(packageName);
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
function providerMeta(status, sourceUrl, raw, warnings, error) {
  const rawText = `${JSON.stringify(raw ?? null, null, 2)}\n`;
  const result = { status, source_url: sourceUrl, fetched_at: nowIso(), raw_sha256: core.sha256(rawText), warnings: warnings || [] };
  if (error) { result.error_code = error.code || "PROVIDER_ERROR"; result.message = error.message || String(error); }
  return result;
}
function normalizeCourt(record, payload) {
  if (!payload || payload.found === false) return { status: "empty", candidate: {}, evidence: { result: null }, raw: payload, source_url: "https://www.courtauction.go.kr" };
  const item = firstItem(payload) || {};
  const schedule = Array.isArray(payload.schedule) ? payload.schedule : [];
  const latest = schedule[schedule.length - 1] || {};
  const result = Object.assign({}, item, latest, payload.caseInfo || {});
  const explicitOutcome = clean(result.auctionOutcome || result.outcome || result.result).toLowerCase();
  const candidate = {
    case_number: result.caseNumber || record.case_number,
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
function normalizeBuilding(record, payload) {
  const item = firstItem(payload) || {};
  if (!item || Object.keys(item).length === 0) return { status: "empty", candidate: {}, evidence: { records: [] }, raw: payload, source_url: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo" };
  return { status: "success", candidate: { address: normalizeAddress(record, payload), property_type: item.mainPurpsCdNm || undefined }, evidence: { records: [item] }, raw: payload, source_url: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo" };
}
function normalizeTransactions(payload) { const items = Array.isArray(payload?.items) ? payload.items : []; return { status: items.length ? "success" : "empty", candidate: {}, evidence: { items, summary: payload?.summary || null, query: payload?.query || null }, raw: payload, source_url: "https://k-skill-proxy.nomadamas.org/v1/real-estate" }; }
function normalizeOfficialPrice(payload) { const history = Array.isArray(payload?.history) ? payload.history : []; return { status: history.length ? "success" : "empty", candidate: {}, evidence: { status: payload?.status || null, selected: payload?.selected || null, history, source: payload?.source || null }, raw: payload, source_url: "https://www.realtyprice.kr" }; }
function normalizeLandPrice(payload) { const history = Array.isArray(payload?.history) ? payload.history : []; return { status: payload?.latest || history.length ? "success" : "empty", candidate: {}, evidence: { address: payload?.address || null, latest: payload?.latest || null, history, yoy_change_pct: payload?.yoy_change_pct ?? null }, raw: payload, source_url: payload?.source_url || "https://www.realtyprice.kr/notice/gsindividual/search.htm" }; }
async function httpJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "ProdigyOS-real-estate-source/1.0" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  try { return JSON.parse(text); } catch (_error) { const error = new Error("외부 응답이 JSON이 아닙니다."); error.raw = text; throw error; }
}
function recentMonths(count) {
  const result = []; const date = new Date(); date.setUTCDate(1);
  for (let index = 0; index < count; index += 1) { result.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`); date.setUTCMonth(date.getUTCMonth() - 1); }
  return result;
}
async function liveProvider(name, record, dependencies) {
  const pnu = pnuOf(record);
  if (name === "court") {
    const court = dependencies.court;
    let courtCode = clean(record.court_code);
    if (!/^B\d{6}$/u.test(courtCode) && court?.getCourtCodes) {
      const codes = await court.getCourtCodes(); const rows = codes.items || codes.courts || codes.rows || [];
      const match = rows.find((row) => clean(row.code || row.courtCode || row.cortOfcCd) && clean(record.court) && clean(row.name || row.courtName || row.jiwonNm).includes(clean(record.court)));
      courtCode = match ? clean(match.code || match.courtCode || match.cortOfcCd) : "";
    }
    if (!/^B\d{6}$/u.test(courtCode) || !record.case_number) return { status: "needs_identifier", candidate: {}, evidence: {}, source_url: "https://www.courtauction.go.kr", warnings: ["법원사무소 코드와 사건번호가 필요합니다."] };
    const payload = await court.getCaseByCaseNumber({ courtCode, caseNumber: record.case_number });
    return normalizeWithRaw((value) => normalizeCourt(record, value), payload);
  }
  if (name === "building") {
    if (!pnu && process.env.PRODIGY_REAL_ESTATE_ALLOW_PROXY !== "1") return { status: "needs_identifier", candidate: {}, evidence: {}, source_url: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo", warnings: ["건축물대장 공식 직접 조회에는 19자리 PNU가 필요합니다."] };
    const args = ["title", pnu ? "--pnu" : "--address", pnu || record.address, "--json"];
    if (!pnu) args.push("--proxy-base-url", process.env.KSKILL_PROXY_BASE_URL || "https://k-skill-proxy.nomadamas.org"); else args.push("--direct");
    const payload = runKSkillScript(dependencies.cli, "building-register-search", "scripts/building_register.py", args);
    return normalizeWithRaw((value) => normalizeBuilding(record, value), payload);
  }
  if (name === "transactions") {
    if (!record.region_sigungu) return { status: "needs_identifier", candidate: {}, evidence: {}, source_url: "https://k-skill-proxy.nomadamas.org/v1/real-estate", warnings: ["실거래 조회에 시·군·구가 필요합니다."] };
    if (process.env.PRODIGY_REAL_ESTATE_ALLOW_PROXY !== "1") return { status: "needs_identifier", candidate: {}, evidence: {}, source_url: "https://k-skill-proxy.nomadamas.org/v1/real-estate", warnings: ["실거래 k-skill 프록시는 PRODIGY_REAL_ESTATE_ALLOW_PROXY=1일 때만 사용합니다."] };
    const base = (process.env.KSKILL_PROXY_BASE_URL || "https://k-skill-proxy.nomadamas.org").replace(/\/$/u, "");
    const codePayload = await httpJson(`${base}/v1/real-estate/region-code?q=${encodeURIComponent(record.region_sigungu)}`);
    const lawd = codePayload.results?.[0]?.lawd_cd;
    if (!lawd) return { status: "needs_identifier", candidate: {}, evidence: {}, source_url: `${base}/v1/real-estate/region-code`, warnings: ["시·군·구 법정동 코드를 확정하지 못했습니다."] };
    const assetType = /아파트|공동주택/u.test(clean(record.property_type)) ? "apartment" : /오피스텔/u.test(clean(record.property_type)) ? "officetel" : /상가|상업/u.test(clean(record.property_type)) ? "commercial" : /빌라|연립|다세대/u.test(clean(record.property_type)) ? "villa" : "single-house";
    const responses = await Promise.all(recentMonths(3).map(async (month) => httpJson(`${base}/v1/real-estate/${assetType}/trade?lawd_cd=${lawd}&deal_ymd=${month}`)));
    return normalizeWithRaw(normalizeTransactions, { items: responses.flatMap((response) => response.items || []), summary: { sample_count: responses.reduce((sum, response) => sum + Number(response.summary?.sample_count || response.items?.length || 0), 0) }, query: { asset_type: assetType, deal_type: "trade", lawd_cd: lawd, months: recentMonths(3) } });
  }
  if (name === "official-price") {
    if (!pnu && !record.building_name) return { status: "needs_selection", candidate: {}, evidence: {}, source_url: "https://www.realtyprice.kr", warnings: ["공시가격은 PNU 또는 공동주택 단지·동·호 선택이 필요합니다."] };
    if (pnu) return normalizeWithRaw(normalizeOfficialPrice, await dependencies.housing.lookupIndividualHousePriceByPnu(pnu));
    return { status: "needs_selection", candidate: {}, evidence: {}, source_url: "https://www.realtyprice.kr", warnings: ["공동주택 후보·동·호 선택은 조사 모달에서 추가해야 합니다."] };
  }
  if (name === "land-price") return normalizeWithRaw(normalizeLandPrice, await dependencies.land.lookupGongsijiga(record.address));
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
function writePackage(vaultRoot, record, observedAt, providerResults, lock) {
  const caseKey = core.safeCaseKey(record.case_number, record.item_number);
  const packageId = `${caseKey}-${observedAt.replace(/[^0-9TZ]/gu, "")}`;
  const directory = path.join(vaultRoot, CACHE_ROOT, caseKey, observedAt);
  fs.mkdirSync(path.join(directory, "raw"), { recursive: true });
  const providers = {}; const evidence = {}; const errors = []; const candidatePatch = {};
  for (const name of core.PROVIDERS) {
    const result = providerResults[name]; const fileName = PROVIDER_FILES[name]; const rawText = JSON.stringify(result.raw ?? result, null, 2); const rawPath = `raw/${fileName}`;
    atomicWrite(path.join(directory, rawPath), `${rawText}\n`);
    const meta = providerMeta(result.status, result.source_url, result.raw ?? result, result.warnings, result.error);
    meta.raw_path = rawPath; providers[name] = meta; evidence[name] = result.evidence || {};
    Object.assign(candidatePatch, result.candidate || {});
    if (result.status !== "success" && result.status !== "empty") errors.push({ provider: name, code: result.error?.code || result.status.toUpperCase(), message: (result.warnings || [])[0] || result.error?.message || `${name} 조회를 완료하지 못했습니다.` });
  }
  const pkg = core.buildPackage({ package_id: packageId, case_key: caseKey, observed_at: observedAt, query_identity: { object_path: record.object_path, case_number: clean(record.case_number), court: clean(record.court), address: clean(record.address), region_sido: clean(record.region_sido), region_sigungu: clean(record.region_sigungu), region_dong: clean(record.region_dong) }, collector: { k_skill_repository: KSKILL_REPOSITORY, k_skill_commit: lock.commit, package_version: lock.cli_package.version, selected_skills: core.PROVIDERS.slice() }, providers, candidate_patch: candidatePatch, evidence, errors });
  atomicWrite(path.join(directory, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  return { package_path: path.join(directory, "package.json"), package: pkg };
}
function parseArgs(argv) { const options = { vaultRoot: process.cwd(), providers: core.PROVIDERS.slice(), fixtureDir: "", observedAt: nowIso() }; for (let index = 0; index < argv.length; index += 1) { const arg = argv[index]; const next = argv[index + 1]; if (arg === "--case") options.casePath = next; else if (arg === "--vault") options.vaultRoot = next; else if (arg === "--providers") options.providers = next.split(",").map((item) => item.trim()).filter(Boolean); else if (arg === "--fixture-dir") options.fixtureDir = next; else if (arg === "--observed-at") options.observedAt = next; else throw new Error(`지원하지 않는 인자입니다: ${arg}`); index += 1; } if (!options.casePath) throw new Error("--case가 필요합니다."); options.providers.forEach((provider) => { if (!core.PROVIDERS.includes(provider)) throw new Error(`지원하지 않는 provider입니다: ${provider}`); }); return options; }
async function collect(options) {
  const vaultRoot = fs.realpathSync(path.resolve(options.vaultRoot)); const objectPath = resolveCasePath(vaultRoot, options.casePath); const record = readAuctionObject(objectPath); const lock = readLock(); const providerResults = {}; let dependencies = null;
  if (!options.fixtureDir) { const cli = installKSkillCli(lock); dependencies = { cli, court: installAndLoad("court-auction-notice-search", lock.packages["court-auction-notice-search"]), housing: installAndLoad("housing-official-price", lock.packages["housing-official-price"]), land: installAndLoad("gongsijiga-search", lock.packages["gongsijiga-search"]) }; }
  for (const name of core.PROVIDERS) {
    if (!options.providers.includes(name)) { providerResults[name] = { status: "needs_identifier", candidate: {}, evidence: {}, source_url: "https://www.realtyprice.kr", warnings: ["이번 실행에서 선택하지 않은 provider입니다."] }; continue; }
    try { const result = options.fixtureDir ? JSON.parse(fs.readFileSync(path.join(options.fixtureDir, PROVIDER_FILES[name]), "utf8")) : await liveProvider(name, record, dependencies); providerResults[name] = normalizeResult(record, result); providerResults[name].raw = options.fixtureDir ? result : result.raw || result; }
    catch (error) { providerResults[name] = { status: "failed", candidate: {}, evidence: {}, raw: error.raw || { error: error.message }, source_url: "https://www.realtyprice.kr", warnings: [], error }; }
  }
  return writePackage(vaultRoot, record, options.observedAt, providerResults, lock);
}
if (require.main === module) collect(parseArgs(process.argv.slice(2))).then((result) => process.stdout.write(`${JSON.stringify({ package_path: result.package_path, package_id: result.package.package_id }, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });

module.exports = Object.freeze({ CACHE_ROOT, PROVIDER_FILES, collect, normalizeBuilding, normalizeCourt, normalizeLandPrice, normalizeOfficialPrice, normalizeResult, normalizeTransactions, parseArgs, readAuctionObject, readLock, safeCaseKey: core.safeCaseKey, verifyKSkillFiles });
