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
Knowledge는 단순히 수집된 정보(Information)의 모음이 아니라, **반복된 경험과 검증을 견뎌낸 이해(Understanding)**입니다. 정보는 증거(Evidence)가 되고, 증거는 패턴(Pattern)이 되며, 패턴은 원칙(Principle)이 됩니다. 그리고 최종 검증된 원칙만이 지식이 됩니다.
- **영구성**: 종료의 개념이 없으며, 검증을 마친 지식은 ZETA 레이어에서 영구적으로 축적되고 확장됩니다.
- **연결성**: 지식은 독립적으로 존재하지 않고 유기적으로 연결되어, 미래의 더 나은 의사결정을 지원하는 판단 기틀이 됩니다.
- **대표 예시**: Photography(사진학), Business(비즈니스), Health(건강/의학), AI(인공지능), Economics(경제학)

### 3. Data Lifecycle (데이터 생명주기)
모든 정보는 경험과 검증을 통해 장기적 지식으로 자산화됩니다.

```text
경험 (Experience) ➔ 성찰 (Reflection) ➔ 증거 (Evidence) ➔ 패턴 감지 (Pattern Detection) ➔ 추천 원칙 (Suggested Principle) ➔ 인간 검증 (Human Validation) ➔ 검증된 원칙 (Validated Principle) ➔ 지식 (Knowledge) ➔ 미래 의사결정 (Better Decisions)
```

1. **Experience (경험)**: PARA 레이어에서 실제로 일을 수행하고 태스크를 완료합니다.
2. **Reflection (성찰)**: 하루를 마감하며 경험을 복기하고 일일 성찰을 남깁니다.
3. **Evidence (증거)**: 일일 성찰은 원칙을 생성하지 않으며, 단지 데이터로서의 증거(Evidence)로 축적됩니다.
4. **Pattern Detection (패턴 감지)**: AI가 누적된 다수의 증거들에서 행동, 감정, 의사결정의 공통된 패턴을 식별합니다.
5. **Suggested Principle (추천 원칙)**: 식별된 패턴을 바탕으로 AI가 주간 리뷰에서 원칙 후보를 사용자에게 추천합니다.
6. **Human Validation (인간 검증)**: 사용자가 월간 리뷰에서 후보군을 확인하고, 실질적으로 도움이 된 원칙을 검증 및 승인합니다.
7. **Validated Principle (검증된 원칙)**: 최종 승인된 원칙만이 공식 자산으로 채택됩니다.
8. **Knowledge (지식) & Decisions**: 검증된 원칙이 ZETA 레이어에 지식 문서로 귀속되어 정체성을 형성하고 향후 더 좋은 의사결정을 지원합니다.

## Evidence Before Principle (증거 우선 원칙)

개인의 핵심 원칙은 단발적인 생각이나 일시적인 깨달음에서 즉흥적으로 만들어지지 않는다.

원칙은 반드시 반복된 증거를 통해 검증되고 드러나야 한다.

1. **성찰**은 하루의 팩트와 경험적 배움을 포착하여 **증거(Evidence)**를 남긴다.
2. **AI**는 축적된 증거를 모니터링하여 공통되는 **패턴(Pattern)**을 발견한다.
3. **인간**은 발견된 패턴이 내면에 작용하는지 확인하고 원칙을 **검증(Validate)**한다.

오직 최종 검증을 통과한 원칙만이 Personal Operating System의 구성 요소(지식)로 안착한다.

### 4. Dashboard & Hub
- **Dashboard**: 각 도메인(Auction, Reading 등)의 실제 Operational Workspace로, 실행(Execution) 과정을 직접 제어하고 관리합니다.
- **Home**: 여러 Dashboard들을 유기적으로 연결하고 오늘 해야 할 행동의 지표만 요약해 보여주는 최상위 Navigation Hub입니다.

### 5. AI Principle (AI 협업 원칙)
- AI는 증거를 수집하고, 패턴을 탐지하여, 원칙 후보를 제안(Suggest)하는 방식으로 사용자를 돕습니다.
- AI는 독단적으로 원칙을 정의하거나 개인의 철학을 자율적으로 생성(Create)하지 않습니다.
- 지식의 검증, 이관 및 최종 결정의 주체는 오직 **사용자(Human)**입니다.

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

Prodigy OS는 AI를 중심으로 설계하지만, 운영체제의 주인은 항상 사람이다.

AI의 역할은 다음과 같다:
- 일일 성찰 등을 통해 **증거 수집 (Collecting Evidence)**
- 수집된 증거를 바탕으로 **패턴 감지 (Detecting Patterns)**
- 식별된 패턴으로부터 **원칙 후보 제안 (Suggesting Principles)**

사람의 역할은 다음과 같다:
- 제안된 원칙 후보에 대한 **인간 검증 (Validation)**
- 최종 승인 및 반려 결정

AI는 어떠한 경우에도 개인의 가치관이나 핵심 원칙을 독단적으로 생성(Create)하지 않으며, 오직 인간의 의사결정과 배움을 보조하고 강화한다.


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

Home Article 3 최소 Capture 예외: Home에서 시작한 Capture가 3초 입력을 넘어 분류·정리·판단을 요구하면, Home에서 계속 처리하지 않고 Inbox 또는 해당 Workspace에서 검토한다.

모바일 성공 주장은 `physical iPhone` 실기기에서 사용자가 직접 확인한 경우에만 `user-evidence-only gate`를 통과한다. 데스크톱 폭 조절이나 추정 결과는 Article 3 Capture의 모바일 성공 근거가 아니다.

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

> **용어:** 현재 UI 구현에서 Homepage는 Home과 동의어로 사용됨.

Homepage는

**Mission Control**이다.

Homepage에서는

- 지금 무엇을 해야 하는가 (What should I do right now?)
- 승인된 Focus · Continue · Needs Attention
- 어디로 들어가 실행할 것인가 (Workspace navigation)

만 보여준다.

실행·기록·복기는 Workspace Dashboard에서 수행한다.

통계, 그래프, ROI 등 분석 정보는 Homepage에서 보여주지 않는다.

분석은 각 Object / Workspace 내부에서 수행한다.

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

# Article 16 — AI Architecture Principles

AI가 Prodigy OS에 참여하는 방식을 규정한다.

## 불변 원칙

```text
AI creates drafts.
Humans decide.
Objects preserve the approved record.

AI Runtime provides capabilities.
Workspaces own intelligence.
```

이 다섯 문장은 5년이 지나도 거의 변하지 않는다.

## 개발 원칙

```text
설계는 Top-down으로 한 번 확정한다.
구현은 Vertical로 하나씩 완성한다.
공통화는 Bottom-up으로 실제 사용 후 승격한다.
```

## Draft 분류

AI가 생성하는 모든 출력은 Draft이다.
Draft는 두 종류로 구분한다.

- **Analysis Draft**: 사용 중 소비되는 분석 제안 (Reading Questions, Auction Evidence, Workout Pattern)
- **Record Draft**: 승인 후 Object에 보존될 수 있는 기록 제안 (Thinking Delta, Project Review, Knowledge Candidate)

어느 쪽이든 자동 저장은 없다.

## Runtime과 Workspace의 경계

AI Runtime Library는 Provider 호출, Structured Output, Validation, Draft Lifecycle, Approval Boundary만 제공한다.

Reading Questions, Thinking Delta, Auction Evidence, Workout Pattern 등 Workspace Intelligence는 각 Workspace가 소유한다.

## Capability 승격 조건

새로운 AI Capability가 공통 Runtime으로 승격되려면 다음을 모두 만족해야 한다.

1. 최소 두 Workspace에서 실제 사용
2. 입력과 출력의 의미가 동일
3. 실패·재시도·승인 흐름이 동일
4. Workspace 고유 용어가 없음
5. 사용자가 같은 기능으로 인식
6. 두 Workspace의 회귀 테스트가 존재

하나라도 충족하지 않으면 Workspace 소유로 남는다.

## Dogfooding Release Gate

Workspace 하나를 실제 사용하기 전에는 다음 Workspace를 구현하지 않는다.

```text
Implement → Dogfood → Observe → Improve → Next Workspace
```

Dogfooding은 Sprint가 아니라 Release Gate이다.

---

# Final Principle

모든 중요한 설계는 문서에 기록한다.

모든 Architecture 변경은 ADR(Architecture Decision Record)에 남긴다.

Prodigy OS는 문서를 중심으로 발전하는 프로젝트이다.

---

**Version:** 1.1

**Status:** Active

**Last Updated:** 2026-07-23
