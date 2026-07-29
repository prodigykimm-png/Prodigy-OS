"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const cacheRoot = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-cache-root.js"));
const core = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-core.js"));
const refresh = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-metrics-refresh.js"));

function makeVault(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root };
}

function makeICloudVault() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-cache-root-"));
  const root = path.join(base, "Mobile Documents", "iCloud~md~obsidian", "Documents", "Dusk");
  fs.mkdirSync(root, { recursive: true });
  return { root };
}

function withEnv(key, value, fn) {
  const hadKey = Object.prototype.hasOwnProperty.call(process.env, key);
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (hadKey) process.env[key] = previous;
    else delete process.env[key];
  }
}

function expectedRawDir(vaultRoot, regionKey, snapshotId) {
  return cacheRoot.resolveRawDir({ vaultRoot, regionKey, snapshotId });
}

test("Given a non-iCloud vault with no cache override, When the metrics root is resolved, Then the legacy in-vault path is preserved", () => {
  const vault = makeVault("prodigy-cache-root-legacy-");

  assert.equal(cacheRoot.isICloudHosted(vault.root), false);
  assert.equal(
    cacheRoot.resolveMetricsRoot({ vaultRoot: vault.root }),
    path.join(vault.root, cacheRoot.LEGACY_METRICS_REL)
  );
  assert.equal(
    cacheRoot.resolveRawRoot({ vaultRoot: vault.root }),
    path.join(vault.root, cacheRoot.LEGACY_METRICS_REL)
  );
  assert.equal(
    cacheRoot.resolveRawDir({ vaultRoot: vault.root, regionKey: "부산광역시-금정구", snapshotId: "2026-07-01_20260701T000000Z" }),
    path.join(vault.root, cacheRoot.LEGACY_METRICS_REL, "부산광역시-금정구", "2026-07-01_20260701T000000Z", "raw")
  );
});

test("Given a custom output outside the vault, When writeArtifacts runs, Then raw payloads still anchor to the vault and metadata stays under output", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-cache-root-output-"));
  const regionKey = "부산광역시-금정구";
  const snapshotId = "2026-07-01_20260701T000000Z";
  const rawFiles = {
    "alpha.txt": Buffer.from("alpha", "utf8"),
    "beta.json": Buffer.from("{\"ok\":true}", "utf8")
  };
  const snapshot = { schema_version: 1, snapshot_id: snapshotId, region_key: regionKey };
  const snapshotDir = refresh.writeArtifacts(
    { output, "region-key": regionKey },
    snapshotId,
    rawFiles,
    snapshot
  );
  const rawDir = expectedRawDir(ROOT, regionKey, snapshotId);

  assert.equal(snapshotDir, path.join(output, regionKey, snapshotId));
  assert.equal(fs.readFileSync(path.join(snapshotDir, "snapshot.json"), "utf8"), `${JSON.stringify(snapshot, null, 2)}\n`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snapshotDir, "hashes.json"), "utf8")), {
    "alpha.txt": core.sha256(rawFiles["alpha.txt"]),
    "beta.json": core.sha256(rawFiles["beta.json"])
  });
  assert.equal(fs.readFileSync(path.join(rawDir, "alpha.txt"), "utf8"), "alpha");
  assert.equal(fs.readFileSync(path.join(rawDir, "beta.json"), "utf8"), "{\"ok\":true}");
  assert.ok(fs.existsSync(path.join(snapshotDir, "hashes.json")));
  assert.ok(fs.existsSync(path.join(snapshotDir, "snapshot.json")));
  assert.ok(fs.existsSync(rawDir));
  assert.ok(!rawDir.startsWith(path.resolve(output)));
  assert.ok(!rawDir.startsWith(path.sep + "SYSTEM"));
});

test("Given a deeper output path under the vault, When writeArtifacts runs, Then the raw root stays fixed instead of shifting with output depth", () => {
  const output = path.join(ROOT, "SYSTEM", "CACHE", "region-metrics", "sub", "deeper");
  const regionKey = "부산광역시-금정구";
  const snapshotId = "2026-07-01_20260701T000000Z";
  const rawFiles = {
    "alpha.txt": Buffer.from("alpha", "utf8")
  };
  const snapshot = { schema_version: 1, snapshot_id: snapshotId, region_key: regionKey };
  const snapshotDir = refresh.writeArtifacts(
    { output, "region-key": regionKey },
    snapshotId,
    rawFiles,
    snapshot
  );
  const rawDir = expectedRawDir(ROOT, regionKey, snapshotId);

  assert.equal(snapshotDir, path.join(output, regionKey, snapshotId));
  assert.equal(fs.readFileSync(path.join(snapshotDir, "snapshot.json"), "utf8"), `${JSON.stringify(snapshot, null, 2)}\n`);
  assert.equal(fs.readFileSync(path.join(rawDir, "alpha.txt"), "utf8"), "alpha");
  assert.ok(fs.existsSync(rawDir));
  assert.ok(!rawDir.startsWith(path.join(ROOT, "SYSTEM", "CACHE")));
});

test("Given an explicit config.vaultRoot, When writeArtifacts runs, Then the explicit vault root wins over the anchor", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-explicit-vault-"));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-explicit-output-"));
  const regionKey = "부산광역시-금정구";
  const snapshotId = "2026-07-01_20260701T000000Z";
  const rawFiles = {
    "alpha.txt": Buffer.from("alpha", "utf8")
  };
  const snapshot = { schema_version: 1, snapshot_id: snapshotId, region_key: regionKey };
  const snapshotDir = refresh.writeArtifacts(
    { output, vaultRoot: vault, "region-key": regionKey },
    snapshotId,
    rawFiles,
    snapshot
  );
  const rawDir = path.join(vault, cacheRoot.LEGACY_METRICS_REL, regionKey, snapshotId, "raw");

  assert.equal(snapshotDir, path.join(output, regionKey, snapshotId));
  assert.equal(fs.readFileSync(path.join(snapshotDir, "snapshot.json"), "utf8"), `${JSON.stringify(snapshot, null, 2)}\n`);
  assert.equal(fs.readFileSync(path.join(rawDir, "alpha.txt"), "utf8"), "alpha");
  assert.ok(fs.existsSync(rawDir));
  assert.ok(!rawDir.startsWith(path.resolve(output)));
});

test("Given an iCloud-hosted vault with no cache override, When the metrics roots are resolved, Then metadata stays in the vault and raw payloads move out", () => {
  const vault = makeICloudVault();

  assert.equal(cacheRoot.isICloudHosted(vault.root), true);
  assert.equal(
    cacheRoot.resolveMetricsRoot({ vaultRoot: vault.root }),
    path.join(vault.root, cacheRoot.LEGACY_METRICS_REL)
  );
  assert.equal(
    cacheRoot.resolveRawRoot({ vaultRoot: vault.root }),
    path.join(os.homedir(), "ProdigyCache", "region-metrics-raw")
  );
  assert.equal(
    cacheRoot.resolveRawDir({ vaultRoot: vault.root, regionKey: "부산광역시-금정구", snapshotId: "2026-07-01_20260701T000000Z" }),
    path.join(os.homedir(), "ProdigyCache", "region-metrics-raw", "부산광역시-금정구", "2026-07-01_20260701T000000Z", "raw")
  );
});

test("Given a cache override, When the raw root is resolved, Then the override wins", () => {
  const vault = makeICloudVault();
  const override = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-cache-override-"));

  withEnv("PRODIGY_CACHE_ROOT", override, () => {
    assert.equal(
      cacheRoot.resolveRawRoot({ vaultRoot: vault.root }),
      path.join(override, "region-metrics-raw")
    );
  });
});

test("Given a non-absolute cache override, When the raw root is resolved, Then it is rejected", () => {
  const vault = makeVault("prodigy-cache-root-absolute-");

  withEnv("PRODIGY_CACHE_ROOT", "relative/cache", () => {
    assert.throws(
      () => cacheRoot.resolveRawRoot({ vaultRoot: vault.root }),
      /PRODIGY_CACHE_ROOT는 절대 경로여야 합니다/
    );
  });
});

test("Given an iCloud vault, When writeArtifacts runs, Then only raw bytes leave the vault", () => {
  const override = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-raw-offload-"));
  const vault = makeICloudVault();
  const output = cacheRoot.resolveMetricsRoot({ vaultRoot: vault.root });
  const snapshotId = "2026-07-01_20260701T000000Z";
  const regionKey = "부산광역시-금정구";
  const rawFiles = {
    "alpha.txt": Buffer.from("alpha", "utf8"),
    "beta.json": Buffer.from("{\"ok\":true}", "utf8")
  };
  const snapshot = { schema_version: 1, snapshot_id: snapshotId, region_key: regionKey };

  withEnv("PRODIGY_CACHE_ROOT", override, () => {
    const snapshotDir = refresh.writeArtifacts(
      { output, vaultRoot: vault.root, "region-key": regionKey },
      snapshotId,
      rawFiles,
      snapshot
    );
    const rawDir = path.join(override, "region-metrics-raw", regionKey, snapshotId, "raw");

    assert.equal(snapshotDir, path.join(output, regionKey, snapshotId));
    assert.equal(fs.readFileSync(path.join(snapshotDir, "snapshot.json"), "utf8"), `${JSON.stringify(snapshot, null, 2)}\n`);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snapshotDir, "hashes.json"), "utf8")), {
      "alpha.txt": core.sha256(rawFiles["alpha.txt"]),
      "beta.json": core.sha256(rawFiles["beta.json"])
    });
    assert.equal(fs.readFileSync(path.join(rawDir, "alpha.txt"), "utf8"), "alpha");
    assert.equal(fs.readFileSync(path.join(rawDir, "beta.json"), "utf8"), "{\"ok\":true}");
    assert.ok(fs.existsSync(path.join(snapshotDir, "hashes.json")));
    assert.ok(fs.existsSync(path.join(snapshotDir, "snapshot.json")));
    assert.ok(fs.existsSync(rawDir));
    assert.ok(!fs.existsSync(path.join(snapshotDir, "raw")));
    assert.ok(!fs.existsSync(path.join(snapshotDir, "raw", "alpha.txt")));
    assert.equal(path.dirname(path.join(snapshotDir, "hashes.json")), snapshotDir);
    assert.equal(path.dirname(path.join(snapshotDir, "snapshot.json")), snapshotDir);
    assert.equal(path.dirname(rawDir), path.join(override, "region-metrics-raw", regionKey, snapshotId));
  });
});
