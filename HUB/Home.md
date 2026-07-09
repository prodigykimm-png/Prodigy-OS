---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
  - prodigy-object-cards
---
# Prodigy OS

> [!abstract]+ Object Dashboard v0.7
> 5초 안에 오늘 관리할 Object를 파악한다.

## ☀️ Good Morning

```dataviewjs
await dv.view("SYSTEM/Views/ObjectCards", { mode: "greeting" });
```

## 📋 이번 주 경매 요약

```dataviewjs
const today = new Date();
const dayOfWeek = today.getDay();
const weekStart = new Date(today);
weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
weekStart.setHours(0, 0, 0, 0);
const weekEnd = new Date(weekStart);
weekEnd.setDate(weekStart.getDate() + 6);
weekEnd.setHours(23, 59, 59, 999);

const allPages = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case");

const thisWeek = allPages.where(p => {
  if (!p.auction_date) return false;
  const d = new Date(p.auction_date);
  if (isNaN(d.getTime())) return false;
  return d >= weekStart && d <= weekEnd;
});

const needReview = allPages.where(p =>
  (p.bid_result === "won" || p.bid_result === "lost") && p.review_status === "pending"
);

const urgent = allPages.where(p => {
  if (!p.auction_date) return false;
  const d = new Date(p.auction_date);
  if (isNaN(d.getTime())) return false;
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= 7;
});

const cards = allPages.where(p => p.recommend === true && p.status !== "archived" && p.status !== "review_completed");

dv.paragraph("> **이번 주 입찰 예정:** " + thisWeek.length + "건 · **복기 필요:** " + needReview.length + "건 · **임박 (D-7):** " + urgent.length + "건 · **추천 매물:** " + cards.length + "건");
```


## 🔥 Today

```dataviewjs
await dv.view("SYSTEM/Views/ObjectCards", { mode: "today", days: 7, limit: 10 });
```

## 📥 Capture

> [!tip]+ Create Object
> `BUTTON[prodigy_auction_case]` `BUTTON[prodigy_knowledge]` `BUTTON[prodigy_project]` `BUTTON[prodigy_journal]` `BUTTON[prodigy_quick_note]`

## ▶ Continue

```dataviewjs
await dv.view("SYSTEM/Views/ObjectCards", { mode: "continue", days: 7, limit: 10 });
```

## 📊 Needs Review

```dataview
TABLE WITHOUT ID
  type AS "Type",
  file.link AS "Object",
  status AS "Status",
  review_status AS "Review",
  dateformat(due_date, "MM-dd") AS "Due"
WHERE !contains(file.folder, "SYSTEM")
AND !contains(file.folder, "HUB")
AND (
  review_status = "pending"
  OR status = "won"
  OR status = "lost"
)
SORT due_date ASC
```

## 🔍 Navigation

> [!abstract]+ Navigation
> **[[Map of Content|Home]]** · **[[Daily Note|Daily]]** · **[[PARA/PROJECTS|Projects]]** · **[[ZETA|Knowledge]]** · **[[Omnisearch|Search]]** · **[[SYSTEM|System]]**

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
