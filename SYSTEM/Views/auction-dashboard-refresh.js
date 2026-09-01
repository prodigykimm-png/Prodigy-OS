(function (root) {
  "use strict";

  async function refresh(app, fileOrPath) {
    const index = app && app.plugins && app.plugins.plugins
      && app.plugins.plugins.dataview && app.plugins.plugins.dataview.api
      && app.plugins.plugins.dataview.api.index;
    if (!index || typeof index.touch !== "function") return false;
    const file = typeof fileOrPath === "string"
      ? app && app.vault && app.vault.getAbstractFileByPath && app.vault.getAbstractFileByPath(fileOrPath)
      : fileOrPath;
    if (file && typeof index.reload === "function") {
      await index.reload(file);
      return true;
    }
    index.touch();
    return true;
  }

  const api = Object.freeze({ refresh });
  root.AuctionDashboardRefresh = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
