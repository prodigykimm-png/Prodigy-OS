---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

```dataviewjs
window.obsidian = obsidian;
window.app = app;

const loadWorkspaceBootstrap = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};

try {
  if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
  if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
  const manifest = window.ProdigyWorkspaceManifest.get("home");
  await window.ProdigyHubLoader.mountWorkspace(app, manifest, {
    container: this.container,
    renderers: {
      home: async (mountContext) => {
        const { container } = mountContext;
        const stateAdapter = window.ProdigyWorkspaceStateAdapters && window.ProdigyWorkspaceStateAdapters.claim("home");
        const shell = window.ProdigyWorkspaceNavigation.mount(container, { app, workspaceId: "home", title: "홈", mountScope: mountContext.scope, stateAdapter, deferStateAdapter: true });
        const rendered = await window.HomeView.renderHome({ app, dv, container: shell.body });
        if (stateAdapter) shell.mountStateController();
        return rendered;
      }
    }
  });
} catch (error) {
  const preservesRequiredRecovery = window.ProdigyHubLoader && typeof window.ProdigyHubLoader.preserveRequiredRecovery === "function" && window.ProdigyHubLoader.preserveRequiredRecovery(error, this.container);
  if (!preservesRequiredRecovery) {
    if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
      window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "홈" });
    } else {
      this.container.empty();
      this.container.createEl("p", { text: "홈 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
    }
  }
}
```
