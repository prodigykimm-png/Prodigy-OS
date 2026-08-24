---
cssclasses:
  - prodigy-hub-note
  - hide-properties_editing
  - hide-properties_reading
---

```dataviewjs
try {
  const homeApp = (typeof app !== "undefined" && app) || this.app || (typeof dv !== "undefined" && dv.app);
  if (!homeApp) throw new Error("Dataview app context is unavailable.");
  window.app = homeApp;
  if (typeof obsidian !== "undefined") window.obsidian = obsidian;

  const loadWorkspaceBootstrap = async (path) => {
    const file = homeApp.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
    (new Function(await homeApp.vault.read(file)))();
  };

  if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
  if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
  const manifest = window.ProdigyWorkspaceManifest.get("home");
  await window.ProdigyHubLoader.mountWorkspace(homeApp, manifest, {
    container: this.container,
    renderers: {
      home: async (mountContext) => {
        const { container } = mountContext;
        const stateAdapter = window.ProdigyWorkspaceStateAdapters && window.ProdigyWorkspaceStateAdapters.claim("home");
        const shell = window.ProdigyWorkspaceNavigation.mount(container, { app: homeApp, workspaceId: "home", title: "홈", mountScope: mountContext.scope, stateAdapter, deferStateAdapter: true });
        const rendered = await window.HomeView.renderHome({ app: homeApp, dv, container: shell.body });
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
