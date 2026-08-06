# Architect Response 31 — AI 판단 보조 반론 판정

- gate: `PLAN`
- challenge verdict: `ACCEPT`
- model evidence: same authenticated ChatGPT Project `Prodigy OS Making`, UI Pro, reasoning setting `높음`
- side-effect authority: none

## Accepted corrections

1. MVP는 현재 시점 분석만 지원한다. `analysis_as_of`는 generation start로 고정하고 임의의 과거 cutoff, backtesting, 과거 추천 재현을 제공하지 않는다. 현재 사건은 언제나 cohort에서 제외하며 post-review 결과는 별도 current-result section으로만 표시한다.
2. Cohort property type은 NFC + trim exact string이다. Alias/fuzzy 병합과 새 taxonomy는 금지한다. 같은 지역의 다른 type 문자열과 제외 건수를 공개하고, 사용자가 선택할 때만 all-property-types cohort를 별도 계산한다.
3. `SYSTEM/Views/auction-ai-provider-resolver.js`의 `resolveAuctionAiProvider()`를 Auction-local shared resolver로 추가한다. 기존 research summary와 신규 decision support가 함께 쓰되 prompt/request/secret 저장이나 전역 AI framework 역할은 갖지 않는다.
4. UX는 `deterministic preview → 펼침형 전송 disclosure → AI 의견 생성 1회 클릭 → session-only result`이다. 생성 클릭이 run-level opt-in이며 별도 confirmation dialog는 없다. 비집계 개인 excerpt만 기본 해제 checkbox로 별도 동의한다.
5. MVP telemetry, event log, analytics, hidden cache, 행동 추적은 모두 금지한다. Dogfooding은 수동 체크리스트와 명시적 관찰만 사용한다.
6. 개인 이력은 market won/lost cohort, personal lost bid gap, personal won experience로 분리한다. Won history는 count/ratios/local opaque reason refs를 제공하지만 probability, win rate, accuracy, auto calibration에는 쓰지 않는다.
7. Headline은 `입찰 보류 검토`, `추가 조사 후 재판단`, `보수 시나리오 검토`, `기준 시나리오 검토` 네 가지를 유지한다. Scenario가 없거나 widened cohort뿐이면 앞의 두 개만 허용하고 exact cohort 5+일 때 네 개 모두 허용한다. 공격 scenario는 계산에는 보이지만 headline에는 오르지 않는다.

## Final implementation corrections

- `auction-decision-support-core.js`: current-only dataset, exact cohort, market ratio, personal lost gap, personal won summary, references, projection
- `auction-region-packet.js`: `RegionPacketModal.onOpen()`의 기존 action group에 `AI 판단 보조` drill-down 하나만 추가
- fingerprint: 기존 `normalizeAuctionIdentity(...).query_fingerprint` 재사용
- `auction-ai-provider-resolver.js`: shared Auction-local provider selection
- `auction-ai-decision-support-core.js`: strict schema/ref/numeric/headline/redaction validation
- `auction-ai-decision-support.js`: disclosure, one-click generation, session-only state, stale, cancel/discard, return to human edit
- one-provider reality remains an independent trust milestone

## Mandatory tests

- current-only/no backtest contract and current exclusion
- NFC/trim exact property type and explicit widening
- shared provider resolution without secret/config writes
- zero AI request before generation; one request per click; no second dialog
- personal excerpt default exclusion and explicit selection
- no telemetry/cache/write
- separate won/lost/skipped histories
- scenario/headline eligibility
- deterministic numeric and evidence ref validation
- single decision-board entry, provider-unavailable fallback, stale fingerprint, return focus

## Final decision question

Approve the MVP as current-only, exact-property-cohort, exact-cohort-5+ competition references, four bounded AI opinions, shared provider resolver, inline disclosure, one-click opt-in, session-only zero-write, separate won/lost/skipped summaries, and no telemetry.
