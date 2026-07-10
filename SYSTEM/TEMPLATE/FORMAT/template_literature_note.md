---
connections: 
reference: 
tags:
  - literature_note
type: literature_note
created: <% tp.file.creation_date() %>
---
# <% tp.file.title %>

**Connections:** `INPUT[inlineListSuggester(optionQuery(#permanent_note), optionQuery(#literature_note), optionQuery(#fleeting_note)):connections]` 
**Reference:** `INPUT[text(limit(200)):reference]`

---

<%tp.file.cursor()%>