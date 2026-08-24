(function (root) {
  "use strict";

  function safeRenderRegion(options) {
    const opts = options || {};
    try {
      return opts.render();
    } catch (error) {
      const region = opts.parent.createEl("div", {
        text: opts.label + " 영역을 표시하지 못했습니다.",
        attr: { class: "home-region-error", role: "alert" }
      });
      if (opts.debug) {
        region.createEl("div", {
          text: String(error.message || error),
          attr: { class: "home-region-error-details" }
        });
      }
      return null;
    }
  }

  function renderWorkspaceDock(options) {
    const opts = options || {};
    const core = opts.workspaceBarCore;
    const registry = opts.registry;
    if (!opts.parent || !core || typeof core.buildWorkspaceBarModel !== "function") return null;
    if (!registry || typeof registry.items !== "function") return null;
    const model = core.buildWorkspaceBarModel(registry, opts.selection || {});
    const dock = opts.parent.createEl("div", {
      attr: {
        class: "home-ws-dock home-native-sidebar",
        role: "navigation",
        "aria-label": "워크스페이스 바로가기",
        "data-height": String(opts.controlHeight)
      }
    });
    dock.createEl("div", {
      text: registry.items().length > 0 ? "워크스페이스 바로가기" : "워크스페이스 바로가기 · 비어 있음",
      attr: { class: "home-ws-dock-label home-native-sidebar-label" }
    });
    const row = dock.createEl("div", {
      attr: {
        class: "home-ws-dock-row home-native-sidebar-group",
        "data-row-count": String(model.layout.rowCount),
        "data-wrap": model.layout.wrap ? "wrap" : "nowrap",
        "data-horizontal-scroll": String(model.layout.horizontalScroll)
      }
    });
    let overflowButton = null;
    model.barItems.forEach((item) => {
      const button = row.createEl("button", {
        attr: {
          type: "button",
          class: "home-ws-dock-btn",
          "data-workspace": item.id,
          title: item.accessibleLabel,
          "aria-label": item.accessibleLabel,
          "aria-haspopup": item.kind === "overflow" ? "dialog" : "false",
          "aria-expanded": "false"
        }
      });
      button.createEl("span", { text: item.label, attr: { class: "home-ws-dock-name" } });
      if (item.path) button.onclick = () => opts.openPath(item.path);
      if (item.kind === "overflow") overflowButton = button;
    });

    const controls = opts.adaptiveControls;
    if (!overflowButton || !controls || typeof controls.BottomSheet !== "function") return dock;
    const setExpanded = (expanded) => {
      if (typeof overflowButton.setAttribute === "function") overflowButton.setAttribute("aria-expanded", expanded ? "true" : "false");
      else if (overflowButton.attributes) overflowButton.attributes["aria-expanded"] = expanded ? "true" : "false";
    };
    const sheet = controls.BottomSheet(opts.parent, {
      title: "전체 워크스페이스",
      onOpen: () => setExpanded(true),
      onClose: () => setExpanded(false)
    });
    const list = sheet.body.createEl("div", { attr: { class: "home-workspace-sheet-list" } });
    model.sheetItems.forEach((item) => {
      const button = list.createEl("button", {
        text: item.label,
        attr: { type: "button", class: "home-workspace-sheet-btn", "data-workspace": item.id, title: item.accessibleLabel, "aria-label": item.accessibleLabel }
      });
      button.onclick = () => { sheet.close(); opts.openPath(item.path); };
    });
    overflowButton.onclick = () => sheet.open(overflowButton);
    return dock;
  }

  function renderMicroLogSlot(parent) {
    if (!parent) return null;
    const slot = parent.createEl("div", {
      attr: { class: "home-card home-native-group prodigy-utility-card home-micro-log-slot emphasis-secondary", role: "region", "aria-label": "Micro Log" }
    });
    slot.createEl("div", { text: "Micro Log", attr: { class: "home-header" } });
    slot.createEl("div", { text: "빠른 기록 슬롯", attr: { class: "home-micro-log-label" } });
    return slot;
  }

  /** Render the stable Continue section from an already-projected Home model. */
  function renderContinueSection(options) {
    const opts = options || {};
    const card = opts.parent.createEl("div", {
      attr: { class: "home-card home-native-group prodigy-utility-card home-continue-section " + (opts.isAfternoon ? "emphasis-primary" : "emphasis-secondary") }
    });
    card.createEl("div", { text: "이어하기", attr: { class: "home-header" } });

    const items = Array.isArray(opts.cards) ? opts.cards : [];
    if (!items.length) {
      card.createEl("div", { text: "이어할 항목이 없습니다.", attr: { class: "home-continue-empty-title" } });
      card.createEl("div", { text: "오늘은 새 출발입니다.", attr: { class: "home-continue-empty-note" } });
      return card;
    }

    const list = card.createEl("div", { attr: { class: "continue-list" } });
    items.forEach((item) => {
      const target = item.dashboard_path || item.object_path;
      const row = list.createEl("button", {
        attr: { type: "button", class: "continue-row", "aria-label": `${item.title} 이어하기` }
      });
      const meta = row.createEl("div", { attr: { class: "home-continue-meta" } });
      meta.createEl("div", {
        text: item.workspace_label || "워크스페이스",
        attr: { class: "home-continue-workspace" }
      });
      meta.createEl("strong", { text: item.title, attr: { class: "home-continue-title" } });
      if (item.next_action) {
        meta.createEl("div", { text: item.next_action, attr: { class: "home-continue-action" } });
      }
      row.createEl("span", { text: "이어하기", attr: { class: "action-btn action-btn-primary" } });
      row.onclick = () => opts.openPath(target);
    });
    return card;
  }

  const api = Object.freeze({ safeRenderRegion, renderWorkspaceDock, renderMicroLogSlot, renderContinueSection });
  root.HomeSections = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
