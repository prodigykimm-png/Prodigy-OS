#!/usr/bin/env node
/**
 * Prodigy Region Workspace Consolidation — Todo 0 Baseline
 *
 * Records the physical Vault baseline: HEAD SHA, dirty/untracked state,
 * SYSTEM/CACHE/** membership, Region Object membership, and manifest counts.
 * Output: .omo/evidence/prodigy-region-workspace-consolidation/task-0/baseline.json
 *
 * Usage: node SYSTEM/SCRIPTS/prodigy-consolidation-baseline.js
 * Vault root = process.cwd()
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const VAULT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(VAULT_ROOT, '.omo', 'evidence', 'prodigy-region-workspace-consolidation', 'task-0');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'baseline.json');

function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function getHeadSha() {
  return execSync('git rev-parse HEAD', { cwd: VAULT_ROOT, encoding: 'utf8' }).trim();
}

function getGitStatusPorcelain() {
  const raw = execSync('git status --porcelain', { cwd: VAULT_ROOT, encoding: 'utf8' });
  return raw.split('\n').filter(line => line.length > 0);
}

function parseStatusLines(lines) {
  const dirtyTracked = [];
  const untracked = [];
  for (const line of lines) {
    const xy = line.slice(0, 2);
    let filePath = line.slice(3);
    // Handle quoted paths (git quotes paths with special chars)
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = JSON.parse(filePath);
    }
    // Handle rename: "R  old -> new"
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop();
    }
    if (xy === '??') {
      untracked.push(filePath);
    } else {
      dirtyTracked.push(filePath);
    }
  }
  return { dirtyTracked, untracked };
}

function walkDirRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDirRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function recordCacheMembership() {
  const cacheDir = path.join(VAULT_ROOT, 'SYSTEM', 'CACHE');
  const files = walkDirRecursive(cacheDir);
  const membership = [];
  for (const filePath of files) {
    const stat = fs.lstatSync(filePath);
    const relPath = path.relative(VAULT_ROOT, filePath);
    if (stat.isSymbolicLink()) {
      membership.push({ path: relPath, type: 'symlink', sha256: null, rejected: true });
    } else if (stat.isFile()) {
      membership.push({ path: relPath, type: 'file', sha256: sha256File(filePath), rejected: false });
    } else {
      membership.push({ path: relPath, type: 'special', sha256: null, rejected: true });
    }
  }
  membership.sort((a, b) => a.path.localeCompare(b.path));
  return membership;
}

function recordRegionObjects() {
  const regionDir = path.join(VAULT_ROOT, 'PARA', 'RESOURCES', 'Auction Regions');
  const files = walkDirRecursive(regionDir);
  const objects = [];
  for (const filePath of files) {
    const relPath = path.relative(VAULT_ROOT, filePath);
    objects.push({ path: relPath, sha256: sha256File(filePath) });
  }
  objects.sort((a, b) => a.path.localeCompare(b.path));
  return objects;
}

function recordManifestCounts() {
  const indexPath = path.join(VAULT_ROOT, 'SYSTEM', 'SCRIPTS', 'region-metrics-manifest-index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const counts = {};
  let total = 0;
  for (const entry of index.manifests) {
    const manifestPath = path.join(VAULT_ROOT, 'SYSTEM', 'SCRIPTS', entry.manifest_path);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const count = manifest.regions.length;
    counts[entry.sido] = count;
    total += count;
  }
  counts.total = total;
  return counts;
}

function main() {
  const head = getHeadSha();
  const statusLines = getGitStatusPorcelain();
  const { dirtyTracked, untracked } = parseStatusLines(statusLines);

  const dirtyTrackedRecords = dirtyTracked.map(p => {
    const absPath = path.join(VAULT_ROOT, p);
    return { path: p, sha256: fs.existsSync(absPath) ? sha256File(absPath) : null };
  });

  const untrackedRecords = untracked.map(p => {
    const absPath = path.join(VAULT_ROOT, p);
    return { path: p, sha256: fs.existsSync(absPath) ? sha256File(absPath) : null };
  });

  const cacheMembership = recordCacheMembership();
  const regionObjects = recordRegionObjects();
  const manifestCounts = recordManifestCounts();

  const baseline = {
    generated_at: new Date().toISOString(),
    vault_root: VAULT_ROOT,
    head,
    git_status_porcelain: statusLines,
    dirty_tracked: dirtyTrackedRecords,
    untracked: untrackedRecords,
    cache_membership: cacheMembership,
    region_objects: regionObjects,
    manifest_counts: manifestCounts,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`Baseline written to ${path.relative(VAULT_ROOT, OUTPUT_FILE)}`);
  console.log(`HEAD: ${head}`);
  console.log(`Dirty tracked: ${dirtyTrackedRecords.length}`);
  console.log(`Untracked: ${untrackedRecords.length}`);
  console.log(`Cache files: ${cacheMembership.filter(m => !m.rejected).length}`);
  console.log(`Region objects: ${regionObjects.length}`);
  console.log(`Manifest counts: ${JSON.stringify(manifestCounts)}`);
}

main();
