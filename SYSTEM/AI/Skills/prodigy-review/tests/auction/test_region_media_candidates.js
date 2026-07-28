"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const media = require(path.join(ROOT, "SYSTEM/Views/region-media-candidate-core.js"));
const naver = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/naver-region-candidate.js"));
const youtube = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/youtube-region-candidate.js"));

const REGION_A = "PARA/RESOURCES/Auction Regions/서울특별시-강남구";

// --- Disabled connectors: missing secret => blocked_auth, zero network ---

test("Naver adapter without keys is blocked_auth with zero network", () => {
  const state = naver.adapterState({});
  assert.equal(state.provider, "naver_candidate");
  assert.equal(state.status, "blocked_auth");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.request_count, 0);
  assert.equal(state.canonical_metric, false);
  assert.deepEqual(state.candidates, []);
});

test("Naver adapter with keys is still disabled (registry policy), zero network", () => {
  const state = naver.adapterState({ clientId: "id", clientSecret: "secret" });
  assert.equal(state.status, "disabled");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.canonical_metric, false);
});

test("Naver collect never dispatches network and returns blocked error", () => {
  const result = naver.collect(REGION_A, "강남구", {});
  assert.equal(result.network_dispatched, false);
  assert.equal(result.request_count, 0);
  assert.equal(result.collected_at, null);
  assert.ok(result.error.length > 0);
  assert.equal(result.canonical_metric, false);
});

test("YouTube adapter without key is blocked_auth with zero network", () => {
  const state = youtube.adapterState({});
  assert.equal(state.provider, "youtube_candidate");
  assert.equal(state.status, "blocked_auth");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.canonical_metric, false);
});

test("YouTube adapter with key is still disabled, zero network", () => {
  const state = youtube.adapterState({ apiKey: "some-key" });
  assert.equal(state.status, "disabled");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
});

test("YouTube collect never dispatches network and returns blocked error", () => {
  const result = youtube.collect(REGION_A, "강남구", {});
  assert.equal(result.network_dispatched, false);
  assert.equal(result.request_count, 0);
  assert.equal(result.collected_at, null);
  assert.ok(result.error.length > 0);
});

// --- Media never canonical metric ---

test("media candidate core provider statuses are manual/disabled, never canonical", () => {
  assert.equal(media.PROVIDER_STATUS.instagram_manual, "manual");
  assert.equal(media.PROVIDER_STATUS.naver_candidate, "disabled");
  assert.equal(media.PROVIDER_STATUS.youtube_candidate, "disabled");
});

test("Naver/YouTube adapter states in media core report zero network and non-canonical", () => {
  const n = media.naverAdapterState("");
  assert.equal(n.status, "blocked_auth");
  assert.equal(n.network_dispatched, false);
  assert.equal(n.canonical_metric, false);
  const y = media.youtubeAdapterState("");
  assert.equal(y.status, "blocked_auth");
  assert.equal(y.network_dispatched, false);
  assert.equal(y.canonical_metric, false);
});

// --- Manual Instagram capture ---

test("manual Instagram candidate saves only from explicit user input, no fetch", () => {
  const candidate = media.createInstagramCandidate({
    url: "https://www.instagram.com/p/manual1/",
    region_link: `[[${REGION_A}]]`,
    created: "2026-07-20T10:00:00+09:00"
  });
  assert.equal(candidate.provider_status, "manual");
  assert.equal(candidate.fetched, false);
  assert.equal(candidate.network_dispatched, false);
});

test("Instagram candidate is never a canonical metric and never auto-fetched", () => {
  const candidate = media.createInstagramCandidate({
    url: "https://www.instagram.com/p/manual2/",
    region_link: `[[${REGION_A}]]`,
    created: "2026-07-20T10:00:00+09:00"
  });
  assert.equal(candidate.network_dispatched, false);
  assert.equal(candidate.fetched, false);
  assert.notEqual(candidate.provider_status, "enabled");
});

test("disabled connectors create no Region relation and no request", () => {
  const n = naver.collect(REGION_A, "query", {});
  const y = youtube.collect(REGION_A, "query", {});
  assert.equal(n.network_dispatched, false);
  assert.equal(y.network_dispatched, false);
  assert.deepEqual(n.candidates, []);
  assert.deepEqual(y.candidates, []);
});
