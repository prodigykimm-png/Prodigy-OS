---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 👤 Personal

> **Personal Workspace**
> 일상 생활 관리, 할 일 목록, 그리고 개인 리마인더를 트래킹하는 라이프스타일 작업 공간입니다.

---

## 📅 오늘 예정된 개인 리마인더

```dataviewjs
let pages = dv.pages('"DAILY"')
  .where(p => p.type === "fleeting_note" && p.file.cday.toISODate() === new Date().toISOString().split('T')[0]);

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>오늘 생성된 임시 할 일 카드가 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    tableData.push([p.file.link, p.next_action || "세부 내용 없음", p.due_date || "-"]);
  });
  dv.table(["오늘 일지", "할 일/계획", "마감 목표일"], tableData);
}
```

---

## 🏃‍♂️ 지속적 관심 영역 (AREAS) 목록

```dataviewjs
let pages = dv.pages('"PARA/AREAS"')
  .where(p => p.type === "area_family" || p.type === "area_note")
  .sort(p => p.file.mtime, 'desc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>추적 중인 개인 관리 영역이 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    tableData.push([p.file.link, p.connections ? p.connections.join(", ") : "-", p.file.mtime.toISODate()]);
  });
  dv.table(["관리 영역", "연결 프로젝트", "갱신일시"], tableData);
}
```
