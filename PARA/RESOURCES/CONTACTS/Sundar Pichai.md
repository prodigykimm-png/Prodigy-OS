---
company: Google, Alphabet Inc.
location: Mountain View, California, USA
title: CEO (Google & Alphabet)
email: sundar.pichai@google.com
phone: 1-650-555-0101
aliases:
  - Picha
tags:
  - contact/sundar_pichai
type: contact
---
# Personal Notes


````tabs
tab: Scheduled Meetings
```dataview
TABLE scheduled_date as "Scheduled Date", start_time as "Start Time", summary as "Summary"
from #contact/sundar_pichai
where contains(type,"meeting")
sort meeting_status asc, scheduled_date asc
```
````
````tabs
tab: Ongoing Tasks

```tasks
not done
tags include #contact/sundar_pichai
path does not include SYSTEM
sort by due date
```
````
````tabs
tab: Completed Tasks
```tasks
done
tags include #contact/sundar_pichai
path does not include SYSTEM
sort by due date
```
````

