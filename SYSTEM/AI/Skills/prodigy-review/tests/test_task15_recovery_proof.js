"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../..");
const recovery = require(path.join(ROOT, "SYSTEM/CI/recovery-proof-harness.js"));
const backup = require(path.join(ROOT, "SYSTEM/CI/repository-data-backup.js"));

test("Task 15 exposes exactly six independent production-seam recovery injections", async () => {
  assert.deepEqual(recovery.SCENARIO_IDS, [
    "mtime-conflict", "interrupted-atomic-write", "delayed-synced-module",
    "stale-approval-candidate", "derived-cache-rebuild", "authorized-mutation-rollback",
  ]);
  for (const id of recovery.SCENARIO_IDS) {
    const receipt = await recovery.runScenario(id);
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
    assert.equal(receipt.scenario, id);
    assert.match(receipt.digest, /^[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(receipt.manifests), ["before", "failure", "after"]);
    assert.equal(receipt.proofs.clear_user_cause, true);
    assert.equal(receipt.proofs.bounded_recovery, true);
    assert.equal(receipt.proofs.no_partial_files, true);
    assert.equal(receipt.proofs.no_duplicate_records, true);
    assert.equal(receipt.cleanup.temp_root_deleted, true);
  }
});

test("corrupt Workout index fails closed and rebuild changes only the derived index", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task15-workout-index-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
  const adapter = storeApi.createNodeAdapter(temp);
  const base = "SYSTEM/AI/Memory/workout";
  const store = storeApi.createWorkoutStore(adapter, base);
  await adapter.write(`${base}/programs/program_one.json`, '{"id":"program_one","title":"Canonical"}\n');
  await adapter.write(`${base}/index.json`, '{"schema_version":');
  const canonicalBefore = crypto.createHash("sha256").update(await adapter.read(`${base}/programs/program_one.json`)).digest("hex");
  await assert.rejects(() => store.readIndex(), (error) => error.code === "CORRUPT_PERSISTED_JSON" && /손상/u.test(error.message));
  assert.equal(crypto.createHash("sha256").update(await adapter.read(`${base}/programs/program_one.json`)).digest("hex"), canonicalBefore);
  const rebuilt = await store.rebuildIndex();
  assert.deepEqual(rebuilt.programs, ["program_one"]);
  assert.equal(crypto.createHash("sha256").update(await adapter.read(`${base}/programs/program_one.json`)).digest("hex"), canonicalBefore);
});

test("Obsidian direct-write interruption restores exact bytes and leaves no residue", async () => {
  const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
  const files = new Map([["fixture/index.json", '{"schema_version":"prodigy-workout-index-v1","programs":[],"runs":[],"sessions":[],"imports":[]}\n']]);
  const folders = new Set(["fixture"]);
  let interrupt = true;
  const adapter = {
    preferDirectWrite: true,
    exists: async (item) => files.has(item) || folders.has(item),
    read: async (item) => files.get(item),
    mkdir: async (item) => folders.add(item),
    remove: async (item) => files.delete(item),
    write: async (item, bytes) => { if (interrupt && item === "fixture/programs/direct_one.json") { interrupt = false; files.set(item, bytes.slice(0, 7)); throw new Error("direct write interrupted"); } files.set(item, bytes); },
  };
  const store = storeApi.createWorkoutStore(adapter, "fixture");
  const before = files.get("fixture/index.json");
  await assert.rejects(() => store.saveProgram({ id: "direct_one" }), /direct write interrupted/);
  assert.equal(files.get("fixture/index.json"), before);
  assert.equal([...files.keys()].some((item) => /\.(?:tmp|backup|partial)$/u.test(item)), false);
  await store.saveProgram({ id: "direct_one" });
  assert.deepEqual((await store.readIndex()).programs, ["direct_one"]);
});

test("repository data backup drill restores exact canonical hashes and cleans every root", () => {
  const receipt = backup.runDrill();
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.deepEqual(receipt.before, receipt.restored);
  assert.equal(receipt.negative.tampered_backup_rejected, true);
  assert.equal(receipt.cleanup.all_roots_deleted, true);
});

test("Workout Node adapter rejects root and descendant symlinks for every operation with zero outside mutation", async (t) => {
  const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task15-workout-symlink-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "root"), outside = path.join(temp, "outside"); fs.mkdirSync(root); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "sentinel"), "outside-original\n"); fs.symlinkSync(outside, path.join(root, "link"));
  const adapter = storeApi.createNodeAdapter(root);
  for (const operation of [
    () => adapter.read("link/sentinel"), () => adapter.write("link/new", "x"), () => adapter.remove("link/sentinel"),
    () => adapter.rename("link/sentinel", "moved"), () => adapter.rename("safe", "link/moved"), () => adapter.list("link"),
  ]) await assert.rejects(operation, /symlink|forbidden|ENOENT/i);
  assert.equal(fs.readFileSync(path.join(outside, "sentinel"), "utf8"), "outside-original\n");
  assert.equal(fs.existsSync(path.join(outside, "new")), false);
  const rootLink = path.join(temp, "root-link"); fs.symlinkSync(root, rootLink);
  assert.throws(() => storeApi.createNodeAdapter(rootLink), /symlink/i);
});

test("Workout Node adapter revalidates stable parent identities after a deterministic race injection", async (t) => {
  const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task15-workout-parent-race-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "root"), outside = path.join(temp, "outside"); fs.mkdirSync(root); fs.mkdirSync(outside); fs.mkdirSync(path.join(root, "safe"));
  fs.writeFileSync(path.join(outside, "victim"), "outside-original\n");
  let injected = false;
  const adapter = storeApi.createNodeAdapter(root, { beforeMutation() {
    if (injected) return; injected = true;
    fs.renameSync(path.join(root, "safe"), path.join(root, "safe-original"));
    fs.symlinkSync(outside, path.join(root, "safe"));
  } });
  await assert.rejects(() => adapter.write("safe/victim", "overwritten\n"), /identity|symlink|replaced|forbidden/i);
  assert.equal(fs.readFileSync(path.join(outside, "victim"), "utf8"), "outside-original\n");
});

test("backup rollback authority is recorded before every risky rename", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task15-backup-rename-race-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = path.join(temp, "source"), archive = path.join(temp, "archive"); backup.seedDisposableFixture(source); backup.createBackup(source, archive);
  const sentinelPath = path.join(source, "DAILY/MONTHLY/2026-08.md"); fs.writeFileSync(sentinelPath, "original-sentinel\n");
  let renames = 0;
  assert.throws(() => backup.restoreBackup(archive, source, { renameSync(from, to) { renames += 1; if (renames === 2) throw new Error("injected second rename failure"); fs.renameSync(from, to); } }), /injected second rename failure/);
  assert.equal(fs.readFileSync(sentinelPath, "utf8"), "original-sentinel\n", "original survives byte-exactly");
});

test("backup rejects malformed and symlink roots before mutation and preserves destination on failed restore", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task15-backup-security-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = path.join(temp, "source"), archive = path.join(temp, "archive"); backup.seedDisposableFixture(source); backup.createBackup(source, archive);
  const before = backup.canonicalManifest(source);
  const malformed = path.join(temp, "malformed"); fs.mkdirSync(malformed); fs.writeFileSync(path.join(malformed, "manifest.json"), "{");
  assert.throws(() => backup.restoreBackup(malformed, source), /backup_manifest_malformed/);
  assert.deepEqual(backup.canonicalManifest(source), before);
  const rootLink = path.join(temp, "source-link"); fs.symlinkSync(source, rootLink);
  assert.throws(() => backup.canonicalManifest(rootLink), /symlink/);
  const marker = path.join(source, ".prodigy-disposable-fixture"), realMarker = `${marker}.real`; fs.renameSync(marker, realMarker); fs.symlinkSync(realMarker, marker);
  assert.throws(() => backup.canonicalManifest(source), /source_not_disposable|symlink/); fs.unlinkSync(marker); fs.renameSync(realMarker, marker);
  fs.appendFileSync(path.join(archive, "payload", before[0].path), "tamper");
  assert.throws(() => backup.restoreBackup(archive, source), /backup_payload_tampered/);
  assert.deepEqual(backup.canonicalManifest(source), before, "failed restore preserves the exact pre-restore destination");
});
