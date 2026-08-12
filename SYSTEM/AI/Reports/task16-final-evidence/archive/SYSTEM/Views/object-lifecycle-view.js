(function (root) {
  "use strict";

  function openPath(app, path) {
    if (!app || !path) return;
    return app.workspace.openLinkText(String(path).replace(/\.md$/, ""), "", false);
  }

  function labelFor(state) {
    const core = root.ObjectLifecycleCore;
    const display = root.prodigyDisplay;
    if (display && typeof display.lifecycle === "function") return display.lifecycle(state);
    if (core) return core.lifecycleLabel(state, display);
    return state;
  }

  function renderHomeCard(options) {
    const { app, container, items } = options || {};
    if (!container) return;
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    container.empty();
    container.createEl("div", { text: "🧭 객체 라이프사이클", attr: { class: "home-header" } });
    container.createEl("div", {
      text: "주의가 필요한 객체만 표시합니다. 라이프사이클은 계산되며 YAML에 저장되지 않습니다.",
      attr: { style: "font-size:0.8em;color:var(--text-muted);margin-bottom:10px;line-height:1.45;" }
    });

    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      container.createEl("div", {
        text: "오늘 주의가 필요한 객체가 없습니다.",
        attr: { style: "font-size:0.85em;color:var(--text-muted);font-style:italic;" }
      });
      return;
    }

    list.forEach((item) => {
      const row = container.createEl("div", {
        attr: {
          style: "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--background-modifier-border);cursor:pointer;"
        }
      });
      const left = row.createEl("div", { attr: { style: "min-width:0;" } });
      left.createEl("div", {
        text: `${labelFor(item.state)} · ${item.workspace_label || item.workspace || ""}`,
        attr: { style: "font-weight:700;font-size:0.9em;overflow-wrap:anywhere;" }
      });
      // Lifecycle owns its explanations — Home does not invent reasons.
      const reasonText = item.reason || (item.reasons && item.reasons[0]) || "";
      if (reasonText) {
        left.createEl("div", {
          text: reasonText,
          attr: { style: "font-size:0.78em;color:var(--text-muted);margin-top:3px;overflow-wrap:anywhere;" }
        });
      }
      row.createEl("span", {
        text: String(item.count || 0),
        attr: { style: "font-size:1.15em;font-weight:800;color:var(--text-accent);flex:none;" }
      });
      row.onclick = () => openPath(app, item.workspace_path);
    });
  }

  function renderWorkspaceSummary(options) {
    const { container, counts, title } = options || {};
    if (!container) return;
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    container.empty();
    const card = container.createEl("div", {
      attr: {
        style: "border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);padding:12px;margin:0 0 12px;"
      }
    });
    card.createEl("div", {
      text: title || "객체 라이프사이클",
      attr: { style: "font-weight:700;margin-bottom:8px;font-size:0.95em;" }
    });

    const row = card.createEl("div", {
      attr: { style: "display:flex;flex-wrap:wrap;gap:8px;" }
    });

    const order = ["healthy", "needs_action", "needs_review", "stale", "completed"];
    const source = counts || {};
    order.forEach((state) => {
      const box = row.createEl("div", {
        attr: {
          style: "min-width:88px;flex:1 1 88px;padding:8px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);"
        }
      });
      box.createEl("div", {
        text: labelFor(state),
        attr: { style: "font-size:0.72em;color:var(--text-muted);font-weight:700;" }
      });
      box.createEl("div", {
        text: String(source[state] || 0),
        attr: { style: "font-size:1.2em;font-weight:800;margin-top:2px;" }
      });
    });
  }

  const api = {
    openPath,
    labelFor,
    renderHomeCard,
    renderWorkspaceSummary
  };

  root.ObjectLifecycleView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
