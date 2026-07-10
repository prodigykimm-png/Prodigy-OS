---
area: <% tp.file.folder() %>
summary: 
tags: 
type: area_note
created: <% tp.file.creation_date() %>
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# [[<% tp.file.folder() %>]] — <% tp.file.title %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Note Summary

| Property | Value |
|----------|-------|
| Area | `= this.area` |
| Summary | `= this.summary` |
| Created | `= this.created` |

---

## Overview


<%* tp.hooks.on_all_templates_executed(async () => { const file = tp.file.find_tfile(tp.file.path(true)); const value1 = tp.file.folder().split(" ").map(word => word.toLowerCase()).join("_"); const value2 = tp.file.title.split(" ").map(word => word.toLowerCase()).join("_"); await app.fileManager.processFrontMatter(file, (frontmatter) => { frontmatter["tags"] = `area/${value1}/${value2}`; }); }); -%>