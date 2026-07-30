window.renderAuctionCard = function(p, container, options) {
  try {
    const T = window.ProdigyTokens || {}; const C = T.COLORS || {};
    const display = window.prodigyDisplay;
    if (!display) throw new Error("표시 Registry가 로드되지 않았습니다.");
    const parser = window.parsePrice || Number;
    const color = display.statusInfo(p.status).color;
    
    const card = container.createEl('div', {
      attr: {
        style: `border: 1px solid var(--background-modifier-border); border-left: 4px solid ${color}; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--background-secondary); display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);`
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
    const isClosedWatching = p.status === "watching" && hasRecordedValue(p.winning_bid_price);

    // Calculate D-Day first
    let ddayStr = "-";
    let isUrgent = false;
    let isAuctionToday = false;
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
          ddayStr = "종료";
        }
        
        dateStr = isoDate;
      }
    }
    if (isClosedWatching) {
      ddayStr = "종료";
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
      attr: { style: 'display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 8px;' }
    });

    const leftContainer = titleRow.createEl('div', {
      attr: { style: 'display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;' }
    });

    const displayCase = p.case_number || p.file.name.replace(/\.md$/, '');
    const displayTitle = getPropertyName(p.address);
    const fullTitleText = `⚖️ ${displayCase}`;

    const titleLink = leftContainer.createEl('a', {
      text: fullTitleText,
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 0.95em; color: var(--text-normal); text-decoration: none; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
        title: '클릭하여 사건 노트를 엽니다.'
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

    const deleteBtn = leftContainer.createEl('span', {
      text: '🗑️',
      attr: {
        style: 'cursor: pointer; opacity: 0.4; font-size: 0.85em; transition: opacity 0.2s; flex-shrink: 0;',
        title: '이 사건 노트를 삭제(휴지통 이동)합니다.'
      }
    });
    deleteBtn.onmouseenter = () => deleteBtn.style.opacity = '1';
    deleteBtn.onmouseleave = () => deleteBtn.style.opacity = '0.4';
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
      attr: { style: 'display: flex; align-items: center; gap: 4px; flex-shrink: 0;' }
    });

    // D-Day Badge
    if (ddayStr !== "-") {
      rightBadges.createEl('span', {
        text: ddayStr,
        attr: {
          style: `background: ${isUrgent ? 'var(--text-accent)' : 'var(--background-modifier-hover)'}; color: var(--text-normal); font-size: 0.72em; font-weight: bold; padding: 1px 4px; border-radius: 4px;`
        }
      });
    }

    // Naver Icon Button
    if (naverLink) {
      rightBadges.createEl('a', {
        text: '🌐',
        href: naverLink,
        attr: {
          style: `font-size: 0.75em; background: ${T.withAlpha ? T.withAlpha(C.success || "#22c55e", 0.12) : "#22c55e20"}; padding: 2px 4px; border-radius: 4px; text-decoration: none; cursor: pointer;`,
          title: '네이버 부동산 바로가기'
        }
      });
    }

    // Cafe Icon Button
    if (cafeLink) {
      rightBadges.createEl('a', {
        text: '💬',
        href: cafeLink,
        attr: {
          style: `font-size: 0.75em; background: ${T.withAlpha ? T.withAlpha(C.info || "#3b82f6", 0.12) : "#3b82f620"}; padding: 2px 4px; border-radius: 4px; text-decoration: none; cursor: pointer;`,
          title: '카페 바로가기'
        }
      });
    }

    // Line 2: Location & Type & Property Name
    const regionText = (p.region_sigungu || p.region_dong) 
      ? `${p.region_sigungu || ""} ${p.region_dong || ""}`.trim() 
      : "지역 미정";

    const detailRow1 = card.createEl('div', {
      attr: { style: 'font-size: 0.76em; color: var(--text-muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 1px;' }
    });
    detailRow1.createEl('span', { text: `📍 ${regionText}` });
    // Region decision packet is read-only: it must never create a Region Object.
    if (window.AuctionRegionPacket) {
      const regionBtn = detailRow1.createEl('button', {
        text: '지역 판단',
        attr: {
          type: 'button',
          class: 'action-btn',
          style: 'font-size: 0.72em; padding: 1px 6px; min-height: 0; cursor: pointer;',
          title: '검증된 지역 근거와 확인 필요 항목 보기',
          'aria-label': '지역 판단 패킷 열기'
        }
      });
      regionBtn.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await window.AuctionRegionPacket.openForAuction(app, p, { returnFocus: regionBtn });
        } catch (error) {
          if (window.Notice) new Notice(error.message || String(error));
        }
      };
    }
    // Region Intelligence popup — read-only, never mutates Objects.
    if (window.RegionIntelligencePopupCore?.isAvailable && window.RegionIntelligencePopupView) {
      const riBtn = detailRow1.createEl('button', {
        text: '지역 정보',
        attr: {
          type: 'button',
          class: 'action-btn',
          style: 'font-size: 0.72em; padding: 1px 6px; min-height: 0; cursor: pointer;',
          title: '지역 정량·정성 정보 팝업',
          'aria-label': '지역 정보 팝업 열기'
        }
      });
      riBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const regionKey = (p.region_sido || "").trim() && (p.region_sigungu || "").trim()
            ? `${(p.region_sido || "").trim()}-${(p.region_sigungu || "").trim()}`
            : null;
          if (!regionKey) { if (window.Notice) new Notice("지역 정보가 없습니다."); return; }
          const result = window.RegionIntelligencePopupCore.openPopup(app.vault.adapter.basePath || "", regionKey);
          if (!result.ok) { if (window.Notice) new Notice(result.error); return; }
          const html = window.RegionIntelligencePopupView.renderPopup(result.state);
          const overlay = document.createElement("div");
          overlay.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)";
          const modal = document.createElement("div");
          modal.style.cssText = "background:var(--background-primary);border-radius:12px;max-width:560px;width:95vw;max-height:90vh;overflow-y:auto;padding:16px";
          modal.innerHTML = html;
          overlay.appendChild(modal);
          overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
          modal.querySelector("[data-action='close']")?.addEventListener("click", () => overlay.remove());
          document.body.appendChild(overlay);
        } catch (error) {
          if (window.Notice) new Notice("지역 정보 팝업 오류: " + (error.message || String(error)));
        }
      };
    }
    detailRow1.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
    detailRow1.createEl('span', { text: p.property_type || "용도 미정" });

    if (displayTitle && displayTitle !== "물건명 미지정") {
      detailRow1.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
      detailRow1.createEl('span', { text: `🏢 ${displayTitle}`, attr: { style: 'font-weight: bold; color: var(--text-normal);' } });
    }

    // Line 3: Court & Date
    const detailRow2 = card.createEl('div', {
      attr: { style: 'font-size: 0.72em; color: var(--text-muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 1px;' }
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
      detailRow2.createEl('span', { text: `📅 ${dateStr}` });
    }
    
   // Finance Row
   const financeRow = card.createEl('div', {
     attr: { style: `display: flex; flex-wrap: wrap; align-items: center; gap: ${isMobile ? '4px 6px' : '8px'}; font-size: ${isMobile ? '0.72em' : '0.78em'}; color: var(--text-normal); margin-top: 1px;` }
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
      ? window.AuctionCardPriceProjection.project(p)
      : { left: { key: "minimum_bid", label: "최저가", value: p.minimum_bid }, right: { key: "expected_bid", label: "입찰 예정가", value: p.expected_bid } };
   const formatProjectedPrice = (entry) => {
     const isTerminal = ["won", "lost", "skipped", "reviewing"].includes(p.status);
     const precise = (p.status === "bidding" && isAuctionToday) || isTerminal;
     const value = precise ? toWon(entry.value) : toEok(entry.value);
     return `${entry.label}: <strong title="${toWon(entry.value)}">${value}</strong>`;
   };
    // The acquisition/outcome pair is the first thing a completed card must communicate.
    // Keep it together so "내 입찰가 → 낙찰가" is not visually split by editable estimates.
    const pricePair = financeRow.createEl('div', {
      attr: { class: 'auction-card-price-pair', style: 'display:flex; align-items:center; gap:4px; flex-wrap:wrap;' }
    });
   const minEl = pricePair.createEl('div', { attr: { class: 'auction-card-result-price' } });
   minEl.innerHTML = `${formatProjectedPrice(priceProjection.left)}${priceProjection.left.key === "minimum_bid" ? minRateStr : ""}`;

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

   financeRow.createEl('span', { text: '·', attr: { style: isMobile ? 'display: none;' : 'color: var(--background-modifier-border);' } });

 // Deposit = minimum_bid / 10 (visible when bidding)
 if (p.status === "bidding") {
   const savedDeposit = parser(p.bid_deposit);
   const minBidNum = parser(p.minimum_bid);
   const deposit = (!isNaN(savedDeposit) && isFinite(savedDeposit) && savedDeposit > 0)
     ? savedDeposit
     : (!isNaN(minBidNum) && isFinite(minBidNum) && minBidNum > 0 ? Math.floor(minBidNum / 10) : 0);
   if (deposit > 0) {
     const depositStr = toWon(deposit);
     const depositEl = financeRow.createEl('div', {
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
      financeRow.createEl('span', { text: '·', attr: { style: isMobile ? 'display: none;' : 'color: var(--background-modifier-border);' } });
    }
  }

   const exitEl = financeRow.createEl('div', {
      attr: {
        style: 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;',
        title: `${display.property("exit_price")} 수정`
      }
    });
    exitEl.addEventListener('mouseenter', () => { exitEl.style.backgroundColor = 'var(--background-modifier-hover)'; });
    exitEl.addEventListener('mouseleave', () => { exitEl.style.backgroundColor = 'transparent'; });
   const exitColor = p.exit_price && p.exit_price !== "정보 없음" ? 'var(--text-success)' : 'var(--text-normal)';
   const exitDisplay = ["won", "lost", "skipped"].includes(p.status) ? toWon(p.exit_price) : toEok(p.exit_price);
   exitEl.innerHTML = `${display.property("exit_price")}: <strong style="color:${exitColor};">${exitDisplay}</strong>`;
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
    
   financeRow.createEl('span', { text: '·', attr: { style: isMobile ? 'display: none;' : 'color: var(--background-modifier-border);' } });
   
   const isTerminalStatus = ["won", "lost", "skipped"].includes(p.status);

   // 차익·월수익: 터미널 상태(won/lost/skipped)에서는 숨김
   if (!isTerminalStatus) {
     // Calculate Difference (차익 = 탈출구 - 입찰)
     let diffStr = "-";
     let diffColor = "var(--text-muted)";
     if (p.exit_price && priceProjection.left.value && p.exit_price !== "정보 없음") {
       const exit = parser(p.exit_price);
       const exp = parser(priceProjection.left.value);
       if (!isNaN(exit) && !isNaN(exp)) {
         const diff = exit - exp;
         diffStr = toEok(diff);
         if (diff > 0) {
           diffColor = "var(--text-accent)";
         } else if (diff < 0) {
           diffColor = "var(--text-error)";
         }
       }
     }
     
     const diffEl = financeRow.createEl('div');
     diffEl.innerHTML = `차익: <strong style="color:${diffColor};">${diffStr}</strong>`;
     
     financeRow.createEl('span', { text: '·', attr: { style: isMobile ? 'display: none;' : 'color: var(--background-modifier-border);' } });
     
     const profitInfo = calcMonthlyProfit(p, priceProjection.left.value);
     const profitEl = financeRow.createEl('div', {
       attr: {
         style: 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;',
         title: '클릭하여 예상 월세, 대출비율, 이율을 수정합니다.'
       }
     });
     
     profitEl.addEventListener('mouseenter', () => {
       profitEl.style.backgroundColor = 'var(--background-modifier-hover)';
     });
     profitEl.addEventListener('mouseleave', () => {
       profitEl.style.backgroundColor = 'transparent';
     });

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
   } // end if (!isTerminalStatus) — 차익·월수익 hidden for terminal cards
    
   if (["won", "lost", "skipped"].includes(p.status)) {
      const decisionEl = card.createEl('div', {
        attr: { style: 'font-size: 0.78em; color: var(--text-normal); margin-top: 1px;' }
      });
      
      const reason = p.decision_reason || "미지정";
      const icon = p.status === "won" ? "🏆" : p.status === "lost" ? "❌" : "🚫";

      decisionEl.createSpan({ text: `${icon} ` });
      decisionEl.createEl('strong', {
        text: `${display.property("decision_reason")}:`,
        attr: { style: 'color:var(--text-accent); font-weight:bold;' }
      });
      decisionEl.createSpan({ text: ` ${reason}` });
    }
    
    // Opinion Row (Clickable)
    const opinionEl = card.createEl('div', {
      attr: { 
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
    
    opinionEl.createSpan({ text: '💭 ' });
    opinionEl.createEl('strong', {
      text: `${display.property("my_opinion")}:`,
      attr: { style: 'color:var(--text-accent); font-weight:bold;' }
    });
    opinionEl.createSpan({
      text: isValid(myOpinion) ? ` ${String(myOpinion).trim()}` : ' 의견 없음 (클릭하여 입력...)',
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

    // Reference Memo Row (Not Clickable, below opinionEl)
    const memoEl = card.createEl('div', {
      attr: { 
        style: 'font-size: 0.78em; color: var(--text-normal); margin-top: 2px; padding: 2px 4px;' 
      }
    });

    const userText = isValid(userNote) ? String(userNote).trim() : "";
    const recText = isValid(recNote) ? String(recNote).trim() : "";

    if (userText || recText) {
      const memoBody = memoEl.createEl('div', {
        attr: { style: 'border-top: 1px dashed var(--background-modifier-border); padding-top: 4px; margin-top: 4px;' }
      });
      const primaryMemo = memoBody.createEl('div');
      primaryMemo.createSpan({ text: '📝 ' });
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
        return { key, label: `${info.icon} ${shortLabel}`.trim(), color: info.color };
      });
    };
    
    const buttons = getTransitionButtons(p.status);
    const decisionPacket = window.AuctionDecisionPacket;
    const decisionPacketContext = (options && options.decisionPacketContext)
      || window.AuctionDecisionPacketDashboardContext;
    
    if (buttons.length > 0 || p.status === "bidding") {
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

      // Decision Packet is deterministic reference material for active cases.
      // It stays inline and never changes Object properties or Auction Day state.
      if (decisionPacket && decisionPacket.isActionable && decisionPacket.isActionable(p)) {
        let packetHost = null;
        const packetBtn = window.ProdigyUI
          ? window.ProdigyUI.button(buttonContainer, "결정 패킷", { chip: true })
          : buttonContainer.createEl("button", {
            text: "결정 패킷",
            attr: { type: "button", class: "prodigy-btn prodigy-btn-chip" }
          });
        packetBtn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (packetHost && packetHost.parentNode) {
            packetHost.parentNode.removeChild(packetHost);
            packetHost = null;
            packetBtn.setText ? packetBtn.setText("결정 패킷") : (packetBtn.textContent = "결정 패킷");
            return;
          }
          packetHost = card.createEl("div", { attr: { class: "prodigy-auction-decision-packet-host" } });
          decisionPacket.renderForAuction(packetHost, {
            app,
            auction: p,
            context: decisionPacketContext
          });
          packetBtn.setText ? packetBtn.setText("패킷 닫기") : (packetBtn.textContent = "패킷 닫기");
        };
      }

      buttons.forEach(opt => {
        const btn = window.ProdigyUI
          ? window.ProdigyUI.button(buttonContainer, opt.label, { chip: true })
          : buttonContainer.createEl('button', {
            text: opt.label,
            attr: { type: 'button', class: 'prodigy-btn prodigy-btn-chip' }
          });
        
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
              constructor(appInstance, statusKey, onSave) {
                super(appInstance);
                this.statusKey = statusKey;
                this.onSave = onSave;
                this.selectedReason = "";
              }
              onOpen() {
                const { contentEl } = this;
                contentEl.empty();
                
                let title = "";
                let question = "";
                let reasons = [];
                let placeholderText = "";
                
                if (this.statusKey === 'won') {
                  title = "🏆 낙찰";
                  question = "이번 입찰의 핵심 이유는 무엇인가?";
                  reasons = ["수익성 우수", "시세 대비 저렴", "희소성", "장기 투자", "기타"];
                  placeholderText = "입찰 판단 메모";
                } else if (this.statusKey === 'lost') {
                  title = "❌ 패찰";
                  question = "패찰 원인은 무엇인가?";
                  reasons = ["경쟁 과열", "예상가 부족", "전략적 패찰", "기타"];
                  placeholderText = "패찰 메모";
                } else if (this.statusKey === 'skipped') {
                  title = "🚫 입찰 포기";
                  question = "입찰을 포기한 이유는 무엇인가?";
                  reasons = ["수익성 부족", "권리 문제", "임장 결과", "자금 부족", "전략적 포기", "기타"];
                  placeholderText = "포기 메모";
                }
                
                contentEl.createEl("h3", { text: title, attr: { style: "margin-bottom: 12px; font-size: 1.15em;" } });
                contentEl.createEl("p", { text: question, attr: { style: "font-size: 0.9em; color: var(--text-muted); margin-bottom: 12px;" } });
                
                const reasonsContainer = contentEl.createEl("div", {
                  attr: { style: "display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;" }
                });
                
                reasons.forEach((reason, index) => {
                  const label = reasonsContainer.createEl("label", {
                    attr: { style: "display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9em;" }
                  });
                  
                  const radio = label.createEl("input", {
                    attr: { type: "radio", name: "decision_reason", value: reason }
                  });
                  if (index === 0) {
                    radio.checked = true;
                    this.selectedReason = reason;
                  }
                  
                  radio.onchange = () => {
                    if (radio.checked) {
                      this.selectedReason = reason;
                    }
                  };
                  
                  label.createEl("span", { text: reason });
                });
                
                const noteContainer = contentEl.createEl("div", {
                  attr: { style: "margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px;" }
                });
                
                const noteInput = noteContainer.createEl("textarea", {
                  attr: { 
                    placeholder: placeholderText + " (선택)",
                    style: "width: 100%; height: 60px; padding: 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border); font-size: 0.85em; color: var(--text-normal); background: var(--background-primary); resize: none;"
                  }
                });
                
                if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
                const btnRow = contentEl.createEl("div", {
                  attr: { class: "prodigy-btn-row", style: "justify-content: flex-end;" }
                });
                
                const cancelBtn = window.ProdigyUI
                  ? window.ProdigyUI.button(btnRow, "취소", { onClick: () => this.close() })
                  : btnRow.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
                if (!window.ProdigyUI) cancelBtn.onclick = () => this.close();
                
                const saveBtn = window.ProdigyUI
                  ? window.ProdigyUI.button(btnRow, "저장", { primary: true })
                  : btnRow.createEl("button", { text: "저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
                
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
