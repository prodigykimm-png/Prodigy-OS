# Architect Packet 22

## Metadata
- repo: Prodigy OS
- packet date: 2026-08-03 Asia/Seoul
- topic: Auction/Region decision support — external market insight policy
- review gate: PLAN
- implementation authority: none; discussion and report only

## Approval Scope
- destination: existing authenticated ChatGPT Project `Prodigy OS Making` conversation
- data categories: one public Instagram post's claims and redacted product-contract summary
- excluded: actual Auction Objects, addresses, case numbers, personal notes, API keys, secrets, raw user history, implementation diffs

## Public Source Claim
The user linked an Instagram carousel by `gyudongsan`, slide 6. The post argues:

1. Busan sale prices and jeonse prices move together.
2. Therefore, monitoring KB's monthly jeonse supply-demand index can predict the direction of sale prices.
3. The author says this single index is sufficient to understand current market mood and buy/sell timing.
4. A high/rebounding index plus low jeonse listings and low future move-in supply is interpreted as positive for future sale prices.
5. The author forecasts a prolonged gradual upward/strongly firm market rather than a short spike, especially in core school districts and the Daenam line.

The post explicitly labels part of this as the author's own opinion.

## Existing Prodigy Boundary
- Region facts and official time series are preserved separately from interpretation.
- AI decision support may summarize verified facts and offer bounded advisory judgment.
- User Auction outcomes and Region metrics can support decisions, but AI must expose sample, date, freshness, cohort, and uncertainty.
- No single metric may silently become a canonical recommendation, bid value, automatic status, or automatic write.
- External commentary should not overwrite Region Metrics.

## Decision Needed
Debate whether this insight is too personal to use in Prodigy OS and define the smallest useful integration.

Please answer all of the following:

1. Which parts are measurable hypotheses, which are personal inference, and which are overclaims?
2. Is `전세수급지수 하나면 충분하다` defensible for Busan? Challenge it with confounders such as rates, credit, sale inventory, supply pipeline, unsold inventory, transaction volume, submarket heterogeneity, methodology changes, and lead/lag instability.
3. Should Prodigy store this as a `Region Experience`, an external thesis/evidence candidate, a deterministic indicator, or reject it?
4. Propose a user-friendly UI that applies the useful idea without presenting it as truth.
5. Define a minimum evidence contract and invalidation conditions.
6. Give a final PLAN decision: APPROVE, REVISE, or BLOCK.

## Required Response Format
Decision: APPROVE | REVISE | BLOCK
Core judgment:
Measurable facts:
Personal inferences:
Overclaims:
Recommended Prodigy representation:
Minimum evidence contract:
User-facing UI:
Invalidation conditions:
Rejected alternatives:
Final implementation boundary:
