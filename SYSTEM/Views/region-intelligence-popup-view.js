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
  const items = [
    { key: "freshness", label: "최신성", badge: badges.freshness },
    { key: "verification", label: "검증", badge: badges.verification },
    { key: "coverage", label: "출처", badge: badges.coverage },
    { key: "schema", label: "스키마", badge: badges.schema }
  ];
  return `<div class="region-trust-badges" role="list" aria-label="신뢰도 배지">${items.map((item) => {
    const cls = BADGE_CLASSES[item.badge.level] || "region-badge-unavailable";
    return `<div class="region-trust-badge ${cls}" role="listitem" aria-label="${item.label}: ${item.badge.label}"><span class="region-badge-key">${item.label}</span><span class="region-badge-value">${item.badge.label}</span></div>`;
  }).join("")}</div>`;
}

function renderCollectionHealth(health) {
  if (!health || health.status === "unavailable") {
    return `<div class="region-collection-health is-unavailable" role="status"><span>수집 상태</span><strong>확인 불가</strong></div>`;
  }
  const selected = health.selected_region;
  const selectedText = !selected || !selected.covered
    ? "이 지역 스냅샷 없음"
    : `이 지역 ${escapeHtml(selected.latest_metrics_as_of || "기준월 없음")} · ${selected.snapshot_count}회 수집`;
  const warningParts = [];
  if (health.missing_region_keys.length) warningParts.push(`미수집 ${health.missing_region_keys.length}곳`);
  if (health.stale_region_keys.length) warningParts.push(`만료 ${health.stale_region_keys.length}곳`);
  if (health.duplicate_months.length) warningParts.push(`동일 기준월 반복 ${health.duplicate_months.length}건`);
  const warning = warningParts.length ? warningParts.join(" · ") : "전체 수집 상태 정상";
  return `<div class="region-collection-health${health.status === "attention" ? " is-attention" : ""}" role="status" aria-label="지역 데이터 수집 상태">
    <div><span class="region-health-label">수집 커버리지</span><strong>${health.covered_count}/${health.expected_count} (${health.coverage_percent}%)</strong></div>
    <div>${selectedText}</div>
    <div>${warning}</div>
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
    return `<button class="region-popup-tab${selected ? " is-active" : ""}" role="tab" id="region-tab-${tab.id}" aria-selected="${selected}" aria-controls="region-panel-${tab.id}" ${disabled ? 'aria-disabled="true"' : ""} data-tab-index="${i}" style="${touchStyle()}">${tab.label}</button>`;
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
    ? `낙찰가율 평균 ${summary.average_percent}% · 표본 ${summary.sample_count}건${summary.sample_state === "small" ? " (표본 적음)" : ""}`
    : "낙찰가율을 계산할 정규 결과가 없습니다.";
  const outcomes = Array.isArray(content.outcomes) ? content.outcomes : [];
  const outcomeRows = outcomes.length > 0 ? outcomes.slice(0, 10).map((item) => {
    const outcomeLabel = item.outcome === "won" ? "낙찰" : item.outcome === "lost" ? "패찰" : "포기";
    return `<tr><td>${escapeHtml(item.result_date)}</td><td>${outcomeLabel}</td><td>${escapeHtml(item.region_dong || "구 기준")}</td><td>${item.bid_rate_percent == null ? "계산 불가" : `${item.bid_rate_percent}%`}</td><td>${escapeHtml(item.decision_reason || "근거 기록 없음")}</td></tr>`;
  }).join("") : "";
  const outcomeTable = outcomeRows
    ? `<div class="region-outcome-table-wrap"><table class="region-popup-table region-outcome-table"><thead><tr><th>결과일</th><th>결과</th><th>범위</th><th>낙찰가율</th><th>당시 판단</th></tr></thead><tbody>${outcomeRows}</tbody></table></div>`
    : `<div class="region-popup-empty">${escapeHtml(content.empty_state || "정규 결과 기록이 없습니다.")}</div>`;
  const legacyNotice = content.legacy_pending_count > 0
    ? `<p class="region-outcome-note">과거 상태 기록 ${content.legacy_pending_count}건은 정규 결과로 계산하지 않습니다.</p>`
    : "";

  return `<div class="region-decision-outcome">
    <section aria-labelledby="region-current-decision-title">
      <div class="region-section-head"><h3 id="region-current-decision-title">현재 판단 근거</h3><span>${scope}</span></div>
      ${reasonRows}${bidLine}
    </section>
    <section aria-labelledby="region-outcome-history-title">
      <div class="region-section-head"><h3 id="region-outcome-history-title">실제 결과 대조</h3><span>정규 결과 ${content.canonical_outcome_count || 0}건</span></div>
      <p class="region-outcome-summary">${sampleText}</p>
      ${outcomeTable}${legacyNotice}
    </section>
  </div>`;
}

/**
 * Render a single tab panel.
 * @param {object} tab
 * @param {number} index
 * @param {boolean} active
 * @returns {string} HTML
 */
function renderTabPanel(tab, index, active) {
  const hidden = active ? "" : " hidden";
  let content;
  if (!tab.available && tab.id !== "site_visit") {
    content = `<div class="region-popup-empty">${tab.unavailableReason || "수집 데이터 없음"}</div>`;
  } else if (tab.id === "core" && tab.content) {
    const rows = Object.entries(tab.content).filter(([, v]) => v != null).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
    content = rows ? `<table class="region-popup-table"><tbody>${rows}</tbody></table>` : `<div class="region-popup-empty">수집 데이터 없음</div>`;
  } else if (tab.id === "transit_life" && tab.content) {
    content = tab.content.lines.map((line) => `<div class="region-transit-line"><strong>${line.line_name}</strong> ${line.count}개역</div>`).join("");
  } else if (tab.id === "site_visit") {
    const visits = (tab.content && tab.content.site_visits) || [];
    const visitHtml = visits.length > 0 ? visits.map((v) => `<div class="region-visit-item">${v}</div>`).join("") : `<div class="region-popup-empty">임장 기록 없음</div>`;
    content = visitHtml;
  } else if (tab.id === "decision_outcome" && tab.content) {
    content = renderDecisionOutcome(tab.content);
  } else if (tab.content) {
    content = `<pre class="region-popup-json">${JSON.stringify(tab.content, null, 2)}</pre>`;
  } else {
    content = `<div class="region-popup-empty">${tab.unavailableReason || "수집 데이터 없음"}</div>`;
  }
  return `<div class="region-popup-panel" role="tabpanel" id="region-panel-${tab.id}" aria-labelledby="region-tab-${tab.id}"${hidden}>${content}</div>`;
}

/**
 * Render the full popup HTML.
 * @param {object} popupState - from openPopup
 * @returns {string} HTML
 */
function renderPopup(popupState) {
  const { projection, activeTabIndex } = popupState;
  const badges = renderTrustBadges(projection.trustBadges);
  const collectionHealth = renderCollectionHealth(projection.collectionHealth);
  const tabBar = renderTabBar(projection.tabs, activeTabIndex);
  const panels = projection.tabs.map((tab, i) => renderTabPanel(tab, i, i === activeTabIndex)).join("");

  return `<div class="region-intelligence-popup" role="dialog" aria-label="${projection.title} 지역 정보" style="max-width:100%;overflow-x:hidden">
  <div class="region-popup-header">
    <h2 class="region-popup-title">${projection.title}</h2>
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
.region-popup-table { width: 100%; border-collapse: collapse; }
.region-popup-table th, .region-popup-table td { padding: 6px 8px; border-bottom: 1px solid var(--background-modifier-border); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.region-popup-table th { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.region-popup-empty { padding: 16px; text-align: center; color: var(--text-muted); }
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
  };
  paint();
  return Object.freeze({ getState: () => state });
}

function trapOverlayFocus(event, modal) {
  if (!event || event.key !== "Tab" || !modal || typeof modal.querySelectorAll !== "function") return;
  const focusable = Array.from(modal.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.disabled);
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && event.target === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault();
    first.focus();
  }
}

function openOverlay(popupState, options) {
  if (typeof document === "undefined" || !document.body) return null;
  const opts = options || {};
  ensurePopupStyles(document);
  const overlay = document.createElement("div");
  overlay.className = "region-popup-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--background-modifier-cover);padding:12px";
  const modal = document.createElement("div");
  modal.className = "region-popup-modal";
  modal.style.cssText = "background:var(--background-primary);border-radius:8px;max-width:720px;width:min(96vw,720px);max-height:90vh;overflow-y:auto;padding:16px";
  overlay.appendChild(modal);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    if (opts.returnFocus && typeof opts.returnFocus.focus === "function") opts.returnFocus.focus();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
    else trapOverlayFocus(event, modal);
  };
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKeydown);
  document.body.appendChild(overlay);
  mountPopup(modal, popupState, { onClose: close });
  const initialFocus = modal.querySelector("[data-action='close']");
  if (initialFocus && typeof initialFocus.focus === "function") initialFocus.focus();
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
