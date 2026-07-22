"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = {};
require(path.join(ROOT, "SYSTEM/Views/display-registry.js"));
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));

function testFrozenTaxonomyAndDisplayDelegation() {
  // Given: the approved Explorer taxonomy and the shared Display Registry.
  const expectedDomains = ["real_estate", "wedding", "coding", "workout", "reading", "business", "personal_growth"];

  // When: callers read the public registry.
  // Then: ordering, membership, and labels are immutable and display-owned.
  assert.deepEqual(registry.DOMAIN_ORDER, expectedDomains);
  assert.deepEqual(registry.TOPICS_BY_DOMAIN.real_estate, ["rights_analysis", "site_visit", "bidding", "public_auction", "tax", "precedent"]);
  assert.deepEqual(registry.TOPICS_BY_DOMAIN.wedding, ["shooting", "lighting", "editing", "equipment"]);
  assert.deepEqual(registry.TOPICS_BY_DOMAIN.coding, ["electron", "react", "typescript", "python", "ai", "prompt_engineering", "obsidian_plugin", "claude_code", "codex", "gemini"]);
  assert.equal(Object.isFrozen(registry.DOMAIN_ORDER), true);
  assert.equal(Object.isFrozen(registry.TOPICS_BY_DOMAIN), true);
  for (const topics of Object.values(registry.TOPICS_BY_DOMAIN)) assert.equal(Object.isFrozen(topics), true);
  assert.throws(() => registry.DOMAIN_ORDER.push("invalid"), TypeError);
  assert.throws(() => { registry.TOPICS_BY_DOMAIN.coding = []; }, TypeError);
  assert.equal(registry.domainLabel("real_estate"), window.prodigyDisplay.knowledgeDomain("real_estate"));
  assert.equal(registry.topicLabel("rights_analysis"), window.prodigyDisplay.knowledgeTopic("rights_analysis"));
  const spy = { knowledgeDomain: (value) => `domain:${value}`, knowledgeTopic: (value) => `topic:${value}`, type: (value) => `type:${value}` };
  assert.equal(registry.domainLabel("coding", spy), "domain:coding");
  assert.equal(registry.topicLabel("ai", spy), "topic:ai");
  assert.equal(registry.resourceLabel("venue", spy), "type:venue");
}

function testPureNormalizers() {
  // Given: canonical, legacy scalar/comma, duplicate, mixed-case, and invalid metadata.
  const legacyTopics = " AI, prompt engineering, ai, UNKNOWN,  React ";
  const listTopics = Object.freeze([" Rights Analysis ", "SITE VISIT", "rights_analysis"]);

  // When: metadata is normalized for read-only projection.
  // Then: output is deterministic, domain-scoped, stably deduplicated, and never persisted back.
  assert.equal(registry.normalizeDomain(" REAL ESTATE "), "real_estate");
  assert.equal(registry.normalizeDomain("unknown"), "unclassified");
  assert.equal(registry.normalizeDomain(undefined), "unclassified");
  assert.deepEqual(registry.normalizeTopics(legacyTopics, "coding"), ["ai", "prompt_engineering", "unclassified", "react"]);
  assert.deepEqual(registry.normalizeTopics(listTopics, "real_estate"), ["rights_analysis", "site_visit"]);
  assert.deepEqual(registry.normalizeTopics("react", "wedding"), ["unclassified"]);
  assert.deepEqual(registry.normalizeTopics(null, "coding"), ["unclassified"]);
  assert.deepEqual(listTopics, [" Rights Analysis ", "SITE VISIT", "rights_analysis"]);
  assert.equal(Object.isFrozen(registry.normalizeTopics("ai, react", "coding")), true);
}

function testResourceRolesAndSourcePolicy() {
  // Given: supported Resources, excluded Related Objects, and a frozen literature source.
  const literature = Object.freeze({ type: " LITERATURE NOTE ", knowledge_domain: " Personal Growth ", title: "source" });
  const before = JSON.stringify(literature);

  // When: source records are projected through the registry.
  const venue = registry.resolveResourceRole(Object.freeze({ type: "VENUE", knowledge_domain: "coding" }));
  const region = registry.resolveResourceRole(Object.freeze({ type: "auction_region", knowledge_domain: "wedding" }));
  const reference = registry.resolveResourceRole(literature);

  // Then: only approved Resources receive roles and no source is mutated.
  assert.deepEqual(venue, { type: "venue", domain: "wedding", section: "Venues" });
  assert.deepEqual(region, { type: "auction_region", domain: "real_estate", section: "Regions" });
  assert.deepEqual(reference, { type: "literature_note", domain: "personal_growth", section: "References" });
  assert.deepEqual(registry.resolveResourceRole({ type: "literature_note", knowledge_domain: "unknown" }), { type: "literature_note", domain: "unclassified", section: "References" });
  for (const type of ["people", "project", "journal", "reading", "unknown", undefined]) {
    assert.equal(registry.resolveResourceRole({ type }), null);
  }
  assert.equal(JSON.stringify(literature), before);
  assert.equal(Object.isFrozen(venue), true);
  assert.throws(() => { venue.domain = "coding"; }, TypeError);
  assert.equal(Object.isFrozen(registry.RESOURCE_ROLES), true);
  for (const role of Object.values(registry.RESOURCE_ROLES)) assert.equal(Object.isFrozen(role), true);
  assert.equal(Object.isFrozen(registry.SOURCE_TYPE_POLICY), true);
  for (const values of Object.values(registry.SOURCE_TYPE_POLICY)) assert.equal(Object.isFrozen(values), true);
  assert.deepEqual(registry.SOURCE_TYPE_POLICY.resource, ["literature_note", "venue", "auction_region"]);
  assert.deepEqual(registry.SOURCE_TYPE_POLICY.related, ["people", "project", "journal", "reading"]);
}

testFrozenTaxonomyAndDisplayDelegation();
testPureNormalizers();
testResourceRolesAndSourcePolicy();
console.log("Knowledge registry tests passed");
