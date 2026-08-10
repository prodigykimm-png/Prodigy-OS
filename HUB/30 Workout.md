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
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "workout"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "workout" };
const OPTIONAL_MEASUREMENT_PATHS = new Set([
  "SYSTEM/Views/prodigy-performance-recorder.js",
  "SYSTEM/Views/prodigy-workspace-readiness.js",
  "SYSTEM/Views/prodigy-performance-exporter.js",
  "SYSTEM/Views/prodigy-workspace-measurement.js"
]);
const recordMeasurementFailure = (failure) => {
  if (!failure) return;
  const item = {
    path: failure.path,
    code: failure.code || "measurement_load_failed",
    message: failure.summary || failure.message || "measurement module unavailable"
  };
  window.__prodigyMeasurementLoadFailures = (window.__prodigyMeasurementLoadFailures || []).concat(item);
  if (window.prodigyDebugMode === true && console && console.warn) console.warn("선택적 성능 측정 모듈 미로드:", item);
};
// js-engine may expose `obsidian`; never leave Modal undefined for class extends
if (typeof obsidian !== "undefined" && obsidian) {
  window.obsidian = obsidian;
}

const BOOTSTRAP_PATH = "SYSTEM/Views/prodigy-hub-loader.js";
const ensureWorkoutHubStyles = () => {
  if (typeof document === "undefined" || !document.head) return;
  const styleId = "prodigy-workout-hub-adoption-styles";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `
    .workout-hub-shell,
    .workout-hub-shell .workout-workspace-content {
      min-inline-size: 0;
      word-break: keep-all;
      overflow-wrap: anywhere;
    }
    .workout-hub-shell *,
    .workout-hub-shell .workout-workspace-content * {
      box-sizing: border-box;
      min-inline-size: 0;
    }
    .workout-hub-shell .workout-workspace-content > * {
      min-inline-size: 0;
      max-inline-size: 100%;
    }
    .workout-hub-shell [data-scroll-owner="workout-workspace-body"] {
      scroll-padding-block-end: var(--prodigy-mobile-toolbar-clearance, 0px);
    }
    .workout-hub-shell button:focus-visible,
    .workout-hub-shell select:focus-visible,
    .workout-hub-shell input:focus-visible,
    .workout-hub-shell textarea:focus-visible {
      outline: 2px solid var(--ke-color-accent, var(--text-accent));
      outline-offset: 2px;
    }
    .workout-hub-loader-fallback {
      min-inline-size: 0;
      color: var(--ke-color-error, var(--text-error));
      font-size: var(--ke-type-body, .84rem);
      line-height: var(--ke-leading-body, 1.45);
      overflow-wrap: anywhere;
    }
    @media (max-width: 767px) {
      .workout-hub-shell .workout-workspace-content button,
      .workout-hub-shell .workout-workspace-content select,
      .workout-hub-shell .workout-workspace-content input,
      .workout-hub-shell .workout-workspace-content textarea {
        min-block-size: var(--ke-touch-target, 44px);
        height: auto;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .workout-hub-shell *,
      .workout-hub-shell [data-scroll-owner="workout-workspace-body"] {
        scroll-behavior: auto !important;
        transition: none !important;
        animation: none !important;
        transform: none !important;
      }
    }
  `;
};
ensureWorkoutHubStyles();
const MEASUREMENT_MANIFEST = {
  required: [],
  optional: Array.from(OPTIONAL_MEASUREMENT_PATHS)
};

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
  const content = await app.vault.read(file);
  const evaluate = () => (new Function(content))();
  const session = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
  if (session && typeof session.measureModule === "function") await session.measureModule(BOOTSTRAP_PATH, evaluate);
  else evaluate();
  return window.ProdigyHubLoader;
};
const loadMeasurementModules = async (loader) => {
  const result = await loader.loadManifest(app, MEASUREMENT_MANIFEST);
  (result.optional_failures || []).forEach(recordMeasurementFailure);
  return result;
};
const waitForWorkoutSettled = (mount) => new Promise((resolve) => {
  const panel = () => mount && typeof mount.querySelector === "function"
    ? mount.querySelector(".workout-health-panel")
    : null;
  const settled = () => {
    const activePanel = panel();
    if (!activePanel) return true;
    const busy = typeof activePanel.getAttribute === "function" ? activePanel.getAttribute("aria-busy") : null;
    if (busy !== "false") return null;
    if (typeof activePanel.querySelector === "function" && activePanel.querySelector(".workout-panel-loading")) return null;
    return !(typeof activePanel.querySelector === "function" && activePanel.querySelector(".workout-panel-error"));
  };
  const initial = settled();
  if (initial !== null) {
    resolve(initial);
    return;
  }
  if (typeof MutationObserver !== "function") {
    resolve(true);
    return;
  }
  const observer = new MutationObserver(() => {
    const result = settled();
    if (result === null) return;
    observer.disconnect();
    resolve(result);
  });
  observer.observe(mount, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
});

const renderWorkout = async () => {
  container.empty();
  const loader = await bootstrapLoader();
  await loadMeasurementModules(loader);
  const performance = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
  const measurable = performance && performance.available !== false;
  const dataScan = measurable && performance.start("data_scan", { scope: "workout" });
  let result;
  try {
    result = await loader.loadManifest(app, WORKOUT_MANIFEST, { recorder: measurable ? performance : undefined });
    if (result.required_failures.length) {
      const err = new Error(result.required_failures.map((f) => f.summary).join(" / "));
      err.prodigySyncPending = result.sync_pending;
      err.prodigyRetryPaths = result.required_failures.map((f) => f.path);
      throw err;
    }
    if (measurable) performance.end(dataScan, { scope: "workout", status: "loaded" });
  } catch (error) {
    if (measurable) performance.end(dataScan, { scope: "workout", status: "failed" });
    throw error;
  }

  if (!window.WorkoutView || typeof window.WorkoutView.renderDashboard !== "function") {
    throw new Error("WorkoutView.renderDashboard 가 없습니다. workout-view.js 로드를 확인하세요.");
  }

  const projection = measurable && performance.start("projection", { scope: "workout" });
  let shell;
  let workoutMount;
  try {
    shell = window.ProdigyWorkspaceNavigation.mount(container, {
      app,
      workspaceId: "workout",
      title: "운동"
    });
    if (shell.element && shell.element.classList) shell.element.classList.add("workout-hub-shell");
    workoutMount = shell.body.createDiv({ attr: { class: "workout-workspace-content" } });
    shell.body.setAttr("data-scroll-owner", "workout-workspace-body");
    if (measurable) performance.end(projection, { scope: "workout", status: "projected" });
  } catch (error) {
    if (measurable) performance.end(projection, { scope: "workout", status: "failed" });
    throw error;
  }

  if (result.optional_failures.length && window.prodigyDebugMode === true && console && console.warn) {
    console.warn("운동 선택 모듈 미로드:", result.optional_failures.map((f) => f.summary).join(" / "));
  }

  const domRender = measurable && performance.start("dom_render", { scope: "workout" });
  try {
    await window.WorkoutView.renderDashboard(app, workoutMount, {
      optionalFailures: result.optional_failures || [],
      onRetry: retryWorkout
    });
    if (measurable) {
      const settled = await waitForWorkoutSettled(workoutMount);
      performance.end(domRender, { scope: "workout", status: settled ? "rendered" : "failed" });
      if (settled && shell && typeof shell.readinessSnapshot === "function") {
        performance.markReady("workout", shell.readinessSnapshot("workout", {
          status: "deterministic",
          settled: true,
          enabledAction: { id: "workout.open", enabled: true }
        }));
      }
    }
  } catch (error) {
    if (measurable) performance.end(domRender, { scope: "workout", status: "failed" });
    throw error;
  }
};

const retryWorkout = async () => {
  const loader = window.ProdigyHubLoader;
  if (loader && typeof loader.retry === "function") {
    loader.retry(MEASUREMENT_MANIFEST.optional.concat(WORKOUT_MANIFEST.required, WORKOUT_MANIFEST.optional), { rerun_loaded: true });
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
  const card = container.createEl("section", { attr: { class: "workout-hub-loader-fallback", role: "alert" } });
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
