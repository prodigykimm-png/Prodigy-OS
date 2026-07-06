# Prodigy OS Implementation Guide v1.0

> "구현은 철학을 실현하는 수단이다."

---

# Purpose

이 문서는 Prodigy OS를 구현할 때 따라야 하는 개발 원칙과 구현 규칙을 정의한다.

Constitution과 Architecture가

"무엇을"

정의한다면,

Implementation Guide는

"어떻게"

구현할지를 정의한다.

모든 구현은

Constitution과 Architecture를 우선한다.

---

# Priority Order

구현 시 항상 아래 우선순위를 따른다.

```

Constitution

↓

Architecture

↓

Core Concepts

↓

Object Model

↓

Implementation

↓

Plugin

↓

Code

```

Code는

가장 마지막 수단이다.

---

# Rule 1 — Obsidian Native First

가능하면

Obsidian 기본 기능을 사용한다.

부족하면

Community Plugin을 사용한다.

그래도 부족하면

외부 자동화를 사용한다.

직접 개발은

가장 마지막 선택이다.

우선순위

```

Native

↓

Community Plugin

↓

Automation

↓

Custom Code

```

---

# Rule 2 — Plugin Philosophy

Plugin은

Architecture가 아니다.

Plugin은

구현 수단이다.

Plugin을 기준으로 시스템을 설계하지 않는다.

항상

Architecture를 먼저 설계하고

Plugin을 선택한다.

---

# Rule 3 — Plugin Selection Criteria

새로운 Plugin을 추가하기 전에

반드시 아래 질문을 확인한다.

- Obsidian 기본 기능으로 가능한가?
- 기존 Plugin으로 가능한가?
- 유지보수가 활발한가?
- 데이터를 독점하지 않는가?
- 제거해도 시스템이 유지되는가?

YES가 대부분이면 사용한다.

---

# Rule 4 — Dataview

Dataview는

조회(Query)만 담당한다.

Dataview는

데이터를 수정하지 않는다.

Business Logic을 작성하지 않는다.

Homepage

Dashboard

Object View

조회 전용으로 사용한다.

---

# Rule 5 — DataviewJS

DataviewJS는

UI 표현을 위해서만 사용한다.

Business Logic을 구현하지 않는다.

Property를 수정하지 않는다.

AI Parsing을 수행하지 않는다.

DataviewJS는

Display Layer이다.

---

# Rule 6 — CSS

CSS는

기능을 만들지 않는다.

CSS는

가독성과 UX만 개선한다.

데이터 구조를 변경하지 않는다.

---

# Rule 7 — Templates

Template는

Object 생성을 돕는다.

Template는

Business Logic을 가지지 않는다.

Template는

최소한의 구조만 가진다.

Property 대부분은

AI가 생성한다.

---

# Rule 8 — Folder Philosophy

Folder는

관리 도구일 뿐이다.

분류 체계가 아니다.

검색,

Property,

Dataview가

우선한다.

Folder는

최소 개수만 유지한다.

---

# Rule 9 — Naming Convention

모든 Property는

영어

snake_case

를 사용한다.

예)

```

expected_bid

minimum_bid

review_status

```

Object Type도

영어를 사용한다.

예)

```

auction_case

reading

workout

project

```

사용자에게 보여주는 이름은

Display Layer에서

한국어로 변환한다.

---

# Rule 10 — Property

새로운 Property를 추가하기 전에

반드시 확인한다.

- 기존 Property로 해결 가능한가?
- 계산 가능한 값인가?
- AI가 자동 생성 가능한가?
- 실제 사용에서 필요한가?

불필요한 Property는

추가하지 않는다.

---

# Rule 11 — Capture UX

Capture는

항상

3초 이내를 목표로 한다.

Capture에서

묻지 않는다.

- Folder

- Tag

- Property

- Workflow

AI가

가능한 모든 것을 자동 생성한다.

---

# Rule 12 — Search First

Prodigy OS는

Folder보다

Search를 우선한다.

검색은

사건번호

주소

프로젝트명

책 제목

모두 지원해야 한다.

---

# Rule 13 — AI Implementation

AI는

다음을 수행한다.

- Parsing
- Property 생성
- 연결 추천
- Review 생성
- Dashboard 분석

AI는

다음을 하지 않는다.

- 최종 결정
- 데이터 삭제
- 승인 없는 Property 변경

---

# Rule 14 — Performance

Home은

1초 이내에 열려야 한다.

Dataview Query는

최소한으로 유지한다.

무거운 계산은

Object 내부 또는 외부 자동화에서 수행한다.

---

# Rule 15 — Extensibility

새로운 기능은

새로운 Layer를 만들지 않는다.

기존 Layer를 재사용한다.

새로운 Plugin보다

기존 구조 확장을 우선한다.

---

# Rule 16 — Documentation First

구현 전에

문서를 수정한다.

Architecture가 변경되면

ADR를 작성한다.

중요한 변경은

CHANGELOG를 기록한다.

채팅은

공식 문서가 아니다.

문서만이

프로젝트의 공식 기준이다.

---

# Rule 17 — Git Workflow

모든 중요한 변경은

Git으로 관리한다.

권장 Commit Prefix

```

[ARCH]

[SCHEMA]

[UX]

[AI]

[AUTO]

[DOCS]

[FIX]

[REF]

```

Architecture 변경은

ADR를 함께 작성한다.

---

# Rule 18 — AI Collaboration

Prodigy OS는

특정 AI에 종속되지 않는다.

ChatGPT

Claude

Gemini

Codex

향후 AI Agent

모두

동일한 문서를 읽고

동일한 Architecture를 따른다.

AI는

문서를 기반으로 협업한다.

---

# Implementation Checklist

새로운 기능을 만들기 전에

반드시 확인한다.

## UX

- Capture가 더 쉬워지는가?
- 사용자의 입력이 줄어드는가?

---

## Data

- 기존 Property를 재사용하는가?
- 중복 데이터를 만들지 않는가?

---

## Architecture

- 기존 Layer를 재사용하는가?
- Object 중심 구조를 유지하는가?

---

## AI

- AI가 대신할 수 있는가?
- 사람이 승인할 수 있는가?

---

## Maintenance

- Plugin을 제거해도 데이터가 남는가?
- 5년 뒤에도 유지 가능한가?

---

# Final Statement

Prodigy OS는

기술을 위한 프로젝트가 아니다.

제품(Product)을 만드는 프로젝트이다.

구현은

철학을 실현하기 위한 수단이다.

모든 구현은

Constitution을 우선한다.

---

**Version:** 1.0

**Status:** Active

**Depends on:**
- 00_Constitution.md
- 01_Architecture.md
- 02_Core_Concepts.md
- 03_Object_Model.md
- 04_Capture_System.md
- 05_Home.md
- 06_AI_System.md
