# GPT Pro Architect Response 35 — Initial PLAN Review

- topic: `journal-period-ai-20260803`
- conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a701a85-795c-83ee-8aa9-288e6ce9a120`
- gate: `PLAN`
- decision: `REVISE`
- model evidence: ChatGPT account UI `Pro`; reasoning control `높음`; exact server-side generation model not independently verified

## Rationale

제안의 핵심 방향은 옳지만 현재 상태로 승인하면 안 된다. Monthly → Quarterly → Yearly 순서, 명시적 AI 실행, 결정론적 정보 우선 표시, 인간의 저장·검증·승격 소유권, 기간별 전용 계약은 모두 타당하다. 그러나 Quarterly·Yearly에는 아직 인간이 사용할 리뷰 스키마·저장소·작성 UI조차 없는데 AI 기능과 함께 설계되어 있고, readiness 기준·정본 입력 범위·재저장 및 버전 정책도 결정되지 않았다. 특히 “공유 상태 머신”이 먼저 구현되면 세 기간의 의미가 일반화된 요약 기능으로 붕괴할 위험이 있다. 따라서 제안의 철학은 승인하되, Quarterly·Yearly의 인간 전용 기록 기반을 AI보다 먼저 만들고 기간별 계약과 저장 경계를 확정하도록 수정해야 한다.

## Accepted design

- 구현 순서는 Monthly → Quarterly → Yearly이며 세 기간 동시 수직 슬라이스는 거부한다.
- Monthly AI는 기존 검증 화면 안에만 추가한다.
- Quarterly와 Yearly는 고유한 질문·입력·출력 계약을 가진다.
- AI는 명시적 버튼으로만 실행한다.
- 결정론적 기간 정보, 출처, readiness, 누락 데이터가 AI 결과보다 먼저 보인다.
- AI는 상태 결정, Knowledge 생성, Direction 적용, Identity Lens 적용을 수행하지 않는다.
- 상위 기간은 원칙적으로 바로 아래 기간의 완료 기록을 소비한다.
- Yearly v1은 리뷰 기록 저장에서 종료하고 Identity Lens 적용은 후속 게이트로 분리한다.
- 기존 `AIProviderService`와 설정을 재사용한다.

## Required changes

- Quarterly·Yearly는 AI 기능 전에 인간 전용 record schema, deterministic context view, store, writer, edit/save UI를 정의한다.
- 공유 상태는 범용 엔진이 아닌 실행·취소·오류·재시도·저장 표시용 최소 UI shell로 제한한다.
- readiness의 hard block과 informational warning을 분리한다.
- AI 초안은 v1에서 session-only이며 별도 AI 초안 artifact를 만들지 않는다.
- 재저장, revision, stale-source, 충돌 처리 계약을 명시한다.
- Quarterly의 임의 Knowledge 검색과 Yearly의 Vault 전체 읽기를 금지한다.
- 모든 AI claim에 source reference를 요구한다.
- Quarterly·Yearly의 인간 기록 기반과 AI 기능을 같은 구현 슬라이스로 묶지 않는다.

## Period contracts

### Monthly

- 정본 입력: 선택 월의 완료 Weekly reviews, Suggested Principles, Principle이 직접 참조하는 Daily Evidence projection, 결정론적 recurrence/readiness.
- 금지 입력: 전체 Daily 원문, 연결되지 않은 Knowledge, 다른 월 임의 기록.
- 출력: `principle_ref`, `supporting_evidence_refs`, `counter_evidence_refs`, `missing_evidence`, `contradictions_or_exceptions`, `validation_questions`, `validation_rationale_draft`, `next_month_direction_draft`.
- 금지 출력: `validated`, `rejected`, `deferred`, `pending`, Candidate 생성 명령.
- 인간 게이트: 기존 화면에서 상태와 이유를 결정하고 명시적으로 저장한다.

### Quarterly

- 정본 입력: 선택 분기의 완료 Monthly records, 인간 검증 Principles, 해당 Monthly 또는 Direction에서 명시 연결된 approved Knowledge, prior Direction snapshot.
- 전역 Knowledge 검색은 금지한다.
- 출력: `alignment_findings`, `continue_candidates`, `stop_candidates`, `start_candidates`, `principle_outcome_tensions`, `assumptions_to_recheck`, `counter_evidence`, `missing_evidence`, `direction_change_draft`.
- 모든 항목은 Monthly, Principle, Knowledge 또는 prior Direction reference를 포함한다.
- 금지 출력: Project·Area·goal·priority 직접 변경이나 자동 업데이트.
- 인간 게이트: Direction Change를 편집하고 Quarterly record를 `draft` 또는 `completed`로 저장한다.

### Yearly

- 정본 입력: 완료 Quarterly records, 인간 채택 Direction changes, Direction이 명시 참조하는 approved Knowledge, 실행 시점 Identity Lens snapshot.
- 출력: `continuities`, `changes`, `tensions`, `candidate_lens_statements`, `beliefs_to_refine_or_retire`, `uncertainties`, `identity_lens_diff_draft`.
- Identity Lens가 없으면 diff를 생성하지 않는다.
- 금지 출력: Identity Lens 적용, 설정 변경, 근거 없는 정체성 단정.
- 인간 게이트: Yearly review 편집·저장.
- Yearly v1은 review artifact에서 종료한다.

## Shared versus dedicated

- 공유 허용: 기존 provider resolution, 실행·취소·오류·재시도 상태, source reference UI, provenance envelope, schema validation 진입점, 저장·충돌·stale 표시, 한글 라벨과 snake_case key 규칙.
- 기간별 전용: context builder, projection, prompt, output schema, semantic validator, view sections, store/writer, readiness evaluator.
- 금지: generic period prompt, `summarizePeriod()`, 공통 AI Review Engine, 기간명만 바꾸는 단일 output schema.
- 공유 UI shell은 Monthly 구현에서 실제 중복이 확인된 뒤 추출한다.

## Readiness

### Monthly

- hard: 기존 계약 그대로, 완료 Weekly 최소 2개, 서로 다른 2주 Evidence가 뒷받침하는 Principle 최소 1개, 핵심 reference 무결성.
- warning: 완료 Weekly 3개 미만, 일부 주 비어 있음, 반대 Evidence 없음, Principle 하나뿐.

### Quarterly

- hard: 완료 Monthly 최소 2개, 인간 검증 Principle 최소 1개, 핵심 reference 정상.
- warning: 3개월 미완료, 검증 Principle 2개 미만, prior Direction 없음, 연결 Knowledge 없음, 선택 reference 일부 깨짐.

### Yearly

- hard: 서로 다른 분기의 완료 Quarterly 최소 2개, 각 record에 인간 저장 Direction text, 핵심 reference 정상.
- warning: 4분기 미완료, adopted Direction 없음, approved Knowledge 없음, Identity Lens snapshot 없음.
- Identity Lens가 없어도 Yearly action은 허용하되 diff는 비활성화한다.

Sparse data에서는 누락, 질문, 불확실성만 반환하며 성격·전략·정체성 추론으로 빈칸을 채우지 않는다.

## Persistence and approval

- AI 출력은 리뷰 저장 전까지 memory session state로만 유지한다.
- unsaved warning은 허용하되 autosave는 금지한다.
- 별도 AI draft 파일·cache·inbox·background artifact는 만들지 않는다.
- 인간 리뷰 record는 `draft` 또는 `completed`가 될 수 있다.
- Quarterly·Yearly 최소 record: `schema_version`, `period_id`, `period_start`, `period_end`, `review_status`, `source_refs`, `source_snapshot`, `final_content`, `revision`, `created_at`, `updated_at`, optional `ai_provenance`.
- `ai_provenance`: provider ID, model ID, prompt version, output schema version, generated time만 저장한다.
- `source_snapshot`: source path, source period, hash 또는 mtime.
- 묵시적 overwrite를 금지하고 explicit confirmation + optimistic concurrency로 revision을 증가시킨다.
- 이전 revision은 append-only history로 보존한다.
- 저장 직전 source 변경 시 stale 경고 후 재생성 또는 현재 편집본 저장을 사람이 선택한다.
- 원본 Weekly/Monthly/Quarterly/Principle/Knowledge/Direction/Identity Lens는 수정하지 않는다.
- Candidate 생성, Knowledge 승인, Direction 채택, Identity Lens 적용은 별도 인간 행위다.

## Ordered implementation slices

1. Monthly AI input/output/validator/readiness/session 계약.
2. 기존 Monthly validation screen 내 AI assistance.
3. 실제 record 최소 3회의 Monthly dogfooding.
4. AI 없는 Quarterly human foundation: deterministic summary, schema, store/writer, edit/save UI.
5. Quarterly AI assistance.
6. 실제 분기 record의 저장·재개·수정·완료 dogfooding.
7. AI 없는 Yearly human foundation: Quarterly summary, Identity Lens snapshot, schema, save UI.
8. Yearly AI continuity/change/tension + lens diff draft.
9. Yearly review dogfooding.
10. Identity Lens 적용은 별도 미래 PLAN.

## Required test and Obsidian QA themes

- open/button-before-click zero network, cancellation, provider failure, malformed response, source immutability, reference validation, session-only draft, stale detection, conflict, revision history.
- Monthly readiness/reference boundaries, month scoping, forbidden validation status/Candidate creation.
- Quarterly hard/warning thresholds, linked-Knowledge-only input, forbidden Project/Area/goal update, draft/completed/revision.
- Yearly threshold, missing-lens behavior, linked Knowledge only, unsupported identity statements, no setting/apply action.
- Actual Obsidian: no auto-call, readiness UX, deterministic-first rendering, cancel/failure/retry, human-only canonical save, Quarterly missing-month warnings, source-stale/conflict behavior, Yearly missing-lens and zero-setting-write behavior, restart discards AI session draft, history opens latest and preserves prior revisions, responsive controls.

## Risks and evidence gaps

- Quarterly·Yearly human record foundation is absent.
- shared shell could erode period semantics.
- overwrite/revision/stale/conflict policy is absent.
- AI draft versus human draft record is undefined.
- actual Monthly data density is unknown.
- Identity Lens location/schema/snapshot API was not supplied.
- current period store revision/concurrency support is unknown.
- AIProviderService cancellation/timeout/provenance detail was not supplied.
- Quarterly Direction versus adopted Direction property is absent.
- counterevidence/missing-evidence utility is unproven.
- main risk: sparse data becoming plausible but unsupported strategy or identity prose.

## Next packet request

Submit a revised `PLAN` packet containing Monthly JSON schema and validators; Quarterly and Yearly human record contracts; readiness hard/warning rules; revision/stale/conflict handling; exact shared-shell responsibility; and named automated/manual QA. No implementation authority.

`FINAL_PLAN_VERDICT: REVISE`
