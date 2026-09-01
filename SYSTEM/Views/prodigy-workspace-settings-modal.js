(function (root) {
  "use strict";

  function notice(message) {
    if (root.Notice) new root.Notice(message);
  }
  function field(parent, labelText, secretId, state) {
    const label = parent.createEl("label", { attr: { class: "prodigy-settings-field" } });
    label.createEl("span", { text: labelText });
    const input = label.createEl("input", {
      attr: {
        type: "password",
        value: state.values[secretId] || "",
        placeholder: "SecretStorage 값",
        autocomplete: "off",
        "data-secret-id": secretId,
      },
    });
    input.oninput = () => {
      state.values[secretId] = input.value;
      state.dirty.add(secretId);
    };
  }

  class ProdigyWorkspaceSettingsModal extends (root.obsidian && root.obsidian.Modal || class {}) {
    constructor(app) {
      super(app);
      this.app = app;
      this.state = { values: {}, dirty: new Set(), status: "" };
    }
    async onOpen() {
      const service = root.ProdigyConfigService;
      if (!service) {
        this.state.status = "Workspace 설정 서비스를 불러오지 못했습니다.";
        this.render();
        return;
      }
      for (const secretId of Object.values(service.SECRET_IDS)) {
        this.state.values[secretId] = await service.getSecret(this.app, secretId).catch(() => "");
      }
      this.render();
    }
    onClose() { this.contentEl.empty(); }
    render() {
      const service = root.ProdigyConfigService;
      const content = this.contentEl;
      content.empty();
      content.createEl("h2", { text: "Prodigy OS 연결 설정" });
      content.createEl("p", { text: "외부 서비스 키는 이 기기의 SecretStorage에만 저장됩니다." });
      const ai = content.createEl("section");
      ai.createEl("h3", { text: "AI Runtime" });
      const aiButton = ai.createEl("button", { text: "AI Runtime 설정 열기", attr: { type: "button", "data-settings-action": "open-ai-runtime" } });
      aiButton.onclick = () => {
        const client = root.ProdigyAIClient && root.ProdigyAIClient.createClient({ app: this.app });
        if (!client || client.openSettings() !== true) notice("AI Runtime 설정을 열지 못했습니다.");
      };
      const integrations = content.createEl("section");
      integrations.createEl("h3", { text: "업무·공공데이터 연결" });
      const labels = {
        [service.SECRET_IDS.todoist]: "Todoist API Token",
        [service.SECRET_IDS.reb]: "한국부동산원 OpenAPI Key",
        [service.SECRET_IDS.dataGoKr]: "공공데이터포털 Service Key",
        [service.SECRET_IDS.vworld]: "VWorld API Key",
        [service.SECRET_IDS.kosis]: "KOSIS API Key",
        [service.SECRET_IDS.seoulOpenapi]: "서울 열린데이터광장 Key",
        [service.SECRET_IDS.naverClientId]: "Naver Client ID",
        [service.SECRET_IDS.naverClientSecret]: "Naver Client Secret",
        [service.SECRET_IDS.youtube]: "YouTube API Key",
      };
      for (const [secretId, labelText] of Object.entries(labels)) field(integrations, labelText, secretId, this.state);
      const actions = content.createEl("div", { attr: { class: "prodigy-settings-actions" } });
      const save = actions.createEl("button", { text: "저장", attr: { type: "button", class: "mod-cta", "data-settings-action": "save-integrations" } });
      save.onclick = async () => {
        for (const secretId of this.state.dirty) {
          const value = String(this.state.values[secretId] || "").trim();
          if (value) await service.setSecret(this.app, secretId, value);
          else await service.deleteSecret(this.app, secretId);
        }
        this.state.dirty.clear();
        this.state.status = "이 기기의 연결 설정을 저장했습니다.";
        this.render();
      };
      if (this.state.status) content.createEl("div", { text: this.state.status, attr: { role: "status" } });
    }
  }

  function open(app) {
    if (!root.obsidian || !root.obsidian.Modal) return null;
    const modal = new ProdigyWorkspaceSettingsModal(app);
    modal.open();
    return modal;
  }
  const api = Object.freeze({ open, ProdigyWorkspaceSettingsModal });
  root.ProdigyWorkspaceSettingsModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
