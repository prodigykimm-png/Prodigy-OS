"use strict";

const root = typeof window !== "undefined" ? window : globalThis;
const collectionHealthCore = root.RegionCollectionHealthCore || (typeof require === "function" ? require("./region-collection-health-core.js") : null);
const REGION_ROOT = "PARA/RESOURCES/Auction Regions";

function nodeRuntime() {
  if (typeof require !== "function") return null;
  try {
    return { fs: require("node:fs"), path: require("node:path") };
  } catch (_error) {
    return null;
  }
}

function regionPath(regionKey, normalization) {
  return `${REGION_ROOT}/${regionKey}.md`.normalize(normalization);
}

function readRegionFromDisk(vaultRoot, regionKey) {
  const node = nodeRuntime();
  if (!node) return { ok: false, error: "데스크톱 파일 시스템을 사용할 수 없습니다." };
  const { fs, path } = node;
  const candidates = ["NFC", "NFD"].map((form) => path.join(vaultRoot, regionPath(regionKey, form)));
  const targetPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!targetPath) return { ok: false, error: `Region Object를 찾을 수 없습니다: ${regionKey}` };
  try {
    return { ok: true, content: fs.readFileSync(targetPath, "utf8") };
  } catch (error) {
    return { ok: false, error: `Region Object 읽기 실패: ${error.message}` };
  }
}

function findRegionFile(vault, regionKey) {
  if (!vault || typeof vault.getAbstractFileByPath !== "function") return null;
  for (const form of ["NFC", "NFD"]) {
    const file = vault.getAbstractFileByPath(regionPath(regionKey, form));
    if (file) return file;
  }
  if (typeof vault.getFiles !== "function") return null;
  const expected = regionPath(regionKey, "NFC");
  return vault.getFiles().find((file) => String(file && file.path || "").normalize("NFC") === expected) || null;
}

async function readRegionFromApp(app, regionKey) {
  const vault = app && app.vault;
  if (!vault || typeof vault.read !== "function") {
    return { ok: false, error: "Obsidian Vault를 읽을 수 없습니다." };
  }
  const file = findRegionFile(vault, regionKey);
  if (!file) return { ok: false, error: `Region Object를 찾을 수 없습니다: ${regionKey}` };
  try {
    return { ok: true, content: await vault.read(file) };
  } catch (error) {
    return { ok: false, error: `Region Object 읽기 실패: ${error.message}` };
  }
}

function readJsonFile(fs, filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadExpectedRegionKeys(fs, path, vaultRoot) {
  const scriptsDir = path.join(vaultRoot, "SYSTEM/SCRIPTS");
  const index = readJsonFile(fs, path.join(scriptsDir, "region-metrics-manifest-index.json"));
  if (!index || !Array.isArray(index.manifests)) throw new Error("지역 매니페스트 인덱스를 읽을 수 없습니다.");
  return index.manifests.flatMap((entry) => {
    if (!entry || typeof entry.manifest_path !== "string") return [];
    const manifest = readJsonFile(fs, path.join(scriptsDir, entry.manifest_path));
    return Array.isArray(manifest.regions) ? manifest.regions.map((region) => region.region_key) : [];
  });
}

function loadMetricSnapshots(fs, path, vaultRoot) {
  const metricsRoot = path.join(vaultRoot, "SYSTEM/CACHE/region-metrics");
  if (!fs.existsSync(metricsRoot)) return [];
  return fs.readdirSync(metricsRoot, { withFileTypes: true }).flatMap((regionEntry) => {
    if (!regionEntry.isDirectory() || regionEntry.name.startsWith("_")) return [];
    const regionDir = path.join(metricsRoot, regionEntry.name);
    return fs.readdirSync(regionDir, { withFileTypes: true }).flatMap((snapshotEntry) => {
      if (!snapshotEntry.isDirectory()) return [];
      const snapshotPath = path.join(regionDir, snapshotEntry.name, "snapshot.json");
      if (!fs.existsSync(snapshotPath)) return [];
      try {
        const snapshot = readJsonFile(fs, snapshotPath);
        return [{
          region_key: snapshot.region_key,
          metrics_as_of: snapshot.metrics_as_of,
          fetched_at: snapshot.fetched_at
        }];
      } catch (_error) {
        return [];
      }
    });
  });
}

function unavailableHealth(error) {
  return Object.freeze({
    status: "unavailable",
    expected_count: 0,
    covered_count: 0,
    coverage_percent: 0,
    snapshot_count: 0,
    fresh_count: 0,
    aging_count: 0,
    stale_count: 0,
    unavailable_count: 0,
    missing_region_keys: Object.freeze([]),
    stale_region_keys: Object.freeze([]),
    unknown_region_keys: Object.freeze([]),
    duplicate_months: Object.freeze([]),
    selected_region: null,
    diagnostic: error && error.message ? error.message : "수집 상태를 읽지 못했습니다."
  });
}

function loadCollectionHealth(vaultRoot, regionKey, now) {
  const node = nodeRuntime();
  if (!node || !collectionHealthCore || !vaultRoot) return null;
  const { fs, path } = node;
  try {
    return collectionHealthCore.analyzeCollectionHealth({
      expectedRegionKeys: loadExpectedRegionKeys(fs, path, vaultRoot),
      snapshots: loadMetricSnapshots(fs, path, vaultRoot),
      selectedRegionKey: regionKey,
      now: now || new Date()
    });
  } catch (error) {
    return unavailableHealth(error);
  }
}

const api = Object.freeze({
  isNodeAvailable: Boolean(nodeRuntime()),
  readRegionFromDisk,
  readRegionFromApp,
  loadCollectionHealth
});

root.RegionIntelligencePopupStore = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
