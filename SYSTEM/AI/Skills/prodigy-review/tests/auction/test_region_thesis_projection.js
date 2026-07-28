"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const candidateCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"));

const REGION_A = "PARA/RESOURCES/Auction Regions/서울특별시-강남구";

function row(id, type, opts = {}) {
  return {
    path: `PARA/RESOURCES/Knowledge/${id}.md`,
    type,
    title: opts.title || id,
    connections: (opts.regions || [REGION_A]).map((r) => `[[${r}]]`),
    invalidation_conditions: opts.invalidation || [],
    updated: opts.updated !== undefined ? opts.updated : "2026-07-01"
  };
}

// --- Thesis rendering ---

test("projectRegionThesis renders knowledge and permanent_note with invalidation_conditions", () => {
  const rows = [
    row("k1", "knowledge", { invalidation: ["금리 5% 초과 시 무효"] }),
    row("p1", "permanent_note", { invalidation: ["재개발 무산 시"] })
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.count, 2);
  assert.equal(result.thesis[0].type, "knowledge");
  assert.deepEqual(result.thesis[0].invalidation_conditions, ["금리 5% 초과 시 무효"]);
  assert.equal(result.thesis[1].type, "permanent_note");
  assert.deepEqual(result.thesis[1].invalidation_conditions, ["재개발 무산 시"]);
});

test("literature_note and knowledge_candidate are excluded from thesis", () => {
  const rows = [
    row("k1", "knowledge"),
    row("lit1", "literature_note"),
    row("cand1", "knowledge_candidate")
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.count, 1);
  assert.equal(result.thesis[0].path, "PARA/RESOURCES/Knowledge/k1.md");
});

// --- Sort order ---

test("thesis sorted by tier (knowledge before permanent_note), then updated descending", () => {
  const rows = [
    row("p1", "permanent_note", { updated: "2026-07-20" }),
    row("k1", "knowledge", { updated: "2026-07-10" }),
    row("k2", "knowledge", { updated: "2026-07-15" })
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.thesis[0].path, "PARA/RESOURCES/Knowledge/k2.md"); // knowledge, newer
  assert.equal(result.thesis[1].path, "PARA/RESOURCES/Knowledge/k1.md"); // knowledge, older
  assert.equal(result.thesis[2].path, "PARA/RESOURCES/Knowledge/p1.md"); // permanent_note
});

test("missing/invalid updated sorts last within tier", () => {
  const rows = [
    row("k1", "knowledge", { updated: "" }),
    row("k2", "knowledge", { updated: "2026-07-10" }),
    row("k3", "knowledge", { updated: "not-a-date" })
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.thesis[0].path, "PARA/RESOURCES/Knowledge/k2.md");
  // k1 and k3 have invalid dates -> sorted by code point
  assert.equal(result.thesis[1].path, "PARA/RESOURCES/Knowledge/k1.md");
  assert.equal(result.thesis[2].path, "PARA/RESOURCES/Knowledge/k3.md");
});

test("same tier and same updated sorts by canonical path code point", () => {
  const rows = [
    row("beta", "knowledge", { updated: "2026-07-10" }),
    row("alpha", "knowledge", { updated: "2026-07-10" })
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.thesis[0].path, "PARA/RESOURCES/Knowledge/alpha.md");
  assert.equal(result.thesis[1].path, "PARA/RESOURCES/Knowledge/beta.md");
});

// --- Deduplication ---

test("duplicate exact canonical path is deduplicated", () => {
  const rows = [
    row("k1", "knowledge", { updated: "2026-07-10" }),
    { ...row("k1", "knowledge", { updated: "2026-07-10" }) } // exact duplicate path
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.count, 1);
});

test("different paths with same title are not deduplicated", () => {
  const rows = [
    row("k1", "knowledge", { title: "Same Title" }),
    row("k2", "knowledge", { title: "Same Title" })
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.count, 2);
});

// --- Region filtering ---

test("only rows linked to the target Region appear in thesis", () => {
  const REGION_B = "PARA/RESOURCES/Auction Regions/부산광역시-해운대구";
  const rows = [
    row("k1", "knowledge", { regions: [REGION_A] }),
    row("k2", "knowledge", { regions: [REGION_B] }),
    row("k3", "knowledge", { regions: [REGION_A, REGION_B] })
  ];
  const result = candidateCore.projectRegionThesis(rows, REGION_A);
  assert.equal(result.count, 2);
  const paths = result.thesis.map((t) => t.path);
  assert.ok(paths.includes("PARA/RESOURCES/Knowledge/k1.md"));
  assert.ok(paths.includes("PARA/RESOURCES/Knowledge/k3.md"));
});
