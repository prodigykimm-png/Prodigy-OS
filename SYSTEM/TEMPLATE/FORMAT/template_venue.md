---
type: venue
venue_category:
address:
connections: []
created: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
updated: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
---

# <% tp.file.title %>

## 조명

-

## 동선

-

## 촬영 포인트

-

## 주의 사항

-

## 관련 지식

*원문을 복사하지 않고 실제 링크로 연결합니다.*

```dataview
TABLE file.link AS "지식"
FROM ""
WHERE (type = "knowledge" OR type = "permanent_note")
WHERE contains(this.connections, file.link) OR contains(file.outlinks, this.file.link) OR contains(connections, this.file.link)
SORT file.mtime DESC
```

## 관련 저널

*원문을 복사하지 않고 실제 링크로 연결합니다.*

```dataview
TABLE file.link AS "저널"
FROM "DAILY/DAILY"
WHERE type = "journal"
WHERE contains(this.connections, file.link) OR contains(file.outlinks, this.file.link) OR contains(connections, this.file.link)
SORT file.name DESC
```
