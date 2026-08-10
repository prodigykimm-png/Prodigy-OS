#!/usr/bin/env node
"use strict";

/**
 * Build a redacted comparison report from synthetic settings receipts.
 *
 * The report deliberately keeps three attribution lanes separate:
 *   baseline  - the read-only preimage and source projection;
 *   settings  - the approved one-variable settings changes and rollback proof;
 *   product   - product phase observations supplied by the receipt.
 *
 * This CLI does not inspect, mutate, or claim success for physical mobile
 * devices.  It reads JSON receipts only; any target settings bytes are out of
 * scope for the report process.
 */

const fs = require("node:fs");
const path = require("node:path");
const validator = require("./prodigy-mobile-settings-change-validator.js");

const SECRET_KEY = /(authorization|bearer|cookie|credential|password|passwd|private[_-]?key|secret|token|api[_-]?key|access[_-]?key)/iu;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneRedacted(value, stack = []) {
  if (Array.isArray(value)) return value.map((entry, index) => cloneRedacted(entry, stack.concat(String(index))));
  if (!isObject(value)) return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = cloneRedacted(child, stack.concat(key));
    }
  }
  return output;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`unable to read JSON receipt ${filePath}: ${error.message}`);
  }
}

function readRedactedReceipts(inputPath) {
  const absolute = path.resolve(inputPath);
  if (!fs.existsSync(absolute)) throw new Error(`receipt path does not exist: ${inputPath}`);
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    const parsed = readJsonFile(absolute);
    return normalizeReceipts(parsed);
  }
  if (!stat.isDirectory()) throw new Error(`receipt path is not a file or directory: ${inputPath}`);
  const files = fs.readdirSync(absolute).filter((name) => name.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`receipt directory contains no JSON files: ${inputPath}`);
  return files.flatMap((name) => normalizeReceipts(readJsonFile(path.join(absolute, name))));
}

function normalizeReceipts(input) {
  if (Array.isArray(input)) return input;
  if (!isObject(input)) throw new Error("receipt input must be an object or array");
  if (Array.isArray(input.receipts)) return input.receipts;
  if (Array.isArray(input.changes) && !input.change_id) {
    // A campaign wrapper may carry immutable IDs while each change is a full
    // receipt.  Copy only those two binding fields; never invent evidence.
    return input.changes.map((change) => {
      if (!isObject(change)) return change;
      const merged = { ...change };
      for (const key of ["configuration_id", "campaign_id"]) {
        if (merged[key] === undefined && input[key] !== undefined) merged[key] = input[key];
      }
      return merged;
    });
  }
  return [input];
}

function collectValues(value, key, output = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectValues(entry, key, output));
  } else if (isObject(value)) {
    Object.entries(value).forEach(([name, child]) => {
      if (name === key && typeof child === "string") output.add(child);
      collectValues(child, key, output);
    });
  }
  return output;
}

function uniqueBinding(receipts, field) {
  const values = new Set(receipts.map((receipt) => receipt && receipt[field]).filter((value) => typeof value === "string"));
  if (values.size !== 1) throw new Error(`mixed ${field} values in receipts`);
  return values.values().next().value;
}

function baselineAttribution(receipts) {
  const targets = receipts.map((receipt) => ({
    target_path: receipt.target_path,
    preimage_sha256: receipt.preimage_sha256,
    bytes: receipt.preimage_bytes,
    redacted_before: cloneRedacted(receipt.before),
    backup_sha256: receipt.backup_sha256,
    backup_bytes: receipt.backup_bytes,
  }));
  targets.sort((a, b) => a.target_path.localeCompare(b.target_path));
  return {
    source: "read-only receipt preimage",
    targets,
    settings_mutated_by_report: false,
  };
}

function settingsAttribution(receipts) {
  const changes = receipts.map((receipt) => ({
    change_id: receipt.change_id,
    target_path: receipt.target_path,
    configuration_id: receipt.configuration_id,
    campaign_id: receipt.campaign_id,
    json_pointer: receipt.json_pointer,
    structural_anchor: cloneRedacted(receipt.structural_anchor),
    identity: cloneRedacted(receipt.identity),
    dependency: cloneRedacted(receipt.dependency),
    user_purpose: receipt.user_purpose,
    preimage_sha256: receipt.preimage_sha256,
    proposed_postimage_sha256: receipt.proposed_postimage_sha256,
    postimage_sha256: receipt.postimage_sha256 || null,
    diff: cloneRedacted(receipt.diff),
    approval: {
      approved: receipt.approval.approved === true,
      approved_by: receipt.approval.approved_by,
      approved_at: receipt.approval.approved_at,
      preimage_sha256: receipt.approval.preimage_sha256,
      proposed_postimage_sha256: receipt.approval.proposed_postimage_sha256,
    },
    rollback: cloneRedacted(receipt.rollback),
    backup: {
      path: receipt.backup_path,
      sha256: receipt.backup_sha256,
      bytes: receipt.backup_bytes,
      read_back_verified: receipt.backup_read_back.verified === true && receipt.backup_read_back.matches_backup === true,
    },
  }));
  changes.sort((a, b) => a.change_id.localeCompare(b.change_id));
  return {
    source: "approved one-variable settings receipts",
    changes,
    change_count: changes.length,
    rollback_verified: changes.every((change) => change.rollback.status === "verified" && change.rollback.hash_equal === true),
  };
}

function productAttribution(receipts) {
  const observations = receipts.map((receipt) => {
    const impact = isObject(receipt.observed_impact) ? receipt.observed_impact : {};
    const product = impact.product || impact.product_attribution || receipt.product_attribution || {};
    return {
      change_id: receipt.change_id,
      configuration_id: receipt.configuration_id,
      campaign_id: receipt.campaign_id,
      observed: cloneRedacted(product),
      physical_mobile_claimed: false,
      attribution_status: "observed_only",
    };
  });
  return {
    source: "redacted product-phase observations only",
    observations,
    physical_mobile_claimed: false,
    physical_mobile_status: "not_claimed",
    claims_permitted: false,
  };
}

function buildComparisonReport(input, options = {}) {
  const receipts = Array.isArray(input) ? input : normalizeReceipts(input);
  if (receipts.length === 0) throw new Error("at least one settings receipt is required");

  const validation = receipts.map((receipt) => validator.validateSettingsChange(receipt, options));
  const failures = validation.flatMap((result, index) => result.errors.map((error) => ({ receipt_index: index, ...error })));
  if (failures.length > 0) {
    const error = new Error("one or more settings receipts failed validation");
    error.code = "invalid_receipts";
    error.errors = failures;
    throw error;
  }

  const configurationId = uniqueBinding(receipts, "configuration_id");
  const campaignId = uniqueBinding(receipts, "campaign_id");
  const configurationDigests = collectValues(receipts, "configuration_digest");
  const campaignDigests = collectValues(receipts, "campaign_digest");
  const configurationHashes = collectValues(receipts, "configuration_sha256");
  const campaignHashes = collectValues(receipts, "campaign_sha256");
  if (configurationDigests.size > 1) throw new Error("mixed configuration digests in receipts");
  if (campaignDigests.size > 1) throw new Error("mixed campaign digests in receipts");
  if (configurationHashes.size > 1) throw new Error("mixed configuration SHA-256 values in receipts");
  if (campaignHashes.size > 1) throw new Error("mixed campaign SHA-256 values in receipts");

  const baseline = baselineAttribution(receipts);
  const settings = settingsAttribution(receipts);
  const product = productAttribution(receipts);
  return {
    schema_version: 1,
    report_kind: "prodigy-mobile-settings-comparison",
    configuration_id: configurationId,
    campaign_id: campaignId,
    configuration_digest: configurationDigests.size === 1 ? configurationDigests.values().next().value : null,
    campaign_digest: campaignDigests.size === 1 ? campaignDigests.values().next().value : null,
    configuration_sha256: configurationHashes.size === 1 ? configurationHashes.values().next().value : null,
    campaign_sha256: campaignHashes.size === 1 ? campaignHashes.values().next().value : null,
    baseline_attribution: baseline,
    settings_attribution: settings,
    product_attribution: product,
    attribution: { baseline, settings, product },
    physical_mobile_claimed: false,
    physical_mobile_status: "not_claimed",
    physical_evidence: "not supplied; static/receipt evidence cannot establish physical mobile success",
    receipt_count: receipts.length,
  };
}

function printError(error) {
  process.stderr.write(`REJECT: ${error.message}\n`);
  if (Array.isArray(error.errors)) {
    error.errors.forEach((entry) => process.stderr.write(`REJECT: ${entry.code}: ${entry.message}\n`));
  }
}

function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    process.stdout.write("Usage: node SYSTEM/SCRIPTS/prodigy-mobile-settings-comparison-report.js <receipt.json|receipt-dir> [--output <external.json>]\n");
    process.exit(args.length === 0 ? 1 : 0);
  }
  const inputPath = args[0];
  const outputIndex = args.indexOf("--output");
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  try {
    const receipts = readRedactedReceipts(inputPath);
    const report = buildComparisonReport(receipts, { vaultRoot: process.cwd() });
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (outputPath) {
      const destination = path.resolve(outputPath);
      if (isWithin(destination, path.resolve(process.cwd()))) throw new Error("report output must be outside the Vault/repository");
      fs.writeFileSync(destination, serialized, "utf8");
    } else {
      process.stdout.write(serialized);
    }
  } catch (error) {
    printError(error);
    process.exit(1);
  }
}

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

if (require.main === module) cli();

module.exports = {
  readRedactedReceipts,
  normalizeReceipts,
  buildComparisonReport,
  buildReport: buildComparisonReport,
  baselineAttribution,
  settingsAttribution,
  productAttribution,
};
