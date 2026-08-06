---
type: venue
venue_category:
address:
connections: []
created: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
updated: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
---

# <% tp.file.title %>

## 소개

이 장소가 무엇인지, 왜 관리하는지 한두 문장으로 적습니다.

-

## 방문 정보

영업시간, 가는 법, 주차, 이용 팁 등 방문할 때 필요한 정보를 적습니다.

-

## 메모

방문할 때마다 남는 현장 메모와 관찰을 기록합니다.

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