(function (root) {
  "use strict";

  function button(parent, text, primary) {
    return root.ProdigyUI
      ? root.ProdigyUI.button(parent, text, primary ? { primary: true } : undefined)
      : parent.createEl("button", { text, attr: { type: "button", class: `prodigy-btn${primary ? " prodigy-btn-primary" : ""}` } });
  }

  function renderProviderSummary(connection, modal, app, onNotice) {
    const status = connection.createEl("div", { attr: { style: "font-size:.78em;color:var(--text-muted);margin-top:6px;min-height:1.2em;" } });
    const openSettings = button(connection, "통합 설정 열기");
    openSettings.style.marginTop = "8px";
    openSettings.onclick = () => {
      if (!root.ProdigySettingsModal || typeof root.ProdigySettingsModal.open !== "function") return onNotice("Prodigy OS 설정을 불러오지 못했습니다.");
      root.ProdigySettingsModal.open(app, {
        onSaved: async (config) => {
          modal.providerConfig = config;
          modal.providerKey = config.defaultProvider;
          const provider = config.providers[config.defaultProvider];
          status.setText(provider ? `${provider.name} · ${provider.model || "모델 미설정"}` : "AI 제공자를 선택해 주세요.");
        }
      });
    };

    const providerService = root.ProjectWorkflowDraftService;
    if (!providerService || typeof providerService.loadProviderConfig !== "function") {
      status.setText("AI 제공자 설정을 불러오지 못했습니다.");
      return;
    }
    modal.providerConfigLoad = Promise.resolve(providerService.loadProviderConfig(app)).then((config) => {
      modal.providerConfig = config;
      modal.providerKey = config.defaultProvider;
      const provider = config.providers[config.defaultProvider];
      status.setText(provider ? `${provider.name} · ${provider.model || "모델 미설정"}` : "AI 제공자를 선택해 주세요.");
      return config;
    }).catch((error) => {
      status.setText(error.message || String(error));
      throw error;
    });
  }

  function render(options) {
    const { modal, app, dateStr, existingBlocks, onNotice } = options;
    const contentEl = modal.contentEl;
    contentEl.createEl("h3", { text: "AI 성찰 분석" });
    contentEl.createEl("p", { text: "자유롭게 기록하면 선택한 AI가 증거와 지식·리소스·문서·PRE 분류 후보를 제안합니다. AI는 자동 저장하지 않습니다.", attr: { style: "color:var(--text-muted);font-size:0.85em;margin:0 0 12px;" } });
    const connection = contentEl.createEl("details", { attr: { style: "margin:0 0 12px;border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px 10px;background:var(--background-secondary);" } });
    connection.createEl("summary", { text: "AI 설정" });
    connection.createEl("p", { text: "기본 AI 제공자와 API 키는 Prodigy OS 설정에서 공통으로 관리합니다.", attr: { style: "color:var(--text-muted);font-size:.78em;margin:8px 0;" } });
    renderProviderSummary(connection, modal, app, onNotice);

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
      try {
        if (!modal.providerConfig && modal.providerConfigLoad) await modal.providerConfigLoad;
      } catch (_error) {
        return onNotice("AI 설정을 불러오지 못했습니다.");
      }
      if (!modal.providerConfig || !modal.providerKey) return onNotice("AI 설정을 불러오는 중입니다.");
      propose.disabled = true;
      propose.textContent = "분석 중…";
      modal.busy = true;
      try {
        modal.proposal = await ai.generateProposal({ app, dateStr, freeText: modal.freeText, existingBlocks, providerKey: modal.providerKey, config: modal.providerConfig });
        modal.resetProposalSelection();
        modal.phase = "confirm";
        modal.render();
      } catch (error) {
        propose.disabled = false;
        propose.textContent = "AI 적용";
        onNotice(error.message || String(error));
      } finally {
        modal.busy = false;
      }
    };
  }

  root.DailyReflectionProposalInputView = Object.freeze({ render });
})(typeof globalThis !== "undefined" ? globalThis : this);
