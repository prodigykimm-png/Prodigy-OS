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
          contentEl.createEl("h3", { text: title, attr: { style: "margin-bottom: 12px; font-size: 1.2em;" } });
          
          let inputVal = value;
          new Setting(contentEl)
            .setName(placeholder)
            .addText((text) => {
              text.setValue(value);
              text.onChange((val) => {
                inputVal = val;
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

  // Render inline filters for Auction cases
  if (type === "auction_case") {
    const filterContainer = container.createEl("div", {
      attr: { style: "display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 8px;" }
    });

    const makeSelectInline = (parent, label, field, options, currentVal) => {
      const wrapper = parent.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 4px; font-size: 0.78em; color: var(--text-muted);' } });
      wrapper.createEl('span', { text: label, attr: { style: 'font-weight: bold;' } });
      
      const sel = wrapper.createEl('select', { 
        attr: { 
          style: 'font-size: 0.95em; padding: 1px 4px; border-radius: 4px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid var(--background-modifier-border); cursor: pointer;' 
        } 
      });
      
      options.forEach(o => {
        const opt = sel.createEl('option', { text: o.text, value: o.value });
        if (o.value === String(currentVal !== undefined && currentVal !== null ? currentVal : o.value)) {
          opt.selected = true;
        }
      });
      
      sel.onchange = async () => {
        const file = app.workspace.getActiveFile();
        if (file) {
          await app.fileManager.processFrontMatter(file, (fm) => {
            fm[field] = sel.value;
          });
        }
      };
    };

    makeSelectInline(filterContainer, '지역:', 'card_region', [
      { text: '전체', value: '전체지역' },
      { text: '서울', value: '서울' },
      { text: '경기', value: '경기' },
      { text: '인천', value: '인천' },
      { text: '부산', value: '부산' }
    ], fm.card_region);

    filterContainer.createEl('span', { text: '|', attr: { style: 'color: var(--background-modifier-border); font-size: 0.8em;' } });

    makeSelectInline(filterContainer, '종류:', 'card_type', [
      { text: '전체', value: '전체종류' },
      { text: '오피스텔', value: '오피스텔' },
      { text: '아파트', value: '아파트' },
      { text: '상가', value: '상가' },
      { text: '지식산업센터', value: '지식산업센터' }
    ], fm.card_type);
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
