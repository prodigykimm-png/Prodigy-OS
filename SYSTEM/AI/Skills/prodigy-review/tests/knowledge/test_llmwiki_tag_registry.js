"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const tags = require(path.join(ROOT, "SYSTEM/Views/llmwiki-tag-registry.js"));

test("wedding photography pages share one controlled leaf tag", () => {
  const workflow = tags.resolve({ primary_cluster: "photography/wedding-snap", title: "본식 촬영 워크플로우" });
  const posing = tags.resolve({ primary_cluster: "photography/wedding-snap", title: "포징 디렉팅" });
  assert.equal(workflow.ok, true);
  assert.deepEqual(workflow.tags, ["knowledge/photography/wedding-snap"]);
  assert.deepEqual(workflow.tags, posing.tags);
});

test("similar knowledge clusters resolve to the same hierarchical leaf tag", () => {
  const first = tags.resolve({ primary_cluster: "real-estate/enforcement" });
  const second = tags.resolve({ primary_cluster: "real-estate/enforcement", title: "인도명령과 강제집행" });
  assert.deepEqual(first.tags, ["knowledge/real-estate/enforcement"]);
  assert.deepEqual(first.tags, second.tags);
  assert.equal(first.writer_count, 0);
});

test("registry rejects free-form and excessive tags", () => {
  assert.equal(tags.validate(["knowledge/real-estate/enforcement"]).ok, true);
  assert.equal(tags.validate(["real-estate/my-new-tag"]).reason, "tag_not_registered");
  assert.equal(tags.validate(["knowledge/real-estate/rights", "knowledge/workflow/procedure", "knowledge/real-estate/tax"]).reason, "tag_limit_exceeded");
});

test("cross-domain secondary tag is exceptional and bounded", () => {
  const result = tags.resolve({ primary_cluster: "real-estate/transaction", secondary_cluster: "workflow/procedure", cross_domain: true });
  assert.deepEqual(result.tags, ["knowledge/real-estate/transaction", "knowledge/workflow/procedure"]);
  const denied = tags.resolve({ primary_cluster: "real-estate/transaction", secondary_cluster: "real-estate/tax", cross_domain: false });
  assert.equal(denied.status, "hold");
  assert.equal(denied.reason, "secondary_tag_requires_cross_domain");
});
