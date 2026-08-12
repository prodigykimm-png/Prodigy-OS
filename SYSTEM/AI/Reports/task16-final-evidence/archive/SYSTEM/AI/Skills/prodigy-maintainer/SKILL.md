---
name: prodigy-maintainer
description: Prodigy OS Vault의 기능, 문서, 템플릿, Dashboard, View, Validator 또는 테스트를 수정할 때 사용한다. 공식 계약을 먼저 확인하고 작업 크기에 비례한 구현·검증을 조정하며 Property는 영어, 사용자 표시 라벨은 한글, Dashboard는 행동, Object는 지식 보존이라는 경계를 지킨다.
---

# Prodigy Maintainer

Prodigy OS 변경의 기본 조정자다. 기존 구조를 존중하고 필요한 검증만 수행한다.

## Workflow

1. `references/repo-map.md`에서 해당 도메인의 공식 문서, 구현, 테스트 위치를 찾는다.
2. Constitution → Schema → Template → Dashboard/View → Validator/Test 순으로 읽는다.
3. 문서와 구현이 충돌하면 한쪽을 임의로 정답 처리하지 말고 충돌을 보고한다.
4. 기존 패턴 안에서 가장 작은 변경을 구현한다.
5. 변경 범위에 맞는 검증만 실행한다.

## Invariants

- Property key와 enum은 영어 `snake_case`로 유지한다.
- 사용자가 보는 Property, status, type 라벨은 한국어로 표시한다.
- Dashboard는 행동을 수행하고 Object는 Evidence, Reality, Judgement, Learning, Knowledge를 보존한다.
- AI는 근거를 정리할 수 있지만 인간의 판단과 승인 역할을 대체하지 않는다.
- 안정된 PRE, Formatter, Evidence 계약을 관련 요청 없이 변경하지 않는다.
- 실제 운영 Object, Daily, 개인 Obsidian 설정을 fixture처럼 수정하지 않는다.

## Proportional Verification

- 문구나 단일 라벨: 관련 파일 검색 + 직접 테스트 1개 + 실제 표시 확인.
- 단일 View 동작: 관련 unit test + JavaScript 문법 검사 + 실제 Obsidian 흐름 확인.
- Property/status/template: `$prodigy-property-contract`를 함께 사용한다.
- Dashboard/Card/Modal/Wizard/mobile: `$prodigy-visual-qa`를 함께 사용한다.
- commit/push 요청: 구현 검증 후 `$prodigy-release`를 사용한다.
- 여러 모듈 계약 변경이 아니면 전체 테스트, 다중 에이전트, 대규모 탐색을 기본값으로 삼지 않는다.

## Completion

변경 내용, 실행한 검증, 실제 화면 확인 여부, 남은 계약 충돌만 간결하게 보고한다.
