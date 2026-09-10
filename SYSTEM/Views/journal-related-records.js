(function (root) {
  "use strict";
  function linkedJournals(app, target) {
    var links = app && app.metadataCache && app.metadataCache.resolvedLinks || {};
    return Object.keys(links).filter(function (source) {
      return /^DAILY\/(DAILY|WEEKLY|MONTHLY|QUARTERLY|YEARLY)\//.test(source) && Number(links[source][target]) > 0;
    }).sort().reverse();
  }
  function render(app, container, target) {
    var paths = linkedJournals(app, target);
    if (!paths.length) return;
    var details = container.createEl("details");
    details.createEl("summary", { text: "연결된 저널 " + paths.length + "개" });
    paths.forEach(function (path) {
      var open = details.createEl("button", { text: path.split("/").pop().replace(/\.md$/, ""), attr: { type: "button", class: "prodigy-btn" } });
      open.onclick = function () { return app.workspace.openLinkText(path.replace(/\.md$/, ""), target, true); };
    });
    return details;
  }
  root.JournalRelatedRecords = Object.freeze({ linkedJournals: linkedJournals, render: render });
  if (typeof module !== "undefined" && module.exports) module.exports = root.JournalRelatedRecords;
})(typeof window !== "undefined" ? window : globalThis);
