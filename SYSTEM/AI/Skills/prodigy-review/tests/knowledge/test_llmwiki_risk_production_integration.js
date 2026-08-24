"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const hash = view("llmwiki-hash.js");
const operationApi = view("llmwiki-operation-contract.js");
const packetApi = view("llmwiki-risk-approval-packet.js");
const writeSetApi = view("llmwiki-risk-write-set.js");
const transactionApi = view("llmwiki-risk-vault-transaction-adapter.js");
const riskControllerApi = view("llmwiki-risk-review-controller.js");
const reviewCommit = view("llmwiki-approval-review-commit.js");
const batchApi = view("llmwiki-safe-batch-approval.js");
const repacketApi = view("llmwiki-approval-repacket-service.js");
view("llmwiki-risk-approval-review-view.js");
const reviewView = view("llmwiki-approval-review-view.js");
const lifecycle = view("llmwiki-lifecycle-view.js");
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");

function serialized(kind, id, overrides = {}) {
  const target = `ZETA/PERMANENT/${id}.md`;
  const before = overrides.before || "---\nconnections:\n  - old\n---\nStable statement.\n";
  const value = {
    contract_version: operationApi.CONTRACT_VERSION, operation_id: id, kind, destination_ids: [target],
    base_revisions: kind === "create" ? {} : { [target]: hash.sha256(before) }, before_bytes: kind === "create" ? {} : { [target]: before },
    after_bytes: { [target]: kind === "noop" ? before : overrides.after || "---\nconnections:\n  - new\n---\nStable statement.\n" },
    source_citations: [{ source_id: `source_${id}`, content_hash: "a".repeat(64), source_url: "https://example.com/risk", locators: [`ZETA/LITERATURE/${id}.md#claim`], source_archive_id: null, confidence: "explicit" }],
    conflicts: overrides.conflicts || [], risk_tier: overrides.risk_tier || "low", effects: overrides.effects || { deprecations: [], supersessions: [] },
  };
  return JSON.stringify(value);
}
function operation(kind, id, overrides) {
  const parsed = operationApi.parseOperation(serialized(kind, id, overrides));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.value;
}
function mergeOperation(id) {
  const target = `ZETA/PERMANENT/${id}.md`; const sources = [`ZETA/PERMANENT/${id}-a.md`, `ZETA/PERMANENT/${id}-b.md`];
  const before = { [target]: "destination before\n", [sources[0]]: "alpha before\n", [sources[1]]: "beta before\n" };
  const revisions = Object.fromEntries(Object.entries(before).map(([filePath, bytes]) => [filePath, hash.sha256(bytes)]));
  const parsed = operationApi.parseOperation(JSON.stringify({ contract_version: operationApi.CONTRACT_VERSION, operation_id: id, kind: "merge", destination_ids: [target], source_ids: sources, base_revisions: revisions, before_bytes: before, after_bytes: { [target]: "merged destination\n" }, source_citations: sources.map((source, index) => ({ source_id: `source_${id}_${index}`, content_hash: String(index + 1).repeat(64), source_url: `https://example.com/merge/${index}`, locators: [`ZETA/LITERATURE/${id}-${index}.md#claim`], source_archive_id: null, confidence: "explicit" })), conflicts: [], risk_tier: "high", effects: { deprecations: [], supersessions: sources.map((source) => ({ destination_id: source, target_revision: revisions[source], before_bytes: before[source], replacement_id: target, reason: "approved_merge" })) } }));
  assert.equal(parsed.ok, true, JSON.stringify(parsed)); return parsed.value;
}
function packet(op, revision = 1) {
  const built = packetApi.buildRiskApprovalPacket({ run_id: `run_${op.operation_id}`, run_revision: revision, packet_revision: revision, operation: op, summary: `${op.kind} production review`, provenance: { source: "integration", source_ids: op.source_citations.map((row) => row.source_id) } });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.value;
}
function walk(node, predicate, hits = []) { if (predicate(node)) hits.push(node); for (const child of node.children || []) walk(child, predicate, hits); return hits; }
function control(root, name) { return walk(root, (node) => node.attr?.["data-action"] === name)[0] || null; }
function click(node) { assert.equal(typeof node?.onclick, "function"); node.onclick({ preventDefault() {} }); }

function filesystemVault(rootDir, controls = {}) {
  const touched = [];
  const binaryReads = [];
  const listeners = new Map(["create", "modify", "delete", "rename"].map((name) => [name, new Set()]));
  function absolute(relative) { return path.join(rootDir, ...relative.split("/")); }
  function file(relative) {
    if (controls.hideDotPaths && relative.startsWith(".")) return null;
    const target = absolute(relative);
    if (!fs.existsSync(target)) return null;
    const stat = fs.statSync(target);
    return { path: relative, stat: { mode: stat.mode, size: stat.size, mtime: stat.mtimeMs } };
  }
  function emit(name, ...args) { for (const listener of listeners.get(name) || []) listener(...args); }
  function files(directory = rootDir, prefix = "") {
    if (controls.hideDotPaths && prefix.startsWith(".")) return [];
    return fs.existsSync(directory)
      ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
        ? files(path.join(directory, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
        : [file(prefix ? `${prefix}/${entry.name}` : entry.name)]).filter(Boolean)
      : [];
  }
  return {
    touched,
    binaryReads,
    adapter: {
      async exists(relative) { return fs.existsSync(absolute(relative)); },
      async read(relative) { return fs.readFileSync(absolute(relative), "utf8"); },
      async write(relative, bytes) { fs.mkdirSync(path.dirname(absolute(relative)), { recursive: true }); fs.writeFileSync(absolute(relative), bytes, "utf8"); },
      async remove(relative) { if (fs.existsSync(absolute(relative))) fs.rmSync(absolute(relative), { recursive: true, force: true }); },
      async mkdir(relative) { fs.mkdirSync(absolute(relative), { recursive: true }); },
    },
    getAbstractFileByPath: file,
    getFiles() { return files(); },
    on(name, listener) { listeners.get(name).add(listener); return { name, listener }; },
    offref(ref) { listeners.get(ref.name).delete(ref.listener); },
    listenerCount(name) { return listeners.get(name)?.size || 0; },
    async read(entry) { return fs.readFileSync(absolute(entry.path), "utf8"); },
    async readBinary(entry) {
      binaryReads.push(entry.path);
      const value = fs.readFileSync(absolute(entry.path));
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    },
    async createFolder(relative) { fs.mkdirSync(absolute(relative), { recursive: true }); },
    async create(relative, bytes) { touched.push(relative); fs.mkdirSync(path.dirname(absolute(relative)), { recursive: true }); fs.writeFileSync(absolute(relative), bytes, { mode: 0o640 }); const created = file(relative); emit("create", created); return created; },
    async modify(entry, bytes) { touched.push(entry.path); if (controls.failPath === entry.path) throw new Error("injected_write_failure"); fs.writeFileSync(absolute(entry.path), bytes, "utf8"); const modified = file(entry.path); emit("modify", modified); return modified; },
    async delete(entry) { touched.push(entry.path); fs.unlinkSync(absolute(entry.path)); emit("delete", { path: entry.path }); },
    async setMode(relative, mode) { fs.chmodSync(absolute(relative), mode); },
    mode(relative) { return fs.statSync(absolute(relative)).mode & 0o777; },
  };
}
function makeVault(controls = {}) { const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-risk-production-")); return { rootDir, app: { vault: filesystemVault(rootDir, controls) } }; }
function seed(fixture, relative, bytes, mode = 0o640) { const target = path.join(fixture.rootDir, ...relative.split("/")); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { mode }); }

test("production manifest directly asserts the complete risk integration closure", () => {
  delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"))];
  const required = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("knowledge").required;
  const names = ["llmwiki-risk-approval-packet.js", "llmwiki-approval-repacket-service.js", "llmwiki-risk-write-set.js", "llmwiki-safe-batch-approval.js", "llmwiki-risk-vault-transaction-adapter.js", "llmwiki-approval-review-commit.js", "llmwiki-operation-run-service.js", "llmwiki-risk-review-controller.js", "llmwiki-risk-approval-review-view.js", "llmwiki-lifecycle-view.js"];
  const paths = names.map((name) => `SYSTEM/Views/${name}`);
  assert.equal(paths.every((entry) => required.filter((value) => value === entry).length === 1), true);
  assert.equal(paths.every((entry, index) => index === 0 || required.indexOf(paths[index - 1]) < required.indexOf(entry)), true);
  assert.equal(required.includes("SYSTEM/Views/llmwiki-approval-packet.js"), false);
});

test("trusted packet boundary derives risk and refuses provider low labels for content updates", () => {
  const content = operation("update", "operation_risk_content", { risk_tier: "low", after: "---\nconnections:\n  - new\n---\nChanged statement.\n" });
  const metadata = operation("update", "operation_risk_metadata", { risk_tier: "high" });
  const contentPacket = packet(content);
  const metadataPacket = packet(metadata);
  assert.equal(contentPacket.risk.tier, "medium");
  assert.equal(contentPacket.batch_eligible, false);
  assert.equal(metadataPacket.risk.tier, "low");
  assert.equal(metadataPacket.batch_eligible, true);
  assert.equal(contentPacket.provider_risk_claim, "low");
  assert.equal(metadataPacket.provider_risk_claim, "high");
});

test("production lifecycle mounts branded risk surface and dispatches controller-bound actions", async () => {
  const low = packet(operation("create", "operation_lifecycle_risk", { after: "new knowledge\n" }));
  const root = new FakeElement("section");
  const intents = [];
  const surface = lifecycle.mountLlmWikiLifecycleView({ container: root, snapshot: { status: "review", risk_packets: [low], approval_packet: low, run_id: low.run_id, run_revision: low.run_revision }, reviewView, onAction(intent) { intents.push(intent); }, requestRevisionGuidance: async () => "출처 설명을 더 쉽게 바꿔줘" });
  assert.match(collectText(root), /위험|충돌 상태|안전한 묶음 승인|수정 요청/);
  assert.ok(walk(root, (node) => node.attr?.["data-surface"] === "llmwiki-risk-approval-review")[0]);
  click(control(root, "approve"));
  assert.equal(intents[0].action, "approve_risk");
  surface.update({ status: "review", risk_packets: [low], approval_packet: low, run_id: low.run_id, run_revision: low.run_revision });
  click(control(root, "request-revision"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(intents.at(-1).action, "request_risk_revision");
  assert.equal(intents.at(-1).guidance, "출처 설명을 더 쉽게 바꿔줘");
});

test("production adapter fails closed when independent vault observation is unavailable", () => {
  const vault = { getAbstractFileByPath() { return null; }, async read() {}, async modify() {}, async create() {} };
  assert.throws(() => transactionApi.createRiskVaultTransactionAdapter({ app: { vault } }), /independent_vault_observer_unavailable/);
});

test("real vault adapter proves exact selected path set, bytes, modes, replay, and unexpected-path refusal", async () => {
  const fixture = makeVault({ hideDotPaths: true });
  try {
    seed(fixture, "MEDIA/unrelated-large.bin", Buffer.alloc(1024 * 1024, 7));
    const first = packet(operation("create", "operation_vault_a", { after: "alpha\n" }));
    const second = packet(operation("create", "operation_vault_b", { after: "beta\n" }));
    const packets = [first, second].sort((a, b) => a.packet_id.localeCompare(b.packet_id));
    const adapter = transactionApi.createRiskVaultTransactionAdapter({ app: fixture.app });
    const authorization = batchApi.authorizeExactBatch(packets, packets.map((row) => row.packet_id)).value;
    const committed = await batchApi.commitExactBatch({ packets, authorization, adapter });
    assert.equal(committed.status, "committed", JSON.stringify(committed));
    assert.deepEqual(committed.receipt.actual_touched_paths, packets.flatMap((row) => row.operation.destination_ids).sort());
    assert.equal(committed.receipt.path_boundary_verified, true);
    assert.deepEqual(committed.write_counts, { canonical: 2, audit: 3, refresh: 0, git: 0 });
    assert.deepEqual(fixture.app.vault.binaryReads, []);
    for (const row of packets) assert.equal(fs.readFileSync(path.join(fixture.rootDir, row.operation.destination_ids[0]), "utf8"), row.operation.after_bytes[row.operation.destination_ids[0]]);
    assert.equal((await batchApi.commitExactBatch({ packets, authorization, adapter })).status, "duplicate");

    const outside = packet(operation("create", "operation_vault_outside", { after: "outside\n" }));
    const roguePath = "ZETA/PERMANENT/unselected.md";
    const outsideAdapter = transactionApi.createRiskVaultTransactionAdapter({ app: fixture.app, executors: { create: async ({ packet: selected }) => {
      assert.ok(fixture.app.vault.listenerCount("create") > 0, "independent listener must be installed before executor entry");
      const target = selected.operation.destination_ids[0];
      await fixture.app.vault.create(target, selected.operation.after_bytes[target]);
      await fixture.app.vault.create(roguePath, "shadow write\n");
      return { actual_touched_paths: [target], expected_after_bytes: selected.operation.after_bytes };
    } } });
    const outsideAuth = batchApi.authorizeExactBatch([outside], [outside.packet_id]).value;
    const rejected = await batchApi.commitExactBatch({ packets: [outside], authorization: outsideAuth, adapter: outsideAdapter });
    assert.equal(rejected.reason, "unexpected_touched_path");
    assert.equal(rejected.full_success, false, "out-of-set touched-path mutation must never report full_success");
    assert.equal(fs.existsSync(path.join(fixture.rootDir, outside.operation.destination_ids[0])), false);
    assert.equal(fs.existsSync(path.join(fixture.rootDir, roguePath)), false, "independent observer must restore omitted shadow path to absent");
  } finally { fs.rmSync(fixture.rootDir, { recursive: true, force: true }); }
});

test("single approval independently observes and restores an executor-omitted shadow write", async () => {
  const fixture = makeVault();
  try {
    const selected = packet(operation("create", "operation_single_shadow", { after: "selected\n" }));
    const target = selected.operation.destination_ids[0]; const rogue = "ZETA/PERMANENT/single-shadow.md"; const rogueBefore = "existing shadow bytes\n";
    seed(fixture, rogue, rogueBefore, 0o600);
    const adapter = transactionApi.createRiskVaultTransactionAdapter({ app: fixture.app, executors: { create: async () => {
      await fixture.app.vault.create(target, selected.operation.after_bytes[target]);
      await fixture.app.vault.modify(fixture.app.vault.getAbstractFileByPath(rogue), "unreported\n");
      return { actual_touched_paths: [target], expected_after_bytes: selected.operation.after_bytes };
    } } });
    const authorization = reviewCommit.authorizeRiskPacket(selected, { action: "approve", packet_id: selected.packet_id }).value;
    const rejected = await reviewCommit.commitRiskApproved({ packet: selected, authorization, adapter });
    assert.equal(rejected.reason, "unexpected_touched_path");
    assert.equal(fs.existsSync(path.join(fixture.rootDir, target)), false);
    assert.equal(fs.readFileSync(path.join(fixture.rootDir, rogue), "utf8"), rogueBefore);
    assert.equal(fs.statSync(path.join(fixture.rootDir, rogue)).mode & 0o777, 0o600);
  } finally { fs.rmSync(fixture.rootDir, { recursive: true, force: true }); }
});

test("real vault middle failure restores exact written prefix bytes and modes", async () => {
  const fixture = makeVault();
  try {
    const before = "---\nconnections:\n  - old\n---\nStable statement.\n";
    const a = packet(operation("update", "operation_restore_a", { before, risk_tier: "low" }));
    const b = packet(operation("update", "operation_restore_b", { before, risk_tier: "low" }));
    const c = packet(operation("update", "operation_restore_c", { before, risk_tier: "low" }));
    const packets = [a, b, c].sort((left, right) => left.packet_id.localeCompare(right.packet_id));
    packets.forEach((row) => seed(fixture, row.operation.destination_ids[0], before, 0o640));
    const failingPath = packets[1].operation.destination_ids[0];
    fixture.app.vault = filesystemVault(fixture.rootDir, { failPath: failingPath });
    const adapter = transactionApi.createRiskVaultTransactionAdapter({ app: fixture.app });
    const authorization = batchApi.authorizeExactBatch(packets, packets.map((row) => row.packet_id)).value;
    const result = await batchApi.commitExactBatch({ packets, authorization, adapter });
    assert.equal(result.status, "failed");
    assert.equal(result.write_counts.canonical, 0);
    for (const row of packets) {
      const target = row.operation.destination_ids[0];
      assert.equal(fs.readFileSync(path.join(fixture.rootDir, target), "utf8"), before);
      assert.equal(fs.statSync(path.join(fixture.rootDir, target)).mode & 0o777, 0o640);
    }
  } finally { fs.rmSync(fixture.rootDir, { recursive: true, force: true }); }
});

test("production run controller bridges approved high-risk merge through the deterministic merge writer", async () => {
  const fixture = makeVault();
  try {
    const op = mergeOperation("operation_production_merge");
    for (const [filePath, bytes] of Object.entries(op.before_bytes)) seed(fixture, filePath, bytes, 0o640);
    const services = Object.fromEntries(["create", "update", "merge", "noop"].map((kind) => [kind, Object.freeze({ kind, async prepare(input) { return { ok: true, value: { operation: input.operation } }; }, async authorize() { return { ok: true, value: {} }; }, async commit() { return { ok: false, reason: "legacy_commit_forbidden" }; } })]));
    const production = view("llmwiki-run-controller.js").createRunController({ app: fixture.app, operation_services: services, operation_provider: async () => op, risk_repacket_transform: async ({ operation: value }) => value });
    const started = await production.startOperation({ run_id: "run_production_merge" });
    const riskPacket = packetApi.buildRiskApprovalPacket({ run_id: started.run_id, run_revision: started.run_revision, packet_revision: 1, operation: op, summary: "검토한 지식 병합", provenance: { source: "integration", source_ids: op.source_citations.map((row) => row.source_id) } }).value;
    assert.equal(production.openRiskReview({ run_id: riskPacket.run_id, run_revision: riskPacket.run_revision, packets: [riskPacket] }).ok, true);
    const committed = await production.approveRisk({ action: "approve_risk", run_id: riskPacket.run_id, run_revision: riskPacket.run_revision, packet_id: riskPacket.packet_id });
    assert.equal(committed.status, "committed", JSON.stringify(committed));
    assert.deepEqual(committed.receipt.actual_touched_paths, writeSetApi.packetPaths(riskPacket, packetApi));
    assert.equal(committed.receipt.path_boundary_verified, true);
    assert.match(fs.readFileSync(path.join(fixture.rootDir, op.source_ids[0]), "utf8"), /llmwiki_supersession_relation_v1/);
    assert.equal(fs.readFileSync(path.join(fixture.rootDir, op.destination_ids[0]), "utf8"), op.after_bytes[op.destination_ids[0]]);
  } finally { fs.rmSync(fixture.rootDir, { recursive: true, force: true }); }
});

test("production run controller preserves Task13 commit outcome, repackets monotonically, and ignores old or duplicate approval", async () => {
  const fixture = makeVault();
  try {
    const op = operation("create", "operation_task13_risk", { after: "task13 production\n" });
    const services = Object.fromEntries(["create", "update", "merge", "noop"].map((kind) => [kind, Object.freeze({
      kind,
      async prepare(input) { return { ok: true, status: "review", value: { operation: input.operation } }; },
      async authorize() { return { ok: true, value: { authorized: true } }; },
      async commit() { return { ok: false, reason: "legacy_operation_commit_must_not_run" }; },
    })]));
    const adapter = transactionApi.createRiskVaultTransactionAdapter({ app: fixture.app });
    const production = view("llmwiki-run-controller.js").createRunController({ operation_services: services, operation_provider: async () => op, risk_transaction_adapter: adapter, risk_repacket_transform: async ({ operation: value }) => value });
    const started = await production.startOperation({ run_id: "run_task13_risk" });
    assert.equal(started.status, "review");
    const first = packetApi.buildRiskApprovalPacket({ run_id: started.run_id, run_revision: started.run_revision, packet_revision: 1, operation: op, summary: "Task13 production risk", provenance: { source: "integration", source_ids: op.source_citations.map((row) => row.source_id) } }).value;
    assert.equal(production.openRiskReview({ run_id: first.run_id, run_revision: first.run_revision, packets: [first] }).ok, true);
    assert.equal(production.getSnapshot().approval_packet, first, "controller snapshot must preserve private packet identity");
    const oldCallback = production.bindOperationApproval({ action: "approve", run_id: first.run_id, run_revision: first.run_revision }).value;
    const revised = await production.requestRiskRevision({ action: "request_risk_revision", run_id: first.run_id, run_revision: first.run_revision, packet_id: first.packet_id, guidance: "초보자에게 출처를 더 명확하게 설명해줘" });
    assert.equal(revised.status, "review", JSON.stringify(revised));
    assert.equal(production.getOperationSnapshot().run_revision, 2);
    assert.equal(production.getOperationSnapshot().status, "review");
    const late = await production.approveOperation(oldCallback);
    assert.equal(late.approval_callback_ignored, true);
    assert.equal(fixture.app.vault.touched.length, 0);
    const current = production.getSnapshot().risk_packets[0];
    const committed = await production.approveRisk({ action: "approve_risk", run_id: current.run_id, run_revision: current.run_revision, packet_id: current.packet_id });
    assert.equal(committed.status, "committed", JSON.stringify(committed));
    const operationSnapshot = production.getOperationSnapshot();
    assert.equal(operationSnapshot.status, "committed");
    assert.equal(operationSnapshot.canonical_outcome.operation_id, op.operation_id);
    assert.deepEqual(operationSnapshot.follow_up, {
      status: "pending",
      refresh: { status: "skipped", attempts: 0, reason: null },
      git: { status: "pending", attempts: 0, reason: null },
    });
    assert.equal(fs.readFileSync(path.join(fixture.rootDir, op.destination_ids[0]), "utf8"), op.after_bytes[op.destination_ids[0]]);
    const touched = fixture.app.vault.touched.length;
    const duplicate = await production.approveRisk({ action: "approve_risk", run_id: current.run_id, run_revision: current.run_revision, packet_id: current.packet_id });
    assert.equal(duplicate.reason, "stale_risk_action");
    assert.equal(fixture.app.vault.touched.length, touched, "duplicate approval must not recommit canonical bytes");
    const retried = await production.retryOperationFollowUp({ action: "retry_follow_up", follow_up: "git" });
    assert.deepEqual(retried.follow_up, {
      status: "pending",
      refresh: { status: "skipped", attempts: 0, reason: null },
      git: { status: "pending", attempts: 1, reason: null },
    });
    assert.equal(fixture.app.vault.touched.length, touched, "unconfigured Git retry must not repeat canonical writes");
  } finally { fs.rmSync(fixture.rootDir, { recursive: true, force: true }); }
});

test("production risk controller binds run identity and real repacket invalidates old actions and late callbacks", async () => {
  const fixture = makeVault();
  try {
    const original = packet(operation("create", "operation_controller_risk", { after: "controller\n" }));
    const adapter = transactionApi.createRiskVaultTransactionAdapter({ app: fixture.app });
    const invalidations = [];
    const controller = riskControllerApi.create({ packetApi, reviewCommitApi: reviewCommit, batchApi, repacketApi, adapter, invalidateRun: async (identity) => { invalidations.push(identity); return { ok: true, status: "cancelled" }; }, transform: async ({ operation: value }) => value });
    assert.equal(controller.open({ run_id: original.run_id, run_revision: original.run_revision, packets: [original] }).ok, true);
    const revised = await controller.requestRevision({ action: "request_risk_revision", run_id: original.run_id, run_revision: original.run_revision, packet_id: original.packet_id, guidance: "출처를 더 명확하게 설명해줘" });
    assert.equal(revised.status, "review");
    assert.equal(revised.packet.run_revision, 2);
    assert.equal(invalidations.length, 1);
    const stale = await controller.approve({ action: "approve_risk", run_id: original.run_id, run_revision: original.run_revision, packet_id: original.packet_id });
    assert.equal(stale.reason, "stale_risk_action");
    assert.equal(fixture.app.vault.touched.length, 0);
    const current = controller.getSnapshot();
    assert.equal(current.run_revision, 2);
    assert.notEqual(current.risk_packets[0].packet_id, original.packet_id);
  } finally { fs.rmSync(fixture.rootDir, { recursive: true, force: true }); }
});
