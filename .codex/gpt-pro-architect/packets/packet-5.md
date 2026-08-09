# GPT Pro Architect Packet 5

- topic: auction-region-workspace-20260801
- gate: AUCTION_CARD_DUPLICATE_REVIEW
- date: 2026-08-02 Asia/Seoul
- destination: existing ChatGPT Project `Prodigy OS Making`, exact conversation retained in `thread.md`
- transmission scope: redacted Auction card field inventory, role boundaries, and local QA evidence only

## User authority

사용자는 현재 옥션 워크스페이스 카드에 표시되는 정보의 중복 여부를 GPT와 검토하고 최종 결론을 보고받도록 요청했다. 이번 라운드는 검토 범위이며 제품 코드·Object·Daily·사용자 데이터는 변경하지 않는다. GPT는 외부 검토자이고 로컬 저장소가 정본이다. 기존 `thread.md`의 동일 주제·동일 프로젝트 대화를 재사용한다.

## Redaction and protected constraints

- 실제 사건번호, 주소, 출처 URL, 개인 메모, API 키, 환경변수, Object/Daily 본문은 포함하지 않았다.
- Auction Object schema, lifecycle status, `auction-outcome-writer`, `auction-source-approval-writer`, DecisionPacket 경계를 유지한다.
- `status`, `expected_bid`, `my_bid_price`, `decision_reason`, `my_opinion`은 자동 변경하지 않는다.
- Region Metrics와 사용자 판단 데이터는 읽기·판단 projection으로 유지하고 자동 수정하지 않는다.
- 이번 라운드에는 코드 수정·커밋·push·release를 하지 않는다.

## Current Auction card display inventory

Source: `SYSTEM/Views/auction-card.js`, `SYSTEM/Views/auction-card-price-projection.js`, `HUB/10 Auction.md`.

1. Header
   - 사건 식별자 링크(실제 값은 redacted)
   - 입찰표 버튼(입찰 상태에서만), 삭제 버튼
   - 경매일 기준 D-day 또는 `종료`
   - 선택적 외부 링크 아이콘
2. Location and identity line
   - `시도 시군구 동` 형태의 지역 표시(누락 컴포넌트는 placeholder)
   - `판단` 버튼
   - `지역 정보` 버튼
   - 물건 용도
   - 주소에서 파생한 짧은 물건명
3. Court/date line
   - 법원
   - 경매일
4. Finance line
   - 상태별 가격 pair: `최저가 → 입찰 예정가`, `최저가 → 낙찰가`, `내 입찰가 → 낙찰가`, 또는 `입찰 예정가 → 낙찰가`
   - 비종료 상태의 최저가 비율
   - 입찰 상태의 보증금
   - 출구가
   - 일부 상태에서 출구가와 가격을 이용한 차익
   - 일부 상태에서 출구가·대출·금리를 이용한 월수익
5. Outcome and judgement
   - 종료 상태의 결정 사유
   - 항상 표시되는 `나의 의견` 또는 의견 입력 placeholder
   - 존재할 때 참고사항·추천 메모
6. Actions
   - `부동산 조사`
   - watching/bidding 상태의 `결정 패킷`
   - 상태별 lifecycle CTA(입찰 예정, 포기, 낙찰, 패찰, 복기, 보관 등)
7. Optional inline Decision Packet
   - 검증 지식 링크·사유
   - 지역 분석 링크
   - 기존 결정 링크
   - KnowledgeUseRecordUI
   - 사건·주소·가격·날짜를 다시 렌더링하지 않음

## Current role boundaries and observed evidence

- `부동산 조사`는 최신 조사 패키지, 외부 provider 상태, 새로 확인된 근거, candidate diff, 실패한 provider를 보여주는 별도 modal이다. 최근 실제 Obsidian QA에서 카드의 사건·주소·날짜·가격을 다시 보여주는 `한눈에 보기`는 제거되었고, 실패 내용은 `확인 필요` 아래로 접혔다.
- `지역 정보`는 지역의 읽기 전용 지표·근거를 여는 drilldown이다.
- `판단`은 Auction 판단 packet/action이며, 지역 정보의 읽기 전용 지표와 역할이 다르다.
- `결정 패킷`은 링크·근거·이전 결정만 보여주며 기본 카드 필드를 중복 렌더링하지 않는다.
- 카드의 지역 표시와 주소 기반 물건명은 같은 문자열 반복이 아니라 지역 identity와 짧은 식별명이다.
- `최저가/입찰 예정가`, `출구가`, `차익`, `월수익`은 일부 동일 입력을 공유하지만 서로 다른 의사결정 metric이다. 다만 값이 없을 때 `-`가 반복되어 시각적 중복처럼 보일 가능성이 있다.
- D-day의 `종료`와 lifecycle status/CTA는 날짜 상태와 업무 상태라서 동일 사실인지 별도 판정이 필요하다.

## Review questions

GPT Pro에게 다음을 엄격히 검토해 달라.

1. 한 장의 Auction 카드에서 같은 사실이 두 번 이상 표시되는 **정확한 중복**과, 같은 입력을 사용하는 **파생 metric**, 단순한 **탐색/행동 역할 겹침**을 분리하라.
2. `지역 표시 ↔ 물건명`, `최저가/입찰 예정가 ↔ 보증금`, `가격 ↔ 출구가/차익/월수익`, `D-day 종료 ↔ lifecycle CTA`, `판단 ↔ 지역 정보`, `카드 ↔ 부동산 조사`, `카드 ↔ 결정 패킷`을 각각 판정하라.
3. 현재 `부동산 조사` modal이 카드 기본 정보를 반복하지 않도록 바뀐 상태와 실패 항목 접힘이 충분한지 검토하라.
4. 사용자 입장에서 “중복된다”고 느낄 가능성이 높은 항목과 실제 계약상 중복을 구분하라.
5. 코드 수정 없이도 적용 가능한 최소 UI 정리안을 우선순위로 제안하라. 기존 계약을 깨는 대규모 재설계는 제안하지 말라.
6. 스스로 한 번 반론·재검토한 뒤 최종 결론을 내려라.

## Required final format

첫 줄에 다음 중 하나를 정확히 사용하라:

`VERDICT: NO_DUPLICATE`
`VERDICT: MINOR_OVERLAP`
`VERDICT: MATERIAL_DUPLICATE`

그 다음 아래 표를 작성하라.

| 표면 A | 표면 B | 같은 사실인가? | 판정 | 최소 조치 |
|---|---|---|---|---|

마지막에는 다음을 포함하라.

- 정확한 중복 목록
- 중복은 아니지만 인지 부담을 높이는 항목
- 우선순위가 있는 최소 정리안 3개
- `FINAL_DECISION: ...` 한 줄
