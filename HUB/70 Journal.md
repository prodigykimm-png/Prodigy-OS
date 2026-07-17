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
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/morning-context-core.js");
  await loadProdigyScript("SYSTEM/Views/journal-core.js");
  await loadProdigyScript("SYSTEM/Views/journal-store.js");
  await loadProdigyScript("SYSTEM/Views/journal-view.js");
  await window.JournalView.renderDashboard(app, this.container);
} catch (error) {
  this.container.empty();
  this.container.createEl("p", {
    text: "저널 워크스페이스를 불러오지 못했습니다.",
    attr: { style: "color:var(--text-error);" }
  });
  if (window.prodigyDebugMode === true) {
    this.container.createEl("pre", { text: error.stack || error.message });
  }
}
```
