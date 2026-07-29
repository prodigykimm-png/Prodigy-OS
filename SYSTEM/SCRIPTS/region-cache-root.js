"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const LEGACY_METRICS_REL = "SYSTEM/CACHE/region-metrics";

function isICloudHosted(vaultRoot) {
  return typeof vaultRoot === "string" && vaultRoot.includes("Mobile Documents");
}

function resolveVaultRoot(options) {
  return path.resolve(options?.vaultRoot || process.cwd());
}

function resolveMetricsRoot(options) {
  const vaultRoot = resolveVaultRoot(options);
  return path.join(vaultRoot, LEGACY_METRICS_REL);
}

function resolveRawRoot(options) {
  const vaultRoot = resolveVaultRoot(options);
  const envRoot = process.env.PRODIGY_CACHE_ROOT;

  if (envRoot !== undefined && envRoot !== "") {
    if (!path.isAbsolute(envRoot)) {
      throw new Error(`PRODIGY_CACHE_ROOT는 절대 경로여야 합니다: ${envRoot}`);
    }
    return path.join(envRoot, "region-metrics-raw");
  }

  if (isICloudHosted(vaultRoot)) {
    return path.join(os.homedir(), "ProdigyCache", "region-metrics-raw");
  }
  return path.join(vaultRoot, LEGACY_METRICS_REL);
}

function resolveRawDir(options) {
  const regionKey = options?.regionKey;
  const snapshotId = options?.snapshotId;
  if (typeof regionKey !== "string" || regionKey.length === 0) {
    throw new Error("regionKey가 없습니다.");
  }
  if (typeof snapshotId !== "string" || snapshotId.length === 0) {
    throw new Error("snapshotId가 없습니다.");
  }
  return path.join(resolveRawRoot(options), regionKey, snapshotId, "raw");
}

function ensureMetricsRootDir(options) {
  const metricsRoot = resolveMetricsRoot(options);
  fs.mkdirSync(metricsRoot, { recursive: true });
  return metricsRoot;
}

function ensureRawDir(options) {
  const rawDir = resolveRawDir(options);
  fs.mkdirSync(rawDir, { recursive: true });
  return rawDir;
}

module.exports = Object.freeze({
  LEGACY_METRICS_REL,
  ensureMetricsRootDir,
  ensureRawDir,
  isICloudHosted,
  resolveMetricsRoot,
  resolveRawRoot,
  resolveRawDir
});
