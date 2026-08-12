#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const RELEASE_FIXTURE = path.join(__dirname, "fixtures/release-vault");
const MARKER = ".prodigy-disposable-fixture";
const OWNED_ROOTS = Object.freeze(["DAILY", "PARA", "ZETA", "SYSTEM/AI/Memory", ".llmwiki-audit"]);
const HASH = /^[a-f0-9]{64}$/u;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function safeRelative(value) {
  const text = String(value || "").split(path.sep).join("/");
  if (!text || text.startsWith("/") || text.includes("\\") || path.posix.normalize(text) !== text || text.startsWith("../")) throw new Error(`unsafe backup path: ${text}`);
  return text;
}
function assertNoSymlinkPath(target) {
  const resolved = path.resolve(target);
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) throw new Error("backup_symlink_forbidden");
  let existing = resolved; const suffix = [];
  while (!fs.existsSync(existing)) { suffix.unshift(path.basename(existing)); const parent = path.dirname(existing); if (parent === existing) break; existing = parent; }
  const canonical = path.join(fs.realpathSync(existing), ...suffix); let current = path.parse(canonical).root;
  for (const part of canonical.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("backup_symlink_forbidden");
  }
  return canonical;
}
function assertDisposable(root) {
  const resolved = assertNoSymlinkPath(root);
  const marker = path.join(resolved, MARKER);
  if (resolved === ROOT || !fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() || !fs.statSync(marker).isFile()) throw new Error("source_not_disposable_fixture");
  const real = fs.realpathSync(resolved);
  if (real !== resolved) throw new Error("backup_symlink_forbidden");
  return real;
}
function walk(root, current = root, output = []) {
  if (!fs.existsSync(current)) return output;
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error("backup_symlink_forbidden");
    if (entry.isDirectory()) walk(root, absolute, output);
    else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join("/"));
    else throw new Error("backup_non_regular_entry");
  }
  return output;
}
function isOwned(relative) { return OWNED_ROOTS.some((root) => relative === root || relative.startsWith(`${root}/`)); }
function canonicalManifest(source) {
  const root = assertDisposable(source);
  return walk(root).filter((relative) => relative !== MARKER && isOwned(relative)).map((relative) => ({ path: safeRelative(relative), sha256: sha256(fs.readFileSync(path.join(root, relative))) }));
}
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function createBackup(source, backupRoot) {
  const sourceRoot = assertDisposable(source);
  const destination = assertNoSymlinkPath(backupRoot);
  if (fs.existsSync(destination)) throw new Error("backup_destination_exists");
  const staging = `${destination}.staging-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    const files = [];
    for (const relative of walk(sourceRoot).filter((item) => item !== MARKER && isOwned(item))) {
      const safe = safeRelative(relative), sourceFile = path.join(sourceRoot, safe);
      assertNoSymlinkPath(sourceFile); const bytes = fs.readFileSync(sourceFile);
      const target = path.join(staging, "payload", safe); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: "wx" }); files.push({ path: safe, sha256: sha256(bytes) });
    }
    const body = { schema_version: "prodigy-repository-data-backup-v1", algorithm: "sha256", owned_roots: OWNED_ROOTS, files };
    body.manifest_sha256 = sha256(JSON.stringify(body)); writeJson(path.join(staging, "manifest.json"), body);
    readVerifiedBackup(staging); fs.renameSync(staging, destination); return body;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
function readVerifiedBackup(backupRoot) {
  const root = assertNoSymlinkPath(backupRoot);
  const manifestPath = path.join(root, "manifest.json");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (_error) { throw new Error("backup_manifest_malformed"); }
  const supplied = manifest.manifest_sha256;
  const body = { ...manifest }; delete body.manifest_sha256;
  if (manifest.schema_version !== "prodigy-repository-data-backup-v1" || manifest.algorithm !== "sha256" || !HASH.test(supplied || "") || sha256(JSON.stringify(body)) !== supplied || JSON.stringify(manifest.owned_roots) !== JSON.stringify(OWNED_ROOTS) || !Array.isArray(manifest.files)) throw new Error("backup_manifest_tampered");
  const seen = new Set();
  for (const entry of manifest.files) {
    const relative = safeRelative(entry && entry.path);
    if (!isOwned(relative) || seen.has(relative) || !HASH.test(entry.sha256 || "")) throw new Error("backup_manifest_tampered");
    seen.add(relative);
    const file = path.join(root, "payload", relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || sha256(fs.readFileSync(file)) !== entry.sha256) throw new Error("backup_payload_tampered");
  }
  const actual = walk(path.join(root, "payload"));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files.map((entry) => entry.path))) throw new Error("backup_payload_inventory_mismatch");
  return manifest;
}
function restoreBackup(backupRoot, destination, operations = fs) {
  const targetRoot = assertDisposable(destination);
  const backup = assertNoSymlinkPath(backupRoot); const manifest = readVerifiedBackup(backup);
  const staging = fs.mkdtempSync(path.join(path.dirname(targetRoot), ".prodigy-restore-stage-"));
  const rollback = fs.mkdtempSync(path.join(path.dirname(targetRoot), ".prodigy-restore-rollback-"));
  const moved = [];
  try {
    fs.writeFileSync(path.join(staging, MARKER), "temporary fixture only\n");
    for (const entry of manifest.files) {
      const bytes = fs.readFileSync(path.join(backup, "payload", entry.path));
      if (sha256(bytes) !== entry.sha256) throw new Error("backup_payload_tampered");
      const target = path.join(staging, entry.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: "wx" });
    }
    if (JSON.stringify(canonicalManifest(staging)) !== JSON.stringify(manifest.files)) throw new Error("restore_hash_mismatch");
    for (const owned of OWNED_ROOTS) {
      const current = path.join(targetRoot, owned), next = path.join(staging, owned), prior = path.join(rollback, owned);
      const hadPrior = fs.existsSync(current);
      if (hadPrior) { fs.mkdirSync(path.dirname(prior), { recursive: true }); operations.renameSync(current, prior); }
      const record = { current, prior, hadPrior, installed: false };
      moved.push(record);
      if (fs.existsSync(next)) { fs.mkdirSync(path.dirname(current), { recursive: true }); operations.renameSync(next, current); record.installed = true; }
    }
    const restored = canonicalManifest(targetRoot);
    if (JSON.stringify(restored) !== JSON.stringify(manifest.files)) throw new Error("restore_hash_mismatch");
    return restored;
  } catch (error) {
    for (const { current, prior, hadPrior, installed } of moved.reverse()) {
      if (installed) fs.rmSync(current, { recursive: true, force: true });
      if (hadPrior && fs.existsSync(prior)) { fs.mkdirSync(path.dirname(current), { recursive: true }); fs.renameSync(prior, current); }
    }
    throw error;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); fs.rmSync(rollback, { recursive: true, force: true }); }
}
function seedDisposableFixture(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, MARKER), "temporary fixture only\n");
  const caseFixture = JSON.parse(fs.readFileSync(path.join(RELEASE_FIXTURE, "cases/minimal-valid-object.json"), "utf8"));
  for (const [relative, bytes] of Object.entries(caseFixture.files || {})) {
    const target = path.join(root, safeRelative(relative)); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  }
  const synthetic = {
    "DAILY/MONTHLY/2026-08.md": "# Synthetic monthly fixture\n",
    "ZETA/PERMANENT/Synthetic.md": "---\ntype: knowledge\n---\n# Synthetic\n",
    "SYSTEM/AI/Memory/workout/index.json": "{\"schema_version\":\"prodigy-workout-index-v1\",\"programs\":[],\"runs\":[],\"sessions\":[],\"imports\":[]}\n",
    ".llmwiki-audit/synthetic_nonce_0001.json": "{\"result\":\"committed\",\"fixture\":true}\n",
  };
  for (const [relative, bytes] of Object.entries(synthetic)) { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
}
function runDrill() {
  const drillRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-backup-drill-"));
  const source = path.join(drillRoot, "source"); const backup = path.join(drillRoot, "backup"); const tampered = path.join(drillRoot, "tampered");
  let receipt;
  try {
    seedDisposableFixture(source);
    const before = canonicalManifest(source);
    const created = createBackup(source, backup);
    fs.writeFileSync(path.join(source, before[0].path), "corrupt source\n");
    if (before[1]) fs.rmSync(path.join(source, before[1].path), { force: true });
    fs.cpSync(backup, tampered, { recursive: true });
    fs.appendFileSync(path.join(tampered, "payload", before[0].path), "tamper");
    let negative = "";
    try { restoreBackup(tampered, source); } catch (error) { negative = error.message; }
    if (negative !== "backup_payload_tampered") throw new Error(`tampered backup was not rejected: ${negative}`);
    const restored = restoreBackup(backup, source);
    if (JSON.stringify(before) !== JSON.stringify(restored)) throw new Error("drill_manifest_mismatch");
    receipt = { ok: true, schema_version: "prodigy-backup-drill-receipt-v1", before, restored, canonical_set_sha256: sha256(JSON.stringify(before)), backup_manifest_sha256: created.manifest_sha256, negative: { tampered_backup_rejected: true, reason: negative }, cleanup: { all_roots_deleted: false } };
  } finally { fs.rmSync(drillRoot, { recursive: true, force: true }); }
  receipt.cleanup.all_roots_deleted = !fs.existsSync(drillRoot);
  receipt.digest = sha256(JSON.stringify(receipt));
  return receipt;
}
function main(argv) {
  if (argv.length === 1 && argv[0] === "drill") return runDrill();
  if (argv.length === 3 && argv[0] === "create") return createBackup(argv[1], argv[2]);
  if (argv.length === 3 && argv[0] === "restore") return { ok: true, restored: restoreBackup(argv[1], argv[2]) };
  if (argv.length === 2 && argv[0] === "manifest") return canonicalManifest(argv[1]);
  throw new Error("Usage: node SYSTEM/CI/repository-data-backup.js drill | create <disposable-source> <backup-root> | restore <backup-root> <marked-disposable-destination> | manifest <marked-disposable-source>");
}
if (require.main === module) { try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); } catch (error) { process.stderr.write(`repository backup failed: ${error.message}\n`); process.exitCode = 1; } }
module.exports = Object.freeze({ OWNED_ROOTS, canonicalManifest, createBackup, restoreBackup, readVerifiedBackup, runDrill, seedDisposableFixture });
