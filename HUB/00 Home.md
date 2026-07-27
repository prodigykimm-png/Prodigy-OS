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
  if (tFile) {
    const content = await app.vault.read(tFile);
    (new Function(content))();
  }
};

const main = async () => {
  try {
    await loadProdigyScript("SYSTEM/Views/design-tokens.js");
    await loadProdigyScript("SYSTEM/Views/display-registry.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
    await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
    await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
    await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
    await loadProdigyScript("SYSTEM/Views/project-todoist-adapter.js");
    await loadProdigyScript("SYSTEM/Views/ai-provider-service.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-config-service.js");
    await loadProdigyScript("SYSTEM/Views/project-workflow-draft-service.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-settings-modal.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-doctor.js");
    await loadProdigyScript("SYSTEM/Views/morning-context-core.js");
    await loadProdigyScript("SYSTEM/Views/morning-brief-service.js");
    await loadProdigyScript("SYSTEM/Views/morning-brief-context.js");
    await loadProdigyScript("SYSTEM/Views/morning-cache.js");
    await loadProdigyScript("SYSTEM/Views/journal-core.js");
    await loadProdigyScript("SYSTEM/Views/journal-store.js");
    await loadProdigyScript("SYSTEM/Views/daily-reflection-ai.js");
    await loadProdigyScript("SYSTEM/Views/journal-view.js");
    await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
    await loadProdigyScript("SYSTEM/Views/workspace-launcher-core.js");
    await loadProdigyScript("SYSTEM/Views/workspace-launcher-view.js");
    await loadProdigyScript("SYSTEM/Views/object-creator-core.js");
    await loadProdigyScript("SYSTEM/Views/object-creator-view.js");
    // Creators that Universal Object Creator reuses (optional if already loaded elsewhere)
    await loadProdigyScript("SYSTEM/Views/people-core.js");
    await loadProdigyScript("SYSTEM/Views/people-store.js");
    await loadProdigyScript("SYSTEM/Views/people-styles.js");
    await loadProdigyScript("SYSTEM/Views/people-view.js");
    await loadProdigyScript("SYSTEM/Views/reading-book-create.js");
    await loadProdigyScript("SYSTEM/Views/project-wizard-core.js");
    await loadProdigyScript("SYSTEM/Views/project-wizard.js");
    await loadProdigyScript("SYSTEM/Views/home-styles.js");
    await loadProdigyScript("SYSTEM/Views/home-view.js");

    if (window.HomeView) {
      await window.HomeView.renderHome({
        app: app,
        dv: dv,
        container: this.container
      });
    } else {
      this.container.createEl("div", {
        text: "❌ HomeView component not found.",
        attr: { style: "color: var(--text-error);" }
      });
    }
  } catch (err) {
    this.container.empty();
    const errCard = this.container.createEl("div", {
      attr: { style: "background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; margin: 12px 0; color: #ef4444;" }
    });
    errCard.createEl("h4", { text: "⚠️ 홈 화면 스크립트 로드 실패" });
    errCard.createEl("div", {
      text: window.prodigyDebugMode ? (err.stack || err.message) : "Home을 다시 열거나 Obsidian을 재시작해 주세요.",
      attr: { style: "font-size: 0.8em; white-space: pre-wrap;" }
    });
  }
};

await main();
```
