# Prodigy OS Core Concepts v1.0

> "같은 단어는 항상 같은 의미를 가진다."

---

# Purpose

이 문서는 Prodigy OS에서 사용하는 핵심 용어를 정의한다.

모든 문서, 코드, Template, Automation, AI는
이 문서의 정의를 따른다.

새로운 용어를 만들기 전에
기존 용어를 재사용할 수 있는지 먼저 검토한다.

---

# 1. Object

## 정의

Prodigy OS의 기본 단위.

Prodigy OS에는 "노트(Note)"가 존재하지 않는다.

모든 정보는 Object이다.

Object는

- 하나의 목적
- 하나의 데이터
- 하나의 생명주기
- 하나의 의사결정

를 가진다.

---

## 예시

- Auction Case
- Project
- Knowledge
- Reading
- Workout
- Journal

---

## Object는 가진다.

- Property
- Workflow
- Behavior
- View

---

# 2. Property

## 정의

Property는 Object의 구조화된 데이터이다.

Property는

Object를 설명하는 사실(Fact)이다.

---

## 원칙

Property는

Single Source of Truth이다.

같은 데이터는 두 번 저장하지 않는다.

계산 가능한 값은 저장하지 않는다.

---

## 예시

Auction

```yaml
address:
minimum_bid:
expected_bid:
```

Workout

```yaml
exercise:
weight:
reps:
```

---

# 3. Workflow

## 정의

Workflow는

Object가 진행되는 큰 흐름이다.

Workflow는

상위 단계이다.

예)

Capture

↓

Analysis

↓

Decision

↓

Execution

↓

Review

↓

Done

---

Workflow는

Object 종류와 관계없이

최대한 공통 Pattern을 유지한다.

---

# 4. Status

## 정의

Status는

Workflow 안에서

Object의 현재 상태를 나타낸다.

Status는

State Engine이다.

UI가 아니다.

---

예)

Auction

rights_analysis

market_analysis

profitability

Project

planning

editing

delivery

---

Status는

영어

snake_case

를 사용한다.

Homepage에서는

Display Layer가 번역한다.

---

# 5. Behavior

## 정의

Behavior는

Object가

어떻게 행동하는지를 정의한다.

Behavior는

Business Logic이다.

---

Behavior 예시

현재 Status

↓

추천 Next Action

↓

다음 Status

↓

Review 조건

↓

Done 조건

---

Behavior는

AI

Automation

Dashboard

QuickAdd

모두가 공유한다.

---

# 6. Capture

## 정의

Capture는

Prodigy OS의 시작점이다.

사람은

최소한만 입력한다.

---

Capture의 목표

3초 안에 입력.

---

Capture에서는

Property를 입력하지 않는다.

AI가 구조화한다.

---

입력 예시

Auction

- URL
- PDF
- 사건번호

Reading

- 책 사진

Journal

- 자유로운 글

Workout

- 운동 기록

---

# 7. AI Parsing

## 정의

AI Parsing은

Capture된 정보를

구조화하는 과정이다.

AI는

Object를 만들기 위해

Property를 추출한다.

예)

PDF

↓

주소

↓

면적

↓

최저가

↓

Property 생성

---

# 8. View

## 정의

View는

Property와 Behavior를

사람이 이해하기 쉽게 표현하는 화면이다.

View는

데이터를 저장하지 않는다.

---

예)

Homepage

Dashboard

Object Card

Dataview

---

# 9. Homepage

## 정의

Homepage는

Action Dashboard이다.

Homepage에서는

오늘 해야 하는 것만 보여준다.

---

Homepage는

Analysis를 하지 않는다.

---

# 10. Dashboard

## 정의

Dashboard는

Object를 분석하는 화면이다.

---

예)

Auction Dashboard

지역별 ROI

낙찰률

수익률

---

Homepage와 Dashboard는

목적이 다르다.

---

# 11. Review

## 정의

Review는

Object를 되돌아보는 과정이다.

Review는

Prodigy OS의 핵심 자산이다.

결과보다

왜 그런 판단을 했는지를 기록한다.

---

# 12. Decision

## 정의

Decision은

Object의 최종 목적이다.

Prodigy OS의 모든 Object는

최종적으로

의사결정을 지원해야 한다.

---

# 13. Connection

## 정의

Connection은

Object와 Object의 관계이다.

예)

Auction

↓

Knowledge

↓

세법

↓

Project

↓

AI 분석

---

Connection은

사람이 억지로 만들지 않는다.

AI가 추천하고

사람이 승인한다.

---

# 14. Automation

## 정의

Automation은

사람 대신 반복 작업을 수행한다.

Automation은

Property와 Behavior를 기반으로 동작한다.

---

예)

Property 자동 생성

Dashboard 생성

월간 리포트

PDF OCR

Review Reminder

---

# 15. AI Assistant

## 정의

AI Assistant는

Prodigy OS의 Co-pilot이다.

AI는

판단하지 않는다.

추천한다.

최종 결정은

항상 사람이 한다.

---

# Relationships

```
Capture

↓

AI Parsing

↓

Object

├── Property

├── Workflow

├── Behavior

└── View

↓

Decision

↓

Review

↓

Knowledge
```

---

# Naming Rules

항상

Object

Property

Workflow

Behavior

Status

View

라는 용어를 사용한다.

동일한 의미의

다른 용어를 만들지 않는다.

예)

❌ Card

⭕ View

---

❌ Stage

⭕ Status

---

❌ Memo

⭕ Object

---

# Final Principle

Prodigy OS는

노트를 관리하는 시스템이 아니다.

Object를 이해하고,

데이터를 구조화하며,

더 나은 의사결정을 지원하는 운영체제이다.

---

**Version:** 1.0

**Status:** Active

**Depends on:**
- Constitution.md
- Architecture.md
