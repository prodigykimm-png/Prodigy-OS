(function (root) {
  "use strict";

  const SCHEMA_VERSION = "auction-decision-support.v1";
  const OUTCOMES = Object.freeze(["won", "lost", "skipped"]);
  const PRICE_OUTCOMES = Object.freeze(["won", "lost"]);
  const MIN_QUARTILE_SAMPLE = 5;
  const DEFAULT_RESULT_PERIOD = Object.freeze({ kind: "all_available_until_analysis_as_of" });

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim().normalize("NFC");
  }

  function positiveNumber(value) {
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(typeof value === "string" ? value.replace(/,/g, "").trim() : value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function canonicalPath(record) {
    return clean(record && (record.path || record.source_path || (record.file && record.file.path)));
  }

  function canonicalId(record) {
    return clean(record && (record.id || record.file_id));
  }

  function isRealIsoDate(value) {
    const raw = clean(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function normalizeAnalysisTimestamp(value) {
    const candidate = value === undefined || value === null || value === "" ? new Date() : new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
  }

  function datePart(value) {
    const raw = clean(value);
    if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return raw;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  function regionValue(record, key) {
    return clean(record && record[key]);
  }

  function identityKey(record) {
    return canonicalPath(record) || canonicalId(record);
  }

  function isCanonicalOutcome(record) {
    const outcome = clean(record && record.auction_outcome).toLowerCase();
    if (!OUTCOMES.includes(outcome) || !isRealIsoDate(record && record.auction_result_date)) return false;
    return outcome === "skipped" || positiveNumber(record && record.winning_bid_price) !== null;
  }

  function normalizeRecord(record) {
    const outcome = clean(record && record.auction_outcome).toLowerCase();
    const normalized = {
      id: canonicalId(record),
      path: canonicalPath(record),
      title: clean(record && (record.title || record.file && record.file.name)) || canonicalId(record) || "경매 물건",
      type: clean(record && record.type),
      status: clean(record && record.status),
      region_sido: regionValue(record, "region_sido"),
      region_sigungu: regionValue(record, "region_sigungu"),
      region_dong: regionValue(record, "region_dong"),
      property_type: regionValue(record, "property_type"),
      appraisal_price: positiveNumber(record && record.appraisal_price),
      expected_bid: positiveNumber(record && record.expected_bid),
      my_bid_price: positiveNumber(record && record.my_bid_price),
      winning_bid_price: positiveNumber(record && record.winning_bid_price),
      auction_outcome: outcome,
      auction_result_date: clean(record && record.auction_result_date),
      canonical_outcome: false
    };
    normalized.canonical_outcome = isCanonicalOutcome(normalized);
    return Object.freeze(normalized);
  }

  function currentIdentityMatches(current, record) {
    const currentPath = canonicalPath(current);
    const currentId = canonicalId(current);
    return Boolean((currentPath && currentPath === record.path) || (currentId && currentId === record.id));
  }

  function buildCohortIdentity(currentAuction, cohortPolicy) {
    const policy = cohortPolicy && typeof cohortPolicy === "object" ? cohortPolicy : {};
    return Object.freeze({
      region_sido: clean(policy.region_sido || currentAuction.region_sido),
      region_sigungu: clean(policy.region_sigungu || currentAuction.region_sigungu),
      property_type: clean(policy.property_type || currentAuction.property_type)
    });
  }

  function normalizeResultPeriod(value, analysisAsOf) {
    if (!value || typeof value !== "object") return DEFAULT_RESULT_PERIOD;
    const start = clean(value.start || value.from);
    const end = clean(value.end || value.to);
    const analysisDate = datePart(analysisAsOf);
    if ((start && !isRealIsoDate(start)) || (end && !isRealIsoDate(end))) return DEFAULT_RESULT_PERIOD;
    if (start && end && start > end) return DEFAULT_RESULT_PERIOD;
    if (end && analysisDate && end > analysisDate) return Object.freeze({ kind: "all_available_until_analysis_as_of", requested_end: end });
    return Object.freeze({ kind: "declared_result_period", start: start || null, end: end || analysisDate || null });
  }

  function buildDiagnostics(records) {
    return Object.freeze(records.flatMap((record) => {
      if (record.canonical_outcome) return [];
      const hasTerminalStatus = ["won", "lost", "skipped"].includes(record.status);
      const hasOutcomeFields = Boolean(record.auction_outcome || record.auction_result_date || record.winning_bid_price !== null);
      return hasTerminalStatus || hasOutcomeFields
        ? [Object.freeze({
          code: "non_canonical_outcome",
          id: record.id,
          path: record.path,
          message: "정규 outcome tuple이 아니어서 결과 통계에서 제외했습니다."
        })]
        : [];
    }));
  }

  function buildAuctionDecisionDataset(input) {
    const options = input || {};
    const currentRaw = options.currentAuction || options.auction || options.current || {};
    const current = normalizeRecord(currentRaw);
    const analysisAsOf = normalizeAnalysisTimestamp(options.generationStartedAt || options.analysis_as_of);
    const cases = Array.isArray(options.cases)
      ? options.cases
      : options.context && Array.isArray(options.context.cases)
        ? options.context.cases
        : Array.isArray(options.pages)
          ? options.pages
          : [];
    const seen = new Set();
    const records = cases.flatMap((record) => {
      const normalized = normalizeRecord(record);
      const identity = identityKey(normalized);
      if (normalized.type !== "auction_case" || !identity || seen.has(identity) || currentIdentityMatches(currentRaw, normalized)) return [];
      seen.add(identity);
      return [normalized];
    });
    const cohort = buildCohortIdentity(current, options.cohortPolicy);
    const resultPeriod = normalizeResultPeriod(options.resultPeriod, analysisAsOf);
    const invalidTimestamp = analysisAsOf === null;
    return Object.freeze({
      schema_version: SCHEMA_VERSION,
      analysis_as_of: analysisAsOf,
      current,
      cohort,
      result_period: resultPeriod,
      records: Object.freeze(records),
      diagnostics: buildDiagnostics(records),
      warnings: Object.freeze(invalidTimestamp ? ["조사 시작 시각을 확인할 수 없습니다."] : [])
    });
  }

  function matchesResultPeriod(record, period) {
    if (!period || period.kind !== "declared_result_period") return true;
    const date = clean(record.auction_result_date);
    if (!isRealIsoDate(date)) return false;
    if (period.start && date < period.start) return false;
    if (period.end && date > period.end) return false;
    return true;
  }

  function selectAuctionDecisionCohort(dataset, policy) {
    const source = dataset && Array.isArray(dataset.records) ? dataset.records : [];
    const base = dataset && dataset.cohort ? dataset.cohort : {};
    const requested = policy && typeof policy === "object" ? policy : {};
    const cohort = {
      region_sido: clean(requested.region_sido || base.region_sido),
      region_sigungu: clean(requested.region_sigungu || base.region_sigungu),
      property_type: clean(requested.property_type || base.property_type)
    };
    const period = requested.resultPeriod || (dataset && dataset.result_period);
    return Object.freeze(source.filter((record) => (
      record.canonical_outcome
      && record.region_sido === cohort.region_sido
      && record.region_sigungu === cohort.region_sigungu
      && record.property_type === cohort.property_type
      && matchesResultPeriod(record, period)
    )));
  }

  function round(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function quantile(values, probability) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function sampleState(count) {
    if (count === 0) return "empty";
    return count < MIN_QUARTILE_SAMPLE ? "small" : "established";
  }

  function summarizeWinningBidRatios(cohort) {
    const source = Array.isArray(cohort) ? cohort : [];
    const outcomeRecords = source.filter((record) => PRICE_OUTCOMES.includes(record.auction_outcome));
    const entries = outcomeRecords.flatMap((record) => {
      const winning = positiveNumber(record.winning_bid_price);
      const appraisal = positiveNumber(record.appraisal_price);
      if (winning === null || appraisal === null) return [];
      return [Object.freeze({
        id: record.id,
        path: record.path,
        outcome: record.auction_outcome,
        result_date: record.auction_result_date,
        winning_bid_price: winning,
        appraisal_price: appraisal,
        ratio_percent: round((winning / appraisal) * 100)
      })];
    });
    const ratios = entries.map((entry) => entry.ratio_percent);
    return Object.freeze({
      sample_count: ratios.length,
      sample_state: sampleState(ratios.length),
      average_percent: ratios.length ? round(ratios.reduce((sum, value) => sum + value, 0) / ratios.length) : null,
      median_percent: round(quantile(ratios, 0.5)),
      ratio_percentiles: Object.freeze({
        q25: round(quantile(ratios, 0.25)),
        median: round(quantile(ratios, 0.5)),
        q75: round(quantile(ratios, 0.75))
      }),
      min_percent: ratios.length ? Math.min(...ratios) : null,
      max_percent: ratios.length ? Math.max(...ratios) : null,
      excluded_count: Math.max(0, source.length - entries.length),
      records: Object.freeze(entries)
    });
  }

  function summarizePersonalLostBidGaps(cohort) {
    const lost = (Array.isArray(cohort) ? cohort : []).filter((record) => record.auction_outcome === "lost");
    const entries = lost.flatMap((record) => {
      const winning = positiveNumber(record.winning_bid_price);
      const mine = positiveNumber(record.my_bid_price);
      if (winning === null || mine === null) return [];
      const gap = winning - mine;
      return [Object.freeze({
        id: record.id,
        path: record.path,
        result_date: record.auction_result_date,
        my_bid_price: mine,
        winning_bid_price: winning,
        gap_won: gap,
        gap_percent: round((gap / mine) * 100)
      })];
    });
    return Object.freeze({
      sample_count: entries.length,
      sample_state: sampleState(entries.length),
      average_gap_won: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.gap_won, 0) / entries.length) : null,
      median_gap_won: entries.length ? Math.round(quantile(entries.map((entry) => entry.gap_won), 0.5)) : null,
      average_gap_percent: entries.length ? round(entries.reduce((sum, entry) => sum + entry.gap_percent, 0) / entries.length) : null,
      excluded_count: Math.max(0, lost.length - entries.length),
      records: Object.freeze(entries)
    });
  }

  function summarizePersonalWonHistory(cohort) {
    const won = (Array.isArray(cohort) ? cohort : []).filter((record) => record.auction_outcome === "won");
    const entries = won.flatMap((record) => {
      const winning = positiveNumber(record.winning_bid_price);
      const mine = positiveNumber(record.my_bid_price);
      if (winning === null || mine === null) return [];
      return [Object.freeze({
        id: record.id,
        path: record.path,
        result_date: record.auction_result_date,
        my_bid_price: mine,
        winning_bid_price: winning,
        bid_to_winning_gap_won: winning - mine,
        bid_to_winning_ratio_percent: round((mine / winning) * 100)
      })];
    });
    return Object.freeze({
      sample_count: entries.length,
      sample_state: sampleState(entries.length),
      records: Object.freeze(entries),
      excluded_count: Math.max(0, won.length - entries.length)
    });
  }

  function buildCompetitionReferences(summary, currentAuction) {
    const ratioSummary = summary || {};
    const appraisal = positiveNumber(currentAuction && currentAuction.appraisal_price);
    const percentiles = ratioSummary.ratio_percentiles || {};
    if (ratioSummary.sample_count < MIN_QUARTILE_SAMPLE) {
      return Object.freeze({
        status: "insufficient_sample",
        sample_count: ratioSummary.sample_count || 0,
        ratio_percentiles: Object.freeze({ q25: null, median: null, q75: null }),
        appraisal_scaled_won: null,
        message: "정확히 일치하는 결과가 5건 미만이라 경쟁 가격 참고치를 표시하지 않습니다."
      });
    }
    if (appraisal === null) {
      return Object.freeze({
        status: "missing_appraisal",
        sample_count: ratioSummary.sample_count,
        ratio_percentiles: Object.freeze({ q25: percentiles.q25 || null, median: percentiles.median || null, q75: percentiles.q75 || null }),
        appraisal_scaled_won: null,
        message: "현재 물건의 감정가가 없어 감정가 환산 참고치를 만들 수 없습니다."
      });
    }
    const q25 = Number(percentiles.q25);
    const median = Number(percentiles.median);
    const q75 = Number(percentiles.q75);
    if (![q25, median, q75].every(Number.isFinite)) {
      return Object.freeze({
        status: "incomplete_summary",
        sample_count: ratioSummary.sample_count,
        ratio_percentiles: Object.freeze({ q25: null, median: null, q75: null }),
        appraisal_scaled_won: null,
        message: "비율 분포를 계산할 수 없어 경쟁 가격 참고치를 만들 수 없습니다."
      });
    }
    return Object.freeze({
      status: "available",
      sample_count: ratioSummary.sample_count,
      appraisal_price: appraisal,
      ratio_percentiles: Object.freeze({ q25, median, q75 }),
      appraisal_scaled_won: Object.freeze({
        q25: Math.round(appraisal * q25 / 100),
        median: Math.round(appraisal * median / 100),
        q75: Math.round(appraisal * q75 / 100)
      }),
      message: "정확히 일치하는 시·군·구·물건 유형의 정규 결과를 감정가에 환산한 참고치입니다."
    });
  }

  function buildDecisionSupportProjection(input) {
    const dataset = input && input.dataset && Array.isArray(input.dataset.records)
      ? input.dataset
      : buildAuctionDecisionDataset(input);
    const currentAuction = input && (input.currentAuction || input.auction || input.current)
      ? input.currentAuction || input.auction || input.current
      : dataset.current;
    const cohort = selectAuctionDecisionCohort(dataset, input && input.cohortPolicy);
    const winningBidRatios = summarizeWinningBidRatios(cohort);
    const personalLostBidGaps = summarizePersonalLostBidGaps(cohort);
    const personalWonHistory = summarizePersonalWonHistory(cohort);
    const competitionReferences = buildCompetitionReferences(winningBidRatios, currentAuction);
    const warnings = ["현재 시점의 누적 결과만 사용합니다."];
    if (dataset.diagnostics && dataset.diagnostics.length) warnings.push("정규 outcome tuple이 아닌 기록은 결과 통계에서 제외했습니다.");
    if (competitionReferences.status !== "available") warnings.push(competitionReferences.message);
    return Object.freeze({
      schema_version: SCHEMA_VERSION,
      analysis_as_of: dataset.analysis_as_of,
      current_time_only: true,
      current_case_ref: dataset.current && (dataset.current.path || dataset.current.id) || null,
      cohort: dataset.cohort,
      cohort_count: cohort.length,
      winning_bid_ratios: winningBidRatios,
      personal_lost_bid_gaps: personalLostBidGaps,
      personal_won_history: personalWonHistory,
      competition_references: competitionReferences,
      warnings: Object.freeze(warnings),
      source_refs: Object.freeze(cohort.map((record) => record.path || record.id).filter(Boolean))
    });
  }

  const api = Object.freeze({
    SCHEMA_VERSION,
    OUTCOMES,
    MIN_QUARTILE_SAMPLE,
    buildAuctionDecisionDataset,
    selectAuctionDecisionCohort,
    summarizeWinningBidRatios,
    summarizePersonalLostBidGaps,
    summarizePersonalWonHistory,
    buildCompetitionReferences,
    buildDecisionSupportProjection,
    isCanonicalOutcome,
    normalizeRecord
  });
  root.AuctionDecisionSupportCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
