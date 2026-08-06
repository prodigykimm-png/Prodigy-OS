# GPT Pro Architect Response 18

Decision: APPROVE
Gate reviewed: FINAL_PHASE_EXECUTION_PLAN

## 1. 최종 Phase 순서

Phase 2-0 (Source Bridge & Contract Gate)
→ Phase 2-1 (Region Detail Auction Snapshot UI)
→ Phase 2-2 (노트 없이 Investigation Surface)
→ Phase 2-3 (Outcome / Lifecycle 명확화)
→ Phase 4 (End-to-End QA & Verification)

## 2. Phase 2-1 승인 범위

RegionIntelligencePopup을 canonical read-only surface로 사용한다. 구현 위치는 `SYSTEM/Views/region-intelligence-popup-view.js`이며, 기존 탭·badge·상태·Experience 진입을 유지한 채 독립적인 `연결 경매` 섹션을 추가한다.

데이터 흐름은 `HUB/15 Region.md`의 기존 Dataview query → rows 전달 → `getRegionAuctionSnapshot(region_sido, region_sigungu, rows)` → RegionIntelligencePopup 주입이다. Popup 내부에서 Dataview를 실행하거나 새 data engine을 만들지 않는다.

UI는 상태·입찰일·최저가·주소·동을 보여주고 행 클릭 시 기존 Auction Hub scope로 이동한다. `empty`, `stale`, `ready` 상태를 명시한다. 기존 `이 지역 경매 보기` scope 이동은 fallback으로 유지한다.

## 3. Phase 2-0 k-skill Bridge Gate

UI 이전에 다음 파일과 조건을 검증한다.

- `SYSTEM/SCRIPTS/real-estate-source-collect.js`
- `SYSTEM/SCRIPTS/real-estate-source-package-core.js`
- `SYSTEM/CONFIG/k-skill-real-estate-lock.json`
- `SYSTEM/Views/auction-real-estate-research-core.js`
- `SYSTEM/Views/auction-source-approval-writer.js`

필수 조건은 direct source 기본값, proxy opt-in, raw SHA-256, package immutability, path containment, secret non-leakage, partial failure 안전성이다. provider fixture/no-network, hash mismatch, schema mismatch, stale package, empty package 테스트를 통과시킨다.

현재 패킷 기준 치명적 결함은 없고 전체 provider coverage는 EVIDENCE_GAP이다. 먼저 테스트로 확인하고 실패할 때만 수정한다.

## 4. Phase 2-2 Investigation Surface

조사 현황(최신 시각·공급자 상태·출처·hash 상태), 근거 자료(read-only), 반영 후보, 선택 승인을 분리한다.

Evidence ≠ Candidate, Candidate ≠ Approval, Approval = Writer only를 유지한다. hash/schema mismatch는 승인 불가, stale은 기존 계약에 따라 경고 또는 차단한다. 자동 반영·Object 직접 수정·자동 판단은 금지한다.

## 5. Phase 2-3 Outcome / Lifecycle

기존 lifecycle `watching → bidding → won/lost/skipped → reviewing → archived`를 유지한다. 공식 결과 tuple이 있을 때만 낙찰가를 표시하고, watching 종료가 status 변경을 의미하지 않게 한다. `postponed`, `withdrawn` enum은 추가하지 않는다.

## 6. 노트 없이 최종 흐름과 수용 기준

`Region 선택 → 연결 경매 확인 → 경매 선택 → 카드 → 부동산 조사 → 근거 확인 → 판단 → 선택 반영`

수용 기준은 노트를 열지 않고, 상태를 즉시 이해하며, 근거·지역·판단을 한 화면에서 확인하고, 사용자 승인 선택만으로 진행되며, Object가 자동 변경되지 않는 것이다.

## 7. 모바일과 실행 권한

현재 모바일은 실제 기기 검증이 없어 `Execution 기준 조건부 통과`, `Release 기준 미충족`이다. Phase 4에서 실제 모바일 1회 QA가 필요하다.

실행 순서는 k-skill contract test → snapshot adapter 연결 → RegionIntelligencePopup UI → investigation surface → lifecycle 표시 검증 → 전체 테스트 → Desktop QA → Compact QA → E2E 검증이다. GPT는 사용자가 부여한 standing authority 아래 Codex가 중간 질문 없이 전체 Phase를 즉시 실행해도 된다고 승인했다.

Protected contracts: Region Metrics/projection read-only, Region Experience ownership, Auction Writer, Dataview contract, Object schema, 자동 판단 금지.

APPROVE
