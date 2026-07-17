# Prodigy OS Home — Mission Control

> "Home은 정보를 보여주는 화면이 아니라, **지금 무엇을 할지** 결정하는 화면이다."

---

# Purpose

Home은 Prodigy OS의 **Mission Control**이다.

사용자가 Prodigy OS를 열었을 때 가장 먼저 보는 화면이며,

5초 안에 오늘 우선순위를 이해하도록 설계한다.

Home은 Dashboard가 아니다.  
Home은 Workspace를 대체하지 않는다.

```text
Home
  → Decide
  → Navigate
  → Execute (in Workspace)

Workspace
  → Operate
  → Record
  → Review
```

---

# Design Principles

## 1. Five Second Rule

Home은 5초 안에 “What should I do right now?”에 답한다.

## 2. Action First

분석보다 다음 행동을 우선한다.

## 3. Recompose, Don’t Rebuild

Morning Brief · Focus · Continue · Needs Attention · Launcher · Todoist는  
기존 컴포넌트/엔진을 **재배치**한다. 새 비즈니스 로직을 만들지 않는다.

## 4. Stable Public APIs

Object Engine · Display Registry · Property/Schema · Morning Brief 계산 · Todoist 연동은  
Home에서 수정하지 않는다.

---

# Layout (Mission Control)

```text
Top
────────────────
🌅 TODAY
Morning Brief

Today's Focus

Continue

Needs Attention

Quick Actions

Todoist

Workspace Launcher

System Status
────────────────
Bottom
```

아래로 갈수록 시각적 우선순위가 낮아진다 (calmer hierarchy).

---

# Section Contracts

| Section | Source | Limit | Empty |
|--------|--------|-------|-------|
| Morning Brief | existing Brief result | 3–5 short lines | fallback line |
| Today's Focus | **approved** focus only | max 3 · title + next action | No focus selected. Open Morning Brief. |
| Continue | Object Engine continue + package candidates | max 4 · no completed | Nothing to continue. Enjoy a fresh start. |
| Needs Attention | Object Engine critical/high | title + WHY + open Workspace | Everything looks good today. |
| Quick Actions | Universal Creator · Daily · Search | lightweight only | — |
| Todoist | existing integration snapshot | Today count + Open | — |
| Workspace Launcher | existing Launcher cards | Current Context | empty card state |
| System Status | engine_ok · sync warnings · review_inbox | Healthy / Pending only | — |

Focus is **not edited** on Home. Approve-as-is is allowed when proposals exist.

---

# Home Responsibilities

Home **does**:

- 오늘 맥락 요약 (Brief)
- 승인된 Focus 표시
- 이어하기 / 주의 필요 신호
- Workspace로 진입
- 가벼운 생성·검색 입구

Home **does not**:

- Workspace 업무 수행
- Object 스키마/Property 변경
- Lifecycle 재계산
- Todoist 실행 목록 복제
- 통계 · 그래프 · AI 추천 생성

---

# Relationship to Workspaces

- **Home** = Mission Control (decide → navigate)
- **Workspace Dashboard** = Domain operations (operate → record → review)
- **Todoist** = Task execution owner
- **Objects** = Source of truth

Launcher는 “What is waiting for me?” 컨텍스트를 보여 주고,  
실행은 항상 해당 Workspace에서 한다.

---

# Final Statement

Home is Mission Control.  
Workspaces remain operational.  
Architecture stays unchanged — only presentation is refined.
