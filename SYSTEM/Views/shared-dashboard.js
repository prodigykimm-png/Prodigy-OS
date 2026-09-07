window.ensureProdigyModalForeground = function(containerEl) {
  if (!containerEl) return 0;
  const ownerDocument = containerEl.ownerDocument || window.document;
  const lookupDocument = ownerDocument && typeof ownerDocument.querySelectorAll === "function"
    ? ownerDocument
    : window.document;
  const view = ownerDocument?.defaultView || window;
  const computedStyle = typeof view.getComputedStyle === "function"
    ? (element) => view.getComputedStyle(element)
    : () => ({ zIndex: "0" });
  const overlaySelector = [
    ".prodigy-bid-cal-popup-backdrop",
    ".region-popup-overlay",
    ".prodigy-aday-panel-backdrop"
  ].join(",");
  const currentZ = Number.parseInt(computedStyle(containerEl).zIndex, 10) || 0;
  const foregroundZ = Array.from(lookupDocument?.querySelectorAll?.(overlaySelector) || [])
    .reduce((highest, overlay) => {
      if (overlay === containerEl) return highest;
      const zIndex = Number.parseInt(computedStyle(overlay).zIndex, 10);
      return Number.isFinite(zIndex) ? Math.max(highest, zIndex) : highest;
    }, currentZ - 1) + 1;
  const targetZ = Math.max(currentZ, foregroundZ);
  containerEl.classList?.add("prodigy-modal-foreground");
  containerEl.style?.setProperty("z-index", String(targetZ), "important");
  return targetZ;
};

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
          window.ensureProdigyModalForeground(this.containerEl);
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
    return false;
  }
  

  if (typeof window !== "undefined") {
    window.__prodigyDashboardSections = window.__prodigyDashboardSections || new Map();
    window.__prodigyRefreshAuctionDashboard = window.__prodigyRefreshAuctionDashboard || function() {
      if (!window.__prodigyDashboardSections) return;
      for (const [key, runner] of window.__prodigyDashboardSections.entries()) {
        try {
          if (typeof runner === "function") runner();
        } catch (err) {
          console.error("Dashboard section refresh failed:", key, err);
        }
      }
    };
  }

  // Dataview API is passed from the DataviewJS block or retrieved globally
  const dataviewInstance = options.dv || (typeof window !== "undefined" && window.dv) || (typeof dv !== 'undefined' ? dv : null);
  if (!dataviewInstance) {
    container.createEl("span", { text: "Error: Dataview API not found." });
    return false;
  }

  const getCurrentPage = () => {
    if (dataviewInstance && typeof dataviewInstance.current === "function") {
      return dataviewInstance.current() || {};
    }
    const appInst = typeof app !== "undefined" ? app : (typeof window !== "undefined" ? window.app : null);
    const activePath = appInst?.workspace?.getActiveFile?.()?.path || "HUB/10 Auction.md";
    if (dataviewInstance && typeof dataviewInstance.page === "function") {
      return dataviewInstance.page(activePath) || {};
    }
    return {};
  };
  const auctionStateStore = type === "auction_case"
    ? options.stateStore
      || (typeof window !== "undefined" && window.prodigyAuctionWorkspaceStateStore)
      || (typeof window !== "undefined" && window.ProdigyWorkspaceNavigation?.getStateStore?.())
    : null;
  if (type === "auction_case" && (!auctionStateStore
    || typeof auctionStateStore.getWorkspaceState !== "function"
    || typeof auctionStateStore.setWorkspaceState !== "function")) {
    container.createEl("span", {
      text: "옥션 화면 상태를 불러오지 못했습니다.",
      attr: { class: "prodigy-status-line", "data-state": "error" }
    });
    return false;
  }
  const getAuctionState = () => auctionStateStore
    ? auctionStateStore.getWorkspaceState("auction") || {}
    : {};
  const initialAuctionState = getAuctionState();
  const initialFilters = initialAuctionState.filters || {};
  let searchInput = null;
  let filterSummary = null;
  let filterReset = null;

  // Render inline filters for Auction cases
  if (type === "auction_case" && status === "bidding") {
    const isMobile = ((typeof window !== "undefined" && window.app?.isMobile) || (typeof document !== "undefined" && document.body?.classList?.contains('is-mobile'))) || (typeof window !== "undefined" && window.innerWidth <= 833);

    const filterContainer = container.createEl("div", {
      attr: {
        class: "auction-filter-bar",
        style: isMobile
          ? "display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; width: 100%;"
          : "display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 8px; width: 100%;"
      }
    });
    window.ProdigyAuctionNativeScenes?.register?.("filters", filterContainer);

    // Simple search input box for case name / number
    searchInput = filterContainer.createEl("input", {
      type: "text",
      value: initialFilters.search || "",
      placeholder: "사건번호/물건명 검색...",
      attr: {
        class: "auction-filter-search",
        style: isMobile
          ? "font-size:var(--ke-type-body);padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);border:1px solid var(--ke-color-border,var(--background-modifier-border));background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));width:100%;min-block-size:var(--ke-touch-target);box-sizing:border-box;"
          : "font-size:var(--ke-type-label);padding:var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);border:1px solid var(--ke-color-border,var(--background-modifier-border));background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));width:150px;margin-inline-end:auto;min-block-size:var(--ke-touch-target);box-sizing:border-box;"
      }
    });

    searchInput.oninput = () => {
      const current = getAuctionState();
      auctionStateStore.setWorkspaceState("auction", {
        filters: { ...(current.filters || {}), search: searchInput.value }
      });
      if (typeof window !== "undefined" && typeof window.__prodigyRefreshAuctionDashboard === "function") {
        window.__prodigyRefreshAuctionDashboard();
      }
    };

    searchInput.onfocus = () => { if (typeof window !== "undefined") window.auctionSearchFocus = true; };
    searchInput.onblur = () => { if (typeof window !== "undefined") window.auctionSearchFocus = false; };

    if (typeof window !== "undefined" && window.auctionSearchFocus) {
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

    const makeSelectInline = (parent, label, field, selectOptions, currentVal) => {
      const wrapper = parent.createEl('div', { attr: { class: "auction-filter-select", style: 'display:flex;align-items:center;gap:var(--ke-space-2);font-size:var(--ke-type-label);color:var(--ke-color-muted,var(--text-muted));' } });
      wrapper.createEl('span', { text: label, attr: { style: 'font-weight: bold;' } });
      
      const sel = wrapper.createEl('select', { 
        attr: { 
          style: isMobile
            ? 'font-size:var(--ke-type-label);padding:var(--ke-space-2) var(--ke-space-4) var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));border:1px solid var(--ke-color-border,var(--background-modifier-border));cursor:pointer;min-block-size:var(--ke-touch-target);box-sizing:border-box;line-height:var(--ke-leading-control);font-family:inherit;'
            : 'font-size:var(--ke-type-label);padding:var(--ke-space-2) var(--ke-space-4) var(--ke-space-2) var(--ke-space-3);border-radius:var(--ke-radius-control);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));border:1px solid var(--ke-color-border,var(--background-modifier-border));cursor:pointer;min-block-size:var(--ke-touch-target);box-sizing:border-box;line-height:var(--ke-leading-control);font-family:inherit;'
        } 
      });
      
      selectOptions.forEach(o => {
        const opt = sel.createEl('option', { text: o.text, value: o.value });
        if (o.value === String(currentVal !== undefined && currentVal !== null ? currentVal : o.value)) {
          opt.selected = true;
        }
      });
      
    sel.onchange = () => {
      const current = getAuctionState();
      if (field.startsWith("card_sort_")) {
        auctionStateStore.setWorkspaceState("auction", {
          sort: { ...(current.sort || {}), [status]: sel.value }
        });
      } else {
        auctionStateStore.setWorkspaceState("auction", {
          filters: { ...(current.filters || {}), [field]: sel.value }
        });
      }
      if (field === "card_region" && typeof window !== "undefined") window.__prodigyAuctionActiveRegionScope = null;
      if (typeof window !== "undefined" && typeof window.__prodigyRefreshAuctionDashboard === "function") {
        window.__prodigyRefreshAuctionDashboard();
      }
    };
  };

    const regionScope = (typeof window !== "undefined" && window.__prodigyAuctionActiveRegionScope && typeof window.__prodigyAuctionActiveRegionScope === "object")
      ? window.__prodigyAuctionActiveRegionScope
      : null;
    const initialRegion = regionScope?.region_sido || initialFilters.card_region || "전체지역";
    const initialType = initialFilters.card_type || "전체종류";

    makeSelectInline(dropdownParent, '지역:', 'card_region', [
      { text: '전체', value: '전체지역' },
      { text: '서울', value: '서울특별시' },
      { text: '부산', value: '부산광역시' },
      { text: '대구', value: '대구광역시' },
      { text: '인천', value: '인천광역시' },
      { text: '광주', value: '광주광역시' },
      { text: '대전', value: '대전광역시' },
      { text: '울산', value: '울산광역시' },
      { text: '세종', value: '세종특별자치시' },
      { text: '경기', value: '경기도' },
      { text: '강원', value: '강원특별자치도' },
      { text: '충북', value: '충청북도' },
      { text: '충남', value: '충청남도' },
      { text: '전북', value: '전북특별자치도' },
      { text: '전남', value: '전라남도' },
      { text: '경북', value: '경상북도' },
      { text: '경남', value: '경상남도' },
      { text: '제주', value: '제주특별자치도' }
    ], initialRegion);

    if (!isMobile) {
      dropdownParent.createEl('span', { text: '|', attr: { class: "auction-filter-separator", style: 'color:var(--ke-color-border,var(--background-modifier-border));font-size:var(--ke-type-label);' } });
    }

    makeSelectInline(dropdownParent, '종류:', 'card_type', [
      { text: '전체', value: '전체종류' },
      { text: '오피스텔', value: '오피스텔' },
      { text: '아파트', value: '아파트' },
      { text: '다가구', value: '다가구' },
      { text: '다세대', value: '다세대' },
      { text: '주택', value: '주택' },
      { text: '상가', value: '상가' },
      { text: '숙박', value: '숙박' },
      { text: '노유자시설', value: '노유자시설' },
      { text: '지식산업센터', value: '지식산업센터' },
      { text: '공장', value: '공장' }
    ], initialType);

    if (!isMobile) {
      dropdownParent.createEl('span', { text: '|', attr: { class: "auction-filter-separator", style: 'color:var(--ke-color-border,var(--background-modifier-border));font-size:var(--ke-type-label);' } });
    }

    const sortKeyField = `card_sort_${status}`;
    let defaultSort = "dday_asc";
    if (status !== "bidding" && status !== "watching") {
      defaultSort = "dday_desc";
    }

    const initialSort = initialAuctionState.sort?.[status] || defaultSort;
    makeSelectInline(dropdownParent, '정렬:', sortKeyField, [
      { text: '마감 임박순', value: 'dday_asc' },
      { text: '마감 여유순', value: 'dday_desc' },
      { text: '감정가 낮은순', value: 'expected_bid_asc' },
      { text: '감정가 높은순', value: 'expected_bid_desc' },
      { text: '최근 등록순', value: 'created_desc' }
    ], initialSort);
    filterSummary = filterContainer.createEl("span", {
      attr: {
        class: "auction-filter-summary",
        role: "status",
        "aria-live": "polite"
      }
    });
    filterReset = filterContainer.createEl("button", {
      text: "필터 초기화",
      attr: {
        type: "button",
        class: "prodigy-btn prodigy-btn-chip auction-filter-reset"
      }
    });
    filterReset.onclick = () => {
      const current = getAuctionState();
      auctionStateStore.setWorkspaceState("auction", {
        filters: {
          ...(current.filters || {}),
          card_region: "전체지역",
          card_type: "전체종류",
          search: ""
        }
      });
      if (searchInput) searchInput.value = "";
      if (typeof window !== "undefined") {
        window.__prodigyAuctionActiveRegionScope = null;
        window.__prodigyRefreshAuctionDashboard?.();
      }
    };
  }

  // Setup cards container
  let targetContainer = container;
  let collapsedDetails = null;
  if (type === "auction_case" && status === "bidding") {
    targetContainer = container.createEl("div", {
      attr: { class: "auction-section-cards-mount" }
    });
  } else if (isCollapsed) {
    const details = container.createEl("details", {
      attr: { class: "prodigy-utility-card", style: "margin-block-end:var(--ke-space-3);background:var(--ke-color-surface-secondary,var(--background-secondary));border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-configurator);padding:var(--ke-space-3);inline-size:100%;" }
    });
    collapsedDetails = details;
    details.createEl("summary", {
      text: summaryText,
      attr: { style: `font-weight:700;cursor:pointer;color:${summaryColor};font-size:var(--ke-type-heading);line-height:var(--ke-leading-control);min-block-size:var(--ke-touch-target);` }
    });
    targetContainer = details.createEl("div", {
      attr: { style: "margin-block-start:var(--ke-space-3);" }
    });
  }

  let reconnectObserver = null;
  let reconnectEventCleanup = null;
  const containerConnected = () => {
    if (typeof container.isConnected !== "boolean") return true;
    if (container.isConnected) return true;
    return typeof document !== "undefined"
      && typeof document.contains === "function"
      && document.contains(container);
  };
  const renderWhenConnected = () => {
    if (reconnectObserver || reconnectEventCleanup) return;
    const documentRef = container.ownerDocument || (typeof document !== "undefined" ? document : null);
    const observationRoot = documentRef && (documentRef.documentElement || documentRef.body);
    if (!observationRoot) return;
    const clearReconnectWatchers = () => {
      if (reconnectObserver && typeof reconnectObserver.disconnect === "function") reconnectObserver.disconnect();
      reconnectObserver = null;
      if (reconnectEventCleanup) reconnectEventCleanup();
      reconnectEventCleanup = null;
    };
    const onConnected = () => {
      if (!containerConnected()) return;
      clearReconnectWatchers();
      renderCards();
    };
    if (typeof container.addEventListener === "function") {
      container.addEventListener("prodigy-auction-section-connected", onConnected);
      reconnectEventCleanup = () => container.removeEventListener("prodigy-auction-section-connected", onConnected);
    }
    const scope = typeof window !== "undefined" && window.__prodigyAuctionMountScope;
    if (scope && typeof scope.observe === "function") {
      reconnectObserver = scope.observe(observationRoot, { childList: true, subtree: true }, onConnected);
      return;
    }
    const Observer = documentRef.defaultView?.MutationObserver
      || (typeof MutationObserver === "function" ? MutationObserver : null);
    if (typeof Observer !== "function") return;
    reconnectObserver = new Observer(onConnected);
    reconnectObserver.observe(observationRoot, { childList: true, subtree: true });
  };

  const renderCards = () => {
    if (!containerConnected()) {
      renderWhenConnected();
      return false;
    }
    if (reconnectObserver) {
      reconnectObserver.disconnect();
      reconnectObserver = null;
    }
    if (reconnectEventCleanup) {
      reconnectEventCleanup();
      reconnectEventCleanup = null;
    }
    if (collapsedDetails && !collapsedDetails.open) {
      targetContainer.empty();
      return true;
    }

    const fm = getCurrentPage();
    const auctionState = getAuctionState();
    const filters = auctionState.filters || {};
    const filterCategory = fm.card_category || "전체";
    const filterStatus = type === "auction_case" ? "전체" : (fm.card_status || "전체");
    const regionScope = (typeof window !== "undefined" && window.__prodigyAuctionActiveRegionScope && typeof window.__prodigyAuctionActiveRegionScope === "object")
      ? window.__prodigyAuctionActiveRegionScope
      : null;
    const filterRegion = regionScope && regionScope.region_sido
      ? regionScope.region_sido
      : (filters.card_region !== undefined ? filters.card_region : "전체지역");
    const filterSigungu = regionScope && regionScope.region_sigungu
      ? String(regionScope.region_sigungu).trim()
      : "";
    const filterType = filters.card_type !== undefined ? filters.card_type : "전체종류";

    // Status filtering check
    if (filterStatus !== "전체" && filterStatus !== status) {
      targetContainer.empty();
      return true;
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

    // The search input exists only in the bidding section.
    if (type === "auction_case" && status === "bidding" && filters.search) {
      const q = String(filters.search).toLowerCase().trim();
      pages = pages.where(p => {
        const caseNum = String(p.case_number || p.file.name || "").toLowerCase();
        const addr = String(p.address || "").toLowerCase();
        return caseNum.includes(q) || addr.includes(q);
      });
    }

    // Project type filter: all | business | work | personal | uncategorized
    if (type === "project") {
      const projectTypeFilter = options.projectTypeFilter
        || (typeof window !== "undefined" && window.prodigyProjectTypeFilter)
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

    const canonicalFilterSido = (value) => {
      const sido = String(value || "").trim();
      if (sido === "강원도") return "강원특별자치도";
      if (sido === "전라북도") return "전북특별자치도";
      return sido;
    };
    // Filters
    if (type === "project" && filterCategory !== "전체") {
      pages = pages.where(p => p.category === filterCategory);
    }
    if (type === "auction_case") {
      if (filterRegion !== "전체지역") {
        pages = pages.where(p => canonicalFilterSido(p.region_sido || "").includes(filterRegion));
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
    const filterSort = type === "auction_case"
      ? (auctionState.sort?.[status] || defaultSort)
      : (fm[sortKeyField] || defaultSort);

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
        const val = ((typeof window !== "undefined" && window.parsePrice) || Number)(p.expected_bid);
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
    if (filterSummary && status === "bidding") {
      const activeFilters = [];
      if (filterRegion !== "전체지역") activeFilters.push(filterRegion);
      if (filterType !== "전체종류") activeFilters.push(filterType);
      if (filters.search) activeFilters.push(`검색 ${String(filters.search).trim()}`);
      filterSummary.textContent = `${activeFilters.length ? `${activeFilters.join(" · ")} · ` : ""}입찰 예정 ${pageList.length}건`;
      if (filterReset) filterReset.disabled = activeFilters.length === 0;
    }

    targetContainer.empty();

    // Auction cards need the mutation module. A partial iCloud sync (new
    // auction-card.js without auction-card-mutation.js, frequent on iPad)
    // must not explode into one error Notice per card: show a single retry
    // row for the whole section instead.
    if (type === "auction_case" && typeof window !== "undefined"
      && (!window.AuctionCardMutation || typeof window.AuctionCardMutation.create !== "function")) {
      const syncBox = targetContainer.createEl("div", {
        attr: { class: "prodigy-status-line", "data-state": "sync-pending", style: "margin:var(--ke-space-2) 0;" }
      });
      syncBox.createEl("span", { text: "옥션 모듈을 동기화하는 중입니다. iCloud 동기화가 끝나면 다시 시도해 주세요." });
      const syncRetry = syncBox.createEl("button", {
        text: "다시 시도",
        attr: { type: "button", class: "prodigy-btn prodigy-btn-chip", style: "margin-inline-start:8px;" }
      });
      syncRetry.onclick = async () => {
        syncRetry.disabled = true;
        try {
          const appInst = (typeof app !== "undefined" && app && app.vault)
            ? app
            : (typeof window !== "undefined" ? window.app : null);
          const loader = typeof window !== "undefined" ? window.ProdigyHubLoader : null;
          if (loader && typeof loader.retry === "function") {
            loader.retry([
              "SYSTEM/Views/auction-card-mutation.js",
              "SYSTEM/Views/auction-card.js"
            ], { app: appInst, rerun_loaded: true });
          }
          if (loader && typeof loader.loadScript === "function" && appInst) {
            await loader.loadScript(appInst, "SYSTEM/Views/auction-card-mutation.js");
          }
        } catch (_) { /* fall through: re-render shows the row again */ }
        renderCards();
      };
      return true;
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
    return true;
  };

  if (type === "auction_case" && typeof window !== "undefined") {
    window.__prodigyDashboardSections = window.__prodigyDashboardSections || new Map();
    window.__prodigyDashboardSections.set(`${type}_${status}`, renderCards);
  }
  if (collapsedDetails) collapsedDetails.ontoggle = () => renderCards();

  // Initial render
  return renderCards();
};
