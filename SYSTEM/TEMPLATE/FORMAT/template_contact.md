---
company: 
location: 
title: 
email: 
phone: 0
aliases: 
tags: 
type: contact
---
# Personal Notes


````tabs
tab: Scheduled Meetings
```dataview
TABLE scheduled_date as "Scheduled Date", start_time as "Start Time", summary as "Summary"
from #contact/<% tp.file.title.split(" ").join("_").toLowerCase() %>
where contains(type,"meeting")
sort meeting_status asc, scheduled_date asc
```
````
````tabs
tab: Ongoing Tasks

```tasks
not done
tags include #contact/<% tp.file.title.split(" ").join("_").toLowerCase() %>
path does not include SYSTEM
sort by due date
```
````
````tabs
tab: Completed Tasks
```tasks
done
tags include #contact/<% tp.file.title.split(" ").join("_").toLowerCase() %>
path does not include SYSTEM
sort by due date
```
````

<%* tp.hooks.on_all_templates_executed(async () => { const file = tp.file.find_tfile(tp.file.path(true)); const formatted_title = tp.file.title.split(" ").map(word => word.toLowerCase()).join("_"); await app.fileManager.processFrontMatter(file, (frontmatter) => { frontmatter["tags"] = `contact/${formatted_title}`; }); }); -%>