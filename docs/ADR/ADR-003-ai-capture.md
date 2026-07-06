# ADR-003: AI Capture — 사람은 최소한만, AI가 구조화

**Status:** Accepted

**Date:** 2026-07-06

---

## Context

기존 Obsidian 방식은 사용자가 Template를 선택하고, 폴더를 지정하고, Property를 수동으로 입력해야 했다. 이는:

1. Capture 속도를 저하시킨다 (3초 안에 시작 불가능).
2. 사용자에게 구조화 부담을 전가한다.
3. 일관된 데이터 품질을 보장할 수 없다.

---

## Decision

Capture 단계에서는 사용자가 **최소한의 정보만 입력**하고, AI가 Parsing·Classification·Property Extraction을 수행한다. 사용자는 생성된 결과를 검토·승인한다.

Capture에서 묻지 않는 것: Folder, Tag, Property, Workflow.

---

## Alternatives Considered

| Alternative | Verdict | Reason |
|---|---|---|
| 수동 입력 (기존 Obsidian 방식) | Rejected | 느리고, 데이터 품질 불균일 |
| 자동 입력 (규칙 기반) | Rejected | 경매 PDF 등 비정형 데이터 처리 불가 |
| **AI Capture** | **Accepted** | 비정형 입력 처리, 자동 분류, Property 추출 |

---

## Consequences

### 장점
- Capture 속도 3초 이내 달성 가능
- 데이터 일관성 — AI가 일관된 Property를 생성
- 사용자가 구조화 부담에서 해방

### 단점
- AI 의존도 증가
- AI 오분류 시 사용자 수정 필요
- 초기 AI 파이프라인 구축 비용

---

## Related Documents
- 04_Capture_System.md
- 06_AI_System.md
- 01_Architecture.md
