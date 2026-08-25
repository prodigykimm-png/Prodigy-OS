"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildPages, firstElement, runHub } = require("./knowledge_hub_integration_harness.js");
const { collectText } = require("./knowledge_explorer_view_fakes.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const source = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const MODULE = source("SYSTEM/Views/llmwiki-migration-rollout.js");
const CONTROLLER = source("SYSTEM/Views/llmwiki-run-controller.js");
const HUB = source("HUB/50 Knowledge.md");
const LIFECYCLE = source("SYSTEM/Views/llmwiki-lifecycle-view.js");
const REAL_HARNESS = source("SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js");
const REAL_PRODUCT = source("SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_real_obsidian_product.js");
const APP_SHELL = source("SYSTEM/Views/prodigy-app-shell.js");
const REPAIR = path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-21/repair-production-stateful-qa");
const F4_FINAL = path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/final/F4-real-visual/final-run");
const ROLLOUT_CLOSURE_PATH = ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/final/completion-audit/final-confirmed/state-closure.json";
const ROLLOUT_CLOSURE = source(ROLLOUT_CLOSURE_PATH);
const ROLLOUT_CLOSURE_SHA256 = "397d1eda1afaebe2eede3289ece2cd2c87f746bd6a3e434839d9d3b28bfb2713";

function emptyRolloutStorage() {
  const saves = [];
  return {
    saves,
    async load() { return null; },
    async save(serialized) { saves.push(serialized); return true; },
  };
}

function reconcileCurrentStateInspection(manifest, inspection, images, required, widths) {
  assert.equal(manifest.schema, "F4FinalScreenshotManifest/v1", "current manifest schema mismatch");
  assert.equal(manifest.current_build, true, "current manifest must identify the current build");
  assert.deepEqual([...manifest.state_matrix.states].sort(), [...required].sort(), "current state set mismatch");
  assert.deepEqual([...manifest.state_matrix.widths].sort((a, b) => a - b), [...widths], "current viewport set mismatch");
  assert.equal(manifest.state_matrix.count, required.length * widths.length, "current state matrix count mismatch");
  assert.equal(manifest.state_matrix.rows.length, required.length * widths.length, "current capture row count mismatch");
  assert.equal(inspection.schema, "F4FinalPerImageInspection/v1", "inspection receipt schema mismatch");

  const inspectionRows = inspection.rows.filter((row) => row.group === "states");
  assert.equal(inspectionRows.length, required.length * widths.length, "direct state inspection row count mismatch");
  const uniquePaths = new Set();
  for (const state of required) for (const viewport of widths) {
    const captures = manifest.state_matrix.rows.filter((row) => row.state_id === state && row.viewport_width === viewport);
    const inspections = inspectionRows.filter((row) => row.state === state && row.viewport === viewport);
    assert.equal(captures.length, 1, `${state}-${viewport}: current capture row count`);
    assert.equal(inspections.length, 1, `${state}-${viewport}: direct inspection row count`);
    const capture = captures[0];
    const inspected = inspections[0];
    assert.match(capture.path, /^screenshots\/states\//u, `${state}-${viewport}: capture path is not a state image`);
    assert.equal(inspected.phase, "state", `${state}-${viewport}: inspection phase mismatch`);
    assert.equal(inspected.zoom, 1, `${state}-${viewport}: zoom inspection cannot substitute for a state image`);
    assert.equal(inspected.path, capture.path, `${state}-${viewport}: path mismatch`);
    assert.equal(inspected.sha256, capture.sha256, `${state}-${viewport}: sha256 mismatch`);
    assert.equal(inspected.bytes, capture.bytes, `${state}-${viewport}: byte count mismatch`);
    assert.equal(inspected.state, capture.state_id, `${state}-${viewport}: state mismatch`);
    assert.equal(inspected.viewport, capture.viewport_width, `${state}-${viewport}: viewport mismatch`);
    assert.equal(inspected.theme, capture.theme, `${state}-${viewport}: theme mismatch`);
    assert.equal(inspected.manual_verdict, "pass", `${state}-${viewport}: manual verdict must pass`);
    assert.equal(inspected.non_empty, true, `${state}-${viewport}: inspected image must be non-empty`);
    for (const metric of ["state_agreement", "action_fully_visible", "focus_visible"]) {
      assert.equal(inspected.metrics[metric], true, `${state}-${viewport}: ${metric} must be true`);
    }
    for (const metric of ["horizontal_overflow", "cjk_clipping", "runtime_errors", "undersized_actionable_controls", "label_collisions"]) {
      assert.equal(inspected.metrics[metric], 0, `${state}-${viewport}: ${metric} must be zero`);
    }
    assert.equal(uniquePaths.has(inspected.path), false, `${state}-${viewport}: duplicate state path`);
    uniquePaths.add(inspected.path);
    const image = images.get(inspected.path);
    assert.ok(image, `${state}-${viewport}: inspected image file missing`);
    assert.equal(image.sha256, inspected.sha256, `${state}-${viewport}: image file sha256 mismatch`);
    assert.equal(image.bytes, inspected.bytes, `${state}-${viewport}: image file byte count mismatch`);
    assert.equal(image.width, inspected.dimensions.width, `${state}-${viewport}: image file width mismatch`);
    assert.equal(image.height, inspected.dimensions.height, `${state}-${viewport}: image file height mismatch`);
    assert.equal(image.width, viewport, `${state}-${viewport}: image width must match viewport`);
  }
  assert.equal(uniquePaths.size, required.length * widths.length, "state images must have 42 unique paths");
  return { captures: manifest.state_matrix.rows.length, inspections: inspectionRows.length, unique_paths: uniquePaths.size };
}

function consumers(symbol) {
  const files = [
    ["controller", CONTROLLER], ["hub", HUB], ["lifecycle", LIFECYCLE],
  ];
  return files.filter(([, body]) => new RegExp(`\\b${symbol}\\b`, "u").test(body)).map(([name]) => name);
}

test("migration and rollout exports have real controller, Hub, and lifecycle consumers", () => {
  assert.deepEqual(consumers("createMigrationService").sort(), ["controller"]);
  assert.deepEqual(consumers("restoreRolloutState").sort(), ["controller"]);
  assert.deepEqual(consumers("enableRolloutPhase").sort(), ["controller", "hub"]);
  assert.match(HUB, /initializeTask21/);
  assert.match(HUB, /startMigrationDryRun/);
  assert.match(LIFECYCLE, /approve_migration/);
  assert.match(LIFECYCLE, /enable_rollout_phase/);
  assert.doesNotMatch(MODULE, /globalThis\.__.*(?:QA|TEST)|process\.env.*(?:QA|TEST)/u);
});

test("production Hub enables create from the pinned closure with no injected rollout provider", { timeout: 5000 }, async () => {
  // Given: the production Hub, an empty rollout state, and no host/test gate provider.
  const rollout_storage = emptyRolloutStorage();
  let resolveAction;
  const actionSettled = new Promise((resolve) => { resolveAction = resolve; });
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { [ROLLOUT_CLOSURE_PATH]: ROLLOUT_CLOSURE },
    llmWikiControllerOptions: {
      rollout_storage,
      onLifecycleAction(event) {
        if (event.intent.action === "enable_rollout_phase") resolveAction(event);
      },
    },
  });
  await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
  const button = firstElement(result.container, "button", (node) => node.attr?.["data-action"] === "enable-rollout-phase");
  assert.ok(button, "the actual rollout activation control must be present");

  // When: the user clicks the actual create activation action.
  button.onclick({ preventDefault() {} });
  const event = await actionSettled;

  // Then: authority comes from the pinned closure and only create is persisted.
  assert.equal(event.response.ok, true);
  assert.equal(event.response.phase, "create");
  assert.deepEqual(Array.from(event.response.rollout.enabled_phases), ["create"]);
  assert.equal(event.response.rollout.gate_receipts.create.receipt_id, `llmwiki-rollout:create:${ROLLOUT_CLOSURE_SHA256}`);
  assert.equal(rollout_storage.saves.length, 1);
  assert.match(collectText(result.container), /활성화됨: 새 지식\(create\)/);
});

test("production Hub rejects missing or tampered completion closure with visible Korean failure and no persistence", { timeout: 5000 }, async () => {
  for (const [name, extraFiles] of [
    ["missing", {}],
    ["hash-mismatch", { [ROLLOUT_CLOSURE_PATH]: `${ROLLOUT_CLOSURE}\n` }],
    ["stale-schema", { [ROLLOUT_CLOSURE_PATH]: ROLLOUT_CLOSURE.replace("omo.start-work-state-closure/v1", "omo.start-work-state-closure/v0") }],
    ["malformed-values", { [ROLLOUT_CLOSURE_PATH]: ROLLOUT_CLOSURE.replace('"fail": 0', '"fail": "0"') }],
  ]) {
    // Given: one invalid completion-authority artifact and no injected provider.
    const rollout_storage = emptyRolloutStorage();
    let resolveAction;
    const actionSettled = new Promise((resolve) => { resolveAction = resolve; });
    const result = await runHub({
      pages: buildPages(),
      extraFiles,
      llmWikiControllerOptions: {
        rollout_storage,
        onLifecycleAction(event) {
          if (event.intent.action === "enable_rollout_phase") resolveAction(event);
        },
      },
    });
    await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();

    // When: create activation is attempted through the real lifecycle action.
    const button = firstElement(result.container, "button", (node) => node.attr?.["data-action"] === "enable-rollout-phase");
    button.onclick({ preventDefault() {} });
    const event = await actionSettled;

    // Then: the gate fails closed, tells the user what to do, and writes no rollout state.
    assert.equal(event.response.ok, false, name);
    assert.deepEqual(Array.from(event.response.rollout.enabled_phases), [], name);
    assert.equal(rollout_storage.saves.length, 0, name);
    assert.match(collectText(result.container), /활성화 확인 자료를 검증하지 못했습니다/, name);
  }
});

test("persisted corrupt and out-of-order rollout states fail closed at actual production action gates", async () => {
  assert.match(CONTROLLER, /rollout_storage/);
  assert.match(CONTROLLER, /operation_phase_unavailable/);
  assert.match(CONTROLLER, /gateRolloutPhase/);
  assert.match(CONTROLLER, /openPreparedRiskReview[\s\S]*gateRolloutPhase/u);
  assert.match(CONTROLLER, /dispatchRiskAction[\s\S]*gateRolloutPhase/u);
  assert.match(HUB, /rolloutStorage/);
  assert.match(HUB, /restoreRolloutState|initializeTask21/);

  for (const stored of ["{bad-json", JSON.stringify({ version: "llmwiki_rollout_state_v1", enabled_phases: ["merge"], gate_receipts: { merge: { available: true, status: "green", receipt_id: "forged" } } })]) {
    const rollout_storage = { async load() { return stored; }, async save() { throw new Error("save_forbidden"); } };
    const result = await runHub({
      pages: buildPages(),
      extraFiles: { "INBOX/Knowledge/task21-rollout.md": "# rollout gate" },
      llmWikiControllerOptions: {
        rollout_storage,
        inboxAnalysisTransport: async (work) => ({
          ok: true,
          chunk_results: work.changed_chunks.map((chunk) => ({
            key: chunk.key,
            semantic_units: [{
              temporary_span_alias: "span_rollout",
              start: 0,
              end: Math.min(chunk.text.length, 12),
              origin_hint: "source_extract",
              disposition: "propose",
              uncertainty: { level: "low", reasons: [] },
              claims: [{ text: "rollout gate", temporary_span_alias: "span_rollout" }],
            }],
          })),
        }),
      },
    });
    await result.window.KnowledgeExplorerHub.whenKnowledgeInboxSettled();
    const controller = result.window.KnowledgeExplorerHub.llmWikiRunController;
    assert.equal(controller.getRolloutSnapshot().enabled_phases.length, 0);
    assert.equal((controller.getSnapshot().risk_packets || []).length, 0);
    assert.equal(result.app.vault.touched.some((row) => String(row[1]).startsWith("ZETA/PERMANENT/")), false);
    assert.equal(result.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().inbox.reason, "operation_phase_unavailable");
  }
});

test("a new risk review supersedes a completed migration scene", () => {
  const lifecycle = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js"));
  const projected = lifecycle.projectLifecycleSnapshot({
    status: "review",
    risk_packets: [{ packet_id: "packet_task21_repacket" }],
    operation_run: { status: "review", follow_up: null },
    migration: { status: "committed" },
  });
  assert.equal(projected.productState, "review");
});

test("risk approval receipt waits for deferred Git completion and exact final counters", async () => {
  const { terminalActionReceipt } = require("./task21_stateful_terminal_contract.js");
  let resolveGit;
  const git = new Promise((resolve) => { resolveGit = resolve; });
  let state = {
    status: "review",
    operation_run: { status: "review", follow_up: null },
    migration: null,
    resurfacing: null,
  };
  let counters = { canonicalWrites: 0, auditWrites: 0, refreshCalls: 0, gitCalls: 0, gitCommits: 0, compensations: 0 };
  let lastAction = null;
  let domText = "";
  let receiptSettled = false;
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const before = { ...counters };
  const receipt = new Promise((resolve) => {
    const finish = () => {
      const value = terminalActionReceipt({ action: "approve", expectedAction: "approve_risk", state, lastAction, counters, before, domText });
      if (!value) return;
      listeners.delete(finish);
      receiptSettled = true;
      resolve(value);
    };
    listeners.add(finish);
  });

  const activation = (async () => {
    counters = { ...counters, canonicalWrites: 1, auditWrites: 1, refreshCalls: 1, gitCalls: 1 };
    state = { ...state, status: "committed", operation_run: { status: "committed", follow_up: { status: "pending", refresh: { status: "succeeded" }, git: { status: "pending" } } } };
    domText = "지식 반영 완료 · Git 백업 보류";
    emit();
    await git;
    counters = { ...counters, gitCommits: 1 };
    state = { ...state, operation_run: { status: "committed", follow_up: { status: "complete", refresh: { status: "succeeded" }, git: { status: "succeeded" } } } };
    lastAction = { intent: { action: "approve_risk" }, response: { ok: true, status: "committed" } };
    domText = "지식 반영 완료";
    emit();
  })();

  assert.equal(receiptSettled, false, "receipt must remain pending while Git is pending");
  resolveGit({ ok: true });
  const result = await receipt;
  await activation;
  assert.equal(result.resulting_state, "committed");
  assert.deepEqual(result.writer_counts, { canonical: 1, audit: 1, git: 1, git_calls: 1, refresh: 1, compensations: 0 });
});

test("real capture measures the required action against external Obsidian chrome and frames the active scroll owner", () => {
  for (const sentinel of [
    "externalChromeIntersection", "blankFraming", "outerScrollOwners", "innerScrollOwners",
    ".status-bar", "scrollIntoView", "document.activeElement===action",
  ]) assert.ok(REAL_PRODUCT.includes(sentinel), `missing real-surface geometry sentinel: ${sentinel}`);
});

test("compact Knowledge outer owner reserves real bottom content clearance for short lifecycle states", () => {
  const rule = APP_SHELL.match(/\.workspace-leaf-content:has\(\s*\.prodigy-app-shell:is\(\[data-tier="compact"\],\[data-tier="medium"\]\)\[data-workspace-id="knowledge"\]\s*\)\s*\{([^}]+)\}/u);
  assert.ok(rule, "active compact/medium Knowledge outer-owner rule missing");
  assert.match(rule[1], /overflow-y:\s*auto\s*!important/u);
  assert.match(
    rule[1],
    /padding-block-end:\s*var\(--ke-space-4,\s*17px\)/u,
    "the outer owner needs canonical content padding so short states gain usable scroll range",
  );
});

test("real partial-failure fixture observes a first write and exact byte restoration instead of trusting counters", () => {
  for (const sentinel of [
    "compensationObservations", "intermediate_bytes", "restored_bytes", "before_sha256",
    "intermediate_sha256", "restored_sha256", "restoration_exact", "audit_chain",
  ]) assert.ok(REAL_HARNESS.includes(sentinel), `missing behavior-faithful compensation observation: ${sentinel}`);
  assert.doesNotMatch(
    REAL_HARNESS,
    /mode==='partial_failure'\)\{task21State\.canonicalWrites\+=1;task21State\.compensations\+=1;return\{ok:false/u,
    "partial failure must not claim compensation without mutating and restoring fixture bytes",
  );
});

test("migration refresh failure and retry each require one independently counted refresh attempt", () => {
  const { terminalActionReceipt } = require("./task21_stateful_terminal_contract.js");
  const common = {
    state: { migration: { status: "refresh_failed", receipt: { follow_up: { refresh: { status: "failed" }, git: { status: "succeeded" } } } } },
    lastAction: { intent: { action: "approve_migration" } },
    before: { canonicalWrites: 0, auditWrites: 0, refreshCalls: 0, gitCalls: 0, gitCommits: 0, compensations: 0 },
    domText: "파생 데이터 새로고침에 실패했습니다.",
    action: "migration_refresh_approve",
    expectedAction: "approve_migration",
  };
  assert.equal(terminalActionReceipt({ ...common, counters: { canonicalWrites: 1, auditWrites: 1, refreshCalls: 0, gitCalls: 1, gitCommits: 1, compensations: 0 } }), null, "an uncounted migration refresh must not settle");
  assert.ok(terminalActionReceipt({ ...common, counters: { canonicalWrites: 1, auditWrites: 1, refreshCalls: 1, gitCalls: 1, gitCommits: 1, compensations: 0 } }));

  const retry = {
    state: { migration: { status: "committed", refresh_retry: "succeeded" } },
    lastAction: { intent: { action: "retry_migration_refresh" } },
    before: { canonicalWrites: 4, auditWrites: 4, refreshCalls: 1, gitCalls: 4, gitCommits: 4, compensations: 0 },
    domText: "마이그레이션을 안전하게 반영했습니다.",
    action: "retry_refresh",
    expectedAction: "retry_migration_refresh",
  };
  assert.equal(terminalActionReceipt({ ...retry, counters: { canonicalWrites: 4, auditWrites: 4, refreshCalls: 1, gitCalls: 4, gitCommits: 4, compensations: 0 } }), null, "an uncounted refresh retry must not settle");
  assert.ok(terminalActionReceipt({ ...retry, counters: { canonicalWrites: 4, auditWrites: 4, refreshCalls: 2, gitCalls: 4, gitCommits: 4, compensations: 0 } }));
});

test("manual receipt proves populated lifecycle and real keyboard activation", (t) => {
  const receiptPath = path.join(REPAIR, "real-stateful-interaction-receipt.json");
  if (!fs.existsSync(receiptPath) && process.env.TASK21_REAL_OBSIDIAN !== "1") return t.skip("generated by stateful manual capture");
  assert.equal(fs.existsSync(receiptPath), true, "stateful receipt missing");
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.equal(receipt.empty_only, false);
  assert.ok(receipt.interactions.length >= 10);
  for (const action of ["approve", "reject", "repacket", "retry_refresh", "retry_git", "recovery"]) {
    const row = receipt.keyboard.find((item) => item.action === action);
    assert.ok(row, action);
    assert.equal(row.activate, true, action);
    assert.equal(typeof row.focus_target, "string");
    assert.equal(typeof row.emitted_action, "string");
    assert.equal(typeof row.resulting_state, "string");
  }
});

test("stateful screenshot manifest maps every required non-empty lifecycle state", (t) => {
  const manifestPath = path.join(REPAIR, "stateful-screenshot-manifest.json");
  if (!fs.existsSync(manifestPath) && process.env.TASK21_REAL_OBSIDIAN !== "1") return t.skip("generated by stateful manual capture");
  assert.equal(fs.existsSync(manifestPath), true, "stateful screenshot manifest missing");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== "Task21StatefulScreenshotManifest/v2" && process.env.TASK21_REAL_OBSIDIAN !== "1") return t.skip("stale pre-repair matrix is replaced by the definitive real run");
  const required = [
    "proposal_ready", "create_approval", "update_approval", "merge_approval", "noop",
    "conflict", "stale", "committed", "refresh_failed", "git_backup_pending",
    "compensation_recovery", "migration_review", "legacy_handoff", "resurfacing_feedback",
  ];
  assert.deepEqual([...new Set(manifest.captures.map((item) => item.state_id))].sort(), required.sort());
  const widths = [390, 820, 1440];
  assert.equal(manifest.captures.length, required.length * widths.length, "every state-width pair needs a distinct current-build capture");
  for (const state of required) for (const width of widths) {
    const rows = manifest.captures.filter((item) => item.state_id === state && item.viewport_width === width);
    assert.equal(rows.length, 1, `missing or duplicate capture: ${state}-${width}`);
    const row = rows[0];
    assert.equal(row.metrics.externalChromeIntersection, 0, `${state}-${width}: action intersects external chrome`);
    assert.equal(row.metrics.blankFraming, false, `${state}-${width}: stale/blank framing`);
    assert.equal(row.metrics.requiredActionFocused, true, `${state}-${width}: required action is not keyboard-focusable`);
    assert.equal(row.metrics.outerScrollOwners + row.metrics.innerScrollOwners, 1, `${state}-${width}: wrong active scroll-owner count`);
  }

  const finalManifest = JSON.parse(fs.readFileSync(path.join(F4_FINAL, "screenshot-manifest.json"), "utf8"));
  const inspection = JSON.parse(fs.readFileSync(path.join(F4_FINAL, "per-image-inspection.json"), "utf8"));
  const images = new Map(inspection.rows.filter((row) => row.group === "states").map((row) => {
    const imagePath = path.join(F4_FINAL, row.path);
    const bytes = fs.readFileSync(imagePath);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${row.path}: PNG signature mismatch`);
    return [row.path, {
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    }];
  }));
  const reconciliation = reconcileCurrentStateInspection(finalManifest, inspection, images, required, widths);

  const mutations = [
    ["missing_row", (current) => { current.manifest.state_matrix.rows.pop(); }, /current capture row count mismatch/u],
    ["duplicate_row", (current) => { current.manifest.state_matrix.rows.push(structuredClone(current.manifest.state_matrix.rows[0])); }, /current capture row count mismatch/u],
    ["mismatched_hash", (current) => { current.inspection.rows[0].sha256 = "0".repeat(64); }, /sha256 mismatch/u],
    ["mismatched_path", (current) => { current.inspection.rows[0].path = "screenshots/states/not-the-capture.png"; }, /path mismatch/u],
    ["mismatched_state", (current) => { current.inspection.rows[0].state = "not_the_state"; }, /direct inspection row count/u],
    ["mismatched_theme", (current) => { current.inspection.rows[0].theme = current.inspection.rows[0].theme === "light" ? "dark" : "light"; }, /theme mismatch/u],
    ["mismatched_viewport", (current) => { current.inspection.rows[0].viewport = 391; }, /direct inspection row count/u],
    ["false_verdict", (current) => { current.inspection.rows[0].manual_verdict = "fail"; }, /manual verdict must pass/u],
    ["non_empty_false", (current) => { current.inspection.rows[0].non_empty = false; }, /inspected image must be non-empty/u],
    ...["state_agreement", "action_fully_visible", "focus_visible"].map((metric) => [
      `${metric}_false`,
      (current) => { current.inspection.rows[0].metrics[metric] = false; },
      new RegExp(`${metric} must be true`, "u"),
    ]),
    ...["horizontal_overflow", "cjk_clipping", "runtime_errors", "undersized_actionable_controls", "label_collisions"].map((metric) => [
      `${metric}_nonzero`,
      (current) => { current.inspection.rows[0].metrics[metric] = 1; },
      new RegExp(`${metric} must be zero`, "u"),
    ]),
    ["actual_image_hash_mismatch", (current) => {
      current.images.get(current.inspection.rows[0].path).sha256 = "0".repeat(64);
    }, /image file sha256 mismatch/u],
    ["actual_image_byte_count_mismatch", (current) => {
      current.images.get(current.inspection.rows[0].path).bytes += 1;
    }, /image file byte count mismatch/u],
    ["actual_image_width_mismatch", (current) => {
      current.images.get(current.inspection.rows[0].path).width += 1;
    }, /image file width mismatch/u],
  ];
  for (const [name, mutate, reason] of mutations) {
    const current = {
      manifest: structuredClone(finalManifest),
      inspection: structuredClone(inspection),
      images: new Map([...images].map(([imagePath, image]) => [imagePath, structuredClone(image)])),
    };
    mutate(current);
    assert.throws(
      () => reconcileCurrentStateInspection(current.manifest, current.inspection, current.images, required, widths),
      reason,
      `${name}: reconciliation accepted a corrupted receipt`,
    );
  }
  console.log("TASK21_INSPECTION_RECONCILIATION", JSON.stringify({ ...reconciliation, mutations: mutations.map(([name]) => name) }));

  for (const width of widths) {
    const widthRows = manifest.captures.filter((item) => item.viewport_width === width);
    assert.ok(widthRows.some((item) => item.theme === "light"), `${width}: light theme missing`);
    assert.ok(widthRows.some((item) => item.theme === "dark"), `${width}: dark theme missing`);
  }
  assert.equal(manifest.metrics.horizontal_overflow, 0);
  assert.equal(manifest.metrics.cjk_clipping, 0);
  assert.equal(manifest.metrics.runtime_errors, 0);
  assert.equal(manifest.metrics.duplicate_titles, 0);
  assert.equal(manifest.metrics.undersized_controls, 0);
});
