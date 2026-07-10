---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 📁 Project

> **Project Workspace**
> 진행 중인 프로젝트와 상세 액션 플랜을 트래킹하는 작업 공간입니다.

---

## ⚡ 활성 프로젝트 (Active Projects)

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS"')
  .where(p => p.type === "project_family" && p.Status !== "4 Completed" && p.Status !== "5 Blocked")
  .sort(p => p.Due_Date, 'asc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>현재 활성화된 프로젝트가 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    const cleanDue = p.Due_Date ? String(p.Due_Date).split('T')[0] : "-";
    tableData.push([p.file.link, p.Priority_Level || "-", p.Status || "-", cleanDue]);
  });
  dv.table(["프로젝트명", "우선순위", "진행 상태", "목표 완료일"], tableData);
}
```

---

## 🔒 완료 / 대기 상태 프로젝트

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS"')
  .where(p => p.type === "project_family" && (p.Status === "4 Completed" || p.Status === "5 Blocked"))
  .sort(p => p.file.mtime, 'desc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>보관된 프로젝트가 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    tableData.push([p.file.link, p.Status, p.closed || p.file.mtime.toISODate()]);
  });
  dv.table(["프로젝트명", "상태", "종료일"], tableData);
}
```
