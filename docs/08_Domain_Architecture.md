# Prodigy OS Domain Architecture v1.0

> "Every Object belongs to exactly one Domain."

---

# Purpose

이 문서는 Prodigy OS의 최상위 비즈니스 구조를 정의한다.

Prodigy OS는 Folder 중심 시스템이 아니다.

Object 중심 시스템이다.

하지만 Object 역시

반드시 하나의 Domain에 속한다.

Domain은

Prodigy OS가 세상을 바라보는 가장 큰 단위이다.

---

# What is a Domain?

Domain은

하나의 관심 영역(Area of Responsibility)이다.

예를 들어

부동산 투자

운동

공부

프로젝트

처럼

비슷한 목적을 가진 Object를

논리적으로 묶는 개념이다.

Domain은

Folder가 아니다.

Plugin도 아니다.

Object를 이해하기 위한

논리적인 경계(Boundary)이다.

---

# Domain Hierarchy

```
Prodigy OS

│

├── Investment

├── Knowledge

├── Project

├── Personal

└── Journal
```

모든 Object는

반드시 하나의 Domain에 속한다.

---

# Domain Definitions

## Investment

투자와 관련된 모든 Object를 관리한다.

대표 Object

- Auction Case
- OnBid Case
- Property Analysis
- Market Observation
- Bid Review

목적

더 나은 투자 의사결정을 지원한다.

---

## Knowledge

평생 학습을 관리한다.

대표 Object

- Reading
- Study
- Concept
- AI
- Photography
- Business
- Tax
- Appraisal

목적

지식을 축적하고 연결한다.

---

## Project

완료를 목표로 하는 모든 활동을 관리한다.

대표 Object

- AI Project
- Automation
- Wedding Business
- Software Development

목적

프로젝트를 계획하고 실행한다.

---

## Personal

개인의 성장과 건강을 관리한다.

대표 Object

- Workout
- Habit
- Routine
- Health

목적

장기적인 자기관리를 지원한다.

---

## Journal

일상의 기록을 관리한다.

대표 Object

- Daily Note
- Weekly Review
- Monthly Review
- Reflection

목적

경험을 자산으로 축적한다.

---

# Relationship

```
Domain

↓

Object Type

↓

Object

↓

Property

↓

Content
```

---

# Object Type

Object Type은

Domain 안에서

실제 관리되는 데이터 모델이다.

예)

Investment

↓

Auction Case

↓

2026타경12345

---

Knowledge

↓

Reading

↓

Atomic Habits

---

Project

↓

Wedding Album

↓

OO웨딩

---

# Rules

## Rule 1

모든 Object는

반드시 하나의 Domain에 속한다.

---

## Rule 2

Object는

여러 Domain에 동시에 속하지 않는다.

필요한 경우

Relation으로 연결한다.

---

## Rule 3

Domain은

최대한 안정적으로 유지한다.

새로운 Domain은

쉽게 만들지 않는다.

---

## Rule 4

Object Type은

Domain 안에서 자유롭게 추가할 수 있다.

---

## Rule 5

Folder는

Domain을 표현하기 위한 구현 방법일 뿐이다.

Domain 자체가 아니다.

---

# Domain Connections

Domain은 서로 독립적이지 않다.

예)

Investment

↓

Knowledge

(세법)

↓

Project

(경매 자동화)

↓

Personal

(집중력 향상)

↓

Journal

(복기)

Prodigy OS의 모든 Domain은

Object를 통해 연결된다.

---

# Domain Expansion

새로운 분야가 생기더라도

기존 Domain을 최대한 재사용한다.

새로운 Domain은

아래 조건을 모두 만족할 때만 추가한다.

- 독립적인 목적을 가진다.
- 기존 Domain으로 표현하기 어렵다.
- 장기적으로 유지될 가능성이 높다.

---

# Future Domains

현재는 계획만 존재한다.

예)

- Finance
- Relationship
- Content Creation

필요성이 검증되기 전까지는 추가하지 않는다.

---

# Final Principle

Prodigy OS는

Folder를 관리하는 시스템이 아니다.

Domain을 이해하고,

Object를 관리하며,

모든 Domain을 연결하여

더 나은 의사결정을 지원하는 Personal Operating System이다.

---

**Version:** 1.0

**Status:** Active

**Depends on:**
- PROJECT_IDENTITY.md
- 00_Constitution.md
- 01_Architecture.md
- 03_Object_Model.md
