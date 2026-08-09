# GPT Pro Architect Response 37 — Monthly AI Final Amendments

- topic: `journal-period-ai-20260803`
- conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a701a85-795c-83ee-8aa9-288e6ce9a120`
- gate: `PLAN`
- decision: `APPROVE`
- integrates: `response-37-monthly-ai-plan-initial.md` + `packet-28-monthly-ai-final-challenge.md`
- model evidence: ChatGPT UI `Pro`, reasoning control `높음`; exact server-side generation model not independently verified

편집

Decision: APPROVE

Gate reviewed: PLAN

Rationale:

All six corrections are accepted. They tighten the approved Monthly implementation without expanding its architecture. The final contract now has exact eligible-Principle cardinality, a local zero-Evidence AI gate, provider-independent response strictness, coherent source-snapshot handling, protected hydration when readiness later becomes blocked, and destructive reload semantics. These amendments remove the remaining implementation choices from the coding agent while preserving existing Monthly readiness and human ownership.

Resolved correction 1:

APPROVE — AI context and response cardinality are eligible-Principles-only and exactly one-to-one.

Normative amendments:

buildMonthlyAIContext() includes only:

model.principles.filter((principle) => principle.eligible)

Preserve the deterministic order already produced by the Monthly core.

Assign session refs only after filtering:

monthly-YYYY-MM-p001
monthly-YYYY-MM-p002
...

The submitted principles[] list contains every eligible Principle exactly once.

A valid response must contain exactly one principle_reviews[] item for every submitted principle_ref.

Missing, duplicate, or extra Principle reviews reject the entire response.

Response order need not be trusted; normalization reorders validated reviews to match submitted deterministic order.

Ineligible Principles:

remain visible in deterministic Monthly UI

remain represented in the canonical human record

have no AI session ref

are excluded from the prompt

receive no AI review or copy action

Resolved correction 2:

APPROVE — human Monthly validation remains available, but AI is locally blocked when bounded Evidence is empty.

Normative amendments:

Existing Monthly readiness remains unchanged.

After selected-month projection and ref intersection, calculate:

ai_available = readiness.ready && evidence.length > 0

When readiness is ready but evidence.length === 0:

human Principle validation remains available

summary, reason, knowledge statement, decisions, next direction, and save remain governed by normal human-flow rules

AI 검증 보조 is disabled

make zero provider calls

display:

선택한 달에 AI가 검토할 구조화 Evidence가 없습니다

Display all deterministic coverage warnings explaining excluded or unavailable refs.

Do not introduce a new Monthly readiness state.

Do not reinterpret Weekly recurrence eligibility.

Retry remains unavailable until an explicit reload produces non-empty bounded Evidence.

Resolved correction 3:

APPROVE — provider schema is advisory; local recursive allowlists are the mandatory safety boundary.

Normative amendments:

MONTHLY_AI_SCHEMA declares additionalProperties: false where provider support permits.

Security and conformance do not depend on providers preserving that keyword.

normalizeMonthlyAIResponse() independently enforces exact allowed keys at:

root

every principle_reviews[] object

every nested structured object introduced by the final schema

Root allowed keys are exactly:

schema_version
principle_reviews
next_month_direction_draft

Principle-review allowed keys are exactly:

principle_ref
supporting_evidence_refs
counter_evidence_refs
missing_evidence
contradictions_or_exceptions
validation_questions
validation_rationale_draft

Reject structured forbidden keys and normalized aliases, including snake_case and camelCase equivalents of:

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

Key normalization for forbidden-field detection may remove case, underscores, and hyphens before comparison.

Do not censor ordinary Korean prose based on suspicious words appearing inside permitted free-text strings.

Semantic safety is enforced through:

fixed output slots

exact object-key allowlists

eligible Principle cardinality

submitted-reference validation

whole-response rejection

Any structural, key, cardinality, or ref violation rejects the complete response.

Resolved correction 4:

APPROVE — source changes block every AI run or retry until explicit destructive reload.

Normative amendments:

Initial editor loading captures:

target Monthly file path and mtime

selected Daily source paths and mtimes

overlapping Weekly source paths and mtimes

the deterministic Monthly model built from those snapshots

listMonthlyDailyEvidence() returns local Daily source_snapshots.

listWeeklyNotes() adds:

source_mtime

from the Weekly TFile.stat.mtime.

source_mtime:

remains local

is not sent to AI

is not written to the Monthly record

Before every AI run or retry:

abort any previous AI run

reread the current Daily and Weekly source mtimes

compare source path sets and mtimes against editor snapshots

if any source was added, removed, renamed, or modified, make zero provider calls

display:

입력 기록 변경됨

require explicit 다시 불러오기

AI may never combine:

stale Principle membership or ordering

fresh Evidence projection

The existing save-time source warning remains separate:

AI is blocked until reload

a human may explicitly save the already-reviewed editor state despite source changes

Source changes do not automatically reset, remap, or discard human editor state.

Resolved correction 5:

APPROVE — existing canonical records hydrate regardless of current readiness, but blocked readiness protects them from ordinary replacement.

Normative amendments:

Saved Monthly history remains readable regardless of current source readiness.

Opening validation always attempts target-record parsing and hydration before applying AI availability.

If the existing file matches the canonical writer format:

hydrate summary

hydrate next direction

hydrate decisions

hydrate knowledge statements

hydrate validation reasons

hydrate stored Evidence refs for display

Hydration must include:

validated

rejected

deferred

pending

optional knowledge statement

optional validation reason

rejected/deferred reasons stored in the separate Rejected or Deferred Principles section

If current readiness is now blocked:

deterministic readiness reasons are displayed

AI is unavailable

make zero provider calls

hydrated content remains visible and editable locally

ordinary save is disabled

explicit replacement mode is required before a new canonical write

Replacement mode must warn that current missing or changed sources may cause the saved canonical review to differ from the previous completed record.

Legacy or unrecognized files remain read-only until the existing explicit replacement flow is entered.

Merely opening a blocked validation screen cannot alter or replace the saved record.

Resolved correction 6:

APPROVE — reload() is an explicit destructive reset, not an ordinary rendering operation.

Normative amendments:

Ordinary rerender calls only render().

Rerender never:

rereads Vault files

rebuilds the deterministic model

rehydrates the target record

clears editor state

clears AI state

reload() performs a complete editor reset.

Before reload:

abort active AI

detect unsaved human edits

detect an existing AI result or error state

When edits or AI session output exist, require explicit confirmation:

다시 불러오면 저장하지 않은 입력과 AI 검증 결과가 사라집니다

Confirmed reload performs one atomic logical operation:

abort active AI

invalidate current run token

reread target Monthly snapshot

reread Daily and Weekly sources and mtimes

rebuild deterministic readiness and model

rebuild bounded Evidence projection

parse and hydrate the canonical record once

replace human editor state

clear AI result, provenance, error, and retry state

render the rebuilt editor

Cancelled reload leaves all current state unchanged.

Navigation destroy():

aborts active AI

invalidates callbacks

performs no save

performs no reload

shows no confirmation prompt

Final ordered Monthly slices:

Slice 0 — Human-flow and canonical grammar repair

Implement:

load/render separation

persistent editor state across rerender

summary editor

next-direction editor

real selected-month end date

writer-paired parseMonthlyNoteContent()

parser coverage for:

validated

rejected

deferred

pending

optional knowledge statement

optional validation reason

separately stored rejected/deferred reason

writer → parser round-trip tests

Files:

monthly-validation-core.js

monthly-validation-view.js

core and view tests

Boundary:

no AI module

no provider call

no Daily projection

no navigation changes

Slice 1 — Source snapshots and bounded projection

Implement:

listWeeklyNotes() local source_mtime

selected-month Daily Evidence projection

Daily and Weekly source snapshots

duplicate Evidence ID failure

eligible-only filtering

deterministic eligible Principle refs

supporting-ref intersection

coverage warnings

zero-bounded-Evidence availability calculation

exact AI request context builder

Files:

monthly-validation-core.js

monthly-validation-store.js

core and store tests

Boundary:

no AI invocation

no UI AI controls

no provider or Weekly parser edits

Slice 2 — Strict Monthly AI adapter

Implement:

monthly-validation-ai.js

provider-compatible schema

prompt

local recursive exact-key validation

forbidden structured-key normalization

exact eligible-Principle response cardinality

submitted Evidence ref validation

whole-response rejection

AbortSignal forwarding

existing provider/config reuse

Files:

new AI module

AI tests

Boundary:

no Vault writes

no UI integration

no shared provider edits

Slice 3 — Existing-record protection and conflict guards

Implement:

target snapshot and mtime guard

exact canonical hydration

unmatched canonical Principle protection

legacy read-only mode

blocked-readiness record protection

explicit replacement mode

save-time target conflict path

save-time source-change warning

destructive confirmed reload()

Files:

core

store

view

corresponding tests

Boundary:

no AI UI required

no revision history, merge, hash, or recovery layer

Slice 4 — AI UI and lifecycle integration

Implement:

separate AI 검증 보조 region

no-call passive open

no-call readiness block

no-call zero-Evidence block

pre-run source snapshot comparison

run, cancel, retry

exactly two copy operations

provider/model status or provenance

one AbortController per run

run-token stale callback protection

cancelAI()

destroy()

Journal period child cleanup before DOM replacement

final loader wiring

Files:

monthly-validation-view.js

journal-period-view.js

HUB/70 Journal.md

AI, view, and navigation tests

Boundary:

no additional copy action

no AI persistence

no generic UI or Review framework

Slice 5 — Documentation and isolated Obsidian QA

Implement only after Slices 0–4 pass:

update the three approved existing documents

execute isolated synthetic-fixture QA

run all baseline and new tests

inspect dirty-worktree diff ownership

No new behavior may be introduced during documentation except a bounded correction required by a failed acceptance condition.

Final acceptance amendments:

The prior acceptance gate remains in force with these additional mandatory conditions:

AI context contains eligible Principles only.

Session refs are assigned after eligible filtering.

AI response cardinality exactly matches submitted eligible refs.

Missing, duplicate, or extra Principle reviews reject the whole response.

Ineligible Principles remain deterministic-only and canonical.

Ready human validation with zero bounded Evidence makes zero provider calls.

Zero-Evidence UI shows the exact local unavailability message and coverage warnings.

additionalProperties: false is not treated as the sole safety boundary.

Local exact-key allowlists run recursively after provider parsing.

Structured forbidden aliases are rejected after normalized-key comparison.

Permitted Korean free text is not subjected to unreliable keyword censorship.

Weekly source records expose local source_mtime.

Daily and Weekly source snapshots are captured with the initial deterministic model.

Every AI run and retry checks source path sets and mtimes before provider invocation.

Any source change blocks AI and requires explicit reload.

AI never runs against stale Principles and freshly recomputed Evidence.

Reload with edits or AI state requires destructive-reset confirmation.

Confirmed reload aborts AI and rebuilds target, sources, model, hydration, and context together.

Ordinary rerender never reloads or rehydrates.

Navigation destroy aborts without save, reload, or prompt.

Canonical hydration works even when current readiness is blocked.

Parser tests cover rejected/deferred reasons from their dedicated writer section.

Blocked readiness disables ordinary save of a hydrated existing record.

Replacing a record while readiness is blocked requires explicit replacement mode.

Saved history remains readable regardless of current readiness.

No provider call occurs for:

passive open

blocked readiness

zero bounded Evidence

detected source change

AI execution and draft-copy still cause zero Vault or Candidate writes.

Candidate creation occurs only after successful explicit human save and only for human validated decisions.

No shared provider code or Weekly Evidence parser code is modified.

If implementation requires either shared-code modification, implementation stops and returns to PLAN.

All supplied baseline tests and all new Slice tests pass.

Actual Obsidian QA verifies:

eligible-only AI cards

zero-Evidence behavior

pre-run source-change blocking

destructive reload confirmation

blocked-readiness canonical hydration

blocked-readiness replacement protection

writer/parser round trip for all decisions

Diff inspection confirms no unrelated dirty-worktree changes were claimed or modified.

Risks/missing evidence:

The exact writer grammar is now locally verified, but parser implementation must remain paired to that grammar rather than evolve into a broad Markdown parser.

Adding source_mtime to listWeeklyNotes() changes its local return shape. Existing callers must tolerate the additive field; no caller may begin persisting or prompting with it.

Current historical records may contain canonical-looking manual edits that fail the exact parser. The correct behavior remains legacy protection, not heuristic recovery.

A source path-set comparison requires consistent canonicalization of Vault paths. The implementation must reuse existing path forms rather than invent path normalization infrastructure.

The view tests will require bounded Obsidian mocks for TFile stat changes, abort behavior, and destructive reload. Those mocks must remain local to the Monthly/Journal test scope.

Actual product usefulness remains unproven with sparse real records, but this does not weaken the local safety or coder-readiness of the implementation plan.

Next packet request: none; the amended plan is coder-ready.

FINAL_PLAN_VERDICT: APPROVE

