#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const recorder = require("../Views/prodigy-performance-recorder.js");

const PHASES = new Set(recorder.APPROVED_PHASES);
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40,64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUIRED_MARKS = recorder.REQUIRED_MARKS.slice();
const REQUIRED_INSTRUMENTED_MARKS = REQUIRED_MARKS.concat(["disposed"]);
const PAIRS = Object.freeze({
  module_start: "module_end",
  data_scan_start: "data_scan_end",
  data_read_start: "data_read_end",
  projection_start: "projection_end",
  dom_render_start: "dom_render_end",
  optional_start: "optional_end"
});
const ROOT_RECEIPT_KEYS = new Set([
  "schema_version", "receipt_type", "run_id", "correlation_id", "correlation_started_at_ms", "control_clock",
  "mode", "instrumented", "cold_warm", "metadata", "marks", "failures", "missing_marks", "duration_ms", "counts",
  "source_sha256", "settings_sha256", "configuration_sha256", "final_git_sha", "campaign_id", "sample_id",
  "receipt_sha256", "discarded", "physical_claim_status", "physical_device_success", "redaction", "attribution"
]);
const MARK_KEYS = new Set([
  "sequence", "phase", "kind", "at_ms", "duration_ms", "module_path", "scope", "status", "code", "attempt_id",
  "cached", "count", "bytes", "reason", "missing_start"
]);
const REDACTION_KEYS = new Set(["applied", "user_content_excluded", "secrets_removed", "fields_removed"]);
const ATTRIBUTION_KEYS = new Set(["external_start_status", "external_start_duration_ms", "icloud_status", "product_status"]);
const METADATA_KEYS = new Set(["run_id", "correlation_id", "mount_id", "workspace_id", "module_path"]);

function issue(errors, location, message) {
  errors.push(location ? location + ": " + message : message);
}

function finite(value, minimum) {
  return typeof value === "number" && Number.isFinite(value) && (minimum === undefined || value >= minimum);
}

function object(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value) {
  return recorder.safeRelativePath(value);
}

function modulePathAllowed(value, allowlist) {
  return recorder.allowlistedModulePath(value, allowlist);
}

function scanSensitive(value, location, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitive(item, location + "[" + index + "]", errors));
    return;
  }
  if (!object(value)) {
    if (typeof value === "string" && (/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value) || /-----BEGIN[^\n]*PRIVATE KEY-----/i.test(value) || /\bsk-[A-Za-z0-9]{16,}\b/.test(value))) issue(errors, location, "secret-like value is not allowed");
    return;
  }
  Object.keys(value).forEach((key) => {
    const child = location ? location + "." + key : key;
    if (/^(?:content|body|note|user_?content|raw_?text|vault_?text|markdown)$/i.test(key)) issue(errors, child, "user or note content is not allowed");
    if (key !== "secrets_removed" && /(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i.test(key)) issue(errors, child, "secret-like field is not allowed");
    if (/_?path$/i.test(key) || key === "path") {
      if (typeof value[key] !== "string" || !safeRelativePath(value[key])) issue(errors, child, "unsafe path");
    }
    scanSensitive(value[key], child, errors);
  });
}

function checkKeys(value, allowed, location, errors) {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) issue(errors, location + "." + key, "unknown property");
  });
}

function validateHash(value, name, errors, required) {
  if (value === undefined) {
    if (required) issue(errors, name, "missing SHA-256 hash");
    return;
  }
  if (typeof value !== "string" || !SHA256.test(value)) issue(errors, name, "must be 64 lowercase hexadecimal characters");
}

function validateReceipt(input, options) {
  const config = options && typeof options === "object" ? options : {};
  const errors = [];
  const receipt = input;
  if (!object(receipt)) return { ok: false, errors: ["receipt must be a JSON object"], receipt: null };
  scanSensitive(receipt, "", errors);
  checkKeys(receipt, ROOT_RECEIPT_KEYS, "receipt", errors);
  if (receipt.schema_version !== 1) issue(errors, "schema_version", "must equal 1");
  if (receipt.receipt_type !== recorder.RECEIPT_TYPE) issue(errors, "receipt_type", "must identify a performance receipt");
  ["run_id", "correlation_id"].forEach((name) => {
    if (typeof receipt[name] !== "string" || !SAFE_ID.test(receipt[name])) issue(errors, name, "must be a bounded identifier");
  });
  if (!Number.isInteger(receipt.correlation_started_at_ms) || receipt.correlation_started_at_ms < 0) issue(errors, "correlation_started_at_ms", "must be a non-negative integer correlation label");
  if (!object(receipt.control_clock) || receipt.control_clock.name !== "performance.now" || receipt.control_clock.monotonic !== true || receipt.control_clock.unit !== "ms") issue(errors, "control_clock", "must be the monotonic performance.now clock");
  if (!["instrumented", "uninstrumented"].includes(receipt.mode)) issue(errors, "mode", "must be instrumented or uninstrumented");
  if (typeof receipt.instrumented !== "boolean" || receipt.instrumented !== (receipt.mode === "instrumented")) issue(errors, "instrumented", "must agree with mode");
  if (!["cold", "warm"].includes(receipt.cold_warm)) issue(errors, "cold_warm", "must be cold or warm");
  validateHash(receipt.source_sha256, "source_sha256", errors, true);
  validateHash(receipt.settings_sha256, "settings_sha256", errors, true);
  validateHash(receipt.configuration_sha256, "configuration_sha256", errors, false);
  if (receipt.final_git_sha !== undefined && (typeof receipt.final_git_sha !== "string" || !GIT_SHA.test(receipt.final_git_sha))) issue(errors, "final_git_sha", "must be 40-64 lowercase hexadecimal characters");
  if (receipt.receipt_sha256 !== undefined && (typeof receipt.receipt_sha256 !== "string" || !SHA256.test(receipt.receipt_sha256))) issue(errors, "receipt_sha256", "must be a SHA-256 hash");
  if (!object(receipt.metadata)) issue(errors, "metadata", "must be an object");
  else {
    checkKeys(receipt.metadata, METADATA_KEYS, "metadata", errors);
    Object.keys(receipt.metadata).forEach((key) => {
      const value = receipt.metadata[key];
      if (key === "module_path") {
        if (!modulePathAllowed(value, config.module_path_allowlist)) issue(errors, "metadata.module_path", "must be an allowlisted relative module path");
      } else if (key.endsWith("_id") && (typeof value !== "string" || !SAFE_ID.test(value))) issue(errors, "metadata." + key, "must be a bounded identifier");
      else if (key === "workspace_id" && (typeof value !== "string" || value.length < 1 || value.length > 160)) issue(errors, "metadata.workspace_id", "must be bounded");
    });
  }
  if (!Array.isArray(receipt.marks) || receipt.marks.length === 0 || receipt.marks.length > 512) issue(errors, "marks", "must be a non-empty bounded array");
  const marks = Array.isArray(receipt.marks) ? receipt.marks : [];
  let previousAt = -Infinity;
  let previousSequence = 0;
  const seenPhases = new Set();
  const starts = new Map();
  marks.forEach((mark, index) => {
    const location = "marks[" + index + "]";
    if (!object(mark)) {
      issue(errors, location, "must be an object");
      return;
    }
    checkKeys(mark, MARK_KEYS, location, errors);
    if (!Number.isInteger(mark.sequence) || mark.sequence <= previousSequence) issue(errors, location + ".sequence", "must increase strictly");
    previousSequence = Number.isInteger(mark.sequence) ? mark.sequence : previousSequence;
    if (!PHASES.has(mark.phase)) issue(errors, location + ".phase", "unsupported phase");
    else seenPhases.add(mark.phase);
    if (!["mark", "start", "end", "failure", "retry"].includes(mark.kind)) issue(errors, location + ".kind", "unsupported mark kind");
    if (!finite(mark.at_ms, 0) || mark.at_ms < previousAt) issue(errors, location + ".at_ms", "must be monotonic and non-negative");
    previousAt = finite(mark.at_ms, 0) ? mark.at_ms : previousAt;
    if (mark.duration_ms !== undefined && !finite(mark.duration_ms, 0)) issue(errors, location + ".duration_ms", "must be non-negative");
    if (mark.module_path !== undefined && !modulePathAllowed(mark.module_path, config.module_path_allowlist)) issue(errors, location + ".module_path", "must be an allowlisted relative module path");
    ["scope", "status", "code", "attempt_id", "reason"].forEach((key) => { if (mark[key] !== undefined && (typeof mark[key] !== "string" || mark[key].length === 0 || mark[key].length > (key === "reason" ? 240 : 80))) issue(errors, location + "." + key, "must be bounded text"); });
    ["count", "bytes"].forEach((key) => { if (mark[key] !== undefined && !finite(mark[key], 0)) issue(errors, location + "." + key, "must be non-negative"); });
    if (mark.cached !== undefined && typeof mark.cached !== "boolean") issue(errors, location + ".cached", "must be boolean");
    const key = (mark.phase || "") + "\u0000" + (mark.module_path || "") + "\u0000" + (mark.scope || "");
    if (mark.phase && Object.prototype.hasOwnProperty.call(PAIRS, mark.phase)) starts.set(key, mark);
    if (mark.phase && mark.phase.endsWith("_end")) {
      const startPhase = Object.keys(PAIRS).find((name) => PAIRS[name] === mark.phase);
      if (!startPhase) {
        issue(errors, location, "end mark has no matching start");
      } else {
        const startKey = startPhase + "\u0000" + (mark.module_path || "") + "\u0000" + (mark.scope || "");
        if (!starts.has(startKey)) issue(errors, location, "end mark has no matching start");
        if (mark.duration_ms === undefined) issue(errors, location + ".duration_ms", "paired end mark requires duration");
        starts.delete(startKey);
      }
    }
  });
  starts.forEach((mark) => issue(errors, "marks", "open start mark missing its end: " + mark.phase));
  REQUIRED_INSTRUMENTED_MARKS.forEach((phase) => {
    if (receipt.instrumented && !seenPhases.has(phase)) issue(errors, "marks", "missing required mark: " + phase);
  });
  if (!Array.isArray(receipt.missing_marks) || receipt.missing_marks.some((phase) => !PHASES.has(phase))) issue(errors, "missing_marks", "must list only approved phases");
  const missing = Array.isArray(receipt.missing_marks) ? receipt.missing_marks : [];
  REQUIRED_INSTRUMENTED_MARKS.forEach((phase) => {
    if (receipt.instrumented && !seenPhases.has(phase) && !missing.includes(phase)) issue(errors, "missing_marks", "missing required omission record: " + phase);
    if (seenPhases.has(phase) && missing.includes(phase)) issue(errors, "missing_marks", "phase is both present and missing: " + phase);
  });
  if (!finite(receipt.duration_ms, 0)) issue(errors, "duration_ms", "must be non-negative");
  if (finite(receipt.duration_ms, 0) && finite(previousAt, 0) && receipt.duration_ms < previousAt) issue(errors, "duration_ms", "must cover the final monotonic mark");
  if (receipt.counts !== undefined) {
    if (!object(receipt.counts)) issue(errors, "counts", "must be an object");
    else Object.keys(receipt.counts).forEach((key) => { if (!["scanned", "read", "projected", "rendered", "bytes"].includes(key) || !finite(receipt.counts[key], 0)) issue(errors, "counts." + key, "invalid count"); });
  }
  if (!Array.isArray(receipt.failures) || receipt.failures.length > 128) issue(errors, "failures", "must be a bounded array");
  (Array.isArray(receipt.failures) ? receipt.failures : []).forEach((failure, index) => {
    const location = "failures[" + index + "]";
    if (!object(failure)) issue(errors, location, "must be an object");
    else {
      checkKeys(failure, new Set(["code", "phase", "message"]), location, errors);
      if (typeof failure.code !== "string" || failure.code.length < 1 || failure.code.length > 80) issue(errors, location + ".code", "must be bounded");
      if (failure.phase !== undefined && !PHASES.has(failure.phase)) issue(errors, location + ".phase", "unsupported phase");
      if (typeof failure.message !== "string" || failure.message.length < 1 || failure.message.length > 240) issue(errors, location + ".message", "must be bounded");
    }
  });
  if (!object(receipt.redaction)) issue(errors, "redaction", "must be present");
  else {
    checkKeys(receipt.redaction, REDACTION_KEYS, "redaction", errors);
    ["applied", "user_content_excluded", "secrets_removed"].forEach((key) => { if (receipt.redaction[key] !== true) issue(errors, "redaction." + key, "must be true"); });
    if (receipt.redaction.fields_removed !== undefined && (!Array.isArray(receipt.redaction.fields_removed) || receipt.redaction.fields_removed.length > 64 || receipt.redaction.fields_removed.some((item) => typeof item !== "string" || item.length > 80))) issue(errors, "redaction.fields_removed", "must be bounded strings");
  }
  if (receipt.physical_claim_status !== "not_proven") issue(errors, "physical_claim_status", "physical mobile claims are unsupported");
  if (receipt.physical_device_success !== false) issue(errors, "physical_device_success", "physical mobile success is not proven by this receipt");
  if (!object(receipt.attribution)) issue(errors, "attribution", "must be present");
  else {
    checkKeys(receipt.attribution, ATTRIBUTION_KEYS, "attribution", errors);
    if (!["measured", "dominated", "not_measured", "pending"].includes(receipt.attribution.external_start_status)) issue(errors, "attribution.external_start_status", "invalid external attribution status");
    if (receipt.attribution.external_start_duration_ms !== null && !finite(receipt.attribution.external_start_duration_ms, 0)) issue(errors, "attribution.external_start_duration_ms", "must be a duration or null");
    if (!["measured", "pending", "not_measured", "clear"].includes(receipt.attribution.icloud_status)) issue(errors, "attribution.icloud_status", "invalid iCloud status");
    if (!["measured", "not_measured", "failed"].includes(receipt.attribution.product_status)) issue(errors, "attribution.product_status", "invalid product status");
  }
  if (receipt.receipt_sha256 !== undefined && !recorder.verifyReceiptHash(receipt)) issue(errors, "receipt_sha256", "does not match canonical receipt bytes");
  ["source_sha256", "settings_sha256", "configuration_sha256"].forEach((key) => {
    validateHash(receipt[key], key, errors, key === "source_sha256" || key === "settings_sha256");
  });
  if (typeof receipt.final_git_sha !== "string" || !GIT_SHA.test(receipt.final_git_sha)) issue(errors, "final_git_sha", "must be 40-64 lowercase hexadecimal characters");
  validateHash(receipt.receipt_sha256, "receipt_sha256", errors, true);
  ["source_sha256", "settings_sha256", "configuration_sha256", "final_git_sha"].forEach((key) => {
    if (config[key] !== undefined && receipt[key] !== config[key]) issue(errors, key, "does not match campaign binding");
  });
  if (config.cold_warm !== undefined && receipt.cold_warm !== config.cold_warm) issue(errors, "cold_warm", "does not match campaign class");
  return { ok: errors.length === 0, errors, receipt };
}

function validManifestPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 && safeRelativePath(value) && !value.startsWith(".obsidian/") && !value.startsWith("SYSTEM/") && !value.includes("/../");
}

function readJson(filePath) {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf8")), error: null };
  } catch (cause) {
    return { value: null, error: cause };
  }
}

function validateCampaign(manifest, options) {
  const config = options && typeof options === "object" ? options : {};
  const errors = [];
  if (!object(manifest)) return { ok: false, errors: ["campaign manifest must be a JSON object"], samples: [] };
  scanSensitive(manifest, "", errors);
  const allowed = new Set(["schema_version", "campaign_type", "campaign_id", "created_at_ms", "campaign_stage", "sample_policy", "source_sha256", "settings_sha256", "configuration_sha256", "final_git_sha", "samples", "redaction"]);
  checkKeys(manifest, allowed, "campaign", errors);
  if (manifest.schema_version !== 1) issue(errors, "campaign.schema_version", "must equal 1");
  if (manifest.campaign_type !== "prodigy-performance-campaign") issue(errors, "campaign.campaign_type", "must identify a performance campaign");
  if (typeof manifest.campaign_id !== "string" || !SAFE_ID.test(manifest.campaign_id)) issue(errors, "campaign.campaign_id", "must be a bounded identifier");
  const campaignStage = manifest.campaign_stage === undefined ? "exploratory" : manifest.campaign_stage;
  if (!["exploratory", "final"].includes(campaignStage)) issue(errors, "campaign.campaign_stage", "must be exploratory or final");
  const rawSamplePolicy = manifest.sample_policy === undefined ? {} : manifest.sample_policy;
  const samplePolicy = object(rawSamplePolicy) ? rawSamplePolicy : {};
  if (!object(rawSamplePolicy)) issue(errors, "campaign.sample_policy", "must be an object");
  if (object(samplePolicy)) {
    checkKeys(samplePolicy, new Set(["minimum_valid_cold", "minimum_valid_warm", "exploratory_valid_cold", "exploratory_valid_warm"]), "campaign.sample_policy", errors);
  }
  const minimumValidCold = samplePolicy.minimum_valid_cold === undefined ? (campaignStage === "final" ? 20 : 0) : samplePolicy.minimum_valid_cold;
  const minimumValidWarm = samplePolicy.minimum_valid_warm === undefined ? (campaignStage === "final" ? 20 : 0) : samplePolicy.minimum_valid_warm;
  if (!Number.isInteger(minimumValidCold) || minimumValidCold < 0) issue(errors, "campaign.sample_policy.minimum_valid_cold", "must be a non-negative integer");
  if (!Number.isInteger(minimumValidWarm) || minimumValidWarm < 0) issue(errors, "campaign.sample_policy.minimum_valid_warm", "must be a non-negative integer");
  validateHash(manifest.source_sha256, "campaign.source_sha256", errors, true);
  validateHash(manifest.settings_sha256, "campaign.settings_sha256", errors, true);
  validateHash(manifest.configuration_sha256, "campaign.configuration_sha256", errors, false);
  if (typeof manifest.final_git_sha !== "string" || !GIT_SHA.test(manifest.final_git_sha)) issue(errors, "campaign.final_git_sha", "must be a final Git SHA");
  if (!Array.isArray(manifest.samples) || manifest.samples.length === 0 || manifest.samples.length > 10000) issue(errors, "campaign.samples", "must be a non-empty bounded array");
  if (!object(manifest.redaction) || manifest.redaction.applied !== true || manifest.redaction.user_content_excluded !== true || manifest.redaction.secrets_removed !== true) issue(errors, "campaign.redaction", "must prove redaction");
  const seenIds = new Set();
  const samples = [];
  const root = config.root || process.cwd();
  (Array.isArray(manifest.samples) ? manifest.samples : []).forEach((sample, index) => {
    const location = "campaign.samples[" + index + "]";
    if (!object(sample)) {
      issue(errors, location, "must be an object");
      samples.push({ sample_id: "sample-" + index, receipt_path: null, valid: false, errors: ["sample must be an object"], receipt: null, discarded: true });
      return;
    }
    checkKeys(sample, new Set(["sample_id", "receipt_path", "cold_warm", "discarded"]), location, errors);
    if (typeof sample.sample_id !== "string" || !SAFE_ID.test(sample.sample_id) || seenIds.has(sample.sample_id)) issue(errors, location + ".sample_id", "must be unique and bounded");
    seenIds.add(sample.sample_id);
    if (!validManifestPath(sample.receipt_path)) {
      issue(errors, location + ".receipt_path", "must be a safe relative receipt path");
      samples.push({ sample_id: sample.sample_id || "sample-" + index, receipt_path: null, valid: false, errors: ["unsafe receipt path"], receipt: null, discarded: true });
      return;
    }
    if (!["cold", "warm"].includes(sample.cold_warm)) issue(errors, location + ".cold_warm", "must be cold or warm");
    const absolute = path.resolve(root, sample.receipt_path);
    const relative = path.relative(root, absolute);
    if (!relative || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      issue(errors, location + ".receipt_path", "resolves outside campaign root");
      samples.push({ sample_id: sample.sample_id || "sample-" + index, receipt_path: null, valid: false, errors: ["receipt path resolves outside campaign root"], receipt: null, discarded: true });
      return;
    }
    const parsed = readJson(absolute);
    if (parsed.error) {
      issue(errors, location + ".receipt_path", "receipt is unreadable or malformed JSON: " + parsed.error.message);
      samples.push({ sample_id: sample.sample_id, receipt_path: sample.receipt_path, valid: false, errors: [parsed.error.message], receipt: null, discarded: true });
      return;
    }
    const result = validateReceipt(parsed.value, {
      source_sha256: manifest.source_sha256,
      settings_sha256: manifest.settings_sha256,
      configuration_sha256: manifest.configuration_sha256,
      final_git_sha: manifest.final_git_sha,
      cold_warm: sample.cold_warm,
      module_path_allowlist: config.module_path_allowlist
    });
    if (!result.ok) result.errors.forEach((message) => issue(errors, location, message));
    samples.push({ sample_id: sample.sample_id, receipt_path: sample.receipt_path, valid: result.ok, errors: result.errors.slice(), receipt: result.receipt, discarded: sample.discarded === true });
  });
  const configurationValues = samples.filter((sample) => sample.receipt && sample.valid).map((sample) => sample.receipt.configuration_sha256 === undefined ? null : sample.receipt.configuration_sha256);
  const distinctConfigurationValues = new Set(configurationValues);
  if (distinctConfigurationValues.size > 1) issue(errors, "campaign.samples", "mixed configuration SHA or missing configuration binding");
  if (configurationValues.some((value) => value !== null) && manifest.configuration_sha256 === undefined) issue(errors, "campaign.configuration_sha256", "configuration binding is required when samples provide one");
  if (config.final_sha !== undefined && manifest.final_git_sha !== config.final_sha) issue(errors, "campaign.final_git_sha", "does not match explicit final SHA");
  const eligibleSamples = samples.filter((sample) => {
    if (!sample.valid || sample.discarded || !sample.receipt) return false;
    if (sample.receipt.failures && sample.receipt.failures.length > 0) return false;
    if (sample.receipt.missing_marks && sample.receipt.missing_marks.length > 0) return false;
    return true;
  });
  const validCold = eligibleSamples.filter((sample) => sample.receipt.cold_warm === "cold").length;
  const validWarm = eligibleSamples.filter((sample) => sample.receipt.cold_warm === "warm").length;
  const sampleGate = {
    stage: campaignStage,
    minimum_valid_cold: minimumValidCold,
    minimum_valid_warm: minimumValidWarm,
    valid_cold: validCold,
    valid_warm: validWarm,
    passed: validCold >= minimumValidCold && validWarm >= minimumValidWarm
  };
  if (!sampleGate.passed) {
    if (validCold < minimumValidCold) issue(errors, "campaign.samples", `final distribution requires ${minimumValidCold} valid cold samples; received ${validCold}`);
    if (validWarm < minimumValidWarm) issue(errors, "campaign.samples", `final distribution requires ${minimumValidWarm} valid warm samples; received ${validWarm}`);
  }
  return { ok: errors.length === 0, errors, samples, manifest, sample_gate: sampleGate };
}

function parseArgs(argv) {
  const args = { paths: [], final_sha: null, campaign: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") args.help = true;
    else if (value === "--campaign" || value === "--manifest") args.campaign = true;
    else if (value === "--final-sha" || value === "--final-git-sha") args.final_sha = argv[++index];
    else if (value.startsWith("--")) throw new Error("unknown option: " + value);
    else args.paths.push(value);
  }
  return args;
}

function main(argv) {
  let args;
  try { args = parseArgs(argv); } catch (cause) { process.stderr.write("REJECT: " + cause.message + "\n"); return 1; }
  if (args.help) {
    process.stdout.write("Usage: node SYSTEM/SCRIPTS/prodigy-performance-receipt-validator.js [--campaign] [--final-sha <git-sha>] <receipt.json|campaign.json>\n");
    return 0;
  }
  if (args.paths.length !== 1) { process.stderr.write("REJECT: one receipt or campaign path is required\n"); return 1; }
  const inputPath = path.resolve(args.paths[0]);
  const parsed = readJson(inputPath);
  if (parsed.error) { process.stderr.write("REJECT: malformed JSON: " + parsed.error.message + "\n"); return 1; }
  const looksCampaign = parsed.value && parsed.value.campaign_type === "prodigy-performance-campaign";
  if (args.campaign || looksCampaign) {
    const result = validateCampaign(parsed.value, { root: path.dirname(inputPath), final_sha: args.final_sha || undefined });
    if (!result.ok) {
      result.errors.forEach((message) => process.stderr.write("REJECT: " + message + "\n"));
      return 1;
    }
    process.stdout.write("ACCEPT: valid performance campaign (" + result.samples.length + " samples)\n");
    return 0;
  }
  const result = validateReceipt(parsed.value, { final_git_sha: args.final_sha || undefined });
  if (!result.ok) {
    result.errors.forEach((message) => process.stderr.write("REJECT: " + message + "\n"));
    return 1;
  }
  process.stdout.write("ACCEPT: valid performance receipt\n");
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = Object.freeze({
  validateReceipt,
  validateCampaign,
  readJson,
  parseArgs,
  safeRelativePath,
  validManifestPath,
  main
});
