#!/usr/bin/env node
"use strict";

/**
 * Physical-receipt validator for F3 device evidence.
 *
 * Rejects:
 *  - Missing receipt directory
 *  - Missing device-manifest.json, operator-notes.md, or redaction-log.md
 *  - Manifest missing a required device slot
 *  - A device whose only evidence is grep output
 *  - A device whose only evidence is a resized desktop screenshot
 *  - Mobile slots that claim `claimed: true` (they are F3's obligation)
 *
 * Accepts:
 *  - A well-formed fixture receipt directory with all 5 slots declared
 *    and at least one artifact per slot.
 */

const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_DEVICE_IDS = Object.freeze([
  "iPhone 15 Pro Max portrait",
  "iPad Pro 13 portrait",
  "iPad Pro 13 landscape",
  "Mac wide",
  "Mac narrow"
]);

const REQUIRED_FILES = Object.freeze([
  "device-manifest.json",
  "operator-notes.md",
  "redaction-log.md"
]);

const REQUIRED_FIELD_KEYS = Object.freeze([
  "model", "osVersion", "obsidianVersion", "mode", "theme",
  "operator", "timestamp", "screenshotIds"
]);

const PLAN_SLUG = "prodigy-responsive-workspace-ai-overhaul";

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help") {
    process.stdout.write("Usage: node SYSTEM/SCRIPTS/prodigy-physical-receipt-validator.js <receipt-root>\n");
    process.exit(args[0] === "--help" ? 0 : 1);
  }

  const receiptRoot = path.resolve(args[0]);
  let errors = 0;

  function fail(msg) {
    process.stderr.write(`REJECT: ${msg}\n`);
    errors += 1;
  }

  // 1. Receipt directory must exist
  if (!fs.existsSync(receiptRoot) || !fs.statSync(receiptRoot).isDirectory()) {
    fail("receipt directory does not exist or is not a directory");
    process.exit(1);
  }

  // 2. Required files must exist and be non-empty
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(receiptRoot, file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      fail(`missing required file: ${file}`);
    } else if (fs.statSync(filePath).size === 0) {
      fail(`required file is empty: ${file}`);
    }
  }

  // 3. device-manifest.json must parse and have correct plan_slug
  const manifestPath = path.join(receiptRoot, "device-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    fail(`device-manifest.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  if (manifest.plan_slug !== PLAN_SLUG) {
    fail(`device-manifest.json has wrong plan_slug: ${manifest.plan_slug}`);
  }

  // 4. All five device slots must be present
  const devices = Array.isArray(manifest.devices) ? manifest.devices : [];
  const byId = new Map(devices.map((d) => [d.id, d]));

  for (const id of REQUIRED_DEVICE_IDS) {
    const device = byId.get(id);
    if (!device) {
      fail(`missing required device slot: ${id}`);
      continue;
    }

    // 5. Check for invalid evidence methods — grep and resized desktop
    const method = String(device.method || "");
    const notes = String(device.notes || "");
    const normMethod = method.toLowerCase().replace(/[ _-]+/g, " ");
    const normNotes = notes.toLowerCase().replace(/[ _-]+/g, " ");
    const normText = `${normMethod} ${normNotes}`;

    if (normText.includes("grep")) {
      fail(`${id}: grep output is not acceptable as device evidence`);
    }

    if (normText.includes("desktop") && normText.includes("resize") && normText.includes("screenshot")) {
      fail(`${id}: resized desktop screenshot is not acceptable as device evidence`);
    } else if (normText.includes("desktop") && normText.includes("resize")) {
      fail(`${id}: resized desktop evidence is not acceptable as device evidence`);
    }

    // 6. Each device must have screenshotIds that reference actual files
    const screenshotIds = Array.isArray(device.screenshotIds) ? device.screenshotIds : [];
    const screenshotsDir = path.join(receiptRoot, "screenshots");

    if (screenshotIds.length === 0) {
      fail(`${id}: no screenshotIds declared`);
    } else {
      for (const sid of screenshotIds) {
        const screenshotPath = path.join(screenshotsDir, sid);
        if (!fs.existsSync(screenshotPath) || !fs.statSync(screenshotPath).isFile()) {
          fail(`${id}: screenshot ${sid} not found in screenshots/`);
        } else if (fs.statSync(screenshotPath).size === 0) {
          fail(`${id}: screenshot ${sid} is empty`);
        }
      }
    }

    // 7. Mobile slots must not claim "claimed: true" (F3's obligation)
    if (/^(iPhone|iPad)/.test(id) && device.claimed === true) {
      fail(`${id}: mobile slot prematurely claimed — F3 must fill this`);
    }

    // 8. Field keys check (F3 audit keys)
    for (const key of REQUIRED_FIELD_KEYS) {
      if (!(key in device)) {
        fail(`${id}: missing required field key: ${key}`);
      }
    }
  }

  // 9. Global checks: grep-only receipt, resized-desktop-only receipt
  const allMethods = devices.map((d) => String(d.method || "")).join(" ");
  const allNotes = devices.map((d) => String(d.notes || "")).join(" ");
  const allText = `${allMethods} ${allNotes}`.toLowerCase();

  if (allText.includes("grep") && !allText.includes("screenshot")) {
    fail("receipt evidence is grep-only — grep output is not acceptable as device proof");
  }

  const hasResizedDesktop = allText.includes("resize") && allText.includes("desktop") && allText.includes("screenshot");
  const hasPhysicalScreenshot = devices.some((d) =>
    Array.isArray(d.screenshotIds) && d.screenshotIds.length > 0 && d.proof_type === "physical"
  );
  if (hasResizedDesktop && !hasPhysicalScreenshot) {
    fail("receipt evidence is resized-desktop-screenshot-only — not acceptable as device proof");
  }

  if (errors === 0) {
    process.stdout.write("ACCEPT: well-formed physical receipt\n");
    process.exit(0);
  } else {
    process.stderr.write(`\n${errors} rejection(s) total\n`);
    process.exit(1);
  }
}

main();
