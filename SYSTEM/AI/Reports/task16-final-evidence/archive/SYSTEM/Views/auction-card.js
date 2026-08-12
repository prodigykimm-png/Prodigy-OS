function ensureAuctionCardStyles() {
  if (window.ProdigyUI && typeof window.ProdigyUI.ensureStyles === "function") window.ProdigyUI.ensureStyles();
  if (!window.document
    || !window.document.head
    || typeof window.document.getElementById !== "function"
    || typeof window.document.createElement !== "function") return;
  const styleId = "prodigy-auction-card-local-styles";
  let style = window.document.getElementById(styleId);
  if (!style) {
    style = window.document.createElement("style");
    style.id = styleId;
    window.document.head.appendChild(style);
  }
  style.textContent = `
.auction-card {
  display: flex;
  flex-direction: column;
  gap: var(--ke-space-2, 4px);
  min-inline-size: 0;
  box-sizing: border-box;
  margin-block-end: var(--ke-space-3, 8px);
  padding: var(--ke-space-3, 8px) var(--ke-space-4, 12px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-inline-start-width: var(--ke-space-2, 4px);
  border-radius: var(--ke-radius-panel, 8px);
  background: var(--ke-color-surface-secondary, var(--background-secondary));
  color: var(--ke-color-text, var(--text-normal));
  overflow-wrap: anywhere;
}
.auction-card *,
.auction-card *::before,
.auction-card *::after { box-sizing: border-box; min-inline-size: 0; }
.auction-card-title-row,
.auction-card-title-wrap,
.auction-card-badges,
.auction-card-detail-row {
  display: flex;
  align-items: center;
  min-inline-size: 0;
}
.auction-card-title-row {
  justify-content: space-between;
  gap: var(--ke-space-3, 8px);
  inline-size: 100%;
}
.auction-card-title-wrap {
  gap: var(--ke-space-2, 4px);
  max-inline-size: 70%;
  overflow: hidden;
}
.auction-card-title-link {
  min-inline-size: 0;
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-body, .84rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  text-decoration: none;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.auction-card-title-link:hover { text-decoration: underline; }
.auction-card-delete {
  flex: 0 0 auto;
  padding-inline: var(--ke-space-2, 4px) !important;
  color: var(--text-muted) !important;
}
.auction-card-badges {
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ke-space-1, 2px);
}
.auction-card-dday,
.auction-card-external-link {
  display: inline-flex;
  align-items: center;
  padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
  border: 1px solid var(--ke-color-border, var(--background-modifier-border));
  border-radius: var(--ke-radius-control, 4px);
  font-size: var(--ke-type-chrome, .68rem);
  font-weight: 700;
  line-height: var(--ke-leading-control, 1.35);
  overflow-wrap: anywhere;
}
.auction-card-dday { min-block-size: var(--ke-space-5, 16px); color: var(--ke-color-text, var(--text-normal)); background: var(--ke-color-hover, var(--background-modifier-hover)); }
.auction-card-dday.is-urgent { border-width: 2px; font-weight: 800; }
.auction-card-external-link { min-block-size: var(--ke-touch-target, 44px); text-decoration: none; cursor: pointer; }
.auction-card-external-link[data-source="naver"] { background: color-mix(in srgb, var(--text-accent) 12%, var(--background-primary)); }
.auction-card-external-link[data-source="cafe"] { background: color-mix(in srgb, var(--text-accent) 12%, var(--background-primary)); }
.auction-card-detail-row {
  flex-wrap: wrap;
  gap: var(--ke-space-2, 4px);
  margin-block-start: var(--ke-space-1, 2px);
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-label, .72rem);
  line-height: var(--ke-leading-body, 1.45);
}
.auction-card-finance-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ke-space-2, 4px) var(--ke-space-3, 8px);
  margin-block-start: var(--ke-space-1, 2px);
  color: var(--ke-color-text, var(--text-normal));
  font-size: var(--ke-type-label, .72rem);
  line-height: var(--ke-leading-body, 1.45);
}
.auction-card-finance-note {
  color: var(--ke-color-muted, var(--text-muted));
  font-size: var(--ke-type-chrome, .68rem);
  line-height: var(--ke-leading-control, 1.35);
  overflow-wrap: anywhere;
}
.auction-card-detail-row strong,
.auction-card-property-name { color: var(--ke-color-text, var(--text-normal)); font-weight: 700; }
.auction-card-separator { color: var(--ke-color-border, var(--background-modifier-border)); }
.auction-region-inline-actions { display: inline-flex; align-items: center; gap: var(--ke-space-1, 2px); }
.auction-region-inline-action {
  min-block-size: var(--ke-touch-target, 44px);
  padding-inline: var(--ke-space-1, 2px);
  border: 0;
  background: transparent;
  color: var(--ke-color-accent, var(--text-accent));
  font: inherit;
  text-decoration: underline;
  text-underline-offset: var(--ke-space-1, 2px);
  cursor: pointer;
}
.auction-card-price-pair { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ke-space-1, 2px); min-inline-size: 0; }
.auction-card-inline-editable {
  padding-inline: var(--ke-space-1, 2px);
  border-radius: var(--ke-radius-control, 4px);
  cursor: pointer;
  overflow-wrap: anywhere;
}
.auction-card-inline-editable:hover,
.auction-card-inline-editable:focus-visible { background: var(--ke-color-hover, var(--background-modifier-hover)); }
.auction-card-inline-editable:focus-visible,
.auction-card a:focus-visible,
.auction-card button:focus-visible,
.auction-card [role="button"]:focus-visible {
  outline: 2px solid var(--ke-color-accent, var(--text-accent));
  outline-offset: 2px;
}
.auction-card-accent-value { color: var(--ke-color-accent, var(--text-accent)); }
.auction-card-profit-positive { font-weight: 700; }
.auction-card-profit-negative { font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.auction-card-profit-neutral { color: var(--text-muted); }
.auction-card-decision,
.auction-card-opinion,
.auction-card-memo { min-inline-size: 0; color: var(--ke-color-text, var(--text-normal)); font-size: var(--ke-type-label, .72rem); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
.auction-card-decision { margin-block-start: var(--ke-space-1, 2px); }
.auction-card-opinion { margin-block-start: var(--ke-space-1, 2px); padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px); cursor: pointer; border-radius: var(--ke-radius-control, 4px); }
.auction-card-memo { margin-block-start: var(--ke-space-1, 2px); padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px); }
.auction-card-memo-body { margin-block-start: var(--ke-space-1, 2px); padding-block-start: var(--ke-space-2, 4px); border-block-start: 1px dashed var(--ke-color-border, var(--background-modifier-border)); }
.auction-card-memo-secondary { margin-block-start: var(--ke-space-1, 2px); color: var(--ke-color-muted, var(--text-muted)); }
.auction-card-modal-title { margin: 0 0 var(--ke-space-3, 8px); font-size: var(--ke-type-title, 1.05rem); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
.auction-card-profit-modal-title { margin: 0 0 var(--ke-space-4, 12px); font-size: var(--ke-type-title, 1.05rem); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
.auction-card-modal-question { margin-block-end: var(--ke-space-3, 8px); color: var(--ke-color-muted, var(--text-muted)); font-size: var(--ke-type-body, .84rem); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
.auction-card-modal-reasons { display: flex; flex-direction: column; gap: var(--ke-space-2, 4px); margin-block-end: var(--ke-space-4, 12px); }
.auction-card-modal-reason { display: flex; align-items: center; gap: var(--ke-space-2, 4px); min-block-size: var(--ke-touch-target, 44px); cursor: pointer; font-size: var(--ke-type-body, .84rem); }
.auction-card-modal-note { display: flex; flex-direction: column; gap: var(--ke-space-2, 4px); margin-block-end: var(--ke-space-4, 12px); }
.auction-card-modal-note textarea { inline-size: 100%; min-block-size: var(--ke-touch-target, 44px); padding: var(--ke-space-2, 4px); border: 1px solid var(--ke-color-border, var(--background-modifier-border)); border-radius: var(--ke-radius-control, 4px); background: var(--ke-color-surface, var(--background-primary)); color: var(--ke-color-text, var(--text-normal)); font: inherit; resize: vertical; overflow-wrap: anywhere; }
.auction-card-modal-status { min-block-size: var(--ke-leading-body, 1.45em); margin: 0 0 var(--ke-space-3, 8px); color: var(--ke-color-muted, var(--text-muted)); font-size: var(--ke-type-label, .72rem); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
.auction-card-modal-actions { justify-content: flex-end; }
.auction-card-separator.is-mobile-hidden { display: none; }
.auction-card button:active,
.auction-card [role="button"]:active { transform: scale(.95); }
@media (forced-colors: active) {
  .auction-card:focus,
  .auction-card a:focus-visible,
  .auction-card button:focus-visible,
  .auction-card [role="button"]:focus-visible { outline: 2px solid CanvasText; }
}
@media (prefers-reduced-motion: reduce) {
  .auction-card *,
  .auction-card *::before,
  .auction-card *::after { transition: none !important; animation: none !important; }
}
`;
}

function makeAuctionCardInteractive(element, label) {
  if (!element || typeof element.setAttribute !== "function") return element;
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", label);
  if (typeof element.addEventListener === "function") {
    element.addEventListener("keydown", (event) => {
      if (!event || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      if (typeof element.click === "function") element.click();
    });
  }
  return element;
}

window.renderAuctionCard = function(p, container, options) {
  try {
    ensureAuctionCardStyles();
    const T = window.ProdigyTokens || {};
    const display = window.prodigyDisplay;
    if (!display) throw new Error("표시 Registry가 로드되지 않았습니다.");
    const parser = window.parsePrice || Number;
    const statusInfo = display.statusInfo(p.status);
    
    const card = container.createEl('div', {
      attr: {
        class: 'auction-card',
        'data-auction-path': (p.file && p.file.path) || p.path || '',
        'data-auction-status': p.status || '',
        'aria-label': `${statusInfo.label || p.status || "미지정"} 경매 카드`,
        tabindex: '-1'
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
      const valueClass = man > 0 ? "auction-card-profit-positive" : man < 0 ? "auction-card-profit-negative" : "auction-card-profit-neutral";
      return `<span class="${valueClass}"><strong>${sign}${man.toLocaleString()}만</strong></span> <span class="auction-card-finance-note">(${Math.round(loanRatio*100)}%대출, ${(interestRate*100).toFixed(1)}%금리)</span>`;
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

    // Calculate D-Day first
    let ddayStr = "-";
    let isUrgent = false;
    let isAuctionToday = false;
    let isAuctionEnded = false;
    let dateStr = "-";
    if (p.auction_datetime) {
      let isoDate = "";
      const val = p.auction_datetime;
      if (typeof val === "object" && typeof val.toISODate === "function") {
        isoDate = val.toISODate();
      } else {
        const str = String(val).trim();
        const match = str.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
        if (match) {
          isoDate = `${match[1]}-${match[2]}-${match[3]}`;
        }
      }
      if (isoDate) {
        const targetDate = new Date(isoDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        targetDate.setHours(0,0,0,0);
        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const mdStr = isoDate.slice(5).replace("-", "/"); // e.g., "07/16"
        
        if (diffDays === 0) {
          ddayStr = `${mdStr} (오늘)`;
          isUrgent = true;
          isAuctionToday = true;
        } else if (diffDays > 0) {
          ddayStr = `${mdStr} (D-${diffDays})`;
          if (diffDays <= 3) isUrgent = true;
        } else {
          ddayStr = "종료(경매일 기준)";
          isAuctionEnded = true;
        }
        
        dateStr = isoDate;
      }
    }
    const isClosedWatching = p.status === "watching"
      && (isAuctionEnded || hasRecordedValue(p.winning_bid_price));
    if (isClosedWatching) {
      ddayStr = "종료(경매일 기준)";
      isUrgent = false;
      isAuctionToday = false;
    }

    const responsiveBreakpoints = T.BREAKPOINTS || {};
    const requestedWidth = options && options.logicalWidth;
    const logicalWidth = Number.isFinite(requestedWidth) && requestedWidth > 0
      ? requestedWidth
      : responsiveBreakpoints.wide;
    const isMobile = Number.isFinite(logicalWidth) && Number.isFinite(responsiveBreakpoints.medium)
      ? logicalWidth < responsiveBreakpoints.medium
      : false;

    // -------------------------------------------------------------
    // Header & Meta Information Block (Highly Structured & Mobile Responsive)
    // -------------------------------------------------------------
    const naverLink = p.source && p.source.naver && p.source.naver !== "정보 없음" && String(p.source.naver).startsWith("http") ? p.source.naver : null;
    const cafeLink = p.source && p.source.cafe && p.source.cafe !== "정보 없음" && String(p.source.cafe).startsWith("http") ? p.source.cafe : null;

    // Line 1: Title (Case Number + Property name) and Status/Links Badge Group
    const titleRow = card.createEl('div', {
      attr: { class: 'auction-card-title-row' }
    });
    const leftContainer = titleRow.createEl('div', {
      attr: { class: 'auction-card-title-wrap' }
    });
    const displayCase = p.case_number || p.file.name.replace(/\.md$/, '');
    const displayTitle = getPropertyName(p.address);
    const fullTitleText = displayCase;
    const titleLink = leftContainer.createEl('a', {
      text: fullTitleText,
      attr: {
        class: 'internal-link auction-card-title-link',
        title: '클릭하여 사건 노트를 엽니다.',
        'aria-label': `${displayCase} 사건 노트 열기`
      }
    });
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
          title: '이 사건의 입찰표를 엽니다.',
          'aria-label': `${displayCase} 입찰표 열기`
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

    const deleteLabel = `${displayCase} 사건 노트 삭제`;
    const deleteBtn = window.ProdigyUI && typeof window.ProdigyUI.button === "function"
      ? window.ProdigyUI.button(leftContainer, "삭제", { quiet: true, className: "auction-card-delete", title: "이 사건 노트를 삭제(휴지통 이동)합니다." })
      : leftContainer.createEl('button', {
        text: "삭제",
        attr: {
          type: "button",
          class: "prodigy-btn prodigy-btn-quiet auction-card-delete",
          title: "이 사건 노트를 삭제(휴지통 이동)합니다."
        }
      });
    if (typeof deleteBtn.setAttribute === "function") deleteBtn.setAttribute("aria-label", deleteLabel);
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

    const rightBadges = titleRow.createEl('div', {
      attr: { class: 'auction-card-badges' }
    });
    // D-Day Badge
    if (ddayStr !== "-") {
      rightBadges.createEl('span', {
        text: ddayStr,
        attr: { class: `auction-card-dday${isUrgent ? " is-urgent" : ""}` }
      });
    }
    // Naver Link
    if (naverLink) {
      const naver = rightBadges.createEl('a', {
        text: '네이버',
        href: naverLink,
        attr: {
          class: 'prodigy-btn auction-card-external-link',
          'data-source': 'naver',
          title: '네이버 부동산 바로가기',
          'aria-label': '네이버 부동산 바로가기'
        }
      });
    }
    // Cafe Link
    if (cafeLink) {
      const cafe = rightBadges.createEl('a', {
        text: '카페',
        href: cafeLink,
        attr: {
          class: 'prodigy-btn auction-card-external-link',
          'data-source': 'cafe',
          title: '카페 바로가기',
          'aria-label': '카페 바로가기'
        }
      });
    }

    // Line 2: Location & Type & Property Name
    const regionText = window.AuctionRegionCore?.regionDisplay
      ? window.AuctionRegionCore.regionDisplay(p)
      : [p.region_sido, p.region_sigungu, p.region_dong]
        .map((value) => String(value == null ? "" : value).trim())
        .filter(Boolean)
        .join(" ") || "지역 미정";

    const detailRow1 = card.createEl('div', {
      attr: { class: 'auction-card-detail-row' }
    });
    detailRow1.createEl('span', { text: `지역 ${regionText}` });
    const hasRegionDecision = Boolean(window.AuctionRegionPacket);
    const regionActions = hasRegionDecision
      ? detailRow1.createEl('span', {
          attr: { class: 'auction-region-inline-actions' }
        })
      : null;
    if (hasRegionDecision) {
      const regionBtn = regionActions.createEl('button', {
        text: '판단 보드',
        attr: {
          type: 'button',
          class: 'auction-region-inline-action',
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
    detailRow1.createEl('span', { text: '·', attr: { class: 'auction-card-separator' } });
    detailRow1.createEl('span', { text: p.property_type || "용도 미정" });
    if (displayTitle && displayTitle !== "물건명 미지정") {
      detailRow1.createEl('span', { text: '·', attr: { class: 'auction-card-separator' } });
      detailRow1.createEl('span', { text: `건물명 ${displayTitle}`, attr: { class: 'auction-card-property-name' } });
    }
    // Line 3: Court & Date
    const detailRow2 = card.createEl('div', {
      attr: { class: 'auction-card-detail-row' }
    });
    let hasCourtOrDate = false;
    if (p.court) {
      detailRow2.createEl('span', { text: p.court, attr: { class: 'auction-card-property-name' } });
      hasCourtOrDate = true;
    }
    if (p.auction_datetime) {
      if (hasCourtOrDate) {
        detailRow2.createEl('span', { text: '·', attr: { class: 'auction-card-separator' } });
      }
      detailRow2.createEl('span', { text: `경매일 ${dateStr}` });
    }
    
    // Finance Row
    const financeRow = card.createEl('div', {
      attr: { class: 'auction-card-finance-row' }
    });
    
    let minRateStr = "";
    if (!isClosedWatching && p.appraisal_price && p.minimum_bid && p.appraisal_price !== "정보 없음" && p.minimum_bid !== "정보 없음") {
      const appraisal = parser(p.appraisal_price);
      const minimum = parser(p.minimum_bid);
      if (!isNaN(appraisal) && !isNaN(minimum) && isFinite(appraisal) && isFinite(minimum) && appraisal > 0) {
        minRateStr = ` (${(minimum / appraisal * 100).toFixed(0)}%)`;
      }
    }

    const priceProjection = window.AuctionCardPriceProjection
      ? window.AuctionCardPriceProjection.project(p, { isEnded: isAuctionEnded })
      : { left: { key: "minimum_bid", label: "최저가", value: p.minimum_bid }, right: { key: "expected_bid", label: "입찰 예정가", value: p.expected_bid } };
   const formatProjectedPrice = (entry) => {
     const isTerminal = ["won", "lost", "skipped", "reviewing", "archived"].includes(p.status);
     const precise = (p.status === "bidding" && isAuctionToday) || isTerminal;
     const value = precise ? toWon(entry.value) : toEok(entry.value);
     return `${entry.label}: <strong title="${toWon(entry.value)}">${value}</strong>`;
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
      attr: { class: 'auction-card-price-pair' }
    });
    const minEl = pricePair.createEl('div', { attr: { class: 'auction-card-result-price' } });
    minEl.innerHTML = `${formatProjectedPrice(priceProjection.left)}${priceProjection.left.key === "minimum_bid" ? minRateStr : ""}`;
    // Terminal cards: make left price (my_bid / expected_bid) clickable to edit
    const terminalLeftEditable = ["won", "lost", "skipped", "reviewing"].includes(p.status)
      && (priceProjection.left.key === "my_bid_price" || priceProjection.left.key === "expected_bid");
    if (terminalLeftEditable) {
      minEl.className = "auction-card-result-price auction-card-inline-editable";
      minEl.title = `${priceProjection.left.label} 수정`;
      makeAuctionCardInteractive(minEl, `${priceProjection.left.label} 수정`);
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

  pricePair.createEl('span', { text: '→', attr: { class: 'auction-card-separator' } });
   const expectedBidEditable = priceProjection.right.key === "expected_bid" && ["watching", "bidding"].includes(p.status);
   const expEl = pricePair.createEl('div', {
     attr: {
       class: `auction-card-result-price${expectedBidEditable ? " auction-card-inline-editable" : ""}`,
       title: expectedBidEditable ? `${priceProjection.right.label} 수정` : ''
     }
   });
   if (expectedBidEditable) makeAuctionCardInteractive(expEl, `${priceProjection.right.label} 수정`);
    
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
       attr: {
         class: 'auction-card-inline-editable',
         title: `보증금: ${toWon(deposit)} (최저가 ÷ 10) — 클릭하여 수정`
       }
     });
     makeAuctionCardInteractive(depositEl, `보증금 ${depositStr} 수정`);
     depositEl.innerHTML = `보증금: <strong class="auction-card-accent-value">${depositStr}</strong>`;
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
      priceGroup.createEl('span', { text: '·', attr: { class: `auction-card-finance-separator${isMobile ? " is-mobile-hidden" : ""}` } });
    }
  }

   const isTerminalStatus = ["won", "lost", "skipped"].includes(p.status);
   const hasExitPrice = hasRecordedValue(p.exit_price);
   const profitInfo = !isTerminalStatus ? calcMonthlyProfit(p, priceProjection.left.value) : null;
   let spreadInfo = null;
   if (!isTerminalStatus && hasExitPrice && hasRecordedValue(priceProjection.left.value)) {
     const exit = parser(p.exit_price);
     const acquisition = parser(priceProjection.left.value);
     if (!isNaN(exit) && !isNaN(acquisition) && isFinite(exit) && isFinite(acquisition)) {
      const diff = exit - acquisition;
        spreadInfo = {
          value: toEok(diff),
          tone: diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral"
        };
     }
   }
   const incomeGroup = hasExitPrice || spreadInfo || profitInfo
     ? financeRow.createEl('div', {
         attr: { class: 'auction-card-finance-group auction-card-finance-group-income', 'aria-label': '수익 분석' }
       })
     : null;
   if (incomeGroup) {
     incomeGroup.createEl('span', { text: '수익 분석', attr: { class: 'auction-card-finance-label' } });
   }

   if (hasExitPrice && incomeGroup) {
    const exitEl = incomeGroup.createEl('div', {
      attr: {
        class: 'auction-card-inline-editable',
        title: `${display.property("exit_price")} 수정`
      }
    });
    makeAuctionCardInteractive(exitEl, `${display.property("exit_price")} 수정`);
    const exitValueClass = p.exit_price && p.exit_price !== "정보 없음" ? "auction-card-accent-value" : "";
    const exitDisplay = ["won", "lost", "skipped"].includes(p.status) ? toWon(p.exit_price) : toEok(p.exit_price);
    exitEl.innerHTML = `${display.property("exit_price")}: <strong class="${exitValueClass}">${exitDisplay}</strong>`;
    exitEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentExit = p.exit_price || "";
      const newExit = await window.obsidianPrompt(
        `[${p.case_number || p.file.name}] ${display.property("exit_price")} 수정`,
        `${display.property("exit_price")}를 입력해주세요 (원 단위, 예: 220000000):`,
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
        new Notice("매도 목표가가 업데이트되었습니다.");
      }
    });
    
   }
   
   // 차익·월수익: 터미널 상태(won/lost/skipped)에서는 숨김
   if (!isTerminalStatus && incomeGroup && (spreadInfo || profitInfo)) {
    if (spreadInfo) {
      const diffEl = incomeGroup.createEl('div');
      diffEl.innerHTML = `차익: <strong class="auction-card-profit-${spreadInfo.tone}">${spreadInfo.value}</strong>`;
    }

    if (spreadInfo && profitInfo) {
      incomeGroup.createEl('span', { text: '·', attr: { class: `auction-card-finance-separator${isMobile ? " is-mobile-hidden" : ""}` } });
    }

    if (profitInfo) {
      const profitEl = incomeGroup.createEl('div', {
        attr: {
          class: 'auction-card-inline-editable',
          title: '클릭하여 예상 월세, 대출비율, 이율을 수정합니다.'
        }
      });
      makeAuctionCardInteractive(profitEl, '예상 월세, 대출비율, 이율 수정');

    profitEl.innerHTML = `월수익: ${formatProfit(profitInfo)}`;

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
          contentEl.createEl("h3", { text: `[${p.case_number || p.file.name}] 월수익 계산 정보 수정`, attr: { class: "auction-card-profit-modal-title" } });
          
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
     }
   } // end if (!isTerminalStatus) — 차익·월수익 hidden for terminal cards
    
   if (["won", "lost", "skipped"].includes(p.status)) {
      const decisionEl = card.createEl('div', {
        attr: { class: 'auction-card-decision' }
      });
      
      const reason = p.decision_reason || "미지정";
      const decisionLabel = typeof display.status === "function" ? display.status(p.status) : p.status;
      decisionEl.createEl('span', { text: `${decisionLabel} · ` });
      decisionEl.createEl('strong', {
        text: `${display.property("decision_reason")}:`,
        attr: { class: 'auction-card-accent-value' }
      });
      decisionEl.createSpan({ text: ` ${reason}` });
    }
    
    // Opinion Row (Clickable)
    const opinionEl = card.createEl('div', {
      attr: {
        class: 'auction-card-opinion',
        title: `${display.property("my_opinion")} 수정`
      }
    });
    makeAuctionCardInteractive(opinionEl, `${display.property("my_opinion")} 수정`);
    
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
      attr: { class: 'auction-card-accent-value' }
    });
    opinionEl.createSpan({
      text: isValid(myOpinion) ? ` ${String(myOpinion).trim()}` : ' 의견 없음 (클릭하여 입력...)',
      attr: isValid(myOpinion) ? {} : { class: 'auction-card-finance-note' }
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

    // Reference Memo Row (Not Clickable, below opinionEl)
    const memoEl = card.createEl('div', {
      attr: { class: 'auction-card-memo' }
    });
    const userText = isValid(userNote) ? String(userNote).trim() : "";
    const recText = isValid(recNote) ? String(recNote).trim() : "";
    if (userText || recText) {
      const memoBody = memoEl.createEl('div', {
        attr: { class: 'auction-card-memo-body' }
      });
      const primaryMemo = memoBody.createEl('div');
      primaryMemo.createEl('strong', {
        text: '참고사항:',
        attr: { class: 'auction-card-accent-value' }
      });
      primaryMemo.createSpan({ text: ` ${userText || recText}` });
      if (userText && recText) {
        memoBody.createEl('div', {
          text: recText,
          attr: { class: 'auction-card-memo-secondary' }
        });
      }
    } else {
      memoEl.hidden = true;
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
        return { key, label: shortLabel };
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
                class: 'prodigy-card-actions auction-card-actions is-compact'
              }
            })
          };
      if (!actionLayout.actionHost) actionLayout.actionHost = actionLayout.row;
      const buttonContainer = actionLayout.actionHost;

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

      if (buttons.length > 0) {
        buttonContainer.createEl('span', {
          text: '다음 행동',
          attr: { class: 'auction-card-next-action-label' }
        });
      }

      buttons.forEach(opt => {
        const actionLabel = `${displayCase} ${opt.label}`;
        const btn = window.ProdigyUI
          ? window.ProdigyUI.button(buttonContainer, opt.label, { chip: true, title: actionLabel })
          : buttonContainer.createEl('button', {
            text: opt.label,
            attr: { type: 'button', class: 'prodigy-btn prodigy-btn-chip', title: actionLabel }
          });
        if (typeof btn.setAttribute === "function") btn.setAttribute("aria-label", actionLabel);
        
        btn.onclick = async (e) => {
          e.preventDefault();
          
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
              constructor(appInstance, statusKey, onSave, onSettled) {
                super(appInstance);
                this.statusKey = statusKey;
                this.onSave = onSave;
                this.onSettled = onSettled;
                this.selectedReason = "";
                this.pending = false;
                this._closeGuarded = false;
              }
              setStatus(message, role = "status") {
                if (!this.statusEl) return;
                if (typeof this.statusEl.setText === "function") this.statusEl.setText(message);
                else this.statusEl.textContent = message;
                if (typeof this.statusEl.setAttr === "function") this.statusEl.setAttr("role", role);
                else if (typeof this.statusEl.setAttribute === "function") this.statusEl.setAttribute("role", role);
              }
              onOpen() {
                const { contentEl } = this;
                contentEl.empty();
                if (!this._closeGuarded) {
                  const close = this.close.bind(this);
                  this.close = (...args) => {
                    if (this.pending) return;
                    return close(...args);
                  };
                  this._closeGuarded = true;
                }

                let title = "";
                let question = "";
                let reasons = [];
                let placeholderText = "";

                if (this.statusKey === 'won') {
                  title = "낙찰";
                  question = "이번 입찰의 핵심 이유는 무엇인가?";
                  reasons = ["수익성 우수", "시세 대비 저렴", "희소성", "장기 투자", "기타"];
                  placeholderText = "입찰 판단 메모";
                } else if (this.statusKey === 'lost') {
                  title = "패찰";
                  question = "패찰 원인은 무엇인가?";
                  reasons = ["경쟁 과열", "예상가 부족", "전략적 패찰", "기타"];
                  placeholderText = "패찰 메모";
                } else if (this.statusKey === 'skipped') {
                  title = "입찰 포기";
                  question = "입찰을 포기한 이유는 무엇인가?";
                  reasons = ["수익성 부족", "권리 문제", "임장 결과", "자금 부족", "전략적 포기", "기타"];
                  placeholderText = "포기 메모";
                }

                contentEl.createEl("h3", { text: title, attr: { class: "auction-card-modal-title" } });
                contentEl.createEl("p", { text: question, attr: { class: "auction-card-modal-question" } });
                const reasonsContainer = contentEl.createEl("div", {
                  attr: { class: "auction-card-modal-reasons" }
                });
                reasons.forEach((reason, index) => {
                  const label = reasonsContainer.createEl("label", {
                    attr: { class: "auction-card-modal-reason" }
                  });
                  const radio = label.createEl("input", {
                    attr: { type: "radio", name: "decision_reason", value: reason }
                  });
                  if (index === 0) {
                    radio.checked = true;
                    this.selectedReason = reason;
                  }
                  radio.onchange = () => {
                    if (radio.checked) this.selectedReason = reason;
                  };
                  label.createEl("span", { text: reason });
                });
                const noteContainer = contentEl.createEl("div", {
                  attr: { class: "auction-card-modal-note" }
                });
                const noteInput = noteContainer.createEl("textarea", {
                  attr: {
                    placeholder: placeholderText + " (선택)",
                    class: "auction-card-modal-textarea",
                    "aria-label": placeholderText + " (선택)"
                  }
                });
                this.statusEl = contentEl.createEl("p", {
                  text: "필수 이유를 선택하고 저장하세요.",
                  attr: { role: "status", "data-decision-status": "true", class: "auction-card-modal-status" }
                });
                if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
                const btnRow = contentEl.createEl("div", {
                  attr: { class: "prodigy-btn-row auction-card-modal-actions" }
                });

                const cancelBtn = window.ProdigyUI
                  ? window.ProdigyUI.button(btnRow, "취소", { onClick: () => this.close() })
                  : btnRow.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
                if (!window.ProdigyUI) cancelBtn.onclick = () => this.close();

                const saveBtn = window.ProdigyUI
                  ? window.ProdigyUI.button(btnRow, "저장", { primary: true })
                  : btnRow.createEl("button", { text: "저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });

                const setBusy = (busy) => {
                  this.pending = busy;
                  saveBtn.disabled = busy;
                  cancelBtn.disabled = busy;
                };
                saveBtn.onclick = async () => {
                  if (this.pending) return;
                  if (!this.selectedReason) {
                    this.setStatus("이유를 선택해주세요.", "alert");
                    new Notice("이유를 선택해주세요.");
                    return;
                  }
                  setBusy(true);
                  this.setStatus("결정 기록을 저장하는 중입니다...", "status");
                  try {
                    const receipt = await this.onSave(this.selectedReason, noteInput.value.trim());
                    if (!receipt || receipt.ok !== true) throw new Error("결정 기록 결과를 확인하지 못했습니다.");
                    this.lastReceipt = Object.freeze(receipt);
                    const resultLabel = receipt.result && typeof receipt.result === "object"
                      ? Object.keys(receipt.result).filter((key) => receipt.result[key]).join(" · ")
                      : "기록 완료";
                    this.setStatus(`저장 완료 · 원본 ${receipt.source || "경매 Object"} · 결과 ${resultLabel || "기록 완료"}`, "status");
                    new Notice(`결정 내용이 기록되었습니다. 원본: ${receipt.source || p.file.path} · 결과: ${resultLabel || "기록 완료"}`);
                    this.pending = false;
                    this.close();
                  } catch (error) {
                    this.setStatus(`저장하지 못했습니다. ${error && error.message ? error.message : String(error)} 다시 시도하세요.`, "alert");
                    new Notice(`결정 기록 실패: ${error && error.message ? error.message : String(error)}`);
                  } finally {
                    if (this.pending) setBusy(false);
                  }
                };
              }
              onClose() {
                this.contentEl.empty();
                this.statusEl = null;
                if (typeof this.onSettled === "function") this.onSettled();
              }
            }
            
            btn.disabled = true;
            new DecisionCaptureModal(app, opt.key, async (reason, note) => {
              const tFile = app.vault.getAbstractFileByPath(p.file.path);
              if (!tFile) throw new Error("경매 Object를 찾을 수 없습니다.");
              const todayStr = new Date().toISOString().split("T")[0];
              const originalContent = await app.vault.read(tFile);
              let decisionHeader = "# Investment Decision";
              let decisionIndex = originalContent.indexOf(decisionHeader);
              if (decisionIndex === -1) {
                decisionHeader = "# Decision";
                decisionIndex = originalContent.indexOf(decisionHeader);
              }
              if (decisionIndex === -1) {
                throw new Error("결정 기록에 필요한 '# Investment Decision' 또는 '# Decision' 제목이 없습니다.");
              }

              const nextH1Match = originalContent.slice(decisionIndex + decisionHeader.length).match(/\n#[^#\n]/);
              let endIndex = originalContent.length;
              if (nextH1Match) endIndex = decisionIndex + decisionHeader.length + nextH1Match.index + 1;
              const section = originalContent.slice(decisionIndex, endIndex);
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
              const updatedContent = originalContent.slice(0, insertAt).trimEnd() + "\n" + entry + originalContent.slice(insertAt);
              let bodyWritten = false;
              try {
                await app.vault.modify(tFile, updatedContent);
                bodyWritten = true;
                await app.fileManager.processFrontMatter(tFile, (fm) => {
                  fm.status = opt.key;
                  fm.decision_reason = reason;
                  fm.decision_date = todayStr;
                  fm.updated = todayStr;
                  fm.my_opinion = note || "";
                  if (opt.key === "won" || opt.key === "lost") {
                    if (actualBid) fm.my_bid_price = Number(actualBid) || actualBid;
                  }
                });
              } catch (error) {
                if (bodyWritten) {
                  try {
                    await app.vault.modify(tFile, originalContent);
                  } catch (rollbackError) {
                    error.message = `${error.message || String(error)} (본문 롤백 실패: ${rollbackError.message || String(rollbackError)})`;
                  }
                }
                throw error;
              }
              return {
                ok: true,
                source: p.file.path,
                result: { body: true, frontmatter: true, decision_header: decisionHeader }
              };
            }, () => {
              btn.disabled = false;
            }).open();
            return;
          } else {
            // Normal status update flow (for other statuses like reviewing, archived, etc.)
            btn.disabled = true;
            const tFile = app.vault.getAbstractFileByPath(p.file.path);
            if (tFile) {
              await app.fileManager.processFrontMatter(tFile, (fm) => {
                fm.status = opt.key;
                fm.updated = new Date().toISOString().split('T')[0];
              });
              new Notice(`상태가 ${opt.label}(으)로 변경되었습니다.`);
            }
          }
        }
      });
      
      if (p.status === "bidding" && window.openAuctionSiteVisit) {
        const state = window.prodigySiteVisitStateByPath?.[p.file.path];
        const progress = window.prodigySiteVisit?.progress(state);
        const complete = window.prodigySiteVisit?.isComplete(state);
        // Short labels keep this control on the same row as status chips on mobile.
        const label = complete
          ? "현장 완료"
          : progress && progress.done > 0
            ? `현장 ${progress.done}/${progress.total}`
            : "현장 방문";
        const siteVisitLabel = `${displayCase} ${label}`;
        const siteVisitButton = window.ProdigyUI
          ? window.ProdigyUI.button(buttonContainer, label, { chip: true, primary: true, title: siteVisitLabel })
          : buttonContainer.createEl('button', {
            text: label,
            attr: {
              type: 'button',
              class: 'prodigy-btn prodigy-btn-chip prodigy-btn-primary',
              'data-site-visit-path': p.file.path,
              'aria-label': siteVisitLabel,
              title: siteVisitLabel
            }
          });
        if (typeof siteVisitButton.setAttribute === "function") siteVisitButton.setAttribute("aria-label", siteVisitLabel);
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

window.ensureProdigySiteVisitCardListener = () => {
  if (!window.prodigySiteVisitCardListener) {
    window.prodigySiteVisitCardListener = (event) => {
      const path = event.detail?.path;
      const state = event.detail?.state;
      if (!path || !state) return;
      const progress = window.prodigySiteVisit?.progress(state);
      const complete = window.prodigySiteVisit?.isComplete(state);
      const label = complete ? "현장 방문 체크리스트 (완료)" : progress && progress.done > 0
        ? `현장 방문 체크리스트 (${progress.done} / ${progress.total})` : "현장 방문 체크리스트";
      const buttons = document.querySelectorAll("[data-site-visit-path]");
      for (const button of Array.from(buttons)) {
        if (button.getAttribute("data-site-visit-path") === path) button.textContent = label;
      }
    };
    window.addEventListener("prodigy-site-visit-updated", window.prodigySiteVisitCardListener);
  }
  return window.prodigySiteVisitCardListener;
};
window.disposeProdigySiteVisitCardListener = () => {
  if (!window.prodigySiteVisitCardListener) return false;
  window.removeEventListener("prodigy-site-visit-updated", window.prodigySiteVisitCardListener);
  delete window.prodigySiteVisitCardListener;
  return true;
};
window.ensureProdigySiteVisitCardListener();
