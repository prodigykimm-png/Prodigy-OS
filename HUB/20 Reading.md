---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 📚 Reading

> **Reading Workspace**
> 독서 진행 상태와 도서 데이터베이스를 관리하는 공간입니다.

---

## 📖 현재 읽는 중인 책

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS/Reading"')
  .where(p => p.type === "reading" && p.status === "reading")
  .sort(p => p.due_date, 'asc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>현재 읽는 중인 책이 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    const progress = (p.current_page && p.total_page) 
      ? `${p.current_page} / ${p.total_page} (${((p.current_page/p.total_page)*100).toFixed(0)}%)` 
      : "-";
    tableData.push([p.file.link, p.author || "-", progress, p.next_action || "-", p.due_date || "-"]);
  });
  dv.table(["도서명", "저자", "진행률", "Next Action", "목표일"], tableData);
}
```

---

## 🏆 완독한 책 목록

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS/Reading"')
  .where(p => p.type === "reading" && p.status === "completed")
  .sort(p => p.updated, 'desc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>완독한 책이 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    tableData.push([p.file.link, p.author || "-", p.category || "-", p.updated || "-"]);
  });
  dv.table(["도서명", "저자", "카테고리", "완독일"], tableData);
}
```
