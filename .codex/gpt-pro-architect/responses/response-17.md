# Phase 2 계획 최종 결론

Decision: APPROVE
Gate reviewed: PHASE_2_PLAN_FINAL

## 선행조건 정리

- `test_region_explorer_hub.js`는 현재 `HUB/15 Region.md`가 실제로 읽는 `codex-exec-service.js`, `antigravity-exec-service.js`를 fixture의 모듈 순서에 추가한다. 제품 코드와 사용자 변경은 보존한다.
- `test_workspace_consistency.js`는 실제 App Shell Hub인 `HUB/30 Workout.md`를 fixture에 추가한다. production registry는 수정하지 않는다.
- Domain/Topic 값은 runtime Registry, Schema 문서, relation projection에서 이미 일치한다. Knowledge taxonomy는 별도 전역 Registry로 만들지 않는다. `knowledge-explorer-registry.js`를 runtime 단일 source로 유지하고, audit이 Schema를 독립적인 source로 삼지 않도록 reference path를 정리한다. Schema는 문서·참조 계약으로 남긴다.
- lifecycle enum은 `watching → bidding → won/lost/skipped → reviewing → archived`를 유지한다. `postponed`, `withdrawn`은 추가하지 않는다. `auction_outcome`은 lifecycle status와 독립된 결과 tuple이다.
- 최소 lifecycle fixture는 종료되었으나 결과가 없는 `watching`, 공식 결과가 없는 사건, 공식 결과 tuple이 있는 종료 사건을 포함한다. 날짜 경과만으로 outcome이나 낙찰가를 생성하지 않는 경계를 확인한다.

## 모바일 QA와 Phase 2-0

실제 iPhone이 없으면 모바일 검증은 `PASS WITH LIMITATION`으로 기록하고 증거 공백을 남긴다. Phase 2-0은 조건부로 진행할 수 있지만, Phase 2 본 구현 전 가능한 실제 모바일 검증을 한 차례 수행한다.

Phase 2-0의 목적은 UI 확장이 아니라 데이터 연결 계약 확정이다.

- 기존 `SYSTEM/TEMPLATE/FORMAT/template_auction_region.md`의 Dataview query를 source of truth로 유지한다.
- 기존 `SYSTEM/Views/auction-region-core.js`에 `getRegionAuctionSnapshot(region_sido, region_sigungu)` 계열의 가벼운 read-only adapter를 추가한다.
- 경계는 `Dataview → JS adapter(snapshot) → UI`로 고정한다.
- Region→Auction 일관성, Dataview query integrity, empty state, stale handling을 fixture로 검증한다.
- Phase 2-0 자체에서는 Explorer에 경매 목록을 표시하지 않고, 새 data engine·Object write·schema 변경을 만들지 않는다.

## Phase 2 최소 구현

최소 구현은 `Region Detail → 기존 Dataview 의미 필터 → JS read-only snapshot → Auction Panel`이다. Region에서 선택하면 기존 Auction panel로 이동한다. Dataview query와 `region_sido + region_sigungu` 필터는 바꾸지 않는다.

Region Metrics, RegionIntelligencePopup, Region Experience ownership, Auction approval writer, DecisionPacket, Dataview query contract, Object schema는 보호한다. 실거래·공시가격·공시지가는 Region Metrics 공식 시계열이나 사용자 판단 필드를 자동 수정하지 않는다. 자동 추천·ranking·판단과 새 Object/Property는 추가하지 않는다.

## 즉시 시행 순서

1. 두 fixture failing test를 수정한다.
2. Domain/Topic audit reference path를 runtime Registry 기준으로 정리한다.
3. lifecycle edge fixture/test를 추가한다.
4. Phase 2-0 Dataview snapshot adapter와 계약 테스트를 추가한다.
5. desktop 및 fallback/snapshot consistency를 검증한다.
6. 가능한 모바일 QA를 수행하고 제한 사항을 기록한다.

Final Verdict: APPROVE
