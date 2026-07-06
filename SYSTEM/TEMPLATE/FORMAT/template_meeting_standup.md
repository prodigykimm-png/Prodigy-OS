---
scheduled_date: 
start_time: 
end_time: 
summary: ""
meeting_status: false
tags:
  - meeting
  - standup
  - agile
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
# Agenda
1.  What you completed?
2.  What are you working currently?
3.  What are the roadblocks?
4.  Any topic outside of the above agenda but needs teams input (16th minute items)?
# Notes


# Next Actions

