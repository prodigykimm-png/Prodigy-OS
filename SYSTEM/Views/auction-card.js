window.renderAuctionCard = function(p, container) {
  const statusColors = {
    watching: '#888888',
    bidding: '#3b82f6',
    skipped: '#666666',
    won: '#22c55e',
    lost: '#ef4444',
    reviewing: '#f97316',
    archived: '#555555'
  };
  const color = statusColors[p.status] || '#555';
  
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

  const calcMonthlyProfit = (p) => {
    const expected = Number(p.expected_bid);
    const rent = Number(p.monthly_rent);
    const loanRatio = p.loan_ratio !== undefined && !isNaN(Number(p.loan_ratio)) ? Number(p.loan_ratio) : 0.8;
    const interestRate = p.interest_rate !== undefined && !isNaN(Number(p.interest_rate)) ? Number(p.interest_rate) : 0.06;
    
    if (isNaN(expected) || isNaN(rent) || expected <= 0 || rent <= 0) return null;
    
    const loanAmount = expected * loanRatio;
    const annualInterest = loanAmount * interestRate;
    const monthlyInterest = annualInterest / 12;
    const profit = rent - monthlyInterest;
    return { profit, loanRatio, interestRate };
  };

  const formatProfit = (pInfo) => {
    if (!pInfo) return "-";
    const { profit, loanRatio, interestRate } = pInfo;
    const man = Math.round(profit / 10000);
    const sign = man > 0 ? "+" : "";
    const color = man > 0 ? "var(--text-accent)" : "var(--text-error)";
    return `<span style="color: ${color}; font-weight: bold;">${sign}${man.toLocaleString()}만</span> <span style="font-size:0.85em; color:var(--text-muted);">(${Math.round(loanRatio*100)}%대출, ${(interestRate*100).toFixed(1)}%금리)</span>`;
  };
  
  const toEok = (v) => {
    if (!v || v === "정보 없음") return "-";
    const num = Number(v);
    if (isNaN(num)) return v;
    return (num / 100000000).toFixed(2) + "억";
  };

  // Header
  const header = card.createEl('div', {
    attr: { style: 'display: flex; justify-content: space-between; align-items: center;' }
  });

  const leftHeader = header.createEl('div', {
    attr: { style: 'display: flex; align-items: center; gap: 8px;' }
  });
  
  const title = leftHeader.createEl('a', {
    text: p.file.name,
    attr: {
      class: 'internal-link',
      style: 'font-weight: bold; font-size: 0.95em; color: var(--text-normal); text-decoration: none; cursor: pointer;'
    }
  });
  title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
  
  // Quick Links
  const naverLink = p.source && p.source.naver && p.source.naver !== "정보 없음" && String(p.source.naver).startsWith("http") ? p.source.naver : null;
  const cafeLink = p.source && p.source.cafe && p.source.cafe !== "정보 없음" && String(p.source.cafe).startsWith("http") ? p.source.cafe : null;
  
  if (naverLink) {
    leftHeader.createEl('a', {
      text: '🌐 네이버',
      href: naverLink,
      attr: { 
        style: 'font-size: 0.72em; background: #22c55e20; color: #22c55e; padding: 1px 4px; border-radius: 4px; text-decoration: none; font-weight: bold; cursor: pointer;' 
      }
    });
  }
  if (cafeLink) {
    leftHeader.createEl('a', {
      text: '💬 카페',
      href: cafeLink,
      attr: { 
        style: 'font-size: 0.72em; background: #3b82f620; color: #3b82f6; padding: 1px 4px; border-radius: 4px; text-decoration: none; font-weight: bold; cursor: pointer;' 
      }
    });
  }
  
  // Right header (recommend level & court)
  const rightHeader = header.createEl('div', {
    attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.75em;' }
  });
  
  if (p.recommend) {
    rightHeader.createEl('span', {
      text: '추천',
      attr: { style: 'background: #eab30820; color: #eab308; font-weight: bold; padding: 1px 4px; border-radius: 4px;' }
    });
  }
  
  if (p.court) {
    rightHeader.createEl('span', {
      text: p.court,
      attr: { style: 'color: var(--text-muted); font-weight: bold;' }
    });
  }
  
  // Object Details Line (물건명 -> 지역 -> 종류)
  const meta = card.createEl('div', {
    attr: { style: 'font-size: 0.8em; color: var(--text-muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap;' }
  });
  
  const regionText = (p.region_sigungu || p.region_dong) 
    ? `${p.region_sigungu || ""} ${p.region_dong || ""}`.trim() 
    : "지역 미정";
    
  meta.createEl('span', { text: `🏢 ${getPropertyName(p.address)}`, attr: { style: 'font-weight: bold; color: var(--text-normal);' } });
  meta.createEl('span', { text: '·' });
  meta.createEl('span', { text: `📍 ${regionText}` });
  meta.createEl('span', { text: '·' });
  meta.createEl('span', { text: p.property_type || "용도 미정" });
  
  // D-Day & Date Row
  const ddayContainer = card.createEl('div', {
    attr: { style: 'display: flex; align-items: center; gap: 6px; margin-top: 1px;' }
  });
  
  // Calculate D-Day
  let ddayStr = "-";
  let isUrgent = false;
  let dateStr = "-";
  if (p.auction_datetime) {
    const targetDate = new Date(String(p.auction_datetime).split(' ')[0].split('T')[0]);
    const today = new Date();
    today.setHours(0,0,0,0);
    targetDate.setHours(0,0,0,0);
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      ddayStr = "D-Day";
      isUrgent = true;
    } else if (diffDays > 0) {
      ddayStr = `D-${diffDays}`;
      if (diffDays <= 3) isUrgent = true;
    } else {
      ddayStr = `D+${Math.abs(diffDays)}`;
    }
    
    dateStr = String(p.auction_datetime).split(' ')[0].split('T')[0];
  }
  
  if (ddayStr !== "-") {
    ddayContainer.createEl('span', {
      text: ddayStr,
      attr: {
        style: `background: ${isUrgent ? 'var(--text-accent)' : 'var(--background-modifier-hover)'}; color: var(--text-normal); font-size: 0.72em; font-weight: bold; padding: 1px 4px; border-radius: 4px;`
      }
    });
  }
  
  if (p.auction_datetime) {
    ddayContainer.createEl('span', {
      text: dateStr,
      attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: bold;' }
    });
  }
  
  // Prices & Profit Row
  const prices = card.createEl('div', {
    attr: { style: 'display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.8em; color: var(--text-normal); background: var(--background-modifier-hover); padding: 4px 8px; border-radius: 4px; margin-top: 3px; align-items: center;' }
  });
  
  const minRateStr = (p.appraisal_price && p.minimum_bid && p.appraisal_price !== "정보 없음" && p.minimum_bid !== "정보 없음") 
    ? ` (${(Number(p.minimum_bid) / Number(p.appraisal_price) * 100).toFixed(0)}%)` 
    : "";
    
  prices.createEl('div', { html: `감정: <strong>${toEok(p.appraisal_price)}</strong>` });
  prices.createEl('div', { html: `최저: <strong>${toEok(p.minimum_bid)}${minRateStr}</strong>` });
  prices.createEl('div', { html: `예상: <strong style="color:var(--text-accent);">${toEok(p.expected_bid)}</strong>` });
  
  const profitInfo = calcMonthlyProfit(p);
  prices.createEl('div', { html: `월수익: ${formatProfit(profitInfo)}` });
  
  // Recommendation & Next Action
  const detailRow = card.createEl('div', {
    attr: { style: 'display: flex; flex-direction: column; gap: 1px; font-size: 0.78em;' }
  });
  
  if (p.recommendation || p.recommend) {
    const level = p.recommendation || p.recommend_level || "보통";
    const note = p.recommend_note && p.recommend_note !== "정보 없음" ? ` · ${p.recommend_note}` : "";
    const icon = level === "강추" ? "🔥" : level === "추천" ? "👍" : "✨";
    detailRow.createEl('div', {
      html: `<span style="color:var(--text-accent); font-weight:bold;">${icon} 추천등급: ${level}</span>${note}`,
      attr: { style: 'color:var(--text-muted);' }
    });
  }
  
  detailRow.createEl('div', {
    html: `→ <strong style="color:var(--text-accent); font-weight:bold;">Next Action:</strong> ${p.next_action || "⚠️ 설정 필요"}`,
    attr: { style: 'color:var(--text-normal);' }
  });
  
  // Transition status buttons
  const getTransitionButtons = (currentStatus) => {
    const allTransitions = {
      watching: [
        { key: 'bidding', label: '⚖️ 입찰 준비', color: '#3b82f6' },
        { key: 'skipped', label: '❌ 입찰 포기', color: '#666666' }
      ],
      bidding: [
        { key: 'won', label: '🏆 낙찰성공', color: '#22c55e' },
        { key: 'lost', label: '💔 패찰차순', color: '#ef4444' },
        { key: 'skipped', label: '❌ 입찰 포기', color: '#666666' }
      ],
      won: [
        { key: 'reviewing', label: '🔄 낙찰복기', color: '#f97316' }
      ],
      lost: [
        { key: 'reviewing', label: '🔄 패찰복기', color: '#f97316' }
      ],
      reviewing: [
        { key: 'archived', label: '📦 사건종결', color: '#555555' }
      ],
      skipped: [
        { key: 'archived', label: '📦 사건종결', color: '#555555' }
      ],
      archived: []
    };
    return allTransitions[currentStatus] || [];
  };
  
  const buttons = getTransitionButtons(p.status);
  
  if (buttons.length > 0) {
    const buttonContainer = card.createEl('div', {
      attr: { style: 'display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; border-top: 1px solid var(--background-modifier-border); padding-top: 4px;' }
    });
    
    buttonContainer.createEl('span', {
      text: '상태 변경:',
      attr: { style: 'font-size: 0.72em; color: var(--text-muted); display: flex; align-items: center; margin-right: 4px;' }
    });
    
    buttons.forEach(opt => {
      const btn = buttonContainer.createEl('button', {
        text: opt.label,
        attr: {
          style: `font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid ${opt.color}; cursor: pointer;`
        }
      });
      
      btn.onclick = async (e) => {
        e.preventDefault();
        
        let expectedBid = p.expected_bid || "";
        let actualBid = p.actual_bid || "";
        let winningBid = p.winning_bid || "";

        if (opt.key === 'bidding') {
          const inputExpected = await window.obsidianPrompt(`[${p.case_number}] 입찰 준비`, "예상 입찰가(expected_bid)를 입력해주세요 (원 단위, 예: 154000000):", String(expectedBid));
          if (inputExpected === null) return;
          expectedBid = inputExpected.trim();
        } else if (opt.key === 'won' || opt.key === 'lost') {
          const inputActual = await window.obsidianPrompt(`[${p.case_number}] 실제 입찰가 입력`, "실제 입찰가를 입력해주세요 (원 단위, 예: 154000000):", String(actualBid));
          if (inputActual === null) return;
          actualBid = inputActual.trim();

          const inputWinning = await window.obsidianPrompt(`[${p.case_number}] 최종 낙찰가 입력`, "최종 낙찰가를 입력해주세요 (원 단위):", String(winningBid || actualBid));
          if (inputWinning === null) return;
          winningBid = inputWinning.trim();
        }

        btn.disabled = true;
        btn.style.opacity = '0.5';
        const tFile = app.vault.getAbstractFileByPath(p.file.path);
        if (tFile) {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = opt.key;
            if (opt.key === 'bidding') {
              if (expectedBid) fm.expected_bid = Number(expectedBid) || expectedBid;
            } else if (opt.key === 'won' || opt.key === 'lost') {
              if (actualBid) fm.actual_bid = Number(actualBid) || actualBid;
              if (winningBid) fm.winning_bid = Number(winningBid) || winningBid;
            }
            fm.updated = new Date().toISOString().split('T')[0];
          });
          new Notice(`상태가 ${opt.label}(으)로 변경되고 정보가 기록되었습니다.`);
        }
      };
    });
  }
};
