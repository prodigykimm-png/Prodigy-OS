---
company: Apple Inc.
location: Cupertino, California, USA
title: CEO
email: tim.cook@apple.com
phone: 1-408-555-0123
aliases:
  - Tim
tags:
  - contact/tim_cook
type: contact
---
# Personal Notes


````tabs
tab: Scheduled Meetings
```dataview
TABLE scheduled_date as "Scheduled Date", start_time as "Start Time", summary as "Summary"
from #contact/tim_cook
where contains(type,"meeting")
sort meeting_status asc, scheduled_date asc
```
````
````tabs
tab: Ongoing Tasks

```tasks
not done
tags include #contact/tim_cook
path does not include SYSTEM
sort by due date
```
````
````tabs
tab: Completed Tasks
```tasks
done
tags include #contact/tim_cook
path does not include SYSTEM
sort by due date
```
````

