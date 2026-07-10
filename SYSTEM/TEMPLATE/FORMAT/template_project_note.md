---
Priority_Level: 
Status: 
Date_Created: 
Due_Date: 
connections: 
tags:
  - project
type: project_note
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# <% tp.file.title %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Object Summary

| Property | Value |
|----------|-------|
| 상태 | `= this.Status` |
| 우선순위 | `= this.Priority_Level` |
| 마감일 | `= this.Due_Date` |
| 생성일 | `= this.Date_Created` |

**Connections:** `INPUT[inlineListSuggester(optionQuery(#area)):connections]`

---

## Description


## Notes


## Definition of Done


<%* tp.hooks.on_all_templates_executed(async () => { const file = tp.file.find_tfile(tp.file.path(true)); const folder_name = tp.file.folder().toLowerCase().replace(/ /g, "_"); await app.fileManager.processFrontMatter(file, (frontmatter) => { frontmatter["tags"] = [`#project/${folder_name}`]; }); }); -%>