# ADR-004: Home over Dashboard — 분석보다 행동

**Status:** Accepted

**Date:** 2026-07-06

---

## Context

대부분의 PKM 도구와 Obsidian 셋업은 Dashboard를 강조한다. 통계, 그래프, 히트맵, 캘린더 뷰. 그러나:

1. Prodigy OS의 목적은 분석이 아니라 의사결정이다.
2. 분석은 Object 내부에서 수행하고, 시작 화면은 "지금 무엇을 해야 하는가"만 보여줘야 한다.
3. Dashboard는 사용자를 수동적 관찰자로 만든다. Home은 능동적 행동자로 만든다.

---

## Decision

Prodigy OS의 시작 화면을 **Dashboard가 아닌 Home (Action Center)**로 정의한다. Home은 5초 안에 오늘 해야 할 일을 이해시키고, 분석 정보(통계·그래프·ROI)는 배제한다.

---

## Alternatives Considered

| Alternative | Verdict | Reason |
|---|---|---|
| Dashboard 중심 | Rejected | 수동적 관찰 유도, 분석 마비 |
| Calendar 중심 | Rejected | 시간 관리 ≠ 의사결정 지원 |
| **Home (Action Center)** | **Accepted** | 행동 유도, 5초 규칙, 정보 최소화 |

---

## Consequences

### 장점
- 사용자가 Obsidian을 열면 바로 행동 모드로 진입
- 분석 마비(analysis paralysis) 방지
- 명확한 역할 분리: Home = 행동, Object 내부 = 분석

### 제약
- 통계·그래프를 보고 싶은 사용자의 기대와 충돌
- Dashboard가 필요한 사용자는 별도 View를 만들어야 함
- "Homepage" → "Home" 용어 변경 필요

---

## Related Documents
- 05_Home.md
- 01_Architecture.md
- PROJECT_IDENTITY.md
