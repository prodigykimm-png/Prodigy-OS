---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

```dataviewjs
window.obsidian = obsidian;
window.app = app;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "home"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "home" };
const OPTIONAL_MEASUREMENT_PATHS = new Set([
  "SYSTEM/Views/prodigy-performance-recorder.js",
  "SYSTEM/Views/prodigy-workspace-readiness.js",
  "SYSTEM/Views/prodigy-performance-exporter.js",
  "SYSTEM/Views/prodigy-workspace-measurement.js"
]);
const recordMeasurementFailure = (path, error) => {
  const failure = {
    path,
    code: error && error.code ? String(error.code) : "measurement_load_failed",
    message: error && error.message ? String(error.message).slice(0, 240) : "measurement module unavailable"
  };
  window.__prodigyMeasurementLoadFailures = (window.__prodigyMeasurementLoadFailures || []).concat(failure);
  if (window.prodigyDebugMode === true && console && console.warn) console.warn("선택적 성능 측정 모듈 미로드:", failure);
};
const loadProdigyScript = async (path, options = {}) => {
  const optional = options.optional === true || OPTIONAL_MEASUREMENT_PATHS.has(path);
  try {
    const tFile = app.vault.getAbstractFileByPath(path);
    if (!tFile) {
      const missing = new Error(`필수 스크립트 파일이 없습니다: ${path}`);
      missing.code = "sync_pending";
      if (optional) {
        recordMeasurementFailure(path, missing);
        return null;
      }
      throw missing;
    }
    const content = await app.vault.read(tFile);
    const evaluate = () => (new Function(content))();
    const session = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
    if (session && typeof session.measureModule === "function") return await session.measureModule(path, evaluate);
    return evaluate();
  } catch (error) {
    if (optional) {
      recordMeasurementFailure(path, error);
      return null;
    }
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.prodigyLoadPath = path;
    throw wrapped;
  }
};

const main = async () => {
  try {
    await loadProdigyScript("SYSTEM/Views/design-tokens.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-performance-recorder.js", { optional: true });
    await loadProdigyScript("SYSTEM/Views/prodigy-workspace-readiness.js", { optional: true });
    await loadProdigyScript("SYSTEM/Views/prodigy-performance-exporter.js", { optional: true });
    await loadProdigyScript("SYSTEM/Views/prodigy-workspace-measurement.js", { optional: true });
    await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
    await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
    await loadProdigyScript("SYSTEM/Views/display-registry.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
    await loadProdigyScript("SYSTEM/Views/home-styles.js");
    await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
    await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
    await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
    await loadProdigyScript("SYSTEM/Views/project-todoist-adapter.js");
    await loadProdigyScript("SYSTEM/Views/ai-provider-response.js");
    await loadProdigyScript("SYSTEM/Views/ai-provider-schema.js");
    await loadProdigyScript("SYSTEM/Views/ai-provider-error-policy.js");
    await loadProdigyScript("SYSTEM/Views/ai-provider-fallback.js");
    await loadProdigyScript("SYSTEM/Views/ai-provider-service.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-config-service.js");
    await loadProdigyScript("SYSTEM/Views/project-workflow-draft-service.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-settings-modal.js");
    await loadProdigyScript("SYSTEM/Views/morning-context-core.js");
    await loadProdigyScript("SYSTEM/Views/morning-brief-service.js");
    await loadProdigyScript("SYSTEM/Views/morning-brief-context.js");
    await loadProdigyScript("SYSTEM/Views/morning-cache.js");
    await loadProdigyScript("SYSTEM/Views/journal-core.js");
    await loadProdigyScript("SYSTEM/Views/journal-store.js");
    await loadProdigyScript("SYSTEM/Views/journal-review-modal.js");
    await loadProdigyScript("SYSTEM/Views/home-workspace-bar-core.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-adaptive-controls.js");
    await loadProdigyScript("SYSTEM/Views/workspace-launcher-core.js");
    await loadProdigyScript("SYSTEM/Views/workspace-launcher-view.js");
    await loadProdigyScript("SYSTEM/Views/object-creator-core.js");
    await loadProdigyScript("SYSTEM/Views/object-creator-view.js");
    // Creators that Universal Object Creator reuses (optional if already loaded elsewhere)
    await loadProdigyScript("SYSTEM/Views/people-core.js");
    await loadProdigyScript("SYSTEM/Views/people-store.js");
    await loadProdigyScript("SYSTEM/Views/people-view.js");
    await loadProdigyScript("SYSTEM/Views/reading-book-create.js");
    await loadProdigyScript("SYSTEM/Views/project-wizard-core.js");
    await loadProdigyScript("SYSTEM/Views/project-wizard.js");
    await loadProdigyScript("SYSTEM/Views/home-view.js");

    if (window.HomeView) {
      const shell = window.ProdigyWorkspaceNavigation.mount(this.container, { app, workspaceId: "home", title: "홈" });
      const performance = shell.performance;
      const dataScan = performance && performance.start("data_scan", { scope: "home" });
      const domRender = performance && performance.start("dom_render", { scope: "home" });
      try {
        await window.HomeView.renderHome({
          app: app,
          dv: dv,
          container: shell.body
        });
        if (performance) {
          performance.end(dataScan, { scope: "home", status: "loaded" });
          const projection = performance.start("projection", { scope: "home" });
          performance.end(projection, { scope: "home", status: "projected" });
          performance.end(domRender, { scope: "home", status: "rendered" });
          performance.markReady("home", shell.readinessSnapshot("home"));
        }
      } catch (error) {
        if (performance) {
          performance.end(dataScan, { scope: "home", status: "failed" });
          performance.end(domRender, { scope: "home", status: "failed" });
          performance.fail(error, { phase: "error", scope: "home" });
        }
        throw error;
      }
    } else {
      throw new Error("HomeView 모듈을 불러오지 못했습니다.");
    }
  } catch (err) {
    if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
      window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, err, { title: "홈" });
    } else {
      this.container.empty();
      this.container.createEl("p", { text: "홈 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
    }
  }
};

await main();
```
