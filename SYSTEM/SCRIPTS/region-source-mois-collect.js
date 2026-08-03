#!/usr/bin/env node
"use strict";

const path = require("node:path");

const live = require("./region-source-mois-live-core.js");
const writer = require("./region-source-ledger-writer-core.js");
const pilotGeography = require("./region-geography-registry-core.js");
const expansionGeography = require("./region-geography-expansion-core.js");

const DEFAULT_LEDGER_ROOT = path.resolve(process.cwd(), "SYSTEM/CACHE/region-source-ledger");

function parseArgs(argv) {
  const result = { ledger_root: DEFAULT_LEDGER_ROOT, registry: "expansion", allow_network: false, dry_run: false };
  const valueFlags = new Set(["period", "published-at", "first-seen-at", "collected-at", "ledger-root", "registry"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return Object.freeze({ help: true });
    if (arg === "--allow-network") { result.allow_network = true; continue; }
    if (arg === "--dry-run") { result.dry_run = true; continue; }
    if (!arg.startsWith("--")) throw new Error(`알 수 없는 인자: ${arg}`);
    const key = arg.slice(2);
    if (!valueFlags.has(key)) throw new Error(`알 수 없는 옵션: --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`옵션 값이 필요합니다: --${key}`);
    index += 1;
    result[key.replaceAll("-", "_")] = value;
  }
  if (!result.period) throw new Error("--period YYYY-MM이 필요합니다.");
  if (!result.published_at) throw new Error("--published-at UTC ISO timestamp가 필요합니다.");
  if (!["pilot", "expansion"].includes(result.registry)) throw new Error("--registry는 pilot 또는 expansion이어야 합니다.");
  return Object.freeze(result);
}

function selectedRegistry(name) {
  return name === "pilot" ? pilotGeography.loadRegistry() : expansionGeography.loadRegistry();
}

function nowIso() {
  return new Date().toISOString();
}

function summarize(options, result, persistence) {
  return {
    provider_id: live.PROVIDER_ID,
    period: options.period,
    registry: options.registry,
    status: result.status,
    network_dispatched: result.network_dispatched,
    request_count: result.request_count,
    http_status: result.http_status || 0,
    raw_payload_hash: result.raw_payload_hash,
    parsed_rows: result.parser_result?.rows?.length || 0,
    snapshot_count: result.snapshots?.length || 0,
    persistence_status: persistence.status,
    written_count: persistence.written_count || 0,
    existing_count: persistence.existing_count || 0,
    error: result.error
  };
}

async function run(options, dependencies = {}) {
  const collect = dependencies.collect || live.collectMoisOfficial;
  const persist = dependencies.persist || writer.persistCollectedResult;
  const collectedAt = options.collected_at || nowIso();
  const firstSeenAt = options.first_seen_at || collectedAt;
  const result = await collect({
    period: options.period,
    allow_network: options.allow_network === true,
    published_at: options.published_at,
    first_seen_at: firstSeenAt,
    collected_at: collectedAt,
    geography_registry: selectedRegistry(options.registry),
    timeout_ms: options.timeout_ms,
    ledger_root: options.ledger_root
  });
  let persistence = { status: "not_persisted", written_count: 0, existing_count: 0 };
  if (result.status === "collected" && options.dry_run !== true) persistence = persist(options.ledger_root, result);
  const summary = summarize(options, result, persistence);
  return Object.freeze({ exit_code: result.status === "collected" ? 0 : 2, summary, result, persistence });
}

function usage() {
  return [
    "사용법: node SYSTEM/SCRIPTS/region-source-mois-collect.js --period YYYY-MM --published-at UTC_ISO [옵션]",
    "옵션: --allow-network --dry-run --registry pilot|expansion --first-seen-at UTC_ISO --collected-at UTC_ISO --ledger-root PATH"
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return 0; }
  const result = await run(options);
  console.log(JSON.stringify(result.summary));
  return result.exit_code;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(JSON.stringify({ status: "argument_or_runtime_error", error: String(error.message || error) }));
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ DEFAULT_LEDGER_ROOT, main, parseArgs, run, selectedRegistry, summarize, usage });
