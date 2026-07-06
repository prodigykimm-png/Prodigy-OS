# Architecture Decision Records (ADR)

> "Every important architectural decision deserves a permanent explanation."

---

# Purpose

Architecture Decision Record(ADR)는

Prodigy OS의 중요한 설계 결정을 기록하는 문서이다.

ADR의 목적은

"무엇을 만들었는가"

를 기록하는 것이 아니라

"왜 그렇게 결정했는가"

를 기록하는 것이다.

시간이 지나더라도

과거의 설계 의도를 이해할 수 있도록 한다.

---

# Philosophy

Prodigy OS는

채팅이 아니라

문서를 기준으로 개발한다.

Architecture가 변경되면

반드시 ADR을 작성한다.

ADR은

프로젝트의 역사이며,

프로젝트의 기억이다.

---

# When to Create an ADR

다음과 같은 경우 반드시 ADR을 작성한다.

## Architecture 변경

예)

- Layer 구조 변경
- Object 구조 변경
- Data Flow 변경

---

## 핵심 철학 변경

예)

- Capture 방식 변경
- AI 역할 변경
- Decision Support 변경

---

## 프로젝트 방향 변경

예)

- Youngjae OS → Prodigy OS
- Homepage → Home
- Note → Object

---

## 장기적인 영향이 있는 결정

예)

- Folder 구조 변경
- Property 설계 원칙 변경
- Plugin 철학 변경

---

# When NOT to Create an ADR

다음은 ADR 대상이 아니다.

- CSS 수정
- Dataview Query 변경
- Plugin 버전 업데이트
- Template 수정
- UI 색상 변경
- 아이콘 변경
- 오타 수정

이러한 변경은

CHANGELOG 또는 Git Commit으로 관리한다.

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

예)

Why Object First?

Why AI Capture?

Why Home?

---

## Status

허용 값

Accepted

Proposed

Deprecated

Superseded

Rejected

---

## Date

결정한 날짜

YYYY-MM-DD

---

## Context

왜 이 문제가 발생했는가?

현재 어떤 문제가 있었는가?

어떤 고민이 있었는가?

---

## Decision

최종적으로 무엇을 결정했는가?

명확하게 작성한다.

---

## Alternatives Considered

고려했던 대안을 기록한다.

예)

Youngjae OS

Rejected

이유

...

---

Homepage

Rejected

이유

...

---

## Consequences

이 결정으로 인해

앞으로 무엇이 달라지는가?

어떤 장점이 생기는가?

어떤 제약이 생기는가?

---

## Related Documents

관련 문서를 연결한다.

예)

00_Constitution.md

01_Architecture.md

03_Object_Model.md

README.md

---

# Naming Convention

ADR 파일명은 아래 규칙을 따른다.

```
ADR-001-why-prodigy-os.md

ADR-002-object-first.md

ADR-003-ai-capture.md

ADR-004-home.md

ADR-005-documentation-first.md
```

번호는

순차적으로 증가한다.

번호는 변경하지 않는다.

삭제하지 않는다.

---

# Directory Structure

```
docs/

└── ADR/

    ├── README.md

    ├── ADR-001-why-prodigy-os.md

    ├── ADR-002-object-first.md

    ├── ADR-003-ai-capture.md

    ├── ADR-004-home.md

    └── ADR-005-documentation-first.md
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

README

↓

프로젝트 소개

---

Constitution

↓

프로젝트 철학

---

Architecture

↓

시스템 구조

---

ADR

↓

왜 그렇게 설계했는가

---

Implementation Guide

↓

어떻게 구현하는가

---

Roadmap

↓

앞으로 무엇을 만들 것인가

---

CHANGELOG

↓

무엇이 변경되었는가

---

# Example ADR Flow

```
문제 발견

↓

토론

↓

결정

↓

ADR 작성

↓

문서 수정

↓

구현

↓

Git Commit
```

ADR는

구현 이후가 아니라

구현 전에 작성하는 것을 원칙으로 한다.

---

# Final Principle

Prodigy OS는

기억에 의존하지 않는다.

모든 중요한 설계 결정은

ADR에 기록한다.

ADR는

프로젝트의 역사이며,

미래의 개발자를 위한 설명서이다.

---

**Version:** 1.0

**Status:** Active
