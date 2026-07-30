---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
```dataviewjs
window.obsidian = obsidian;
window.app = app;

const loadProdigyScript = async (path) => {
  const tFile = app.vault.getAbstractFileByPath(path);
  if (!tFile) throw new Error(`Missing script: ${path}`);
  (new Function(await app.vault.read(tFile)))();
};

try {
  await loadProdigyScript("SYSTEM/Views/design-tokens.js");
  await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
  await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-adaptive-controls.js");
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-response.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-schema.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-error-policy.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-fallback.js");
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
  await loadProdigyScript("SYSTEM/Views/monthly-validation-view.js");
  await loadProdigyScript("SYSTEM/Views/journal-period-core.js");
  await loadProdigyScript("SYSTEM/Views/journal-period-view.js");

  this.container.empty();
  var shell = window.ProdigyWorkspaceNavigation.mount(this.container, { app: app, workspaceId: "journal", title: "저널" });
  var periodMount = shell.body.createDiv({ attr: { class: "journal-period-mount" } });
  window.JournalPeriodView.mount({
    app: app,
    container: periodMount,
    renderDaily: function (mount) { return window.JournalView.renderDashboard(app, mount); },
    renderWeekly: function (mount) { return window.WeeklyFilterView.mountWeeklyFilter(mount, { app: app }); }
  });
} catch (error) {
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "저널" });
  } else {
    this.container.empty();
    this.container.createEl("p", { text: "저널 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
}
```
