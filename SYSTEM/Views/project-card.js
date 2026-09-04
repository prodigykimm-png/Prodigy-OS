(function (root) {
  "use strict";

  function normalizeProjectType(value) {
    if (root.ProjectWizardCore && root.ProjectWizardCore.normalizeProjectType) {
      return root.ProjectWizardCore.normalizeProjectType(value);
    }
    const raw = String(value == null ? "" : value).trim().toLowerCase();
    if (["business", "work", "personal"].includes(raw)) return raw;
    return "uncategorized";
  }

  function projectTypeLabel(value) {
    if (root.ProjectWizardCore && root.ProjectWizardCore.projectTypeLabel) {
      return root.ProjectWizardCore.projectTypeLabel(value);
    }
    return {
      business: "사업",
      work: "회사",
      personal: "개인",
      uncategorized: "미분류"
    }[normalizeProjectType(value)] || "미분류";
  }

  function createButton(parent, label, options) {
    const opts = options || {};
    if (root.ProdigyUI && typeof root.ProdigyUI.button === "function") {
      return root.ProdigyUI.button(parent, label, opts);
    }
    const classes = ["prodigy-btn", opts.className || ""].filter(Boolean).join(" ");
    return parent.createEl("button", {
      text: label || "",
      attr: { type: opts.type || "button", class: classes }
    });
  }

  function setAccessibleName(element, label) {
    if (!element) return;
    if (typeof element.setAttribute === "function") {
      element.setAttribute("aria-label", label);
      element.setAttribute("title", label);
    } else {
      element.ariaLabel = label;
      element.title = label;
    }
  }

  function setIcon(element, iconName, fallback) {
    const setter = root.setIcon || (root.obsidian && root.obsidian.setIcon);
    if (typeof setter === "function") {
      setter(element, iconName);
      return;
    }
    if (element) element.textContent = fallback || "";
  }

  function statusColorToken(status) {
    const key = String(status || "").trim().toLowerCase();
    if (["blocked", "lost"].includes(key)) return "var(--ke-color-error)";
    if (["completed", "archived", "won"].includes(key)) return "var(--ke-color-success)";
    if (["planning", "bidding", "reviewing"].includes(key)) return "var(--ke-color-warning)";
    if (["doing", "active"].includes(key)) return "var(--ke-color-interactive)";
    return "var(--ke-color-muted)";
  }

  function projectTypeColorToken(type) {
    if (type === "business") return "var(--ke-color-accent)";
    if (type === "work") return "var(--ke-color-warning)";
    if (type === "personal") return "var(--ke-color-success)";
    return "var(--ke-color-muted)";
  }

  function priorityColorToken(label) {
    if (label === "높음" || label === "매우 높음") return "var(--ke-color-error)";
    if (label === "낮음" || label === "매우 낮음") return "var(--ke-color-muted)";
    return "var(--ke-color-accent)";
  }

  const getTransitions = (currentStatus) => {
    const transitions = {
      idea: [{ key: "planning" }],
      planning: [{ key: "doing" }, { key: "blocked" }],
      doing: [{ key: "completed" }, { key: "blocked" }],
      blocked: [{ key: "doing" }, { key: "planning" }],
      completed: [{ key: "reviewing" }],
      reviewing: [{ key: "archived" }],
      archived: []
    };
    return transitions[currentStatus] || [];
  };

  root.normalizeProjectType = normalizeProjectType;
  root.projectTypeLabel = projectTypeLabel;

  root.renderProjectCard = function (p, container) {
    if (!p || !container) return null;
    if (root.ProdigyUI && typeof root.ProdigyUI.ensureStyles === "function") root.ProdigyUI.ensureStyles();
    if (root.ProjectStyles && typeof root.ProjectStyles.ensureProjectStyles === "function") root.ProjectStyles.ensureProjectStyles();
    const app = root.app || (typeof window !== "undefined" ? window.app : null);
    const display = root.prodigyDisplay;
    const file = p.file || {};
    const path = String(file.path || p.path || "");
    const titleText = String(file.name || p.title || path.split("/").pop() || "프로젝트").replace(/\.md$/i, "");
    const status = String(p.status || "idea").trim().toLowerCase();
    const mutationApi = root.ProjectCardMutation;
    if (!mutationApi || typeof mutationApi.create !== "function") {
      throw new Error("프로젝트 카드 변경 모듈을 불러오지 못했습니다.");
    }
    const projectType = normalizeProjectType(p.project_type);
    const typeColor = projectTypeColorToken(projectType);
    const statusColor = statusColorToken(status);

    const card = container.createEl("article", {
      attr: {
        class: "prodigy-project-card prodigy-utility-card",
        "data-project-path": path,
        "data-project-status": status,
        style: `border-inline-start:var(--ke-space-1) solid ${statusColor};margin-block-end:var(--ke-space-3);display:flex;flex-direction:column;gap:var(--ke-space-2);min-inline-size:0;overflow-wrap:anywhere;`
      }
    });

    const header = card.createEl("div", {
      attr: { class: "prodigy-project-card-header", style: "display:flex;justify-content:space-between;align-items:center;gap:var(--ke-space-2,4px);min-inline-size:0;" }
    });
    const titleContainer = header.createEl("div", {
      attr: { class: "prodigy-project-card-title-row", style: "display:flex;align-items:center;gap:var(--ke-space-2,4px);min-inline-size:0;flex-wrap:wrap;" }
    });
    const typeBadge = titleContainer.createEl("span", {
      text: projectTypeLabel(projectType),
      attr: {
        class: "prodigy-project-card-type",
        style: `font-size:var(--ke-type-chrome,.68rem);font-weight:700;color:${typeColor};background:color-mix(in srgb, ${typeColor} 12%, var(--ke-color-surface-secondary));border:1px solid color-mix(in srgb, ${typeColor} 42%, var(--ke-color-border));padding:var(--ke-space-1,2px) var(--ke-space-2,4px);border-radius:var(--ke-radius-pill);white-space:nowrap;`
      }
    });
    typeBadge.setAttribute("data-project-type", projectType);

    const title = titleContainer.createEl("a", {
      text: titleText,
      attr: {
        class: "internal-link",
        href: path ? `#${path}` : "#",
        style: "font-weight:700;font-size:var(--ke-type-body,.84rem);color:var(--ke-color-text);text-decoration:none;cursor:pointer;overflow-wrap:anywhere;min-inline-size:0;"
      }
    });
    title.onclick = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (app && app.workspace && typeof app.workspace.openLinkText === "function" && path) {
        return app.workspace.openLinkText(titleText, path, false);
      }
      return null;
    };

    const rightHeader = header.createEl("div", {
      attr: { class: "prodigy-project-card-priority-wrap", style: "display:flex;align-items:center;gap:var(--ke-space-2,4px);min-inline-size:0;" }
    });
    const saveStatus = rightHeader.createEl("span", {
      attr: {
        class: "project-card-save-status",
        role: "status",
        "aria-live": "polite",
        "data-project-save-state": "idle"
      }
    });
    const renderMutationState = (snapshot) => {
      const labels = { saving: "저장 중", saved: "저장됨", error: "저장 실패" };
      saveStatus.setAttribute("data-project-save-state", snapshot.state);
      saveStatus.textContent = labels[snapshot.state] || "";
      if (snapshot.error) saveStatus.setAttribute("title", snapshot.error.message || String(snapshot.error));
      else saveStatus.removeAttribute("title");
    };
    renderMutationState(
      typeof mutationApi.consumeState === "function"
        ? mutationApi.consumeState(path)
        : { state: "idle", error: null }
    );
    const priorityLabel = display && typeof display.priority === "function"
      ? display.priority(p.priority)
      : (p.priority || "보통");
    const priorityColor = priorityColorToken(priorityLabel);
    rightHeader.createEl("span", {
      text: priorityLabel,
      attr: {
        class: "prodigy-project-card-priority",
        style: `font-size:var(--ke-type-chrome,.68rem);font-weight:700;color:${priorityColor};background:color-mix(in srgb, ${priorityColor} 10%, var(--ke-color-surface-secondary));padding:var(--ke-space-1,2px) var(--ke-space-2,4px);border-radius:var(--ke-radius-control,4px);white-space:nowrap;`
      }
    });
    const overflowMenu = rightHeader.createEl("details", {
      attr: { class: "project-card-overflow" }
    });
    overflowMenu.createEl("summary", {
      text: "•••",
      attr: {
        class: "project-card-overflow-trigger",
        "aria-label": `${titleText} 추가 작업`,
        title: "추가 작업"
      }
    });
    const overflowPanel = overflowMenu.createEl("div", {
      attr: { class: "project-card-overflow-panel" }
    });
    const deleteLabel = `${titleText} 삭제`;
    const deleteBtn = createButton(overflowPanel, "삭제", { danger: true, className: "project-card-delete" });
    setAccessibleName(deleteBtn, deleteLabel);
    setIcon(deleteBtn, "trash-2", "삭제");
    deleteBtn.onclick = async (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const confirmDelete = typeof root.confirm === "function"
        ? root.confirm(`[${titleText}] 프로젝트 노트를 휴지통으로 이동하시겠습니까?`)
        : (typeof confirm === "function" ? confirm(`[${titleText}] 프로젝트 노트를 휴지통으로 이동하시겠습니까?`) : true);
      if (!confirmDelete) return;
      try {
        const target = app && app.vault && typeof app.vault.getAbstractFileByPath === "function"
          ? app.vault.getAbstractFileByPath(path)
          : null;
        if (!target || !app.vault || typeof app.vault.trash !== "function") throw new Error("프로젝트 파일을 찾을 수 없습니다.");
        await app.vault.trash(target, true);
        const Notice = root.Notice || (typeof window !== "undefined" ? window.Notice : null);
        if (typeof Notice === "function") new Notice(`[${titleText}] 노트를 휴지통으로 이동했습니다.`);
      } catch (error) {
        const Notice = root.Notice || (typeof window !== "undefined" ? window.Notice : null);
        if (typeof Notice === "function") new Notice(`노트 삭제 실패: ${error && (error.message || String(error))}`);
      }
    };

    const subHeader = card.createEl("div", {
      attr: { class: "prodigy-project-card-meta", style: "font-size:var(--ke-type-label,.72rem);color:var(--ke-color-muted);display:flex;gap:var(--ke-space-2,4px);align-items:center;flex-wrap:wrap;overflow-wrap:anywhere;" }
    });
    subHeader.createEl("span", { text: p.category || "미지정" });
    if (p.due_date) {
      subHeader.createEl("span", { text: "·", attr: { "aria-hidden": "true" } });
      subHeader.createEl("span", { text: `마감일: ${p.due_date}` });
    }

    const actionRow = card.createEl("div", {
      attr: { class: "prodigy-project-card-next-action", style: "font-size:var(--ke-type-body,.84rem);color:var(--ke-color-text);margin-block-start:var(--ke-space-1,2px);overflow-wrap:anywhere;" }
    });
    const nextAction = String(p.next_action || "").trim()
      || (root.ProjectWizardCore && typeof root.ProjectWizardCore.firstExecutableWorkflowAction === "function"
        ? root.ProjectWizardCore.firstExecutableWorkflowAction(p.workflow)
        : "");
    actionRow.createEl("strong", { text: "다음 행동: ", attr: { style: "color:var(--ke-color-accent);" } });
    actionRow.createEl("span", { text: nextAction || "설정 필요" });

    const transitions = getTransitions(status);
    if (transitions.length > 0) {
      const buttons = card.createEl("div", {
        attr: { class: "prodigy-card-actions", style: "margin-block-start:var(--ke-space-2,4px);border-block-start:1px solid var(--ke-color-border);padding-block-start:var(--ke-space-3,8px);" }
      });
      buttons.createEl("span", {
        text: "상태 변경",
        attr: { style: "font-size:var(--ke-type-label,.72rem);color:var(--ke-color-muted);display:inline-flex;align-items:center;margin-inline-end:var(--ke-space-1,2px);" }
      });
      const errorHost = card.createEl("div", {
        attr: { class: "prodigy-project-card-action-error", role: "alert", hidden: "", style: "display:none;color:var(--ke-color-error);font-size:var(--ke-type-label,.72rem);overflow-wrap:anywhere;" }
      });
      errorHost.hidden = true;
      const showActionError = (error, retry) => {
        errorHost.empty();
        errorHost.hidden = false;
        errorHost.style.display = "flex";
        errorHost.style.alignItems = "center";
        errorHost.style.gap = "var(--ke-space-2,4px)";
        errorHost.createEl("span", { text: `상태 저장 실패: ${error && (error.message || String(error))}` });
        const retryButton = createButton(errorHost, "다시 시도", { quiet: true, className: "project-card-action-retry" });
        retryButton.setAttribute("aria-label", "상태 저장 다시 시도");
        retryButton.onclick = (event) => {
          if (event && event.preventDefault) event.preventDefault();
          void retry();
        };
      };
      const clearActionError = () => {
        errorHost.hidden = true;
        errorHost.style.display = "none";
        errorHost.empty();
      };
      const mutation = mutationApi.create({
        app,
        project: p,
        filePath: path,
        refresh: async () => {
          root.__prodigyProjectPendingFocusPath = path;
          if (typeof root.__prodigyRefreshProjectViews === "function") {
            await root.__prodigyRefreshProjectViews();
          } else if (typeof p.onRefresh === "function") {
            await p.onRefresh();
          }
        },
        onState: renderMutationState
      });
      const writeStatus = async (button, option) => {
        if (!button || button.disabled) return;
        button.disabled = true;
        clearActionError();
        try {
          await mutation.commit({ status: option.key });
        } catch (error) {
          showActionError(error, () => writeStatus(button, option));
        } finally {
          button.disabled = false;
        }
      };
      const createTransitionButton = (parent, option, primary) => {
        const info = display && typeof display.statusInfo === "function"
          ? display.statusInfo(option.key)
          : { label: option.key };
        const button = createButton(parent, info.label || option.key, {
          chip: true,
          primary,
          className: primary ? "project-card-primary-action" : "project-card-secondary-action"
        });
        button.setAttribute("data-project-transition", option.key);
        button.onclick = (event) => {
          if (event && event.preventDefault) event.preventDefault();
          if (event && event.stopPropagation) event.stopPropagation();
          void writeStatus(button, option);
        };
        return button;
      };
      createTransitionButton(buttons, transitions[0], true);
      if (transitions.length > 1) {
        const secondary = buttons.createEl("details", {
          attr: { class: "project-card-secondary-transitions" }
        });
        secondary.createEl("summary", {
          text: "다른 상태",
          attr: { class: "project-card-secondary-trigger" }
        });
        const panel = secondary.createEl("div", {
          attr: { class: "project-card-secondary-panel" }
        });
        transitions.slice(1).forEach((option) => createTransitionButton(panel, option, false));
      }
    }
    if (root.__prodigyProjectPendingFocusPath === path) {
      delete root.__prodigyProjectPendingFocusPath;
      const restoreFocus = () => {
        const target = card.querySelector(".project-card-primary-action") || card;
        if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
      };
      if (typeof root.queueMicrotask === "function") root.queueMicrotask(restoreFocus);
      else Promise.resolve().then(restoreFocus);
    }
    return card;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
