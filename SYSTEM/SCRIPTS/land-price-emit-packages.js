#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const VAULT = path.resolve(__dirname, "../..");
const COLLECTED_REL = "SYSTEM/CACHE/land-price-packages/individual/2026-01-01.json";
const OUT_DIR_REL = "SYSTEM/CACHE/land-price-packages/region";
const SOURCE = {
  institution: "국토교통부",
  title: "개별공시자가 정보(2026-01-01 기준)",
  url: "https://www.data.go.kr/data/15004246/fileData.do",
  accessed_at: "2026-09-29",
  source_type: "official_primary"
};

function emit() {
  const collectedPath = path.join(VAULT, COLLECTED_REL);
  const collected = JSON.parse(fs.readFileSync(collectedPath, "utf8"));
  const outDir = path.join(VAULT, OUT_DIR_REL);
  fs.mkdirSync(outDir, { recursive: true });

  const written = [];
  const skipped = [];
  for (const [regionKey, entry] of Object.entries(collected)) {
    if (entry.yoy_median_pct === null) { skipped.push({ region_key: regionKey, reason: "YoY 없음" }); continue; }
    if (!Number.isFinite(entry.median_price_per_sqm) || entry.median_price_per_sqm <= 0) {
      skipped.push({ region_key: regionKey, reason: "중앙값 없음" });
      continue;
    }
    const pkg = {
      schema_version: 1,
      scope: "region",
      target_id: regionKey,
      land_price_trend_as_of: entry.as_of,
      source: SOURCE,
      land_price_trend_yoy: entry.yoy_median_pct,
      land_price_trend_scope: `개별공시자가 중앙값(원/㎡), ${entry.land_count.toLocaleString("ko-KR")}개 토지, ${entry.mapping_rule}`
    };
    const target = path.join(outDir, `${regionKey}.json`);
    fs.writeFileSync(target, JSON.stringify(pkg, null, 2));
    written.push({ region_key: regionKey, yoy: pkg.land_price_trend_yoy, land_count: entry.land_count });
  }
  return { written, skipped };
}

if (require.main === module) {
  try {
    const { written, skipped } = emit();
    const yoys = written.map((w) => w.yoy).sort((a, b) => a - b);
    process.stdout.write(`${JSON.stringify({
      packages: written.length,
      skipped: skipped.length,
      skip_reasons: [...new Set(skipped.map((s) => s.reason))],
      yoy_min: yoys[0],
      yoy_median: yoys[Math.floor(yoys.length / 2)],
      yoy_max: yoys.at(-1)
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ emit, SOURCE });
