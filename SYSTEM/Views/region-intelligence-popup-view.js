"use strict";

/**
 * region-intelligence-popup-view.js
 * DOM rendering for the Region decision popup. Mobile-safe.
 * 320/390px: no horizontal overflow. Touch targets ≥ 44px.
 * Korean labels. Never writes to Objects.
 * Contract: .omo/plans/prodigy-region-workspace-consolidation.md Todo 14
 */

const root = typeof window !== "undefined" ? window : globalThis;

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
    return `<button class="region-popup-tab${selected ? " is-active" : ""}" role="tab" id="region-tab-${tab.id}" aria-selected="${selected}" aria-controls="region-panel-${tab.id}" ${disabled ? 'aria-disabled="true"' : ""} data-tab-index="${i}" style="min-height:44px;min-width:44px">${tab.label}</button>`;
  }).join("")}</div>`;
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
    content = `${visitHtml}<button class="region-popup-action" style="min-height:44px" data-action="add-site-visit">임장 추가</button>`;
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
  const tabBar = renderTabBar(projection.tabs, activeTabIndex);
  const panels = projection.tabs.map((tab, i) => renderTabPanel(tab, i, i === activeTabIndex)).join("");

  return `<div class="region-intelligence-popup" role="dialog" aria-label="${projection.title} 지역 정보" style="max-width:100%;overflow-x:hidden">
  <div class="region-popup-header">
    <h2 class="region-popup-title">${projection.title}</h2>
    <button class="region-popup-close" style="min-height:44px;min-width:44px" aria-label="닫기" data-action="close">✕</button>
  </div>
  ${badges}
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
  return `
.region-intelligence-popup { max-width: 100vw; overflow-x: hidden; }
.region-popup-tabs { display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 4px; padding: 4px 0; }
.region-popup-tab { flex-shrink: 0; min-height: 44px; min-width: 44px; padding: 8px 12px; border: none; background: var(--background-secondary, #f0f0f0); border-radius: 6px; cursor: pointer; font-size: 14px; }
.region-popup-tab.is-active { background: var(--interactive-accent, #7c5cbf); color: white; }
.region-popup-action, .region-popup-close { min-height: 44px; min-width: 44px; cursor: pointer; }
.region-trust-badges { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0; }
.region-trust-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
.region-popup-table { width: 100%; border-collapse: collapse; }
.region-popup-table td { padding: 4px 8px; border-bottom: 1px solid var(--background-modifier-border, #ddd); }
.region-popup-empty { padding: 16px; text-align: center; color: var(--text-muted, #888); }
@media (max-width: 390px) {
  .region-intelligence-popup { width: 100vw; border-radius: 0; }
  .region-popup-title { font-size: 16px; }
}
`;
}

const api = Object.freeze({
  BADGE_CLASSES,
  renderTrustBadges,
  renderTabBar,
  renderTabPanel,
  renderPopup,
  popupStyles
});

root.RegionIntelligencePopupView = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
