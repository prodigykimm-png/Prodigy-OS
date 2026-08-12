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

Workspace Shortcuts · Morning Brief · Focus · Continue · Micro Log · Needs Attention · Quick Actions · Todoist · Workspace Launcher · System Status는
기존 컴포넌트/엔진을 **재배치**한다. 새 비즈니스 로직을 만들지 않는다.

## 4. Stable Public APIs

Object Engine · Display Registry · Property/Schema · Morning Brief 계산 · Todoist 연동은  
Home에서 수정하지 않는다.

---

# Layout (Mission Control · 실제 UI 순서)

```text
Top
────────────────
Workspace Shortcuts

Morning Brief (오늘 · 아침 브리핑)

Today's Focus (오늘의 집중)

Continue (이어하기)

Micro Log

더 보기 (접힘)
  ↳ Needs Attention
  ↳ Quick Actions
  ↳ Todoist
  ↳ Workspace Launcher
  ↳ System Status
────────────────
Bottom
```

아래로 갈수록 시각적 우선순위가 낮아진다 (calmer hierarchy).  
사용자 조작 상세: [09_Obsidian_Manual.md](09_Obsidian_Manual.md).

---

# Section Contracts

| Section | Source | Limit | Empty |
|--------|--------|-------|-------|
| Workspace Shortcuts | Workspace Registry | pinned 2 + recent 1 + all | labelled empty shortcut surface |
| Morning Brief | existing Brief result | 3–5 short lines | fallback line |
| Today's Focus | **approved** focus only | max 3 · title + next action | No focus selected. Open Morning Brief. |
| Continue | Object Engine continue + package candidates | max 4 · no completed | Nothing to continue. Enjoy a fresh start. |
| Micro Log | existing quick-record slot | one lightweight entry | — |
| Needs Attention | Object Engine critical/high | title + WHY + open Workspace | Everything looks good today. |
| Quick Actions | Universal Creator · Daily · Search | lightweight only | — |
| Todoist | existing integration snapshot | Today count + Open | — |
| Workspace Launcher | existing Launcher cards | Current Context | empty card state |
| System Status | engine_ok · sync warnings · review_inbox | Healthy / Pending only | — |

Focus is **not edited** on Home. Approve-as-is is allowed when proposals exist.

Focus와 Continue는 같은 Object 또는 같은 제목의 행동을 동시에 보여 주지 않는다. 승인된 Focus가 우선이며, Continue는 남은 후보만 렌더링한다. 생성 진입점은 Home의 `Micro Log` 하나이며 Workspace Launcher의 독립 Creator와 의미를 중복하지 않는다.

compact Home은 문서 전체가 아니라 App Shell body 하나만 스크롤을 소유한다. 마지막 Micro Log 조작부와 `더 보기` summary가 floating Obsidian toolbar 위까지 도달하도록 Action Bar 52px, 모바일 toolbar 56px, safe area, 16px 여백을 함께 예약한다. 320/375/390/430px 자동 기하 검증은 통과했지만, 수정 후 physical iPhone 검증은 아직 `not_proven`이다.

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
