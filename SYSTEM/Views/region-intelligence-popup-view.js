"use strict";

/**
 * region-intelligence-popup-view.js
 * DOM rendering for the Region decision popup. Mobile-safe.
 * Compact widths: no horizontal overflow. Touch targets use shared tokens.
 * Korean labels. Never writes to Objects.
 * Contract: .omo/plans/prodigy-region-workspace-consolidation.md Todo 14
 */

const root = typeof window !== "undefined" ? window : globalThis;

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatWon(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${Math.round(number).toLocaleString("ko-KR")}원` : "없음";
}

function tokenApi() {
  const api = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
  if (!api || !api.BREAKPOINTS || !api.CONTROL_HEIGHTS) throw new Error("ProdigyTokens를 먼저 불러와야 합니다.");
  return api;
}

function touchStyle() {
  const size = tokenApi().CONTROL_HEIGHTS.touchTarget;
  return `min-height:${size}px;min-width:${size}px`;
}

const REGION_LABELS = Object.freeze({
  metrics_as_of: "지표 기준일",
  metrics_scope: "지표 범위",
  metrics_provider: "시장 지표 공급자",
  metrics_source: "지표 출처",
  source_as_of: "출처 확인일",
  housing_stock: "주택 재고",
  sale_volume_3m: "매매 거래량(3개월)",
  sale_turnover_rate: "매매 회전율",
  sale_price_change_yoy: "매매가 변동(전년 대비)",
  jeonse_ratio: "전세가율",
  households: "세대수",
  household_change_yoy: "세대수 변동(전년 대비)",
  move_in_12m: "입주 예정(12개월)",
  move_in_24m: "입주 예정(24개월)",
  move_in_36m: "입주 예정(36개월)",
  move_in_48m: "입주 예정(48개월)",
  move_in_60m: "입주 예정(60개월)",
  housing_stock_basis: "주택 재고 기준",
  sale_price_change_basis: "매매가 변동 기준",
  project_name: "사업명",
  stage: "진행 단계",
  units: "세대수",
  expected_month: "예정 시기",
  result_date: "거래일",
  winning_bid_price: "낙찰가",
  exclusive_area: "전용면적",
  property_type: "물건 유형",
  apartment_name: "단지명",
  price: "거래금액"
});
const REGION_PERCENT_KEYS = new Set(["sale_price_change_yoy", "jeonse_ratio", "household_change_yoy"]);
const REGION_DATE_KEYS = new Set(["metrics_as_of", "source_as_of", "land_price_trend_as_of"]);
const REGION_UNIT_KEYS = Object.freeze({ housing_stock: "호", sale_volume_3m: "건", households: "세대", units: "세대" });
const SUPPLY_STAGE_LABELS = Object.freeze({ planned: "계획", approved: "승인", under_construction: "공사 중" });

function propertyLabel(key) {
  if (REGION_LABELS[key]) return REGION_LABELS[key];
  const displayLabel = root.prodigyDisplay && typeof root.prodigyDisplay.property === "function" ? root.prodigyDisplay.property(key) : "";
  return displayLabel && displayLabel !== "미등록 항목" ? displayLabel : "지역 정보";
}

function formatRegionValue(key, value) {
  if (value === undefined || value === null || value === "") return "자료 없음";
  if (REGION_DATE_KEYS.has(key)) return String(value).slice(0, 10).replace(/-/gu, ".");
  if (REGION_PERCENT_KEYS.has(key) && Number.isFinite(Number(value))) return `${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
  if (key === "sale_turnover_rate" && Number.isFinite(Number(value))) return `${(Number(value) * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
  if (key === "stage") return SUPPLY_STAGE_LABELS[value] || "진행 단계 확인 필요";
  if (Array.isArray(value)) return value.length ? `${value.length}건` : "자료 없음";
  if (typeof value === "object") return "세부 자료 있음";
  if (typeof value === "number") return `${value.toLocaleString("ko-KR")}${REGION_UNIT_KEYS[key] || ""}`;
  return String(value);
}

function renderMetricTable(content, caption) {
  const entries = Object.entries(content || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return `<div class="region-popup-empty">수집 데이터 없음</div>`;
  const rows = entries.map(([key, value]) => `<tr><th scope="row">${escapeHtml(propertyLabel(key))}</th><td>${escapeHtml(formatRegionValue(key, value))}</td></tr>`).join("");
  return `<table class="region-popup-table region-metric-table"><caption>${escapeHtml(caption)}</caption><tbody>${rows}</tbody></table>`;
}

function renderSupplyPipeline(items) {
  if (!Array.isArray(items) || !items.length) return `<div class="region-popup-empty">확정된 중장기 공급 자료가 없습니다.</div>`;
  const rows = items.map((item) => `<tr><th scope="row">${escapeHtml(item.project_name || "사업명 없음")}</th><td>${escapeHtml(formatRegionValue("stage", item.stage))}</td><td>${escapeHtml(formatRegionValue("units", item.units))}</td><td>${escapeHtml(formatRegionValue("expected_month", item.expected_month))}</td></tr>`).join("");
  return `<table class="region-popup-table region-supply-table"><caption>중장기 공급</caption><thead><tr><th scope="col">사업</th><th scope="col">단계</th><th scope="col">규모</th><th scope="col">예정</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderComparables(items) {
  if (!Array.isArray(items) || !items.length) return `<div class="region-popup-empty">실거래 자료 없음</div>`;
  return `<div class="region-comparable-list">${items.slice(0, 10).map((item, index) => {
    const entries = Object.entries(item || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
    const rows = entries.map(([key, value]) => `<div class="region-decision-row"><span>${escapeHtml(propertyLabel(key))}</span><strong>${escapeHtml(formatRegionValue(key, value))}</strong></div>`).join("");
    return `<section class="region-comparable-card" aria-labelledby="region-comparable-${index}"><h4 id="region-comparable-${index}">비교 거래 ${index + 1}</h4>${rows || `<div class="region-popup-empty">표시할 거래 정보 없음</div>`}</section>`;
  }).join("")}</div>`;
}

function renderKnowledge(content) {
  const list = (values) => Array.isArray(values) && values.length ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : `<p class="region-popup-empty">연결된 항목 없음</p>`;
  const thesis = content && content.thesis ? `<section><h3>지역 논지</h3><p>${escapeHtml(content.thesis)}</p></section>` : "";
  const invalidation = content && content.invalidation ? `<section><h3>무효화 조건</h3><p>${escapeHtml(content.invalidation)}</p></section>` : "";
  const links = `<section><h3>연결 지식</h3>${list(content && content.knowledge_links)}</section>`;
  return `<div class="region-knowledge-content">${thesis}${invalidation}${links}</div>`;
}

const BADGE_CLASSES = Object.freeze({
  fresh: "region-badge-fresh",
  aging: "region-badge-aging",
  stale: "region-badge-stale",
  unavailable: "region-badge-unavailable",
  verified: "region-badge-verified",
  unverified: "region-badge-unverified",
  full: "region-badge-full",
  partial: "region-badge-partial",
  minimal: "region-badge-minimal",
  compliant: "region-badge-compliant",
  noncompliant: "region-badge-noncompliant"
});

/**
 * Render trust badges HTML.
 * @param {object} badges - from computeTrustBadges
 * @returns {string} HTML
 */
function renderTrustBadges(badges) {
  const source = badges || {};
  const items = [
    { key: "freshness", label: "최신성", badge: source.freshness },
    { key: "verification", label: "검증", badge: source.verification },
    { key: "coverage", label: "출처", badge: source.coverage },
    { key: "schema", label: "스키마", badge: source.schema }
  ];
  return `<div class="region-trust-badges" role="list" aria-label="신뢰도 배지">${items.map((item) => {
    const badge = item.badge || {};
    const label = String(item.label || "상태");
    const value = String(badge.label || "확인 불가");
    const cls = BADGE_CLASSES[badge.level] || "region-badge-unavailable";
    return `<div class="region-trust-badge ${cls}" role="listitem" aria-label="${escapeHtml(`${label}: ${value}`)}"><span class="region-badge-key">${escapeHtml(label)}</span><span class="region-badge-value">${escapeHtml(value)}</span></div>`;
  }).join("")}</div>`;
}

function renderCollectionHealth(health) {
  if (!health || health.status === "unavailable") {
    return `<div class="region-collection-health is-unavailable" role="status"><span>수집 상태</span><strong>확인 불가</strong></div>`;
  }
  const selected = health.selected_region;
  const selectedText = !selected || !selected.covered
    ? "이 지역 스냅샷 없음"
    : `이 지역 ${escapeHtml(selected.latest_metrics_as_of || "기준월 없음")} · ${escapeHtml(selected.snapshot_count)}회 수집`;
  const warningParts = [];
  if (health.missing_region_keys.length) warningParts.push(`미수집 ${health.missing_region_keys.length}곳`);
  if (health.stale_region_keys.length) warningParts.push(`만료 ${health.stale_region_keys.length}곳`);
  if (health.duplicate_months.length) warningParts.push(`동일 기준월 반복 ${health.duplicate_months.length}건`);
  const warning = warningParts.length ? warningParts.join(" · ") : "전체 수집 상태 정상";
  return `<div class="region-collection-health${health.status === "attention" ? " is-attention" : ""}" role="status" aria-label="지역 데이터 수집 상태">
    <div><span class="region-health-label">수집 커버리지</span><strong>${escapeHtml(`${health.covered_count}/${health.expected_count} (${health.coverage_percent}%)`)}</strong></div>
    <div>${selectedText}</div>
    <div>${escapeHtml(warning)}</div>
  </div>`;
}

/**
 * Render tab bar HTML. Horizontal scroll on narrow screens.
 * @param {Array} tabs
 * @param {number} activeIndex
 * @returns {string} HTML
 */
function renderTabBar(tabs, activeIndex) {
  return `<div class="region-popup-tabs" role="tablist" aria-label="지역 정보 탭" style="overflow-x:auto;display:flex">${tabs.map((tab, i) => {
    const selected = i === activeIndex;
    const disabled = !tab.available && tab.id !== "site_visit";
    const tabId = escapeHtml(tab.id || `tab-${i}`);
    const tabLabel = escapeHtml(tab.label || "지역 정보");
    return `<button class="region-popup-tab${selected ? " is-active" : ""}" role="tab" id="region-tab-${tabId}" aria-selected="${selected}" aria-controls="region-panel-${tabId}" ${disabled ? 'aria-disabled="true"' : ""} data-tab-index="${i}" style="${touchStyle()}">${tabLabel}</button>`;
  }).join("")}</div>`;
}

function renderDecisionOutcome(content) {
  const decision = content.current_decision || {};
  const reasons = Array.isArray(decision.reasons) ? decision.reasons : [];
  const reasonRows = reasons.length > 0
    ? reasons.map((reason) => `<div class="region-decision-row"><span>${escapeHtml(reason.label)}</span><strong>${escapeHtml(reason.value)}</strong></div>`).join("")
    : `<div class="region-popup-empty">이 물건에 기록된 판단 근거가 없습니다.</div>`;
  const scope = [decision.region_dong ? `${escapeHtml(decision.region_dong)} 물건` : "동 정보 없음", escapeHtml(content.region_scope_label || "지역 기준")].join(" · ");
  const bidLine = `<div class="region-decision-money"><span>예상 입찰가 ${formatWon(decision.expected_bid)}</span><span>실제 입찰가 ${formatWon(decision.my_bid_price)}</span></div>`;

  const summary = content.bid_rate_summary || {};
  const sampleText = summary.sample_count > 0
    ? `낙찰가율 평균 ${escapeHtml(summary.average_percent)}% · 표본 ${escapeHtml(summary.sample_count)}건${summary.sample_state === "small" ? " (표본 적음)" : ""}`
    : "낙찰가율을 계산할 정규 결과가 없습니다.";
  const outcomes = Array.isArray(content.outcomes) ? content.outcomes : [];
  const outcomeRows = outcomes.length > 0 ? outcomes.slice(0, 10).map((item) => {
    const outcomeLabel = item.outcome === "won" ? "낙찰" : item.outcome === "lost" ? "패찰" : "포기";
    return `<tr><td>${escapeHtml(item.result_date)}</td><td>${outcomeLabel}</td><td>${escapeHtml(item.region_dong || "구 기준")}</td><td>${item.bid_rate_percent == null ? "계산 불가" : `${escapeHtml(item.bid_rate_percent)}%`}</td><td>${escapeHtml(item.decision_reason || "근거 기록 없음")}</td></tr>`;
  }).join("") : "";
  const outcomeTable = outcomeRows
    ? `<div class="region-outcome-table-wrap"><table class="region-popup-table region-outcome-table"><thead><tr><th>결과일</th><th>결과</th><th>범위</th><th>낙찰가율</th><th>당시 판단</th></tr></thead><tbody>${outcomeRows}</tbody></table></div>`
    : `<div class="region-popup-empty">${escapeHtml(content.empty_state || "정규 결과 기록이 없습니다.")}</div>`;
  const legacyNotice = content.legacy_pending_count > 0
    ? `<p class="region-outcome-note">과거 상태 기록 ${escapeHtml(content.legacy_pending_count)}건은 정규 결과로 계산하지 않습니다.</p>`
    : "";

  return `<div class="region-decision-outcome">
    <section aria-labelledby="region-current-decision-title">
      <div class="region-section-head"><h3 id="region-current-decision-title">현재 판단 근거</h3><span>${scope}</span></div>
      ${reasonRows}${bidLine}
    </section>
    <section aria-labelledby="region-outcome-history-title">
      <div class="region-section-head"><h3 id="region-outcome-history-title">실제 결과 대조</h3><span>정규 결과 ${escapeHtml(content.canonical_outcome_count || 0)}건</span></div>
      <p class="region-outcome-summary">${sampleText}</p>
      ${outcomeTable}${legacyNotice}
    </section>
  </div>`;
}

function auctionStatusLabel(status) {
  return ({ watching: "관찰", bidding: "입찰 예정", won: "낙찰", lost: "패찰", skipped: "포기", reviewing: "검토", archived: "보관" })[status] || status || "상태 없음";
}

function renderConnectedAuctions(content) {
  const rows = Array.isArray(content && content.rows) ? content.rows : [];
  const status = content && content.status || "empty";
  const freshness = content && content.freshness && content.freshness.label;
  const summary = status === "stale"
    ? `<p class="region-auction-snapshot-warning" role="status">경매 자료가 오래되었습니다. 최신 Dataview 결과를 확인하세요.</p>`
    : freshness ? `<p class="region-auction-snapshot-meta">${escapeHtml(freshness)}</p>` : "";
  if (!rows.length) return `${summary}<div class="region-popup-empty">연결된 경매가 없습니다.</div>`;
  const body = rows.map((row, index) => `<tr>
    <td><button type="button" class="region-auction-open" data-action="open-auction" data-auction-index="${index}" aria-label="${escapeHtml(row.case_number || "경매 물건")} 열기">${escapeHtml(row.case_number || "사건번호 없음")}</button></td>
    <td>${escapeHtml(auctionStatusLabel(row.status))}</td>
    <td>${escapeHtml(row.auction_datetime || "기일 없음")}</td>
    <td>${formatWon(row.minimum_bid)}</td>
    <td>${escapeHtml(row.address || "주소 없음")}${row.region_dong ? ` · ${escapeHtml(row.region_dong)}` : ""}</td>
  </tr>`).join("");
  return `${summary}<div class="region-auction-table-wrap"><table class="region-popup-table region-auction-table"><thead><tr><th>사건</th><th>상태</th><th>기일</th><th>최저가</th><th>주소 · 동</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * Render a single tab panel.
 * @param {object} tab
 * @param {number} index
 * @param {boolean} active
 * @returns {string} HTML
 */
function renderSectionContent(tab) {
  let content;
  if (!tab.available && tab.id !== "site_visit") {
    content = `<div class="region-popup-empty">${escapeHtml(tab.unavailableReason || "수집 데이터 없음")}</div>`;
  } else if (tab.id === "core" && tab.content) {
    content = renderMetricTable(tab.content, "현재 지역 지표");
  } else if (tab.id === "change" && tab.content) {
    content = renderMetricTable(tab.content, "최근 변화");
  } else if (tab.id === "deals" && tab.content) {
    content = renderComparables(tab.content.comparables);
  } else if (tab.id === "supply_jobs" && tab.content) {
    const metrics = Object.fromEntries(Object.entries(tab.content).filter(([key]) => key !== "supply_pipeline"));
    content = `${renderMetricTable(metrics, "공급 지표")}<div class="region-popup-subsection"><h3>입주 공급 흐름</h3>${renderSupplyPipeline(tab.content.supply_pipeline)}</div>`;
  } else if (tab.id === "transit_life" && tab.content) {
    const lines = Array.isArray(tab.content.lines) ? tab.content.lines : [];
    content = lines.length ? lines.map((line) => `<div class="region-transit-line"><strong>${escapeHtml(line.line_name || "노선")}</strong> ${escapeHtml(formatRegionValue("units", line.count))}</div>`).join("") : `<div class="region-popup-empty">확인된 교통 정보 없음</div>`;
  } else if (tab.id === "site_visit") {
    const visits = (tab.content && tab.content.site_visits) || [];
    const visitHtml = visits.length > 0 ? visits.map((v) => `<div class="region-visit-item">${escapeHtml(v)}</div>`).join("") : `<div class="region-popup-empty">임장 기록 없음</div>`;
    content = visitHtml;
  } else if (tab.id === "decision_outcome" && tab.content) {
    content = renderDecisionOutcome(tab.content);
  } else if (tab.id === "connected_auctions" && tab.content) {
    content = renderConnectedAuctions(tab.content);
  } else if (tab.id === "knowledge_thesis" && tab.content) {
    content = renderKnowledge(tab.content);
  } else if (tab.content) {
    content = `<div class="region-popup-empty">표시할 지역 정보가 없습니다.</div>`;
  } else {
    content = `<div class="region-popup-empty">${escapeHtml(tab.unavailableReason || "수집 데이터 없음")}</div>`;
  }
  return content;
}

function renderDecisionContext(content) {
  const context = content || {};
  const questions = Array.isArray(context.questions) ? context.questions : [];
  const checks = Array.isArray(context.checks) ? context.checks : [];
  const questionHtml = questions.length ? questions.map((question) => {
    const facts = Array.isArray(question.facts) ? question.facts.slice(0, 3) : [];
    const factHtml = facts.length
      ? `<ul class="region-context-facts">${facts.map((fact) => `<li><span>${escapeHtml(fact.kind || "관찰된 사실")}</span>${escapeHtml(fact.text || "")}</li>`).join("")}</ul>`
      : `<div class="region-popup-empty">근거 부족</div>`;
    return `<section class="region-context-question"><h3>${escapeHtml(question.label || "확인 질문")}</h3>${factHtml}</section>`;
  }).join("") : `<div class="region-popup-empty">지역 판단 맥락을 준비하지 못했습니다.</div>`;
  const checksHtml = checks.length
    ? `<section class="region-context-checks"><h3>확인할 항목</h3><ul>${checks.map((check) => `<li>${escapeHtml(check.message || "확인이 필요합니다.")}</li>`).join("")}</ul></section>`
    : "";
  return `<div class="region-context-grid">${questionHtml}</div>${checksHtml}`;
}

function renderGroupedSections(tab) {
  const sections = tab && tab.content && Array.isArray(tab.content.sections) ? tab.content.sections : [];
  if (!sections.length) return `<div class="region-popup-empty">표시할 지역 정보가 없습니다.</div>`;
  return `<div class="region-popup-sections">${sections.map((section, index) => `<details class="region-popup-section"${index === 0 ? " open" : ""}><summary>${escapeHtml(section.label || "상세 정보")}</summary><div class="region-popup-section-body">${renderSectionContent(section)}</div></details>`).join("")}</div>`;
}

function renderTabPanel(tab, index, active) {
  const hidden = active ? "" : " hidden";
  const tabId = escapeHtml(tab.id || `tab-${index}`);
  let content;
  if (tab.id === "decision_context") content = renderDecisionContext(tab.content);
  else if (tab.id === "region_evidence" || tab.id === "cases_visit") content = renderGroupedSections(tab);
  else content = renderSectionContent(tab);
  return `<div class="region-popup-panel" role="tabpanel" id="region-panel-${tabId}" aria-labelledby="region-tab-${tabId}"${hidden}>${content}</div>`;
}

/**
 * Render the full popup HTML.
 * @param {object} popupState - from openPopup
 * @returns {string} HTML
 */
function renderPopup(popupState) {
  const { projection, activeTabIndex } = popupState;
  const title = escapeHtml(projection.title || "지역");
  const badges = renderTrustBadges(projection.trustBadges);
  const collectionHealth = renderCollectionHealth(projection.collectionHealth);
  const tabBar = renderTabBar(projection.tabs, activeTabIndex);
  const panels = projection.tabs.map((tab, i) => renderTabPanel(tab, i, i === activeTabIndex)).join("");

  return `<div class="region-intelligence-popup" role="dialog" aria-modal="true" aria-labelledby="region-popup-title" style="max-width:100%;overflow-x:hidden">
  <div class="region-popup-header">
    <h2 class="region-popup-title" id="region-popup-title">${title}</h2>
    <button class="region-popup-close" style="${touchStyle()}" aria-label="닫기" data-action="close">닫기</button>
  </div>
  ${badges}
  ${collectionHealth}
  ${tabBar}
  <div class="region-popup-panels" style="overflow-x:hidden">${panels}</div>
  <div class="region-popup-footer">
    <span class="region-popup-readonly">읽기 전용 — Object를 수정하지 않습니다</span>
  </div>
</div>`;
}

/**
 * CSS for mobile safety. Injected once.
 * @returns {string} CSS
 */
function popupStyles() {
  const tokens = tokenApi();
  return `
.region-intelligence-popup { max-width: 100vw; overflow-x: hidden; color: var(--text-normal); }
.region-popup-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.region-popup-title { margin: 0; font-size: 20px; letter-spacing: 0; }
.region-popup-tabs { display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 4px; padding: 4px 0; }
.region-popup-tab { flex-shrink: 0; min-height: ${tokens.CONTROL_HEIGHTS.touchTarget}px; min-width: ${tokens.CONTROL_HEIGHTS.touchTarget}px; padding: 8px 12px; border: none; background: var(--background-secondary); border-radius: 6px; cursor: pointer; font-size: 14px; }
.region-popup-tab.is-active { background: var(--interactive-accent); color: var(--text-on-accent); }
.region-popup-close { min-height: ${tokens.CONTROL_HEIGHTS.touchTarget}px; min-width: ${tokens.CONTROL_HEIGHTS.touchTarget}px; cursor: pointer; }
.region-trust-badges { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0; }
.region-trust-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
.region-collection-health { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(160px, 1fr) minmax(180px, 1.2fr); gap: 8px 16px; padding: 10px 0; border-top: 1px solid var(--background-modifier-border); border-bottom: 1px solid var(--background-modifier-border); font-size: 12px; color: var(--text-muted); }
.region-collection-health > div { min-width: 0; overflow-wrap: anywhere; }
.region-collection-health strong { margin-left: 6px; color: var(--text-normal); }
.region-collection-health.is-attention > div:last-child { color: var(--text-warning); }
.region-health-label { color: var(--text-muted); }
.region-popup-panels { min-height: 220px; }
.region-popup-panel { padding: 12px 0 4px; }
.region-context-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.region-context-question { min-width: 0; padding: 10px; border-inline-start: 2px solid var(--background-modifier-border); background: var(--background-secondary); }
.region-context-question h3, .region-context-checks h3 { margin: 0 0 8px; font-size: 14px; overflow-wrap: anywhere; }
.region-context-facts { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.region-context-facts li { min-width: 0; overflow-wrap: anywhere; }
.region-context-facts span { display: block; color: var(--text-muted); font-size: 12px; }
.region-context-checks { margin-top: 12px; padding: 10px; background: var(--background-secondary); border-radius: 6px; }
.region-context-checks ul { margin: 0; padding-inline-start: 20px; }
.region-popup-sections { display: grid; gap: 8px; }
.region-popup-section { border-bottom: 1px solid var(--background-modifier-border); }
.region-popup-section summary { min-height: ${tokens.CONTROL_HEIGHTS.touchTarget}px; display: flex; align-items: center; cursor: pointer; font-weight: 600; overflow-wrap: anywhere; }
.region-popup-section summary:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
.region-popup-section-body { padding: 0 0 12px; min-width: 0; }
.region-popup-table { width: 100%; border-collapse: collapse; }
.region-popup-table th, .region-popup-table td { padding: 6px 8px; border-bottom: 1px solid var(--background-modifier-border); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.region-popup-table th { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.region-popup-table caption { padding: 0 8px 8px; text-align: left; color: var(--text-muted); font-size: 12px; }
.region-metric-table th { width: 42%; }
.region-popup-subsection { margin-top: 18px; }
.region-popup-subsection h3, .region-knowledge-content h3 { margin: 0 0 8px; font-size: 15px; }
.region-supply-table { min-width: 520px; }
.region-comparable-list { display: grid; gap: 12px; }
.region-comparable-card { padding: 10px; border: 1px solid var(--background-modifier-border); border-radius: 6px; }
.region-comparable-card h4 { margin: 0 0 4px; font-size: 14px; }
.region-knowledge-content { display: grid; gap: 16px; }
.region-knowledge-content p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
.region-knowledge-content ul { margin: 0; padding-inline-start: 20px; }
.region-popup-empty { padding: 16px; text-align: center; color: var(--text-muted); }
.region-auction-snapshot-meta, .region-auction-snapshot-warning { margin: 8px 0; color: var(--text-muted); font-size: 12px; }
.region-auction-snapshot-warning { color: var(--text-warning); }
.region-auction-table-wrap { width: 100%; overflow-x: auto; }
.region-auction-table { min-width: 640px; }
.region-auction-open { min-height: ${tokens.CONTROL_HEIGHTS.touchTarget}px; padding: 4px 0; border: 0; background: transparent; color: var(--text-accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; font: inherit; }
.region-popup-footer { padding-top: 10px; font-size: 12px; color: var(--text-muted); }
.region-decision-outcome { display: grid; gap: 18px; }
.region-decision-outcome section { min-width: 0; }
.region-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--background-modifier-border); }
.region-section-head h3 { margin: 0; font-size: 15px; letter-spacing: 0; }
.region-section-head span { color: var(--text-muted); font-size: 12px; text-align: right; }
.region-decision-row { display: grid; grid-template-columns: minmax(82px, 0.25fr) minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--background-modifier-border-hover); }
.region-decision-row span { color: var(--text-muted); font-size: 12px; }
.region-decision-row strong { font-weight: 500; overflow-wrap: anywhere; }
.region-decision-money { display: flex; flex-wrap: wrap; gap: 8px 18px; padding-top: 8px; font-size: 12px; color: var(--text-muted); }
.region-outcome-summary, .region-outcome-note { margin: 8px 0; color: var(--text-muted); font-size: 12px; }
.region-outcome-note { color: var(--text-warning); }
.region-outcome-table-wrap { width: 100%; overflow-x: auto; }
.region-outcome-table { min-width: 560px; }
@media (max-width: ${tokens.BREAKPOINTS.medium - 1}px) {
  .region-intelligence-popup { width: 100vw; border-radius: 0; }
  .region-popup-title { font-size: 16px; }
  .region-context-grid { grid-template-columns: 1fr; }
  .region-collection-health { grid-template-columns: 1fr; gap: 4px; }
  .region-section-head { align-items: flex-start; flex-direction: column; gap: 4px; }
  .region-section-head span { text-align: left; }
  .region-decision-row { grid-template-columns: 1fr; gap: 3px; }
}
`;
}

function ensurePopupStyles(doc) {
  if (!doc || !doc.head || doc.getElementById("prodigy-region-popup-styles")) return;
  const style = doc.createElement("style");
  style.id = "prodigy-region-popup-styles";
  style.textContent = popupStyles();
  doc.head.appendChild(style);
}

function findProjectionSection(projection, sectionId) {
  for (const tab of projection && Array.isArray(projection.tabs) ? projection.tabs : []) {
    if (tab.id === sectionId) return tab;
    const sections = tab.content && Array.isArray(tab.content.sections) ? tab.content.sections : [];
    const match = sections.find((section) => section.id === sectionId);
    if (match) return match;
  }
  return null;
}

function mountPopup(container, popupState, options) {
  if (!container) return null;
  const opts = options || {};
  let state = popupState;
  const paint = () => {
    container.innerHTML = renderPopup(state);
    const close = container.querySelector("[data-action='close']");
    if (close) close.addEventListener("click", () => { if (typeof opts.onClose === "function") opts.onClose(); });
    container.querySelectorAll("[data-tab-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-tab-index"));
        const tab = state.projection.tabs[index];
        if (!tab || (!tab.available && tab.id !== "site_visit")) return;
        state = { ...state, activeTabIndex: index };
        paint();
        const active = container.querySelector(`[data-tab-index='${index}']`);
        if (active && typeof active.focus === "function") active.focus();
      });
    });
    container.querySelectorAll("[data-action='open-auction']").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-auction-index"));
        const section = findProjectionSection(state.projection, "connected_auctions");
        const row = section && section.content && section.content.rows && section.content.rows[index];
        if (!row || typeof opts.onOpenAuction !== "function") return;
        if (typeof opts.onClose === "function") opts.onClose();
        opts.onOpenAuction(row);
      });
    });
  };
  paint();
  return Object.freeze({ getState: () => state });
}

function trapOverlayFocus(event, modal) {
  if (!event || event.key !== "Tab" || !modal) return false;
  const items = typeof modal.querySelectorAll === "function"
    ? Array.from(modal.querySelectorAll("button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"))
    : [];
  const focus = (target) => {
    if (!target || typeof target.focus !== "function") return;
    event.preventDefault();
    try { target.focus({ preventScroll: true }); }
    catch (_) { target.focus(); }
  };
  if (!items.length) {
    focus(modal);
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const current = event.target || event.relatedTarget || null;
  const inside = typeof modal.contains === "function" ? modal.contains(current) : items.includes(current);
  if (!inside) {
    focus(event.shiftKey ? last : first);
    return true;
  }
  if (event.shiftKey && current === first) {
    focus(last);
    return true;
  }
  if (!event.shiftKey && current === last) {
    focus(first);
    return true;
  }
  return false;
}

function openOverlay(popupState, options) {
  if (typeof document === "undefined" || !document.body) return null;
  const opts = options || {};
  ensurePopupStyles(document);
  const opener = opts.returnFocus && typeof opts.returnFocus.focus === "function"
    ? opts.returnFocus
    : document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
  const overlay = document.createElement("div");
  overlay.className = "region-popup-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--background-modifier-cover);padding:12px";
  overlay.setAttribute("data-region-popup-backdrop", "true");
  const modal = document.createElement("div");
  modal.className = "region-popup-modal";
  modal.style.cssText = "background:var(--background-primary);border-radius:8px;max-width:720px;width:min(96vw,720px);max-height:90vh;overflow-y:auto;padding:16px";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "region-popup-title");
  modal.tabIndex = -1;
  overlay.appendChild(modal);
  const focusable = () => Array.from(modal.querySelectorAll("button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"));
  const focusFirst = () => {
    const target = focusable()[0] || modal;
    if (target && typeof target.focus === "function") {
      try { target.focus({ preventScroll: true }); }
      catch (_) { target.focus(); }
    }
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    if (opener && opener.isConnected !== false && typeof opener.focus === "function") {
      try { opener.focus({ preventScroll: true }); }
      catch (_) { opener.focus(); }
    }
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (trapOverlayFocus(event, modal)) return;
  };
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKeydown);
  document.body.appendChild(overlay);
  mountPopup(modal, popupState, { onClose: close, onOpenAuction: opts.onOpenAuction });
  focusFirst();
  return Object.freeze({ overlay, close });
}

const api = Object.freeze({
  BADGE_CLASSES,
  renderTrustBadges,
  renderCollectionHealth,
  renderTabBar,
  renderTabPanel,
  renderDecisionOutcome,
  renderPopup,
  popupStyles,
  mountPopup,
  trapOverlayFocus,
  openOverlay
});

root.RegionIntelligencePopupView = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
