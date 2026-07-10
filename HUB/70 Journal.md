---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 📅 Journal

> **Journal Workspace**
> 일일 성장 일지(Daily Notes) 및 주간/월간 회고를 확인하고 모니터링하는 작업 공간입니다.

---

## ✏️ 최근 작성된 성장 일지 (Recent Journals)

```dataviewjs
let pages = dv.pages('"DAILY"')
  .where(p => p.type === "fleeting_note" || p.file.path.startsWith("DAILY/"))
  .sort(p => p.file.cday, 'desc')
  .limit(10);

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>기록된 성장 일지가 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    tableData.push([p.file.link, p.file.cday.toISODate()]);
  });
  dv.table(["일지명", "작성일"], tableData);
}
```

---

## 📊 주간 / 월간 회고 템플릿
* **일지 작성 규칙**: 하루가 시작될 때 Home 네비게이션을 거쳐 본 워크스페이스에서 새 일지를 만들고, 밤에 복기(Review)하여 ZETA로 전이시킬 핵심 인사이트를 요약합니다.
