"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const compensation = view("llmwiki-compensation-service.js");

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function originalReceipt() {
  const writes = [
    { path: "ZETA/PERMANENT/alpha.md", before_bytes: "alpha before\n", after_bytes: "alpha after\n", before_revision: "rev_alpha_before" },
    { path: "ZETA/PERMANENT/beta.md", before_bytes: "beta before\n", after_bytes: "beta after\n", before_revision: "rev_beta_before" },
  ].map((write) => {
    const before_sha256 = sha256(write.before_bytes);
    const after_sha256 = sha256(write.after_bytes);
    return { ...write, before_sha256, after_sha256, post_commit_revision: after_sha256 };
  });
  return Object.freeze({
    run_id: "run_task17_compensation",
    packet_id: "packet_task17_original",
    packet_hash: sha256("original packet"),
    committed_at: "2026-08-20T00:00:00.000Z",
    policy_snapshot: { approval: "individual", operation_kind: "merge", risk_tier: "high" },
    source_revisions: { "ZETA/PERMANENT/alpha.md": "rev_alpha_before", "ZETA/PERMANENT/beta.md": "rev_beta_before" },
    writes,
    write_outcome: "committed",
    refresh_outcome: "succeeded",
    git_outcome: "pending",
  });
}

function memoryAdapter(receipt) {
  const files = new Map(receipt.writes.map((write) => [write.path, write.after_bytes]));
  const calls = [];
  const audits = new Map();
  const revisions = new Map(receipt.writes.map((write) => [write.path, write.post_commit_revision]));
  return {
    calls,
    files,
    revisions,
    async readCanonical(filePath) { return { bytes: files.get(filePath), revision: revisions.get(filePath) }; },
    async replaceCompensationExact(request) {
      calls.push(request);
      if (files.get(request.path) !== request.expected_bytes || revisions.get(request.path) !== request.expected_revision) {
        return { ok: false, reason: "stale_before_write" };
      }
      files.set(request.path, request.next_bytes);
      const revision = sha256(request.next_bytes);
      revisions.set(request.path, revision);
      return { ok: true, revision };
    },
    async restoreExact(request) {
      calls.push({ ...request, restore: true });
      files.set(request.path, request.restore_bytes);
      return { ok: true };
    },
    async appendImmutableAudit(request) {
      if (audits.has(request.audit_hash) && audits.get(request.audit_hash) !== request.audit_bytes) return { ok: false, reason: "immutable_audit_conflict" };
      audits.set(request.audit_hash, request.audit_bytes);
      return { ok: true, status: "appended" };
    },
  };
}

function durableAuditAdapter(receipt) {
  const adapter = memoryAdapter(receipt);
  const entries = new Map();
  let continuity = { head_hash: null, count: 0 };
  adapter.readImmutableAuditContinuity = async () => continuity === null
    ? { ok: false, reason: "immutable_audit_continuity_missing" }
    : { ok: true, ...continuity };
  adapter.readImmutableAudit = async (auditHash) => entries.get(auditHash) || null;
  adapter.appendImmutableAudit = async (request) => {
    if (entries.has(request.audit_hash) || [...entries.values()].some((entry) => JSON.parse(entry).audit_id === request.audit_id)) {
      return { ok: false, reason: "immutable_audit_replay" };
    }
    if (request.previous_audit_hash !== continuity.head_hash || request.audit_count !== continuity.count + 1) {
      return { ok: false, reason: "immutable_audit_continuity_mismatch" };
    }
    entries.set(request.audit_hash, request.audit_bytes);
    continuity = { head_hash: request.audit_hash, count: request.audit_count };
    return { ok: true, status: "appended" };
  };
  return { adapter, entries, getContinuity: () => ({ ...continuity }), removeHead: () => { continuity = null; } };
}

function confirmedAction() {
  return { type: "compensate", action_id: "action_task17_confirmed", confirmed_at: "2026-08-20T00:00:00.000Z" };
}

test("prepares a new user-authorized compensation packet with exact inverse bytes", () => {
  const service = compensation.create();
  const prepared = service.prepareCompensation({ original_receipt: originalReceipt(), user_action: confirmedAction() });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.packet.packet_type, "compensation");
  assert.equal(prepared.packet.parent_packet_hash, originalReceipt().packet_hash);
  assert.deepEqual(prepared.packet.writes.map((write) => write.after_bytes), ["alpha before\n", "beta before\n"]);
  assert.deepEqual(prepared.packet.writes.map((write) => write.after_sha256), originalReceipt().writes.map((write) => write.before_sha256));
  assert.equal(prepared.audit.user_action.action_id, "action_task17_confirmed");
  assert.equal(prepared.audit.refresh_outcome, "succeeded");
  assert.equal(prepared.audit.git_outcome, "pending");
});

test("rejects compensation without an explicit current user action", () => {
  const service = compensation.create();
  const result = service.prepareCompensation({ original_receipt: originalReceipt(), user_action: { type: "compensate" } });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "explicit_compensation_action_required");
});

test("validates immutable audit hashes and a contiguous parent chain", () => {
  const service = compensation.create();
  const prepared = service.prepareCompensation({ original_receipt: originalReceipt(), user_action: confirmedAction() });
  const appended = service.appendAudit(prepared.audit);

  assert.equal(appended.ok, true);
  assert.equal(service.validateAuditChain(service.getAudits()).ok, true);
  const tampered = { ...appended.entry, git_outcome: "succeeded" };
  assert.equal(service.validateAuditChain([tampered]).ok, false);
  assert.equal(service.validateAuditChain([appended.entry, { ...appended.entry, audit_id: "duplicate" }]).reason, "audit_parent_hash_mismatch");
});

test("writes compensation only from compensation_committing and preserves packet trace", async () => {
  const receipt = originalReceipt();
  const adapter = memoryAdapter(receipt);
  const service = compensation.create({ adapter });
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });
  const result = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: confirmedAction() });

  assert.equal(result.ok, true);
  assert.equal(result.status, "compensated");
  assert.deepEqual([...adapter.files.values()], ["alpha before\n", "beta before\n"]);
  assert.equal(result.audit.parent_packet_hash, receipt.packet_hash);
  assert.equal(result.audit.compensation_packet_hash, prepared.packet.packet_hash);
  assert.equal(result.audit.write_outcome, "compensated");
  assert.equal(adapter.calls.length, 2);
});

test("rejects compensation outside its dedicated lifecycle state without writes", async () => {
  const receipt = originalReceipt();
  const adapter = memoryAdapter(receipt);
  const service = compensation.create({ adapter });
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });
  const result = await service.commitCompensation({ state: "committing", packet: prepared.packet, user_action: confirmedAction() });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "compensation_committing_required");
  assert.equal(adapter.calls.length, 0);
});

test("rejects live drift before all compensation writes", async () => {
  const receipt = originalReceipt();
  const adapter = memoryAdapter(receipt);
  adapter.files.set("ZETA/PERMANENT/beta.md", "concurrent edit\n");
  const service = compensation.create({ adapter });
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });
  const result = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: confirmedAction() });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "stale_before_compensation");
  assert.equal(adapter.calls.length, 0);
});

test("restores completed compensation writes in reverse order after a later write fails", async () => {
  const receipt = originalReceipt();
  const adapter = memoryAdapter(receipt);
  const replace = adapter.replaceCompensationExact;
  let attempts = 0;
  adapter.replaceCompensationExact = async (request) => {
    attempts += 1;
    if (attempts === 2) return { ok: false, reason: "forced_second_write_failure" };
    return replace(request);
  };
  const service = compensation.create({ adapter });
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });

  const result = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: confirmedAction() });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "compensation_write_failed_restored");
  assert.equal(adapter.files.get("ZETA/PERMANENT/alpha.md"), "alpha after\n");
  assert.equal(adapter.files.get("ZETA/PERMANENT/beta.md"), "beta after\n");
  assert.equal(result.restoration.outcome, "restored");
  assert.equal(result.restoration.targets[0].path, "ZETA/PERMANENT/alpha.md");
});

test("fails closed with recovery details when compensation restoration fails", async () => {
  const receipt = originalReceipt();
  const adapter = memoryAdapter(receipt);
  const replace = adapter.replaceCompensationExact;
  let attempts = 0;
  adapter.replaceCompensationExact = async (request) => {
    attempts += 1;
    if (attempts === 2) return { ok: false, reason: "forced_second_write_failure" };
    if (attempts === 3) return { ok: false, reason: "forced_restore_failure" };
    return replace(request);
  };
  const service = compensation.create({ adapter });
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });

  const result = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: confirmedAction() });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "compensation_recovery_required");
  assert.equal(result.restoration.outcome, "recovery_required");
  assert.equal(result.restoration.targets[0].reason, "forced_restore_failure");
  assert.equal(adapter.files.get("ZETA/PERMANENT/alpha.md"), "alpha before\n");
  assert.equal(adapter.files.get("ZETA/PERMANENT/beta.md"), "beta after\n");
});

test("restores every target when immutable audit persistence fails after writes", async () => {
  const receipt = originalReceipt();
  const durable = durableAuditAdapter(receipt);
  const append = durable.adapter.appendImmutableAudit;
  durable.adapter.appendImmutableAudit = async (request) => {
    if (JSON.parse(request.audit_bytes).audit_type === "compensation_committed") {
      return { ok: false, reason: "forced_audit_append_failure" };
    }
    return append(request);
  };
  const service = compensation.create({ adapter: durable.adapter });
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });
  assert.equal((await service.recordPreparedCompensation({ prepared })).ok, true);

  const result = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: confirmedAction() });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "compensation_write_failed_restored");
  assert.equal(result.failure_reason, "forced_audit_append_failure");
  assert.deepEqual([...durable.adapter.files.values()], ["alpha after\n", "beta after\n"]);
  assert.equal(result.audit.audit_type, "compensation_failed_restored");
});

test("rejects missing or changed live revision tokens before all compensation writes", async () => {
  const receipt = originalReceipt();
  const adapter = memoryAdapter(receipt);
  const service = compensation.create({ adapter });
  const prepared = service.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });

  adapter.revisions.set("ZETA/PERMANENT/beta.md", "revision_changed_without_byte_drift");
  const changed = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: confirmedAction() });
  assert.equal(changed.reason, "stale_compensation_revision");
  assert.equal(adapter.calls.length, 0);

  adapter.revisions.set("ZETA/PERMANENT/beta.md", undefined);
  const missing = await service.commitCompensation({ state: "compensation_committing", packet: prepared.packet, user_action: confirmedAction() });
  assert.equal(missing.reason, "stale_compensation_revision");
  assert.equal(adapter.calls.length, 0);
});

test("rejects truncated immutable audit history and replay after service restart", async () => {
  const receipt = originalReceipt();
  const durable = durableAuditAdapter(receipt);
  const first = compensation.create({ adapter: durable.adapter });
  const committed = await first.recordCompletedCommit({ original_receipt: receipt });
  const prepared = first.prepareCompensation({ original_receipt: receipt, user_action: confirmedAction() });
  const recorded = await first.recordPreparedCompensation({ prepared });

  assert.equal(committed.ok, true);
  assert.equal(recorded.ok, true);
  assert.deepEqual(durable.getContinuity(), { head_hash: recorded.audit.audit_hash, count: 2 });
  const restarted = compensation.create({ adapter: durable.adapter });
  const truncated = await restarted.validatePersistedAuditChain([committed.audit]);
  const replayed = await restarted.recordPreparedCompensation({ prepared });

  assert.equal(truncated.ok, false);
  assert.equal(truncated.reason, "immutable_audit_truncated");
  assert.equal(replayed.ok, false);
  assert.equal(replayed.reason, "immutable_audit_replay");
});

test("fails closed when immutable audit records exist without their continuity head", async () => {
  const receipt = originalReceipt();
  const durable = durableAuditAdapter(receipt);
  const service = compensation.create({ adapter: durable.adapter });
  assert.equal((await service.recordCompletedCommit({ original_receipt: receipt })).ok, true);
  durable.removeHead();

  const restarted = compensation.create({ adapter: durable.adapter });
  const result = await restarted.recordCompletedCommit({ original_receipt: receipt });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "immutable_audit_continuity_missing");
});

test("permits partial transaction restore only in original committing state", async () => {
  const receipt = originalReceipt();
  const adapter = memoryAdapter(receipt);
  const service = compensation.create({ adapter });
  adapter.files.set("ZETA/PERMANENT/alpha.md", "alpha after\n");
  const rejected = await service.restorePartialOriginal({ state: "compensation_committing", original_receipt: receipt, written_paths: ["ZETA/PERMANENT/alpha.md"] });
  assert.equal(rejected.reason, "original_committing_required");

  const restored = await service.restorePartialOriginal({ state: "committing", original_receipt: receipt, written_paths: ["ZETA/PERMANENT/alpha.md"] });
  assert.equal(restored.ok, true);
  assert.equal(restored.audit.product_change, false);
  assert.equal(adapter.files.get("ZETA/PERMANENT/alpha.md"), "alpha before\n");
});

test("persists immutable audit entries through the production Vault adapter", async () => {
  const files = new Map();
  const folders = new Set();
  let modifications = 0;
  const app = {
    vault: {
      getAbstractFileByPath(filePath) { return files.get(filePath) || (folders.has(filePath) ? { path: filePath } : null); },
      async read(file) { return file.bytes; },
      async create(filePath, bytes) {
        const file = { path: filePath, bytes };
        files.set(filePath, file);
        return file;
      },
      async modify() { modifications += 1; },
      async createFolder(directory) { folders.add(directory); },
    },
  };
  const adapter = view("llmwiki-obsidian-adapter.js").createObsidianAdapter(app);
  const request = {
    audit_hash: "e".repeat(64),
    audit_id: "audit_task17_persisted",
    audit_count: 1,
    previous_audit_hash: null,
    audit_bytes: JSON.stringify({
      audit_hash: "e".repeat(64),
      audit_id: "audit_task17_persisted",
      audit_count: 1,
      previous_audit_hash: null,
    }),
  };

  assert.equal((await adapter.appendImmutableAudit(request)).status, "appended");
  assert.equal((await adapter.appendImmutableAudit(request)).reason, "immutable_audit_replay");
  assert.equal((await adapter.appendImmutableAudit({ ...request, audit_bytes: "{\"immutable\":false}\n" })).reason, "immutable_audit_request_mismatch");
  assert.equal(modifications, 0);
  assert.equal(files.get(`.llmwiki-audit/immutable/${request.audit_hash}.json`).bytes, request.audit_bytes);
});

test("production immutable audit uses Obsidian DataAdapter for hidden local paths", async () => {
  const hidden = new Map();
  const folders = new Set();
  const dataAdapter = {
    async exists(filePath) { return hidden.has(filePath) || folders.has(filePath); },
    async mkdir(directory) { folders.add(directory); },
    async read(filePath) { if (!hidden.has(filePath)) throw new Error("missing_file"); return hidden.get(filePath); },
    async write(filePath, bytes) { hidden.set(filePath, bytes); },
    async list(directory) { return { files: [...hidden.keys()].filter((filePath) => filePath.startsWith(`${directory}/`)), folders: [] }; },
  };
  const app = { vault: {
    adapter: dataAdapter,
    getAbstractFileByPath() { return null; },
    getFiles() { return []; },
    async read() { throw new Error("hidden_vault_read_forbidden"); },
    async create() { throw new Error("hidden_vault_create_forbidden"); },
    async modify() { throw new Error("hidden_vault_modify_forbidden"); },
    async createFolder() { throw new Error("hidden_vault_directory_forbidden"); },
  } };
  const adapter = view("llmwiki-obsidian-adapter.js").createObsidianAdapter(app);
  const recorded = await compensation.create({ adapter }).recordCompletedCommit({ original_receipt: originalReceipt() });

  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(hidden.has(`.llmwiki-audit/immutable/${recorded.audit.audit_hash}.json`), true);
  assert.equal(hidden.has(".llmwiki-audit/immutable/head.json"), true);
  assert.deepEqual(await adapter.readImmutableAuditContinuity(), { ok: true, head_hash: recorded.audit.audit_hash, count: 1 });
});

test("production audit continuity rejects truncation and replay across fresh services", async () => {
  const files = new Map();
  const folders = new Set();
  const app = {
    vault: {
      getAbstractFileByPath(filePath) { return files.get(filePath) || (folders.has(filePath) ? { path: filePath } : null); },
      getFiles() { return [...files.values()]; },
      async read(file) { return file.bytes; },
      async create(filePath, bytes) {
        const file = { path: filePath, bytes };
        files.set(filePath, file);
        return file;
      },
      async modify(file, bytes) { file.bytes = bytes; },
      async createFolder(directory) { folders.add(directory); },
    },
  };
  const adapter = view("llmwiki-obsidian-adapter.js").createObsidianAdapter(app);
  const first = compensation.create({ adapter });
  const committed = await first.recordCompletedCommit({ original_receipt: originalReceipt() });
  const prepared = first.prepareCompensation({ original_receipt: originalReceipt(), user_action: confirmedAction() });
  const preparedRecorded = await first.recordPreparedCompensation({ prepared });
  const restarted = compensation.create({ adapter });

  const full = await restarted.validatePersistedAuditChain([committed.audit, preparedRecorded.audit]);
  const truncated = await restarted.validatePersistedAuditChain([committed.audit]);
  const replayed = await restarted.recordPreparedCompensation({ prepared });

  assert.equal(full.ok, true, JSON.stringify(full));
  assert.equal(truncated.reason, "immutable_audit_truncated");
  assert.equal(replayed.reason, "immutable_audit_replay");
});

test("forbids destructive command paths and loads the service in production", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-compensation-service.js"), "utf8");
  const manifest = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"), "utf8");

  assert.doesNotMatch(source, /\bgit\s+reset\b|\bgit\s+checkout\b|rm\s+-rf|vault\.(?:trash|delete)\s*\(/u);
  assert.match(manifest, /SYSTEM\/Views\/llmwiki-compensation-service\.js/u);
  assert.match(source, /compensation_committing/u);
  assert.doesNotMatch(source, /node:crypto|node:fs/u);
  assert.doesNotMatch(source, /child_process|exec(?:File|Sync)?\s*\(|spawn(?:Sync)?\s*\(/u);
});
