---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 💪 Workout

> **Workout Workspace**
> 운동 계획 및 일지를 기록하고 피드백하는 공간입니다.

---

## 🏃‍♂️ 예정된 운동 루틴

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS/Workout"')
  .where(p => p.type === "workout" && p.status !== "completed")
  .sort(p => p.due_date, 'asc');

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>예정되거나 진행 중인 운동이 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    tableData.push([p.file.link, p.workout_type || "-", `${p.duration_min || "-"}분`, p.intensity || "-", p.next_action || "-", p.due_date || "-"]);
  });
  dv.table(["일지명", "부위/종류", "시간", "강도", "세부 계획", "예정일"], tableData);
}
```

---

## 📅 최근 완료한 운동 목록

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS/Workout"')
  .where(p => p.type === "workout" && p.status === "completed")
  .sort(p => p.due_date, 'desc')
  .limit(10);

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>기록된 이전 운동 일지가 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    tableData.push([p.file.link, p.workout_type || "-", `${p.duration_min || "-"}분`, p.intensity || "-", p.due_date || "-"]);
  });
  dv.table(["일지명", "부위/종류", "시간", "강도", "완료일"], tableData);
}
```
