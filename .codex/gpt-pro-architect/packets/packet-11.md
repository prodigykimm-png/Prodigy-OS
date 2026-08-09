# Architect Packet 11 — Auction / Region decision UX

## Metadata

- date: 2026-08-02 Asia/Seoul
- topic: `auction-region-decision-ux`
- project: `Prodigy OS Making`
- conversation: `auction-region-workspace-20260801`
- gate: `PLAN`
- continuous execution: false
- authority: read-only repository inspection, GPT Pro discussion, architecture records, and final user report
- excluded: product/test edits, Object/Daily/Region data writes, external provider calls, runtime QA, commit, push, release

## Goal

Make Auction and Region workspaces usable without opening Markdown notes. Reduce the Auction card's overlapping entry points and turn accumulated Region data into neutral, traceable decision context without creating recommendations, rankings, scores, or automatic judgment.

## Current contract summary

- Auction card has separate `판단`, `지역 정보`, `부동산 조사`, and `결정 패킷` entries plus lifecycle and editable decision fields.
- Region Explorer supports search/filter/sort and read-only comparison of up to three Region rows.
- Region Detail can expose up to nine top-level tabs.
- `AuctionRegionPacket.projectPacket()` already resolves the exact Region Object and returns normalized Region data plus checks.
- `AuctionRealEstateResearch.readLatestPackage()` is the public package reader; research core exposes provider/match/evidence projections.
- Region comparison rows already include region-level `metrics_as_of` and `verification_status`.
- Region Detail passes the selected auction row to its callback, but `HUB/15 Region.md` currently drops the exact row and transfers only region scope.
- Auction Hub has no exact selected-card focus contract and Auction card roots have no path attribute.

## Locked constraints from two review passes

1. The primary Auction decision entry is named `판단 보드`.
2. Automatically generated facts may describe only observation, time change, absolute comparison, references, explicit conflict, verification need, and missing evidence.
3. Automatic positive/negative polarity, strength/risk labels, recommendations, rankings, scores, thresholds, and bid suggestions are prohibited.
4. Human-authored Region Experience remains provenance-marked human evidence and is never promoted to official Region Metrics or Auction judgment.
5. Research remains a visible secondary action only when a package is missing, stale, failed, needs an identifier, or needs selection. A healthy package is accessed inside the board.
6. The compact board must not repeat card address, prices, exit assumptions, profit, opinion, or decision reason.
7. Region Detail must be reduced to three top-level groups, not merely receive another overview tab.
8. Region Explorer first release uses absolute values plus region-level date and verification only; baseline, delta, ranking, and persisted comparison state are excluded.
9. Exact selected-auction navigation may use one session-only request containing region scope and exact path. It must be consumed once and must fall back to the filtered Auction Hub.
10. No schema, Object, frontmatter, package, writer, lifecycle, or approval-boundary changes are allowed.

## Final-pass request

Produce one implementation-ready normative PLAN covering the two user journeys, CTA visibility, compact board, Region Detail grouping, Region comparison, neutral fact contract, minimal file map, ordered phases, acceptance/tests/desktop-and-375px QA, rollback, migration, protected contracts, and non-goals. Permit at most one new pure `region-decision-context-core.js`. End with `FINAL_PLAN_VERDICT`. Do not authorize implementation or commit.
