"use strict";

// Synthetic, deeply-frozen dogfooding cohort (Todo 11). No real Daily/PARA/Auction/
// contact paths are allowed; the runner rejects this file if any leak in. Every
// Candidate outcome and every Decision Packet surface is represented so the cohort
// proves coverage without touching production Objects.
const cohort = Object.freeze([
  Object.freeze({ id: "df-01", outcome: "proposed", surface: "reading", domain: "reading", reason: { labels: ["같은 저자"], evidence: "내 기록: 반복을 줄인다." } }),
  Object.freeze({ id: "df-02", outcome: "saved", surface: "auction", domain: "real_estate", reason: { matched: { direct: true, region: false, topic: true }, topics: ["bidding"] } }),
  Object.freeze({ id: "df-03", outcome: "saved", surface: "workout", domain: "workout", reason: { code: "exercise" } }),
  Object.freeze({ id: "df-04", outcome: "needs_more_evidence", surface: "auction", domain: "real_estate", reason: { matched: { direct: false, region: true, topic: false }, topics: [] } }),
  Object.freeze({ id: "df-05", outcome: "needs_more_evidence", surface: "reading", domain: "coding", reason: { labels: ["같은 개념", "같은 개념"], evidence: "" } }),
  Object.freeze({ id: "df-06", outcome: "approved", surface: "auction", domain: "real_estate", reason: { matched: { direct: true, region: true, topic: true }, topics: ["rights_analysis", "tax"] } }),
  Object.freeze({ id: "df-07", outcome: "approved", surface: "reading", domain: "reading", reason: { labels: ["같은 주제"], evidence: "핵심 기록: 직접 적용한다." } }),
  Object.freeze({ id: "df-08", outcome: "rejected", surface: "workout", domain: "workout", reason: { code: "topic" } }),
  Object.freeze({ id: "df-09", outcome: "rejected", surface: "auction", domain: "wedding", reason: { matched: { direct: false, region: false, topic: false }, topics: [] } }),
  Object.freeze({ id: "df-10", outcome: "saved", surface: "auction", domain: "coding", reason: { matched: { direct: false, region: false, topic: true }, topics: ["ai"] } }),
  Object.freeze({ id: "df-11", outcome: "needs_more_evidence", surface: "workout", domain: "workout", reason: { code: "domain" } }),
  Object.freeze({ id: "df-12", outcome: "saved", surface: "reading", domain: "business", reason: { labels: [], evidence: "내 기록: 맥락을 먼저 본다." } })
]);

const api = Object.freeze({ cohort });
if (typeof module !== "undefined" && module.exports) module.exports = api;
