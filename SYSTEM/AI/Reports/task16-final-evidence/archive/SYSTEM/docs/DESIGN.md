# Prodigy OS Design — 호환성 부록

**이 문서는 계약이 아닙니다.** 공식 UI 계약은 저장소 루트의 [`DESIGN.md`](../../DESIGN.md) 하나뿐이며,
토큰, 레이아웃, 접근성, 상태 표현의 유일한 권위입니다. 이 부록은 루트 계약보다 앞선 이름을
사용하는 코드의 제한된 호환 경계만 설명하고, 어떤 토큰 값도 다시 적지 않습니다.

## 호환 이름: ProdigyTokens.COLORS

`ProdigyTokens.COLORS`는 더 이상 Prodigy 고정 팔레트가 아닙니다. 기존 도메인 레지스트리가 사용하는
이름을 보존하면서 모든 값을 Obsidian 의미 역할로 연결하는 호환 객체입니다.

- **허용**: 기존 상태·우선순위·결과 레지스트리의 호환 이름 읽기
- **금지**: 공통 App Shell, Workspace chrome, 새 UI에서 `ProdigyTokens.COLORS` 사용
- **대체**: 새 코드는 루트 계약의 `--ke-color-*` 토큰 또는 `ProdigyTokens.SEMANTIC_COLORS`를 사용
- **진단 경계**: Doctor가 검사 대상으로 제시하는 문자열은 제품 UI 팔레트가 아닙니다. 사용자에게 보이는
  Workspace/HUB 표현은 루트 계약과 공유 의미 역할만 사용합니다.

토큰 이름과 의미 연결은 오직 [`SYSTEM/Views/design-tokens.js`](../Views/design-tokens.js)에 있습니다.
로드 순서는 `design-tokens.js` → `display-registry.js` → 각 View입니다.

## 자동 검증

이 경계는 `SYSTEM/AI/Skills/prodigy-review/tests/test_design_color_contract.js`가 강제합니다.
토큰 소스와 공통 chrome의 raw 색상, Obsidian 의미 변수 이외의 토큰 값, 동결된 도메인 예외의 증가,
이 부록의 토큰 값 중복은 모두 테스트 실패로 차단됩니다.
