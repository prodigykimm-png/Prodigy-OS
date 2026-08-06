# Architect Response 32 — Auction AI 판단 보조 최종 PLAN

- decision: `APPROVE`
- gate reviewed: `PLAN`
- final plan verdict: `APPROVE`
- model evidence: same authenticated ChatGPT Project `Prodigy OS Making`, UI Pro, reasoning setting `높음`
- side-effect authority: none

## Final rationale

The plan closes the critical risks by supporting current-time analysis only, always excluding the current case from historical cohorts, preserving won/lost/skipped/unresolved semantics, fixing the ratio to `winning_bid_price / appraisal_price * 100`, using NFC+trim exact property types, withholding Q25/Q75 scenarios below five exact cases, keeping all numbers deterministic, and making AI output a session-only advisory draft that calls no writer.

It preserves the existing judgment board, research package, Region read-only context, human editing, lifecycle, and writer boundaries while allowing explainable AI judgment. It excludes scores, ranks, probabilities, a single exact recommended bid, automatic application, telemetry, and cache.

## Approved product contract

```text
판단 보드
→ AI 판단 보조
→ 결정론적 근거·계산 미리보기
→ AI에 전달될 정보 확인
→ 필요 시 개인 기록 excerpt 선택
→ AI 의견 생성
→ session-only 결과 확인
→ 폐기 또는 기존 카드 편집으로 복귀
```

The deterministic preview remains available when no provider exists or AI validation fails. It shows cohort/sample, inclusion/exclusion, official winning-bid ratio summary, personal lost bid gaps, personal won experience, scenario eligibility, Region/current research coverage, and limitations.

Allowed `AI 의견` headlines:

- `입찰 보류 검토`
- `추가 조사 후 재판단`
- `보수 시나리오 검토`
- `기준 시나리오 검토`

Without an eligible exact scenario, only the first two are allowed. Every headline requires a reason, counterevidence, valid evidence refs, and deterministic `근거 수준: 제한적|보통`.

Forbidden: a single recommended bid, fair/safe value, expected winning price, probability, score/rank, mandatory action, or automatic application.

Default cohort:

```text
exact region_sido
+ exact region_sigungu
+ NFC/trim exact property_type
+ declared result period
+ verified won/lost outcome
```

- no silent widening or alias/fuzzy mapping;
- `region_dong` is not a cohort identity;
- explicit all-property-types widening is calculated separately;
- n=0: no case summary;
- n=1–2: cases only;
- n=3–4: count/min/median/max;
- exact n>=5: Type 7 Q25/median/Q75 and appraisal-based competition references.

The references are competition-price context, not value, profitability, safety, or winning likelihood. Lost cases enter personal gap only with valid personal bid; won history remains separate; skipped stays outside price statistics.

MVP persistence is session-only: no Vault/Object/schema/package/receipt/cache/telemetry write, no source/outcome writer, and no automatic user-field changes.

## Approved phase order

1. `SYSTEM/Views/auction-decision-support-core.js`: pure current-time dataset, cohort, Type 7, market ratio, personal lost/won, limitations, minimum external projection.
2. `SYSTEM/Views/auction-region-packet.js` and minimal `HUB/10 Auction.md` loader change: one `AI 판단 보조` drill-down in `RegionPacketModal.onOpen()`; no second card CTA or repeated basics; reuse `normalizeAuctionIdentity(...).query_fingerprint`.
3. `SYSTEM/Views/auction-ai-provider-resolver.js`: Auction-local `resolveAuctionAiProvider(...)` over public config/provider APIs; shared with existing research summary; no new secret/config path or global framework.
4. One-provider reality trust milestone through existing collector/package/identity/hash/fingerprint/approval contracts. Honest unavailable/failure is acceptable; fixture is not live success.
5. `SYSTEM/Views/auction-ai-decision-support-core.js` and `auction-ai-decision-support.js`: strict prompt projection/validation, disclosure, optional excerpt, one-click request, separated rendering, stale/cancel/discard/return focus; no writer/schema/lifecycle changes.
6. Full Auction/Region regression, property audit, actual Obsidian desktop and compact QA, and manual dogfooding without telemetry/cache.

## Mandatory safeguards

- current-time only; no historical replay/backtesting;
- current case excluded in pre/post cohorts;
- no status/text-based outcome inference;
- deterministic numbers; any AI change invalidates the whole draft;
- exact cohort; no alias/fuzzy/silent widening;
- no Q25/Q75 scenario below exact five cases;
- Region `auction_bid_rate_6m` remains null/n/a;
- no external case number, detailed address, path, note/raw body, or secret;
- personal excerpts are explicit opt-in;
- local schema/enum/ref/number/headline/banned-language validation;
- zero canonical write through run/preview/generate/cancel/discard;
- source writer never becomes an AI writer;
- no telemetry/cache;
- one judgment-board entry only.

## Implementation blockers and completion evidence

No architecture blocker exists at the PLAN gate. Implementation must reuse `AuctionDecisionMirrorCore.snapshotAuctionCases()`, fail closed on path/id conflict, use only public provider/config APIs, retain exactly one judgment action, work without AI, and prove zero-write/return-focus/stale behavior in actual Obsidian.

Physical-mobile or live-provider evidence gaps must be reported honestly. If implementation would require schema, writer, global AI framework, or persistent cache expansion, stop rather than expanding scope.

## Explicitly deferred

Historical backtesting, bitemporal outcome observation, persistent advisory cache, telemetry, property-type alias taxonomy, generic AI framework, AI writer, automatic user/status/outcome/provider actions, scheduled/background judgment, background collection, automatic cohort widening/region selection, ranking/probability/single bid, official Region auction ratio, AI performance measurement, and mobile live provider execution.

## Next action

Prepare a separately authorized bounded implementation packet with exact files/symbols/load order/tests/live-provider reporting/Obsidian QA/protected-boundary assertions and stop conditions. This PLAN does not authorize implementation, provider calls, tests, Vault/Object writes, or git actions.

`FINAL_PLAN_VERDICT: APPROVE`
