"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const taxonomy = require(path.join(ROOT, "SYSTEM/Views/llmwiki-taxonomy.js"));

test("taxonomy preserves established Hub page classifications", () => {
  assert.deepEqual(taxonomy.classifyPage({ title: "웨딩 촬영 포징", purpose: "현장 절차" }), { archetype: "procedure_workflow", cluster: "photography/wedding-snap", taxonomy_version: taxonomy.VERSION });
  assert.deepEqual(taxonomy.classifyPage({ title: "상권 입지 분석", purpose: "지역 접근성" }), { archetype: "decision_guide", cluster: "real-estate/location", taxonomy_version: taxonomy.VERSION });
  assert.deepEqual(taxonomy.classifyPage({ title: "취득세 검토", purpose: "세금 기준" }), { archetype: "concept_reference", cluster: "real-estate/tax", taxonomy_version: taxonomy.VERSION });
});

test("unknown taxonomy remains an explicit general reference", () => {
  assert.deepEqual(taxonomy.classifyPage({ title: "완전히 새로운 분야", purpose: "미분류" }), { archetype: "concept_reference", cluster: "general/reference", taxonomy_version: taxonomy.VERSION });
});
