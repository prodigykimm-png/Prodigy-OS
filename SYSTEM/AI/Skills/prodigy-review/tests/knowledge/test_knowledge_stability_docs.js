"use strict";

/*
 * Knowledge stability docs contract (Todo 12).
 *
 * Verifies that the three architecture/operating docs contain the sprint's
 * governing decisions: Knowledge Pipeline, body-link experiment (no formal
 * Property), and pre-sprint baseline commit. If someone removes these sections
 * the test fails so the documentation cannot silently drift from the code.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function read(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`Missing doc: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

function checkArchitecture() {
  const doc = read("SYSTEM/docs/01_Architecture.md");
  assert.ok(doc.includes("# Knowledge Pipeline"), "01_Architecture missing Knowledge Pipeline section");
  assert.ok(doc.includes("Knowledge Use Body Link"), "01_Architecture missing body link section");
  assert.ok(doc.includes("used_knowledge"), "01_Architecture missing used_knowledge deferral note");
  assert.ok(doc.includes("eac574b"), "01_Architecture missing pre-sprint baseline commit");
  console.log("PASS: 01_Architecture.md contains sprint sections");
}

function checkDomainArchitecture() {
  const doc = read("SYSTEM/docs/08_Domain_Architecture.md");
  assert.ok(doc.includes("Knowledge Stability Sprint Results"), "08_Domain missing sprint results section");
  assert.ok(doc.includes("KnowledgeExplorerRegistry"), "08_Domain missing single-source-of-truth reference");
  assert.ok(doc.includes("needs_more_evidence"), "08_Domain missing state machine reference");
  assert.ok(doc.toLowerCase().includes("body link"), "08_Domain missing body link reference");
  console.log("PASS: 08_Domain_Architecture.md contains sprint sections");
}

function checkOperatingGuide() {
  const doc = read("SYSTEM/docs/11_Operating_Guide.md");
  assert.ok(doc.includes("Knowledge Use Body Link Experiment"), "11_Operating missing body link experiment section");
  assert.ok(doc.includes("used_knowledge"), "11_Operating missing used_knowledge deferral note");
  assert.ok(doc.includes("판단 기록"), "11_Operating missing Auction target section");
  assert.ok(doc.includes("permanent_note"), "11_Operating missing verified type reference");
  console.log("PASS: 11_Operating_Guide.md contains sprint sections");
}

function main() {
  checkArchitecture();
  checkDomainArchitecture();
  checkOperatingGuide();
  console.log("\nKnowledge stability docs contract passed.");
}

try {
  main();
} catch (error) {
  console.error(`Knowledge stability docs contract failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}
