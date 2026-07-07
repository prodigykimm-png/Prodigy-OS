---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

# 🏛 Auction Dashboard

> Object Property만 계산. 본문 미사용. Property에 저장하지 않음.

---

## 진행 물건

```dataviewjs
const all = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case")
  .where(p => p.status !== "archived" && p.status !== "review_completed")
  .sort(p => p.auction_date, 'asc');

if (all.length === 0) {
  dv.paragraph("진행 중인 물건이 없습니다.");
} else {
  for (let p of all) {
    const base = p.expected_bid || p.minimum_bid || 0;
    const lr = p.loan_ratio || 0.8;
    const ir = p.interest_rate || 0.06;
    const mr = p.monthly_rent || 0;
    const loan = base * lr;
    const annualInterest = loan * ir;
    const annualRent = mr * 12;
    const netProfit = annualRent - annualInterest;
    const region = [p.region_sido, p.region_sigungu, p.region_dong].filter(Boolean).join(" ");
    const propType = p.property_type || "-";
    const dDay = p.auction_date ? Math.ceil((dv.date(p.auction_date) - dv.date("today")) / (1000*60*60*24)) : null;
    const dDayStr = dDay !== null ? (dDay > 0 ? "D-" + dDay : dDay === 0 ? "D-Day" : "D+" + Math.abs(dDay)) : "-";
    const minRate = p.appraisal_price ? (p.minimum_bid / p.appraisal_price * 100).toFixed(1) + "%" : "-";
    const expRate = p.appraisal_price && p.expected_bid ? (p.expected_bid / p.appraisal_price * 100).toFixed(1) + "%" : "-";
    const action = p.next_action || "⚠️ 설정 필요";
    const statusKor = {
      watching: "관심", rights_analysis: "권리분석", market_analysis: "시세분석",
      profitability: "수익성", site_visit: "임장", ready_to_bid: "입찰준비",
      bid_submitted: "입찰완료", won: "낙찰", lost: "패찰",
      review_completed: "복기완료", archived: "보관"
    }[p.status] || p.status;
    const isUrgent = dDay !== null && dDay <= 7 && dDay >= 0;
    const isWon = p.status === "won";
    const isLost = p.status === "lost";
    let badge = "";
    if (isWon) badge = "🏆 ";
    else if (isLost) badge = "💔 ";
    else if (isUrgent) badge = "🚨 ";

    // 수익성 문자열
    let profitLine = "";
    if (mr) {
      const sign = netProfit >= 0 ? "+" : "";
      const color = netProfit >= 0 ? "color: #22c55e" : "color: #ef4444";
      profitLine = `<span style="font-size: 1.2em; font-weight: bold; ${color}">${sign}${dv.func.round(netProfit / 10000)}만/년</span>`;
      profitLine += `<br><span style="font-size: 0.85em; color: #888">월세 ${dv.func.round(annualRent / 10000)}만 - 이자 ${dv.func.round(annualInterest / 10000)}만</span>`;
    } else {
      profitLine = `<span style="color: #888">월세없음</span>`;
      if (annualInterest > 0) {
        profitLine += `<br><span style="font-size: 0.85em; color: #888">이자 ${dv.func.round(annualInterest / 10000)}만</span>`;
      }
    }

    // D-Day 배지
    let dDayBadge = "";
    if (isUrgent) {
      dDayBadge = `<span style="background: #ef4444; color: white; padding: 1px 6px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">${dDayStr}</span>`;
    } else if (dDay !== null) {
      dDayBadge = `<span style="color: #888; font-size: 0.85em;">${dDayStr}</span>`;
    } else {
      dDayBadge = `<span style="color: #888; font-size: 0.85em;">-</span>`;
    }

const linkStr = p.case_number ? `[[${p.file.name}|${p.case_number}]]` : `[[${p.file.name}]]`;

dv.paragraph(`
<div style="border:1px solid #444;border-radius:8px;padding:10px 14px;margin-bottom:10px;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <span style="font-weight:bold;font-size:1em;">${badge}${linkStr}</span>
    <span style="color:#888;font-size:0.9em;">${region}</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
    <span style="color:#aaa;font-size:0.85em;">${propType} · ${statusKor}</span>
    ${dDayBadge}
  </div>
  <div style="margin-top:8px;">
    ${profitLine}
  </div>
  <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;font-size:0.85em;">
    <span style="color:#888;">가격: ${minRate} / ${expRate}</span>
    <span style="color:#aaa;">→ ${action}</span>
  </div>
</div>
`);
  }
}
```

---

## 복기 필요한 물건

```dataviewjs
const review = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case")
  .where(p => (p.bid_result === "won" || p.bid_result === "lost") && p.review_status === "pending")
  .sort(p => p.auction_date, 'desc');

if (review.length === 0) {
  dv.paragraph("복기할 물건이 없습니다.");
} else {
  dv.table(["사건", "결과", "Action", "낙찰가"], review.map(p => [
    p.file.link,
    p.bid_result === "won" ? "✅ 낙찰" : "❌ 패찰",
    p.next_action || "-",
    p.actual_bid ? "₩" + dv.func.round(p.actual_bid / 10000) + "만" : "-"
  ]));
}
```