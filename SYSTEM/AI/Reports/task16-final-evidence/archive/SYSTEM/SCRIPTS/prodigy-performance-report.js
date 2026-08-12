#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const validator = require("./prodigy-performance-receipt-validator.js");

function finite(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }

function nearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[rank - 1];
}

function median(values) { return nearestRank(values, 0.5); }

function stats(values) {
  const samples = (Array.isArray(values) ? values : []).filter(finite).sort((a, b) => a - b);
  if (samples.length === 0) return {
    count: 0,
    p50_ms: null,
    p95_ms: null,
    max_ms: null,
    median_ms: null,
    mad_ms: null,
    iqr_ms: null,
    p50: null,
    p95: null,
    max: null,
    mad: null,
    iqr: null,
    values_ms: []
  };
  const med = nearestRank(samples, 0.5);
  const deviations = samples.map((value) => Math.abs(value - med));
  const q1 = nearestRank(samples, 0.25);
  const q3 = nearestRank(samples, 0.75);
  return {
    count: samples.length,
    p50_ms: nearestRank(samples, 0.5),
    p95_ms: nearestRank(samples, 0.95),
    max_ms: samples[samples.length - 1],
    median_ms: med,
    mad_ms: nearestRank(deviations, 0.5),
    iqr_ms: q3 - q1,
    p50: nearestRank(samples, 0.5),
    p95: nearestRank(samples, 0.95),
    max: samples[samples.length - 1],
    mad: nearestRank(deviations, 0.5),
    iqr: q3 - q1,
    values_ms: samples
  };
}

function durationForReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return null;
  const candidates = [
    receipt.product_duration_ms,
    receipt.duration_ms,
    receipt.durations && receipt.durations.product_ms,
    receipt.durations && receipt.durations.total_ms
  ];
  for (const value of candidates) if (finite(value)) return value;
  if (Array.isArray(receipt.marks)) {
    const ready = receipt.marks.find((mark) => mark && mark.phase === "primary_action_ready" && finite(mark.at_ms));
    if (ready) return ready.at_ms;
  }
  return null;
}

function externalDurationForReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return null;
  const attribution = receipt.attribution || {};
  const candidates = [
    attribution.external_start_duration_ms,
    receipt.external_start_duration_ms,
    receipt.durations && receipt.durations.external_start_ms
  ];
  for (const value of candidates) if (finite(value)) return value;
  return null;
}

function attributionClass(receipt, duration) {
  if (!receipt || receipt.mode === "uninstrumented") return "not-measured";
  const attribution = receipt.attribution || {};
  if (attribution.icloud_status === "pending" || attribution.external_start_status === "pending") return "icloud-pending";
  if (attribution.external_start_status === "dominated") return "external-start-dominated";
  const external = externalDurationForReceipt(receipt);
  if (finite(external) && finite(duration) && external > duration) return "external-start-dominated";
  if (!finite(duration) || attribution.product_status === "not_measured") return "not-measured";
  return "product-measured";
}

function emptyClassCounts() {
  return { "external-start-dominated": 0, "icloud-pending": 0, "not-measured": 0, "product-measured": 0 };
}

function summarize(rows, values) {
  const eligible = values.filter(finite);
  const failedValues = rows.filter((row) => row.failed && finite(row.duration_ms)).map((row) => row.duration_ms);
  const missingValues = rows.filter((row) => row.missing && finite(row.duration_ms)).map((row) => row.duration_ms);
  const classCounts = emptyClassCounts();
  rows.forEach((row) => { if (classCounts[row.attribution_class] !== undefined) classCounts[row.attribution_class] += 1; });
  return {
    sample_count: rows.length,
    eligible_sample_count: eligible.length,
    failure_count: rows.filter((row) => row.failed).length,
    missing_mark_count: rows.filter((row) => row.missing).length,
    discarded_sample_count: rows.filter((row) => row.discarded).length,
    invalid_sample_count: rows.filter((row) => row.invalid).length,
    attribution_counts: classCounts,
    statistics: stats(eligible),
    failed_statistics: stats(failedValues),
    missing_mark_statistics: stats(missingValues)
  };
}

function manifestConsistency(rows, manifest) {
  const errors = [];
  const seen = new Map();
  ["source_sha256", "settings_sha256", "configuration_sha256", "final_git_sha"].forEach((field) => {
    const values = new Set();
    rows.forEach((row) => {
      if (row.receipt && row.receipt[field] !== undefined) values.add(row.receipt[field]);
    });
    if (values.size > 1) errors.push("mixed " + field + " across samples");
    seen.set(field, Array.from(values)[0] || null);
    if (manifest && manifest[field] !== undefined && values.size > 0 && (values.size !== 1 || Array.from(values)[0] !== manifest[field])) errors.push("sample " + field + " does not match campaign");
  });
  return { errors, values: Object.fromEntries(seen) };
}

function buildReport(campaignResult, options) {
  const result = campaignResult;
  const manifest = result.manifest || {};
  const rows = (result.samples || []).map((sample) => {
    const receipt = sample.receipt;
    const duration = durationForReceipt(receipt);
    const invalid = sample.valid !== true;
    const failed = !!(receipt && Array.isArray(receipt.failures) && receipt.failures.length > 0) || !!(receipt && receipt.attribution && receipt.attribution.product_status === "failed");
    const missing = !!(receipt && Array.isArray(receipt.missing_marks) && receipt.missing_marks.length > 0);
    const discarded = invalid || sample.discarded === true;
    return {
      invalid,
      sample_id: sample.sample_id,
      receipt_path: sample.receipt_path,
      cold_warm: receipt && receipt.cold_warm ? receipt.cold_warm : null,
      valid: !invalid,
      failed,
      missing,
      discarded,
      duration_ms: duration,
      attribution_class: attributionClass(receipt, duration),
      errors: Array.isArray(sample.errors) ? sample.errors.slice() : []
    };
  });
  const consistency = manifestConsistency(result.samples || [], manifest);
  const eligibleValues = rows.filter((row) => row.valid && !row.failed && !row.missing && !row.discarded && finite(row.duration_ms)).map((row) => row.duration_ms);
  const allValues = rows.filter((row) => finite(row.duration_ms)).map((row) => row.duration_ms);
  const coldRows = rows.filter((row) => row.cold_warm === "cold");
  const warmRows = rows.filter((row) => row.cold_warm === "warm");
  const finalSha = options.final_sha || null;
  const finalShaCheck = {
    requested: !!finalSha,
    expected: finalSha,
    manifest: manifest.final_git_sha || null,
    passed: finalSha ? manifest.final_git_sha === finalSha && consistency.values.final_git_sha === finalSha && consistency.errors.every((message) => !message.includes("final_git_sha")) : null
  };
  if (finalSha && !finalShaCheck.passed) consistency.errors.push("explicit final SHA check failed");
  return {
    schema_version: 1,
    report_type: "prodigy-performance-report",
    campaign_id: manifest.campaign_id || null,
    campaign_stage: manifest.campaign_stage || "exploratory",
    sample_gate: result.sample_gate || {
      stage: manifest.campaign_stage || "exploratory",
      minimum_valid_cold: manifest.campaign_stage === "final" ? 20 : 0,
      minimum_valid_warm: manifest.campaign_stage === "final" ? 20 : 0,
      valid_cold: 0,
      valid_warm: 0,
      passed: false
    },
    source_sha256: manifest.source_sha256 || null,
    settings_sha256: manifest.settings_sha256 || null,
    configuration_sha256: manifest.configuration_sha256 || null,
    final_git_sha: manifest.final_git_sha || null,
    final_sha_check: finalShaCheck,
    campaign_valid: result.ok && consistency.errors.length === 0 && (!finalSha || finalShaCheck.passed),
    validation_errors: result.errors.concat(consistency.errors),
    attribution: {
      external_start_dominated: rows.filter((row) => row.attribution_class === "external-start-dominated").length,
      icloud_pending: rows.filter((row) => row.attribution_class === "icloud-pending").length,
      not_measured: rows.filter((row) => row.attribution_class === "not-measured").length,
      product_measured: rows.filter((row) => row.attribution_class === "product-measured").length
    },
    totals: summarize(rows, eligibleValues),
    all_sample_statistics: stats(allValues),
    by_cold_warm: {
      cold: summarize(coldRows, coldRows.filter((row) => row.valid && !row.failed && !row.missing && !row.discarded && finite(row.duration_ms)).map((row) => row.duration_ms)),
      warm: summarize(warmRows, warmRows.filter((row) => row.valid && !row.failed && !row.missing && !row.discarded && finite(row.duration_ms)).map((row) => row.duration_ms))
    },
    samples: rows
  };
}

function parseArgs(argv) {
  const args = { manifest: null, final_sha: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") args.help = true;
    else if (value === "--manifest") args.manifest = argv[++index];
    else if (value === "--final-sha" || value === "--final-git-sha") args.final_sha = argv[++index];
    else if (value === "--output") args.output = argv[++index];
    else if (value.startsWith("--")) throw new Error("unknown option: " + value);
    else if (!args.manifest) args.manifest = value;
    else throw new Error("only one campaign manifest is accepted");
  }
  return args;
}

function main(argv) {
  let args;
  try { args = parseArgs(argv); } catch (cause) { process.stderr.write("REJECT: " + cause.message + "\n"); return 1; }
  if (args.help) {
    process.stdout.write("Usage: node SYSTEM/SCRIPTS/prodigy-performance-report.js [--final-sha <git-sha>] [--output <report.json>] <campaign-manifest.json>\n");
    return 0;
  }
  if (!args.manifest) { process.stderr.write("REJECT: durable campaign manifest is required\n"); return 1; }
  const manifestPath = path.resolve(args.manifest);
  const parsed = validator.readJson(manifestPath);
  if (parsed.error) { process.stderr.write("REJECT: malformed campaign JSON: " + parsed.error.message + "\n"); return 1; }
  if (!parsed.value || parsed.value.campaign_type !== "prodigy-performance-campaign") { process.stderr.write("REJECT: input is not a performance campaign manifest\n"); return 1; }
  const campaign = validator.validateCampaign(parsed.value, { root: path.dirname(manifestPath), final_sha: args.final_sha || undefined });
  const report = buildReport(campaign, args);
  const text = JSON.stringify(report, null, 2) + "\n";
  if (args.output) {
    const outputPath = path.resolve(args.output);
    const relative = path.relative(process.cwd(), outputPath);
    if (!relative || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      process.stderr.write("REJECT: report output must remain under the current working directory\n");
      return 1;
    }
    fs.writeFileSync(outputPath, text, "utf8");
  } else process.stdout.write(text);
  return report.campaign_valid ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = Object.freeze({
  nearestRank,
  median,
  stats,
  durationForReceipt,
  attributionClass,
  manifestConsistency,
  buildReport,
  parseArgs,
  main
});
