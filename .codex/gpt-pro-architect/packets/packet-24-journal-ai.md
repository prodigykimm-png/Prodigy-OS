# Architect Packet 24 — Journal Period AI

## Metadata
- repo: Prodigy OS vault (`Dusk`)
- branch: `codex/journal-codex-exec`
- commit: `2d164f5` (focused Journal changes are uncommitted)
- packet date: 2026-08-03 Asia/Seoul
- previous packet: none for this topic; fresh project conversation requested by the user
- current goal: decide how AI review should be introduced into Monthly, Quarterly, and Yearly Journal periods
- review gate: `PLAN`
- continuous execution: false
- terminal gate: `PLAN`
- execution authority: read-only repository inspection, GPT Pro discussion, local architecture records, and final report
- excluded authority: product/test edits, Prodigy AI provider calls, Journal/Object/Knowledge writes, runtime QA, commit, push, release, permission changes, and destructive actions
- stop conditions: obtain and save a final `PLAN` decision; do not implement it

## Approval Scope
- destination: ChatGPT Project `Prodigy OS Making`, a new dedicated conversation
- transport: authenticated ChatGPT browser UI
- model target: visible `Pro` account/picker when available
- data categories: redacted repo architecture summary, file/symbol names, current Journal contracts, and design questions
- excluded: secrets, `.env`, credentials, real Daily/Weekly/Monthly contents, personal identifiers, addresses, unrelated worktree changes, screenshots, and raw personal notes

## Architect Contract

You are the GPT Pro Architect for this Codex session.

- Do not implement code.
- Judge product scope, interfaces, state transitions, data contracts, tests, risks, and rollout order.
- Be blunt, reject weak work, and keep scope tight.
- Do not invent facts outside this packet.
- Return `Decision: APPROVE | REVISE | BLOCK` and `Gate reviewed: PLAN`.
- Name period-specific inputs, outputs, human gates, persistence, tests, and rollout slices.

## Existing Repo Contract

Canonical operating model: `SYSTEM/docs/Journal_Operating_Model.md`.

1. Journal periods are question filters, not merely longer time windows:
   - Daily: “오늘 무엇이 나를 변화시켰는가?”
   - Weekly: “무엇이 반복되고 무엇을 배웠는가?”
   - Monthly: “어떤 변화가 실제로 검증되었는가?”
   - Quarterly: “지금 방향은 맞는가?”
   - Yearly: “나는 어떤 사람이 되어가고 있는가?”
2. `AI Assists. Humans Decide.` Pattern detection, summarization, and proposals may be AI-assisted. Save, validation, adoption, promotion, and consequential updates remain human-owned.
3. Upward flow: Experience → Daily Evidence → Weekly Pattern/Learning/Suggested Principle → human Monthly validation → Knowledge Candidate → human Knowledge approval → Yearly Identity Lens update.
4. Quarterly Direction Change is strategy realignment outside the Knowledge promotion chain.
5. Current UI already supports period navigation and historical record viewing for Monthly, Quarterly, and Yearly.

## Current Implemented Behavior

### Daily
- Files: `daily-reflection-ai.js`, proposal contract, review UI, Journal store.
- The user explicitly requests AI analysis from entered reflection text.
- AI proposes structured Evidence blocks; the user edits and selects what is saved.
- AI does not complete the Daily, approve Evidence, or promote Knowledge.

### Weekly
- Files: `weekly-filter-core.js`, `weekly-filter-ai.js`, `weekly-filter-view.js`, `weekly-review-store.js`.
- Deterministic review is built first from Daily Evidence.
- AI runs only when the user presses `AI 학습 분석`.
- Structured output includes interpreted patterns, learning, next-week direction, suggested principles, and Evidence references.
- Failure preserves the deterministic review.
- The user separately presses `주간 리뷰 저장`.

### Monthly
- Files: `monthly-validation-core.js`, `monthly-validation-store.js`, `monthly-validation-view.js`.
- Readiness requires at least two completed Weekly notes and a Suggested Principle supported by distinct weeks.
- The human marks each Principle `validated`, `rejected`, `deferred`, or `pending`, enters validation reason/knowledge statement, saves the Monthly note, and creates `source_type: monthly_validation` Knowledge Candidates only from human-validated decisions.
- Formal Knowledge promotion remains a separate human approval.
- No Monthly AI review is implemented.

### Quarterly and Yearly
- Files: `journal-period-core.js`, `journal-period-store.js`, `journal-period-view.js`.
- They currently expose period navigation, readiness counts, historical record listing, and record opening.
- Quarterly contract: input = Validated Principles; operation = strategy alignment; output = Direction Change; gate = human realignment.
- Yearly contract: input = period Directions; operation = identity reflection; output = Identity Lens update; gate = explicit system-setting application.
- No review engines, structured schemas, stores/writers, or human-approval UIs exist yet.

## Hard Invariants

- Opening a Journal tab must never trigger an AI/network request.
- Deterministic facts, counts, source period, and references render before AI.
- AI output is advisory and cannot silently alter numeric facts, source records, Evidence, Principles, Knowledge, Directions, Identity Lens, settings, or protected properties.
- Missing/sparse Evidence remains missing; AI may ask questions or mark uncertainty, not fill gaps with invented conclusions.
- Source records remain immutable during review.
- Provider failure/cancellation leaves deterministic content and retry available.
- Use existing `AIProviderService` and provider configuration; do not create a parallel generic AI framework.
- Period-specific semantics must not collapse into one generic “summarize everything” prompt.
- No background review, auto-save, auto-promotion, cache, telemetry, or scheduled execution in the first release.
- User-facing labels are Korean; internal property/schema keys are English snake_case.

## Draft Proposal To Challenge

### Monthly: `AI 검증 보조`
- Available only after existing readiness passes.
- Inputs: completed Weekly reviews in the selected month, Suggested Principles, Evidence references, and deterministic recurrence/readiness facts.
- Outputs: evidence-for/evidence-against map, missing Evidence, contradiction/exception, validation questions, proposed validation rationale, and next-month direction draft.
- AI must not set `validated/rejected/deferred`, create a Candidate, or save the Monthly note. Human decisions remain in the existing Monthly validation screen.

### Quarterly: `AI 방향 점검`
- Inputs: selected quarter’s completed Monthly reviews, human-validated Principles, approved Knowledge where explicitly connected, and prior quarter Direction if present.
- Outputs: continue/stop/start candidates, tensions between principles and outcomes, assumptions to re-check, proposed Direction Change text, counterevidence, and missing Evidence.
- Result is a session draft. Human edits and explicitly saves a Quarterly record. It never changes Projects, Areas, goals, or priorities automatically.

### Yearly: `AI 정체성 성찰`
- Inputs: completed Quarterly Directions, adopted Direction changes, approved Knowledge explicitly referenced by those Directions, and the current Identity Lens snapshot.
- Outputs: continuity/change/tension analysis, evidence-backed candidate lens statements, beliefs to retire, uncertainty, and a proposed before/after lens diff.
- Result is a session draft. Saving Yearly review and applying Identity Lens/settings are separate human actions. First release may stop at saving the review and defer settings application.

### Shared shell, dedicated contracts
- Reuse one minimal period-review UI state shape: deterministic → ready → AI running → AI draft → human edited → explicit save, including cancel/error/retry.
- Use three dedicated schemas/prompts and period-specific stores. Share only provider resolution, provenance shape, error handling, and truly repeated controls.

### Proposed rollout
1. Monthly AI assistance within the existing validation screen.
2. Use with real records and audit whether Evidence/counterevidence presentation affects human decisions.
3. Add Quarterly review only after completed Monthly records exist across enough months.
4. Add Yearly review only after completed Quarterly Direction records exist; initially review-only, Identity Lens apply deferred.

## Questions Requiring Decision

1. Is Monthly → Quarterly → Yearly correct, or should a thin slice across all three periods come first?
2. What readiness threshold should open Quarterly and Yearly AI? Distinguish hard safety threshold from warning.
3. Which inputs are canonical? May Quarterly read linked approved Knowledge, and may Yearly read current Identity Lens, or should each consume only the immediately preceding Journal period?
4. What structured output keeps the three questions semantically distinct?
5. Should AI output remain session-only until the whole review is saved, or should an explicit AI-draft artifact exist?
6. What minimum safe persistence contract should Quarterly/Yearly records use, including overwrite/versioning and provenance?
7. Should Yearly v1 stop at review artifact or include a separate explicit Identity Lens application step?
8. Which shared components are justified without creating a speculative generic framework?
9. Which automated tests and actual Obsidian QA scenarios are required for each rollout slice?

## Required Response Format

Decision: `APPROVE | REVISE | BLOCK`

Gate reviewed: `PLAN`

Rationale:

Accepted design:

Required changes:

Period contracts:
- Monthly:
- Quarterly:
- Yearly:

Shared versus dedicated components:

Readiness and sparse-data behavior:

Persistence and human-approval boundaries:

Ordered implementation slices:

Automated-test matrix:

Actual Obsidian QA matrix:

Risks/missing Evidence:

Next packet request:

Final marker: `FINAL_PLAN_VERDICT: APPROVE | REVISE | BLOCK`
