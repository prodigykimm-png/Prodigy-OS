---
id: <% tp.file.title %>
type: auction_case
status: watching
priority:
next_action:
due_date:
review_status: pending
connections:
created: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
updated: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
# ---------- Source ----------
source:
  auction:
  naver:
  cafe:
# ---------- Recommendation ----------
recommend: false
recommend_level: 보통
recommend_note:
recommend_sources:
# ---------- Case ----------
case_number:
court:
auction_dept:
auction_date:
auction_datetime:
# ---------- Location ----------
region_sido:
region_sigungu:
region_dong:
address:
property_type:
building_year:
exclusive_area:
supply_area:
# ---------- Auction ----------
appraisal_price:
minimum_bid:
minimum_bid_rate:
bid_deposit:
recommendation: 보통
expected_bid:
actual_bid:
winning_bid:
bid_result:
# ---------- Investment ----------
rent_deposit:
monthly_rent:
loan_ratio: 0.8
interest_rate: 0.06
# ---------- Market ----------
market_sale_low:
market_sale_high:
market_sale_recent:
market_jeonse_recent:
market_monthly_recent:
market_price_basis:
# ---------- Risk ----------
risk_flags:
# ---------- Files ----------
attachments:
  appraisal_report:
  sale_statement:
  field_report:
---
# <% tp.file.title %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Object Summary

| Property | Value |
|----------|-------|
| 사건번호 | `= this.case_number` |
| 법원 | `= this.court` |
| 물건종류 | `= this.property_type` |
| 주소 | `= this.address` |
| 감정가 | `= this.appraisal_price` |
| 최저매각가 | `= this.minimum_bid` |
| 최저가율 | `= this.minimum_bid_rate` |
| 예상 입찰가 | `= this.expected_bid` |
| 입찰일 | `= this.auction_date` |
| 상태 | `= this.status` |
| next_action | `= this.next_action` |
| 추천 | `= this.recommendation` |

**AI Summary**

> AI가 이 사건을 3~5줄 정도로 요약한다.

---

<!-- COLLECTED FACTS -->
# Collected Facts

## 기본 정보
-

## 매각 정보
-

## 권리 / 임차 핵심
-

## 시세 핵심
-

## 수익성 핵심
-

## 주요 리스크
-

## 추천인 코멘트
---

<!-- USER AREA -->
# Decision

## 예상 입찰가
-

## 입찰 여부
-

## 입찰 전략
-

---

# Review

## 결과
- 결과: 
- 낙찰가: 
- 내 입찰가: 
- 차이: 

## 원인 분석
- [ ] 가격 차이 (너무 낮게 입찰)
- [ ] 경쟁 심화 (예상보다 많은 입찰자)
- [ ] 권리 분석 미흡
- [ ] 시세 분석 오류
- [ ] 기타: 

## 배운 점
- 

## 다음 전략
- [ ] 입찰가 상향 조정 (___%)
- [ ] 더 적극적인 권리 분석
- [ ] 유사 물건 추가 탐색
- [ ] 기타: 

---

# References

- 옥션원:
- 네이버부동산:
- 카페: