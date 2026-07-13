# Architecture Decision Records (ADR)

> "ADR은 구현을 시작하기 위한 문서가 아니라, Architecture 변경을 최종 기록하는 문서이다."

---

# Purpose

Architecture Decision Record(ADR)는

Prodigy OS의 Architecture 변경을 기록하는 문서이다.

ADR의 목적은

"무엇을 만들었는가"

를 기록하는 것이 아니라

"왜 Architecture를 변경했는가"

를 기록하는 것이다.

---

# Core Principle

Implementation does not require ADR.

Architecture changes require ADR.

ADR는

개발을 시작하기 위한 문서가 아니다.

ADR는

Architecture 변경을 최종 기록하는 문서이다.

---

# New Workflow

Prodigy OS는 실사용 기반 개발을 한다.

```
실사용
↓
Issue 기록
↓
구현
↓
실사용 검증
↓
Discussion
↓
Architecture 변경이 필요한가?
↓
YES → ADR 작성 → 문서 수정 → Architecture Update
NO → Issue 종료
```

구현은 ADR 없이 진행할 수 있다.

Issue는 자유롭게 기록한다.

Architecture는 실사용으로 검증된 필요성이 있을 때만 변경한다.

---

# When to Create an ADR

다음 중 하나에 해당할 때 ADR을 작성한다.

- 새로운 Layer 추가
- Object Model 변경
- Workflow 변경
- Property Standard 변경
- Architecture 변경
- Core Concept 변경
- Constitution 변경
- 장기 유지보수에 영향을 주는 변경

---

# When NOT to Create an ADR

다음은 ADR 대상이 아니다.

- 버그 수정
- Dataview 수정
- Dashboard 개선
- UI 개선
- Template 문구 수정
- Prompt 개선
- AI Prompt 수정
- Property 값 수정
- Python 구현
- QuickAdd 구현
- Aside 구현
- Automation 구현
- 코드 리팩토링
- 성능 개선
- 기타 구현 사항

이러한 변경은

Git Commit으로 관리한다.

---

# Issue Policy

Issue는

실사용 중 발견되는 문제를 기록한다.

Issue는

Architecture 변경을 의미하지 않는다.

Issue는

구현 후에도 유지될 수 있다.

Issue가 반복되고

Architecture 수준의 변경이 필요할 경우

ADR을 작성한다.

---

# Architecture Rule

Architecture는

실사용으로 검증된 필요성이 있을 때만 변경한다.

ADR는

Architecture 변경을 기록하는 문서이다.

ADR는

구현을 시작하기 위한 문서가 아니다.

ADR는

최종 결정을 기록하는 문서이다.

---

# Roles

## Agent

Agent의 역할

- 구현
- 버그 수정
- 테스트
- Dashboard 구현
- Dataview 구현
- Python 구현
- Automation 구현
- Prompt 개선

Agent는

Architecture를 변경하지 않는다.

---

## CTO

CTO의 역할

- Issue 검토
- Trade-off 분석
- Architecture Review
- ADR 작성
- 문서 수정
- 최종 의사결정

---

# ADR Template

모든 ADR은 아래 구조를 따른다.

```text
ADR-XXX

Title

Status

Date

Context

Decision

Alternatives Considered

Consequences

Related Documents
```

이 구조는 변경하지 않는다.

---

# Section Guide

## Title

결정을 한 문장으로 표현한다.

## Status

허용 값

- Accepted
- Proposed
- Deprecated
- Superseded
- Rejected

## Date

결정한 날짜

YYYY-MM-DD

## Context

왜 이 문제가 발생했는가?

현재 어떤 문제가 있었는가?

어떤 고민이 있었는가?

## Decision

최종적으로 무엇을 결정했는가?

명확하게 작성한다.

## Alternatives Considered

고려했던 대안을 기록한다.

## Consequences

이 결정으로 인해

앞으로 무엇이 달라지는가?

어떤 장점이 생기는가?

어떤 제약이 생기는가?

## Related Documents

관련 문서를 연결한다.

---

# Naming Convention

```
ADR-001-why-prodigy-os.md
ADR-002-object-first.md
ADR-003-ai-capture.md
ADR-004-home.md
ADR-005-documentation-first.md
ADR-006-adr-governance-redefine.md
```

번호는 순차적으로 증가한다.

번호는 변경하지 않는다.

삭제하지 않는다.

---

# Directory Structure

```
docs/
└── ADR/
    ├── ADR.md
    ├── ADR-001-why-prodigy-os.md
    ├── ADR-002-object-first.md
    ├── ADR-003-ai-capture.md
    ├── ADR-004-home.md
    ├── ADR-005-documentation-first.md
    └── ADR-006-adr-governance-redefine.md
```

---

# Writing Principles

ADR은

설명보다

결정을 기록한다.

짧고 명확하게 작성한다.

객관적으로 작성한다.

감정을 기록하지 않는다.

기술보다

의사결정의 이유를 기록한다.

---

# Source of Truth

Architecture에 영향을 주는 결정은

반드시 ADR에 기록한다.

ADR은

Constitution 다음으로

신뢰할 수 있는 문서이다.

---

# Relationship with Other Documents

```
README → 프로젝트 소개
Constitution → 프로젝트 철학
Architecture → 시스템 구조
ADR → Architecture 변경 이력
Implementation Guide → 어떻게 구현하는가
CHANGELOG → 무엇이 변경되었는가
```

---

# Final Principle

Prodigy OS는

기억에 의존하지 않는다.

Architecture 변경은

ADR에 기록한다.

구현은 자유롭게 한다.

Architecture는 신중하게 바꾼다.

실사용이 Architecture를 결정한다.

---

**Version:** 2.0

**Status:** Active
