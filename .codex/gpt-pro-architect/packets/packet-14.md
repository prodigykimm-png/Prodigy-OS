# Architect Packet 14 — 다음 단계 방향성 검토

## Metadata

- date: 2026-08-02 Asia/Seoul
- repo: Prodigy OS Vault (redacted summary only)
- branch: `codex/journal-codex-exec`
- reviewed commit: `2d164f5cd7a89e687cfab66fd5655554e127af7a`
- previous packet: `packet-13.md`
- topic: `auction-region-next-direction-20260802`
- review gate: `PLAN`
- continuous execution: `false`
- terminal gate: `PLAN`
- execution authority: read-only review, GPT Pro discussion, architecture report only
- excluded authority: code/test edits, Object/Daily/Region writes, external provider calls, runtime QA, commit, push, release, permission changes, and destructive actions

## Approval Scope

- destination: existing authenticated ChatGPT Project `Prodigy OS Making`
- transport: exact existing project conversation in the Codex in-app browser
- data categories: redacted implementation summary, contracts, test results, known limitations, and product-direction questions
- excluded: secrets, `.env`, API keys, credentials, private note bodies, real Object/Daily contents, personal data, and unrelated dirty worktree changes

## Architect Contract

You are the GPT Pro Architect for this Codex session. Do not implement code. Judge the next product and architecture direction bluntly, keep scope tight, and challenge assumptions. Return:

1. the best next phase and why;
2. a comparison of the realistic alternatives;
3. the exact order of the next phases;
4. what must not be automated;
5. acceptance criteria and evidence needed before implementation;
6. risks, deferred work, and the smallest safe first slice.

The user requested a discussion and a report only. Do not authorize implementation, commits, release, or data writes.

## Current Product Goal

Make the Auction and Region workspaces usable without opening notes: a user should be able to inspect facts, investigate an auction, understand Region context, compare evidence, and approve only intentional Object changes inside Obsidian surfaces.

## Current Implemented Baseline

### Auction and Region UX

- One primary Auction entry point: `판단 보드`.
- `부동산 조사` is a secondary research surface, not a duplicate card view.
- Region is neutral, reusable context; Auction remains the decision and approval surface.
- Region Detail exposes grouped facts and bounded absolute comparisons.
- Region-to-Auction navigation preserves the region scope and focuses the selected known auction case in the Auction Hub.
- Existing lifecycle, user judgment, Auction writer, Region Metrics, and Object schema boundaries remain protected.

### k-skill bridge

- The full k-skill repository is not installed as the data ledger.
- Five selected skills are pinned in `SYSTEM/CONFIG/k-skill-real-estate-lock.json` with repository commit, package versions, and skill-file hashes:
  - `court-auction-notice-search`
  - `building-register-search`
  - `real-estate-search`
  - `housing-official-price`
  - `gongsijiga-search`
- The Prodigy-owned desktop runner invokes the fixed collector `SYSTEM/SCRIPTS/real-estate-source-collect.js`.
- The default is direct official-source lookup. Proxy use is explicit per run.
- A collection produces immutable-time-stamped raw files and `package.json` under `SYSTEM/CACHE/real-estate-source-packages/`.
- Canonical identity resolution precedes provider calls. Only unique exact identity matches can create an applicable candidate field.
- Package and raw SHA-256 checks, current Object fingerprint checks, provider match checks, and the existing approval writer gate candidate application.
- Partial provider failure preserves useful raw/evidence state; it does not silently become a complete result.
- `status`, user bid/judgment fields, and lifecycle outcome are not automatically changed.
- AI summaries from Codex/Antigravity are optional read-only presentation; they are not authoritative package or Object writes.

### Current automation behavior

- This is on-demand desktop automation: user opens the research modal and presses `자동 조사 실행`.
- The UI does not perform arbitrary network calls or arbitrary agent commands; the local runner starts the pinned collector with restricted arguments/environment.
- Mobile and non-process environments expose a copyable command rather than executing the collector.
- There is no scheduled/background collection, automatic approval, or automatic judgment/recommendation.

## Evidence

- Auction-focused automated suite: 76 test files passed, exit code 0, before the reviewed commit.
- Existing tests cover provider fixtures, canonical identity resolution, partial success, package/raw hash validation, candidate apply gates, runner environment restrictions, navigation, neutral Region UI, and exact selected-case focus.
- Desktop Obsidian QA confirmed the Region Detail → connected auction → filtered Auction Hub → exact card focus/highlight path.
- The k-skill lock and package contract are present locally.

## Known Limitations

- No live provider/network smoke test has been run; authentication, quotas, source availability, and real response-shape drift are not proven.
- The five provider adapters are contract/fixture-backed, but real-world identifier coverage and source-specific failure recovery are not yet proven.
- No physical 375px mobile/touch/keyboard QA has been completed.
- There is no background scheduler or bulk collection flow.
- Region data is currently useful as neutral context and comparison evidence, but it is not yet a compact decision brief that clearly tells the user what to inspect next without creating a recommendation engine.
- The worktree contains unrelated dirty changes; they are excluded from this review.

## Decision Needed

After the current desktop UX and pinned k-skill bridge are implemented, what should be the next phase for maximum user value and reliability?

Compare at least these options:

1. **Provider reality phase:** live opt-in smoke tests, identifier coverage, API/source health, and provider-specific retry/failure UX.
2. **User-flow phase:** make the one-click investigation path more automatic and friendly, including selection recovery and compact Korean evidence presentation.
3. **Region decision phase:** turn existing Region facts/comparisons into a bounded, neutral decision brief that helps the user decide what to investigate for an Auction, without scores, rankings, recommendations, or automatic judgment.
4. **Background automation phase:** scheduled or bulk collection and freshness alerts.

The recommendation must explicitly decide whether background automation is premature, how Region should influence Auction decisions without becoming an opaque recommendation engine, and which evidence gate must precede any broader automation.

## Required Response Format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Best next direction:
Alternative comparison:
Ordered phases:
Non-automatable boundaries:
Smallest safe first slice:
Acceptance criteria and evidence:
Risks/deferred work:
Next packet request:
