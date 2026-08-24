---
cssclasses:
  - prodigy-hub-note
  - hide-properties_editing
  - hide-properties_reading
---
<!-- 계속 스트립 · 세션 · 현재 프로그램 · 미완료 · 오래 방치 · WO 계획 · 라이브러리 · 기록 -->

```js-engine
if (!container) return;
window.app = app;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "workout"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "workout" };
const loadWorkspaceBootstrap = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};
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
    .workout-hub-shell,.workout-hub-shell .workout-workspace-content{min-inline-size:0;word-break:keep-all;overflow-wrap:anywhere}
    .workout-hub-shell *,.workout-hub-shell .workout-workspace-content *{box-sizing:border-box;min-inline-size:0}
    .workout-hub-shell :is(button,a[href],input,select,textarea,[role="button"],[role="tab"]){min-inline-size:var(--ke-touch-target);min-block-size:var(--ke-touch-target);max-inline-size:100%}
    .workout-hub-shell .workout-workspace-content > *{min-inline-size:0;max-inline-size:100%}
    .workout-hub-shell [data-scroll-owner="workout-workspace-body"]{scroll-padding-block-end:var(--prodigy-mobile-toolbar-clearance,0px)}
    .workout-hub-shell button:focus-visible,.workout-hub-shell select:focus-visible,.workout-hub-shell input:focus-visible,.workout-hub-shell textarea:focus-visible{outline:var(--ke-focus-ring-width) solid var(--ke-color-accent);outline-offset:var(--ke-space-1)}
    .workout-hub-loader-fallback{min-inline-size:0;color:var(--ke-color-error);font-size:var(--ke-type-body);line-height:var(--ke-leading-body);overflow-wrap:anywhere}
    @media(prefers-reduced-motion:reduce){.workout-hub-shell *,.workout-hub-shell [data-scroll-owner="workout-workspace-body"]{scroll-behavior:auto!important;transition:none!important;animation:none!important;transform:none!important}}
  `;
};
ensureWorkoutHubStyles();
const waitForWorkoutSettled = (mount, scope, healthAvailable) => new Promise((resolve) => {
  const panel = () => mount && typeof mount.querySelector === "function"
    ? mount.querySelector(".workout-health-panel")
    : null;
  const settled = () => {
    const activePanel = panel();
    if (!activePanel) return healthAvailable ? null : true;
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
  if (scope && typeof scope.observe === "function") scope.observe(observer);
});

const renderWorkout = async (mountContext) => {
  container.empty();
  window.__prodigyWorkoutMountScope = mountContext.scope;
  mountContext.scope.track(() => { if (window.__prodigyWorkoutMountScope === mountContext.scope) delete window.__prodigyWorkoutMountScope; });
  const performance = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
  const measurable = performance && performance.available !== false;
  const dataScan = measurable && performance.start("data_scan", { scope: "workout" });
  if (measurable) performance.end(dataScan, { scope: "workout", status: "loaded" });
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
      title: "운동",
      mountScope: mountContext.scope
    });
    if (shell.element && shell.element.classList) shell.element.classList.add("workout-hub-shell");
    workoutMount = shell.body.createDiv({ attr: { class: "workout-workspace-content" } });
    shell.body.setAttr("data-scroll-owner", "workout-workspace-body");
    const workoutKnowledge = await window.WorkoutContextAdapter.mountResurfacing({
      app,
      signal: mountContext.signal,
      container: shell.body
    });
    if (workoutKnowledge && typeof workoutKnowledge.dispose === "function") mountContext.scope.track(workoutKnowledge.dispose);
    if (measurable) performance.end(projection, { scope: "workout", status: "projected" });
  } catch (error) {
    if (measurable) performance.end(projection, { scope: "workout", status: "failed" });
    throw error;
  }

  const domRender = measurable && performance.start("dom_render", { scope: "workout" });
  try {
    const optionalResult = await mountContext.optional_ready;
    if (mountContext.signal.aborted) return;
    if (optionalResult.optional_failures.length && window.prodigyDebugMode === true && console && console.warn) {
      console.warn("운동 선택 모듈 미로드:", optionalResult.optional_failures.map((failure) => failure.summary).join(" / "));
    }
    const workoutView = await window.WorkoutView.renderDashboard(app, workoutMount, {
      optionalFailures: optionalResult.optional_failures,
      optional_ready: mountContext.optional_ready,
      onRetry: mountContext.retry,
      scope: mountContext.scope,
      mountGeneration: mountContext.mountGeneration
    });
    if (workoutView) {
      window.WorkoutView.publishMountedController(workoutView, mountContext.scope);
      const disposeWorkoutView = workoutView.dispose || workoutView.cleanup || workoutView.destroy;
      if (typeof disposeWorkoutView === "function") mountContext.scope.track(disposeWorkoutView.bind(workoutView));
    }
    if (measurable) {
      const settled = await waitForWorkoutSettled(workoutMount, mountContext.scope, optionalResult.optional_failures.length === 0 && Boolean(window.WorkoutHealthShell));
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

const showWorkoutError = (error) => {
  const syncPending = Boolean(error && error.prodigySyncPending);
  const message = syncPending
    ? "필요한 파일이 이 기기에 아직 내려오지 않았습니다. iCloud 동기화가 끝난 뒤 다시 시도해 주세요."
    : "화면을 다시 열거나 Obsidian을 재시작한 뒤 다시 시도해 주세요.";
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(container, error, {
      title: "운동",
      message,
      retry: error && error.retry
    });
    return;
  }
  container.empty();
  const card = container.createEl("section", { attr: { class: "workout-hub-loader-fallback", role: "alert" } });
  card.createEl("p", { text: `운동 워크스페이스를 불러오지 못했습니다. ${message}` });
  const button = card.createEl("button", { text: "다시 시도", attr: { type: "button" } });
  button.onclick = error && error.retry;
};

try {
  if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
  if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
  const manifest = window.ProdigyWorkspaceManifest.get("workout");
  await window.ProdigyHubLoader.mountWorkspace(app, manifest, {
    container,
    renderers: { workout: renderWorkout }
  });
} catch (error) {
  const preservesRequiredRecovery = window.ProdigyHubLoader && typeof window.ProdigyHubLoader.preserveRequiredRecovery === "function" && window.ProdigyHubLoader.preserveRequiredRecovery(error, container);
  if (!preservesRequiredRecovery) showWorkoutError(error);
}
```
