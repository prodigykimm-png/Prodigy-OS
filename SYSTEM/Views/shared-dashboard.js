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
  const filterRegion = fm.card_region || "전체지역";
  const filterType = fm.card_type || "전체종류";
  
  // Status filtering check
  if (filterStatus !== "전체" && filterStatus !== status) {
    return;
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
  
  // Filters
  if (type === "project" && filterCategory !== "전체") {
    pages = pages.where(p => p.category === filterCategory);
  }
  if (type === "auction_case") {
    if (filterRegion !== "전체지역") {
      pages = pages.where(p => (p.region_sido || "").includes(filterRegion));
    }
    if (filterType !== "전체종류") {
      pages = pages.where(p => (p.property_type || "").includes(filterType));
    }
  }
  
  // Sort
  pages = pages.sort(p => p[sortField] || "", sortOrder);
  
  // Setup container
  let targetContainer = container;
  if (isCollapsed) {
    const details = container.createEl("details", {
      attr: { style: "margin-bottom:12px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; width: 100%;" }
    });
    details.createEl("summary", {
      text: summaryText,
      attr: { style: `font-weight:bold; cursor:pointer; color:${summaryColor}; font-size:1.1em;` }
    });
    targetContainer = details.createEl("div", {
      attr: { style: "margin-top:10px;" }
    });
  }
  
  // Render
  if (pages.length === 0) {
    if (isCollapsed) {
      targetContainer.createEl("span", {
        text: emptyMessage,
        attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em; display:block; margin: 4px 0;" }
      });
    } else {
      const emptyDiv = targetContainer.createEl("div", {
        attr: { style: "margin: 4px 0;" }
      });
      emptyDiv.createEl("span", {
        text: emptyMessage,
        attr: { style: "color:var(--text-muted); font-style:italic; font-size:0.9em;" }
      });
    }
  } else {
    pages.forEach(p => renderer(p, targetContainer));
  }
};
