"use strict";

// M1 — legacy adoption entry. Owner-visible contract:
// Knowledge -> 더 보기 -> 기존 자료 검사 must surface legacy ZETA/PERMANENT notes as
// reviewable migration decisions WITHOUT any provider call and without writes.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");

const LEGACY_PATH = "ZETA/PERMANENT/legacy album guide.md";
const LEGACY_BODY = [
  "---",
  'type: knowledge',
  'title: "legacy album guide"',
  'knowledge_domain: "wedding"',
  'knowledge_topics:',
  '  - "editing"',
  "---",
  "",
  "# legacy album guide",
  "",
  "가족사진은 신랑측 우선으로 배치한다.",
  "",
].join("\n");

const V2_PATH = "ZETA/PERMANENT/already v2 guide.md";
const V2_BODY = [
  "---",
  "schema_version: 2",
  "---",
  "",
  "# already v2 guide",
  "",
  "이미 새 형식으로 이관된 문서다.",
  "",
].join("\n");

test("legacy migration scan surfaces legacy notes locally and excludes v2 notes", async () => {
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { [LEGACY_PATH]: LEGACY_BODY, [V2_PATH]: V2_BODY },
  });
  const hub = result.window.KnowledgeExplorerHub;
  assert.equal(typeof hub.dispatchLlmWikiAction, "function", "hub dispatch entry point missing");

  const scanned = await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  assert.equal(scanned.ok, true, JSON.stringify(scanned));
  assert.equal(scanned.provider_calls, 0, "scan must not call a provider");

  const snapshot = hub.llmWikiLifecycleSnapshot();
  assert.ok(snapshot.migration, "lifecycle snapshot must carry migration state so the view can render it");
  assert.equal(snapshot.migration.status, "review");
  const paths = Array.from(snapshot.migration.decisions, (decision) => decision.path);
  assert.deepEqual(paths, [LEGACY_PATH], "only notes without schema_version/canonical_id are decisions");
  for (const decision of snapshot.migration.decisions) {
    assert.ok(decision.decision_id, "each decision needs an id for review_migration");
    assert.equal(decision.kind, "update", "adoption decision maps to the update label");
    assert.ok(decision.title, "the owner must be able to tell which note it is");
  }
  assert.equal(scanned.write_counts.canonical, 0);
  assert.equal(scanned.write_counts.audit, 0);
  assert.equal(scanned.write_counts.refresh, 0);
  assert.equal(scanned.write_counts.git, 0);
});

test("legacy migration scan reports no_change when every canonical note is already v2", async () => {
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { [V2_PATH]: V2_BODY },
  });
  const hub = result.window.KnowledgeExplorerHub;
  const scanned = await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  assert.equal(scanned.ok, true, JSON.stringify(scanned));
  assert.equal(scanned.status, "no_change");
  assert.equal(hub.llmWikiLifecycleSnapshot().migration.status, "no_change");
  assert.equal(hub.llmWikiLifecycleSnapshot().migration.decisions.length, 0);
});

test("each migration decision row names its own note so the owner can tell them apart", async () => {
  const other = "ZETA/PERMANENT/second legacy note.md";
  const result = await runHub({
    pages: buildPages(),
    extraFiles: { [LEGACY_PATH]: LEGACY_BODY, [other]: LEGACY_BODY.split("legacy album guide").join("second legacy note") },
  });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  const texts = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node.text === "string") texts.push(node.text);
    for (const child of node.children || []) walk(child);
  };
  walk(result.container);
  const joined = texts.join("\n");
  assert.ok(joined.includes("legacy album guide"), `rendered rows must name the note: ${joined.slice(0, 400)}`);
  assert.ok(joined.includes("second legacy note"), `rendered rows must name every note: ${joined.slice(0, 400)}`);
  assert.ok(joined.includes(LEGACY_PATH), "each row must show which file it is");
});
