(function (root) {
  "use strict";

  function button(parent, text, primary) {
    return root.ProdigyUI
      ? root.ProdigyUI.button(parent, text, primary ? { primary: true } : undefined)
      : parent.createEl("button", { text, attr: { type: "button", class: `prodigy-btn${primary ? " prodigy-btn-primary" : ""}` } });
  }

  function renderProviderSummary(connection, modal, app, onNotice) {
    const status = connection.createEl("div", { attr: { class: "reflection-provider-summary", style: "color:var(--text-muted);margin-top:6px;min-height:44px;" } });
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
    contentEl.createEl("h3", { text: "오늘 일기" });
    contentEl.createEl("p", { text: "일기를 먼저 저장한 뒤, 필요할 때 AI 분류를 실행합니다. AI가 실패해도 저장한 일기는 유지됩니다.", attr: { style: "color:var(--text-muted);margin:0 0 12px;" } });
    const connection = contentEl.createEl("details", { attr: { class: "prodigy-utility-card", style: "margin:0 0 12px;" } });
    connection.createEl("summary", { text: "AI 설정" });
    connection.createEl("p", { text: "기본 AI 제공자와 API 키는 Prodigy OS 설정에서 공통으로 관리합니다.", attr: { style: "color:var(--text-muted);margin:8px 0;" } });
    renderProviderSummary(connection, modal, app, onNotice);

    const area = contentEl.createEl("textarea", { attr: { rows: "8", class: "prodigy-configurator-chip", style: "width:100%;min-height:140px;resize:vertical;color:var(--text-normal);" } });
    area.placeholder = "오늘 있었던 일, 실수, 배운 점, 다음에 바꾸고 싶은 점을 그대로 적어 주세요.";
    area.value = modal.freeText;
    let classify;
    area.oninput = () => {
      modal.freeText = area.value;
      if (classify) classify.disabled = String(modal.freeText || "").trim() !== modal.committedReflectionText;
    };
    const classificationStatus = contentEl.createEl("div", { attr: { class: "prodigy-status-line", role: "status", "aria-live": "polite", style: "color:var(--text-muted);margin-top:8px;min-height:44px;" } });
    const actions = contentEl.createEl("div", { attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" } });
    const cancel = button(actions, "취소");
    cancel.onclick = () => modal.close();
    const save = button(actions, "일기 저장", true);
    save.onclick = async () => {
      if (!String(modal.freeText || "").trim()) return onNotice("저장할 일기를 입력해 주세요.");
      save.disabled = true;
      save.textContent = "저장 중…";
      try {
        await modal.commitReflection();
        onNotice("일기를 저장했습니다.");
        modal.render();
      } catch (error) {
        save.disabled = false;
        save.textContent = "일기 저장";
        onNotice(`일기 저장 실패: ${error.message || error}`);
      }
    };
    classify = button(actions, "AI 분류");
    classify.disabled = !modal.committedReflectionText || String(modal.freeText || "").trim() !== modal.committedReflectionText;
    let progressTimer = null;
    let classificationController = null;
    let classificationRun = 0;
    const stopProgress = () => {
      if (!progressTimer) return;
      clearInterval(progressTimer);
      progressTimer = null;
    };
    const cancelClassification = () => {
      classificationRun += 1;
      stopProgress();
      if (classificationController && typeof classificationController.abort === "function") classificationController.abort();
      classificationController = null;
    };
    if (typeof modal.setClassificationCleanup === "function") modal.setClassificationCleanup(cancelClassification);
    const startProgress = () => {
      const startedAt = Date.now();
      const provider = modal.providerConfig && modal.providerConfig.providers && modal.providerConfig.providers[modal.providerKey];
      const providerLabel = provider && provider.name || modal.providerKey || "AI 제공자";
      const updateProgress = () => {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
        classificationStatus.setText(`AI 분류 중… ${providerLabel} 분석 ${elapsedSeconds}초 경과`);
      };
      updateProgress();
      progressTimer = setInterval(updateProgress, 1000);
    };
    const runClassification = async () => {
      if (classify.disabled) return;
      const ai = root.DailyReflectionAI;
      if (!ai || typeof ai.generateProposal !== "function") return onNotice("일기는 저장되어 있습니다. AI 분류 기능을 불러오지 못했습니다.");
      try {
        if (!modal.providerConfig && modal.providerConfigLoad) await modal.providerConfigLoad;
      } catch (_error) {
        return onNotice("일기는 저장되어 있습니다. AI 설정을 불러오지 못했습니다.");
      }
      if (!modal.providerConfig || !modal.providerKey) return onNotice("일기는 저장되어 있습니다. AI 설정을 불러오는 중입니다.");
      classify.disabled = true;
      classify.textContent = "분류 중…";
      modal.busy = true;
      modal.stateError = "";
      const run = ++classificationRun;
      const AbortControllerCtor = root.AbortController || (typeof AbortController === "function" ? AbortController : null);
      classificationController = AbortControllerCtor ? new AbortControllerCtor() : null;
      if (typeof modal.emitState === "function") modal.emitState("");
      startProgress();
      try {
        const proposal = await ai.generateProposal({ app, dateStr, freeText: modal.freeText, existingBlocks, providerKey: modal.providerKey, config: modal.providerConfig, signal: classificationController ? classificationController.signal : undefined });
        if (modal.closed || run !== classificationRun) return;
        modal.proposal = proposal;
        modal.resetProposalSelection();
        modal.busy = false;
        modal.phase = "confirm";
        modal.render();
        if (typeof modal.emitState === "function") modal.emitState("");
      } catch (error) {
        if (modal.closed || run !== classificationRun || error && error.name === "AbortError") return;
        classify.disabled = false;
        classify.textContent = "AI 분류";
        classificationStatus.setText("AI 분류에 실패했습니다. 다시 시도해 주세요.");
        modal.busy = false;
        if (typeof modal.emitState === "function") modal.emitState(error && (error.message || error));
        onNotice(`일기는 저장되어 있습니다. AI 분류만 실패했습니다: ${error.message || error}`);
      } finally {
        if (run === classificationRun) {
          stopProgress();
          classificationController = null;
          modal.busy = false;
        }
      }
    };
    classify.onclick = runClassification;
    if (modal.startClassification && !classify.disabled) {
      modal.startClassification = false;
      Promise.resolve().then(runClassification);
    }
  }

  root.DailyReflectionProposalInputView = Object.freeze({ render });
})(typeof globalThis !== "undefined" ? globalThis : this);
