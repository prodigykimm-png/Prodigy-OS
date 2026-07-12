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
      const rent = Number(p.monthly_rent);
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
    
    const expEl = financeRow.createEl('div');
    expEl.innerHTML = `예상: <strong style="color:var(--text-accent);">${toEok(p.expected_bid)}</strong>`;
    
    financeRow.createEl('span', { text: '·', attr: { style: 'color: var(--background-modifier-border);' } });
    
    const profitInfo = calcMonthlyProfit(p);
    const profitEl = financeRow.createEl('div');
    profitEl.innerHTML = `월수익: ${formatProfit(profitInfo)}`;
    

    
    // Memo Row (below Next Action)
    const memoEl = card.createEl('div', {
      attr: { style: 'font-size: 0.78em; color: var(--text-normal); margin-top: 1px;' }
    });
    
    const rawNote = p.recommend_note;
    let memoText = "메모 없음";
    if (rawNote && rawNote !== "정보 없음" && rawNote !== "메모 없음" && String(rawNote).trim() !== "") {
      memoText = String(rawNote).trim();
    }
    memoEl.innerHTML = `📝 <strong style="color:var(--text-accent); font-weight:bold;">참고사항:</strong> ${memoText}`;
    
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
      
      // If status is bidding, we display the site visit button/badge next to the status buttons
      if (p.status === "bidding") {
        const svd = p.site_visit_date;
        const isCompleted = svd && svd !== "정보 없음" && String(svd).trim() !== "";
        
        if (!isCompleted) {
          const svBtn = buttonContainer.createEl('button', {
            text: '☐ 임장 완료',
            attr: {
              style: 'font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid #3b82f6; cursor: pointer; font-weight: bold;'
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
              style: 'font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: #3b82f615; color: #3b82f6; border: 1px solid #3b82f6; cursor: pointer; font-weight: bold;'
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
        
        // Add a small divider separator between Site Visit and Status Change buttons
        buttonContainer.createEl('span', {
          text: ' | ',
          attr: { style: 'font-size: 0.72em; color: var(--background-modifier-border); display: flex; align-items: center; margin: 0 2px;' }
        });
      }
      
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
  } catch (e) {
    console.error("renderAuctionCard error:", e);
    new Notice("renderAuctionCard 에러 발생: " + e.message + "\n" + e.stack, 15000);
  }
};
