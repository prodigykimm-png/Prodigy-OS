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

## 한 줄 요약

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
