(function (root) {
  "use strict";

  var ROUTES = Object.freeze([
    Object.freeze({ id: "auction", icon: "🏛", label: "경매", path: "HUB/10 Auction.md", launcher: true }),
    Object.freeze({ id: "knowledge", icon: "🧠", label: "지식", path: "HUB/50 Knowledge.md", launcher: false }),
    Object.freeze({ id: "project", icon: "📁", label: "프로젝트", path: "HUB/40 Project.md", launcher: true }),
    Object.freeze({ id: "reading", icon: "📚", label: "독서", path: "HUB/20 Reading.md", launcher: true }),
    Object.freeze({ id: "workout", icon: "🏋", label: "운동", path: "HUB/30 Workout.md", launcher: true }),
    Object.freeze({ id: "journal", icon: "📝", label: "저널", path: "HUB/70 Journal.md", launcher: false }),
    Object.freeze({ id: "personal", icon: "👤", label: "개인", path: "HUB/60 Personal.md", launcher: true }),
    Object.freeze({ id: "home", icon: "🏠", label: "홈", path: "HUB/00 Home.md", launcher: false, dock: false }),
    Object.freeze({ id: "region", icon: "🌏", label: "지역", path: "HUB/15 Region.md", launcher: false, dock: false })
  ]);

  var ITEMS = Object.freeze(ROUTES.filter(function (item) {
    return item.dock !== false;
  }));

  function items() { return ITEMS.slice(); }

  function routeTable() { return ROUTES.slice(); }

  function find(id) {
    var key = String(id || "").trim().toLowerCase();
    return ROUTES.find(function (item) { return item.id === key; }) || null;
  }

  function pathFor(id) {
    var item = find(id);
    return item ? item.path : "";
  }

  function routeEquality(id, actualPath) {
    var key = String(id || "").trim().toLowerCase();
    var item = find(key);
    var actual = String(actualPath || "").trim();
    var expected = item ? item.path : "";
    return Object.freeze({
      id: key,
      expectedPath: expected,
      actualPath: actual,
      ok: !!item && expected === actual
    });
  }

  function routeReceipt(expectedPaths) {
    var keys;
    if (Array.isArray(expectedPaths) && expectedPaths.length) {
      keys = expectedPaths.slice();
    } else if (expectedPaths && typeof expectedPaths === "object") {
      keys = Object.keys(expectedPaths);
    } else {
      keys = ROUTES.map(function (item) { return item.id; });
    }
    var mappings = keys.map(function (id) {
      var key = String(id || "").trim().toLowerCase();
      var actual = expectedPaths && !Array.isArray(expectedPaths) && typeof expectedPaths === "object"
        ? expectedPaths[id]
        : pathFor(key);
      return routeEquality(key, actual);
    });
    var ok = mappings.every(function (mapping) { return mapping.ok; });
    return Object.freeze({
      status: ok ? "pass" : "fail",
      ok: ok,
      mappings: Object.freeze(mappings)
    });
  }

  function launcherItems() {
    return ITEMS.filter(function (item) { return item.launcher; });
  }

  function contextWorkspaceIds() {
    return ROUTES.map(function (item) { return item.id; });
  }

  var api = Object.freeze({
    ROUTES: ROUTES,
    items: items,
    routeTable: routeTable,
    find: find,
    pathFor: pathFor,
    routeEquality: routeEquality,
    routeReceipt: routeReceipt,
    launcherItems: launcherItems,
    contextWorkspaceIds: contextWorkspaceIds
  });
  root.ProdigyWorkspaceRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
