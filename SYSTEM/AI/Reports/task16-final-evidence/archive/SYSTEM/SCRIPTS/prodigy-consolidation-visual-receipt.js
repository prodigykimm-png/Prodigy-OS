#!/usr/bin/env node
"use strict";

/**
 * prodigy-consolidation-visual-receipt.js
 * F3 support: produces a structured visual-QA receipt describing which
 * desktop and 390px mobile workflow checks require manual Obsidian verification.
 * This script does NOT perform DOM QA itself — it records what a human must confirm
 * so that desktop/mobile QA is never declared from DOM tests alone.
 */

const fs = require("node:fs");
const path = require("node:path");
const { REQUIRED_INPUTS, validRunId, validateFixtureRoot } = require("../CI/consolidation-fixture-contract.js");

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    i += 1;
    if (key === "--fixture-root") options.fixtureRoot = value;
    else if (key === "--manifest") options.manifestPath = value;
    else if (key === "--run-id") options.runId = value;
    else if (key === "--output") options.outputPath = value;
  }
  return options;
}

const MANUAL_CHECKS = Object.freeze([
 Object.freeze({ id: "desktop_home", surface: "desktop", check: "Home 대시보드 렌더 및 Quick Actions" }),
 Object.freeze({ id: "desktop_region_popup", surface: "desktop", check: "Auction 카드 → Region 팝업 → 탭 전환 → 닫기" }),
 Object.freeze({ id: "desktop_approval_copy", surface: "desktop", check: "수집 inbox에서 승인 명령 복사 (실행 아님)" }),
 Object.freeze({ id: "mobile_390_popup", surface: "mobile-390", check: "Region 팝업 가로 넘침 없음, 탭 스크롤" }),
 Object.freeze({ id: "mobile_390_touch", surface: "mobile-390", check: "모든 버튼 44px 터치 영역" }),
 Object.freeze({ id: "mobile_back_context", surface: "mobile", check: "팝업 → 소스 → 뒤로 → 맥락 유지" })
]);

function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixtureRoot = path.resolve(process.cwd(), options.fixtureRoot || "SYSTEM/CI/fixtures/consolidation");
  const errors = [];
  let fixtureManifestSha256 = null;
  let sourceInventorySha256 = null;
  if (!validRunId(options.runId)) errors.push("run ID missing or invalid");
  try {
    const validated = validateFixtureRoot({
      fixtureRoot,
      manifestPath: path.resolve(process.cwd(), options.manifestPath || path.join(fixtureRoot, "fixture-manifest.json")),
    });
    fixtureManifestSha256 = validated.manifestSha256;
    sourceInventorySha256 = validated.entries.get(REQUIRED_INPUTS.source_inventory).sha256;
  } catch (error) {
    errors.push(error.message);
  }
  const receipt = {
    ok: errors.length === 0,
    run_id: options.runId || null,
    input_hashes: fixtureManifestSha256 && sourceInventorySha256 ? {
      fixture_manifest_sha256: fixtureManifestSha256,
      source_inventory_sha256: sourceInventorySha256,
    } : null,
    note: "시각 QA는 실제 Obsidian에서 사람이 확인해야 합니다. DOM 테스트만으로 선언하지 않습니다.",
    manual_checks: MANUAL_CHECKS,
    dom_tests_only: false,
    errors,
    generated_at: new Date().toISOString()
  };
  if (options.outputPath) {
    const outAbs = path.resolve(process.cwd(), options.outputPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  }
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
  if (!receipt.ok) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ parseArgs, MANUAL_CHECKS });
