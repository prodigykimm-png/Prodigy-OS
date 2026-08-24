"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const contract = view("llmwiki-operation-contract.js");
const merge = view("llmwiki-merge-transaction.js");
const HASH = "c".repeat(64);
const NOW = "2026-08-14T04:00:00.000Z";
const DESTINATION = "ZETA/PERMANENT/merged-destination.md";
const SOURCES = [
  "ZETA/PERMANENT/source-alpha.md",
  "ZETA/PERMANENT/source-beta.md",
  "ZETA/PERMANENT/source-gamma.md",
];
const BEFORE = Object.freeze({
  [DESTINATION]: "destination before\n",
  [SOURCES[0]]: "alpha before\n",
  [SOURCES[1]]: "beta before\n",
  [SOURCES[2]]: "gamma before\n",
});
const AFTER = "destination merged after\n";
const ZERO = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sha(value) { return view("llmwiki-hash.js").sha256(value); }

function operation(sourceOrder = SOURCES, effectOrder = sourceOrder) {
  const base = Object.fromEntries([DESTINATION, ...SOURCES].map((target) => [target, sha(BEFORE[target])]));
  const parsed = contract.parseOperation(JSON.stringify({
    contract_version: contract.CONTRACT_VERSION,
    operation_id: "operation_multi_source_merge",
    kind: "merge",
    destination_ids: [DESTINATION],
    source_ids: sourceOrder,
    base_revisions: base,
    before_bytes: { ...BEFORE },
    after_bytes: { [DESTINATION]: AFTER },
    source_citations: sourceOrder.map((source) => {
      const identity = SOURCES.indexOf(source) + 1;
      return ({
      source_id: `evidence_source_${source.match(/(alpha|beta|gamma)/u)[1]}`,
      content_hash: String(identity).repeat(64),
      source_url: `https://example.com/${identity}`,
      locators: [`ZETA/LITERATURE/${identity}.md#claim`],
      source_archive_id: null,
      confidence: "explicit",
    }); }),
    conflicts: [], risk_tier: "high",
    effects: {
      deprecations: [],
      supersessions: effectOrder.map((source) => ({
        destination_id: source, target_revision: base[source], before_bytes: BEFORE[source],
        replacement_id: DESTINATION, reason: "merged_into_reviewed_destination",
      })),
    },
  }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.value;
}
function evidence() {
  return {
    contract_version: "llmwiki_evidence_contract_v1", operation_id: "operation_multi_source_merge",
    approval_eligible: true, stale: false,
    claim_lineage: [{ claim_id: "claim_merge", citation_ids: ["citation_merge"] }],
  };
}
function provenance(order = SOURCES) {
  return { source_snapshots: order.map((source) => ({ source_id: source, source_revision: sha(BEFORE[source]), extractor_revision: `${SOURCES.indexOf(source) + 4}`.repeat(64) })) };
}
function packetFixture(sourceOrder = SOURCES, effectOrder = sourceOrder, provenanceOrder = sourceOrder) {
  const assembled = merge.assembleMergePacket({
    operation: operation(sourceOrder, effectOrder), evidence: evidence(), provenance: provenance(provenanceOrder),
    compensation_plan: { strategy: "restore_all_exact_before_state" },
    expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_multi_source_merge_0001",
  });
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  const authorized = merge.authorizeMergePacket(assembled.value, { action: "approve_merge", operation_id: "operation_multi_source_merge" });
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  return { packet: assembled.value, authorization: authorized.value };
}
function memoryAdapter(options = {}) {
  const files = new Map(Object.entries(BEFORE).map(([target, bytes], index) => [target, { path: target, bytes, mode: 0o640 + (index % 2) }]));
  const calls = [];
  const audits = [];
  let replaceCount = 0;
  let restoreCount = 0;
  let verificationReadThrown = false;
  let pendingRestoreVerification = null;
  const events = [];
  const adapter = {
    async readCanonical(targetPath) {
      calls.push(`read:${targetPath}`);
      const row = files.get(targetPath);
      if (!row) throw Object.assign(new Error("missing"), { code: "canonical_target_missing" });
      if (options.stalePath === targetPath && replaceCount === 0) return { path: targetPath, bytes: `${row.bytes}stale`, metadata: { mode: row.mode, symlink: false, contained: true } };
      if (options.verificationReadAlwaysThrow === replaceCount && row.bytes !== BEFORE[targetPath]) {
        throw Object.assign(new Error("persistent verification read injected"), { code: "canonical_read_failed" });
      }
      if (options.verificationReadThrow === replaceCount && row.bytes !== BEFORE[targetPath] && !verificationReadThrown) {
        verificationReadThrown = true;
        throw Object.assign(new Error("verification read injected"), { code: "canonical_read_failed" });
      }
      if (pendingRestoreVerification === targetPath) {
        pendingRestoreVerification = null;
        if (options.restoreVerificationReadThrow === restoreCount) throw Object.assign(new Error("restore verification read injected"), { code: "canonical_read_failed" });
      }
      return { path: targetPath, bytes: row.bytes, metadata: { mode: row.mode, symlink: options.symlinkPath === targetPath, contained: options.escapePath !== targetPath } };
    },
    async atomicReplace(request) {
      const row = files.get(request.target_path);
      merge.assertAtomicReplaceRequest(request, { bytes: row.bytes, metadata: { mode: row.mode } });
      replaceCount += 1;
      calls.push(`replace:${request.target_path}`);
      if (options.failReplace === replaceCount) throw Object.assign(new Error("injected"), { code: "interrupted" });
      row.bytes = request.after_bytes;
      events.push({ sequence: events.length + 1, kind: "write", target_path: request.target_path });
      if (options.verifyFailure === replaceCount) row.bytes += "corrupt";
      return { ok: true, status: "replaced" };
    },
    async restoreExact(request) {
      const row = files.get(request.target_path);
      merge.assertRestoreRequest(request, { bytes: row.bytes, metadata: { mode: row.mode } });
      restoreCount += 1;
      calls.push(`restore:${request.target_path}`);
      if (options.failRestore === restoreCount) throw new Error("restore injected");
      row.bytes = request.restore_bytes;
      row.mode = request.restore_mode;
      events.push({ sequence: events.length + 1, kind: "restore", target_path: request.target_path });
      pendingRestoreVerification = request.target_path;
      if (options.restoreVerificationFailure === restoreCount) row.bytes += "corrupt";
      return { ok: true, status: "restored" };
    },
    async recordMergeAudit(request) {
      merge.assertAuditRequest(request);
      calls.push(`audit:${request.nonce}`);
      audits.push(clone(request.audit));
      return { ok: true, status: "recorded" };
    },
  };
  return { adapter, files, calls, audits, events, get replaceCount() { return replaceCount; }, get restoreCount() { return restoreCount; } };
}
function assertBefore(memory) {
  for (const [target, bytes] of Object.entries(BEFORE)) assert.equal(memory.files.get(target).bytes, bytes, target);
}

 test("packet and authorization privately bind exact destination/source states, evidence, provenance, relation set, and compensation", () => {
  const { packet, authorization } = packetFixture([SOURCES[2], SOURCES[0], SOURCES[1]], [SOURCES[1], SOURCES[2], SOURCES[0]], [SOURCES[1], SOURCES[0], SOURCES[2]]);
  assert.deepEqual(packet.ordered_source_set, SOURCES);
  assert.deepEqual(packet.write_order, [DESTINATION, ...SOURCES].sort());
  assert.equal(packet.destination.after_bytes, AFTER);
  assert.equal(packet.destination.before_sha256, sha(BEFORE[DESTINATION]));
  assert.equal(packet.sources.every((row) => row.before_sha256 === sha(BEFORE[row.target_path])), true);
  assert.match(packet.evidence_hash, /^[0-9a-f]{64}$/u);
  assert.match(packet.provenance_hash, /^[0-9a-f]{64}$/u);
  assert.equal(packet.compensation_plan_hash, sha(merge.stable(packet.compensation_plan)));
  assert.deepEqual(packet.compensation_plan.reverse_write_order, packet.write_order.slice().reverse());
  assert.equal(merge.isMergePacket(packet), true);
  assert.equal(merge.isMergeAuthorization(authorization), true);
  assert.equal(merge.isMergePacket(clone(packet)), false);
  assert.equal(merge.isMergeAuthorization({ ...authorization }), false);
});

test("provider source/effect/provenance ordering produces the same canonical packet identity and write order", () => {
  const first = packetFixture(SOURCES, SOURCES, SOURCES).packet;
  const reversed = packetFixture(SOURCES.slice().reverse(), [SOURCES[1], SOURCES[0], SOURCES[2]], SOURCES.slice().reverse()).packet;
  assert.equal(first.packet_hash, reversed.packet_hash);
  assert.deepEqual(first.write_order, reversed.write_order);
});

test("success writes every file once in stable order, preserves source files as traceable relations, and replay is duplicate", async () => {
  const current = packetFixture();
  const memory = memoryAdapter();
  const beforeModes = Object.fromEntries([...memory.files].map(([target, row]) => [target, row.mode]));
  const committed = await view("llmwiki-deterministic-commit.js").commitApprovedCanonical({ ...current, adapter: memory.adapter }, { now: NOW });
  assert.equal(committed.status, "committed", JSON.stringify(committed));
  assert.equal(committed.approval_consumed, true);
  assert.deepEqual(committed.write_counts, { ...ZERO, canonical: 4 });
  assert.deepEqual(memory.calls.filter((call) => call.startsWith("replace:")), current.packet.write_order.map((target) => `replace:${target}`));
  assert.equal(memory.files.size, 4, "sources are updated, never deleted");
  for (const source of SOURCES) {
    const relations = merge.parseSupersessionRelations(memory.files.get(source).bytes);
    assert.deepEqual(relations.map((row) => [row.source_path, row.destination_path]), [[source, DESTINATION]]);
    assert.equal(memory.files.get(source).mode, beforeModes[source]);
  }
  const duplicate = await view("llmwiki-deterministic-commit.js").commitApprovedCanonical({ ...current, adapter: memory.adapter }, { now: "2026-08-14T04:01:00.000Z" });
  assert.equal(duplicate.status, "duplicate");
  assert.deepEqual(duplicate.write_counts, ZERO);
  assert.equal(memory.calls.filter((call) => call.startsWith("replace:")).length, 4);
  assert.equal(committed.source_deletes, 0);
  assert.equal(committed.git_calls, 0);
});

test("stale, missing, symlink, and containment preflight reject before every write and do not consume approval", async () => {
  for (const [name, options, reason] of [
    ["stale", { stalePath: SOURCES[2] }, "stale_before_write"],
    ["symlink", { symlinkPath: SOURCES[1] }, "unsafe_canonical_snapshot"],
    ["escape", { escapePath: SOURCES[0] }, "unsafe_canonical_snapshot"],
  ]) {
    const current = packetFixture();
    const memory = memoryAdapter(options);
    const rejected = await merge.commitApprovedMerge({ ...current, adapter: memory.adapter }, { now: NOW });
    assert.equal(rejected.reason, reason, `${name}: ${JSON.stringify(rejected)}`);
    assert.equal(memory.replaceCount, 0, name);
    assert.equal(merge.isApprovalConsumed(current.authorization), false, name);
    assertBefore(memory);
  }
  const current = packetFixture();
  const memory = memoryAdapter();
  memory.files.delete(SOURCES[1]);
  const missing = await merge.commitApprovedMerge({ ...current, adapter: memory.adapter }, { now: NOW });
  assert.equal(missing.reason, "canonical_target_missing");
  assert.equal(memory.replaceCount, 0);
});

test("replacement failure, verification mismatch, and verification-read throw restore only after exact byte+mode proof", async () => {
  for (const options of [{ failReplace: 3 }, { verifyFailure: 2 }, { verificationReadThrow: 2 }]) {
    const current = packetFixture();
    const memory = memoryAdapter(options);
    const failed = await merge.commitApprovedMerge({ ...current, adapter: memory.adapter }, { now: NOW });
    assert.equal(failed.ok, false, JSON.stringify(failed));
    assert.equal(failed.compensation_status, "restored", JSON.stringify(options));
    assert.equal(failed.approval_consumed, false);
    assert.equal(memory.audits.length, 1);
    assert.equal(memory.audits[0].result, "failed");
    assertBefore(memory);
    assert.equal(merge.isApprovalConsumed(current.authorization), false);
  }
});

test("three successful writes compensate in exact reverse deterministic order with machine-consumed events", async () => {
  const current = packetFixture();
  const memory = memoryAdapter({ failReplace: 4 });
  const failed = await merge.commitApprovedMerge({ ...current, adapter: memory.adapter }, { now: NOW });
  const written = current.packet.write_order.slice(0, 3);
  const expectedRestores = written.slice().reverse();
  assert.equal(failed.compensation_status, "restored", JSON.stringify(failed));
  assert.deepEqual(memory.events.filter((event) => event.kind === "write").map((event) => event.target_path), written);
  assert.deepEqual(memory.events.filter((event) => event.kind === "restore").map((event) => event.target_path), expectedRestores);
  assert.deepEqual(memory.audits[0].mutation_events.filter((event) => event.kind === "restore_verified").map((event) => event.target_path), expectedRestores);
  assert.deepEqual(memory.audits[0].restored_paths, expectedRestores);
  assertBefore(memory);
});

test("restore, restore-verification mismatch, and restore-verification read failures are distinct and never claim restored", async () => {
  for (const [options, reason] of [
    [{ verificationReadAlwaysThrow: 1 }, "compensation_read_failed"],
    [{ failReplace: 3, failRestore: 1 }, "compensation_restore_failed"],
    [{ failReplace: 3, restoreVerificationFailure: 1 }, "compensation_verify_failed"],
    [{ failReplace: 3, restoreVerificationReadThrow: 1 }, "compensation_verify_failed"],
  ]) {
    const current = packetFixture();
    const memory = memoryAdapter(options);
    const failed = await merge.commitApprovedMerge({ ...current, adapter: memory.adapter }, { now: NOW });
    assert.equal(failed.reason, reason, JSON.stringify(failed));
    assert.equal(failed.compensation_status, "manual_restore_required");
    assert.equal(failed.compensation_failures.length, 1);
    assert.deepEqual(failed.affected_paths, [failed.compensation_failures[0].target_path]);
    assert.equal(memory.audits[0].compensation_failures[0].reason, reason);
    assert.equal(memory.audits[0].restored_paths.includes(failed.compensation_failures[0].target_path), false);
    assert.equal(failed.approval_consumed, false);
    assert.equal(merge.isApprovalConsumed(current.authorization), false);
  }
});

test("missing, duplicate, reordered and post-approval mutation controls reject before effects", async () => {
  const malformed = clone({
    contract_version: contract.CONTRACT_VERSION, operation_id: "operation_multi_source_merge", kind: "merge",
    destination_ids: [DESTINATION], source_ids: [SOURCES[0], SOURCES[0]], base_revisions: {}, before_bytes: {}, after_bytes: {},
    source_citations: [], conflicts: [], risk_tier: "high", effects: { deprecations: [], supersessions: [] },
  });
  assert.equal(contract.parseOperation(JSON.stringify(malformed)).reason, "duplicate_identifier");
  const current = packetFixture();
  for (const [name, packet, authorization, reason] of [
    ["copied_packet", clone(current.packet), current.authorization, "branded_merge_packet_required"],
    ["spread_packet", { ...current.packet }, current.authorization, "branded_merge_packet_required"],
    ["copied_authorization", current.packet, clone(current.authorization), "branded_merge_authorization_required"],
    ["reordered_packet", { ...current.packet, ordered_source_set: current.packet.ordered_source_set.slice().reverse() }, current.authorization, "branded_merge_packet_required"],
  ]) {
    const memory = memoryAdapter();
    const rejected = await merge.commitApprovedMerge({ packet, authorization, adapter: memory.adapter }, { now: NOW });
    assert.equal(rejected.reason, reason, name);
    assert.equal(memory.replaceCount, 0, name);
  }
  const raw = merge.assembleMergePacket({ operation: clone(operation()), evidence: evidence(), provenance: provenance(), compensation_plan: { strategy: "restore_all_exact_before_state" }, expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_multi_source_merge_0001" });
  assert.equal(raw.reason, "branded_merge_operation_required");
});

test("Obsidian adapter executes the branded merge surface without delete or Git APIs", async () => {
  const files = new Map(Object.entries(BEFORE).map(([targetPath, bytes]) => [targetPath, { path: targetPath, bytes }]));
  files.set(".llmwiki-audit", { path: ".llmwiki-audit", folder: true });
  const calls = [];
  const app = { vault: {
    getAbstractFileByPath(targetPath) { return files.get(targetPath) || null; },
    async read(file) { return file.bytes; },
    async modify(file, bytes) { calls.push(`modify:${file.path}`); file.bytes = bytes; },
    async create(targetPath, bytes) { calls.push(`create:${targetPath}`); const file = { path: targetPath, bytes }; files.set(targetPath, file); return file; },
    async createFolder(targetPath) { files.set(targetPath, { path: targetPath, folder: true }); },
  } };
  const adapter = view("llmwiki-obsidian-adapter.js").createObsidianAdapter(app);
  const current = packetFixture();
  const committed = await merge.commitApprovedMerge({ ...current, adapter }, { now: NOW });
  assert.equal(committed.status, "committed", JSON.stringify(committed));
  assert.deepEqual(calls, current.packet.write_order.map((targetPath) => `modify:${targetPath}`));
  assert.equal(files.size, 5);
  assert.equal(merge.parseSupersessionRelations(files.get(SOURCES[0]).bytes)[0].destination_path, DESTINATION);
  assert.equal(typeof app.vault.delete, "undefined");
  assert.equal(typeof app.vault.trash, "undefined");
});

test("browser runtime closure loads with explicit globals and no require or Buffer", () => {
  const browser = vm.createContext({ console, TextEncoder, Uint8Array });
  for (const name of ["llmwiki-hash.js", "llmwiki-operation-contract.js", "llmwiki-merge-transaction.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8"), browser, { filename: name });
  }
  assert.equal(vm.runInContext("typeof require === 'undefined' && typeof Buffer === 'undefined'", browser), true);
  assert.equal(typeof browser.LLMWikiMergeTransaction.assembleMergePacket, "function");
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-merge-transaction.js"), "utf8");
  assert.doesNotMatch(source, /node:|\bBuffer\b|child_process|exec(?:File|Sync)?\s*\(|spawn(?:Sync)?\s*\(|vault\.(?:trash|delete)\s*\(/u);
});
