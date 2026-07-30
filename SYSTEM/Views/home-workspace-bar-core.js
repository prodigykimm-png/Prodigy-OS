(function (root) {
  "use strict";

  function workspaceItem(item) {
    if (!item || !item.id || !item.label || !item.path) return null;
    const label = String(item.label).trim();
    if (!label) return null;
    return Object.freeze({
      id: String(item.id).trim().toLowerCase(),
      kind: "workspace",
      label,
      path: String(item.path).trim(),
      accessibleLabel: `${label} 워크스페이스 열기`
    });
  }

  function uniqueIds(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [values])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }

  /**
   * Build the fixed one-row Home workspace-bar selection.
   * @param {{items: Function, launcherItems?: Function}} registry canonical workspace registry
   * @param {{pinnedIds?: string[], recentIds?: string[], recentId?: string}} [selection]
   * @returns {{layout: object, pinnedItems: object[], recentItem: object|null, directItems: object[], overflowItem: object, barItems: object[], sheetItems: object[]}}
   */
  function buildWorkspaceBarModel(registry, selection) {
    const sourceItems = registry && typeof registry.items === "function" ? registry.items() : [];
    const sheetItems = Object.freeze(sourceItems.map(workspaceItem).filter(Boolean));
    const byId = new Map(sheetItems.map((item) => [item.id, item]));
    const allIds = sheetItems.map((item) => item.id);
    const launcherIds = registry && typeof registry.launcherItems === "function"
      ? registry.launcherItems().map((item) => item && item.id)
      : allIds;
    const input = selection || {};
    const pinnedCandidates = uniqueIds([
      ...uniqueIds(input.pinnedIds || []),
      ...uniqueIds(launcherIds),
      ...allIds
    ]);
    const pinnedItems = Object.freeze(
      pinnedCandidates.filter((id) => byId.has(id)).slice(0, 2).map((id) => byId.get(id))
    );
    const pinnedIds = new Set(pinnedItems.map((item) => item.id));
    const recentInput = Array.isArray(input.recentIds) ? input.recentIds : [input.recentId];
    const recentId = uniqueIds([...recentInput, ...allIds])
      .find((id) => byId.has(id) && !pinnedIds.has(id));
    const recentItem = recentId ? byId.get(recentId) : null;
    const directItems = Object.freeze(recentItem ? [...pinnedItems, recentItem] : [...pinnedItems]);
    const overflowItem = Object.freeze({
      id: "all",
      kind: "overflow",
      label: "전체",
      path: "",
      accessibleLabel: "전체 워크스페이스 열기"
    });

    return Object.freeze({
      layout: Object.freeze({ rowCount: 1, wrap: false, horizontalScroll: false }),
      pinnedItems,
      recentItem,
      directItems,
      overflowItem,
      barItems: Object.freeze([...directItems, overflowItem]),
      sheetItems
    });
  }

  const api = Object.freeze({ buildWorkspaceBarModel });
  root.HomeWorkspaceBarCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
