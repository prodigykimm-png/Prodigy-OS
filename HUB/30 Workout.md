---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 운동

> **프로그램 실행**
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
  await loadWorkoutScript("SYSTEM/Views/object-engine-core.js");
  await loadWorkoutScript("SYSTEM/Views/workout-core.js");
  await loadWorkoutScript("SYSTEM/Views/workout-store.js");
  await loadWorkoutScript("SYSTEM/Views/workout-import.js");
  await loadWorkoutScript("SYSTEM/Views/workout-program-objects.js");
  await loadWorkoutScript("SYSTEM/Views/workout-view.js");

  // Continue target strip (Object Engine Runtime) — optional, non-breaking
  try {
    if (window.ObjectEngine && window.ObjectEngine.buildWorkspaceSummary) {
      let workoutSnapshot = null;
      if (window.WorkspaceLauncherCore && window.WorkspaceLauncherCore.loadWorkoutSnapshot) {
        workoutSnapshot = await window.WorkspaceLauncherCore.loadWorkoutSnapshot(app);
      } else {
        // lightweight index read
        const indexPath = "SYSTEM/AI/Memory/workout/index.json";
        const f = app.vault.getAbstractFileByPath(indexPath);
        if (f) {
          const index = JSON.parse(await app.vault.read(f));
          const runs = Array.isArray(index.runs) ? index.runs : [];
          const active = runs.find((r) => String(r.status || "") === "active");
          if (active) {
            workoutSnapshot = {
              title: active.next_day || active.title || "프로그램 실행",
              contextLabel: "오늘 운동",
              detail: active.title || "오늘 순서 수행"
            };
          }
        }
      }
      const summary = window.ObjectEngine.buildWorkspaceSummary([], "workout", { workoutSnapshot });
      const cont = summary && summary.continue_target;
      const contBox = container.createEl("div", {
        attr: {
          style: "margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);"
        }
      });
      contBox.createEl("div", {
        text: "▶ 계속",
        attr: { style: "font-weight:800;font-size:0.88em;color:var(--text-accent);margin-bottom:4px;" }
      });
      if (cont) {
        contBox.createEl("div", { text: cont.label || "오늘 운동", attr: { style: "font-weight:700;font-size:0.92em;" } });
        contBox.createEl("div", { text: cont.action || "", attr: { style: "font-size:0.84em;color:var(--text-muted);margin-top:2px;" } });
      } else {
        contBox.createEl("div", {
          text: "진행 중인 작업이 없습니다.",
          attr: { style: "font-size:0.85em;color:var(--text-muted);font-style:italic;" }
        });
      }
    }
  } catch (_contErr) { /* ignore */ }

  await window.WorkoutView.renderDashboard(app, container);
} catch (error) {
  container.empty();
  container.createEl("p", {
    text: "운동 워크스페이스를 불러오지 못했습니다.",
    attr: { style: "color:var(--text-error);" }
  });
  if (window.prodigyDebugMode === true) console.error(error);
}
```
