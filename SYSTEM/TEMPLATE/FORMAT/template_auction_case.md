---
id: <% tp.file.title %>
type: auction_case
status: watching
priority: 3
next_action: 권리분석 시작
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
expected_bid:
actual_bid:
winning_bid:
bid_result:
# ---------- Investment ----------
rent_deposit:
monthly_rent:
loan_ratio: 0.8
interest_rate: 0.06
# ---------- Recommendation ----------
recommend: false
recommend_level:
recommend_note:
recommend_sources:
# ---------- Market ----------
market_sale_low:
market_sale_high:
market_sale_recent:
market_jeonse_recent:
market_monthly_recent:
  - deposit:
    rent:
    date:
    floor:
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
# 🎯 Action Dashboard

> [!info]-
> **다음 Action:** `INPUT[text:next_action]`
> **예상입찰가:** `INPUT[number:expected_bid]`
> **입찰 마감:** `INPUT[date:due_date]`

```dataviewjs
const p = dv.current();
if (!p || p.type !== "auction_case") { dv.paragraph("🚫 Object 로드 실패"); return; }

const base = p.expected_bid || p.minimum_bid || 0;
const lr = p.loan_ratio || 0.8;
const ir = p.interest_rate || 0.06;
const mr = p.monthly_rent || 0;
const loan = base * lr;
const annualInterest = loan * ir;
const annualRent = mr * 12;
const netProfit = annualRent - annualInterest;
const minRate = p.appraisal_price ? (p.minimum_bid / p.appraisal_price * 100).toFixed(1) : "-";
const expRate = p.appraisal_price && p.expected_bid ? (p.expected_bid / p.appraisal_price * 100).toFixed(1) : "-";
const dDay = p.auction_date ? Math.ceil((dv.date(p.auction_date) - dv.date("today")) / (1000*60*60*24)) : null;
const dDayStr = dDay !== null ? (dDay > 0 ? "D-" + dDay : dDay === 0 ? "D-Day 🚨" : "D+" + Math.abs(dDay)) : "-";

dv.span("#### 📊 수익성\n");
if (mr) {
  const sign = netProfit >= 0 ? "+" : "";
  dv.paragraph(`**${sign}${dv.func.round(netProfit / 10000)}만/년** — 월세 ${dv.func.round(annualRent / 10000)}만 - 이자 ${dv.func.round(annualInterest / 10000)}만`);
} else {
  dv.paragraph(`월세없음 — 이자 ${dv.func.round(annualInterest / 10000)}만 (대출 ${dv.func.round(loan / 10000)}만)`);
}

dv.span("#### 📍 가격 위치\n");
dv.paragraph(`최저가율 ${minRate}% / 예상입찰가율 ${expRate}%`);

dv.span("#### 📅 일정\n");
dv.paragraph(`입찰일 ${p.auction_date ? dv.date(p.auction_date).toFormat("yyyy-MM-dd") : "-"} | ${dDayStr}`);

dv.span("#### ⚠️ 리스크\n");
const flags = p.risk_flags || [];
flags.length > 0 ? dv.list(flags.map(f => "⚠️ " + f)) : dv.paragraph("없음");

dv.span("#### 🔁 복기 상태\n");
dv.paragraph(`복기 ${p.review_status === "done" ? "✅ 완료" : p.review_status === "pending" ? "⚠️ 미작성" : "-"} | 결과 ${p.bid_result === "won" ? "✅ 낙찰" : p.bid_result === "lost" ? "❌ 패찰" : "미정"}`);
```

---
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
-
## 실패 원인
-
## 배운 점
-
## 다음 Action
-
---
# References
- 옥션원:- 네이버부동산:- 카페:
```