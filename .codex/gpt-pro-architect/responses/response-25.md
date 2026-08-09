# Round 25 — Auction / Region decision UX final plan

- Date: 2026-08-02 Asia/Seoul
- Gate: `PLAN`
- Project: `Prodigy OS Making`
- Conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a6dfe26-f208-83e8-b090-2ee0b085d273`
- Packet: `../packets/packet-11.md`
- Decision: `APPROVE`
- Final verdict: `FINAL_PLAN_VERDICT: APPROVE`
- Authority: planning records only; no implementation, data writes, QA execution, or Git action

## Product principle and journeys

Region is reusable, neutral decision context at `region_sido + region_sigungu` scope. Auction is the case workspace where a human reviews evidence, records judgment, approves facts, and takes lifecycle actions. `region_dong` remains a micro-location check, not Region identity.

Auction-first:

`Auction card → 판단 보드 → 지역 판단 맥락 / 근거 상태 / 확인할 항목 → 필요한 전문 화면 → 보드 닫기 → 기존 카드에서 판단 기록 → 기존 다음 행동`

Region-first:

`Region Explorer → 최대 3개 절대값 비교 → Region Detail → 연결 경매 선택 → session-only exact path handoff → 지역 필터 Auction Hub → 선택 카드 best-effort focus → 판단 보드`

If the exact card is absent, stay in the filtered Auction Hub and show `선택한 경매를 현재 필터 결과에서 찾지 못했습니다.` Do not infer a match or create a route.

## Auction CTA contract

- `판단` becomes the only primary decision CTA, `판단 보드`, on every Auction card.
- `지역 정보` leaves the card and becomes `지역 상세 보기` inside the board.
- `결정 패킷` leaves the card; its internal contract remains and the user label becomes `참고 근거 보기` inside the board.
- `부동산 조사` is hidden on healthy packages. It appears as a secondary `조사 자료` action with a precise badge only for missing, stale, failed, `needs_identifier`, or `needs_selection` states.
- Existing lifecycle actions and card-owned editable judgment fields do not change.
- Package reading and status projection reuse `AuctionRealEstateResearch.readLatestPackage()` and `AuctionRealEstateResearchCore`; no parallel reader or status engine.

## Compact decision board

Top-level sections:

1. `근거 상태`: date, verification, source coverage, and missing state remain independent; never combine them into one score.
2. `지역 판단 맥락`: four fixed questions, at most three facts each.
   - 거래와 가격은 어떻게 움직였나?
   - 임대 판단에 사용할 근거가 있는가?
   - 공급과 생활환경에서 확인할 사실은 무엇인가?
   - 지역 경매 사례와 미시 입지는 무엇을 보여주는가?
3. `확인할 항목`: shown only when applicable, with concrete reasons such as missing Region data, stale/unverified data, partial coverage, insufficient source, micro-location check, no official outcome, missing identifier, or required selection.
4. `상세 및 기록`: `조사 자료 보기`, `지역 상세 보기`, `참고 근거 보기`, `지역 경험 기록`.

The board does not repeat or edit address, prices, exit assumptions, profit, opinion, or decision reason. Long source text, tables, and candidate diffs stay in existing drilldowns. Candidate approval stays in research + source approval writer; Region Experience stays in its modal/store; Auction judgment and lifecycle stay on the card. Closing uses existing `returnFocus` only.

## Region Detail and Explorer

Reduce Region Detail to exactly three top-level groups:

1. `판단 맥락` — default: identity, independent trust badges, four neutral question groups, and contextual checks.
2. `지역 근거` — map existing `핵심`, `변화`, `실거래`, `공급·일자리`, `교통·생활`, `지식·논지` into sections/accordions without losing raw values or provenance.
3. `사례·임장` — `연결 경매`, conditional `현재 사건 대조`, `임장·사용자 기록`, and `지역 경험 기록`.

Region Explorer preserves search, sort, filters, and maximum three user-selected regions. It shows absolute values in the same question order. Each selected region displays row-level `metrics_as_of` as `지역 기준일` plus `검증 상태`. Missing values remain missing. Different dates are marked. Do not imply metric-level provenance. Desktop shows up to three columns side by side; at 375px preserve readable column width and use horizontal scrolling.

No baseline selector, calculated delta, auto peer selection, best/worst emphasis, percentile, rank, score, or recommendation.

## Neutral fact contract

Allowed labels:

- `관찰된 사실`: a raw value and source exist.
- `기간 변화`: the same metric is genuinely comparable across periods.
- `비교 차이`: absolute values of the same metric are shown side by side without superiority language.
- `참고 사례`: official outcomes or prior human decisions, always with count and period.
- `상반된 근거`: only an actual same-metric/same-claim source conflict or an explicit conflict from verified human evidence.
- `확인 필요`: stale, unverified, missing micro-location check, or another concrete verification cause.
- `근거 부족`: the value, case, or source is absent; never impute it.

Prohibited labels and behavior include strength/risk polarity, positive/negative, good/bad, favorable/unfavorable, superiority, investment suitability, bid/pass recommendations, aggregate scores, success probability, appropriate bid price, and automatic ranking. Facts must trace to raw values or evidence references. Dates are never invented. Stale and unverified facts may be visible only with their badges.

## Minimal file and navigation contract

Create one pure shared projection:

- `SYSTEM/Views/region-decision-context-core.js`
  - export `projectRegionDecisionContext(input)`
  - accept normalized Region row plus optional Auction, research, outcome/prior-decision, and Region Experience summaries
  - return identity, independent trust state, four question groups, neutral facts, checks, and provenance references
  - prohibit Vault/API I/O, package reads, writes, thresholds, ranking, recommendations, writer calls, and state storage

Modify only existing presentation/orchestration boundaries:

- `auction-card.js`: primary CTA, state-aware research action, `data-auction-path`
- `auction-region-packet.js`: compose/open compact board
- `region-decision-view-model.js`: map existing content to three groups
- `region-intelligence-popup-core.js` and `region-intelligence-popup-view.js`: pass normalized context and render three groups while preserving read-only behavior
- `region-explorer-view.js`: absolute comparison plus row-level date/verification
- `auction-decision-packet.js`: user label only
- `HUB/15 Region.md`: preserve selected row and create session request
- `HUB/10 Auction.md`: apply region scope and consume exact focus once after relevant sections render

The runtime request is `window.prodigyAuctionNavigationRequest = { region_sido, region_sigungu, auction_path }`. Region creates it. Auction Hub captures and deletes it immediately, renders relevant sections, then on the next animation frame searches `[data-auction-path]`, scrolls/focuses if found, or keeps the filtered view and shows the fallback notice. Re-rendering must not reuse it. `shared-dashboard.js` remains unchanged.

Existing research readers, approval writer, Region projection/state, Region Experience contracts/store, decision packet core, and dashboard renderer remain unchanged.

## Ordered phases

### Phase 1 — Auction-first vertical slice

Add the pure context projection, one primary board CTA, compact board, state-aware research secondary action, and existing drilldowns. Acceptance requires no duplicated card values, no recommendation/polarity, at most three facts per question, no board-owned writes, correct package status mapping, and `returnFocus` behavior.

Test the projection's fact kinds, missing/stale/unverified/partial Region data, `region_dong`, real same-claim conflict versus unrelated metric divergence, research states, prohibited wording, all board drilldowns, protected-field non-change, and writer boundaries. Perform actual Obsidian desktop and 375px QA for every research state.

### Phase 2 — Region Detail three-group conversion

Move all existing content under `판단 맥락`, `지역 근거`, and `사례·임장`; preserve raw data, provenance, connected auctions, conditional current-case comparison, and Region Experience. Verify mapping completeness, Auction context on/off, read-only behavior, long sources, accordion/touch behavior, scrolling, and focus on desktop and 375px.

### Phase 3 — Region comparison and exact selected-case focus

Add absolute comparison headers with region-level date/verification and the one-shot path handoff. Verify one-to-three selections, fourth-selection rejection, same/different/missing dates, request creation/capture/deletion, path escaping, success/fallback, no repeated focus, and existing region-only fallback. Perform desktop and 375px horizontal-scroll and Region-to-card focus QA.

### Phase 4 — End-to-end stabilization

Run complete Auction-first and Region-first flows with healthy, missing, stale, unverified, partial, no-outcome, no-connected-auction, `region_dong`, Region Experience, and all research problem states. Final acceptance requires that routine work needs no Markdown note, board/card data is not duplicated, ownership boundaries remain intact, prohibited recommendation language is absent, and all related regressions plus actual Obsidian desktop/375px QA pass.

## Migration, rollback, and non-goals

Migration: none. No Object, Region Resource, frontmatter, schema, lifecycle enum, package schema, receipt, or outcome tuple changes.

Independent rollback units: Auction card + decision board; Region Detail grouping; Region comparison presentation; session-only exact focus.

Non-goals: new data engine/schema/route, persisted selected-card state, automatic recommendations/ranking/bids/pass-fail, polarity thresholds, baseline/delta, automatic peer selection, a second judgment editor inside the board, approval writer changes, automatic Region Metrics refresh, metric-level provenance claims without metric-level data, dedicated mobile navigation architecture, product implementation, tests execution, data writes, or commit.

## Architect conclusion

This is a minimal rearrangement around one `판단 보드` entry and one neutral shared context projection, not a replacement of existing data ownership or approval contracts.

`FINAL_PLAN_VERDICT: APPROVE`
