---
connections: 
tags:
  - workstation_note
type: workstation_note
created: <% tp.file.creation_date() %>
---
**Select Connection:** `INPUT[inlineListSuggester(optionQuery(#project), optionQuery(#area), optionQuery(#workstation_note), optionQuery(#documentation_note)):connections]` 
<%tp.file.cursor()%>