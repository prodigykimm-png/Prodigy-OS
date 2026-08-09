# Architect Packet 10

## Metadata

- repo: Prodigy OS Obsidian Vault
- branch: `codex/journal-codex-exec`
- packet date: 2026-08-02 Asia/Seoul
- topic: `auction-region-decision-ux`
- previous implementation review: `packet-9.md` / `response-23.md`
- review gate: `PLAN`
- continuous execution: false
- execution authority: repository inspection, GPT Pro discussion, local architecture records, and a final user report only
- excluded authority: product or test edits, Object/Daily writes, external provider calls, runtime QA, commit, push, release, permission changes, and destructive actions

## Approval scope

- destination: existing authenticated ChatGPT Project `Prodigy OS Making`
- conversation: existing `auction-region-workspace-20260801` conversation
- transport: existing in-app browser conversation
- transmitted data: bounded repository contracts, UI labels, file/symbol names, current behavior, constraints, and design questions
- excluded data: secrets, credentials, API keys, personal notes, Object/Daily bodies, real auction records, customer data, screenshots, and unrelated dirty changes

## User goal

Discuss and produce a user-friendly plan for Auction and Region workspaces. The Region workspace must become useful for real auction decisions rather than remain a collection of raw metrics. The user wants the final conclusion and plan only; no implementation is authorized.

## Existing product behavior

### Auction card

`SYSTEM/Views/auction-card.js` currently exposes several separate entry points:

- inline beside the location: `판단` → `AuctionRegionPacket.openForAuction()`
- inline beside the location: `지역 정보` → `RegionIntelligencePopupCore.openPopupForApp()`
- action row: `부동산 조사` → source package, provider status, evidence, retry, selected fact approval
- action row: `결정 패킷` → verified Knowledge, Region Resource, and prior decisions
- separate lifecycle buttons under `다음 행동`
- price, expected bid, rent/profit assumptions, opinion, and memo are edited directly on the card

This is capable but entry-point-heavy. A user must already know which surface answers which question.

### Region workspace

`HUB/15 Region.md`, `region-explorer-state.js`, and `region-explorer-view.js` provide:

- search, sort, freshness/verification filters
- comparison of up to three user-selected regions
- raw grouped metrics: market, households, 12–60 month supply, land price, research, transit
- per-region actions: `지역 상세 보기`, `이 지역 경매 보기`, `비교에 추가`
- regional experience capture

The comparison is metric-centric. It does not tell the user which decision question each metric informs, what is favorable or risky in context, or what evidence is missing before acting.

### Region detail popup

`region-decision-view-model.js`, `region-intelligence-popup-core.js`, and `region-intelligence-popup-view.js` currently create up to nine tabs:

1. 연결 경매
2. 핵심
3. 판단·결과 when an Auction context exists
4. 변화
5. 실거래
6. 공급·일자리
7. 교통·생활
8. 지식·논지
9. 임장

Trust badges and collection health are shown, but the first view is still a table/tab navigator. `판단·결과` compares the current human judgment with canonical regional outcomes, while other tabs expose facts. There is no single interpretation layer connecting those facts to the decision.

`연결 경매` lists case/status/date/minimum bid/address. Selecting a row currently closes the popup and returns to the Auction Hub with a region filter; it does not reliably open the selected case panel.

### Region packet from an Auction

`SYSTEM/Views/auction-region-packet.js` projects matching Region Resource facts into:

- research sections
- canonical region metrics and provenance
- transit
- warnings such as stale/missing data and the separate `region_dong` micro-location check
- links to full Region info and Region experience capture

It correctly avoids bid recommendations and Object writes, but it still presents information sections rather than a question-first decision aid.

### Decision packet

`decision-packet-core.js` and `auction-decision-packet.js` surface verified Knowledge, the matching Region Resource, and up to two prior decisions. It is a reference index, not an integrated decision workbench.

## Existing invariants

- Region Metrics and Region projections remain read-only canonical evidence.
- Auction `expected_bid`, `my_bid_price`, `decision_reason`, `my_opinion`, lifecycle status, and approval remain user-owned.
- No automatic bid recommendation, ranking, pass/fail judgment, or Object mutation.
- No new Auction or Region schema in the minimum plan unless a demonstrated blocker makes it unavoidable.
- `region_sido + region_sigungu` is the canonical Region identity. `region_dong` remains a separate micro-location warning and must never inherit a city-district conclusion as fact.
- Freshness, verification, source coverage, and missing evidence remain visible and independent; do not collapse them into one opaque score.
- Existing provider matching, source-package approval, Region Experience ownership, outcome tuple, and writers remain protected.
- Use progressive disclosure and Korean labels; the user should not need to open the underlying note for routine investigation or decision preparation.

## Product problem to solve

The system has evidence, but it lacks a coherent decision journey. The desired journey is:

`사건을 발견 → 지역이 이 물건에 주는 영향 이해 → 부족한 근거 확인/조사 → 유사 지역·지역 내 결과와 대조 → 사용자 판단 기록 → 다음 lifecycle 행동`

The plan must decide how to translate existing Region data into descriptive decision signals without becoming an automated recommendation engine.

Candidate question lenses to evaluate, reject, or refine:

- 환금성·수요: 거래량, 회전율, 세대수 변화, 가격 변화
- 임대 방어력: 전세가율 and rent-related evidence
- 공급 부담: move-in horizons relative to stock/households, with no invented precision
- 경매 경쟁: canonical local outcomes and bid-rate evidence, explicitly small-sample aware
- 미시 입지: dong, transit, site-visit and qualitative risk evidence
- 근거 신뢰도: freshness, verification, coverage, missing fields

The architect must decide whether these are appropriate and how they should be worded. A descriptive signal may say `확인된 강점`, `확인할 위험`, `근거 부족`; it must not say `입찰 추천`, `좋은 투자`, or choose a bid.

## Decision questions

1. What should be the one primary Auction-card entry point for decision work, and which existing buttons should become drill-downs, be renamed, or remain separate?
2. Should the primary surface be an integrated `판단 보드` with three levels—overview, evidence drill-down, and user action—or another structure?
3. How should Region metrics be translated into decision questions and neutral signals while preserving raw values and provenance?
4. How should user-selected Region comparison be used: absolute values only, explicit baseline/delta, peer comparison, or a combination? Ban automatic ranking.
5. How should connected regional Auction outcomes and prior human decisions inform the current case without implying statistical confidence that the sample does not support?
6. What is the smallest coherent change to Region Explorer, Region Detail, Auction Region Packet, Decision Packet, and Auction card?
7. Which current surfaces are genuinely redundant versus complementary?
8. What must remain deferred to prevent new schema, recommendation, or platform scope creep?

## Required architect process

Perform three passes in the same conversation:

1. Propose the strongest user journey and information architecture.
2. Challenge it for entry-point proliferation, hidden recommendation/ranking, metric over-interpretation, mobile overload, duplicated surfaces, and schema creep.
3. Return one final normative implementation plan on the `PLAN` gate.

## Required response format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN

### Final product conclusion
- one-sentence product principle
- primary user journey
- final information architecture
- explicit ownership of Auction card, integrated decision surface, Region Explorer, Region Detail, source research, and Decision Packet

### Decision-signal contract
- exact neutral signal categories and allowed wording
- source metrics/evidence for each signal
- missing/stale/small-sample behavior
- comparison baseline rules
- explicit prohibitions against recommendation, ranking, and automatic judgment

### User-facing flow matrix
- entry point
- user question answered
- default content
- drill-down
- action returned to

### Redundancy disposition
- keep, merge, rename, demote, or remove for `판단`, `지역 정보`, `부동산 조사`, `결정 패킷`, Region Detail tabs, connected Auction list, and Region comparison

### Exact implementation map
- existing files and symbols only, unless a new pure projection module is strictly justified
- per-file responsibility
- no product execution in this round

### Ordered implementation phases
- each phase goal, exact scope, acceptance criteria, tests, visual/mobile QA, rollback boundary, and dependencies

### Non-goals and deferred scope

### Risks and evidence gaps

### Final verdict
- `FINAL_PLAN_VERDICT: APPROVE | REVISE | BLOCK`
