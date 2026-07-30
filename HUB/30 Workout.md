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

const BOOTSTRAP_PATH = "SYSTEM/Views/prodigy-hub-loader.js";

const WORKOUT_MANIFEST = {
  required: [
    "SYSTEM/Views/design-tokens.js",
    "SYSTEM/Views/workspace-registry.js",
    "SYSTEM/Views/prodigy-workspace-state-store.js",
    "SYSTEM/Views/prodigy-app-shell.js",
    "SYSTEM/Views/workspace-navigation.js",
    "SYSTEM/Views/display-registry.js",
    "SYSTEM/Views/object-engine-core.js",
    "SYSTEM/Views/workout-core.js",
    "SYSTEM/Views/workout-exercise-library.js",
    "SYSTEM/Views/workout-analysis.js",
    "SYSTEM/Views/workout-store.js",
    "SYSTEM/Views/workout-import.js",
    "SYSTEM/Views/workout-program-objects.js",
    "SYSTEM/Views/workout-modals.js",
    "SYSTEM/Views/workout-session-flow.js",
    "SYSTEM/Views/workout-session-ui.js",
    "SYSTEM/Views/workout-view.js",
    "SYSTEM/Views/decision-packet-reasons.js",
    "SYSTEM/Views/workout-decision-packet.js",
    "SYSTEM/Views/knowledge-use-body-core.js",
    "SYSTEM/Views/knowledge-use-body-store.js",
    "SYSTEM/Views/knowledge-use-record-ui.js"
  ],
  optional: [
    "SYSTEM/Views/prodigy-adaptive-controls.js",
    "SYSTEM/Views/workout-health-responsive.js",
    "SYSTEM/Views/workout-health-store.js",
    "SYSTEM/Views/workout-nutrition-core.js",
    "SYSTEM/Views/workout-running-core.js",
    "SYSTEM/Views/workout-running-projection.js",
    "SYSTEM/Views/workout-fit-parser.js",
    "SYSTEM/Views/workout-health-shell.js",
    "SYSTEM/Views/workout-nutrition-view.js",
    "SYSTEM/Views/workout-running-view.js"
  ]
};

const bootstrapLoader = async () => {
  if (window.ProdigyHubLoader) return window.ProdigyHubLoader;
  const file = app.vault.getAbstractFileByPath(BOOTSTRAP_PATH);
  if (!file) {
    const err = new Error(`${BOOTSTRAP_PATH} 를 찾을 수 없습니다 — 동기화가 끝나지 않았을 수 있습니다.`);
    err.prodigySyncPending = true;
    throw err;
  }
  (new Function(await app.vault.read(file)))();
  return window.ProdigyHubLoader;
};

const renderWorkout = async () => {
  container.empty();
  await bootstrapLoader();
  const result = await window.ProdigyHubLoader.loadManifest(app, WORKOUT_MANIFEST);

  if (result.required_failures.length) {
    const err = new Error(result.required_failures.map((f) => f.summary).join(" / "));
    err.prodigySyncPending = result.sync_pending;
    err.prodigyRetryPaths = result.required_failures.map((f) => f.path);
    throw err;
  }
  if (!window.WorkoutView || typeof window.WorkoutView.renderDashboard !== "function") {
    throw new Error("WorkoutView.renderDashboard 가 없습니다. workout-view.js 로드를 확인하세요.");
  }

  const shell = window.ProdigyWorkspaceNavigation.mount(container, {
    app,
    workspaceId: "workout",
    title: "운동"
  });
  const workoutMount = shell.body.createDiv({ attr: { class: "workout-workspace-content" } });
  if (result.optional_failures.length && window.prodigyDebugMode === true && console && console.warn) {
    console.warn("운동 선택 모듈 미로드:", result.optional_failures.map((f) => f.summary).join(" / "));
  }
  await window.WorkoutView.renderDashboard(app, workoutMount);
};

const retryWorkout = async () => {
  const loader = window.ProdigyHubLoader;
  if (loader && typeof loader.retry === "function") {
    loader.retry(WORKOUT_MANIFEST.required.concat(WORKOUT_MANIFEST.optional));
  }
  try {
    await renderWorkout();
  } catch (error) {
    showWorkoutError(error);
  }
};

const showWorkoutError = (error) => {
  const syncPending = Boolean(error && error.prodigySyncPending);
  const message = syncPending
    ? "필요한 파일이 이 기기에 아직 내려오지 않았습니다. iCloud 동기화가 끝난 뒤 다시 시도해 주세요."
    : "화면을 다시 열거나 Obsidian을 재시작한 뒤 다시 시도해 주세요.";
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(container, error, {
      title: "운동",
      message,
      retry: retryWorkout
    });
    return;
  }
  container.empty();
  const card = container.createEl("section", { attr: { role: "alert" } });
  card.createEl("p", { text: `운동 워크스페이스를 불러오지 못했습니다. ${message}` });
  const button = card.createEl("button", { text: "다시 시도", attr: { type: "button" } });
  button.onclick = retryWorkout;
};

try {
  await renderWorkout();
} catch (error) {
  showWorkoutError(error);
}
```
