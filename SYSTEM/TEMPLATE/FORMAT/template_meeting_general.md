---
scheduled_date: 
start_time: 
end_time: 
summary: ""
meeting_status: false
tags:
  - meeting
type: meeting
created: <% tp.file.creation_date() %>
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# <% tp.file.title %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Object Summary

| Property | Value |
|----------|-------|
| 예정일 | `= this.scheduled_date` |
| 시작 | `= this.start_time` |
| 종료 | `= this.end_time` |
| 요약 | `= this.summary` |
| 완료 | `= this.meeting_status` |

---

# Meeting Details
Scheduled Date:  `INPUT[date(showcase):scheduled_date]`
Start Time: `INPUT[time:start_time]`  End Time:  `INPUT[time:end_time]`
Meeting Summary: `INPUT[text(limit(30)):summary]`
Meeting Status: `INPUT[toggle:meeting_status]` (`VIEW[{meeting_status} ? "Done" : "Not Done"]`)

---

# Attendees Tag
- 

# Topic Tag
- 

# Notes


# Next Actions