#!/usr/bin/env node
"use strict";

/**
 * region-metrics-collect-all.js
 * 4개 시도 전체 metrics 수집. 월 1회 자동 실행용.
 * _shared/ CSV 자동 감지, skip-and-continue, 이력 기록 포함.
 *
 * Usage:
   node SYSTEM/SCRIPTS/region-metrics-collect-all.js --execute
 *   node SYSTEM/SCRIPTS/region-metrics-collect-all.js --dry-run
 */

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BATCH_SCRIPT = path.resolve(__dirname, "region-metrics-batch.js");
const OUTPUT_DIR = path.resolve(__dirname, "../CACHE/region-metrics");
const SIDOS = ["부산광역시", "서울특별시", "경기도", "인천광역시"];

function main() {
  const execute = process.argv.includes("--execute");
  const mode = execute ? "--execute" : "--dry-run";
  const results = [];

  for (const sido of SIDOS) {
    const args = [
      BATCH_SCRIPT,
      "--sido", sido,
      "--all",
      mode,
      "--output", OUTPUT_DIR
    ];
    const child = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 600000 });
    let summary = null;
    try { summary = JSON.parse(child.stdout || "{}"); } catch (_e) { /* not JSON */ }
    results.push({
      sido,
      exit_code: child.status,
      selected: summary?.selected_count ?? 0,
      succeeded: summary ? summary.completed - summary.failed_count : 0,
      failed: summary?.failed_count ?? 0,
      failed_regions: summary?.jobs?.filter((j) => j.status !== "success").map((j) => j.region_key) ?? []
    });
  }

  const total = results.reduce((sum, r) => sum + r.succeeded, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const report = {
    executed_at: new Date().toISOString(),
    mode: execute ? "execute" : "dry-run",
    total_succeeded: total,
    total_failed: totalFailed,
    results
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (totalFailed > 0) process.exitCode = 1;
}

main();
