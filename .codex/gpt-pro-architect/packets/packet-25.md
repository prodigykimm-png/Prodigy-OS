# Architect Packet 25 — Challenge and Final Convergence

## Metadata
- topic: `journal-period-ai-20260803`
- conversation: continue the exact same `Prodigy OS Making` chat
- previous response: `responses/response-35-initial.md`
- review gate: `PLAN`
- authority: discussion and local planning records only; no implementation

## Accepted From Initial Review
- Monthly → Quarterly → Yearly staged order.
- Monthly AI remains inside the existing validation screen.
- Quarterly·Yearly human record foundation precedes their AI assistance.
- explicit user-triggered AI; deterministic-first; session-only AI output.
- dedicated period semantics and schemas; no generic Review Engine.
- Yearly v1 does not apply Identity Lens or settings.
- canonical inputs are bounded, referenced records rather than global Vault search.

## Repo-Grounded Corrections

1. `JournalPeriodStore` is read-only and only lists/opens records. Quarterly·Yearly have no writers.
2. `MonthlyValidationStore.save()` currently modifies `DAILY/MONTHLY/YYYY-MM.md` in place. Daily and Weekly Journal records do not maintain append-only revision files.
3. No concrete Identity Lens storage path, schema, writer, or snapshot API was found. Identity Lens is currently an operating-model concept, not an implemented canonical object that Yearly can safely diff.
4. `AIProviderService` already accepts an AbortSignal and applies timeouts. Structured requests return validated payload; Daily/Weekly call sites attach provider/model metadata.
5. Current vault evidence is sparse: one legacy Monthly record exists; no Quarterly or Yearly records exist. Three real Monthly dogfooding sessions and real quarter/year review sessions cannot be completed immediately without inventing personal records.
6. Existing Monthly readiness requires completed Weekly records and recurring Suggested Principles. This is already a meaningful human validation gate.

## Challenge 1 — Avoid Premature Journal Versioning Infrastructure

The initial review requires append-only revision history, source hashes, optimistic concurrency, and two-window conflict QA for Quarterly/Yearly. That is stronger than every current Journal writer and would turn this feature into a new version-control subsystem.

Proposed v1 correction:
- one canonical file per period: `DAILY/QUARTERLY/YYYY-Qn.md`, `DAILY/YEARLY/YYYY.md`;
- read file mtime when opening editor;
- before save, if current mtime differs, block silent overwrite and require reload or explicit replace confirmation;
- no revision property, append-only history folder, or content hash in v1;
- source references and source mtimes are stored only when needed to show “입력 기록 변경됨” before save;
- Git/file recovery remains outside the Journal product contract.

Question: Is this minimal conflict guard sufficient for local single-user Obsidian v1, or is a new revision-history subsystem truly a PLAN blocker? Choose one, do not leave both.

## Challenge 2 — Counterevidence Input Contradiction

The initial Monthly contract forbids all Monthly Daily inputs but asks AI to identify counterevidence. Suggested Principles normally reference supporting Evidence, so a model cannot discover contrary Evidence it never receives.

Proposed correction:
- pass only structured Evidence projections for the selected month, never raw Daily note text;
- projection fields are `evidence_id`, date, context, experience, interpretation, change, next_experiment;
- supporting refs remain attached to each Principle;
- AI may find contradictions/exceptions only inside that bounded monthly projection;
- no other month or unrelated Object/Knowledge content is included.

Question: approve the bounded monthly Evidence projection, or remove `counter_evidence_refs` and limit the output to gaps/questions. Choose one.

## Challenge 3 — Hard Threshold Versus Question-Only Mode

Two Monthly records for Quarterly and two Quarterly records for Yearly are quality thresholds, not necessarily safety boundaries. Sparse data can still support “무엇이 빠졌는가?” without supporting Direction or Identity prose.

Proposed two-mode contract:
- `blocked`: zero completed lower-period records or broken required references; no AI call.
- `question_only`: one completed lower-period record; AI may return only missing evidence, uncertainties, and review questions. It may not produce Direction Change or Identity Lens drafts.
- `full_review`: Quarterly requires at least two completed Monthly records plus one human-validated Principle; Yearly requires at least two completed Quarterly records with human-written Direction text.
- 3/3 months and 4/4 quarters remain warnings, not hard blocks.

Question: does this improve utility without allowing sparse-data overreach? If rejected, explain why deterministic missing-data prompts are insufficient.

## Challenge 4 — Yearly Without An Identity Lens API

Because no canonical Identity Lens implementation exists, Yearly v1 cannot truthfully promise a before/after diff.

Proposed correction:
- Yearly human foundation stores a review only.
- Yearly AI may eventually propose evidence-backed `candidate_lens_statements`, continuities, changes, tensions, uncertainties.
- remove `current Identity Lens snapshot` and `identity_lens_diff_draft` from v1.
- Identity Lens storage, diff, and apply flow require a separate future PLAN after a canonical lens contract exists.

Question: confirm that Yearly v1 is review-only and cannot depend on a nonexistent lens API.

## Challenge 5 — Honest Rollout With Sparse Real Records

Do not make fabricated personal records a dogfooding requirement.

Proposed gates:
- automated fixtures prove full Monthly/Quarterly/Yearly contracts, sparse modes, malformed AI responses, and zero-write boundaries;
- actual Obsidian QA proves visible navigation, readiness, explicit AI invocation, cancel/error/retry, deterministic-first content, edit/save/reopen, no unintended source/settings changes;
- real-data product dogfooding is a rollout observation gate when records naturally exist, not a precondition for implementing the human foundation;
- Quarterly/Yearly AI buttons may remain unavailable until real records meet readiness.

## Requested Final Decision

Return a final bounded PLAN, not another open-ended next-packet request. Resolve the five challenges above and give exactly one recommended architecture.

Required response:
- `Decision: APPROVE | REVISE | BLOCK`
- `Gate reviewed: PLAN`
- verdict on minimal mtime conflict guard versus revision subsystem
- verdict on Monthly bounded Evidence projection
- verdict on `blocked/question_only/full_review`
- verdict on Yearly review-only without lens snapshot/diff
- final period input/output/human-gate contracts
- exact implementation order
- minimum test and actual Obsidian QA gates
- explicit deferred scope
- `FINAL_PLAN_VERDICT: APPROVE | REVISE | BLOCK`
