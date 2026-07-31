(function (root) {
  "use strict";

  const OUTCOMES = Object.freeze(["won", "lost", "skipped"]);
  const TERMINAL_STATUSES = Object.freeze(["won", "lost", "skipped"]);
  const REASON_FIELDS = Object.freeze([
    Object.freeze({ key: "decision_reason", label: "결정 사유" }),
    Object.freeze({ key: "my_opinion", label: "내 판단" }),
    Object.freeze({ key: "auction_note", label: "메모" })
  ]);

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function positiveNumber(value) {
    const parsed = Number(clean(value).replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function canonicalPath(record) {
    return clean(record && (record.path || record.source_path || (record.file && record.file.path))).normalize("NFC");
  }

  function regionKeyOf(record) {
    if (!record) return "";
    const explicit = clean(record.region_key);
    if (explicit) return explicit.normalize("NFC");
    const sido = clean(record.region_sido);
    const sigungu = clean(record.region_sigungu);
    return sido && sigungu ? `${sido}-${sigungu}`.normalize("NFC") : "";
  }

  function isRealIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function isCanonicalOutcome(record) {
    const outcome = clean(record && record.auction_outcome).toLowerCase();
    if (!OUTCOMES.includes(outcome) || !isRealIsoDate(record && record.auction_result_date)) return false;
    return outcome === "skipped" || positiveNumber(record && record.winning_bid_price) !== null;
  }

  function humanReasons(record) {
    return Object.freeze(REASON_FIELDS.flatMap((field) => {
      const value = clean(record && record[field.key]);
      return value ? [Object.freeze({ key: field.key, label: field.label, value })] : [];
    }));
  }

  function snapshotCase(record) {
    return Object.freeze({
      id: clean(record && record.id),
      path: canonicalPath(record),
      type: clean(record && record.type),
      title: clean(record && record.title),
      status: clean(record && record.status),
      region_key: regionKeyOf(record),
      region_sido: clean(record && record.region_sido),
      region_sigungu: clean(record && record.region_sigungu),
      region_dong: clean(record && record.region_dong),
      property_type: clean(record && record.property_type),
      decision_reason: clean(record && record.decision_reason),
      my_opinion: clean(record && record.my_opinion),
      auction_note: clean(record && record.auction_note),
      expected_bid: positiveNumber(record && record.expected_bid),
      my_bid_price: positiveNumber(record && record.my_bid_price),
      appraisal_price: positiveNumber(record && record.appraisal_price),
      auction_outcome: clean(record && record.auction_outcome).toLowerCase(),
      auction_result_date: clean(record && record.auction_result_date),
      winning_bid_price: positiveNumber(record && record.winning_bid_price)
    });
  }

  function snapshotAuctionCases(pages) {
    const source = Array.isArray(pages) ? pages : [];
    const seen = new Set();
    const cases = source.flatMap((page) => {
      if (clean(page && page.type) !== "auction_case") return [];
      const snapshot = snapshotCase(page);
      const identity = snapshot.path || snapshot.id;
      if (!identity || seen.has(identity)) return [];
      seen.add(identity);
      return [snapshot];
    });
    return Object.freeze({ cases: Object.freeze(cases) });
  }

  function projectDecisionMirror(input) {
    const options = input || {};
    const regionKey = clean(options.regionKey).normalize("NFC");
    const auction = snapshotCase(options.auction || {});
    const contextCases = options.context && Array.isArray(options.context.cases) ? options.context.cases : options.cases;
    const cases = (Array.isArray(contextCases) ? contextCases : []).map(snapshotCase);
    const currentPath = auction.path;
    const currentId = auction.id;
    const regional = cases.filter((record) => {
      const sameCurrent = (currentPath && record.path === currentPath) || (currentId && record.id === currentId);
      return !sameCurrent && record.type === "auction_case" && record.region_key === regionKey;
    });

    const outcomes = regional.filter(isCanonicalOutcome).map((record) => {
      const winningPrice = positiveNumber(record.winning_bid_price);
      const appraisalPrice = positiveNumber(record.appraisal_price);
      const bidRate = winningPrice !== null && appraisalPrice !== null
        ? Math.round((winningPrice / appraisalPrice) * 10000) / 100
        : null;
      return Object.freeze({
        id: record.id,
        path: record.path,
        title: record.title || record.id || "경매 물건",
        outcome: record.auction_outcome,
        result_date: record.auction_result_date,
        region_dong: record.region_dong || null,
        property_type: record.property_type || null,
        decision_reason: record.decision_reason || null,
        winning_bid_price: winningPrice,
        appraisal_price: appraisalPrice,
        bid_rate_percent: bidRate
      });
    }).sort((a, b) => b.result_date.localeCompare(a.result_date) || a.id.localeCompare(b.id, "ko"));

    const rates = outcomes.map((item) => item.bid_rate_percent).filter((value) => value !== null);
    const average = rates.length > 0 ? Math.round((rates.reduce((sum, value) => sum + value, 0) / rates.length) * 100) / 100 : null;
    const legacyPendingCount = regional.filter((record) => !isCanonicalOutcome(record) && TERMINAL_STATUSES.includes(record.status)).length;
    const regionSigungu = regionKey.includes("-") ? regionKey.slice(regionKey.indexOf("-") + 1) : regionKey;

    return Object.freeze({
      region_key: regionKey,
      region_scope_label: regionSigungu ? `${regionSigungu} 기준` : "지역 기준",
      current_decision: Object.freeze({
        region_dong: auction.region_dong || null,
        property_type: auction.property_type || null,
        expected_bid: auction.expected_bid,
        my_bid_price: auction.my_bid_price,
        reasons: humanReasons(auction)
      }),
      canonical_outcome_count: outcomes.length,
      legacy_pending_count: legacyPendingCount,
      outcomes: Object.freeze(outcomes),
      bid_rate_summary: Object.freeze({
        sample_count: rates.length,
        average_percent: average,
        sample_state: rates.length === 0 ? "empty" : (rates.length < 3 ? "small" : "established")
      }),
      empty_state: outcomes.length === 0 ? "정규 결과 기록이 없습니다." : null
    });
  }

  const api = Object.freeze({ OUTCOMES, REASON_FIELDS, snapshotAuctionCases, projectDecisionMirror });
  root.AuctionDecisionMirrorCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
