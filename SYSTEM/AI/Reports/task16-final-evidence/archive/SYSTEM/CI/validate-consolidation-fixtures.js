#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { validateFixtureRoot } = require("./consolidation-fixture-contract.js");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value === undefined) continue;
    index += 1;
    if (key === "--fixture-root") options.fixtureRoot = value;
    else if (key === "--manifest") options.manifestPath = value;
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixtureRoot = path.resolve(options.fixtureRoot || "SYSTEM/CI/fixtures/consolidation");
  const result = validateFixtureRoot({ fixtureRoot, manifestPath: options.manifestPath });
  process.stdout.write(JSON.stringify({
    ok: true,
    fixture_manifest_sha256: result.manifestSha256,
    fixture_count: result.entries.size,
  }, null, 2) + "\n");
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`fixture validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ parseArgs });
