"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = {};
require(path.join(ROOT, "SYSTEM/Views/display-registry.js"));
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-core.js"));
const { catalog, flattenCatalog } = require("./knowledge_explorer_fixtures.js");

function findDomain(model, key) {
  return model.domains.find((domain) => domain.key === key);
}

function findTopic(domain, key) {
  return domain.topic_sections.find((section) => section.key === key);
}

function findResource(domain, type) {
  return domain.resource_sections.find((section) => section.type === type);
}

function testOrderedPureProjection() {
  // Given: frozen synthetic records spanning Knowledge, Resource, related, malformed, and UI-only fixtures.
  const records = flattenCatalog(catalog);
  const before = JSON.stringify(records);

  // When: the same records are projected repeatedly.
  const first = core.projectKnowledgeExplorer(records, registry);
  const second = core.projectKnowledgeExplorer(records, registry);

  // Then: projection is serializable, stable, complete, and does not modify the sources.
  assert.deepEqual(first, second);
  assert.doesNotThrow(() => JSON.stringify(first));
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(first.domains.map((domain) => domain.key), [...registry.DOMAIN_ORDER, registry.UNCLASSIFIED]);
  assert.equal(first.schema_version, 1);
  assert.equal(first.totals.knowledge, 8);
  assert.equal(first.totals.resources, 3);
  assert.equal(first.totals.warnings, first.warnings.length);
  for (const domain of first.domains) {
    assert.equal(domain.count, domain.knowledge.length);
    assert.ok(Number.isFinite(domain.recency));
  }
}

function testKnowledgeCountsTopicsResourcesAndRecency() {
  // Given: canonical, legacy, unknown, and dedicated Resource policies from the public registry.
  const model = core.projectKnowledgeExplorer(flattenCatalog(catalog), registry);
  const coding = findDomain(model, "coding");
  const unclassified = findDomain(model, "unclassified");
  const wedding = findDomain(model, "wedding");
  const realEstate = findDomain(model, "real_estate");
  const reading = findDomain(model, "reading");

  // Then: each Knowledge is counted once by Domain and appears in every valid Topic view only.
  assert.equal(model.domains.reduce((sum, domain) => sum + domain.count, 0), model.totals.knowledge);
  assert.equal(coding.knowledge.some((asset) => asset.type === "knowledge"), true);
  assert.equal(unclassified.knowledge.some((asset) => asset.type === "permanent_note"), true);
  assert.deepEqual(findTopic(coding, "unclassified").assets.map((asset) => asset.path), [
    "SYNTHETIC/knowledge-explorer/knowledge/validated-knowledge.md",
    "SYNTHETIC/knowledge-explorer/links/duplicate.md"
  ]);
  assert.equal(findTopic(unclassified, "unclassified").count >= 1, true);

  // And: Resources use their dedicated policies and never inflate validated Knowledge counts.
  assert.equal(findResource(wedding, "venue").count, 1);
  assert.equal(findResource(realEstate, "auction_region").count, 1);
  assert.equal(findResource(reading, "literature_note").count, 1);
  assert.equal(wedding.count, 0);
  assert.equal(realEstate.count, 0);
  assert.equal(reading.count, 1);
  assert.equal(model.assets.every((asset) => Number.isFinite(asset.recency)), true);
}

function testDefaultsAndEmptyInput() {
  // Given: an empty source list.
  const empty = core.projectKnowledgeExplorer([], registry);

  // Then: approved empty domains remain navigable and defaults are deterministic and safe.
  assert.deepEqual(empty.domains.map((domain) => domain.key), [...registry.DOMAIN_ORDER, registry.UNCLASSIFIED]);
  assert.equal(empty.domains.every((domain) => domain.count === 0), true);
  assert.equal(empty.domains.every((domain) => findResource(domain, "literature_note").count === 0), true);
  assert.deepEqual(empty.selection, {
    domain: "real_estate",
    section_kind: "topic",
    section_key: "rights_analysis",
    asset_path: null
  });
  assert.deepEqual(empty.totals, { knowledge: 0, resources: 0, warnings: 0 });
}

function testMalformedDuplicateAndExcludedSafety() {
  // Given: malformed metadata, duplicate canonical paths, a nonexistent taxonomy, and excluded capture.
  const records = [
    null,
    { source_path: "./ZETA/a.md", type: "knowledge", title: "A", knowledge_domain: "coding", knowledge_topics: ["ai"], source_mtime: 20 },
    { source_path: "ZETA//a.md", type: "knowledge", title: "duplicate", knowledge_domain: "business", source_mtime: 99 },
    { source_path: "ZETA/unknown.md", type: "knowledge", title: "Unknown", knowledge_domain: "not-real", knowledge_topics: "not-real" },
    { source_path: "ZETA/capture.md", type: "fleeting_note", title: "Capture", knowledge_domain: "coding", knowledge_topics: ["ai"] },
    { source_path: "ZETA/no-type.md", title: "No type", knowledge_domain: "coding" },
    { type: "knowledge", title: "No path", knowledge_domain: "coding" }
  ];
  const before = JSON.stringify(records);

  // When: projection tolerates the failure cases.
  const model = core.projectKnowledgeExplorer(records, registry);

  // Then: duplicates/excluded/malformed records do not blank or inflate the model.
  assert.equal(model.totals.knowledge, 2);
  assert.equal(findDomain(model, "coding").count, 1);
  assert.equal(findDomain(model, "business").count, 0);
  assert.equal(findDomain(model, "unclassified").count, 1);
  assert.equal(model.assets.some((asset) => asset.type === "fleeting_note"), false);
  assert.equal(model.warnings.some((warning) => warning.code === "duplicate_path" && warning.path === "ZETA/a.md"), true);
  assert.equal(model.warnings.some((warning) => warning.code === "invalid_domain"), true);
  assert.equal(model.warnings.some((warning) => warning.code === "invalid_topic"), true);
  assert.equal(model.warnings.some((warning) => warning.code === "missing_type"), true);
  assert.equal(model.warnings.some((warning) => warning.code === "missing_path"), true);
  assert.equal(model.warnings.some((warning) => warning.code === "malformed_record"), true);
  assert.equal(JSON.stringify(records), before);
}

function testMultipleValidTopicsAndFrontmatterRecords() {
  // Given: a plain adapter record whose metadata lives in frontmatter.
  const source = Object.freeze({
    source_path: "ZETA/multi.md",
    source_mtime: 10,
    frontmatter: Object.freeze({
      type: "knowledge",
      title: "Multi",
      knowledge_domain: "coding",
      knowledge_topics: Object.freeze(["react", "ai", "react"]),
      updated: "2026-07-20"
    })
  });

  // When: it is projected.
  const model = core.projectKnowledgeExplorer([source], registry);
  const coding = findDomain(model, "coding");

  // Then: one Domain count fans out to all unique valid Topic views and computed recency wins.
  assert.equal(coding.count, 1);
  assert.equal(findTopic(coding, "react").count, 1);
  assert.equal(findTopic(coding, "ai").count, 1);
  assert.equal(findTopic(coding, "unclassified"), undefined);
  assert.equal(coding.knowledge[0].recency, Date.parse("2026-07-20"));
  assert.equal(model.selection.domain, "coding");
  assert.equal(model.selection.section_kind, "topic");
  assert.equal(model.selection.section_key, "react");
  assert.equal(model.selection.asset_path, "ZETA/multi.md");
}

testOrderedPureProjection();
testKnowledgeCountsTopicsResourcesAndRecency();
testDefaultsAndEmptyInput();
testMalformedDuplicateAndExcludedSafety();
testMultipleValidTopicsAndFrontmatterRecords();
console.log("Knowledge Explorer core tests passed");
