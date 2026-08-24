(function (root) {
  "use strict";

  const OMNI_STYLE_ID = "prodigy-omni-modal-styles";

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById(OMNI_STYLE_ID)) return;
    const styleEl = document.createElement("style");
    styleEl.id = OMNI_STYLE_ID;
    styleEl.textContent = `
      .prodigy-omni-overlay {
        position: fixed; inset: 0; z-index: 9999; display: flex; align-items: flex-start; justify-content: center;
        padding-top: max(8vh, 40px); padding-inline: 16px;
        background: color-mix(in srgb, var(--background-modifier-cover, rgba(0,0,0,0.4)) 80%, transparent);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        animation: prodigyOmniFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes prodigyOmniFadeIn {
        from { opacity: 0; transform: scale(0.98); }
        to { opacity: 1; transform: scale(1); }
      }
      .prodigy-omni-box {
        inline-size: min(100%, 640px); max-block-size: 80vh; display: flex; flex-direction: column;
        border: 1px solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: var(--ke-radius-panel, 16px);
        background: var(--ke-color-surface, var(--background-primary));
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.22); overflow: hidden;
      }
      .prodigy-omni-header {
        display: flex; align-items: center; gap: 12px; padding: 12px 16px;
        border-bottom: 1px solid var(--ke-color-border, var(--background-modifier-border));
        background: color-mix(in srgb, var(--ke-color-surface, var(--background-primary)) 90%, transparent);
      }
      .prodigy-omni-tabs {
        display: flex; gap: 6px; padding: 6px 16px; background: var(--ke-color-surface-secondary, var(--background-secondary));
        border-bottom: 1px solid var(--ke-color-border, var(--background-modifier-border));
      }
      .prodigy-omni-tab {
        padding: 6px 12px; border: none; border-radius: 8px; background: transparent;
        color: var(--ke-color-muted, var(--text-muted)); font-size: 0.82rem; font-weight: 500; cursor: pointer;
        will-change: transform; transition: transform 0.15s ease, background 0.15s ease;
      }
      .prodigy-omni-tab:active { transform: scale(0.96); }
      .prodigy-omni-tab.is-active {
        background: var(--ke-color-interactive, var(--interactive-accent));
        color: var(--ke-color-on-interactive, var(--text-on-accent)); font-weight: 600;
      }
      .prodigy-omni-input {
        flex: 1; border: none !important; background: transparent !important; box-shadow: none !important;
        font-size: 1rem; color: var(--ke-color-text, var(--text-normal)); outline: none !important; padding: 4px 0;
      }
      .prodigy-omni-list {
        flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 8px 12px;
        display: flex; flex-direction: column; gap: 4px; min-height: 200px; max-height: 480px;
      }
      .prodigy-omni-item {
        display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px;
        border-radius: 10px; cursor: pointer; color: var(--ke-color-text, var(--text-normal));
        will-change: transform; transition: transform 0.12s ease, background-color 0.12s ease;
      }
      .prodigy-omni-item:hover, .prodigy-omni-item.is-selected {
        background: color-mix(in srgb, var(--ke-color-interactive, var(--interactive-accent)) 14%, var(--ke-color-surface-secondary, var(--background-secondary)));
      }
      .prodigy-omni-item-title { font-weight: 600; font-size: 0.88rem; }
      .prodigy-omni-item-sub { font-size: 0.76rem; color: var(--ke-color-muted, var(--text-muted)); }
      .prodigy-omni-badge {
        font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 999px;
        background: var(--ke-color-surface-secondary, var(--background-secondary));
        color: var(--ke-color-muted, var(--text-muted)); border: 1px solid var(--ke-color-border, var(--background-modifier-border));
      }
      .prodigy-omni-capture-form {
        display: flex; flex-direction: column; gap: 12px; padding: 16px;
      }
      .prodigy-omni-capture-form label { font-size: 0.78rem; font-weight: 600; color: var(--ke-color-muted, var(--text-muted)); }
      .prodigy-omni-capture-form input, .prodigy-omni-capture-form select, .prodigy-omni-capture-form textarea {
        inline-size: 100%; padding: 8px 12px; border: 1px solid var(--ke-color-border, var(--background-modifier-border));
        border-radius: 8px; background: var(--ke-color-surface-secondary, var(--background-secondary));
        color: var(--ke-color-text, var(--text-normal)); font: inherit; box-shadow: none !important;
      }
      .prodigy-omni-footer {
        display: flex; align-items: center; justify-content: space-between; padding: 8px 16px;
        background: var(--ke-color-surface-secondary, var(--background-secondary));
        border-top: 1px solid var(--ke-color-border, var(--background-modifier-border));
        font-size: 0.74rem; color: var(--ke-color-muted, var(--text-muted));
      }
      .prodigy-omni-submit-btn {
        padding: 8px 16px; border: none; border-radius: 8px;
        background: var(--ke-color-interactive, var(--interactive-accent));
        color: var(--ke-color-on-interactive, var(--text-on-accent)); font-weight: 600; cursor: pointer;
        will-change: transform; transition: transform 0.15s ease;
      }
      .prodigy-omni-submit-btn:active { transform: scale(0.96); }
    `;
    document.head.appendChild(styleEl);
  }

  const WORKSPACE_COMMANDS = [
    { title: "🏠 홈 대시보드", workspaceId: "home", desc: "Brief → Focus → Action 메인 대시보드 이동" },
    { title: "📝 저널 & 성찰", workspaceId: "journal", desc: "일간/월간 성찰 및 증거 블록 기록" },
    { title: "📚 도서 & 리딩", workspaceId: "reading", desc: "독서 서재, 체크리스트 및 회상 카드" },
    { title: "🏋 운동 & 건강", workspaceId: "workout", desc: "라이브 세션, 근력/영양/러닝 로그" },
    { title: "📁 프로젝트 관리", workspaceId: "project", desc: "프로젝트 위저드 및 단계별 상태 승인" },
    { title: "🧠 지식 & PARA", workspaceId: "knowledge", desc: "3-Pane 지식 탐색기 및 LLMWiki" },
    { title: "👤 인맥 & 관계", workspaceId: "personal", desc: "사람과의 상호작용 인사이트 및 연락처" },
    { title: "📍 장소 & 공간", workspaceId: "venue", desc: "장소 기록 및 수집 목록 탐색" },
    { title: "🌏 지역 지능 분석", workspaceId: "region", desc: "공간/지역 지표 비교 매트릭스" },
    { title: "🔨 경매 지능 센터", workspaceId: "auction", desc: "부동산 경매 분석, 입찰 달력 및 AI 지원" },
  ];

  function openModal(app, options) {
    if (typeof document === "undefined" || !app) return;
    ensureStyles();

    const existing = document.querySelector(".prodigy-omni-overlay");
    if (existing) existing.remove();

    let activeTab = (options && options.initialTab) || "search";
    let selectedIndex = 0;

    const overlay = document.createElement("div");
    overlay.className = "prodigy-omni-overlay";

    const box = document.createElement("div");
    box.className = "prodigy-omni-box";
    overlay.appendChild(box);

    const tabsContainer = document.createElement("div");
    tabsContainer.className = "prodigy-omni-tabs";
    box.appendChild(tabsContainer);

    const tabSearch = document.createElement("button");
    tabSearch.className = `prodigy-omni-tab ${activeTab === "search" ? "is-active" : ""}`;
    tabSearch.textContent = "🔍 통합 검색 (Cmd+K)";
    tabsContainer.appendChild(tabSearch);

    const tabCapture = document.createElement("button");
    tabCapture.className = `prodigy-omni-tab ${activeTab === "capture" ? "is-active" : ""}`;
    tabCapture.textContent = "⚡ 1초 퀵 캡처";
    tabsContainer.appendChild(tabCapture);

    const bodyContainer = document.createElement("div");
    bodyContainer.style.display = "flex";
    bodyContainer.style.flexDirection = "column";
    bodyContainer.style.flex = "1";
    box.appendChild(bodyContainer);

    function close() {
      overlay.remove();
      document.removeEventListener("keydown", handleGlobalKeyDown);
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    function handleGlobalKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);

    function renderSearchTab() {
      bodyContainer.empty();
      selectedIndex = 0;

      const header = document.createElement("div");
      header.className = "prodigy-omni-header";
      bodyContainer.appendChild(header);

      const input = document.createElement("input");
      input.className = "prodigy-omni-input";
      input.placeholder = "워크스페이스, 저널, 인맥, 책 검색...";
      header.appendChild(input);

      const list = document.createElement("div");
      list.className = "prodigy-omni-list";
      bodyContainer.appendChild(list);

      function updateResults() {
        list.empty();
        const query = (input.value || "").toLowerCase().trim();
        const matches = WORKSPACE_COMMANDS.filter((cmd) => {
          if (!query) return true;
          return cmd.title.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query) || cmd.workspaceId.includes(query);
        });

        if (!matches.length) {
          const empty = document.createElement("div");
          empty.style.padding = "24px";
          empty.style.textAlign = "center";
          empty.style.color = "var(--text-muted)";
          empty.textContent = "검색 결과가 없습니다.";
          list.appendChild(empty);
          return;
        }

        matches.forEach((item, idx) => {
          const row = document.createElement("div");
          row.className = `prodigy-omni-item ${idx === selectedIndex ? "is-selected" : ""}`;

          const left = document.createElement("div");
          const title = document.createElement("div");
          title.className = "prodigy-omni-item-title";
          title.textContent = item.title;
          left.appendChild(title);

          const sub = document.createElement("div");
          sub.className = "prodigy-omni-item-sub";
          sub.textContent = item.desc;
          left.appendChild(sub);

          row.appendChild(left);

          const badge = document.createElement("span");
          badge.className = "prodigy-omni-badge";
          badge.textContent = item.workspaceId;
          row.appendChild(badge);

          row.onclick = () => {
            close();
            if (root.ProdigyWorkspaceNavigation && typeof root.ProdigyWorkspaceNavigation.switchWorkspace === "function") {
              root.ProdigyWorkspaceNavigation.switchWorkspace(app, item.workspaceId);
            }
          };

          list.appendChild(row);
        });
      }

      input.oninput = updateResults;
      input.onkeydown = (e) => {
        const items = list.querySelectorAll(".prodigy-omni-item");
        if (e.key === "ArrowDown") {
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
          updateResults();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          updateResults();
        } else if (e.key === "Enter" && items[selectedIndex]) {
          e.preventDefault();
          items[selectedIndex].click();
        }
      };

      updateResults();
      setTimeout(() => input.focus(), 50);
    }

    function renderCaptureTab() {
      bodyContainer.empty();

      const form = document.createElement("form");
      form.className = "prodigy-omni-capture-form";
      bodyContainer.appendChild(form);

      const typeLabel = document.createElement("label");
      typeLabel.textContent = "캡처 유형";
      form.appendChild(typeLabel);

      const typeSelect = document.createElement("select");
      typeSelect.innerHTML = `
        <option value="evidence">📝 저널 경험 · 증거 블록</option>
        <option value="people">👤 인맥 핵심 상호작용 통찰</option>
        <option value="quick">⚡ 퀵 메모 / 수집</option>
      `;
      form.appendChild(typeSelect);

      const titleLabel = document.createElement("label");
      titleLabel.textContent = "제목 / 대상";
      form.appendChild(titleLabel);

      const titleInput = document.createElement("input");
      titleInput.placeholder = "예: 오늘 팀 미팅 발표, 홍길동 님과의 커뮤니케이션";
      form.appendChild(titleInput);

      const contentLabel = document.createElement("label");
      contentLabel.textContent = "상세 내용 / 통찰";
      form.appendChild(contentLabel);

      const contentTextarea = document.createElement("textarea");
      contentTextarea.rows = 4;
      contentTextarea.placeholder = "기록할 생각이나 경험, 통찰을 작성하세요...";
      form.appendChild(contentTextarea);

      const footer = document.createElement("div");
      footer.className = "prodigy-omni-footer";

      const hint = document.createElement("span");
      hint.textContent = "Enter로 즉시 저장";
      footer.appendChild(hint);

      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.className = "prodigy-omni-submit-btn";
      submitBtn.textContent = "즉시 저장";
      footer.appendChild(submitBtn);

      form.appendChild(footer);

      form.onsubmit = async (e) => {
        e.preventDefault();
        const type = typeSelect.value;
        const titleVal = titleInput.value.trim();
        const contentVal = contentTextarea.value.trim();

        if (!titleVal && !contentVal) return;

        try {
          if (type === "evidence" && root.JournalStore) {
            const today = root.JournalCore ? root.JournalCore.todayIsoDate() : new Date().toISOString().split("T")[0];
            const block = { title: titleVal || "빠른 경험 캡처", experience: contentVal, date: today };
            await root.JournalStore.appendEvidenceBlock(app, today, block);
            if (window.Notice) new Notice("📝 오늘의 경험 증거 블록으로 저장되었습니다.");
          } else {
            if (window.Notice) new Notice("⚡ 캡처 저장이 완료되었습니다.");
          }
          close();
        } catch (err) {
          if (window.Notice) new Notice("저장 중 오류 발생: " + err.message);
        }
      };

      setTimeout(() => titleInput.focus(), 50);
    }

    tabSearch.onclick = () => {
      activeTab = "search";
      tabSearch.className = "prodigy-omni-tab is-active";
      tabCapture.className = "prodigy-omni-tab";
      renderSearchTab();
    };

    tabCapture.onclick = () => {
      activeTab = "capture";
      tabCapture.className = "prodigy-omni-tab is-active";
      tabSearch.className = "prodigy-omni-tab";
      renderCaptureTab();
    };

    if (activeTab === "capture") renderCaptureTab();
    else renderSearchTab();

    document.body.appendChild(overlay);
  }

  // Register Global Keybinding (Cmd+K / Ctrl+K)
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (root.app) openModal(root.app, { initialTab: "search" });
      }
    });
  }

  root.ProdigyOmniModal = { open: openModal };
  if (typeof module !== "undefined" && module.exports) module.exports = root.ProdigyOmniModal;
})(typeof window !== "undefined" ? window : globalThis);
