---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 📥 Inbox

> **미분류 기록 검토함**
> 임시로 캡처된 정보와 빠른 기록(Fleeting Notes)을 검토하는 공간입니다.
> 새 Object 생성은 **Home의 + 새 Object**를 사용하세요.
> 이곳에서는 기존 임시 기록을 검토하고, 정식 Object로 변환하거나 아카이브합니다.

---

## 📝 대기 중인 임시 기록 (Fleeting Notes)

```dataviewjs
let pages = dv.pages('"ZETA/FLEETING"')
  .where(p => p.file.name !== "FLEETING")
  .sort(p => p.file.mtime, 'desc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>대기 중인 임시 기록이 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    const timeStr = p.file.mtime ? p.file.mtime.toFormat("yyyy-MM-dd HH:mm") : "-";
    tableData.push([p.file.link, timeStr]);
  });
  dv.table(["임시 기록명", "최종 수정일시"], tableData);
}
```

---

## ⚠️ 정보 보완 필요 (Auction)

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && ["watching", "bidding", "reviewing"].includes(p.status))
  .where(p => !p.next_action || p.next_action === "정보 없음" || !p.expected_bid || p.expected_bid === "정보 없음");

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>보완이 필요한 경매 물건이 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    const missingFields = [];
    if (!p.next_action || p.next_action === "정보 없음") missingFields.push("Next Action");
    if (!p.expected_bid || p.expected_bid === "정보 없음") missingFields.push("예상입찰가");
    tableData.push([p.file.link, p.status, missingFields.join(", ")]);
  });
  dv.table(["사건번호", "현재 상태", "누락된 정보"], tableData);
}
```

---

<!-- QuickAdd UUID 버튼 제거됨 (2026-07-27): Home Creator가 유일한 Object 생성 진입점입니다. -->
