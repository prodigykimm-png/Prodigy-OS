# 지역 활용 심화 - 반론 응답

- topic: `auction-region-workspace-20260801`
- project: `Prodigy OS Making`
- gate: `PLAN`
- decision: `REVISE`

## 반론 결과

- Region을 Auction 패널에 한 번 삽입하는 것만으로는 지역 활용이 아니다.
- `RegionIntelligencePopup`의 탭·신뢰 badge·수집 상태·임장 진입은 Region 상세 표면에서 보존해야 한다.
- `AuctionRegionPacket`은 무조건 삭제하지 않고 Auction 패널용 지역 요약과 Region 상세용 전체 정보의 책임을 나눠야 한다.
- `region_dong`은 Region identity가 아니므로 `dong 불일치` 상태를 만들 수 없다. `미시 입지 확인` 경고로만 다룬다.
- Region Experience는 Auction에서 읽기만 하는 것이 아니라 기존 `RegionExperienceModal`로 기록할 수 있어야 하며, 소유권은 Region Resource에 남는다.
- 기존 Dataview 쿼리의 의미적 필터는 확인됐지만 Region Explorer UI가 경매 목록을 직접 받는 런타임 경계는 정의되지 않았다.

## 핵심 보류 사유

Region → Auction 목록 연결이 계약상 불명확한 상태로 구현하면 임시 Dataview나 암묵적 의존성이 생긴다. 최종 판정에서 기존 템플릿 쿼리와 Explorer 경계를 분리해 결정해야 한다.
