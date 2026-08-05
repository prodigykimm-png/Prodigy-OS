# Prodigy OS Design — 호환성 부록

**이 문서는 계약이 아닙니다.** 공식 UI 계약은 저장소 루트의 [`DESIGN.md`](../../DESIGN.md) 하나뿐이며,
토큰, 레이아웃, 접근성, 상태 표현의 유일한 권위입니다. 이 부록은 루트 계약보다 앞선 시기의 코드가
남긴 레거시 예외 하나만 설명하고, 어떤 토큰 값도 다시 적지 않습니다.

## 레거시 예외: ProdigyTokens.COLORS

`ProdigyTokens.COLORS`는 루트 계약 도입 이전부터 존재하는 도메인 팔레트이며, 아래 경계 안에서만 허용됩니다.

- **허용**: Auction/Reading/Workout/Project/Personal/Knowledge의 **기존** 상태·우선순위·결과 표시
- **금지**: 공통 App Shell, Workspace chrome, 새로 추가되는 모든 UI
- **대체**: 공통 chrome은 루트 계약의 `--ke-color-*` 토큰과 Obsidian 테마 변수만 사용

토큰 이름과 값의 정의는 오직 [`SYSTEM/Views/design-tokens.js`](../Views/design-tokens.js)에 있습니다.
값이 필요하면 그 파일을 읽으십시오. 새 raw hex는 이 파일 밖에 추가할 수 없습니다.

로드 순서는 `design-tokens.js` → `display-registry.js` → 각 View입니다.

## 자동 검증

이 경계는 `SYSTEM/AI/Skills/prodigy-review/tests/test_design_color_contract.js`가 강제합니다.
공통 chrome의 raw color, 레거시 baseline 이탈, 이 부록의 토큰 값 중복은 모두 테스트 실패로 차단됩니다.
