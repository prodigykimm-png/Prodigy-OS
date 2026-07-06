# Youngjae OS Architecture v1.1

> "Object is the center. Everything else exists to create, understand, or use Objects."

---

# Purpose

이 문서는 Youngjae OS의 전체 시스템 구조를 정의한다.

Architecture는 기술이나 Plugin을 설명하지 않는다.

Architecture는

**정보가 어떻게 흐르고, Object가 어떻게 성장하며, AI가 어떻게 이를 활용하는지**를 정의한다.

Youngjae OS의 모든 구현은 이 문서를 따른다.

---

# System Architecture

```
                 Human
                    │
                    ▼
             Capture Layer
                    │
                    ▼
            AI Parsing Layer
                    │
                    ▼
              Object Layer
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 Property        Content        Workflow
     │              │              │
     └──────────────┼──────────────┘
                    ▼
               View Layer
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
 Investment AI  Knowledge AI  Review AI
      │             │             │
      └─────────────┼─────────────┘
                    ▼
             Automation Layer
                    ▼
            Decision Support
```

---

# Core Principle

Youngjae OS는

Object 중심 시스템이다.

모든 Layer는

Object를 생성하거나,

Object를 이해하거나,

Object를 활용하기 위해 존재한다.

Object는 시스템의 유일한 중심이다.

---

# Layer Definitions

## 1. Capture Layer

사용자가 정보를 입력하는 계층.

입력은 가능한 한 단순해야 한다.

지원 입력

- URL
- PDF
- Image
- Voice
- Text
- Drag & Drop

Capture에서는

Property를 입력하지 않는다.

---

## 2. AI Parsing Layer

Capture된 정보를

Object로 변환하기 위한 구조화 계층.

AI는

- Parsing
- Classification
- Property Extraction

을 수행한다.

AI는

Object를 직접 수정하지 않는다.

항상 사용자 확인을 거친다.

---

## 3. Object Layer

Youngjae OS의 핵심.

Object는

독립적인 관리 단위이다.

대표 Object

- Auction Case
- Knowledge
- Project
- Workout
- Reading
- Journal

모든 시스템은 Object를 기준으로 동작한다.

---

## 4. Property

Object를 설명하는 구조화된 데이터.

Property는

Single Source of Truth이다.

Property는

사람보다

AI가 사용하는 데이터이다.

---

## 5. Content

사람이 읽고 작성하는 내용.

예)

- 메모
- 분석
- 사진
- PDF
- 생각

Content는 자유롭다.

Property는 구조화된다.

---

## 6. Workflow

Object의 진행 흐름.

Workflow는

Object가 어떤 단계를 거치는지를 정의한다.

Workflow는

Behavior를 포함한다.

Allowed Action

↓

Current State

↓

Next State

Workflow는

Object마다 조금씩 다를 수 있지만

가능하면 공통 Pattern을 유지한다.

---

## 7. View Layer

View는

Object를 사용자에게 표현한다.

View는

데이터를 저장하지 않는다.

대표 View

- Home
- Object Card
- Dashboard
- Dataview

---

## 8. AI Consumers

Youngjae OS는

하나의 AI가 아니라

여러 AI가 협업하는 구조를 목표로 한다.

예)

Investment AI

Knowledge AI

Review AI

Workout AI

Photo AI

모든 AI는

동일한 Object를 공유한다.

---

## 9. Automation Layer

Automation은

Object를 기반으로 반복 작업을 수행한다.

예)

- OCR
- Property Update
- Dashboard 생성
- Report 생성

Automation은

Object를 삭제하지 않는다.

---

## 10. Decision Support

Youngjae OS의 최종 목적.

모든 정보는

더 나은 의사결정을 지원해야 한다.

Decision Support는

최종 결과이지

별도의 데이터 저장소가 아니다.

---

# Data Flow

```
Capture

↓

AI Parsing

↓

Object

├── Property

├── Content

└── Workflow

↓

View

↓

AI / Automation

↓

Decision

↓

Review

↓

Knowledge Asset
```

---

# Architecture Rules

## Rule 1

Object가 시스템의 중심이다.

---

## Rule 2

Property와 Content를 분리한다.

---

## Rule 3

View는 데이터를 저장하지 않는다.

---

## Rule 4

AI는 Object를 소비한다.

AI는 Architecture의 중심이 아니다.

---

## Rule 5

Workflow는 Object 내부의 규칙이다.

별도 Layer가 아니다.

---

## Rule 6

새로운 기능은

반드시 기존 Layer를 재사용한다.

새로운 Layer는 추가하지 않는다.

---

# Out of Scope

Architecture는 다음을 정의하지 않는다.

- Plugin
- Folder
- CSS
- Dataview Query
- Template
- 구현 코드

이들은 Implementation Guide에서 정의한다.

---

# Final Statement

Youngjae OS는

Capture를 통해 정보를 받아들이고,

AI가 이를 구조화하여 Object를 생성하며,

Object를 중심으로 데이터를 축적하고,

View와 AI를 통해 활용하여,

궁극적으로 더 나은 의사결정을 지원하는 Personal Operating System이다.

---

**Version:** 1.1

**Status:** Active

**Supersedes:** Architecture v1.0

**Depends on:**
- 00_Constitution.md
