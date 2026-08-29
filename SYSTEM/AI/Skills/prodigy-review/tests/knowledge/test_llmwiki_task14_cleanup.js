"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const LEGACY = Object.freeze([
  "llmwiki-inbox-autopilot",
  "llmwiki-inbox-chunk-orchestrator",
  "llmwiki-production-operation-provider",
  "llmwiki-librarian-pipeline",
]);
const RETAINED = Object.freeze([
  "SYSTEM/Views/llmwiki-hash.js",
  "SYSTEM/Views/llmwiki-inbox-privacy-boundary.js",
  "SYSTEM/Views/llmwiki-sensitive-content-policy.js",
  "SYSTEM/Views/llmwiki-source-registry.js",
  "SYSTEM/Views/llmwiki-source-adapters.js",
  "SYSTEM/Views/llmwiki-operation-contract.js",
  "SYSTEM/Views/llmwiki-risk-approval-packet.js",
  "SYSTEM/Views/llmwiki-deterministic-commit.js",
  "SYSTEM/Views/llmwiki-compensation-service.js",
  "SYSTEM/Views/llmwiki-ui-recovery.js",
]);
const CANONICAL = Object.freeze({
  discovery: "SYSTEM/Views/llmwiki-inbox-discovery-queue.js",
  jobs: "SYSTEM/Views/llmwiki-batch-job-store.js",
  analyzer: "SYSTEM/Views/llmwiki-batch-analyzer.js",
  provider: "SYSTEM/Views/llmwiki-batch-provider.js",
  proposals: "SYSTEM/Views/llmwiki-inbox-proposal-materializer.js",
  controller: "SYSTEM/Views/llmwiki-run-controller.js",
  approval: "SYSTEM/Views/llmwiki-batch-approval-adapter.js",
  writer: "SYSTEM/Views/llmwiki-deterministic-commit.js",
});
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

function walk(relative, output = []) {
  const absolute = path.join(ROOT, relative);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child, output);
    else output.push(child);
  }
  return output;
}

function productionReferences() {
  const roots = ["HUB", "SYSTEM/Views", "SYSTEM/AI/Skills/prodigy-review/tests"];
  const candidates = roots.flatMap((root) => walk(root)).filter((file) => /\.(?:js|json|html|md)$/u.test(file) && file !== "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task14_cleanup.js");
  const hits = [];
  for (const file of candidates) {
    const source = read(file);
    for (const legacy of LEGACY) if (source.includes(legacy)) hits.push({ file, legacy });
  }
  return hits;
}

test("Task 6 archive is a complete byte-identical 117-entry restore authority", () => {
  const manifest = JSON.parse(read(".omo/evidence/llmwiki-batch-core-simplification/task-6/pre-move-manifest.json"));
  assert.equal(manifest.entries.length, 117);
  assert.equal(new Set(manifest.entries.map((entry) => entry.source)).size, 117);
  const archiveFiles = walk("SYSTEM/CACHE/llmwiki/legacy-duplicates");
  assert.equal(archiveFiles.length, 117);
  for (const entry of manifest.entries) {
    assert.equal(entry.archivePath, `SYSTEM/CACHE/llmwiki/legacy-duplicates/${entry.source}`);
    const bytes = fs.readFileSync(path.join(ROOT, entry.archivePath));
    assert.equal(bytes.length, entry.bytes, entry.source);
    assert.equal(sha256(bytes), entry.sha256, entry.source);
    assert.equal(fs.existsSync(path.join(ROOT, entry.source)), false, entry.source);
  }
});

test("one canonical module per responsibility remains and retained shared authorities stay loaded once", () => {
  const required = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("knowledge").required;
  for (const modulePath of [...Object.values(CANONICAL), ...RETAINED]) {
    assert.equal(required.filter((entry) => entry === modulePath).length, 1, modulePath);
    assert.equal(fs.existsSync(path.join(ROOT, modulePath)), true, modulePath);
  }
  for (const legacy of LEGACY) {
    const modulePath = `SYSTEM/Views/${legacy}.js`;
    assert.equal(required.includes(modulePath), false, modulePath);
    assert.equal(fs.existsSync(path.join(ROOT, modulePath)), false, modulePath);
  }
});

test("production and test graph has no legacy loader, import, string, Hub, or compatibility reference", () => {
  assert.deepEqual(productionReferences(), []);
  const duplicateJs = ["SYSTEM/Views", "SYSTEM/AI/Skills/prodigy-review/tests"].flatMap((root) => walk(root)).filter((file) => file.endsWith(" 2.js"));
  assert.deepEqual(duplicateJs, []);
});
