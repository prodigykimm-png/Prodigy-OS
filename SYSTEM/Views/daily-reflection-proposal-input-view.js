(function (root) {
  "use strict";
  function button(parent, text, primary) {
    return root.ProdigyUI ? root.ProdigyUI.button(parent, text, primary ? { primary: true } : undefined) : parent.createEl("button", { text, attr: { type: "button", class: `prodigy-btn${primary ? " prodigy-btn-primary" : ""}` } });
  }
  function selectControl(parent, label) {
    return parent.createEl("select", {
      attr: {
        "aria-label": label,
        style: "width:100%;box-sizing:border-box;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);padding:8px;font-size:.84rem;"
      }
    });
  }
  function setOptions(selectEl, options, selected) {
    selectEl.empty();
    options.forEach((option) => {
      const item = selectEl.createEl("option", { text: option.label, attr: { value: option.value } });
      if (option.value === selected) item.selected = true;
    });
    selectEl.value = selected || (options[0] && options[0].value) || "";
  }
  function field(parent, label) {
    parent.createEl("div", { text: label, attr: { style: "font-size:.72rem;font-weight:700;color:var(--text-muted);margin:8px 0 4px;" } });
  }
  function render(options) {
    const { modal, app, dateStr, existingBlocks, onNotice } = options;
    const contentEl = modal.contentEl;
    contentEl.createEl("h3", { text: "AI 성찰 분석" });
    contentEl.createEl("p", { text: "자유롭게 기록하면 선택한 AI가 증거와 지식·리소스·문서·PRE 분류 후보를 제안합니다. AI는 자동 저장하지 않습니다.", attr: { style: "color:var(--text-muted);font-size:0.85em;margin:0 0 12px;" } });
    const connection = contentEl.createEl("details", { attr: { style: "margin:0 0 12px;border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px 10px;background:var(--background-secondary);" } });
    connection.createEl("summary", { text: "AI 제공자·모델 설정" });
    connection.createEl("p", { text: "로컬 모델은 API 키 없이 사용합니다. 외부 API 키는 Obsidian SecretStorage에만 저장됩니다.", attr: { style: "color:var(--text-muted);font-size:.78em;margin:8px 0;" } });
    field(connection, "AI 제공자");
    const providerSelect = selectControl(connection, "AI 제공자");
    field(connection, "모델");
    const modelSelect = selectControl(connection, "AI 모델");
    const keyWrap = connection.createEl("div");
    field(keyWrap, "API 키");
    const keyInput = keyWrap.createEl("input", { attr: { type: "password", autocomplete: "off", placeholder: "API 키", "aria-label": "AI 제공자 API 키", style: "width:100%;box-sizing:border-box;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);padding:8px;font-size:.84rem;" } });
    const connectionStatus = connection.createEl("div", { attr: { style: "font-size:.72rem;color:var(--text-muted);margin-top:6px;min-height:1.2em;" } });
    const saveSettings = button(connection, "설정 저장");
    saveSettings.style.marginTop = "8px";

    async function refreshProvider(discover) {
      const service = root.ProjectWorkflowDraftService;
      if (!modal.providerConfig || !service) return;
      const providerKey = modal.providerKey || modal.providerConfig.defaultProvider;
      const provider = modal.providerConfig.providers[providerKey];
      if (!provider) return;
      modal.providerKey = providerKey;
      keyWrap.style.display = provider.authMode === "none" ? "none" : "block";
      keyInput.setAttribute("placeholder", `${provider.name || providerKey} API 키`);
      keyInput.setAttribute("aria-label", `${provider.name || providerKey} API 키`);
      let models = service.listProviderModels(providerKey, modal.providerConfig);
      if (discover) {
        connectionStatus.setText(providerKey === "lm-studio" ? "로컬 모델을 확인하는 중…" : "");
        try {
          models = await service.discoverProviderModels(app, providerKey, modal.providerConfig);
          connectionStatus.setText(providerKey === "lm-studio" ? "LM Studio 연결 가능 · 요청 후 2분 뒤 자동 언로드" : "");
        } catch (_error) {
          connectionStatus.setText("LM Studio 서버가 꺼져 있어 등록된 모델만 표시합니다.");
        }
      }
      const selectedModel = provider.model || (models[0] && models[0].id) || "";
      provider.model = selectedModel;
      setOptions(modelSelect, models.map((model) => ({ value: model.id, label: model.label })), selectedModel);
    }

    providerSelect.onchange = async () => {
      modal.providerKey = providerSelect.value;
      await refreshProvider(true);
    };
    modelSelect.onchange = () => {
      const provider = modal.providerConfig && modal.providerConfig.providers[modal.providerKey];
      if (provider) provider.model = modelSelect.value;
    };
    saveSettings.onclick = async () => {
      if (!modal.providerConfig || !modal.providerKey) return onNotice("AI 제공자 설정을 불러오는 중입니다.");
      if (!root.ProjectWorkflowDraftService || typeof root.ProjectWorkflowDraftService.saveProviderSettings !== "function") {
        return onNotice("AI 제공자 설정 서비스를 불러오지 못했습니다.");
      }
      const provider = modal.providerConfig.providers[modal.providerKey];
      provider.model = modelSelect.value || provider.model;
      const secretValue = String(keyInput.value || "").trim();
      const secrets = {};
      if (secretValue && provider.apiKeySecret) secrets[provider.apiKeySecret] = secretValue;
      saveSettings.disabled = true;
      try {
        modal.providerConfig = await root.ProjectWorkflowDraftService.saveProviderSettings(app, {
          defaultProvider: modal.providerKey,
          config: { providers: { [modal.providerKey]: provider } },
          secrets
        });
        keyInput.value = "";
        connection.open = false;
        onNotice(`${provider.name || modal.providerKey} · ${provider.model} 설정을 저장했습니다.`);
      } catch (error) { onNotice(error.message || String(error)); } finally { saveSettings.disabled = false; }
    };

    const providerConfigService = root.ProjectWorkflowDraftService;
    if (providerConfigService && typeof providerConfigService.loadProviderConfig === "function") {
      Promise.resolve(providerConfigService.loadProviderConfig(app)).then(async (config) => {
        modal.providerConfig = config;
        modal.providerKey = modal.providerKey && config.providers[modal.providerKey] ? modal.providerKey : config.defaultProvider;
        setOptions(providerSelect, Object.keys(config.providers).map((key) => ({ value: key, label: config.providers[key].name || key })), modal.providerKey);
        await refreshProvider(true);
      }).catch((error) => connectionStatus.setText(error.message || String(error)));
    } else {
      connection.style.display = "none";
    }
    const area = contentEl.createEl("textarea", { attr: { rows: "8", style: "width:100%;min-height:140px;resize:vertical;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);" } });
    area.placeholder = "오늘 있었던 일, 실수, 배운 점, 다음에 바꾸고 싶은 점을 그대로 적어 주세요.";
    area.value = modal.freeText;
    area.oninput = () => { modal.freeText = area.value; };
    const actions = contentEl.createEl("div", { attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" } });
    const cancel = button(actions, "취소");
    cancel.onclick = () => modal.close();
    const propose = button(actions, "AI 적용", true);
    propose.onclick = async () => {
      if (!String(modal.freeText || "").trim()) return onNotice("분석할 내용을 입력해 주세요.");
      const ai = root.DailyReflectionAI;
      if (!ai || typeof ai.generateProposal !== "function") return onNotice("AI 성찰 서비스를 불러오지 못했습니다.");
      propose.disabled = true;
      propose.textContent = "분석 중…";
      modal.busy = true;
      try {
        modal.proposal = await ai.generateProposal({ app, dateStr, freeText: modal.freeText, existingBlocks, providerKey: modal.providerKey, config: modal.providerConfig });
        modal.resetProposalSelection();
        modal.phase = "confirm";
        modal.render();
      } catch (error) { propose.disabled = false; propose.textContent = "AI 적용"; onNotice(error.message || String(error)); } finally { modal.busy = false; }
    };
  }
  root.DailyReflectionProposalInputView = Object.freeze({ render });
})(typeof globalThis !== "undefined" ? globalThis : this);
