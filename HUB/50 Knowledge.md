---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 🧠 Knowledge

> **Knowledge Hub (ZETA)**
> 장기 가치 자산으로 수집되고 축적된 영구 지식들을 탐색하고 연결하는 공간입니다.

---

## 🏛 지식 도메인 및 영구 노트 (Permanent Notes)

```dataviewjs
let pages = dv.pages('"ZETA"')
  .where(p => p.type === "permanent_note" || p.type === "area_family" || p.type === "area_note")
  .sort(p => p.file.mtime, 'desc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>기록된 영구 지식 노트가 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    const typeLabel = p.type === "permanent_note" ? "🧠 지식 노트" : "🏷 도메인";
    tableData.push([p.file.link, typeLabel, p.file.mtime.toISODate()]);
  });
  dv.table(["노트명", "유형", "최종 갱신일"], tableData);
}
```

---

## 🔗 지식 네트워크 통계
* **ZETA 지식 자산 총량**: `$= dv.pages('"ZETA"').where(p => p.type === "permanent_note").length` 건
* **관리 영역(AREAS) 지식 허브**: `$= dv.pages('"PARA/AREAS"').length` 건
