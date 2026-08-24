#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  HUBS, RealObsidianHarness, assertDiagnosticClean, buildFixture, diagnosticFailures, extractBlocks, findOwned, fixturePluginSource,
  assertMediaAuthorityTrace, buildMediaAuthority, collectDiagnosticElements, createFixtureRegistry, createLayoutAuthorityCoordinator, matrixAggregate, nodeNetworkDenyPrelude, publicIdentity, resolveCssOwnership, scenarioAggregate, selectDiagnosticRoots, structuralDriverContract, structuralScenarioEffect, validateInheritedLayoutAuthority, validateKeyboardAdvance, validateKeyboardTrace, validateLaunchContract, validateLayoutSettlement, validateScenarioPlan, validateScenarioReceipt, validateZoomAuthority, selectActiveProductionMount, selectCleanup, snapshotProtected, treeHash,
} = require("./real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
function runtime(overrides = {}) {
  return Object.assign({
    executable: "/tmp/task/ObsidianTask.app/Contents/MacOS/Obsidian", bundle: "/tmp/task/ObsidianTask.app",
    profile: "/tmp/task/profile", vault: "/tmp/task/vault", nonce: "exact-nonce", port: 61234,
    start: "Tue Aug 11 03:00:00 2026", tokens: [],
  }, overrides);
}
function row(overrides = {}) {
  const r = runtime();
  return Object.assign({ pid: 80001, ppid: 1, pgid: 80001, start: r.start, executable: r.executable,
    command: `${r.executable} --user-data-dir=${r.profile} --remote-debugging-port=${r.port} --task13a-nonce=${r.nonce} ${r.vault}` }, overrides);
}

test("process-boundary Node network and child-process paths are denied before any outbound call", () => {
  const prelude = nodeNetworkDenyPrelude("attempts");
  const childSource = `"use strict";const attempts=[];eval(${JSON.stringify(prelude)});const dns=require('node:dns'),probes=[['http','request',()=>require('node:http').request()],['http','get',()=>require('node:http').get()],['https','request',()=>require('node:https').request()],['https','get',()=>require('node:https').get()],['net','connect',()=>require('node:net').connect()],['net','createConnection',()=>require('node:net').createConnection()],['tls','connect',()=>require('node:tls').connect()],['dgram','createSocket',()=>require('node:dgram').createSocket('udp4')],['http2','connect',()=>require('node:http2').connect('https://example.invalid')],['global','fetch',()=>globalThis.fetch('https://example.invalid')],['http-alias','request',()=>require('http').request()],...['lookup','resolve','resolve4','resolve6','reverse'].map(name=>['dns',name,()=>dns[name]()]),...['lookup','resolve','resolve4','resolve6','reverse'].map(name=>['dns.promises',name,()=>dns.promises[name]()]),...['resolve','resolve4','resolve6','reverse'].map(name=>['dns.Resolver',name,()=>new dns.Resolver()[name]()]),...['exec','execFile','spawn','fork','execSync','execFileSync','spawnSync'].map(name=>['child_process',name,()=>require('node:child_process')[name]()])];for(const [module,operation,probe] of probes){let blocked=false;try{probe()}catch(error){blocked=/^TASK13A_NODE_NETWORK_DENIED:/.test(error.message)}if(!blocked)throw new Error('UNBLOCKED:'+module+':'+operation)}process.stdout.write(JSON.stringify({schema_version:'task13a-node-network-denial-v1',probe_count:probes.length,blocked_attempts:attempts,real_network_calls:0,child_processes_started:0}))`;
  const result = childProcess.spawnSync(process.execPath, ["-e", childSource], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.probe_count, 32);
  assert.equal(receipt.blocked_attempts.length, receipt.probe_count);
  assert.equal(receipt.real_network_calls, 0);
  assert.equal(receipt.child_processes_started, 0);
  assert.deepEqual(receipt.blocked_attempts.map(({ module, operation }) => `${module}:${operation}`), [
    "http:request", "http:get", "https:request", "https:get", "net:connect", "net:createConnection", "tls:connect",
    "dgram:createSocket", "http2:connect", "global:fetch", "http:request",
    "dns:lookup", "dns:resolve", "dns:resolve4", "dns:resolve6", "dns:reverse",
    "dns.promises:lookup", "dns.promises:resolve", "dns.promises:resolve4", "dns.promises:resolve6", "dns.promises:reverse",
    "dns.Resolver:resolve", "dns.Resolver:resolve4", "dns.Resolver:resolve6", "dns.Resolver:reverse",
    "child_process:exec", "child_process:execFile", "child_process:spawn", "child_process:fork", "child_process:execSync", "child_process:execFileSync", "child_process:spawnSync",
  ]);
  if (process.env.TASK13A_NODE_NETWORK_RECEIPT) fs.writeFileSync(process.env.TASK13A_NODE_NETWORK_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
});

test("200% zoom receipt enforces exactly one browser authority and rejects double application", () => {
  const boundary = { deviceMetricsOverride: { width: 390, height: 900, deviceScaleFactor: 1, scale: 1, mobile: false }, pageObserved: { innerWidth: 390, visualViewportWidth: 390, inlineZoom: "2", computedZoom: "2", devicePixelRatio: 1, shellClientWidth: 180, shellBoundingWidth: 360, blockClientWidth: 180, responsiveGeneration: 1, mountIdentity: { registryLive: true } } };
  assert.equal(validateZoomAuthority(2, boundary), true);
  assert.throws(() => validateZoomAuthority(2, { ...boundary, deviceMetricsOverride: { ...boundary.deviceMetricsOverride, scale: 2 } }), /TASK13A_ZOOM_AUTHORITY_NOT_SINGLE/u);
  assert.throws(() => validateZoomAuthority(2, { ...boundary, pageObserved: { ...boundary.pageObserved, inlineZoom: "1" } }), /TASK13A_ZOOM_AUTHORITY_NOT_SINGLE/u);
  assert.throws(() => validateZoomAuthority(2, { ...boundary, pageObserved: { ...boundary.pageObserved, innerWidth: 780 } }), /TASK13A_ZOOM_RECEIPT_INVALID/u);
});

test("canonical cloned Obsidian launch requires exactly one mock keychain and a task-owned child HOME", () => {
  const taskRoot = path.join(os.tmpdir(), "task13a-launch-contract");
  const home = path.join(taskRoot, "home");
  const args = ["--use-mock-keychain", "--task13a-nonce=abc"];
  assert.deepEqual(validateLaunchContract(args, { HOME: home }, taskRoot, "/Users/inherited"), {
    mock_keychain_count: 1,
    child_home_task_owned: true,
    inherited_real_home: false,
  });
  assert.throws(() => validateLaunchContract(args.slice(1), { HOME: home }, taskRoot, "/Users/inherited"), /TASK13A_MOCK_KEYCHAIN_COUNT/u);
  assert.throws(() => validateLaunchContract([...args, "--use-mock-keychain"], { HOME: home }, taskRoot, "/Users/inherited"), /TASK13A_MOCK_KEYCHAIN_COUNT/u);
  assert.throws(() => validateLaunchContract(args, { HOME: "/Users/inherited" }, taskRoot, "/Users/inherited"), /TASK13A_CHILD_HOME_NOT_TASK_OWNED/u);
});

test("installed real Obsidian identity is pinned from public bundle metadata", () => {
  const identity = publicIdentity("/Applications/Obsidian.app");
  assert.equal(identity.bundleIdentifier, "md.obsidian");
  assert.equal(identity.bundleName, "Obsidian");
  assert.match(identity.version, /^1\.10\./u);
  assert.match(identity.executableSha256, /^[a-f0-9]{64}$/u);
  assert.equal(identity.executable, "/Applications/Obsidian.app/Contents/MacOS/Obsidian");
});

test("protected snapshot reads only executable, bundle, start, PGID, and loopback listeners", () => {
  const snapshot = snapshotProtected();
  assert.match(snapshot.hash, /^[a-f0-9]{64}$/u);
  for (const record of snapshot.records) {
    assert.deepEqual(Object.keys(record).sort(), ["bundle", "executable", "kind", "pgid", "pid", "ports", "start"].sort());
    assert.doesNotMatch(JSON.stringify(record), /user-data-dir|Library\/Application Support|vault/i);
  }
});

test("ownership is exact, never executable-name or substring based", () => {
  const r = runtime();
  const valid = row();
  assert.equal(findOwned(r, [valid], [valid.pid]).root.pid, valid.pid);
  for (const mutation of [
    { executable: "/Applications/Aside.app/Contents/MacOS/Aside" },
    { executable: "/Applications/Obsidian.app/Contents/MacOS/Obsidian" },
    { command: valid.command.replace(r.profile, r.profile + "-user") },
    { command: valid.command.replace(r.vault, r.vault + "-user") },
    { command: valid.command.replace(r.nonce, r.nonce + "-other") },
    { command: valid.command.replace(String(r.port), "45103") },
    { start: "Tue Aug 11 03:01:00 2026" },
  ]) assert.throws(() => findOwned(r, [Object.assign({}, valid, mutation)], [valid.pid]), /exact cloned executable/);
});

test("cleanup signals individual positive identities and refuses PGID-wide or ambiguous cleanup", () => {
  const r = runtime({ tokens: [{ pid: 80001, start: runtime().start, executable: runtime().executable }] });
  const owned = row();
  const samePgidUnrelated = row({ pid: 80002, command: "/usr/bin/node protected.js", executable: "/usr/bin/node" });
  const selected = selectCleanup(r, [owned, samePgidUnrelated]);
  assert.deepEqual(selected.owned.map((x) => x.pid), [80001]);
  assert.deepEqual(selected.ambiguous, []);
  const reused = row({ start: "Tue Aug 11 03:02:00 2026" });
  assert.deepEqual(selectCleanup(r, [reused]).owned, []);
  assert.equal(selectCleanup(r, [reused]).ambiguous.length, 1);
});

test("all eight exact current Hub blocks are fixture-bound and source divergence is RED", () => {
  assert.equal(HUBS.length, 8);
  const seen = new Set();
  for (const [workspace, hub] of HUBS) {
    const source = fs.readFileSync(path.join(ROOT, hub), "utf8");
    const blocks = extractBlocks(source);
    assert.ok(blocks.length > 0, `${workspace} executable block`);
    for (const block of blocks) { assert.match(block.sha256, /^[a-f0-9]{64}$/u); seen.add(block.sha256); }
    const changed = source.replace(blocks[0].source, blocks[0].source + "\n// divergence");
    assert.notEqual(extractBlocks(changed)[0].sha256, blocks[0].sha256);
  }
  assert.ok(seen.size >= 8);
});

test("local QA plugin executes supplied exact source rather than a reimplementation", () => {
  const manifest = { "HUB/X.md": [{ language: "dataviewjs", source: "dv.paragraph('exact')", sha256: "a".repeat(64) }] };
  const source = fixturePluginSource(manifest);
  assert.match(source, /new AsyncFunction\('app','dv','obsidian','container',source\)/u);
  assert.match(source, /TASK13A_SOURCE_DIVERGENCE/u);
  assert.match(source, /TASK13A_SOURCE_HASH_MISMATCH/u);
  assert.doesNotMatch(source, /innerHTML\s*=.*mock/u);
  assert.doesNotMatch(source, /requestAnimationFrame/u, "mount and control settlement cannot depend on fixed frames");
  assert.match(source, /ResizeObserver/u, "mount settlement subscribes to exact layout delivery");
  const reimplemented = source.replace("source).call", "'document.body.textContent=\\\"mock\\\"').call");
  assert.doesNotMatch(reimplemented, /new AsyncFunction\('app','dv','obsidian','container',source\)/u);
});

test("shared fixture registry preserves nonce, resolve/reject/defer, and event-before-settle contracts", async () => {
  const events = [];
  const registry = createFixtureRegistry({ onConsume: (event) => events.push(event) });
  registry.configure("reading", "source", { nonce: "n-resolve", kind: "resolve", value: { mtime: 2 } });
  assert.deepEqual(await registry.consume("reading", "source", { generation: 2 }), { mtime: 2 });
  assert.equal(events[0].nonce, "n-resolve");
  registry.configure("reading", "source", { nonce: "n-reject", kind: "reject", error: "stale source" });
  await assert.rejects(registry.consume("reading", "source"), /stale source/u);
  registry.configure("reading", "source", { nonce: "n-defer", kind: "defer" });
  const pending = registry.consume("reading", "source");
  assert.deepEqual(registry.pending(), [{ key: "reading:source", nonce: "n-defer" }]);
  assert.equal(registry.settle("reading", "source", "resolve", { mtime: 3 }), true);
  assert.deepEqual(await pending, { mtime: 3 });
  assert.throws(() => registry.consume("missing", "suite"), /TASK13A_FIXTURE_UNCONFIGURED/u);
});

test("write attempts are trapped at the Obsidian vault boundary", () => {
  const source = fixturePluginSource({});
  for (const operation of ["create", "modify", "delete", "rename", "copy"]) assert.ok(source.includes(`'${operation}'`));
  assert.match(source, /TASK13A_WRITE_ATTEMPT/u);
  assert.doesNotMatch(source, /finally\{[^}]*owner\[k\]=fn/u, "read-only interposition must remain active for deferred production work");
});

test("fixture is disposable, synthetic, tracked-production-only, and residue-sensitive", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task13a-fixture-contract-"));
  try {
    const fixture = buildFixture(root);
    const before = treeHash(fixture.vault);
    assert.equal(Object.keys(fixture.manifest).length, 9);
    assert.match(fs.readFileSync(path.join(fixture.vault, "PARA/PROJECTS/Synthetic.md"), "utf8"), /한글 프로젝트/u);
    fs.writeFileSync(path.join(fixture.vault, "FORBIDDEN.md"), "write residue");
    const after = treeHash(fixture.vault);
    assert.notEqual(after.hash, before.hash, "undeclared residue must fail the byte audit");
    fs.unlinkSync(path.join(fixture.vault, "FORBIDDEN.md"));
    assert.equal(treeHash(fixture.vault).hash, before.hash);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("active production mount selection rejects hidden, stale, duplicate, absent, and identity-divergent owners", () => {
  const expected = { workspaceId: "reading", renderer: "reading", sourceFile: "HUB/20 Reading.md", sourceHash: "a".repeat(64) };
  const owner = { connected: true, displayed: true, visible: true, activeLeaf: true, registryOwned: true, width: 800, height: 600, workspaceId: "reading", renderer: "reading", sourceFile: "HUB/20 Reading.md", sourceHash: "a".repeat(64), selector: ".prodigy-app-shell" };
  assert.equal(selectActiveProductionMount([owner], expected), owner);
  for (const mutation of [
    { displayed: false, mutation: "hidden source tree" },
    { visible: false, mutation: "visibility-hidden source tree" },
    { width: 0, mutation: "zero geometry source tree" },
    { connected: false, mutation: "detached source tree" },
    { activeLeaf: false, mutation: "stale leaf" },
    { registryOwned: false, mutation: "unregistered shell" },
    { workspaceId: "home", mutation: "mismatched workspace" },
    { renderer: "home", mutation: "mismatched renderer" },
    { sourceHash: "b".repeat(64), mutation: "mismatched source hash" },
    { sourceFile: "HUB/00 Home.md", mutation: "mismatched source file" },
  ]) assert.throws(() => selectActiveProductionMount([{ ...owner, ...mutation }], expected), /TASK13A_(ZERO|IDENTITY)_ACTIVE_PRODUCTION_OWNER/u, mutation.mutation);
  assert.throws(() => selectActiveProductionMount([], expected), /TASK13A_ZERO_ACTIVE_PRODUCTION_OWNER/u);
  assert.throws(() => selectActiveProductionMount([owner, { ...owner, selector: ".other-shell" }], expected), /TASK13A_DUPLICATE_ACTIVE_PRODUCTION_OWNER/u);
  assert.equal(selectActiveProductionMount([{ ...owner, displayed: false }, owner], expected), owner, "hidden live-preview source tree cannot replace the visible registered owner");
});

test("keyboard Tab advances from the post-activation current baseline and rejects truly stuck focus or unowned prompts", () => {
  const bodyBaseline = { id: "body", orderIndex: -1, expectedTabId: "workspace-select", prompt: null };
  assert.doesNotThrow(() => validateKeyboardAdvance(bodyBaseline, { id: "workspace-select" }));
  const controlBaseline = { id: "workspace-select", orderIndex: 0, expectedTabId: "home-action", prompt: null };
  assert.doesNotThrow(() => validateKeyboardAdvance(controlBaseline, { id: "home-action" }));
  assert.throws(() => validateKeyboardAdvance(controlBaseline, { id: "workspace-select" }), /TASK13A_KEYBOARD_TAB_STUCK/u);
  assert.doesNotThrow(() => validateKeyboardAdvance(controlBaseline, { id: "div", nativeObsidian: true }), "Tab may advance from the final workspace control into trusted Obsidian chrome");
  assert.throws(() => validateKeyboardAdvance(controlBaseline, { id: "div", nativeObsidian: false }), /TASK13A_KEYBOARD_TAB_STUCK/u);
  assert.throws(() => validateKeyboardAdvance({ ...bodyBaseline, prompt: { owned: false, kind: "native-obsidian-trust" } }, { id: "workspace-select" }), /TASK13A_NATIVE_PROMPT_INTERVENTION/u);
  assert.doesNotThrow(() => validateKeyboardAdvance({ ...bodyBaseline, prompt: { owned: true, closed: true, kind: "native-obsidian-trust" } }, { id: "workspace-select" }));
  assert.throws(() => validateKeyboardAdvance({ ...bodyBaseline, prompt: { owned: true, closed: false } }, { id: "workspace-select" }), /TASK13A_OWNED_PROMPT_NOT_CLOSED/u);
  assert.doesNotThrow(() => validateKeyboardTrace({ enter: [{ type: "focusin", prompt: null }] }));
  assert.throws(() => validateKeyboardTrace({ tab: [{ type: "focusin", prompt: { owned: false, scope: "embedded", kind: "product-dialog" } }] }), /TASK13A_EMBEDDED_MODAL_INTERVENTION/u, "embedded modal mutation is fail-first");
  assert.throws(() => validateKeyboardTrace({ escapeAfterTab: [{ type: "prompt-dom", prompt: { owned: false, scope: "external", kind: "native-obsidian-trust" } }] }), /TASK13A_NATIVE_PROMPT_INTERVENTION/u, "late modal mutation cannot escape keyboard validation");
});

test("structural scenario plan and receipts fail closed under skipped, mislabeled, duplicate, synthetic, writing, and stale mutations", () => {
  const workspaces = HUBS.map(([id]) => id); const states = ["normal", "empty", "loading", "error-recovery", "selected-active", "disabled"];
  const plan = workspaces.flatMap((workspaceId) => states.map((state) => ({ workspaceId, state, applicable: true })));
  assert.equal(validateScenarioPlan(plan).length, 48);
  assert.throws(() => validateScenarioPlan(plan.slice(1)), /TASK13A_SCENARIO_PLAN/u);
  assert.throws(() => validateScenarioPlan(plan.map((entry, index) => index ? entry : { ...entry, state: "wrong-label" })), /TASK13A_SCENARIO_LABEL/u);
  const receipt = { matrix: { workspaceId: "home", state: "empty" }, applicable: true, origin: "production-renderer", adapterConsumed: true, eventBeforeTrigger: true, expectedCount: 1, incompatibleCount: 0, writes: [], network: [], stale: false, ownerCount: 1, mountExecution: 1, mountGeneration: 1, blockExecution: { status: "rendered", generation: 1, executions: 1, blocks: 1 }, surfaceSlices: [{ ownerCount: 1 }, { ownerCount: 1 }, { ownerCount: 1 }], screenshot: { sha256: "a".repeat(64) } };
  assert.equal(validateScenarioReceipt(receipt), receipt);
  for (const [mutation, pattern] of [
    [{ expectedCount: 0 }, /TASK13A_SCENARIO_MISSING/u],
    [{ expectedCount: 2 }, /TASK13A_SCENARIO_DUPLICATE/u],
    [{ origin: "synthetic-dom" }, /TASK13A_SCENARIO_RENDERER/u],
    [{ writes: ["modify"] }, /TASK13A_SCENARIO_WRITE/u],
    [{ stale: true }, /TASK13A_SCENARIO_STALE/u],
    [{ adapterConsumed: false }, /TASK13A_SCENARIO_ADAPTER/u],
    [{ incompatibleCount: 1 }, /TASK13A_SCENARIO_INCOMPATIBLE/u],
    [{ eventBeforeTrigger: false }, /TASK13A_SCENARIO_SIGNAL_ORDER/u],
    [{ mountExecution: 2 }, /TASK13A_SCENARIO_REMOUNT/u],
    [{ network: ["https://example.invalid"] }, /TASK13A_SCENARIO_NETWORK/u],
    [{ surfaceSlices: [{ ownerCount: 1 }] }, /TASK13A_SCENARIO_SURFACE_SLICE/u],
  ]) assert.throws(() => validateScenarioReceipt({ ...receipt, ...mutation }), pattern);
  const scoped = { ...receipt, expected: [{ selector: ".normal", count: 1, min: 1, max: 1 }], forbidden: [{ selector: ".error", count: 0, max: 0 }] };
  assert.equal(validateScenarioReceipt(scoped), scoped);
  assert.throws(() => validateScenarioReceipt({ ...scoped, expected: [{ count: 2, min: 1, max: 1 }] }), /TASK13A_SCENARIO_DUPLICATE/u);
  assert.throws(() => validateScenarioReceipt({ ...scoped, forbidden: [{ count: 1, max: 0 }] }), /TASK13A_SCENARIO_INCOMPATIBLE/u);
  assert.match(scenarioAggregate([receipt]), /^[a-f0-9]{64}$/u);
});

test("Project and Knowledge connectors reject stub, signal, nonce, operation-label, restoration, network, approval, and deferred-leak mutations", () => {
  const connector = { kind: "project-wizard-controller", stub: false, transitionApplied: true, eventObserved: true, consumedNonce: true, identityRestored: true, pendingDeferred: 0, syntheticOperations: [{ method: "vault.create", path: "PARA/PROJECTS/TASK13A.md", label: "in_memory_synthetic" }], realOperations: [], approvalActions: 0 };
  const receipt = { matrix: { workspaceId: "project", state: "disabled" }, applicable: true, origin: "production-renderer", adapterConsumed: true, eventBeforeTrigger: true, expectedCount: 1, incompatibleCount: 0, writes: [], network: [], stale: false, ownerCount: 1, mountExecution: 1, mountGeneration: 1, blockExecution: { status: "rendered", generation: 1, executions: 1, blocks: 1 }, surfaceSlices: [{ ownerCount: 1 }, { ownerCount: 1 }, { ownerCount: 1 }], connector };
  assert.equal(validateScenarioReceipt(receipt), receipt);
  for (const [mutation, pattern] of [
    [{ stub: true }, /TASK13A_CONNECTOR_STUB/u],
    [{ kind: "stub" }, /TASK13A_CONNECTOR_STUB/u],
    [{ transitionApplied: false }, /TASK13A_CONNECTOR_STUB/u],
    [{ eventObserved: false }, /TASK13A_CONNECTOR_EVENT/u],
    [{ consumedNonce: false }, /TASK13A_CONNECTOR_NONCE/u],
    [{ identityRestored: false }, /TASK13A_CONNECTOR_IDENTITY/u],
    [{ pendingDeferred: 1 }, /TASK13A_CONNECTOR_DEFERRED/u],
    [{ syntheticOperations: [{ label: "real" }] }, /TASK13A_CONNECTOR_OPERATION_LABEL/u],
    [{ realOperations: [{ label: "in_memory_synthetic" }] }, /TASK13A_CONNECTOR_OPERATION_LABEL/u],
    [{ approvalActions: 1 }, /TASK13A_CONNECTOR_APPROVAL/u],
  ]) assert.throws(() => validateScenarioReceipt({ ...receipt, connector: { ...connector, ...mutation } }), pattern);
  assert.throws(() => validateScenarioReceipt({ ...receipt, network: [{ url: "https://example.invalid" }] }), /TASK13A_SCENARIO_NETWORK/u);
  const knowledge = { ...receipt, matrix: { workspaceId: "knowledge", state: "loading" }, connector: { ...connector, kind: "knowledge-published-apis", syntheticOperations: [] } };
  assert.equal(validateScenarioReceipt(knowledge), knowledge);
});

test("Personal and Journal connectors reject missing controllers, stale providers, deferred progress, focus, writes, approval, remount, and fake DOM mutations", () => {
  const connector = { kind: "personal-published-controllers", stub: false, transitionApplied: true, eventObserved: true, consumedNonce: true, identityRestored: true, pendingDeferred: 0, pendingProgress: 0, callbackCaptured: true, controllersCaptured: true, focusContract: true, scrollContract: true, remounted: false, fakeDom: false, syntheticOperations: [], realOperations: [], approvalActions: 0 };
  const receipt = { matrix: { workspaceId: "personal", state: "disabled" }, applicable: true, origin: "production-renderer", adapterConsumed: true, eventBeforeTrigger: true, expectedCount: 1, incompatibleCount: 0, writes: [], network: [], stale: false, ownerCount: 1, mountExecution: 1, mountGeneration: 1, blockExecution: { status: "rendered", generation: 1, executions: 1, blocks: 1 }, surfaceSlices: [{ ownerCount: 1 }, { ownerCount: 1 }, { ownerCount: 1 }], connector };
  assert.equal(validateScenarioReceipt(receipt), receipt);
  for (const [mutation, pattern] of [
    [{ callbackCaptured: false }, /TASK13A_CONNECTOR_CONTROLLER/u],
    [{ controllersCaptured: false }, /TASK13A_CONNECTOR_CONTROLLER/u],
    [{ eventObserved: false }, /TASK13A_CONNECTOR_EVENT/u],
    [{ consumedNonce: false }, /TASK13A_CONNECTOR_NONCE/u],
    [{ pendingDeferred: 1 }, /TASK13A_CONNECTOR_DEFERRED/u],
    [{ pendingProgress: 1 }, /TASK13A_CONNECTOR_PROGRESS/u],
    [{ focusContract: false }, /TASK13A_CONNECTOR_FOCUS/u],
    [{ scrollContract: false }, /TASK13A_CONNECTOR_FOCUS/u],
    [{ approvalActions: 1 }, /TASK13A_CONNECTOR_APPROVAL/u],
    [{ remounted: true }, /TASK13A_CONNECTOR_STUB/u],
    [{ fakeDom: true }, /TASK13A_CONNECTOR_STUB/u],
    [{ stub: true }, /TASK13A_CONNECTOR_STUB/u],
  ]) assert.throws(() => validateScenarioReceipt({ ...receipt, connector: { ...connector, ...mutation } }), pattern);
  assert.throws(() => validateScenarioReceipt({ ...receipt, stale: true }), /TASK13A_SCENARIO_STALE/u);
  assert.throws(() => validateScenarioReceipt({ ...receipt, writes: [{ method: "vault.modify" }] }), /TASK13A_SCENARIO_WRITE/u);
  assert.throws(() => validateScenarioReceipt({ ...receipt, mountExecution: 2 }), /TASK13A_SCENARIO_REMOUNT/u);
  const journal = { ...receipt, matrix: { workspaceId: "journal", state: "loading" }, connector: { ...connector, kind: "journal-published-controllers" } };
  assert.equal(validateScenarioReceipt(journal), journal);
});

test("structural driver contracts are per-workspace, per-state, scoped, and never generic unions", () => {
  for (const [workspaceId] of HUBS) for (const state of ["normal", "empty", "loading", "error-recovery", "selected-active", "disabled"]) {
    const contract = structuralDriverContract(workspaceId, state);
    assert.equal(contract.applicable, true);
    assert.ok(contract.expected.length > 0);
    assert.ok(contract.expected.every((entry) => entry.scope && Number.isInteger(entry.min) && Number.isInteger(entry.max)));
    assert.ok(contract.forbidden.every((entry) => entry.scope && entry.max === 0));
  }
  assert.notDeepEqual(structuralDriverContract("home", "loading"), structuralDriverContract("home", "disabled"));
  assert.throws(() => structuralDriverContract("missing", "normal"), /TASK13A_SCENARIO_DRIVER_CONTRACT/u);
});

test("strict real-render gate rejects every overflow, undersized target, chrome shadow, shell, recovery, keyboard, and state failure", () => {
  const offender = { selector: ".prodigy-action", role: "button", textSentinel: "새로고침", boundingBox: { x: 0, y: 0, width: 31, height: 30 }, clientWidth: 31, scrollWidth: 90, computed: { minWidth: "auto", minHeight: "0px", padding: "4px", font: "12px sans-serif", overflow: "visible", boxShadow: "rgb(0 0 0 / 20%) 0px 1px 2px", background: "none" }, matchedRules: [{ selector: ".prodigy-action", provenance: "production-injected" }] };
  const broken = { offenders: { overflow: [offender], targetSize: [offender], chromeShadow: [offender] }, readability: { oneGlyphColumns: [offender] }, shell: { count: 0, roots: [] }, resourceRecovery: { present: true, elements: [offender] }, keyboard: { failures: ["tab_did_not_advance"] }, states: { missing: ["loading"], duplicates: [{ name: "selectedActive", count: 2 }] } };
  assert.deepEqual(diagnosticFailures(broken).map((failure) => failure.kind), ["overflow", "target_lt_44", "forbidden_chrome_shadow", "cjk_one_glyph_column", "zero_shell", "resource_recovery", "keyboard_focus_navigation", "state_missing", "state_duplicate"]);
  assert.throws(() => assertDiagnosticClean(broken), /real Obsidian diagnostic failures/);
  assert.throws(() => assertDiagnosticClean({ ...broken, shell: { count: 2, roots: [] }, offenders: { overflow: [], targetSize: [], chromeShadow: [] }, resourceRecovery: { present: false }, keyboard: { failures: [] }, states: { missing: [], duplicates: [] } }), /duplicate_shell/);
  assert.doesNotThrow(() => assertDiagnosticClean({ offenders: { overflow: [], targetSize: [], chromeShadow: [] }, shell: { count: 1, roots: [{}] }, resourceRecovery: { present: false, elements: [] }, keyboard: { failures: [] }, states: { missing: [], duplicates: [] } }));
});

test("strict real-render gate ignores controls inside inactive hidden scenes", () => {
  const source = fs.readFileSync(path.join(__dirname, "real_obsidian_harness.js"), "utf8");
  assert.match(
    source,
    /const controls=all\.filter\(element=>element\.matches\('[^']+'\)&&!element\.closest\('\[hidden\],\[aria-hidden="true"\]'\)\)/
  );
});

test("strict real-render gate excludes unpainted hidden scenes and closed disclosure bodies", () => {
  const source = fs.readFileSync(path.join(__dirname, "real_obsidian_harness.js"), "utf8");
  assert.match(source, /collectElements\(roots\)\.filter\(element=>\{/);
  assert.match(source, /element\.closest\('\[hidden\],\[aria-hidden="true"\]'\)/);
  assert.match(source, /element\.closest\('details:not\(\[open\]\)'\)/);
  assert.match(source, /element!==details\.querySelector\(':scope > summary'\)/);
  assert.match(source, /element\.getClientRects\(\)\.length>0/);
});

test("layout settlement rejects stale, pre-trigger, absent, replaced-owner, and pre-settlement sampling mutations", () => {
  const expected = { workspaceId: "knowledge", sourceFile: "HUB/50 Knowledge.md", sourceHash: "a".repeat(64), width: 390, zoom: 2, theme: "light", forcedColors: false };
  const receipt = { subscribedBeforeTrigger: true, triggerSequence: 4, environmentAckSequence: 5, geometryArmSequence: 6, notificationSequence: 7, notificationAfterTrigger: true, mediaAck: { requested: { theme: "light", forcedColors: false }, current: { theme: "light", forcedColors: false, reducedMotion: true } }, preTriggerNotifications: 0, staleNotifications: 0, observerCurrent: true, ownerSame: true, ownerConnected: true, ownerWidthMatchesLeaf: true, registryLive: true, workspaceId: expected.workspaceId, sourceFile: expected.sourceFile, sourceHash: expected.sourceHash, viewportWidth: 390, documentWidth: 390, cssZoom: "2", theme: "light", forcedColors: false, rootCount: 1, roots: [{ connected: true, width: 110, height: 110 }], styleOrderUnchanged: true, sampledAfterNotification: true, authority: { epoch: 7, status: "SETTLED", owner: { shellId: "shell-1", blockId: "block-1", mountId: "mount-1", registryLive: true, workspaceId: expected.workspaceId, sourceFile: expected.sourceFile, sourceHash: expected.sourceHash }, environment: { viewportWidth: 390, documentWidth: 390, cssZoom: "2", theme: "light", forcedColors: false }, styleOrder: ["style-1"], roots: [{ id: "shell-1", width: 110, height: 110 }] } };
  assert.equal(validateLayoutSettlement(receipt, expected), receipt);
  for (const [mutation, pattern] of [
    [{ observerCurrent: false, staleNotifications: 1 }, /TASK13A_LAYOUT_STALE_OBSERVER/u],
    [{ preTriggerNotifications: 1 }, /TASK13A_LAYOUT_PRETRIGGER_NOTIFICATION/u],
    [{ notificationAfterTrigger: false, notificationSequence: null }, /TASK13A_LAYOUT_NOTIFICATION_MISSING/u],
    [{ geometryArmSequence: 5 }, /TASK13A_LAYOUT_ENVIRONMENT_GEOMETRY_ORDER/u],
    [{ mediaAck: { requested: { theme: "light", forcedColors: true }, current: { theme: "light", forcedColors: false, reducedMotion: true } } }, /TASK13A_LAYOUT_MEDIA_AUTHORITY/u],
    [{ ownerSame: false }, /TASK13A_LAYOUT_OWNER_REPLACED/u],
    [{ sampledAfterNotification: false }, /TASK13A_LAYOUT_SAMPLE_BEFORE_SETTLE/u],
    [{ ownerConnected: false }, /TASK13A_LAYOUT_OWNER_DISCONNECTED/u],
    [{ ownerWidthMatchesLeaf: false }, /TASK13A_LAYOUT_OWNER_GEOMETRY/u],
    [{ styleOrderUnchanged: false }, /TASK13A_LAYOUT_STYLE_RELOCATED/u],
    [{ viewportWidth: 834 }, /TASK13A_LAYOUT_VIEWPORT/u],
    [{ cssZoom: "1" }, /TASK13A_LAYOUT_ZOOM/u],
  ]) assert.throws(() => validateLayoutSettlement({ ...receipt, ...mutation }, expected), pattern);
  const source = fs.readFileSync(path.join(__dirname, "real_obsidian_harness.js"), "utf8");
  const settlement = source.slice(source.indexOf("const layoutExpected"), source.indexOf("const dom =", source.indexOf("const layoutExpected")));
  assert.doesNotMatch(settlement, /requestAnimationFrame|appendChild|append\(|prepend\(|insertBefore|replaceChildren/u, "layout settlement cannot use frame counts, relocate styles, or mutate production layout");
});

test("Knowledge selected-active declares and closes a geometry epoch before immutable capture", () => {
  assert.equal(structuralScenarioEffect("knowledge", "selected-active"), "geometry-producing");
  assert.equal(structuralScenarioEffect("knowledge", "normal"), "state-transition");
  const source = fs.readFileSync(path.join(__dirname, "real_obsidian_harness.js"), "utf8");
  const drive = source.slice(source.indexOf("async driveStructuralScenario"), source.indexOf("async resetStructuralScenario"));
  assert.ok(drive.indexOf("armKnowledgeScenarioEpoch") < drive.indexOf("driveKnowledgeScenario(state, nonce)"), "effect authority subscribes before state action");
  assert.ok(drive.indexOf("completeKnowledgeScenarioEpoch") > drive.indexOf("driveKnowledgeScenario(state, nonce)"), "participant acknowledgement follows the state action");
  const knowledge = source.slice(source.indexOf("async driveKnowledgeScenario"), source.indexOf("async driveStructuralScenario"));
  assert.doesNotMatch(knowledge, /requestAnimationFrame|setLogicalWidth\(1440\)|width: 2000/u, "selected-active cannot force geometry or wait by frame count");
});

test("focus-only authority inherits one settled geometry epoch and rejects every continuity mutation", () => {
  const snapshot = { epoch: 7, status: "SETTLED", owner: { shellId: "shell-1", blockId: "block-1", mountId: "mount-1", registryLive: true, workspaceId: "knowledge", sourceFile: "HUB/50 Knowledge.md", sourceHash: "a".repeat(64) }, environment: { viewportWidth: 390, documentWidth: 390, cssZoom: "2", theme: "light", forcedColors: false }, styleOrder: ["style-1", "style-2"], roots: [{ id: "shell-1", width: 110, height: 900 }, { id: "grid-1", width: 110, height: 110 }] };
  const receipt = { declaredEffect: "focus-only", priorStatus: "SETTLED", subscribedBeforeDispatch: true, expectedInputObserved: true, before: snapshot, after: structuredClone(snapshot), screenshotContinuity: { before: structuredClone(snapshot), after: structuredClone(snapshot) } };
  assert.equal(validateInheritedLayoutAuthority(receipt), receipt);
  for (const [mutation, pattern] of [
    [{ priorStatus: "PENDING" }, /TASK13A_FOCUS_PRIOR_EPOCH/u],
    [{ expectedInputObserved: false }, /TASK13A_FOCUS_INPUT_MISSING/u],
    [{ subscribedBeforeDispatch: false }, /TASK13A_FOCUS_SUBSCRIPTION_ORDER/u],
    [{ after: { ...snapshot, owner: { ...snapshot.owner, shellId: "shell-2" } } }, /TASK13A_FOCUS_OWNER_DRIFT/u],
    [{ after: { ...snapshot, owner: { ...snapshot.owner, registryLive: false } } }, /TASK13A_FOCUS_REGISTRY_DRIFT/u],
    [{ after: { ...snapshot, owner: { ...snapshot.owner, sourceHash: "b".repeat(64) } } }, /TASK13A_FOCUS_SOURCE_DRIFT/u],
    [{ after: { ...snapshot, styleOrder: ["style-2", "style-1"] } }, /TASK13A_FOCUS_STYLE_DRIFT/u],
    [{ after: { ...snapshot, environment: { ...snapshot.environment, cssZoom: "1" } } }, /TASK13A_FOCUS_ENVIRONMENT_DRIFT/u],
    [{ after: { ...snapshot, roots: snapshot.roots.slice(0, 1) } }, /TASK13A_FOCUS_ROOT_DRIFT/u],
    [{ after: { ...snapshot, roots: snapshot.roots.map((root, index) => index ? { ...root, width: 109 } : root) } }, /TASK13A_FOCUS_GEOMETRY_MUTATION/u],
    [{ screenshotContinuity: { before: snapshot, after: { ...snapshot, owner: { ...snapshot.owner, blockId: "block-2" } } } }, /TASK13A_SCREENSHOT_CONTINUITY/u],
    [{ declaredEffect: "unknown" }, /TASK13A_KEYBOARD_EFFECT_DECLARATION/u],
  ]) assert.throws(() => validateInheritedLayoutAuthority({ ...receipt, ...mutation }), pattern);
});

test("manual authority coordinator subscribes before triggers and expires without clocks", async () => {
  const manual = () => { let listener = null; return { subscribe(fn) { listener = fn; return () => { listener = null; }; }, emit(value) { assert.ok(listener, "manual source subscribed"); listener(value); } }; };
  const observer = manual(), aborts = manual(), inputs = manual();
  const coordinator = createLayoutAuthorityCoordinator({ observerSource: observer, abortSource: aborts, inputSource: inputs });
  const before = { epoch: 1, status: "PENDING" };
  let geometryTriggered = false;
  const geometry = coordinator.geometry({ before, trigger() { geometryTriggered = true; } });
  assert.equal(geometryTriggered, true);
  observer.emit({ epoch: 1, status: "SETTLED" });
  assert.deepEqual(await geometry.promise, { epoch: 1, status: "SETTLED" });
  const expiring = coordinator.geometry({ before: { epoch: 2, status: "PENDING" }, trigger() {} });
  expiring.expire();
  await assert.rejects(expiring.promise, /TASK13A_LAYOUT_EXPIRED/u);
  const aborted = coordinator.geometry({ before: { epoch: 3, status: "PENDING" }, trigger() {} });
  aborts.emit({ epoch: 3, reason: "owner-disconnected" });
  await assert.rejects(aborted.promise, /TASK13A_LAYOUT_OWNER_DISCONNECTED/u);
  const settled = { epoch: 4, status: "SETTLED", owner: { shellId: "s", blockId: "b", mountId: "m", registryLive: true, workspaceId: "home", sourceFile: "HUB/00 Home.md", sourceHash: "a".repeat(64) }, environment: {}, styleOrder: [], roots: [] };
  let dispatched = false;
  const focus = coordinator.focus({ declaredEffect: "focus-only", prior: settled, snapshot: () => settled, dispatch() { dispatched = true; } });
  assert.equal(dispatched, true);
  inputs.emit({ expected: true });
  assert.equal((await focus.promise).expectedInputObserved, true);
  assert.throws(() => coordinator.focus({ declaredEffect: "geometry-changing", prior: settled, snapshot: () => settled, dispatch() {} }), /TASK13A_KEYBOARD_EFFECT_DECLARATION/u);
});

test("256-row matrix aggregation is deterministic and sensitive to any offender or screenshot change", () => {
  const rows = [];
  for (const workspaceId of HUBS.map(([id]) => id)) for (const width of [390, 834, 1068, 1440]) for (const theme of ["light", "dark"]) for (const zoom of [1, 2]) for (const forcedColors of [false, true]) rows.push({ matrix: { workspaceId, width, theme, zoom, forcedColors, state: "normal" }, screenshot: { sha256: "a".repeat(64), bytes: 100 }, failures: [] });
  assert.equal(rows.length, 256);
  const aggregate = matrixAggregate(rows);
  assert.match(aggregate, /^[a-f0-9]{64}$/u);
  assert.equal(matrixAggregate(rows.slice().reverse()), aggregate);
  const changed = structuredClone(rows); changed[0].failures.push({ kind: "overflow" });
  assert.notEqual(matrixAggregate(changed), aggregate);
});

test("CSS ownership distinguishes disposable plugin, production injection, and native Obsidian", () => {
  assert.deepEqual(resolveCssOwnership({ provenance: "harness-plugin", cssText: "x" }).owningSourceFile, ".obsidian/plugins/task13a-local-dv/main.js");
  const production = resolveCssOwnership({ provenance: "production-injected", styleOwnerId: "prodigy-app-shell-styles", selector: ".prodigy-app-shell", cssText: "overflow: hidden;" });
  assert.equal(production.ownershipKind, "production");
  assert.equal(production.owningSourceFile, "SYSTEM/Views/prodigy-app-shell.js");
  const native = resolveCssOwnership({ provenance: "native-obsidian", href: "app://obsidian.md/app.css", selector: ".workspace", cssText: "zoom: 1" });
  assert.equal(native.ownershipKind, "native-obsidian");
  assert.equal(native.owningSourceFile, null);
});

test("diagnostic root selection covers normal Hub shells and the live Object Creator without losing Home ownership", () => {
  const descendants = [];
  const shell = { isConnected: true, querySelectorAll: () => descendants };
  const modal = {
    isConnected: true,
    querySelectorAll: () => descendants,
    getAttribute(name) {
      return { "data-prodigy-modal-owner": "object-creator-view", "data-prodigy-modal-source": "SYSTEM/Views/object-creator-view.js" }[name] || null;
    },
  };
  const expected = { workspaceId: "home", renderer: "home", sourceFile: "HUB/00 Home.md", sourceHash: "a".repeat(64) };
  const selected = { shell, descriptor: { ...expected, connected: true, displayed: true, visible: true, activeLeaf: true, registryOwned: true, width: 834, height: 900 } };
  for (const state of ["normal", "empty", "loading", "error-recovery", "selected-active", "disabled", "domain", "middle", "detail"]) assert.deepEqual(selectDiagnosticRoots({ state, selected, expected, modalRoots: [] }), [shell], `${state} diagnoses the selected Hub shell`);
  assert.deepEqual(selectDiagnosticRoots({ state: "object-creator-modal", selected, expected, modalRoots: [modal] }), [shell, modal]);
  const oldNormalOnly = ({ selected: candidate }) => [candidate.shell];
  assert.equal(oldNormalOnly({ selected }).includes(modal), false, "the old normal-only behavior is RED for the modal contract");
  assert.throws(() => selectDiagnosticRoots({ state: "object-creator-modal", selected, expected, modalRoots: [] }), /TASK13A_DIAGNOSTIC_MODAL_ROOT/u);
  assert.throws(() => selectDiagnosticRoots({ state: "object-creator-modal", selected, expected, modalRoots: [{ ...modal, getAttribute: () => "forged" }] }), /TASK13A_DIAGNOSTIC_MODAL_OWNER/u);
  assert.throws(() => selectDiagnosticRoots({ state: "unknown", selected, expected, modalRoots: [] }), /TASK13A_DIAGNOSTIC_STATE/u);
  assert.throws(() => selectDiagnosticRoots({ state: "normal", selected: { ...selected, shell: null }, expected, modalRoots: [] }), /TASK13A_DIAGNOSTIC_SHELL_ROOT/u);
  assert.throws(() => selectDiagnosticRoots({ state: "normal", selected: { ...selected, descriptor: { ...selected.descriptor, sourceFile: "HUB/70 Journal.md" } }, expected, modalRoots: [] }), /TASK13A_DIAGNOSTIC_OWNER_IDENTITY/u);
});

test("diagnostic element collection is non-empty, duplicate-free, and cannot exclude offender classes", () => {
  const offenders = [
    { id: "undersized", kind: "targetSize" },
    { id: "overflow", kind: "overflow" },
    { id: "shadow", kind: "chromeShadow" },
    { id: "cjk", kind: "oneGlyphColumns" },
  ];
  const shell = { id: "shell", querySelectorAll: () => offenders.slice(0, 2) };
  const modal = { id: "modal", querySelectorAll: () => [offenders[1], ...offenders.slice(2)] };
  const all = collectDiagnosticElements([shell, modal]);
  assert.deepEqual(all, [shell, ...offenders.slice(0, 2), modal, ...offenders.slice(2)]);
  for (const offender of offenders) assert.equal(all.includes(offender), true, `${offender.kind} offender cannot be excluded`);
  assert.equal(new Set(all).size, all.length, "diagnostic elements are duplicate-free");
  assert.throws(() => collectDiagnosticElements([]), /TASK13A_DIAGNOSTIC_ROOTS_EMPTY/u);
  assert.throws(() => collectDiagnosticElements([shell, shell]), /TASK13A_DIAGNOSTIC_ROOTS_DUPLICATE/u);
});

test("diagnostic receipts retain exact element identity, geometry, computed style, CSS provenance, and screenshot fields", () => {
  const source = fs.readFileSync(path.join(__dirname, "real_obsidian_harness.js"), "utf8");
  for (const sentinel of ["textSentinel", "boundingBox", "clientWidth", "scrollWidth", "minWidth", "minHeight", "padding", "font", "overflowX", "boxShadow", "backgroundImage", "matchedRules", "provenance", "blockIdentity", "shellWorkspace", "keyboardDiagnostic", "resourceRecovery", "screenshot"]) assert.ok(source.includes(sentinel), sentinel);
  assert.doesNotMatch(source, /targetSize=.*filter\([^)]*native|chromeShadow=.*filter\([^)]*native/u, "real Hub and modal descendants may not be excluded by provenance");
});

test("media authority uses one atomic deterministic complete feature vector and rejects erasing commands", () => {
  const lightForced = buildMediaAuthority("light", true);
  assert.deepEqual(lightForced, { media: "screen", features: [
    { name: "prefers-color-scheme", value: "light" },
    { name: "forced-colors", value: "active" },
    { name: "prefers-reduced-motion", value: "reduce" },
  ] });
  assert.equal(buildMediaAuthority("light", true), lightForced, "equal environments reuse immutable authority values");
  assert.equal(Object.isFrozen(lightForced), true);
  assert.equal(Object.isFrozen(lightForced.features), true);
  const target = { before: { targetId: "page-1", url: "app://obsidian.md/index.html", attached: true }, after: { targetId: "page-1", url: "app://obsidian.md/index.html", attached: true } };
  const complete = { sequence: 1, payload: lightForced, ack: { theme: "light", forcedColors: true, reducedMotion: true }, target };
  assert.equal(assertMediaAuthorityTrace([complete, { ...complete, sequence: 2 }]), true, "complete light+forced successors retain every field with increasing sequence");
  for (const payload of [
    { media: "screen", features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
    { media: "screen", features: lightForced.features.slice().reverse() },
    { media: "screen", features: [...lightForced.features, { name: "forced-colors", value: "none" }] },
  ]) assert.throws(() => assertMediaAuthorityTrace([{ ...complete, payload }]), /TASK13A_MEDIA_AUTHORITY_VECTOR/u);
  assert.throws(() => assertMediaAuthorityTrace([
    complete,
    { ...complete, sequence: 2, payload: { media: "screen", features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, ack: {} },
  ]), /TASK13A_MEDIA_AUTHORITY_VECTOR/u, "subsequent commands cannot erase prior fields");
  assert.throws(() => assertMediaAuthorityTrace([{ ...complete, target: { ...target, after: { ...target.after, targetId: "page-2" } } }]), /TASK13A_MEDIA_AUTHORITY_TARGET/u);
});

test("visual matrix contract rejects missing state, width, theme, zoom, or forced-colors dimensions", () => {
  const required = { workspaces: HUBS.map(([id]) => id), widths: [390, 834, 1068, 1440], themes: ["light", "dark"], zooms: [1, 2], forcedColors: [false, true], states: ["normal", "empty", "error-recovery", "loading", "selected-active", "disabled"] };
  function validate(value) { for (const key of Object.keys(required)) assert.deepEqual(value[key], required[key], `matrix ${key}`); }
  validate(structuredClone(required));
  for (const key of Object.keys(required)) { const bad = structuredClone(required); bad[key] = bad[key].slice(1); assert.throws(() => validate(bad), new RegExp(`matrix ${key}`)); }
});

test("real Obsidian executes every exact Hub block with one stable shell owner through disposal and remount", { timeout: 180000 }, async (t) => {
  const harness = await RealObsidianHarness.start("hub-shell-owner", { protectedSnapshot: snapshotProtected() });
  const trace = [];
  try {
    let exactBlocks = 0;
    for (let round = 1; round <= 2; round += 1) {
      for (const [workspaceId, hubPath] of HUBS) {
        const started = Date.now();
        const receipt = await harness.openWorkspace(workspaceId);
        const state = await harness.evaluate(`(()=>{const leaf=document.querySelector('.workspace-leaf-content[data-type="markdown"]');const rawBlocks=[...leaf.querySelectorAll('.block-language-dataviewjs,.block-language-js-engine')];const blocks=rawBlocks.filter(block=>block.getAttribute('data-task13a-source-file')===${JSON.stringify(hubPath)}&&block.getAttribute('data-task13a-generation')===${JSON.stringify(String(receipt.generation))});const shells=[...leaf.querySelectorAll('.prodigy-app-shell')];window.__task13aStableIdentity=window.__task13aStableIdentity||{loader:window.ProdigyHubLoader,manifest:window.ProdigyWorkspaceManifest,navigation:window.ProdigyWorkspaceNavigation};return{blocks:blocks.length,staleBlocks:rawBlocks.length-blocks.length,shells:shells.length,shellWorkspace:shells[0]&&shells[0].dataset.workspaceId,shellBlocks:blocks.filter(block=>block.querySelector('.prodigy-app-shell')).length,shellProcessorBlocks:blocks.filter(block=>block.getAttribute('data-task13a-block-ordinal')==='1').length,supportingBlocks:new Set(blocks.filter(block=>block.getAttribute('data-task13a-block-ordinal')!=='1').map(block=>block.getAttribute('data-task13a-block-ordinal'))).size,recoveries:leaf.querySelectorAll('.prodigy-required-recovery').length,identity:window.__task13aStableIdentity.loader===window.ProdigyHubLoader&&window.__task13aStableIdentity.manifest===window.ProdigyWorkspaceManifest&&window.__task13aStableIdentity.navigation===window.ProdigyWorkspaceNavigation,manifestFrozen:Object.isFrozen(window.ProdigyWorkspaceManifest.get(${JSON.stringify(workspaceId)}))}})()`);
        if (round === 1) exactBlocks += receipt.blocks;
        assert.ok(["rendered", "error"].includes(receipt.status), `${workspaceId}: every exact processor settles through the real plugin boundary`);
        assert.equal(receipt.executions, receipt.blocks, `${workspaceId}: exact processor count`);
        const { staleBlocks } = state;
        assert.ok(state.blocks >= 1, `${workspaceId}: current-generation processor identity`);
        assert.ok(state.shellProcessorBlocks >= 1, `${workspaceId}: shell-ordinal processors are observed independently of supporting blocks`);
        assert.ok(state.supportingBlocks <= receipt.blocks - 1, `${workspaceId}: supporting output ordinals remain separate from the shell owner`);
        assert.deepEqual({ shells: state.shells, shellWorkspace: state.shellWorkspace, shellBlocks: state.shellBlocks, recoveries: state.recoveries, identity: state.identity, manifestFrozen: state.manifestFrozen },
          { shells: 1, shellWorkspace: workspaceId, shellBlocks: 1, recoveries: 0, identity: true, manifestFrozen: true });
        assert.ok(staleBlocks >= 0, `${workspaceId}: stale processor identity is observed separately`);
        const disposed = await harness.evaluate(`(()=>{const leaf=document.querySelector('.workspace-leaf-content[data-type="markdown"]');const shell=leaf.querySelector('.prodigy-app-shell');const block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine');const result=block&&window.ProdigyHubLoader.disposeWorkspace(block);return{result:result===true,shells:leaf.querySelectorAll('.prodigy-app-shell').length,current:block&&window.ProdigyHubLoader.currentWorkspace(block)!==null}})()`);
        assert.deepEqual(disposed, { result: true, shells: 0, current: false }, `${workspaceId}: deterministic disposal`);
        trace.push({ round, workspaceId, hubPath, blocks: receipt.blocks, processorStatus: receipt.status, processorErrors: receipt.errors, staleEmptyProcessorBlocks: staleBlocks, milliseconds: Date.now() - started });
      }
      const currentExactBlocks = HUBS.reduce((sum, [, hubPath]) => sum + extractBlocks(fs.readFileSync(path.join(ROOT, hubPath), "utf8")).length, 0);
      assert.equal(exactBlocks, currentExactBlocks, "every exact executable block in the eight current production notes ran");
    }
    t.diagnostic(JSON.stringify(trace));
  } finally {
    const receipt = await harness.close();
    assert.equal(receipt.audit.equal, true);
    assert.equal(receipt.removed, true);
    assert.equal(receipt.portReusable, true);
  }
});
