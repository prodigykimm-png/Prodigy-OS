# ADR-002: Object First — Note가 아닌 Object

**Status:** Accepted

**Date:** 2026-07-06

---

## Context

Obsidian의 기본 단위는 "Note"다. 모든 플러그인, 템플릿, 커뮤니티 관행이 Note를 중심으로 설계되어 있다. 그러나:

1. Note는 "기록물"이라는 개념이 강해, 의사결정 지원 도구와는 거리가 멀다.
2. Prodigy OS의 목적은 기록이 아니라 의사결정이다.
3. 경매, 프로젝트, 운동, 독서 — 이들은 각각 독립된 라이프사이클을 가진 "관리 대상"이다.

---

## Decision

Prodigy OS의 기본 단위를 **Note가 아닌 Object**로 정의한다.

Object는 하나의 목적, 하나의 데이터, 하나의 상태, 하나의 의사결정을 가진 독립적인 관리 대상이다. 모든 기능은 Object를 중심으로 설계한다.

---

## Alternatives Considered

| Alternative | Verdict | Reason |
|---|---|---|
| Note 기반 (Obsidian 기본) | Rejected | 기록 중심, 의사결정 지원에 부적합 |
| Task 기반 | Rejected | 경매·프로젝트 등 복합 도메인을 Task로 축소 불가 |
| Project 기반 | Rejected | 운동·독서 등 개인 활동이 Project가 아님 |
| **Object First** | **Accepted** | 모든 도메인을 하나의 개념으로 추상화 |

---

## Consequences

### 장점
- 경매·프로젝트·운동·독서·일기를 하나의 프레임워크로 통합
- Property/Workflow/Behavior가 Object에 종속되어 일관된 구조
- AI가 Object 단위로 이해·분석·추천 가능

### 제약
- Core_Concepts에서 "Note → Object" 용어 재정의 필요
- Obsidian의 Note 중심 생태계와 마찰 (다행히 Property + Dataview로 커버 가능)
- 사용자에게 새로운 개념 설명 필요

---

## Related Documents
- 02_Core_Concepts.md
- 03_Object_Model.md
- 01_Architecture.md
