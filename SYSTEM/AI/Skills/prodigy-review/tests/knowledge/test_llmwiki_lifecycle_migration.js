"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../../../../..");
const migration = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-migration.js"));
const CLI = path.join(ROOT, "script/migrate-llmwiki-lifecycle.js");

function makeVault() {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-migration-vault-"));
  for (const dir of ["HUB", "SYSTEM", "ZETA/PERMANENT", "ZETA/LITERATURE", "ZETA/FLEETING", "ZETA/CANDIDATES"]) fs.mkdirSync(path.join(vaultRoot, dir), { recursive: true });
  const notes = [
    ["ZETA/PERMANENT/Legacy Note.md", "---\ntype: knowledge\n---\nLegacy"],
    ["ZETA/PERMANENT/V2 Note.md", `---\ntype: knowledge\nschema_version: 2\ncanonical_id: canonical_v2\n---\nV2`],
    ["ZETA/LITERATURE/Source.md", "---\ntype: literature_note\n---\nSource"],
    ["ZETA/FLEETING/2026-08-25.md", "# Thought"],
    ["ZETA/CANDIDATES/Candidate.md", "---\ntype: knowledge_candidate\n---\nCandidate"],
    ["ZETA/PERMANENT/Credential.md", "---\ntype: knowledge\n---\napi_key = sk-abcdefghijklmnopqrstuvwx"],
  ];
  for (const [relative, bytes] of notes) fs.writeFileSync(path.join(vaultRoot, relative), bytes);
  return { vaultRoot, notes, cleanup: () => fs.rmSync(vaultRoot, { recursive: true, force: true }) };
}

function snapshot(vaultRoot) {
  const rows = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (!entry.isSymbolicLink()) {
        const stat = fs.statSync(absolute);
        rows.push(`${path.relative(vaultRoot, absolute)}:${stat.mtimeMs}:${crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex")}`);
      }
    }
  };
  walk(vaultRoot);
  return rows.sort();
}

test("it inventories deterministically with all seven local dispositions", () => {
  const vault = makeVault();
  try {
    fs.writeFileSync(path.join(vault.vaultRoot, "ZETA/PERMANENT/PARA.md"), "---\ntype: knowledge\nobject_id: project_alpha\n---\nPARA");
    fs.writeFileSync(path.join(vault.vaultRoot, "ZETA/PERMANENT/Legacy Permanent.md"), "---\ntype: permanent_note\n---\nLegacy");
    const first = migration.buildInventory({ vault_root: vault.vaultRoot });
    const second = migration.buildInventory({ vault_root: vault.vaultRoot });
    assert.equal(first.ok, true);
    assert.deepEqual(second.items, first.items);
    assert.deepEqual([...new Set(first.items.map((item) => item.disposition))].sort(), ["adopt_update", "candidate_migrate", "hold_quarantine", "legacy_unchanged", "literature_reclassify", "noop", "para_handoff"].sort());
  } finally { vault.cleanup(); }
});

test("it performs zero writes in safe default and explicit inventory dry run", () => {
  const vault = makeVault();
  try {
    const before = snapshot(vault.vaultRoot);
    const outputs = [];
    for (const flags of [[], ["--inventory", "--dry-run"]]) {
      const result = spawnSync(process.execPath, [CLI, "--vault-path", vault.vaultRoot, ...flags], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      outputs.push(JSON.parse(result.stdout));
      assert.equal(outputs.at(-1).zero_writes, true);
      assert.deepEqual(snapshot(vault.vaultRoot), before);
    }
    assert.deepEqual(outputs[1], outputs[0]);
  } finally { vault.cleanup(); }
});

test("it excludes forbidden nested paths, duplicate filenames, and symlinks", () => {
  const vault = makeVault();
  try {
    for (const relative of ["ZETA/PERMANENT/INBOX/hidden.md", "ZETA/PERMANENT/.trash/hidden.md", "ZETA/PERMANENT/evidence/hidden.md", "ZETA/PERMANENT/.llmwiki-audit/hidden.md", "ZETA/PERMANENT/Copy 2.md"]) {
      fs.mkdirSync(path.dirname(path.join(vault.vaultRoot, relative)), { recursive: true });
      fs.writeFileSync(path.join(vault.vaultRoot, relative), "---\ntype: knowledge\n---\n");
    }
    fs.symlinkSync(path.join(vault.vaultRoot, vault.notes[0][0]), path.join(vault.vaultRoot, "ZETA/PERMANENT/link.md"));
    const inventory = migration.buildInventory({ vault_root: vault.vaultRoot });
    assert.equal(inventory.ok, true);
    assert.equal(inventory.total_items, 6);
    assert.equal(inventory.items.some((item) => /(?:INBOX|\.trash|evidence|\.llmwiki-audit| 2\.|link\.md)/u.test(item.path)), false);
  } finally { vault.cleanup(); }
});

test("it rejects unsafe roots, unknown or duplicate flags, and incomplete explicit modes", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-notavault-"));
  try {
    const cases = [
      { flags: [], reason: "unsafe_vault_root" },
      { flags: ["--inventory"], reason: "incomplete_mode" },
      { flags: ["--dry-run"], reason: "incomplete_mode" },
      { flags: ["--frobnicate"], reason: "unknown_flag" },
      { flags: ["--inventory", "--inventory"], reason: "ambiguous_flag" },
    ];
    for (const item of cases) {
      const result = spawnSync(process.execPath, [CLI, "--vault-path", empty, ...item.flags], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.equal(JSON.parse(result.stdout).reason, item.reason);
    }
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test("it exposes no duplicate authority or generic migration writer", () => {
  for (const name of ["createEligibleClaimSet", "requirePromotionReceipt", "createApprovalReceipt", "verifyApproval", "executeApprovedMigration"]) assert.equal(migration[name], undefined);
});
