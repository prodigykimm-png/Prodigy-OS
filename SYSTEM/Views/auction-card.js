window.renderAuctionCard = function(p, container) {
  try {
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
      const rent = Number(p.expected_monthly_rent);
      const loanRatio = p.loan_ratio !== undefined && !isNaN(Number(p.loan_ratio)) ? Number(p.loan_ratio) : 0.8;
      const interestRate = p.interest_rate !== undefined && !isNaN(Number(p.interest_rate)) ? Number(p.interest_rate) : 0.06;
      
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
      const num = Number(v);
      if (isNaN(num) || !isFinite(num)) return v;
      return (num / 100000000).toFixed(2) + "억";
    };

    const toMan = (v) => {
      if (v === undefined || v === null || v === "") return "0";
      const num = Number(v);
      if (isNaN(num)) return v;
      if (num % 10000 === 0) return (num / 10000) + "만";
      return num;
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
    title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path, 'split');
    
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
    
    // Right header (court & recommend level badge)
    const rightHeader = header.createEl('div', {
      attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.75em;' }
    });
    
    const level = p.recommendation || p.recommend_level || "보통";
    const levelColors = {
      '강강추': { bg: '#ef444420', text: '#ef4444' },
      '강추': { bg: '#f9731620', text: '#f97316' },
      '추천': { bg: '#eab30820', text: '#eab308' },
      '보통': { bg: 'var(--background-modifier-hover)', text: 'var(--text-muted)' }
    };
    const colors = levelColors[level] || levelColors['보통'];
    
    rightHeader.createEl('span', {
      text: level,
      attr: { style: `background: ${colors.bg}; color: ${colors.text}; font-weight: bold; padding: 1px 4px; border-radius: 4px;` }
    });

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
    
    // D-Day & Date & Finance Row
    const financeRow = card.createEl('div', {
      attr: { style: 'display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.78em; color: var(--text-normal); margin-top: 1px;' }
    });
    
    // Calculate D-Day
    let ddayStr = "-";
    let isUrgent = false;
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
        
        if (diffDays === 0) {
          ddayStr = "D-Day";
          isUrgent = true;
        } else if (diffDays > 0) {
          ddayStr = `D-${diffDays}`;
          if (diffDays <= 3) isUrgent = true;
        } else {
          ddayStr = `D+${Math.abs(diffDays)}`;
        }
        
        dateStr = isoDate;
      }
    }
    
    if (ddayStr !== "-") {
      financeRow.createEl('span', {
        text: ddayStr,
        attr: {
          style: `background: ${isUrgent ? 'var(--text-accent)' : 'var(--background-modifier-hover)'}; color: var(--text-normal); font-size: 0.9em; font-weight: bold; padding: 1px 4px; border-radius: 4px;`
        }
      });
    }
    
    if (p.auction_datetime) {
      financeRow.createEl('span', {
        text: dateStr,
        attr: { style: 'color: var(--text-muted); font-weight: bold;' }
      });
    }
    
    if (p.auction_datetime) {
      financeRow.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
    }
    
    let minRateStr = "";
    if (p.appraisal_price && p.minimum_bid && p.appraisal_price !== "정보 없음" && p.minimum_bid !== "정보 없음") {
      const appraisal = Number(p.appraisal_price);
      const minimum = Number(p.minimum_bid);
      if (!isNaN(appraisal) && !isNaN(minimum) && isFinite(appraisal) && isFinite(minimum) && appraisal > 0) {
        minRateStr = ` (${(minimum / appraisal * 100).toFixed(0)}%)`;
      }
    }
      
    const minEl = financeRow.createEl('div');
    minEl.innerHTML = `최저: <strong>${toEok(p.minimum_bid)}${minRateStr}</strong>`;
    
    financeRow.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
    
    const expEl = financeRow.createEl('div', {
      attr: {
        style: 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;',
        title: '클릭하여 예상 입찰가(expected_bid)를 수정합니다.'
      }
    });
    
    // Add hover style for expected bid
    expEl.addEventListener('mouseenter', () => {
      expEl.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    expEl.addEventListener('mouseleave', () => {
      expEl.style.backgroundColor = 'transparent';
    });
    
    expEl.innerHTML = `예상: <strong style="color:var(--text-accent);">${toEok(p.expected_bid)}</strong>`;
    
    expEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentExpected = p.expected_bid || "";
      const newExpected = await window.obsidianPrompt(
        `[${p.case_number || p.file.name}] 예상 입찰가(expected_bid) 수정`,
        "예상 입찰가(expected_bid)를 입력해주세요 (원 단위, 예: 154000000):",
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
        new Notice("예상 입찰가가 업데이트되었습니다.");
      }
    });
    
    financeRow.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
    
    const profitInfo = calcMonthlyProfit(p);
    const profitEl = financeRow.createEl('div', {
      attr: {
        style: 'cursor: pointer; padding: 0 2px; border-radius: 3px; transition: background-color 0.2s;',
        title: '클릭하여 예상 월세, 대출비율, 이율을 수정합니다.'
      }
    });
    
    // Add hover style for profit
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
      
      const currentRent = p.expected_monthly_rent !== undefined ? p.expected_monthly_rent : "";
      const currentLoan = p.loan_ratio !== undefined ? p.loan_ratio : 0.8;
      const currentInterest = p.interest_rate !== undefined ? p.interest_rate : 0.06;
      
      const defaultVal = `${toMan(currentRent)}, ${Math.round(currentLoan * 100)}%, ${(currentInterest * 100).toFixed(1)}%`;
      
      const inputVal = await window.obsidianPrompt(
        `[${p.case_number || p.file.name}] 월수익 계산 변수 수정`,
        "월세, 대출비율, 이율을 순서대로 공백이나 쉼표로 구분하여 입력해주세요:\n(예: 50만, 80%, 6% 또는 500000 0.8 0.06)",
        defaultVal
      );
      if (inputVal === null) return; // Cancelled
      
      const parts = inputVal.split(/[\s,]+/).filter(x => x.trim() !== "");
      
      // 1. Parse rent
      let cleanRent = (parts[0] || "").replace(/,/g, '').trim();
      let parsedRent = currentRent;
      if (cleanRent !== "") {
        if (cleanRent.includes('만')) {
          parsedRent = parseFloat(cleanRent) * 10000;
        } else {
          parsedRent = Number(cleanRent);
        }
        if (isNaN(parsedRent)) parsedRent = cleanRent;
      } else if (parts.length > 0) {
        parsedRent = null;
      }
      
      // 2. Parse loan ratio
      let cleanLoan = (parts[1] || "").replace(/%/g, '').trim();
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
      let cleanInterest = (parts[2] || "").replace(/%/g, '').trim();
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
    
    if (["won", "lost", "skipped"].includes(p.status)) {
      const decisionEl = card.createEl('div', {
        attr: { style: 'font-size: 0.78em; color: var(--text-normal); margin-top: 1px;' }
      });
      
      const reason = p.decision_reason || "미지정";
      const icon = p.status === "won" ? "🏆" : p.status === "lost" ? "❌" : "🚫";
      
      decisionEl.innerHTML = `${icon} <strong style="color:var(--text-accent); font-weight:bold;">결정 사유:</strong> ${reason}`;
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
    const recNote = p.recommend_note;
    
    const isValid = (val) => {
      return val && val !== "정보 없음" && val !== "메모 없음" && String(val).trim() !== "";
    };
    
    let opinionText = isValid(myOpinion) 
      ? String(myOpinion).trim() 
      : `<span style="color:var(--text-muted); font-style:italic;">의견 없음 (클릭하여 입력...)</span>`;
      
    opinionEl.innerHTML = `💭 <strong style="color:var(--text-accent); font-weight:bold;">나의의견:</strong> ${opinionText}`;
    opinionEl.title = "클릭하여 나의 의견(my_opinion)을 수정합니다.";

    opinionEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentOpinion = p.my_opinion || "";
      const newOpinion = await window.obsidianPrompt(
        `[${p.case_number || p.file.name}] 나의 의견(my_opinion) 수정`,
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
        
        new Notice("나의 의견(my_opinion)이 업데이트되었습니다.");
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

    if (userText && recText) {
      memoEl.innerHTML = `
        <div style="border-top: 1px dashed var(--background-modifier-border); padding-top: 4px; margin-top: 4px;">
          <div>📝 <strong style="color:var(--text-accent); font-weight:bold;">참고사항:</strong> ${userText}</div>
          <div style="margin-left: 18px; color: var(--text-muted); margin-top: 2px;">${recText}</div>
        </div>
      `;
    } else if (userText) {
      memoEl.innerHTML = `
        <div style="border-top: 1px dashed var(--background-modifier-border); padding-top: 4px; margin-top: 4px;">
          <div>📝 <strong style="color:var(--text-accent); font-weight:bold;">참고사항:</strong> ${userText}</div>
        </div>
      `;
    } else if (recText) {
      memoEl.innerHTML = `
        <div style="border-top: 1px dashed var(--background-modifier-border); padding-top: 4px; margin-top: 4px;">
          <div>📝 <strong style="color:var(--text-accent); font-weight:bold;">참고사항:</strong> ${recText}</div>
        </div>
      `;
    } else {
      memoEl.style.display = 'none';
    }
    
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
    
    if (buttons.length > 0 || p.status === "bidding") {
      const buttonContainer = card.createEl('div', {
        attr: { style: 'display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; border-top: 1px solid var(--background-modifier-border); padding-top: 4px; align-items: center;' }
      });
      
      if (buttons.length > 0) {
        buttonContainer.createEl('span', {
          text: '상태 변경:',
          attr: { style: 'font-size: 0.72em; color: var(--text-muted); display: flex; align-items: center; margin-right: 4px;' }
        });
      }
      
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
          let actualBid = p.my_bid_price || "";
          let winningBid = p.winning_bid_price || "";
 
          if (opt.key === 'bidding') {
            const inputExpected = await window.obsidianPrompt(`[${p.case_number}] 입찰 준비`, "예상 입찰가(expected_bid)를 입력해주세요 (원 단위, 예: 154000000):", String(expectedBid));
            if (inputExpected === null) return;
            expectedBid = inputExpected.trim();

            btn.disabled = true;
            btn.style.opacity = '0.5';
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
 
              const inputWinning = await window.obsidianPrompt(`[${p.case_number}] 최종 낙찰가 입력`, "최종 낙찰가를 입력해주세요 (원 단위):", String(winningBid || actualBid));
              if (inputWinning === null) return;
              winningBid = inputWinning.trim();
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
                
                const btnRow = contentEl.createEl("div", {
                  attr: { style: "display: flex; justify-content: flex-end; gap: 8px;" }
                });
                
                const cancelBtn = btnRow.createEl("button", {
                  text: "취소",
                  attr: { style: "background: var(--background-modifier-hover); color: var(--text-normal); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;" }
                });
                cancelBtn.onclick = () => this.close();
                
                const saveBtn = btnRow.createEl("button", {
                  text: "저장",
                  attr: { style: "background: var(--text-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;" }
                });
                
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
                    if (winningBid) fm.winning_bid_price = Number(winningBid) || winningBid;
                  }
                });
                
                // 2. Update note body H1 Decision section
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
                  
                  const newDecisionSection = `${decisionHeader}
 
Current Status
\`= this.status\`
 
Decision Date
${todayStr}
 
Reason
${reason}
 
Notes
\`= this.my_opinion\`
 
- 참고 -
\`= this.recommend_note\`
 
`;
                  const updatedContent = content.substring(0, decisionIndex) + newDecisionSection + content.substring(endIndex);
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
      
      // If status is bidding, display the site visit button/badge to the right of status buttons
      if (p.status === "bidding") {
        const svd = p.site_visit_date;
        const isCompleted = svd && svd !== "정보 없음" && String(svd).trim() !== "";
        
        if (!isCompleted) {
          const svBtn = buttonContainer.createEl('button', {
            text: '☐ 임장 완료',
            attr: {
              style: 'font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid #3b82f6; cursor: pointer; font-weight: bold; margin-left: auto;'
            }
          });
          
          svBtn.onclick = async (e) => {
            e.preventDefault();
            const tFile = app.vault.getAbstractFileByPath(p.file.path);
            if (tFile) {
              const todayStr = new Date().toISOString().split('T')[0];
              await app.fileManager.processFrontMatter(tFile, (fm) => {
                fm.site_visit_date = todayStr;
                fm.updated = todayStr;
              });
              new Notice(`임장 완료 처리되었습니다: ${todayStr}`);
            }
          };
        } else {
          const svBadge = buttonContainer.createEl('button', {
            text: `☑ 임장 완료 (${svd})`,
            attr: {
              style: 'font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: #3b82f615; color: #3b82f6; border: 1px solid #3b82f6; cursor: pointer; font-weight: bold; margin-left: auto;'
            }
          });
          
          svBadge.onclick = (e) => {
            e.preventDefault();
            class SiteVisitActionModal extends window.obsidian.Modal {
              constructor(appInstance) {
                super(appInstance);
              }
              onOpen() {
                const { contentEl } = this;
                contentEl.empty();
                contentEl.createEl("h3", { text: "임장 기록 관리", attr: { style: "margin-bottom: 16px; font-size: 1.15em;" } });
                
                // Option 1: Edit Date
                const row1 = contentEl.createEl("div", { attr: { style: "display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; background: var(--background-modifier-hover); padding: 10px; border-radius: 6px;" } });
                row1.createEl("span", { text: "날짜 수정:", attr: { style: "font-weight: bold; font-size: 0.85em; color: var(--text-muted);" } });
                
                const dateInput = row1.createEl("input", {
                  attr: { type: "date", value: svd, style: "padding: 4px; border-radius: 4px; border: 1px solid var(--background-modifier-border); width: 100%; margin-bottom: 8px; color: var(--text-normal); background: var(--background-primary);" }
                });
                
                const saveBtn = row1.createEl("button", {
                  text: "수정 완료",
                  attr: { style: "background: var(--text-accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; align-self: flex-end;" }
                });
                
                saveBtn.onclick = async () => {
                  const newDate = dateInput.value;
                  if (newDate) {
                    const tFile = app.vault.getAbstractFileByPath(p.file.path);
                    if (tFile) {
                      await app.fileManager.processFrontMatter(tFile, (fm) => {
                        fm.site_visit_date = newDate;
                        fm.updated = new Date().toISOString().split('T')[0];
                      });
                      new Notice(`임장 기일이 수정되었습니다: ${newDate}`);
                      this.close();
                    }
                  } else {
                    new Notice("올바른 날짜를 선택해주세요.");
                  }
                };
                
                // Option 2: Delete Record
                const row2 = contentEl.createEl("div", { attr: { style: "display: flex; justify-content: space-between; align-items: center; background: var(--background-modifier-hover); padding: 10px; border-radius: 6px;" } });
                row2.createEl("span", { text: "임장 기록 삭제:", attr: { style: "font-weight: bold; font-size: 0.85em; color: var(--text-error);" } });
                
                const deleteBtn = row2.createEl("button", {
                  text: "기록 삭제",
                  attr: { style: "background: var(--text-error); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;" }
                });
                
                deleteBtn.onclick = async () => {
                  if (confirm("정말로 임장 기일 기록을 삭제하시겠습니까?\n삭제하면 '임장 미완료' 상태로 복원됩니다.")) {
                    const tFile = app.vault.getAbstractFileByPath(p.file.path);
                    if (tFile) {
                      await app.fileManager.processFrontMatter(tFile, (fm) => {
                        delete fm.site_visit_date;
                        fm.updated = new Date().toISOString().split('T')[0];
                      });
                      new Notice("임장 기록이 삭제되었습니다.");
                      this.close();
                    }
                  }
                };
              }
              onClose() {
                this.contentEl.empty();
              }
            }
            new SiteVisitActionModal(window.app).open();
          };
        }
      }
    }
  } catch (e) {
    console.error("renderAuctionCard error:", e);
    new Notice("renderAuctionCard 에러 발생: " + e.message + "\n" + e.stack, 15000);
  }
};
