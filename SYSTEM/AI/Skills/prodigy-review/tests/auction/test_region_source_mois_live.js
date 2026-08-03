"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const live = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-source-mois-live-core.js"));
const expansion = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-geography-expansion-core.js"));

const FIXTURE_PATH = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/fixtures/region-intelligence/mois_jumin_statmonth_csv/2026-05-households.csv");
const FIXTURE_BYTES = fs.readFileSync(FIXTURE_PATH);

const TIMES = Object.freeze({
  published_at: "2026-06-20T00:00:00.000Z",
  first_seen_at: "2026-08-03T00:00:00.000Z",
  collected_at: "2026-08-03T00:00:01.000Z"
});

test("Given a MOIS period, When the direct request is built, Then the frozen official transport is fully materialized", () => {
  const request = live.buildMoisRequest("2026-05");
  assert.equal(request.method, "POST");
  assert.match(request.url, /downloadCsv\.do\?searchYearMonth=month&xlsStats=3/u);
  assert.match(request.body.toString("utf8"), /searchYearStart=2026/u);
  assert.match(request.body.toString("utf8"), /searchMonthStart=05/u);
  assert.match(request.body.toString("utf8"), /searchYearEnd=2026/u);
  assert.match(request.body.toString("utf8"), /searchMonthEnd=05/u);
  assert.match(request.request_sha256, /^[a-f0-9]{64}$/u);
});

test("Given network is not explicitly enabled, When MOIS collection starts, Then no request is dispatched", async () => {
  let called = false;
  const result = await live.collectMoisOfficial({ period: "2026-05", request: () => { called = true; } });
  assert.equal(result.status, "network_opt_in_required");
  assert.equal(result.network_dispatched, false);
  assert.equal(called, false);
  assert.equal(result.snapshots.length, 0);
});

test("Given a verified official CSV response, When direct collection runs, Then the response becomes 83 expansion snapshots", async () => {
  const result = await live.collectMoisOfficial(Object.assign({
    period: "2026-05",
    allow_network: true,
    request: async (request) => {
      assert.equal(request.method, "POST");
      return { statusCode: 200, headers: { "content-type": "text/csv" }, body: FIXTURE_BYTES };
    },
    geography_registry: expansion.loadRegistry()
  }, TIMES));
  assert.equal(result.status, "collected");
  assert.equal(result.network_dispatched, true);
  assert.equal(result.request_count, 1);
  assert.equal(result.snapshots.length, 83);
  assert.equal(result.raw_payload.length, FIXTURE_BYTES.length);
  assert.match(result.raw_payload_hash, /^[a-f0-9]{64}$/u);
  assert.equal(result.query_identity.period, "2026-05");
  assert.equal(result.parser_result.network_dispatched, false);
});

test("Given a non-success official response, When direct collection runs, Then raw bytes and failure are retained without snapshots", async () => {
  const result = await live.collectMoisOfficial(Object.assign({
    period: "2026-05",
    allow_network: true,
    request: async () => ({ statusCode: 503, headers: {}, body: Buffer.from("temporarily unavailable", "utf8") })
  }, TIMES));
  assert.equal(result.status, "failed");
  assert.equal(result.network_dispatched, true);
  assert.equal(result.snapshots.length, 0);
  assert.equal(result.raw_payload.toString("utf8"), "temporarily unavailable");
  assert.match(result.error, /HTTP 503/u);
});

test("Given a successful HTTP response with malformed CSV, When direct collection parses it, Then parsing fails closed", async () => {
  const result = await live.collectMoisOfficial(Object.assign({
    period: "2026-05",
    allow_network: true,
    request: async () => ({ statusCode: 200, headers: {}, body: Buffer.from("not,csv\nrow\n", "utf8") })
  }, TIMES));
  assert.equal(result.status, "parse_failed");
  assert.equal(result.snapshots.length, 0);
  assert.match(result.error, /header validation failed/u);
  assert.match(result.raw_payload_hash, /^[a-f0-9]{64}$/u);
});

test("Given a verified direct response, When it is appended, Then the ledger keeps the source generation and does not overwrite Object data", async () => {
  const result = await live.appendMoisOfficialSnapshots({ schema_version: 1, snapshots: [] }, Object.assign({
    period: "2026-05",
    allow_network: true,
    request: async () => ({ statusCode: 200, headers: {}, body: FIXTURE_BYTES }),
    geography_registry: expansion.loadRegistry()
  }, TIMES));
  assert.equal(result.status, "collected");
  assert.equal(result.ledger.snapshots.length, 83);
  assert.equal(Object.hasOwn(result, "object_changes"), false);
});

console.log("MOIS direct source tests loaded");
