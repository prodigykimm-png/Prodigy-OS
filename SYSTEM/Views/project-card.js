window.renderProjectCard = function(p, container) {
  const statusColors = {
    idea: '#a855f7',
    planning: '#3b82f6',
    doing: '#22c55e',
    blocked: '#ef4444',
    completed: '#06b6d4',
    reviewing: '#f97316',
    archived: '#8e8e93'
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
  
  // Priority Badge
  const rightHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px;' } });
  const priColor = p.priority === '높음' ? '#ef4444' : p.priority === '낮음' ? '#8e8e93' : 'var(--text-accent)';
  rightHeader.createEl('span', {
    text: p.priority || '보통',
    attr: { style: `font-size: 0.72em; font-weight: bold; color: ${priColor}; background: ${priColor}15; padding: 1px 4px; border-radius: 4px;` }
  });
  
  // Category & Dates
  const subHeader = card.createEl('div', {
    attr: { style: 'font-size: 0.8em; color: var(--text-muted); display: flex; gap: 6px; align-items: center;' }
  });
  subHeader.createEl('span', { text: p.category || "미지정" });
  if (p.due_date) {
    subHeader.createEl('span', { text: '·', attr: { style: 'color: var(--text-muted);' } });
    subHeader.createEl('span', { text: `마감일: ${p.due_date}` });
  }
  
  // Next Action
  const actionRow = card.createEl('div', {
    attr: { style: 'font-size: 0.85em; color: var(--text-normal); margin-top: 2px;' }
  });
  actionRow.createEl('strong', { text: '→ Next Action: ', attr: { style: 'color: var(--text-accent);' } });
  actionRow.createEl('span', { text: p.next_action || "⚠️ 설정 필요" });
  
  // Buttons
  const getTransitions = (currentStatus) => {
    const trans = {
      idea: [{ key: 'planning', label: '📋 기획', color: 'var(--text-accent)' }],
      planning: [
        { key: 'doing', label: '🚀 진행', color: '#22c55e' },
        { key: 'blocked', label: '🚧 지연', color: '#ef4444' }
      ],
      doing: [
        { key: 'completed', label: '✅ 완료', color: '#06b6d4' },
        { key: 'blocked', label: '🚧 지연', color: '#ef4444' }
      ],
      blocked: [
        { key: 'doing', label: '🚀 진행', color: '#22c55e' },
        { key: 'planning', label: '📋 기획', color: 'var(--text-accent)' }
      ],
      completed: [{ key: 'reviewing', label: '🔄 복기', color: '#f97316' }],
      reviewing: [{ key: 'archived', label: '📦 보관', color: '#555' }],
      archived: []
    };
    return trans[currentStatus] || [];
  };
  
  const buttons = getTransitions(p.status || 'idea');
  if (buttons.length > 0) {
    const btnBox = card.createEl('div', {
      attr: { style: 'display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; border-top: 1px solid var(--background-modifier-border); padding-top: 4px;' }
    });
    btnBox.createEl('span', { text: '상태 변경:', attr: { style: 'font-size: 0.72em; color: var(--text-muted); display: flex; align-items: center; margin-right: 4px;' } });
    buttons.forEach(opt => {
      const btn = btnBox.createEl('button', {
        text: opt.label,
        attr: { style: `font-size: 0.7em; padding: 1px 4px; border-radius: 3px; background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid ${opt.color}; cursor: pointer;` }
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
