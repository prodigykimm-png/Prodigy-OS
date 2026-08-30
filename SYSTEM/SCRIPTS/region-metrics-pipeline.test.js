"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const pipeline = require("./region-metrics-pipeline.js");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "region-metrics-pipeline-"));
try {
  const cache = path.join(temp, "cache");
  fs.mkdirSync(path.join(cache, "테스트시-테스트구", "2026-01-01_20260102T000000Z"), { recursive: true });
  fs.mkdirSync(path.join(cache, "테스트시-테스트구", "2026-02-01_20260202T000000Z"), { recursive: true });
  fs.writeFileSync(path.join(cache, "테스트시-테스트구", "2026-01-01_20260102T000000Z", "snapshot.json"), "{}");
  fs.writeFileSync(path.join(cache, "테스트시-테스트구", "2026-02-01_20260202T000000Z", "snapshot.json"), "{}");
  assert.match(pipeline.latestSnapshotPath(cache, "테스트시-테스트구"), /2026-02-01_20260202T000000Z\/snapshot\.json$/);

  assert.deepEqual(pipeline.parseArgs(["--execute", "--skip-collect", "--vault", temp]), {
    execute: true,
    collect: false,
    vaultRoot: temp,
    receiptPath: path.resolve("SYSTEM/CACHE/region-metrics/_shared/last-pipeline.json")
  });
  assert.throws(() => pipeline.readReceipt("{}"), /execute 모드/);
  assert.throws(() => pipeline.readReceipt("not-json"), /JSON 파싱 실패/);
  assert.throws(() => pipeline.runCollector(() => ({ status: 1, stdout: "", stderr: "source failed" })), /노트 반영을 중단/);
  assert.throws(() => pipeline.runCollector(() => ({ status: 0, stdout: JSON.stringify({ mode: "execute", total_succeeded: 82, total_failed: 1 }), stderr: "" })), /완전하지 않습니다/);
  const receipt = pipeline.runCollector(() => ({ status: 0, stdout: JSON.stringify({ mode: "execute", total_succeeded: 83, total_failed: 0 }), stderr: "" }));
  assert.equal(receipt.total_succeeded, 83);

  const plan = [{ region_key: "a", changed: false, content: "x" }, { region_key: "b", changed: true, content: "y" }];
  assert.deepEqual(pipeline.applyPlan(plan, false), {
    selected: 2,
    changed: 1,
    unchanged: 1,
    executed: false,
    regions: [{ region_key: "a", changed: false }, { region_key: "b", changed: true }]
  });

  console.log("region metrics pipeline tests: PASS");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
