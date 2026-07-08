---
cssclasses:
  - hide-properties_reading
card_status: 전체
card_region: 전체지역
card_type: 전체종류
agg_status: 전체
agg_region: 전체지역
agg_type: 전체종류
---

# 🏛 Auction Dashboard

> Object Property만 계산. 본문 미사용. Property에 저장하지 않음.

---

## 필터

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

const cache = app.metadataCache.getFileCache(file);
const fm = cache?.frontmatter ?? {};

const setFilter = async (field, value) => {
  await app.fileManager.processFrontMatter(file, (fm) => { fm[field] = value; });
};

const makeSelect = (label, field, options, current) => {
  const row = container.createEl('div', { attr: { style: 'display:inline-flex;align-items:center;margin-right:12px;' } });
  row.createEl('span', { text: label + ' ', attr: { style: 'font-weight:bold;font-size:0.85em;margin-right:4px;' } });
  const sel = row.createEl('select', { attr: { style: 'font-size:0.85em;padding:2px 6px;border-radius:4px;background:#2a2a2a;color:#ccc;border:1px solid #555;' } });
  options.forEach(o => {
    const opt = sel.createEl('option', { text: o, value: o });
    if (o === (current || options[0])) opt.selected = true;
  });
  sel.onchange = () => setFilter(field, sel.value);
  return sel;
};

makeSelect('카드 상태', 'card_status', ['전체', '진행중', '낙찰', '패찰'], fm.card_status);
makeSelect('카드 지역', 'card_region', ['전체지역', '서울', '경기', '인천', '부산'], fm.card_region);
makeSelect('카드 종류', 'card_type', ['전체종류', '오피스텔', '아파트', '상가', '지식산업센터'], fm.card_type);

container.createEl('br');

makeSelect('집계 상태', 'agg_status', ['전체', '진행중', '낙찰', '패찰'], fm.agg_status);
makeSelect('집계 지역', 'agg_region', ['전체지역', '서울', '경기', '인천', '부산'], fm.agg_region);
makeSelect('집계 종류', 'agg_type', ['전체종류', '오피스텔', '아파트', '상가', '지식산업센터'], fm.agg_type);
```

---

## 진행중인 물건

```dataviewjs
const thisFile = dv.pages('"PARA/PROJECTS/Auction/_Auction_Dashboard.md"')[0] || dv.current();
let filterStatus = thisFile.card_status || "전체";
let filterRegion = thisFile.card_region || "전체지역";
let filterType = thisFile.card_type || "전체종류";

let allPages = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case");
let pages = allPages;
if (filterStatus === "진행중") {
  pages = allPages.where(p => p.status !== "archived" && p.status !== "review_completed");
} else if (filterStatus === "낙찰") {
  pages = allPages.where(p => p.status === "won");
} else if (filterStatus === "패찰") {
  pages = allPages.where(p => p.status === "lost");
}
if (filterRegion !== "전체지역") {
  pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
}
if (filterType !== "전체종류") {
  pages = pages.where(p => (p.property_type || "").includes(filterType));
}
pages = pages.sort(p => p.auction_date, 'asc');

if (pages.length === 0) {
  dv.paragraph("조건에 맞는 물건이 없습니다.");
} else {
  dv.span(`**총 ${pages.length}건**\n\n`);
  for (let p of pages) {
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
    const statusKor = { watching: "관심", rights_analysis: "권리분석", market_analysis: "시세분석", profitability: "수익성", site_visit: "임장", ready_to_bid: "입찰준비", bid_submitted: "입찰완료", won: "낙찰", lost: "패찰", review_completed: "복기완료", archived: "보관" }[p.status] || p.status;
    const isUrgent = dDay !== null && dDay <= 7 && dDay >= 0;
    const badge = p.status === "won" ? "🏆 " : p.status === "lost" ? "💔 " : isUrgent ? "🚨 " : "";

    let profitLine = "";
    if (mr) {
      const sign = netProfit >= 0 ? "+" : "";
      const color = netProfit >= 0 ? "color:#22c55e" : "color:#ef4444";
      profitLine = `<span style="font-size:1.2em;font-weight:bold;${color}">${sign}${dv.func.round(netProfit / 10000)}만/년</span><br><span style="font-size:0.85em;color:#888">월세 ${dv.func.round(annualRent / 10000)}만 - 이자 ${dv.func.round(annualInterest / 10000)}만</span>`;
    } else {
      profitLine = `<span style="color:#888">월세없음</span>`;
      if (annualInterest > 0) profitLine += `<br><span style="font-size:0.85em;color:#888">이자 ${dv.func.round(annualInterest / 10000)}만</span>`;
    }

    const dDayBadge = isUrgent
      ? `<span style="background:#ef4444;color:white;padding:1px 6px;border-radius:4px;font-size:0.8em;font-weight:bold;">${dDayStr}</span>`
      : `<span style="color:#888;font-size:0.85em;">${dDayStr}</span>`;

    const linkStr = p.case_number ? `[[${p.file.name}|${p.case_number}]]` : `[[${p.file.name}]]`;

    dv.paragraph(`<div style="border:1px solid #444;border-radius:8px;padding:10px 14px;margin-bottom:10px;">
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
</div>`);
  }
}
```

---

## 전체 집계

```dataviewjs
const thisFile = dv.pages('"PARA/PROJECTS/Auction/_Auction_Dashboard.md"')[0] || dv.current();
let filterStatus = thisFile.agg_status || "전체";
let filterRegion = thisFile.agg_region || "전체지역";
let filterType = thisFile.agg_type || "전체종류";

let allPages = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case");
let pages = allPages;
if (filterStatus === "진행중") { pages = allPages.where(p => p.status !== "archived" && p.status !== "review_completed"); }
else if (filterStatus === "낙찰") { pages = allPages.where(p => p.status === "won"); }
else if (filterStatus === "패찰") { pages = allPages.where(p => p.status === "lost"); }
if (filterRegion !== "전체지역") { pages = pages.where(p => (p.region_sido || "").includes(filterRegion)); }
if (filterType !== "전체종류") { pages = pages.where(p => (p.property_type || "").includes(filterType)); }
pages = pages.sort(p => p.auction_date, 'asc');

const total = pages.length;
let minRateSum = 0, minRateCount = 0, expRateSum = 0, expRateCount = 0, profitSum = 0, profitCount = 0, wonCount = 0, lostCount = 0, gapSum = 0, gapCount = 0;

for (let p of pages) {
  if (p.appraisal_price && p.minimum_bid) { minRateSum += p.minimum_bid / p.appraisal_price; minRateCount++; }
  if (p.appraisal_price && p.expected_bid) { expRateSum += p.expected_bid / p.appraisal_price; expRateCount++; }
  if (p.monthly_rent && (p.expected_bid || p.minimum_bid)) { const base = p.expected_bid || p.minimum_bid || 0; profitSum += p.monthly_rent * 12 - base * (p.loan_ratio || 0.8) * (p.interest_rate || 0.06); profitCount++; }
  if (p.status === "won") wonCount++;
  if (p.status === "lost") lostCount++;
  if (p.actual_bid && p.winning_bid && (p.status === "lost" || p.status === "won")) { gapSum += Math.abs(p.actual_bid - p.winning_bid); gapCount++; }
}

dv.paragraph(`총 ${total}건`);
dv.table(["항목", "값"], [
  ["평균 최저가율", minRateCount > 0 ? (minRateSum / minRateCount * 100).toFixed(1) + "%" : "-"],
  ["평균 예상입찰가율", expRateCount > 0 ? (expRateSum / expRateCount * 100).toFixed(1) + "%" : "-"],
  ["평균 수익성", profitCount > 0 ? (profitSum / profitCount / 10000).toFixed(0) + "만/년" : "-"],
  ["낙찰 성공률", (wonCount + lostCount) > 0 ? (wonCount / (wonCount + lostCount) * 100).toFixed(0) + "%" + ` (${wonCount}승 ${lostCount}패)` : "-"],
  ["평균 패찰 차이", gapCount > 0 ? (gapSum / gapCount / 10000).toFixed(0) + "만원" : "-"]
]);

if (total > 0) {
  dv.span("**목록**\n");
  dv.table(["사건", "위치", "종류", "최저가율", "예상입찰가율", "수익성", "결과"],
    pages.map(p => {
      const base = p.expected_bid || p.minimum_bid || 0;
      const netProfit = (p.monthly_rent || 0) * 12 - base * (p.loan_ratio || 0.8) * (p.interest_rate || 0.06);
      const minRate = p.appraisal_price ? (p.minimum_bid / p.appraisal_price * 100).toFixed(1) + "%" : "-";
      const expRate = p.appraisal_price && p.expected_bid ? (p.expected_bid / p.appraisal_price * 100).toFixed(1) + "%" : "-";
      const profitStr = p.monthly_rent ? (netProfit >= 0 ? "+" : "") + dv.func.round(netProfit / 10000) + "만/년" : "월세없음";
      const region = [p.region_sido, p.region_sigungu, p.region_dong].filter(Boolean).join(" ");
      return [p.file.link, region, p.property_type || "-", minRate, expRate, profitStr, p.status === "won" ? "✅ 낙찰" : p.status === "lost" ? "❌ 패찰" : "진행중"];
    })
  );
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