---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
  - prodigy-object-cards
---
# Prodigy OS

> [!abstract]+ Object Dashboard v0.6
> 5초 안에 오늘 관리할 Object를 파악한다.

## ☀️ Good Morning

```dataviewjs
await dv.view("SYSTEM/Views/ObjectCards", { mode: "greeting" });
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
