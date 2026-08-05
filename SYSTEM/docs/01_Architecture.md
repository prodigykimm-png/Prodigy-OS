# Prodigy OS Architecture v2.0

> "Object is the center. Everything else exists to create, understand, or use Objects."

---

# Purpose

이 문서는 Prodigy OS의 시스템 구조를 정의한다.

Architecture는 기술이나 Plugin을 설명하지 않는다.
Architecture는 **정보가 어떻게 흐르고, Object가 어떻게 성장하며, AI가 어떻게 이를 활용하는지**를 정의한다.

Prodigy OS의 모든 구현은 이 문서를 따른다.

> 상세 원칙: [00_Constitution.md](00_Constitution.md)

---

# Core Design Principle

```
Object stores data.
Dashboard calculates.
AI assists.
Humans decide.
```

---

# System Architecture

```
Web Sources
    │
    ▼
Aside Capture
    │
    ▼
Auction Object
├── YAML Property
├── Summary
└── Collected Facts
    │
    ▼
Dashboard
    │
    ▼
Decision (Human Only)
    │
    ▼
Review (Human Only)
    │
    ▼
Knowledge Asset
```

---

# Data Flow

```
Web Sources
    │
    ▼
Aside Capture  ────  LLM generates Auction Object directly
    │
    ▼
Auction Object
├── YAML Property (structured data for Dashboard)
├── Summary (AI-generated 3-5 line overview)
└── Collected Facts (structured findings)
    │
    ▼
Dashboard
├── Reads Object Property
├── Calculates aggregated metrics
└── Renders cards, tables, charts
    │
    ▼
Decision (Human Only)
    │
    ▼
Review (Human Only)
    │
    ▼
Knowledge Asset
```

---

# Layer Definitions

## 1. Capture Layer

사용자가 정보를 입력하는 계층.

입력은 가능한 한 단순해야 한다.

지원 입력: URL, PDF, Text

**Capture 결과물은 Raw Markdown이 아니다.**
**Capture 결과물은 Dashboard가 즉시 사용할 수 있는 Auction Object이다.**

---

## 2. Object Layer

Prodigy OS의 핵심.

Object는 독립적인 관리 단위이다.

대표 Object:
- Auction Case
- Knowledge
- Project
- Workout
- Reading
- Journal

모든 시스템은 Object를 기준으로 동작한다.

---

## 3. Property

Object를 설명하는 구조화된 데이터.

Property는 Single Source of Truth이다.
Property는 사람보다 AI가 사용하는 데이터이다.
Dashboard는 Property를 읽고 계산한다.

---

## 4. Content

사람이 읽고 작성하는 내용.

예: Summary, Collected Facts, 메모, 분석, 생각

Content는 자유롭다. Property는 구조화된다.

---

## 5. Workflow

Object의 진행 흐름.

Workflow는 Object가 어떤 단계를 거치는지를 정의한다.
Workflow는 Behavior를 포함한다.

```
Allowed Action
    ↓
Current State
    ↓
Next State
```

---

## 6. View Layer

View는 Object를 사용자에게 표현한다.
View는 데이터를 저장하지 않는다.
View는 Property를 읽고 계산하여 표시한다.

대표 View: Home, Object Card, Dashboard, Dataview

---

# Architecture Rules

1. **Object가 시스템의 중심이다.**
2. **Property와 Content를 분리한다.**
3. **View는 데이터를 저장하지 않는다. View는 계산한다.**
4. **AI는 Object를 소비한다. AI는 Architecture의 중심이 아니다.**
5. **Workflow는 Object 내부의 규칙이다. 별도 Layer가 아니다.**
6. **새로운 기능은 반드시 기존 Layer를 재사용한다. 새로운 Layer는 추가하지 않는다.**

---

# Knowledge Pipeline

Knowledge는 Experience → Evidence → Candidate → Human Review → Knowledge → Decision Packet
의 파이프라인으로 생성되고 재사용된다.

```
Experience (Journal / Capture)
    ↓
Evidence (Daily Reflection)
    ↓
Knowledge Candidate (proposed → saved → needs_more_evidence → approved / rejected)
    ↓
Human Review Gate (AI recommends, Human decides)
    ↓
Knowledge (verified, type: knowledge | permanent_note)
    ↓
Decision Packet (판단 순간에 관련 Knowledge 호출)
    ↓
Knowledge Use Body Link (사용자가 명시적으로 판단 근거로 기록)
```

## Knowledge Use Body Link (v1 Experiment)

v1에서는 `used_knowledge`를 공식 frontmatter Property로 채택하지 않는다.
대신 사용자가 Decision Packet에서 Knowledge를 체크하고 판단 맥락을 입력한 후
"판단 근거로 기록"을 눌렀을 때, 해당 Object의 기존 본문 섹션에 링크 블록을 추가한다.

- Auction: `# 판단 기록`
- Reading: `## Review`
- Workout: `# 리뷰`

이 실험은 10~20건의 실사용 후 구조화된 Property 승격 여부를 재평가한다.
자동 기록하지 않으며, 표시/열기 시 기록하지 않는다.

## Pre-Sprint Baseline

Knowledge stability sprint의 기준 커밋: `eac574b`

---

# Out of Scope

Architecture는 다음을 정의하지 않는다.
- Plugin, Folder, CSS, Dataview Query, Template, 구현 코드

이들은 Implementation Guide에서 정의한다.

---

**Version:** 2.0
**Status:** Active
**Supersedes:** Architecture v1.1
**Depends on:**
- 00_Constitution.md
- 03_Object_Model.md
