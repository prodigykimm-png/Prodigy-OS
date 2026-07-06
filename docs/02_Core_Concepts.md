# Prodigy OS Core Concepts v1.2

> "Every concept has one meaning, and every meaning has one name."

---

# Purpose

이 문서는 Prodigy OS에서 사용하는 모든 핵심 개념과 공식 용어를 정의한다.

모든 문서, 코드, Template, AI Agent, Automation은
이 문서를 기준으로 동일한 용어를 사용한다.

새로운 용어를 만들기 전에
반드시 이 문서를 확인한다.

---

# Core Principle

하나의 개념은

하나의 이름만 가진다.

같은 의미를 가진

여러 단어를 사용하지 않는다.

용어의 일관성은

Architecture의 일관성이다.

---

# Official Terminology

아래 용어는 Prodigy OS의 공식 용어이다.

| Concept | Official Name |
|----------|---------------|
| 기본 관리 단위 | Object |
| 구조화된 데이터 | Property |
| 사람이 작성하는 내용 | Content |
| 진행 흐름 | Workflow |
| 현재 상태 | Status |
| 화면 | View |
| 첫 화면 | Home |
| 입력 | Capture |
| 회고 | Review |
| 장기 가치 | Asset |
| 자동화 | Automation |
| AI 도우미 | AI Assistant |
| 의사결정 지원 | Decision Support |

이 용어들은 프로젝트 전체에서 동일한 의미를 가진다.

---

# Deprecated Terminology

다음 용어는 더 이상 사용하지 않는다.

| Deprecated | Replace With |
|------------|--------------|
| Youngjae OS | Prodigy OS |
| Homepage | Home |
| Note | Object |
| Memo | Object 또는 Content |
| Dashboard (첫 화면 의미) | Home |

※ Dashboard라는 용어 자체는 사용 가능하다.

예)

- Auction Dashboard
- Workout Dashboard

단,

첫 화면은 반드시 Home이라고 부른다.

---

# Core Concepts

---

## Object

### Definition

Prodigy OS의 가장 작은 관리 단위.

Object는 단순한 노트가 아니다.

Object는

- 목적(Purpose)
- 데이터(Data)
- 상태(State)
- 생명주기(Lifecycle)

를 가진다.

모든 것은 Object이다.

---

### Examples

- Auction Case
- Project
- Knowledge
- Reading
- Workout
- Journal

---

## Property

### Definition

Object를 설명하는 구조화된 데이터.

Property는

Single Source of Truth이다.

같은 데이터를 두 번 저장하지 않는다.

---

### Examples

Auction

```yaml
expected_bid:
minimum_bid:
address:
```

Workout

```yaml
exercise:
weight:
reps:
```

---

## Content

### Definition

사람이 읽고 작성하는 실제 내용.

예)

- 메모
- 사진
- PDF
- 분석
- 생각

Content는 자유롭다.

Property는 구조화된다.

---

## Workflow

### Definition

Object가 진행되는 전체 흐름.

Workflow는

Object의 생애를 정의한다.

예)

Capture

↓

Analysis

↓

Execution

↓

Review

↓

Completed

Workflow는

Object마다 다를 수 있지만

가능하면 공통 Pattern을 유지한다.

---

## Status

### Definition

Workflow 안에서

Object의 현재 위치.

Status는

현재 무엇을 하고 있는지를 나타낸다.

예)

planning

editing

review

completed

Status는

snake_case를 사용한다.

---

## View

### Definition

Object를 표현하는 화면.

View는

데이터를 저장하지 않는다.

대표 View

- Home
- Dashboard
- Object Card
- Dataview

---

## Capture

### Definition

모든 Object의 시작점.

Capture에서는

최소한의 정보만 입력한다.

AI가

가능한 모든 것을 구조화한다.

---

## Review

### Definition

Object를 되돌아보는 과정.

Review의 목적은

결과보다

의사결정 과정을 축적하는 것이다.

---

## Asset

### Definition

시간이 지나며

가치가 축적된 Object.

Prodigy OS에서는

모든 Object가

장기적으로 Asset이 된다.

---

## Decision Support

### Definition

Prodigy OS의 최종 목적.

모든 데이터는

궁극적으로

더 나은 의사결정을 지원해야 한다.

---

## Automation

### Definition

사람 대신 반복 작업을 수행하는 시스템.

Automation은

Object를 기반으로 동작한다.

---

## AI Assistant

### Definition

사용자의 의사결정을 지원하는 AI.

AI는

결정을 내리지 않는다.

추천한다.

---

# Naming Convention

---

## Property

항상

영어

snake_case

사용.

예)

expected_bid

review_status

next_action

---

## Object Type

항상

영어

snake_case

사용.

예)

auction_case

reading

workout

knowledge

project

---

## Status

항상

영어

snake_case

사용.

예)

planning

analyzing

completed

review_pending

---

## Display Name

사용자에게 보여주는 이름은

한국어를 사용한다.

예)

auction_case

↓

경매 물건

---

# Reserved Words

다음 단어는

Prodigy OS에서 특별한 의미를 가진다.

절대 다른 의미로 사용하지 않는다.

- Object
- Property
- Content
- Workflow
- Status
- View
- Capture
- Review
- Asset
- Home
- Decision Support
- Automation
- AI Assistant

---

# Relationships

```
Capture

↓

Object

├── Property

├── Content

└── Workflow

↓

View

↓

Review

↓

Asset

↓

Decision Support
```

---

# Final Principles

Object는

노트가 아니다.

Property는

AI를 위한 데이터이다.

Content는

사람을 위한 정보이다.

Capture는

빠를수록 좋다.

Review는

결과보다

판단 과정을 기록한다.

모든 Object는

시간이 지나며

Asset으로 성장한다.

---

**Version:** 1.2

**Status:** Active

**Supersedes:** Core Concepts v1.1

**Depends on:**
- PROJECT_IDENTITY.md
- 00_Constitution.md
- 01_Architecture.md
