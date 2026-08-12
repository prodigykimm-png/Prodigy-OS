# ADR-007: Contract Source Hierarchy — 계약의 우선순위

**Status:** Accepted

**Date:** 2026-07-31

---

## Context

Prodigy OS는 여러 계층의 설계 문서를 가지고 있다:

1. **Constitution** (`00_Constitution.md`) — 철학과 원칙
2. **Architecture** (`01_Architecture.md`, `03_Object_Model.md` 등) — 구조와 동작
3. **Schema** (`Region_Property_Contract_v1.md` 등) — Property와 타입 명세
4. **Template** (frontmatter) — 실제 Object 생성 시 초기값
5. **View/Test** — UI 렌더링과 검증 로직

각 계층이 다른 정보를 제공할 때, 어느 것이 "공식"인지 불명확했다.

또한 root `DESIGN.md`는 UI 구현의 canonical contract이지만, `SYSTEM/docs/DESIGN.md`는 색상 토큰의 호환성 레퍼런스일 뿐 동일한 역할을 하지 않는다. 이 차이가 문서화되지 않아 혼란이 발생했다.

---

## Decision

계약의 우선순위를 다음과 같이 정의한다:

1. **Constitution** > Architecture > Schema > Template > View
2. 상위 문서가 하위 문서를 override한다.
3. 하위 문서는 상위 문서에서 정의되지 않은 세부사항만 추가한다.
4. **Root `DESIGN.md`**는 UI 구현의 canonical contract이다.
   - Obsidian theme 변수 기반 색상 시스템
   - 모든 Explorer/Dashboard View는 이를 따른다.
5. **`SYSTEM/docs/DESIGN.md`**는 별도 역할을 한다:
   - `SYSTEM/Views/design-tokens.js`의 semantic color registry 문서
   - Root `DESIGN.md`와의 호환성 설명 제공
   - UI contract 자체를 정의하지 않음

---

## Alternatives Considered

| Alternative | Verdict | Reason |
|---|---|---|
| 모든 계층을 동등하게 취급 | Rejected | 충돌 시 해결 불가 |
| Schema를 SSoT로 설정 | Rejected | 철학적 원칙(Constitution)을 표현 불가 |
| **Constitution → Schema → Template → View 우선순위** | **Accepted** | 명확한 해결 경로, 철학→구현 순서 보존 |
| SYSTEM/docs/DESIGN.md를 삭제 | Rejected | 현재 코드베이스의 토큰 사용 패턴 문서 필요 |

---

## Consequences

### 장점
- Agent가 충돌하는 정보를 만났을 때 명확한 판단 기준 제공
- 문서 간 불일치를 발견했을 때 수정 방향 명확
- Constitution이 실제로 "최상위 원칙"으로 작동
- Root vs SYSTEM/docs DESIGN.md 혼동 해소

### 제약
- 하위 문서 수정 시 상위 문서 검토 필요
- 상위 문서 변경 시 하위 문서 동기화 필요
- DESIGN.md 이중 역할 이해 필요 (UI contract vs token registry)

---

## Examples

### Constitution이 Schema를 override하는 경우

- Constitution Article 3: "Capture는 최소 입력"
- Schema: `required: ["title", "summary", "tags", "priority"]`
- **결론:** Schema가 Constitution 위반. Schema를 수정하여 required를 줄여야 함.

### Root DESIGN.md vs SYSTEM/docs/DESIGN.md

- **Root `DESIGN.md`**: Obsidian theme 변수 기반 UI contract (Explorer, Dashboard 구현 규칙)
- **`SYSTEM/docs/DESIGN.md`**: `design-tokens.js`의 semantic color 사용법 (기존 View 코드 참조용)
- **관계**: SYSTEM/docs는 root 원칙과 호환되어야 하나, UI contract 자체를 재정의하지 않음

---

## Related Documents
- 00_Constitution.md
- 01_Architecture.md
- 03_Object_Model.md
- Region_Property_Contract_v1.md
- DESIGN.md (root)
- SYSTEM/docs/DESIGN.md
- ADR-005-documentation-first.md
- ADR-006-adr-governance-redefine.md
