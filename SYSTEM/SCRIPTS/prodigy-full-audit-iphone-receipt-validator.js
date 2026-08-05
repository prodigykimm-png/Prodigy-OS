#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PLAN_SLUG = "prodigy-os-full-audit-improvement";
const REQUIRED_CHECKS = Object.freeze(["micro_log_controls_visible", "secondary_summary_visible", "bottom_clearance_pass", "hit_test_pass"]);

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--plan") result.plan = argv[++i];
    else if (argv[i] === "--expected-product-head") result.expectedProductHead = argv[++i];
    else if (argv[i] === "--receipt-dir") result.receiptDir = path.resolve(argv[++i]);
    else if (argv[i] === "--claim-output") result.claimOutput = path.resolve(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return result;
}

function validate(options) {
  const errors = [];
  if (options.plan !== PLAN_SLUG) errors.push("wrong plan slug");
  if (!/^[a-f0-9]{40}$/.test(options.expectedProductHead || "")) errors.push("expected product HEAD must be a full SHA");
  if (!options.receiptDir || !fs.existsSync(options.receiptDir)) return { ok: false, status: "not_proven", errors: [...errors, "physical receipt directory is missing"] };
  const manifestPath = path.join(options.receiptDir, "physical-receipt.json");
  if (!fs.existsSync(manifestPath)) return { ok: false, status: "not_proven", errors: [...errors, "physical-receipt.json is missing"] };
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (error) { return { ok: false, status: "invalid", errors: [...errors, `invalid JSON: ${error.message}`] }; }
  if (receipt.plan_slug !== PLAN_SLUG) errors.push("receipt plan slug mismatch");
  if (receipt.audited_product_head_sha !== options.expectedProductHead) errors.push("receipt product HEAD mismatch");
  if (receipt.proof_type !== "physical") errors.push("proof_type must be physical");
  if (!/^iPhone\b/.test(receipt.device_model || "")) errors.push("device_model must name an iPhone");
  if (!new Set(["portrait", "landscape"]).has(receipt.orientation)) errors.push("orientation must be portrait or landscape");
  for (const key of ["user_confirmation_timestamp", "ios_version", "obsidian_version", "screenshot_file"]) {
    if (typeof receipt[key] !== "string" || receipt[key].trim() === "") errors.push(`missing ${key}`);
  }
  if (receipt.user_confirmation_timestamp && Number.isNaN(Date.parse(receipt.user_confirmation_timestamp))) errors.push("invalid user confirmation timestamp");
  for (const check of REQUIRED_CHECKS) if (receipt.checks?.[check] !== true) errors.push(`${check} must be true`);
  if (receipt.screenshot_file) {
    const screenshot = path.resolve(options.receiptDir, receipt.screenshot_file);
    if (!screenshot.startsWith(`${options.receiptDir}${path.sep}`)) errors.push("screenshot escapes receipt directory");
    else if (!fs.existsSync(screenshot) || fs.statSync(screenshot).size === 0) errors.push("screenshot is missing or empty");
  }
  return { ok: errors.length === 0, status: errors.length === 0 ? "proven" : "invalid", errors };
}

function writeClaim(filePath, result, headSha) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ physical_device_success: result.ok, physical_claim_status: result.ok ? "proven" : "not_proven", audited_product_head_sha: headSha, errors: result.errors }, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = validate(options);
  writeClaim(options.claimOutput, result, options.expectedProductHead);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ PLAN_SLUG, REQUIRED_CHECKS, parseArgs, validate, writeClaim });
