"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const DOMAINS = ["real_estate", "wedding", "coding", "workout", "reading", "business", "personal_growth"];
const TOPIC_LABELS = {
  wedding: {
    shooting: "촬영", lighting: "조명", editing: "편집", equipment: "장비",
  },
  real_estate: {
    rights_analysis: "권리 분석", site_visit: "현장 방문", bidding: "입찰",
    public_auction: "공매", tax: "세금", precedent: "판례",
  },
  coding: {
    electron: "일렉트론", react: "리액트", typescript: "타입스크립트", python: "파이썬",
    ai: "인공지능", prompt_engineering: "프롬프트 엔지니어링",
    obsidian_plugin: "옵시디언 플러그인", claude_code: "클로드 코드",
    codex: "코덱스", gemini: "제미나이",
  },
  workout: [],
  reading: [],
  business: [],
  personal_growth: [],
};

function loadDisplayRegistry() {
  const sandbox = { window: {} };
  vm.runInNewContext(read("SYSTEM/Views/display-registry.js"), sandbox, { filename: "display-registry.js" });
  return sandbox.window.prodigyDisplay;
}

function testCanonicalKnowledgeIdentity() {
  // Given: the official Object and Knowledge Explorer contracts.
  const objectModel = read("SYSTEM/docs/03_Object_Model.md");
  const explorerSchema = read("SYSTEM/Prodigy/Schema/Knowledge_Explorer_Schema.md");

  // When: their machine-consumed type rules are inspected.
  // Then: canonical, compatible, supporting, and excluded roles remain distinct.
  assert.match(objectModel, /canonical[^\n]*`knowledge`|`knowledge`[^\n]*canonical/i);
  assert.match(explorerSchema, /canonical_knowledge_type:\s*knowledge/);
  assert.match(explorerSchema, /legacy_knowledge_types:\s*\[permanent_note\]/);
  assert.match(explorerSchema, /supporting_resource_types:\s*\[literature_note, venue, auction_region\]/);
  assert.match(explorerSchema, /excluded_capture_types:\s*\[fleeting_note\]/);
}

function testTaxonomyAndStorageShape() {
  // Given: the approved initial taxonomy.
  const explorerSchema = read("SYSTEM/Prodigy/Schema/Knowledge_Explorer_Schema.md");
  const coreSchema = read("SYSTEM/Prodigy/Schema/Core_Property_Schema.md");

  // When: its schema keys and values are inspected.
  // Then: one scalar Domain and one YAML-list Topics field own the persisted shape.
  assert.match(coreSchema, /### `knowledge_domain`/);
  assert.match(coreSchema, /### `knowledge_topics`/);
  assert.match(explorerSchema, /knowledge_domain:\s*scalar/);
  assert.match(explorerSchema, /knowledge_topics:\s*yaml_list/);
  for (const domain of DOMAINS) assert.match(explorerSchema, new RegExp(`^  ${domain}:`, "m"));
  for (const [domain, topicContract] of Object.entries(TOPIC_LABELS)) {
    const topics = Array.isArray(topicContract) ? topicContract : Object.keys(topicContract);
    const encoded = topics.length ? `[${topics.join(", ")}]` : "[]";
    assert.equal(explorerSchema.split("\n").includes(`  ${domain}: ${encoded}`), true);
  }
  assert.doesNotMatch(explorerSchema, /^  venue:/m);
  assert.doesNotMatch(explorerSchema, /^  auction_region:/m);
}

function testKoreanDisplayAndProjectionFallback() {
  // Given: valid and unknown values plus a frozen source fixture.
  const display = loadDisplayRegistry();
  const fixture = Object.freeze({ knowledge_domain: "unknown_domain", knowledge_topics: Object.freeze(["unknown_topic"]) });
  const before = JSON.stringify(fixture);

  // When: display projection resolves the taxonomy.
  const domainLabel = display.knowledgeDomain(fixture.knowledge_domain);
  const topicLabel = display.knowledgeTopic(fixture.knowledge_topics[0]);

  // Then: every approved value has a Korean label and invalid values project to unclassified without mutation.
  for (const domain of DOMAINS) assert.match(display.knowledgeDomain(domain), /[가-힣]/);
  for (const topicContract of Object.values(TOPIC_LABELS)) {
    if (Array.isArray(topicContract)) continue;
    for (const [topic, expectedLabel] of Object.entries(topicContract)) {
      assert.equal(display.knowledgeTopic(topic), expectedLabel);
    }
  }
  assert.equal(domainLabel, "미분류");
  assert.equal(topicLabel, "미분류");
  assert.equal(display.knowledgeDomain(undefined), "미분류");
  assert.equal(display.knowledgeTopic(undefined), "미분류");
  assert.equal(JSON.stringify(fixture), before);
}

function testGlobalDomainArchitectureRemainsInactiveAndTypesRemainAllowed() {
  // Given: architecture and core type contracts.
  const architecture = read("SYSTEM/docs/08_Domain_Architecture.md");
  const coreSchema = read("SYSTEM/Prodigy/Schema/Core_Property_Schema.md");

  // When/Then: Explorer taxonomy stays local and dedicated Resources remain allowed.
  assert.match(architecture, /\*\*Status:\*\* Not Active/);
  assert.match(architecture, /Knowledge Explorer/);
  for (const type of ["knowledge", "venue", "auction_region"]) assert.equal(coreSchema.includes(`\`${type}\``), true);
}

testCanonicalKnowledgeIdentity();
testTaxonomyAndStorageShape();
testKoreanDisplayAndProjectionFallback();
testGlobalDomainArchitectureRemainsInactiveAndTypesRemainAllowed();
console.log("Knowledge contract tests passed");
