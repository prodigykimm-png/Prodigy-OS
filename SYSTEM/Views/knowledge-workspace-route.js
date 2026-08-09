(function (root) {
  "use strict";

  function appFor(value) {
    return value || root.app || (typeof window !== "undefined" ? window.app : null);
  }

  function state() {
    if (typeof root.KnowledgeExplorerHub !== "object" || !root.KnowledgeExplorerHub) root.KnowledgeExplorerHub = {};
    return root.KnowledgeExplorerHub;
  }

  function notice(message) {
    var NoticeClass = root.Notice || (typeof window !== "undefined" && window.Notice);
    if (typeof NoticeClass === "function") new NoticeClass(message);
  }

  async function openKnowledge(app, options) {
    var host = appFor(app);
    var request = options || {};
    if (!host || !host.workspace || typeof host.workspace.openLinkText !== "function") {
      notice("Knowledge 워크스페이스를 열 수 없습니다. HUB/50 Knowledge.md에서 검토해 주세요.");
      return false;
    }
    var hubState = state();
    if (request.focus === "review") {
      hubState._lastTab = "zettelkasten";
      hubState._pendingFocus = "candidate-review";
    }
    try {
      await host.workspace.openLinkText("HUB/50 Knowledge", "", false);
      return true;
    } catch (_error) {
      if (request.focus === "review") hubState._pendingFocus = "";
      notice("Knowledge 워크스페이스를 열 수 없습니다. HUB/50 Knowledge.md에서 검토해 주세요.");
      return false;
    }
  }

  var api = Object.freeze({
    open: function (app) { return openKnowledge(app, {}); },
    openReview: function (app) { return openKnowledge(app, { focus: "review" }); }
  });
  root.KnowledgeWorkspaceRoute = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
