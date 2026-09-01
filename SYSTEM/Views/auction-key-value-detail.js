(function (root) {
  "use strict";

  const STYLE_ID = "auction-key-value-detail-style";

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function scopeModel(value) {
    if (!value) return null;
    return Object.freeze({
      label: value.label || "",
      unit_won: number(value.key_value_won_per_pyeong),
      total_won: number(value.key_value_total_won),
      case_count: number(value.case_count),
      building_count: number(value.building_count),
      confidence: value.confidence || "",
      period_start: value.period_start || "",
      period_end: value.period_end || "",
      q1_won: number(value.q1_won_per_pyeong),
      q3_won: number(value.q3_won_per_pyeong)
    });
  }

  function buildModel(projection) {
    const source = projection || {};
    const difference = number(source.district_difference_ratio);
    return Object.freeze({
      primary_scope: source.primary_scope || "dong",
      area_pyeong: number(source.area_pyeong),
      difference_percent: difference === null ? null : Math.round(difference * 100),
      dong: scopeModel(source.dong),
      district: scopeModel(source.district)
    });
  }

  function formatWon(value) {
    if (!(value > 0)) return "자료 없음";
    if (value >= 100000000) return `${(value / 100000000).toFixed(2)}억`;
    return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
  }

  function formatUnit(value) {
    return value > 0 ? `${Math.round(value / 10000).toLocaleString("ko-KR")}만/평` : "자료 없음";
  }

  function ensureStyles() {
    if (!root.document || !root.document.head || root.document.getElementById(STYLE_ID)) return;
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.auction-key-value-modal { inline-size: min(34rem, calc(100vw - 24px)); max-inline-size: calc(100vw - 24px); }
.auction-key-value-modal .modal-content { padding: 0; }
.auction-key-value-detail { display: grid; gap: var(--ke-space-3, 12px); padding: var(--ke-space-4, 17px); color: var(--ke-color-text, var(--text-normal)); }
.auction-key-value-detail h2 { margin: 0; font-size: var(--ke-type-title, 1.05rem); }
.auction-key-value-group { overflow: hidden; border: 1px solid var(--ke-color-border, var(--background-modifier-border)); border-radius: var(--ke-radius-panel, 14px); background: var(--ke-color-surface-secondary, var(--background-secondary)); }
.auction-key-value-group h3 { margin: 0; padding: var(--ke-space-2, 8px) var(--ke-space-3, 12px); color: var(--ke-color-muted, var(--text-muted)); font-size: var(--ke-type-caption, 12px); font-weight: 600; }
.auction-key-value-detail-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ke-space-3, 12px); align-items: center; min-block-size: var(--ke-touch-target, 44px); padding-inline: var(--ke-space-3, 12px); border-block-start: 1px solid var(--ke-color-border, var(--background-modifier-border)); }
.auction-key-value-detail-row span:first-child { color: var(--ke-color-muted, var(--text-muted)); }
.auction-key-value-detail-row strong { text-align: end; overflow-wrap: anywhere; }
.auction-key-value-detail-actions { display: flex; justify-content: flex-end; }
.auction-key-value-detail-close { min-block-size: var(--ke-touch-target, 44px); padding-inline: var(--ke-space-4, 17px); border: 0; border-radius: var(--ke-radius-pill, 999px); background: var(--ke-color-accent, var(--interactive-accent)); color: var(--ke-color-on-interactive, var(--text-on-accent)); font-weight: 600; }
.auction-key-value-detail-close:focus-visible { outline: 2px solid var(--ke-color-accent, var(--text-accent)); outline-offset: 2px; }
`;
    root.document.head.appendChild(style);
  }

  function addGroup(parent, title, rows) {
    const section = parent.createEl("section", { attr: { class: "auction-key-value-group" } });
    section.createEl("h3", { text: title });
    rows.filter((row) => row && row.value !== null && row.value !== undefined && row.value !== "").forEach((row) => {
      const item = section.createEl("div", { attr: { class: "auction-key-value-detail-row" } });
      item.createEl("span", { text: row.label });
      item.createEl("strong", { text: String(row.value) });
    });
  }

  function open(app, projection, options) {
    const Modal = root.obsidian && root.obsidian.Modal;
    const model = buildModel(projection);
    if (!Modal) return model;
    const returnFocus = options && options.returnFocus;
    class KeyValueModal extends Modal {
      onOpen() {
        ensureStyles();
        if (this.modalEl && typeof this.modalEl.addClass === "function") this.modalEl.addClass("auction-key-value-modal");
        this.modalEl && this.modalEl.setAttribute("role", "dialog");
        this.modalEl && this.modalEl.setAttribute("aria-modal", "true");
        this.contentEl.empty();
        this.contentEl.setAttribute("class", "auction-key-value-detail");
        this.contentEl.setAttribute("data-key-value-scope", model.primary_scope);
        this.contentEl.createEl("h2", { text: "키값 상세" });
        addGroup(this.contentEl, "해당 물건", [
          { label: "전용면적", value: model.area_pyeong === null ? "자료 없음" : `${model.area_pyeong.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}평` }
        ]);
        if (model.dong) addGroup(this.contentEl, `${model.dong.label} 키값`, [
          { label: "환산가", value: formatWon(model.dong.total_won) },
          { label: "평당가", value: formatUnit(model.dong.unit_won) },
          { label: "표본", value: `${model.dong.case_count}건 · ${model.dong.building_count}개 건물` },
          { label: "기간", value: `${model.dong.period_start}~${model.dong.period_end}` },
          { label: "중간 범위", value: model.dong.q1_won && model.dong.q3_won ? `${formatUnit(model.dong.q1_won)}~${formatUnit(model.dong.q3_won)}` : null }
        ]);
        if (model.district) addGroup(this.contentEl, `${model.district.label} 키값`, [
          { label: "환산가", value: formatWon(model.district.total_won) },
          { label: "평당가", value: formatUnit(model.district.unit_won) },
          { label: "표본", value: `${model.district.case_count}건 · ${model.district.building_count}개 건물` },
          { label: "기간", value: `${model.district.period_start}~${model.district.period_end}` }
        ]);
        if (model.difference_percent !== null) addGroup(this.contentEl, "동/구 비교", [
          { label: "동 위치", value: `${model.difference_percent >= 0 ? "+" : ""}${model.difference_percent}%` },
          { label: "산정 방식", value: "최근 12개월 · 건물균형 중앙값" }
        ]);
        const actions = this.contentEl.createEl("div", { attr: { class: "auction-key-value-detail-actions" } });
        const closeButton = actions.createEl("button", { text: "닫기", attr: { type: "button", class: "auction-key-value-detail-close" } });
        closeButton.onclick = () => this.close();
      }
      onClose() {
        this.contentEl.empty();
        if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus({ preventScroll: true });
      }
    }
    const modal = new KeyValueModal(app);
    modal.open();
    return modal;
  }

  const api = Object.freeze({ buildModel, open });
  root.AuctionKeyValueDetail = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
