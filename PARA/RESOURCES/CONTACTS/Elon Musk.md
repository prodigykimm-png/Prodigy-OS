---
company: SpaceX, Tesla, Neuralink, The Boring Company
location: Palo Alto, California, USA
title: CEO & Chief Engineer (SpaceX), CEO & Product Architect (Tesla)
email: elon.musk@gmail.com
phone: 1-310-555-0073
aliases:
  - Elon
tags:
  - contact/elon_musk
type: contact
---
# Personal Notes
You can add any personal note to the person here

# Scheduled Meetings
```dataview
TABLE scheduled_date as "Scheduled Date", start_time as "Start Time", summary as "Summary"
from #contact/elon_musk
where contains(type,"meeting")
sort meeting_status asc, scheduled_date asc
```
# Ongoing Tasks
```tasks
not done
tags include #contact/elon_musk
path does not include SYSTEM
sort by due date
```
# Completed Tasks
```tasks
done
tags include #contact/elon_musk
path does not include SYSTEM
sort by due date
```
