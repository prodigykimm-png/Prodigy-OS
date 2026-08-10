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
  if (!tFile) throw new Error(`필수 스크립트 파일이 없습니다: ${path}`);
  const content = await app.vault.read(tFile);
  try {
    (new Function(content))();
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.prodigyLoadPath = path;
    throw wrapped;
  }
};

const main = async () => {
  try {
    await loadProdigyScript("SYSTEM/Views/design-tokens.js");
    await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-performance-recorder.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-workspace-readiness.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-performance-exporter.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-workspace-measurement.js");
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
      await window.HomeView.renderHome({
        app: app,
        dv: dv,
        container: shell.body
      });
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
