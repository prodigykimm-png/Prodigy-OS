"use strict";

const LEDGER_ROOT = "SYSTEM/CACHE/region-source-ledger";
const SNAPSHOT_FILE = "snapshot.json";

function text(value) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePath(value) {
  return text(value).replace(/\\/gu, "/").normalize("NFC");
}

function snapshotApi() {
  if (globalThis.RegionSourceSnapshotCore && typeof globalThis.RegionSourceSnapshotCore.validateSnapshot === "function") return globalThis.RegionSourceSnapshotCore;
  if (typeof require === "function") return require("./region-source-snapshot-core.js");
  throw new Error("Region source snapshot contract를 먼저 불러와야 합니다.");
}

function rawBytes(value) {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new Error("원문 payload는 문자열 또는 바이트여야 합니다.");
}

async function sha256(value) {
  const bytes = rawBytes(value);
  if (typeof require === "function") {
    try {
      const crypto = require("node:crypto");
      return crypto.createHash("sha256").update(bytes).digest("hex");
    } catch (_error) { }
  }
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("SHA-256 구현을 사용할 수 없습니다.");
}

function rawPath(snapshotPath, relativePath) {
  const directory = normalizePath(snapshotPath).replace(/\/snapshot\.json$/u, "");
  const candidate = normalizePath(`${directory}/${relativePath}`);
  if (!candidate.startsWith(`${directory}/raw/`) || candidate.includes("/../") || candidate.endsWith("/..")) throw new Error("원문 경로가 snapshot 디렉터리 밖을 가리킵니다.");
  return candidate;
}

function parseSnapshotEntries(entries) {
  const records = [];
  const errors = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const snapshotPath = normalizePath(entry && entry.path);
    if (!snapshotPath.startsWith(`${LEDGER_ROOT}/`) || !snapshotPath.endsWith(`/${SNAPSHOT_FILE}`)) continue;
    try {
      const snapshot = JSON.parse(typeof entry.body === "string" ? entry.body : String(entry.body || ""));
      snapshotApi().validateSnapshot(snapshot);
      records.push({ snapshot, snapshot_path: snapshotPath, raw_path: rawPath(snapshotPath, snapshot.raw_path) });
    } catch (error) {
      errors.push({ code: "invalid_snapshot", path: snapshotPath || null, message: error && error.message ? error.message : "원문 snapshot을 읽지 못했습니다." });
    }
  }
  return { records, errors };
}

function projectionKey(record) {
  const snapshot = record.snapshot;
  const geography = snapshot.geography || {};
  const geographyCode = geography.sigungu_code || geography.sido_code || "national";
  return `${snapshot.source_dataset_id}|${geographyCode}|${snapshot.property_type}|${snapshot.reference_period}`;
}

function selectCurrentRecords(records) {
  const current = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const key = projectionKey(record);
    const existing = current.get(key);
    if (!existing || record.snapshot.collected_at > existing.snapshot.collected_at || (record.snapshot.collected_at === existing.snapshot.collected_at && record.snapshot.snapshot_id > existing.snapshot.snapshot_id)) current.set(key, record);
  }
  return [...current.values()].sort((left, right) => projectionKey(left).localeCompare(projectionKey(right)));
}

function providerReady(matrix, providerId) {
  const providers = Array.isArray(matrix && matrix.providers) ? matrix.providers : [];
  const provider = providers.find((item) => item && item.provider_id === providerId);
  return Boolean(provider && provider.projection_ready === true);
}

function regionKeyFor(snapshot, regionRegistry) {
  const geography = snapshot.geography || {};
  const sidoCode = text(geography.sido_code);
  const sigunguCode = text(geography.sigungu_code);
  const region = (Array.isArray(regionRegistry) ? regionRegistry : []).find((item) => {
    const lawdCode = text(item && item.lawd_code);
    const householdCode = text(item && item.household_code);
    const itemSidoCode = text(item && item.sido_code) || lawdCode.slice(0, 2) || householdCode.slice(0, 2);
    const itemSigunguCode = text(item && item.sigungu_code) || lawdCode.slice(0, 5) || householdCode.slice(0, 5);
    return itemSidoCode === sidoCode && itemSigunguCode === sigunguCode;
  });
  return region ? text(region.region_key) : "";
}

function evidenceFor(record, regionRegistry) {
  const snapshot = record.snapshot;
  const measures = Object.entries(snapshot.measures || {}).filter(([, item]) => item && item.value !== null);
  return {
    status: snapshot.missingness_code === "none" ? "verified" : "not_available",
    provider_id: snapshot.provider_id,
    source_dataset_id: snapshot.source_dataset_id,
    region_key: regionKeyFor(snapshot, regionRegistry) || null,
    reference_period: snapshot.reference_period,
    valid_time: snapshot.valid_time,
    published_at: snapshot.published_at,
    collected_at: snapshot.collected_at,
    coverage_level: snapshot.coverage_level,
    missingness_code: snapshot.missingness_code,
    measure_count: measures.length,
    raw_payload_hash: snapshot.raw_payload_hash,
    raw_path: record.raw_path
  };
}

async function buildReadModel(options = {}) {
  const records = selectCurrentRecords(options.records);
  const rawEntries = new Map((Array.isArray(options.raw_entries) ? options.raw_entries : []).map((entry) => [normalizePath(entry && entry.path), entry && entry.body]));
  const errors = [...(Array.isArray(options.errors) ? options.errors : [])];
  const verified = [];
  for (const record of records) {
    const raw = rawEntries.get(record.raw_path);
    if (raw === undefined) {
      errors.push({ code: "missing_raw_payload", path: record.raw_path, message: "snapshot이 가리키는 원문 payload가 없습니다." });
      continue;
    }
    try {
      const actualHash = await sha256(raw);
      if (actualHash !== record.snapshot.raw_payload_hash) {
        errors.push({ code: "raw_hash_mismatch", path: record.raw_path, message: "원문 payload SHA-256이 snapshot과 일치하지 않습니다." });
        continue;
      }
      verified.push(record);
    } catch (error) {
      errors.push({ code: "raw_hash_unavailable", path: record.raw_path, message: error && error.message ? error.message : "원문 payload 해시를 확인하지 못했습니다." });
    }
  }

  const ready = verified.filter((record) => providerReady(options.support_matrix, record.snapshot.provider_id));
  const blocked = verified.filter((record) => !providerReady(options.support_matrix, record.snapshot.provider_id));
  const evidenceByRegion = {};
  for (const record of ready) {
    const evidence = evidenceFor(record, options.region_registry);
    if (!evidence.region_key) {
      errors.push({ code: "unmatched_region", path: record.snapshot.snapshot_id, message: "원문 snapshot의 시군구 코드가 Region registry와 매칭되지 않습니다." });
      continue;
    }
    if (!Array.isArray(evidenceByRegion[evidence.region_key])) evidenceByRegion[evidence.region_key] = [];
    evidenceByRegion[evidence.region_key].push(evidence);
  }
  for (const values of Object.values(evidenceByRegion)) values.sort((left, right) => right.collected_at.localeCompare(left.collected_at));

  const latest = ready.map((record) => record.snapshot).sort((left, right) => right.collected_at.localeCompare(left.collected_at))[0] || null;
  const status = records.length === 0 ? "empty" : ready.length > 0 ? "ready" : "blocked";
  return clone({
    schema_version: 1,
    status,
    snapshot_count: records.length,
    verified_count: verified.length,
    ready_count: ready.length,
    blocked_count: blocked.length,
    invalid_count: errors.length,
    covered_region_count: Object.keys(evidenceByRegion).length,
    latest_reference_period: latest ? latest.reference_period : null,
    latest_collected_at: latest ? latest.collected_at : null,
    evidence_by_region: evidenceByRegion,
    errors
  });
}

async function loadFromVault(options = {}) {
  const vault = options.vault;
  if (!vault || typeof vault.getFiles !== "function" || typeof vault.read !== "function") return buildReadModel({ support_matrix: options.support_matrix, region_registry: options.region_registry, errors: [{ code: "vault_unavailable", path: null, message: "Vault 파일을 읽을 수 없어 공식 원문 상태를 표시하지 못했습니다." }] });
  const files = vault.getFiles().filter((file) => normalizePath(file && file.path).startsWith(`${LEDGER_ROOT}/`));
  const snapshotFiles = files.filter((file) => normalizePath(file && file.path).endsWith(`/${SNAPSHOT_FILE}`));
  const snapshotEntries = await Promise.all(snapshotFiles.map(async (file) => ({ path: file.path, body: await vault.read(file) })));
  const parsed = parseSnapshotEntries(snapshotEntries);
  const current = selectCurrentRecords(parsed.records);
  const rawFiles = new Map(files.map((file) => [normalizePath(file.path), file]));
  const rawEntries = [];
  for (const record of current) {
    const file = rawFiles.get(record.raw_path);
    if (!file) continue;
    const body = typeof vault.readBinary === "function" ? await vault.readBinary(file) : await vault.read(file);
    rawEntries.push({ path: record.raw_path, body });
  }
  return buildReadModel({ records: current, raw_entries: rawEntries, errors: parsed.errors, support_matrix: options.support_matrix, region_registry: options.region_registry });
}

module.exports = Object.freeze({
  LEDGER_ROOT,
  SNAPSHOT_FILE,
  buildReadModel,
  evidenceFor,
  loadFromVault,
  normalizePath,
  parseSnapshotEntries,
  rawPath,
  selectCurrentRecords,
  sha256
});
