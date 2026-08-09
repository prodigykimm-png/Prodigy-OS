# GPT Pro Architect Response 35 — Final Journal Period AI PLAN

- topic: `journal-period-ai-20260803`
- conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a701a85-795c-83ee-8aa9-288e6ce9a120`
- gate: `PLAN`
- decision: `APPROVE`
- prior decision: `REVISE` in `response-35-initial.md`
- model evidence: ChatGPT account UI `Pro`; reasoning control `높음`; exact server-side generation model not independently verified

## Rationale

Packet 25의 수정안은 초기 검토의 blocker를 닫았다. 로컬 단일 사용자 Obsidian v1에 별도 revision subsystem을 만들지 않고도 silent overwrite를 차단할 수 있고, Monthly는 선택 월의 구조화 Evidence projection만으로 제한된 반증·예외 검토를 할 수 있다. Quarterly·Yearly의 `blocked / question_only / full_review` 분리는 희박한 데이터의 유용성은 살리면서 전략·정체성 과잉 추론을 차단한다. 존재하지 않는 Identity Lens API를 Yearly v1에서 제거한 것도 필수 정정이다. 최종안은 명시적 AI 실행, deterministic-first, session-only draft, source immutability, 인간 저장·검증 소유권을 유지한다.

## 1. Conflict and persistence decision

- v1은 append-only revision files, revision property, content hash, history folder, automatic merge, Journal 전용 복구 시스템을 만들지 않는다.
- canonical files:
  - `DAILY/QUARTERLY/YYYY-Qn.md`
  - `DAILY/YEARLY/YYYY.md`
- 편집 시작 시 target record의 mtime을 세션에 보관한다.
- 저장 직전 current mtime을 다시 읽는다.
- mtime이 다르면 silent overwrite를 차단하고 `다시 불러오기` 또는 명시적 재확인 뒤 `현재 편집본으로 교체`만 제공한다.
- AI 입력 source들의 path/mtime도 세션에 보관하고 저장 전 변경 시 `입력 기록 변경됨` 경고를 표시한다.
- canonical record에는 `source_refs`만 저장한다. source mtime은 stale 확인용 session state다.

## 2. Monthly bounded Evidence projection

- Monthly AI 입력은 선택 월의 구조화된 Daily Evidence projection 전체로 제한한다. raw Daily note body는 전달하지 않는다.
- projection fields: `evidence_id`, `date`, `context`, `experience`, `interpretation`, `change`, `next_experiment`.
- Suggested Principle에는 supporting Evidence references를 함께 보낸다.
- AI는 projection 안에서 supporting evidence, counterevidence, exceptions, missing evidence, validation questions, validation rationale draft를 제안한다.
- `supporting_evidence_refs`와 `counter_evidence_refs`는 입력 projection에 존재하는 `evidence_id`만 참조할 수 있다.
- unknown ID, 다른 월 Evidence, Object/Knowledge 참조는 응답 검증 실패다.

## 3. Readiness modes

### `blocked`

- 완료된 직전 기간 record 0개, 필수 source unreadable, 필수 reference broken, 또는 deterministic context 생성 실패.
- AI를 호출하지 않는다.
- 부족한 record, broken reference, 실행 불가 이유, readiness 조건만 결정론적으로 표시한다.

### `question_only`

- 완료된 직전 기간 record가 정확히 1개이고 필수 references가 정상.
- 허용 output: `coverage_summary`, `missing_evidence`, `uncertainties`, `review_questions`, `source_refs`.
- 금지: Quarterly continue/stop/start와 Direction draft; Yearly candidate lens statements; 확정적 정체성·신념 문장; 전략·설정 변경 제안.

### `full_review`

- Quarterly: completed Monthly 최소 2개 + human-validated Principle 최소 1개 + valid references.
- Yearly: completed Quarterly 최소 2개 + 각 record의 human-written Direction + valid references.
- 3/3 Monthly 미충족, 4/4 Quarterly 미충족, prior Direction 없음, linked Knowledge 없음, counterevidence 부족은 warning이지 hard block이 아니다.
- Monthly는 기존 readiness를 그대로 사용하며 `question_only`를 추가하지 않는다.

## 4. Period contracts

### Monthly — AI 검증 보조

- Question: `어떤 변화가 실제로 검증되었는가?`
- Inputs: selected-month completed Weekly reviews, Suggested Principles, supporting Evidence refs, bounded Daily Evidence projections, deterministic recurrence/readiness.
- Forbidden inputs: raw Daily body, other-month Evidence, unrelated Object, global Knowledge, Quarterly/Yearly records.
- Outputs: `principle_reviews[]` with `principle_ref`, supporting/counter refs, missing evidence, contradictions/exceptions, validation questions, validation rationale draft; plus `next_month_direction_draft`.
- AI cannot set `validated/rejected/deferred/pending`, save Monthly, create/promote Knowledge Candidate, or modify Evidence.
- Human chooses Principle decisions, edits validation reason/knowledge statement, and explicitly saves through the existing Monthly boundary.
- AI output is session-only; only the human-edited Monthly record is canonical.

### Quarterly — AI 방향 점검

- Question: `지금 방향은 맞는가?`
- Inputs: selected-quarter completed Monthly records, human-validated Principles, approved Knowledge explicitly linked by Monthly/Direction, prior Quarterly Direction when present, deterministic coverage/source refs.
- Global Knowledge search is forbidden.
- Question-only outputs: coverage, missing evidence, uncertainties, review questions, refs.
- Full-review outputs: `alignment_findings`, continue/stop/start candidates, principle/outcome tensions, assumptions to recheck, counterevidence, missing evidence, `direction_change_draft`, refs.
- Every full-review claim needs a Monthly/Principle/Knowledge/prior-Direction reference.
- AI cannot modify Project, Area, goal, priority, adopt Direction, or save the Quarterly record.
- Human edits output, finalizes `direction_change`, chooses `draft/completed`, and explicitly saves.
- Minimum record: `schema_version`, `period`, `review_status`, `source_refs`, `coverage_summary`, `review`, `direction_change`, `created_at`, `updated_at`, optional `ai_provenance`.

### Yearly — AI 정체성 성찰

- Question: `나는 어떤 사람이 되어가고 있는가?`
- Inputs: selected-year completed Quarterly records, human-written Directions, approved Knowledge explicitly linked by Direction, deterministic coverage/source refs.
- Forbidden inputs: current Identity Lens, system settings, global Journal text, global Knowledge search, direct Monthly/Daily retraversal.
- Question-only outputs: coverage, missing evidence, uncertainties, review questions, refs.
- Full-review outputs: continuities, changes, tensions, uncertainties, evidence-backed `candidate_lens_statements`, refs.
- Candidate lens statements are review prose candidates, not a system Identity Lens.
- AI cannot assert identity without evidence, retire beliefs, create/modify Identity Lens, change settings, or auto-save.
- Human edits final review, chooses `draft/completed`, and explicitly saves.
- Minimum record: `schema_version`, `period`, `review_status`, `source_refs`, `coverage_summary`, `review`, `continuities`, `changes`, `tensions`, `candidate_lens_statements`, `created_at`, `updated_at`, optional `ai_provenance`.
- Yearly v1 ends at a review artifact.

`ai_provenance` contains provider, model, prompt version, and output schema version only. Raw prompts/responses are not persisted.

## 5. Shared and dedicated boundaries

- Shared: existing `AIProviderService`, AbortSignal/timeout, provider/model metadata, run/cancel/error/retry controls, session-draft state, source-ref renderer, mtime conflict guard, provenance envelope, Korean labels/snake_case keys.
- Dedicated per period: readiness evaluator, input projection, context builder, prompt, output schema, semantic validator, human editor sections, canonical writer.
- Forbidden: generic Review Engine, period-name-swapped prompt, unified output schema, Vault-wide retrieval, speculative shared framework.
- Extract common UI only after Monthly implementation reveals real duplication.

## 6. Ordered implementation

1. Monthly bounded Evidence projection builder and ID/reference validator.
2. Monthly AI assistance inside the existing validation screen; explicit run, session editing, cancel/error/retry, zero automatic writes.
3. Quarterly human foundation; canonical create/open/edit/save, `draft/completed`, mtime guard, deterministic source summary, no AI.
4. Quarterly dedicated readiness modes, projection, prompt, schema, validator, explicit AI button; Direction remains human-saved.
5. Yearly human foundation; canonical create/open/edit/save, mtime guard, deterministic Quarterly summary, no lens UI and no AI.
6. Yearly dedicated readiness modes and review-only AI; no settings/lens write.
7. Observe product value on real records as they naturally accumulate; sparse real data does not block human-foundation implementation, while readiness keeps unavailable AI actions disabled.

## 7. Minimum automated gates

- Open and pre-click AI/network calls = 0; deterministic content first; cancel/timeout/error/retry; malformed/unknown refs rejected; AI run alone creates no canonical write; sources immutable; session draft not restored.
- mtime guard: normal save, external-change block, reload, explicit replace confirmation, no auto merge.
- Monthly: existing readiness, month-bounded projection, raw body exclusion, ref validation, forbidden AI decision fields, existing validation survives AI failure.
- Quarterly: 0/1/2 lower records map to blocked/question-only/full-review; forbidden Direction in question-only; coverage warning; unlinked Knowledge excluded; create/save/reopen; zero Project/Area/goal/priority writes.
- Yearly: 0/1/2 lower records map to three modes; candidate lens rejected in question-only; incomplete-year warning; no Identity Lens context; diff/apply/settings fields rejected; create/save/reopen; settings/source zero-write.
- Regression: Daily AI, Weekly AI, Monthly validation, period navigation/history, provider cancel/timeout.

## 8. Actual Obsidian QA gates

- No auto network on Monthly/Quarterly/Yearly open; deterministic sources/readiness before AI controls.
- Monthly readiness disabled reason and ready-fixture run/cancel/retry/edit/save/reopen.
- Quarterly 0/1/2 sources visibly produce three modes; question-only never fills Direction; source files stay unchanged.
- mtime conflict block, reload, explicit replace.
- Yearly 0/1/2 sources produce three modes; no Identity Lens/diff/apply/settings controls; before/after Vault diff shows zero settings/source writes.
- Provider failure preserves deterministic UI and human edits.
- Obsidian restart discards unsaved AI session draft.
- Saved Quarterly/Yearly records open through existing history listing.
- Do not fabricate personal records; use isolated fixtures/test vault for unavailable states.

## 9. Explicitly deferred

Journal revision history, append-only revisions, hashes, merge/recovery UI, AI draft files/cache, background/scheduled review, telemetry, provider-response archive, generic period engine, Vault-wide retrieval, unrelated Object/Knowledge search, Quarterly automated Project/Area/goal/priority changes, Identity Lens schema/storage/snapshot/diff/writer/apply, settings application, Knowledge auto-creation/promotion, and fabricated real-data dogfooding.

`FINAL_PLAN_VERDICT: APPROVE`
