---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 📥 Inbox

> **Temporary Capture Space**
> 임시로 캡처된 정보나 빠른 기록(Fleeting Notes)이 보관되는 공간입니다.
> 이곳에 기록된 정보는 장기 보관하지 않으며, 검토 후 정식 Object(사건, 지식, 프로젝트 등)로 변환하거나 아카이브해야 합니다.

---

## ⚡ Quick Capture

`BUTTON[prodigy_quick_note, prodigy_auction_case, prodigy_knowledge, prodigy_project, prodigy_journal]`

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

```meta-bind-button
label: Quick Note
icon: lucide-sticky-note
hidden: true
class: ""
tooltip: Create a quick disposable note
id: prodigy_quick_note
style: primary
actions:
  - type: command
    command: quickadd:choice:9a4a8c3c-5e7a-4261-bd7f-85f2891948a7
```

```meta-bind-button
label: Auction
icon: lucide-gavel
hidden: true
class: ""
tooltip: Create a new auction case
id: prodigy_auction_case
style: primary
actions:
  - type: command
    command: file-explorer:new-file
```

```meta-bind-button
label: Knowledge
icon: lucide-brain
hidden: true
class: ""
tooltip: Create a knowledge note
id: prodigy_knowledge
style: primary
actions:
  - type: command
    command: quickadd:choice:a019f4b7-7f8e-4937-8069-7a9ad8c4b10e
```

```meta-bind-button
label: Project
icon: lucide-folder-kanban
hidden: true
class: ""
tooltip: Create a new project
id: prodigy_project
style: primary
actions:
  - type: command
    command: quickadd:choice:e4613d75-73bb-4923-8c77-fd39102a8b9a
```

```meta-bind-button
label: Journal
icon: lucide-calendar
hidden: true
class: ""
tooltip: Open today's daily note
id: prodigy_journal
style: primary
actions:
  - type: command
    command: journals:journal:calendar:open-day
```
