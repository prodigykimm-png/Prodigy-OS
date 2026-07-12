---
id: <% tp.file.title %>
type: reading
status: queue
next_action: 읽기 시작
due_date:
priority:
review_status:
connections:
created: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
updated: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>

title:
author:
category:
language:
total_pages:
current_page:
started:
finished:
rating:
key_takeaway:
review_summary:
---
# <% tp.file.title %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Object Summary

| Property | Value |
|----------|-------|
| 제목 | `= this.title` |
| 저자 | `= this.author` |
| 카테고리 | `= this.category` |
| 언어 | `= this.language` |
| 진행률 | `= this.current_page` / `= this.total_pages` |
| 상태 | `= this.status` |
| 평점 | `= this.rating` |
| next_action | `= this.next_action` |

---

# Status Control

<div style="display: none;">
<style>
.block-language-meta-bind-button {
  margin: 0 !important;
  padding: 0 !important;
  height: 0 !important;
  min-height: 0 !important;
}
</style>
</div>
```meta-bind-button
id: r_queue
hidden: true
style: default
label: 📚 읽기 전
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: queue
```
```meta-bind-button
id: r_reading
hidden: true
style: default
label: 📖 읽는 중
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: reading
```
```meta-bind-button
id: r_reviewing
hidden: true
style: default
label: 📝 복기 중
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: reviewing
```
```meta-bind-button
id: r_completed
hidden: true
style: default
label: ✅ 복기 완료
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: completed
```
```meta-bind-button
id: r_archived
hidden: true
style: default
label: 📦 보관
actions:
  - type: updateMetadata
    bindTarget: status
    evaluate: false
    value: archived
```

`BUTTON[r_queue, r_reading, r_reviewing, r_completed, r_archived]`

---

<!-- HUMAN WORKING AREA -->
## Summary

> 이 책/자료의 핵심 요약을 작성한다.

## Key Takeaways

-
-
-

---

## Review

### Impression

-

### What I Learned

-

### Action Items

-