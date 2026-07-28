(function (root) {
  "use strict";

  /**
   * Auction Learning Core — deterministic outcome feedback, comparables,
   * shadow portfolio, concentration, and thesis projections.
   *
   * Contract: .omo/plans/prodigy-region-workspace-consolidation.md § Auction learning
   * All projections require explicit as_of (YYYY-MM-DD). Tests never read wall clock.
   */

  // ─── Constants ───────────────────────────────────────────────────────────────

  const OUTCOMES = Object.freeze(["won", "lost", "skipped"]);

  const PROPERTY_TYPE_ALIASES = Object.freeze({
    apartment: "apartment",
    "아파트": "apartment",
    officetel: "officetel",
    "오피스텔": "officetel",
    multi_family: "multi_family",
    "다세대": "multi_family",
    "다세대주택": "multi_family",
    "연립": "multi_family",
    "연립주택": "multi_family",
    "빌라": "multi_family",
    single_family: "single_family",
    "단독": "single_family",
    "단독주택": "single_family",
    "다가구": "single_family",
    "다가구주택": "single_family",
    commercial: "commercial",
    "상가": "commercial",
    land: "land",
    "토지": "land"
  });

  const AREA_DIFF_INTERNAL = 0.20;
  const AREA_RATIO_EXTERNAL = 0.10;
  const CONCENTRATION_MIN_COUNT = 3;
  const CONCENTRATION_WARN_SHARE = 0.50;

  // ─── Utilities ───────────────────────────────────────────────────────────────

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function nfc(value) {
    return clean(value).normalize("NFC");
  }

  function isPositiveFinite(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  function toPositiveFinite(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Parse YYYY-MM-DD to {y,m,d} or null. */
  function parseIsoDate(str) {
    const s = clean(str);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > daysInMonth(y, m)) return null;
    return { y, m, d };
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function isoFromDate(y, m, d) {
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  /** Compare two ISO date strings: -1, 0, 1. */
  function compareIsoDate(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Subtract 12 calendar months, clamping day to last valid day.
   * Both endpoints inclusive in the window.
   */
  function subtract12Months(isoDate) {
    const parsed = parseIsoDate(isoDate);
    if (!parsed) return null;
    let y = parsed.y - 1;
    let m = parsed.m;
    let d = parsed.d;
    const maxDay = daysInMonth(y, m);
    if (d > maxDay) d = maxDay;
    return isoFromDate(y, m, d);
  }

  /** Check if dateIso is within [windowStart, asOf] inclusive. */
  function inWindow(dateIso, windowStart, asOf) {
    if (!dateIso || !windowStart || !asOf) return false;
    return compareIsoDate(dateIso, windowStart) >= 0 && compareIsoDate(dateIso, asOf) <= 0;
  }

  /** Extract date portion from datetime or date string. */
  function extractDate(value) {
    const s = clean(value);
    if (!s) return "";
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return match ? match[1] : "";
  }

  // ─── Outcome Validation ──────────────────────────────────────────────────────

  /**
   * Validate an outcome tuple.
   * Returns { valid: true, outcome, result_date, winning_bid_price } or
   * { valid: false, errors: [...] }.
   */
  function validateOutcome(input, options) {
    const opts = options || {};
    const asOf = clean(opts.as_of);
    const errors = [];

    const outcome = clean(input.auction_outcome).toLowerCase();
    if (OUTCOMES.indexOf(outcome) === -1) {
      errors.push("auction_outcome must be won, lost, or skipped");
      return { valid: false, errors };
    }

    const resultDate = extractDate(input.auction_result_date);
    if (!resultDate) {
      errors.push("auction_result_date is required and must be YYYY-MM-DD");
    } else {
      const parsed = parseIsoDate(resultDate);
      if (!parsed) {
        errors.push("auction_result_date is not a real calendar date");
      } else {
        if (asOf) {
          const asOfParsed = parseIsoDate(asOf);
          if (asOfParsed && compareIsoDate(resultDate, asOf) > 0) {
            errors.push("auction_result_date must not be in the future (after as_of)");
          }
        }
        const auctionDate = extractDate(input.auction_datetime);
        if (auctionDate && parseIsoDate(auctionDate)) {
          if (compareIsoDate(resultDate, auctionDate) < 0) {
            errors.push("auction_result_date must be on or after auction_datetime");
          }
        }
      }
    }

    let winningPrice = null;
    const rawPrice = input.winning_bid_price;
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== "") {
      winningPrice = toPositiveFinite(rawPrice);
      if (winningPrice === null) {
        errors.push("winning_bid_price must be a positive finite number");
      }
    }

    if (outcome === "won" || outcome === "lost") {
      if (winningPrice === null) {
        errors.push("winning_bid_price > 0 is required for won/lost outcomes");
      }
    }

    if (errors.length > 0) return { valid: false, errors };

    return {
      valid: true,
      outcome,
      result_date: resultDate,
      winning_bid_price: winningPrice
    };
  }

  // ─── Feedback Errors ─────────────────────────────────────────────────────────

  /**
   * Compute signed feedback errors.
   * positive = local value was below winning price.
   * KRW rounds to 1 won; percentages round to 2 decimals.
   * Missing/zero denominator = unavailable (null).
   */
  function computeFeedback(record) {
    const winning = toPositiveFinite(record.winning_bid_price);
    const expected = toPositiveFinite(record.expected_bid);
    const myBid = toPositiveFinite(record.my_bid_price);

    const result = {
      error_vs_expected: null,
      error_vs_expected_pct: null,
      error_vs_my_bid: null,
      error_vs_my_bid_pct: null
    };

    if (winning === null) return result;

    if (expected !== null) {
      result.error_vs_expected = Math.round(winning - expected);
      result.error_vs_expected_pct = Math.round(((winning - expected) / winning) * 100 * 100) / 100;
    }

    if (myBid !== null) {
      result.error_vs_my_bid = Math.round(winning - myBid);
      result.error_vs_my_bid_pct = Math.round(((winning - myBid) / winning) * 100 * 100) / 100;
    }

    return result;
  }

  // ─── Property Type Normalization ────────────────────────────────────────────

  /**
   * Normalize property type: NFC + trim + ASCII-lowercase, then closed alias map.
   * Returns canonical type or "unmapped".
   */
  function normalizePropertyType(value) {
    const raw = nfc(value);
    if (!raw) return "unmapped";
    const lower = raw.toLowerCase();
    const mapped = PROPERTY_TYPE_ALIASES[lower];
    return mapped || "unmapped";
  }

  // ─── Case Identity ───────────────────────────────────────────────────────────

  /**
   * Extract canonical path from a case record.
   */
  function canonicalPath(record) {
    const raw = record.path || record.source_path || (record.file && record.file.path) || "";
    return nfc(raw);
  }

  /**
   * Extract filename stem (without .md extension) from path.
   */
  function filenameStem(path) {
    const p = nfc(path);
    if (!p) return "";
    const base = p.split("/").pop() || "";
    return base.replace(/\.md$/i, "");
  }

  /**
   * Validate case identity: trimmed NFC id must equal trimmed NFC filename stem.
   * Returns { id, path, valid }.
   */
  function caseIdentity(record) {
    const id = nfc(record.id);
    const path = canonicalPath(record);
    const stem = filenameStem(path);
    return {
      id,
      path,
      stem,
      valid: id !== "" && id === stem
    };
  }

  /**
   * Filter to unique eligible cases.
   * Group by id and by NFC path; exclude all members of duplicate/mismatched groups.
   * Returns { eligible: [...], excluded: [...] }.
   */
  function uniqueEligibleCases(records) {
    const list = Array.isArray(records) ? records : [];

    // Group by id
    const byId = Object.create(null);
    // Group by path
    const byPath = Object.create(null);

    list.forEach((record, idx) => {
      const identity = caseIdentity(record);
      const entry = { record, identity, idx };

      const idKey = identity.id || `__empty_id_${idx}`;
      if (!byId[idKey]) byId[idKey] = [];
      byId[idKey].push(entry);

      const pathKey = identity.path || `__empty_path_${idx}`;
      if (!byPath[pathKey]) byPath[pathKey] = [];
      byPath[pathKey].push(entry);
    });

    const excludedIndices = new Set();
    const diagnostics = [];

    // Exclude duplicate id groups
    Object.keys(byId).forEach((key) => {
      const group = byId[key];
      if (group.length > 1) {
        group.forEach((e) => excludedIndices.add(e.idx));
        diagnostics.push({ reason: "duplicate_id", id: key, count: group.length });
      }
    });

    // Exclude duplicate path groups
    Object.keys(byPath).forEach((key) => {
      const group = byPath[key];
      if (group.length > 1) {
        group.forEach((e) => excludedIndices.add(e.idx));
        diagnostics.push({ reason: "duplicate_path", path: key, count: group.length });
      }
    });

    // Exclude mismatched id/stem
    list.forEach((record, idx) => {
      const identity = caseIdentity(record);
      if (!identity.valid && !excludedIndices.has(idx)) {
        excludedIndices.add(idx);
        diagnostics.push({ reason: "id_stem_mismatch", id: identity.id, stem: identity.stem, idx });
      }
    });

    const eligible = [];
    const excluded = [];
    list.forEach((record, idx) => {
      if (excludedIndices.has(idx)) excluded.push(record);
      else eligible.push(record);
    });

    return { eligible, excluded, diagnostics };
  }

  // ─── Internal Comparables ────────────────────────────────────────────────────

  /**
   * Find internal comparables for a target case.
   * Requires: exact region_key, exact mapped type, area diff ≤ 0.20,
   * valid outcome/price, 12-month window (both endpoints inclusive).
   */
  function internalComparables(target, candidates, options) {
    const opts = options || {};
    const asOf = clean(opts.as_of);
    if (!asOf || !parseIsoDate(asOf)) return [];

    const windowStart = subtract12Months(asOf);
    if (!windowStart) return [];

    const targetRegion = nfc(target.region_key);
    const targetType = normalizePropertyType(target.property_type);
    const targetArea = toPositiveFinite(target.exclusive_area);

    if (!targetRegion || targetType === "unmapped" || targetArea === null) return [];

    const { eligible } = uniqueEligibleCases(candidates);
    const results = [];

    eligible.forEach((candidate) => {
      // Must have valid outcome with winning price
      const outcome = clean(candidate.auction_outcome).toLowerCase();
      if (OUTCOMES.indexOf(outcome) === -1) return;
      const winPrice = toPositiveFinite(candidate.winning_bid_price);
      if (winPrice === null) return;

      // Result date in window
      const resultDate = extractDate(candidate.auction_result_date);
      if (!inWindow(resultDate, windowStart, asOf)) return;

      // Exact region_key
      if (nfc(candidate.region_key) !== targetRegion) return;

      // Exact mapped type
      if (normalizePropertyType(candidate.property_type) !== targetType) return;

      // Area diff ≤ 0.20
      const candArea = toPositiveFinite(candidate.exclusive_area);
      if (candArea === null) return;
      const areaDiff = Math.abs(candArea - targetArea) / targetArea;
      if (areaDiff > AREA_DIFF_INTERNAL) return;

      results.push({
        record: candidate,
        result_date: resultDate,
        area_delta: Math.abs(candArea - targetArea),
        id: nfc(candidate.id)
      });
    });

    return sortComparables(results);
  }

  // ─── External Comparables ────────────────────────────────────────────────────

  /**
   * Find external (MOLIT) comparables.
   * Apartment-only, exact lawd code, area ratio ≤ 0.10, same 12-month window.
   */
  function externalComparables(target, transactions, options) {
    const opts = options || {};
    const asOf = clean(opts.as_of);
    if (!asOf || !parseIsoDate(asOf)) return [];

    const windowStart = subtract12Months(asOf);
    if (!windowStart) return [];

    const targetType = normalizePropertyType(target.property_type);
    if (targetType !== "apartment") return [];

    const targetLawd = nfc(target.lawd_code);
    const targetArea = toPositiveFinite(target.exclusive_area);
    if (!targetLawd || targetArea === null) return [];

    const list = Array.isArray(transactions) ? transactions : [];
    const results = [];

    list.forEach((tx) => {
      // Transaction date in window
      const txDate = extractDate(tx.transaction_date || tx.deal_date);
      if (!inWindow(txDate, windowStart, asOf)) return;

      // Exact lawd code
      if (nfc(tx.lawd_code) !== targetLawd) return;

      // Area ratio ≤ 0.10
      const txArea = toPositiveFinite(tx.exclusive_area);
      if (txArea === null) return;
      const areaRatio = Math.abs(txArea - targetArea) / targetArea;
      if (areaRatio > AREA_RATIO_EXTERNAL) return;

      results.push({
        record: tx,
        result_date: txDate,
        area_delta: Math.abs(txArea - targetArea),
        id: nfc(tx.id || tx.official_id || "")
      });
    });

    return sortComparables(results);
  }

  /**
   * Sort comparables: result/transaction date desc, absolute area delta asc,
   * canonical ID code-point asc.
   */
  function sortComparables(items) {
    const sorted = items.slice();
    sorted.sort((a, b) => {
      // Date descending
      const dc = compareIsoDate(b.result_date, a.result_date);
      if (dc !== 0) return dc;
      // Area delta ascending
      const ad = a.area_delta - b.area_delta;
      if (ad !== 0) return ad;
      // ID code-point ascending
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return sorted;
  }

  // ─── Shadow Portfolio ────────────────────────────────────────────────────────

  /**
   * Shadow portfolio: only validated lost|skipped cases with a real winning price.
   * Reports observed missed-opportunity price; does not invent current valuation.
   */
  function shadowPortfolio(records, options) {
    const opts = options || {};
    const asOf = clean(opts.as_of);
    if (!asOf || !parseIsoDate(asOf)) return { entries: [], count: 0, total_value: 0 };

    const { eligible } = uniqueEligibleCases(records);
    const entries = [];

    eligible.forEach((record) => {
      const outcome = clean(record.auction_outcome).toLowerCase();
      if (outcome !== "lost" && outcome !== "skipped") return;

      const winPrice = toPositiveFinite(record.winning_bid_price);
      if (winPrice === null) return;

      const resultDate = extractDate(record.auction_result_date);
      if (!resultDate || !parseIsoDate(resultDate)) return;

      entries.push({
        id: nfc(record.id),
        path: canonicalPath(record),
        outcome,
        result_date: resultDate,
        winning_bid_price: winPrice,
        region_key: nfc(record.region_key)
      });
    });

    entries.sort((a, b) => {
      const dc = compareIsoDate(b.result_date, a.result_date);
      if (dc !== 0) return dc;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    const totalValue = entries.reduce((sum, e) => sum + e.winning_bid_price, 0);

    return { entries, count: entries.length, total_value: totalValue };
  }

  // ─── Concentration ───────────────────────────────────────────────────────────

  /**
   * Current-snapshot concentration by region.
   * won → acquired (at winning_bid_price); lost/skipped → excluded;
   * outcome-less watching/bidding → active (value = first finite positive of
   * my_bid_price, expected_bid, minimum_bid).
   */
  function concentration(records, options) {
    const opts = options || {};
    const { eligible } = uniqueEligibleCases(records);

    const byRegion = Object.create(null);

    eligible.forEach((record) => {
      const regionKey = nfc(record.region_key);
      if (!regionKey) return;

      const outcome = clean(record.auction_outcome).toLowerCase();
      const status = clean(record.status).toLowerCase();

      let category = null;
      let value = null;

      if (outcome === "won") {
        category = "acquired";
        value = toPositiveFinite(record.winning_bid_price);
      } else if (outcome === "lost" || outcome === "skipped") {
        // Excluded from concentration
        return;
      } else if (!outcome && (status === "watching" || status === "bidding")) {
        category = "active";
        // Value = first finite positive of my_bid_price, expected_bid, minimum_bid
        value = toPositiveFinite(record.my_bid_price)
          || toPositiveFinite(record.expected_bid)
          || toPositiveFinite(record.minimum_bid)
          || null;
      } else {
        return;
      }

      if (!byRegion[regionKey]) {
        byRegion[regionKey] = { count: 0, value: 0, valueEligibleCount: 0 };
      }
      byRegion[regionKey].count += 1;
      if (value !== null) {
        byRegion[regionKey].value += value;
        byRegion[regionKey].valueEligibleCount += 1;
      }
    });

    const totalCount = Object.values(byRegion).reduce((s, r) => s + r.count, 0);
    const totalValue = Object.values(byRegion).reduce((s, r) => s + r.value, 0);
    const totalValueEligible = Object.values(byRegion).reduce((s, r) => s + r.valueEligibleCount, 0);

    const regions = Object.keys(byRegion).sort().map((key) => {
      const r = byRegion[key];
      return {
        region_key: key,
        count: r.count,
        count_share: totalCount > 0 ? r.count / totalCount : 0,
        value: r.value,
        value_share: totalValue > 0 ? r.value / totalValue : 0,
        value_eligible_count: r.valueEligibleCount
      };
    });

    // Count warning: count denominator ≥ 3 and any count share ≥ 0.50
    const countWarnings = [];
    if (totalCount >= CONCENTRATION_MIN_COUNT) {
      regions.forEach((r) => {
        if (r.count_share >= CONCENTRATION_WARN_SHARE) {
          countWarnings.push(r.region_key);
        }
      });
    }

    // Value warning: value-eligible count ≥ 3, total value > 0, any value share ≥ 0.50
    const valueWarnings = [];
    if (totalValueEligible >= CONCENTRATION_MIN_COUNT && totalValue > 0) {
      regions.forEach((r) => {
        if (r.value_share >= CONCENTRATION_WARN_SHARE) {
          valueWarnings.push(r.region_key);
        }
      });
    }

    const countAvailable = totalCount >= CONCENTRATION_MIN_COUNT;
    const valueAvailable = totalValueEligible >= CONCENTRATION_MIN_COUNT && totalValue > 0;

    return {
      regions,
      total_count: totalCount,
      total_value: totalValue,
      total_value_eligible: totalValueEligible,
      count_available: countAvailable,
      value_available: valueAvailable,
      count_warnings: countWarnings,
      value_warnings: valueWarnings,
      count_label: countAvailable ? null : "표본 부족",
      value_label: valueAvailable ? null : "표본 부족"
    };
  }

  // ─── External Duplicate Fingerprints ─────────────────────────────────────────

  /**
   * Select accepted generation from external duplicates.
   * Greatest tuple (official_revision_at else fetched_at, fetched_at, generation_id).
   * Exact ties excluded, never first-row wins.
   */
  function selectExternalGeneration(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) return null;

    function sortKey(row) {
      const revision = clean(row.official_revision_at) || clean(row.fetched_at);
      const fetched = clean(row.fetched_at);
      const gen = clean(row.generation_id);
      return [revision, fetched, gen];
    }

    function compareKeys(a, b) {
      for (let i = 0; i < 3; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
      }
      return 0;
    }

    let best = null;
    let bestKey = null;
    let tied = false;

    list.forEach((row) => {
      const key = sortKey(row);
      if (bestKey === null) {
        best = row;
        bestKey = key;
        tied = false;
      } else {
        const cmp = compareKeys(key, bestKey);
        if (cmp > 0) {
          best = row;
          bestKey = key;
          tied = false;
        } else if (cmp === 0) {
          tied = true;
        }
      }
    });

    if (tied) return null; // Exact ties excluded
    return best;
  }

  // ─── Thesis / Invalidation ───────────────────────────────────────────────────

  const KNOWLEDGE_TIERS = Object.freeze({
    knowledge: 0,
    permanent_note: 1,
    literature_note: 2,
    knowledge_candidate: 3
  });

  /**
   * Project thesis/invalidation from linked Knowledge.
   * Render every exact-linked knowledge then permanent_note, each with
   * invalidation_conditions, sorted by tier, valid updated desc (missing/invalid last),
   * then canonical path code point; deduplicate exact canonical path.
   * literature_note and candidates separate.
   */
  function projectThesis(knowledgeRecords, options) {
    const opts = options || {};
    const linkedPaths = new Set(
      (Array.isArray(opts.linked_paths) ? opts.linked_paths : []).map(nfc)
    );

    const list = Array.isArray(knowledgeRecords) ? knowledgeRecords : [];

    // Filter to exact-linked
    const linked = list.filter((rec) => {
      const p = nfc(rec.path || rec.canonical_path || "");
      return p && linkedPaths.has(p);
    });

    // Deduplicate by canonical path
    const seen = new Set();
    const deduped = [];
    linked.forEach((rec) => {
      const p = nfc(rec.path || rec.canonical_path || "");
      if (seen.has(p)) return;
      seen.add(p);
      deduped.push(rec);
    });

    // Separate by tier
    const thesis = [];
    const literature = [];
    const candidates = [];

    deduped.forEach((rec) => {
      const type = clean(rec.type).toLowerCase();
      if (type === "knowledge" || type === "permanent_note") {
        thesis.push(rec);
      } else if (type === "literature_note") {
        literature.push(rec);
      } else if (type === "knowledge_candidate") {
        candidates.push(rec);
      }
    });

    // Sort thesis: tier asc, valid updated desc (missing/invalid last), path code point asc
    thesis.sort((a, b) => {
      const tierA = KNOWLEDGE_TIERS[clean(a.type).toLowerCase()] != null
        ? KNOWLEDGE_TIERS[clean(a.type).toLowerCase()] : 99;
      const tierB = KNOWLEDGE_TIERS[clean(b.type).toLowerCase()] != null
        ? KNOWLEDGE_TIERS[clean(b.type).toLowerCase()] : 99;
      if (tierA !== tierB) return tierA - tierB;

      const updA = extractDate(a.updated);
      const updB = extractDate(b.updated);
      const validA = updA && parseIsoDate(updA);
      const validB = updB && parseIsoDate(updB);

      if (validA && validB) {
        const dc = compareIsoDate(updB, updA); // desc
        if (dc !== 0) return dc;
      } else if (validA && !validB) {
        return -1;
      } else if (!validA && validB) {
        return 1;
      }

      const pathA = nfc(a.path || a.canonical_path || "");
      const pathB = nfc(b.path || b.canonical_path || "");
      if (pathA < pathB) return -1;
      if (pathA > pathB) return 1;
      return 0;
    });

    return {
      thesis: thesis.map((rec) => ({
        path: nfc(rec.path || rec.canonical_path || ""),
        title: clean(rec.title),
        type: clean(rec.type).toLowerCase(),
        updated: extractDate(rec.updated),
        invalidation_conditions: rec.invalidation_conditions || []
      })),
      literature: literature.map((rec) => ({
        path: nfc(rec.path || rec.canonical_path || ""),
        title: clean(rec.title),
        type: "literature_note"
      })),
      candidates: candidates.map((rec) => ({
        path: nfc(rec.path || rec.canonical_path || ""),
        title: clean(rec.title),
        type: "knowledge_candidate"
      }))
    };
  }

  // ─── Legacy Status Projection ────────────────────────────────────────────────

  /**
   * For legacy cases with status-only results (won/lost/skipped in status but
   * no canonical auction_outcome), display "결과 입력 대기".
   */
  function outcomeDisplayLabel(record) {
    const outcome = clean(record.auction_outcome).toLowerCase();
    if (OUTCOMES.indexOf(outcome) !== -1) return outcome;
    const status = clean(record.status).toLowerCase();
    if (status === "won" || status === "lost" || status === "skipped") {
      return "결과 입력 대기";
    }
    return "";
  }

  // ─── API ─────────────────────────────────────────────────────────────────────

  const api = Object.freeze({
    OUTCOMES,
    PROPERTY_TYPE_ALIASES,
    AREA_DIFF_INTERNAL,
    AREA_RATIO_EXTERNAL,
    CONCENTRATION_MIN_COUNT,
    CONCENTRATION_WARN_SHARE,
    KNOWLEDGE_TIERS,
    clean,
    nfc,
    isPositiveFinite,
    toPositiveFinite,
    parseIsoDate,
    daysInMonth,
    isoFromDate,
    compareIsoDate,
    subtract12Months,
    inWindow,
    extractDate,
    validateOutcome,
    computeFeedback,
    normalizePropertyType,
    canonicalPath,
    filenameStem,
    caseIdentity,
    uniqueEligibleCases,
    internalComparables,
    externalComparables,
    sortComparables,
    shadowPortfolio,
    concentration,
    selectExternalGeneration,
    projectThesis,
    outcomeDisplayLabel
  });

  root.AuctionLearningCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
