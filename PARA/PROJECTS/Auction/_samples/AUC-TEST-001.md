---
id: AUC-TEST-001
type: auction_case
status: market_analysis
next_action: 네이버 시세 조사
due_date: 2026-07-10
priority: 1
review_status: pending
connections:
created: 2026-07-06T09:00
updated: 2026-07-06T09:00
source: 법원
case_number: 2025타경54321
auction_date: 2026-07-15
region_sido: 인천
region_sigungu: 미추홀구
region_dong: 주안동
address: 인천 미추홀구 주안동 테스트 오피스텔
property_type: 오피스텔
building_year: 2005
exclusive_area: 45.2
supply_area: 62.8
appraisal_price: 210000000
minimum_bid: 147000000
expected_bid: 150000000
actual_bid:
winning_bid:
bid_result:
monthly_rent: 900000
loan_ratio: 0.8
interest_rate: 0.06
failure_reason:
lesson_learned:
review_summary:
attachments:
  appraisal_report:
  sale_statement:
  field_report:
---
# AUC-TEST-001

## 🎯 Action Dashboard

> [!info]-
> **다음 Action:** `INPUT[text:next_action]`
> **예상입찰가:** `INPUT[number:expected_bid]`
> **입찰 마감:** `INPUT[date:due_date]`

```dataviewjs
const p = dv.current();
if (!p || p.type !== "auction_case") { dv.paragraph("🚫 Object 로드 실패"); return; }
const base = p.expected_bid || p.minimum_bid || 0;
const loan = base * (p.loan_ratio || 0);
const annualInterest = loan * (p.interest_rate || 0);
const annualRent = (p.monthly_rent || 0) * 12;
const covers = annualRent >= annualInterest;
const minRate = p.appraisal_price ? (p.minimum_bid / p.appraisal_price * 100).toFixed(1) : "-";
const expRate = p.appraisal_price && p.expected_bid ? (p.expected_bid / p.appraisal_price * 100).toFixed(1) : "-";
const vsRecent = p.expected_bid && p.market_sale_recent ? (p.expected_bid / p.market_sale_recent * 100).toFixed(1) : "-";
const vsLow = p.expected_bid && p.market_sale_low ? (p.expected_bid / p.market_sale_low * 100).toFixed(1) : "-";
const dDay = p.auction_date ? Math.ceil((dv.date(p.auction_date) - dv.date("today")) / (1000*60*60*24)) : null;
const dueOverdue = p.due_date ? (dv.date(p.due_date) < dv.date("today") ? "⚠️ 기한 초과" : "✅ 여유 있음") : "-";

dv.span("### 📊 수익성\n");
dv.table(["항목","금액"],[["대출금","₩"+dv.func.round(loan/10000)+"만"],["연 이자","₩"+dv.func.round(annualInterest/10000)+"만"],["연 월세","₩"+dv.func.round(annualRent/10000)+"만"],["월세 커버",covers?"✅ 커버됨":"❌ 미달"]]);
dv.span("### 📍 가격 위치\n");
dv.table(["항목","비율"],[["최저가율",minRate+"%"],["예상입찰가율",expRate+"%"],["실거래 대비",vsRecent+"%"],["호가하단 대비",vsLow+"%"]]);
dv.span("### 📅 일정\n");
dv.table(["항목","값"],[["입찰일",p.auction_date?dv.date(p.auction_date).toFormat("yyyy-MM-dd"):"-"],["D-Day",dDay!==null?(dDay>0?"D-"+dDay:dDay===0?"D-Day 🚨":"D+"+Math.abs(dDay)):"-"],["Action 기한",p.due_date?dv.date(p.due_date).toFormat("yyyy-MM-dd"):"-"],["기한 상태",dueOverdue]]);
dv.span("### ⚠️ 리스크\n");
const flags = p.risk_flags || [];
flags.length > 0 ? dv.list(flags.map(f=>"⚠️ "+f)) : dv.paragraph("리스크 플래그 없음");
dv.span("### 🔁 복기 상태\n");
dv.paragraph("복기 상태: "+(p.review_status||"-")+" | 입찰 결과: "+(p.bid_result||"-"));
```

---

> 인천 미추홀구 주안동 소재 오피스텔 경매 물건. 감정가 2.1억, 최저입찰가 1.47억. 월세 90만원 기준 수익률 검토 중.

## Decision

### 입찰 여부

- [ ] 입찰
- [ ] 보류
- [ ] 포기

### 판단 이유

- 

## Analysis

### 1. 권리분석

- 

### 2. 시세분석

- 네이버 시세 조사 필요

### 3. 수익성 분석

- 예상 낙찰가 1.5억, 대출 80% (1.2억), 이자율 6%
- 월세 90만원 → 연 1,080만원
- 연 이자 720만원 → 연 순수익 약 360만원 (ROI 약 12%)

### 4. 임장 메모

- 

## Result

### 결과

- 

### 낙찰가 / 패찰가 비교

- 

## Review

### 복기

- 

### 실패/성공 원인

- 

## Lessons Learned

- 

## References

- 
