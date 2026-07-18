---
type: auction_region
title: <% title %>
region_sido: <% region_sido %>
region_sigungu: <% region_sigungu %>
region_dong: <% region_dong %>
status: active
updated: <% date %>
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

# <% region_sido %> <% region_sigungu %>

> 경매 지역 지식 노트입니다.
> `region_sido` / `region_sigungu` 로 경매 Object와 연결됩니다.
> AI 딥리서치·브리핑 초안은 **pending** 으로 두고, 사람 승인 후 본문에 남깁니다.
> 시장 지표 표는 출처·기준일이 있을 때만 채운다. 모르면 칸을 비우거나 `미확인`.

## 한 줄 요약

## 시장 지표 스냅샷

<!-- 서술 초안과 분리. 월 1회 정도 갱신. 순위는 지어내지 말 것. -->

- 기준일:
- 비교 범위: (예: 부산 16개 구·군 / 해당 시도 시군구)
- 갱신 메모:

| 지표 | 값 | 순위 | 전월·전년 | 출처 |
|------|-----|------|-----------|------|
| 아파트 매매 거래량 (최근 3개월) |  |  |  |  |
| 매매가 변동 (YoY 또는 MoM) |  |  |  |  |
| 전세가율 |  |  |  |  |
| 전세 거래량 (최근 3개월) |  |  |  |  |
| 입주 예정 (향후 12개월) |  | — |  |  |
| 경매 낙찰가율 (아파트, 최근 6개월) |  |  |  |  |
| 인구 / 순이동 |  |  |  |  |

### 권역 분단 (같은 구 안)

| 권역 (동·역세권) | 성격 한 줄 | 경매 시 주의 |
|------------------|------------|--------------|
|  |  |  |
|  |  |  |
|  |  |  |

## 시장·공급

## 교통·생활

## 리스크·주의

## 임장 포인트

## 출처·리서치

<!-- 날짜 · 출처 URL/자료 · 핵심 한 줄 -->

## 연결 경매

```dataview
TABLE status AS "상태", auction_datetime AS "기일", minimum_bid AS "최저가", address AS "주소"
FROM "PARA/PROJECTS/Auction"
WHERE type = "auction_case"
WHERE region_sido = this.region_sido AND region_sigungu = this.region_sigungu
SORT auction_datetime ASC
```

## 브리핑 메모

<!-- 이 지역 물건 AI 브리핑에 자주 쓸 문장 -->
