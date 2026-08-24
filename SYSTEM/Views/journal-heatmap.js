(function (root) {
  "use strict";

  const HEATMAP_STYLE_ID = "prodigy-journal-heatmap-styles";

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById(HEATMAP_STYLE_ID)) return;
    const styleEl = document.createElement("style");
    styleEl.id = HEATMAP_STYLE_ID;
    styleEl.textContent = `
      .journal-heatmap-card {
        padding: 16px; margin-block-end: 16px;
        border: 1px solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-panel, 12px);
        background: var(--ke-color-surface-secondary, var(--background-secondary));
        display: flex; flex-direction: column; gap: 12px;
      }
      .journal-heatmap-header {
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
      }
      .journal-heatmap-title {
        margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--ke-color-text, var(--text-normal));
      }
      .journal-heatmap-stats {
        display: flex; gap: 16px; font-size: 0.8rem; color: var(--ke-color-muted, var(--text-muted));
      }
      .journal-heatmap-stats strong { color: var(--ke-color-interactive, var(--text-accent)); }
      .journal-heatmap-grid-wrap {
        overflow-x: auto; overscroll-behavior-inline: contain; padding-bottom: 4px;
      }
      .journal-heatmap-grid {
        display: grid; grid-template-rows: repeat(7, 11px); grid-auto-flow: column; grid-auto-columns: 11px; gap: 3px;
      }
      .journal-heatmap-cell {
        width: 11px; height: 11px; border-radius: 2px;
        background: color-mix(in srgb, var(--ke-color-border, var(--background-modifier-border)) 60%, transparent);
        transition: transform 0.1s ease, filter 0.1s ease; cursor: pointer;
      }
      .journal-heatmap-cell:hover {
        transform: scale(1.3); z-index: 2;
      }
      .journal-heatmap-cell[data-level="1"] {
        background: color-mix(in srgb, var(--ke-color-interactive, var(--text-accent)) 30%, var(--ke-color-border, var(--background-modifier-border)));
      }
      .journal-heatmap-cell[data-level="2"] {
        background: color-mix(in srgb, var(--ke-color-interactive, var(--text-accent)) 60%, var(--ke-color-border, var(--background-modifier-border)));
      }
      .journal-heatmap-cell[data-level="3"] {
        background: var(--ke-color-interactive, var(--text-accent));
      }
      .journal-heatmap-cell[data-level="4"] {
        background: var(--ke-color-accent, var(--text-accent));
        box-shadow: 0 0 6px var(--ke-color-accent, var(--text-accent));
      }
    `;
    document.head.appendChild(styleEl);
  }

  function renderHeatmap(container, recentReviews, onSelectDate) {
    if (!container) return;
    ensureStyles();

    const reviewsMap = {};
    let totalCompleted = 0;
    (recentReviews || []).forEach((item) => {
      if (item && item.date) {
        reviewsMap[item.date] = item;
        if (item.status === "completed" || (item.blocks && item.blocks.length > 0)) totalCompleted++;
      }
    });

    const card = container.createEl("div", { attr: { class: "journal-heatmap-card prodigy-utility-card" } });

    const head = card.createEl("div", { attr: { class: "journal-heatmap-header" } });
    head.createEl("h2", { text: "🔥 365일 성찰 히트맵 (Reflection Streak)", attr: { class: "journal-heatmap-title" } });

    const stats = head.createEl("div", { attr: { class: "journal-heatmap-stats" } });
    stats.innerHTML = `<span>총 성찰: <strong>${totalCompleted}일</strong></span>`;

    const wrap = card.createEl("div", { attr: { class: "journal-heatmap-grid-wrap" } });
    const grid = wrap.createEl("div", { attr: { class: "journal-heatmap-grid" } });

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 364);

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const isoDate = `${year}-${month}-${day}`;

      const review = reviewsMap[isoDate];
      let level = 0;
      if (review) {
        const count = (review.blocks ? review.blocks.length : 0) + (review.status === "completed" ? 2 : 1);
        if (count >= 4) level = 4;
        else if (count >= 3) level = 3;
        else if (count >= 2) level = 2;
        else if (count >= 1) level = 1;
      }

      const cell = grid.createEl("div", {
        attr: {
          class: "journal-heatmap-cell",
          "data-date": isoDate,
          "data-level": String(level),
          title: `${isoDate}: ${review ? (review.statusLabel || "기록 있음") : "기록 없음"}`
        }
      });

      if (typeof onSelectDate === "function") {
        cell.onclick = () => onSelectDate(isoDate);
      }
    }
  }

  root.JournalHeatmap = { render: renderHeatmap };
  if (typeof module !== "undefined" && module.exports) module.exports = root.JournalHeatmap;
})(typeof window !== "undefined" ? window : globalThis);
