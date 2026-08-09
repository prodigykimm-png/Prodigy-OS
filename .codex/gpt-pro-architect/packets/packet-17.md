# Architect Packet 17 — AI 판단 보조 허용 범위 검토

## Metadata

- date: 2026-08-02 Asia/Seoul
- topic: `auction-region-ai-decision-support-20260802`
- previous topic: `auction-region-next-direction-20260802`
- review gate: `PLAN`
- execution authority: GPT Pro discussion, local planning records, and report only
- excluded authority: code/test edits, Object/Daily/Region writes, provider calls, runtime QA, commit, push, release, permissions, and destructive actions
- transport: same authenticated `Prodigy OS Making` project conversation

## User position to review

The user does not consider AI-generated real-estate summaries or judgments inherently undesirable. They explicitly accept the decision risk and want AI to use:

- the user's historical won, lost, and withdrawn auction data;
- the user's bid price and the observed winning bid price;
- regional and property-type average winning-bid ratios;
- current Auction and Region evidence;

to explain and suggest how to view the current auction.

The desired product is therefore not a facts-only viewer. It should provide an AI decision-support layer inside Obsidian while keeping the user's final decision under explicit control.

## Current contracts to preserve

- k-skill is a pinned, replaceable acquisition layer, not the ledger.
- Provider identity must be exact; ambiguous or mismatched identity cannot produce an applicable candidate.
- Raw/package SHA-256 and current Auction Object fingerprint gates remain active.
- `status`, `expected_bid`, `my_bid_price`, `decision_reason`, and `my_opinion` are user-owned unless the user explicitly approves a write through the existing writer.
- Region Metrics and Region Experience remain distinct; Region remains a neutral evidence source.
- Dates alone cannot infer outcome or winning price.
- No automatic approval, status/lifecycle change, outcome inference, bid-price write, Region Metrics overwrite, or recommendation-as-fact.
- No note opening is required for the main desktop flow.

## Decision question

Should the plan be revised from “AI read-only summary / Region confirmation questions only” to an explicit **AI decision-support layer** that may present a reasoned recommendation or bid-range scenario, grounded in the user's historical outcomes and regional benchmarks, provided that:

1. facts, calculations, inferences, and recommendations are visually separated;
2. every material claim has source, date, property type, sample size, and freshness context;
3. `포기` is never silently classified as `패찰`;
4. a pre-auction analysis cannot use the current auction's future outcome;
5. the AI output remains a draft/advisory result until the user reviews, edits, and explicitly applies it through the existing writer;
6. the user can see why the AI reached its conclusion and which data is missing or weak.

## Alternatives to debate

1. Keep AI as a neutral summary only.
2. Allow AI decision support with explicit approval, provenance, uncertainty, and scenario ranges.
3. Allow AI to automatically write recommendations or bid values into Auction fields.
4. Create a separate persistent AI score/ranking layer for Auctions or Regions.

Challenge the assumption that user acceptance alone removes all product risks. Distinguish acceptable decision risk from integrity, data leakage, sample bias, stale evidence, and accidental canonical writes.

## Required response format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Position on AI judgment:
Approved AI output contract:
Data eligibility and exclusions:
User approval and persistence flow:
Required evidence and tests:
Risks and safeguards:
How this changes the next-phase order:
Next packet request:
