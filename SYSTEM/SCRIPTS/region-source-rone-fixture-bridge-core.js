"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const rone = require("./collectors/rone-market.js");
const geography = require("./region-geography-expansion-core.js");
const ledgerCore = require("./region-source-ledger-core.js");
const snapshotCore = require("./region-source-snapshot-core.js");

const PROVIDER_ID = "reb_rone_public_table";
const METHODOLOGY_VERSION = "rone-fixture-v1";
const DATASET_BY_KIND = Object.freeze({
  price: Object.freeze({ source_dataset_id: "reb_rone_price_index", measure: "price_index" }),
  volume: Object.freeze({ source_dataset_id: "reb_rone_transaction_volume", measure: "transaction_volume" }),
  jeonse: Object.freeze({ source_dataset_id: "reb_rone_jeonse_ratio", measure: "jeonse_ratio" })
});

function clean(value) {
  return value === undefined || value === null ? "" : String(value).normalize("NFKC").trim();
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function timestamp(value, name) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${name}은 UTC ISO timestamp이어야 합니다.`);
  }
  return text;
}

function rawPathFor(fixturePath, rawPath) {
  const selected = clean(rawPath) || `raw/reb_rone_public_table/${path.basename(fixturePath)}`;
  if (!selected.startsWith("raw/") || selected.includes("..") || selected.startsWith("/")) {
    throw new Error("R-ONE raw_path가 raw/ 경계를 벗어났습니다.");
  }
  return selected;
}

function sidoAlias(value) {
  return clean(value).replace(/특별자치도|특별시|광역시|자치시|도$/u, "");
}

function resolveRegionLabel(regionLabel, registry) {
  const tokens = clean(regionLabel).split(/\s+/u).filter(Boolean);
  const normalizedSidoTokens = new Set(tokens.map(sidoAlias));
  const candidates = registry.regions.filter((region) => (
    normalizedSidoTokens.has(sidoAlias(clean(region.region_key).split("-")[0])) && tokens.includes(region.name_current)
  ));
  if (candidates.length === 1) return { region: candidates[0], status: "resolved", reason: "sido_sigungu_tokens_exact" };
  if (candidates.length > 1) return { region: null, status: "needs_selection", reason: "sigungu_label_ambiguous" };
  return { region: null, status: "needs_selection", reason: "sido_sigungu_label_unresolved" };
}

function geographyFor(region) {
  return {
    level: "sigungu",
    code_system: region.code_system,
    sido_code: region.sido_code,
    sigungu_code: region.sigungu_code,
    name_at_release: region.name_at_release,
    name_current: region.name_current,
    effective_from: region.effective_from,
    effective_to: region.effective_to,
    mapping_status: region.mapping_status
  };
}

function validateOptions(options) {
  if (!options || typeof options !== "object") throw new Error("R-ONE bridge options가 필요합니다.");
  const kind = clean(options.kind);
  if (!Object.hasOwn(DATASET_BY_KIND, kind)) throw new Error(`R-ONE fixture kind을 알 수 없습니다: ${kind}`);
  const fixturePath = path.resolve(clean(options.fixture_path));
  if (!fixturePath || !fs.existsSync(fixturePath)) throw new Error(`R-ONE fixture를 찾을 수 없습니다: ${fixturePath}`);
  const expected = clean(options.expected_sha256);
  if (!/^[a-f0-9]{64}$/u.test(expected)) throw new Error("R-ONE fixture expected_sha256가 필요합니다.");
  return Object.freeze({
    kind,
    fixturePath,
    expectedSha256: expected,
    rawPath: rawPathFor(fixturePath, options.raw_path),
    publishedAt: timestamp(options.published_at, "published_at"),
    firstSeenAt: timestamp(options.first_seen_at, "first_seen_at"),
    collectedAt: timestamp(options.collected_at, "collected_at"),
    revisionType: clean(options.revision_type) || "initial",
    methodologyVersion: clean(options.methodology_version) || METHODOLOGY_VERSION
  });
}

function loadRoneFixture(options) {
  const normalized = validateOptions(options);
  const raw = fs.readFileSync(normalized.fixturePath);
  const actualSha256 = sha256(raw);
  if (actualSha256 !== normalized.expectedSha256) {
    throw new Error(`R-ONE fixture hash mismatch: expected ${normalized.expectedSha256}, got ${actualSha256}`);
  }
  return Object.freeze({
    options: normalized,
    rawSha256: actualSha256,
    parsed: rone.loadFixture(normalized.fixturePath, normalized.kind, normalized.expectedSha256)
  });
}

function buildRoneSnapshots(loaded, registry = geography.loadRegistry()) {
  if (!loaded || typeof loaded !== "object" || !loaded.options || !loaded.parsed) throw new Error("검증된 R-ONE fixture 결과가 필요합니다.");
  const config = DATASET_BY_KIND[loaded.options.kind];
  const snapshots = [];
  const unmatched = [];
  for (const row of loaded.parsed.rows) {
    const resolved = resolveRegionLabel(row.region_label, registry);
    if (!resolved.region) {
      unmatched.push({
        region_label: clean(row.region_label),
        status: resolved.status,
        reason: resolved.reason,
        month: row.month,
        measure: row.measure
      });
      continue;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(clean(row.month))) throw new Error("R-ONE row의 month가 YYYY-MM이 아닙니다.");
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) throw new Error("R-ONE row의 value가 유효한 숫자가 아닙니다.");
    const token = loaded.options.collectedAt.replace(/\D/gu, "").slice(0, 14);
    const snapshotId = `rone-${config.source_dataset_id}-${row.month}-${resolved.region.sigungu_code}-${loaded.rawSha256.slice(0, 12)}-${token}`;
    snapshots.push(snapshotCore.buildSnapshot({
      schema_version: 1,
      snapshot_id: snapshotId,
      provider_id: PROVIDER_ID,
      source_dataset_id: config.source_dataset_id,
      property_type: "all",
      geography: geographyFor(resolved.region),
      reference_period: row.month,
      coverage_level: "sigungu",
      missingness_code: "none",
      valid_time: `${row.month}-01`,
      published_at: loaded.options.publishedAt,
      first_seen_at: loaded.options.firstSeenAt,
      collected_at: loaded.options.collectedAt,
      revision_type: loaded.options.revisionType,
      methodology_version: loaded.options.methodologyVersion,
      raw_path: loaded.options.rawPath,
      raw_payload_hash: loaded.rawSha256,
      measures: { [config.measure]: { value: row.value, unit: clean(row.unit) || "unknown" } }
    }));
  }
  return Object.freeze({ snapshots: Object.freeze(snapshots), unmatched: Object.freeze(unmatched) });
}

function coverageFor(snapshots, unmatched, registry, sourceDatasetId) {
  const targetRegions = Array.isArray(registry && registry.regions) ? registry.regions : [];
  const matchedKeys = new Set((Array.isArray(snapshots) ? snapshots : []).map((snapshot) => {
    const geographyIdentity = snapshot && snapshot.geography ? snapshot.geography : {};
    return `${clean(geographyIdentity.sido_code)}:${clean(geographyIdentity.sigungu_code)}`;
  }).filter((key) => key !== ":"));
  const targetByCode = new Map(targetRegions.map((region) => [`${clean(region.sido_code)}:${clean(region.sigungu_code)}`, region]));
  const missingRegionKeys = [...targetByCode.entries()]
    .filter(([code]) => !matchedKeys.has(code))
    .map(([, region]) => clean(region.region_key))
    .filter(Boolean);
  const matchedRegionCount = targetByCode.size - missingRegionKeys.length;
  return Object.freeze({
    source_dataset_id: clean(sourceDatasetId),
    target_region_count: targetByCode.size,
    matched_region_count: matchedRegionCount,
    coverage_ratio: targetByCode.size === 0 ? 0 : matchedRegionCount / targetByCode.size,
    missing_region_keys: Object.freeze(missingRegionKeys),
    unmatched_row_count: Array.isArray(unmatched) ? unmatched.length : 0,
    complete: targetByCode.size > 0 && matchedRegionCount === targetByCode.size && (!Array.isArray(unmatched) || unmatched.length === 0)
  });
}

function appendRoneFixtureSnapshots(ledgerState, options, registry) {
  const selectedRegistry = registry || geography.loadRegistry();
  const loaded = loadRoneFixture(options);
  const built = buildRoneSnapshots(loaded, selectedRegistry);
  let ledger = ledgerState;
  for (const snapshot of built.snapshots) ledger = ledgerCore.appendSnapshot(ledger, snapshot);
  return Object.freeze({
    ledger,
    provider_id: PROVIDER_ID,
    source_dataset_id: DATASET_BY_KIND[loaded.options.kind].source_dataset_id,
    raw_sha256: loaded.rawSha256,
    parsed_rows: loaded.parsed.rows.length,
    snapshots: built.snapshots,
    unmatched: built.unmatched,
    coverage: coverageFor(built.snapshots, built.unmatched, selectedRegistry, DATASET_BY_KIND[loaded.options.kind].source_dataset_id),
    network_dispatched: loaded.parsed.network_dispatched,
    request_count: loaded.parsed.request_count
  });
}

module.exports = Object.freeze({
  DATASET_BY_KIND,
  METHODOLOGY_VERSION,
  PROVIDER_ID,
  appendRoneFixtureSnapshots,
  buildRoneSnapshots,
  coverageFor,
  geographyFor,
  loadRoneFixture,
  resolveRegionLabel,
  sha256,
  validateOptions
});
