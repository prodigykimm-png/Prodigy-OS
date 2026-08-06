# Architect Packet 29 — Journal 계층 역할·게이트 재결정

## Metadata
- repo: Prodigy OS Vault (redacted summary only)
- topic id: journal-period-ai-20260803
- review gate: PLAN
- current goal: Monthly를 데이터 부족 시 아예 막는 구조가 맞는지 재결정하고, Daily·Weekly·Monthly·Quarterly·Yearly의 사용자 역할과 sparse-data 동작을 명확히 정의한다.
- execution authority: GPT 논의, 로컬 설계 기록, 역할 문구와 게이트 계획 작성. 구현은 최종 결론 후 별도 승인 범위에서만 진행한다.
- excluded authority: 실제 Journal/Object/Daily/Knowledge 내용 전송·쓰기, provider 호출, commit/push/release

## Approval Scope / Redaction
- 전송 범위: Journal 기간 계약의 익명화된 구조, 게이트 규칙, 화면 역할 문구, 합성 사례, 테스트 결과
- 제외: 실제 Journal 본문·원문 문장·개인 식별자·비밀값·provider 설정·unrelated dirty diff

## Current Local Facts
- 현재 Monthly gate는 저장 완료 Weekly 2개 이상과 서로 다른 주차에서 반복된 Suggested Principle 1개 이상을 요구한다.
- Monthly는 조건 미충족 시 준비 상태와 AI 비활성 화면만 보인다.
- 실제 2026-07 익명 집계: 대상 Weekly 3개. 첫 주는 Suggested Principle 0개, 둘째 주는 Principle 2개, 셋째 주는 Principle 2개이며 서로 반복되는 제목은 0개다.
- 현재 Principle matching은 의미 유사도 모델이 아니라 제목 정규화 후 동일 키를 묶는 결정적 비교다.
- Monthly AI는 선택 월의 구조화 Evidence에 한정되고, 명시적 실행·세션 결과·사람의 결정/저장 원칙을 따른다.
- Quarterly·Yearly는 현재 기간 이동·기록 탐색·준비 상태 중심이며 자동 Review Engine은 없다.

## Existing Contract Tension
- Definition of Done는 Monthly를 Suggested Principle의 Human Validation 단계로 정의한다.
- 하지만 입력이 조금 부족할 때 Monthly가 질문 작성이나 부분 검토조차 불가능하면, 사용자는 왜 막혔는지와 다음에 무엇을 써야 하는지 알기 어렵다.
- 같은 hard-gate를 Quarterly·Yearly에 그대로 적용하면 sparse data에서 상위 계층이 영구적으로 빈 화면이 될 위험이 있다.

## Decision Needed
다음 항목을 하나의 일관된 Journal 운영 계약으로 결정해 달라.

1. Monthly가 3주 분량이 있어도 반복 Principle이 없으면 완전히 막혀야 하는가? 아니면 `질문 모드/부분 검토 모드`를 제공해야 하는가?
2. Quarterly·Yearly는 입력이 0개, 1개, 2개 이상일 때 각각 무엇을 보여주고 저장할 수 있어야 하는가?
3. AI가 각 계층에서 할 수 있는 일과 사람이 해야 할 일을 어디까지로 자를 것인가?
4. Daily·Weekly·Monthly·Quarterly·Yearly의 역할을 사용자가 화면에서 한 문장으로 이해할 수 있도록 정확한 사용자 표시 문구를 제안해 달라.
5. 기존 Monthly의 Human Review Gate와 `source_type: monthly_validation` Candidate 경계를 보존하면서, sparse-data UX를 개선하는 최소 변경 순서를 제시해 달라.

## Constraints
- AI는 결정·승인·저장·Candidate/Knowledge/Direction/Identity 설정을 자동으로 수행하지 않는다.
- 입력이 부족할수록 사실과 질문을 명확히 표시하고, 근거 없는 결론을 생성하지 않는다.
- 새 generic review engine, revision-history subsystem, persistent AI draft cache는 추가하지 않는다.
- 기존 canonical note/mtime conflict/legacy protection 계약은 보존한다.

## Required Response Format
Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Rationale:
Normative Journal role table:
Sparse-data state table:
Monthly gate decision:
Quarterly/Yearly gate decision:
AI vs human boundary:
Minimal implementation/doc plan with local file/symbol targets:
Rejected alternatives:
Risks/missing evidence:
Challenge questions for Codex:
