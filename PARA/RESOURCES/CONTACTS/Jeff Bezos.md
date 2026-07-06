---
company: Amazon, Blue Origin
location: Seattle, Washington, USA
title: Founder & Executive Chairman (Amazon), Founder (Blue Origin)
email: jeff.bezos@amazon.com
phone: 1-206-555-0156
aliases:
  - Jeff
tags:
  - contact/jeff_bezos
type: contact
---
# Personal Notes


````tabs
tab: Scheduled Meetings
```dataview
TABLE scheduled_date as "Scheduled Date", start_time as "Start Time", summary as "Summary"
from #contact/jeff_bezos
where contains(type,"meeting")
sort meeting_status asc, scheduled_date asc
```
````
````tabs
tab: Ongoing Tasks

```tasks
not done
tags include #contact/jeff_bezos
path does not include SYSTEM
sort by due date
```
````
````tabs
tab: Completed Tasks
```tasks
done
tags include #contact/jeff_bezos
path does not include SYSTEM
sort by due date
```
````

