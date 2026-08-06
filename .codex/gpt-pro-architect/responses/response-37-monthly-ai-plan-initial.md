# GPT Pro Architect Response 37 — Monthly AI Implementation Plan (Initial)

- topic: `journal-period-ai-20260803`
- conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a701a85-795c-83ee-8aa9-288e6ce9a120`
- gate: `PLAN`
- decision: `APPROVE` pending local factual integration and same-thread final challenge
- model evidence: ChatGPT UI `Pro`, reasoning control `높음`; exact server-side generation model not independently verified

Decision: APPROVE

Gate reviewed: PLAN

Rationale:

Packet 27 is coder-ready after one safety correction: an existing Monthly record must not be replaced from an empty editor merely because the user confirmed overwrite. The implementation shall add a small parser paired only with the repository’s own buildMonthlyNoteContent() format, hydrate records it can parse exactly, and protect legacy or partially incompatible records behind an explicit replacement mode. All other recommendations A–F are accepted. This remains a bounded Monthly vertical slice: it repairs the existing human validation flow, builds a selected-month structured Evidence projection, adds explicit session-only AI assistance, and preserves the current human save and Candidate boundaries. It introduces no generic Review Engine, provider abstraction, revision subsystem, AI persistence, or unrelated Journal redesign. The plan is grounded in the verified file and symbol contracts supplied in Architect Packet 27.

Normative Monthly Implementation Plan
Goal and non-goals
Goal

Add AI 검증 보조 to the existing Monthly validation screen so the user can:

See deterministic Monthly readiness and eligible Principles first.

Review and edit existing human Monthly data safely.

Explicitly request AI analysis of selected-month structured Evidence.

Inspect supporting Evidence, counterevidence, exceptions, gaps, and validation questions.

Explicitly copy permitted AI drafts into human-owned fields.

Independently choose Principle decisions.

Explicitly save the canonical Monthly record.

Create Knowledge Candidates only through the existing downstream human-validated path.

Non-goals

This slice does not implement:

Quarterly or Yearly behavior

a generic period Review Engine

a new provider/configuration abstraction

raw Daily-note transmission

other-month Evidence

global Knowledge or Object retrieval

AI-selected validation decisions

AI-written knowledge statements

automatic Monthly save

automatic Candidate creation or promotion

AI draft persistence, cache, or logs

revision history, hashes, merge, or recovery UI

background or scheduled execution

telemetry

embeddings or vector search

unrelated Monthly, Weekly, Journal, or provider refactoring

Invariants

Opening Monthly validation makes zero provider or network calls.

Existing deterministic readiness, Principle grouping, recurrence, and human validation remain authoritative.

Existing Monthly readiness is unchanged:

at least two completed Weekly records

at least one Principle recurring across two Weekly records

AI runs only after the user presses AI 검증 보조.

AI receives structured selected-month Evidence only.

Raw Daily Markdown bodies never enter the AI request.

AI output remains session-only until a human explicitly copies permitted text.

AI never modifies:

Principle decisions

knowledge statements

source Evidence

Weekly records

Monthly files

Candidates

Knowledge

All returned Principle and Evidence references must resolve to the submitted request context.

One invalid or unsafe AI item rejects the entire AI response.

Cancel, timeout, provider failure, malformed output, or navigation must preserve deterministic content and all human edits.

Existing canonical Monthly records cannot be silently overwritten.

No unrelated dirty-worktree file may be edited, reformatted, deleted, staged, or attributed to this slice.

Resolved decisions A–F
A. Minimal prerequisite repair

Decision: Require all three repairs as Slice 0.

AI must not be added to a human form that loses state or omits writer-supported fields.

Required repairs:

Separate data loading from rendering.

Loading Weekly/source data must not reset human editor state during normal rerender.

Clicking a Principle decision must rerender from existing state rather than call a state-resetting load() path.

Add human-owned editors:

summary

next_direction

Replace the hard-coded day 28 with the real last calendar date of the selected month.

February

leap-year February

30-day months

31-day months

year boundaries

These are prerequisites, not optional cleanup.

B. Month-boundary Weekly Evidence

Decision: Use selected-month Evidence projection and retain existing readiness unchanged.

The store shall:

Read canonical Daily files whose filename date belongs to selected YYYY-MM.

Parse them with WeeklyFilterCore.parseDailyEvidenceBlocks(markdown, day).

Attach the filename-derived date.

Preserve only these fields:

evidence_id
date
context
experience
interpretation
change
next_experiment

Deduplicate by evidence_id.

Fail closed on duplicate IDs that originate from different source blocks or files.

Build an allowed selected-month Evidence ID set.

Intersect each Principle’s supporting refs with the allowed set.

Exclude foreign, missing, adjacent-month, or unreadable Evidence from the AI payload.

Produce deterministic local coverage warnings:

{
  principle_ref,
  excluded_ref_count
}

Monthly readiness remains based on the existing Weekly recurrence contract. Reduced in-month AI coverage does not redefine readiness because AI remains advisory.

Excluded references:

are not sent

are not rendered as AI support

cannot be returned by the model

do not silently reduce the deterministic human record

Unreadable Daily files produce a local warning. Their content is never invented.

C. Session references and response contract

Decision: Adopt deterministic session refs and reject the whole response on any semantic violation.

Principles are first sorted by the existing deterministic Principle ordering. Session-only refs are then assigned:

monthly-YYYY-MM-p001
monthly-YYYY-MM-p002
monthly-YYYY-MM-p003

These refs:

exist only for the current request and response

are not written into Monthly, Weekly, Candidate, or Knowledge files

are regenerated deterministically from the same sorted model

Request context:

{
  schema_version: "1.0",
  month: "YYYY-MM",
  readiness: {
    weekly_count,
    eligible_principles
  },
  principles: [{
    principle_ref,
    title,
    weeks,
    supporting_evidence_refs
  }],
  evidence: [{
    evidence_id,
    date,
    context,
    experience,
    interpretation,
    change,
    next_experiment
  }],
  coverage_warnings: [{
    principle_ref,
    excluded_ref_count
  }]
}

Response contract:

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

Whole-response rejection conditions:

incorrect schema_version

unknown principle_ref

duplicated principle_ref

missing review for a required returned item shape

unknown Evidence ref

foreign or excluded Evidence ref

duplicate Evidence ref within a list

the same Evidence ref duplicated across supporting or counter lists where the contract forbids ambiguity

malformed arrays or strings

additional unsafe fields

forbidden fields anywhere in the response object, including nested content

Forbidden semantic fields include any direct or equivalent form of:

decision
status
validated
rejected
deferred
pending
knowledge_statement
candidate
promotion
save
write
apply

A malformed item is never silently dropped. The entire AI result is rejected, deterministic UI remains visible, and 다시 시도 is offered.

D. Human adoption UI

Decision: Render AI in a separate region and allow only two explicit draft-copy operations.

The AI region is titled:

AI 검증 보조

It is visually and structurally separate from human decision controls.

For each Principle, render:

supporting Evidence IDs

counterevidence IDs

missing Evidence

contradictions or exceptions

validation questions

validation rationale draft

provenance/status information

Evidence refs are displayed only as bounded IDs present in the submitted projection, with clear labels:

지지 근거
반대·예외 근거

Permitted copy actions:

AI 초안 복사

copies only that Principle’s validation_rationale_draft

destination: editable human validation-reason field

다음 달 방향 초안 복사

copies only next_month_direction_draft

destination: editable human next_direction field

Copy behavior:

never chooses a Principle decision

never modifies knowledge_statement

never modifies summary

never saves

never creates a Candidate

is visibly identified as copying an AI draft

leaves the copied text fully editable by the human

Human-owned fields:

summary
decision
validation_reason
knowledge_statement
next_direction

Summary and knowledge statement remain entirely human-authored.

E. Existing-record and conflict behavior

Decision: Hydrate this writer’s canonical format; protect legacy or incompatible records in explicit replacement mode.

A replacement confirmation alone is insufficient when the editor starts empty. The following contract is mandatory.

E1. Read snapshot on editor entry

When 검증 화면 열기 mounts Monthly validation, read:

{
  exists,
  path,
  content,
  mtime
}

The opening mtime becomes the target snapshot for conflict detection.

E2. Canonical parser

Add a small parser paired specifically with buildMonthlyNoteContent():

parseMonthlyNoteContent(markdown)

It may parse only the exact canonical structure emitted by the current Monthly writer.

Normalized result:

{
  format: "canonical" | "legacy_or_unrecognized",
  summary,
  reviewed_weekly_paths,
  principles: [{
    title,
    decision,
    evidence_refs,
    reason,
    knowledge_statement
  }],
  next_direction
}

The parser must not attempt to interpret arbitrary prose.

E3. Exact hydration

When format is canonical:

hydrate summary

hydrate next_direction

hydrate matching Principle decisions

hydrate reasons

hydrate knowledge statements

hydrate stored Evidence references for display

map Principle entries using the same normalized-title logic used by the current core grouping

Hydration must occur once during initial load and must not overwrite subsequent unsaved human edits during rerender or AI execution.

E4. Partial model mismatch

If canonical parsing succeeds but one or more stored Principles no longer map to the current deterministic model:

show the unmatched stored entries in a read-only 기존 기록에만 존재 section

do not silently discard them

mark the editor as replacement-required

require explicit 기존 기록 교체 confirmation before save

clearly state that the new save will replace unmatched historical entries in the canonical file

No automatic merge is attempted.

E5. Legacy or unrecognized record

If the file is not exactly parseable as this writer’s canonical format:

keep the existing record readable through the existing history/open flow

do not hydrate guessed fields

show 기존 기록 형식을 자동으로 불러올 수 없습니다

disable normal save initially

require explicit 새 검증으로 교체 action before enabling replacement mode

retain the opening mtime snapshot

never overwrite merely because the validation screen was opened

No broad legacy parser is introduced.

E6. Save conflict guard

Before save:

Read the target file’s current mtime.

Compare it with the opening snapshot.

If unchanged, proceed subject to any required replacement confirmation.

If changed:

block silent overwrite

show 기존 월간 기록이 편집 중 변경되었습니다

offer:

다시 불러오기

현재 편집본으로 교체

현재 편집본으로 교체 requires a second explicit confirmation.

No automatic merge occurs.

After a successful save, refresh the target snapshot to the new mtime.

E7. Source staleness

AI context is always recomputed from current bounded Daily and Weekly records.

The AI run does not write source snapshots.

Before canonical save, if Daily or Weekly source mtimes captured for the current editor context have changed:

show 입력 기록 변경됨

do not silently regenerate or merge

allow the human to:

reload the validation model

continue saving the explicitly reviewed current editor state

This is a warning, not an append-only version system.

F. Cancellation and lifecycle

Decision: Adopt one AbortController per run and explicit child cleanup.

monthly-validation-view.js owns:

zero or one active AbortController

current AI state

last valid AI result

error/retry state

Rules:

Starting a new AI run aborts any prior run.

취소 aborts the active run.

destroy() aborts the active run and prevents subsequent detached DOM updates.

Cancel, timeout, provider failure, and malformed response preserve:

deterministic model

human decisions

summary

reasons

knowledge statements

next direction

다시 시도 starts a new controller and rebuilds context from current bounded source records.

AI callbacks must verify that the view is still mounted and the run is still current before rendering.

journal-period-view.js calls the active child controller’s destroy() before:

changing month

changing period

rendering history

replacing the child DOM

mount() shall return:

{
  reload,
  cancelAI,
  destroy
}
Exact file-and-symbol change map

Only the following files are in scope.

1. NEW — SYSTEM/Views/monthly-validation-ai.js

Exports:

MONTHLY_AI_SCHEMA
buildMonthlyAIPrompt(context)
normalizeMonthlyAIResponse(payload, context)
generateMonthlyAI(options)

Responsibilities:

MONTHLY_AI_SCHEMA

strict structured output schema

required fields only

no additional properties

no decision, write, Candidate, Knowledge, or save fields

buildMonthlyAIPrompt(context)

accepts only the approved request context

states the Monthly question

states bounded-evidence limitations

forbids unsupported refs and decisions

does not receive Vault access or raw notes

normalizeMonthlyAIResponse(payload, context)

structural normalization

recursive forbidden-field inspection

principle_ref validation

Evidence ref validation

duplicate detection

foreign/excluded ref rejection

whole-response failure on any invalid item

returns a normalized immutable result or throws a controlled validation error

generateMonthlyAI(options)

Expected options:

{
  app,
  context,
  signal
}

Behavior:

loads provider configuration through the same configuration route used by Weekly

invokes AIProviderService.requestStructuredJson

passes app, provider, prompt, schema, and signal

returns:

normalized result

provider/model provenance supported by the existing service/call-site pattern

performs no Vault write

creates no Candidate

stores no prompt or response

2. EDIT — SYSTEM/Views/monthly-validation-core.js

Keep existing exports.

Add pure exports:

getMonthDateRange(month)
assignMonthlyPrincipleRefs(principles, month)
buildMonthlyAIContext(options)
parseMonthlyNoteContent(markdown)
getMonthDateRange(month)

Returns the actual selected-month start and end dates.

Used by:

buildMonthlyNoteContent

date-related tests

assignMonthlyPrincipleRefs(principles, month)

consumes the already deterministic sorted Principle collection

assigns monthly-YYYY-MM-pNNN

performs no persistence

buildMonthlyAIContext(options)

Expected logical inputs:

{
  month,
  model,
  evidence,
  evidenceWarnings
}

Responsibilities:

build allowed Evidence ID set

intersect supporting refs

build coverage warnings

preserve readiness facts

omit raw note text

produce the exact approved request context

perform no Vault I/O

perform no provider call

parseMonthlyNoteContent(markdown)

paired only with buildMonthlyNoteContent

exact canonical parse or legacy_or_unrecognized

no arbitrary legacy inference

Modify buildMonthlyNoteContent only as required to:

use the real end date

continue writing existing human-owned fields

maintain a stable canonical format that its paired parser can read

avoid storing AI session output or session refs

3. EDIT — SYSTEM/Views/monthly-validation-store.js

Keep existing exports.

Add:

listMonthlyDailyEvidence(app, month)
readMonthlySnapshot(app, month)
saveWithMtimeGuard(app, month, content, options)
listMonthlyDailyEvidence(app, month)

Returns:

{
  evidence,
  warnings,
  source_snapshots
}

Responsibilities:

enumerate only selected-month canonical Daily files

call WeeklyFilterCore.parseDailyEvidenceBlocks

attach filename date

project approved fields only

exclude raw body

detect duplicate Evidence IDs

fail closed on collisions

report unreadable files as deterministic warnings

include source path and mtime only in local source snapshots, not AI Evidence objects

readMonthlySnapshot(app, month)

Returns:

{
  exists,
  path,
  content,
  mtime
}
saveWithMtimeGuard(app, month, content, options)

Options include:

{
  expected_mtime,
  allow_replace
}

Behavior:

create when absent and expected absent

save when mtime matches

return a typed conflict result when mtime differs

overwrite only after explicit view-level replacement confirmation

return new mtime after success

Retain save(app, month, content) as the existing low-level primitive unless repository inspection proves it is private and safe to replace. The guarded function is the Monthly view’s required entry point.

createCandidatesFromDecisions remains human-decision-driven and must not be called by AI execution.

4. EDIT — SYSTEM/Views/monthly-validation-view.js

Refactor internal lifecycle into separate operations:

loadData()
initializeEditorState()
render()
runAI()
cancelAI()
retryAI()
copyRationaleDraft()
copyNextDirectionDraft()
saveReview()
destroy()

These do not all need to be exported as globals; they define the required internal separation.

Required behavior:

initial data load occurs separately from rerender

editor state is initialized once

existing canonical record is hydrated according to Decision E

rerender never resets human state

summary and next-direction editors are rendered

AI region is separate

AI controls and Korean status are rendered

copy operations target only approved fields

existing-record replacement mode is explicit

mtime conflict results are handled visibly

AI execution causes zero writes

save remains explicit

Candidate creation remains after successful human save and only for human validated decisions

mount() returns { reload, cancelAI, destroy }

5. EDIT — SYSTEM/Views/journal-period-view.js

Targeted change only:

retain the active Monthly child controller

call destroy() before clearing or replacing its DOM

do not redesign navigation, history, or other periods

6. EDIT — HUB/70 Journal.md

Load order:

monthly-validation-core.js
monthly-validation-store.js
monthly-validation-ai.js
monthly-validation-view.js

The new AI module must load after its core/store/provider dependencies and before the view.

No unrelated loader reordering.

7. Documentation after behavior passes

Edit only:

SYSTEM/docs/Journal_Operating_Model.md
SYSTEM/docs/09_Obsidian_Manual.md
SYSTEM/docs/11_Operating_Guide.md

Document only implemented behavior:

selected-month Evidence boundary

explicit AI 검증 보조

session-only result

permitted draft-copy actions

human decision and save ownership

existing-record replacement/conflict behavior

cancel/retry

no automatic Candidate or Knowledge promotion

Do not add a new design or philosophy document.

8. Tests

Extend:

SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_core.js
SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_navigation.js

Add:

SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_store.js
SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_ai.js
SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_view.js
Input, output, state, and error contracts
Deterministic input contract

The AI request is built only after:

Monthly readiness is ready

Weekly Principle model exists

selected-month Daily Evidence projection succeeds without ID collision

request refs have been intersected with allowed IDs

No AI request is allowed when readiness is blocked.

AI output state

Monthly view AI states:

idle
running
ready
cancelled
error
invalid_response

Permitted transitions:

idle → running
running → ready
running → cancelled
running → error
running → invalid_response
cancelled → running
error → running
invalid_response → running
ready → running

Navigating or destroying the view terminates the active run and prevents further rendering.

Human editor state

Human editor state is independent from AI state:

{
  summary,
  next_direction,
  decisionsByPrinciple,
  replacement_mode,
  target_snapshot,
  source_snapshots
}

AI state changes must not recreate or reset this object.

Error behavior
Local projection warning

Examples:

unreadable Daily file

foreign Evidence ref excluded

missing Evidence ref excluded

Behavior:

show deterministic warning

do not invent content

allow AI if readiness is ready and there is no ID collision

Evidence ID collision

Behavior:

block AI execution

show a local actionable error

do not choose one source silently

Provider timeout or failure

Behavior:

preserve deterministic content and human edits

show Korean error

expose 다시 시도

Cancel

Behavior:

preserve deterministic content and human edits

discard incomplete AI result

expose rerun

Invalid response

Behavior:

reject the complete response

render no partial AI claims

preserve the last previously valid result only if it was from a distinct completed run and is clearly labeled as such; otherwise show no result

expose 다시 시도

Stale callback after navigation

Behavior:

no DOM mutation

no state adoption

no write

no detached error surface

Existing-record and conflict contract

The normative contract is Decision E above.

In summary:

Own canonical format
→ parse and hydrate

Canonical but model mismatch
→ hydrate matching fields
→ show unmatched entries read-only
→ explicit replacement required

Legacy/unrecognized
→ no guessed hydration
→ read-only existing record
→ explicit new-review replacement mode

mtime changed after editor open
→ silent save blocked
→ reload or explicit replace

AI run
→ never overwrites

No revision history is introduced.

Ordered implementation slices
Slice 0 — Human-flow prerequisite repair

Scope:

real month end date

load/render state separation

decision state preservation

summary editor

next-direction editor

Files:

monthly-validation-core.js

monthly-validation-view.js

existing core test

new or initial view test

No AI module yet.

Rollback boundary:

revert only Slice 0 files

no store or provider contract changes

existing Monthly screen returns to pre-slice behavior

Slice 1 — Bounded Evidence projection

Scope:

selected-month Daily Evidence reader

approved field projection

date attachment

duplicate collision handling

Principle session refs

supporting-ref intersection

coverage warnings

pure AI context builder

Files:

monthly-validation-core.js

monthly-validation-store.js

core/store tests

No provider call and no UI AI controls.

Rollback boundary:

remove projection exports and store reader

human Monthly validation remains functional

Slice 2 — Monthly AI contract adapter

Scope:

new monthly-validation-ai.js

strict schema

prompt

semantic validation

complete-response rejection

provider/config reuse

AbortSignal forwarding

Files:

new AI module

new AI tests

loader addition may be deferred until Slice 3 to keep unused code unmounted

No Monthly view integration and no writes.

Rollback boundary:

remove the new module

no human UI or storage behavior changes

Slice 3 — Existing-record hydration and mtime guard

Scope:

canonical parser

snapshot reader

exact hydration

legacy and mismatch replacement modes

guarded save

target mtime conflict UI

Files:

core

store

view

core/store/view tests

No AI controls required yet.

Rollback boundary:

revert record parser/guard changes together

do not leave the view calling absent guarded store symbols

Slice 4 — AI UI, adoption, cancellation, and navigation cleanup

Scope:

AI region

run/cancel/retry

explicit copy actions

provenance/status

one AbortController per run

destroy()

period-view child cleanup

final Journal loader wiring

Files:

monthly view

journal period view

HUB/70 Journal.md

AI/view/navigation tests

Rollback boundary:

remove loader entry and AI UI integration

retain completed human-flow and conflict fixes

no canonical data migration required

Slice 5 — Documentation and isolated Obsidian QA

Scope:

update existing operational documents

execute synthetic fixture QA

no code expansion unless a failed acceptance condition requires a bounded defect fix

Rollback boundary:

documentation can be reverted independently

code rollback follows the slice that introduced the failing behavior

Per-slice automated verification commands and rollback boundary

The PLAN grants no execution authority. The coding agent shall run these only during an authorized implementation gate.

Slice 0
node --check SYSTEM/Views/monthly-validation-core.js
node --check SYSTEM/Views/monthly-validation-view.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_view.js

Required assertions:

decision survives rerender

summary survives rerender

next direction survives rerender

February 28

leap February 29

30-day month

31-day month

December-to-January boundary

Rollback: Slice 0 file set only.

Slice 1
node --check SYSTEM/Views/monthly-validation-core.js
node --check SYSTEM/Views/monthly-validation-store.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_store.js

Required assertions:

selected-month files only

raw Daily body absent

all approved fields retained

adjacent-month ref excluded

missing ref counted

unreadable Daily warning

duplicate ID blocks context

deterministic Principle refs

readiness unchanged

Rollback: Slice 1 exports/readers only; Slice 0 remains.

Slice 2
node --check SYSTEM/Views/monthly-validation-ai.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_ai.js

Required assertions:

exact provider/config route reused

AbortSignal forwarded

no call made by module construction

strict schema

unknown Principle rejected

unknown Evidence rejected

excluded Evidence rejected

duplicate refs rejected

forbidden fields rejected recursively

one bad item rejects complete payload

no Vault write methods invoked

Rollback: delete new AI module; no storage rollback.

Slice 3
node --check SYSTEM/Views/monthly-validation-core.js
node --check SYSTEM/Views/monthly-validation-store.js
node --check SYSTEM/Views/monthly-validation-view.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_store.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_view.js

Required assertions:

own canonical format round-trips writer → parser

canonical fields hydrate

rerender does not rehydrate over edits

unmatched entries shown and replacement required

legacy record not guessed

unchanged mtime saves

changed mtime blocks

reload path works

explicit replacement requires confirmation

successful save refreshes snapshot

Candidate creation remains human-validated only

Rollback: parser, snapshot, guarded-save, and replacement UI must revert as one unit.

Slice 4
node --check SYSTEM/Views/monthly-validation-ai.js
node --check SYSTEM/Views/monthly-validation-view.js
node --check SYSTEM/Views/journal-period-view.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_ai.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_view.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_navigation.js

Then run the supplied baseline:

node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_store.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_navigation.js

Required assertions:

no AI call before click

blocked readiness prevents call

AI never changes decisions

AI never changes knowledge statement

only permitted draft copies occur

cancel preserves human state

timeout preserves human state

invalid response preserves human state

retry works

rerun aborts prior run

navigation invokes destroy()

detached callback cannot render

AI-only actions cause zero Vault or Candidate writes

Rollback: remove Slice 4 UI/wiring while retaining Slices 0–3.

Slice 5

Run all commands above and:

git diff --check

The implementation agent must inspect the diff and confirm only the normative file map changed. No success claim may rely only on node --check.

No shared provider code is changed by this plan. Therefore a new provider test suite is not required. The Monthly AI tests must mock and verify the exact existing provider-service invocation contract. If implementation unexpectedly requires editing shared provider or Weekly parser code, stop and return to PLAN rather than expanding scope.

Actual Obsidian QA scenarios

Use an isolated synthetic fixture Vault or isolated synthetic Journal notes. Never create fabricated personal records.

1. Passive open

Open Monthly validation.

Confirm zero provider/network call.

Confirm deterministic readiness appears first.

Confirm no Monthly, Daily, Weekly, Candidate, or Knowledge write.

2. Blocked readiness

Use fewer than two completed Weekly records or no recurring Principle.

Confirm AI 검증 보조 is disabled.

Confirm the exact existing readiness reason is visible.

Confirm no AI call is attempted.

3. Human-flow state retention

Choose a Principle decision.

Enter summary, reason, knowledge statement, and next direction.

Trigger ordinary rerenders.

Confirm every human field survives.

4. Ready AI flow

Use isolated ready fixtures.

Press AI 검증 보조.

Inspect supporting and counter Evidence IDs.

Confirm every rendered ID exists in the bounded selected-month projection.

Copy a rationale draft.

Copy a next-direction draft.

Independently choose a human decision.

Edit copied text.

Save.

Reopen and confirm canonical hydration.

5. Month boundary

Use one overlapping Weekly record containing Evidence from the selected and adjacent month.

Confirm adjacent-month Evidence:

is not in the provider request

is not rendered as AI support

is counted in the local coverage warning

Confirm readiness itself was not silently redefined.

6. Cancel

Start AI.

Edit a human field while running if the UI permits.

Press 취소.

Confirm deterministic content and all human edits remain.

Confirm no AI result or write appears later.

7. Timeout or provider error

Trigger the existing provider failure path.

Confirm Korean error/status.

Confirm deterministic cards and human fields remain.

Confirm 다시 시도 works.

8. Malformed or unsafe response

Test separately:

unknown Principle ref

unknown Evidence ref

adjacent-month ref

forbidden decision field

one invalid Principle review among valid reviews

For each:

confirm the entire response is rejected

confirm no partial claim renders

confirm no human state changes

confirm retry is available

9. Navigation during AI

Start AI.

Navigate to another month.

Repeat by switching period and opening history.

Confirm request abort.

Confirm no detached UI update.

Confirm no session or Vault write.

10. Existing canonical record

Open a file previously emitted by buildMonthlyNoteContent.

Confirm summary, decisions, reasons, knowledge statements, and direction hydrate.

Edit and save.

Reopen and verify the updated canonical state.

11. Canonical model mismatch

Use a canonical record containing a Principle no longer in the current deterministic model.

Confirm the unmatched entry is read-only and visible.

Confirm save requires explicit replacement acknowledgement.

Confirm no silent disappearance occurs.

12. Legacy or unrecognized record

Use a Monthly file not matching the canonical writer format.

Confirm the system does not guess decisions.

Confirm existing history remains readable.

Confirm normal save is disabled.

Confirm explicit 새 검증으로 교체 is required.

13. Target mtime conflict

Open editor.

Modify the target Monthly file externally.

Attempt save.

Confirm silent overwrite is blocked.

Test 다시 불러오기.

Repeat and test the two-step explicit replacement path.

14. Source change warning

Open editor and build context.

Modify a source Daily or Weekly fixture.

Attempt save.

Confirm 입력 기록 변경됨.

Confirm the user can reload or explicitly continue with the currently reviewed editor state.

15. Before/after Vault diff

For AI run, cancel, error, and invalid response:

no file changes

For human Monthly save without validated decisions:

only the canonical Monthly file may change

For human Monthly save with validated decisions followed by existing Candidate creation:

canonical Monthly file

only human-gated Candidate files

Daily and Weekly sources must remain unchanged.

Final acceptance gate

Monthly AI is accepted as implemented only when all conditions below are true:

Slice 0 human-flow defects are repaired.

All new and supplied baseline tests pass.

node --check passes for every changed JavaScript file.

git diff --check passes.

Diff inspection confirms no unrelated dirty-worktree changes were added.

Opening Monthly causes zero AI calls.

Blocked readiness causes zero AI calls.

The request contains only selected-month structured Evidence.

Raw Daily content is absent.

Adjacent-month Evidence is excluded and visibly counted.

Every AI ref is validated against submitted context.

One unsafe response item rejects the whole response.

AI cannot alter a decision or knowledge statement.

Only the two approved draft-copy operations exist.

AI run, cancel, timeout, or error causes zero Vault/Candidate writes.

Human editor state survives rerender and AI lifecycle changes.

Existing canonical records hydrate safely.

Legacy or incompatible records require explicit replacement mode.

mtime conflict blocks silent overwrite.

Navigation aborts active AI and prevents detached rendering.

Candidate creation remains limited to human validated decisions.

Actual Obsidian QA passes using isolated synthetic fixtures.

Documentation describes only implemented behavior.

No Quarterly, Yearly, generic Review Engine, provider framework, or deferred feature enters the diff.

Failure of any item keeps the implementation below conformance. This PLAN approval does not authorize implementation, commit, push, or release.

Explicitly deferred scope

Quarterly human foundation

Quarterly AI

Yearly human foundation

Yearly AI

generic period Review Engine

generic AI capability framework

changes to AIProviderService

new provider registry or configuration

raw Daily body transmission

other-month Evidence transmission

global Vault, Object, or Knowledge retrieval

AI decisions

AI-authored knowledge statements

automatic save

automatic Candidate creation

automatic Candidate or Knowledge promotion

AI draft files

AI cache

raw prompt or response persistence

provider-response logs

background or scheduled AI

telemetry

revision history

append-only Monthly revisions

content hashes

automatic merge

Git recovery UI

Identity Lens

settings changes

embeddings

vector search

broad legacy Monthly parsing

unrelated refactors

ownership or cleanup of unrelated dirty-worktree changes

Risks/missing evidence:

The exact textual grammar emitted by buildMonthlyNoteContent() was not reproduced in the packet. The parser must be derived directly from that function and tested as a paired writer/parser contract; it must not invent a second format.

No existing Monthly view/store test harness exists, so the implementation may need bounded Obsidian mocks. This is test infrastructure for the listed modules, not authority to introduce a general UI framework.

Existing historical Monthly files may predate the current writer. They are intentionally protected through legacy replacement mode rather than guessed hydration.

Evidence ID collisions may expose pre-existing Daily data defects. The correct v1 behavior is to block AI and identify the collision, not silently select one.

Real personal-record product value remains unproven because current records are sparse. This is a rollout observation issue, not a blocker for the bounded synthetic-fixture implementation.

Next packet request: none; this plan is coder-ready.

FINAL_PLAN_VERDICT: APPROVE

