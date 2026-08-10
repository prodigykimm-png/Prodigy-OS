---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
```dataviewjs
window.obsidian = obsidian;
window.app = app;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "journal"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "journal" };
const journalMeasurementOptionalPaths = new Set([
  "SYSTEM/Views/prodigy-performance-recorder.js",
  "SYSTEM/Views/prodigy-workspace-readiness.js",
  "SYSTEM/Views/prodigy-performance-exporter.js",
  "SYSTEM/Views/prodigy-workspace-measurement.js"
]);
window.__prodigyMeasurementLoadFailures = Array.isArray(window.__prodigyMeasurementLoadFailures)
  ? window.__prodigyMeasurementLoadFailures
  : [];

const loadProdigyScript = async (path) => {
  const optional = journalMeasurementOptionalPaths.has(path);
  try {
    const tFile = app.vault.getAbstractFileByPath(path);
    if (!tFile) throw new Error(`Missing script: ${path}`);
    const content = await app.vault.read(tFile);
    const evaluate = () => (new Function(content))();
    const session = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
    if (session && typeof session.measureModule === "function") {
      return await session.measureModule(path, evaluate);
    }
    return evaluate();
  } catch (error) {
    if (!optional) throw error;
    window.__prodigyMeasurementLoadFailures.push({
      path,
      code: String(error && error.code || "measurement_module_load_failed")
    });
    return false;
  }
};

try {
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-recorder.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-readiness.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-exporter.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-measurement.js");
  await loadProdigyScript("SYSTEM/Views/design-tokens.js");
  await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
  await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-workspace-route.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-adaptive-controls.js");
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-response.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-schema.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-error-policy.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-fallback.js");
  await loadProdigyScript("SYSTEM/Views/codex-exec-service.js");
  await loadProdigyScript("SYSTEM/Views/antigravity-exec-service.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-service.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-config-service.js");
  await loadProdigyScript("SYSTEM/Views/project-workflow-draft-service.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-settings-modal.js");
  await loadProdigyScript("SYSTEM/Views/morning-context-core.js");
  await loadProdigyScript("SYSTEM/Views/journal-core.js");
  await loadProdigyScript("SYSTEM/Views/journal-store.js");
  await loadProdigyScript("SYSTEM/Views/evidence-quality-core.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-explorer-registry.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-candidate-core.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-candidate-store.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-venue-policy.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-proposal-contract.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-object-links.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-knowledge-handoff.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-conservative-policy.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-ai.js");
  await loadProdigyScript("SYSTEM/Views/place-candidate-store.js");
  await loadProdigyScript("SYSTEM/Views/venue-creator.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-modal-styles.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-modal-state.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-proposal-input-view.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-proposal-candidates-view.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-evidence-review-view.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-candidate-handoff-view.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-post-save.js");
  await loadProdigyScript("SYSTEM/Views/daily-reflection-modal.js");
  await loadProdigyScript("SYSTEM/Views/journal-review-modal.js");
  await loadProdigyScript("SYSTEM/Views/journal-evidence-block-modal.js");
  await loadProdigyScript("SYSTEM/Views/journal-completion-action.js");
  await loadProdigyScript("SYSTEM/Views/journal-dashboard-view.js");
  await loadProdigyScript("SYSTEM/Views/journal-view.js");
  await loadProdigyScript("SYSTEM/Views/weekly-filter-core.js");
  await loadProdigyScript("SYSTEM/Views/weekly-filter-styles.js");
  await loadProdigyScript("SYSTEM/Views/weekly-filter-render.js");
  await loadProdigyScript("SYSTEM/Views/weekly-filter-ai.js");
  await loadProdigyScript("SYSTEM/Views/weekly-review-store.js");
  await loadProdigyScript("SYSTEM/Views/weekly-filter-view.js");
  await loadProdigyScript("SYSTEM/Views/monthly-validation-core.js");
  await loadProdigyScript("SYSTEM/Views/monthly-validation-store.js");
  await loadProdigyScript("SYSTEM/Views/monthly-validation-ai.js");
  await loadProdigyScript("SYSTEM/Views/monthly-validation-view.js");
  await loadProdigyScript("SYSTEM/Views/journal-period-core.js");
  await loadProdigyScript("SYSTEM/Views/journal-period-store.js");
  await loadProdigyScript("SYSTEM/Views/journal-period-view.js");

  this.container.empty();
  var shell = window.ProdigyWorkspaceNavigation.mount(this.container, { app: app, workspaceId: "journal", title: "저널" });
  var performance = shell.performance;
  var dataScan = performance && performance.start("data_scan", { scope: "journal" });
  var domRender = performance && performance.start("dom_render", { scope: "journal" });
  var projection = null;
  var lifecycleClosed = { data_scan: false, projection: false, dom_render: false };
  var readinessMarked = new Set();
  var closeToken = function (phase, token, status) {
    if (!performance || !token || lifecycleClosed[phase]) return;
    performance.end(token, { scope: "journal", status: status });
    lifecycleClosed[phase] = true;
  };
  var periodMount = shell.body.createDiv({ attr: { class: "journal-period-mount" } });
  var startProjection = function () {
    if (!performance || projection || readinessMarked.size) return;
    projection = performance.start("projection", { scope: "journal", status: "projecting" });
  };
  window.JournalPeriodView.mount({
    app: app,
    container: periodMount,
    renderDaily: function (mount) {
      startProjection();
      return window.JournalView.renderDashboard(app, mount);
    },
    renderWeekly: function (mount) {
      startProjection();
      return window.WeeklyFilterView.mountWeeklyFilter(mount, { app: app });
    },
    onReady: function (snapshot) {
      if (!performance || !snapshot) return;
      var phaseStatus = snapshot.status === "deterministic" ? "rendered" : "failed";
      closeToken("data_scan", dataScan, phaseStatus);
      closeToken("projection", projection, phaseStatus);
      closeToken("dom_render", domRender, phaseStatus);
      if (snapshot.status !== "deterministic") return;
      var selector = String(snapshot.selector || "");
      if (["journal.daily", "journal.weekly", "journal.monthly"].indexOf(selector) === -1 || readinessMarked.has(selector)) return;
      if (typeof performance.markReady !== "function") return;
      var result = performance.markReady(selector, snapshot);
      if (result && result.ready === true) readinessMarked.add(selector);
    }
  });
} catch (error) {
  if (typeof closeToken === "function") {
    closeToken("data_scan", dataScan, "failed");
    closeToken("projection", projection, "failed");
    closeToken("dom_render", domRender, "failed");
    if (performance && typeof performance.fail === "function") {
      performance.fail(error, { phase: "error", scope: "journal" });
    }
  }
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "저널" });
  } else {
    this.container.empty();
    this.container.createEl("p", { text: "저널 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
}
```
