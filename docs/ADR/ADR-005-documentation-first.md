# ADR-005: Documentation First — 채팅보다 문서

**Status:** Accepted

**Date:** 2026-07-06

---

## Context

AI와의 협업이 일상화되면서, 설계 결정이 채팅 로그에만 남는 경우가 많아졌다. 이는:

1. 새로운 AI 세션이 과거 결정을 알 수 없다.
2. 다른 AI 모델(ChatGPT, Claude, Gemini)이 동일한 지식 기반을 공유할 수 없다.
3. 프로젝트의 역사가 사라진다.

---

## Decision

Prodigy OS의 모든 설계 결정은 **채팅이 아닌 문서에 기록**한다. 채팅은 브레인스토밍이고, 문서는 공식이다. Architecture 변경은 ADR로, 세부 명세는 Schema 문서로, 중대한 변경은 CHANGELOG로 관리한다.

---

## Alternatives Considered

| Alternative | Verdict | Reason |
|---|---|---|
| 채팅 로그 의존 | Rejected | AI 세션 간 지식 전달 불가 |
| Git commit message 의존 | Rejected | 결정의 이유(Context)가 누락 |
| **Documentation First** | **Accepted** | AI-agnostic, 영구 보존, 검색 가능 |

---

## Consequences

### 장점
- 어떤 AI 모델이든 동일한 문서를 읽고 동일한 아키텍처 이해
- 프로젝트의 설계 결정이 영구 보존
- 신규 기여자(인간/AI) 온보딩 용이

### 제약
- 문서 작성 오버헤드 (채팅 후 문서화 단계 필요)
- 문서가 코드와 불일치할 위험 (문서 최신화 의무)

---

## Related Documents
- 00_Constitution.md
- 07_Implementation_Guide.md
- docs/ADR/ADR.md
