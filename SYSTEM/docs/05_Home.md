# Prodigy OS Home v1.0

> "Home은 정보를 보여주는 화면이 아니라, 행동을 시작하는 화면이다."

---

# Purpose

Home은 Prodigy OS의 시작 화면이다.

사용자가 Prodigy OS를 열었을 때

가장 먼저 보는 화면이며,

오늘 해야 할 일을 가장 빠르게 확인할 수 있도록 설계한다.

Home은 Dashboard가 아니다.

Home은 Action Center이다.

---

# Design Principles

## 1. Five Second Rule

Home은

5초 안에

오늘 해야 할 일을 이해할 수 있어야 한다.

---

## 2. Action First

Home은

분석보다 행동을 우선한다.

---

## 3. One Screen Rule

가능하면

스크롤 없이

핵심 정보를 보여준다.

---

## 4. Search First

Home의 가장 위에는

Universal Search가 위치한다.

검색은

입력보다

더 자주 사용된다.

---

# Layout

```
⌕ Universal Search

↓

🔥 Today

↓

▶ Continue

↓

📥 Capture

↓

🔁 Review
```

---

# Home Responsibilities

Home은

다음을 담당한다.

- 오늘 해야 할 일
- 진행 중인 Object
- 빠른 Capture
- Review 알림

---

Home은

다음을 담당하지 않는다.

- 통계
- 그래프
- ROI
- Calendar
- Heatmap
- 장기 분석

분석은

각 Object Dashboard에서 수행한다.

---

# Final Statement

Home은

Prodigy OS의 출발점이다.

Home은

사용자가

오늘 무엇을 해야 하는지를

5초 안에 알려주는 화면이다.

---

**Version:** 1.0

**Status:** Active

**Depends on:**
- 00_Constitution.md
- 01_Architecture.md
- 02_Core_Concepts.md
- 03_Object_Model.md
- 04_Capture_System.md
