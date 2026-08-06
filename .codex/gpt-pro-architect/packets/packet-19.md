# Architect Packet 19 — AI 판단 보조 데이터 계약 초안

## Metadata

- date: 2026-08-03 Asia/Seoul
- topic: `auction-region-ai-decision-support-20260802`
- previous packet: `packet-18.md`
- previous response: `response-29.md`
- review gate: `PLAN`
- continuous execution: false
- terminal gate: `PLAN`
- execution authority: read-only repository inspection, GPT Pro discussion, local planning records, and final report only
- excluded authority: product/test edits, Object/Daily/Region writes, provider calls, runtime QA, commit, push, release, permissions, and destructive actions
- transport: same authenticated `Prodigy OS Making` Auction/Region conversation

## Approval scope and redaction

- destination: authenticated ChatGPT Project `Prodigy OS Making`
- data categories: redacted repository contracts, file/symbol names, derived field semantics, and planning decisions
- excluded: note bodies, real Object contents, addresses, case numbers, raw provider bodies, credentials, API keys, environment values, and unrelated personal history

## User goal

The user explicitly wants AI to summarize and judge a current auction using their own won/lost/skipped history, their bid prices, official winning prices, and regional/property-type comparisons. The final decision remains theirs. They now request one more architect debate and a final implementable plan, not implementation.

## Verified repository facts

1. `SYSTEM/Views/auction-decision-mirror-core.js`
   - snapshots historical Auction fields and excludes the current path/id;
   - recognizes `auction_outcome` values `won|lost|skipped` only with a real `auction_result_date`;
   - requires a positive `winning_bid_price` for `won|lost`;
   - computes `bid_rate_percent = winning_bid_price / appraisal_price * 100`;
   - currently reports only an arithmetic average and marks fewer than 3 rates as `small`.
2. `SYSTEM/SCRIPTS/region-metrics-note-core.js` and the Region contract intentionally require `auction_bid_rate_6m` to remain `null/n/a` in v1. Therefore the AI layer must not pretend that Region Metrics currently supplies a canonical regional auction ratio. Any current regional auction ratio must be derived from verified Auction histories with explicit cohort and cutoff.
3. `SYSTEM/Views/auction-card.js` already provides direct human editing for `expected_bid` and `my_opinion`; `SYSTEM/Views/auction-day-core.js` owns explicit `my_bid_price` and result recording flows.
4. `SYSTEM/Views/auction-source-approval-writer.js` is only for approved external facts and must not be reused for AI judgment.
5. `SYSTEM/Views/auction-real-estate-research.js` already resolves configured Codex/Antigravity providers and requests a narrow Korean research summary, but its current schema is only `summary/key_points/cautions` and explicitly bans investment judgment or bid inference.
6. The current Auction card has one `판단 보드` entry. Region context is read-only and neutral through `region-decision-context-core.js`; the current research modal separately handles provider packages, identity, hashes, and fact approval.

## Proposed normative data contract

### A. Analysis identity and time boundary

Every run has:

```js
{
  analysis_id,
  current_auction_path,
  current_object_fingerprint,
  analysis_mode: "pre_auction" | "post_auction_review",
  analysis_as_of,
  cohort_policy,
  calculator_version,
  prompt_version,
  model_id,
  generated_at
}
```

- `pre_auction` always excludes the current Auction regardless of whether a later outcome exists.
- Historical evidence is eligible only when its official result date and source observation are not later than `analysis_as_of`.
- A draft whose path or fingerprint no longer matches is viewable as stale but cannot be applied.

### B. Outcome semantics

- `won`: `auction_outcome=won`, valid result date, positive official winning price.
- `lost`: `auction_outcome=lost`, valid result date, positive official winning price, and positive `my_bid_price`; status alone never creates a loss.
- `skipped`: `auction_outcome=skipped` or explicit user skip/withdrawal; kept in a separate reasoning cohort and excluded from outcome-rate and bid-gap metrics.
- terminal `status` without a valid outcome tuple is unresolved and excluded.
- duplicate canonical path/id is counted once; identity conflicts fail closed.

### C. Cohort policy

Default cohort: exact `region_sido + region_sigungu + property_type`, result date within a declared period, verified outcome only.

- No silent widening.
- If the exact cohort is too small, show the shortfall and offer explicit user choices such as same sigungu/all property types or same sido/same property type.
- Every result shows cohort fields, period, included count, excluded count by reason, and source paths internally.
- `region_dong` is a micro-location warning/filter, never silently substituted for a statistically meaningful region.

### D. Deterministic calculations

Canonical winning-bid ratio is exactly:

```text
winning_bid_ratio = winning_bid_price / appraisal_price * 100
```

Eligibility requires both values to be positive. Missing values remain missing.

- `n=0`: no ratio summary or range.
- `n=1..2`: individual examples only; no range.
- `n>=3`: count, min, median, max, and deterministic Q25/Q75 using one documented quantile algorithm.
- Personal bid-gap metrics use only `lost` cases with both `my_bid_price` and official winning price, and are shown separately from market/cohort ratios.
- `skipped` contributes only to qualitative decision-pattern evidence, not price statistics.

Proposed scenario references:

```text
conservative_reference = current_appraisal_price * cohort_Q25_ratio
baseline_reference     = current_appraisal_price * cohort_median_ratio
aggressive_reference   = current_appraisal_price * cohort_Q75_ratio
```

These are competition reference prices, not fair value or safe maximum bids. If the repository later gains a complete deterministic cost/profit ceiling, each reference may be capped by that ceiling. Until then, exit price and rent assumptions are shown as separate constraints and AI must not claim that the references satisfy profitability.

### E. AI output and clear recommendation

The output keeps the six approved sections from response 29, but adds a compact headline:

```js
{
  headline: {
    action: "보류 우선" | "추가 조사 후 재판단" | "보수 시나리오 검토" | "기준 시나리오 검토",
    primary_reference: null | { low, high, basis },
    reason,
    counterevidence,
    confidence: "low" | "medium"
  },
  verified_facts,
  deterministic_calculations,
  ai_interpretation,
  bid_scenarios,
  ai_suggestion,
  limitations,
  evidence_refs
}
```

The AI may select one clear headline action and explain it. It may not invent or alter numeric calculations. `primary_reference` exists only when a deterministic range is eligible; otherwise it is null. Banned claims remain: guaranteed win, success probability, confirmed fair value, good investment, mandatory bid, rank, or score.

### F. Persistence and privacy

- Run requires an explicit `AI 판단 보조 실행` action and a visible transfer preview.
- External projection contains only non-identifying case key, structured numbers, coarse region/property type, dates, verification/freshness, selected redacted evidence, and aggregate history.
- No real note body, raw provider response, secret, unnecessary address/case number, or unrelated history is sent.
- The advisory draft is session-only for MVP. A reproducible cache may be a later phase only after a cache contract is approved.
- Execute/preview/cancel/discard performs zero Vault writes.
- The user may copy or edit exact AI text/value into existing human-owned controls. No new writer and no schema change in MVP.

## Proposed implementation order

1. **Decision-support foundation first, in parallel with provider reality only at the planning boundary.** The foundation uses already verified Auction history and current neutral Region facts, so it does not need to wait for all five providers. One-provider live reality remains a separate prerequisite for claiming current research completeness.
2. Add pure projection/calculation modules and tests without AI calls.
3. Add the read-only AI panel inside the existing `판단 보드`, using the existing AI provider service but a dedicated strict schema/prompt.
4. Preserve the separate `부동산 조사` modal for source acquisition and fact approval; the decision panel consumes only approved/verified projections and reports missing provider coverage.
5. Dogfood, then expand live providers and add any bounded cache only if usage proves value.

## Architect decisions required

1. Is the explicit headline recommendation contract acceptable, or must the product remain scenario-only?
2. Is `Q25/median/Q75 × current appraisal` the right first deterministic scenario reference, clearly labeled as competition reference rather than valuation?
3. Should the data foundation now precede the one-provider vertical slice, run as the first local slice while provider reality remains a separate trust milestone, or retain response 29's provider-first ordering?
4. Is session-only draft storage the right MVP boundary?
5. Return a concrete final phase plan with exact existing/new file roles, named test areas, per-slice acceptance criteria, and rollback boundaries. Do not authorize implementation.

## Required response format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Headline recommendation verdict:
Calculation contract verdict:
Phase-order verdict:
Normative data-contract corrections:
Exact implementation slices:
Acceptance-test matrix:
Risks and safeguards:
Rejected alternatives:
Next packet request:
