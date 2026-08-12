/**
 * test_region_secret_provisioning.js
 *
 * Validates Region Intelligence secret provisioning:
 * - All 8 secret IDs are registered in config service
 * - No plaintext secret values leak to JSON/cache/logs
 * - Missing key → blocked_auth status
 *
 * node:test suite. CommonJS. Offline.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const configService = require(path.join(VAULT_ROOT, "SYSTEM", "Views", "prodigy-config-service.js"));
const collectorService = require(path.join(VAULT_ROOT, "SYSTEM", "Views", "region-collector-service.js"));

// ---------------------------------------------------------------------------
// Expected secret IDs from the plan
// ---------------------------------------------------------------------------

const EXPECTED_SECRET_IDS = [
  "prodigy-reb-openapi-key",
  "prodigy-data-go-kr-service-key",
  "prodigy-vworld-api-key",
  "prodigy-kosis-api-key",
  "prodigy-seoul-openapi-key",
  "prodigy-naver-client-id",
  "prodigy-naver-client-secret",
  "prodigy-youtube-api-key"
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Region Secret Provisioning", () => {
  it("registers all 8 Region secret IDs in SECRET_IDS", () => {
    const allIds = Object.values(configService.SECRET_IDS);
    for (const expected of EXPECTED_SECRET_IDS) {
      assert.ok(allIds.includes(expected), `Missing secret ID: ${expected}`);
    }
  });

  it("exposes REGION_SECRET_IDS with exactly 8 entries", () => {
    const regionIds = configService.REGION_SECRET_IDS;
    assert.ok(regionIds, "REGION_SECRET_IDS must exist");
    assert.equal(Object.keys(regionIds).length, 8);
  });

  it("REGION_SECRET_IDS values are a subset of SECRET_IDS values", () => {
    const allValues = new Set(Object.values(configService.SECRET_IDS));
    for (const value of Object.values(configService.REGION_SECRET_IDS)) {
      assert.ok(allValues.has(value), `REGION_SECRET_IDS value not in SECRET_IDS: ${value}`);
    }
  });

  it("secret IDs match the exact plan-specified strings", () => {
    const R = configService.REGION_SECRET_IDS;
    assert.equal(R.reb, "prodigy-reb-openapi-key");
    assert.equal(R.dataGoKr, "prodigy-data-go-kr-service-key");
    assert.equal(R.vworld, "prodigy-vworld-api-key");
    assert.equal(R.kosis, "prodigy-kosis-api-key");
    assert.equal(R.seoulOpenapi, "prodigy-seoul-openapi-key");
    assert.equal(R.naverClientId, "prodigy-naver-client-id");
    assert.equal(R.naverClientSecret, "prodigy-naver-client-secret");
    assert.equal(R.youtube, "prodigy-youtube-api-key");
  });

  it("getRegionSecretStatus returns boolean map without revealing values", async () => {
    // Mock app with secretStorage that has one key
    const mockApp = {
      secretStorage: {
        getSecret: async (id) => id === "prodigy-reb-openapi-key" ? "super-secret-value" : ""
      }
    };
    const status = await configService.getRegionSecretStatus(mockApp);
    assert.equal(typeof status, "object");
    assert.equal(status["prodigy-reb-openapi-key"], true);
    assert.equal(status["prodigy-data-go-kr-service-key"], false);
    // Ensure no secret value appears in the status object
    const serialized = JSON.stringify(status);
    assert.ok(!serialized.includes("super-secret-value"), "Secret value must not appear in status");
  });

  it("no plaintext secret leak in collector status output", async () => {
    const secretValue = "<synthetic-secret>";
    const files = {};
    const collector = collectorService.createCollector({
      readFile: async (p) => files[p] || null,
      writeFile: async (p, t) => { files[p] = t; },
      getSecret: async (id) => id === "prodigy-reb-openapi-key" ? secretValue : "",
      requestUrl: async () => ({ status: 200, headers: {} }),
      now: () => Date.now(),
      randomUUID: () => "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
      sha256: (d) => require("crypto").createHash("sha256").update(d).digest("hex"),
      processNonce: "11111111-2222-4333-8444-555555555555",
      registry: { providers: [{ provider_id: "mois_jumin_statmonth_csv", status: "planned_enabled", network_allowed: true, auth_placement: "none", cadence: "monthly", transport: { method: "POST", url: "https://example.com", headers: {}, body: {} } }] }
    });
    const status = await collector.status();
    const serialized = JSON.stringify(status);
    assert.ok(!serialized.includes(secretValue), "Secret value must not appear in collector status");
    assert.ok(!serialized.includes("sk-test"), "No secret prefix in status");
  });

  it("missing key → blocked_auth from collector preflight", async () => {
    const files = {};
    const collector = collectorService.createCollector({
      readFile: async (p) => files[p] || null,
      writeFile: async (p, t) => { files[p] = t; },
      getSecret: async () => "", // all secrets missing
      requestUrl: async () => ({ status: 200, headers: {} }),
      now: () => Date.now(),
      randomUUID: () => "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
      sha256: (d) => require("crypto").createHash("sha256").update(d).digest("hex"),
      processNonce: "11111111-2222-4333-8444-555555555555",
      registry: { providers: [{ provider_id: "naver_candidate", status: "disabled", network_allowed: true, auth_placement: "X-Naver-Client-Id + X-Naver-Client-Secret headers", cadence: "manual/weekly", transport: { method: "GET", url: "https://example.com", headers: {} } }] }
    });
    const gate = await collector.preflight("naver_candidate");
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, "blocked_auth");
    assert.ok(gate.missing.length > 0, "Should report missing secret IDs");
  });

  it("no secret values persisted to cache files", async () => {
    const secretValue = "my-super-secret-api-key-value-12345";
    const files = {};
    const collector = collectorService.createCollector({
      readFile: async (p) => files[p] || null,
      writeFile: async (p, t) => { files[p] = t; },
      getSecret: async (id) => id === "prodigy-naver-client-id" ? secretValue : "",
      requestUrl: async () => ({ status: 200, headers: {} }),
      now: () => Date.now(),
      randomUUID: () => "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee",
      sha256: (d) => require("crypto").createHash("sha256").update(d).digest("hex"),
      processNonce: "11111111-2222-4333-8444-555555555555",
      registry: { providers: [{ provider_id: "naver_candidate", status: "disabled", network_allowed: true, auth_placement: "X-Naver-Client-Id + X-Naver-Client-Secret headers", cadence: "manual/weekly", transport: { method: "GET", url: "https://example.com", headers: {} } }] }
    });
    // Run preflight (which checks secrets)
    await collector.preflight("naver_candidate");
    // Verify no file contains the secret
    for (const [filePath, content] of Object.entries(files)) {
      assert.ok(!content.includes(secretValue), `Secret leaked to file: ${filePath}`);
    }
  });

  it("isSecretId validates format correctly", () => {
    assert.equal(configService.isSecretId("prodigy-reb-openapi-key"), true);
    assert.equal(configService.isSecretId("prodigy-data-go-kr-service-key"), true);
    assert.equal(configService.isSecretId(""), false);
    assert.equal(configService.isSecretId("UPPERCASE"), false);
    assert.equal(configService.isSecretId("has spaces"), false);
  });
});
