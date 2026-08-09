# 지역 활용 심화 - 최종 PLAN 판정

Decision: APPROVE
Gate reviewed: PLAN

## 핵심 정의

Region은 시군구 단위의 읽기 전용 기준 컨텍스트로서, 동일 지역의 반복 판단과 비교를 가능하게 하는 재사용 가능한 근거 레이어다.

## Region-first

Phase 1에서는 다음 흐름을 사용한다.

`Region Explorer → 시도·시군구 선택 → RegionIntelligencePopup 상세 → “이 지역 경매 보기” → Auction Dashboard를 region_sido·region_sigungu 기준으로 필터 이동`

Region Resource의 `연결 경매` Dataview 쿼리와 `auction-region-core.js`의 동일한 의미 필터는 존재하지만, `RegionExplorerProjection`이 경매 목록을 직접 제공하지 않으므로 Explorer 내부 경매 목록은 Phase 2로 보낸다.

## Auction-first

`Auction 카드 → 상태 기반 CTA → 단일 패널`

- `근거 확인`: AuctionRealEstateResearch, AuctionDecisionPacket의 `결정 요약`, Region 읽기 전용 요약, 임장 기록
- `판단 작성`: 사용자 판단과 Region Experience 입력 진입
- `선택 반영`: 기존 AuctionSourceApprovalWriter

Auction은 판단 표면이고 Region은 컨텍스트 표면이다. 두 책임은 통합하지 않는다.

## 유지할 경계

- Region Metrics: 공식 시계열·읽기 전용
- RegionIntelligencePopup: 전체 탭·신뢰 badge·수집 상태를 가진 읽기 전용 상세
- Region Experience: Region Resource 소유의 인간 입력
- Auction Object 승인: 기존 writer만 사용
- `region_dong`: identity가 아니라 `미시 입지 확인` 경고
- 자동 추천·자동 순위·자동 입찰가·자동 Object 반영 금지

## 한국어 상태 표시

| 상태 | 라벨 | CTA |
|---|---|---|
| Region 없음 | 지역 정보 없음 | 없음 |
| stale | 자료 오래됨 | 자료 갱신 확인 |
| unverified | 검증 필요 | 검증 필요 |
| 일부 누락 | 일부 정보 누락 | 추가 확인 필요 |
| 정상 | 표시 없음 | 없음 |
| 동 확인 필요 | 미시 입지 확인 | 없음 |

## Phase 1 slices

1. `SYSTEM/Views/region-explorer-view.js`: `RegionExplorerView`에 `이 지역 경매 보기`를 추가하고 기존 Auction Dashboard 필터로 이동한다.
2. `SYSTEM/Views/auction-region-packet.js`, `SYSTEM/Views/region-intelligence-popup-core.js`: Auction 패널에 지역 축약 projection을 조합하되 읽기 전용으로 유지한다.
3. `SYSTEM/Views/region-intelligence-popup-view.js`: 상세 탭·badge·수집 상태를 유지한다.
4. `SYSTEM/Views/region-experience-modal.js`: Auction 패널에서도 기존 Region Experience 입력을 열 수 있게 한다. 기록은 Region에만 저장한다.
5. `SYSTEM/Views/region-explorer-state.js`: 최대 3개 비교와 기존 비교 row 계약을 유지한다.

## 검증

- projection read-only와 상태 badge 계산
- Region → Auction Dashboard 필터 이동
- Auction → Region 축약 projection
- Region Experience 기록이 Region에만 저장되는지 확인
- desktop에서 한 화면 판단, mobile에서 3스크롤 내 접근

## Phase 2 / non-goals

Phase 2는 Dataview snapshot 또는 별도 어댑터 계약을 검증한 뒤 Region Explorer 안에 경매 목록을 직접 표시하고 Region↔Auction 양방향 탐색·비교 UX를 강화한다.

새 Object/schema/PRE/Memory/엔진/자동 판단/자동 추천은 non-goal이다.

## 분류

- `IMPLEMENTATION_DEFECT`: Auction과 Region UI 분리, Region Experience 진입 제한
- `EVIDENCE_GAP`: Explorer에서 경매 목록을 직접 제공하는 Dataview→UI 연결 경로
- `REPORT_INTEGRITY`: DecisionPacket·Region read-only·Experience 소유권 유지
- `SCOPE_RISK`: Region을 판단 엔진으로 오해하거나 자동 추천으로 확장할 위험

## 구현 승인

조건부 승인. 위 Phase 1 범위에 한해서만 구현을 시작할 수 있으며, Region Explorer 내부 경매 목록 직접 표시는 Phase 2다.

Final Verdict: APPROVE
