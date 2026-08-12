#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  HUBS, RealObsidianHarness, assertDiagnosticClean, diagnosticFailures, matrixAggregate,
} = require("./real_obsidian_harness.js");

const ENABLED = process.env.TASK13A_REAL_OBSIDIAN_DIAGNOSTICS === "1";
const OUTPUT = process.env.TASK13A_DIAGNOSTIC_OUTPUT || path.join(os.tmpdir(), "task13a-real-obsidian-diagnostics.json");
const VISUAL_DIAGNOSTIC_OPTIONS = Object.freeze({ requireStateCoverage: false });
const MODAL_ONLY = process.env.TASK13A_OBJECT_CREATOR_MODAL_ONLY === "1";
const EXPECT_MODAL_RED = process.env.TASK13A_OBJECT_CREATOR_EXPECT_RED === "1";

function rankFailures(rows) {
  const rank = new Map();
  for (const row of rows) for (const failure of diagnosticFailures(row, VISUAL_DIAGNOSTIC_OPTIONS)) {
    const offender = failure.offender || failure.recovery && failure.recovery.elements && failure.recovery.elements[0] || {};
    const key = JSON.stringify([failure.kind, offender.selector || "", offender.textSentinel || "", offender.matchedRules && offender.matchedRules.at(-1) || null]);
    const current = rank.get(key) || { kind: failure.kind, selector: offender.selector || null, role: offender.role || null, textSentinel: offender.textSentinel || null, matchedRule: offender.matchedRules && offender.matchedRules.at(-1) || null, count: 0, workspaces: new Set(), widths: new Set() };
    current.count += 1; current.workspaces.add(row.matrix.workspaceId); current.widths.add(row.matrix.width); rank.set(key, current);
  }
  return [...rank.values()].map((item) => ({ ...item, workspaces: [...item.workspaces].sort(), widths: [...item.widths].sort((a, b) => a - b) })).sort((a, b) => b.count - a.count || String(a.kind).localeCompare(String(b.kind)) || String(a.selector).localeCompare(String(b.selector)));
}

test("real Obsidian 288-matrix diagnostic gate covers Hub roots and Object Creator", { skip: !ENABLED, timeout: 1200000 }, async () => {
  let harness = null;
  const rows = [];
  let cleanup = null;
  let identity = null;
  try {
    harness = await RealObsidianHarness.start("task13a-diagnostics", { fixtureMutation: { objectCreatorUndersized: EXPECT_MODAL_RED } });
    identity = {
      source: harness.runtime.sourceIdentity,
      cloneBundleIdentifier: harness.runtime.bundleIdentifier,
      nonce: harness.runtime.nonce,
      port: harness.runtime.port,
      pid: harness.ownership.root.pid,
      pgid: harness.ownership.root.pgid,
      start: harness.runtime.start,
      protectedHash: harness.runtime.protectedSnapshot.hash,
    };
    if (!MODAL_ONLY) for (const [workspaceId] of HUBS) {
      const execution = await harness.openWorkspace(workspaceId);
      for (const width of [390, 834, 1068, 1440]) for (const theme of ["light", "dark"]) for (const zoom of [1, 2]) for (const forcedColors of [false, true]) {
        try {
          rows.push({ execution, ...await harness.capture(workspaceId, width, theme, zoom, forcedColors, "normal") });
        } catch (error) {
          if (!/TASK13A_(?:ZERO|DUPLICATE|IDENTITY)_ACTIVE_PRODUCTION_OWNER/u.test(error.message)) throw error;
          rows.push({ execution, ...await harness.captureSelectionFailure(error, workspaceId, width, theme, zoom, forcedColors, "normal") });
        }
      }
    }
    const modalMatrix = EXPECT_MODAL_RED ? [[390, "light", 1, false]] : (() => { const values = []; for (const width of [390, 834, 1068, 1440]) for (const theme of ["light", "dark"]) for (const zoom of [1, 2]) for (const forcedColors of [false, true]) values.push([width, theme, zoom, forcedColors]); return values; })();
    for (const [width, theme, zoom, forcedColors] of modalMatrix) {
      const execution = await harness.openWorkspace("home");
      rows.push({ execution, ...await harness.captureObjectCreatorModal(width, theme, zoom, forcedColors) });
    }
  } finally {
    if (harness) cleanup = await harness.close();
  }
  if (EXPECT_MODAL_RED) {
    assert.equal(rows.length, 1, "focused mutation cardinality");
    assert.ok(rows.some((row) => diagnosticFailures(row, VISUAL_DIAGNOSTIC_OPTIONS).some((failure) => failure.kind === "target_lt_44")), "undersized Object Creator mutation must make diagnostics RED");
    assert.equal(cleanup.audit.equal, true, "mutation diagnostic remains byte-read-only");
    assert.equal(cleanup.removed, true, "mutation diagnostic runtime residue");
    assert.equal(cleanup.portReusable, true, "mutation diagnostic port residue");
    return;
  }
  assert.equal(rows.length, MODAL_ONLY ? 32 : 288, "exact diagnostic matrix cardinality");
  assert.equal(rows.filter((row) => row.matrix.state === "normal").length, MODAL_ONLY ? 0 : 256, "normal Hub matrix cardinality");
  assert.equal(rows.filter((row) => row.matrix.state === "object-creator-modal").length, 32, "Object Creator modal matrix cardinality");
  const receipt = {
    schema_version: "task16-frozen-real-obsidian-visual-v3",
    dimensions: { workspaces: HUBS.map(([id]) => id), widths: [390, 834, 1068, 1440], themes: ["light", "dark"], zooms: [1, 2], forced_colors: [false, true], states: { normal: { workspaces: HUBS.map(([id]) => id), rows: 256 }, object_creator_modal: { workspaces: ["home"], rows: 32 } } },
    row_count: rows.length,
    aggregate_sha256: matrixAggregate(rows),
    rows,
    launch_contract: cleanup.launch_contract,
    cleanup: { vault_hash_equal: cleanup.audit.equal, protected_identity_exact: cleanup.protectedContinuity.exact, runtime_removed: cleanup.removed, port_reusable: cleanup.portReusable },
  };
  receipt.digest = require("node:crypto").createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
  if (!MODAL_ONLY) fs.writeFileSync(OUTPUT, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  assert.deepEqual(cleanup.launch_contract, { mock_keychain_count: 1, child_home_task_owned: true, inherited_real_home: false }, "diagnostic clone keychain/HOME isolation");
  assert.equal(cleanup.audit.equal, true, "diagnostics must remain byte-read-only");
  assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected identity changed");
  assert.equal(cleanup.runtimeRootRemoved, undefined, "receipt schema must not claim an unverified cleanup field");
  assert.equal(cleanup.removed, true, "diagnostic runtime root residue");
  assert.equal(cleanup.portReusable, true, "diagnostic CDP port residue");
  for (const row of rows) assertDiagnosticClean(row, VISUAL_DIAGNOSTIC_OPTIONS);
});

module.exports = { rankFailures };
