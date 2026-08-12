#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  HUBS, STRUCTURAL_SCENARIOS, RealObsidianHarness, scenarioAggregate,
  snapshotProtected, validateScenarioPlan,
} = require("./real_obsidian_harness.js");

const ENABLED = process.env.TASK13A_REAL_OBSIDIAN_SCENARIOS === "1";
const OUTPUT = process.env.TASK13A_SCENARIO_OUTPUT || path.join(os.tmpdir(), "task13a-real-obsidian-scenarios.json");
const REQUESTED_WORKSPACES = new Set(String(process.env.TASK13A_SCENARIO_WORKSPACES || HUBS.map(([id]) => id).join(",")).split(",").map((value) => value.trim()).filter(Boolean));
const SELECTED_HUBS = HUBS.filter(([workspaceId]) => REQUESTED_WORKSPACES.has(workspaceId));
const PLAN = Object.freeze(SELECTED_HUBS.flatMap(([workspaceId]) => STRUCTURAL_SCENARIOS.map((state) => Object.freeze({ workspaceId, state, applicable: true }))));

async function runSession(index, protectedSnapshot) {
  const harness = await RealObsidianHarness.start(`task13a-scenarios-${index}`, { protectedSnapshot });
  const rows = []; let cleanup;
  try {
    for (const [workspaceId] of SELECTED_HUBS) {
      const entries = PLAN.filter((entry) => entry.workspaceId === workspaceId);
      await harness.mountStructuralWorkspace(workspaceId);
      for (const entry of entries) {
        if (process.env.TASK13A_SCENARIO_TRACE === "1") process.stderr.write(`TASK13A_TRACE drive ${index} ${entry.workspaceId} ${entry.state}\n`);
        const driven = await harness.driveStructuralScenario(entry.workspaceId, entry.state);
        if (process.env.TASK13A_SCENARIO_TRACE === "1") process.stderr.write(`TASK13A_TRACE capture ${index} ${entry.workspaceId} ${entry.state}\n`);
        const receipt = await harness.captureDrivenStructuralScenario(entry.workspaceId, entry.state);
        if (process.env.TASK13A_SCENARIO_TRACE === "1") process.stderr.write(`TASK13A_TRACE reset ${index} ${entry.workspaceId} ${entry.state}\n`);
        const reset = await harness.resetStructuralScenario(entry.workspaceId, entry.state);
        rows.push({ ...receipt, execution: driven.execution, consumption: driven.consumption, reset });
      }
      await harness.disposeStructuralWorkspace();
    }
  } finally { cleanup = await harness.close(); }
  return { index, rows, aggregateSha256: scenarioAggregate(rows), cleanup };
}

test("two real Obsidian sessions drive every explicit production structural-state scenario", { skip: !ENABLED, timeout: 900000 }, async () => {
  if (SELECTED_HUBS.length === HUBS.length) validateScenarioPlan(PLAN);
  else {
    assert.ok(SELECTED_HUBS.length > 0, "at least one known workspace is required");
    assert.equal(PLAN.length, SELECTED_HUBS.length * STRUCTURAL_SCENARIOS.length);
  }
  const protectedSnapshot = snapshotProtected();
  const sessions = [];
  const sessionCount = Number(process.env.TASK13A_SCENARIO_SESSIONS || 2);
  for (let index = 1; index <= sessionCount; index += 1) sessions.push(await runSession(index, protectedSnapshot));
  for (const session of sessions) {
    assert.equal(session.rows.length, PLAN.length);
    assert.equal(session.cleanup.audit.equal, true);
    assert.equal(session.cleanup.protectedContinuity.exact, true, session.cleanup.protectedContinuity.error || "protected identity changed");
    assert.equal(session.cleanup.removed, true);
    assert.equal(session.cleanup.portReusable, true);
  }
  const rows = sessions.flatMap((session) => session.rows);
  const failed = rows.filter((row) => row.applicable && !row.validation.ok);
  const receipt = { schemaVersion: 2, verdict: failed.length ? "HARNESS FAIL" : "HARNESS READY", applicability: PLAN, counts: { receipts: rows.length, applicable: rows.filter((row) => row.applicable).length, passed: rows.filter((row) => row.applicable && row.validation.ok).length, failed: failed.length }, sessions, aggregateSha256: scenarioAggregate(rows) };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  assert.equal(rows.length, PLAN.length * sessionCount);
  assert.deepEqual(failed.map((row) => ({ matrix: row.matrix, error: row.validation.error, driverError: row.driverError })), [], "every applicable production structural scenario must validate");
});

module.exports = { PLAN, runSession };
