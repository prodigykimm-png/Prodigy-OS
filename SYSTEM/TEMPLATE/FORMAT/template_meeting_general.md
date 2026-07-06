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
# Meeting Details
Scheduled Date:  `INPUT[date(showcase):scheduled_date]`
Start Time: `INPUT[time:start_time]`  End Time:  `INPUT[time:end_time]`
Meeting Summary: `INPUT[text(limit(30)):summary]`
Meeting Status: `INPUT[toggle:meeting_status]` (`VIEW[{meeting_status} ? "Done" : "Not Done"]`)
# Attendees Tag
- 
# Topic Tag
- 
# Notes


# Next Actions

