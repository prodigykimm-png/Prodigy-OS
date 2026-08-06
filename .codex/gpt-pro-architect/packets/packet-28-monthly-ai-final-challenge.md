# Architect Packet 28 — Monthly AI Local Validation and Final Challenge

## Metadata
- topic: `journal-period-ai-20260803`
- conversation: continue exact existing `Prodigy OS Making` Journal AI chat
- previous packet: `packets/packet-27-monthly-ai-implementation-plan.md`
- previous response: `responses/response-37-monthly-ai-plan-initial.md`
- review gate: `PLAN`
- authority: local validation, same-thread discussion, local plan records only; no implementation

## Accepted Initial Specification
Accept the five-slice order, the Slice 0 human-flow fixes, selected-month Evidence projection, strict whole-response rejection, separate AI region with exactly two copy operations, writer-paired canonical hydration, legacy read-only replacement mode, target mtime guard, AbortController/destroy lifecycle, exact file map, tests, and isolated Obsidian QA.

## Local Validation Evidence

1. `buildMonthlyNoteContent()` exact current grammar was re-read.
   - It writes every deterministic Principle, including ineligible ones.
   - Each Principle section writes title, repeated weeks, Evidence, decision, optional knowledge statement, optional validation reason.
   - Rejected/deferred `reason` is written separately under `## Rejected or Deferred Principles`, not inside the Principle section.
   - Therefore `parseMonthlyNoteContent()` is feasible, but its paired-parser tests must include validated, rejected, deferred, pending, optional fields, and the separately stored rejection/defer reason.

2. Obsidian file mtime is locally available as `TFile.stat.mtime`; existing repo code uses that shape. The proposed snapshot/mtime guard is factual.

3. `AIProviderSchema.normalizeGeminiSchema()` intentionally strips unsupported JSON-schema keys, including `additionalProperties`. Therefore provider-side `additionalProperties: false` cannot be the safety boundary for every provider. The local `normalizeMonthlyAIResponse()` must use explicit key allowlists at every object level and semantic ref validation after provider parsing.

4. `MonthlyValidationCore.buildValidationModel()` returns all Principles and marks each `eligible`; only eligible Principles have human decision controls. The initial AI response did not explicitly state whether the request/output is one-to-one over eligible Principles only.

5. `listWeeklyNotes()` currently returns `{ path, week, start, end, principles }` without mtime. To support source-staleness checks without a second hidden lookup contract, its local return shape may add `source_mtime` from the Weekly `TFile.stat.mtime`. This value stays local and never enters the AI prompt.

6. Existing relevant tests remain green. No code was changed.

## Corrections That Must Be Normative

### 1. Eligible Principle cardinality
Recommended exact contract:
- `buildMonthlyAIContext()` includes only `model.principles.filter(p => p.eligible)`.
- Assign refs after filtering while preserving the existing deterministic order.
- A valid AI response contains exactly one `principle_reviews[]` item for every submitted eligible `principle_ref`, with no missing or extra refs.
- Ineligible Principles remain visible in deterministic Monthly UI and canonical human record, but never enter AI context and receive no AI review.

### 2. Zero bounded Evidence
Existing Monthly readiness must remain unchanged, but it is possible that all supporting refs fall outside the selected month or selected-month Daily files are absent.

Recommended exact contract:
- human Monthly validation remains available when existing readiness is ready;
- `AI 검증 보조` is locally unavailable when the final bounded `evidence[]` is empty;
- show `선택한 달에 AI가 검토할 구조화 Evidence가 없습니다` plus coverage warnings;
- make zero provider calls;
- do not invent a new Monthly readiness mode or change human eligibility.

### 3. Local strictness after provider schema normalization
Recommended exact contract:
- `MONTHLY_AI_SCHEMA` declares `additionalProperties: false` where supported;
- `normalizeMonthlyAIResponse()` independently enforces exact allowed keys recursively at root, each `principle_review`, and any nested structured object;
- reject forbidden structured keys or aliases (`decision`, `status`, `knowledge_statement`, `candidate`, `promotion`, `save`, `write`, `apply`, and equivalent snake/camel variants);
- do not attempt unreliable keyword censorship inside free-text Korean prose; grounding/ref checks and allowed output slots are the semantic boundary;
- whole response fails on any violation.

### 4. Source changes before AI run
The initial response says AI context is recomputed from current Daily and Weekly sources, but silent Weekly recomputation can change Principle ordering/membership and detach existing human edits from their targets.

Recommended exact contract:
- editor entry captures Daily and Weekly source path/mtime snapshots with the deterministic model;
- before every AI run/retry, compare current source mtimes to the editor snapshots;
- if changed, abort before provider call, show `입력 기록 변경됨`, and require explicit `다시 불러오기`;
- `다시 불러오기` warns that unsaved human edits and AI session output will be discarded, then rebuilds model, snapshots, hydration, and context as one operation;
- do not run AI against a mixed stale Principle model and fresh Evidence;
- the existing save-time source warning remains: human may explicitly save the already reviewed editor state despite source change, but AI may not run until reload.

### 5. Existing canonical record while readiness is now blocked
Recommended exact contract:
- history continues to show the saved record regardless of current readiness;
- entering validation hydrates exact canonical human data even if current readiness is now blocked;
- AI remains unavailable and no provider call occurs;
- normal save of hydrated data is disabled while readiness is blocked unless the user enters the already-defined explicit replacement mode; this prevents current missing sources from silently erasing a previously completed record;
- legacy/unrecognized files remain read-only until explicit replacement mode.

### 6. Reload semantics
Recommended exact contract:
- ordinary rerender never calls reload;
- `reload()` is a destructive editor reset only after explicit confirmation when human edits or an AI result exist;
- reload aborts active AI first, rereads target/source snapshots, rebuilds deterministic model, rehydrates canonical state once, and clears session AI output;
- navigation `destroy()` aborts without saving or prompting.

## Integrated Plan Clarifications

- `listMonthlyDailyEvidence()` returns selected-month Evidence, warnings, and Daily source snapshots.
- `listWeeklyNotes()` adds local `source_mtime`; `buildValidationModel()` may keep `weekly_paths` and separately expose local Weekly source snapshots, but neither mtime nor path is sent to AI except the already-approved recurrence facts and session refs.
- `parseMonthlyNoteContent()` must be derived from the current writer and tested as writer→parser round trip. It must parse rejected/deferred reason from its dedicated section.
- Candidate creation remains after a successful human save and only from human `validated`; AI execution and draft-copy do not call it.
- No shared provider code or Weekly parser code is edited. If local implementation proves that necessary, stop and return to PLAN.

## Final Decision Needed
Resolve all six corrections with one choice each. Return only amendments needed to integrate them into the initial normative specification plus the final implementation slices/acceptance gate. Do not repeat unrelated Quarterly/Yearly scope. Do not ask for another packet if the result is coder-ready.

## Required Response Format
Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Rationale:
Resolved correction 1:
Resolved correction 2:
Resolved correction 3:
Resolved correction 4:
Resolved correction 5:
Resolved correction 6:
Final ordered Monthly slices:
Final acceptance amendments:
Risks/missing evidence:
Next packet request: none if coder-ready
FINAL_PLAN_VERDICT: APPROVE | REVISE | BLOCK
