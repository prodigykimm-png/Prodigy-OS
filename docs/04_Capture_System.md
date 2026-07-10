# Prodigy OS Capture System v2.0

> "Capture는 빠르게, 구조화는 AI가, 결정은 사람이."

---

# Purpose

Capture System은 Prodigy OS의 입력 방식을 정의한다.

Prodigy OS에서 Capture의 목적은 기록이 아니다.

**Auction Object를 생성하기 위한 시작점**이다.

Capture는 가능한 한 빠르고 단순해야 한다.

---

# Capture Flow

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
```

---

# Aside Capture

Aside는 LLM을 활용하여

**Auction Object를 직접 생성**한다.

Aside는 다음을 생성한다.

- YAML Property
- Summary
- Collected Facts
- Source URL
- Recommendation (Standardized)

Aside는 아래 작업을 수행하지 않는다.

- 예상 입찰가 계산
- ROI 계산
- 투자 판단
- 입찰 여부
- Decision 작성
- Review 작성

Decision과 Review는

항상 사용자 영역으로 유지한다.

---

# YAML Rule

Capture 단계에서는

Auction Template의 YAML Property를 반드시 생성한다.

Property 이름은 변경하지 않는다.

Property를 임의로 추가하지 않는다.

확인 가능한 값만 입력한다.

확인되지 않은 값은 비워둔다.

추론하여 작성하지 않는다.

---

# Human Input Principle

사람은

AI가 알 수 없는 정보만 입력한다.

예)

AI 입력

- 주소
- 면적
- 감정가
- 사건번호
- 입찰일
- 법원정보

사람 입력

- 예상 입찰가
- 입찰 여부
- 패찰 이유
- 의사결정 근거

---

# AI Confirmation

AI가 생성한 정보는

항상 사람이 검토한다.

사람은

수정

승인

보류

중 하나를 선택한다.

---

# Capture Principles

1. Capture는 3초 안에 시작할 수 있어야 한다.
2. Capture 결과물은 Dashboard가 즉시 사용할 수 있는 Object이다.
3. Capture는 Property를 요구하지 않는다. AI가 구조화한다.
4. Capture는 Folder를 요구하지 않는다.
5. Capture는 사용자의 흐름을 끊지 않는다.

---

# Final Statement

Prodigy OS에서

Capture는 기록이 아니다.

Capture는

미래의 Asset을 만드는 시작점이다.

Aside는 이 시작점에서

완성된 Auction Object를 생성한다.

---

**Version:** 2.0

**Status:** Active

**Supersedes:** Capture System v1.0

**Depends on:**
- 00_Constitution.md
- 01_Architecture.md
- 03_Object_Model.md