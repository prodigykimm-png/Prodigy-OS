# Prodigy OS Object Model v1.0

> "Prodigy OS의 모든 것은 Object이며, 모든 Object는 시간이 지날수록 Asset으로 성장한다."

---

# Purpose

이 문서는 Prodigy OS에서 사용하는 Object의 정의와 구조를 설명한다.

Object는 Prodigy OS의 가장 기본적인 단위이며,
모든 데이터, 프로젝트, 지식, 기록은 Object로 관리된다.

이 문서는

- Object가 무엇인지
- Object가 어떻게 구성되는지
- Object가 어떻게 성장하는지

를 정의한다.

---

# 1. What is an Object?

Object는 하나의 독립적인 관리 대상이다.

Object는 단순한 노트가 아니다.

Object는

- 하나의 목적(Purpose)
- 하나의 데이터(Data)
- 하나의 상태(State)
- 하나의 의사결정(Decision)

을 가진다.

Prodigy OS에서는

노트를 만들지 않는다.

Object를 만든다.

---

# 2. Object Anatomy

모든 Object는 동일한 구조를 가진다.

```

Object

├── Property

├── Content

├── Behavior

└── View

```

---

## Property

Object를 설명하는 구조화된 데이터

예)

- 주소
- 사건번호
- 운동 종류
- 책 제목

Property는

AI와 시스템이 사용하는 데이터이다.

---

## Content

사람이 작성하는 실제 내용

예)

- 메모
- 분석
- 생각
- 사진
- PDF

Content는

사람이 읽는 정보이다.

---

## Behavior

Object가 어떻게 행동하는지를 정의한다.

예)

- 현재 상태
- 다음 행동
- 완료 조건
- Review 조건

Behavior는

Object의 규칙이다.

---

## View

Object를 사용자에게 표현하는 방법

예)

- Homepage Card
- Dashboard
- Dataview
- Object 화면

View는

데이터를 저장하지 않는다.

---

# 3. Object Examples

Prodigy OS에서 관리하는 대표 Object 유형이다.
Object는 굳이 Domain으로 분류하지 않으며, Folder, Property, AI 추천을 통해 충분히 관리 가능하다.

- Auction Case
- Onbid Case
- Reading
- Study
- Concept
- Project
- Workout
- Habit
- Daily Note
- Reflection
- Review

---

# 4. Object States

Object는 시간이 지나며 상태가 변한다.

```

Capture

↓

Active

↓

Completed

↓

Historical

```

---

## Capture

막 생성된 상태

아직 검토되지 않은 정보

---

## Active

현재 진행 중인 Object

Homepage에 표시된다.

---

## Completed

목적을 달성한 Object

하지만 삭제하지 않는다.

---

## Historical

과거 기록

AI 분석과 미래 의사결정을 위한 Asset이다.

---

Object는

삭제보다

Historical 상태를 우선한다.

---

# 5. Object as an Asset

Prodigy OS에서

모든 Object는

장기적인 Asset이다.

Object는

시간이 지날수록

더 많은 가치(Value)를 가진다.

예)

경매

↓

패찰

↓

복기

↓

다음 입찰 성공

---

독서

↓

메모

↓

지식 연결

↓

프로젝트 활용

---

운동

↓

기록

↓

패턴 분석

↓

건강 개선

---

Object는

끝나는 것이 아니라

축적된다.

---

# 6. Object Relationships

Object는 서로 연결될 수 있다.

예)

Auction Case

↓

Knowledge

↓

세법

↓

Project

↓

AI 분석기

---

Reading

↓

Knowledge

↓

Workout

↓

Journal

---

Connection은

사람이 억지로 만들지 않는다.

AI가 추천하고

사람이 승인한다.

---

# 7. Object Identity

모든 Object는

고유한 Identity를 가진다.

Identity는

Object가 무엇인지를 정의한다.

Identity는

Property로 표현된다.

예)

```

type: auction_case

id: AUC-2026-001

```

Identity는

절대 변경하지 않는다.

---

# 8. Object Rules

모든 Object는 아래 규칙을 따른다.

## Rule 1

Object는 하나의 목적만 가진다.

---

## Rule 2

Object는 Property를 가진다.

---

## Rule 3

Object는 Content를 가진다.

---

## Rule 4

Object는 Behavior를 가진다.

---

## Rule 5

Object는 View를 가진다.

---

## Rule 6

Object는 삭제하지 않는다.

가능하면 Historical 상태로 보존한다.

---

## Rule 7

Object는 시간이 지나며 Asset으로 성장한다.

---

# Object Lifecycle Example

## Auction

```

Capture

↓

Auction Object

↓

시장 조사

↓

입찰

↓

패찰

↓

Review

↓

Historical Asset

```

---

## Workout

```

Capture

↓

Workout Object

↓

기록

↓

Review

↓

Historical Asset

```

---

## Reading

```

Capture

↓

Reading Object

↓

Knowledge

↓

Project 활용

↓

Historical Asset

```

---

# Design Principles

Object는

단순한 노트가 아니다.

Object는

장기적으로 축적되는 Asset이다.

Object는

AI가 이해할 수 있어야 한다.

Object는

Property와 Content를 함께 가진다.

Object는

Prodigy OS의 가장 작은 단위이며,

모든 기능은 Object를 중심으로 설계한다.

---

# Out of Scope

이 문서는

다음을 정의하지 않는다.

- Property Schema
- Workflow
- Homepage
- Capture 구현
- AI 구현

이들은 각각 별도의 문서에서 정의한다.

---

# Final Statement

Prodigy OS는

노트를 관리하는 시스템이 아니다.

Object를 생성하고,

Object를 성장시키며,

Object를 Asset으로 축적하여

더 나은 의사결정을 지원하는 운영체제이다.

---

**Version:** 1.0

**Status:** Active

**Depends on:**
- 00_Constitution.md
- 01_Architecture.md
- 02_Core_Concepts.md
