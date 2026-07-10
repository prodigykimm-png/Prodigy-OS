---
id: <% tp.file.title %>
type: auction_case
status: watching
priority:
next_action:
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
| 입찰일시 | `= this.auction_datetime` |
| 상태 | `= this.status` |
| next_action | `= this.next_action` |
| 추천 | `= this.recommendation` |

**AI Summary**

> AI가 이 사건을 3~5줄 정도로 요약한다.

---

# Status Control

```meta-bind-button
id: watching
hidden: true
style: default
label: 👀 보는 중
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: watching
```

```meta-bind-button
id: bidding
hidden: true
style: default
label: ⚖️ 입찰 예정
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: bidding
```

```meta-bind-button
id: skipped
hidden: true
style: default
label: ❌ 입찰 포기
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: skipped
```

```meta-bind-button
id: won
hidden: true
style: default
label: 🏆 낙찰
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: won
```

```meta-bind-button
id: lost
hidden: true
style: default
label: 💔 패찰
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: lost
```

```meta-bind-button
id: reviewing
hidden: true
style: default
label: 🔄 복기 중
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: reviewing
```

```meta-bind-button
id: archived
hidden: true
style: default
label: 📦 보관
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: archived
```

`BUTTON[watching, bidding, skipped, won, lost, reviewing, archived]`

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

---

## 입찰 여부
-

---

## 입찰 전략
-

---

## 판단 근거

왜 이런 입찰가를 작성했는가?

어떤 정보를 가장 중요하게 판단했는가?

자유롭게 작성한다.

---

# Review

## 결과

- (낙찰 / 패찰 / 미입찰)

---

## 당시 내 판단

왜 이런 결정을 내렸는가?

당시 어떤 정보를 가장 중요하게 생각했는가?

---

## 실제 결과

실제 낙찰가는 얼마였는가?

예상과 얼마나 차이가 났는가?

---

## 잘한 점

이번 판단에서 잘했던 점은 무엇인가?

---

## 아쉬운 점

놓친 정보나 잘못 판단한 부분은 무엇인가?

---

## 다음에는 어떻게 할 것인가?

같은 유형의 물건을 다시 본다면

무엇을 바꿀 것인가?

---

## AI에게 남기는 메모

미래의 AI가 참고하면 좋을

생각이나 경험을 자유롭게 작성한다.

---

# References

- 옥션원:
- 네이버부동산:
- 카페: