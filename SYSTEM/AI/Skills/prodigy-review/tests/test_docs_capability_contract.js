#!/usr/bin/env node
"use strict";

// Verify that docs do not claim unsupported capabilities.
// Physical device success, native HealthKit, background sync,
// subscription API, and Antigravity bridge are NOT implemented.

const fs = require("node:fs");
const path = require("node:path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const DOCS = ["DESIGN.md", "SYSTEM/docs/09_Obsidian_Manual.md"];
const FORBIDDEN = [
  { term: "HealthKit", reason: "HealthKit integration is not implemented" },
  { term: "background sync", reason: "background sync is not implemented" },
  { term: "subscription API", reason: "Google subscription API access is not available" },
  { term: "Antigravity bridge", reason: "Antigravity bridge is not implemented" },
  { term: "physical-device success", reason: "physical-device verification has not happened" },
  { term: "device-verified", reason: "no device-verified behavior exists" },
  { term: "iPhone verified", reason: "no iPhone verification has occurred" },
  { term: "iPad verified", reason: "no iPad verification has occurred" }
];

let failures = 0;

DOCS.forEach((docPath) => {
  const absPath = path.join(VAULT_ROOT, docPath);
  if (!fs.existsSync(absPath)) {
    process.stderr.write("MISSING " + docPath + "\n");
    failures += 1;
    return;
  }
  const content = fs.readFileSync(absPath, "utf8");
  FORBIDDEN.forEach(({ term, reason }) => {
    if (content.includes(term)) {
      process.stderr.write("FAIL " + docPath + " contains '" + term + "': " + reason + "\n");
      failures += 1;
    }
  });
});

if (failures > 0) {
  process.stderr.write("\n" + failures + " unsupported capability claim(s) found.\n");
  process.exitCode = 1;
} else {
  process.stdout.write("OK: no unsupported capability claims in docs\n");
}
