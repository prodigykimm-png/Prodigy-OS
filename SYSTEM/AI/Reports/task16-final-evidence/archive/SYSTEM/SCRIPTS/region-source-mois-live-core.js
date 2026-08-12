"use strict";

const crypto = require("node:crypto");
const https = require("node:https");

const mois = require("./collectors/mois-households.js");
const sourceRegistry = require("./region-source-registry-core.js");
const bridge = require("./region-source-fixture-bridge-core.js");
const ledgerCore = require("./region-source-ledger-core.js");

const PROVIDER_ID = "mois_jumin_statmonth_csv";
const NETWORK_OPT_IN_ERROR = "MOIS direct 수집은 allow_network: true일 때만 실행됩니다.";
const DEFAULT_TIMEOUT_MS = 15000;

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validatePeriod(period) {
  const value = clean(period);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(value)) throw new Error("MOIS period는 YYYY-MM이어야 합니다.");
  return value;
}

function timestamp(value, name) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) || Number.isNaN(Date.parse(text))) throw new Error(`${name}은 UTC ISO timestamp이어야 합니다.`);
  return text;
}

function replacePeriod(value, year, month) {
  return String(value).replace(/\{\{YYYY\}\}/gu, year).replace(/\{\{MM\}\}/gu, month);
}

function buildMoisRequest(period) {
  const normalizedPeriod = validatePeriod(period);
  const [year, month] = normalizedPeriod.split("-");
  const target = new URL(sourceRegistry.MOIS_TRANSPORT_LITERAL.url);
  for (const [key, value] of Object.entries(sourceRegistry.MOIS_TRANSPORT_LITERAL.query)) target.searchParams.set(key, replacePeriod(value, year, month));
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(sourceRegistry.MOIS_TRANSPORT_LITERAL.body)) form.set(key, replacePeriod(value, year, month));
  const body = Buffer.from(form.toString(), "utf8");
  return Object.freeze({
    method: sourceRegistry.MOIS_TRANSPORT_LITERAL.method,
    url: target.toString(),
    headers: Object.freeze(Object.assign({}, sourceRegistry.MOIS_TRANSPORT_LITERAL.headers, { "Content-Length": String(body.length) })),
    body,
    request_sha256: sha256(body)
  });
}

function networkError(error) {
  const message = clean(error?.message || error || "unknown error").replace(/[\r\n]+/gu, " ");
  return message.slice(0, 240) || "unknown error";
}

function requestOfficialCsv(request, options = {}) {
  if (typeof options.request === "function") return Promise.resolve(options.request(request));
  const timeoutMs = Number.isInteger(options.timeout_ms) && options.timeout_ms > 0 ? options.timeout_ms : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const target = new URL(request.url);
    const client = https.request(target, { method: request.method, headers: request.headers, timeout: timeoutMs }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    client.on("timeout", () => client.destroy(new Error("MOIS direct request timeout")));
    client.on("error", reject);
    client.write(request.body);
    client.end();
  });
}

function failedReceipt(request, status, error, response) {
  const body = Buffer.isBuffer(response?.body) ? response.body : Buffer.alloc(0);
  return {
    provider_id: PROVIDER_ID,
    status,
    network_dispatched: true,
    request_count: 1,
    http_status: Number(response?.statusCode || 0),
    query_identity: { provider_id: PROVIDER_ID, period: request.period, method: request.method, url: request.url, request_sha256: request.request_sha256 },
    raw_payload_hash: body.length > 0 ? sha256(body) : null,
    raw_payload: body,
    snapshots: [],
    error: networkError(error)
  };
}

async function collectMoisOfficial(options = {}) {
  const period = validatePeriod(options.period);
  const request = buildMoisRequest(period);
  const requestWithPeriod = Object.assign({}, request, { period });
  if (options.allow_network !== true) {
    return Object.freeze({
      provider_id: PROVIDER_ID,
      status: "network_opt_in_required",
      network_dispatched: false,
      request_count: 0,
      query_identity: { provider_id: PROVIDER_ID, period, method: request.method, url: request.url, request_sha256: request.request_sha256 },
      raw_payload_hash: null,
      raw_payload: Buffer.alloc(0),
      snapshots: [],
      error: NETWORK_OPT_IN_ERROR
    });
  }

  let response;
  try {
    response = await requestOfficialCsv(requestWithPeriod, options);
  } catch (error) {
    return Object.freeze(failedReceipt(requestWithPeriod, "failed", error));
  }
  const body = Buffer.isBuffer(response?.body) ? response.body : Buffer.from(response?.body || "");
  const responseWithBody = Object.assign({}, response, { body });
  if (!Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode >= 300) {
    return Object.freeze(failedReceipt(requestWithPeriod, "failed", `MOIS HTTP ${response.statusCode || 0}`, responseWithBody));
  }

  const rawHash = sha256(body);
  let parsed;
  try {
    parsed = mois.parseMoisCsv(body, period);
  } catch (error) {
    return Object.freeze(Object.assign(failedReceipt(requestWithPeriod, "parse_failed", error, responseWithBody), { raw_payload_hash: rawHash }));
  }
  try {
    const snapshots = bridge.buildMoisSnapshots({
      parsed,
      raw_payload_hash: rawHash,
      raw_path: options.raw_path || `raw/mois_jumin_statmonth_csv/${period}/${rawHash}.csv`,
      period,
      published_at: timestamp(options.published_at, "published_at"),
      first_seen_at: timestamp(options.first_seen_at, "first_seen_at"),
      collected_at: timestamp(options.collected_at, "collected_at"),
      revision_type: options.revision_type,
      geography_registry: options.geography_registry
    });
    return Object.freeze({
      provider_id: PROVIDER_ID,
      status: "collected",
      network_dispatched: true,
      request_count: 1,
      http_status: response.statusCode,
      query_identity: { provider_id: PROVIDER_ID, period, method: request.method, url: request.url, request_sha256: request.request_sha256 },
      raw_payload_hash: rawHash,
      raw_payload: body,
      parser_result: parsed,
      snapshots,
      error: null
    });
  } catch (error) {
    return Object.freeze(Object.assign(failedReceipt(requestWithPeriod, "snapshot_failed", error, responseWithBody), { raw_payload_hash: rawHash, parser_result: parsed }));
  }
}

async function appendMoisOfficialSnapshots(ledgerState, options = {}) {
  const result = await collectMoisOfficial(options);
  let ledger = ledgerState;
  if (result.status === "collected") for (const snapshot of result.snapshots) ledger = ledgerCore.appendSnapshot(ledger, snapshot);
  return Object.freeze(Object.assign({}, result, { ledger }));
}

module.exports = Object.freeze({
  DEFAULT_TIMEOUT_MS,
  NETWORK_OPT_IN_ERROR,
  PROVIDER_ID,
  appendMoisOfficialSnapshots,
  buildMoisRequest,
  collectMoisOfficial,
  requestOfficialCsv,
  sha256,
  validatePeriod
});
