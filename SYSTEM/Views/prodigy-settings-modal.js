(function (root) {
  "use strict";

  function configService() {
    if (root.ProdigyConfigService) return root.ProdigyConfigService;
    if (typeof require === "function") return require("./prodigy-config-service.js");
    throw new Error("ProdigyConfigService is not loaded.");
  }

  function createButton(parent, label, options) {
    if (root.ProdigyUI) return root.ProdigyUI.button(parent, label, options);
    return parent.createEl("button", { text: label, attr: { type: "button", class: options && options.primary ? "prodigy-btn prodigy-btn-primary" : "prodigy-btn" } });
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function field(parent, label) { parent.createEl("div", { text: label, attr: { class: "prodigy-settings-label" } }); }
  function notice(message) { if (typeof root.Notice === "function") new root.Notice(message); }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("prodigy-settings-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "prodigy-settings-modal-styles";
    style.textContent = `
      .modal.prodigy-settings-modal { width: min(920px, calc(100vw - 48px)) !important; max-width: calc(100vw - 48px) !important; }
      .modal.prodigy-settings-modal .modal-content { width: 100%; max-width: none; min-width: 0; box-sizing: border-box; }
      .prodigy-settings-modal h2 { margin: 0 0 6px; font-size: 1.12rem; }
      .prodigy-settings-modal h3 { margin: 0 0 10px; font-size: .92rem; }
      .prodigy-settings-modal h4 { margin: 0; font-size: .84rem; }
      .prodigy-settings-intro, .prodigy-settings-hint { color: var(--text-muted); font-size: .78rem; line-height: 1.45; }
      .prodigy-settings-intro { margin: 0 0 14px; }
      .prodigy-settings-hint { margin: 4px 0 0; }
      .prodigy-settings-section { margin-top: 16px; }
      .prodigy-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .prodigy-settings-card { min-width: 0; border: 1px solid var(--background-modifier-border); border-radius: 8px; background: var(--background-secondary); padding: 10px; }
      .prodigy-settings-label { margin: 10px 0 4px; color: var(--text-muted); font-size: .72rem; font-weight: 700; }
      .prodigy-settings-modal input, .prodigy-settings-modal select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--background-modifier-border); border-radius: 4px; background: var(--background-primary); color: var(--text-normal); padding: 7px 8px; font-size: .84rem; }
      .prodigy-settings-secret-row { display: flex; align-items: stretch; gap: 6px; }
      .prodigy-settings-secret-row input { flex: 1 1 auto; }
      .prodigy-settings-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--background-modifier-border); }
      .prodigy-settings-status { margin-top: 12px; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 4px; color: var(--text-muted); font-size: .8rem; }
      .prodigy-settings-badge { display: inline-block; font-size: .68rem; font-weight: 700; padding: 2px 6px; border-radius: 3px; margin-bottom: 4px; }
      .prodigy-settings-badge-present { background: var(--background-modifier-success); color: var(--text-on-accent); }
      .prodigy-settings-badge-missing { background: var(--background-modifier-error); color: var(--text-on-accent); }
      @media (max-width: 640px) {
        .modal.prodigy-settings-modal { width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px) !important; }
        .prodigy-settings-grid { grid-template-columns: 1fr; }
        .prodigy-settings-modal input, .prodigy-settings-modal select, .prodigy-settings-footer .prodigy-btn, .prodigy-settings-secret-row .prodigy-btn { min-height: 44px; }
        .prodigy-settings-footer { display: grid; grid-template-columns: 1fr 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  class ProdigySettingsModal extends root.obsidian.Modal {
    constructor(app, options) {
      super(app);
      this.options = options || {};
      this.state = { busy: false, status: "", config: null, secrets: {}, deleteSecretIds: new Set(), secretStatus: {} };
    }

    async onOpen() {
      ensureStyles();
      if (this.modalEl) this.modalEl.addClass("prodigy-settings-modal");
      this.render();
      try {
        const service = configService();
        const config = await service.load(this.app);
        const secretIds = [
          ...Object.values(service.SECRET_IDS),
          ...Object.values(service.REGION_SECRET_IDS),
          ...Object.values(config.providers).map((provider) => provider.apiKeySecret).filter(Boolean)
        ];
        const unique = [...new Set(secretIds)];
        const states = await Promise.all(unique.map(async (secretId) => [secretId, await service.hasSecret(this.app, secretId)]));
        this.state.config = clone(config);
        this.state.secretStatus = Object.fromEntries(states);
      } catch (error) {
        this.state.status = `설정을 불러오지 못했습니다: ${error.message || error}`;
      }
      this.render();
    }

    onClose() { this.contentEl.empty(); }

    render() {
      const content = this.contentEl;
      content.empty();
      content.createEl("h2", { text: "Prodigy OS 설정" });
      content.createEl("p", { text: "AI 기능과 연결 서비스가 같은 설정을 사용합니다. API 키와 토큰은 이 기기의 SecretStorage에만 저장됩니다.", attr: { class: "prodigy-settings-intro" } });

      if (!this.state.config) {
        content.createEl("div", { text: this.state.status || "설정을 불러오는 중…", attr: { class: "prodigy-settings-status" } });
        return;
      }

      this.renderAi(content);
      this.renderServiceSecrets(content);
      this.renderRegionSecrets(content);
      if (this.state.status) content.createEl("div", { text: this.state.status, attr: { class: "prodigy-settings-status" } });
      this.renderFooter(content);
    }

    renderAi(parent) {
      const section = parent.createEl("section", { attr: { class: "prodigy-settings-section" } });
      section.createEl("h3", { text: "AI 제공자" });
      field(section, "기본 AI 제공자");
      const select = section.createEl("select", { attr: { "aria-label": "기본 AI 제공자" } });
      Object.keys(this.state.config.providers).forEach((key) => {
        const provider = this.state.config.providers[key];
        const option = select.createEl("option", { text: provider.name || key, value: key });
        option.selected = key === this.state.config.defaultProvider;
      });
      select.onchange = () => { this.state.config.defaultProvider = select.value; };

      field(section, "실패 시 보조 AI 제공자");
      const fallback = section.createEl("select", { attr: { "aria-label": "실패 시 보조 AI 제공자" } });
      fallback.createEl("option", { text: "사용 안 함", value: "" }).selected = !this.state.config.fallbackProvider;
      Object.keys(this.state.config.providers).forEach((key) => {
        if (key === this.state.config.defaultProvider) return;
        const provider = this.state.config.providers[key];
        const option = fallback.createEl("option", { text: provider.name || key, value: key });
        option.selected = key === this.state.config.fallbackProvider;
      });
      fallback.onchange = () => { this.state.config.fallbackProvider = fallback.value; };
      section.createEl("p", { text: "429·일시 장애·구조화 JSON 실패 때만 한 번 보조 제공자로 재시도합니다. 키·권한·입력 설정 오류에는 전환하지 않습니다.", attr: { class: "prodigy-settings-hint" } });

      const grid = section.createEl("div", { attr: { class: "prodigy-settings-grid" } });
      Object.keys(this.state.config.providers).forEach((key) => this.renderProviderCard(grid, key));
    }

    renderProviderCard(parent, providerKey) {
      const provider = this.state.config.providers[providerKey];
      const card = parent.createEl("div", { attr: { class: "prodigy-settings-card" } });
      card.createEl("h4", { text: provider.name || providerKey });
      if (provider.hint) card.createEl("p", { text: provider.hint, attr: { class: "prodigy-settings-hint" } });
      this.renderSecretInput(card, "API 키", provider.apiKeySecret, provider.authMode === "none" ? "로컬 서버는 API 키가 필요하지 않습니다." : "비워 두면 기존 키를 유지합니다.");
      field(card, "모델");
      const models = this.providerModels(providerKey, provider);
      if (models.length) {
        const model = card.createEl("select", { attr: { "aria-label": `${provider.name || providerKey} 모델` } });
        models.forEach((item) => {
          const option = model.createEl("option", { text: item.label, value: item.id });
          option.selected = item.id === provider.model;
        });
        model.onchange = () => { provider.model = model.value; };
      } else {
        const model = card.createEl("input", { attr: { type: "text", value: provider.model || "", placeholder: "모델 ID" } });
        model.oninput = () => { provider.model = model.value.trim(); };
      }
      if (provider.adapter === "openai-compatible") {
        this.renderTextInput(card, "Base URL", provider.baseURL || "", "Base URL", (value) => { provider.baseURL = value; });
        this.renderTextInput(card, "엔드포인트 경로", provider.endpointPath || "/chat/completions", "/chat/completions", (value) => { provider.endpointPath = value || "/chat/completions"; });
        field(card, "인증 방식");
        const authMode = card.createEl("select", { attr: { "aria-label": `${provider.name || providerKey} 인증 방식` } });
        [
          { value: "none", label: "없음 (로컬)" },
          { value: "bearer", label: "Bearer" },
          { value: "api-key", label: "API 키 헤더" }
        ].forEach((item) => {
          const option = authMode.createEl("option", { text: item.label, value: item.value });
          option.selected = item.value === provider.authMode;
        });
        const header = card.createEl("div");
        this.renderTextInput(header, "API 키 헤더", provider.apiKeyHeader || "api-key", "api-key", (value) => { provider.apiKeyHeader = value || "api-key"; });
        header.style.display = provider.authMode === "api-key" ? "block" : "none";
        authMode.onchange = () => {
          provider.authMode = authMode.value;
          header.style.display = provider.authMode === "api-key" ? "block" : "none";
        };
      }
      if (provider.adapter === "gemini") this.renderTextInput(card, "엔드포인트 URL", provider.endpointURL || "", "기본 Gemini URL 사용", (value) => { provider.endpointURL = value; });
    }

    providerModels(providerKey, provider) {
      const service = root.ProjectWorkflowDraftService;
      if (service && typeof service.listProviderModels === "function") return service.listProviderModels(providerKey, this.state.config);
      return (provider.models || []).map((item) => typeof item === "string" ? { id: item, label: item } : item);
    }

    renderServiceSecrets(parent) {
      const service = configService();
      const section = parent.createEl("section", { attr: { class: "prodigy-settings-section" } });
      section.createEl("h3", { text: "외부 서비스" });
      const grid = section.createEl("div", { attr: { class: "prodigy-settings-grid prodigy-settings-service-grid" } });
      const todoist = grid.createEl("div", { attr: { class: "prodigy-settings-card" } });
      todoist.createEl("h4", { text: "Todoist" });
      this.renderSecretInput(todoist, "Todoist 토큰", service.SECRET_IDS.todoist, "비워 두면 기존 Todoist Sync Plugin 설정을 계속 사용할 수 있습니다.");
      const reb = grid.createEl("div", { attr: { class: "prodigy-settings-card" } });
      reb.createEl("h4", { text: "REB OpenAPI" });
      this.renderSecretInput(reb, "REB OpenAPI 키", service.SECRET_IDS.reb, "지역 지표 수집용 키입니다. 수집 실행과 수치 기록은 별도 승인된 흐름에서만 수행됩니다.");
    }

    renderRegionSecrets(parent) {
      const service = configService();
      const section = parent.createEl("section", { attr: { class: "prodigy-settings-section" } });
      section.createEl("h3", { text: "Region Intelligence 수집 키" });
      section.createEl("p", { text: "지역 공식 데이터 수집에 사용하는 API 키입니다. 키는 이 기기의 SecretStorage에만 저장되며, 캐시·로그·Node로 전송되지 않습니다. 키가 없으면 해당 수집은 blocked_auth 상태로 보고됩니다.", attr: { class: "prodigy-settings-intro" } });
      const grid = section.createEl("div", { attr: { class: "prodigy-settings-grid prodigy-settings-service-grid" } });
      const regionKeys = [
        { id: service.REGION_SECRET_IDS.dataGoKr, label: "data.go.kr 서비스 키", hint: "국토교통부 실거래가, 건축인허가, K-APT 등 공공데이터포털 API 키" },
        { id: service.REGION_SECRET_IDS.vworld, label: "VWorld API 키", hint: "공시지가, 행정경계 WFS 요청용 VWorld KEY" },
        { id: service.REGION_SECRET_IDS.kosis, label: "KOSIS API 키 (선택)", hint: "KOSIS 통계 API 키. 현재 비활성 상태이며 미래 게이트 통과 후 사용" },
        { id: service.REGION_SECRET_IDS.seoulOpenapi, label: "서울 열린데이터 키", hint: "서울시 지하철역 공식 데이터 요청용 API 키" },
        { id: service.REGION_SECRET_IDS.naverClientId, label: "Naver Client ID", hint: "지역 분위기 후보 검색용. 비활성 상태이며 키 없이 네트워크 요청 0회" },
        { id: service.REGION_SECRET_IDS.naverClientSecret, label: "Naver Client Secret", hint: "Naver Search API 클라이언트 시크릿" },
        { id: service.REGION_SECRET_IDS.youtube, label: "YouTube API 키", hint: "지역 영상 후보 검색용. 비활성 상태이며 quota 단위 예산 적용" }
      ];
      regionKeys.forEach((item) => {
        const card = grid.createEl("div", { attr: { class: "prodigy-settings-card" } });
        const present = this.state.secretStatus[item.id];
        card.createEl("h4", { text: item.label });
        const badge = card.createEl("span", { attr: { class: present ? "prodigy-settings-badge prodigy-settings-badge-present" : "prodigy-settings-badge prodigy-settings-badge-missing" } });
        badge.textContent = present ? "저장됨" : "미설정";
        this.renderSecretInput(card, item.label, item.id, item.hint);
      });
    }

    renderSecretInput(parent, label, secretId, hint) {
      if (!secretId) {
        parent.createEl("p", { text: hint, attr: { class: "prodigy-settings-hint" } });
        return;
      }
      field(parent, label);
      const row = parent.createEl("div", { attr: { class: "prodigy-settings-secret-row" } });
      const input = row.createEl("input", { attr: { type: "password", autocomplete: "off", placeholder: this.state.secretStatus[secretId] ? "저장됨 · 새 값 입력 시 교체" : "API 키 또는 토큰", "aria-label": label } });
      input.oninput = () => {
        const value = input.value.trim();
        if (value) {
          this.state.secrets[secretId] = value;
          this.state.deleteSecretIds.delete(secretId);
        } else delete this.state.secrets[secretId];
      };
      if (this.state.secretStatus[secretId]) {
        const remove = createButton(row, "삭제");
        remove.classList.add("prodigy-btn-danger");
        remove.onclick = () => {
          const accepted = typeof root.confirm !== "function" || root.confirm(`${label}을 삭제할까요?`);
          if (!accepted) return;
          delete this.state.secrets[secretId];
          this.state.deleteSecretIds.add(secretId);
          this.state.secretStatus[secretId] = false;
          this.render();
        };
      }
      parent.createEl("p", { text: hint, attr: { class: "prodigy-settings-hint" } });
    }

    renderTextInput(parent, label, value, placeholder, onChange) {
      field(parent, label);
      const input = parent.createEl("input", { attr: { type: "text", value, placeholder, "aria-label": label } });
      input.oninput = () => onChange(input.value.trim());
    }

    renderFooter(parent) {
      const footer = parent.createEl("div", { attr: { class: "prodigy-settings-footer" } });
      const cancel = createButton(footer, "취소");
      cancel.disabled = this.state.busy;
      cancel.onclick = () => this.close();
      const save = createButton(footer, this.state.busy ? "저장 중…" : "설정 저장", { primary: true });
      save.disabled = this.state.busy;
      save.onclick = async () => {
        this.state.busy = true;
        this.state.status = "설정을 저장하는 중…";
        this.render();
        try {
          const saved = await configService().save(this.app, {
            defaultProvider: this.state.config.defaultProvider,
            fallbackProvider: this.state.config.fallbackProvider,
            config: { workflowPresets: this.state.config.workflowPresets, providers: this.state.config.providers },
            secrets: this.state.secrets,
            deleteSecretIds: [...this.state.deleteSecretIds]
          });
          this.state.config = clone(saved);
          this.state.status = "설정을 저장했습니다.";
          if (typeof this.options.onSaved === "function") await this.options.onSaved(saved);
          notice("Prodigy OS 설정을 저장했습니다.");
          this.close();
        } catch (error) {
          this.state.status = `설정 저장 실패: ${error.message || error}`;
        } finally {
          this.state.busy = false;
          this.render();
        }
      };
    }
  }

  function open(app, options) {
    if (!root.obsidian || typeof root.obsidian.Modal !== "function") {
      notice("Prodigy OS 설정 화면을 열 수 없습니다.");
      return null;
    }
    const modal = new ProdigySettingsModal(app, options);
    modal.open();
    return modal;
  }

  const api = { open, ProdigySettingsModal };
  root.ProdigySettingsModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
