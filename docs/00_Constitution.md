# Prodigy OS Constitution v1.0

> "Prodigy OS는 AI와 함께 성장하는 Personal Operating System이다."

---

# Preamble

Prodigy OS는 단순한 Obsidian Vault가 아니다.

Prodigy OS는 나의 지식, 투자, 프로젝트, 건강, 경험, 기록을 하나의 시스템으로 연결하여 **더 나은 의사결정을 지원하는 Personal Operating System**이다.

Obsidian는 현재 사용하는 플랫폼일 뿐이며, Prodigy OS의 핵심은 데이터 구조와 시스템 설계이다.

앞으로 Python, MCP, PostgreSQL, n8n, OpenAI API, Claude, Gemini, AI Agent 등 어떤 기술이 추가되더라도 이 헌법은 변하지 않는다.

이 문서는 Prodigy OS의 최상위 설계 원칙이며, 모든 Architecture, Schema, Automation, AI, UX는 이 문서를 따른다.

---

# Core Concepts

## Execution & Knowledge Lifecycle

Prodigy OS는 실행(Execution)과 지식(Knowledge)의 상호작용을 통해 가치를 축적하는 생명주기(Lifecycle)를 가집니다. 이 둘은 서로 다른 폴더 레이어에서 관리되며, 시스템 전체의 데이터 흐름을 규정하는 최상위 원칙입니다.

### 1. Execution (실행)
Execution은 실제 업무가 수행되고 종결되는 영역으로, **PARA(PROJECTS, AREAS)**가 관리합니다.
- **상태 및 워크플로우**: 모든 Execution Object(사건, 프로젝트 등)는 고유한 `status`와 제한된 단방향 `Workflow`를 가집니다.
- **작업 공간**: 각 도메인의 전용 **Dashboard**에서 관리되며, 업무가 직접 수행되는 공간입니다.
- **종결성**: 일시적이며 최종 단계(`completed`, `archived`)에 도달하면 종료(종결)됩니다.
- **대표 예시**: Auction(경매), Reading(독서), Workout(운동), Projects(프로젝트), Personal(개인 업무)

### 2. Knowledge (지식)
Knowledge는 경험과 기록에서 추출된 영구적인 지식 자산으로, **ZETA**가 관리합니다.
- **무한성**: 종료의 개념이 없으며, 영구적으로 보관 및 확장됩니다.
- **연결성**: 단독으로 존재하지 않고 끊임없이 다른 지식과 연결(Link)됩니다. AI는 노트를 분석하여 지식 간의 유기적인 관계를 사용자에게 추천합니다.
- **자산화**: 장기적으로 축적되며 사용자의 의사결정을 돕는 지적 자산이 됩니다.
- **대표 예시**: Photography(사진학), Business(비즈니스), Health(건강/의학), AI(인공지능), Economics(경제학)

### 3. Data Lifecycle (데이터 생명주기)
모든 정보는 아래의 흐름을 통해 실행에서 지식으로 정제되고 자산화됩니다.

```text
Capture ➔ PARA ➔ Review ➔ AI Reflection ➔ ZETA
```

1. **Capture**: Inbox를 통해 날것의 아이디어나 임시 정보를 기록합니다.
2. **PARA**: 해당 정보를 바탕으로 실행 Object(Execution)를 생성하여 프로젝트나 태스크를 직접 수행합니다.
3. **Review**: 실행이 완료되면(예: 낙찰/패찰, 독서 완료, 운동 종료), 결과와 의사결정 과정을 복기(Review)합니다.
4. **AI Reflection**: AI가 사용자의 복기(Review) 및 수집된 팩트 데이터를 분석하여 장기적으로 보존할 만한 인사이트나 핵심 지식을 도출 및 정제합니다.
5. **ZETA**: 정제된 지식을 영구 지식(Knowledge) 레이어로 이관하여 장기 자산으로 축적하고 다른 지식과 연결합니다.

### 4. Dashboard & Hub
- **Dashboard**: 각 도메인(Auction, Reading 등)의 실제 Operational Workspace로, 실행(Execution) 과정을 직접 제어하고 관리합니다.
- **Home**: 여러 Dashboard들을 유기적으로 연결하고 오늘 해야 할 행동의 지표만 요약해 보여주는 최상위 Navigation Hub입니다.

### 5. AI Principle (AI 협업 원칙)
- AI는 정보를 **판단하지 않으며**, 어떠한 데이터도 사용자의 명시적 승인 없이 **삭제하지 않습니다**.
- AI의 역할은 사용자가 작성한 Review와 팩트 데이터를 분석하여, **ZETA 레이어로 발전(자산화)시킬 지식 후보를 추천**하는 것입니다.
- 지식의 이관, 최종 결정 및 의사결정의 주체는 오직 **사용자(Human)**입니다.

---

# Article 1 — Purpose

Prodigy OS의 목적은 기록이 아니다.

Prodigy OS의 목적은

**더 좋은 의사결정을 지원하는 것이다.**

모든 기능은 다음 질문을 통과해야 한다.

> "이 기능이 더 나은 의사결정을 만드는가?"

아니라면 만들지 않는다.

---

# Article 2 — Human First, AI Assist

Prodigy OS는 AI를 중심으로 설계하지만,

운영체제의 주인은 항상 사람이다.

AI의 역할은

- 구조화
- 분석
- 추천
- 자동화

이다.

사람의 역할은

- 판단
- 승인
- 최종 결정

이다.

AI는 사람을 대체하지 않는다.

AI는 사람의 의사결정을 강화한다.

---

# Article 3 — Capture First

모든 것은 Capture에서 시작한다.

Capture는 가능한 한 빠르고 단순해야 한다.

목표는

**3초 안에 기록을 시작하는 것**이다.

Capture 단계에서는

- 폴더를 고르지 않는다.
- Property를 입력하지 않는다.
- 긴 Template를 작성하지 않는다.

사람은 최소한만 입력한다.

나머지는 AI가 구조화한다.

---

# Article 4 — AI Structured Data

Property는 사람이 입력하기 위한 것이 아니다.

Property는 AI가 이해하기 위한 구조이다.

AI는 입력된 정보를 분석하여 Property를 자동 생성한다.

사람은 생성된 Property를 검토하고 필요한 경우 수정한다.

---

# Article 5 — Object First

Prodigy OS의 기본 단위는 Note가 아니다.

기본 단위는 Object이다.

예를 들어

- Auction Case
- Project
- Knowledge
- Workout
- Reading
- Journal

모든 정보는 Object로 관리한다.

Task는 Object 내부에 존재한다.

---

# Article 6 — Data First

모든 Object는 구조화된 데이터를 가진다.

Property는 Single Source of Truth(SSoT)이다.

동일한 데이터를 두 번 저장하지 않는다.

계산 가능한 값은 저장하지 않는다.

필요할 때 계산한다.

---

# Article 7 — Workflow Before UI

UI는 시스템의 중심이 아니다.

Object가 어떻게 행동하는지가 먼저 정의되어야 한다.

Workflow와 Behavior가 정의된 후

UI는 이를 표현하는 역할만 수행한다.

---

# Article 8 — Homepage Philosophy

Homepage는 Dashboard가 아니다.

Homepage는

**Action Dashboard**이다.

Homepage에서는

- 지금 무엇을 해야 하는가
- 현재 어떤 Object가 진행 중인가
- 무엇을 기록할 수 있는가

만 보여준다.

통계, 그래프, ROI 등 분석 정보는 Homepage에서 보여주지 않는다.

분석은 각 Object 내부에서 수행한다.

---

# Article 9 — Simplicity

Prodigy OS는 단순함을 최우선으로 한다.

새로운 기능보다

기존 구조를 재사용하는 것을 우선한다.

Property는 최소화한다.

Workflow는 최소화한다.

Template는 최소화한다.

복잡성이 증가하면

새로운 기능보다 기존 구조를 개선한다.

---

# Article 10 — Long-term First

Prodigy OS는

5년, 10년 동안 유지 가능한 구조를 선택한다.

짧은 편의성보다

장기 유지보수를 우선한다.

특정 Plugin이나 AI에 종속되지 않는다.

기술이 바뀌어도

데이터 구조는 유지되어야 한다.

---

# Article 11 — Obsidian Native First

가능하면 Obsidian 기본 기능을 사용한다.

기본 기능으로 부족하면

검증된 Plugin을 사용한다.

그래도 해결되지 않는 경우에만

직접 개발하거나 외부 자동화를 추가한다.

기술 선택보다 유지보수성을 우선한다.

---

# Article 12 — Real Use First

실제로 사용하면서 발견한 문제만 해결한다.

추측으로 기능을 만들지 않는다.

사용하지 않는 기능은 구현하지 않는다.

표준은 실제 사용을 통해 발전한다.

---

# Article 13 — Product over Technology

Prodigy OS는 기술 프로젝트가 아니다.

하나의 Product이다.

기술은 사용자 경험을 위한 수단이다.

기술을 위해 UX를 희생하지 않는다.

항상

UX가 먼저다.

---

# Design Guardrails

새로운 기능을 추가하기 전에 반드시 아래 질문을 확인한다.
### ADR

- ADR가 구현보다 앞서는가?
- Architecture 변경에만 ADR을 사용하는가?
- Issue가 반복되어 Architecture 변경이 필요한가?

## UX

- 실제로 불편한가?
- Capture를 더 어렵게 만들지는 않는가?
- 사람이 입력해야 하는 것이 늘어나지는 않는가?

## Data

- 기존 Property로 해결 가능한가?
- 새로운 Property가 정말 필요한가?
- 계산 가능한 값을 저장하려고 하는가?

## Architecture

- 기존 Object를 재사용할 수 있는가?
- 기존 Workflow를 재사용할 수 있는가?
- 기존 구조를 단순하게 유지할 수 있는가?

## AI

- AI가 대신할 수 있는 작업인가?
- 사람이 직접 해야 하는 작업인가?
- AI가 자동으로 구조화할 수 있는가?

## Implementation

- Obsidian Native로 가능한가?
- 기존 Plugin으로 가능한가?
- 정말 직접 개발이 필요한가?


---

# Article 14 — Simplicity First

새로운 개념을 만들기 전에

기존 개념을 개선할 수 있는지 먼저 검토한다.

새로운 문서를 만들기 전에

기존 문서를 확장할 수 있는지 먼저 검토한다.

새로운 Layer를 만들기 전에

기존 Layer를 재사용할 수 있는지 먼저 검토한다.

Prodigy OS는

추상화보다

실사용을 우선한다.

---


# Article 15 — Real Usage Drives Architecture

Architecture는 실제 사용을 통해 성장한다.

미래를 위해 현재를 복잡하게 만들지 않는다.

필요성이 검증된 후에만 새로운 Layer, Concept, Property, Object, Architecture를 추가한다.

## Early Improvement Exception

초기 개발 단계에서는

실제 사용 데이터가 충분히 쌓이지 않았더라도

**명확한 아키텍처적 개선**이 발견된 경우 변경을 고려할 수 있다.

Architecture가 비효율적인 구조를 보존해야만 하는 것은 아니다.

다만 변경은 반드시 문서화하고,
ADR을 통해 검증한다.

## Architecture Change Criteria

아래 조건을 모두 만족해야 Architecture 변경을 제안할 수 있다.

1. 새로운 설계가 현재보다 단순한가?
2. 유지보수성이 향상되는가?
3. 기존 Object와 호환되는가?
4. AI 추론이 단순해지는가?
5. 반복되는 실사용에서 구조적 약점이 드러났는가?
6. 변경의 이익이 도입 비용보다 명확히 큰가?

조건을 만족하지 않는 변경은
실행하지 않는다.


---

# Final Principle

모든 중요한 설계는 문서에 기록한다.

모든 Architecture 변경은 ADR(Architecture Decision Record)에 남긴다.

Prodigy OS는 문서를 중심으로 발전하는 프로젝트이다.

---

**Version:** 1.0

**Status:** Active

**Last Updated:** 2026-07-06
