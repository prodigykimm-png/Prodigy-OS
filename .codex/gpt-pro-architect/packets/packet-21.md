# Architect Packet 21 — Auction AI 판단 보조 최종 PLAN 판정

## Metadata

- date: 2026-08-03 Asia/Seoul
- topic: `auction-region-ai-decision-support-20260802`
- previous packet: `packet-20.md`
- previous response: `response-31.md`
- review gate: `PLAN`
- continuous execution: false
- terminal gate: `PLAN`
- execution authority: same-thread GPT review, local plan records, and final user report only
- excluded authority: implementation, test edits/execution, Object/Vault writes outside planning records, live provider calls, runtime QA, commit, push, release

## Final normative product contract

### User outcome

Inside the existing Auction `판단 보드`, the user can open one `AI 판단 보조` drill-down, inspect deterministic evidence and calculations without AI, review what a configured Codex/Antigravity provider will receive, click once to generate a clear bounded AI opinion, and either discard it or return to existing human-owned card editing. No note needs to be opened and no AI result is silently saved.

### Headline

The result is explicitly labeled `AI 의견` and chooses one:

```text
입찰 보류 검토
추가 조사 후 재판단
보수 시나리오 검토
기준 시나리오 검토
```

- No deterministic scenario: only the first two are allowed.
- Exact default cohort `n>=5` plus positive current appraisal: all four are allowed.
- Widened cohort only: only the first two; no `primary_reference`.
- Identity/hash/fingerprint failure: AI generation blocked.
- Every headline requires reason, counterevidence, valid evidence refs, and deterministic `evidence_strength: 제한적|보통`.
- No confidence probability, single exact recommended bid, fair value, win probability, score, rank, guaranteed outcome, or automatic application.

### Deterministic data rules

- Live current-time analysis only: `analysis_as_of = generationStartedAt`; no arbitrary historical cutoff or backtest claim.
- Current Auction is always excluded from historical cohort. Post-review current result is a separate section only.
- Valid market outcomes: verified canonical won/lost tuples. Skipped is separate and unresolved/status-only cases are excluded.
- Market ratio: positive `winning_bid_price / appraisal_price * 100`; never `minimum_bid`; never Region `auction_bid_rate_6m`, which remains `null/n/a`.
- Personal lost gap: lost cases with positive personal and official bid prices, preserving signed difference.
- Personal won experience: count, valid ratios, price consistency, and local opaque reason refs; no win-rate/probability or auto-adjustment.
- Default cohort: NFC+trim exact `region_sido + region_sigungu + property_type`, declared result period, verified outcome.
- No alias/fuzzy mapping. Show other property strings/exclusion counts. All-property-types widening is explicit and separate.
- `n=0`: no statistics/range; `n=1–2`: cases only; `n=3–4`: min/median/max; exact `n>=5`: Type 7 Q25/median/Q75 and competition references.
- Competition references are current appraisal × cohort Q25/median/Q75 and never called valuation, safe bid, profitability ceiling, or likely winning price.

### Privacy, consent, persistence

```text
판단 보드
→ AI 판단 보조
→ deterministic preview
→ expandable AI transfer disclosure
→ optional personal excerpt checkbox (off)
→ one AI 의견 생성 click
→ session-only draft
→ discard or return to human edit
```

- The click is the run-level opt-in; no second blocking dialog.
- Default external payload is aggregate/redacted with opaque refs. No real case number, detailed address, note/raw body, source path, secret, or unrelated history.
- User-authored personal excerpts are local-only unless specifically selected in the disclosure.
- Strict JSON schema; all refs and all numeric values are verified locally. Any mismatch invalidates the AI draft while deterministic preview remains.
- No writer, schema, cache, telemetry, analytics, event log, or hidden persistence in MVP.

## Final ordered implementation plan

### Phase 1 — Decision-support data foundation

Add `SYSTEM/Views/auction-decision-support-core.js` with:

```js
buildAuctionDecisionDataset(input)
selectAuctionDecisionCohort(dataset, policy)
summarizeWinningBidRatios(cohort)
summarizePersonalLostBidGaps(cohort)
summarizePersonalWonHistory(cohort)
buildCompetitionReferences(summary, currentAuction)
buildDecisionSupportProjection(input)
```

Reuse `AuctionDecisionMirrorCore.snapshotAuctionCases()` and canonical path/id semantics. Reuse `normalizeAuctionIdentity(...).query_fingerprint`; do not invent a second fingerprint. Pure module only: no I/O, UI, AI, or writer.

Tests: new `test_auction_decision_support_core.js` for outcome eligibility, current exclusion, dedupe/fail-closed identity, current-only time, exact/widened cohort, property fragmentation, all sample bands, Type 7 fixtures, ratios, signed lost gap, won summary, skipped separation, missing values, and no Region-null substitution.

Rollback: remove the new pure module and caller; no migration.

### Phase 2 — Deterministic judgment-board preview

Modify `SYSTEM/Views/auction-region-packet.js` at `RegionPacketModal.onOpen()` to add exactly one `AI 판단 보조` action in the existing `상세 및 기록` group. The drill-down shows cohort, exclusions, market ratios, personal lost gap, personal won experience, scenario eligibility, research coverage, Region freshness, and limitations before any AI call.

Modify `HUB/10 Auction.md` only to load new modules in dependency order. Do not add a second Auction card CTA or repeat card basics.

Tests: extend `test_auction_region_packet.js` and `test_auction_popup_loader.js`; add deterministic no-provider/zero-request behavior, one action only, compact/mobile-width structure, and return-focus coverage.

Rollback: remove action and loader entries; pure foundation can remain unused.

### Phase 3 — Shared Auction AI provider resolver

Add `SYSTEM/Views/auction-ai-provider-resolver.js` exposing `resolveAuctionAiProvider(...)` over public `ProdigyConfigService` and `AIProviderService` APIs. It only selects an available Auction provider; it never requests, reads/copies secrets directly, saves config, or becomes a global AI framework.

Replace private selection in `auction-real-estate-research.js` with this shared resolver without changing the existing research prompt/schema.

Tests: new `test_auction_ai_provider_resolver.js` plus existing research tests for default/Codex/Antigravity order, unavailable state, shared use, and zero secret/config writes.

Rollback: restore the private research resolver and remove the new module; no data impact.

### Phase 4 — One-provider reality trust milestone

Using existing collector/package/identity/hash/fingerprint/source-writer boundaries, validate one directly reachable official provider through success or an honest unavailable/failure state. Preserve partial success, exact matching, Korean retry/recovery, and no automatic approval. This phase improves current-evidence coverage but is not fused with AI judgment.

Tests: existing provider fixture/contract suites and one opt-in live smoke scenario when credentials/access exist. A fixture pass is not reported as live success.

Rollback: provider-specific change only; decision-support foundation remains valid.

### Phase 5 — AI strict contract and session UI

Add `SYSTEM/Views/auction-ai-decision-support-core.js`:

```js
buildDecisionSupportPromptInput(projection)
validateDecisionSupportDraft(output, projection)
resolveDecisionSupportEvidenceRefs(output, evidenceMap)
```

Add `SYSTEM/Views/auction-ai-decision-support.js` for disclosure, optional excerpt selection, one-click request through the shared resolver/`requestStructuredJson`, six-section rendering plus headline, stale fingerprint, cancel/discard, and return to existing human editing.

Do not change `auction-source-approval-writer.js`, `auction-day-core.js`, Auction/Region schemas, lifecycle/outcome writers, or the research summary contract.

Tests: new core/UI tests for schema, action eligibility, redaction, prompt injection, unknown refs, changed numbers, banned language, personal excerpt consent, AI unavailable fallback, exactly one request, zero write, zero telemetry/cache, stale/cross-case draft, discard, and human-edit return.

Rollback: remove AI orchestration/core and loader/action hookup; deterministic preview remains.

### Phase 6 — Full regression, actual Obsidian QA, manual dogfooding

- Run the complete Auction/Region regression suite and property contract audit.
- Desktop and compact/mobile-width Obsidian QA: all sample bands, fragmented property types, won-only/lost-only/mixed/skipped, stale Region, provider unavailable, disclosure closed/open, excerpt off/on, generation, invalid response fallback, discard, fingerprint stale, return focus, and manual human edit.
- Dogfooding uses a manual checklist only. Do not add telemetry or cache.
- Only after repeated value and a separate approved contract may provider expansion, advisory cache, bitemporal observation, or bounded background collection be considered.

## Completion gate

Implementation is complete only when deterministic calculations remain useful without AI, all AI outputs are locally validated and session-only, live provider status is reported honestly, protected writers/schemas are unchanged, and actual Obsidian interaction passes with stated mobile/live-access limitations.

## Final decision request

Return one final decision for this exact `PLAN` only. Do not add another feature or authorize implementation.

## Required response format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Final rationale:
Approved product contract:
Approved phase order:
Mandatory safeguards:
Implementation blockers, if any:
Explicitly deferred:
Next action after this PLAN:
FINAL_PLAN_VERDICT: APPROVE | REVISE | BLOCK
