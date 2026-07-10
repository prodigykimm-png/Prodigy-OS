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
  
  // 1. Get active file frontmatter filters
  const file = app.workspace.getActiveFile();
  if (!file) return;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter ?? {};
  
  const filterCategory = fm.card_category || "전체";
  const filterStatus = fm.card_status || "전체";
  const filterRegion = fm.card_region || "전체지역";
  const filterType = fm.card_type || "전체종류";
  
  // 2. Status filtering check
  if (filterStatus !== "전체" && filterStatus !== status) {
    return;
  }
  
  // 3. Query pages based on type
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
  
  // Dataview global API is accessible as a global variable "dv" inside DataviewJS execution
  // In our external script context, "dv" can be accessed via window.DataviewAPI or passed explicitly.
  // Wait, Dataview exposes a global variable "dv" when running a DataviewJS block.
  // Since we execute this via new Function("dv", content)(dv), or let it evaluate in global scope,
  // we can use "window.DataviewAPI" or simply pass the "dv" instance.
  // Let's use options.dv (passed from the DataviewJS block) to make it 100% robust and reliable!
  const dataviewInstance = options.dv || window.dv || (typeof dv !== 'undefined' ? dv : null);
  if (!dataviewInstance) {
    container.createEl("span", { text: "Error: Dataview API not found." });
    return;
  }
  
  let pages = dataviewInstance.pages(`"${folderPath}"`).where(p => p.type === type && p.status === status);
  
  // 4. Filters
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
  
  // 5. Sort
  pages = pages.sort(p => p[sortField] || "", sortOrder);
  
  // 6. Setup container
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
  
  // 7. Render
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
