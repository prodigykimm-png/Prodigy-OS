(function (root) {
  "use strict";

  /**
   * Bid Calendar data layer (Auction Workspace only).
   * Reads existing Auction Object properties; never invents times or properties.
   *
   * Event types (existing fields only):
   *   bid        → auction_datetime
   *   site_visit → site_visit_date
   *   review     → review_date
   */

  const EVENT_SPECS = Object.freeze([
    Object.freeze({ type: "bid", property: "auction_datetime" }),
    Object.freeze({ type: "site_visit", property: "site_visit_date" }),
    Object.freeze({ type: "review", property: "review_date" })
  ]);

  const EVENT_TYPE_ORDER = Object.freeze({ bid: 0, site_visit: 1, review: 2 });

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function hasValue(value) {
    const text = clean(value);
    return text !== "" && text !== "정보 없음";
  }

  /** Extract YYYY-MM-DD only. Never fabricate. */
  function toIsoDate(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "object") {
      if (typeof value.toISODate === "function") {
        try {
          const iso = value.toISODate();
          if (iso) return String(iso).slice(0, 10);
        } catch (_e) { /* fall through */ }
      }
      if (typeof value.toISOString === "function") {
        try {
          return value.toISOString().slice(0, 10);
        } catch (_e) { /* fall through */ }
      }
      if (value.year && value.month && value.day) {
        return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
      }
    }
    const str = String(value).trim();
    const match = str.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
    if (!match) return "";
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  /**
   * Optional clock time from the source value only.
   * Returns "HH:mm" or "" — never invents a time.
   */
  function toTimePart(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "object") {
      if (typeof value.toFormat === "function") {
        try {
          const t = value.toFormat("HH:mm");
          if (t && t !== "00:00") return t;
          // Luxon may still hold a real midnight; only return if hour/minute exist
          if (typeof value.hour === "number" && (value.hour !== 0 || value.minute !== 0)) {
            return `${String(value.hour).padStart(2, "0")}:${String(value.minute || 0).padStart(2, "0")}`;
          }
        } catch (_e) { /* fall through */ }
      }
      if (typeof value.hour === "number" && typeof value.minute === "number") {
        if (value.hour === 0 && value.minute === 0) return "";
        return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
      }
    }
    const str = String(value).trim();
    // Explicit time only (avoid inventing from date-only strings)
    const match = str.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!match) return "";
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function pagePath(page) {
    if (!page) return "";
    if (page.path) return String(page.path);
    if (page.file && page.file.path) return String(page.file.path);
    return "";
  }

  function pageTitle(page) {
    if (!page) return "제목 없음";
    if (hasValue(page.case_number)) return clean(page.case_number);
    if (page.file && page.file.name) return String(page.file.name).replace(/\.md$/i, "");
    const path = pagePath(page);
    if (path) {
      const base = path.split("/").pop() || path;
      return base.replace(/\.md$/i, "");
    }
    return "제목 없음";
  }

  function normalizeCourt(value) {
    const court = clean(value);
    return court || "법원 미지정";
  }

  /**
   * Build flat event list from Auction pages (one pass).
   * Only status = bidding (입찰 예정) — calendar is time nav for active bid pipeline.
   * @param {Array} pages Dataview page objects or plain records
   * @returns {Array<Object>}
   */
  function collectEvents(pages) {
    const list = Array.isArray(pages) ? pages : [];
    const events = [];

    list.forEach((page) => {
      if (!page) return;
      const type = clean(page.type);
      if (type && type !== "auction_case") return;
      // Calendar shows active bid pipeline only (not watching / closed / reviewing archive noise)
      const status = clean(page.status);
      if (status !== "bidding") return;

      const path = pagePath(page);
      const title = pageTitle(page);
      const court = normalizeCourt(page.court);
      const expectedBid = hasValue(page.expected_bid) ? page.expected_bid : "";
      const bidDateIso = toIsoDate(page.auction_datetime);

      EVENT_SPECS.forEach((spec) => {
        const raw = page[spec.property];
        if (!hasValue(raw) && raw !== 0) return;
        const date = toIsoDate(raw);
        if (!date) return;
        events.push({
          type: spec.type,
          property: spec.property,
          date,
          time: toTimePart(raw),
          path,
          title,
          status,
          court,
          bid_date: bidDateIso,
          expected_bid: expectedBid,
          object_path: path,
          // Keep source page so the calendar can reuse Auction Card UI
          page
        });
      });
    });

    events.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const ta = a.time || "99:99";
      const tb = b.time || "99:99";
      if (ta !== tb) return ta.localeCompare(tb);
      const oa = EVENT_TYPE_ORDER[a.type] != null ? EVENT_TYPE_ORDER[a.type] : 9;
      const ob = EVENT_TYPE_ORDER[b.type] != null ? EVENT_TYPE_ORDER[b.type] : 9;
      if (oa !== ob) return oa - ob;
      return String(a.court).localeCompare(String(b.court), "ko")
        || String(a.title).localeCompare(String(b.title), "ko");
    });

    return events;
  }

  function filterByDateRange(events, startIso, endIso) {
    const list = Array.isArray(events) ? events : [];
    if (!startIso || !endIso) return list.slice();
    return list.filter((e) => e.date >= startIso && e.date <= endIso);
  }

  function eventsForDate(events, isoDate) {
    if (!isoDate) return [];
    return (Array.isArray(events) ? events : []).filter((e) => e.date === isoDate);
  }

  /** Count events per ISO date (for month grid dots). */
  function countByDate(events) {
    const map = Object.create(null);
    (Array.isArray(events) ? events : []).forEach((e) => {
      if (!e || !e.date) return;
      map[e.date] = (map[e.date] || 0) + 1;
    });
    return map;
  }

  /**
   * Group events by court (primary navigation grouping).
   * Returns [{ court, events }...] sorted by court name, then event order.
   */
  function groupByCourt(events) {
    const buckets = Object.create(null);
    const order = [];
    (Array.isArray(events) ? events : []).forEach((e) => {
      const court = normalizeCourt(e.court);
      if (!buckets[court]) {
        buckets[court] = [];
        order.push(court);
      }
      buckets[court].push(e);
    });
    order.sort((a, b) => {
      if (a === "법원 미지정") return 1;
      if (b === "법원 미지정") return -1;
      return a.localeCompare(b, "ko");
    });
    return order.map((court) => ({ court, events: buckets[court] }));
  }

  /** Group events by type for date popup section headers. */
  function groupByType(events) {
    const buckets = { bid: [], site_visit: [], review: [] };
    (Array.isArray(events) ? events : []).forEach((e) => {
      if (buckets[e.type]) buckets[e.type].push(e);
      else {
        if (!buckets.other) buckets.other = [];
        buckets.other.push(e);
      }
    });
    const result = [];
    ["bid", "site_visit", "review"].forEach((type) => {
      if (buckets[type] && buckets[type].length) {
        result.push({ type, events: buckets[type] });
      }
    });
    if (buckets.other && buckets.other.length) {
      result.push({ type: "other", events: buckets.other });
    }
    return result;
  }

  function startOfMonth(year, monthIndex) {
    const m = String(monthIndex + 1).padStart(2, "0");
    return `${year}-${m}-01`;
  }

  function endOfMonth(year, monthIndex) {
    const last = new Date(year, monthIndex + 1, 0).getDate();
    const m = String(monthIndex + 1).padStart(2, "0");
    return `${year}-${m}-${String(last).padStart(2, "0")}`;
  }

  function addDaysIso(isoDate, days) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  /** Monday-start week containing refDate (Date or ISO). */
  function weekRange(ref) {
    const dt = ref instanceof Date ? new Date(ref.getTime()) : new Date(String(ref));
    if (Number.isNaN(dt.getTime())) {
      const today = new Date();
      return weekRange(today);
    }
    dt.setHours(0, 0, 0, 0);
    const day = dt.getDay(); // 0 Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(dt.getTime());
    monday.setDate(dt.getDate() + mondayOffset);
    const start = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const end = addDaysIso(start, 6);
    return { start, end };
  }

  function monthRange(year, monthIndex) {
    return {
      start: startOfMonth(year, monthIndex),
      end: endOfMonth(year, monthIndex)
    };
  }

  /**
   * Build month grid cells for a Sunday-start calendar (compact display).
   * cells: [{ date, day, inMonth, count }]
   */
  function buildMonthGrid(year, monthIndex, events) {
    const counts = countByDate(filterByDateRange(events, startOfMonth(year, monthIndex), endOfMonth(year, monthIndex)));
    const first = new Date(year, monthIndex, 1);
    const startPad = first.getDay(); // 0 Sun
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < startPad; i++) {
      cells.push({ date: "", day: null, inMonth: false, count: 0 });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        date,
        day,
        inMonth: true,
        count: counts[date] || 0
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: "", day: null, inMonth: false, count: 0 });
    }
    return cells;
  }

  /**
   * Agenda model for week or month range.
   * days: [{ date, weekdayLabel, courts: [{ court, types: [{ type, count, events }] }] }]
   * Only days with events are included.
   */
  function buildAgenda(events, startIso, endIso) {
    const ranged = filterByDateRange(events, startIso, endIso);
    if (!ranged.length) {
      return { start: startIso, end: endIso, days: [], total: 0 };
    }

    const byDate = Object.create(null);
    const dateOrder = [];
    ranged.forEach((e) => {
      if (!byDate[e.date]) {
        byDate[e.date] = [];
        dateOrder.push(e.date);
      }
      byDate[e.date].push(e);
    });
    dateOrder.sort();

    const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

    const days = dateOrder.map((date) => {
      const dayEvents = byDate[date];
      const courts = groupByCourt(dayEvents).map((group) => {
        const typeGroups = groupByType(group.events).map((tg) => ({
          type: tg.type,
          count: tg.events.length,
          events: tg.events
        }));
        return {
          court: group.court,
          types: typeGroups,
          events: group.events
        };
      });
      const [y, m, d] = date.split("-").map(Number);
      const wd = new Date(y, m - 1, d).getDay();
      return {
        date,
        weekdayLabel: weekdayNames[wd] || "",
        courts,
        count: dayEvents.length
      };
    });

    return { start: startIso, end: endIso, days, total: ranged.length };
  }

  function isoToday(now) {
    const d = now instanceof Date ? now : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function todayBidEvents(events, now) {
    const today = isoToday(now);
    return eventsForDate(events, today).filter((event) => (
      event && event.type === "bid" && event.status === "bidding"
    ));
  }

  function eventTypeProperty(type) {
    const spec = EVENT_SPECS.find((s) => s.type === type);
    return spec ? spec.property : "";
  }

  const api = {
    EVENT_SPECS,
    clean,
    hasValue,
    toIsoDate,
    toTimePart,
    collectEvents,
    filterByDateRange,
    eventsForDate,
    countByDate,
    groupByCourt,
    groupByType,
    weekRange,
    monthRange,
    buildMonthGrid,
    buildAgenda,
    isoToday,
    todayBidEvents,
    eventTypeProperty,
    pageTitle,
    normalizeCourt
  };

  root.BidCalendarCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
