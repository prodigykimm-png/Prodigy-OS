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
const loadWorkspaceBootstrap = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};

try {
  if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
  if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
  const manifest = window.ProdigyWorkspaceManifest.get("journal");
  await window.ProdigyHubLoader.mountWorkspace(app, manifest, {
    container: this.container,
    renderers: { journal: async (mountContext) => {

  this.container.empty();
  var shell = window.ProdigyWorkspaceNavigation.mount(this.container, { app: app, workspaceId: "journal", title: "저널", mountScope: mountContext.scope });
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
  var periodView = window.JournalPeriodView.mount({
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
  if (periodView) {
    var disposePeriod = periodView.dispose || periodView.cleanup || periodView.destroy;
    if (typeof disposePeriod === "function") mountContext.scope.track(disposePeriod.bind(periodView));
  }
    } }
  });
} catch (error) {
  if (window.ProdigyHubLoader && typeof window.ProdigyHubLoader.preserveRequiredRecovery === "function" && window.ProdigyHubLoader.preserveRequiredRecovery(error, this.container)) return;
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
