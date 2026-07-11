window.renderReadingCard = function(p, container, mode = "simple") {
  const statusColors = {
    reading: '#22c55e',
    to_read: '#3b82f6',
    finished: '#06b6d4'
  };
  const color = statusColors[p.status] || 'var(--text-accent)';
  
  // Helper to render book cover
  const renderBookCover = (parentEl) => {
    const coverPath = p.cover || p.cover_image || p.cover_url || p.book_cover || p.image;
    if (coverPath) {
      let src = coverPath;
      if (!coverPath.startsWith("http://") && !coverPath.startsWith("https://") && !coverPath.startsWith("app://")) {
        const file = app.metadataCache.getFirstLinkpathDest(coverPath, p.file.path);
        if (file) {
          src = app.vault.getResourcePath(file);
        }
      }
      const img = parentEl.createEl('img', {
        attr: {
          src: src,
          style: 'width: 90px; height: 130px; object-fit: cover; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); cursor: pointer;'
        }
      });
      img.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    } else {
      const bookTitle = p.book_title || p.file.name;
      const author = p.author || "저자 미상";
      
      let hash = 0;
      for (let i = 0; i < bookTitle.length; i++) {
        hash = bookTitle.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash % 360);
      const colorBg = `hsl(${hue}, 55%, 38%)`;
      const colorBgLight = `hsl(${hue}, 55%, 22%)`;
      
      const cover = parentEl.createEl('div', {
        attr: {
          style: `width: 90px; height: 130px; background: linear-gradient(135deg, ${colorBg} 0%, ${colorBgLight} 100%); border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between; padding: 10px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); color: #ffffff; font-family: sans-serif; cursor: pointer; border-left: 3px solid rgba(255,255,255,0.3);`
        }
      });
      
      cover.createEl('div', {
        text: bookTitle,
        attr: {
          style: 'font-size: 0.8em; font-weight: bold; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;'
        }
      });
      
      cover.createEl('div', {
        text: author,
        attr: {
          style: 'font-size: 0.62em; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right;'
        }
      });
      
      cover.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    }
  };
  
  if (mode === "hero") {
    // 📖 Continue Reading Layout
    const card = container.createEl('div', {
      attr: {
        style: 'border: 1px solid var(--background-modifier-border); border-radius: 10px; padding: 12px; margin-bottom: 12px; background: var(--background-secondary); display: flex; gap: 16px; box-shadow: 0 4px 8px rgba(0,0,0,0.06);'
      }
    });
    
    // Left: Cover
    const coverBox = card.createEl('div', { attr: { style: 'flex-shrink: 0;' } });
    renderBookCover(coverBox);
    
    // Right: Content
    const contentBox = card.createEl('div', {
      attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 4px;' }
    });
    
    // Title & Author
    const header = contentBox.createEl('div');
    const title = header.createEl('a', {
      text: p.book_title || p.file.name,
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 1.1em; color: var(--text-normal); text-decoration: none; cursor: pointer;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    
    header.createEl('div', {
      text: p.author || "저자 미상",
      attr: { style: 'font-size: 0.8em; color: var(--text-muted); margin-top: 1px;' }
    });
    
    // Purpose (reading_purpose or purpose)
    const purpose = p.purpose || p.reading_purpose || "독서 목적이 설정되지 않았습니다.";
    const purposeRow = contentBox.createEl('div', {
      attr: { style: 'font-size: 0.82em; color: var(--text-muted); background: var(--background-primary); padding: 6px 8px; border-radius: 6px; border-left: 3px solid var(--text-accent); margin: 4px 0;' }
    });
    purposeRow.createEl('span', { text: `🎯 목적: ${purpose}` });
    
    // Progress
    if (p.current_page && p.total_page) {
      const rate = ((p.current_page / p.total_page) * 100).toFixed(0);
      const progressBox = contentBox.createEl('div', {
        attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-top: 2px;' }
      });
      
      const textRow = progressBox.createEl('div', {
        attr: { style: 'display: flex; justify-content: space-between; font-size: 0.8em; color: var(--text-normal);' }
      });
      textRow.createEl('span', { text: `진행률: ${p.current_page} / ${p.total_page} 페이지` });
      textRow.createEl('span', { text: `${rate}%` });
      
      // Progress Bar
      const barBg = progressBox.createEl('div', {
        attr: { style: 'width: 100%; height: 6px; background: var(--background-modifier-border); border-radius: 3px; overflow: hidden;' }
      });
      barBg.createEl('div', {
        attr: { style: `width: ${rate}%; height: 100%; background: #22c55e; border-radius: 3px;` }
      });
    }
    
    // Next Reading Point (next_action)
    if (p.next_action) {
      const actionRow = contentBox.createEl('div', {
        attr: { style: 'font-size: 0.85em; color: var(--text-normal); margin-top: 4px;' }
      });
      actionRow.createEl('strong', { text: '→ Next Reading Point: ', attr: { style: 'color: var(--text-accent);' } });
      actionRow.createEl('span', { text: p.next_action });
    }
    
  } else if (mode === "simple") {
    // 📝 Review Needed Layout (Simple Card)
    const card = container.createEl('div', {
      attr: {
        style: `border: 1px solid var(--background-modifier-border); border-left: 4px solid ${color}; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--background-secondary); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.06);`
      }
    });
    
    const left = card.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 2px;' } });
    const title = left.createEl('a', {
      text: p.book_title || p.file.name,
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 0.9em; color: var(--text-normal); text-decoration: none; cursor: pointer;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    
    left.createEl('div', {
      text: p.author || "저자 미상",
      attr: { style: 'font-size: 0.78em; color: var(--text-muted);' }
    });
    
    const right = card.createEl('span', {
      text: '리뷰 대기',
      attr: { style: 'font-size: 0.72em; font-weight: bold; color: #f97316; background: #f9731615; padding: 2px 6px; border-radius: 4px;' }
    });
    
  } else if (mode === "grid") {
    // 📚 Reading Queue (Library-style grid element)
    const gridItem = container.createEl('div', {
      attr: {
        style: 'display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100px; text-align: center;'
      }
    });
    
    renderBookCover(gridItem);
    
    const title = gridItem.createEl('a', {
      text: p.book_title || p.file.name,
      attr: {
        class: 'internal-link',
        style: 'font-weight: bold; font-size: 0.78em; color: var(--text-normal); text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.4em; line-height: 1.2; width: 100%; cursor: pointer;'
      }
    });
    title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
    
  } else if (mode === "cover_only") {
    // ✅ Recently Finished (Covers only)
    const item = container.createEl('div', {
      attr: {
        style: 'position: relative; width: 90px; height: 130px; cursor: pointer;',
        title: `${p.book_title || p.file.name} - ${p.author || "저자 미상"}`
      }
    });
    renderBookCover(item);
  }
};
