# GPT Pro Architect response 5

- transport: Aside MCP
- project: `Prodigy OS Making`
- conversation: `프로젝트 수정 검토`
- conversation URL: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb/c/6a5038a9-c6e8-83ee-ab4a-04fcc06a56e3`
- browser tab: `94E9EF7B7AD9CFC596F08C02BBDFAEA1`
- project context: connected Prodigy OS Git repository
- model evidence: composer changed from `즉시` to `Pro`; response UI showed Pro processing
- review gate: `PLAN`

## Decision

REVISE

## Gate reviewed

PLAN

## Rationale

현재 계획은 방향 자체는 매우 강력하다. 특히 다음 핵심 축은 올바르게 잡혀 있다:

- LLMWiki = 메모리 레이어
- PRE = 추론 / 리뷰 엔진
- 작업공간 = 제품 레이어
- Human Approval Boundary 유지

그리고 이전 지적사항 중 일부는 명확히 개선되었다:

- Review Engine을 LLMWiki 위에 얹는 구조 유지
- Knowledge 자동 생성 금지 (Human validation 유지)
- Evidence 기반 흐름 유지
- OmniRoute를 강제하지 않는 방향

하지만 PLAN 게이트 기준에서 치명적인 문제는 “경계(Contracts)가 아직 완전히 분리되지 않았다”는 점이다.

즉 지금 상태는:

“좋은 철학 + 좋은 구조 + 일부 경계 혼합”

이고, 이 상태에서 구현으로 넘어가면 향후 유지보수/확장 비용이 폭증할 가능성이 높다.

## Required changes

### 1. Authority Lifecycle vs LLMWiki Read Layer 분리 (가장 중요)

현재 계획에서는 여전히 암묵적으로:

`LLMWiki → 지식 → PRE`

처럼 읽힌다.

하지만 반드시 이렇게 분리되어야 한다:

```text
객체(권한 소스)
        ↓
권한 수명주기(Prodigy)
        ↓
지식(승인된 경우에만 해당)

---------------

LLMWiki(읽기 전용 투영)
        ↓
PRE(투영 읽기, 권한 없음)
```

반드시 명시해야 할 것:

- LLMWiki는 Authority를 절대 갖지 않는다
- 지식은 LLMWiki에서 생성되지 않는다
- LLMWiki는 항상 “파생, 재구성 가능, 일회용”이다

이걸 PLAN 문서에 명시적으로 계약으로 추가해야 한다.

### 2. Ontology는 Read-only Projection으로 고정

OWNtology-Kit 개념을 넣으려는 건 좋지만 현재 상태는 위험하다.

현재 암묵 구조:

`Ontology → Knowledge 구조 정의`

이건 절대 금지다.

수정 필요:

- 온톨로지 = 파생 뷰
- 소스 = 객체 + 지식
- Ontology는 쓰기 금지
- Ontology는 Projection only
- Ontology는 삭제해도 재생성 가능해야 함

### 3. Search / Retrieval는 무부작용(Read-only) 보장

현재 계획에서 Evidence Assembly + Retrieval이 PRE 내부로 들어가면서 위험한 지점이 있다.

문제: Retrieval이 Knowledge 또는 Object 상태를 바꾸는 경로가 열려 있음.

반드시 추가할 계약:

```text
검색 계층:
- 읽기 전용
- 부작용 없음
- 객체 돌연변이 없음
- 지식 창출 없음

검색 ≠ 학습
검색 ≠ 글쓰기
검색 = 읽기 전용
```

### 4. Literature / Source Archive 계약 불명확

현재 구조:

`External Sources → Knowledge Candidate`

이건 위험하다.

반드시 분리해야 한다:

```text
Source Archive (Raw)
        ↓
AI Summary (Derived)
        ↓
Candidate (Suggested)
        ↓
Human Approval
        ↓
Knowledge (Authority)
```

즉:

- Source는 Knowledge가 아니다
- Summary도 Knowledge가 아니다
- Candidate만 승인 대상이다

이 경계를 문서에 명확히 추가해야 한다.

### 5. Provider Routing 분리 (OmniRoute 문제)

현재 계획은 OmniRoute를 optional로 둔 건 맞다.

하지만 여전히 암묵적으로:

`PRE → Routing → Provider`

가 섞여 있다.

수정 방향:

```text
Reasoning (PRE)
        ↓
Provider Selection Layer (separate)
        ↓
Execution
```

즉:

- PRE는 provider를 모른다
- Routing은 PRE 밖에 있다
- `direct | omniroute`는 Execution Layer 선택이다

### 6. AutoRAG / AutoRAG-Research 통합 범위 과도

현재 계획은 AutoRAG 개념을 너무 일찍 넣고 있다.

문제:

- 아직 Evidence 품질 검증 안 됨
- Retrieval scope 정의 안 됨
- Token 전략 미확정

Phase 1에서는 다음만 유지해야 한다:

- AutoRAG full 제외
- Research agent 제외
- Deterministic retrieval 유지
- 제한된 Evidence Package 유지

## Risks / missing evidence

### 1. Evidence Quality 문제

가장 큰 리스크다.

```text
Bad Daily → Bad Evidence → Bad Pattern → Bad Knowledge
```

Evidence 모델 개선 방향이 LLMWiki보다 더 큰 리스크일 수 있다.

### 2. Over-abstraction risk

현재 계획은 다음 레이어를 모두 포함한다:

- PRE
- Memory
- Ontology
- Retrieval
- Provider
- Workspace

이미 레이어가 많다. 지금 상태에서 구현에 들어가면 “디버깅 불가능 구조”가 될 위험이 있다.

### 3. Token / Context 전략 미정

Evidence Package 전략은 일부 있지만 다음은 아직 설계가 부족하다:

- cross-domain
- long-term memory
- reading + auction mixing

### 4. 실제 LLMWiki 코드 레벨 검증 없음

현재는 개념 통합 수준이다. 다음 코드 수준 검증이 부족하다:

- index 구조
- update strategy
- partial rebuild
- cache invalidation

## Next packet request

다음 PLAN 게이트 통과를 위해 필요한 것은 세 패킷이다.

### Packet 1 — Boundary Contracts (필수)

다음 5개를 명시적으로 정의해야 한다:

1. Object Authority Contract
2. Knowledge Lifecycle Contract
3. LLMWiki Projection Contract
4. Retrieval No-Side-Effect Contract
5. Provider Routing Boundary

### Packet 2 — Minimal Phase 1 Scope

다음만 포함한다:

- Reading Memory Projection
- Deterministic Retrieval
- PRE Integration (limited)
- Knowledge Candidate (manual approval)

제외한다:

- AutoRAG full
- Research agents
- Ontology write
- Multi-agent orchestration

### Packet 3 — Evidence Model Definition

다음을 정의해야 한다:

- What counts as Evidence?
- Evidence structure
- Evidence priority
- Cross-workspace evidence rules

## Findings (severity order)

### Critical

- Authority vs LLMWiki 경계 불완전
- Ontology가 write layer로 확장될 위험
- Retrieval side-effect 가능성
- Knowledge 생성 경로 혼합

### High

- Provider routing layer 혼합
- AutoRAG 범위 과도
- Evidence model 미정

### Medium

- Token strategy 불완전
- 실제 코드 기반 검증 부족

## Corrected Phase 1 Plan (revised)

### Phase 1 — Controlled Memory Integration

1. Reading Memory Projection
   - Deterministic extraction
   - No LLM dependency for core

2. Memory Store
   - Derived only
   - Rebuildable
   - No authority

3. Retrieval v1
   - Deterministic
   - No vector
   - Explainable

4. PRE Integration (limited)
   - Optional evidence
   - User-controlled inclusion

5. Knowledge Candidate Flow
   - AI suggests
   - Human approves
   - No auto creation

6. Boundary Enforcement
   - No write from Memory
   - No write from Retrieval
   - No write from PRE

7. Dogfooding
   - 5–10 Reading objects
   - Verify usefulness

## Final assessment

방향은 맞다.

하지만 지금 상태는 “좋은 아이디어의 집합”이고, PLAN으로 통과하려면 경계(contracts)를 코드 수준으로 고정해야 한다.
