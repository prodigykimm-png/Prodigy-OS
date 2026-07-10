window.renderReadingCard = function(p, container) {
  const statusColors = {
    reading: '#22c55e',
    completed: '#06b6d4',
    wishlist: '#888888'
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
  
  // Subtitle/Author
  const subHeader = card.createEl('div', {
    attr: { style: 'font-size: 0.8em; color: var(--text-muted);' }
  });
  subHeader.createEl('span', { text: p.author || "저자 미상" });
  
  // Progress Info
  if (p.current_page && p.total_page) {
    const rate = ((p.current_page / p.total_page) * 100).toFixed(0);
    const progressRow = card.createEl('div', {
      attr: { style: 'font-size: 0.8em; color: var(--text-normal); margin-top: 2px;' }
    });
    progressRow.createEl('span', { text: `진행률: ${p.current_page} / ${p.total_page} (${rate}%)` });
  }
  
  // Next Action
  if (p.next_action) {
    const actionRow = card.createEl('div', {
      attr: { style: 'font-size: 0.82em; color: var(--text-normal); margin-top: 1px;' }
    });
    actionRow.createEl('strong', { text: '→ Next Action: ', attr: { style: 'color: var(--text-accent);' } });
    actionRow.createEl('span', { text: p.next_action });
  }
};
