---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

# 🏛 Auction Dashboard

> 현재 Object Property만 계산. 본문 미사용. Property에 저장하지 않음.

---

## 통합 대시보드

```dataviewjs
const all = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case")
  .where(p => p.status !== "archived" && p.status !== "review_completed")
  .sort(p => p.auction_date, 'asc');

if (all.length === 0) {
  dv.paragraph("진행 중인 물건이 없습니다.");
} else {
  const data = all.map(p => {
    const base = p.expected_bid || p.minimum_bid || 0;
    const lr = p.loan_ratio || 0.8;
    const ir = p.interest_rate || 0.06;
    const mr = p.monthly_rent || 0;
    const loan = base * lr;
    const annualInterest = loan * ir;
    const annualRent = mr * 12;
    const covers = mr ? (annualRent >= annualInterest ? "✅" : "❌") : "월세없음";
    const minRate = p.appraisal_price ? (p.minimum_bid / p.appraisal_price * 100).toFixed(1) + "%" : "-";
    const expRate = p.appraisal_price && p.expected_bid ? (p.expected_bid / p.appraisal_price * 100).toFixed(1) + "%" : "-";
    const dDay = p.auction_date ? Math.ceil((dv.date(p.auction_date) - dv.date("today")) / (1000*60*60*24)) : null;
    const dDayStr = dDay !== null ? (dDay > 0 ? "D-" + dDay : dDay === 0 ? "D-Day" : "D+" + Math.abs(dDay)) : "-";
    const region = [p.region_sido, p.region_sigungu, p.region_dong].filter(Boolean).join(" ");
    const propType = p.property_type || "-";
    const reviewStr = p.review_status === "done" ? "✅" : p.review_status === "pending" ? "⚠️" : "-";
    
    const profitStr = mr ? "₩" + dv.func.round(annualRent / 10000) + "만 / " + (covers) : "월세없음";
    const priceStr = minRate + " / " + expRate;
    const statusStr = p.status;
    const actionStr = p.next_action || "⚠️ 미설정";
    const scheduleStr = dDayStr + " / " + (p.auction_date ? dv.date(p.auction_date).toFormat("MM-dd") : "-");
    
    return [
      p.file.link,
      region,
      propType,
      priceStr,
      profitStr,
      statusStr,
      actionStr,
      scheduleStr,
      reviewStr
    ];
  });
  
  dv.table(["사건", "위치", "종류", "가격", "수익성", "상태", "Action", "일정", "복기"], data);
}
```

