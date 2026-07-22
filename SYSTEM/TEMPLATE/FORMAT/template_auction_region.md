---
type: auction_region
title: <% title %>
region_sido: <% region_sido %>
region_sigungu: <% region_sigungu %>
status: active
updated: <% date %>
# Contract v1.4.0 — SYSTEM/docs/Region_Property_Contract_v1.md
# FM = canonical latest. Body table = display only (adapter regenerates from FM).
# Numbers may be written only by the frozen adapter and remain unverified until human review.
# Official API/file only. No AI metrics.
metrics_as_of:
metrics_scope: sigungu
metrics_source:
source_as_of:
verification_status: unverified
housing_stock_basis: reb_public_price_apartment_units
sale_price_change_basis: reb_apt_price_index_yoy
sale_volume_3m:
housing_stock:
sale_turnover_rate:
sale_price_change_yoy:
jeonse_ratio:
move_in_12m:
move_in_24m:
move_in_36m:
move_in_48m:
move_in_60m:
land_price_trend_yoy:
land_price_trend_as_of:
land_price_trend_scope:
land_price_trend_source:
households:
household_change_yoy:
auction_bid_rate_6m:
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

# <% region_sido %> <% region_sigungu %>

> **부동산 지역 분석** Resource (시군구 only).
> 최신 수치 = **Frontmatter만** canonical. 아래 표는 표시용(한글 라벨).
> 시계열 = **지표 히스토리** JSON. 수치는 Freeze된 어댑터로만 갱신.
> 어댑터: 히스토리 → FM → 표 순으로 한 실행에 원자 갱신.

## 한 줄 요약

<!-- AI:PENDING:SUMMARY:START -->
<!-- AI:PENDING:SUMMARY:END -->
<!-- HUMAN: summary — monthly adapter must not edit -->

## 시장 지표 스냅샷

<!-- PRODIGY_REGION_METRICS_DISPLAY: regenerated from frontmatter; do not hand-edit values -->
| 지표 | 값 | 단위 | 비고 |
|------|-----|------|------|
| 매매 거래량(3개월) |  | 건 | R-ONE A_2024_00554 |
| 주택 재고(아파트·공시) |  | 호 | 15106861 |
| 매매 회전율 |  | % | 파생 vol×4/stock · 표시 ×100 |
| 매매가 변동 YoY |  | % | R-ONE A_2024_00045 원지수 |
| 전세가율 |  | % | R-ONE A_2024_00073 |
| 입주 예정 12개월 |  | 세대 | 15111714 |
| 입주 예정 24개월 |  | 세대 | 12 포함 · 기간 부족 시 비움 |
| 입주 예정 36개월 |  | 세대 | 24 포함 · 기간 부족 시 비움 |
| 입주 예정 48개월 |  | 세대 | 36 포함 · 기간 부족 시 비움 |
| 입주 예정 60개월 |  | 세대 | 48 포함 · 기간 부족 시 비움 |
| 세대수 |  | 세대 | jumin free CSV |
| 세대수 변동 YoY |  | % | jumin free CSV · 전년동월 |
| 경매 낙찰가율(6개월) |  | — | v1 비움 |

## 지표 히스토리

<!-- PRODIGY_REGION_METRICS_HISTORY -->
> [!abstract]- 원본 지표 이력
> ```json
> {
>   "schema_version": 1,
>   "region_key": "<% region_key %>",
>   "snapshots": []
> }
> ```

## 권역 분단 (같은 구 안)

<!-- AI:PENDING:ZONES:START -->
<!-- AI:PENDING:ZONES:END -->
<!-- HUMAN:LOCKED -->

| 권역 (동·역세권) | 성격 한 줄 | 주의 |
|------------------|------------|------|
|  |  |  |

## 시장·공급

<!-- AUTO:REGION_MARKET:START -->
<!-- AUTO:REGION_MARKET:END -->

## 중장기 공급 파이프라인

<!-- AI:PENDING:SUPPLY_PIPELINE:START -->
<!-- AI:PENDING:SUPPLY_PIPELINE:END -->

## 지가 기준

<!-- AUTO:REGION_LAND_PRICE:START -->
<!-- AUTO:REGION_LAND_PRICE:END -->

## 교통·생활

<!-- AI:PENDING:TRANSPORT_LIFE:START -->
<!-- AI:PENDING:TRANSPORT_LIFE:END -->
<!-- HUMAN -->

## 리스크·주의

<!-- AI:PENDING:RISKS:START -->
<!-- AI:PENDING:RISKS:END -->
<!-- HUMAN -->

## 임장 포인트

<!-- AI:PENDING:SITE_VISIT:START -->
<!-- AI:PENDING:SITE_VISIT:END -->
<!-- HUMAN:OWNED -->

## 출처·리서치

<!-- AUTO:REGION_RESEARCH_SOURCES:START -->
<!-- AUTO:REGION_RESEARCH_SOURCES:END -->

## 연결 경매

```dataview
TABLE status AS "상태", auction_datetime AS "기일", minimum_bid AS "최저가", address AS "주소", region_dong AS "동"
FROM "PARA/PROJECTS/Auction"
WHERE type = "auction_case"
WHERE region_sido = this.region_sido AND region_sigungu = this.region_sigungu
SORT auction_datetime ASC
```

## 브리핑 메모

## AI 조사 로그

<!-- AUTO:REGION_RESEARCH_LOG:START -->
<!-- AUTO:REGION_RESEARCH_LOG:END -->
