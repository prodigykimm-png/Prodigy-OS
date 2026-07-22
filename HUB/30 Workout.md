---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 운동

> **프로그램 실행**
> 이어하기 → 최소 입력으로 세션 기록 → 다음 Day.

<!-- 계속 스트립 · 세션 · 현재 프로그램 · 미완료 · 오래 방치 · WO 계획 · 라이브러리 · 기록 -->

```js-engine
if (!container) return;
window.app = app;
// js-engine may expose `obsidian`; never leave Modal undefined for class extends
if (typeof obsidian !== "undefined" && obsidian) {
  window.obsidian = obsidian;
}

const loadWorkoutScript = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`Workout resource not found: ${path}`);
  const code = await app.vault.read(file);
  try {
    (new Function(code))();
  } catch (err) {
    err.message = `${path}: ${err.message || err}`;
    throw err;
  }
};

const showError = (target, error) => {
  target.empty();
  const card = target.createEl("div", {
    attr: {
      style: "background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; margin: 12px 0;"
    }
  });
  card.createEl("h4", {
    text: "운동 워크스페이스를 불러오지 못했습니다",
    attr: { style: "margin:0 0 8px;color:#ef4444;" }
  });
  card.createEl("p", {
    text: String(error && error.message ? error.message : error),
    attr: { style: "font-size:0.85em;color:var(--text-normal);margin:0 0 8px;line-height:1.45;" }
  });
  const details = card.createEl("details");
  details.createEl("summary", {
    text: "상세 로그",
    attr: { style: "cursor:pointer;font-size:0.8em;font-weight:700;" }
  });
  details.createEl("pre", {
    text: (error && (error.stack || error.message)) || String(error),
    attr: {
      style: "font-size:0.72em;background:rgba(0,0,0,0.15);padding:8px;border-radius:4px;overflow-x:auto;margin-top:6px;white-space:pre-wrap;"
    }
  });
  if (window.prodigyDebugMode === true && console && console.error) console.error(error);
};

try {
  await loadWorkoutScript("SYSTEM/Views/display-registry.js");
  await loadWorkoutScript("SYSTEM/Views/workspace-navigation.js");
  await loadWorkoutScript("SYSTEM/Views/object-engine-core.js");
  await loadWorkoutScript("SYSTEM/Views/workout-core.js");
  await loadWorkoutScript("SYSTEM/Views/workout-store.js");
  await loadWorkoutScript("SYSTEM/Views/workout-import.js");
  await loadWorkoutScript("SYSTEM/Views/workout-program-objects.js");
  await loadWorkoutScript("SYSTEM/Views/workout-view.js");
  await loadWorkoutScript("SYSTEM/Views/workout-decision-packet.js");

  if (!window.WorkoutView || typeof window.WorkoutView.renderDashboard !== "function") {
    throw new Error("WorkoutView.renderDashboard 가 없습니다. workout-view.js 로드를 확인하세요.");
  }
  const navigationMount = container.createDiv({ attr: { class: "workout-workspace-navigation" } });
  const workoutMount = container.createDiv({ attr: { class: "workout-workspace-content" } });
  window.ProdigyWorkspaceNavigation.mount(navigationMount, { app, title: "운동" });
  await window.WorkoutView.renderDashboard(app, workoutMount);
} catch (error) {
  showError(container, error);
}
```
