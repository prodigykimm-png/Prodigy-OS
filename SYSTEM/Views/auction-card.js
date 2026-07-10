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
  
  // Header
  const header = card.createEl('div', {
    attr: { style: 'display: flex; justify-content: space-between; align-items: center;' }
  });
  const title = header.createEl('a', {
    text: p.file.name,
    attr: {
      class: 'internal-link',
      style: 'font-weight: bold; font-size: 0.95em; color: var(--text-normal); text-decoration: none; cursor: pointer;'
    }
  });
  title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
  
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
  
  // Meta line (case no, type, region)
  const meta = card.createEl('div', {
    attr: { style: 'font-size: 0.8em; color: var(--text-muted); display: flex; gap: 6px; align-items: center;' }
  });
  
  meta.createEl('span', { text: p.case_number || "사건번호 없음", attr: { style: 'font-weight: bold; color: var(--text-normal);' } });
  meta.createEl('span', { text: '·' });
  meta.createEl('span', { text: p.property_type || "용도 미지정" });
  meta.createEl('span', { text: '·' });
  meta.createEl('span', { text: p.region_sido || "지역 미지정" });
  
  // D-Day & Date Row
  const ddayContainer = card.createEl('div', {
    attr: { style: 'display: flex; align-items: center; gap: 6px; margin-top: 1px;' }
  });
  
  // Calculate D-Day
  let ddayStr = "-";
  let isUrgent = false;
  if (p.auction_datetime) {
    const targetDate = new Date(p.auction_datetime.split('T')[0]);
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
      text: String(p.auction_datetime).replace('T', ' '),
      attr: { style: 'font-size: 0.75em; color: var(--text-muted);' }
    });
  }
  
  // Prices Row
  const prices = card.createEl('div', {
    attr: { style: 'display: flex; gap: 12px; font-size: 0.8em; color: var(--text-normal); background: var(--background-modifier-hover); padding: 3px 6px; border-radius: 4px;' }
  });
  
  const toEok = (v) => {
    if (!v || v === "정보 없음") return "-";
    const num = Number(v);
    if (isNaN(num)) return v;
    return (num / 100000000).toFixed(2) + "억";
  };
  
  const minRateStr = (p.appraisal_price && p.minimum_bid && p.appraisal_price !== "정보 없음" && p.minimum_bid !== "정보 없음") 
    ? ` (${(Number(p.minimum_bid) / Number(p.appraisal_price) * 100).toFixed(0)}%)` 
    : "";
    
  prices.createEl('div', { html: `감정가: <strong style="color:var(--text-normal);">${toEok(p.appraisal_price)}</strong>` });
  prices.createEl('div', { html: `최저가: <strong style="color:var(--text-normal);">${toEok(p.minimum_bid)}${minRateStr}</strong>` });
  prices.createEl('div', { html: `예상가: <strong style="color:var(--text-accent);">${toEok(p.expected_bid)}</strong>` });
  
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
        btn.disabled = true;
        btn.style.opacity = '0.5';
        const tFile = app.vault.getAbstractFileByPath(p.file.path);
        if (tFile) {
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = opt.key;
            fm.updated = new Date().toISOString().split('T')[0];
          });
        }
      };
    });
  }
};
