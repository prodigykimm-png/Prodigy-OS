'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const matrixPath = '/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk/.omo/evidence/llmwiki-completion-contract/ex-20260910-1432/task-16-matrix.json';
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const statuses = new Set(['PASS', 'FAIL', 'NOT RUN']);

test('LLM Wiki device matrix is contract-valid', () => {
  assert.equal(matrix.contract_version, 'llmwiki-device-matrix-v1');
  for (const key of ['code_digest', 'fixture_hash', 'scenario_id']) assert.match(matrix[key], /\S/);
  assert.ok(Array.isArray(matrix.rows) && matrix.rows.length > 0);
  const devices = new Set();
  for (const row of matrix.rows) {
    assert.ok(row.device && !devices.has(row.device), `duplicate device: ${row.device}`);
    devices.add(row.device);
    assert.ok(statuses.has(row.status), `invalid status: ${row.status}`);
    if (row.status === 'NOT RUN') assert.match(row.blocker || '', /\S/);
    else assert.match(row.evidence_ref || '', /\S/);
  }
  assert.deepEqual([...devices].sort(), ['Mac', 'iPad', 'iPhone'].sort());
});
