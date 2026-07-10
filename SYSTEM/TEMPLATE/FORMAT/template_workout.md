---
id: <% tp.file.title %>
type: workout
status: planned
next_action: 운동 실행
due_date:
priority:
review_status:
connections:
created: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
updated: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>

exercise:
date:
duration:
intensity:
sets:
reps:
weight:
distance:
calories:
mood:
notes:
review_summary:
---
# <% tp.file.title %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Object Summary

| Property | Value |
|----------|-------|
| 운동 | `= this.exercise` |
| 날짜 | `= this.date` |
| 시간 | `= this.duration` |
| 강도 | `= this.intensity` |
| 세트 | `= this.sets` |
| 상태 | `= this.status` |
| next_action | `= this.next_action` |

---

<!-- HUMAN WORKING AREA -->
## Record

### Exercise

-

### Sets & Reps

| Set | Weight | Reps | Notes |
|-----|--------|------|-------|
| 1   |        |      |       |
| 2   |        |      |       |
| 3   |        |      |       |

---

## Review

### How did it go?

-

### What to improve next time?

-