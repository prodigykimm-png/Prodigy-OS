/**
 * region-collector-scheduler.js
 *
 * Due work scheduling for Region Intelligence collector.
 * Cadence arithmetic is calendar-based in Asia/Seoul (KST, UTC+9).
 * Pure functions — offline-testable without Obsidian or network.
 *
 * CommonJS/IIFE compatible.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Frozen priorities from plan
  // ---------------------------------------------------------------------------

  const PROVIDER_PRIORITIES = Object.freeze({
    admin_code: 10,
    admin_boundary_vworld: 10,
    mois_jumin_statmonth_csv: 20,
    reb_rone_public_table: 30,
    molit_apt_sale: 30,
    molit_apt_rent: 30,
    reb_stock: 40,
    reb_supply: 40,
    building_hub_housing_permit: 40,
    kapt_basic: 40,
    national_establishments: 50,
    official_land_price_region: 50,
    official_land_price_case: 50,
    "incheon-metro": 60,
    "busan-metro": 60,
    "seoul-metro": 70,
    "metro9-stage1": 70,
    "metro9-stage23": 70,
    "korail-station-candidate": 70,
    "kric-station-candidate": 70,
    arex: 70,
    shinbundang: 70,
    "gimpo-goldline": 70,
    "ui-sinseol": 70,
    sillim: 70,
    everline: 70,
    "uijeongbu-lrt": 70,
    "seohae-rail": 70,
    naver_candidate: 80,
    youtube_candidate: 80,
    instagram_manual: 80,
    kosis_disabled: 50
  });

  const MAX_CONCURRENT = 3;

  // ---------------------------------------------------------------------------
  // KST calendar helpers
  // ---------------------------------------------------------------------------

  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

  /**
   * Convert a Date (or ms) to KST date parts.
   */
  function toKSTParts(dateOrMs) {
    const ms = typeof dateOrMs === "number" ? dateOrMs : dateOrMs.getTime();
    const kst = new Date(ms + KST_OFFSET_MS);
    return {
      year: kst.getUTCFullYear(),
      month: kst.getUTCMonth() + 1,
      day: kst.getUTCDate(),
      hours: kst.getUTCHours(),
      minutes: kst.getUTCMinutes(),
      seconds: kst.getUTCSeconds(),
      ms: ms
    };
  }

  /**
   * Build a Date from KST calendar parts (year, month 1-12, day, hour, min, sec).
   */
  function fromKST(year, month, day, hour, min, sec) {
    const utcMs = Date.UTC(year, month - 1, day, hour, min || 0, sec || 0);
    return new Date(utcMs - KST_OFFSET_MS);
  }

  /**
   * Format a Date as YYYY-MM-DD in KST.
   */
  function formatKSTDate(dateOrMs) {
    const p = toKSTParts(dateOrMs);
    return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------------------
  // Cadence next-due computation
  // ---------------------------------------------------------------------------

  /**
   * Compute the next due time for a provider given its cadence and last fetched_at.
   * All arithmetic is calendar-based in Asia/Seoul.
   *
   * @param {string} cadence - monthly|half-year|annual|revision|weekly|manual|none
   * @param {Date|string|number} fetchedAt - last successful fetch time
   * @returns {Date|null} next due time, or null for manual/none
   */
  function computeNextDue(cadence, fetchedAt) {
    if (cadence === "manual" || cadence === "none") return null;
    const fetched = typeof fetchedAt === "object" && fetchedAt instanceof Date
      ? fetchedAt
      : new Date(fetchedAt);
    if (isNaN(fetched.getTime())) throw new Error("Invalid fetchedAt");

    const p = toKSTParts(fetched);
    let candidate;

    switch (cadence) {
      case "monthly": {
        // First day of the next calendar month 09:00 KST
        let y = p.year;
        let m = p.month + 1;
        if (m > 12) { m = 1; y += 1; }
        candidate = fromKST(y, m, 1, 9, 0, 0);
        break;
      }
      case "half-year": {
        // Next January 1 or July 1 at 09:00 KST
        const jan1 = fromKST(p.year, 1, 1, 9, 0, 0);
        const jul1 = fromKST(p.year, 7, 1, 9, 0, 0);
        const nextJan1 = fromKST(p.year + 1, 1, 1, 9, 0, 0);
        if (fetched.getTime() < jan1.getTime()) {
          candidate = jan1;
        } else if (fetched.getTime() < jul1.getTime()) {
          candidate = jul1;
        } else {
          candidate = nextJan1;
        }
        break;
      }
      case "annual": {
        // Next January 15 at 09:00 KST
        const jan15 = fromKST(p.year, 1, 15, 9, 0, 0);
        const nextJan15 = fromKST(p.year + 1, 1, 15, 9, 0, 0);
        candidate = fetched.getTime() < jan15.getTime() ? jan15 : nextJan15;
        break;
      }
      case "revision":
      case "revision polling":
      case "seven-day revision poll":
      case "provider revision":
      case "official file revision": {
        // Seven calendar days after fetched_at, at 09:00 KST
        const futureDay = p.day + 7;
        candidate = fromKST(p.year, p.month, futureDay, 9, 0, 0);
        break;
      }
      case "weekly":
      case "manual/weekly": {
        // Next Monday 09:00 KST
        const kstDate = new Date(fetched.getTime() + KST_OFFSET_MS);
        const dow = kstDate.getUTCDay(); // 0=Sun, 1=Mon
        const daysToMonday = dow === 0 ? 1 : (8 - dow);
        const nextMon = new Date(kstDate.getTime() + daysToMonday * 24 * 60 * 60 * 1000);
        candidate = fromKST(
          nextMon.getUTCFullYear(), nextMon.getUTCMonth() + 1, nextMon.getUTCDate(), 9, 0, 0
        );
        break;
      }
      default:
        return null;
    }

    // If computed time is not strictly after fetched_at, advance one cadence boundary
    if (candidate.getTime() <= fetched.getTime()) {
      candidate = advanceOneCadence(cadence, candidate);
    }
    return candidate;
  }

  /**
   * Advance one cadence boundary from a given candidate.
   */
  function advanceOneCadence(cadence, candidate) {
    const p = toKSTParts(candidate);
    switch (cadence) {
      case "monthly": {
        let y = p.year;
        let m = p.month + 1;
        if (m > 12) { m = 1; y += 1; }
        return fromKST(y, m, 1, 9, 0, 0);
      }
      case "half-year": {
        if (p.month <= 6) return fromKST(p.year, 7, 1, 9, 0, 0);
        return fromKST(p.year + 1, 1, 1, 9, 0, 0);
      }
      case "annual":
        return fromKST(p.year + 1, 1, 15, 9, 0, 0);
      case "revision":
      case "revision polling":
      case "seven-day revision poll":
      case "provider revision":
      case "official file revision":
        return fromKST(p.year, p.month, p.day + 7, 9, 0, 0);
      case "weekly":
      case "manual/weekly":
        return fromKST(p.year, p.month, p.day + 7, 9, 0, 0);
      default:
        return candidate;
    }
  }

  // ---------------------------------------------------------------------------
  // Due work ordering and dispatch selection
  // ---------------------------------------------------------------------------

  /**
   * Given a list of due items, sort by dispatch order:
   * (next_due ascending, priority ascending, provider_id code-point ascending)
   *
   * @param {Array<{provider_id: string, next_due: Date, cadence: string}>} items
   * @returns {Array} sorted items
   */
  function sortDueItems(items) {
    return items.slice().sort((a, b) => {
      const dueA = a.next_due.getTime();
      const dueB = b.next_due.getTime();
      if (dueA !== dueB) return dueA - dueB;
      const prioA = PROVIDER_PRIORITIES[a.provider_id] || 99;
      const prioB = PROVIDER_PRIORITIES[b.provider_id] || 99;
      if (prioA !== prioB) return prioA - prioB;
      return a.provider_id < b.provider_id ? -1 : a.provider_id > b.provider_id ? 1 : 0;
    });
  }

  /**
   * Select up to maxConcurrent providers from sorted due items,
   * excluding any already in-flight.
   *
   * @param {Array} sortedDue - sorted due items
   * @param {Set<string>} inflight - provider IDs currently running
   * @param {number} [maxConcurrent=3]
   * @returns {Array} items to dispatch
   */
  function selectDispatch(sortedDue, inflight, maxConcurrent) {
    const limit = maxConcurrent || MAX_CONCURRENT;
    const active = inflight ? inflight.size : 0;
    const slots = Math.max(0, limit - active);
    const result = [];
    for (const item of sortedDue) {
      if (result.length >= slots) break;
      if (inflight && inflight.has(item.provider_id)) continue;
      result.push(item);
    }
    return result;
  }

  /**
   * Compute the full due schedule from provider states.
   *
   * @param {Array<{provider_id, cadence, fetched_at, status}>} providerStates
   * @param {Date|number} now - current time
   * @returns {Array<{provider_id, next_due, cadence, priority}>} due items sorted
   */
  function computeDueSchedule(providerStates, now) {
    const nowMs = typeof now === "number" ? now : now.getTime();
    const due = [];
    for (const ps of providerStates) {
      if (ps.status === "manual" || ps.cadence === "manual" || ps.cadence === "none") continue;
      if (!ps.fetched_at) {
        // Never fetched — immediately due
        due.push({
          provider_id: ps.provider_id,
          next_due: new Date(0),
          cadence: ps.cadence,
          priority: PROVIDER_PRIORITIES[ps.provider_id] || 99
        });
        continue;
      }
      const nextDue = computeNextDue(ps.cadence, ps.fetched_at);
      if (!nextDue) continue;
      if (nextDue.getTime() <= nowMs) {
        due.push({
          provider_id: ps.provider_id,
          next_due: nextDue,
          cadence: ps.cadence,
          priority: PROVIDER_PRIORITIES[ps.provider_id] || 99
        });
      }
    }
    return sortDueItems(due);
  }

  // ---------------------------------------------------------------------------
  // Retry delay computation
  // ---------------------------------------------------------------------------

  /**
   * Compute retry delay for attempt n (1-based) after a settled transient failure.
   * Base: 1000ms for attempt 1→2, 3000ms for attempt 2→3.
   * Plus deterministic jitter: uint16(SHA256(provider|run_id|attempt)[0:4]) % 251.
   *
   * @param {number} attempt - the completed attempt number (1 or 2)
   * @param {string} providerId
   * @param {string} runId
   * @param {function} sha256hex - function(data) => 64 hex chars
   * @returns {number} delay in ms
   */
  function computeRetryDelay(attempt, providerId, runId, sha256hex) {
    const base = attempt === 1 ? 1000 : 3000;
    const hash = sha256hex(`${providerId}|${runId}|${attempt}`);
    const uint16 = parseInt(hash.slice(0, 4), 16);
    const jitter = uint16 % 251;
    return base + jitter;
  }

  /**
   * Parse Retry-After header value (seconds delta or HTTP date).
   * Clamped to 1s–24h. Invalid → null (use normal retry delay).
   *
   * @param {string} headerValue
   * @param {number} nowMs
   * @returns {number|null} delay in ms, or null if invalid
   */
  function parseRetryAfter(headerValue, nowMs) {
    if (!headerValue || typeof headerValue !== "string") return null;
    const trimmed = headerValue.trim();
    // Try integer seconds
    if (/^\d+$/.test(trimmed)) {
      const secs = parseInt(trimmed, 10);
      const ms = secs * 1000;
      return clampRetryDelay(ms);
    }
    // Try HTTP date
    const dateMs = Date.parse(trimmed);
    if (isNaN(dateMs)) return null;
    const delta = dateMs - (nowMs || Date.now());
    if (delta <= 0) return clampRetryDelay(1000);
    return clampRetryDelay(delta);
  }

  function clampRetryDelay(ms) {
    return Math.max(1000, Math.min(ms, 24 * 60 * 60 * 1000));
  }

  // ---------------------------------------------------------------------------
  // Daily budget caps
  // ---------------------------------------------------------------------------

  const DAILY_CAPS = Object.freeze({
    _default: 10,
    mois_jumin_statmonth_csv: 10,
    reb_rone_public_table: 10,
    reb_stock: 10,
    reb_supply: 10,
    molit_apt_sale: 200,
    molit_apt_rent: 200,
    building_hub_housing_permit: 200,
    kapt_basic: 200,
    national_establishments: 200,
    official_land_price_region: 200,
    official_land_price_case: 200,
    admin_code: 200,
    admin_boundary_vworld: 200,
    naver_candidate: 100,
    youtube_candidate: 1000,
    kosis_disabled: 200
  });

  /**
   * Get the daily cap for a provider.
   */
  function getDailyCap(providerId) {
    return DAILY_CAPS[providerId] || DAILY_CAPS._default;
  }

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

  const api = {
    PROVIDER_PRIORITIES,
    MAX_CONCURRENT,
    KST_OFFSET_MS,
    DAILY_CAPS,
    toKSTParts,
    fromKST,
    formatKSTDate,
    computeNextDue,
    advanceOneCadence,
    sortDueItems,
    selectDispatch,
    computeDueSchedule,
    computeRetryDelay,
    parseRetryAfter,
    clampRetryDelay,
    getDailyCap
  };

  root.RegionCollectorScheduler = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
