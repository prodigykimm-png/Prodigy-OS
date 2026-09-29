#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const VAULT = path.resolve(__dirname, "../..");
const OUT_DIR_REL = "SYSTEM/CACHE/land-price-packages/individual";
const INDEX_REL = "SYSTEM/SCRIPTS/region-metrics-manifest-index.json";
const AS_OF = "2026-01-01";
const BASIS = "국토교통부장이 조사·공시한 개별토지 공시가격(2026-01-01 기준)";

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; } else quoted = false;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { cells.push(current); current = ""; continue; }
    current += char;
  }
  cells.push(current);
  return cells;
}

function toPrice(raw) {
  const value = Number(String(raw ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function quantile(sorted, ratio) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function loadNoteRegions() {
  const index = JSON.parse(fs.readFileSync(path.join(VAULT, INDEX_REL), "utf8"));
  const regions = [];
  for (const entry of index.manifests) {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(path.join(VAULT, INDEX_REL)), entry.manifest_path), "utf8"));
    for (const region of manifest.regions) regions.push({ key: region.region_key, sido: manifest.sido, sigungu: region.sigungu });
  }
  return regions;
}

function stemOf(sigungu) {
  return String(sigungu).replace(/(시|군|구)$/u, "");
}

function buildResolver(noteRegions) {
  const exact = new Map();
  const bySido = new Map();
  for (const region of noteRegions) {
    exact.set(`${region.sido}|${region.sigungu}`, region.key);
    if (!bySido.has(region.sido)) bySido.set(region.sido, []);
    bySido.get(region.sido).push(region);
  }
  return function resolve(sido, sigungu) {
    if (exact.has(`${sido}|${sigungu}`)) return { key: exact.get(`${sido}|${sigungu}`), rule: "exact" };
    if (!sigungu) {
      const candidates = bySido.get(sido) || [];
      if (candidates.length === 1) return { key: candidates[0].key, rule: "single_level_si" };
      const stem = sido.replace(/(특별자치시|특별자치도|광역시|특별자치도)$/u, "").replace(/(시|군)$/u, "");
      const named = candidates.find((r) => stemOf(r.sigungu) === stem);
      return named ? { key: named.key, rule: "single_level_si_by_stem" } : { key: null, rule: "empty_sigungu_unmapped" };
    }
    const sameSido = bySido.get(sido) || [];
    const folded = sameSido.filter((r) => r.sigungu !== sigungu && sigungu.startsWith(stemOf(r.sigungu)));
    if (folded.length === 1) return { key: folded[0].key, rule: `folded_gu_into_si(${sigungu}→${folded[0].sigungu})` };
    if (folded.length > 1) return { key: null, rule: `ambiguous_fold(${sigungu}→${folded.map((f) => f.sigungu).join("/")})` };
    return { key: null, rule: "unmapped" };
  };
}

function aggregate(csvPath) {
  const noteRegions = loadNoteRegions();
  const resolve = buildResolver(noteRegions);
  const handle = fs.openSync(csvPath, "r");
  const chunk = Buffer.alloc(1 << 22);
  let carry = "";
  let header = null;
  let column = null;
  const buckets = new Map();
  const rules = new Map();
  const unmapped = new Map();
  let rows = 0;
  let skippedRow = 0;

  const handleLine = (line) => {
    if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
    if (line === "") return;
    if (!header) {
      header = parseCsvLine(line);
      column = Object.fromEntries(header.map((name, index) => [name.trim(), index]));
      for (const required of ["시도명", "시군구명", "공시지가", "전년지가"]) {
        if (column[required] === undefined) throw new Error(`필수 컬럼이 없습니다: ${required}`);
      }
      return;
    }
    const cells = parseCsvLine(line);
    if (cells.length < header.length) { skippedRow += 1; return; }
    const sido = (cells[column["시도명"]] ?? "").trim();
    if (!sido) { skippedRow += 1; return; }
    const sigungu = (cells[column["시군구명"]] ?? "").trim();
    const price = toPrice(cells[column["공시지가"]]);
    if (price === null) { skippedRow += 1; return; }
    const prior = toPrice(cells[column["전년지가"]]);
    const resolved = resolve(sido, sigungu);
    if (!resolved.key) {
      const label = `${sido}|${sigungu || "(빈 값)"}`;
      unmapped.set(label, (unmapped.get(label) ?? 0) + 1);
      skippedRow += 1;
      return;
    }
    rules.set(resolved.key, resolved.rule);
    if (!buckets.has(resolved.key)) buckets.set(resolved.key, { prices: [], priors: [] });
    const bucket = buckets.get(resolved.key);
    bucket.prices.push(price);
    if (prior !== null) bucket.priors.push(prior);
    rows += 1;
  };

  for (;;) {
    const bytes = fs.readSync(handle, chunk, 0, chunk.length, null);
    if (bytes <= 0) break;
    const text = carry + chunk.toString("utf8", 0, bytes);
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) handleLine(line.endsWith("\r") ? line.slice(0, -1) : line);
  }
  if (carry.trim() !== "") handleLine(carry);
  fs.closeSync(handle);

  const packages = {};
  for (const [key, bucket] of buckets) {
    const prices = bucket.prices.sort((a, b) => a - b);
    const priors = bucket.priors.sort((a, b) => a - b);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const median = quantile(prices, 0.5);
    const priorMean = priors.length > 0 ? priors.reduce((a, b) => a + b, 0) / priors.length : null;
    const priorMedian = priors.length > 0 ? quantile(priors, 0.5) : null;
    const yoy = (base) => (base === null || base === 0 ? null : Number((((median / base) - 1) * 100).toFixed(2)));
    packages[key] = {
      region_key: key,
      as_of: AS_OF,
      source: "국토교통부 개별공시자가 정보",
      source_url: "https://www.data.go.kr/data/15004246/fileData.do",
      scope: "개별공시지가_산술평균·중앙값_원_제곱미터당",
      basis: BASIS,
      mapping_rule: rules.get(key),
      land_count: prices.length,
      mean_price_per_sqm: Math.round(mean),
      median_price_per_sqm: Math.round(median),
      p25_price_per_sqm: Math.round(quantile(prices, 0.25)),
      p75_price_per_sqm: Math.round(quantile(prices, 0.75)),
      prior_mean_price_per_sqm: priorMean === null ? null : Math.round(priorMean),
      prior_median_price_per_sqm: priorMedian === null ? null : Math.round(priorMedian),
      yoy_median_pct: yoy(priorMedian),
      yoy_mean_pct: priorMean === null || priorMean === 0 ? null : Number((((mean / priorMean) - 1) * 100).toFixed(2)),
      caveat: "공시지가는 시세·감정가·낙찰가가 아니다. 위 값은 개별토지 공시가격의 집계값이며, 거래 가격을 뜻하지 않는다."
    };
  }
  return {
    rows,
    skipped: skippedRow,
    regions: Object.keys(packages).length,
    noteRegions: noteRegions.length,
    unmapped: Object.fromEntries(unmapped),
    packages
  };
}

if (require.main === module) {
  try {
    const csvPath = process.argv[2];
    if (!csvPath || !fs.existsSync(csvPath)) throw new Error(`CSV 경로가 필요합니다: ${csvPath}`);
    const result = aggregate(csvPath);
    const outDir = path.join(VAULT, OUT_DIR_REL);
    fs.mkdirSync(outDir, { recursive: true });
    const target = path.join(outDir, `${AS_OF}.json`);
    fs.writeFileSync(target, JSON.stringify(result.packages, null, 2));
    const noteKeys = new Set(loadNoteRegions().map((r) => r.key));
    process.stdout.write(`${JSON.stringify({
      schema_version: 1,
      as_of: AS_OF,
      source_rows: result.rows,
      skipped_rows: result.skipped,
      regions_built: result.regions,
      note_regions: noteKeys.size,
      note_regions_covered: Object.keys(result.packages).filter((k) => noteKeys.has(k)).length,
      note_regions_missing: [...noteKeys].filter((k) => !result.packages[k]),
      unmapped_source_regions: result.unmapped
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ aggregate, parseCsvLine, buildResolver, quantile });
