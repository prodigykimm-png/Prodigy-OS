(function (root) {
  "use strict";

  const REGION_ROOT = "PARA/RESOURCES/Auction Regions/";

  function safePath(value) { return typeof value === "string" ? value.replace(/\\/g, "/").normalize("NFC") : ""; }
  function markdownFiles(vault) {
    if (!vault || typeof vault.getMarkdownFiles !== "function") throw new Error("읽기 가능한 Obsidian vault가 필요합니다.");
    return vault.getMarkdownFiles().filter((file) => safePath(file && file.path).startsWith(REGION_ROOT));
  }
  function metadataAvailable(metadataCache, file) {
    return Boolean(metadataCache && typeof metadataCache.getFileCache === "function" && metadataCache.getFileCache(file));
  }
  function projectionApi() {
    const api = root.RegionExplorerProjection;
    if (!api || typeof api.projectRegionSources !== "function") throw new Error("RegionExplorerProjection을 먼저 불러와야 합니다.");
    return api;
  }
  async function loadRegionExplorer(options) {
    const settings = options || {};
    const vault = settings.vault;
    if (!vault || typeof vault.read !== "function") throw new Error("읽기 전용 vault.read가 필요합니다.");
    const sources = await Promise.all(markdownFiles(vault).map(async (file) => ({
      path: safePath(file.path), body: await vault.read(file), metadata_available: metadataAvailable(settings.metadataCache, file)
    })));
    return projectionApi().projectRegionSources(sources);
  }

  const api = Object.freeze({ REGION_ROOT, loadRegionExplorer });
  root.RegionExplorerDataSource = api;
  if (typeof module !== "undefined" && module.exports) {
    if (!root.RegionExplorerProjection) root.RegionExplorerProjection = require("./region-explorer-projection.js");
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
