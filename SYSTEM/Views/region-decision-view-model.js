"use strict";

/**
 * region-decision-view-model.js
 * Pure data projection for the Region decision popup.
 * No DOM, no Obsidian API — takes parsed Region Object content
 * and projects it into tab-ready view data.
 * Contract: .omo/plans/prodigy-region-workspace-consolidation.md Todo 14
 */

const TAB_DEFS = Object.freeze([
  Object.freeze({ id: "decision_context", label: "판단 맥락" }),
  Object.freeze({ id: "region_evidence", label: "지역 근거" }),
  Object.freeze({ id: "cases_visit", label: "사례·임장" })
]);

const FRESHNESS_THRESHOLDS = Object.freeze({
  fresh_days: 90,
  stale_days: 180
});

/**
 * Compute four independent trust badges. Never aggregated.
 * @param {object} frontmatter - parsed YAML frontmatter
 * @param {object} body - parsed body sections
 * @param {Date} [now]
 * @returns {{ freshness: object, verification: object, coverage: object, schema: object }}
 */
function computeTrustBadges(frontmatter, body, now) {
  const ref = now || new Date();

  // Freshness: based on metrics_as_of age
  let freshness;
  if (!frontmatter.metrics_as_of) {
    freshness = { level: "unavailable", label: "수집 데이터 없음" };
  } else {
    const asOf = new Date(frontmatter.metrics_as_of);
    const ageDays = Math.floor((ref.getTime() - asOf.getTime()) / (86400000));
    if (ageDays <= FRESHNESS_THRESHOLDS.fresh_days) {
      freshness = { level: "fresh", label: `${ageDays}일 전`, ageDays };
    } else if (ageDays <= FRESHNESS_THRESHOLDS.stale_days) {
      freshness = { level: "aging", label: `${ageDays}일 전 — 확인 권장`, ageDays };
    } else {
      freshness = { level: "stale", label: `데이터 만료 — 재수집 필요 (${ageDays}일)`, ageDays };
    }
  }

  // Verification: from verification_status
  let verification;
  const vs = frontmatter.verification_status;
  if (vs === "verified") verification = { level: "verified", label: "사람 검증 완료" };
  else if (vs === "unverified") verification = { level: "unverified", label: "자동 수집 — 사람 검증 전" };
  else verification = { level: "unavailable", label: "검증 상태 없음" };

  // Coverage: from source count in body
  let coverage;
  const sourceCount = (body && body.source_count) || 0;
  if (sourceCount >= 5) coverage = { level: "full", label: `출처 ${sourceCount}개` };
  else if (sourceCount >= 2) coverage = { level: "partial", label: `출처 ${sourceCount}개 — 일부 부족` };
  else if (sourceCount >= 1) coverage = { level: "minimal", label: `출처 ${sourceCount}개 — 최소` };
  else coverage = { level: "unavailable", label: "출처 없음" };

  // Schema: from schema compliance
  let schema;
  if (frontmatter.type === "auction_region" && frontmatter.region_sido && frontmatter.region_sigungu) {
    schema = { level: "compliant", label: "스키마 적합" };
  } else {
    schema = { level: "noncompliant", label: "스키마 미달" };
  }

  return Object.freeze({ freshness, verification, coverage, schema });
}

/**
 * Extract transit info from body.
 * @returns {{ available: boolean, lines: Array, reason?: string }}
 */
function projectTransit(body) {
  if (!body || !body.transit_block) {
    return { available: false, lines: [], reason: "확인된 도시철도 정보 없음" };
  }
  const block = body.transit_block;
  if (block.malformed) {
    return { available: false, lines: [], reason: "정보 확인 불가" };
  }
  if (!block.available || !block.lines || block.lines.length === 0) {
    return { available: false, lines: [], reason: "확인된 도시철도 정보 없음" };
  }
  return { available: true, lines: block.lines };
}

/**
 * Project a parsed Region Object into tab-ready view data.
 * @param {object} regionData - { frontmatter, body, regionKey }
 * @param {Date} [now]
 * @returns {{ regionKey, title, tabs, trustBadges, collectionStatus }}
 */
function projectRegionPopup(regionData, now) {
  const fm = regionData.frontmatter || {};
  const body = regionData.body || {};
  const regionKey = regionData.regionKey || "";
  const title = fm.title || regionKey;

  const trustBadges = computeTrustBadges(fm, body, now);

  // Tab: 핵심
  const coreAvailable = Boolean(fm.metrics_as_of || fm.housing_stock);
  const coreTab = {
    id: "core", label: "핵심",
    available: coreAvailable,
    content: coreAvailable ? {
      metrics_as_of: fm.metrics_as_of || null,
      housing_stock: fm.housing_stock || null,
      sale_volume_3m: fm.sale_volume_3m || null,
      sale_price_change_yoy: fm.sale_price_change_yoy || null,
      jeonse_ratio: fm.jeonse_ratio || null,
      households: fm.households || null
    } : null,
    unavailableReason: coreAvailable ? null : "수집 데이터 없음"
  };

  // Tab: 변화
  const changeAvailable = Boolean(fm.sale_price_change_yoy != null || fm.household_change_yoy != null);
  const changeTab = {
    id: "change", label: "변화",
    available: changeAvailable,
    content: changeAvailable ? {
      sale_price_change_yoy: fm.sale_price_change_yoy,
      household_change_yoy: fm.household_change_yoy,
      sale_turnover_rate: fm.sale_turnover_rate
    } : null,
    unavailableReason: changeAvailable ? null : "수집 데이터 없음"
  };

  // Tab: 실거래
  const dealsAvailable = Boolean(body.comparables && body.comparables.length > 0);
  const dealsTab = {
    id: "deals", label: "실거래",
    available: dealsAvailable,
    content: dealsAvailable ? { comparables: body.comparables } : null,
    unavailableReason: dealsAvailable ? null : "실거래 데이터 없음"
  };

  // Tab: 공급·일자리
  const supplyAvailable = Boolean(fm.move_in_12m != null || fm.housing_stock != null);
  const supplyTab = {
    id: "supply_jobs", label: "공급·일자리",
    available: supplyAvailable,
    content: supplyAvailable ? {
      move_in_12m: fm.move_in_12m,
      move_in_24m: fm.move_in_24m,
      housing_stock: fm.housing_stock,
      supply_pipeline: body.supply_pipeline || []
    } : null,
    unavailableReason: supplyAvailable ? null : "수집 데이터 없음"
  };

  // Tab: 교통·생활
  const transit = projectTransit(body);
  const transitTab = {
    id: "transit_life", label: "교통·생활",
    available: transit.available,
    content: transit.available ? { lines: transit.lines } : null,
    unavailableReason: transit.available ? null : transit.reason
  };

  // Tab: 지식·논지
  const knowledgeAvailable = Boolean(body.thesis || (body.knowledge_links && body.knowledge_links.length > 0));
  const knowledgeTab = {
    id: "knowledge_thesis", label: "지식·논지",
    available: knowledgeAvailable,
    content: knowledgeAvailable ? {
      thesis: body.thesis || null,
      invalidation: body.invalidation || null,
      knowledge_links: body.knowledge_links || []
    } : null,
    unavailableReason: knowledgeAvailable ? null : "연결된 지식 없음"
  };

  // Tab: 임장
  const siteVisitAvailable = Boolean(body.site_visits && body.site_visits.length > 0);
  const siteVisitCount = siteVisitAvailable ? body.site_visits.length : 0;
  const siteVisitTab = {
    id: "site_visit", label: siteVisitCount ? `임장 ${siteVisitCount}` : "임장",
    available: true, // always available — can add new
    content: { site_visits: body.site_visits || [], can_add: true },
    unavailableReason: null
  };

  const evidenceSections = [coreTab, changeTab, dealsTab, supplyTab, transitTab, knowledgeTab];
  const caseSections = [
    ...(regionData.connectedAuctions ? [{ id: "connected_auctions", label: "연결 경매", available: true, content: regionData.connectedAuctions, unavailableReason: null }] : []),
    ...(regionData.decisionMirror ? [{ id: "decision_outcome", label: "현재 사건 대조", available: true, content: regionData.decisionMirror, unavailableReason: null }] : []),
    siteVisitTab
  ];
  const decisionContext = regionData.decisionContext || {
    status: "unavailable",
    identity: { region_key: regionKey, title },
    trust: { metrics_as_of: fm.metrics_as_of || null, verification_status: fm.verification_status || null },
    questions: [],
    checks: [{ kind: "missing_context", message: "판단 맥락을 준비하지 못했습니다." }]
  };
  const tabs = [
    { id: "decision_context", label: "판단 맥락", available: true, content: decisionContext, unavailableReason: null },
    { id: "region_evidence", label: "지역 근거", available: true, content: { sections: evidenceSections }, unavailableReason: null },
    { id: "cases_visit", label: "사례·임장", available: true, content: { sections: caseSections }, unavailableReason: null }
  ];

  // Collection status
  const collectionStatus = {
    last_collection: fm.source_as_of || null,
    provider_states: body.provider_states || {},
    next_due: body.next_due || null
  };

  return Object.freeze({
    regionKey,
    title,
    tabs: Object.freeze(tabs),
    trustBadges,
    collectionStatus
  });
}

const api = Object.freeze({
  TAB_DEFS,
  FRESHNESS_THRESHOLDS,
  computeTrustBadges,
  projectTransit,
  projectRegionPopup
});

const root = typeof window !== "undefined" ? window : globalThis;
root.RegionDecisionViewModel = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
