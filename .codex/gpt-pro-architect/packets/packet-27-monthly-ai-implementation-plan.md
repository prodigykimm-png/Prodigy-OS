# Architect Packet 27 — Monthly AI Coder-Ready Implementation Plan

## Metadata
- repo: Prodigy OS Obsidian Vault
- branch: `codex/journal-codex-exec`
- commit: `2d164f5` plus a very dirty shared worktree; do not infer ownership of unrelated changes
- packet date: 2026-08-03 Asia/Seoul
- previous packet: `packets/packet-25.md`
- current goal: turn the approved broad Journal AI architecture into one exact, minimal, coder-ready Monthly implementation plan
- review gate: `PLAN`
- continuous execution: false
- terminal gate: `PLAN`
- execution authority: read-only repo inspection, this GPT discussion, local plan/ledger records, and final report
- excluded authority: product or test edits, provider calls, Vault Journal/Object/Knowledge writes, runtime QA, commit, push, release
- stop condition: return one approved Monthly plan; do not implement it

## Approval Scope
- destination: the exact existing `Prodigy OS Making` Journal AI conversation
- transport: authenticated ChatGPT UI, same conversation
- data categories: redacted file/symbol names, implementation contracts, synthetic examples, test names/results
- excluded: real Daily/Weekly/Monthly contents, personal identifiers, unrelated diffs, secrets, credentials, provider keys, screenshots

## Architect Contract
You are the GPT Pro Architect. Do not implement code. Judge and author the smallest correct plan, reject overengineering, and do not invent repository facts. This is `PLAN` only and never grants implementation authority.

## Canonical Prior Decision
Round 35 is `APPROVE` at `PLAN` for this sequence:
1. Monthly bounded Evidence projection and explicit AI inside the existing Monthly validation screen.
2. Quarterly human foundation, then Quarterly AI.
3. Yearly human foundation, then review-only Yearly AI.

Monthly invariants already approved:
- existing readiness remains: at least two completed Weekly records and one Principle repeated across two weeks; no `question_only` mode;
- AI input is selected-month structured Daily Evidence only, never raw Daily body, other-month Evidence, global Knowledge, unrelated Objects, Quarterly, or Yearly;
- projection fields: `evidence_id`, `date`, `context`, `experience`, `interpretation`, `change`, `next_experiment`;
- AI may propose evidence review, counterevidence/exceptions, gaps, questions, rationale draft, and next-month direction draft;
- every output Evidence ref resolves to an ID in the submitted projection;
- AI cannot choose `validated/rejected/deferred/pending`, write a knowledge statement, save Monthly, create/promote Knowledge Candidate, or modify source Evidence;
- explicit button only, deterministic-first, session-only AI output, provider timeout/AbortSignal, human decision/edit/save.

## Verified Existing Repo Contract

### Wiring
- `HUB/70 Journal.md` loads provider/config services, Weekly modules, then:
  - `SYSTEM/Views/monthly-validation-core.js`
  - `SYSTEM/Views/monthly-validation-store.js`
  - `SYSTEM/Views/monthly-validation-view.js`
  - `SYSTEM/Views/journal-period-core.js`
  - `SYSTEM/Views/journal-period-store.js`
  - `SYSTEM/Views/journal-period-view.js`
- There is no `monthly-validation-ai.js` today.

### Monthly core
`SYSTEM/Views/monthly-validation-core.js` exports:
- `parseFrontmatter`, `parseSuggestedPrinciples`, `parseWeeklyNote`
- `collectPrinciples`, `checkReadiness`, `buildValidationModel`
- `buildMonthlyNoteContent`

Current behavior:
- Principle grouping key is normalized title.
- Eligibility is recurrence across at least two Weekly records.
- Monthly content stores summary, reviewed Weekly paths, each Principle decision/evidence/reason/knowledge statement, and next-month direction.
- `journal-end-date` is incorrectly hard-coded to day 28 for every month.

### Monthly store
`SYSTEM/Views/monthly-validation-store.js` exports:
- `pathFor(month)` → `DAILY/MONTHLY/YYYY-MM.md`
- `listWeeklyNotes(app, monthPrefix)` includes Weekly records whose start/end overlaps the selected month
- `save(app, month, content)` creates or overwrites one canonical Monthly file
- `createCandidatesFromDecisions(app, model, decisions)` creates Candidates only for human `validated` decisions

There is no Daily Evidence projection reader, existing-record hydration, mtime guard, or AI persistence.

### Monthly view
`SYSTEM/Views/monthly-validation-view.js` exports `ensureStyles`, `mount`.
- It loads Weekly notes, builds deterministic readiness/model, renders eligible Principle decisions, and explicitly saves.
- It has no AI control, cancel/retry state, summary input, or next-month-direction input.
- Existing bug: a Principle decision click mutates `state`, then calls `load()`; `load()` immediately executes `state = {}`, so the human decision/form is lost.
- `mount()` returns only `{ reload }`; there is no `destroy()` to abort an in-flight request when the period/tab is left.
- Existing historical Monthly records are shown by `journal-period-view.js`; `검증 화면 열기` mounts a fresh validation view and later overwrites the canonical file. It does not hydrate prior decisions.

### Reusable Weekly and provider contracts
- `SYSTEM/Views/weekly-filter-core.js::parseDailyEvidenceBlocks(markdown, day)` already produces structured Evidence fields including `evidence_id`, but not `date`; callers can attach the filename date.
- `SYSTEM/Views/weekly-filter-ai.js` demonstrates `SCHEMA`, prompt builder, response normalization, `generateWeeklyAI`, provider config via `ProjectWorkflowDraftService.loadProviderConfig(app)`, and `AIProviderService.requestStructuredJson({ app, provider, prompt, schema, signal })`.
- `AIProviderService` owns security checks, timeout, structured-response parsing, retry/fallback, and user-facing errors. Monthly must reuse it and must not create another provider layer.

### Period navigation
- `journal-period-view.js` already moves between months, displays saved history, and mounts Monthly validation for an empty month or from `검증 화면 열기`.
- It currently empties child DOM during navigation without calling a child cleanup controller.

### Tests and baseline
Existing relevant tests passed on this worktree:
- `node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_core.js`
- `node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_core.js`
- `node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_store.js`
- `node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_navigation.js`

There are no Monthly store/view/AI tests and no Weekly AI tests.

## Hard Design Questions To Resolve

### A. Minimal prerequisite repair
Choose whether the Monthly AI slice must first repair all three directly blocking human-flow defects:
1. split data loading from rerendering so decision/form state survives clicks;
2. render human-owned `summary` and `next_direction` editors already supported by the writer;
3. calculate the real selected-month end date instead of always day 28.

Recommendation: require these as Slice 0. Adding AI to a state-losing validation form is not an acceptable vertical slice.

### B. Month-boundary Weekly Evidence
`listWeeklyNotes` correctly includes a Weekly that overlaps the month, but that Weekly may contain Suggested Principle Evidence refs from adjacent-month days. The approved privacy boundary forbids sending other-month Evidence.

Choose exactly one behavior. Recommended:
- collect all structured Daily Evidence whose Daily filename date is inside selected `YYYY-MM`;
- intersect each Principle's supporting refs with that allowed ID set;
- do not transmit foreign/missing IDs or their contents;
- show a deterministic local coverage warning count for excluded refs;
- allow AI to run when existing Monthly readiness is ready, even if a Principle has reduced in-month support, because AI is advisory and readiness must not be silently redefined;
- output refs still fail closed unless they resolve to the submitted projection.

### C. Session ref and response contract
Recommended request context:
```js
{
  schema_version: "1.0",
  month: "YYYY-MM",
  readiness: { weekly_count, eligible_principles },
  principles: [{ principle_ref, title, weeks, supporting_evidence_refs }],
  evidence: [{ evidence_id, date, context, experience, interpretation, change, next_experiment }],
  coverage_warnings: [{ principle_ref, excluded_ref_count }]
}
```
Use deterministic session refs `monthly-YYYY-MM-pNNN` after the already deterministic Principle sort. They are not persisted.

Recommended output:
```js
{
  schema_version: "1.0",
  principle_reviews: [{
    principle_ref,
    supporting_evidence_refs,
    counter_evidence_refs,
    missing_evidence,
    contradictions_or_exceptions,
    validation_questions,
    validation_rationale_draft
  }],
  next_month_direction_draft
}
```
Semantic validation must reject unknown `principle_ref`, unknown/foreign Evidence refs, duplicate refs, malformed shape, and forbidden decision/write fields anywhere in the response. Decide whether a single invalid item rejects the entire response; recommendation is fail the whole response to deterministic UI with a retry action, not silently drop unsafe claims.

### D. Human adoption UI
Choose one exact interaction. Recommended:
- AI result appears in a separate `AI 검증 보조` region; never merge into `state.pN.action` or `knowledge_statement`;
- evidence refs are rendered as bounded source IDs with supporting/counter labels;
- human may explicitly copy only `validation_rationale_draft` into the editable validation-reason field and `next_month_direction_draft` into the human next-direction field;
- copy does not choose a Principle decision, does not save, and is visibly labeled `AI 초안 복사`;
- summary and knowledge statement remain entirely human-authored;
- save remains the existing explicit button and Candidate creation remains downstream of human `validated` only.

### E. Existing-record and conflict behavior
Choose the minimum safe behavior for a selected month that already has a canonical record.

Recommended bounded v1:
- saved record remains readable first;
- entering `검증 화면 열기` captures target file mtime;
- the AI session recomputes from current bounded source records but does not overwrite anything;
- save checks current target mtime and blocks silent overwrite if it changed after editor open;
- do not build revision history, hashes, merge, draft files, or AI cache;
- do not attempt broad parsing/hydration of arbitrary legacy Monthly prose in this AI slice; show that save replaces the canonical review and require an explicit replacement confirmation when a record already exists.

Challenge this recommendation: if failure to hydrate the current canonical decision state would cause unacceptable data loss, require a small parser for this writer's own canonical format and define exact fallback for legacy records. Do not leave this choice to the implementer.

### F. Cancellation and lifecycle
Recommended:
- `monthly-validation-view.js` owns one `AbortController` per run, exposes `cancelAI()` and `destroy()`; re-run aborts the prior run;
- buttons are `AI 검증 보조`, `취소`, `다시 시도` with Korean status;
- deterministic model and human edits stay visible on cancel/timeout/provider/malformed-response failure;
- `journal-period-view.js` calls the active Monthly child controller's `destroy()` before switching period/month or rendering history.

## Proposed Minimal File Map
The final plan may adjust this only with a concrete reason.

1. NEW `SYSTEM/Views/monthly-validation-ai.js`
   - `MONTHLY_AI_SCHEMA`
   - `buildMonthlyAIPrompt(context)`
   - `normalizeMonthlyAIResponse(payload, context)` including strict semantic/ref/forbidden-field checks
   - `generateMonthlyAI(options)` reusing provider config and `AIProviderService`
2. EDIT `SYSTEM/Views/monthly-validation-core.js`
   - real month end-date helper
   - pure bounded context/projection builder and deterministic Principle session refs/coverage warnings
   - no provider or Vault I/O
3. EDIT `SYSTEM/Views/monthly-validation-store.js`
   - read selected-month `DAILY/DAILY/YYYY-MM-DD.md` files and parse with `WeeklyFilterCore.parseDailyEvidenceBlocks`
   - attach `date`, deduplicate/fail on Evidence ID collisions, return structured fields only
   - optional target snapshot/mtime save guard according to Question E
4. EDIT `SYSTEM/Views/monthly-validation-view.js`
   - repair load/render state separation, add human summary/direction fields, explicit AI/cancel/retry, separate suggestion adoption, preserve deterministic UI and human edits
5. EDIT `SYSTEM/Views/journal-period-view.js`
   - targeted child-controller cleanup only if required for abort-on-navigation
6. EDIT `HUB/70 Journal.md`
   - load `monthly-validation-ai.js` after core/store dependencies and before the view
7. EDIT docs only after behavior exists:
   - `SYSTEM/docs/Journal_Operating_Model.md`
   - `SYSTEM/docs/09_Obsidian_Manual.md`
   - `SYSTEM/docs/11_Operating_Guide.md`
8. TESTS
   - extend `test_monthly_validation_core.js`
   - new `test_monthly_validation_store.js`
   - new `test_monthly_validation_ai.js`
   - new `test_monthly_validation_view.js`
   - extend `test_journal_period_navigation.js` only for cleanup contract

## Required Test Matrix
- prerequisite: decision state survives rerender; summary/direction edit survives rerender; February/leap/year/month end dates are correct
- projection: selected-month only; raw Daily body absent from request; every approved field retained; foreign/missing refs excluded and counted; duplicate Evidence IDs fail closed; unreadable Daily is a deterministic local warning rather than invented content
- AI: no call before explicit click or when readiness blocked; exact provider service/config reused; AbortSignal passed; strict schema normalization; unknown principle/Evidence ref and forbidden decision/write field reject whole result; provider/model shown only as provenance/status
- UI: AI never changes decision or knowledge statement; explicit draft-copy affects only allowed human draft field; cancel/error/timeout/malformed result preserves deterministic cards and human edits; retry works; navigation destroys/aborts run; AI-only action causes zero Vault/Candidate writes
- save: Candidate creation only for a human `validated` decision; existing record replacement/conflict behavior matches the chosen Question E contract
- regressions: four existing baseline tests remain green; Daily/Weekly/provider focused regressions named where their shared code is touched

## Actual Obsidian QA Matrix
- open Monthly: zero provider/network call and deterministic readiness first
- blocked fixture: disabled AI with exact readiness reason
- ready isolated fixture: run → inspect grounded refs/questions → copy rationale/direction → independently choose human decision → edit → save → reopen
- cancel, timeout/provider error, malformed/unknown-ref response: deterministic content and human edits remain; retry visible
- navigate to another month/tab during AI: request aborts and no detached UI/session write appears
- month-boundary fixture: adjacent-month Evidence is not sent or rendered as AI support; local exclusion warning is visible
- existing record: chosen replacement/hydration behavior and mtime conflict path observed; source Daily/Weekly files unchanged
- before/after Vault diff: only the explicitly saved Monthly record and human-gated Candidates may change; AI run/cancel/error alone changes nothing
- use isolated synthetic fixture notes, never fabricate personal records

## Explicit Non-Goals
Quarterly/Yearly implementation, generic Review Engine, new provider abstraction, background/scheduled AI, Vault/global Knowledge retrieval, other-month Evidence, raw note transmission, embedding/vector search, AI draft/cache/log files, raw prompt/response persistence, telemetry, revision history, hashes, merge UI, automatic decision/save/Candidate/Knowledge promotion, Identity Lens, settings changes, and unrelated refactors.

## Decision Needed
Author one complete normative Monthly implementation plan. Resolve A–F, especially the existing-record behavior. Verify the file-and-symbol map against only the supplied facts. Keep slices small enough for another coding agent to execute without making product decisions.

## Required Response Format
Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Rationale:

# Normative Monthly Implementation Plan
## Goal and non-goals
## Invariants
## Resolved decisions A–F
## Exact file-and-symbol change map
## Input, output, state, and error contracts
## Existing-record and conflict contract
## Ordered implementation slices
## Per-slice automated verification commands and rollback boundary
## Actual Obsidian QA scenarios
## Final acceptance gate
## Explicitly deferred scope

Risks/missing evidence:
Next packet request: none if the plan is coder-ready
FINAL_PLAN_VERDICT: APPROVE | REVISE | BLOCK
