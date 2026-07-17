---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# Workout

> **Program Runner**
> 프로그램을 선택하고, 오늘 순서를 수행하고, 실제 결과를 이어서 기록합니다.

<!-- 현재 프로그램 · 프로그램 라이브러리 · 운동 기록 -->

```js-engine
if (!container) return;
window.obsidian = obsidian;
window.app = app;

const loadWorkoutScript = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`Workout resource not found: ${path}`);
  (new Function(await app.vault.read(file)))();
};

try {
  await loadWorkoutScript("SYSTEM/Views/display-registry.js");
  await loadWorkoutScript("SYSTEM/Views/workout-core.js");
  await loadWorkoutScript("SYSTEM/Views/workout-store.js");
  await loadWorkoutScript("SYSTEM/Views/workout-import.js");
  await loadWorkoutScript("SYSTEM/Views/workout-view.js");
  await window.WorkoutView.renderDashboard(app, container);
} catch (error) {
  container.empty();
  container.createEl("p", {
    text: "Workout Workspace를 불러오지 못했습니다.",
    attr: { style: "color:var(--text-error);" }
  });
  if (window.prodigyDebugMode === true) console.error(error);
}
```
