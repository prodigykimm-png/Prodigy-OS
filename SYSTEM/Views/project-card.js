window.normalizeProjectType = function(value) {
  if (window.ProjectWizardCore && window.ProjectWizardCore.normalizeProjectType) {
    return window.ProjectWizardCore.normalizeProjectType(value);
  }
  const raw = String(value == null ? "" : value).trim().toLowerCase();
  if (raw === "business" || raw === "work" || raw === "personal") return raw;
  return "uncategorized";
};

window.projectTypeLabel = function(value) {
  if (window.ProjectWizardCore && window.ProjectWizardCore.projectTypeLabel) {
    return window.ProjectWizardCore.projectTypeLabel(value);
  }
  const labels = { business: "사업", work: "회사", personal: "개인", uncategorized: "미분류" };
  return labels[window.normalizeProjectType(value)] || "미분류";
};

window.renderProjectCard = function(p, container) {
  if (window.ProdigyUI) window.ProdigyUI.ensureStyles();
  const display = window.prodigyDisplay;
  const color = display?.statusInfo(p.status).color || C.neutral800 || "#555";
  const projectType = window.normalizeProjectType(p.project_type);
  const projectTypeLabel = window.projectTypeLabel(projectType);
  const typeColors = {
    business: C.info || "#3b82f6",
    work: C.warning || "#f97316",
    personal: C.accentAlt || "#a855f7",
    uncategorized: C.neutral500 || "#8e8e93"
  };
  const typeColor = typeColors[projectType] || typeColors.uncategorized;
  
  const card = container.createEl('div', {
    attr: {
      style: `border: 1px solid var(--background-modifier-border); border-left: 4px solid ${color}; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--background-secondary); display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 4px ${T.SHADOWS ? T.SHADOWS.md : "0 2px 6px rgba(0,0,0,0.08)"};`
    }
  });
  
  // Header
  const header = card.createEl('div', {
    attr: { style: 'display: flex; justify-content: space-between; align-items: center;' }
  });
  
  const titleContainer = header.createEl('div', {
    attr: { style: 'display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap;' }
  });

  titleContainer.createEl('span', {
    text: projectTypeLabel,
    attr: {
      style: `font-size:0.68em;font-weight:700;color:${typeColor};background:${typeColor}18;border:1px solid ${typeColor}55;padding:1px 6px;border-radius:999px;white-space:nowrap;`
    }
  });

  const title = titleContainer.createEl('a', {
    text: p.file.name,
    attr: {
      class: 'internal-link',
      style: 'font-weight: bold; font-size: 0.95em; color: var(--text-normal); text-decoration: none; cursor: pointer; overflow-wrap: anywhere;'
    }
  });
  title.onclick = () => app.workspace.openLinkText(p.file.name, p.file.path);
  
  // Delete Button (Trash Icon) next to Title link
  const deleteBtn = titleContainer.createEl('span', {
    text: '🗑️',
    attr: {
      style: 'cursor: pointer; opacity: 0.4; font-size: 0.85em; transition: opacity 0.2s; flex-shrink: 0;',
      title: '이 프로젝트 노트를 삭제(휴지통 이동)합니다.'
    }
  });
  deleteBtn.onmouseenter = () => deleteBtn.style.opacity = '1';
  deleteBtn.onmouseleave = () => deleteBtn.style.opacity = '0.4';
  deleteBtn.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    const confirmDelete = confirm(`[${p.file.name}] 프로젝트 노트를 휴지통으로 이동하시겠습니까?`);
    if (confirmDelete) {
      try {
        const file = app.vault.getAbstractFileByPath(p.file.path);
        if (file) {
          await app.vault.trash(file, true);
          new Notice(`[${p.file.name}] 노트를 휴지통으로 이동했습니다.`);
        } else {
          new Notice("파일을 찾을 수 없습니다.");
        }
      } catch (err) {
        console.error("파일 삭제 중 오류 발생:", err);
        new Notice("노트 삭제 중 오류가 발생했습니다.");
      }
    }
  };
  
  // Priority Badge
  const rightHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px;' } });
  const priorityLabel = display?.priority(p.priority) || p.priority || '보통';
  const priColor = priorityLabel === '높음' || priorityLabel === '매우 높음'
    ? C.error || "#ef4444"
    : priorityLabel === '낮음' || priorityLabel === '매우 낮음'
      ? C.neutral500 || "#8e8e93"
      : 'var(--text-accent)';
  rightHeader.createEl('span', {
    text: priorityLabel,
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
  actionRow.createEl('strong', { text: '다음 행동: ', attr: { style: 'color: var(--text-accent);' } });
  actionRow.createEl('span', { text: p.next_action || "설정 필요" });
  
  // Buttons
  const getTransitions = (currentStatus) => {
    const trans = {
      idea: [{ key: 'planning' }],
      planning: [
        { key: 'doing' },
        { key: 'blocked' }
      ],
      doing: [
        { key: 'completed' },
        { key: 'blocked' }
      ],
      blocked: [
        { key: 'doing' },
        { key: 'planning' }
      ],
      completed: [{ key: 'reviewing' }],
      reviewing: [{ key: 'archived' }],
      archived: []
    };
    return trans[currentStatus] || [];
  };
  
  const buttons = getTransitions(p.status || 'idea');
  if (buttons.length > 0) {
    const btnBox = card.createEl('div', {
      attr: { class: 'prodigy-card-actions', style: 'margin-top: 6px; border-top: 1px solid var(--background-modifier-border); padding-top: 8px;' }
    });
    btnBox.createEl('span', { text: '상태 변경', attr: { style: 'font-size: 0.75em; color: var(--text-muted); display: flex; align-items: center; margin-right: 2px;' } });
    buttons.forEach(opt => {
      const statusInfo = display?.statusInfo(opt.key) || { label: opt.key, color: C.neutral800 || "#555" };
      const btn = window.ProdigyUI
        ? window.ProdigyUI.button(btnBox, statusInfo.label, {
          chip: true,
          onClick: async () => {
            btn.disabled = true;
            const tFile = app.vault.getAbstractFileByPath(p.file.path);
            if (tFile) {
              await app.fileManager.processFrontMatter(tFile, (fm) => {
                fm.status = opt.key;
                fm.updated = new Date().toISOString().split('T')[0];
              });
            }
          }
        })
        : btnBox.createEl('button', { text: statusInfo.label, attr: { type: 'button', class: 'prodigy-btn prodigy-btn-chip' } });
      if (!window.ProdigyUI) {
        btn.onclick = async (e) => {
          e.preventDefault();
          btn.disabled = true;
          const tFile = app.vault.getAbstractFileByPath(p.file.path);
          if (tFile) {
            await app.fileManager.processFrontMatter(tFile, (fm) => {
              fm.status = opt.key;
              fm.updated = new Date().toISOString().split('T')[0];
            });
          }
        };
      }
    });
  }
};
