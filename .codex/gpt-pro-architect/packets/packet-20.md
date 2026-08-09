# Architect Packet 20 — AI 판단 보조 1차 판정 반론

## Metadata

- date: 2026-08-03 Asia/Seoul
- topic: `auction-region-ai-decision-support-20260802`
- previous packet: `packet-19.md`
- previous response: `response-30.md`
- review gate: `PLAN`
- execution authority: discussion, local planning records, and report only
- excluded authority: implementation, tests, Vault/Object writes, provider execution, runtime QA, commit, push, release

## Accepted from the first verdict

- A clearly labeled `AI 의견` headline is allowed; neutral summary only is rejected.
- `winning_bid_price / appraisal_price` is the only canonical ratio denominator.
- Region `auction_bid_rate_6m` remains `null/n/a` and is never substituted.
- `lost` without `my_bid_price` may enter the market outcome cohort but not personal bid-gap calculations.
- Scenario references require exact cohort `n>=5`, positive appraisal, and Type 7 Q25/median/Q75.
- Data foundation precedes one-provider reality; provider coverage remains a separate limitation.
- MVP draft is session-only and does not use any writer.

## Challenge 1 — historical time leakage cannot be fully solved with current fields

The current Auction snapshot has `auction_result_date` but no bitemporal `outcome_observed_at` history. A result may be written to the Object later while carrying an earlier official result date. Therefore a historical replay with an old `analysis_as_of` could incorrectly treat a later-entered result as if it was known at that time.

Proposed correction:

- MVP supports **current live analysis only**: `analysis_as_of = generation start time` and no arbitrary past cutoff UI.
- Current Auction is always excluded from the historical cohort.
- `post_auction_review` may show the current result separately but does not claim a faithful reconstruction of the pre-auction information set.
- Historical backtesting remains blocked until source observation/approval timestamps are preserved by a separate approved contract.

Judge whether this narrower boundary is required.

## Challenge 2 — property type has no verified canonical normalizer

The schema documents examples (`아파트`, `오피스텔`, `상가`, `토지` 등) but no strict normalizer was found. Silent alias normalization would invent a new semantic contract; exact raw string matching may fragment cohorts.

Proposed MVP:

- NFC + trim only.
- Exact property string remains the default cohort.
- If aliases fragment the cohort, show the mismatch count and let the user explicitly select `같은 시군구 · 모든 물건 유형`.
- Do not introduce a new alias taxonomy in this phase.

Judge whether to accept exact-string behavior or require a bounded canonical alias table in Phase 1.

## Challenge 3 — provider resolution is not actually a public shared boundary

`resolveSummaryProvider()` in `auction-real-estate-research.js` is private. Public capabilities are:

- `ProdigyConfigService.load/getDefaultProvider/getProvider`
- `AIProviderService.isProviderConfigured/requestStructuredJson`

The implementation spec must not say that the new AI panel can simply call the private resolver. Two options:

1. Extract one small shared Auction-local resolver used by both research summary and decision support.
2. Let the decision-support orchestrator use the public config/provider APIs directly, duplicating only the small Codex/Antigravity preference loop.

Choose the smaller, safer option and name its file/symbol.

## Challenge 4 — fingerprint and mount symbols are now verified

- Current fingerprint is available through `real-estate-source-identity-core.js` export `normalizeAuctionIdentity(record, selections).query_fingerprint`.
- The exact judgment-board mount is `RegionPacketModal.onOpen()` in `auction-region-packet.js`, in the `상세 및 기록` action group beside `조사 자료 보기`, `지역 상세 보기`, `참고 근거 보기`, and `지역 경험 기록`.
- `AuctionRegionPacket.openForAuction()` already carries `returnFocus` and current Auction context.

The final plan should use these facts and avoid inventing another fingerprint algorithm or a second top-level card CTA.

## Challenge 5 — transfer preview must remain user-friendly

The user explicitly connected Codex/Antigravity and wants work completed within the Obsidian window. A second blocking confirmation on every run may make the feature feel broken.

Proposed flow:

```text
판단 보드 → AI 판단 보조 → deterministic preview
→ expandable "AI에 전달될 정보" disclosure
→ single explicit "AI 의견 생성" click
→ session-only result
```

The generation click itself is the run-level opt-in. No additional confirmation dialog is needed unless the selected projection contains non-aggregate personal excerpts. Judge this balance.

## Challenge 6 — dogfooding cannot silently introduce telemetry

The first verdict asks to record execution, discard, and edit rates, but session-only/no-write means the product cannot persist these automatically without new telemetry or a new ledger.

Proposed MVP dogfooding:

- Manual QA checklist and explicit user notes only.
- No hidden analytics, event log, or Vault telemetry.
- Product telemetry/cache is a later separately approved contract.

## Challenge 7 — personal history should represent won cases too

The market cohort correctly uses both won and lost canonical outcomes. Personal gap applies only to lost bids. The UI should still summarize won history separately (count, own winning bid/appraisal ratio when valid, and user-authored decision reasons as opaque local references), otherwise “나의 낙찰 데이터” is underused.

Won history must not be converted into a success probability or blended into lost bid-gap metrics.

## Decision requested

Revise the first verdict into one bounded final contract. Specifically settle:

1. live-only time boundary versus historical replay;
2. exact-string property type versus new alias mapping;
3. one shared Auction-local provider resolver;
4. one-click opt-in with inline disclosure;
5. no telemetry in MVP;
6. explicit won-history summary;
7. whether the four headline actions are sufficiently clear for the user's request, without adding a single exact recommended bid.

Do not broaden into schema migration, cache, telemetry, backtesting, generic AI framework, or provider redesign.

## Required response format

Challenge verdict: ACCEPT | REJECT | PARTIAL
Gate reviewed: PLAN
Accepted corrections:
Rejected corrections and reasons:
Final unresolved risks:
Required changes to the implementation slices:
Required changes to tests and Obsidian QA:
Exact final-decision question for the next packet:
