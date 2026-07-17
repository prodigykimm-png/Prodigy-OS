---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
```dataviewjs
window.app = app;
const source = app.vault.getAbstractFileByPath("SYSTEM/Views/workspace-list-view.js");
if (!source) throw new Error("Workspace list view not found.");
(new Function(await app.vault.read(source)))();

const items = dv.pages('"ZETA"')
  .where(p => p.type === "permanent_note" || p.type === "knowledge")
  .sort(p => p.file.mtime, "desc")
  .array()
  .map(p => ({
    title: p.file.name,
    path: p.file.path,
    meta: [p.type === "knowledge" ? "지식" : "영구 노트", p.file.mtime.toFormat("yyyy-MM-dd")],
    detail: p.summary || p.review_summary || ""
  }));

window.ProdigyListWorkspace.render({
  app,
  container: this.container,
  title: "지식",
  subtitle: "검증된 이해를 찾고 연결합니다.",
  sections: [{ title: "최근 지식", items, empty: "아직 검증된 지식이 없습니다." }]
});
```
