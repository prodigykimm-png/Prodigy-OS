#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const core = require("./region-metrics-core.js");
const cacheRoot = require("./region-cache-root.js");

const RONE_BASE = "https://www.reb.or.kr/r-one";
const JUMIN_BASE = "https://jumin.mois.go.kr";
const VAULT_ROOT = path.resolve(__dirname, "..", "..");
const TABLES = Object.freeze({
  volume: "A_2024_00554",
  price: "A_2024_00045",
  jeonse: "A_2024_00073"
});

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`인자는 --key value 형식이어야 합니다: ${key ?? "(없음)"}`);
    }
    values[key.slice(2)] = value;
  }
  const required = ["region-key", "region-prefix", "lawd-code", "household-row", "stock-csv", "stock-as-of", "supply-csv", "supply-basis", "output"];
  required.forEach((key) => {
    if (!values[key]) throw new Error(`필수 인자가 없습니다: --${key}`);
  });
  if (!/^\d{8}$/.test(values["lawd-code"])) throw new Error("--lawd-code는 8자리여야 합니다.");
  if (!/^\d{4}-\d{2}$/.test(values["supply-basis"])) throw new Error("--supply-basis는 YYYY-MM 형식이어야 합니다.");
  return values;
}

const RETRY_MAX = 3;
const RETRY_BASE_MS = 2000;

async function post(url, form, attempt = 1) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(30000)
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt < RETRY_MAX) {
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return post(url, form, attempt + 1);
      }
      throw new Error(`HTTP ${response.status} (재시도 ${RETRY_MAX}회 소진): ${url}`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt < RETRY_MAX && (error.name === "TimeoutError" || error.name === "AbortError" || error.code === "ECONNRESET" || error.code === "ENOTFOUND")) {
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return post(url, form, attempt + 1);
    }
    throw error;
  }
}

async function lookupRoneClass(tableId, lawdCode) {
  const raw = await post(`${RONE_BASE}/portal/openapi/selectOpenApiItmCd.do`, { statblId: tableId });
  const payload = JSON.parse(raw.toString("utf8"));
  const matches = payload.data.filter((item) => item.itmTag === "분류" && String(item.lawdCd) === lawdCode);
  if (matches.length !== 1) throw new Error(`${tableId} 지역 코드는 정확히 1개여야 합니다: ${matches.length}`);
  return {
    categories: matches[0].itmNm.split(">"),
    classId: String(matches[0].itmId),
    raw
  };
}

function roneForm(tableId, classId, time) {
  const form = {
    statblId: tableId,
    viewLocOpt: "B",
    dtadvsVal: "OD",
    wrttimeOrder: "A",
    dtacycleCd: "MM",
    dmPointVal: tableId === TABLES.volume ? "0" : "5",
    wrttimeMinYear: "2006",
    wrttimeMaxYear: String(new Date().getUTCFullYear()),
    wrttimeMinQt: "01",
    wrttimeMaxQt: "12",
    optDivVal: "00",
    isRegionData: "Y",
    chkItms: "100001",
    chkClss: classId,
    hasClsAllChk: "N",
    hasItmAllChk: "N"
  };
  if (time.latest) {
    return { ...form, wrttimeType: "L", wrttimeLastestVal: String(time.latest) };
  }
  return {
    ...form,
    wrttimeType: "B",
    wrttimeStartYear: time.month.slice(0, 4),
    wrttimeStartQt: time.month.slice(4, 6),
    wrttimeEndYear: time.month.slice(0, 4),
    wrttimeEndQt: time.month.slice(4, 6),
    wrttimeLastestVal: ""
  };
}

async function fetchRone(tableId, classId, time) {
  return post(`${RONE_BASE}/portal/stat/sttsDataPreviewList.do`, roneForm(tableId, classId, time));
}

function previousYear(month) {
  return `${Number(month.slice(0, 4)) - 1}${month.slice(4, 6)}`;
}

async function fetchHouseholds(month) {
  const form = {
    sltOrgType: "1",
    sltOrgLvl1: "A",
    sltOrgLvl2: "",
    gender: "gender",
    genderPer: "genderPer",
    generation: "generation",
    sltUndefType: "",
    searchYearStart: month.slice(0, 4),
    searchMonthStart: month.slice(4, 6),
    searchYearEnd: month.slice(0, 4),
    searchMonthEnd: month.slice(4, 6),
    sltOrderType: "1",
    sltOrderValue: "ASC",
    category: "month",
    state: "3"
  };
  return post(`${JUMIN_BASE}/downloadCsv.do?searchYearMonth=month&xlsStats=3`, form);
}

function metric(value, unit, asOf, provider, sourceId, rawHash) {
  return { value, unit, as_of: `${asOf.slice(0, 4)}-${asOf.slice(4, 6)}-01`, provider, source_id: sourceId, raw_hash: rawHash, verification: "unverified" };
}

function resolveVaultRoot(config) {
  if (typeof config?.vaultRoot === "string" && config.vaultRoot.trim() !== "") {
    return path.resolve(config.vaultRoot);
  }
  return VAULT_ROOT;
}

function writeArtifacts(config, snapshotId, rawFiles, snapshot) {
  const snapshotDir = path.join(config.output, config["region-key"], snapshotId);
  const vaultRoot = resolveVaultRoot(config);
  const rawDir = cacheRoot.resolveRawDir({
    vaultRoot,
    regionKey: config["region-key"],
    snapshotId
  });
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });
  const hashes = {};
  Object.entries(rawFiles).forEach(([name, raw]) => {
    fs.writeFileSync(path.join(rawDir, name), raw);
    hashes[name] = core.sha256(raw);
  });
  fs.writeFileSync(path.join(snapshotDir, "hashes.json"), `${JSON.stringify(hashes, null, 2)}\n`);
  fs.writeFileSync(path.join(snapshotDir, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshotDir;
}

async function collect(config) {
  const [volumeClass, priceClass, jeonseClass] = await Promise.all([
    lookupRoneClass(TABLES.volume, config["lawd-code"]),
    lookupRoneClass(TABLES.price, config["lawd-code"]),
    lookupRoneClass(TABLES.jeonse, config["lawd-code"])
  ]);
  const volumeRaw = await fetchRone(TABLES.volume, volumeClass.classId, { latest: 3 });
  const volume = core.summarizeVolume(core.parseRoneSeries(volumeRaw, volumeClass.categories));
  const metricsMonth = volume.asOf;
  const priorMonth = previousYear(metricsMonth);
  const [priceRaw, pricePriorRaw, jeonseRaw, householdsRaw, householdsPriorRaw] = await Promise.all([
    fetchRone(TABLES.price, priceClass.classId, { month: metricsMonth }),
    fetchRone(TABLES.price, priceClass.classId, { month: priorMonth }),
    fetchRone(TABLES.jeonse, jeonseClass.classId, { month: metricsMonth }),
    fetchHouseholds(metricsMonth),
    fetchHouseholds(priorMonth)
  ]);

  const price = core.parseRoneSeries(priceRaw, priceClass.categories)[0];
  const pricePrior = core.parseRoneSeries(pricePriorRaw, priceClass.categories)[0];
  const jeonse = core.parseRoneSeries(jeonseRaw, jeonseClass.categories)[0];
  const stockRaw = fs.readFileSync(config["stock-csv"]);
  const supplyRaw = fs.readFileSync(config["supply-csv"]);
  const stockPrefix = config["stock-region-prefix"] || config["region-prefix"];
  const stock = core.parseStockCsv(new TextDecoder("utf-8").decode(stockRaw), stockPrefix);
  const supply = core.parseSupplyCsv(new TextDecoder("utf-8").decode(supplyRaw), config["region-prefix"], config["supply-basis"]);
  const householdDecoder = new TextDecoder("euc-kr");
  const households = core.parseHouseholdsCsv(householdDecoder.decode(householdsRaw), config["household-row"], metricsMonth);
  const householdsPrior = core.parseHouseholdsCsv(householdDecoder.decode(householdsPriorRaw), config["household-row"], priorMonth);
  const fetchedAt = new Date().toISOString();
  const compactFetchedAt = fetchedAt.replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
  const snapshotId = `${metricsMonth.slice(0, 4)}-${metricsMonth.slice(4, 6)}-01_${compactFetchedAt}`;
  const stockMonth = config["stock-as-of"].replaceAll("-", "").slice(0, 6);
  const supplyMonth = config["supply-basis"].replaceAll("-", "");
  const rawFiles = {
    "rone-volume.json": volumeRaw,
    "rone-price.json": priceRaw,
    "rone-price-prior.json": pricePriorRaw,
    "rone-jeonse.json": jeonseRaw,
    "rone-volume-codes.json": volumeClass.raw,
    "rone-price-codes.json": priceClass.raw,
    "rone-jeonse-codes.json": jeonseClass.raw,
    "households.csv": householdsRaw,
    "households-prior.csv": householdsPriorRaw,
    "housing-stock.csv": stockRaw,
    "move-in.csv": supplyRaw
  };
  const snapshot = {
    schema_version: 1,
    snapshot_id: snapshotId,
    region_key: config["region-key"],
    metrics_as_of: `${metricsMonth.slice(0, 4)}-${metricsMonth.slice(4, 6)}-01`,
    fetched_at: fetchedAt,
    verification_status: "unverified",
    metrics: {
      sale_volume_3m: metric(volume.value, "건", metricsMonth, "reb_rone_public_table", TABLES.volume, core.sha256(volumeRaw)),
      housing_stock: metric(stock.value, "호", stockMonth, "reb_stock", "15106861", core.sha256(stockRaw)),
      sale_turnover_rate: metric(core.calculateTurnover(volume.value, stock.value), "ratio", metricsMonth, "derived", "sale_volume_3m+housing_stock", core.sha256(Buffer.from(`${core.sha256(volumeRaw)}:${core.sha256(stockRaw)}`))),
      sale_price_change_yoy: metric(core.calculateYoY(price, pricePrior), "%", metricsMonth, "reb_rone_public_table", TABLES.price, core.sha256(Buffer.concat([priceRaw, pricePriorRaw]))),
      jeonse_ratio: metric(jeonse.value, "%", metricsMonth, "reb_rone_public_table", TABLES.jeonse, core.sha256(jeonseRaw)),
      move_in_12m: metric(supply.moveIn12m, "세대", supplyMonth, "reb_supply", "15111714", core.sha256(supplyRaw)),
      move_in_24m: metric(supply.moveIn24m, "세대", supplyMonth, "reb_supply", "15111714", core.sha256(supplyRaw)),
      move_in_36m: metric(supply.moveIn36m, "세대", supplyMonth, "reb_supply", "15111714", core.sha256(supplyRaw)),
      move_in_48m: metric(supply.moveIn48m, "세대", supplyMonth, "reb_supply", "15111714", core.sha256(supplyRaw)),
      move_in_60m: metric(supply.moveIn60m, "세대", supplyMonth, "reb_supply", "15111714", core.sha256(supplyRaw)),
      households: metric(households, "세대", metricsMonth, "mois_jumin_statmonth_csv", "jumin_statmonth_csv", core.sha256(householdsRaw)),
      household_change_yoy: metric(core.calculateYoY({ month: metricsMonth, value: households }, { month: priorMonth, value: householdsPrior }), "%", metricsMonth, "mois_jumin_statmonth_csv", "jumin_statmonth_csv", core.sha256(Buffer.concat([householdsRaw, householdsPriorRaw]))),
      auction_bid_rate_6m: { value: null, unit: "%", as_of: null, provider: "court_auction", source_id: null, raw_hash: null, verification: "n/a" }
    },
    evidence: {
      volume_months: volume.months,
      stock_total_rows: stock.totalRows,
      stock_matched_rows: stock.matchedRows,
      stock_unmatched_rows: stock.unmatchedRows,
      supply_coverage: {
        basis_month: config["supply-basis"],
        source_month_min: supply.sourceMonthMin,
        source_month_max: supply.sourceMonthMax,
        matched_rows: supply.matchedRows,
        observed_horizon_months: supply.observedHorizonMonths,
        unavailable_horizons: supply.unavailableHorizons
      }
    }
  };
  return { snapshot, snapshotDir: writeArtifacts(config, snapshotId, rawFiles, snapshot) };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const result = await collect(config);
  process.stdout.write(`${JSON.stringify({ snapshot_dir: result.snapshotDir, snapshot: result.snapshot }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ collect, fetchHouseholds, fetchRone, lookupRoneClass, parseArgs, resolveVaultRoot, roneForm, writeArtifacts });
