window.obsidianPrompt = function(title, placeholder, value = "") {
  return new Promise((resolve) => {
    try {
      const obsidianModule = window.obsidian;
      const appInstance = window.app;
      
      if (!obsidianModule || !appInstance) {
        throw new Error("Obsidian global variables (window.obsidian / window.app) not initialized.");
      }
      
      const { Modal, Setting } = obsidianModule;
      
      class PromptModal extends Modal {
        constructor(app) {
          super(app);
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.createEl("h3", { text: title, attr: { style: "margin-block-end:var(--ke-space-3);font-size:var(--ke-type-title);line-height:var(--ke-leading-body);" } });
          
         let inputVal = value;
         new Setting(contentEl)
           .setName(placeholder)
           .addText((text) => {
             text.setValue(value);
             text.onChange((val) => {
               inputVal = val;
             });
             // Auto-format numbers with commas (천 단위 콤마)
             text.inputEl.addEventListener('input', () => {
               const raw = text.inputEl.value.replace(/,/g, '');
               if (/^\d+$/.test(raw) && raw.length > 3) {
                 const formatted = Number(raw).toLocaleString('ko-KR');
                 const cursor = text.inputEl.selectionStart || 0;
                 const beforeCommas = text.inputEl.value.slice(0, cursor).replace(/,/g, '').length;
                 text.inputEl.value = formatted;
                 inputVal = formatted;
                 // Restore cursor position accounting for new commas
                 let newPos = 0;
                 let digitCount = 0;
                 for (let i = 0; i < formatted.length && digitCount < beforeCommas; i++) {
                   newPos = i + 1;
                   if (formatted[i] !== ',') digitCount++;
                 }
                 text.inputEl.setSelectionRange(newPos, newPos);
               }
             });
             setTimeout(() => {
               text.inputEl.focus();
               text.inputEl.select();
             }, 50);
           });
            
          new Setting(contentEl)
            .addButton((btn) => {
              btn.setButtonText("확인")
                 .setCta()
                 .onClick(() => {
                   this.close();
                   resolve(inputVal);
                 });
            })
            .addButton((btn) => {
              btn.setButtonText("취소")
                 .onClick(() => {
                   this.close();
                   resolve(null);
                 });
            });
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      
      new PromptModal(appInstance).open();
    } catch (e) {
      console.error("obsidianPrompt error:", e);
      new Notice("obsidianPrompt 에러 발생: " + e.message + "\n" + e.stack, 10000);
      resolve(null);
    }
  });
};

window.renderDashboardSection = function(options) {
  const {
    status,
    type,
    container,
    renderer,
    emptyMessage,
    isCollapsed = false,
    summaryText = "",
    summaryColor = "",
    sortField = "due_date",
    sortOrder = "asc"
  } = options;

  if (!renderer) {
    container.empty();
    container.createEl("span", {
      text: "⌛ 대시보드 리소스를 불러오는 중...",
      attr: { class: "prodigy-status-line", style: "color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label);font-style:italic;margin:var(--ke-space-2) 0;display:block;" }
    });
    return;
  }
  
  // Dataview API is passed from the DataviewJS block or retrieved globally
  const dataviewInstance = options.dv || window.dv || (typeof dv !== 'undefined' ? dv : null);
  if (!dataviewInstance) {
    container.createEl("span", { text: "Error: Dataview API not found." });
    return;
  }
  
  // Get active file frontmatter filters from dataviewInstance
  const fm = dataviewInstance.current() || {};
  
  const filterCategory = fm.card_category || "전체";
  const filterStatus = fm.card_status || "전체";
  const regionScope = window.__prodigyAuctionActiveRegionScope && typeof window.__prodigyAuctionActiveRegionScope === "object"
    ? window.__prodigyAuctionActiveRegionScope
    : null;
  const filterRegion = regionScope && regionScope.region_sido
    ? regionScope.region_sido
    : fm.card_region || "전체지역";
  const filterSigungu = regionScope && regionScope.region_sigungu
    ? String(regionScope.region_sigungu).trim()
    : "";
  const filterType = fm.card_type || "전체종류";
  
  // Status filtering check
  if (filterStatus !== "전체" && filterStatus !== status) {
    return;
  }

  // Render inline filters for Auction cases
  if (type === "auction_case" && status === "bidding") {
    const isMobile = (window.app?.isMobile || document.body.classList.contains('is-mobile')) || (window.innerWidth <= 833);

    const filterContainer = container.createEl("div", {
      attr: {
        class: "auction-filter-bar",
        style: isMobile
          ? "display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; width: 100%;"
          : "display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 8px; width: 100%;"
      }
    });

    // Simple search input box for case name / number
    const searchInput = filterContainer.createEl("input", {
      type: "text",
      value: window.auctionSearchQuery || "",
      placeholder: "사건번호/물건명 검색...",
      attr: {
        class: "auction-filter-search",
        style: isMobile
          ? "font-size:var(--ke-type-body);padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);border:1px solid var(--ke-color-border,var(--background-modifier-border));background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));width:100%;min-block-size:var(--ke-touch-target);box-sizing:border-box;"
          : "font-size:var(--ke-type-label);padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);border:1px solid var(--ke-color-border,var(--background-modifier-border));background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));width:150px;margin-inline-end:auto;min-block-size:var(--ke-touch-target);box-sizing:border-box;"
      }
    });

    searchInput.oninput = () => {
      window.auctionSearchQuery = searchInput.value;
      const dvPlugin = app.plugins?.plugins?.dataview;
      if (dvPlugin?.api) {
        dvPlugin.api.index.touch();
      }
    };

    searchInput.onfocus = () => { window.auctionSearchFocus = true; };
    searchInput.onblur = () => { window.auctionSearchFocus = false; };

    if (window.auctionSearchFocus) {
      setTimeout(() => {
        searchInput.focus();
        const val = searchInput.value;
        searchInput.value = "";
        searchInput.value = val;
      }, 20);
    }

    // On mobile, the dropdowns go into their own sub-row to prevent overflow
    let dropdownParent = filterContainer;
    if (isMobile) {
      dropdownParent = filterContainer.createEl("div", {
        attr: { class: "auction-filter-selects", style: "display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%;" }
      });
    }

    const makeSelectInline = (parent, label, field, options, currentVal) => {
      const wrapper = parent.createEl('div', { attr: { class: "auction-filter-select", style: 'display:flex;align-items:center;gap:var(--ke-space-2);font-size:var(--ke-type-label);color:var(--ke-color-muted,var(--text-muted));' } });
      wrapper.createEl('span', { text: label, attr: { style: 'font-weight: bold;' } });
      
      const sel = wrapper.createEl('select', { 
        attr: { 
          style: isMobile
            ? 'font-size:var(--ke-type-label);padding:var(--ke-space-2) var(--ke-space-4) var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));border:1px solid var(--ke-color-border,var(--background-modifier-border));cursor:pointer;min-block-size:var(--ke-touch-target);box-sizing:border-box;line-height:var(--ke-leading-control);font-family:inherit;'
            : 'font-size:var(--ke-type-label);padding:var(--ke-space-2) var(--ke-space-4) var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));border:1px solid var(--ke-color-border,var(--background-modifier-border));cursor:pointer;min-block-size:var(--ke-touch-target);box-sizing:border-box;line-height:var(--ke-leading-control);font-family:inherit;'
        } 
      });
      
      options.forEach(o => {
        const opt = sel.createEl('option', { text: o.text, value: o.value });
        if (o.value === String(currentVal !== undefined && currentVal !== null ? currentVal : o.value)) {
          opt.selected = true;
        }
      });
      
      sel.onchange = async () => {
        if (field === "card_region") window.__prodigyAuctionActiveRegionScope = null;
        const dashboardPath = dataviewInstance.current()?.file?.path;
        if (dashboardPath) {
          const file = app.vault.getAbstractFileByPath(dashboardPath);
          if (file) {
            await app.fileManager.processFrontMatter(file, (fm) => {
              fm[field] = sel.value;
            });
          }
        }
      };
    };

    makeSelectInline(dropdownParent, '지역:', 'card_region', [
      { text: '전체', value: '전체지역' },
      { text: '서울', value: '서울' },
      { text: '경기', value: '경기' },
      { text: '인천', value: '인천' },
      { text: '부산', value: '부산' }
    ], fm.card_region);

    if (!isMobile) {
      dropdownParent.createEl('span', { text: '|', attr: { style: 'color:var(--ke-color-border,var(--background-modifier-border));font-size:var(--ke-type-label);' } });
    }

    makeSelectInline(dropdownParent, '종류:', 'card_type', [
      { text: '전체', value: '전체종류' },
      { text: '오피스텔', value: '오피스텔' },
      { text: '아파트', value: '아파트' },
      { text: '상가', value: '상가' },
      { text: '지식산업센터', value: '지식산업센터' }
    ], fm.card_type);

    if (!isMobile) {
      dropdownParent.createEl('span', { text: '|', attr: { style: 'color:var(--ke-color-border,var(--background-modifier-border));font-size:var(--ke-type-label);' } });
    }

    const sortKeyField = `card_sort_${status}`;
    let defaultSort = "dday_asc";
    if (status !== "bidding" && status !== "watching") {
      defaultSort = "dday_desc";
    }

    makeSelectInline(dropdownParent, '정렬:', sortKeyField, [
      { text: '마감 임박순', value: 'dday_asc' },
      { text: '마감 여유순', value: 'dday_desc' },
      { text: '감정가 낮은순', value: 'expected_bid_asc' },
      { text: '감정가 높은순', value: 'expected_bid_desc' },
      { text: '최근 등록순', value: 'created_desc' }
    ], fm[sortKeyField] || defaultSort);
  }

  // Query pages based on type
  let folderPath = "";
  if (type === "auction_case") {
    folderPath = "PARA/PROJECTS/Auction";
  } else if (type === "project") {
    folderPath = "PARA/PROJECTS";
  } else if (type === "reading") {
    folderPath = "PARA/PROJECTS/Reading";
  } else {
    folderPath = "PARA/PROJECTS";
  }
  
  let pages = dataviewInstance.pages(`"${folderPath}"`).where(p => p.type === type && p.status === status);

  // The search input exists only in the bidding section. Keeping its transient
  // value out of every other status prevents a stale query from hiding the
  // watching cards that have no visible way to clear it.
  if (type === "auction_case" && status === "bidding" && window.auctionSearchQuery) {
    const q = window.auctionSearchQuery.toLowerCase().trim();
    pages = pages.where(p => {
      const caseNum = String(p.case_number || p.file.name || "").toLowerCase();
      const addr = String(p.address || "").toLowerCase();
      return caseNum.includes(q) || addr.includes(q);
    });
  }

  // Project type filter: all | business | work | personal | uncategorized
  if (type === "project") {
    const projectTypeFilter = options.projectTypeFilter
      || window.prodigyProjectTypeFilter
      || fm.card_project_type
      || "all";
    if (projectTypeFilter && projectTypeFilter !== "all" && projectTypeFilter !== "전체") {
      pages = pages.where((p) => {
        const raw = String(p.project_type || "").trim().toLowerCase();
        const normalized = (raw === "business" || raw === "work" || raw === "personal") ? raw : "uncategorized";
        return normalized === projectTypeFilter;
      });
    }
  }
  
  // Filters
  if (type === "project" && filterCategory !== "전체") {
    pages = pages.where(p => p.category === filterCategory);
  }
  if (type === "auction_case") {
    if (filterRegion !== "전체지역") {
      pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
    }
    if (filterSigungu) {
      pages = pages.where(p => (p.region_sigungu || "").includes(filterSigungu));
    }
    if (filterType !== "전체종류") {
      pages = pages.where(p => (p.property_type || "").includes(filterType));
    }
  }
  
  // Sort
  let activeSortField = sortField;
  let activeSortOrder = sortOrder;
  const sortKeyField = `card_sort_${status}`;
  let defaultSort = "dday_asc";
  if (status !== "bidding" && status !== "watching") {
    defaultSort = "dday_desc";
  }
  const filterSort = fm[sortKeyField] || defaultSort;
  
  if (type === "auction_case") {
    if (filterSort === "dday_asc") {
      activeSortField = "auction_datetime";
      activeSortOrder = "asc";
    } else if (filterSort === "dday_desc") {
      activeSortField = "auction_datetime";
      activeSortOrder = "desc";
    } else if (filterSort === "expected_bid_asc") {
      activeSortField = "expected_bid";
      activeSortOrder = "asc";
    } else if (filterSort === "expected_bid_desc") {
      activeSortField = "expected_bid";
      activeSortOrder = "desc";
    } else if (filterSort === "created_desc") {
      activeSortField = "file.ctime";
      activeSortOrder = "desc";
    }
  }
  
  const getSortKey = (p, field) => {
    if (field === "file.ctime") return p.file.ctime;
    if (field === "file.mtime") return p.file.mtime;
    if (field === "expected_bid") {
      const val = (window.parsePrice || Number)(p.expected_bid);
      if (isNaN(val) || p.expected_bid === "정보 없음" || String(p.expected_bid).trim() === "") {
        return activeSortOrder === "asc" ? 999999999999 : -1;
      }
      return val;
    }
    if (field === "auction_datetime") {
      const val = p.auction_datetime;
      if (!val || val === "정보 없음" || String(val).trim() === "") {
        return activeSortOrder === "asc" ? "9999-12-31" : "0000-01-01";
      }
      if (typeof val === "object" && typeof val.toISODate === "function") {
        return val.toISODate();
      }
      const str = String(val).trim();
      const match = str.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      }
      return str;
    }
    return p[field] || "";
  };
  
  pages = pages.sort(p => getSortKey(p, activeSortField), activeSortOrder);
  const pageList = typeof pages.array === "function" ? pages.array() : Array.from(pages || []);
  
  // Setup container
  let targetContainer = container;
  if (isCollapsed) {
    const details = container.createEl("details", {
      attr: { class: "prodigy-utility-card", style: "margin-block-end:var(--ke-space-3);background:var(--ke-color-surface-secondary,var(--background-secondary));border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-configurator);padding:var(--ke-space-3);inline-size:100%;" }
    });
    details.createEl("summary", {
      text: summaryText,
      attr: { style: `font-weight:700;cursor:pointer;color:${summaryColor};font-size:var(--ke-type-heading);line-height:var(--ke-leading-control);min-block-size:var(--ke-touch-target);` }
    });
    targetContainer = details.createEl("div", {
      attr: { style: "margin-block-start:var(--ke-space-3);" }
    });
  }
  
  // Render
  if (pageList.length === 0) {
    if (isCollapsed) {
      targetContainer.createEl("span", {
        text: emptyMessage,
        attr: { class: "prodigy-status-line", style: "color:var(--ke-color-muted,var(--text-muted));font-style:italic;font-size:var(--ke-type-label);display:block;margin:var(--ke-space-2) 0;" }
      });
    } else {
      const emptyDiv = targetContainer.createEl("div", {
        attr: { style: "margin:var(--ke-space-2) 0;" }
      });
      emptyDiv.createEl("span", {
        text: emptyMessage,
        attr: { style: "color:var(--ke-color-muted,var(--text-muted));font-style:italic;font-size:var(--ke-type-label);" }
      });
    }
  } else {
    pageList.forEach(p => renderer(p, targetContainer));
  }
};
