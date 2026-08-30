"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const corrections = require(path.join(ROOT, "SYSTEM/Views/llmwiki-correction-signals.js"));

test("counters record only action kinds and never source text", () => {
  const store = corrections.createCorrectionSignals();
  const recorded = store.record({ action: "exclude_page", taxonomy_tag: "real-estate/tax", page_title: "취득세 문서", evidence_quote: "민감한 원문" });
  assert.equal(recorded.ok, true);
  const serialized = JSON.stringify(store.getSnapshot());
  assert.doesNotMatch(serialized, /취득세 문서|민감한 원문/u);
  assert.equal(store.getSnapshot().counts["exclude_page::real-estate/tax"], 1);
});

test("improvement candidates appear only after three repeats", () => {
  const store = corrections.createCorrectionSignals();
  for (let index = 0; index < 2; index += 1) store.record({ action: "split_page", taxonomy_tag: "real-estate/land" });
  assert.deepEqual(store.getImprovementCandidates(), []);
  store.record({ action: "split_page", taxonomy_tag: "real-estate/land" });
  assert.deepEqual(store.getImprovementCandidates(), [{ action: "split_page", taxonomy_tag: "real-estate/land", count: 3, status: "review_candidate", applies_automatically: false }]);
});

test("unknown correction actions are rejected", () => {
  const store = corrections.createCorrectionSignals();
  assert.equal(store.record({ action: "delete_everything", taxonomy_tag: "x" }).ok, false);
});
