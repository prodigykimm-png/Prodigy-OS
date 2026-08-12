"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const candidateCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"));
const relations = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-relations.js"));

const REGION_A = "PARA/RESOURCES/Auction Regions/서울특별시-강남구";
const REGION_B = "PARA/RESOURCES/Auction Regions/부산광역시-해운대구";

function knowledgeRow(id, type, regions, opts = {}) {
  return {
    path: `PARA/RESOURCES/Knowledge/${id}.md`,
    type,
    title: opts.title || id,
    connections: regions.map((r) => `[[${r}]]`),
    invalidation_conditions: opts.invalidation || [],
    updated: opts.updated || "2026-07-01",
    ...opts.extra
  };
}

// --- Exact link tests ---

test("exact canonical Region wikilink in connections is recognized", () => {
  const row = knowledgeRow("k1", "knowledge", [REGION_A]);
  const links = candidateCore.regionLinksForRow(row);
  assert.deepEqual(links, [REGION_A]);
});

test("non-Region wikilink in connections is not treated as Region link", () => {
  const row = knowledgeRow("k2", "knowledge", ["ZETA/LITERATURE/some-article"]);
  const links = candidateCore.regionLinksForRow(row);
  assert.deepEqual(links, []);
});

test("body text mentioning a district does not create a Region link", () => {
  const row = {
    path: "PARA/RESOURCES/Knowledge/k3.md",
    type: "knowledge",
    title: "강남구 분석",
    connections: [],
    body: "강남구 아파트 가격이 상승하고 있다. 서울특별시-강남구 지역은..."
  };
  const links = candidateCore.regionLinksForRow(row);
  assert.deepEqual(links, []);
});

test("coordinates alone do not create a Region link", () => {
  const row = {
    path: "PARA/RESOURCES/Knowledge/k4.md",
    type: "knowledge",
    connections: [],
    coordinates: "37.4979,127.0276"
  };
  const links = candidateCore.regionLinksForRow(row);
  assert.deepEqual(links, []);
});

test("fuzzy district name in connections is not a valid Region link", () => {
  const row = {
    path: "PARA/RESOURCES/Knowledge/k5.md",
    type: "knowledge",
    connections: ["[[강남구]]"]
  };
  const links = candidateCore.regionLinksForRow(row);
  assert.deepEqual(links, []);
});

// --- Grouping / count tests ---

test("groupByTier separates verified, legacy, material, pending", () => {
  const rows = [
    knowledgeRow("v1", "knowledge", [REGION_A]),
    knowledgeRow("v2", "knowledge", [REGION_A]),
    knowledgeRow("l1", "permanent_note", [REGION_A]),
    knowledgeRow("m1", "literature_note", [REGION_A]),
    knowledgeRow("p1", "knowledge_candidate", [REGION_A]),
    { path: "x.md", type: "fleeting_note", connections: [`[[${REGION_A}]]`] }
  ];
  const groups = candidateCore.groupByTier(rows);
  assert.equal(groups.counts.verified, 2);
  assert.equal(groups.counts.legacy, 1);
  assert.equal(groups.counts.material, 1);
  assert.equal(groups.counts.pending, 1);
  // fleeting_note is excluded
  assert.equal(groups.verified.length + groups.legacy.length + groups.material.length + groups.pending.length, 5);
});

test("groupRegionEvidence filters by exact Region target", () => {
  const sources = [
    { source_path: "PARA/RESOURCES/Knowledge/a.md", frontmatter: { type: "knowledge", title: "A", connections: [`[[${REGION_A}]]`] } },
    { source_path: "PARA/RESOURCES/Knowledge/b.md", frontmatter: { type: "knowledge", title: "B", connections: [`[[${REGION_B}]]`] } },
    { source_path: "PARA/RESOURCES/Knowledge/c.md", frontmatter: { type: "permanent_note", title: "C", connections: [`[[${REGION_A}]]`, `[[${REGION_B}]]`] } }
  ];
  const result = relations.groupRegionEvidence(sources, REGION_A);
  assert.equal(result.counts.verified, 1); // only "a" is knowledge linked to REGION_A
  assert.equal(result.counts.legacy, 1);   // "c" is permanent_note linked to REGION_A
  assert.equal(result.verified[0].path, "PARA/RESOURCES/Knowledge/a.md");
});

test("candidate and literature are never in verified tier", () => {
  const rows = [
    knowledgeRow("c1", "knowledge_candidate", [REGION_A]),
    knowledgeRow("lit1", "literature_note", [REGION_A])
  ];
  const groups = candidateCore.groupByTier(rows);
  assert.equal(groups.counts.verified, 0);
  assert.equal(groups.counts.pending, 1);
  assert.equal(groups.counts.material, 1);
});
