/**
 * test_region_source_contract.js
 *
 * node:test suite validating the frozen Region Intelligence source registry.
 * Uses only Node.js built-in modules.
 */
"use strict";

const { after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const core = require(path.join(VAULT_ROOT, "SYSTEM", "SCRIPTS", "region-source-registry-core.js"));

// ---------------------------------------------------------------------------
// Fixture role bindings from the plan (exact JSON)
// ---------------------------------------------------------------------------

const FIX = "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence";

function createHermeticRegistryFixture(sourceRegistry) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-region-source-contract-"));
  const registry = JSON.parse(JSON.stringify(sourceRegistry));

  for (const row of registry.providers) {
    row.fixtures.forEach((fixture, index) => {
      const relativePath = path.join("fixtures", row.provider_id, `${fixture.role}-${index}.fixture`);
      const content = Buffer.from(`${row.provider_id}:${fixture.role}:${index}\n`, "utf8");
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
      fixture.path = relativePath;
      fixture.sha256 = core.sha256hex(content);
    });
  }

  const registryPath = path.join(root, "region-source-registry.json");
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return { root, registry, registryPath };
}

const EXPECTED_FIXTURE_BINDINGS = {
  mois_jumin_statmonth_csv: [
    { role: "current_period", path: FIX + "/mois_jumin_statmonth_csv/2026-05-households.csv", sha256: "576bf4419ddebd24da4b1c917269ed298f03bd6c413213c8b3e93599462d415a" },
    { role: "yoy_prior_period", path: FIX + "/mois_jumin_statmonth_csv/2025-05-households.csv", sha256: "e451385dddfb976ed6687a5750e23a8a70d51cd291c841eae0606950e8104ead" },
  ],
  reb_rone_public_table: [
    { role: "jeonse_current", path: FIX + "/reb_rone_public_table/2026-05-jeonse-sahagu.json", sha256: "21953cc9241445b13ad7d06d5dce81c1c60942fd6ad87d274bc37b77f39f97fd" },
    { role: "price_current", path: FIX + "/reb_rone_public_table/2026-05-price-sahagu.json", sha256: "40dd9f8fdb6b955f664b8367f3afb91309de930d28f5277eaba66b6236478842" },
    { role: "volume_window", path: FIX + "/reb_rone_public_table/2026-03_05-volume-sahagu.json", sha256: "485a5f75a2d076992465ab7115514e2b08b31e597fa6663896e335aca69998a0" },
  ],
  reb_stock: [
    { role: "parser_seed", path: FIX + "/reb_stock/2026-release.csv", sha256: "2fe472b92867b69644d368a89df2acd81a65004cfc01afff0a7e72021c7f2e0a" },
  ],
  reb_supply: [
    { role: "parser_seed", path: FIX + "/reb_supply/2026-release.csv", sha256: "09cf2ad66d74bb0f5840a3249fc54634bdc08dd9d34630bfb730ae544a20c3a2" },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Region Source Contract", () => {
  const registry = core.loadRegistry();
  const hermetic = createHermeticRegistryFixture(registry);

  after(() => {
    fs.rmSync(hermetic.root, { recursive: true, force: true });
  });

  it("loads the registry JSON", () => {
    assert.ok(registry);
    assert.ok(Array.isArray(registry.providers));
  });

  it("has exactly 32 provider rows", () => {
    assert.equal(registry.providers.length, 32);
    assert.equal(registry.provider_count, 32);
  });

  it("every required provider row is present with exact planned status", () => {
    const byId = new Map(registry.providers.map((r) => [r.provider_id, r]));
    for (const [id, expectedStatus] of Object.entries(core.EXPECTED_STATUS_MAP)) {
      assert.ok(byId.has(id), `Missing provider: ${id}`);
      assert.equal(byId.get(id).status, expectedStatus, `Status mismatch for ${id}`);
    }
  });

  it("validates registry structure with zero errors", () => {
    const errors = core.validateRegistry(registry);
    assert.deepEqual(errors, []);
  });

  it("validates statuses with zero errors", () => {
    const errors = core.validateStatuses(registry);
    assert.deepEqual(errors, []);
  });

  it("all declared fixture SHA-256 hashes verify from an OS-temp root", () => {
    const { results, errors } = core.verifyFixtureHashes(hermetic.registry, hermetic.root);
    assert.deepEqual(errors, []);
    assert.ok(results.length > 7);
    for (const result of results) {
      assert.equal(result.match, true);
      assert.ok(path.resolve(hermetic.root, result.path).startsWith(hermetic.root));
      assert.ok(!path.resolve(hermetic.root, result.path).startsWith(VAULT_ROOT));
    }
  });

  it("83-region digest reproduces the exact hash", () => {
    const digest = core.verifyRegionDigest();
    assert.equal(digest, "663998ddf2f7b1b4d4242d52e5ea0fc99884c55230b3ceb3f555f07a101dab1b");
  });

  it("MOIS transport matches literal shape", () => {
    const mois = registry.providers.find((r) => r.provider_id === "mois_jumin_statmonth_csv");
    assert.ok(mois);
    assert.ok(core.deepEqual(mois.transport, core.MOIS_TRANSPORT_LITERAL));
  });

  it("fixture role bindings match the plan exact JSON", () => {
    const byId = new Map(registry.providers.map((r) => [r.provider_id, r]));
    for (const [pid, expectedFixtures] of Object.entries(EXPECTED_FIXTURE_BINDINGS)) {
      const row = byId.get(pid);
      assert.ok(row, `Provider not found: ${pid}`);
      assert.ok(
        core.deepEqual(row.fixtures, expectedFixtures),
        `Fixture bindings mismatch for ${pid}`
      );
    }
  });

  it("only MOIS has network_allowed:true", () => {
    for (const row of registry.providers) {
      if (row.provider_id === "mois_jumin_statmonth_csv") {
        assert.equal(row.network_allowed, true);
      } else {
        assert.equal(row.network_allowed, false, `${row.provider_id} must have network_allowed:false`);
      }
    }
  });

  it("only Incheon/Busan are accepted_legacy", () => {
    const legacy = registry.providers.filter((r) => r.status === "accepted_legacy");
    assert.equal(legacy.length, 2);
    const ids = legacy.map((r) => r.provider_id).sort();
    assert.deepEqual(ids, ["busan-metro", "incheon-metro"]);
  });

  // -------------------------------------------------------------------------
  // Rejection tests
  // -------------------------------------------------------------------------

  it("rejects a missing row", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    modified.providers = modified.providers.filter((r) => r.provider_id !== "reb_stock");
    modified.provider_count = modified.providers.length;
    const errors = core.validateRegistry(modified);
    assert.ok(errors.some((e) => e.includes("Missing required provider_id: reb_stock")));
  });

  it("rejects a changed dataset ID/hash", () => {
    const modified = JSON.parse(JSON.stringify(hermetic.registry));
    const mois = modified.providers.find((r) => r.provider_id === "mois_jumin_statmonth_csv");
    mois.fixtures[0].sha256 = "0000000000000000000000000000000000000000000000000000000000000000";
    const { errors } = core.verifyFixtureHashes(modified, hermetic.root);
    assert.ok(errors.length > 0);
    assert.ok(errors.some((e) => e.includes("hash mismatch")));
  });

  it("rejects a promoted blocked/candidate row", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    const row = modified.providers.find((r) => r.provider_id === "reb_stock");
    row.status = "planned_enabled";
    const errors = core.validateStatuses(modified);
    assert.ok(errors.some((e) => e.includes("reb_stock") && e.includes("status must be")));
  });

  it("rejects a secret-like value", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    const row = modified.providers.find((r) => r.provider_id === "reb_stock");
    row.scope = "api" + "_key=" + "placeholder_value_for_scan_test_123456";
    const errors = [];
    core.scanForSecrets(row, errors);
    assert.ok(errors.some((e) => e.includes("secret")));
  });

  it("rejects a TBD hash", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    const row = modified.providers.find((r) => r.provider_id === "mois_jumin_statmonth_csv");
    row.fixtures[0].sha256 = "TBD";
    const errors = [];
    core.validateFixtures(row, errors);
    assert.ok(errors.some((e) => e.includes("TBD")));
  });

  it("rejects a duplicate provider", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    const dup = JSON.parse(JSON.stringify(modified.providers[0]));
    modified.providers.push(dup);
    const errors = core.validateRegistry(modified);
    assert.ok(errors.some((e) => e.includes("Duplicate provider_id")));
  });

  it("rejects an invalid fixture policy", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    const row = modified.providers.find((r) => r.provider_id === "reb_stock");
    row.fixture_policy = "invalid_policy";
    const errors = core.validateRegistry(modified);
    assert.ok(errors.some((e) => e.includes("invalid fixture_policy")));
  });

  it("rejects an invalid transport on a blocked row", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    const row = modified.providers.find((r) => r.provider_id === "reb_stock");
    row.transport = { method: "GET", url: "https://example.com" };
    const errors = [];
    core.validateTransport(row, errors);
    assert.ok(errors.some((e) => e.includes("network_allowed:false requires transport:null")));
  });

  it("rejects unknown fields", () => {
    const modified = JSON.parse(JSON.stringify(registry));
    const row = modified.providers.find((r) => r.provider_id === "reb_stock");
    row.extra_field = "should not exist";
    const errors = core.validateRegistry(modified);
    assert.ok(errors.some((e) => e.includes("unknown field")));
  });

  it("full validateAll passes with zero errors", () => {
    const result = core.validateAll({
      registryPath: hermetic.registryPath,
      vaultRoot: hermetic.root,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.provider_count, 32);
    assert.equal(result.digest_sha256, "663998ddf2f7b1b4d4242d52e5ea0fc99884c55230b3ceb3f555f07a101dab1b");
    assert.equal(result.secret_scan_hits, 0);
    assert.equal(result.fixture_hashes_verified, result.fixture_total);
  });
});
