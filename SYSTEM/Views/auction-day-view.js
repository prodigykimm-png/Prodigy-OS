(function (root) {
  const T = root.ProdigyTokens || {}; const C = T.COLORS || {};
  "use strict";

  const STYLE_ID = "prodigy-auction-day-styles";

  const CSS = `
.prodigy-auction-day {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 12px;
  margin: 4px 0 12px 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  font-size: 0.9em;
}
.prodigy-auction-day * { box-sizing: border-box; }
.prodigy-aday-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.prodigy-aday-title {
  font-weight: 800;
  font-size: 1.05em;
  color: var(--text-accent);
}
.prodigy-aday-sub {
  font-size: 0.85em;
  color: var(--text-muted);
  width: 100%;
}
.prodigy-aday-nav {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.prodigy-aday-nav button,
.prodigy-aday-card button,
.prodigy-aday-open,
.prodigy-aday-save-bid,
.prodigy-aday-result-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  min-width: 40px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.85em;
  font-weight: 700;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
}
.prodigy-aday-result-btn.is-primary,
.prodigy-aday-save-bid.is-primary {
  border-color: var(--text-accent);
  color: var(--text-accent);
}
.prodigy-aday-result-btn.is-danger {
  border-color: ${C.error || "#ef4444"};
  color: ${C.error || "#ef4444"};
}
.prodigy-aday-result-btn.is-ok {
  border-color: ${C.success || "#22c55e"};
  color: ${C.success || "#22c55e"};
}
.prodigy-aday-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 18px 8px;
  font-size: 0.92em;
}
.prodigy-aday-court {
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  background: var(--background-primary);
  padding: 12px;
  margin-bottom: 12px;
}
.prodigy-aday-court-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.prodigy-aday-court-name {
  font-weight: 800;
  font-size: 1em;
  color: var(--text-normal);
}
.prodigy-aday-court-count {
  font-size: 0.82em;
  font-weight: 700;
  color: var(--text-accent);
}
.prodigy-aday-section-label {
  font-size: 0.78em;
  font-weight: 700;
  color: var(--text-muted);
  margin: 8px 0 6px;
  text-transform: none;
}
.prodigy-aday-checklist {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.prodigy-aday-check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.prodigy-aday-check:hover {
  background: var(--background-modifier-hover);
}
.prodigy-aday-check input {
  width: 18px;
  height: 18px;
  flex: none;
}
.prodigy-aday-check span {
  font-size: 0.88em;
  font-weight: 600;
}
.prodigy-aday-card {
  border: 1px solid var(--background-modifier-border);
  border-left: 4px solid var(--text-accent);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  background: var(--background-secondary);
  scroll-margin-top: 12px;
}
.prodigy-aday-card.is-focus {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 55%, transparent);
}
.prodigy-aday-card-title {
  font-weight: 800;
  font-size: 0.95em;
  margin-bottom: 4px;
}
.prodigy-aday-card-meta {
  font-size: 0.82em;
  color: var(--text-muted);
  line-height: 1.45;
  margin-bottom: 6px;
}
.prodigy-aday-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 6px 0;
}
.prodigy-aday-row label {
  font-size: 0.8em;
  font-weight: 700;
  color: var(--text-muted);
  min-width: 72px;
}
.prodigy-aday-row input,
.prodigy-aday-row textarea {
  flex: 1 1 140px;
  min-height: 40px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.9em;
}
.prodigy-aday-row textarea {
  min-height: 56px;
  resize: vertical;
}
.prodigy-aday-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.prodigy-aday-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75em;
  font-weight: 700;
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.prodigy-aday-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ke-space-3, 8px);
  background: color-mix(in srgb, var(--background-primary) 35%, transparent);
}
.prodigy-aday-panel {
  width: min(720px, 100%);
  max-height: calc(100dvh - 16px);
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--ke-radius-panel, 8px);
  padding: var(--ke-space-3, 8px);
}
.prodigy-bid-sheet {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--ke-radius-panel, 8px);
  overflow: hidden;
  background: var(--background-primary);
  min-inline-size: 0;
}
.prodigy-bid-sheet-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ke-space-3, 8px);
  align-items: end;
  padding: var(--ke-space-4, 12px);
  border-bottom: 1px solid var(--background-modifier-border);
}
.prodigy-bid-sheet-kicker { font-size: var(--ke-type-label, .72rem); color: var(--text-muted); }
.prodigy-bid-sheet-title { margin: var(--ke-space-1, 2px) 0 0; font-size: 1.15rem; color: var(--text-normal); }
.prodigy-bid-sheet-date { text-align: right; font-size: var(--ke-type-body, .84rem); font-weight: 700; }
.prodigy-bid-sheet-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--background-modifier-border);
}
.prodigy-bid-sheet-field {
  min-inline-size: 0;
  padding: var(--ke-space-3, 8px) var(--ke-space-4, 12px);
  border-inline-end: 1px solid var(--background-modifier-border);
}
.prodigy-bid-sheet-field:nth-child(2n) { border-inline-end: 0; }
.prodigy-bid-sheet-field.is-wide { grid-column: 1 / -1; border-inline-end: 0; border-top: 1px solid var(--background-modifier-border); }
.prodigy-bid-sheet-label { display: block; margin-bottom: var(--ke-space-1, 2px); font-size: var(--ke-type-label, .72rem); color: var(--text-muted); font-weight: 700; }
.prodigy-bid-sheet-value { font-size: var(--ke-type-body, .84rem); font-weight: 700; overflow-wrap: anywhere; line-height: var(--ke-leading-body, 1.45); }
.prodigy-bid-sheet-address input {
  width: 100%;
  min-height: var(--ke-touch-target, 44px);
  padding: 0 var(--ke-space-3, 8px);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--ke-radius-control, 4px);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: var(--ke-type-body, .84rem);
  font-weight: 700;
  text-align: left;
}
.prodigy-bid-sheet-money {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ke-space-3, 8px);
  padding: var(--ke-space-4, 12px);
  border-bottom: 1px solid var(--background-modifier-border);
}
.prodigy-bid-sheet-money input {
  width: 100%;
  min-height: var(--ke-touch-target, 44px);
  padding: 0 var(--ke-space-3, 8px);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--ke-radius-control, 4px);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 1rem;
  font-weight: 800;
  text-align: right;
}
.prodigy-bid-sheet-checks { padding: var(--ke-space-3, 8px) var(--ke-space-4, 12px); border-bottom: 1px solid var(--background-modifier-border); }
.prodigy-bid-sheet-checks .prodigy-aday-checklist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
.prodigy-bid-sheet-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: var(--ke-space-3, 8px);
  padding: var(--ke-space-3, 8px) var(--ke-space-4, 12px);
  background: var(--background-primary);
}
.prodigy-bid-sheet-status { flex: 1 1 auto; align-self: center; font-size: var(--ke-type-label, .72rem); color: var(--text-muted); }
@media (max-width: 480px) {
  .prodigy-aday-nav button,
  .prodigy-aday-card button {
    flex: 1 1 calc(50% - 6px);
  }
  .prodigy-aday-panel-backdrop { align-items: flex-end; padding: 0; }
  .prodigy-aday-panel { width: 100%; max-height: 96dvh; border-radius: var(--ke-radius-panel, 8px) var(--ke-radius-panel, 8px) 0 0; padding: var(--ke-space-2, 4px); }
  .prodigy-bid-sheet-head, .prodigy-bid-sheet-grid, .prodigy-bid-sheet-money { grid-template-columns: 1fr; }
  .prodigy-bid-sheet-date { text-align: left; }
  .prodigy-bid-sheet-field { border-inline-end: 0; border-top: 1px solid var(--background-modifier-border); }
  .prodigy-bid-sheet-field:first-child { border-top: 0; }
  .prodigy-bid-sheet-field.is-wide { grid-column: auto; }
  .prodigy-bid-sheet-checks .prodigy-aday-checklist { grid-template-columns: 1fr; }
  .prodigy-bid-sheet-actions { flex-wrap: wrap; }
  .prodigy-bid-sheet-actions button { min-height: var(--ke-touch-target, 44px); }
  .prodigy-bid-sheet-status { flex-basis: 100%; }
}
`;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = CSS;
  }

  function displayApi() {
    return root.prodigyDisplay || (typeof window !== "undefined" ? window.prodigyDisplay : null);
  }

  function propLabel(key) {
    const d = displayApi();
    return d && d.property ? d.property(key) : key;
  }

  function statusLabel(status) {
    const d = displayApi();
    return d && d.status ? d.status(status) : status || "미지정";
  }

  function statusColor(status) {
    const d = displayApi();
    if (d && d.statusInfo) return d.statusInfo(status).color || "var(--text-accent)";
    return "var(--text-accent)";
  }

  function formatMoney(value) {
    if (value === undefined || value === null || String(value).trim() === "") return "—";
    const parser = root.parsePrice || (typeof window !== "undefined" ? window.parsePrice : null) || Number;
    const num = parser(value);
    if (typeof num === "number" && Number.isFinite(num) && num > 0) {
      if (num >= 100000000) return `${(num / 100000000).toFixed(2)}억`;
      if (num >= 10000) return `${Math.round(num / 10000).toLocaleString()}만`;
      return num.toLocaleString();
    }
    return String(value);
  }

  function formatExactWon(value) {
    if (value === undefined || value === null || String(value).trim() === "") return "—";
    const parser = root.parsePrice || (typeof window !== "undefined" ? window.parsePrice : null) || Number;
    const num = parser(value);
    if (typeof num === "number" && Number.isFinite(num) && num > 0) return `${num.toLocaleString()}원`;
    return String(value);
  }

  function moneyInputValue(value) {
    if (value === undefined || value === null || String(value).trim() === "") return "";
    const parser = root.parsePrice || (typeof window !== "undefined" ? window.parsePrice : null) || Number;
    const num = parser(value);
    return typeof num === "number" && Number.isFinite(num) && num > 0
      ? Math.floor(num).toLocaleString("ko-KR")
      : String(value);
  }

  function bindMoneyInput(input, initialValue) {
    input.value = moneyInputValue(initialValue);
    input.addEventListener("input", () => {
      const raw = String(input.value || "").replace(/,/g, "").replace(/[^0-9]/g, "");
      input.value = raw ? Number(raw).toLocaleString("ko-KR") : "";
    });
    return input;
  }

  function notice(msg) {
    if (typeof Notice !== "undefined") new Notice(msg);
    else if (typeof console !== "undefined") console.log(msg);
  }

  function openObject(app, path) {
    if (!path || !app || !app.workspace || !app.workspace.openLinkText) return;
    app.workspace.openLinkText(path, path, false);
  }

  function renderChecklist(parent, items, values, onToggle) {
    const box = parent.createEl("div", { attr: { class: "prodigy-aday-checklist" } });
    items.forEach((item) => {
      const row = box.createEl("label", { attr: { class: "prodigy-aday-check" } });
      const input = row.createEl("input", { attr: { type: "checkbox" } });
      input.checked = !!values[item.id];
      input.onchange = () => onToggle(item.id, !!input.checked);
      row.createEl("span", { text: item.label });
    });
    return box;
  }

  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {Array} options.pages
   * @param {object} options.app
   * @param {string} [options.date] ISO date
   * @param {Date} [options.now]
   * @param {function} [options.onClose]
   */
  async function render(options) {
    const opts = options || {};
    const container = opts.container;
    const app = opts.app || root.app || (typeof window !== "undefined" ? window.app : null);
    const core = root.AuctionDayCore;
    if (!container || !core) return;
    if (typeof container.empty === "function") container.empty();
    ensureStyles();
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    const now = opts.now instanceof Date ? opts.now : new Date();
    const isBidSheetMode = opts.mode === "bid_sheet";
    let dateIso = opts.date || core.isoToday(now);
    let pages = Array.isArray(opts.pages) ? opts.pages : [];
    let dayState = await core.loadDayState(app, dateIso);
    let bidderProfile = isBidSheetMode
      ? await core.loadBidderProfile(app)
      : core.normalizeBidderProfile({});

    const rootEl = container.createEl("div", { attr: { class: "prodigy-auction-day" } });
    const header = rootEl.createEl("div", { attr: { class: "prodigy-aday-header" } });
    const titleEl = header.createEl("div", {
      text: isBidSheetMode ? "기일 입찰표" : "입찰 실행",
      attr: { class: "prodigy-aday-title" }
    });
    const subEl = header.createEl("div", {
      text: dateIso,
      attr: { class: "prodigy-aday-sub" }
    });
    const nav = header.createEl("div", { attr: { class: "prodigy-aday-nav" } });
    let prevBtn = null;
    let todayBtn = null;
    let nextBtn = null;
    if (!isBidSheetMode) {
      prevBtn = nav.createEl("button", { text: "‹", attr: { type: "button", "aria-label": "이전 날" } });
      todayBtn = nav.createEl("button", { text: "오늘", attr: { type: "button" } });
      nextBtn = nav.createEl("button", { text: "›", attr: { type: "button", "aria-label": "다음 날" } });
    }
    if (typeof opts.onClose === "function") {
      const closeBtn = nav.createEl("button", { text: "닫기", attr: { type: "button" } });
      closeBtn.onclick = () => opts.onClose();
    }

    const body = rootEl.createEl("div");

    function shiftDate(delta) {
      const [y, m, d] = dateIso.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + delta);
      dateIso = core.isoToday(dt);
      paint();
    }

    async function persistState() {
      try {
        dayState = await core.saveDayState(app, dayState) || dayState;
      } catch (err) {
        notice("실행 체크리스트 저장 실패: " + (err && err.message ? err.message : err));
      }
    }

    async function refreshPagesFromVault() {
      // Prefer live pages if caller re-queries; otherwise keep current snapshot and rely on FM updates.
      if (typeof opts.reloadPages === "function") {
        try {
          const next = await opts.reloadPages(dateIso);
          if (Array.isArray(next)) pages = next;
        } catch (_e) { /* keep */ }
      }
    }

    function addSheetField(parent, label, value, wide) {
      const field = parent.createEl("div", {
        attr: { class: `prodigy-bid-sheet-field${wide ? " is-wide" : ""}` }
      });
      field.createEl("span", { text: label, attr: { class: "prodigy-bid-sheet-label" } });
      field.createEl("div", { text: value || "—", attr: { class: "prodigy-bid-sheet-value" } });
      return field;
    }

    function renderBidSheet(parent, item) {
      const page = item.page || {};
      const path = item.object_path || item.path;
      const values = core.resolveBidSheetValues(page);
      const sheet = parent.createEl("section", {
        attr: { class: "prodigy-bid-sheet", "aria-label": `${item.case_number || item.title} 기일 입찰표` }
      });

      const sheetHead = sheet.createEl("header", { attr: { class: "prodigy-bid-sheet-head" } });
      const headTitle = sheetHead.createEl("div");
      headTitle.createEl("div", { text: item.court || "법원 미지정", attr: { class: "prodigy-bid-sheet-kicker" } });
      headTitle.createEl("h2", { text: "기일 입찰표", attr: { class: "prodigy-bid-sheet-title" } });
      sheetHead.createEl("div", {
        text: `입찰기일 ${core.toIsoDate(item.auction_datetime) || dateIso}`,
        attr: { class: "prodigy-bid-sheet-date" }
      });

      const info = sheet.createEl("div", { attr: { class: "prodigy-bid-sheet-grid" } });
      addSheetField(info, propLabel("case_number"), item.case_number || item.title);
      addSheetField(info, propLabel("auction_dept"), page.auction_dept || "—");
      const addressField = info.createEl("label", {
        attr: { class: "prodigy-bid-sheet-field prodigy-bid-sheet-address is-wide" }
      });
      addressField.createEl("span", { text: "입찰자 주소", attr: { class: "prodigy-bid-sheet-label" } });
      const bidderAddressInput = addressField.createEl("input", {
        attr: {
          type: "text",
          autocomplete: "street-address",
          "aria-label": "입찰자 주소",
          placeholder: "입찰자 주소를 입력하세요"
        }
      });
      bidderAddressInput.value = bidderProfile.bidder_address;
      addSheetField(info, propLabel("minimum_bid"), formatExactWon(item.minimum_bid));
      addSheetField(info, propLabel("expected_bid"), formatExactWon(item.expected_bid));

      const money = sheet.createEl("div", { attr: { class: "prodigy-bid-sheet-money" } });
      const bidField = money.createEl("label");
      bidField.createEl("span", { text: "입찰가", attr: { class: "prodigy-bid-sheet-label" } });
      const bidInput = bidField.createEl("input", {
        attr: { type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": "입찰가 원 단위" }
      });
      bindMoneyInput(bidInput, values.final_bid);

      const depositField = money.createEl("label");
      depositField.createEl("span", { text: propLabel("bid_deposit"), attr: { class: "prodigy-bid-sheet-label" } });
      const depositInput = depositField.createEl("input", {
        attr: { type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": "입찰 보증금 원 단위" }
      });
      bindMoneyInput(depositInput, values.bid_deposit);

      const checksBox = sheet.createEl("div", { attr: { class: "prodigy-bid-sheet-checks" } });
      checksBox.createEl("div", { text: "제출 전 확인", attr: { class: "prodigy-aday-section-label" } });
      const checks = core.getAuctionChecks(dayState, path);
      renderChecklist(checksBox, core.AUCTION_EXEC_ITEMS, checks, async (itemId, checked) => {
        dayState = core.setAuctionCheckItem(dayState, path, itemId, checked);
        await persistState();
      });

      const actions = sheet.createEl("footer", { attr: { class: "prodigy-bid-sheet-actions" } });
      const status = actions.createEl("div", { attr: { class: "prodigy-bid-sheet-status", role: "status" } });
      const openBtn = actions.createEl("button", {
        text: "물건 열기",
        attr: { type: "button", class: "prodigy-aday-open" }
      });
      openBtn.onclick = () => openObject(app, path);
      const saveBtn = actions.createEl("button", {
        text: "입찰표 확정",
        attr: { type: "button", class: "prodigy-aday-save-bid is-primary" }
      });
      saveBtn.onclick = async () => {
        try {
          saveBtn.disabled = true;
          status.textContent = "저장 중…";
          bidderProfile = await core.saveBidderProfile(app, {
            bidder_address: bidderAddressInput.value
          });
          const saved = await core.saveBidSheet(app, path, {
            final_bid: bidInput.value,
            bid_deposit: depositInput.value
          });
          item.my_bid_price = saved.my_bid_price;
          item.bid_deposit = saved.bid_deposit;
          page.my_bid_price = saved.my_bid_price;
          page.bid_deposit = saved.bid_deposit;
          dayState = core.setAuctionCheckItem(dayState, path, "final_bid_checked", true);
          dayState = core.setAuctionCheckItem(dayState, path, "deposit_checked", true);
          await persistState();
          bidderAddressInput.value = bidderProfile.bidder_address;
          bidInput.value = moneyInputValue(saved.my_bid_price);
          depositInput.value = moneyInputValue(saved.bid_deposit);
          status.textContent = "입찰자 주소, 입찰가와 보증금을 저장했습니다.";
          notice("입찰표가 확정되었습니다.");
        } catch (err) {
          status.textContent = err && err.message ? err.message : "입찰표 저장 실패";
          notice(status.textContent);
        } finally {
          saveBtn.disabled = false;
        }
      };
    }

    function paint() {
      subEl.setText ? subEl.setText(dateIso) : (subEl.textContent = dateIso);
      if (typeof body.empty === "function") body.empty();
      else body.innerHTML = "";

      const model = core.buildDayModel(pages, dateIso, dayState);

      if (!model.total) {
        const emptyText = dateIso === core.isoToday(now)
          ? "오늘 예정된 입찰이 없습니다."
          : "이 날짜에 예정된 입찰이 없습니다.";
        body.createEl("div", {
          text: emptyText,
          attr: { class: "prodigy-aday-empty" }
        });
        return;
      }

      if (isBidSheetMode) {
        const auctions = model.courts.flatMap((court) => court.auctions || []);
        const focusPath = opts.focusPath ? String(opts.focusPath) : "";
        const focused = auctions.find((item) => (item.object_path || item.path) === focusPath) || auctions[0];
        if (focused) renderBidSheet(body, focused);
        return;
      }

      model.courts.forEach((courtGroup) => {
        const courtEl = body.createEl("div", { attr: { class: "prodigy-aday-court" } });
        const head = courtEl.createEl("div", { attr: { class: "prodigy-aday-court-head" } });
        head.createEl("div", {
          text: courtGroup.court,
          attr: { class: "prodigy-aday-court-name" }
        });
        head.createEl("div", {
          text: `입찰 ${courtGroup.count}`,
          attr: { class: "prodigy-aday-court-count" }
        });

        courtEl.createEl("div", {
          text: "준비",
          attr: { class: "prodigy-aday-section-label" }
        });

        const prepValues = core.getCourtPrep(dayState, courtGroup.court);
        renderChecklist(courtEl, core.COURT_PREP_ITEMS, prepValues, async (itemId, checked) => {
          dayState = core.setCourtPrepItem(dayState, courtGroup.court, itemId, checked);
          await persistState();
        });

        courtEl.createEl("div", {
          text: "입찰 카드",
          attr: { class: "prodigy-aday-section-label" }
        });

        courtGroup.auctions.forEach((item) => {
          renderAuctionExecCard(courtEl, item);
        });
      });
    }

    function renderAuctionExecCard(parent, item) {
      const page = item.page || {};
      const path = item.object_path || item.path;
      const focusPath = opts.focusPath ? String(opts.focusPath) : "";
      const isFocus = focusPath && path && focusPath === path;
      const card = parent.createEl("div", {
        attr: {
          class: "prodigy-aday-card" + (isFocus ? " is-focus" : ""),
          "data-path": path || "",
          style: `border-left-color: ${statusColor(item.status)};`
        }
      });

      const title = card.createEl("div", { attr: { class: "prodigy-aday-card-title" } });
      title.createEl("span", { text: `⚖️ ${item.case_number || item.title}` });
      if (item.property_name) {
        title.createEl("span", {
          text: ` · ${item.property_name}`,
          attr: { style: "font-weight:600;color:var(--text-muted);font-size:0.9em;" }
        });
      }

      const kind = core.decisionKind(page);
      const decisionText = core.decisionLabel(kind, displayApi());

      const meta = card.createEl("div", { attr: { class: "prodigy-aday-card-meta" } });
      meta.createEl("div", {
        text: `${propLabel("status")}: ${statusLabel(item.status)} · 결정: ${decisionText}`
      });
      meta.createEl("div", {
        text: [
          `${propLabel("minimum_bid")}: ${formatExactWon(item.minimum_bid)}`,
          `${propLabel("expected_bid")}: ${formatExactWon(item.expected_bid)}`,
          `${propLabel("bid_deposit")}: ${formatExactWon(item.bid_deposit)}`
        ].join(" · ")
      });

      // Auction Day receives the dashboard snapshot; it does not read or write
      // packet data. Terminal cards never render a Decision Packet.
      const decisionPacket = root.AuctionDecisionPacket;
      const packetContext = opts.packetContext || root.AuctionDecisionPacketDashboardContext;
      if (decisionPacket && decisionPacket.isActionable && decisionPacket.isActionable(page)) {
        const packetHost = card.createEl("div", { attr: { class: "prodigy-auction-decision-packet-host" } });
        decisionPacket.renderForAuction(packetHost, {
          app,
          auction: page,
          context: packetContext
        });
      }

      // Final bid confirmation
      const bidRow = card.createEl("div", { attr: { class: "prodigy-aday-row" } });
      bidRow.createEl("label", { text: propLabel("my_bid_price") });
      const bidInput = bidRow.createEl("input", {
        attr: {
          type: "text",
          inputmode: "numeric",
          placeholder: "최종 입찰가 (원)",
          value: hasDisplayValue(item.my_bid_price) ? String(item.my_bid_price) : ""
        }
      });
      // set value properly for Obsidian createEl
      if (hasDisplayValue(item.my_bid_price)) bidInput.value = String(item.my_bid_price);

      const saveBidBtn = bidRow.createEl("button", {
        text: "입찰가 확정",
        attr: { type: "button", class: "prodigy-aday-save-bid is-primary" }
      });
      saveBidBtn.onclick = async () => {
        try {
          saveBidBtn.disabled = true;
          const value = await core.saveFinalBid(app, path, bidInput.value);
          item.my_bid_price = value;
          if (page) page.my_bid_price = value;
          notice(`${propLabel("my_bid_price")} 저장됨`);
          // mark final bid checked
          dayState = core.setAuctionCheckItem(dayState, path, "final_bid_checked", true);
          await persistState();
          paint();
        } catch (err) {
          notice(err && err.message ? err.message : "입찰가 저장 실패");
        } finally {
          saveBidBtn.disabled = false;
        }
      };

      // Execution checklist
      card.createEl("div", {
        text: "실행 확인",
        attr: { class: "prodigy-aday-section-label" }
      });
      const checks = core.getAuctionChecks(dayState, path);
      renderChecklist(card, core.AUCTION_EXEC_ITEMS, checks, async (itemId, checked) => {
        dayState = core.setAuctionCheckItem(dayState, path, itemId, checked);
        await persistState();
      });

      // Result recording (existing statuses only)
      if (item.status === "bidding" || item.status === "watching") {
        card.createEl("div", {
          text: "결과 기록",
          attr: { class: "prodigy-aday-section-label" }
        });

        const winRow = card.createEl("div", { attr: { class: "prodigy-aday-row" } });
        winRow.createEl("label", { text: propLabel("winning_bid_price") });
        const winInput = winRow.createEl("input", {
          attr: { type: "text", inputmode: "numeric", placeholder: "선택" }
        });

        const bidderRow = card.createEl("div", { attr: { class: "prodigy-aday-row" } });
        bidderRow.createEl("label", { text: "응찰 수" });
        const bidderInput = bidderRow.createEl("input", {
          attr: { type: "text", inputmode: "numeric", placeholder: "선택" }
        });

        const memoRow = card.createEl("div", { attr: { class: "prodigy-aday-row" } });
        memoRow.createEl("label", { text: "메모" });
        const memoInput = memoRow.createEl("textarea", {
          attr: { placeholder: "한 줄 메모 (선택)" }
        });

        const actions = card.createEl("div", { attr: { class: "prodigy-aday-actions" } });
        const outcomes = [
          { key: "won", label: statusLabel("won"), cls: "is-ok" },
          { key: "lost", label: statusLabel("lost"), cls: "is-danger" },
          { key: "skipped", label: statusLabel("skipped"), cls: "" }
        ];
        outcomes.forEach((out) => {
          const btn = actions.createEl("button", {
            text: out.label,
            attr: { type: "button", class: `prodigy-aday-result-btn ${out.cls}`.trim() }
          });
          btn.onclick = async () => {
            try {
              btn.disabled = true;
              await core.recordResult(app, path, {
                outcome: out.key,
                finalBid: bidInput.value,
                winningPrice: winInput.value,
                bidderCount: bidderInput.value,
                memo: memoInput.value
              });
              notice(`결과 기록: ${out.label}`);
              item.status = out.key;
              if (page) page.status = out.key;
              await refreshPagesFromVault();
              // Best-effort: update local page snapshot fields
              if (page) {
                if (bidInput.value) page.my_bid_price = bidInput.value;
                if (winInput.value) page.winning_bid_price = winInput.value;
              }
              paint();
              if (out.key === "won" || out.key === "lost") {
                notice("복기 대기 큐에 올랐습니다. 대시보드 「복기 대기」에서 이어가세요.", 6000);
              }
            } catch (err) {
              notice(err && err.message ? err.message : "결과 기록 실패");
            } finally {
              btn.disabled = false;
            }
          };
        });
      } else {
        const badge = card.createEl("div", { attr: { class: "prodigy-aday-badge", style: "margin-top:8px;" } });
        badge.setText
          ? badge.setText(`결과: ${statusLabel(item.status)}`)
          : (badge.textContent = `결과: ${statusLabel(item.status)}`);
        // After result: one-tap start review (won/lost → reviewing)
        if (item.status === "won" || item.status === "lost") {
          const revBtn = card.createEl("button", {
            text: "복기 시작",
            attr: { type: "button", class: "prodigy-aday-result-btn is-primary", style: "margin-top:8px;" }
          });
          revBtn.onclick = async () => {
            try {
              revBtn.disabled = true;
              const tFile = app.vault.getAbstractFileByPath(path);
              if (!tFile || !app.fileManager) throw new Error("Object를 찾을 수 없습니다.");
              await app.fileManager.processFrontMatter(tFile, (fm) => {
                fm.status = "reviewing";
                fm.updated = core.isoToday(now);
              });
              item.status = "reviewing";
              if (page) page.status = "reviewing";
              notice("복기를 시작했습니다.");
              await refreshPagesFromVault();
              paint();
            } catch (err) {
              notice(err && err.message ? err.message : "복기 시작 실패");
            } finally {
              revBtn.disabled = false;
            }
          };
        }
      }

      const openRow = card.createEl("div", { attr: { class: "prodigy-aday-actions" } });
      const openBtn = openRow.createEl("button", {
        text: "물건 열기",
        attr: { type: "button", class: "prodigy-aday-open" }
      });
      openBtn.onclick = () => openObject(app, path);
    }

    function hasDisplayValue(v) {
      return v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "정보 없음";
    }

    if (prevBtn) prevBtn.onclick = () => shiftDate(-1);
    if (nextBtn) nextBtn.onclick = () => shiftDate(1);
    if (todayBtn) todayBtn.onclick = () => {
      dateIso = core.isoToday(now);
      paint();
    };

    // Load state for current date then paint
    dayState = await core.loadDayState(app, dateIso);
    paint();

    // Focus card from dashboard list (round-trip)
    if (opts.focusPath) {
      setTimeout(() => {
        try {
          const el = rootEl.querySelector
            ? rootEl.querySelector(`.prodigy-aday-card[data-path="${String(opts.focusPath).replace(/"/g, '\\"')}"]`)
            : null;
          if (el && typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        } catch (_e) { /* ignore */ }
      }, 50);
    }
  }

  /**
   * Open Day Runner for a specific auction (card → runner).
   * Loads vault pages if not provided.
   */
  async function openForAuction(options) {
    const opts = options || {};
    const app = opts.app || root.app;
    const core = root.AuctionDayCore;
    if (!app || !core) {
      notice("입찰 실행을 열 수 없습니다.");
      return null;
    }
    let pages = Array.isArray(opts.pages) ? opts.pages : null;
    if (!pages || !pages.length) {
      pages = typeof core.pagesFromVault === "function" ? core.pagesFromVault(app) : [];
    }
    let dateIso = opts.date || "";
    if (!dateIso && opts.path) {
      const hit = pages.find((p) => core.pagePath(p) === opts.path);
      dateIso = core.toIsoDate(hit && hit.auction_datetime) || core.isoToday();
    }
    if (!dateIso) dateIso = core.isoToday();
    return openPanel({
      app,
      pages,
      date: dateIso,
      mode: "bid_sheet",
      focusPath: opts.path || opts.focusPath || "",
      packetContext: opts.packetContext || root.AuctionDecisionPacketDashboardContext,
      reloadPages: async () => (typeof core.pagesFromVault === "function" ? core.pagesFromVault(app) : pages),
      onClose: opts.onClose
    });
  }

  /**
   * Open runner in a modal-like full panel (for calendar entry).
   */
  async function openPanel(options) {
    const opts = options || {};
    const app = opts.app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (typeof document === "undefined") {
      return render(opts);
    }
    ensureStyles();

    const existing = document.querySelector(".prodigy-aday-panel-backdrop");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const backdrop = document.createElement("div");
    backdrop.className = "prodigy-aday-panel-backdrop";
    const panel = document.createElement("div");
    panel.className = "prodigy-aday-panel";
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    backdrop.onclick = (ev) => {
      if (ev.target === backdrop) backdrop.remove();
    };

    // Obsidian-like createEl on plain panel
    panel.createEl = function (tag, o) {
      const el = document.createElement(tag);
      if (o && o.text != null) el.textContent = o.text;
      if (o && o.attr) {
        Object.keys(o.attr).forEach((k) => {
          if (k === "class") el.className = o.attr[k];
          else el.setAttribute(k, o.attr[k]);
        });
      }
      this.appendChild(el);
      if (!el.createEl) el.createEl = panel.createEl.bind(el);
      if (!el.createSpan) el.createSpan = function (x) { return this.createEl("span", x); };
      if (!el.empty) el.empty = function () { this.innerHTML = ""; };
      return el;
    };
    panel.empty = function () { this.innerHTML = ""; };

    await render({
      container: panel,
      app,
      pages: opts.pages || [],
      date: opts.date,
      mode: opts.mode,
      focusPath: opts.focusPath,
      now: opts.now,
      packetContext: opts.packetContext || root.AuctionDecisionPacketDashboardContext,
      reloadPages: opts.reloadPages,
      onClose: () => backdrop.remove()
    });

    return { close: () => backdrop.remove() };
  }

  const api = {
    render,
    openPanel,
    openForAuction,
    ensureStyles
  };

  root.AuctionDayView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
