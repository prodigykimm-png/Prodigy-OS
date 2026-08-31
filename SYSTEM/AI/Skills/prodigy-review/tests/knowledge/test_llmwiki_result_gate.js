"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const FIXTURES = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/fixtures");
const baseline = JSON.parse(fs.readFileSync(path.join(FIXTURES, "llmwiki-result-baseline-v1.json"), "utf8"));
const result = JSON.parse(fs.readFileSync(path.join(FIXTURES, "llmwiki-result-evaluation-v2.json"), "utf8"));

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dimensionAverage(fixture, index) {
  return mean(fixture.artifacts.map((artifact) => artifact.scores[index]));
}

test("result evaluation covers the same four artifacts and rubric", () => {
  assert.equal(result.baseline_version, baseline.version);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.id), baseline.artifacts.map((artifact) => artifact.id));
  result.artifacts.forEach((artifact) => {
    assert.equal(artifact.scores.length, baseline.rubric.length);
    assert.ok(artifact.scores.every((score) => Number.isInteger(score) && score >= 1 && score <= 5));
    assert.equal(artifact.observed.canonical_writes, 0);
  });
});

test("manual result scores are reference-only and never an automated pass signal", () => {
  assert.equal(result.evaluation_status, "reference_only_pending_user_review");
  assert.ok(result.artifacts.every((artifact) => artifact.scores.length === baseline.rubric.length));
});
