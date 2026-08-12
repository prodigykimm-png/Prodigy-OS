#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const verifier = require("./task16-final-receipt-verifier.js");

const ROOT = path.resolve(__dirname, "../..");
const RECEIPT = path.join(ROOT, verifier.RECEIPT_RELATIVE);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function imageValidation(evidenceRoot, visual) {
  const rows = visual.rows.map((row) => {
    const fileToken = path.basename(row.screenshot.path);
    const file = path.join(evidenceRoot, "screenshots-happy", fileToken);
    const bytes = fs.readFileSync(file);
    return { file_token: fileToken, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length, sha256: sha256(bytes), nonblank: bytes.length > 1000 };
  });
  const body = { schema_version: "task16-image-validation-v2", image_count: rows.length, rows, signature_valid_count: rows.filter((row) => fs.readFileSync(path.join(evidenceRoot, "screenshots-happy", row.file_token)).subarray(0, 8).toString("hex") === "89504e470d0a1a0a").length, dimension_valid_count: rows.filter((row) => row.height === 900 && [390, 834, 1068, 1440].includes(row.width)).length, nonblank_count: rows.filter((row) => row.nonblank).length, unique_sha256_count: new Set(rows.map((row) => row.sha256)).size };
  fs.writeFileSync(path.join(evidenceRoot, "visual-image-validation.json"), `${JSON.stringify(body, null, 2)}\n`);
  return body;
}
function normalizeScreenshotPaths(visual) {
  for (const row of visual.rows) row.screenshot.path = `screenshots-happy/${path.basename(row.screenshot.path)}`;
  return visual;
}
function prepareEvidence(evidenceRoot) {
  const visualFile = path.join(evidenceRoot, "real-obsidian-visual-288.json"), journeyFile = path.join(evidenceRoot, "real-rendered-journeys.json");
  const visual = JSON.parse(fs.readFileSync(visualFile, "utf8")), journeys = JSON.parse(fs.readFileSync(journeyFile, "utf8"));
  normalizeScreenshotPaths(visual);
  visual.aggregate_sha256 = sha256(JSON.stringify(visual.rows.slice().sort((a, b) => JSON.stringify(a.matrix).localeCompare(JSON.stringify(b.matrix)))));
  delete visual.digest; visual.digest = sha256(JSON.stringify(visual));
  for (const journey of journeys.journeys) { delete journey.digest; journey.digest = sha256(JSON.stringify(journey)); }
  delete journeys.digest; journeys.digest = sha256(JSON.stringify(journeys));
  fs.writeFileSync(visualFile, `${JSON.stringify(visual, null, 2)}\n`); fs.writeFileSync(journeyFile, `${JSON.stringify(journeys, null, 2)}\n`);
  imageValidation(evidenceRoot, visual);
}
function prepareTaskWaveProvenance(evidenceRoot, archiveRoot, artifactRoot) {
  const provenance = verifier.buildTaskWaveProvenance(evidenceRoot, archiveRoot, artifactRoot);
  fs.writeFileSync(path.join(evidenceRoot, verifier.PROVENANCE_TOKEN), `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}
function build(evidenceRoot, archiveRoot, artifactRoot, outputFile = RECEIPT) {
  // Deliberately no read of RECEIPT: the candidate is derived only from this run's authorities.
  const receipt = verifier.constructReceipt(ROOT, evidenceRoot, archiveRoot, artifactRoot);
  fs.writeFileSync(outputFile, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--prepare-evidence") { if (!args[1] || args.length !== 2) throw new Error("missing evidence root"); prepareEvidence(path.resolve(args[1])); }
  else if (args[0] === "--prepare-provenance-map") { const [, evidence, archive, artifacts] = args.map((value) => value && path.resolve(value)); if (!evidence || !archive || !artifacts || args.length !== 4) throw new Error("Usage: node SYSTEM/CI/task16-final-receipt-builder.js --prepare-provenance-map <evidence-root> <archive-root> <artifact-root>"); process.stdout.write(`${JSON.stringify(prepareTaskWaveProvenance(evidence, archive, artifacts))}\n`); }
  else { const [evidence, archive, artifacts, output] = args.map((value) => value && path.resolve(value)); if (!evidence || !archive || !artifacts || args.length > 4) throw new Error("Usage: node SYSTEM/CI/task16-final-receipt-builder.js <evidence-root> <archive-root> <artifact-root> [receipt-output]"); process.stdout.write(`${JSON.stringify({ canonical_self_sha256: build(evidence, archive, artifacts, output || RECEIPT).validation.canonical_self_sha256 })}\n`); }
}
module.exports = { build, imageValidation, normalizeScreenshotPaths, prepareEvidence, prepareTaskWaveProvenance };
