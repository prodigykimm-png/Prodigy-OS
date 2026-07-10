# Prodigy OS AI System v2.0

> "AI는 기록하지 않는다. AI는 이해한다."

---

# Purpose

이 문서는 Prodigy OS에서 AI의 역할과 책임을 정의한다.

Prodigy OS는 AI를 단순한 챗봇으로 사용하지 않는다.
AI는 **사용자의 경험을 구조화된 Asset으로 성장시키는 엔진**이다.

> 상세 원칙: [docs/00_Constitution.md](docs/00_Constitution.md) (Article 2)

---

# AI Responsibilities

AI는 다음 역할을 수행한다.

## 1. Parse
입력된 정보를 이해한다.
예: PDF → 주소/사건번호 추출 → Property 생성

## 2. Structure
정보를 Object 형태로 변환한다.
예: 텍스트 → Auction Object

## 3. Enrich
추가 정보를 보완한다.
예: 경매 → 네이버 시세/과거 거래 → Dashboard 계산 설명

## 4. Connect
Object와 Object를 연결한다.
예: Auction → 세법/감정평가/투자 전략

## 5. Assist Decision
데이터를 제시한다.
- "이 물건의 예상 적정가: X억~Y억"
- "유사 물건 최저가율: 평균 X%"
- "당신의 낙찰 성공률이 가장 높은 구간: 최저가율 XX~YY%"

AI는 최종 결정을 내리지 않는다.

## 6. Review Support
복기 데이터를 기반으로 패턴을 제시한다.
- "최저가율 80% 이상에서 패찰률 80%"
- "인천 오피스텔 낙찰 성공률: 45%"

---

# AI Boundaries

## AI MAY
- Analyze
- Review
- Recommend
- Generate Properties
- Assist Organization

## AI MUST NOT
- Make final decisions
- Delete Objects automatically
- Rewrite important Object data without explicit approval
- Change system architecture
- Write Decision or Review content automatically

---

# Human Responsibilities

사람은 항상 최종 책임을 가진다.
사람은 다음을 담당한다.
- 승인
- 수정
- 삭제
- 의사결정
- Review 작성

---

# AI Pipeline

```
Aside Capture
    ↓
Parse
    ↓
Structure
    ↓
Enrich
    ↓
Assist Decision
    ↓
Human Confirm
    ↓
Object Updated
    ↓
Review Support
    ↓
Knowledge Asset
```

---

# Final Statement

Prodigy OS에서 AI는
사용자의 입력을 줄이고,
Object 생성을 지원하며,
Dashboard 계산을 설명하고,
의사결정을 보조한다.

최종 결정은 사람이 수행한다.

---

**Version:** 2.0
**Status:** Active
**Supersedes:** AI System v1.0
**Depends on:**
- 00_Constitution.md
- 01_Architecture.md