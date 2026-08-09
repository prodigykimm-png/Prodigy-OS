# Architect Response 29 — AI 판단 보조 최종 판정

- gate: `PLAN`
- decision: `APPROVE`
- model evidence: same authenticated ChatGPT Project `Prodigy OS Making`, UI Pro, reasoning setting `높음`
- side-effect authority: none; planning approval only

## Position on AI judgment

The plan should expand from neutral summary only to an explicit `AI 판단 보조` layer. AI may interpret verified facts, explain investigation priority, present bounded bid scenarios, and offer a conservative advisory opinion. The final judgment and persistence remain the user's responsibility.

User acceptance removes neither data-integrity, time-leakage, sample-bias, privacy, stale-data, nor accidental-write risks. Therefore this is an explainable advisory layer, not an automatic investment-decision system.

## Approved output contract

The Auction `판단 보드` receives a read-only `AI 판단 보조` area with six visually separated sections:

1. **확인된 사실** — verified Auction Object facts, official outcomes, Region Metrics, and approved research packages.
2. **계산 결과** — deterministic calculations with inputs, formula, period, cohort, and sample count; AI cannot invent numbers.
3. **AI 해석** — what the facts may mean for the current case, with evidence links and counter-evidence.
4. **입찰가 시나리오** — at most conservative, baseline, and aggressive scenarios; each shows range, comparison group, assumptions, exclusions, exit-price relationship, and weaknesses.
5. **AI 제안** — additional investigation, conservative review, re-checking assumptions, insufficient evidence, or considering withdrawal; no certainty claims.
6. **근거 한계** — sample size, observation period, freshness, verification, coverage, missing fields, property-type fit, and user-history comparability.

Allowed output includes an explainable range or “insufficient evidence to produce a range.” It must not claim guaranteed winning, success probability, good investment, ranking, recommendation score, confirmed fair price, or mandatory bidding.

## Data eligibility

- Current case: verified Auction facts, hash/fingerprint-valid packages, canonical read-only Region Metrics, clearly labeled Region Experience, and user-entered exit/rent/profit assumptions.
- Historical case: a different Auction, verified outcome tuple, positive official winning price and result date, data available before the analysis cutoff, explicit region/property-type cohort, and traceable source path.
- Compare a user's bid with the winning price only when both exist.
- `won`: verified official winning outcome.
- `lost`: user actually bid and the official winning price permits comparison.
- `skipped`/withdrawn: separate user-abandoned case; never silently classify as lost.
- Cases without verified outcome are excluded from outcome metrics.
- Current-case future outcome is excluded from pre-auction analysis.
- Every analysis has an `analysis_as_of` cutoff; later outcomes, packages, or Region updates are excluded. Pre-auction and post-auction review are separate modes.
- Cohorts expose region, property type, period, outcome status, sample count, and exclusions. The system must not broaden the cohort just to increase sample size.

External AI receives only a minimum redacted projection: non-identifying case key, structured values, region/property type, dates, verification state, selected evidence, and redacted excerpts. It does not receive full notes, private memo bodies, raw provider bodies, keys, environment values, unnecessary address/case identifiers, or unrelated history.

## User approval and persistence

```text
판단 보드
→ AI 판단 보조 실행
→ 사실·계산·해석·시나리오·제안·한계 확인
→ 사용자 수정 또는 폐기
→ 필요할 때만 사용자가 정확한 값·문구를 선택하고 편집
→ 명시적 승인
→ 기존 사용자 판단 편집 경계로 기록
```

AI output is a derived advisory draft, not an Auction Object, Region Metric, official outcome, source candidate, or lifecycle state. It may remain session-only or in a reproducible cache without expanding the Object schema.

AI never directly writes `status`, `expected_bid`, `my_bid_price`, `decision_reason`, or `my_opinion`. `AuctionSourceApprovalWriter` remains for external source facts and must not become an AI recommendation writer. If no dedicated user-judgment approval seam exists, the first release uses the existing card editing flow after the user reviews the AI draft.

## Required evidence and tests

- current outcome exclusion and `analysis_as_of` cutoff;
- no withdrawn-to-lost misclassification;
- outcome and duplicate-case identity/path validation;
- stale/unverified evidence and Region Experience/Metrics separation;
- canonical winning-bid-ratio denominator contract;
- region/property-type cohort filtering, sample period/count, no missing-to-zero conversion;
- no range for 0–2 verified comparison outcomes;
- deterministic, reproducible scenario calculations that AI cannot alter;
- factual/calculation/interpretation/recommendation visual separation;
- evidence reference and counter-evidence for every material claim;
- missing/stale/small-sample warnings and banned-language tests;
- model/prompt version and generation time;
- deterministic facts/calculations remain visible when AI is unavailable;
- zero write on AI execution, preview, cancel, or discard;
- stale draft, cross-case draft, and current fingerprint mismatch block application;
- Obsidian QA for zero samples, 1–2 samples, withdrawn-only, mixed outcomes, stale Region, property mismatch, future current outcome, AI unavailable, discard, and user-edited persistence.

## Risks and safeguards

- Wrong case/PNU: existing exact identity, SHA, and fingerprint gates.
- User-history and survivor bias: expose sample and missing-history limitations; do not generalize to the whole market.
- Time leakage: deterministic cutoff and current-case exclusion.
- Personal investment-history leakage: minimum projection, external-transfer display, raw-note exclusion, and opt-in.
- Canonical write accident: read-only default, explicit preview, user edit, existing boundary, stale-draft blocking.
- AI authority bias: facts and proposals separated, counter-evidence and limitations always visible, no score/rank.

## Revised next-phase order

1. **One-provider vertical slice** — provider result/failure/selection/retry, existing package and identity gates, and neutral Region `확인할 질문`.
2. **Decision-Support Data Foundation** — no AI call yet; establish historical outcome projection, won/lost/skipped semantics, cutoff exclusion, canonical winning-bid-ratio definition, cohort filters, deterministic statistics/scenarios, provenance, and sample limitations.
3. **AI 판단 보조 MVP** — six-section read-only draft, external-transfer opt-in, and existing card edit for user persistence.
4. **Provider Reality expansion and investigation-flow stabilization** — remaining providers, identifier coverage, provider-specific recovery, and current-evidence coverage.
5. **Dogfooding** — measure reading, time saved, changed decisions, errors, warning comprehension, and draft edits/discards.
6. **Automation Readiness Gate** — include AI quality gates: zero future leakage, zero withdrawn/lost misclassification, zero unsupported numeric claims, zero missing material evidence, zero accidental canonical writes, and demonstrated recurring value. Only afterward consider bounded raw-package background collection; never automatic AI judgment or application.

Next packet: `AI_DECISION_SUPPORT_DATA_CONTRACT`.
