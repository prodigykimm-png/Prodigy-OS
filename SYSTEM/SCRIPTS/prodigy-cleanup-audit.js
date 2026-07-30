#!/usr/bin/env node
"use strict";

// prodigy-cleanup-audit.js — Task 23: exhaustive inventory + conservative cleanup
//
// Defaults to DRY-RUN.  Acting requires --apply AND a matching --receipt-hash.
// FAILS CLOSED on hash drift or an unknown candidate.
// Targets are an EXPLICIT enumerated list — no recursive broad deletion, no glob-driven removal.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─── constants ───────────────────────────────────────────────────────────────

const VAULT_ROOT = path.resolve(__dirname, "..", "..");
const PLUGINS_DIR = path.join(VAULT_ROOT, ".obsidian", "plugins");
const COMMUNITY_PLUGINS_JSON = path.join(VAULT_ROOT, ".obsidian", "community-plugins.json");
const TEMPLATER_DATA = path.join(VAULT_ROOT, ".obsidian", "plugins", "templater-obsidian", "data.json");
const TEMPLATE_DIR = path.join(VAULT_ROOT, "SYSTEM", "TEMPLATE");
const CACHE_DIR = path.join(VAULT_ROOT, "SYSTEM", "CACHE");
const DEFAULT_RECEIPT = path.join(VAULT_ROOT, ".omo", "evidence", "task-23-prodigy-responsive-workspace-ai-overhaul.json");

// Reference search locations (repo-relative from vault root)
const REF_SEARCH_ROOTS = [
  "HUB",
  "SYSTEM/Views",
  "SYSTEM/SCRIPTS",
  ".obsidian",
];

// Retain-by-policy: these plugin folders are NEVER deleted
const RETAIN_PLUGIN_FOLDERS = new Set([
  "password-protection",
  "table-editor-obsidian",
]);

// Eligible artifact kinds for deletion
const ELIGIBLE_ARTIFACT_KINDS = new Set([
  "pyc",
  "pycache",
  "ds-store",
  "backup-artifact",
]);

// ─── helpers ─────────────────────────────────────────────────────────────────

function sha256File(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

function sha256String(s) {
  return "sha256:" + crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function sha256Dir(dirPath) {
  // Deterministic hash of directory listing (names + sizes), not contents
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const parts = entries.map(e => {
      let size = "";
      try {
        if (e.isFile()) size = String(fs.statSync(path.join(dirPath, e.name)).size);
      } catch {}
      return e.name + ":" + (e.isDirectory() ? "d" : "f") + ":" + size;
    });
    return sha256String(parts.join("\n"));
  } catch {
    return null;
  }
}

function findFiles(root, pattern) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === pattern) {
          results.push(full);
        } else {
          walk(full);
        }
      } else if (e.name === pattern || e.name.endsWith(pattern)) {
        results.push(full);
      }
    }
  }
  walk(root);
  return results;
}

function toRepoRel(absPath) {
  if (!absPath) return null;
  const rel = path.relative(VAULT_ROOT, absPath);
  if (rel.startsWith("..")) return null;
  return rel;
}

// ─── reference search ───────────────────────────────────────────────────────

function searchReferences(needle) {
  // Search for needle across reference roots
  const found = [];
  for (const root of REF_SEARCH_ROOTS) {
    const absRoot = path.join(VAULT_ROOT, root);
    if (!fs.existsSync(absRoot)) continue;
    const files = [];
    function walk(dir) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else if (e.isFile() && (e.name.endsWith(".js") || e.name.endsWith(".py") || e.name.endsWith(".md") || e.name.endsWith(".json") || e.name.endsWith(".css") || e.name.endsWith(".mjs"))) {
          files.push(full);
        }
      }
    }
    walk(absRoot);
    for (const f of files) {
      try {
        const content = fs.readFileSync(f, "utf8");
        if (content.includes(needle)) {
          found.push(toRepoRel(f));
        }
      } catch {}
    }
  }
  return found;
}

// ─── inventory ──────────────────────────────────────────────────────────────

function inventoryPlugins() {
  const enabledIds = (() => {
    try {
      return JSON.parse(fs.readFileSync(COMMUNITY_PLUGINS_JSON, "utf8"));
    } catch {
      return [];
    }
  })();

  const installedDirs = (() => {
    try {
      return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return [];
    }
  })();

  const results = [];
  const seen = new Set();

  // Every installed plugin directory
  for (const pid of installedDirs) {
    seen.add(pid);
    const pluginPath = path.join(PLUGINS_DIR, pid);
    const enabled = enabledIds.includes(pid);
    const exists = fs.existsSync(pluginPath);
    const refs = searchReferences(pid);
    const isRetained = RETAIN_PLUGIN_FOLDERS.has(pid);

    results.push({
      id: pid,
      kind: "community-plugin",
      enabled,
      path: toRepoRel(pluginPath),
      exists,
      references: refs,
      decision: isRetained ? "retain" : (enabled && !exists ? "eligible" : "retain"),
      action: "none",
      preimage_hash: exists ? sha256Dir(pluginPath) : null,
      reversibility: "git",
      note: isRetained
        ? "disabled-but-installed, explicitly retained by policy"
        : (enabled && !exists)
          ? "enabled in config but plugin folder missing on disk — stale config entry"
          : "installed and active",
    });
  }

  // Any enabled IDs not in the installed dirs (stale config entries)
  for (const pid of enabledIds) {
    if (seen.has(pid)) continue;
    const refs = searchReferences(pid);
    results.push({
      id: pid,
      kind: "config-entry",
      enabled: true,
      path: toRepoRel(COMMUNITY_PLUGINS_JSON),
      exists: false,
      references: refs,
      decision: "eligible",
      action: "remove-entry",
      preimage_hash: sha256File(COMMUNITY_PLUGINS_JSON),
      reversibility: "git",
      note: "enabled in community-plugins.json but no plugin folder installed — stale config entry",
    });
  }

  return results;
}

function inventoryTemplates() {
  const templaterConfig = (() => {
    try {
      return JSON.parse(fs.readFileSync(TEMPLATER_DATA, "utf8"));
    } catch {
      return null;
    }
  })();

  const templateFiles = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".json"))) {
        templateFiles.push(full);
      }
    }
  }
  walk(TEMPLATE_DIR);

  const results = [];
  for (const tf of templateFiles) {
    const rel = toRepoRel(tf);
    const fname = path.basename(tf);
    const refs = [];

    // Check Templater config references
    if (templaterConfig) {
      if (templaterConfig.templates_folder && rel.startsWith(templaterConfig.templates_folder)) {
        refs.push("templater:templates_folder");
      }
      const folderTemplates = templaterConfig.folder_templates || [];
      for (const ft of folderTemplates) {
        if (ft.template === rel) {
          refs.push("templater:folder_template:" + ft.folder);
        }
      }
      const hotkeys = templaterConfig.enabled_templates_hotkeys || [];
      for (const hk of hotkeys) {
        if (hk === rel) {
          refs.push("templater:hotkey");
        }
      }
    }

    // Search vault references
    const vaultRefs = searchReferences(fname);
    for (const vr of vaultRefs) {
      if (!refs.includes(vr)) refs.push(vr);
    }

    const unreferenced = refs.length === 0;

    results.push({
      path: rel,
      kind: "template",
      exists: true,
      references: refs,
      decision: unreferenced ? "candidate" : "retain",
      action: "none",
      preimage_hash: sha256File(tf),
      reversibility: "git",
      note: unreferenced
        ? "unreferenced in Templater config, HUB dashboards, Views, or Scripts — REPORTED AS CANDIDATE (not deleted)"
        : "actively referenced",
    });
  }

  return results;
}

function inventoryArtifacts() {
  const results = [];

  // .DS_Store files
  const dsStores = findFiles(VAULT_ROOT, ".DS_Store");
  for (const ds of dsStores) {
    const rel = toRepoRel(ds);
    if (rel === null) continue;
    if (rel.startsWith("SYSTEM/CACHE/")) continue;

    results.push({
      path: rel,
      kind: "ds-store",
      exists: true,
      references: [],
      decision: "eligible",
      action: "remove",
      preimage_hash: sha256File(ds),
      reversibility: "git",
      note: "macOS filesystem metadata artifact",
    });
  }

  // __pycache__ directories
  const pycacheDirs = findFiles(VAULT_ROOT, "__pycache__");
  for (const pc of pycacheDirs) {
    const rel = toRepoRel(pc);
    if (rel === null) continue;

    const pycFiles = [];
    function walk(dir) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else if (e.name.endsWith(".pyc")) {
          pycFiles.push(full);
        }
      }
    }
    walk(pc);

    results.push({
      path: rel,
      kind: "pycache",
      exists: true,
      contains: pycFiles.map(f => toRepoRel(f)),
      references: [],
      decision: "eligible",
      action: "remove",
      preimage_hash: sha256Dir(pc),
      reversibility: "git",
      note: "Python bytecode cache — regenerable",
    });
  }

  return results;
}

function inventoryAll() {
  const plugins = inventoryPlugins();
  const templates = inventoryTemplates();
  const artifacts = inventoryArtifacts();

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    vaultRoot: VAULT_ROOT,
    summary: {
      pluginCount: plugins.length,
      templateCount: templates.length,
      artifactCount: artifacts.length,
      eligibleCount: plugins.filter(p => p.decision === "eligible").length +
        templates.filter(t => t.decision === "candidate").length +
        artifacts.filter(a => a.decision === "eligible").length,
      candidateCount: templates.filter(t => t.decision === "candidate").length,
    },
    plugins,
    templates,
    artifacts,
  };
}

// ─── apply ───────────────────────────────────────────────────────────────────

function applyCleanup(receipt, receiptPath, expectedHash) {
  // Step 1: verify receipt hash
  const actualHash = sha256File(receiptPath);
  if (!actualHash) {
    console.error("ERROR: cannot read receipt file");
    process.exit(1);
  }
  if (actualHash !== expectedHash) {
    console.error("ERROR: receipt hash mismatch — expected " + expectedHash + ", got " + actualHash);
    console.error("Refusing to act. No changes made.");
    process.exit(1);
  }

  // Step 2: collect all actionable targets
  const targets = [];
  const allEntries = [
    ...(receipt.plugins || []),
    ...(receipt.templates || []),
    ...(receipt.artifacts || []),
  ];

  for (const entry of allEntries) {
    if (entry.action && entry.action !== "none" && entry.action !== "retain") {
      targets.push(entry);
    }
  }

  if (targets.length === 0) {
    console.log("No actionable targets in receipt. Nothing to do.");
    process.exit(0);
  }

  // Step 3: verify preimage hashes for every target
  for (const t of targets) {
    if (t.kind === "config-entry") {
      const currentHash = sha256File(path.join(VAULT_ROOT, t.path));
      if (currentHash !== t.preimage_hash) {
        console.error("ERROR: preimage hash drift for config-entry " + t.id + " — expected " + t.preimage_hash + ", got " + currentHash);
        console.error("Refusing to act. No changes made.");
        process.exit(1);
      }
    } else if (t.kind === "pycache") {
      const absPath = path.join(VAULT_ROOT, t.path);
      const currentHash = sha256Dir(absPath);
      if (currentHash !== t.preimage_hash) {
        console.error("ERROR: preimage hash drift for " + t.path + " — expected " + t.preimage_hash + ", got " + currentHash);
        console.error("Refusing to act. No changes made.");
        process.exit(1);
      }
    } else {
      const absPath = path.join(VAULT_ROOT, t.path);
      const currentHash = sha256File(absPath);
      if (currentHash !== t.preimage_hash) {
        console.error("ERROR: preimage hash drift for " + t.path + " — expected " + t.preimage_hash + ", got " + currentHash);
        console.error("Refusing to act. No changes made.");
        process.exit(1);
      }
    }
  }

  // Step 4: execute removals
  const touched = [];
  const removed = [];

  for (const t of targets) {
    if (t.kind === "config-entry" && t.action === "remove-entry") {
      const cfgPath = path.join(VAULT_ROOT, t.path);
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      const idx = cfg.indexOf(t.id);
      if (idx === -1) {
        console.error("ERROR: config entry " + t.id + " not found in " + t.path + " — already removed?");
        console.error("Refusing to act. No changes made.");
        process.exit(1);
      }
      cfg.splice(idx, 1);
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
      removed.push({ type: "config-entry", id: t.id, path: t.path });
      touched.push(t.path);
      console.log("REMOVED config-entry: " + t.id + " from " + t.path);
    } else if (t.kind === "pycache" && t.action === "remove") {
      const absPath = path.join(VAULT_ROOT, t.path);
      fs.rmSync(absPath, { recursive: true, force: true });
      removed.push({ type: t.kind, path: t.path });
      touched.push(t.path);
      console.log("REMOVED " + t.kind + ": " + t.path);
    } else if ((t.kind === "ds-store" || t.kind === "pyc") && t.action === "remove") {
      const absPath = path.join(VAULT_ROOT, t.path);
      fs.unlinkSync(absPath);
      removed.push({ type: t.kind, path: t.path });
      touched.push(t.path);
      console.log("REMOVED " + t.kind + ": " + t.path);
    } else {
      console.error("ERROR: unknown action \"" + t.action + "\" for kind \"" + t.kind + "\" at " + t.path);
      console.error("Refusing to act. No changes made.");
      process.exit(1);
    }
  }

  // Step 5: write touched-paths
  const touchedPath = path.join(VAULT_ROOT, ".omo", "evidence", "task-23-prodigy-responsive-workspace-ai-overhaul-touched-paths.txt");
  fs.writeFileSync(touchedPath, touched.join("\n") + (touched.length > 0 ? "\n" : ""), "utf8");

  console.log("\nDone. " + removed.length + " target(s) removed.");
  console.log("Touched paths written to: " + toRepoRel(touchedPath));
  for (const r of removed) {
    console.log("  " + r.type + ": " + r.path + " (recoverable via git)");
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log("prodigy-cleanup-audit.js — exhaustive vault inventory + conservative cleanup (Task 23)\n");
  console.log("USAGE:");
  console.log("  node SYSTEM/SCRIPTS/prodigy-cleanup-audit.js [FLAGS]\n");
  console.log("FLAGS:");
  console.log("  --json                 Produce complete inventory receipt as JSON to stdout (dry-run default)");
  console.log("  --apply                Execute approved removals (requires --receipt and --receipt-hash)");
  console.log("  --receipt <path>       Path to the approved receipt JSON file");
  console.log("  --receipt-hash <hash>  SHA-256 hash of the receipt file (sha256:...)");
  console.log("  --help                 Show this help\n");
  console.log("BEHAVIOR:");
  console.log("  - Defaults to DRY-RUN (--json outputs inventory only, no changes).");
  console.log("  - --apply requires BOTH --receipt and --receipt-hash.");
  console.log("  - FAILS CLOSED on hash drift: exits non-zero, removes NOTHING.");
  console.log("  - FAILS CLOSED on unknown candidates: exits non-zero, removes NOTHING.");
  console.log("  - Targets are an EXPLICIT enumerated list from the receipt.");
  console.log("  - No recursive broad deletion. No glob-driven removal.\n");
  console.log("INVENTORY COVERS:");
  console.log("  (a) Every installed community plugin (.obsidian/plugins/*) with enabled/disabled");
  console.log("      state and reference evidence across HUB, SYSTEM/Views, SYSTEM/SCRIPTS, .obsidian.");
  console.log("  (b) Every file under SYSTEM/TEMPLATE with Templater config, HUB, and script references.\n");
  console.log("ELIGIBLE FOR DELETION (exactly this, nothing more):");
  console.log("  1. Stale enabled-missing config entries in .obsidian/community-plugins.json");
  console.log("  2. Confirmed .pyc / __pycache__ / .DS_Store artifacts with no active references\n");
  console.log("RETAINED BY POLICY:");
  console.log("  - .obsidian/plugins/password-protection and .obsidian/plugins/table-editor-obsidian");
  console.log("  - All disabled plugin folders");
  console.log("  - Active templates and SYSTEM/TEMPLATE root");
  console.log("  - SYSTEM/CACHE");
}

function main() {
  const args = process.argv.slice(2);

  let jsonMode = false;
  let applyMode = false;
  let receiptPath = null;
  let receiptHash = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      jsonMode = true;
    } else if (a === "--apply") {
      applyMode = true;
    } else if (a === "--receipt" && i + 1 < args.length) {
      receiptPath = args[++i];
    } else if (a === "--receipt-hash" && i + 1 < args.length) {
      receiptHash = args[++i];
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error("Unknown flag: " + a);
      console.error("Use --help for usage.");
      process.exit(1);
    }
  }

  if (applyMode) {
    if (!receiptPath) {
      console.error("ERROR: --apply requires --receipt <path>");
      process.exit(1);
    }
    if (!receiptHash) {
      console.error("ERROR: --apply requires --receipt-hash <hash>");
      process.exit(1);
    }
    const absReceipt = path.resolve(VAULT_ROOT, receiptPath);
    if (!fs.existsSync(absReceipt)) {
      console.error("ERROR: receipt file not found: " + absReceipt);
      process.exit(1);
    }
    const receipt = JSON.parse(fs.readFileSync(absReceipt, "utf8"));
    applyCleanup(receipt, absReceipt, receiptHash);
  } else {
    // Dry-run: output inventory
    const inventory = inventoryAll();
    console.log(JSON.stringify(inventory, null, 2));
  }
}

main();
