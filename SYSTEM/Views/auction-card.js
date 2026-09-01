function ensureAuctionCardReadabilityStyles() {
  if (!window.document?.head) return;
  const styleId = "prodigy-auction-card-readability";
  let style = window.document.getElementById(styleId);
  if (!style) {
    style = window.document.createElement("style");
    style.id = styleId;
    window.document.head.appendChild(style);
  }
  style.textContent = `
.auction-card {
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  margin-block-end: var(--ke-space-4, 17px);
  box-shadow: none;
}
.prodigy-app-shell[data-tier="compact"] .auction-card {
  margin-block-end: var(--ke-space-3, 12px);
}
.auction-card a:focus-visible,
.auction-card button:focus-visible,
.auction-card:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.auction-card-readable.is-mobile {
  gap: 0 !important;
  padding: var(--ke-space-3, 12px) !important;
  border-radius: var(--ke-radius-control, 8px) !important;
  box-shadow: none !important;
}
.auction-card-readable.is-mobile .auction-card-header {
  gap: var(--ke-space-2, 8px) !important;
  padding-block-end: var(--ke-space-2, 8px);
  border-block-end: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-card-readable.is-mobile .auction-card-title-wrap {
  flex: 1 1 auto;
  max-inline-size: none !important;
  white-space: normal !important;
}
.auction-card-readable.is-mobile .auction-card-title {
  font-size: var(--ke-type-body, 15px) !important;
  line-height: var(--ke-leading-control, 1.35);
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.auction-card-readable.is-mobile .auction-card-header-actions {
  flex: 0 0 auto;
  gap: var(--ke-space-1, 4px) !important;
}
.auction-card-readable.is-mobile .auction-card-header-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: 28px;
  padding-inline: var(--ke-space-2, 8px) !important;
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 8px) !important;
  background: transparent !important;
  color: var(--ke-color-text, var(--text-normal)) !important;
  font-size: var(--ke-type-caption, 12px) !important;
  line-height: var(--ke-leading-control, 1.2);
  text-decoration: none !important;
}
.auction-card-readable.is-mobile .auction-card-delete {
  order: 3;
  inline-size: 28px;
  padding-inline: 0 !important;
  opacity: .68 !important;
}
.auction-card-readable.is-mobile .auction-card-dday {
  order: 1;
}
.auction-card-readable.is-mobile .auction-card-external-link {
  order: 2;
}
.auction-card-readable.is-mobile .auction-card-external-link[data-source="cafe"] {
  display: none;
}
.auction-card-readable.is-mobile .auction-card-property-group,
.auction-card-readable.is-mobile .auction-card-opinion,
.auction-card-readable.is-mobile .auction-card-memo {
  padding-block: var(--ke-space-2, 8px) !important;
  border-block-end: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-card-readable.is-mobile .auction-card-detail-row {
  gap: var(--ke-space-1, 4px) var(--ke-space-2, 8px) !important;
  margin: 0 !important;
  color: var(--ke-color-muted, var(--text-muted)) !important;
  font-size: var(--ke-type-label, 13px) !important;
  line-height: var(--ke-leading-body, 1.35);
  word-break: keep-all;
}
.auction-card-readable.is-mobile .auction-card-detail-primary {
  color: var(--ke-color-text, var(--text-normal));
  font-weight: 600;
}
.auction-card-readable.is-mobile .auction-card-finance-row {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: var(--ke-space-2, 6px) !important;
  margin: 0 !important;
  font-size: var(--ke-type-caption, 12px) !important;
  white-space: normal !important;
  overflow-x: visible !important;
  scrollbar-width: none !important;
}
.auction-card-readable.is-mobile .auction-card-finance-row::-webkit-scrollbar {
  display: none !important;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-finance-row {
  flex-wrap: wrap !important;
  white-space: normal !important;
  overflow-x: visible !important;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-finance-row,
:root[style*="zoom: 2"] .prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-finance-group,
:root[style*="zoom: 2"] .prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-price-pair {
  flex-wrap: wrap !important;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-finance-group {
  inline-size: 100% !important;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-metric-label {
  min-inline-size: 0;
  max-inline-size: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
:root[style*="zoom: 2"] .prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-actions {
  grid-template-columns: minmax(0, 1fr);
}
.auction-card-readable.is-mobile .auction-card-finance-group {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  flex-wrap: nowrap !important;
  gap: var(--ke-space-1, 4px) !important;
  min-inline-size: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}
.auction-card-readable.is-mobile .auction-card-finance-group + .auction-card-finance-group {
  padding-inline-start: var(--ke-space-2, 6px) !important;
  border-inline-start: 1px solid color-mix(in srgb, var(--ke-color-border, var(--background-modifier-border)) 65%, transparent) !important;
}
.auction-card-readable.is-mobile .auction-card-finance-label {
  margin: 0 !important;
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-caption, 11px);
  font-weight: 700;
  white-space: nowrap;
}
.auction-card-finance-group-price {
  flex-wrap: wrap;
}
.auction-card-key-value {
  display: flex;
  flex: 1 0 100%;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 6px;
  min-inline-size: 0;
  color: var(--ke-color-muted, var(--text-muted));
  white-space: normal;
}
.auction-card-key-value-total {
  color: var(--ke-color-accent, var(--text-accent));
  font-size: var(--ke-type-label, 13px);
  font-weight: 700;
}
.auction-card-key-value-detail {
  font-size: var(--ke-type-caption, 12px);
  overflow-wrap: anywhere;
}
.auction-card-readable.is-mobile .auction-card-finance-group-price {
  flex-wrap: wrap !important;
}
.auction-card-readable.is-mobile .auction-card-key-value {
  flex-basis: 100%;
  padding-block-start: 2px;
}
.auction-card-readable.is-mobile .auction-card-price-pair {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 4px !important;
}
.auction-card-readable.is-mobile .auction-card-result-price,
.auction-card-readable.is-mobile .auction-card-finance-group-income > div {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 2px !important;
  min-block-size: 0 !important;
  inline-size: auto !important;
}
.auction-card-readable.is-mobile .auction-card-finance-group-income > div[role="button"] {
  min-block-size: var(--ke-touch-target, 44px) !important;
  min-inline-size: var(--ke-touch-target, 44px);
  padding-inline: var(--ke-space-1, 4px);
  justify-content: center;
}
.auction-card-readable.is-mobile .auction-card-finance-group-income {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: var(--ke-space-1, 4px) !important;
}
.auction-card-readable.is-mobile .auction-card-metric-label {
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-caption, 11px);
  font-weight: 500;
  white-space: nowrap;
}
.auction-card-readable.is-mobile .auction-card-finance-group-income .auction-card-finance-note {
  display: none;
}
.auction-card-readable.is-mobile .auction-card-opinion {
  margin: 0 !important;
  font-size: var(--ke-type-label, 13px) !important;
  line-height: var(--ke-leading-body, 1.35);
}
.auction-card-readable.is-mobile .auction-card-opinion strong {
  display: block;
  margin-block-end: var(--ke-space-1, 4px);
  color: var(--ke-color-muted, var(--text-muted)) !important;
  font-size: var(--ke-type-caption, 12px);
}
.auction-card-readable.is-mobile .auction-card-memo {
  margin: 0 !important;
  font-size: var(--ke-type-label, 13px) !important;
}
.auction-card-readable.is-mobile .auction-card-actions {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ke-space-2, 8px) !important;
  margin: 0 !important;
  padding-block-start: var(--ke-space-2, 8px) !important;
  border-block-start: 0 !important;
}
.auction-card-readable.is-mobile .auction-card-research-attention {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ke-space-2, 8px);
}
.auction-card-readable.is-mobile .auction-card-research-badge {
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--ke-color-muted, var(--text-muted)) !important;
  font-size: var(--ke-type-caption, 12px) !important;
  font-weight: 500 !important;
}
.auction-card-readable.is-mobile .auction-region-inline-action,
.auction-card-readable.is-mobile .prodigy-btn-chip {
  min-block-size: var(--ke-touch-target, 44px) !important;
}
.auction-card-readable.is-mobile .auction-card-actions button {
  min-inline-size: 0;
  min-block-size: var(--ke-touch-target, 44px);
  white-space: normal;
  word-break: keep-all;
}
.prodigy-app-shell[data-tier="compact"] .auction-card-readable.is-mobile .auction-card-actions .auction-card-action-bidding {
  appearance: none !important;
  transition: none !important;
  outline: 2px solid var(--text-accent) !important;
  outline-offset: -2px;
  border-color: var(--ke-color-accent, var(--interactive-accent)) !important;
  background: var(--ke-color-accent, var(--interactive-accent)) !important;
  background-color: var(--text-accent) !important;
  color: var(--background-primary) !important;
  font-weight: 600;
}
.auction-card-original-layout.is-mobile {
  padding: 8px !important;
  gap: 2px !important;
}
.auction-card-original-layout.is-mobile .auction-card-title-link {
  white-space: nowrap;
}
.auction-card-original-layout.is-mobile .auction-card-detail-row,
.auction-card-original-layout.is-mobile .auction-card-finance-row {
  line-height: 1.25;
}
.auction-card-original-layout.is-mobile [role="button"] {
  min-block-size: var(--ke-touch-target, 44px) !important;
}
.auction-card-original-layout.is-mobile .auction-region-inline-action,
.auction-card-original-layout.is-mobile .prodigy-btn-chip {
  min-block-size: var(--ke-touch-target, 44px) !important;
}
.auction-card-original-layout.is-mobile .auction-card-actions button {
  min-block-size: var(--ke-touch-target, 44px) !important;
}
.auction-card-readable {
  position: relative;
  gap: var(--ke-space-2, 8px) !important;
  padding: var(--ke-space-3, 12px) var(--ke-space-4, 17px) !important;
  border-radius: var(--ke-radius-panel, 14px) !important;
}
.auction-card-readable.is-menu-open {
  z-index: 30;
}
.auction-card-tier-compact {
  gap: var(--ke-space-2, 8px) !important;
  padding: var(--ke-space-3, 12px) !important;
}
.auction-card-tier-medium {
  padding: var(--ke-space-3, 12px) var(--ke-space-4, 17px) !important;
}
.auction-card-tier-wide {
  padding: var(--ke-space-4, 17px) !important;
}
.auction-card-tier-medium .auction-card-header,
.auction-card-tier-wide .auction-card-header {
  min-block-size: 32px;
}
.auction-card-tier-compact .auction-card-header {
  align-items: flex-start !important;
  padding-block-end: var(--ke-space-2, 8px);
  border-block-end: 1px solid var(--ke-color-border, var(--background-modifier-border));
}
.auction-card-tier-compact .auction-card-title-wrap {
  max-inline-size: none !important;
  white-space: normal !important;
}
.auction-card-tier-compact .auction-card-title {
  white-space: normal !important;
  overflow-wrap: anywhere;
}
.auction-card-tier-medium .auction-card-property-group,
.auction-card-tier-wide .auction-card-property-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ke-space-1, 4px) var(--ke-space-3, 12px);
}
.auction-card-tier-medium .auction-card-property-group > *,
.auction-card-tier-wide .auction-card-property-group > * {
  margin: 0 !important;
}
.auction-card-tier-compact .auction-card-finance-row,
.auction-card-tier-medium .auction-card-finance-row,
.auction-card-tier-wide .auction-card-finance-row {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ke-space-2, 8px) !important;
  overflow: visible !important;
  white-space: normal !important;
}
.auction-card-tier-medium .auction-card-finance-row,
.auction-card-tier-wide .auction-card-finance-row {
  grid-template-columns: minmax(0, 1.5fr) minmax(15rem, .85fr);
  align-items: stretch !important;
}
.auction-card-tier-compact .auction-card-finance-group,
.auction-card-tier-medium .auction-card-finance-group,
.auction-card-tier-wide .auction-card-finance-group {
  min-inline-size: 0;
  border: 0 !important;
  background: transparent !important;
}
.auction-card-tier-compact .auction-card-finance-group-price,
.auction-card-tier-medium .auction-card-finance-group-price,
.auction-card-tier-wide .auction-card-finance-group-price {
  display: grid !important;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--ke-space-1, 4px) var(--ke-space-2, 8px) !important;
  align-items: center !important;
}
.auction-card-tier-medium .auction-card-finance-group-price,
.auction-card-tier-wide .auction-card-finance-group-price {
  grid-template-columns: auto minmax(0, 1fr) minmax(13rem, .8fr);
}
.auction-card-tier-compact .auction-card-key-value {
  grid-column: 1 / -1;
}
.auction-card-tier-medium .auction-card-key-value,
.auction-card-tier-wide .auction-card-key-value {
  grid-column: 3;
  grid-row: 1 / span 2;
}
.auction-card-key-value {
  appearance: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px var(--ke-space-2, 8px);
  align-items: center;
  min-block-size: var(--ke-touch-target, 44px);
  padding: var(--ke-space-2, 8px) var(--ke-space-3, 12px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 10px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  color: var(--ke-color-text, var(--text-normal));
  text-align: start;
  cursor: pointer;
}
.auction-card-key-value:hover {
  background: var(--ke-color-surface-hover, var(--background-modifier-hover));
}
.auction-card-key-value:focus-visible,
.auction-card-overflow > summary:focus-visible,
.auction-card-secondary-transitions > summary:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.auction-card-key-value-total {
  min-inline-size: 0;
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-label, 13px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.auction-card-key-value-detail {
  grid-column: 1;
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-caption, 12px);
}
.auction-card-key-value-chevron {
  grid-column: 2;
  grid-row: 1 / span 2;
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-body, 15px);
}
.auction-card-overflow,
.auction-card-secondary-transitions {
  position: relative;
}
.auction-card-overflow > summary,
.auction-card-secondary-transitions > summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--ke-touch-target, 44px);
  min-inline-size: var(--ke-touch-target, 44px);
  border-radius: var(--ke-radius-control, 10px);
  color: var(--ke-color-muted, var(--text-muted));
  cursor: pointer;
  list-style: none;
}
.auction-card-overflow > summary::-webkit-details-marker,
.auction-card-secondary-transitions > summary::-webkit-details-marker {
  display: none;
}
.auction-card-overflow-panel,
.auction-card-secondary-transition-panel {
  position: absolute;
  z-index: 20;
  inset-inline-end: 0;
  display: grid;
  min-inline-size: 11rem;
  padding: var(--ke-space-1, 4px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 10px);
  background: var(--ke-color-surface, var(--background-primary));
}
.auction-card-overflow-panel > *,
.auction-card-secondary-transition-panel > * {
  display: flex;
  align-items: center;
  min-block-size: var(--ke-touch-target, 44px);
  padding-inline: var(--ke-space-3, 12px);
  border: 0;
  border-radius: var(--ke-radius-control, 8px);
  background: transparent;
  color: var(--ke-color-text, var(--text-normal));
  text-decoration: none;
  text-align: start;
}
.auction-card-overflow-panel > *:hover,
.auction-card-secondary-transition-panel > *:hover {
  background: var(--ke-color-surface-hover, var(--background-modifier-hover));
}
.auction-card-opinion {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.auction-card-note-disclosure {
  min-inline-size: 0;
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-caption, 12px);
}
.auction-card-note-disclosure > summary {
  overflow: hidden;
  min-block-size: 28px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.auction-card-tier-compact .auction-card-actions,
.auction-card-tier-medium .auction-card-actions {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ke-space-2, 8px) !important;
}
.auction-card-tier-wide .auction-card-actions {
  display: flex !important;
  justify-content: flex-end;
  gap: var(--ke-space-2, 8px) !important;
}
.auction-card-primary-action {
  font-weight: 600;
}
.auction-card-tier-compact .auction-card-research-attention {
  grid-column: 1 / -1;
}
.auction-card-tier-compact .auction-card-research-attention:empty,
.auction-card-tier-medium .auction-card-research-attention:empty {
  display: none !important;
}
.auction-card-tier-compact .auction-card-primary-action,
.auction-card-tier-medium .auction-card-primary-action {
  order: 1;
}
.auction-card-tier-compact .auction-card-secondary-transitions,
.auction-card-tier-medium .auction-card-secondary-transitions {
  order: 2;
}
.auction-card-tier-compact .auction-card-research-attention,
.auction-card-tier-medium .auction-card-research-attention {
  order: 3;
}
.auction-card-readable.auction-card-tier-compact .auction-card-opinion {
  display: flex;
  align-items: center;
  min-block-size: var(--ke-touch-target, 44px);
  padding: 0 !important;
  border-block-end: 0;
}
.auction-card-readable.auction-card-tier-compact .auction-card-opinion strong {
  display: inline !important;
  margin: 0 !important;
}
.auction-card-tier-compact .auction-card-overflow-panel .auction-region-inline-actions {
  display: grid !important;
  white-space: normal !important;
}
.auction-card-tier-compact .auction-card-overflow-panel .auction-region-inline-action {
  display: flex;
  align-items: center;
  min-block-size: var(--ke-touch-target, 44px) !important;
  padding-inline: var(--ke-space-3, 12px) !important;
  color: var(--ke-color-text, var(--text-normal)) !important;
  text-decoration: none !important;
}
`;
}

window.renderAuctionCard = function(p, container, options) {
  try {
    ensureAuctionCardReadabilityStyles();
    const T = window.ProdigyTokens || {}; const C = T.COLORS || {};
    const display = window.prodigyDisplay;
    if (!display) throw new Error("표시 Registry가 로드되지 않았습니다.");
    const parser = window.parsePrice || Number;
    
    const card = container.createEl('div', {
      attr: {
        class: 'auction-card',
        'aria-label': '관심 경매 경매 카드',
        'data-auction-path': (p.file && p.file.path) || p.path || '',
        'data-auction-status': p.status || '',
        tabindex: '-1',
        style: `border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;`
      }
    });
    
    // Helpers
    const getPropertyName = (addr) => {
      if (!addr || addr === "정보 없음") return "물건명 미지정";
      const parts = addr.split(',');
      if (parts.length > 1) {
        return parts[1].trim();
      }
      const words = addr.trim().split(/\s+/);
      if (words.length > 3) {
        return words.slice(-2).join(' ');
      }
      return addr;
    };

    const calcMonthlyProfit = (p, acquisitionPrice) => {
      const expected = parser(acquisitionPrice);
      const rent = parser(p.expected_monthly_rent);
      const loanRatio = p.loan_ratio !== undefined && !isNaN(parser(p.loan_ratio)) ? parser(p.loan_ratio) : 0.8;
      const interestRate = p.interest_rate !== undefined && !isNaN(parser(p.interest_rate)) ? parser(p.interest_rate) : 0.06;
      
      if (isNaN(expected) || isNaN(rent) || !isFinite(expected) || !isFinite(rent) || expected <= 0 || rent <= 0) return null;
      
      const loanAmount = expected * loanRatio;
      const annualInterest = loanAmount * interestRate;
      const monthlyInterest = annualInterest / 12;
      const profit = rent - monthlyInterest;
      return { profit, loanRatio, interestRate };
    };

    const formatProfit = (pInfo) => {
      if (!pInfo || !isFinite(pInfo.profit)) return "-";
      const { profit, loanRatio, interestRate } = pInfo;
      const man = Math.round(profit / 10000);
      const sign = man > 0 ? "+" : "";
      const color = man > 0 ? "var(--text-accent)" : "var(--text-error)";
      return `<span style="color: ${color}; font-weight: bold;">${sign}${man.toLocaleString()}만</span> <span style="font-size:0.85em; color:var(--text-muted);">(${Math.round(loanRatio*100)}%대출, ${(interestRate*100).toFixed(1)}%금리)</span>`;
    };
    
    const toEok = (v) => {
      if (!v || v === "정보 없음") return "-";
      const num = parser(v);
      if (isNaN(num) || !isFinite(num)) return v;
      return (num / 100000000).toFixed(2) + "억";
    };

    const toWon = (v) => {
      if (!v || v === "정보 없음") return "-";
      const num = parser(v);
      if (isNaN(num) || !isFinite(num)) return v;
      return `${num.toLocaleString("ko-KR")}원`;
    };

    const toMan = (v) => {
      if (v === undefined || v === null || v === "") return "0";
      const num = parser(v);
      if (isNaN(num)) return v;
      if (num % 10000 === 0) return (num / 10000) + "만";
      return num;
    };

    const hasRecordedValue = (value) => value !== undefined
      && value !== null
      && String(value).trim() !== ""
      && value !== "정보 없음";
    const formatArea = (value) => {
      if (!hasRecordedValue(value)) return "";
      const raw = String(value).trim();
      if (/평/u.test(raw) && !/[㎡m²]/iu.test(raw)) return raw;
      const match = raw.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/u);
      if (!match) return raw;
      const amount = Number(match[0]);
      if (!Number.isFinite(amount) || amount <= 0) return "";
      return `${amount.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎡`;
    };

    const courtProjection = window.AuctionCourtStatus.project({
      courtStatus: p.court_status,
      auctionDatetime: p.auction_datetime,
      now: new Date()
    });
    const ddayStr = courtProjection.label;
    const isUrgent = courtProjection.is_urgent;
    const isAuctionToday = courtProjection.is_today;
    const isAuctionEnded = courtProjection.status === "sold";
    const isCourtInactive = ["suspended", "withdrawn", "sold"].includes(courtProjection.status);
    const dateStr = courtProjection.date || "-";

    const responsiveBreakpoints = T.BREAKPOINTS || {};
    const requestedWidth = options && options.logicalWidth;
    const logicalWidth = Number.isFinite(requestedWidth) && requestedWidth > 0
      ? requestedWidth
      : responsiveBreakpoints.wide;
    const cardPresentation = window.AuctionCardViewModel
      ? window.AuctionCardViewModel.presentation(logicalWidth, p.status)
      : {
          tier: logicalWidth <= 640 ? "compact" : logicalWidth <= 1068 ? "medium" : "wide",
          compact: logicalWidth <= 640,
          touch: logicalWidth <= 1068,
          action: { primary: null, secondary: [] }
        };
    const isMobile = cardPresentation.compact;
    card.setAttribute(
      "class",
      `auction-card auction-card-readable auction-card-original-layout auction-card-tier-${cardPresentation.tier}${isMobile ? " is-mobile" : ""}`
    );
    card.setAttribute("data-card-tier", cardPresentation.tier);

    // -------------------------------------------------------------
    // Header & Meta Information Block (Highly Structured & Mobile Responsive)
    // -------------------------------------------------------------
    const naverLink = p.source && p.source.naver && p.source.naver !== "정보 없음" && String(p.source.naver).startsWith("http") ? p.source.naver : null;
    const cafeLink = p.source && p.source.cafe && p.source.cafe !== "정보 없음" && String(p.source.cafe).startsWith("http") ? p.source.cafe : null;

    // Line 1: Title (Case Number + Property name) and Status/Links Badge Group
    const titleRow = card.createEl('div', {
      attr: { class: 'auction-card-header', style: 'display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 8px;' }
    });

    const leftContainer = titleRow.createEl('div', {
      attr: { class: 'auction-card-title-wrap', style: 'display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;' }
    });

    const displayCase = p.case_number || p.file.name.replace(/\.md$/, '');
    const displayTitle = getPropertyName(p.address);
    const fullTitleText = displayCase;

    const titleLink = leftContainer.createEl('a', {
      text: fullTitleText,
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 0.95em; color: var(--text-normal); text-decoration: none; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
        title: '클릭하여 사건 노트를 엽니다.'
      }
    });
    titleLink.setAttribute('class', 'internal-link auction-card-title');
    titleLink.onclick = (e) => {
      e.preventDefault();
      const leaf = window.lastOpenedAuctionLeaf;
      const openLeaves = app.workspace.getLeavesOfType("markdown");
      const isStillOpen = leaf && openLeaves.includes(leaf);
      if (isStillOpen) {
        app.workspace.setActiveLeaf(leaf, { focus: true });
        app.workspace.openLinkText(p.file.name, p.file.path, false);
      } else {
        app.workspace.openLinkText(p.file.name, p.file.path, 'split');
        window.lastOpenedAuctionLeaf = app.workspace.getMostRecentLeaf();
      }
    };

    if (p.status === "bidding" && p.auction_datetime) {
      const headerBidSheet = leftContainer.createEl('button', {
        text: '입찰표',
        attr: {
          type: 'button',
          class: 'auction-header-bid-sheet',
          title: '이 사건의 입찰표를 엽니다.'
        }
      });
      headerBidSheet.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dayView = window.AuctionDayView;
        const dayCore = window.AuctionDayCore;
        if (!dayView || !dayView.openForAuction) {
          if (typeof Notice !== "undefined") new Notice("입찰표를 불러오지 못했습니다.");
          return;
        }
        const casePath = (p.file && p.file.path) || p.path || "";
        const dateIso = dayCore && dayCore.toIsoDate
          ? dayCore.toIsoDate(p.auction_datetime)
          : String(p.auction_datetime).slice(0, 10);
        const packetContext = (options && options.decisionPacketContext)
          || window.AuctionDecisionPacketDashboardContext;
        try {
          await dayView.openForAuction({
            app,
            path: casePath,
            date: dateIso,
            packetContext: packetContext
          });
        } catch (err) {
          if (typeof Notice !== "undefined") {
            new Notice(err && err.message ? err.message : "입찰표를 열지 못했습니다.");
          }
        }
      };
    }

    const rightBadges = titleRow.createEl('div', {
      attr: { class: 'auction-card-header-actions', style: 'display: flex; align-items: center; gap: 4px; flex-shrink: 0;' }
    });

    // D-Day Badge
    if (ddayStr !== "-") {
      const mobileDdayStr = courtProjection.compact_label;
      const statusContext = [
        courtProjection.status && window.AuctionCourtStatus.LABELS[courtProjection.status],
        p.court_status_as_of && `기준일 ${String(p.court_status_as_of)}`,
        p.court_status_note
      ].filter(Boolean).join(" · ");
      rightBadges.createEl('span', {
        text: isMobile ? mobileDdayStr : ddayStr,
        attr: {
          class: 'auction-card-header-action auction-card-dday',
          "data-court-status": courtProjection.status || "unrecorded",
          title: statusContext || "법원 절차 상태",
          style: `background: ${isUrgent ? 'var(--text-accent)' : 'var(--background-modifier-hover)'}; color: var(--text-normal); font-size: 0.72em; font-weight: bold; padding: 1px 4px; border-radius: 4px;`
        }
      });
    }

    const overflowMenu = rightBadges.createEl("details", {
      attr: { class: "auction-card-overflow" }
    });
    overflowMenu.createEl("summary", {
      text: "•••",
      attr: {
        class: "auction-card-header-action",
        "aria-label": `${displayCase} 추가 작업`,
        title: "추가 작업"
      }
    });
    const overflowPanel = overflowMenu.createEl("div", {
      attr: { class: "auction-card-overflow-panel" }
    });
    const syncMenuLayer = () => {
      const secondaryMenu = card.querySelector(".auction-card-secondary-transitions");
      card.classList.toggle("is-menu-open", Boolean(overflowMenu.open || secondaryMenu?.open));
    };
    overflowMenu.ontoggle = syncMenuLayer;

    if (naverLink) {
      overflowPanel.createEl('a', {
        text: '네이버 부동산',
        href: naverLink,
        attr: {
          class: 'auction-card-overflow-action auction-card-external-link',
          'data-source': 'naver',
          title: '네이버 부동산 바로가기'
        }
      });
    }

    if (cafeLink) {
      overflowPanel.createEl('a', {
        text: '카페',
        href: cafeLink,
        attr: {
          class: 'auction-card-overflow-action auction-card-external-link',
          'data-source': 'cafe',
          title: '카페 바로가기'
        }
      });
    }

    const deleteBtn = overflowPanel.createEl("button", {
      text: "삭제",
      attr: {
        type: "button",
        class: "auction-card-overflow-action auction-card-delete",
        title: "이 사건 노트를 삭제(휴지통 이동)합니다."
      }
    });
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const confirmDelete = confirm(`[${displayCase}] 사건 노트를 휴지통으로 이동하시겠습니까?`);
      if (confirmDelete) {
        try {
          const file = app.vault.getAbstractFileByPath(p.file.path);
          if (file) {
            await app.vault.trash(file, true);
            new Notice(`[${displayCase}] 노트를 휴지통으로 이동했습니다.`);
          } else {
            new Notice("파일을 찾을 수 없습니다.");
          }
        } catch (err) {
          console.error("파일 삭제 중 오류 발생:", err);
          new Notice("노트 삭제 중 오류가 발생했습니다.");
        }
      }
    };

    // Line 2: Location & Type & Property Name
    const regionText = window.AuctionRegionCore?.regionDisplay
      ? window.AuctionRegionCore.regionDisplay(p)
      : [p.region_sido, p.region_sigungu, p.region_dong]
        .map((value) => String(value == null ? "" : value).trim())
        .filter(Boolean)
        .join(" ") || "지역 미정";

    const propertyGroup = card.createEl('div', {
      attr: { class: 'auction-card-property-group' }
    });
    const detailRow1 = propertyGroup.createEl('div', {
      attr: { class: 'auction-card-detail-row', style: 'font-size: 0.76em; color: var(--text-muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 1px;' }
    });
    detailRow1.createEl('span', { text: regionText, attr: { class: 'auction-card-detail-primary' } });
    if (p.region_admin_dong) {
      detailRow1.createEl('span', { text: `행정동: ${p.region_admin_dong}`, attr: { class: 'auction-card-detail-secondary' } });
    }
    const hasRegionDecision = Boolean(window.AuctionRegionPacket);
    const hasBasicLocation = Boolean(window.DuskAuctionLocation);
    const regionActionStyle = 'font: inherit; color: var(--text-accent); background: transparent; border: 0; box-shadow: none; padding: 0 2px; min-height: 0; height: auto; cursor: pointer; text-decoration: underline; text-underline-offset: 2px;';
    const regionActions = (hasRegionDecision || hasBasicLocation)
      ? (cardPresentation.compact ? overflowPanel : detailRow1).createEl('span', {
          attr: {
            class: 'auction-region-inline-actions',
            style: 'display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;'
          }
        })
      : null;
    if (hasRegionDecision) {
      const regionBtn = regionActions.createEl('button', {
        text: '판단 보드',
        attr: {
          type: 'button',
          class: 'auction-region-inline-action',
          style: regionActionStyle,
          title: '지역 근거와 조사 상태를 한 화면에서 확인합니다.',
          'aria-label': '판단 보드 열기'
        }
      });
      regionBtn.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await window.AuctionRegionPacket.openForAuction(app, p, {
            returnFocus: regionBtn,
            decisionPacketContext: (options && options.decisionPacketContext) || window.AuctionDecisionPacketDashboardContext,
            onApplied: async (fields) => {
              Object.assign(p, fields);
              card.empty();
              window.renderAuctionCard(p, container, options);
            }
          });
        } catch (error) {
          if (window.Notice) new Notice(error.message || String(error));
        }
      };
    }
    if (hasBasicLocation) {
      const locationBtn = regionActions.createEl('button', {
        text: p.location_status === 'basic_ready' ? '기본 입지 갱신' : '기본 입지 계산',
        attr: {
          type: 'button',
          class: 'auction-region-inline-action',
          style: regionActionStyle,
          title: 'AI 없이 주소 좌표와 가까운 역·학교의 직선거리를 계산합니다.',
          'aria-label': '기본 입지 자동계산'
        }
      });
      locationBtn.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const address = String(p.address || '').trim();
        if (!address) {
          if (window.Notice) new Notice('옥션카드 주소가 비어 있습니다.');
          return;
        }
        locationBtn.disabled = true;
        locationBtn.textContent = '계산 중…';
        try {
          const result = await window.DuskAuctionLocation.calculateBasicLocation(address);
          const fields = {
            location_status: 'basic_ready',
            location_ai_used: false,
            location_checked_at: result.checkedAt,
            location_distance_type: result.distanceType,
            location_lat: result.latitude,
            location_lng: result.longitude,
            nearest_station: result.nearestStation?.name || '',
            nearest_station_distance_m: result.nearestStation?.distanceM || null,
            nearest_elementary_school: result.nearestElementarySchool?.name || '',
            nearest_elementary_distance_m: result.nearestElementarySchool?.distanceM || null,
            nearest_middle_school: result.nearestMiddleSchool?.name || '',
            nearest_middle_distance_m: result.nearestMiddleSchool?.distanceM || null,
            nearest_high_school: result.nearestHighSchool?.name || '',
            nearest_high_distance_m: result.nearestHighSchool?.distanceM || null,
            assigned_school_status: 'verification_required'
          };
          const tFile = app.vault.getAbstractFileByPath(p.file.path);
          if (!tFile) throw new Error('옥션카드 원본 파일을 찾지 못했습니다.');
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            Object.assign(fm, fields);
            fm.updated = new Date().toISOString().split('T')[0];
          });
          Object.assign(p, fields);
          if (window.Notice) new Notice('기본 입지 자동계산을 완료했습니다.');
          card.empty();
          window.renderAuctionCard(p, container, options);
        } catch (error) {
          if (window.Notice) new Notice(error.message || String(error));
          locationBtn.disabled = false;
          locationBtn.textContent = p.location_status === 'basic_ready' ? '기본 입지 갱신' : '기본 입지 계산';
        }
      };
    }
    if (p.location_status === 'basic_ready') {
      const locationParts = [
        p.nearest_station && `${p.nearest_station} ${Number(p.nearest_station_distance_m).toLocaleString()}m`,
        p.nearest_elementary_school && `${p.nearest_elementary_school} ${Number(p.nearest_elementary_distance_m).toLocaleString()}m`
      ].filter(Boolean);
      if (locationParts.length) {
        detailRow1.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
        detailRow1.createEl('span', {
          text: locationParts.join(' / '),
          attr: { class: 'auction-card-detail-secondary', title: '직선거리 · 공식 배정 학교 아님' }
        });
      }
    }
    detailRow1.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
    detailRow1.createEl('span', { text: p.property_type || "용도 미정" });
    const areaParts = [
      formatArea(p.exclusive_area) && `전용 ${formatArea(p.exclusive_area)}`,
      formatArea(p.supply_area) && `공급 ${formatArea(p.supply_area)}`
    ].filter(Boolean);
    if (areaParts.length) {
      detailRow1.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
      detailRow1.createEl('span', {
        text: areaParts.join(" / "),
        attr: { class: "auction-card-area", title: "Auction Object의 전용·공급면적" }
      });
    }

    if (displayTitle && displayTitle !== "물건명 미지정") {
      detailRow1.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
      detailRow1.createEl('span', { text: displayTitle, attr: { class: 'auction-card-detail-primary', style: 'font-weight: bold; color: var(--text-normal);' } });
    }

    // Line 3: Court & Date
    const detailRow2 = propertyGroup.createEl('div', {
      attr: { class: 'auction-card-detail-row', style: 'font-size: 0.72em; color: var(--text-muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 1px;' }
    });

    let hasCourtOrDate = false;
    if (p.court) {
      detailRow2.createEl('span', { text: p.court, attr: { style: 'font-weight: bold;' } });
      hasCourtOrDate = true;
    }

    if (p.auction_datetime) {
      if (hasCourtOrDate) {
        detailRow2.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
      }
      detailRow2.createEl('span', { text: dateStr });
    }
    
   // Finance Row
   const financeRow = card.createEl('div', {
     attr: { class: 'auction-card-finance-row', style: `display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: ${isMobile ? '4px 6px' : '8px'}; font-size: ${isMobile ? '0.72em' : '0.78em'}; color: var(--text-normal); margin-top: 1px; white-space: nowrap; overflow-x: auto; scrollbar-width: none;` }
   });
    
    let minRateStr = "";
    if (!isCourtInactive && p.appraisal_price && p.minimum_bid && p.appraisal_price !== "정보 없음" && p.minimum_bid !== "정보 없음") {
      const appraisal = parser(p.appraisal_price);
      const minimum = parser(p.minimum_bid);
      if (!isNaN(appraisal) && !isNaN(minimum) && isFinite(appraisal) && isFinite(minimum) && appraisal > 0) {
        minRateStr = ` (${(minimum / appraisal * 100).toFixed(0)}%)`;
      }
    }

    const priceProjection = window.AuctionCardPriceProjection
      ? window.AuctionCardPriceProjection.project(p, { isEnded: isAuctionEnded })
      : { left: { key: "minimum_bid", label: "최저가", value: p.minimum_bid }, right: { key: "expected_bid", label: "입찰 예정가", value: p.expected_bid } };
   const formatProjectedPrice = (entry, suffix = "") => {
     const isTerminal = ["won", "lost", "skipped", "reviewing", "archived"].includes(p.status);
     const precise = (p.status === "bidding" && isAuctionToday) || isTerminal;
     const value = precise ? toWon(entry.value) : toEok(entry.value);
     return `<span class="auction-card-metric-label">${entry.label}</span><strong title="${toWon(entry.value)}">${value}${suffix}</strong>`;
   };
    const priceGroup = financeRow.createEl('div', {
      attr: {
        class: 'auction-card-finance-group auction-card-finance-group-price',
        'aria-label': priceProjection.right.key === "winning_bid_price" ? '경매 결과' : '입찰 정보'
      }
    });
    priceGroup.createEl('span', {
      text: priceProjection.right.key === "winning_bid_price" ? '경매 결과' : '입찰 정보',
      attr: { class: 'auction-card-finance-label' }
    });
    // The acquisition/outcome pair is the first thing a completed card must communicate.
    // Keep it together so "내 입찰가 → 낙찰가" is not visually split by editable estimates.
    const pricePair = priceGroup.createEl('div', {
      attr: { class: 'auction-card-price-pair', style: 'display:flex; align-items:center; gap:4px; flex-wrap:wrap;' }
    });
   const minEl = pricePair.createEl('div', { attr: { class: 'auction-card-result-price' } });
   minEl.innerHTML = formatProjectedPrice(
     priceProjection.left,
     priceProjection.left.key === "minimum_bid" ? minRateStr : ""
   );

   // Terminal cards: make left price (my_bid / expected_bid) clickable to edit
   const terminalLeftEditable = ["won", "lost", "skipped", "reviewing"].includes(p.status)
     && (priceProjection.left.key === "my_bid_price" || priceProjection.left.key === "expected_bid");
   if (terminalLeftEditable) {
     minEl.style.cssText = 'cursor:pointer;padding:0 2px;border-radius:3px;transition:background-color 0.2s;';
     minEl.title = `${priceProjection.left.label} 수정`;
     minEl.addEventListener('mouseenter', () => { minEl.style.backgroundColor = 'var(--background-modifier-hover)'; });
     minEl.addEventListener('mouseleave', () => { minEl.style.backgroundColor = 'transparent'; });
     minEl.addEventListener('click', async (e) => {
       e.preventDefault(); e.stopPropagation();
       const current = p[priceProjection.left.key] || "";
       const newVal = await window.obsidianPrompt(
         `[${p.case_number || p.file.name}] ${priceProjection.left.label} 수정`,
         `${priceProjection.left.label}를 입력해주세요 (원 단위):`, String(current)
       );
       if (newVal === null) return;
       const clean = newVal.replace(/,/g, '').trim();
       const parsed = clean === "" ? null : (Number(clean) || clean);
       const tFile = app.vault.getAbstractFileByPath(p.file.path);
       if (tFile) {
         await app.fileManager.processFrontMatter(tFile, (fm) => {
           fm[priceProjection.left.key] = parsed;
           fm.updated = new Date().toISOString().split('T')[0];
         });
         new Notice(`${priceProjection.left.label}가 업데이트되었습니다.`);
       }
     });
   }

   pricePair.createEl('span', { text: '→', attr: { style: 'color: var(--text-muted); font-weight: 700;' } });

    const expectedBidEditable = priceProjection.right.key === "expected_bid" && ["watching", "bidding"].includes(p.status);
    const expEl = pricePair.createEl('div', {
      attr: {
        style: expectedBidEditable ? 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;' : '',
        title: expectedBidEditable ? `${priceProjection.right.label} 수정` : ''
      }
    });

    // Add hover style for expected bid
    if (expectedBidEditable) {
      expEl.addEventListener('mouseenter', () => {
        expEl.style.backgroundColor = 'var(--background-modifier-hover)';
      });
      expEl.addEventListener('mouseleave', () => {
        expEl.style.backgroundColor = 'transparent';
      });
    }
    
    expEl.innerHTML = `<span class="auction-card-result-price">${formatProjectedPrice(priceProjection.right)}</span>`;
    
    if (expectedBidEditable) expEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentExpected = p.expected_bid || "";
      const newExpected = await window.obsidianPrompt(
        `[${p.case_number || p.file.name}] ${display.property("expected_bid")} 수정`,
        `${display.property("expected_bid")}를 입력해주세요 (원 단위, 예: 154000000):`,
        String(currentExpected)
      );
      
      if (newExpected === null) return; // Cancelled
      
      let cleanVal = newExpected.replace(/,/g, '').trim();
      const parsedValue = cleanVal === "" ? null : (Number(cleanVal) || cleanVal);
      
      const tFile = app.vault.getAbstractFileByPath(p.file.path);
      if (tFile) {
        await app.fileManager.processFrontMatter(tFile, (fm) => {
          fm.expected_bid = parsedValue;
          fm.updated = new Date().toISOString().split('T')[0];
        });
        new Notice("입찰가가 업데이트되었습니다.");
      }
    });

    // 법정동 키값: 전용면적으로 환산한 총액을 가격쌍 바로 아래에 표시한다.
    if (p.property_type === '오피스텔' && window.AuctionKeyValueProjection) {
      try {
        const keyProjection = window.AuctionKeyValueSnapshot
          ? window.AuctionKeyValueProjection.project(p, window.AuctionKeyValueSnapshot, { parsePrice: parser })
          : null;
        if (keyProjection && keyProjection.available) {
          const keyScope = keyProjection.primary_scope === "district" ? keyProjection.district : keyProjection.dong;
          const scopeLabel = keyScope && keyScope.label ? keyScope.label : keyProjection.legal_dong;
          const keyRow = priceGroup.createEl('button', {
            attr: {
              type: 'button',
              class: 'auction-card-key-value',
              'data-key-value-scope': keyProjection.primary_scope,
              'aria-haspopup': 'dialog',
              'aria-label': `${displayCase} 키값 상세 열기`
            }
          });
          const formatManPerPyeong = (won) => `${Math.round(won / 10000).toLocaleString()}만/평`;
          if (keyProjection.key_value_total_won && keyProjection.area_pyeong) {
            keyRow.createEl('strong', {
              text: `${scopeLabel} 키값 ${toEok(keyProjection.key_value_total_won)}`,
              attr: { class: 'auction-card-key-value-total' }
            });
          } else {
            keyRow.createEl('strong', {
              text: `${scopeLabel} 키값 ${formatManPerPyeong(keyProjection.key_value_won_per_pyeong)}`,
              attr: { class: 'auction-card-key-value-total' }
            });
          }
          const detailParts = [];
          if (keyProjection.primary_scope === "dong" && keyProjection.district && keyProjection.district_difference_ratio !== null) {
            const delta = Math.round(keyProjection.district_difference_ratio * 100);
            detailParts.push(`${keyProjection.district.label} 대비 ${delta >= 0 ? "+" : ""}${delta}%`);
          } else if (keyProjection.primary_scope === "district" && keyProjection.dong) {
            detailParts.push(`${keyProjection.dong.label} 표본 약함`);
          }
          if (keyProjection.comparison) detailParts.push(`${keyProjection.comparison.price_basis} ${Math.round(keyProjection.comparison.ratio * 100)}%`);
          if (!keyProjection.area_pyeong) detailParts.push("전용면적 필요");
          keyRow.createEl('span', {
            text: detailParts.join(" · "),
            attr: { class: 'auction-card-key-value-detail' }
          });
          keyRow.createEl('span', { text: '›', attr: { class: 'auction-card-key-value-chevron', 'aria-hidden': 'true' } });
          keyRow.setAttr('title', `법정동 ${keyProjection.legal_dong} · 기준 ${keyProjection.period_start}~${keyProjection.period_end} · 중간 범위 ${formatManPerPyeong(keyProjection.q1_won_per_pyeong)}~${formatManPerPyeong(keyProjection.q3_won_per_pyeong)} · AUCT CSV`);
          keyRow.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (window.AuctionKeyValueDetail && typeof window.AuctionKeyValueDetail.open === "function") {
              window.AuctionKeyValueDetail.open(app, keyProjection, { returnFocus: keyRow });
            }
          };
        }
      } catch (error) { console.warn('[Auction Key Value]', error); }
    }

 // Deposit = minimum_bid / 10 (visible when bidding)
 if (p.status === "bidding") {
   const savedDeposit = parser(p.bid_deposit);
   const minBidNum = parser(p.minimum_bid);
   const deposit = (!isNaN(savedDeposit) && isFinite(savedDeposit) && savedDeposit > 0)
     ? savedDeposit
     : (!isNaN(minBidNum) && isFinite(minBidNum) && minBidNum > 0 ? Math.floor(minBidNum / 10) : 0);
   if (deposit > 0) {
     const depositStr = toWon(deposit);
     const depositEl = priceGroup.createEl('div', {
       attr: { style: 'white-space:nowrap;cursor:pointer;padding:0 2px;border-radius:3px;transition:background-color 0.2s;', title: `보증금: ${toWon(deposit)} (최저가 ÷ 10) — 클릭하여 수정` }
     });
       depositEl.innerHTML = `보증금: <strong style="color:var(--text-accent);">${depositStr}</strong>`;
       depositEl.addEventListener('mouseenter', () => { depositEl.style.backgroundColor = 'var(--background-modifier-hover)'; });
       depositEl.addEventListener('mouseleave', () => { depositEl.style.backgroundColor = 'transparent'; });
       depositEl.addEventListener('click', async (e) => {
         e.preventDefault(); e.stopPropagation();
         const currentDeposit = p.bid_deposit || "";
         const newDeposit = await window.obsidianPrompt(
           `[${p.case_number || p.file.name}] 보증금 수정`,
           `보증금을 입력해주세요 (원 단위):`, String(currentDeposit)
         );
         if (newDeposit === null) return;
         const clean = newDeposit.replace(/,/g, '').trim();
         const parsed = clean === "" ? null : (Number(clean) || clean);
         const tFile = app.vault.getAbstractFileByPath(p.file.path);
         if (tFile) {
           await app.fileManager.processFrontMatter(tFile, (fm) => {
             fm.bid_deposit = parsed;
             fm.updated = new Date().toISOString().split('T')[0];
           });
           new Notice("보증금이 업데이트되었습니다.");
         }
       });
      priceGroup.createEl('span', { text: '·', attr: { class: 'auction-card-finance-separator', style: isMobile ? 'display: none;' : '' } });
    }
  }

   const isTerminalStatus = ["won", "lost", "skipped"].includes(p.status);
   const hasExitPrice = hasRecordedValue(p.exit_price);
   const profitInfo = calcMonthlyProfit(p, priceProjection.left.value);
   let spreadInfo = null;
   if (hasExitPrice && hasRecordedValue(priceProjection.left.value)) {
     const exit = parser(p.exit_price);
     const acquisition = parser(priceProjection.left.value);
     if (!isNaN(exit) && !isNaN(acquisition) && isFinite(exit) && isFinite(acquisition)) {
       const diff = exit - acquisition;
       spreadInfo = {
         value: toEok(diff),
         color: diff > 0 ? "var(--text-accent)" : diff < 0 ? "var(--text-error)" : "var(--text-muted)"
       };
     }
   }
   const incomeGroup = financeRow.createEl('div', {
     attr: { class: 'auction-card-finance-group auction-card-finance-group-income', 'aria-label': '수익 분석' }
   });
   incomeGroup.createEl('span', { text: '수익 분석', attr: { class: 'auction-card-finance-label' } });

   const editExitPrice = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentExit = p.exit_price || "";
      const newExit = await window.obsidianPrompt(
        `[${p.case_number || p.file.name}] 출구가 수정`,
        "출구가를 입력해주세요 (원 단위, 예: 220000000):",
        String(currentExit)
      );
      if (newExit === null) return;
      const cleanVal = newExit.replace(/,/g, '').trim();
      const parsedValue = cleanVal === "" ? null : (Number(cleanVal) || cleanVal);
      const tFile = app.vault.getAbstractFileByPath(p.file.path);
      if (tFile) {
        await app.fileManager.processFrontMatter(tFile, (fm) => {
          fm.exit_price = parsedValue;
          fm.updated = new Date().toISOString().split('T')[0];
        });
        new Notice("출구가가 업데이트되었습니다.");
      }
   };

   const exitEl = incomeGroup.createEl('div', {
      attr: {
        style: 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;',
        title: '출구가 수정',
        role: 'button',
        tabindex: '0',
        'aria-label': '출구가 수정'
      }
    });
    exitEl.addEventListener('mouseenter', () => { exitEl.style.backgroundColor = 'var(--background-modifier-hover)'; });
    exitEl.addEventListener('mouseleave', () => { exitEl.style.backgroundColor = 'transparent'; });
   const exitColor = p.exit_price && p.exit_price !== "정보 없음" ? 'var(--text-success)' : 'var(--text-normal)';
   const exitDisplay = isMobile
     ? toEok(p.exit_price)
     : (["won", "lost", "skipped"].includes(p.status) ? toWon(p.exit_price) : toEok(p.exit_price));
   exitEl.innerHTML = `<span class="auction-card-metric-label">출구가</span><strong style="color:${exitColor};">${exitDisplay}</strong>`;
   exitEl.addEventListener('click', editExitPrice);

   const diffEl = incomeGroup.createEl('div', {
     attr: {
       style: 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;',
       title: '차익 계산에 사용하는 출구가 수정',
       role: 'button',
       tabindex: '0',
       'aria-label': '차익 계산 입력값 수정'
     }
   });
   diffEl.addEventListener('mouseenter', () => { diffEl.style.backgroundColor = 'var(--background-modifier-hover)'; });
   diffEl.addEventListener('mouseleave', () => { diffEl.style.backgroundColor = 'transparent'; });
   diffEl.innerHTML = spreadInfo
     ? `<span class="auction-card-metric-label">차익</span><strong style="color:${spreadInfo.color};">${spreadInfo.value}</strong>`
     : '<span class="auction-card-metric-label">차익</span><strong style="color:var(--text-muted);">-</strong>';
   diffEl.addEventListener('click', editExitPrice);

   incomeGroup.createEl('span', { text: '·', attr: { class: 'auction-card-finance-separator', style: isMobile ? 'display: none;' : '' } });

     const profitEl = incomeGroup.createEl('div', {
       attr: {
         style: 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;',
         title: '클릭하여 예상 월세, 대출비율, 이율을 수정합니다.',
         role: 'button',
         tabindex: '0',
         'aria-label': '월수익 계산 입력값 수정'
       }
     });

     profitEl.addEventListener('mouseenter', () => {
       profitEl.style.backgroundColor = 'var(--background-modifier-hover)';
     });
     profitEl.addEventListener('mouseleave', () => {
       profitEl.style.backgroundColor = 'transparent';
     });

    profitEl.innerHTML = `<span class="auction-card-metric-label">월수익</span>${formatProfit(profitInfo)}`;

    profitEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const obsidianModule = window.obsidian;
      const appInstance = window.app;
      if (!obsidianModule || !appInstance) {
        new Notice("오류: window.obsidian 또는 window.app을 불러올 수 없습니다.");
        return;
      }
      const { Modal, Setting } = obsidianModule;

      const currentRent = p.expected_monthly_rent !== undefined ? p.expected_monthly_rent : "";
      const currentLoan = p.loan_ratio !== undefined ? p.loan_ratio : 0.8;
      const currentInterest = p.interest_rate !== undefined ? p.interest_rate : 0.06;

      class ProfitEditModal extends Modal {
        constructor(app, onSave) {
          super(app);
          this.onSave = onSave;
          this.inputRent = toMan(currentRent);
          this.inputLoan = (currentLoan * 100) + "%";
          this.inputInterest = (currentInterest * 100).toFixed(1) + "%";
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.createEl("h3", { text: `[${p.case_number || p.file.name}] 월수익 계산 정보 수정`, attr: { style: "margin-bottom: 16px; font-size: 1.2em;" } });
          
          new Setting(contentEl)
            .setName(display.property("expected_monthly_rent"))
            .setDesc("원 단위 또는 만원 단위 (예: 500000 또는 50만)")
            .addText((text) => {
              text.setValue(String(this.inputRent));
              text.onChange((val) => { this.inputRent = val; });
            });
            
          new Setting(contentEl)
            .setName(display.property("loan_ratio"))
            .setDesc("소수점 비율 또는 % 단위 (예: 0.8 또는 80%)")
            .addText((text) => {
              text.setValue(String(this.inputLoan));
              text.onChange((val) => { this.inputLoan = val; });
            });
            
          new Setting(contentEl)
            .setName(display.property("interest_rate"))
            .setDesc("소수점 이율 또는 % 단위 (예: 0.06 또는 6%)")
            .addText((text) => {
              text.setValue(String(this.inputInterest));
              text.onChange((val) => { this.inputInterest = val; });
            });
            
          new Setting(contentEl)
            .addButton((btn) => {
              btn.setButtonText("확인")
                 .setCta()
                 .onClick(() => {
                   this.close();
                   this.onSave(this.inputRent, this.inputLoan, this.inputInterest);
                 });
            })
            .addButton((btn) => {
              btn.setButtonText("취소")
                 .onClick(() => {
                   this.close();
                 });
            });
        }
        onClose() {
          this.contentEl.empty();
        }
      }

      const modal = new ProfitEditModal(appInstance, async (rentVal, loanVal, interestVal) => {
        // 1. Parse rent
        let cleanRent = String(rentVal).replace(/,/g, '').trim();
        let parsedRent = currentRent;
        if (cleanRent !== "") {
          if (cleanRent.includes('만')) {
            parsedRent = parseFloat(cleanRent) * 10000;
          } else {
            parsedRent = Number(cleanRent);
          }
          if (isNaN(parsedRent)) parsedRent = cleanRent;
        } else {
          parsedRent = null;
        }
        
        // 2. Parse loan ratio
        let cleanLoan = String(loanVal).replace(/%/g, '').trim();
        let parsedLoan = currentLoan;
        if (cleanLoan !== "") {
          let val = Number(cleanLoan);
          if (!isNaN(val)) {
            parsedLoan = val > 1 ? val / 100 : val;
          } else {
            parsedLoan = cleanLoan;
          }
        }
        
        // 3. Parse interest rate
        let cleanInterest = String(interestVal).replace(/%/g, '').trim();
        let parsedInterest = currentInterest;
        if (cleanInterest !== "") {
          let val = Number(cleanInterest);
          if (!isNaN(val)) {
            parsedInterest = val > 1 ? val / 100 : val;
          } else {
            parsedInterest = cleanInterest;
          }
        }
        
        const tFile = app.vault.getAbstractFileByPath(p.file.path);
        if (tFile) {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.expected_monthly_rent = parsedRent;
            fm.loan_ratio = parsedLoan;
            fm.interest_rate = parsedInterest;
            fm.updated = new Date().toISOString().split('T')[0];
          });
          new Notice("월수익 계산 정보가 업데이트되었습니다.");
        }
      });
     modal.open();
   });
    
   if (["won", "lost", "skipped"].includes(p.status)) {
      const decisionEl = card.createEl('div', {
        attr: { style: 'font-size: 0.78em; color: var(--text-normal); margin-top: 1px;' }
      });
      
      const reason = p.decision_reason || "미지정";
      decisionEl.createEl('strong', {
        text: `${display.property("decision_reason")}:`,
        attr: { style: 'color:var(--text-accent); font-weight:bold;' }
      });
      decisionEl.createSpan({ text: ` ${reason}` });
    }

    // Opinion Row (Clickable)
    const opinionEl = card.createEl('div', {
      attr: {
        class: 'auction-card-opinion',
        style: 'font-size: 0.78em; color: var(--text-normal); margin-top: 2px; padding: 2px 4px; border-radius: 4px; cursor: pointer; transition: background-color 0.2s;'
      }
    });

    // Add hover effect
    opinionEl.addEventListener('mouseenter', () => {
      opinionEl.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    opinionEl.addEventListener('mouseleave', () => {
      opinionEl.style.backgroundColor = 'transparent';
    });
    
    const myOpinion = p.my_opinion;
    const userNote = p.auction_note;
    const recLevel = (window.MorningContextCore && window.MorningContextCore.resolveRecommendLevel)
      ? window.MorningContextCore.resolveRecommendLevel(p)
      : (p.recommend_level || p.recommendation || "");
    const recNote = p.recommend_note || (recLevel ? `추천 등급: ${recLevel}` : "");
    
    const isValid = (val) => {
      return val && val !== "정보 없음" && val !== "메모 없음" && String(val).trim() !== "";
    };
    
    opinionEl.createEl('strong', {
      text: `${display.property("my_opinion")}:`,
      attr: { style: 'color:var(--text-accent); font-weight:bold;' }
    });
    opinionEl.createSpan({
      text: isValid(myOpinion) ? ` ${String(myOpinion).trim()}` : ' 의견 없음 · 눌러서 입력',
      attr: isValid(myOpinion) ? {} : { style: 'color:var(--text-muted); font-style:italic;' }
    });
    opinionEl.title = `${display.property("my_opinion")} 수정`;

    opinionEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentOpinion = p.my_opinion || "";
      const newOpinion = await window.obsidianPrompt(
        `[${p.case_number || p.file.name}] ${display.property("my_opinion")} 수정`,
        "투자 판단 의견 및 메모를 입력해주세요:",
        String(currentOpinion)
      );
      
      if (newOpinion === null) return; // Cancelled
      
      const tFile = app.vault.getAbstractFileByPath(p.file.path);
      if (tFile) {
        // 1. Update frontmatter
        await app.fileManager.processFrontMatter(tFile, (fm) => {
          fm.my_opinion = newOpinion.trim();
          fm.updated = new Date().toISOString().split('T')[0];
        });
        
        // Frontmatter update is sufficient since the template uses Meta-bind to display/edit properties
        
        new Notice(`${display.property("my_opinion")}이 업데이트되었습니다.`);
      }
    });

    const userText = isValid(userNote) ? String(userNote).trim() : "";
    const recText = isValid(recNote) ? String(recNote).trim() : "";
    const memoEl = card.createEl('details', {
      attr: { class: 'auction-card-memo auction-card-note-disclosure' }
    });

    if (userText || recText) {
      memoEl.createEl("summary", { text: userText || recText });
      const memoBody = memoEl.createEl('div', {
        attr: { style: 'border-top: 1px dashed var(--background-modifier-border); padding-top: 4px; margin-top: 4px;' }
      });
      const primaryMemo = memoBody.createEl('div');
      primaryMemo.createEl('strong', {
        text: '참고사항:',
        attr: { style: 'color:var(--text-accent); font-weight:bold;' }
      });
      primaryMemo.createSpan({ text: ` ${userText || recText}` });
      if (userText && recText) {
        memoBody.createEl('div', {
          text: recText,
          attr: { style: 'margin-left: 18px; color: var(--text-muted); margin-top: 2px;' }
        });
      }
    } else {
      memoEl.style.display = 'none';
    }
    
    // Transition status buttons
    const getTransitionButtons = (currentStatus) => {
      const allTransitions = {
        watching: ['bidding', 'skipped'],
        bidding: ['won', 'lost', 'skipped'],
        won: ['reviewing'],
        lost: ['reviewing'],
        reviewing: ['archived'],
        skipped: ['archived'],
        archived: []
      };
      return (allTransitions[currentStatus] || []).map((key) => {
        const info = display.statusInfo(key);
        // Card UI uses a shorter label so mobile rows stay compact.
        const shortLabel = key === "skipped" ? "포기" : info.label;
        return { key, label: shortLabel, color: info.color };
      });
    };
    
    const buttons = getTransitionButtons(p.status);
    const hasResearchEntry = p.type === "auction_case"
      && Boolean(window.AuctionRealEstateResearch && typeof window.AuctionRealEstateResearch.openForAuction === "function");
    if (buttons.length > 0 || p.status === "bidding" || hasResearchEntry) {
      if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
      const actionLayout = window.ProdigyUI && window.ProdigyUI.auctionActionRow
        ? window.ProdigyUI.auctionActionRow(card, logicalWidth)
        : {
            mode: "inline",
            row: card.createEl('div', {
              attr: {
                class: 'prodigy-card-actions auction-card-actions',
                style: 'margin-top: 3px; border-top: 1px solid var(--background-modifier-border); padding-top: 3px; display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 2px;'
              }
            })
          };
      if (!actionLayout.actionHost) actionLayout.actionHost = actionLayout.row;
      const buttonContainer = actionLayout.actionHost;
      const secondaryTransitions = buttons.filter((item) => cardPresentation.action.secondary.includes(item.key));
      const secondaryTransitionKeys = new Set(secondaryTransitions.map((item) => item.key));
      let secondaryTransitionMenu = null;
      let secondaryTransitionPanel = null;
      if (secondaryTransitions.length) {
        secondaryTransitionMenu = buttonContainer.createEl("details", {
          attr: { class: "auction-card-secondary-transitions" }
        });
        secondaryTransitionMenu.createEl("summary", {
          text: p.status === "bidding" ? "결과 입력" : "더보기",
          attr: { "aria-label": `${displayCase} 추가 상태 전환` }
        });
        secondaryTransitionPanel = secondaryTransitionMenu.createEl("div", {
          attr: { class: "auction-card-secondary-transition-panel" }
        });
        secondaryTransitionMenu.ontoggle = syncMenuLayer;
      }

      if (hasResearchEntry) {
        const researchHost = buttonContainer.createEl("span", { attr: { class: "auction-card-research-attention" } });
        const actionPromise = window.AuctionRegionPacket && typeof window.AuctionRegionPacket.researchActionForAuction === "function"
          ? window.AuctionRegionPacket.researchActionForAuction(app, p)
          : Promise.resolve({ state: "missing", label: "조사 필요", show: true });
        Promise.resolve(actionPromise).then((researchState) => {
          if (!researchState || !researchState.show || researchHost.isConnected === false) return;
          researchHost.createEl("span", { text: researchState.label, attr: { class: "auction-card-research-badge" } });
          const researchButton = window.ProdigyUI
            ? window.ProdigyUI.button(researchHost, "조사 자료", { chip: true })
            : researchHost.createEl("button", { text: "조사 자료", attr: { type: "button", class: "prodigy-btn prodigy-btn-chip" } });
          if (typeof researchButton.setAttribute === "function") researchButton.setAttribute("aria-label", `${displayCase} 조사 자료 열기 · ${researchState.label}`);
          researchButton.onclick = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
              await window.AuctionRealEstateResearch.openForAuction(app, p, {
                returnFocus: researchButton,
                onApplied: async (fields) => {
                  Object.assign(p, fields);
                  card.empty();
                  window.renderAuctionCard(p, container, options);
                }
              });
            } catch (error) {
              if (window.Notice) new Notice(`부동산 조사 오류: ${error.message || String(error)}`);
            }
          };
        }).catch(() => {
          if (researchHost.isConnected === false) return;
          researchHost.createEl("span", { text: "조사 상태 확인 실패", attr: { class: "auction-card-research-badge" } });
        });
      }

      buttons.forEach(opt => {
        const targetHost = secondaryTransitionKeys.has(opt.key) && secondaryTransitionPanel
          ? secondaryTransitionPanel
          : buttonContainer;
        const btn = window.ProdigyUI
          ? window.ProdigyUI.button(targetHost, opt.label, { chip: true })
          : targetHost.createEl('button', {
            text: opt.label,
            attr: { type: 'button', class: 'prodigy-btn prodigy-btn-chip' }
          });
        if (typeof btn.setAttribute === "function") {
            const currentClass = typeof btn.getAttribute === "function"
              ? (btn.getAttribute("class") || "")
              : "";
          const primaryClass = cardPresentation.action.primary === opt.key ? " auction-card-primary-action" : "";
          btn.setAttribute("class", `${currentClass} auction-card-action auction-card-action-${opt.key}${primaryClass}`.trim());
        }
        if (opt.key === "bidding" && typeof btn.style?.setProperty === "function") {
          btn.style.setProperty("background-color", "var(--text-accent)", "important");
          btn.style.setProperty("border-color", "var(--text-accent)", "important");
          btn.style.setProperty("color", "var(--background-primary)", "important");
        }
        
        btn.onclick = async (e) => {
          e.preventDefault();
          if (secondaryTransitionMenu) secondaryTransitionMenu.open = false;
          
          let expectedBid = p.expected_bid || "";
          let actualBid = p.my_bid_price || "";
          let winningBid = p.winning_bid_price || "";
 
          if (opt.key === 'bidding') {
            const inputExpected = await window.obsidianPrompt(`[${p.case_number}] ${display.status('bidding')}`, `${display.property("expected_bid")}를 입력해주세요 (원 단위, 예: 154000000):`, String(expectedBid));
            if (inputExpected === null) return;
            expectedBid = inputExpected.trim();

            btn.disabled = true;
            const tFile = app.vault.getAbstractFileByPath(p.file.path);
            if (tFile) {
              await app.fileManager.processFrontMatter(tFile, (fm) => {
                fm.status = opt.key;
                if (expectedBid) fm.expected_bid = Number(expectedBid) || expectedBid;
                fm.updated = new Date().toISOString().split('T')[0];
              });
              await window.AuctionDashboardRefresh?.refresh(app, tFile);
              new Notice(`상태가 ${opt.label}(으)로 변경되고 예상 입찰가가 기록되었습니다.`);
            }
         } else if (opt.key === 'won' || opt.key === 'lost' || opt.key === 'skipped') {
           if (opt.key === 'won' || opt.key === 'lost') {
             const inputActual = await window.obsidianPrompt(`[${p.case_number}] 실제 입찰가 입력`, "실제 입찰가를 입력해주세요 (원 단위, 예: 154000000):", String(actualBid));
             if (inputActual === null) return;
             actualBid = inputActual.trim();
           }

            // Open Decision Capture Modal
            class DecisionCaptureModal extends window.obsidian.Modal {
              constructor(appInstance, statusKey, onSave) {
                super(appInstance);
                this.statusKey = statusKey;
                this.onSave = onSave;
                this.selectedReason = "";
              }
              onOpen() {
                const { contentEl, modalEl } = this;
                contentEl.empty();

                if (modalEl) {
                  modalEl.addClass("prodigy-decision-modal");
                  modalEl.style.width = "min(500px, calc(100vw - 32px))";
                  modalEl.style.maxWidth = "calc(100vw - 32px)";
                  modalEl.style.background = "var(--ke-color-surface, var(--background-primary))";
                  modalEl.style.borderRadius = "var(--ke-radius-panel, 14px)";
                  modalEl.style.padding = "0";
                  modalEl.style.border = "1px solid var(--ke-color-border, var(--background-modifier-border))";
                  modalEl.style.boxShadow = "none";
                }

                contentEl.style.padding = "22px 24px";
                contentEl.style.background = "var(--ke-color-surface, var(--background-primary))";
                contentEl.style.color = "var(--ke-color-text, var(--text-normal))";
                contentEl.style.boxSizing = "border-box";

                let title = "";
                let question = "";
                let reasons = [];
                let placeholderText = "";

                if (this.statusKey === 'won') {
                  title = "낙찰";
                  question = "이번 입찰의 핵심 이유는 무엇인가요?";
                  reasons = ["수익성 우수", "시세 대비 저렴", "희소성", "장기 투자", "기타"];
                  placeholderText = "입찰 판단 메모";
                } else if (this.statusKey === 'lost') {
                  title = "패찰";
                  question = "패찰 원인은 무엇인가요?";
                  reasons = ["경쟁 과열", "예상가 부족", "전략적 패찰", "기타"];
                  placeholderText = "패찰 메모";
                } else if (this.statusKey === 'skipped') {
                  title = "입찰 포기";
                  question = "입찰을 포기한 이유는 무엇인가요?";
                  reasons = ["수익성 부족", "권리 문제", "임장 결과", "자금 부족", "전략적 포기", "기타"];
                  placeholderText = "포기 메모";
                }

                contentEl.createEl("h3", {
                  text: title,
                  attr: { style: "margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 700; color: var(--ke-color-text, var(--text-normal));" }
                });
                contentEl.createEl("p", {
                  text: question,
                  attr: { style: "font-size: 0.88rem; color: var(--ke-color-muted, var(--text-muted)); margin: 0 0 16px 0; line-height: 1.4;" }
                });

                const chipGrid = contentEl.createDiv({
                  attr: { style: "display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px;" }
                });

                const chipButtons = [];
                reasons.forEach((reason, index) => {
                  const chip = chipGrid.createEl("button", {
                    text: reason,
                    attr: {
                      type: "button",
                      class: "prodigy-configurator-chip" + (index === 0 ? " is-active" : ""),
                      style: "min-height: 36px; padding: 6px 14px; border-radius: 9999px; font-size: 0.88rem; font-weight: 500; cursor: pointer; border: 1px solid " + (index === 0 ? "var(--ke-color-interactive, var(--interactive-accent))" : "var(--ke-color-border, var(--background-modifier-border))") + "; background: " + (index === 0 ? "var(--ke-color-interactive, var(--interactive-accent))" : "var(--ke-color-surface-secondary, var(--background-secondary))") + "; color: " + (index === 0 ? "var(--ke-color-on-interactive, var(--text-on-accent))" : "var(--ke-color-text, var(--text-normal))") + "; box-shadow: none;"
                    }
                  });
                  if (index === 0) this.selectedReason = reason;
                  chip.onclick = (e) => {
                    e.preventDefault();
                    this.selectedReason = reason;
                    chipButtons.forEach((b) => {
                      const isActive = b === chip;
                      b.classList.toggle("is-active", isActive);
                      b.style.background = isActive
                        ? "var(--ke-color-interactive, var(--interactive-accent))"
                        : "var(--ke-color-surface-secondary, var(--background-secondary))";
                      b.style.color = isActive
                        ? "var(--ke-color-on-interactive, var(--text-on-accent))"
                        : "var(--ke-color-text, var(--text-normal))";
                      b.style.borderColor = isActive
                        ? "var(--ke-color-interactive, var(--interactive-accent))"
                        : "var(--ke-color-border, var(--background-modifier-border))";
                    });
                  };
                  chipButtons.push(chip);
                });

                const noteContainer = contentEl.createDiv({
                  attr: { style: "margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px;" }
                });
                noteContainer.createEl("label", {
                  text: "추가 메모 (선택)",
                  attr: { style: "font-size: 0.82rem; font-weight: 600; color: var(--ke-color-muted, var(--text-muted));" }
                });

                const noteInput = noteContainer.createEl("textarea", {
                  attr: {
                    placeholder: placeholderText + "을 입력하세요",
                    rows: "3",
                    style: "width: 100%; box-sizing: border-box; min-height: 72px; padding: 10px 12px; border-radius: var(--ke-radius-control, 8px); border: 1px solid var(--ke-color-border, var(--background-modifier-border)); font-size: 0.88rem; color: var(--ke-color-text, var(--text-normal)); background: var(--ke-color-surface-secondary, var(--background-secondary)); resize: vertical; font-family: inherit;"
                  }
                });

                if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
                const btnRow = contentEl.createDiv({
                  attr: { class: "prodigy-btn-row", style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; border-top: 1px solid var(--ke-color-border, var(--background-modifier-border)); padding-top: 16px;" }
                });

                const cancelBtn = window.ProdigyUI
                  ? window.ProdigyUI.button(btnRow, "취소", { onClick: () => this.close() })
                  : btnRow.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
                if (!window.ProdigyUI) cancelBtn.onclick = () => this.close();

                const saveBtn = window.ProdigyUI
                  ? window.ProdigyUI.button(btnRow, "저장 및 상태 변경", { primary: true })
                  : btnRow.createEl("button", { text: "저장 및 상태 변경", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });

                saveBtn.onclick = () => {
                  if (!this.selectedReason) {
                    new Notice("이유를 선택해주세요.");
                    return;
                  }
                  this.onSave(this.selectedReason, noteInput.value.trim());
                  this.close();
                };
              }
              onClose() {
                this.contentEl.empty();
              }
            }

            new DecisionCaptureModal(app, opt.key, async (reason, note) => {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              const tFile = app.vault.getAbstractFileByPath(p.file.path);
              if (tFile) {
                const todayStr = new Date().toISOString().split('T')[0];

                // 1. Update frontmatter
                await app.fileManager.processFrontMatter(tFile, (fm) => {
                  fm.status = opt.key;
                  fm.decision_reason = reason;
                  fm.decision_date = todayStr;
                  fm.updated = todayStr;
                  fm.my_opinion = note || "";

                 if (opt.key === 'won' || opt.key === 'lost') {
                   if (actualBid) fm.my_bid_price = Number(actualBid) || actualBid;
                 }
                });
                await window.AuctionDashboardRefresh?.refresh(app, tFile);

                let content = await app.vault.read(tFile);
                let decisionHeader = "# Investment Decision";
                let decisionIndex = content.indexOf(decisionHeader);
                if (decisionIndex === -1) {
                  decisionHeader = "# Decision";
                  decisionIndex = content.indexOf(decisionHeader);
                }
                if (decisionIndex !== -1) {
                  const nextH1Match = content.slice(decisionIndex + decisionHeader.length).match(/\n#[^#\n]/);
                  let endIndex = content.length;
                  if (nextH1Match) {
                    endIndex = decisionIndex + decisionHeader.length + nextH1Match.index + 1;
                  }
                  const section = content.slice(decisionIndex, endIndex);
                  const separator = /\n---[ \t]*\n?$/.exec(section);
                  const insertAt = separator ? decisionIndex + separator.index : endIndex;
                  const safeNote = String(note || "-").replace(/[\r\n]+/g, " ").trim() || "-";
                  const entry = [
                    "",
                    `### ${todayStr} · ${display.status(opt.key)}`,
                    "",
                    `- ${display.property("decision_reason")}: ${reason}`,
                    `- ${display.property("my_opinion")}: ${safeNote}`,
                    ""
                  ].join("\n");
                  const updatedContent = content.slice(0, insertAt).trimEnd() + "\n" + entry + content.slice(insertAt);
                  await app.vault.modify(tFile, updatedContent);
                }

                new Notice(`결정 내용이 성공적으로 포착되고 기록되었습니다.`);
              }
            }).open();
            return;
          } else {
            // Normal status update flow (for other statuses like reviewing, archived, etc.)
            btn.disabled = true;
            btn.style.opacity = '0.5';
            const tFile = app.vault.getAbstractFileByPath(p.file.path);
            if (tFile) {
              await app.fileManager.processFrontMatter(tFile, (fm) => {
                fm.status = opt.key;
                fm.updated = new Date().toISOString().split('T')[0];
              });
              await window.AuctionDashboardRefresh?.refresh(app, tFile);
              new Notice(`상태가 ${opt.label}(으)로 변경되었습니다.`);
            }
          }
        }
      });
      
      if (p.status === "bidding" && window.openAuctionSiteVisit) {
        const state = window.prodigySiteVisitStateByPath?.[p.file.path];
        const summary = window.prodigySiteVisitSummaryByPath?.[p.file.path];
        const progress = window.prodigySiteVisit?.progress(state);
        const meaningful = window.prodigySiteVisit?.hasMeaningfulEvidence(state);
        const label = summary?.status === "recorded"
          ? "현장 기록"
          : summary || meaningful || (progress && progress.done > 0)
            ? "현장 메모"
            : "현장 방문";
        const siteVisitButton = window.ProdigyUI
          ? window.ProdigyUI.button(buttonContainer, label, { chip: true, primary: true })
          : buttonContainer.createEl('button', {
            text: label,
            attr: {
              type: 'button',
              class: 'prodigy-btn prodigy-btn-chip prodigy-btn-primary',
              'data-site-visit-path': p.file.path
            }
          });
        siteVisitButton.setAttribute('data-site-visit-path', p.file.path);
        siteVisitButton.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.openAuctionSiteVisit(p);
        };
      }
    }
  } catch (e) {
    console.error("Auction card error:", e);
    new Notice("경매 카드 오류: " + e.message + "\n" + e.stack, 15000);
  }
};

if (!window.prodigySiteVisitCardListener) {
  window.prodigySiteVisitCardListener = (event) => {
    const path = event.detail?.path;
    const state = event.detail?.state;
    const record = event.detail?.record;
    if (!path || !state) return;
    window.prodigySiteVisitSummaryByPath = window.prodigySiteVisitSummaryByPath || {};
    if (record) window.prodigySiteVisitSummaryByPath[path] = record;
    else delete window.prodigySiteVisitSummaryByPath[path];
    const progress = window.prodigySiteVisit?.progress(state);
    const meaningful = window.prodigySiteVisit?.hasMeaningfulEvidence(state);
    const label = record?.status === "recorded" ? "현장 기록" : record || meaningful || (progress && progress.done > 0)
      ? "현장 메모" : "현장 방문";
    const buttons = document.querySelectorAll("[data-site-visit-path]");
    for (const button of Array.from(buttons)) {
      if (button.getAttribute("data-site-visit-path") === path) button.textContent = label;
    }
  };
  window.addEventListener("prodigy-site-visit-updated", window.prodigySiteVisitCardListener);
}
