# Prodigy OS — Domain Architecture (Exploratory)

> "향후 데이터 분석과 AI 활용을 위해 검토 중인 개념이다."

---

# Status

이 문서는 Prodigy OS의 공식 Architecture가 아니다.

현재 Architecture의 필수 요소가 아니다.

Domain은 향후 검토 가능한 아이디어 수준이다.

---

# What is a Domain?

Domain은

비슷한 목적을 가진 Object를

논리적으로 묶는 개념이다.

예)

- Investment (경매, 온비드, 시장 관찰)
- Knowledge (독서, 공부, 개념)
- Project (AI 프로젝트, 자동화)
- Personal (운동, 습관, 건강)
- Journal (일기, 회고)

---

# Current Position

Prodigy OS는

현재 Dusk의 PARA 구조와 Zettelkasten 철학을 유지한다.

Object는 Folder, Property, AI 추천을 통해 충분히 관리 가능하다.

Domain이라는 별도 Layer는 당장 필요하지 않다.

---

# Why This Exists

향후 AI가 Object를 자동 분류하고,

Dashboard가 Domain별 분석을 제공하며,

여러 Domain을 가로지르는 의사결정 지원이 필요해지면

Domain 개념을 재검토한다.

---

**Version:** 0.1 (Exploratory)

**Status:** Not Active

**Supersedes:** Domain Architecture v1.0

---

# Knowledge Explorer Local Taxonomy

Knowledge Explorer는 검증된 Knowledge와 이를 뒷받침하는 Resource를 탐색하기 위해서만 제한된 Domain/Topic taxonomy를 사용한다. 이 로컬 taxonomy는 `knowledge_domain`과 `knowledge_topics`에만 적용되며, 전역 `domain` Property나 Vault-wide Domain layer를 활성화하지 않는다.

- 공식 Domain Architecture 상태는 계속 **Not Active**다.
- 다른 Object type에 Domain Property를 요구하지 않는다.
- 누락되거나 registry에 없는 값은 원본을 바꾸지 않고 Explorer projection에서만 `unclassified`(표시: 미분류)로 보인다.
- 분류를 자동 생성·승인·migration하지 않는다. canonical Knowledge 승인은 사람의 판단이다.

공식 저장·호환 계약은 `SYSTEM/Prodigy/Schema/Knowledge_Explorer_Schema.md`가 소유한다.

---

# Knowledge Stability Sprint Results

Knowledge stability sprint는 다음을 확정했다.

1. **Domain/Topic 단일 출처**: `KnowledgeExplorerRegistry`가 Explorer, Authoring, Candidate, Decision Packet의 유일한 taxonomy source of truth다.
2. **Candidate 상태 머신**: `needs_more_evidence`는 비종단 상태로, 승인·승격이 차단되며 검토 재개로만 `saved`로 복귀한다.
3. **Decision Packet 설명 가능성**: 각 Knowledge 항목에 한국어 매칭 이유(직접 연결 / 동일 지역 / 공통 주제)를 표시한다.
4. **Knowledge Use Body Link**: v1에서는 공식 Property가 아닌 본문 링크 실험으로 기록한다.
5. **CI baseline**: push/PR 시 stability smoke runner가 자동 실행된다.
