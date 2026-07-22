(function (root) {
  "use strict";

  var ITEMS = Object.freeze([
    Object.freeze({ id: "auction", icon: "🏛", label: "경매", path: "HUB/10 Auction.md", launcher: true }),
    Object.freeze({ id: "knowledge", icon: "🧠", label: "지식", path: "HUB/50 Knowledge.md", launcher: false }),
    Object.freeze({ id: "project", icon: "📁", label: "프로젝트", path: "HUB/40 Project.md", launcher: true }),
    Object.freeze({ id: "reading", icon: "📚", label: "독서", path: "HUB/20 Reading.md", launcher: true }),
    Object.freeze({ id: "workout", icon: "🏋", label: "운동", path: "HUB/30 Workout.md", launcher: true }),
    Object.freeze({ id: "journal", icon: "📝", label: "저널", path: "HUB/70 Journal.md", launcher: false }),
    Object.freeze({ id: "personal", icon: "👤", label: "개인", path: "HUB/60 Personal.md", launcher: true })
  ]);

  function items() { return ITEMS.slice(); }

  function find(id) {
    var key = String(id || "").trim().toLowerCase();
    return ITEMS.find(function (item) { return item.id === key; }) || null;
  }

  function launcherItems() {
    return ITEMS.filter(function (item) { return item.launcher; });
  }

  var api = Object.freeze({ items: items, find: find, launcherItems: launcherItems });
  root.ProdigyWorkspaceRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
