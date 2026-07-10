---
area: <% tp.file.folder() %>
tags: 
type: area_note_sub
created: <% tp.file.creation_date() %>
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# [[<% tp.file.folder() %>]] — <% tp.file.title %>

<!-- PROPERTY-DRIVEN SUMMARY -->
## Sub-Note Summary

| Property | Value |
|----------|-------|
| Area | `= this.area` |
| Created | `= this.created` |

---

<%* tp.hooks.on_all_templates_executed(async () => { const file = tp.file.find_tfile(tp.file.path(true)); const value1 = tp.file.folder().split(" ").map(word => word.toLowerCase()).join("_"); const value2 = tp.file.title.split(" ").map(word => word.toLowerCase()).join("_"); await app.fileManager.processFrontMatter(file, (frontmatter) => { frontmatter["tags"] = `area/${value1}/${value2}`; }); }); -%>