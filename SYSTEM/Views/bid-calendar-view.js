(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-bid-calendar-styles";

  const CSS = `
.prodigy-bid-calendar {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 12px;
  margin: 4px 0 12px 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  font-size: 0.9em;
}
.prodigy-bid-calendar * { box-sizing: border-box; }
.prodigy-bid-cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.prodigy-bid-cal-title {
  font-weight: 700;
  font-size: 0.98em;
  color: var(--text-accent);
  min-width: 0;
}
.prodigy-bid-cal-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}
.prodigy-bid-cal-nav button,
.prodigy-bid-cal-modes button,
.prodigy-bid-cal-item-open,
.prodigy-bid-cal-popup-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  min-width: 32px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.85em;
  font-weight: 600;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}
.prodigy-bid-cal-nav button:active,
.prodigy-bid-cal-modes button:active,
.prodigy-bid-cal-item-open:active {
  transform: translateY(1px);
}
.prodigy-bid-cal-modes {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.prodigy-bid-cal-modes button.is-active {
  border-color: var(--text-accent);
  color: var(--text-accent);
  background: color-mix(in srgb, var(--text-accent) 12%, var(--background-primary));
}
.prodigy-bid-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}
.prodigy-bid-cal-dow {
  text-align: center;
  font-size: 0.72em;
  color: var(--text-muted);
  font-weight: 600;
  padding: 2px 0;
}
.prodigy-bid-cal-cell {
  position: relative;
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: default;
  padding: 4px 2px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.prodigy-bid-cal-cell.in-month {
  background: var(--background-primary);
  border-color: var(--background-modifier-border);
  cursor: pointer;
}
.prodigy-bid-cal-cell.in-month:hover {
  border-color: var(--text-accent);
}
.prodigy-bid-cal-cell.is-today {
  box-shadow: inset 0 0 0 1.5px var(--text-accent);
}
.prodigy-bid-cal-cell.has-events {
  cursor: pointer;
}
.prodigy-bid-cal-cell .day-num {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-normal);
  line-height: 1.1;
}
.prodigy-bid-cal-cell.out-month .day-num {
  color: var(--text-faint);
  opacity: 0.4;
}
.prodigy-bid-cal-cell .event-dot {
  font-size: 0.68em;
  font-weight: 700;
  color: var(--text-accent);
  line-height: 1;
  min-height: 12px;
}
.prodigy-bid-cal-empty {
  color: var(--text-muted);
  font-size: 0.88em;
  padding: 10px 4px;
  text-align: center;
}
.prodigy-bid-cal-agenda-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin: 0 0 6px 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-weight: 700;
  font-size: 0.88em;
  cursor: pointer;
  text-align: left;
  -webkit-appearance: none;
  appearance: none;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}
.prodigy-bid-cal-agenda-toggle:hover {
  border-color: var(--text-accent);
}
.prodigy-bid-cal-agenda-toggle .toggle-label {
  color: var(--text-muted);
  min-width: 0;
}
.prodigy-bid-cal-agenda-toggle .toggle-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.92em;
  flex-shrink: 0;
}
.prodigy-bid-cal-agenda-toggle .toggle-chevron {
  color: var(--text-accent);
  font-size: 0.95em;
  line-height: 1;
}
.prodigy-bid-cal-agenda {
  border-top: none;
  padding-top: 4px;
  max-height: none;
  overflow: visible;
}
.prodigy-bid-cal-agenda.is-collapsed {
  display: none;
}
.prodigy-bid-cal-agenda-day {
  margin-bottom: 12px;
}
.prodigy-bid-cal-agenda-day-title {
  font-weight: 700;
  font-size: 0.9em;
  margin-bottom: 6px;
  color: var(--text-normal);
}
.prodigy-bid-cal-court {
  margin: 0 0 8px 8px;
  padding-left: 8px;
  border-left: 2px solid var(--background-modifier-border);
}
.prodigy-bid-cal-court-name {
  font-weight: 600;
  font-size: 0.84em;
  color: var(--text-accent);
  margin-bottom: 2px;
}
.prodigy-bid-cal-type-line {
  font-size: 0.82em;
  color: var(--text-muted);
  margin-left: 4px;
}
.prodigy-bid-cal-popup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
}
.prodigy-bid-cal-popup {
  width: min(560px, 100%);
  max-height: min(78vh, 640px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px 12px 8px 8px;
  padding: 14px 14px 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.28);
}
.prodigy-bid-cal-popup-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.prodigy-bid-cal-popup-title {
  font-weight: 700;
  font-size: 1.05em;
  color: var(--text-normal);
}
.prodigy-bid-cal-type-block {
  margin-bottom: 12px;
}
.prodigy-bid-cal-type-head {
  font-weight: 700;
  font-size: 0.9em;
  color: var(--text-accent);
  margin-bottom: 6px;
}
.prodigy-bid-cal-item {
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  background: var(--background-secondary);
  font-size: 0.84em;
  line-height: 1.4;
}
.prodigy-bid-cal-item-title {
  font-weight: 700;
  margin-bottom: 2px;
}
.prodigy-bid-cal-item-meta {
  color: var(--text-muted);
  font-size: 0.95em;
}
.prodigy-bid-cal-item-actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}
.prodigy-bid-cal-card-host {
  margin-bottom: 8px;
}
.prodigy-bid-cal-card-host > div {
  margin-bottom: 8px;
}
@media (min-width: 768px) {
  .prodigy-bid-cal-popup-backdrop {
    align-items: center;
  }
  .prodigy-bid-cal-popup {
    border-radius: 12px;
  }
  .prodigy-bid-cal-cell {
    min-height: 44px;
  }
}
@media (max-width: 480px) {
  .prodigy-bid-cal-cell {
    min-height: 44px;
    padding: 6px 2px;
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

  function eventTypeLabel(type) {
    const display = displayApi();
    const core = root.BidCalendarCore;
    const prop = core && core.eventTypeProperty ? core.eventTypeProperty(type) : "";
    if (display && prop) return display.property(prop);
    const fallback = { bid: "입찰", site_visit: "현장 방문", review: "복기" };
    return fallback[type] || type;
  }

  function statusLabel(status) {
    const display = displayApi();
    if (display && display.status) return display.status(status);
    return status || "미지정";
  }

  function propertyLabel(key) {
    const display = displayApi();
    if (display && display.property) return display.property(key);
    return key;
  }

  function formatExpectedBid(value) {
    if (value === undefined || value === null || String(value).trim() === "") return "";
    const parser = root.parsePrice || (typeof window !== "undefined" ? window.parsePrice : null) || Number;
    const num = parser(value);
    if (typeof num === "number" && Number.isFinite(num) && num > 0) {
      if (num >= 100000000) return `${(num / 100000000).toFixed(2)}억`;
      if (num >= 10000) return `${Math.round(num / 10000)}만`;
      return String(num);
    }
    return String(value);
  }

  function formatDateLabel(iso) {
    if (!iso) return "";
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return `${Number(parts[0])}년 ${Number(parts[1])}월 ${Number(parts[2])}일`;
  }

  function formatMonthTitle(year, monthIndex) {
    return `${year}년 ${monthIndex + 1}월`;
  }

  function openObject(app, path) {
    if (!path || !app || !app.workspace || !app.workspace.openLinkText) return;
    app.workspace.openLinkText(path, path, false);
  }

  function closePopup(backdrop) {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  }

  /** DOM create helper that works for both Obsidian createEl hosts and plain elements. */
  function el(parent, tag, opts) {
    const options = opts || {};
    let node;
    if (parent && typeof parent.createEl === "function" && !parent.__prodigyPlainEl) {
      node = parent.createEl(tag, options);
    } else {
      node = document.createElement(tag);
      if (options.text != null) node.textContent = options.text;
      if (options.attr) {
        Object.keys(options.attr).forEach((key) => {
          if (key === "class") node.className = options.attr[key];
          else node.setAttribute(key, options.attr[key]);
        });
      }
      if (parent) parent.appendChild(node);
    }
    return ensureCreateEl(node);
  }

  /** Ensure nested createEl/createSpan work so Auction Card can render in popup DOM. */
  function ensureCreateEl(node) {
    if (!node || typeof node !== "object") return node;
    if (node.__prodigyCreateElReady) return node;

    const originalCreateEl = typeof node.createEl === "function" ? node.createEl.bind(node) : null;

    node.createEl = function (tag, opts) {
      if (originalCreateEl && !node.__prodigyPlainEl) {
        return ensureCreateEl(originalCreateEl(tag, opts));
      }
      return el(this, tag, opts);
    };
    if (typeof node.createSpan !== "function") {
      node.createSpan = function (opts) {
        return this.createEl("span", opts);
      };
    }
    if (typeof node.createDiv !== "function") {
      node.createDiv = function (opts) {
        return this.createEl("div", opts);
      };
    }
    node.__prodigyCreateElReady = true;
    return node;
  }

  function resolvePageForEvent(event, pageByPath) {
    if (!event) return null;
    if (event.page) {
      const page = event.page;
      const path = event.object_path || event.path
        || (page.file && page.file.path) || page.path || "";
      if (page.file && page.file.path) return page;
      if (path) {
        return Object.assign({}, page, {
          file: page.file || {
            path,
            name: path.split("/").pop() || path
          }
        });
      }
      return page;
    }
    const path = event.object_path || event.path || "";
    if (path && pageByPath && pageByPath[path]) return pageByPath[path];
    return null;
  }

  function buildPageIndex(pages) {
    const map = Object.create(null);
    (Array.isArray(pages) ? pages : []).forEach((page) => {
      if (!page) return;
      const path = (page.file && page.file.path) || page.path || "";
      if (path) map[path] = page;
    });
    return map;
  }

  function renderFallbackItem(parent, event, app) {
    const item = el(parent, "div", { attr: { class: "prodigy-bid-cal-item" } });
    el(item, "div", {
      text: event.title || "제목 없음",
      attr: { class: "prodigy-bid-cal-item-title" }
    });

    const metaLines = [];
    metaLines.push(`${propertyLabel("status")}: ${statusLabel(event.status)}`);
    metaLines.push(`${propertyLabel("court")}: ${event.court || "법원 미지정"}`);
    if (event.bid_date) {
      metaLines.push(`${propertyLabel("auction_datetime")}: ${event.bid_date}${event.type === "bid" && event.time ? ` ${event.time}` : ""}`);
    } else if (event.time && event.type === "bid") {
      metaLines.push(`${propertyLabel("auction_datetime")}: ${event.date} ${event.time}`);
    }
    const expected = formatExpectedBid(event.expected_bid);
    if (expected) {
      metaLines.push(`${propertyLabel("expected_bid")}: ${expected}`);
    }

    el(item, "div", {
      text: metaLines.join(" · "),
      attr: { class: "prodigy-bid-cal-item-meta" }
    });

    const actions = el(item, "div", { attr: { class: "prodigy-bid-cal-item-actions" } });
    const openBtn = el(actions, "button", {
      text: "물건 열기",
      attr: { class: "prodigy-bid-cal-item-open", type: "button" }
    });
    openBtn.onclick = (ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      openObject(app, event.object_path || event.path);
    };
  }

  /** Prefer the real Auction Card; fall back to compact row only if card cannot render. */
  function renderEventCard(parent, event, app, pageByPath) {
    const host = el(parent, "div", { attr: { class: "prodigy-bid-cal-card-host" } });
    const renderCard = root.renderAuctionCard
      || (typeof window !== "undefined" ? window.renderAuctionCard : null);
    const page = resolvePageForEvent(event, pageByPath);

    if (renderCard && page) {
      try {
        renderCard(page, ensureCreateEl(host));
        return;
      } catch (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[BidCalendar] Auction card render failed, using fallback", err);
        }
        if (typeof host.empty === "function") host.empty();
        else host.innerHTML = "";
      }
    }
    renderFallbackItem(host, event, app);
  }

  function uniqueEventsByObject(events) {
    const seen = new Set();
    const out = [];
    (Array.isArray(events) ? events : []).forEach((event) => {
      const key = event.object_path || event.path || event.title;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(event);
    });
    return out;
  }

  function showDatePopup(options) {
    const { app, date, events, pageByPath } = options;
    if (typeof document === "undefined") return;

    const existing = document.querySelector(".prodigy-bid-cal-popup-backdrop");
    if (existing) closePopup(existing);

    const backdrop = el(document.body, "div", { attr: { class: "prodigy-bid-cal-popup-backdrop" } });
    // Mark plain DOM so nested el() does not assume Obsidian host semantics incorrectly
    backdrop.__prodigyPlainEl = true;
    const popup = el(backdrop, "div", { attr: { class: "prodigy-bid-cal-popup" } });
    popup.__prodigyPlainEl = true;
    const head = el(popup, "div", { attr: { class: "prodigy-bid-cal-popup-head" } });
    el(head, "div", {
      text: formatDateLabel(date),
      attr: { class: "prodigy-bid-cal-popup-title" }
    });
    const closeBtn = el(head, "button", {
      text: "닫기",
      attr: { class: "prodigy-bid-cal-popup-close", type: "button" }
    });
    closeBtn.onclick = () => closePopup(backdrop);
    backdrop.onclick = (ev) => {
      if (ev.target === backdrop) closePopup(backdrop);
    };

    if (!events || !events.length) {
      el(popup, "div", {
        text: "예정된 입찰 일정이 없습니다.",
        attr: { class: "prodigy-bid-cal-empty" }
      });
      return;
    }

    // Entry into Auction Day Runner for this date (execution, not planning)
    const dayView = root.AuctionDayView || (typeof window !== "undefined" ? window.AuctionDayView : null);
    if (dayView && dayView.openPanel) {
      const runBtn = el(popup, "button", {
        text: "이 날 입찰 실행",
        attr: {
          type: "button",
          class: "prodigy-bid-cal-item-open",
          style: "width:100%;margin-bottom:10px;min-height:40px;font-weight:700;"
        }
      });
      runBtn.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        closePopup(backdrop);
        const pagesForDay = [];
        const seen = new Set();
        events.forEach((e) => {
          const p = e.page || (pageByPath && pageByPath[e.object_path || e.path]);
          const path = (p && p.file && p.file.path) || e.object_path || e.path;
          if (!path || seen.has(path)) return;
          seen.add(path);
          if (p) pagesForDay.push(p);
        });
        // Prefer full index pages so non-bid fields remain available
        const allPages = pageByPath
          ? Object.keys(pageByPath).map((k) => pageByPath[k])
          : pagesForDay;
        dayView.openPanel({
          app,
          pages: allPages.length ? allPages : pagesForDay,
          date
        });
      };
    }

    const core = root.BidCalendarCore;
    const byType = core.groupByType(events);
    byType.forEach((group) => {
      const block = el(popup, "div", { attr: { class: "prodigy-bid-cal-type-block" } });
      el(block, "div", {
        text: `${eventTypeLabel(group.type)} (${group.events.length})`,
        attr: { class: "prodigy-bid-cal-type-head" }
      });

      const courtGroups = core.groupByCourt(group.events);
      courtGroups.forEach((cg) => {
        const courtEl = el(block, "div", { attr: { class: "prodigy-bid-cal-court" } });
        el(courtEl, "div", {
          text: cg.court,
          attr: { class: "prodigy-bid-cal-court-name" }
        });
        uniqueEventsByObject(cg.events).forEach((event) => {
          renderEventCard(courtEl, event, app, pageByPath);
        });
      });
    });
  }

  function renderAgenda(parent, agenda, app, pageByPath) {
    parent.empty();
    if (!agenda || !agenda.total) {
      parent.createEl("div", {
        text: "예정된 입찰 일정이 없습니다.",
        attr: { class: "prodigy-bid-cal-empty" }
      });
      return;
    }

    agenda.days.forEach((day) => {
      const dayEl = parent.createEl("div", { attr: { class: "prodigy-bid-cal-agenda-day" } });
      dayEl.createEl("div", {
        text: `${day.weekdayLabel} · ${formatDateLabel(day.date)}`,
        attr: { class: "prodigy-bid-cal-agenda-day-title" }
      });

      day.courts.forEach((courtGroup) => {
        const courtEl = dayEl.createEl("div", { attr: { class: "prodigy-bid-cal-court" } });
        courtEl.createEl("div", {
          text: courtGroup.court,
          attr: { class: "prodigy-bid-cal-court-name" }
        });
        courtGroup.types.forEach((tg) => {
          const line = courtEl.createEl("div", {
            text: `${eventTypeLabel(tg.type)} ×${tg.count}`,
            attr: { class: "prodigy-bid-cal-type-line" }
          });
          line.style.cursor = "pointer";
          line.onclick = () => {
            showDatePopup({
              app,
              date: day.date,
              events: tg.events,
              pageByPath
            });
          };
        });
        // Compact agenda titles → open date popup with full Auction Cards
        uniqueEventsByObject(courtGroup.events).forEach((event) => {
          const row = courtEl.createEl("div", {
            attr: {
              class: "prodigy-bid-cal-item-meta",
              style: "margin: 2px 0 2px 4px; cursor: pointer;"
            }
          });
          row.createEl("span", { text: `· ${event.title}` });
          if (event.time) {
            row.createEl("span", {
              text: ` ${event.time}`,
              attr: { style: "color: var(--text-faint);" }
            });
          }
          row.onclick = () => {
            showDatePopup({
              app,
              date: day.date,
              events: courtGroup.events.filter((e) => (e.object_path || e.path) === (event.object_path || event.path)),
              pageByPath
            });
          };
        });
      });
    });
  }

  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {Array} options.pages - Auction pages from Dataview (single scan source)
   * @param {object} options.app
   * @param {Date} [options.now]
   */
  function render(options) {
    const opts = options || {};
    const container = opts.container;
    const app = opts.app || root.app || (typeof window !== "undefined" ? window.app : null);
    const core = root.BidCalendarCore;
    if (!container || !core) return;
    if (typeof container.empty === "function") container.empty();
    ensureStyles();

    const now = opts.now instanceof Date ? opts.now : new Date();
    const pages = opts.pages || [];
    const events = core.collectEvents(pages);
    const pageByPath = buildPageIndex(pages);

    const state = {
      year: now.getFullYear(),
      monthIndex: now.getMonth(),
      agendaMode: "week", // week | month
      agendaExpanded: true,
      agendaTotal: 0,
      anchor: now
    };

    const rootEl = container.createEl("div", { attr: { class: "prodigy-bid-calendar" } });

    const header = rootEl.createEl("div", { attr: { class: "prodigy-bid-cal-header" } });
    const titleEl = header.createEl("div", {
      text: formatMonthTitle(state.year, state.monthIndex),
      attr: { class: "prodigy-bid-cal-title" }
    });

    const nav = header.createEl("div", { attr: { class: "prodigy-bid-cal-nav" } });
    const prevBtn = nav.createEl("button", { text: "‹", attr: { type: "button", "aria-label": "이전 달" } });
    const todayBtn = nav.createEl("button", { text: "오늘", attr: { type: "button" } });
    const nextBtn = nav.createEl("button", { text: "›", attr: { type: "button", "aria-label": "다음 달" } });

    const modes = header.createEl("div", { attr: { class: "prodigy-bid-cal-modes" } });
    const weekBtn = modes.createEl("button", { text: "주간", attr: { type: "button" } });
    const monthBtn = modes.createEl("button", { text: "월간", attr: { type: "button" } });
    const dayRunnerBtn = modes.createEl("button", {
      text: "입찰 실행",
      attr: { type: "button", title: "입찰 실행" }
    });

    const openDayRunner = (dateIso) => {
      const dayView = root.AuctionDayView || (typeof window !== "undefined" ? window.AuctionDayView : null);
      if (!dayView || !dayView.openPanel) {
        if (typeof Notice !== "undefined") new Notice("입찰 실행을 불러오지 못했습니다.");
        return;
      }
      dayView.openPanel({
        app,
        pages,
        date: dateIso || core.isoToday(now),
        now,
        reloadPages: opts.reloadPages
      });
    };
    dayRunnerBtn.onclick = () => openDayRunner(core.isoToday(now));

    const dowRow = rootEl.createEl("div", { attr: { class: "prodigy-bid-cal-grid" } });
    ["일", "월", "화", "수", "목", "금", "토"].forEach((d) => {
      dowRow.createEl("div", { text: d, attr: { class: "prodigy-bid-cal-dow" } });
    });

    const gridEl = rootEl.createEl("div", { attr: { class: "prodigy-bid-cal-grid" } });

    const agendaToggle = rootEl.createEl("button", {
      attr: {
        class: "prodigy-bid-cal-agenda-toggle",
        type: "button",
        "aria-expanded": "true"
      }
    });
    const agendaToggleLabel = agendaToggle.createEl("span", {
      text: "이번 주 일정",
      attr: { class: "toggle-label" }
    });
    const agendaToggleMeta = agendaToggle.createEl("span", { attr: { class: "toggle-meta" } });
    const agendaCountEl = agendaToggleMeta.createEl("span", { text: "" });
    const agendaChevron = agendaToggleMeta.createEl("span", {
      text: "▾",
      attr: { class: "toggle-chevron" }
    });

    const agendaEl = rootEl.createEl("div", { attr: { class: "prodigy-bid-cal-agenda" } });

    function updateModeButtons() {
      weekBtn.classList.toggle("is-active", state.agendaMode === "week");
      monthBtn.classList.toggle("is-active", state.agendaMode === "month");
    }

    function updateAgendaToggle(label, total) {
      agendaToggleLabel.setText
        ? agendaToggleLabel.setText(label)
        : (agendaToggleLabel.textContent = label);
      const countText = total > 0 ? `${total}건` : "없음";
      agendaCountEl.setText
        ? agendaCountEl.setText(countText)
        : (agendaCountEl.textContent = countText);
      agendaChevron.setText
        ? agendaChevron.setText(state.agendaExpanded ? "▾" : "▸")
        : (agendaChevron.textContent = state.agendaExpanded ? "▾" : "▸");
      agendaToggle.setAttribute("aria-expanded", state.agendaExpanded ? "true" : "false");
      agendaEl.classList.toggle("is-collapsed", !state.agendaExpanded);
    }

    function paint() {
      titleEl.setText
        ? titleEl.setText(formatMonthTitle(state.year, state.monthIndex))
        : (titleEl.textContent = formatMonthTitle(state.year, state.monthIndex));

      if (typeof gridEl.empty === "function") gridEl.empty();
      else gridEl.innerHTML = "";

      const todayIso = core.isoToday(now);
      const cells = core.buildMonthGrid(state.year, state.monthIndex, events);

      cells.forEach((cell) => {
        const cellEl = gridEl.createEl("div", {
          attr: {
            class: [
              "prodigy-bid-cal-cell",
              cell.inMonth ? "in-month" : "out-month",
              cell.count > 0 ? "has-events" : "",
              cell.date === todayIso ? "is-today" : ""
            ].filter(Boolean).join(" ")
          }
        });
        if (cell.day != null) {
          cellEl.createEl("span", {
            text: String(cell.day),
            attr: { class: "day-num" }
          });
        }
        if (cell.inMonth && cell.count > 0) {
          cellEl.createEl("span", {
            text: `●${cell.count}`,
            attr: { class: "event-dot" }
          });
        } else if (cell.inMonth) {
          cellEl.createEl("span", {
            text: "",
            attr: { class: "event-dot" }
          });
        }

        if (cell.inMonth && cell.date) {
          cellEl.onclick = () => {
            const dayEvents = core.eventsForDate(events, cell.date);
            showDatePopup({
              app,
              date: cell.date,
              events: dayEvents,
              pageByPath
            });
          };
        }
      });

      // Agenda range: week uses "today"/anchor week; month uses visible calendar month
      let range;
      let agendaLabel;
      if (state.agendaMode === "month") {
        range = core.monthRange(state.year, state.monthIndex);
        agendaLabel = "이번 달 일정";
      } else {
        range = core.weekRange(state.anchor);
        agendaLabel = "이번 주 일정";
      }
      const agenda = core.buildAgenda(events, range.start, range.end);
      state.agendaTotal = agenda.total || 0;
      renderAgenda(agendaEl, agenda, app, pageByPath);
      updateAgendaToggle(agendaLabel, state.agendaTotal);
      updateModeButtons();
    }

    agendaToggle.onclick = () => {
      state.agendaExpanded = !state.agendaExpanded;
      const label = state.agendaMode === "month" ? "이번 달 일정" : "이번 주 일정";
      updateAgendaToggle(label, state.agendaTotal);
    };

    prevBtn.onclick = () => {
      state.monthIndex -= 1;
      if (state.monthIndex < 0) {
        state.monthIndex = 11;
        state.year -= 1;
      }
      paint();
    };
    nextBtn.onclick = () => {
      state.monthIndex += 1;
      if (state.monthIndex > 11) {
        state.monthIndex = 0;
        state.year += 1;
      }
      paint();
    };
    todayBtn.onclick = () => {
      state.year = now.getFullYear();
      state.monthIndex = now.getMonth();
      state.anchor = now;
      paint();
    };
    weekBtn.onclick = () => {
      state.agendaMode = "week";
      paint();
    };
    monthBtn.onclick = () => {
      state.agendaMode = "month";
      paint();
    };

    paint();
  }

  const api = {
    render,
    showDatePopup,
    eventTypeLabel,
    ensureStyles
  };

  root.BidCalendarView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
