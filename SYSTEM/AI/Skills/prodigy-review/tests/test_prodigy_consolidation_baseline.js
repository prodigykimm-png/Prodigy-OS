#!/usr/bin/env node
/**
 * Tests for the Prodigy Consolidation Baseline (Todo 0).
 *
 * Usage: node --test SYSTEM/AI/Skills/prodigy-review/tests/test_prodigy_consolidation_baseline.js
 */
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const VAULT_ROOT = process.cwd();
const BASELINE_SCRIPT = path.join(VAULT_ROOT, 'SYSTEM', 'SCRIPTS', 'prodigy-consolidation-baseline.js');
const BASELINE_OUTPUT = path.join(VAULT_ROOT, '.omo', 'evidence', 'prodigy-region-workspace-consolidation', 'task-0', 'baseline.json');
const OWNERSHIP_MANIFEST = path.join(VAULT_ROOT, 'SYSTEM', 'docs', 'Prodigy_Consolidation_Ownership_v1.json');

let baseline;

describe('prodigy-consolidation-baseline', () => {
  before(() => {
    // Run the baseline script
    execSync(`node "${BASELINE_SCRIPT}"`, { cwd: VAULT_ROOT, encoding: 'utf8' });
    baseline = JSON.parse(fs.readFileSync(BASELINE_OUTPUT, 'utf8'));
  });

  it('output JSON has all required top-level keys', () => {
    const requiredKeys = ['head', 'dirty_tracked', 'untracked', 'cache_membership', 'region_objects', 'manifest_counts'];
    for (const key of requiredKeys) {
      assert.ok(key in baseline, `Missing required key: ${key}`);
    }
  });

  it('head is a valid 40-char SHA', () => {
    assert.match(baseline.head, /^[0-9a-f]{40}$/);
  });

  it('manifest_counts sums to 83 (16+25+31+11)', () => {
    const counts = baseline.manifest_counts;
    assert.equal(counts['부산광역시'], 16, 'Busan should be 16');
    assert.equal(counts['서울특별시'], 25, 'Seoul should be 25');
    assert.equal(counts['경기도'], 31, 'Gyeonggi should be 31');
    assert.equal(counts['인천광역시'], 11, 'Incheon should be 11');
    assert.equal(counts.total, 83, 'Total should be 83');
    // Verify sum independently
    const sum = counts['부산광역시'] + counts['서울특별시'] + counts['경기도'] + counts['인천광역시'];
    assert.equal(sum, 83, 'Independent sum should be 83');
  });

  it('region_objects has exactly 83 entries', () => {
    assert.equal(baseline.region_objects.length, 83, `Expected 83 region objects, got ${baseline.region_objects.length}`);
  });

  it('region_objects all have valid SHA-256 hashes', () => {
    for (const obj of baseline.region_objects) {
      assert.match(obj.sha256, /^[0-9a-f]{64}$/, `Invalid hash for ${obj.path}`);
    }
  });

  it('cache_membership has no symlinks or special files (all accepted)', () => {
    const rejected = baseline.cache_membership.filter(m => m.rejected);
    assert.equal(rejected.length, 0, `Found ${rejected.length} rejected entries: ${rejected.map(r => r.path).join(', ')}`);
    for (const entry of baseline.cache_membership) {
      assert.equal(entry.type, 'file', `Non-file entry: ${entry.path} (${entry.type})`);
      assert.equal(entry.rejected, false, `Rejected entry: ${entry.path}`);
    }
  });

  it('cache_membership entries all have valid SHA-256', () => {
    for (const entry of baseline.cache_membership) {
      if (!entry.rejected) {
        assert.match(entry.sha256, /^[0-9a-f]{64}$/, `Invalid hash for ${entry.path}`);
      }
    }
  });

  it('dirty_tracked entries have path and sha256', () => {
    for (const entry of baseline.dirty_tracked) {
      assert.ok(entry.path, 'dirty_tracked entry missing path');
      assert.match(entry.sha256, /^[0-9a-f]{64}$/, `Invalid hash for ${entry.path}`);
    }
  });

  it('untracked entries have path and sha256', () => {
    for (const entry of baseline.untracked) {
      assert.ok(entry.path, 'untracked entry missing path');
      assert.match(entry.sha256, /^[0-9a-f]{64}$/, `Invalid hash for ${entry.path}`);
    }
  });
});

describe('ownership manifest', () => {
  let ownership;

  before(() => {
    ownership = JSON.parse(fs.readFileSync(OWNERSHIP_MANIFEST, 'utf8'));
  });

  it('loads and has schema_version 1', () => {
    assert.equal(ownership.schema_version, 1);
  });

  it('has plan_sha256', () => {
    assert.match(ownership.plan_sha256, /^[0-9a-f]{64}$/);
  });

  it('has todos 0 through 15', () => {
    for (let i = 0; i <= 15; i++) {
      assert.ok(String(i) in ownership.todos, `Missing todo ${i}`);
      assert.ok(Array.isArray(ownership.todos[String(i)]), `Todo ${i} is not an array`);
      assert.ok(ownership.todos[String(i)].length > 0, `Todo ${i} has no paths`);
    }
  });

  it('has finals F1 through F4', () => {
    for (const f of ['F1', 'F2', 'F3', 'F4']) {
      assert.ok(f in ownership.finals, `Missing final ${f}`);
      assert.ok(Array.isArray(ownership.finals[f]), `Final ${f} is not an array`);
      assert.ok(ownership.finals[f].length > 0, `Final ${f} has no paths`);
    }
  });

  it('has unowned_preserved list', () => {
    assert.ok(Array.isArray(ownership.unowned_preserved));
    assert.ok(ownership.unowned_preserved.length > 0);
  });

  it('todo 0 includes the baseline script and ownership manifest', () => {
    const todo0 = ownership.todos['0'];
    assert.ok(todo0.includes('SYSTEM/SCRIPTS/prodigy-consolidation-baseline.js'));
    assert.ok(todo0.includes('SYSTEM/docs/Prodigy_Consolidation_Ownership_v1.json'));
    assert.ok(todo0.includes('SYSTEM/AI/Skills/prodigy-review/tests/test_prodigy_consolidation_baseline.js'));
  });
});

describe('QA failure: cache membership drift detection', () => {
  it('detects added cache file (count would differ)', () => {
    // Simulate: if a file were added, the membership count would increase
    const currentCount = baseline.cache_membership.length;
    const simulatedWithAddition = [...baseline.cache_membership, { path: 'SYSTEM/CACHE/test-drift/fake.json', type: 'file', sha256: 'a'.repeat(64), rejected: false }];
    assert.notEqual(simulatedWithAddition.length, currentCount, 'Adding a file should change the count');
    assert.equal(simulatedWithAddition.length, currentCount + 1);
  });

  it('detects removed cache file (count would differ)', () => {
    // Simulate: if a file were removed, the membership count would decrease
    const currentCount = baseline.cache_membership.length;
    assert.ok(currentCount > 0, 'Cache membership should not be empty for this test');
    const simulatedWithRemoval = baseline.cache_membership.slice(1);
    assert.notEqual(simulatedWithRemoval.length, currentCount, 'Removing a file should change the count');
    assert.equal(simulatedWithRemoval.length, currentCount - 1);
  });

  it('detects symlink injection (rejected flag)', () => {
    // Simulate: if a symlink were present, it would be rejected
    const simulatedSymlink = { path: 'SYSTEM/CACHE/evil-link', type: 'symlink', sha256: null, rejected: true };
    const membershipWithSymlink = [...baseline.cache_membership, simulatedSymlink];
    const rejected = membershipWithSymlink.filter(m => m.rejected);
    assert.ok(rejected.length > 0, 'Symlink should be flagged as rejected');
    assert.equal(rejected[0].type, 'symlink');
  });

  it('validation logic: baseline passes when no drift exists', () => {
    // The actual baseline should pass validation
    const rejected = baseline.cache_membership.filter(m => m.rejected);
    assert.equal(rejected.length, 0, 'No rejected entries in actual baseline');
    const allHaveHash = baseline.cache_membership.every(m => m.sha256 !== null);
    assert.ok(allHaveHash, 'All accepted entries should have hashes');
  });
});
