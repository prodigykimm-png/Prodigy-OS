# Monthly AI 구현 PLAN — 2026-08-03

## 판정

- GPT Pro Architect: `APPROVE`
- Gate: `PLAN`
- 구현 상태: 미구현
- 구현 권한: 부여되지 않음
- 대화: https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a701a85-795c-83ee-8aa9-288e6ce9a120

Monthly AI는 기존 검증 화면에 별도 `AI 검증 보조` 영역으로 추가한다. AI는 선택 월의 구조화 Evidence만 읽고 검증 근거·반증·예외·질문·사유 초안·다음 달 방향 초안을 제안한다. Principle 결정, 지식 문장, 저장, Candidate 생성은 계속 사람 소유다.

## 1. 불변 계약

- Monthly 화면을 열기만 해서는 provider/network 호출이 0회다.
- 기존 readiness를 바꾸지 않는다.
  - 완료 Weekly 2개 이상
  - 서로 다른 Weekly에서 반복된 eligible Principle 1개 이상
- AI는 사용자가 `AI 검증 보조`를 눌러야 실행된다.
- AI 입력은 선택 월 `DAILY/DAILY/YYYY-MM-DD.md`의 구조화 Evidence projection만 포함한다.
- raw Daily Markdown, 다른 달 Evidence, global Vault/Knowledge/Object, Quarterly/Yearly는 보내지 않는다.
- AI 결과는 세션에만 존재한다.
- AI는 decision, status, knowledge statement, save, Candidate, Knowledge를 변경하지 못한다.
- 응답 하나라도 구조·참조·금지 필드를 위반하면 전체 응답을 거부한다.
- 취소·timeout·provider 오류·잘못된 응답·화면 이동 후에도 deterministic 내용과 사람 편집값을 보존한다.
- 기존 Monthly canonical 기록은 조용히 덮어쓰지 않는다.

## 2. 선행 수정

AI를 붙이기 전에 현재 Monthly 사람 흐름을 고친다.

1. `load()`와 `render()`를 분리한다.
   - 결정 버튼은 `render()`만 호출한다.
   - 일반 rerender는 Vault 재조회, 모델 재생성, hydration, state 초기화를 하지 않는다.
2. writer가 이미 지원하는 사람 입력 UI를 노출한다.
   - `summary`
   - `next_direction`
3. `journal-end-date`의 고정 `-28`을 실제 월말로 바꾼다.
4. 현재 writer 형식 전용 `parseMonthlyNoteContent(markdown)`를 추가한다.
   - validated/rejected/deferred/pending
   - knowledge statement
   - validation reason
   - 별도 `Rejected or Deferred Principles` 섹션의 reason
   - writer→parser round trip
   - 임의 legacy Markdown 추론 금지

## 3. AI 입력 계약

```js
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
```

세부 규칙:

- `model.principles.filter(p => p.eligible)`만 AI 입력에 포함한다.
- 필터링 후 기존 deterministic 순서로 `monthly-YYYY-MM-pNNN` session ref를 붙인다.
- ineligible Principle은 기존 UI와 canonical 기록에 남지만 AI 카드·복사 액션은 없다.
- Daily filename이 선택 월에 속하는 Evidence만 projection한다.
- supporting refs는 허용 ID 집합과 교집합을 취한다.
- 다른 달·누락·읽기 실패 ref는 보내지 않고 `excluded_ref_count`로만 로컬 표시한다.
- Evidence ID 충돌은 AI 실행을 차단한다.
- 최종 `evidence[]`가 0개면 human Monthly 검증은 유지하지만 AI는 비활성화하고 provider 호출은 0회다.
- 표시 문구: `선택한 달에 AI가 검토할 구조화 Evidence가 없습니다`

## 4. AI 출력 계약

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

검증 규칙:

- 제출한 eligible `principle_ref`마다 정확히 1개 review가 필요하다.
- 누락·중복·추가 Principle review는 전체 거부한다.
- 응답 순서는 신뢰하지 않고 제출 순서로 재정렬한다.
- 모든 supporting/counter ref는 제출한 Evidence ID여야 한다.
- 중복·unknown·foreign/excluded ref는 전체 거부한다.
- root와 각 nested structured object에 exact-key allowlist를 적용한다.
- `additionalProperties: false`는 schema에 선언하되, Gemini 정규화에서 제거될 수 있으므로 안전 경계로 신뢰하지 않는다.
- `decision/status/knowledge_statement/candidate/promotion/save/write/apply`와 snake/camel alias key를 정규화 비교해 거부한다.
- 허용된 한국어 자유문장 자체를 키워드 검열하지 않는다.

## 5. 사람 적용 UI

별도 `AI 검증 보조` 영역에 다음을 표시한다.

- 지지 근거
- 반대·예외 근거
- 누락 근거
- 모순·예외
- 검증 질문
- 검증 사유 초안
- provider/model 상태

허용 복사 액션은 정확히 두 개다.

1. `AI 초안 복사`
   - 해당 Principle의 `validation_rationale_draft`만 사람의 검증 사유 필드로 복사
2. `다음 달 방향 초안 복사`
   - `next_month_direction_draft`만 사람의 `next_direction`으로 복사

복사는 decision, knowledge statement, summary를 바꾸지 않고 저장·Candidate 생성을 실행하지 않는다.

## 6. 기존 기록·충돌·reload 계약

### Canonical 기록

- editor 진입 시 `{ exists, path, content, mtime }` snapshot을 읽는다.
- 현재 writer 형식이면 summary, direction, decision, reason, knowledge statement를 한 번만 hydrate한다.
- current model과 매칭되지 않는 저장 Principle은 `기존 기록에만 존재`로 읽기 전용 표시한다.
- 해당 항목을 없애는 저장에는 `기존 기록 교체` 명시 확인이 필요하다.

### Legacy 또는 인식 불가 기록

- 기존 history/open 화면에서는 계속 읽을 수 있다.
- 추측 hydration을 하지 않는다.
- `기존 기록 형식을 자동으로 불러올 수 없습니다`를 표시한다.
- 일반 저장을 막고 `새 검증으로 교체`를 명시 선택해야 replacement mode가 열린다.

### Readiness가 현재 blocked인 기존 기록

- canonical hydration과 read-only 검토는 허용한다.
- AI는 비활성화하고 provider 호출은 0회다.
- 일반 저장은 막는다.
- 저장하려면 missing/changed source로 기존 기록이 달라질 수 있다는 경고와 replacement mode 확인이 필요하다.

### mtime과 source snapshot

- 저장 전 target mtime이 opening snapshot과 다르면 silent overwrite를 막는다.
- `다시 불러오기` 또는 두 번 확인하는 `현재 편집본으로 교체`만 제공한다.
- editor 진입 시 Daily·Weekly path/mtime snapshot을 deterministic model과 함께 보관한다.
- AI 실행·재시도 직전에 path set과 mtime을 비교한다.
- source가 바뀌면 provider 호출 전에 `입력 기록 변경됨`을 표시하고 reload를 요구한다.
- stale Principle model과 fresh Evidence를 섞어 AI를 실행하지 않는다.
- 저장 시 source 변경은 경고하되, 사람은 현재 검토 상태를 명시적으로 저장할 수 있다.

### reload와 destroy

- `reload()`는 destructive reset이다.
- 사람 편집 또는 AI state가 있으면 `다시 불러오면 저장하지 않은 입력과 AI 검증 결과가 사라집니다`를 확인받는다.
- 확인 후 active AI abort → run token 무효화 → target/source 재조회 → model/context 재생성 → canonical 1회 hydration → AI state 삭제 → render 순으로 처리한다.
- 취소한 reload는 현재 state를 그대로 둔다.
- `destroy()`는 active AI를 abort하고 callback을 무효화하며 저장·reload·prompt를 실행하지 않는다.

## 7. 파일·심볼 계획

| 파일 | 변경 |
|---|---|
| `SYSTEM/Views/monthly-validation-core.js` | `getMonthDateRange`, `assignMonthlyPrincipleRefs`, `buildMonthlyAIContext`, `parseMonthlyNoteContent`; writer 월말 수정 |
| `SYSTEM/Views/monthly-validation-store.js` | `listMonthlyDailyEvidence`, `readMonthlySnapshot`, `saveWithMtimeGuard`; Weekly 결과에 local `source_mtime` 추가 |
| `SYSTEM/Views/monthly-validation-ai.js` | 신규 schema, prompt, strict normalize/validate, provider 호출 adapter |
| `SYSTEM/Views/monthly-validation-view.js` | load/render 분리, hydration, human editors, AI run/cancel/retry/copy, replacement/conflict/reload, `destroy` |
| `SYSTEM/Views/journal-period-view.js` | Monthly child controller 보관 및 DOM 교체 전 `destroy()` |
| `HUB/70 Journal.md` | core → store → AI → view 순서로 신규 모듈 load |
| 기존 Journal 문서 3개 | 구현 후 실제 동작만 동기화 |
| Journal tests | core 확장, store/AI/view 신규, navigation cleanup 확장 |

공유 `AIProviderService`와 `WeeklyFilterCore.parseDailyEvidenceBlocks`는 수정하지 않는다. 필요해지면 구현을 멈추고 PLAN으로 돌아간다.

## 8. 구현 순서

### Slice 0 — 사람 흐름과 canonical grammar

- load/render 분리와 state 보존
- summary/next-direction UI
- 실제 월말
- writer 전용 parser와 round-trip
- AI/provider/source projection 없음

### Slice 1 — source snapshot과 bounded projection

- Weekly `source_mtime`
- 선택 월 Daily Evidence projection
- Daily/Weekly snapshots
- duplicate ID 차단
- eligible-only refs와 1:1 request context
- supporting-ref intersection, coverage warnings, zero-Evidence availability
- AI 호출 없음

### Slice 2 — strict Monthly AI adapter

- 신규 `monthly-validation-ai.js`
- schema/prompt
- local recursive allowlist
- forbidden-key alias 검사
- exact cardinality/ref 검사
- whole-response reject
- AbortSignal 전달과 기존 provider/config 재사용
- UI/Vault write 없음

### Slice 3 — 기존 기록 보호와 conflict guard

- target snapshot/mtime
- canonical hydration
- unmatched/legacy/blocked-readiness 보호
- explicit replacement mode
- save conflict와 source warning
- destructive reload
- AI UI 없음

### Slice 4 — AI UI와 lifecycle

- 별도 AI 영역
- passive/blocked/zero-Evidence no-call
- pre-run source check
- run/cancel/retry
- 두 copy 액션
- AbortController/run token/destroy
- journal-period cleanup과 Hub loader wiring

### Slice 5 — 문서·검증

- 기존 문서 3개만 동기화
- 모든 신규/기존 테스트
- isolated synthetic Obsidian QA
- dirty worktree 소유권 확인

## 9. 자동 검증

신규·확장 테스트:

- `test_monthly_validation_core.js`
- `test_monthly_validation_store.js`
- `test_monthly_validation_ai.js`
- `test_monthly_validation_view.js`
- `test_journal_period_navigation.js`

각 Slice에서 변경 JS에 `node --check`를 실행하고 해당 테스트를 실행한다. 최종 회귀:

```sh
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_store.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_ai.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_monthly_validation_view.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_store.js
node SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_period_navigation.js
git diff --check
```

필수 assertion:

- passive/blocked/zero Evidence/source changed provider call 0회
- eligible refs exact 1:1
- raw body 없음
- other-month ref 제외
- duplicate Evidence ID 차단
- provider schema와 독립된 local strict validation
- decision/knowledge statement 불변
- 두 copy 액션 외 AI→human mutation 없음
- cancel/error/invalid/navigation 후 human state 보존
- AI-only Vault/Candidate write 0회
- writer/parser 모든 decision round-trip
- legacy/mismatch/blocked replacement 보호
- target mtime conflict 차단
- Candidate는 successful human save 후 human validated만 생성

## 10. 실제 Obsidian QA

격리된 합성 fixture Vault에서 다음을 관찰한다.

1. passive open과 readiness blocked
2. human state rerender 보존
3. ready AI run → 근거 확인 → 두 초안 복사 → 독립 human decision/edit/save/reopen
4. 겹치는 Weekly의 adjacent-month Evidence 제외와 coverage warning
5. cancel, timeout/provider error, malformed/unsafe response, retry
6. AI 중 월/period/history 이동과 detached callback 차단
7. canonical hydration, unmatched Principle replacement
8. legacy read-only와 새 검증 교체
9. target mtime conflict의 reload/explicit replace
10. source change pre-run block와 destructive reload
11. AI-only 전후 Vault diff 0; human save 시 Monthly와 human-gated Candidate만 변경

## 11. 완료 게이트

다음이 모두 만족될 때만 Monthly AI 구현 완료로 판정한다.

- Slice 0–5와 신규/회귀 테스트 통과
- 실제 Obsidian QA 통과
- explicit action 전 provider call 0
- selected-month structured Evidence만 전송
- AI refs와 eligible cardinality fail-closed
- AI가 decision/knowledge/save/Candidate를 건드리지 않음
- canonical hydration과 legacy 보호
- target/source conflict와 reload 계약 동작
- navigation cleanup 동작
- 문서가 구현과 일치
- Quarterly/Yearly, generic engine, shared provider/parser 수정, AI persistence, 자동화가 diff에 없음
- unrelated dirty-worktree 변경을 수정·소유·커밋하지 않음

## 12. 명시적 보류

Quarterly/Yearly, generic Review Engine/AI framework, shared provider 변경, raw/other-month/global retrieval, AI decision/knowledge statement, 자동 저장·Candidate·Knowledge 승격, AI draft/cache/log, background/schedule/telemetry, revision history/hash/merge/recovery, Identity Lens/settings, embedding/vector search, broad legacy parser.

