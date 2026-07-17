(function (root) {
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
  border-color: #ef4444;
  color: #ef4444;
}
.prodigy-aday-result-btn.is-ok {
  border-color: #22c55e;
  color: #22c55e;
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
@media (max-width: 480px) {
  .prodigy-aday-nav button,
  .prodigy-aday-card button {
    flex: 1 1 calc(50% - 6px);
  }
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
    let dateIso = opts.date || core.isoToday(now);
    let pages = Array.isArray(opts.pages) ? opts.pages : [];
    let dayState = await core.loadDayState(app, dateIso);

    const rootEl = container.createEl("div", { attr: { class: "prodigy-auction-day" } });
    const header = rootEl.createEl("div", { attr: { class: "prodigy-aday-header" } });
    const titleEl = header.createEl("div", {
      text: "입찰 실행",
      attr: { class: "prodigy-aday-title" }
    });
    const subEl = header.createEl("div", {
      text: dateIso,
      attr: { class: "prodigy-aday-sub" }
    });
    const nav = header.createEl("div", { attr: { class: "prodigy-aday-nav" } });
    const prevBtn = nav.createEl("button", { text: "‹", attr: { type: "button", "aria-label": "이전 날" } });
    const todayBtn = nav.createEl("button", { text: "오늘", attr: { type: "button" } });
    const nextBtn = nav.createEl("button", { text: "›", attr: { type: "button", "aria-label": "다음 날" } });
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
      const card = parent.createEl("div", {
        attr: {
          class: "prodigy-aday-card",
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
          `${propLabel("minimum_bid")}: ${formatMoney(item.minimum_bid)}`,
          `${propLabel("expected_bid")}: ${formatMoney(item.expected_bid)}`,
          `${propLabel("bid_deposit")}: ${formatMoney(item.bid_deposit)}`
        ].join(" · ")
      });

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

    prevBtn.onclick = () => shiftDate(-1);
    nextBtn.onclick = () => shiftDate(1);
    todayBtn.onclick = () => {
      dateIso = core.isoToday(now);
      paint();
    };

    // Load state for current date then paint
    dayState = await core.loadDayState(app, dateIso);
    paint();
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
    backdrop.style.cssText = "position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;padding:8px;";
    const panel = document.createElement("div");
    panel.className = "prodigy-aday-panel";
    panel.style.cssText = "width:min(640px,100%);max-height:92vh;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--background-primary);border-radius:12px;padding:8px;border:1px solid var(--background-modifier-border);";
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
      now: opts.now,
      reloadPages: opts.reloadPages,
      onClose: () => backdrop.remove()
    });

    return { close: () => backdrop.remove() };
  }

  const api = {
    render,
    openPanel,
    ensureStyles
  };

  root.AuctionDayView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
