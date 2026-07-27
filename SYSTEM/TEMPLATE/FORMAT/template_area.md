---
area: <% tp.file.folder() %>
area_category: 
summary: 
tags: 
type: area_family
created: <% tp.file.creation_date() %>
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
<!-- PARA · 실행 계층: 이 영역에서 승인 지식을 활용하려면 본문에 [[지식 제목]] 링크를 추가하세요. -->
# <% tp.file.folder() %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Area Summary

| Property | Value |
|----------|-------|
| Area | `= this.area` |
| Category | `= this.area_category` |
| Summary | `= this.summary` |

**Connections:** `INPUT[inlineListSuggester(optionQuery(#area)):connections]`

---

## Overview


````tabs
tab: Components
```dataview
table created AS "Created", summary AS "Summary"
from "PARA/AREAS/<% tp.file.folder() %>"
where type != "area"
where type = "area_note"
where type != "area_note_sub"
sort created DESC
```
tab: Projects
```dataview
table type AS "Type", Status AS "Status", Priority_Level AS "Priority_Level"
from "PARA/PROJECTS"
where contains(connections, this.file.link)
where type = "project_family" OR type = "project_note"
sort Status ASC
```
tab: Other
```dataview
table type AS "Type"
from "PARA/RESOURCES/DOCUMENTATIONS" OR "PARA/WORKSTATION"
where contains(connections, this.file.link)
where type = "documentation_note" OR type = "workstation_note"
sort type ASC
```
````

````tabs
tab: Scheduled Meetings
```dataview
TABLE scheduled_date as "Scheduled Date", start_time as "Start Time", summary as "Summary"
from #area/<% tp.file.folder().toLowerCase().split(" ").join("_") %>
where contains(type,"meeting")
sort meeting_status asc, scheduled_date asc
```
````
````tabs
tab: Ongoing Task
```tasks
not done
tags include #area/<% tp.file.folder().toLowerCase().split(" ").join("_") %>
path does not include SYSTEM
sort by due date
```
````
````tabs
tab: Completed Tasks
```tasks
done
tags include #area/<% tp.file.folder().toLowerCase().split(" ").join("_") %>
path does not include SYSTEM
sort by due date
```
````

<%* tp.hooks.on_all_templates_executed(async () => { 
    const file = tp.file.find_tfile(tp.file.path(true)); 
    const task_tag_value = tp.file.folder().toLowerCase().split(" ").join("_");
    await app.fileManager.processFrontMatter(file, (frontmatter) => { 
        frontmatter["tags"] = `area/${task_tag_value}`; 
    }); 
}); -%>