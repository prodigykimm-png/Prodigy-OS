# Architect Packet 3

## Gate

- topic: `auction-region-workspace-20260801`
- packet date: 2026-08-02 Asia/Seoul
- review gate: `PHASE_2_PLAN_FINAL`
- destination: same authenticated `Prodigy OS Making` conversation
- request: final conclusion before implementing Phase 2-0 remediation and Phase 2 scope

## User authorization

사용자는 GPT의 최종 결론을 받은 뒤 그 결론에 따라 선행조건 정리와 Phase 2 구현까지 시행하라고 명시적으로 승인했다. 이번 packet에는 저장소 요약과 테스트·계약 근거만 포함하며 secrets, 실제 Object/Daily 본문, 개인 메모, 실제 주소·사건번호는 포함하지 않는다.

## Local audit findings

### Domain/Topic

현재 값은 다음 세 경계에서 일치한다.

- runtime: `SYSTEM/Views/knowledge-explorer-registry.js`
- schema/audit reader: `SYSTEM/Prodigy/Schema/Knowledge_Explorer_Schema.md` and `SYSTEM/SCRIPTS/knowledge-explorer-audit-registry.js`
- relation projection order: `SYSTEM/Views/knowledge-explorer-relations.js`

검증 결과 domain 7개와 topic 20개가 모두 일치했다. 따라서 값 불일치로 인한 즉시 defect는 확인되지 않았다. 다만 `knowledge-direct-authoring-form.js`, `knowledge-candidate-view.js`, `display-registry.js`에 표시 라벨 표현이 반복되고, audit registry가 Schema를 별도로 파싱한다. 이것을 Phase 2 전 단일 Registry로 통합할지, 현재의 Schema/Runtime/Display 경계가 의도된 계약인지 최종 판단해 달라. Knowledge Explorer taxonomy를 전역 domain으로 확장하지 말라는 기존 계약은 유지해야 한다.

### Existing failing tests

1. `tests/auction/test_region_explorer_hub.js`: 19개 중 11 pass, 8 fail.
   - 현재 `HUB/15 Region.md`에는 작업 중인 사용자 변경으로 `codex-exec-service.js`와 `antigravity-exec-service.js`가 Region Experience lazy module list에 포함되어 있다.
   - fixture test의 `REGION_EXPERIENCE_MODULE_PATHS`가 두 모듈을 누락해 loader가 7개까지만 읽고 modal을 열지 못한다.
   - 제품 코드의 Region read-only/Experience ownership 계약을 훼손하지 않고 fixture module list를 현재 실제 module order에 맞추는 것이 최소 수정이다.

2. `tests/workspace/test_workspace_consistency.js`: `8 !== 9`.
   - `APP_SHELL_HUBS` fixture가 `HUB/30 Workout.md`를 누락했지만 assertion은 9개 canonical Hub를 요구한다.
   - `workspace-registry.js`와 실제 Hub에는 `workout`이 존재한다.
   - production workspace registry를 바꾸지 않고 fixture에 Workout Hub를 추가하는 것이 최소 수정이다.

### CTA/lifecycle audit

현재 Auction lifecycle contract는 `watching → bidding → won/lost/skipped → reviewing → archived`다. `postponed`와 `withdrawn`은 현재 status enum에 없다. 결과는 lifecycle status와 독립적인 `auction_outcome` tuple이다.

`auction-card.js`는 `부동산 조사`를 auction case에 노출하고, 상태 전이 버튼은 위 enum에 따라 제공한다. 현재 실제 계약에 없는 `postponed/withdrawn`을 새 status로 추가하지 않고, 결과 없음·정규 outcome 없음·watching 종료 카드를 별도 fixture로 확인할지 결정해 달라.

## Requested final conclusion

최종 응답은 다음을 포함하라.

- Decision and gate
- 위 두 failing test를 최소 fixture 정리로 고치는 것의 승인 여부
- Domain/Topic Registry 이슈가 실제 결함인지, 현재 경계를 유지할지
- lifecycle CTA 검증의 최소 fixture와 새 enum 추가 금지 여부
- 모바일 실사용 QA를 현재 환경에서 어떻게 충족할지. 실제 iPhone을 검증할 수 없다면 `PASS WITH LIMITATION`과 남은 증거를 명시하라.
- Phase 2-0 remediation의 정확한 파일·테스트 범위
- Phase 2 최소 구현: Region Detail의 기존 Dataview 의미 필터를 read-only auction snapshot으로 주입하고 선택 시 Auction 패널로 이동하는지, 또는 다른 방식인지
- 새 Object/schema/PRE/Memory/data engine/자동 판단/자동 추천/ranking 금지
- 최종 결론 뒤 즉시 시행 가능한 순서

응답 마지막 줄에는 단일 verdict `APPROVE` 또는 `REVISE` 또는 `BLOCK`을 써라. 제품 구현 권한은 이 사용자 승인으로 부여되어 있으며, 최종 결론 이후에는 승인된 범위의 변경과 검증을 Codex가 수행한다.
