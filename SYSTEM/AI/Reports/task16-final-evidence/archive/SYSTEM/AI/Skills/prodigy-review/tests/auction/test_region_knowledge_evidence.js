"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const media = require(path.join(ROOT, "SYSTEM/Views/region-media-candidate-core.js"));
const candidateCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"));

const REGION_A = "PARA/RESOURCES/Auction Regions/서울특별시-강남구";

// --- Evidence inbox: manual Instagram capture ---

test("manual Instagram candidate is created only from explicit input", () => {
  const candidate = media.createInstagramCandidate({
    url: "https://www.instagram.com/p/abc123/",
    region_link: `[[${REGION_A}]]`,
    title: "강남역 상권 관찰",
    note: "유동인구 많음",
    created: "2026-07-20T10:00:00+09:00"
  });
  assert.equal(candidate.provider, "instagram_manual");
  assert.equal(candidate.media_kind, "instagram");
  assert.equal(candidate.fetched, false);
  assert.equal(candidate.network_dispatched, false);
  assert.equal(candidate.region_link, `[[${REGION_A}]]`);
});

test("Instagram candidate requires a valid HTTP(S) URL", () => {
  assert.throws(() => media.createInstagramCandidate({
    url: "not-a-url",
    region_link: `[[${REGION_A}]]`,
    created: "2026-07-20"
  }), /유효하지 않은 URL/);
});

test("Instagram candidate rejects non-HTTP protocol", () => {
  assert.throws(() => media.createInstagramCandidate({
    url: "ftp://example.com/p/abc",
    region_link: `[[${REGION_A}]]`,
    created: "2026-07-20"
  }), /유효하지 않은 URL/);
});

test("Instagram candidate requires an exact Region wikilink", () => {
  assert.throws(() => media.createInstagramCandidate({
    url: "https://www.instagram.com/p/abc/",
    region_link: "[[강남구]]",
    created: "2026-07-20"
  }), /Region wikilink/);
});

// --- Duplicate URL detection ---

test("duplicate Instagram URL is detected (trailing slash and case insensitive)", () => {
  const existing = [
    { url: "https://www.instagram.com/p/abc123/" },
    { url: "https://www.instagram.com/p/xyz789/" }
  ];
  assert.equal(media.duplicateInstagramUrl(existing, "https://www.instagram.com/p/abc123"), true);
  assert.equal(media.duplicateInstagramUrl(existing, "HTTPS://WWW.INSTAGRAM.COM/P/ABC123/"), true);
  assert.equal(media.duplicateInstagramUrl(existing, "https://www.instagram.com/p/newpost/"), false);
});

test("duplicate detection ignores malformed existing entries", () => {
  const existing = [{ url: 123 }, null, { notUrl: true }];
  assert.equal(media.duplicateInstagramUrl(existing, "https://www.instagram.com/p/abc/"), false);
});

// --- Stale candidate detection ---

test("candidate older than 90 days is stale", () => {
  const candidate = { created: "2026-01-01T00:00:00Z" };
  assert.equal(media.isStaleCandidate(candidate, "2026-07-20"), true);
});

test("candidate within 90 days is not stale", () => {
  const candidate = { created: "2026-07-01T00:00:00Z" };
  assert.equal(media.isStaleCandidate(candidate, "2026-07-20"), false);
});

test("candidate with missing or invalid created is stale", () => {
  assert.equal(media.isStaleCandidate({}, "2026-07-20"), true);
  assert.equal(media.isStaleCandidate({ created: "garbage" }, "2026-07-20"), true);
  assert.equal(media.isStaleCandidate({ created: "2026-07-01" }, "garbage"), true);
  assert.equal(media.isStaleCandidate(null, "2026-07-20"), true);
});

// --- Evidence inbox grouping (pending candidates) ---

test("knowledge_candidate rows land in the pending inbox tier, never verified", () => {
  const rows = [
    { path: "c1.md", type: "knowledge_candidate", connections: [`[[${REGION_A}]]`] },
    { path: "k1.md", type: "knowledge", connections: [`[[${REGION_A}]]`] }
  ];
  const groups = candidateCore.groupByTier(rows);
  assert.equal(groups.counts.pending, 1);
  assert.equal(groups.counts.verified, 1);
  assert.equal(groups.pending[0].path, "c1.md");
});
