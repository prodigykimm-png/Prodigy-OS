---
cssclasses:
  - prodigy-hub-note
  - hide-properties_editing
  - hide-properties_reading
---
```dataviewjs
window.app = app;
window.KnowledgeExplorerHub = window.KnowledgeExplorerHub || {};

const KnowledgeExplorerHub = window.KnowledgeExplorerHub;
delete KnowledgeExplorerHub.documentPlanQualitySnapshot;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "knowledge"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "knowledge" };
const loadWorkspaceBootstrap = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};

KnowledgeExplorerHub.render = async ({ app: hubApp, dv: hubDv, container, obsidian: hubObsidian, mountContext }) => {
  const mountPoint = container;
  if (!mountPoint) throw new Error("Missing hub container.");
  const appRef = hubApp || app;
  const dvRef = hubDv || dv;
  const obsidianRef = hubObsidian || obsidian;
  const retry = mountContext && mountContext.retry;
  const llmWikiSession = KnowledgeExplorerHub._llmWikiSession && KnowledgeExplorerHub._llmWikiSession.version === 1
    ? KnowledgeExplorerHub._llmWikiSession
    : {
        version: 1,
        runController: null,
        controllerReady: null,
        bindings: {},
        viewState: {
          selectedProviderMode: "direct",
          selectedRunCommand: null,
          sourceOptions: [],
          providerSelectionFailure: "",
          inboxState: null,
        },
        inboxScanPromise: null,
        inboxScanController: null,
        inboxScanGeneration: 0,
        inboxSettled: null,
        inboxDiscoveryQueue: null,
        inboxSubscribers: new Set(),
        batchJobStore: null,
        batchCache: null,
        batchCoverage: null,
      };
  KnowledgeExplorerHub._llmWikiSession = llmWikiSession;
  llmWikiSession.bindings.app = appRef;
  const losslessDataSource = window.LLMWikiLosslessDataSource && typeof appRef.vault?.adapter?.read === "function"
    ? window.LLMWikiLosslessDataSource.createDataSource({ vault: appRef.vault }) : null;
  const losslessView = losslessDataSource && window.LLMWikiLosslessView?.createLosslessCorpusView({ app: appRef, dataSource: losslessDataSource, session: llmWikiSession.viewState });
  if (losslessView) {
    KnowledgeExplorerHub.openLosslessCorpus = (sourcePath) => losslessView.open(sourcePath);
    KnowledgeExplorerHub.losslessCorpusSnapshot = () => losslessView.snapshot();
    KnowledgeExplorerHub.listLosslessCorpora = () => losslessDataSource.list();
  }

  mountPoint.empty();
  let performance = null;
  let shell = null;
  let dataScanToken = null;
  let projectionToken = null;
  let domRenderToken = null;
  const measurementClosed = { data_scan: false, projection: false, dom_render: false };
  const endMeasurement = (phase, token, fields) => {
    if (!performance || !token || measurementClosed[phase]) return;
    performance.end(token, fields);
    measurementClosed[phase] = true;
  };
  try {
    shell = window.ProdigyWorkspaceNavigation.mount(mountPoint, { app: appRef, workspaceId: "knowledge", title: "지식", mountScope: mountContext.scope });
    performance = shell.performance;
    const P = window.KnowledgeExplorerHubProjection;
    if (!P || !window.KnowledgeExplorerRegistry || !window.KnowledgeAuthoringHubAdapter || !window.KnowledgeExplorerCore || !window.KnowledgeExplorerDataSource || !window.KnowledgeExplorerRelations || !window.KnowledgeExplorerHubAdapter || !window.KnowledgeExplorerBriefService || !window.KnowledgeExplorerBriefRender || !window.KnowledgeExplorerView || !window.LLMWikiRunController || !window.LLMWikiCompensationService || !window.LLMWikiLifecycleView || !window.ProdigyWikiController || !window.LLMWikiProviderResponseSchema || !window.LLMWikiSourceRegistry || !window.LLMWikiSourceAdapters || !window.LLMWikiMigrationRollout || !window.LLMWikiInboxPrivacyBoundary || !window.LLMWikiAnalysisScope || !window.LLMWikiChunkManifest || !window.LLMWikiChunkCoverageStore || !window.LLMWikiAnalysisCache || !window.LLMWikiIdentityResolution || !window.LLMWikiLifecycleRoutingContract || !window.LLMWikiDocumentAssembler || !window.LLMWikiInboxProposalMaterializer || !window.LLMWikiIncrementalAnalysisState || !window.LLMWikiWikiReadAdapter || !window.LLMWikiWikiReadService || !window.LLMWikiWikiSurface || !window.KnowledgeCommandController || !window.KnowledgeExplorerDetailModal || !window.KnowledgeExplorerController || !window.KnowledgeFleetingStore || !window.KnowledgeFleetingReviewState || !window.LLMWikiCanonicalTrust || !window.LLMWikiLifecycleMigrationFlows || !window.LLMWikiGitGateway || !window.LLMWikiBatchAnalyzer || !window.LLMWikiBatchProvider || !window.LLMWikiBatchJobStore || !window.LLMWikiInboxDiscoveryQueue || !window.LLMWikiBatchApprovalAdapter || !window.LLMWikiProcessedSourceService || !window.LLMWikiAnalysisCache || !window.LLMWikiChunkCoverageStore) {
      throw new Error("Knowledge Explorer modules failed to load.");
    }
    // Active maintenance scheduling state signal: wired after the LLM Wiki
    // surface mounts; re-scans read-only on controller state changes.
    let maintenanceTicker = null;
    const pokeMaintenance = () => {
      if (maintenanceTicker) { try { maintenanceTicker(); } catch (_error) { /* best-effort */ } }
    };
    const dataSource = window.KnowledgeExplorerDataSource.createKnowledgeExplorerDataSource({
      registry: window.KnowledgeExplorerRegistry,
      schemaVersion: window.KnowledgeExplorerCore.SCHEMA_VERSION,
      readBody: (asset) => P.readSelectedNote(appRef, dvRef, asset && asset.path)
    });
    dataScanToken = performance && performance.start("data_scan", { scope: "knowledge", status: "scanning" });
    const records = P.collectRecords(dataSource, dvRef);
    const relationRecords = P.collectRelationRecords(dvRef);
    endMeasurement("data_scan", dataScanToken, { scope: "knowledge", status: "loaded" });
    const snapshot = JSON.stringify(records);
    const relationSnapshot = JSON.stringify(relationRecords);
    projectionToken = performance && performance.start("projection", { scope: "knowledge", status: "projecting" });
    const model = window.KnowledgeExplorerCore.projectKnowledgeExplorer(records, window.KnowledgeExplorerRegistry);
    const relationsModel = window.KnowledgeExplorerRelations.projectRelations(relationRecords);
    endMeasurement("projection", projectionToken, { scope: "knowledge", status: "projected" });
    if (JSON.stringify(records) !== snapshot) throw new Error("Knowledge Explorer records were mutated.");
    if (JSON.stringify(relationRecords) !== relationSnapshot) throw new Error("Knowledge Explorer relation records were mutated.");
    const candidateConfig = await window.KnowledgeCandidateHubAdapter.createCandidateInboxConfig(appRef);
    model.detail_sections_by_asset_path = window.KnowledgeExplorerHubAdapter.buildDetailSections(model, relationsModel);
    model.detail_warnings = relationsModel.warnings || [];
    model.brief_signals_by_domain = relationsModel.signals_by_domain || {};
    const surfaceState = (model.warnings.length || relationsModel.warnings.length) ? "error" : "rest";
    const briefService = KnowledgeExplorerHub.briefService || window.KnowledgeExplorerBriefService.createKnowledgeExplorerBriefService({
      aiProviderService: window.AIProviderService || {},
      providerConfigService: window.ProjectWorkflowDraftService || {}
    });

    const workspaceBody = shell.body;
    domRenderToken = performance && performance.start("dom_render", { scope: "knowledge", status: "rendering" });
    // 탭 시스템 마운트
    const tabsMount = workspaceBody.createDiv({ attr: { class: "knowledge-workspace-tabs-mount" } });
    const tabs = window.KnowledgeWorkspaceTabs.mountTabs(tabsMount, {
      activeTab: KnowledgeExplorerHub._lastTab || "zettelkasten",
      onChange: (tabId) => { KnowledgeExplorerHub._lastTab = tabId; }
    });

    // 제텔카스텐 탭: 기존 Explorer + 작성 버튼
    const zettelPanel = tabs.getPanel("zettelkasten");
    const relationBuckets = relationsModel && relationsModel.relations_by_source
      && typeof relationsModel.relations_by_source === "object"
      ? relationsModel.relations_by_source : {};
    const relationCount = Object.keys(relationBuckets).reduce((total, sourcePath) => {
      const relations = relationBuckets[sourcePath];
      return total + (Array.isArray(relations) ? relations.length : 0);
    }, 0);
    const candidateCount = candidateConfig && candidateConfig.candidateInbox
      && Array.isArray(candidateConfig.candidateInbox.candidates)
      ? candidateConfig.candidateInbox.candidates.length : 0;
    const recentKnowledge = (Array.isArray(model.assets) ? model.assets : [])
      .filter((asset) => asset && asset.kind === "knowledge")
      .slice(0, 3);

    const zettelRolePanel = zettelPanel.createDiv({
      attr: {
        class: "knowledge-workspace-role-panel prodigy-full-bleed",
        "data-workspace-role": "knowledge-building",
        "aria-label": "제텔카스텐 지식 구축 역할",
        style: "margin-block-end:17px;min-inline-size:0;overflow-wrap:anywhere;"
      }
    });
    zettelRolePanel.createEl("div", {
      text: "지식 구축",
      attr: { class: "knowledge-explorer-meta", style: "font-weight:700;color:var(--ke-color-interactive,var(--text-accent));" }
    });
    zettelRolePanel.createEl("h2", {
      text: "제텔카스텐",
      attr: { style: "margin:4px 0 8px;overflow-wrap:anywhere;" }
    });
    zettelRolePanel.createEl("p", {
      text: "생각과 자료를 원자적 지식으로 만들고, 연결하고, 사람의 검토를 거쳐 보존합니다.",
      attr: { class: "knowledge-explorer-meta", style: "margin:0;overflow-wrap:anywhere;" }
    });

    // 빠른 캡처 행: 제텔카스텐 표면에 두 동작을 직접 노출한다.
    // 자료 넣기는 파일 생성 이벤트로 기존 INBOX 자동 스캔을 트리거한다.
    let fleetingReviewState = { status: "idle", reason: "", pending_count: 0, reviews: [] };
    let refreshFleetingSurface = async () => fleetingReviewState;
    let dispatchFleetingAction = async () => ({ ok: false, reason: "fleeting_review_initializing" });
    const quickCaptureMount = zettelPanel.createDiv({ attr: { class: "quick-capture-mount", style: "margin-block-end:17px;min-inline-size:0;" } });
    let quickCaptureHandle = null;
    if (window.QuickCaptureView && typeof window.QuickCaptureView.mountQuickCapture === "function") {
      quickCaptureHandle = window.QuickCaptureView.mountQuickCapture({
        app: appRef,
        container: quickCaptureMount,
        sessionId: "knowledge-quick-capture",
        scope: mountContext && mountContext.scope || null,
        onSaved: ({ mode }) => { if (mode === "thought") refreshFleetingSurface(); }
      });
      if (mountContext && mountContext.scope && typeof mountContext.scope.track === "function") {
        mountContext.scope.track(() => {
          if (quickCaptureHandle && typeof quickCaptureHandle.dispose === "function") quickCaptureHandle.dispose();
        });
      }
    }
    const fleetingSummary = zettelPanel.createDiv({ attr: { class: "knowledge-fleeting-summary prodigy-full-bleed", "data-fleeting-status": "idle", style: "margin-block-end:17px;min-inline-size:0;overflow-wrap:anywhere;" } });
    const fleetingSummaryText = fleetingSummary.createEl("p", { attr: { class: "knowledge-explorer-meta", "data-fleeting-pending-count": "0", role: "status", style: "margin:0 0 8px;" } });
    const fleetingSummaryAction = fleetingSummary.createEl("button", { text: "생각 정리", attr: { type: "button", class: "prodigy-btn", "data-action": "review-fleeting", "data-intent-action": "review_fleeting" } });
    const renderFleetingSummary = (state) => {
      const count = Number(state && state.pending_count) || 0;
      fleetingSummary.setAttr("data-fleeting-status", String(state && state.status || "idle"));
      fleetingSummaryText.setAttr("data-fleeting-pending-count", String(count));
      fleetingSummaryText.setText(state && state.status === "blocked" ? "미정리 생각 상태를 읽지 못했습니다. LLM Wiki에서 복구해 주세요." : `미정리 생각 ${count}개`);
      fleetingSummaryAction.disabled = count === 0 || state && ["analyzing", "blocked"].includes(state.status);
    };
    fleetingSummaryAction.onclick = () => dispatchFleetingAction();
    renderFleetingSummary(fleetingReviewState);

    const growthPanel = zettelPanel.createDiv({
      attr: {
        class: "knowledge-growth-summary prodigy-full-bleed is-parchment",
        "data-workspace-role": "knowledge-growth",
        "aria-label": "지식 축적 현황",
        style: "margin-block-end:17px;min-inline-size:0;"
      }
    });
    growthPanel.createEl("h3", { text: "지식 축적 현황", attr: { style: "margin:0 0 12px;overflow-wrap:anywhere;" } });
    const growthStats = growthPanel.createDiv({
      attr: { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));gap:8px;min-inline-size:0;" }
    });
    [
      ["knowledge", "영구 지식", model.totals && model.totals.knowledge, "사람이 승인한 영구 지식"],
      ["resources", "자료·맥락", model.totals && model.totals.resources, "문헌·연결 자료"],
      ["pending", "검증 대기", candidateCount, "승인 전 후보"],
      ["relations", "연결 관계", relationCount, "지식·자료를 잇는 탐색 경로"]
    ].forEach(([key, label, value, hint]) => {
      const card = growthStats.createDiv({
        attr: {
          class: "knowledge-growth-stat prodigy-utility-card",
          "data-growth-key": key,
          style: "min-inline-size:0;overflow-wrap:anywhere;"
        }
      });
      card.createEl("div", { text: label, attr: { class: "knowledge-explorer-meta" } });
      card.createEl("strong", { text: String(Number(value) || 0), attr: { style: "display:block;" } });
      card.createEl("small", { text: hint, attr: { class: "knowledge-explorer-meta" } });
    });
    growthPanel.createEl("p", {
      text: recentKnowledge.length
        ? `최근 쌓인 지식: ${recentKnowledge.map((asset) => asset.title).join(" · ")}`
        : "아직 영구 지식이 없습니다. 검증을 통과한 지식이 이곳에 쌓입니다.",
      attr: { class: "knowledge-explorer-meta", style: "margin-block-start:12px;overflow-wrap:anywhere;" }
    });
    const reviewPanel = zettelPanel.createDiv({
      attr: {
        class: "knowledge-candidate-review-launcher prodigy-full-bleed is-parchment",
        "data-workspace-role": "knowledge-review",
        "aria-label": "승인 전 후보 검토",
        style: "margin-block-end:17px;border-inline-start:3px solid var(--ke-color-interactive,var(--text-accent));min-inline-size:0;overflow-wrap:anywhere;"
      }
    });
    reviewPanel.createEl("h3", { text: "승인 전 후보 검토", attr: { style: "margin:0 0 8px;overflow-wrap:anywhere;" } });
    reviewPanel.createEl("p", {
      text: "필요할 때 검증 대기열을 열어 후보를 확인하고 승인·보류·반려합니다.",
      attr: { class: "knowledge-explorer-meta", style: "margin:0 0 12px;overflow-wrap:anywhere;" }
    });
    const candidateReviewOpen = () => {
      const currentApi = KnowledgeExplorerHub.api || api;
      return currentApi && typeof currentApi.candidateInboxOpen === "function"
        ? currentApi.candidateInboxOpen()
        : false;
    };
    const syncReviewButton = () => {
      if (!reviewButton) return;
      const open = candidateReviewOpen();
      const label = open ? "검증 대기 닫기" : "검증 대기 열기";
      if (typeof reviewButton.setText === "function") reviewButton.setText(label);
      else reviewButton.textContent = label;
      if (typeof reviewButton.setAttr === "function") {
        reviewButton.setAttr("aria-label", label);
        reviewButton.setAttr("aria-expanded", String(open));
      } else if (typeof reviewButton.setAttribute === "function") {
        reviewButton.setAttribute("aria-label", label);
        reviewButton.setAttribute("aria-expanded", String(open));
      }
    };
    const focusCandidateReview = () => {
      const currentApi = KnowledgeExplorerHub.api || api;
      if (currentApi && typeof currentApi.openCandidateInbox === "function") currentApi.openCandidateInbox();
      const target = currentApi && currentApi.container ? currentApi.container : explorerMount;
      if (target && typeof target.scrollIntoView === "function") {
        const reduceMotion = typeof window !== "undefined"
          && typeof window.matchMedia === "function"
          && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
      syncReviewButton();
    };
    const closeCandidateReview = () => {
      const currentApi = KnowledgeExplorerHub.api || api;
      if (currentApi && typeof currentApi.setCandidateInboxOpen === "function") currentApi.setCandidateInboxOpen(false);
      syncReviewButton();
    };
    const reviewButton = window.ProdigyUI && typeof window.ProdigyUI.button === "function"
      ? window.ProdigyUI.button(reviewPanel, "검증 대기 열기", {
        quiet: true,
        className: "knowledge-explorer-button"
      })
      : reviewPanel.createEl("button", {
        text: "검증 대기 열기",
        attr: {
          type: "button",
          class: "prodigy-btn prodigy-btn-quiet knowledge-explorer-button"
        }
      });
    if (typeof reviewButton.setAttr === "function") {
      reviewButton.setAttr("aria-label", "검증 대기 열기");
      reviewButton.setAttr("aria-expanded", "false");
    } else if (typeof reviewButton.setAttribute === "function") {
      reviewButton.setAttribute("aria-label", "검증 대기 열기");
      reviewButton.setAttribute("aria-expanded", "false");
    }
    reviewButton.onclick = () => {
      if (candidateReviewOpen()) closeCandidateReview();
      else focusCandidateReview();
    };

    const authoringMount = zettelPanel.createDiv({ attr: { class: "knowledge-authoring-hub-mount" } });
    const explorerMount = zettelPanel.createDiv({ attr: { class: "knowledge-explorer-hub-mount" } });
    KnowledgeExplorerHub.authoringActions = window.KnowledgeAuthoringHubAdapter.mountKnowledgeAuthoringActions(authoringMount, {
      app: appRef,
      onReload: retry,
      onReview: focusCandidateReview
    });
    const api = window.KnowledgeExplorerView.mountKnowledgeExplorer({
      app: appRef,
      container: explorerMount,
      resizeTarget: shell.element,
      mountGeneration: mountContext.mountGeneration,
      model,
      surfaceState,
      onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath),
      onOpenSource: (targetPath) => P.openBeside(appRef, targetPath),
      briefService,
      hydrateAsset: dataSource.hydrate,
      ...candidateConfig
    });
    shell.element.__prodigyKnowledgeResponsiveParticipant = api;
    mountContext.scope.track(() => {
      if (shell.element.__prodigyKnowledgeResponsiveParticipant === api) delete shell.element.__prodigyKnowledgeResponsiveParticipant;
    });

    // PARA 탭: 연결된 승인 지식만
    const paraPanel = tabs.getPanel("para");
    const paraModel = window.KnowledgeParaProjection.projectParaKnowledge(records, relationRecords);
    window.KnowledgeParaView.renderParaPanel(paraPanel, paraModel, {
      app: appRef,
      onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath),
      onOpenZettel: () => tabs.select("zettelkasten"),
      actionOptions: {
        ...(KnowledgeExplorerHub.authoringActions && KnowledgeExplorerHub.authoringActions.config
          ? KnowledgeExplorerHub.authoringActions.config : {}),
        onReload: retry
      },
      onCreated: () => retry()
    });

    // LLMWiki lifecycle tab: provider-backed proposal flow remains consent-first.
    const llmWikiPanel = tabs.getPanel("llmwiki");
    const browsePanel = tabs.getPanel("llmwiki-browse");
    if (!window.LLMWikiGoldenPreviewWorkbench) {
      try { await loadWorkspaceBootstrap("SYSTEM/Views/llmwiki-golden-preview-workbench.js"); }
      catch (_error) { /* Optional read-only preview surface; lifecycle stays available. */ }
    }
    if (!window.LLMWikiGoldenQualityGate) {
      try { await loadWorkspaceBootstrap("SYSTEM/Views/llmwiki-golden-quality-gate.js"); }
      catch (_error) { /* Golden creation remains unavailable without a deterministic gate. */ }
    }
    if (!window.LLMWikiGoldenWikiOrchestrator) {
      try { await loadWorkspaceBootstrap("SYSTEM/Views/llmwiki-golden-wiki-orchestrator.js"); }
      catch (_error) { /* Existing review lifecycle remains available. */ }
    }
    if (!window.LLMWikiUserSourceSelector || window.LLMWikiUserSourceSelector.VERSION !== 4) {
      try { await loadWorkspaceBootstrap("SYSTEM/Views/llmwiki-user-source-selector.js"); }
      catch (_error) { /* Existing Literature selector remains available. */ }
    }
    let goldenPreviewRows = [];
    let goldenPreviewWorkbench = null;
    if (window.LLMWikiGoldenPreviewWorkbench && typeof appRef.vault?.getFiles === "function" && typeof appRef.vault?.cachedRead === "function") {
      try { goldenPreviewRows = await window.LLMWikiGoldenPreviewWorkbench.loadPreviews(appRef.vault); }
      catch (_error) { goldenPreviewRows = []; }
    }
    const goldenPreviewReviewed = llmWikiSession.goldenPreviewReviewed instanceof Set
      ? llmWikiSession.goldenPreviewReviewed : new Set();
    llmWikiSession.goldenPreviewReviewed = goldenPreviewReviewed;
    const llmWikiControllerOptions = { ...(KnowledgeExplorerHub.llmWikiControllerOptions || {}) };
    let llmWikiConfig = await window.ProdigyConfigService.load(appRef);
    llmWikiSession.bindings.config = llmWikiConfig;
    const configuredProviderOptions = async (config) => {
      const options = window.ProdigyConfigService.listAIProfileProviderOptions(config, "llmwiki", "direct");
      return Promise.all(options.map(async (option) => {
        const provider = config.providers && config.providers[option.provider_key];
        // Task 11: verification stays with AIProviderService when it exposes a
        // verifier; otherwise the request boundary fails typed on its own.
        const verifier = window.AIProviderService && window.AIProviderService.isProviderConfigured;
        let configured = typeof verifier !== "function";
        if (typeof verifier === "function") {
          try { configured = await verifier(appRef, provider) === true; } catch (_error) { configured = false; }
        }
        return Object.freeze({ ...option, configured });
      }));
    };
    let providerOptions = await configuredProviderOptions(llmWikiConfig);
    let selectedProviderMode = llmWikiSession.viewState.selectedProviderMode || "direct";
    let sourceOptions = Array.isArray(llmWikiSession.viewState.sourceOptions) ? llmWikiSession.viewState.sourceOptions : [];
    let providerSelectionFailure = llmWikiSession.viewState.providerSelectionFailure || "";
    let selectedRunCommand = llmWikiSession.viewState.selectedRunCommand || null;
    const prodigyWikiController = KnowledgeExplorerHub._prodigyWikiController
      || window.ProdigyWikiController.createController();
    KnowledgeExplorerHub._prodigyWikiController = prodigyWikiController;
    llmWikiSession.prodigyWikiController = prodigyWikiController;
    for (const key of ["selectedSource", "startupStatus", "startupFailure", "goldenWikiState"]) {
      delete llmWikiSession.viewState[key];
    }
    const persistLlmWikiSessionView = () => {
      llmWikiSession.viewState = {
        ...llmWikiSession.viewState,
        selectedProviderMode,
        selectedRunCommand,
        sourceOptions,
        providerSelectionFailure,
        inboxState: llmWikiSession.viewState.inboxState,
      };
      llmWikiSession.bindings.config = llmWikiConfig;
      llmWikiSession.bindings.providerMode = selectedProviderMode;
    };
    persistLlmWikiSessionView();
    const llmWikiHash = window.LLMWikiHash;
    let llmWikiWikiSurface = null;
    const operationOutcomeRoot = "SYSTEM/PRIVATE/llmwiki-operation-outcomes";
    const operationOutcomeStore = {
      async save(outcome) {
        const vault = appRef.vault;
        for (const folder of ["SYSTEM/PRIVATE", operationOutcomeRoot]) if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
        const path = `${operationOutcomeRoot}/${outcome.run_id}.json`;
        const bytes = `${JSON.stringify(outcome, null, 2)}\n`;
        const file = vault.getAbstractFileByPath(path);
        if (file) await vault.modify(file, bytes); else await vault.create(path, bytes);
      },
      async load(runId) {
        const file = appRef.vault.getAbstractFileByPath(`${operationOutcomeRoot}/${runId}.json`);
        if (!file) return null;
        try { return JSON.parse(await appRef.vault.read(file)); } catch (_error) { return null; }
      }
    };
    const operationProvider = typeof llmWikiControllerOptions.operation_provider === "function" ? llmWikiControllerOptions.operation_provider : null;
    const validSourceId = (value) => /^[a-z][a-z0-9_-]{2,127}$/u.test(String(value || "").trim());
    const eligibleLiteratureSources = async () => {
      const files = appRef && appRef.vault && typeof appRef.vault.getMarkdownFiles === "function" ? appRef.vault.getMarkdownFiles() : [];
      const candidates = files.filter((file) => file && typeof file.path === "string" && file.path.startsWith("ZETA/LITERATURE/") && file.path.endsWith(".md"));
      const options = (await Promise.all(candidates.map(async (file) => {
        try {
          const source = await window.KnowledgeSourceStore.readSource(appRef, file.path);
          const sensitivity = String(source.sensitivity || source.source_kind || "").trim();
          const body = String(source.body || "").trim();
          if (!validSourceId(source.source_id) || !["public", "synthetic"].includes(sensitivity) || !/^https?:\/\//u.test(String(source.source_url || "")) || !body) return null;
          return Object.freeze({ path: file.path, title: String(source.source_title || file.basename || file.path).trim(), source_id: source.source_id, content_hash: llmWikiHash.sha256(body) });
        } catch (_error) { return null; }
      }))).filter(Boolean);
      return options.sort((left, right) => left.title.localeCompare(right.title, "ko"));
    };
    const eligibleSources = async () => {
      const inboxRequest = window.LLMWikiUserSourceSelector
        ? window.LLMWikiUserSourceSelector.listInboxSources({ vault: appRef.vault, metadataCache: appRef.metadataCache, hash: llmWikiHash, privacy: window.LLMWikiInboxPrivacyBoundary }).catch(() => [])
        : Promise.resolve([]);
      const [literature, inbox] = await Promise.all([eligibleLiteratureSources(), inboxRequest]);
      return [...inbox, ...literature].sort((left, right) => left.title.localeCompare(right.title, "ko") || left.path.localeCompare(right.path, "ko"));
    };
    const sourceOptionsReady = sourceOptions.length
      ? Promise.resolve(sourceOptions)
      : eligibleSources().then((rows) => {
          if (!sourceOptions.length) {
            sourceOptions = rows;
            persistLlmWikiSessionView();
          }
          return rows;
        }).catch(() => []);
    const resolveProvider = (mode) => window.ProdigyConfigService.resolveAIProfileProviderKey(llmWikiSession.bindings.config, "llmwiki", mode);
    // Task 11 cutover: selected-source/Literature runs enter the same canonical
    // one-source batch as INBOX runs. No librarian pipeline, no second transport.
    const defaultBatchCommand = async (sourcePath) => {
      const option = sourceOptions.find((item) => item.path === sourcePath);
      if (!option) return null;
      if (option.source_kind === "inbox") {
        const file = appRef.vault.getAbstractFileByPath(option.path);
        if (!file) return null;
        const body = await appRef.vault.cachedRead(file);
        const verified = window.LLMWikiUserSourceSelector?.verifySelection(option, body, llmWikiHash);
        if (!verified?.ok) return null;
        const now = new Date().toISOString();
        const runId = `run_${llmWikiHash.sha256(`${option.path}:${option.content_hash}`).slice(0, 24)}`;
        return {
          run_id: runId,
          sources: [{ selected: true, display_name: option.title, sensitivity: "internal", confidence: "explicit", extracted_text: body, source_path: option.path, manifest: { source_id: option.source_id, content_hash: option.content_hash, locator: option.path } }],
          retrieval: { snapshot: { documents: [] } },
          consent: { issued_at: now, nonce: `consent_${runId.slice(4)}_0001` },
          approval: { expires_at: new Date(Date.now() + 3600000).toISOString(), nonce: `approval_${runId.slice(4)}_0001` },
          advanced_settings: { provider_mode: "direct", timeout_ms: 60000 },
          canonical_defaults: { knowledge_domain: "personal", knowledge_topics: [], application_trigger: "사람이 승인할 때", application_contexts: ["personal"], connections: [], invalidation_conditions: ["선택 원문이 바뀌면 다시 검토한다."], summary: "" }
        };
      }
      const source = await window.KnowledgeSourceStore.readSource(appRef, option.path);
      const body = String(source.body || "").trim();
      const contentHash = llmWikiHash.sha256(body);
      if (!body || contentHash !== option.content_hash || source.source_id !== option.source_id) return null;
      const now = new Date().toISOString();
      const runId = `run_${llmWikiHash.sha256(`${option.path}:${contentHash}`).slice(0, 24)}`;
      return {
        run_id: runId,
        sources: [{ selected: true, display_name: option.title, sensitivity: "public", confidence: "explicit", extracted_text: body, source_path: option.path, manifest: { source_id: option.source_id, content_hash: contentHash, locator: option.path } }],
        retrieval: { snapshot: { documents: [] } },
        consent: { issued_at: now, nonce: `consent_${runId.slice(4)}_0001` },
        approval: { expires_at: new Date(Date.now() + 3600000).toISOString(), nonce: `approval_${runId.slice(4)}_0001` },
        advanced_settings: { provider_mode: selectedProviderMode, timeout_ms: 60000 },
        canonical_defaults: { knowledge_domain: "reading", knowledge_topics: [], application_trigger: "사람이 승인할 때", application_contexts: ["reading"], connections: [], invalidation_conditions: ["선택 근거가 바뀌면 다시 검토한다."], summary: "" }
      };
    };
    // Task 11 cutover: the single canonical analysis boundary. Exactly one
    // durable job store, one analyzer construction, one provider request
    // boundary; identity is frozen from the global default provider per Task 4.
    const batchIdentity = llmWikiControllerOptions.batchIdentity || (() => {
      const resolved = resolveProvider("direct");
      if (!resolved || resolved.ok !== true) return null;
      const configured = providerOptions.find((option) => option.provider_key === resolved.provider_key && option.configured === true);
      if (!configured) return null;
      const providerRecord = (llmWikiConfig.providers || {})[resolved.provider_key] || {};
      if (!providerRecord.model) return null;
      return Object.freeze({ provider_key: resolved.provider_key, model: providerRecord.model, structured_mode: "json_schema", schema_id: "llmwiki_compact_v1", prompt_version: "llmwiki_batch_compact_v1", provider: resolved.provider });
    })();
    const batchProvider = llmWikiControllerOptions.batchProvider
      || (batchIdentity ? window.LLMWikiBatchProvider.createBatchAnalysisProvider({ app: appRef, identity: batchIdentity }) : null);
    const batchJobStore = llmWikiSession.batchJobStore || llmWikiControllerOptions.batchJobStore || window.LLMWikiBatchJobStore.createBatchJobStore({ storage: {
      async exists(name) { return Boolean(appRef.vault.getAbstractFileByPath(`SYSTEM/CACHE/llmwiki/${name}`)); },
      async read(name) { return appRef.vault.cachedRead(appRef.vault.getAbstractFileByPath(`SYSTEM/CACHE/llmwiki/${name}`)); },
      async writeAtomic(name, text) {
        const filePath = `SYSTEM/CACHE/llmwiki/${name}`;
        const file = appRef.vault.getAbstractFileByPath(filePath);
        if (file) await appRef.vault.modify(file, text); else {
          for (const folder of ["SYSTEM/CACHE", "SYSTEM/CACHE/llmwiki"]) if (!appRef.vault.getAbstractFileByPath(folder)) await appRef.vault.createFolder(folder);
          await appRef.vault.create(filePath, text);
        }
      },
      async quarantine(name) {
        const filePath = `SYSTEM/CACHE/llmwiki/${name}`;
        const file = appRef.vault.getAbstractFileByPath(filePath);
        if (!file) return;
        const bytes = await appRef.vault.read(file);
        await appRef.vault.create(`${filePath}.quarantine`, bytes);
        await appRef.vault.modify(file, JSON.stringify({ schema_version: 3, jobs: {}, packs: {}, plans: {}, legacy: [], recovery: null }));
      },
    } });
    llmWikiSession.batchJobStore = batchJobStore;
    const batchJobState = await batchJobStore.load();
    let durableRecovery = batchJobStore.getRecoverySnapshot();
    const batchApprovalVault = {
      async readBytes(targetPath) {
        const file = appRef.vault.getAbstractFileByPath(targetPath);
        return file ? appRef.vault.cachedRead(file) : null;
      },
      async writeExact(targetPath, bytes) {
        const segments = targetPath.split("/");
        for (let index = 1; index < segments.length; index += 1) {
          const folder = segments.slice(0, index).join("/");
          if (folder && !appRef.vault.getAbstractFileByPath(folder)) {
            try { await appRef.vault.createFolder(folder); }
            catch (error) {
              if (!/Folder already exists\.?/iu.test(String(error && error.message || error))) throw error;
            }
          }
        }
        const file = appRef.vault.getAbstractFileByPath(targetPath);
        if (file) await appRef.vault.modify(file, bytes); else await appRef.vault.create(targetPath, bytes);
        return { ok: true };
      },
      async deleteExact(targetPath) {
        const file = appRef.vault.getAbstractFileByPath(targetPath);
        if (!file) return { ok: false, reason: "missing" };
        await appRef.vault.delete(file);
        return { ok: true };
      },
    };
    const inboxDiscoveryQueue = llmWikiSession.inboxDiscoveryQueue || window.LLMWikiInboxDiscoveryQueue.createInboxDiscoveryQueue({
      registry: window.LLMWikiSourceRegistry.createSourceRegistry({ extractors: [{ extractor_id: "extractor_markdown", extractor_version: "1.0.0", media_kinds: ["text/markdown"] }] }),
      jobStore: batchJobStore,
    });
    llmWikiSession.inboxDiscoveryQueue = inboxDiscoveryQueue;
    const durableUnknownJob = Object.values(batchJobState.jobs || {}).find((job) => job.status === "outcome_unknown") || null;
    const approvalGroups = new Map();
    const restoreDurableApprovalGroups = () => {
      if (!durableRecovery?.review?.proposals?.length || !durableRecovery.approval_sources?.length) return 0;
      const operations = new Map();
      for (const row of durableRecovery.review.proposals) {
        const parsed = window.LLMWikiOperationContract.parseOperation(row.serialized_operation);
        if (parsed?.ok) operations.set(row.operation_id, parsed.value);
      }
      for (const source of durableRecovery.approval_sources) {
        if (approvalGroups.has(source.source_id)) continue;
        approvalGroups.set(source.source_id, Object.freeze({
          source_id: source.source_id,
          source_path: source.source_path,
          content_hash: source.content_hash,
          proposals: Object.freeze(source.operation_ids
            .map((operationId) => ({
              operation: operations.get(operationId),
              class: operations.get(operationId)?.kind || "create",
              unit_id: operationId,
            }))
            .filter((row) => row.operation)),
          holds: Object.freeze(Array.from({ length: source.unresolved_holds || 0 }, () => ({ reason: "unresolved_hold" }))),
          para_drafts: Object.freeze(Array.from({ length: source.unresolved_para_drafts || 0 }, () => ({ reason: "unresolved_para_draft" }))),
        }));
      }
      return approvalGroups.size;
    };
    if (durableRecovery && durableRecovery.active_tab === "llmwiki") {
      KnowledgeExplorerHub._lastTab = "llmwiki";
      tabs.select("llmwiki");
    }
    const batchCache = llmWikiSession.batchCache || window.LLMWikiAnalysisCache.createAnalysisCache({ vault: appRef.vault });
    const batchCoverage = llmWikiSession.batchCoverage || window.LLMWikiChunkCoverageStore.createChunkCoverageStore({ vault: appRef.vault });
    llmWikiSession.batchCache = batchCache;
    llmWikiSession.batchCoverage = batchCoverage;
    const MAX_INBOX_ANALYSIS_BYTES = 4 * 1024;
    const inboxAnalysisText = (extractedText) => {
      let end = 0;
      let total = 0;
      while (end < extractedText.length) {
        const code = extractedText.charCodeAt(end);
        const paired = code >= 0xd800 && code <= 0xdbff && extractedText.charCodeAt(end + 1) >= 0xdc00 && extractedText.charCodeAt(end + 1) <= 0xdfff;
        const width = paired ? 2 : 1;
        const byteLength = paired ? 4 : code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
        if (total + byteLength > MAX_INBOX_ANALYSIS_BYTES) break;
        total += byteLength;
        end += width;
      }
      return extractedText.slice(0, end);
    };
    const batchAnalyzer = batchIdentity && batchProvider ? window.LLMWikiBatchAnalyzer.createBatchAnalyzer({
      jobStore: batchJobStore,
      provider: batchProvider,
      identity: batchIdentity,
      cache: batchCache,
      coverage: batchCoverage,
    }) : null;
    const compactArtifactsFromHits = (hits, sourceOffset = 0) => hits.map((hit) => Object.freeze({
      chunk_key: hit.artifact.semantic_id,
      outcome: hit.artifact.outcome,
      // Provider artifacts carry chunk-local spans and string claims. The local
      // materializer needs source-global spans and typed { text } claims.
      items: JSON.parse(JSON.stringify(hit.artifact.items)).map((item) => {
        const span = item.span;
        const localSpan = span && Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end)
          && span.start >= 0 && span.end > span.start && span.end <= hit.chunk.text.length;
        return {
          ...item,
          ...(localSpan ? {
            span: {
              ...span,
              start: sourceOffset + hit.chunk.start + span.start,
              end: sourceOffset + hit.chunk.start + span.end,
            },
          } : {}),
          claims: (item.claims || []).map((claim) => typeof claim === "string" ? { text: claim } : claim),
        };
      }),
    }));
    // One canonical composition: analyzer artifacts -> local materialization ->
    // typed lifecycle proposals. Zero writes; approval stays on the retained
    // controller surface.
    const runCanonicalBatch = async ({ sources, candidates = [], signal, explicitRetry = false, retryIntentId = null }) => {
      if (!batchAnalyzer) return { ok: false, reason: "provider_selection_unavailable", provider_calls: 0 };
      const analyzed = await batchAnalyzer.analyze({ sources, candidates, signal, explicit_retry: explicitRetry, ...(retryIntentId ? { retry_intent_id: retryIntentId } : {}) });
      const providerCalls = analyzed.metrics ? analyzed.metrics.provider_calls : 0;
      if (!analyzed.ok || !["review_ready", "resolved"].includes(analyzed.state)) return { ok: false, reason: analyzed.reason || analyzed.state || "batch_analysis_failed", provider_calls: providerCalls, job_id: analyzed.job_id, batch_id: analyzed.batch_id };
      const proposals = [];
      const objectReviewProposals = [];
      const holds = [];
      const noChanges = [];
      const sourceGroups = [];
      const artifactsBySource = new Map();
      for (const sourceRow of sources) {
        const analysisText = sourceRow.analysis_text || sourceRow.extracted_text;
        const scope = window.LLMWikiAnalysisScope.createAnalysisScope({ source_id: sourceRow.source_id, source_path: sourceRow.source_path, content_hash: llmWikiHash.sha256(analysisText), source_text: analysisText });
        const manifest = window.LLMWikiChunkManifest.createChunkManifest(scope);
        const lookup = await batchCache.lookup(manifest, scope, { request_key: analyzed.request_key });
        if (!lookup.ok) return { ok: false, reason: lookup.reason || "cache_lookup_failed", provider_calls: providerCalls };
        const artifacts = compactArtifactsFromHits(lookup.hits, Number.isSafeInteger(sourceRow.scope_start) ? sourceRow.scope_start : 0);
        artifactsBySource.set(sourceRow.source_id, artifacts);
        const materialized = await materializeInboxProposals({ artifacts, source: { source_id: sourceRow.source_id, source_path: sourceRow.source_path, content_hash: llmWikiHash.sha256(sourceRow.extracted_text) } });
        if (!materialized.ok) return { ok: false, reason: materialized.reason || "local_materialization_failed", provider_calls: providerCalls };
        proposals.push(...materialized.proposals);
        holds.push(...materialized.holds);
        noChanges.push(...materialized.no_changes);
        objectReviewProposals.push(...materialized.object_review_proposals);
        const grouped = window.LLMWikiBatchApprovalAdapter.groupProposalsBySource({
          source: { source_id: sourceRow.source_id, source_path: sourceRow.source_path, content_hash: llmWikiHash.sha256(sourceRow.extracted_text) },
          materializeResult: { ok: true, proposals: materialized.proposals, holds: materialized.holds, para_drafts: materialized.para_drafts },
        });
        if (!grouped.ok) return { ok: false, reason: grouped.reason, provider_calls: providerCalls };
        sourceGroups.push(grouped.value);
      }
      return { ok: true, provider_calls: providerCalls, proposals, object_review_proposals: objectReviewProposals, holds, no_changes: noChanges, source_groups: sourceGroups, batch_id: analyzed.batch_id, job_id: analyzed.job_id, metrics: analyzed.metrics, artifacts_by_source: artifactsBySource };
    };
    // The persistent controller delegates through the latest mount binding so
    // an explicit retry freezes the current global provider/model identity,
    // never the identity captured by an older remount.
    llmWikiSession.bindings.runCanonicalBatch = runCanonicalBatch;
    const llmWikiGitReceiptAuthority = window.LLMWikiOperationRunService.createPostEligibilityGitReceiptAuthority();
    const llmWikiGitService = window.LLMWikiGitAutomationAdapter.create({
      gateway: llmWikiControllerOptions.git_gateway || window.LLMWikiGitGateway,
      receiptAuthority: llmWikiGitReceiptAuthority,
    });
    let llmWikiRunController = llmWikiSession.runController;
    if (!llmWikiRunController) {
      llmWikiRunController = window.LLMWikiRunController.createRunController({
        app: appRef,
        config: llmWikiConfig,
        // Task 11 cutover: analysis delegates into the single canonical batch
        // core; the legacy transport/librarian options are removed.
        analyze_batch: async ({ command, signal }) => {
          const sources = command.sources.map((row) => ({
            source_id: row.manifest.source_id,
            source_path: row.source_path || row.manifest.locator,
            extracted_text: row.extracted_text || row.outbound_text,
            ...(row.analysis_text !== undefined ? { analysis_text: row.analysis_text } : {}),
            content_hash: row.manifest.content_hash,
          }));
          const documents = command.retrieval && command.retrieval.snapshot && Array.isArray(command.retrieval.snapshot.documents)
            ? command.retrieval.snapshot.documents : [];
          const candidates = documents.map((doc) => ({ document_id: doc.document_id, canonical_revision: doc.revision || doc.canonical_revision || "" }));
          const outcome = await llmWikiSession.bindings.runCanonicalBatch({ sources, candidates, signal, explicitRetry: command.task13_explicit_retry === true, retryIntentId: command.task13_retry_intent_id || null });
          if (!outcome.ok) return outcome;
          return { ...outcome, consent_hash: llmWikiHash.sha256(`batch_consent:${command.run_id}:${sources.map((row) => row.content_hash).sort().join(":")}`) };
        },
        enable_risk_review: true,
        batch_approval_apply: async (input) => {
          const apply = llmWikiSession.bindings.applyBatchApproval;
          return typeof apply === "function" ? apply(input) : { ok: false, reason: "batch_approval_runtime_unavailable" };
        },
        operation_provider: operationProvider,
        operation_outcome_store: operationOutcomeStore,
        maintenance_action: llmWikiControllerOptions.maintenance_action,
        resurfacing_action: llmWikiControllerOptions.resurfacing_action,
        compensation_refresh: async () => {
          const wikiSurface = llmWikiSession.bindings.wikiSurface;
          if (!wikiSurface || typeof wikiSurface.refresh !== "function") return { ok: false, reason: "refresh_surface_unavailable" };
          return wikiSurface.refresh();
        },
        postEligibilityGitReceiptAuthority: llmWikiGitReceiptAuthority,
        postEligibilityGit: async (input) => {
          const receipt = llmWikiGitReceiptAuthority.mint(input);
          return llmWikiGitService.recordEligibleReceipt({ receipt, signal: input.signal });
        },
        operation_follow_ups: {
          async refresh() {
            const wikiSurface = llmWikiSession.bindings.wikiSurface;
            if (!wikiSurface || typeof wikiSurface.refresh !== "function") return { ok: false, reason: "refresh_surface_unavailable" };
            try { await wikiSurface.refresh(); return { ok: true }; } catch (_error) { return { ok: false, reason: "refresh_failed" }; }
          },
          async git(input) {
            return llmWikiGitService.recordEligibleReceipt({ receipt: input.trusted_receipt, guarded_entry: input.guarded_entry, signal: input.signal });
          }
        },
        ...llmWikiControllerOptions
      });
      llmWikiSession.runController = llmWikiRunController;
      llmWikiSession.controllerReady = Promise.resolve({ ok: true, status: "ready" });
    }
    await llmWikiSession.controllerReady;
    let inboxState = llmWikiSession.viewState.inboxState || (durableRecovery || durableUnknownJob ? {
      state: durableRecovery?.review ? "complete" : "blocked",
      total: durableRecovery?.review?.proposals?.length || 0,
      scanned_total: durableRecovery?.review?.proposals?.length || 0,
      eligible: durableRecovery?.review?.proposals?.length || 0,
      held: 0, processed: 0, succeeded: 0, failed: 0,
      current_path: "", current_title: "", source_id: "",
      reason: durableRecovery?.review ? "" : "outcome_unknown",
      recovery_variant: durableRecovery?.review ? undefined : "outcome_unknown",
      proposal_pending: durableRecovery?.review?.proposals?.length || 0,
      proposal_state: durableRecovery?.review ? "review" : "blocked",
      object_review_proposals: [],
    } : { state: "empty", total: 0, scanned_total: 0, eligible: 0, held: 0, processed: 0, succeeded: 0, failed: 0, current_path: "", current_title: "", source_id: "", reason: "", object_review_proposals: [] });
    let resolveInboxSettled = null;
    let inboxSettled = llmWikiSession.inboxSettled || new Promise((resolve) => { resolveInboxSettled = resolve; });
    llmWikiSession.inboxSettled = inboxSettled;
    let inboxScanPromise = llmWikiSession.inboxScanPromise;
    const canonicalDocuments = await Promise.all(records
      .filter((record) => record && record.type === "knowledge" && typeof record.path === "string" && record.path.startsWith("ZETA/PERMANENT/"))
      .map(async (record) => {
        const file = appRef.vault.getAbstractFileByPath(record.path);
        const content = file ? await appRef.vault.cachedRead(file) : "";
        return {
          document_id: `canonical_${llmWikiHash.sha256(record.path).slice(0, 24)}`,
          path: record.path,
          title: String(record.title || record.frontmatter && record.frontmatter.title || ""),
          statement: String(record.frontmatter && record.frontmatter.statement || ""),
          summary: String(record.frontmatter && record.frontmatter.summary || ""),
          content,
          revision: llmWikiHash.sha256(content),
        };
      }));
    const discoveredRelatedCandidates = await Promise.all(appRef.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith("ZETA/CANDIDATES/") && file.path.endsWith(".md"))
      .map(async (file) => {
        const beforeBytes = await appRef.vault.cachedRead(file);
        const revision = llmWikiHash.sha256(beforeBytes);
        return {
          candidate_id: `cand_${llmWikiHash.sha256(file.path).slice(0, 24)}`,
          path: file.path,
          content_hash: revision,
          revision,
          before_bytes: beforeBytes,
        };
      }));
    const configuredRelatedCandidates = [
      ...discoveredRelatedCandidates,
      ...(Array.isArray(llmWikiControllerOptions.relatedCandidates) ? llmWikiControllerOptions.relatedCandidates : []),
    ].filter((row, index, rows) => rows.findIndex((candidate) => candidate.candidate_id === row.candidate_id) === index);
    const configuredAllowedCandidateIds = [...new Set([
      ...discoveredRelatedCandidates.map((row) => row.candidate_id),
      ...(Array.isArray(llmWikiControllerOptions.allowedCandidateIds) ? llmWikiControllerOptions.allowedCandidateIds : []),
    ])];
    const inboxProposalMaterializer = window.LLMWikiInboxProposalMaterializer.createInboxProposalMaterializer({
      localIdentityIndex: Array.isArray(llmWikiControllerOptions.inboxLocalIdentityIndex) ? llmWikiControllerOptions.inboxLocalIdentityIndex : [],
      // Controller configuration is trusted local state. Copy it into this
      // Dataview realm before the Object resolver validates its exact records.
      localObjectIndex: Array.isArray(llmWikiControllerOptions.inboxLocalObjectIndex) ? JSON.parse(JSON.stringify(llmWikiControllerOptions.inboxLocalObjectIndex)) : [],
      localObjectRoutes: Array.isArray(llmWikiControllerOptions.inboxLocalObjectRoutes) ? llmWikiControllerOptions.inboxLocalObjectRoutes : [],
      canonicalDocuments,
      relatedCandidates: configuredRelatedCandidates,
      allowedCandidateIds: configuredAllowedCandidateIds,
    });
    const materializeInboxProposals = async (input) => {
      const materialized = inboxProposalMaterializer.materialize(input);
      if (!materialized.ok) return materialized;
      const object_review_proposals = [];
      for (const draft of materialized.para_drafts) {
        const proposed = await inboxProposalMaterializer.materializeParaObject({ handoff_id: draft.handoff_id, object_type: draft.object_type, object_id: draft.object_id, slot: draft.slot, text: draft.text, linked_lifecycle_ids: draft.linked_lifecycle_ids });
        if (!proposed || proposed.ok !== true) return { ok: false, reason: proposed && proposed.reason || "object_handoff_unavailable" };
        object_review_proposals.push(proposed.value);
      }
      return { ok: true, proposals: materialized.proposals, holds: materialized.holds || [], no_changes: materialized.no_changes || [], para_drafts: materialized.para_drafts || [], object_review_proposals };
    };
    let pilotReviewItems = [];
    let documentPilotResult = null;
    let documentPilotCheckpoint = null;
    const pilotReviewRows = (documents, sourceId) => documents.map((document, documentIndex) => {
      const citations = Array.isArray(document.citations) ? document.citations : [];
      const sources = citations.flatMap((citation) => (citation.locators || []).map((locator) => ({ source_id: sourceId, locator })));
      const citationRows = citations.map((citation, citationIndex) => ({ citation_id: `pilot_citation_${documentIndex + 1}_${citationIndex + 1}`, source_id: sourceId, locators: citation.locators || [] }));
      const citationIds = citationRows.map((citation) => citation.citation_id);
      return {
        review_id: `pilot_document_${llmWikiHash.sha256(JSON.stringify([sourceId, document.role, document.title, document.claims])).slice(0, 24)}`,
        pilot: true, destination: document.role === "source_summary" ? "literature" : "knowledge_candidate",
        review_state: "pending", analysis_state: "complete", title: document.title,
        summary_points: document.role === "source_summary"
          ? document.sections.map((section) => `${section.heading} · ${section.claims.length}개 핵심 내용`)
          : document.claims.map((claim) => claim.text),
        document_body: document.body, target_path: "",
        sources,
        claim_set: {
          claims: document.claims.map((claim, claimIndex) => ({ claim_id: `pilot_claim_${documentIndex + 1}_${claimIndex + 1}`, text: claim.text, origin: "ai_synthesis", citation_ids: citationIds, derived_from_claim_ids: [] })),
          citations: citationRows, disputes: [],
        },
        coverage: { complete: true, status: "전체 원문 분석 완료" },
      };
    });
    if (window.__pilotReduceResult?.ok === true && Array.isArray(window.__pilotReduceResult.documents)) {
      const retainedSourceId = window.__pilotReduceResult.source_id || `source_pilot_${llmWikiHash.sha256(window.__pilotReduceResult.source_path || "pilot").slice(0, 24)}`;
      pilotReviewItems = pilotReviewRows(window.__pilotReduceResult.documents, retainedSourceId);
      documentPilotResult = window.__pilotReduceResult;
    }
    const runDocumentPilot = async (sourcePath) => {
      if (typeof sourcePath !== "string" || !sourcePath.startsWith("INBOX/") || !sourcePath.endsWith(".md") || sourcePath.includes("\\")
        || sourcePath.split("/").some((part) => !part || part === "." || part === "..")) return { ok: false, reason: "invalid_pilot_source" };
      if (!batchProvider) return { ok: false, reason: "provider_selection_unavailable" };
      const file = appRef.vault.getAbstractFileByPath(sourcePath);
      if (!file) return { ok: false, reason: "pilot_source_missing" };
      const extractedText = await appRef.vault.cachedRead(file);
      const contentHash = llmWikiHash.sha256(extractedText);
      const sourceId = `source_pilot_${llmWikiHash.sha256(sourcePath).slice(0, 24)}`;
      const scope = window.LLMWikiAnalysisScope.createAnalysisScope({
        source_id: sourceId, source_path: sourcePath, content_hash: contentHash, source_text: extractedText,
      });
      const manifest = window.LLMWikiChunkManifest.createChunkManifest(scope);
      const maxChunks = window.LLMWikiBatchAnalyzer.MAX_PACK_CHUNKS;
      const maxBytes = window.LLMWikiBatchAnalyzer.MAX_PACK_BYTES;
      const utf8Bytes = (value) => new TextEncoder().encode(String(value)).length;
      const packs = [];
      let pack = [];
      let packBytes = 0;
      for (const chunk of manifest.chunks) {
        const chunkBytes = utf8Bytes(chunk.text);
        if (pack.length && (pack.length === maxChunks || packBytes + chunkBytes > maxBytes)) {
          packs.push(pack);
          pack = [];
          packBytes = 0;
        }
        pack.push(chunk);
        packBytes += chunkBytes;
      }
      if (pack.length) packs.push(pack);
      const pilotVersion = "document_pilot_v2_evidence_key";
      const checkpoint = documentPilotCheckpoint
        && documentPilotCheckpoint.version === pilotVersion
        && documentPilotCheckpoint.source_path === sourcePath
        && documentPilotCheckpoint.content_hash === contentHash
          ? documentPilotCheckpoint : null;
      const artifacts = checkpoint ? checkpoint.artifacts.map((artifact) => JSON.parse(JSON.stringify(artifact))) : [];
      let providerCalls = checkpoint ? checkpoint.provider_calls : 0;
      const startPack = checkpoint ? checkpoint.next_pack_index : 0;
      for (let index = startPack; index < packs.length; index += 1) {
        const chunks = packs[index];
        const response = await batchProvider({
          outbound_allowed: true,
          run_id: `pilot_${llmWikiHash.sha256(`${sourceId}:${contentHash}:${index}`).slice(0, 24)}`,
          mode: "semantic",
          chunks: chunks.map((chunk) => ({ key: chunk.instance_id, text: chunk.text })),
          candidate_ids: configuredAllowedCandidateIds,
        }, {});
        providerCalls += response && Number.isSafeInteger(response.provider_call_count) ? response.provider_call_count : 1;
        if (!response || response.ok !== true) {
          documentPilotCheckpoint = { version: pilotVersion, source_path: sourcePath, content_hash: contentHash, artifacts, provider_calls: providerCalls, next_pack_index: index };
          return { ok: false, reason: response && response.reason || "pilot_provider_failed", provider_calls: providerCalls, completed_packs: index, total_packs: packs.length, resumed_from_pack: startPack };
        }
        const chunkById = new Map(chunks.map((chunk) => [chunk.instance_id, chunk]));
        for (const artifact of response.artifacts || []) {
          const chunk = chunkById.get(artifact.chunk_key);
          if (!chunk) return { ok: false, reason: "pilot_unknown_chunk_artifact", provider_calls: providerCalls };
          artifacts.push({
            chunk_key: artifact.chunk_key,
            outcome: artifact.outcome,
            items: (artifact.items || []).map((item) => ({
              ...item,
              ...(item.span ? { span: { ...item.span, start: item.span.start + chunk.start, end: item.span.end + chunk.start } } : {}),
            })),
          });
        }
        documentPilotCheckpoint = { version: pilotVersion, source_path: sourcePath, content_hash: contentHash, artifacts, provider_calls: providerCalls, next_pack_index: index + 1 };
      }
      const covered = new Set(artifacts.map((artifact) => artifact.chunk_key));
      if (covered.size !== manifest.chunks.length || manifest.chunks.some((chunk) => !covered.has(chunk.instance_id))) {
        return { ok: false, reason: "pilot_incomplete_chunk_coverage", provider_calls: providerCalls };
      }
      const source = { source_id: sourceId, source_path: sourcePath, content_hash: contentHash };
      const materialized = await materializeInboxProposals({ artifacts, source });
      if (!materialized.ok) return { ok: false, reason: materialized.reason || "pilot_materialization_failed", provider_calls: providerCalls };
      const pilotDocuments = materialized.proposals.map((proposal) => proposal.document);
      pilotReviewItems = pilotReviewRows(pilotDocuments, sourceId);
      documentPilotResult = {
        ok: true, status: "review_ready", source_path: sourcePath, source_bytes: utf8Bytes(extractedText),
        covered_bytes: utf8Bytes(extractedText), chunk_count: manifest.chunks.length, pack_count: packs.length,
        provider_calls: providerCalls, source_id: sourceId, documents: pilotDocuments,
        no_changes: materialized.no_changes || [], holds: materialized.holds || [],
        existing_review_writes: 0, canonical_writes: 0,
      };
      documentPilotCheckpoint = null;
      refreshReviewWorkbench();
      return documentPilotResult;
    };
    KnowledgeExplorerHub.runDocumentPilot = runDocumentPilot;
    const reduceDocumentPilot = async (pilotInput = window.__pilotRunResult || documentPilotResult) => {
      const documents = pilotInput && Array.isArray(pilotInput.documents) ? pilotInput.documents : [];
      const sourceDocument = documents.find((document) => document.role === "source_summary");
      const topicDocuments = documents.filter((document) => document.role === "reusable_claim");
      if (!sourceDocument || topicDocuments.length === 0) return { ok: false, reason: "pilot_reduce_input_unavailable" };
      const configuredPlan = llmWikiControllerOptions.documentPilotReducePlan;
      const service = window.AIProviderService;
      const requestStructured = service && (service.requestStructuredJsonNoRetry || service.requestStructuredJsonOnce);
      const requestPlan = typeof configuredPlan === "function" ? configuredPlan : async (inventory) => {
        if (!batchIdentity || typeof requestStructured !== "function") throw new Error("document_reduce_provider_unavailable");
        return requestStructured.call(service, {
          app: appRef, provider: batchIdentity.provider,
          prompt: JSON.stringify({
            task: "Group the complete source inventory into 4-16 coherent source sections and 0-20 reusable topic documents. Every source entry must appear exactly once in source_sections. Every topic entry must appear exactly once either in a topic document with at least two entries or in source_only_entry_ids. Prefer broad documents with context, implications, and exceptions; never create one-claim documents. Return ids only and never paths or write operations.",
            inventory,
          }),
          schema: window.LLMWikiDocumentReducer.PLAN_SCHEMA,
          timeoutMs: 120000,
        });
      };
      const reducer = window.LLMWikiDocumentReducer.createDocumentReducer({ requestPlan });
      const reduced = await reducer.reduce({ source_document: sourceDocument, topic_documents: topicDocuments });
      if (!reduced.ok) return reduced;
      const sourceId = pilotInput.source_id || `source_pilot_${llmWikiHash.sha256(pilotInput.source_path || "pilot").slice(0, 24)}`;
      pilotReviewItems = pilotReviewRows(reduced.documents, sourceId);
      documentPilotResult = {
        ...pilotInput, ok: true, status: "review_ready", source_id: sourceId,
        map_documents: documents.length, reduce_provider_calls: typeof configuredPlan === "function" ? 0 : 1,
        documents: reduced.documents, input_claim_count: reduced.input_claim_count,
        output_claim_count: reduced.output_claim_count, dropped_claim_count: reduced.dropped_claim_count,
      };
      window.__pilotRunResult = documentPilotResult;
      refreshReviewWorkbench();
      return documentPilotResult;
    };
    KnowledgeExplorerHub.reduceDocumentPilot = reduceDocumentPilot;
    let pagePlanReviewItems = [];
    let documentPlanInventory = null;
    let documentPlanReviewState = null;
    let documentPlanContext = null;
    let documentPlanCompileResult = null;
    let documentPlanExecution = null;
    let documentPlanQualityGaps = [];
    const correctionSignals = window.LLMWikiCorrectionSignals.createCorrectionSignals();
    const planCorrectionTags = (pageIds) => (pageIds || []).map((pageId) => {
      const page = documentPlanReviewState?.getSnapshot().pages.find((row) => row.page_id === pageId);
      return page ? classifyPlanPage(page).cluster : null;
    }).filter(Boolean);
    const recordPlanCorrection = (action, tags) => {
      for (const tag of tags || []) correctionSignals.record({ action, taxonomy_tag: tag });
    };
    const classifyPlanPage = (page) => window.LLMWikiTaxonomy.classifyPage(page);
    const canonicalPlanEvidence = canonicalDocuments.map((document) => ({
      candidate_id: `canonical_${llmWikiHash.sha256(document.path).slice(0, 24)}`,
      path: document.path,
      title: document.title,
      searchable_text: `${document.title} ${document.statement} ${document.summary} ${document.content}`,
      read_only: true,
    }));
    const candidateTitle = (candidate) => String(candidate.title || (/^# (.+)$/mu.exec(candidate.before_bytes || "") || [])[1] || "").trim();
    const candidateTokens = (value) => new Set(String(value || "").toLocaleLowerCase("ko-KR").match(/[가-힣a-z0-9]{2,}/gu) || []);
    const genericCandidateTokens = new Set(["부동산", "투자", "전략", "실무", "가이드", "관리", "분석", "방법", "원칙"]);
    const matchPlanCandidates = (page, inventory) => {
      const claims = page.claim_ids.map((claimId) => inventory.claims.find((claim) => claim.claim_id === claimId)).filter(Boolean);
      const classified = window.LLMWikiCanonicalOverlap.classify({ page_title: page.title, claims, canonical_documents: canonicalPlanEvidence });
      if (!classified.ok) return { candidates: [], evidence: [], relation: "new" };
      if (classified.relation === "new") return { candidates: [], evidence: [], relation: "new" };
      const evidence = classified.evidence.map((row) => ({
        candidate_id: row.candidate_id,
        title: row.title,
        path: canonicalPlanEvidence.find((document) => document.candidate_id === row.candidate_id)?.path || "",
        relation: classified.relation,
        covered_claim_ids: row.covered_claim_ids,
        coverage_ratio: row.coverage_ratio,
        title_anchor_match: row.title_anchor_match === true,
        read_only: true,
      }));
      if (classified.relation === "ambiguous") {
        return {
          candidates: classified.candidates.map((row) => ({ candidate_id: row.candidate_id, identity_match: "registered_alias", lexical_score: 1 })),
          evidence,
          relation: "compatible_new",
          merge_classification: "ambiguous",
        };
      }
      const best = classified.candidates[0];
      return {
        candidates: [{ candidate_id: best.candidate_id, identity_match: "canonical_id", lexical_score: 1 }],
        evidence,
        relation: classified.relation,
        merge_classification: classified.relation,
      };
    };
    const buildPlanExecution = async (plan, inventory) => {
      const candidateById = new Map(configuredRelatedCandidates.map((candidate) => [candidate.candidate_id, candidate]));
      const pages = plan.pages.map((page) => {
        const classification = classifyPlanPage(page);
        const matched = page.target_candidate_ids.length
          ? { candidates: page.target_candidate_ids.map((candidateId) => ({ candidate_id: candidateId, identity_match: "canonical_id", lexical_score: 1 })), evidence: [], relation: "compatible_new" }
          : matchPlanCandidates(page, inventory);
        const sourceCluster = plan.source?.source_path === "INBOX/웨딩 스냅 워크플로우.md"
          ? "photography/wedding-snap" : classification.cluster;
        return { page_id: page.page_id, content_relation: matched.relation, candidates: matched.candidates,
          candidate_evidence: matched.evidence, merge_classification: matched.merge_classification || matched.relation,
          primary_cluster: sourceCluster, archetype: classification.archetype, reader_question: page.purpose };
      });
      const workflow = await window.LLMWikiPlanWorkflow.run({ pages, critic_timeout_ms: 1000 }, async () => ({
        findings: plan.pages.filter((page) => page.claim_ids.length > 10).map((page) => ({
          code: "broad_page", page_id: page.page_id,
          reason: `${page.claim_ids.length}개 claim이 한 문서에 포함되어 경계 검토가 필요합니다.`,
        })),
      }));
      return workflow.ok ? { ...workflow, taxonomy_version: window.LLMWikiTaxonomy.VERSION } : workflow;
    };
    const consolidateCreatePages = async (plan, inventory, execution) => {
      const rowById = new Map((execution?.resolution?.rows || []).map((row) => [row.page_id, row]));
      const groups = [
        { pattern: /카메라|ISO|노출|차량컷|조명|연사|캡처 규칙|사전 준비/u, title: "웨딩 촬영 장비·노출 및 현장 준비", purpose: "카메라 노출 제한, 조명, 연사와 현장 준비 규칙을 하나의 실행 가이드로 정리합니다." },
        { pattern: /표정|시선|키스씬|거리 디렉팅/u, title: "웨딩 인물 표정·시선 및 커플 디렉팅", purpose: "자연스러운 표정과 시선 유도, 커플 거리 및 키스 장면 연출을 함께 설명합니다." },
      ];
      let state = window.LLMWikiPagePlanReviewState.createPagePlanReviewState({ plan });
      let snapshot = state.getSnapshot();
      for (const group of groups) {
        const pages = snapshot.pages.filter((page) => rowById.get(page.page_id)?.decision?.action === "create"
          && group.pattern.test(page.title));
        const claimCount = pages.reduce((sum, page) => sum + page.claim_ids.length, 0);
        if (pages.length < 2 || claimCount > 8) continue;
        const merged = state.dispatch({ action: "merge_pages", expected_plan_hash: snapshot.plan_hash,
          page_ids: pages.map((page) => page.page_id), title: group.title, purpose: group.purpose });
        if (!merged.ok) return merged;
        snapshot = merged.snapshot;
      }
      if (snapshot.plan_hash === plan.plan_hash) return { ok: true, plan, execution };
      const nextExecution = await buildPlanExecution(snapshot, inventory);
      return nextExecution.ok ? { ok: true, plan: snapshot, execution: nextExecution } : nextExecution;
    };
    const planExecutionRow = (pageId) => documentPlanExecution?.resolution?.rows?.find((row) => row.page_id === pageId) || null;
    const planSources = (claimIds, inventory) => {
      const claimById = new Map((inventory?.claims || []).map((claim) => [claim.claim_id, claim]));
      const citationById = new Map((inventory?.citations || []).map((citation) => [citation.citation_id, citation]));
      return [...new Set(claimIds.flatMap((claimId) => claimById.get(claimId)?.citation_ids || []))]
        .flatMap((citationId) => {
          const citation = citationById.get(citationId);
          return (citation?.locators || []).map((locator) => ({ source_id: citation.source_id, locator }));
        });
    };
    const planGroundedClaims = (claimIds, inventory) => {
      const claimById = new Map((inventory?.claims || []).map((claim) => [claim.claim_id, claim]));
      const citationById = new Map((inventory?.citations || []).map((citation) => [citation.citation_id, citation]));
      const citationNumbers = new Map();
      return claimIds.map((claimId) => {
        const claim = claimById.get(claimId);
        const citations = (claim?.citation_ids || []).flatMap((citationId) => {
          const citation = citationById.get(citationId);
          if (!citation) return [];
          if (!citationNumbers.has(citationId)) citationNumbers.set(citationId, citationNumbers.size + 1);
          const locators = citation.locators || [];
          const locator = locators.find((value) => String(value).includes("#"))
            || locators[0] || citation.source_path || "";
          return [{
            number: citationNumbers.get(citationId),
            citation_id: citationId,
            source_id: citation.source_id,
            source_path: citation.source_path || String(locator).split("#")[0],
            locator,
            content_hash: citation.content_hash,
            evidence_quote: citation.evidence_quote || "",
          }];
        });
        return { claim_id: claimId, text: claim?.text || claimId, citations };
      });
    };
    const documentPlanLint = (plan) => {
      if (!plan || !documentPlanInventory) return { ok: false, reason: "page_plan_unavailable", proposals: [], writer_count: 0 };
      const reference = window.LLMWikiDeterministicPagePlanner.plan({ inventory: documentPlanInventory });
      return window.LLMWikiPagePlanFeedback.lintPlan({
        inventory: documentPlanInventory,
        plan,
        reference_pages: reference.ok ? reference.value.topic_pages : [],
      });
    };
    const planReviewRows = (plan, inventory, compiledDocuments = []) => {
      const reviewState = plan.status === "approved" || plan.status === "compiled" ? "approved" : "pending";
      const guideClaimIds = plan.source_guide.sections.flatMap((section) => section.claim_ids);
      const heldClaimIds = new Set(plan.pages.filter((page) => page.selected === false).flatMap((page) => page.claim_ids));
      const intrinsicSourceOnlyCount = plan.source_only_claim_ids.filter((claimId) => !heldClaimIds.has(claimId)).length;
      const lint = documentPlanLint(plan);
      const lintByPageId = new Map((lint.ok ? lint.proposals : [])
        .filter((proposal) => proposal.reason === "title_claim_boundary_mismatch")
        .map((proposal) => [proposal.page_id, proposal]));
      const rows = [{
        review_id: `plan_guide_${llmWikiHash.sha256(plan.plan_hash).slice(0, 24)}`,
        plan: true, plan_kind: "source_guide", plan_hash: plan.plan_hash,
        destination: "none", review_state: reviewState, analysis_state: "complete",
        title: plan.source_guide.title.replace(/자료 안내$/u, "자료 Wiki"),
        wiki_result: {
          overview: plan.source_guide.overview,
          total_claims: inventory.claims.length,
          source_only_count: intrinsicSourceOnlyCount,
          possible_gap_count: documentPlanQualityGaps.length,
          hold_count: plan.pages.filter((page) => page.selected === false).length,
          quality_status: documentPlanCompileResult?.quality_status || "unverified",
          quality_rewrite_count: Number(documentPlanCompileResult?.quality_rewrite_count || 0),
        },
        summary_points: [
          plan.source_guide.overview,
          `${plan.source_guide.sections.length}개 section`,
          `${plan.source_only_claim_ids.length}개 source-only claim`,
          window.LLMWikiQualitySignals.summarize({
            inventory_claims: inventory.claims,
            pages: plan.pages,
            source_only_claim_ids: plan.source_only_claim_ids,
            possible_gaps: documentPlanQualityGaps,
            holds: plan.pages.filter((page) => page.selected === false),
          }).text,
          ...(documentPlanQualityGaps.length
            ? [`추가 검토 후보(참고용) · ${documentPlanQualityGaps.slice(0, 3).map((gap) => gap.text || gap.evidence_quote).join(" · ")}`]
            : []),
        ],
        document_body: [
          `# ${plan.source_guide.title}`,
          "",
          "## 자료 개요",
          "",
          plan.source_guide.overview,
          "",
          "## 문서 지도",
          "",
          ...plan.source_guide.sections.flatMap((section) => [`### ${section.heading}`, "", section.summary, ""]),
          "## 더 살펴볼 질문",
          "",
          ...plan.source_guide.key_questions.map((question) => `- ${question}`),
        ].join("\n"),
        sources: planSources(guideClaimIds, inventory),
        coverage: { complete: true, status: "전체 claim 문서 지도 완료" },
      }];
      for (const [pageIndex, page] of plan.pages.entries()) {
        rows.push({
          review_id: `plan_${page.page_id.slice(5)}`,
          plan: true, plan_kind: "topic_page", plan_hash: plan.plan_hash,
          plan_page_id: page.page_id, plan_selected: page.selected !== false,
          plan_order: pageIndex + 1,
          plan_purpose: page.purpose,
          plan_claim_count: page.claim_ids.length,
          plan_taxonomy: classifyPlanPage(page).cluster,
          ...(lintByPageId.has(page.page_id) ? { plan_lint_proposal: lintByPageId.get(page.page_id) } : {}),
          grounded_claims: planGroundedClaims(page.claim_ids, inventory),
          related_knowledge: (planExecutionRow(page.page_id)?.candidate_evidence || [])
            .filter((evidence) => evidence.read_only === true
              && String(evidence.path || "").endsWith(".md")
              && (evidence.covered_claim_ids || []).length > 0)
            .map((evidence) => ({
              title: evidence.title,
              path: evidence.path,
              relation: evidence.relation,
              covered_claim_count: (evidence.covered_claim_ids || []).length,
            })),
          destination: "none", review_state: reviewState, analysis_state: "complete",
          operation: page.operation_hint, title: page.title,
          summary_points: [
            page.purpose,
            `${page.claim_ids.length}개 claim`,
            `${page.evidence_count}개 evidence`,
            ...(planExecutionRow(page.page_id)?.tag_decision?.tags || []),
            ...(planExecutionRow(page.page_id)?.candidate_evidence || []).slice(0, 2).map((evidence) => {
              const details = Array.isArray(evidence.shared_tokens) ? evidence.shared_tokens
                : Array.isArray(evidence.covered_claim_ids) ? [`${evidence.covered_claim_ids.length}개 claim 포함`] : [];
              return `후보 · ${evidence.title} (${details.join(", ")})`;
            }),
            ...(documentPlanExecution?.critic?.findings || []).filter((finding) => finding.page_id === page.page_id).map((finding) => `검토 필요 · ${finding.reason}`),
          ],
          document_body: `# ${page.title}\n\n> ${page.purpose}\n\n## 포함될 핵심 내용\n\n${page.claim_ids.map((claimId) => {
            const claim = inventory.claims.find((row) => row.claim_id === claimId);
            return `- ${claim?.text || claimId}`;
          }).join("\n")}\n`,
          sources: planSources(page.claim_ids, inventory),
          coverage: { complete: true, status: "계획 claim coverage 완료" },
        });
      }
      for (const [documentIndex, document] of compiledDocuments.entries()) {
        const claimIds = (document.claims || []).flatMap((claim) => claim.claim_id && claim.claim_id.startsWith("claim_") ? [claim.claim_id] : claim.derived_from_claim_ids || []);
        rows.push({
          review_id: `plan_compiled_${llmWikiHash.sha256(JSON.stringify([plan.plan_hash, document.title, document.body])).slice(0, 24)}`,
          plan: true, plan_kind: "compiled_document", plan_hash: plan.plan_hash,
          compiled_kind: document.document_kind,
          compiled_order: documentIndex,
          plan_purpose: document.purpose || "",
          plan_claim_count: claimIds.length,
          grounded_claims: planGroundedClaims(claimIds, inventory),
          compiled_sections: document.sections || [],
          related_knowledge: document.page_id
            ? (planExecutionRow(document.page_id)?.candidate_evidence || [])
              .filter((evidence) => evidence.read_only === true
                && String(evidence.path || "").endsWith(".md")
                && (evidence.covered_claim_ids || []).length > 0)
              .map((evidence) => ({
                title: evidence.title,
                path: evidence.path,
                relation: evidence.relation,
                covered_claim_count: (evidence.covered_claim_ids || []).length,
              }))
            : [],
          ...(document.document_kind === "source_guide" ? {
            wiki_result: {
              overview: plan.source_guide.overview,
              total_claims: inventory.claims.length,
              source_only_count: intrinsicSourceOnlyCount,
              possible_gap_count: documentPlanQualityGaps.length,
              hold_count: plan.pages.filter((page) => page.selected === false).length,
              quality_status: documentPlanCompileResult?.quality_status || "unverified",
              quality_rewrite_count: Number(documentPlanCompileResult?.quality_rewrite_count || 0),
            },
          } : {}),
          destination: document.role === "source_summary" ? "literature" : "knowledge_candidate",
          review_state: "pending", analysis_state: "complete",
          operation: document.operation_hint, title: document.title,
          summary_points: [
            ...(document.verification_flags?.length
              ? [`최신 검증 필요 · ${document.verification_flags.map((flag) => flag.label).join(" · ")}`]
              : []),
            ...(document.role === "source_summary"
            ? document.sections.map((section) => section.summary || section.heading)
            : (document.claims || []).map((claim) => claim.text)),
          ],
          verification_flags: document.verification_flags || [],
          document_body: document.body,
          sources: planSources(claimIds, inventory),
          coverage: { complete: true, status: "승인 계획 기반 compile 완료" },
        });
      }
      return rows;
    };
    const structuredRequest = () => {
      const service = window.AIProviderService;
      return service && (service.requestStructuredJsonNoRetry || service.requestStructuredJsonOnce);
    };
    const runDocumentPlan = async (requestedSourcePath, runOptions = {}) => {
      if (typeof requestedSourcePath !== "string") return { ok: false, reason: "invalid_plan_source" };
      const explicitRetry = runOptions && runOptions.explicit_retry === true;
      const retryIntentId = explicitRetry && typeof runOptions.retry_intent_id === "string"
        ? runOptions.retry_intent_id.trim() : "";
      if (explicitRetry && !retryIntentId) return { ok: false, reason: "retry_intent_required" };
      const normalizedSourcePath = requestedSourcePath.normalize("NFC");
      if (!normalizedSourcePath.startsWith("INBOX/") || !normalizedSourcePath.endsWith(".md")
        || normalizedSourcePath.includes("\\") || normalizedSourcePath.split("/").some((part) => !part || part === "." || part === "..")) {
        return { ok: false, reason: "invalid_plan_source" };
      }
      const file = appRef.vault.getAbstractFileByPath(normalizedSourcePath);
      if (!file) return { ok: false, reason: "plan_source_missing" };
      const sourcePath = file.path;
      const extractedText = await appRef.vault.cachedRead(file);
      const sourceRevision = llmWikiHash.sha256(extractedText);
      const requestedScope = runOptions && runOptions.scope;
      if (runOptions.expected_source_hash && runOptions.expected_source_hash !== sourceRevision) return { ok: false, reason: "source_revision_changed" };
      if (requestedScope && (!Number.isSafeInteger(requestedScope.start) || !Number.isSafeInteger(requestedScope.end)
        || requestedScope.start < 0 || requestedScope.end <= requestedScope.start || requestedScope.end > extractedText.length)) {
        return { ok: false, reason: "invalid_source_scope" };
      }
      const scopedText = requestedScope ? extractedText.slice(requestedScope.start, requestedScope.end) : extractedText;
      const contentHash = llmWikiHash.sha256(scopedText);
      const scopeKey = requestedScope ? `${requestedScope.start}:${requestedScope.end}` : "full";
      const sourceId = `source_plan_${llmWikiHash.sha256(`${sourcePath}:${scopeKey}`).slice(0, 24)}`;
      const source = {
        source_id: sourceId, source_path: sourcePath, content_hash: contentHash,
        source_revision: sourceRevision,
        ...(requestedScope ? { scope: { scope_id: requestedScope.scope_id || "", title: requestedScope.title || "", start: requestedScope.start, end: requestedScope.end } } : {}),
      };
      const analyzed = await runCanonicalBatch({
        sources: [{ ...source, extracted_text: scopedText, ...(requestedScope ? { scope_start: requestedScope.start } : {}) }],
        candidates: [],
        explicitRetry,
        retryIntentId,
      });
      if (!analyzed.ok) return analyzed;
      const draftDocuments = analyzed.proposals.map((proposal) => proposal.document).filter(Boolean);
      const inventoryResult = window.LLMWikiDocumentReducer.createClaimInventory({ source, documents: draftDocuments });
      if (!inventoryResult.ok) return inventoryResult;
      const requestPlan = llmWikiControllerOptions.documentPagePlan || (async (request) => {
        const requestStructured = structuredRequest();
        if (!batchIdentity || typeof requestStructured !== "function") throw new Error("page_plan_provider_unavailable");
        return requestStructured.call(window.AIProviderService, {
          app: appRef, provider: batchIdentity.provider,
          prompt: JSON.stringify({
            task: "Build a concise source guide and a reviewable page plan. The source guide must partition every claim exactly once into 1-16 sections with a short summary. Reusable claims must appear exactly once either in 0-20 topic pages or source_only_claim_ids. New pages need at least two distinct evidence records. Prefer updating an allowlisted existing candidate when it is clearly the same topic. Return claim ids and allowlisted candidate ids only; never return prose documents, paths, or write operations.",
            request,
          }),
          schema: window.LLMWikiDocumentReducer.PLAN_SCHEMA,
          timeoutMs: 120000,
        });
      });
      const planner = window.LLMWikiDocumentReducer.createPagePlanner({
        allowedCandidateIds: configuredAllowedCandidateIds,
        requestPlan,
      });
      const priorPlanSnapshot = batchJobStore.getPlanSnapshot(analyzed.job_id);
      const reusableClaimCount = inventoryResult.value.claims.filter((claim) => claim.role === "reusable_claim").length;
      const planCandidates = [priorPlanSnapshot, ...(priorPlanSnapshot?.history || []).slice().reverse()];
      const hasLegacyNumberedBoundaries = (snapshot) => snapshot?.plan?.pages?.some((page) => /^(건축과 시공|토지와 인허가) \d+$/u.test(page.title));
      const reusableSnapshot = planCandidates.find((snapshot) => {
        const coveredSourceOnly = new Set(snapshot?.plan?.source_only_claim_ids || []);
        const reusableCovered = inventoryResult.value.claims.filter((claim) => claim.role === "reusable_claim")
          .every((claim) => coveredSourceOnly.has(claim.claim_id)
            || snapshot?.plan?.pages?.some((page) => page.claim_ids.includes(claim.claim_id)));
        return snapshot
          && snapshot.source_revision === contentHash
          && snapshot.inventory_hash === inventoryResult.value.inventory_hash
          && snapshot.planner_version === window.LLMWikiDeterministicPagePlanner.VERSION
          && snapshot.plan?.plan_version === "llmwiki_page_plan_v1"
          && !hasLegacyNumberedBoundaries(snapshot)
          && reusableCovered;
      });
      const reusablePlan = reusableSnapshot?.plan || null;
      const reusedPlan = Boolean(reusablePlan);
      const semanticReplan = !reusedPlan && planCandidates.some(hasLegacyNumberedBoundaries);
      let planned;
      if (reusedPlan) planned = { ok: true, value: reusablePlan, provider_calls: 0 };
      else if (semanticReplan) {
        const semanticDraft = window.LLMWikiDeterministicPagePlanner.plan({ inventory: inventoryResult.value });
        if (!semanticDraft.ok) return semanticDraft;
        const semanticPlanner = window.LLMWikiDocumentReducer.createPagePlanner({
          allowedCandidateIds: configuredAllowedCandidateIds,
          requestPlan: async () => semanticDraft.value,
        });
        planned = await semanticPlanner.plan({ inventory: inventoryResult.value });
      } else planned = await planner.plan({ inventory: inventoryResult.value });
      if ((!planned.ok || (planned.value.pages.length === 0 && reusableClaimCount > 0)) && !reusablePlan) {
        const fallbackDraft = window.LLMWikiDeterministicPagePlanner.plan({ inventory: inventoryResult.value });
        if (!fallbackDraft.ok) return fallbackDraft;
        const fallbackPlanner = window.LLMWikiDocumentReducer.createPagePlanner({
          allowedCandidateIds: configuredAllowedCandidateIds,
          requestPlan: async () => fallbackDraft.value,
        });
        planned = await fallbackPlanner.plan({ inventory: inventoryResult.value });
      }
      if (!planned.ok) {
        const diagnosticDraft = window.LLMWikiDeterministicPagePlanner.plan({ inventory: inventoryResult.value });
        return { ...planned,
          inventory_version: inventoryResult.value.inventory_version,
          inventory_hash: inventoryResult.value.inventory_hash,
          role_counts: inventoryResult.value.claims.reduce((counts, claim) => {
            counts[claim.role] = (counts[claim.role] || 0) + 1;
            return counts;
          }, {}),
          reusable_claim_ids: inventoryResult.value.claims.filter((claim) => claim.role === "reusable_claim").map((claim) => claim.claim_id),
          fallback_diagnostic: diagnosticDraft.ok ? {
            page_claim_ids: diagnosticDraft.value.topic_pages.flatMap((page) => page.claim_ids),
            source_only_claim_ids: diagnosticDraft.value.source_only_claim_ids,
            guide_claim_count: diagnosticDraft.value.source_guide.sections.flatMap((section) => section.claim_ids).length,
          } : { reason: diagnosticDraft.reason },
          writer_count: 0,
        };
      }
      documentPlanExecution = await buildPlanExecution(planned.value, inventoryResult.value);
      if (!documentPlanExecution.ok) return documentPlanExecution;
      const consolidated = await consolidateCreatePages(planned.value, inventoryResult.value, documentPlanExecution);
      if (!consolidated.ok) return consolidated;
      planned = { ...planned, value: consolidated.plan };
      documentPlanExecution = consolidated.execution;
      documentPlanInventory = inventoryResult.value;
      documentPlanReviewState = window.LLMWikiPagePlanReviewState.createPagePlanReviewState({ plan: planned.value });
      documentPlanContext = {
        source, source_bytes: new TextEncoder().encode(scopedText).length,
        full_source_bytes: new TextEncoder().encode(extractedText).length,
        job_id: analyzed.job_id, batch_id: analyzed.batch_id,
        map_provider_calls: analyzed.provider_calls, draft_documents: draftDocuments.length,
      };
      llmWikiSession.viewState = { ...llmWikiSession.viewState, documentPlanJobId: analyzed.job_id };
      await batchJobStore.savePlanSnapshot({
        job_id: analyzed.job_id, source_id: sourceId, source_revision: contentHash,
        planner_version: window.LLMWikiDeterministicPagePlanner.VERSION,
        inventory_hash: documentPlanInventory.inventory_hash,
        plan_hash: planned.value.plan_hash,
        plan_revision: Math.max(planned.value.plan_revision, Number(priorPlanSnapshot?.plan_revision || 0) + 1),
        status: "pending_review", plan: planned.value, inventory: documentPlanInventory,
        execution: documentPlanExecution,
      });
      documentPlanQualityGaps = window.LLMWikiQualitySignals.audit({
        map_claims: draftDocuments.flatMap((document) => Array.isArray(document.claims) ? document.claims : []),
        inventory_claims: documentPlanInventory.claims,
      }).possible_gaps;
      pagePlanReviewItems = planReviewRows(planned.value, documentPlanInventory);
      documentPlanCompileResult = null;
      window.__documentPagePlan = planned.value;
      refreshReviewWorkbench();
      return {
        ok: true, status: planned.value.pages.length ? "pending_review" : "source_only_complete", source_path: sourcePath,
        source_bytes: documentPlanContext.source_bytes, covered_bytes: documentPlanContext.source_bytes,
        map_provider_calls: analyzed.provider_calls, plan_provider_calls: reusedPlan || semanticReplan ? 0 : 1,
        inventory_claims: documentPlanInventory.claims.length,
        pages: planned.value.pages.length, source_sections: planned.value.source_guide.sections.length,
        source_only_claims: planned.value.source_only_claim_ids.length,
        possible_gaps: documentPlanQualityGaps.length,
        plan_hash: planned.value.plan_hash, job_id: analyzed.job_id,
        execution_terminal: documentPlanExecution.terminal,
        execution_holds: documentPlanExecution.preview.holds.length,
        critic_findings: documentPlanExecution.critic.findings.length,
        existing_review_writes: 0, canonical_writes: 0,
      };
    };
    const dispatchDocumentPlanAction = async (intent) => {
      if (!documentPlanReviewState || !documentPlanContext) return { ok: false, reason: "page_plan_unavailable" };
      const correctionTags = window.LLMWikiCorrectionSignals.ALLOWED_ACTIONS.includes(intent.action)
        ? planCorrectionTags(intent.page_ids || (intent.page_id ? [intent.page_id] : []))
        : [];
      const result = documentPlanReviewState.dispatch(intent);
      if (!result.ok) return result;
      recordPlanCorrection(intent.action, correctionTags);
      const priorPlanSnapshot = batchJobStore.getPlanSnapshot(documentPlanContext.job_id);
      await batchJobStore.savePlanSnapshot({
        job_id: documentPlanContext.job_id,
        source_id: documentPlanContext.source.source_id,
        source_revision: documentPlanContext.source.content_hash,
        planner_version: window.LLMWikiDeterministicPagePlanner.VERSION,
        inventory_hash: documentPlanInventory.inventory_hash,
        plan_hash: result.snapshot.plan_hash,
        plan_revision: Math.max(result.snapshot.plan_revision, Number(priorPlanSnapshot?.plan_revision || 0) + 1),
        status: result.snapshot.status,
        plan: result.snapshot,
        inventory: documentPlanInventory,
      });
      if (result.snapshot.status === "pending_review") {
        documentPlanCompileResult = null;
        window.__documentPlanCompileResult = null;
      }
      window.__documentPagePlan = result.snapshot;
      pagePlanReviewItems = planReviewRows(result.snapshot, documentPlanInventory, documentPlanCompileResult?.documents || []);
      refreshReviewWorkbench();
      return result;
    };
    const mergeSelectedDocumentPages = async (pageIds) => {
      if (!documentPlanReviewState || !documentPlanContext || !documentPlanInventory) return { ok: false, reason: "page_plan_unavailable" };
      const before = documentPlanReviewState.getSnapshot();
      const ids = [...new Set(Array.isArray(pageIds) ? pageIds : [])].sort();
      if (before.status !== "pending_review" || ids.length !== 2) return { ok: false, reason: "exactly_two_pending_pages_required" };
      const pages = ids.map((id) => before.pages.find((page) => page.page_id === id));
      if (pages.some((page) => !page || page.selected === false)) return { ok: false, reason: "selected_page_unavailable" };
      if (pages.reduce((sum, page) => sum + page.claim_ids.length, 0) > 12) return { ok: false, reason: "merged_claim_limit_exceeded" };
      const classifications = pages.map(classifyPlanPage);
      if (new Set(classifications.map((row) => row.tag)).size !== 1) return { ok: false, reason: "merged_page_tag_mismatch" };
      const title = pages.map((page) => page.title).join(" · ");
      const purpose = pages.map((page) => page.purpose).join(" ");
      const mergeTags = planCorrectionTags(ids);
      const merged = documentPlanReviewState.dispatch({ action: "merge_pages", expected_plan_hash: before.plan_hash, page_ids: ids, title, purpose });
      if (!merged.ok) return merged;
      recordPlanCorrection("merge_pages", mergeTags);
      const execution = await buildPlanExecution(merged.snapshot, documentPlanInventory);
      if (!execution.ok) {
        documentPlanReviewState = window.LLMWikiPagePlanReviewState.createPagePlanReviewState({ plan: before });
        return { ok: false, reason: execution.reason || "merged_page_execution_failed" };
      }
      documentPlanExecution = execution;
      documentPlanCompileResult = null;
      window.__documentPlanCompileResult = null;
      window.__documentPagePlan = merged.snapshot;
      pagePlanReviewItems = planReviewRows(merged.snapshot, documentPlanInventory);
      const prior = batchJobStore.getPlanSnapshot(documentPlanContext.job_id);
      await batchJobStore.savePlanSnapshot({ job_id: documentPlanContext.job_id, source_id: documentPlanContext.source.source_id, source_revision: documentPlanContext.source.content_hash, planner_version: window.LLMWikiDeterministicPagePlanner.VERSION, inventory_hash: documentPlanInventory.inventory_hash, plan_hash: merged.snapshot.plan_hash, plan_revision: Math.max(merged.snapshot.plan_revision, Number(prior?.plan_revision || 0) + 1), status: "pending_review", plan: merged.snapshot, inventory: documentPlanInventory, execution: documentPlanExecution });
      refreshReviewWorkbench();
      return { ok: true, status: "merge_preview", plan_hash: merged.snapshot.plan_hash, merged_page_ids: ids, writer_count: 0 };
    };
    const compileDocumentPlan = async (compileOptions = {}) => {
      if (!documentPlanReviewState || !documentPlanContext || !documentPlanInventory) return { ok: false, reason: "page_plan_unavailable" };
      let plan = documentPlanReviewState.getSnapshot();
      if (documentPlanCompileResult?.restored && documentPlanCompileResult.quality_status === "publishable"
        && documentPlanCompileResult.quality_receipt?.plan_hash === plan.plan_hash) {
        return {
          ok: true, status: "compiled_replay", documents: documentPlanCompileResult.documents.length,
          proposals: documentPlanCompileResult.proposals?.length || 0, holds: documentPlanCompileResult.holds?.length || 0,
          plan_hash: plan.plan_hash, quality_status: "publishable", provider_calls: 0,
          existing_review_preserved: true, canonical_writes: 0, source_writes: 0,
        };
      }
      const lint = documentPlanLint(plan);
      const blockers = (lint.ok ? lint.proposals : [])
        .filter((proposal) => proposal.reason === "title_claim_boundary_mismatch");
      if (blockers.length > 0) {
        return {
          ok: false,
          reason: "plan_quality_review_required",
          proposals: blockers,
          canonical_writes: 0,
          source_writes: 0,
        };
      }
      if (plan.status === "pending_review") {
        const approved = await dispatchDocumentPlanAction({ action: "approve_plan", expected_plan_hash: plan.plan_hash });
        if (!approved.ok) return approved;
        plan = approved.snapshot;
      }
      if (plan.status !== "approved") return { ok: false, reason: "approved_page_plan_required" };
      const existingArticles = new Map((documentPlanCompileResult?.documents || [])
        .filter((document) => document.document_kind === "topic_article")
        .map((document) => [document.page_id, document]));
      const localRender = compileOptions.local_render === true && existingArticles.size > 0;
      const requestArticles = localRender ? async (request) => ({
        articles: request.pages.map((page) => {
          const existing = existingArticles.get(page.page_id);
          if (!existing) throw new Error("compiled_article_snapshot_missing");
          return {
            page_id: page.page_id,
            sections: existing.sections.map((section) => ({
              heading: section.heading,
              paragraphs: section.paragraphs.map((paragraph) => ({
                text: paragraph.text,
                claim_ids: [...paragraph.claim_ids],
              })),
            })),
          };
        }),
      }) : llmWikiControllerOptions.documentArticleCompiler || (async (request) => {
        const requestStructured = structuredRequest();
        if (!batchIdentity || typeof requestStructured !== "function") throw new Error("article_provider_unavailable");
        return requestStructured.call(window.AIProviderService, {
          app: appRef, provider: batchIdentity.provider,
          prompt: JSON.stringify({
            task: "Compile each approved page into coherent sections and paragraphs. Every paragraph must cite one or more provided claim_ids. Use every page claim at least once. Do not add unsupported facts, paths, metadata, or Markdown authority. Return structured article sections only.",
            request,
          }),
          schema: window.LLMWikiDocumentCompiler.ARTICLE_SCHEMA,
          timeoutMs: 120000,
        });
      });
      const compiler = window.LLMWikiDocumentCompiler.createDocumentCompiler({ requestArticles });
      const compiled = await compiler.compile({ inventory: documentPlanInventory, approved_plan: plan, execution: documentPlanExecution });
      if (!compiled.ok) return compiled;
      const materialized = inboxProposalMaterializer.materializeDocuments({
        source: documentPlanContext.source,
        documents: compiled.documents,
      });
      if (!materialized.ok) return materialized;
      documentPlanCompileResult = {
        ...compiled,
        proposals: materialized.proposals,
        holds: materialized.holds,
        risk_review_activated: false,
        existing_review_preserved: true,
      };
      const priorPlanSnapshot = batchJobStore.getPlanSnapshot(documentPlanContext.job_id);
      await batchJobStore.savePlanSnapshot({
        job_id: documentPlanContext.job_id,
        source_id: documentPlanContext.source.source_id,
        source_revision: documentPlanContext.source.content_hash,
        planner_version: window.LLMWikiDeterministicPagePlanner.VERSION,
        inventory_hash: documentPlanInventory.inventory_hash,
        plan_hash: plan.plan_hash,
        plan_revision: Math.max(plan.plan_revision + 1, Number(priorPlanSnapshot?.plan_revision || 0) + 1),
        status: "compiled",
        plan,
        inventory: documentPlanInventory,
        compiled_documents: compiled.documents,
        quality_receipt: compiled.quality_receipt,
        serialized_operations: materialized.proposals.map((proposal) => JSON.stringify(proposal.operation)),
        holds: materialized.holds,
      });
      pagePlanReviewItems = planReviewRows(plan, documentPlanInventory, compiled.documents);
      window.__documentPlanCompileResult = documentPlanCompileResult;
      refreshReviewWorkbench();
      return {
        ok: true, status: "compiled_preview", documents: compiled.documents.length,
        proposals: materialized.proposals.length, holds: materialized.holds.length,
        plan_hash: plan.plan_hash, existing_review_preserved: true,
        canonical_writes: 0, source_writes: 0,
      };
    };
    const documentPlanSourceOnlyHolds = () => {
      const sourceOnlyClaimIds = documentPlanReviewState?.getSnapshot()?.source_only_claim_ids || [];
      const sourceSummaryClaimIds = (documentPlanInventory?.claims || [])
        .filter((claim) => claim.role === "source_summary").map((claim) => claim.claim_id);
      const retainedClaimIds = [...new Set([...sourceOnlyClaimIds, ...sourceSummaryClaimIds])].sort();
      return retainedClaimIds.length ? [{
        hold_id: `hold_source_only_${llmWikiHash.sha256(retainedClaimIds.join(":")).slice(0, 24)}`,
        reason: "source_only_claims_retained",
        unit_id: documentPlanContext.source.source_id,
        claim_ids: retainedClaimIds,
        selected: false,
      }] : [];
    };
    const activateDocumentPlanReview = async () => {
      if (!documentPlanCompileResult || !documentPlanContext) return { ok: false, reason: "compiled_plan_unavailable" };
      const activePackets = llmWikiRunController.getSnapshot().risk_packets || [];
      if (activePackets.length > 0) {
        return { ok: false, reason: "existing_review_must_resolve_first", existing_packets: activePackets.length, preserved: true };
      }
      const proposals = documentPlanCompileResult.proposals || [];
      if (proposals.length === 0) return { ok: false, reason: "compiled_proposals_unavailable" };
      const sourceOnlyHolds = documentPlanSourceOnlyHolds();
      const grouped = window.LLMWikiBatchApprovalAdapter.groupProposalsBySource({
        source: documentPlanContext.source,
        materializeResult: {
          ok: true,
          proposals,
          holds: [...(documentPlanCompileResult.holds || []), ...sourceOnlyHolds],
          para_drafts: [],
        },
      });
      if (!grouped.ok) return grouped;
      const runId = `run_plan_${llmWikiHash.sha256(proposals.map((proposal) => proposal.operation.operation_id).sort().join(":")).slice(0, 24)}`;
      const opened = llmWikiRunController.openPreparedRiskReview({ run_id: runId, proposals });
      if (!opened?.ok) return opened || { ok: false, reason: "risk_review_unavailable" };
      approvalGroups.set(grouped.value.source_id, grouped.value);
      const packets = llmWikiRunController.getSnapshot().risk_packets || [];
      durableRecovery = await batchJobStore.saveRecoverySnapshot({
        active_tab: "llmwiki",
        selected_batch_id: documentPlanContext.job_id,
        review: {
          run_id: runId,
          document_contract_version: window.LLMWikiDocumentCompiler.COMPILER_VERSION,
          selected_operation_ids: [],
          proposals: packets.map((packet) => ({
            operation_id: packet.operation.operation_id,
            packet_id: packet.packet_id,
            summary: packet.summary,
            serialized_operation: JSON.stringify(packet.operation),
            status: "review",
          })),
        },
        operation_outcomes: packets.map((packet) => ({ operation_id: packet.operation.operation_id, status: "review" })),
        approval_sources: [{
          source_id: grouped.value.source_id,
          source_path: grouped.value.source_path,
          content_hash: grouped.value.content_hash,
          operation_ids: grouped.value.proposals.map((proposal) => proposal.operation.operation_id),
          unresolved_holds: grouped.value.holds.length,
          unresolved_para_drafts: 0,
        }],
        archive_receipts: [],
      });
      documentPlanCompileResult = { ...documentPlanCompileResult, risk_review_activated: true };
      llmWikiLifecycle.update(lifecycleSnapshot());
      refreshReviewWorkbench();
      return { ok: true, status: "review", packets: packets.length, canonical_writes: 0 };
    };
    const prepareDocumentPlanGuideRepair = async () => {
      if (!documentPlanCompileResult || !documentPlanContext) return { ok: false, reason: "compiled_plan_unavailable" };
      const materialized = inboxProposalMaterializer.materializeDocuments({
        source: documentPlanContext.source,
        documents: documentPlanCompileResult.documents,
      });
      if (!materialized.ok) return materialized;
      const guideCreate = materialized.proposals.find((proposal) => proposal.decision.destination === "literature");
      if (!guideCreate) return { ok: false, reason: "compiled_guide_unavailable" };
      const targetPath = guideCreate.operation.destination_ids[0];
      const file = appRef.vault.getAbstractFileByPath(targetPath);
      if (!file) return { ok: false, reason: "compiled_guide_target_missing" };
      const before = await appRef.vault.cachedRead(file);
      const after = guideCreate.operation.after_bytes[targetPath];
      if (before === after) return { ok: true, status: "no_change", proposals: 0, canonical_writes: 0 };
      const beforeRevision = llmWikiHash.sha256(before);
      const afterRevision = llmWikiHash.sha256(after);
      const operationId = `operation_${llmWikiHash.sha256(`guide_repair:${targetPath}:${beforeRevision}:${afterRevision}`).slice(0, 24)}`;
      const parsed = window.LLMWikiOperationContract.parseOperation(JSON.stringify({
        contract_version: "llmwiki_operation_contract_v1",
        operation_id: operationId,
        kind: "update",
        destination_ids: [targetPath],
        base_revisions: { [targetPath]: beforeRevision },
        before_bytes: { [targetPath]: before },
        after_bytes: { [targetPath]: after },
        source_citations: guideCreate.operation.source_citations,
        conflicts: [],
        risk_tier: "medium",
        effects: { deprecations: [], supersessions: [] },
      }));
      if (!parsed.ok) return parsed;
      const proposal = Object.freeze({
        operation: parsed.value,
        title: "투자일기 Source Guide 링크 복구",
        class: "update",
        unit_id: `guide_repair_${operationId.slice(10)}`,
        selected: false,
      });
      const grouped = window.LLMWikiBatchApprovalAdapter.groupProposalsBySource({
        source: documentPlanContext.source,
        materializeResult: {
          ok: true,
          proposals: [proposal],
          holds: documentPlanSourceOnlyHolds(),
          para_drafts: [],
        },
      });
      if (!grouped.ok) return grouped;
      const runId = `run_plan_repair_${llmWikiHash.sha256(operationId).slice(0, 24)}`;
      const opened = llmWikiRunController.openPreparedRiskReview({ run_id: runId, proposals: [proposal] });
      if (!opened?.ok) return opened || { ok: false, reason: "risk_review_unavailable" };
      approvalGroups.clear();
      approvalGroups.set(grouped.value.source_id, grouped.value);
      const packet = (llmWikiRunController.getSnapshot().risk_packets || [])[0];
      durableRecovery = await batchJobStore.saveRecoverySnapshot({
        active_tab: "llmwiki",
        selected_batch_id: documentPlanContext.job_id,
        review: {
          run_id: runId,
          document_contract_version: window.LLMWikiDocumentCompiler.COMPILER_VERSION,
          selected_operation_ids: [],
          proposals: [{
            operation_id: packet.operation.operation_id,
            packet_id: packet.packet_id,
            summary: packet.summary,
            serialized_operation: JSON.stringify(packet.operation),
            status: "review",
          }],
        },
        operation_outcomes: [{ operation_id: packet.operation.operation_id, status: "review" }],
        approval_sources: [{
          source_id: grouped.value.source_id,
          source_path: grouped.value.source_path,
          content_hash: grouped.value.content_hash,
          operation_ids: [packet.operation.operation_id],
          unresolved_holds: grouped.value.holds.length,
          unresolved_para_drafts: 0,
        }],
        archive_receipts: [],
      });
      llmWikiLifecycle.update(lifecycleSnapshot());
      refreshReviewWorkbench();
      return {
        ok: true,
        status: "review",
        proposals: 1,
        packet_id: packet.packet_id,
        operation_id: packet.operation.operation_id,
        destination: targetPath,
        before_revision: beforeRevision,
        after_revision: afterRevision,
        canonical_writes: 0,
      };
    };
    KnowledgeExplorerHub.runDocumentPlan = runDocumentPlan;
    KnowledgeExplorerHub.dispatchDocumentPlanAction = dispatchDocumentPlanAction;
    KnowledgeExplorerHub.assignDocumentPlanCandidate = (input) => {
      if (!configuredAllowedCandidateIds.includes(input?.candidate_id)) return { ok: false, reason: "candidate_id_not_allowed" };
      return dispatchDocumentPlanAction({
        action: "assign_candidate",
        page_id: input.page_id,
        candidate_id: input.candidate_id,
        expected_plan_hash: input.expected_plan_hash,
      });
    };
    KnowledgeExplorerHub.mergeDocumentPlanPages = (pageIds) => mergeSelectedDocumentPages(pageIds);
    KnowledgeExplorerHub.correctionSignalSnapshot = () => correctionSignals.getSnapshot();
    KnowledgeExplorerHub.correctionImprovementCandidates = () => correctionSignals.getImprovementCandidates();
    KnowledgeExplorerHub.compileDocumentPlan = compileDocumentPlan;
    KnowledgeExplorerHub.rerenderDocumentPlan = () => compileDocumentPlan({ local_render: true });
    KnowledgeExplorerHub.activateDocumentPlanReview = activateDocumentPlanReview;
    KnowledgeExplorerHub.prepareDocumentPlanGuideRepair = prepareDocumentPlanGuideRepair;
    KnowledgeExplorerHub.documentPlanSnapshot = () => documentPlanReviewState
      ? JSON.parse(JSON.stringify(documentPlanReviewState.getSnapshot())) : null;
    KnowledgeExplorerHub.documentPlanInventorySnapshot = () => documentPlanInventory
      ? JSON.parse(JSON.stringify(documentPlanInventory)) : null;
    KnowledgeExplorerHub.documentPlanCompileSnapshot = () => documentPlanCompileResult
      ? JSON.parse(JSON.stringify(documentPlanCompileResult)) : null;
    KnowledgeExplorerHub.documentPlanExecutionSnapshot = () => documentPlanExecution
      ? JSON.parse(JSON.stringify(documentPlanExecution)) : null;
    let goldenWikiOrchestrator = null;
    const refreshGoldenPreviewWorkbench = async () => {
      if (!window.LLMWikiGoldenPreviewWorkbench) return [];
      goldenPreviewRows = await window.LLMWikiGoldenPreviewWorkbench.loadPreviews(appRef.vault);
      if (goldenPreviewWorkbench) goldenPreviewWorkbench.render(goldenPreviewRows);
      return goldenPreviewRows;
    };
    const getGoldenWikiOrchestrator = () => {
      if (goldenWikiOrchestrator) return goldenWikiOrchestrator;
      if (!window.LLMWikiGoldenWikiOrchestrator || !window.LLMWikiGoldenQualityGate) return null;
      goldenWikiOrchestrator = window.LLMWikiGoldenWikiOrchestrator.create({
        vault: appRef.vault,
        hash: llmWikiHash,
        analysisScope: window.LLMWikiAnalysisScope,
        chunkManifest: window.LLMWikiChunkManifest,
        gate: window.LLMWikiGoldenQualityGate,
        limits: {
          max_chunks: window.LLMWikiBatchAnalyzer.MAX_PACK_CHUNKS,
          max_bytes: window.LLMWikiBatchAnalyzer.MAX_PACK_BYTES,
        },
        runPlan: (sourcePath, options) => runDocumentPlan(sourcePath, options),
        compilePlan: () => compileDocumentPlan(),
        getDocuments: () => documentPlanCompileResult?.documents || [],
        onProgress: (progress) => {
          prodigyWikiController.dispatch({ type: "progress", stage: progress.stage });
        },
      });
      return goldenWikiOrchestrator;
    };
    const preflightGoldenWiki = async (scope = null) => {
      const orchestrator = getGoldenWikiOrchestrator();
      const selectedSource = prodigyWikiController.getSnapshot().source;
      if (!orchestrator || !selectedSource) return { ok: false, reason: "golden_wiki_unavailable" };
      return orchestrator.preflight({
        source_path: selectedSource.path,
        expected_content_hash: selectedSource.content_hash,
        ...(scope ? { scope } : {}),
      });
    };
    const runGoldenWiki = async (scope = null) => {
      const orchestrator = getGoldenWikiOrchestrator();
      const selectedSource = prodigyWikiController.getSnapshot().source;
      if (!orchestrator || !selectedSource) return { ok: false, reason: "golden_wiki_unavailable" };
      prodigyWikiController.dispatch({ type: "start", stage: "preflight" });
      const result = await orchestrator.run({
        source_path: selectedSource.path,
        expected_content_hash: selectedSource.content_hash,
        ...(scope ? { scope } : {}),
      });
      if (result.ok) {
        await refreshGoldenPreviewWorkbench();
        prodigyWikiController.dispatch({ type: "complete", result });
      } else if (result.status === "scope_required") {
        prodigyWikiController.dispatch({ type: "require_range", result, reason: result.reason });
      } else {
        prodigyWikiController.dispatch({
          type: result.reason === "source_revision_changed" ? "source_changed" : "interrupt",
          stage: result.stage || "",
          result,
          reason: result.reason || "golden_wiki_failed",
        });
      }
      persistLlmWikiSessionView();
      return result;
    };
    KnowledgeExplorerHub.preflightGoldenWiki = preflightGoldenWiki;
    KnowledgeExplorerHub.runGoldenWiki = runGoldenWiki;
    KnowledgeExplorerHub.prodigyWikiSnapshot = () => JSON.parse(JSON.stringify(prodigyWikiController.getSnapshot()));
    KnowledgeExplorerHub.goldenWikiSnapshot = () => JSON.parse(JSON.stringify(
      window.ProdigyWikiController.projectLifecycle(prodigyWikiController.getSnapshot()).golden_wiki,
    ));
    KnowledgeExplorerHub.queryDocumentPlanSourceOnly = (query) => {
      if (!documentPlanReviewState || !documentPlanInventory) return { ok: false, reason: "page_plan_unavailable", writer_count: 0 };
      return window.LLMWikiPagePlanFeedback.querySourceOnly({
        inventory: documentPlanInventory,
        plan: documentPlanReviewState.getSnapshot(),
        query,
      });
    };
    KnowledgeExplorerHub.promoteDocumentPlanQuery = async (input) => {
      if (!documentPlanReviewState || !documentPlanInventory || !documentPlanContext) return { ok: false, reason: "page_plan_unavailable" };
      const promoted = window.LLMWikiPagePlanFeedback.promoteQueryResult({
        inventory: documentPlanInventory,
        plan: documentPlanReviewState.getSnapshot(),
        ...input,
      });
      if (!promoted.ok) return promoted;
      documentPlanReviewState = window.LLMWikiPagePlanReviewState.createPagePlanReviewState({ plan: promoted.value });
      const priorPlanSnapshot = batchJobStore.getPlanSnapshot(documentPlanContext.job_id);
      await batchJobStore.savePlanSnapshot({
        job_id: documentPlanContext.job_id,
        source_id: documentPlanContext.source.source_id,
        source_revision: documentPlanContext.source.content_hash,
        planner_version: window.LLMWikiDeterministicPagePlanner.VERSION,
        inventory_hash: documentPlanInventory.inventory_hash,
        plan_hash: promoted.value.plan_hash,
        plan_revision: Math.max(promoted.value.plan_revision, Number(priorPlanSnapshot?.plan_revision || 0) + 1),
        status: promoted.value.status,
        plan: promoted.value,
        inventory: documentPlanInventory,
      });
      pagePlanReviewItems = planReviewRows(promoted.value, documentPlanInventory);
      refreshReviewWorkbench();
      return promoted;
    };
    KnowledgeExplorerHub.lintDocumentPlan = () => {
      if (!documentPlanReviewState || !documentPlanInventory) return { ok: false, reason: "page_plan_unavailable", writer_count: 0 };
      return documentPlanLint(documentPlanReviewState.getSnapshot());
    };
    const retainedPlanSnapshots = batchJobStore.listPlanSnapshots()
      .filter((snapshot) => snapshot?.plan?.plan_version === window.LLMWikiDocumentReducer.PAGE_PLAN_VERSION && snapshot?.inventory)
      .sort((left, right) => {
        const leftPending = left.status === "pending_review" ? 1 : 0;
        const rightPending = right.status === "pending_review" ? 1 : 0;
        return rightPending - leftPending || right.plan_revision - left.plan_revision;
      });
    const retainedPlanSnapshot = retainedPlanSnapshots.find((snapshot) =>
      snapshot.job_id === llmWikiSession.viewState.documentPlanJobId) || retainedPlanSnapshots[0] || null;
    if (retainedPlanSnapshot) {
      llmWikiSession.viewState = {
        ...llmWikiSession.viewState,
        documentPlanJobId: retainedPlanSnapshot.job_id,
      };
      documentPlanInventory = retainedPlanSnapshot.inventory;
      documentPlanExecution = retainedPlanSnapshot.execution || await buildPlanExecution(retainedPlanSnapshot.plan, retainedPlanSnapshot.inventory);
      documentPlanReviewState = window.LLMWikiPagePlanReviewState.createPagePlanReviewState({ plan: retainedPlanSnapshot.plan });
      documentPlanContext = {
        source: retainedPlanSnapshot.plan.source,
        source_bytes: 0,
        job_id: retainedPlanSnapshot.job_id,
        batch_id: retainedPlanSnapshot.job_id,
        map_provider_calls: 0,
        draft_documents: 0,
      };
      const restoredDocuments = Array.isArray(retainedPlanSnapshot.compiled_documents) ? retainedPlanSnapshot.compiled_documents : [];
      const restoredMaterialized = restoredDocuments.length
        ? inboxProposalMaterializer.materializeDocuments({
          source: retainedPlanSnapshot.plan.source,
          documents: restoredDocuments,
        })
        : null;
      const restoredQuality = restoredDocuments.length ? window.LLMWikiDocumentCompiler.inspectQualityReceipt(
        retainedPlanSnapshot.quality_receipt,
        { source_hash: retainedPlanSnapshot.source_revision, inventory_hash: retainedPlanSnapshot.inventory_hash,
          plan_hash: retainedPlanSnapshot.plan_hash, documents: restoredDocuments },
      ) : { status: "invalid" };
      documentPlanCompileResult = restoredDocuments.length ? {
        ok: true,
        documents: restoredDocuments,
        proposals: restoredMaterialized?.ok ? restoredMaterialized.proposals : [],
        holds: restoredMaterialized?.ok ? restoredMaterialized.holds : retainedPlanSnapshot.holds || [],
        quality_receipt: restoredQuality.receipt || retainedPlanSnapshot.quality_receipt || null,
        quality_status: restoredQuality.status === "publishable" ? "publishable" : "revalidation_required",
        quality_rewrite_count: Number(retainedPlanSnapshot.quality_receipt?.quality_rewrite_count || 0),
        restored: true,
        provider_calls: 0,
        existing_review_preserved: true,
      } : null;
      pagePlanReviewItems = planReviewRows(retainedPlanSnapshot.plan, documentPlanInventory, restoredDocuments);
      window.__documentPagePlan = retainedPlanSnapshot.plan;
      if (documentPlanCompileResult) window.__documentPlanCompileResult = documentPlanCompileResult;
    }
    const openStoredDocumentPlan = async (jobId, options = {}) => {
      const snapshot = batchJobStore.getPlanSnapshot(jobId);
      if (!snapshot?.plan || !snapshot.inventory) return { ok: false, reason: "stored_plan_not_found", writer_count: 0 };
      const execution = snapshot.execution || await buildPlanExecution(snapshot.plan, snapshot.inventory);
      if (!execution.ok) return execution;
      documentPlanInventory = snapshot.inventory;
      documentPlanExecution = execution;
      documentPlanReviewState = window.LLMWikiPagePlanReviewState.createPagePlanReviewState({ plan: snapshot.plan });
      documentPlanContext = { source: snapshot.plan.source, source_bytes: 0, job_id: snapshot.job_id,
        batch_id: snapshot.job_id, map_provider_calls: 0, draft_documents: 0 };
      llmWikiSession.viewState = { ...llmWikiSession.viewState, documentPlanJobId: snapshot.job_id };
      const documents = Array.isArray(snapshot.compiled_documents) ? snapshot.compiled_documents : [];
      const restoredMaterialized = documents.length ? inboxProposalMaterializer.materializeDocuments({
        source: snapshot.plan.source,
        documents,
      }) : null;
      const quality = documents.length ? window.LLMWikiDocumentCompiler.inspectQualityReceipt(snapshot.quality_receipt, {
        source_hash: snapshot.source_revision, inventory_hash: snapshot.inventory_hash, plan_hash: snapshot.plan_hash, documents,
      }) : { status: "invalid" };
      documentPlanCompileResult = documents.length ? { ok: true, documents,
        proposals: restoredMaterialized?.ok ? restoredMaterialized.proposals : [],
        holds: restoredMaterialized?.ok ? restoredMaterialized.holds : snapshot.holds || [],
        quality_receipt: quality.receipt || snapshot.quality_receipt || null,
        quality_status: quality.status === "publishable" ? "publishable" : "revalidation_required",
        quality_rewrite_count: Number(snapshot.quality_receipt?.quality_rewrite_count || 0),
        restored: true, provider_calls: 0, existing_review_preserved: true } : null;
      pagePlanReviewItems = planReviewRows(snapshot.plan, snapshot.inventory, documents);
      window.__documentPagePlan = snapshot.plan;
      window.__documentPlanCompileResult = documentPlanCompileResult;
      if (options.render !== false) refreshReviewWorkbench();
      return { ok: true, job_id: snapshot.job_id, source_path: snapshot.plan.source.source_path,
        plan_hash: snapshot.plan.plan_hash, pages: snapshot.plan.pages.length, provider_count: 0, writer_count: 0 };
    };
    KnowledgeExplorerHub.documentPlanSnapshots = () => batchJobStore.listPlanSnapshots();
    KnowledgeExplorerHub.openDocumentPlan = (jobId) => openStoredDocumentPlan(jobId);
    KnowledgeExplorerHub.documentPilotSnapshot = () => documentPilotResult ? JSON.parse(JSON.stringify(documentPilotResult)) : null;
    KnowledgeExplorerHub.documentPilotCheckpoint = () => documentPilotCheckpoint ? {
      source_path: documentPilotCheckpoint.source_path,
      completed_packs: documentPilotCheckpoint.next_pack_index,
      provider_calls: documentPilotCheckpoint.provider_calls,
      artifacts: documentPilotCheckpoint.artifacts.length,
    } : null;
    const DOCUMENT_REVIEW_CONTRACT = window.LLMWikiDocumentAssembler.CONTRACT_VERSION;
    const DOCUMENT_PLAN_REVIEW_CONTRACT = window.LLMWikiDocumentCompiler.COMPILER_VERSION;
    const repacketLegacyDocumentReview = async () => {
      if (!durableRecovery?.review?.proposals?.length
        || [DOCUMENT_REVIEW_CONTRACT, DOCUMENT_PLAN_REVIEW_CONTRACT].includes(durableRecovery.review.document_contract_version)) {
        return { ok: true, status: "not_required", provider_calls: 0 };
      }
      if (DOCUMENT_REVIEW_CONTRACT === "llmwiki_document_assembler_v2"
        && durableRecovery.review.document_contract_version === "llmwiki_document_assembler_v1") {
        return {
          ok: true, status: "pilot_contract_pending", provider_calls: 0,
          prior_proposals: durableRecovery.review.proposals.length,
          preserved_document_contract_version: durableRecovery.review.document_contract_version || null,
        };
      }
      if (durableRecovery.operation_outcomes.some((row) => ["committed", "duplicate"].includes(row.status))) {
        return { ok: false, status: "blocked", reason: "legacy_partial_apply_requires_manual_recovery", provider_calls: 0 };
      }
      const job = batchJobStore.getJob(durableRecovery.selected_batch_id);
      if (!job || typeof job.request_key !== "string") return { ok: false, status: "blocked", reason: "legacy_batch_job_unavailable", provider_calls: 0 };
      const proposals = [];
      const sourceGroups = [];
      let noChangeCount = 0;
      const staleSources = [];
      for (const sourceRow of durableRecovery.approval_sources || []) {
        const file = appRef.vault.getAbstractFileByPath(sourceRow.source_path);
        if (!file) { staleSources.push(sourceRow.source_path); continue; }
        const extractedText = await appRef.vault.cachedRead(file);
        const analysisText = inboxAnalysisText(extractedText);
        const scope = window.LLMWikiAnalysisScope.createAnalysisScope({
          source_id: sourceRow.source_id, source_path: sourceRow.source_path,
          content_hash: llmWikiHash.sha256(analysisText), source_text: analysisText,
        });
        const manifest = window.LLMWikiChunkManifest.createChunkManifest(scope);
        const lookup = await batchCache.lookup(manifest, scope, { request_key: job.request_key });
        if (!lookup.ok || lookup.misses.length > 0 || lookup.hits.length !== manifest.chunks.length) {
          staleSources.push(sourceRow.source_path);
          continue;
        }
        const source = { source_id: sourceRow.source_id, source_path: sourceRow.source_path, content_hash: llmWikiHash.sha256(extractedText) };
        const materialized = await materializeInboxProposals({ artifacts: compactArtifactsFromHits(lookup.hits), source });
        if (!materialized.ok) return { ok: false, status: "blocked", reason: materialized.reason || "legacy_materialization_failed", provider_calls: 0 };
        proposals.push(...materialized.proposals);
        noChangeCount += materialized.no_changes.length;
        const grouped = window.LLMWikiBatchApprovalAdapter.groupProposalsBySource({
          source,
          materializeResult: { ok: true, proposals: materialized.proposals, holds: materialized.holds, para_drafts: materialized.para_drafts },
        });
        if (!grouped.ok) return { ok: false, status: "blocked", reason: grouped.reason, provider_calls: 0 };
        sourceGroups.push(grouped.value);
      }
      const nextRecovery = {
        active_tab: "llmwiki",
        selected_batch_id: durableRecovery.selected_batch_id,
        review: {
          run_id: durableRecovery.review.run_id,
          document_contract_version: DOCUMENT_REVIEW_CONTRACT,
          selected_operation_ids: [],
          proposals: proposals.map((proposal) => ({
            operation_id: proposal.operation.operation_id,
            packet_id: `repacket_${proposal.operation.operation_id}`,
            summary: proposal.title,
            serialized_operation: JSON.stringify(proposal.operation),
            status: "review",
          })),
        },
        operation_outcomes: proposals.map((proposal) => ({ operation_id: proposal.operation.operation_id, status: "review" })),
        approval_sources: sourceGroups.map((group) => ({
          source_id: group.source_id, source_path: group.source_path, content_hash: group.content_hash,
          operation_ids: group.proposals.map((proposal) => proposal.operation.operation_id),
          unresolved_holds: group.holds.length, unresolved_para_drafts: group.para_drafts.length,
        })),
        archive_receipts: [],
      };
      const priorProposalCount = durableRecovery.review.proposals.length;
      durableRecovery = await batchJobStore.saveRecoverySnapshot(nextRecovery);
      return {
        ok: true, status: "repacketized", provider_calls: 0,
        prior_proposals: priorProposalCount,
        document_proposals: proposals.length, no_changes: noChangeCount,
        ...(staleSources.length ? { stale_sources: staleSources.length, stale_source_paths: staleSources } : {}),
      };
    };
    KnowledgeExplorerHub.repacketCurrentReview = repacketLegacyDocumentReview;
    const legacyDocumentRepacket = await repacketLegacyDocumentReview();
    KnowledgeExplorerHub.lastDocumentRepacket = legacyDocumentRepacket;
    if (durableRecovery?.review?.proposals?.length && llmWikiRunController.getSnapshot().status === "idle") {
      const restoredProposals = [];
      const completedOperations = new Set(durableRecovery.operation_outcomes.filter((row) => ["committed", "duplicate"].includes(row.status)).map((row) => row.operation_id));
      let restoreValid = true;
      for (const row of durableRecovery.review.proposals) {
        if (completedOperations.has(row.operation_id)) continue;
        const parsed = window.LLMWikiOperationContract.parseOperation(row.serialized_operation);
        if (!parsed || parsed.ok !== true) { restoreValid = false; break; }
        restoredProposals.push({ operation: parsed.value, title: row.summary || "복원된 검토 제안" });
      }
      if (restoreValid) {
        const operations = new Map();
        for (const row of durableRecovery.review.proposals) {
          const parsed = window.LLMWikiOperationContract.parseOperation(row.serialized_operation);
          if (parsed?.ok) operations.set(row.operation_id, parsed.value);
        }
        for (const source of durableRecovery.approval_sources || []) approvalGroups.set(source.source_id, Object.freeze({
          source_id: source.source_id, source_path: source.source_path, content_hash: source.content_hash,
          proposals: Object.freeze(source.operation_ids.map((operationId) => ({ operation: operations.get(operationId), class: operations.get(operationId)?.kind || "create", unit_id: operationId })).filter((row) => row.operation)),
          holds: Object.freeze(Array.from({ length: source.unresolved_holds || 0 }, () => ({ reason: "unresolved_hold" }))),
          para_drafts: Object.freeze(Array.from({ length: source.unresolved_para_drafts || 0 }, () => ({ reason: "unresolved_para_draft" }))),
        }));
        if (restoredProposals.length > 0) llmWikiRunController.openPreparedRiskReview({ run_id: durableRecovery.review.run_id, proposals: restoredProposals });
      }
    }
    // Task 11 cutover: durable batch job state replaces the legacy incremental
    // and per-source chunk-orchestrator paths; the candidate-to-migration handoff
    // and inboxAutopilot dispatch are removed from production.
    const fleetingReviewService = window.KnowledgeFleetingReviewState.createFleetingReviewState({
      vault: appRef.vault,
      analyze: async ({ blocks, signal }) => {
        for (const block of blocks) {
          const policy = window.LLMWikiSensitiveContentPolicy.inspect({ source_path: block.source_path, source_text: block.text, metadata: { route_hint: "knowledge" } });
          if (policy && policy.type === "hold") return { ok: false, reason: "sensitive_content_hold", completed_block_ids: [], reviews: [] };
        }
        const grouped = new Map();
        for (const block of blocks) grouped.set(block.source_path, [...(grouped.get(block.source_path) || []), block]);
        const completedBlockIds = [];
        const reviews = [];
        const proposals = [];
        for (const [sourcePath, sourceBlocks] of grouped) {
          if (signal.aborted) return { ok: false, reason: "cancelled", completed_block_ids: completedBlockIds, reviews };
          // Task 11 cutover: fleeting blocks enter the same canonical batch core
          // as one synthetic ZETA/FLEETING source; no per-chunk provider path.
          const extractedText = sourceBlocks.map((block) => `<!-- fleeting-block-id: ${block.block_id} -->\n## 생각 저장\n\n${block.text}`).join("\n\n");
          const contentHash = llmWikiHash.sha256(extractedText);
          const sourceId = `source_fleeting_${llmWikiHash.sha256(sourcePath).slice(0, 24)}`;
          const batchSourcePath = `ZETA/FLEETING/${sourceId}.md`;
          const outcome = await runCanonicalBatch({
            sources: [{ source_id: sourceId, source_path: batchSourcePath, extracted_text: extractedText, content_hash: contentHash }],
            signal,
          });
          if (!outcome || outcome.ok !== true) return { ok: false, reason: outcome && outcome.reason || "batch_analysis_failed", completed_block_ids: completedBlockIds, reviews };
          const source = { source_id: sourceId, source_path: batchSourcePath, content_hash: contentHash };
          const artifacts = outcome.artifacts_by_source.get(sourceId) || [];
          proposals.push(...outcome.proposals);
          for (const proposal of outcome.proposals) reviews.push({
            review_id: proposal.operation.operation_id,
            destination: proposal.decision.destination,
            title: proposal.title,
            proposal_input: { artifacts, source },
          });
          completedBlockIds.push(...sourceBlocks.map((block) => block.block_id));
        }
        if (proposals.length > 0) {
          const runId = `run_fleeting_${llmWikiHash.sha256(proposals.map((proposal) => proposal.operation.operation_id).sort().join(":" )).slice(0, 24)}`;
          const opened = llmWikiRunController.openPreparedRiskReview({ run_id: runId, proposals });
          if (!opened || opened.ok !== true) return { ok: false, reason: opened && opened.reason || "risk_review_unavailable", completed_block_ids: [], reviews: [] };
        }
        return { ok: true, completed_block_ids: completedBlockIds, reviews };
      },
    });
    const restoreFleetingReviews = async (reviewState) => {
      const inputs = new Map();
      for (const review of reviewState.reviews || []) {
        const input = review && review.proposal_input;
        if (input) inputs.set(JSON.stringify(input), input);
      }
      const proposals = [];
      for (const input of inputs.values()) {
        const materialized = await materializeInboxProposals(input);
        if (!materialized.ok) return { ok: false, reason: "forged_fleeting_review_state" };
        proposals.push(...materialized.proposals);
      }
      if (proposals.length === 0) return { ok: true };
      const runId = `run_fleeting_${llmWikiHash.sha256(proposals.map((proposal) => proposal.operation.operation_id).sort().join(":" )).slice(0, 24)}`;
      const opened = llmWikiRunController.openPreparedRiskReview({ run_id: runId, proposals });
      return opened && opened.ok === true ? { ok: true } : { ok: false, reason: opened && opened.reason || "risk_review_unavailable" };
    };
    fleetingReviewState = await fleetingReviewService.refresh();
    if (fleetingReviewState.status !== "blocked") {
      const restored = await restoreFleetingReviews(fleetingReviewState);
      if (!restored.ok) fleetingReviewState = { ...fleetingReviewState, status: "blocked", reason: restored.reason };
    }
    renderFleetingSummary(fleetingReviewState);
    refreshFleetingSurface = async () => {
      fleetingReviewState = await fleetingReviewService.refresh();
      renderFleetingSummary(fleetingReviewState);
      if (typeof llmWikiLifecycle !== "undefined" && llmWikiLifecycle) llmWikiLifecycle.update(lifecycleSnapshot());
      return fleetingReviewState;
    };
    const applyInboxState = (next) => {
      inboxState = { ...next };
      if (typeof llmWikiLifecycle !== "undefined" && llmWikiLifecycle) llmWikiLifecycle.update(lifecycleSnapshot());
      if (typeof knowledgeReviewWorkbench !== "undefined" && knowledgeReviewWorkbench) knowledgeReviewWorkbench.update({ items: reviewItems() });
      pokeMaintenance();
      if (typeof llmWikiControllerOptions.onInboxState === "function") llmWikiControllerOptions.onInboxState({ ...inboxState });
    };
    llmWikiSession.inboxSubscribers.add(applyInboxState);
    if (mountContext && mountContext.scope && typeof mountContext.scope.track === "function") {
      mountContext.scope.track(() => llmWikiSession.inboxSubscribers.delete(applyInboxState));
    }
    const publishInbox = (next) => {
      inboxState = { ...next };
      llmWikiSession.viewState.inboxState = { ...inboxState };
      for (const subscriber of llmWikiSession.inboxSubscribers) subscriber(inboxState);
      return { ok: true, status: inboxState.state, inbox: { ...inboxState } };
    };
    const settleInbox = (state) => {
      publishInbox(state);
      if (resolveInboxSettled) { resolveInboxSettled({ ...inboxState }); resolveInboxSettled = null; }
      return { ...inboxState };
    };
    // The manifest-loaded discovery queue is the sole classification/hash/
    // pending-snapshot authority. The Hub only supplies raw vault entries and
    // adapts the queue's body-free result for rendering.
    const readInboxDiscoveryEntries = async () => {
      const files = (appRef.vault.getMarkdownFiles ? appRef.vault.getMarkdownFiles() : [])
        .filter((file) => file && typeof file.path === "string" && file.path.startsWith("INBOX/") && !file.path.startsWith("INBOX/Processed/") && file.path.endsWith(".md"))
        .sort((left, right) => left.path.localeCompare(right.path, "ko"));
      const entries = [];
      for (const file of files) entries.push({
        source_path: file.path,
        read_source_text: () => appRef.vault.cachedRead(file),
        metadata: appRef.metadataCache && typeof appRef.metadataCache.getFileCache === "function"
          ? appRef.metadataCache.getFileCache(file)?.frontmatter || {} : {},
      });
      return entries;
    };
    const sourceCoverageComplete = async (source) => {
      try {
        const analysisText = inboxAnalysisText(source.extracted_text);
        const scope = window.LLMWikiAnalysisScope.createAnalysisScope({ source_id: source.source_id, source_path: source.source_path, content_hash: llmWikiHash.sha256(analysisText), source_text: analysisText });
        const manifest = window.LLMWikiChunkManifest.createChunkManifest(scope);
        const status = await batchCoverage.status(manifest, scope);
        return Boolean(status && status.ok === true && status.complete === true && status.exactCoverage === true);
      } catch (_error) { return false; }
    };
    const adaptQueueDiscovery = async () => {
      const queueResult = await inboxDiscoveryQueue.discover(await readInboxDiscoveryEntries());
      const pending = [];
      let unchanged = 0;
      const classificationBySourceId = new Map(queueResult.entries.map((entry) => [entry.source_id, entry.classification]));
      const recoveredSourceIds = new Set((durableRecovery?.approval_sources || []).map((source) => source.source_id));
      for (const source of inboxDiscoveryQueue.currentSources()) {
        const excludedFromRecoveredReview = Boolean(durableRecovery?.review) && !recoveredSourceIds.has(source.source_id);
        if (!excludedFromRecoveredReview && classificationBySourceId.get(source.source_id) === "unchanged" && await sourceCoverageComplete(source)) unchanged += 1;
        else pending.push(source);
      }
      const protectedItems = queueResult.entries.filter((row) => row.classification === "held").map((row) => Object.freeze({
        filename: String(row.source_path.split("/").pop() || row.source_path), reason: String(row.reason || "protected_source"),
      }));
      return {
        total: queueResult.counters.discovered_total,
        scannedTotal: queueResult.counters.eligible_total + queueResult.counters.held_total,
        eligible: queueResult.counters.eligible_total,
        held: queueResult.counters.held_total,
        protectedItems, pending, unchanged, queueResult,
      };
    };
    const refreshInboxViewFromQueue = () => {
      if (inboxScanPromise) return inboxScanPromise;
      inboxSettled = new Promise((resolve) => { resolveInboxSettled = resolve; });
      llmWikiSession.inboxSettled = inboxSettled;
      const activePromise = (async () => {
        try {
          const discovery = await adaptQueueDiscovery();
          const base = { total: discovery.total, scanned_total: discovery.scannedTotal, eligible: discovery.eligible, held: discovery.held, protected_items: discovery.protectedItems, pending: discovery.pending.length, unchanged: discovery.unchanged, processed: 0, succeeded: 0, failed: 0, current_path: "", current_title: "", source_id: "", reason: "", message: "", object_review_proposals: [] };
          const interrupted = durableUnknownJob && !durableRecovery;
          const state = settleInbox({ ...base, ...(interrupted ? { reason: "outcome_unknown", recovery_variant: "outcome_unknown", proposal_state: "blocked" } : {}), state: interrupted ? "blocked" : discovery.total === 0 ? "empty" : discovery.eligible === 0 ? "protected" : discovery.pending.length > 0 ? "queued" : "up_to_date" });
          return { ok: true, status: state.state, total: discovery.total, results: [] };
        } catch (error) {
          const state = settleInbox({ total: 0, scanned_total: 0, eligible: 0, held: 0, pending: 0, unchanged: 0, processed: 0, succeeded: 0, failed: 0, current_path: "", current_title: "", source_id: "", reason: error && error.message || "scan_failed", message: "", object_review_proposals: [], state: "error" });
          return { ok: false, status: state.state, total: 0, results: [] };
        }
      })().finally(() => {
        if (inboxScanPromise === activePromise) {
          inboxScanPromise = null;
          llmWikiSession.inboxScanPromise = null;
        }
      });
      inboxScanPromise = activePromise;
      llmWikiSession.inboxScanPromise = activePromise;
      return activePromise;
    };
    // Task 11 cutover: the explicit user-triggered batch. One click is consent
    // for the frozen batch; duplicate clicks are typed no-ops; cancel makes any
    // late batch result a bounded no-op.
    let inboxBatchToken = 0;
    let retrySequence = 0;
    let activeInboxRun = null;
    const runInboxBatch = ({ explicitRetry = false } = {}) => {
      if (!batchAnalyzer) return Promise.resolve({ ok: false, status: "blocked", reason: "provider_selection_unavailable" });
      const controllerStatus = llmWikiRunController.getSnapshot().status;
      if (explicitRetry && ["review", "committing", "committed"].includes(controllerStatus)) {
        return Promise.resolve({ ok: true, status: controllerStatus, reason: "review_already_ready", provider_calls: 0 });
      }
      if (activeInboxRun && !explicitRetry) return activeInboxRun.promise;
      const token = ++inboxBatchToken;
      const activePromise = (async () => {
      const discovery = await adaptQueueDiscovery();
      if (token !== inboxBatchToken) return { ok: false, status: "cancelled", reason: "run_superseded" };
      const frozenBatch = await inboxDiscoveryQueue.freezeBatch();
      const pendingIds = new Set(discovery.pending.map((row) => row.source_id));
      const sources = explicitRetry ? frozenBatch.sources : frozenBatch.sources.filter((row) => pendingIds.has(row.source_id));
      const baseCounts = { total: discovery.total, scanned_total: discovery.scannedTotal, eligible: discovery.eligible, held: discovery.held, protected_items: discovery.protectedItems, pending: sources.length, unchanged: discovery.unchanged };
      if (sources.length === 0) {
        const state = settleInbox({ ...baseCounts, processed: 0, succeeded: 0, failed: 0, current_path: "", current_title: "", source_id: "", reason: "", message: "", object_review_proposals: [], state: discovery.total === 0 ? "empty" : "up_to_date" });
        return { ok: true, status: state.state, provider_calls: 0, run_id: null, job_id: null };
      }
      const runId = `run_inbox_${llmWikiHash.sha256(sources.map((row) => `${row.source_id}:${row.content_hash}`).sort().join(":")).slice(0, 24)}`;
      const now = new Date().toISOString();
      publishInbox({ ...baseCounts, state: "analyzing", processed: 0, succeeded: 0, failed: 0, current_title: "INBOX 배치 분석", current_path: sources[0].source_path, source_id: sources[0].source_id, reason: "", message: "", object_review_proposals: [] });
      if (explicitRetry) retrySequence += 1;
      const retryIntentId = explicitRetry ? `retry_${runId}_${retrySequence}` : null;
      const response = await llmWikiRunController.startRun({
        run_id: runId,
        sources: sources.map((row) => ({ selected: true, display_name: row.source_path.split("/").pop() || "자료", extracted_text: row.extracted_text, analysis_text: inboxAnalysisText(row.extracted_text), source_path: row.source_path, manifest: { source_id: row.source_id, content_hash: row.content_hash, locator: row.source_path } })),
        retrieval: { snapshot: { documents: [] } },
        consent: { issued_at: now, nonce: `consent_${runId.slice(4)}_0001` },
        approval: { expires_at: new Date(Date.now() + 3600000).toISOString(), nonce: `approval_${runId.slice(4)}_0001` },
        advanced_settings: { provider_mode: selectedProviderMode, timeout_ms: 120000 },
        canonical_defaults: { knowledge_domain: "reading", knowledge_topics: [], application_trigger: "사람이 승인할 때", application_contexts: ["reading"], connections: [], invalidation_conditions: [], summary: "" },
        explicit_user_consent: true,
        ...(explicitRetry ? { task13_explicit_retry: true, task13_retry_intent_id: retryIntentId } : {}),
      });
      if (token !== inboxBatchToken) return { ok: false, status: "cancelled", reason: "run_superseded", late_result_ignored: true };
      if (!response || response.ok !== true) {
        const reason = response && response.reason || "batch_analysis_failed";
        const recoveryVariant = window.LLMWikiUIRecovery && typeof window.LLMWikiUIRecovery.recoveryVariantFor === "function"
          ? window.LLMWikiUIRecovery.recoveryVariantFor({ code: reason }) : "blocked";
        const state = settleInbox({ ...baseCounts, state: "blocked", recovery_variant: recoveryVariant, processed: 0, succeeded: 0, failed: sources.length, proposal_blocked: sources.length, proposal_state: "blocked", reason, message: "", object_review_proposals: [] });
        return { ok: false, status: state.state, reason, provider_calls: response && response.counters ? response.counters.provider : 0 };
      }
      const packets = Array.isArray(response.risk_packets) ? response.risk_packets : [];
      const packTotal = response.batch_metrics && Number.isSafeInteger(response.batch_metrics.pack_count) ? response.batch_metrics.pack_count : 0;
      const state = settleInbox({ ...baseCounts, state: "complete", processed: sources.length, succeeded: sources.length, failed: 0, pack_progress: { completed: packTotal, total: packTotal, current: packTotal }, proposal_pending: packets.length, proposal_complete: sources.length, proposal_state: packets.length ? "review" : "complete", reason: "", message: "", object_review_proposals: [] });
      if (packets.length > 0) {
        for (const group of response.source_groups || []) approvalGroups.set(group.source_id, group);
        durableRecovery = await batchJobStore.saveRecoverySnapshot({
          active_tab: "llmwiki",
          selected_batch_id: response.batch_id || llmWikiHash.sha256(runId),
          review: { run_id: runId, document_contract_version: DOCUMENT_REVIEW_CONTRACT, selected_operation_ids: [], proposals: packets.map((packet) => ({ operation_id: packet.operation.operation_id, packet_id: packet.packet_id, summary: packet.summary, serialized_operation: JSON.stringify(packet.operation), status: "review" })) },
          operation_outcomes: packets.map((packet) => ({ operation_id: packet.operation.operation_id, status: "review" })),
          approval_sources: (response.source_groups || []).map((group) => ({ source_id: group.source_id, source_path: group.source_path, content_hash: group.content_hash, operation_ids: group.proposals.map((proposal) => proposal.operation.operation_id), unresolved_holds: group.holds.length, unresolved_para_drafts: group.para_drafts.length })),
          archive_receipts: [],
        });
      }
      return { ok: true, status: state.state, provider_calls: response.counters ? response.counters.provider : 0, proposals: packets.length, run_id: runId, job_id: response.job_id || response.batch_id || null, batch_id: response.batch_id || null };
      })().finally(() => { if (activeInboxRun && activeInboxRun.promise === activePromise) activeInboxRun = null; });
      activeInboxRun = { promise: activePromise };
      return activePromise;
    };
    const lifecycleSnapshot = () => {
      const snapshot = llmWikiRunController.getSnapshot();
      const prodigyWiki = window.ProdigyWikiController.projectLifecycle(prodigyWikiController.getSnapshot());
      const directProvider = resolveProvider("direct");
      const durableProcessed = Boolean(durableRecovery
        && Array.isArray(durableRecovery.operation_outcomes)
        && durableRecovery.operation_outcomes.length > 0
        && durableRecovery.operation_outcomes.every((row) => row.status === "committed")
        && Array.isArray(durableRecovery.archive_receipts)
        && durableRecovery.archive_receipts.length > 0);
      return {
        ...snapshot,
        ...(snapshot.provider_mode ? {} : { provider_mode: selectedProviderMode }),
        provider_key: directProvider && directProvider.ok === true ? directProvider.provider_key : "",
        provider_options: providerOptions,
        provider_readiness: (() => {
          const selected = directProvider && directProvider.ok === true ? providerOptions.find((option) => option.provider_key === directProvider.provider_key) : null;
          return { ready: Boolean(selected && selected.configured === true), code: selected && selected.configured === true ? "ready" : String(directProvider && directProvider.code || "configuration_required") };
        })(),
        display_variant: "local",
        golden_wiki: prodigyWiki.golden_wiki,
        ...(providerSelectionFailure ? { provider_selection_error: providerSelectionFailure } : {}),
        ...(prodigyWiki.source_selection ? { source_selection: prodigyWiki.source_selection } : {}),
        source_options: prodigyWiki.source_options.length ? prodigyWiki.source_options : sourceOptions,
        ...(prodigyWiki.status !== "idle" ? { status: prodigyWiki.status } : {}),
        ...(prodigyWiki.reason ? { reason: prodigyWiki.reason } : {}),
        ...(durableProcessed && prodigyWiki.status === "idle" ? { status: "processed", reason: "" } : {}),
        inbox: { ...inboxState },
        fleeting: { ...fleetingReviewState },
        approval_packet: snapshot.approval_packet || (Array.isArray(snapshot.review_packets) ? snapshot.review_packets[0] || null : null),
        durable_review_selection: durableRecovery?.review?.selected_operation_ids || [],
        durable_operation_outcomes: durableRecovery?.operation_outcomes || [],
      };
    };
    const dispatchStartupIntent = async (intent) => {
      if (!intent || typeof intent.action !== "string") return { ok: false, status: "failed", reason: "malformed_action" };
      if (intent.action === "review_fleeting") {
        fleetingReviewState = { ...fleetingReviewState, status: "analyzing" };
        renderFleetingSummary(fleetingReviewState);
        const reviewed = await fleetingReviewService.reviewNew();
        fleetingReviewState = reviewed;
        renderFleetingSummary(fleetingReviewState);
        return { ok: reviewed.status === "complete", status: reviewed.status, fleeting: reviewed, reason: reviewed.reason || "" };
      }
      if (intent.action === "cancel_fleeting") {
        const cancelled = fleetingReviewService.cancel();
        fleetingReviewState = { ...fleetingReviewState, ...cancelled };
        renderFleetingSummary(fleetingReviewState);
        return { ok: cancelled.status === "cancelled", status: cancelled.status, fleeting: { ...fleetingReviewState }, reason: cancelled.reason || "" };
      }
      if (intent.action === "repair_fleeting_state") {
        fleetingReviewState = await fleetingReviewService.repair();
        renderFleetingSummary(fleetingReviewState);
        return { ok: fleetingReviewState.status !== "blocked", status: fleetingReviewState.status, fleeting: { ...fleetingReviewState }, reason: fleetingReviewState.reason || "" };
      }
      if (intent.action === "scan_inbox") return refreshInboxViewFromQueue();
      if (intent.action === "analyze_inbox") return runInboxBatch();
      if (intent.action === "cancel_inbox") {
        // Task 11 cutover: cancel invalidates the active run token so any late
        // batch result is a bounded no-op; it can never open or mutate review.
        if (!["queued", "analyzing"].includes(inboxState.state)) return { ok: false, status: inboxState.state, reason: "inbox_scan_not_active" };
        inboxBatchToken += 1;
        const controllerStatus = llmWikiRunController.getSnapshot().status;
        if (["running", "review", "consent_required", "committing"].includes(controllerStatus)) {
          try { await llmWikiRunController.cancel({ action: "cancel" }); } catch (_error) { /* bounded no-op on late settle */ }
        }
        const cancelledState = settleInbox({ ...inboxState, state: "cancelled", processed: 0, succeeded: 0, failed: 0, current_path: "", current_title: "", reason: "cancelled" });
        return { ok: true, status: "cancelled", reason: "cancelled", inbox: cancelledState };
      }
      if (["retry_inbox", "retry_analysis"].includes(intent.action)) return runInboxBatch({ explicitRetry: true });
      if (intent.action === "open_ai_settings") {
        try {
          await ensureProdigySettings(appRef);
          if (!window.ProdigySettingsModal || typeof window.ProdigySettingsModal.open !== "function") return { ok: false, status: "blocked", reason: "settings_unavailable" };
          window.ProdigySettingsModal.open(appRef);
          return { ok: true, status: inboxState.state, provider_calls: 0 };
        } catch (_error) { return { ok: false, status: "blocked", reason: "settings_unavailable", provider_calls: 0 }; }
      }
      if (intent.action === "later") return { ok: true, status: inboxState.state, provider_calls: 0 };
      if (intent.action === "repacket") return llmWikiRunController.repacketStale({ action: "repacket_stale" });
      if (intent.action === "set_provider_mode") {
        if (!["direct", "omniroute"].includes(intent.provider_mode)) return { ok: false, status: "failed", reason: "invalid_provider_mode" };
        selectedProviderMode = intent.provider_mode;
        selectedRunCommand = null;
        return { ok: true, status: llmWikiRunController.getSnapshot().status, provider_mode: selectedProviderMode };
      }
      if (intent.action === "set_provider") {
        return { ok: false, status: "failed", reason: "action_unavailable" };
      }
      if (intent.action === "select_source" && !intent.source_path) {
        selectedRunCommand = null;
        sourceOptions = sourceOptions.length ? sourceOptions : await sourceOptionsReady;
        prodigyWikiController.dispatch({ type: "open_picker", options: sourceOptions });
        return { ok: sourceOptions.length > 0, status: "selecting", source_options: sourceOptions };
      }
      if (intent.action === "select_source") {
        sourceOptions = sourceOptions.length ? sourceOptions : await sourceOptionsReady;
        const option = sourceOptions.find((item) => item.path === intent.source_path);
        if (!option) {
          return { ok: false, status: "selecting", reason: "unknown_source" };
        }
        let pinnedOption = option;
        if (option.source_kind === "inbox") {
          const pinned = await window.LLMWikiUserSourceSelector.pinSelection(option, appRef.vault, llmWikiHash);
          if (!pinned.ok) {
            return { ok: false, status: "selecting", reason: pinned.reason };
          }
          pinnedOption = pinned.option;
          if (selectedProviderMode !== "direct") selectedProviderMode = "direct";
        }
        sourceOptions = sourceOptions.map((row) => row.path === pinnedOption.path ? pinnedOption : row);
        selectedRunCommand = null;
        prodigyWikiController.dispatch({ type: "select_source", source: pinnedOption });
        return { ok: true, status: "selecting", source: pinnedOption };
      }
      if (intent.action === "open_golden_review") {
        tabs.select("llmwiki-browse");
        return { ok: true, status: "complete", provider_calls: 0 };
      }
      if (intent.action === "cancel_golden_wiki") {
        prodigyWikiController.dispatch({ type: "cancel" });
        return { ok: true, status: "selecting", provider_calls: 0 };
      }
      if (intent.action === "select_golden_scope") {
        const scopes = prodigyWikiController.getSnapshot().result?.scopes || [];
        const scope = scopes.find((row) => row.scope_id === intent.scope_id);
        if (!scope) return { ok: false, status: "selecting", reason: "unknown_source_scope" };
        const prepared = await preflightGoldenWiki(scope);
        if (!prepared.ok || prepared.packs > window.LLMWikiGoldenWikiOrchestrator.MAX_DIRECT_PACKS) {
          prodigyWikiController.dispatch({ type: "require_range", result: prepared, reason: prepared.reason || "selected_scope_too_large" });
          return { ok: false, status: "scope_required", reason: prepared.reason || "selected_scope_too_large" };
        }
        prodigyWikiController.dispatch({ type: "select_range", range: scope, preflight: prepared });
        prodigyWikiController.dispatch({ type: "request_consent", preflight: prepared });
        return { ok: true, status: "consent_required", preflight: prepared, provider_calls: 0 };
      }
      if (!["request_consent", "start_run"].includes(intent.action)) return { ok: false, status: "failed", reason: "action_unavailable" };
      const selectedSource = prodigyWikiController.getSnapshot().source;
      if (!selectedSource) {
        return { ok: false, status: "selecting", reason: "source_selection_required" };
      }
      const resolvedProvider = resolveProvider(selectedProviderMode);
      const providerOption = resolvedProvider && resolvedProvider.ok === true
        ? providerOptions.find((option) => option.provider_key === resolvedProvider.provider_key)
        : null;
      const providerGateOk = Boolean(llmWikiControllerOptions.batchProvider || llmWikiControllerOptions.batchIdentity)
        || Boolean(providerOption && providerOption.configured === true);
      if (!providerGateOk) {
        providerSelectionFailure = "설정 → AI에서 기본 제공자의 인증 설정을 확인해 주세요.";
        return { ok: false, status: "failed", reason: "provider_selection_unavailable" };
      }
      if (intent.action === "request_consent") {
        const prepared = await preflightGoldenWiki();
        if (!prepared.ok) {
          prodigyWikiController.dispatch({
            type: prepared.reason === "source_revision_changed" ? "source_changed" : "interrupt",
            stage: "preflight",
            result: prepared,
            reason: prepared.reason || "golden_wiki_preflight_failed",
          });
          return { ...prepared, status: "failed", provider_calls: 0 };
        }
        if (prepared.packs > window.LLMWikiGoldenWikiOrchestrator.MAX_DIRECT_PACKS) {
          const blocked = { ...prepared, status: "scope_required", reason: "large_source_scope_required" };
          prodigyWikiController.dispatch({ type: "require_range", result: blocked, reason: blocked.reason });
          return { ...blocked, ok: false, provider_calls: 0 };
        }
        prodigyWikiController.dispatch({ type: "request_consent", preflight: prepared });
        return { ok: true, status: "consent_required", preflight: prepared, provider_calls: 0 };
      }
      providerSelectionFailure = "";
      return runGoldenWiki(prodigyWikiController.getSnapshot().range || null);
    };
    const reviewItems = () => {
      const configured = Array.isArray(llmWikiControllerOptions.review_items) ? llmWikiControllerOptions.review_items : [];
      const reviewSnapshot = llmWikiRunController.getSnapshot();
      const proposalByOperationId = new Map((Array.isArray(reviewSnapshot.proposals) ? reviewSnapshot.proposals : [])
        .filter((proposal) => proposal && proposal.operation && typeof proposal.operation.operation_id === "string")
        .map((proposal) => [proposal.operation.operation_id, proposal]));
      const fleetingRows = (Array.isArray(fleetingReviewState.reviews) ? fleetingReviewState.reviews : []).map((review) => ({
        review_id: review.review_id,
        destination: review.destination,
        review_state: "pending",
        analysis_state: "complete",
        title: review.title,
      }));
      const candidateRows = candidateConfig && candidateConfig.candidateInbox && Array.isArray(candidateConfig.candidateInbox.candidates)
        ? candidateConfig.candidateInbox.candidates.map((candidate) => ({
          review_id: candidate.candidate_id,
          destination: "knowledge_candidate",
          review_state: candidate.status === "active" ? "pending" : "hold",
          analysis_state: "complete",
          title: candidate.title,
          promotion_gaps: Array.isArray(candidate.promotion_gaps) ? candidate.promotion_gaps : [],
          sources: Array.isArray(candidate.sources) ? candidate.sources : [],
          review_history: Array.isArray(candidate.review_history) ? candidate.review_history : [],
          acceptance_state: candidate.status,
        })) : [];
      const packetRows = (Array.isArray(reviewSnapshot.risk_packets) ? reviewSnapshot.risk_packets : [])
        .filter((packet) => packet && typeof packet.packet_id === "string")
        .map((packet) => {
          const destinations = packet.operation && Array.isArray(packet.operation.destination_ids) ? packet.operation.destination_ids : [];
          const destination = destinations.every((path) => String(path).startsWith("ZETA/LITERATURE/"))
            ? "literature"
            : destinations.every((path) => String(path).startsWith("ZETA/CANDIDATES/"))
              ? "knowledge_candidate"
              : "canonical_knowledge";
          const proposal = proposalByOperationId.get(packet.operation.operation_id);
          const lineage = Array.isArray(packet.source_lineage) ? packet.source_lineage : [];
          const sources = lineage.flatMap((citation) => (Array.isArray(citation.locators) ? citation.locators : []).map((locator) => ({
            source_id: citation.source_id,
            locator,
          })));
          const citations = lineage.map((citation, index) => ({
            citation_id: `citation_${index + 1}`,
            source_id: citation.source_id,
            locators: Array.isArray(citation.locators) ? citation.locators : [],
          }));
          const citationIds = citations.map((citation) => citation.citation_id);
          const restoredClaimTexts = destinations.flatMap((destinationPath) => {
            const body = String(packet.operation.after_bytes && packet.operation.after_bytes[destinationPath] || "");
            const section = /## 핵심 내용\s*\n+([\s\S]*?)\n+## 출처/u.exec(body);
            return section ? section[1].split("\n").map((line) => line.replace(/^\s*-\s*/u, "").trim()).filter(Boolean) : [];
          });
          const documentClaims = proposal && proposal.document && Array.isArray(proposal.document.claims)
            ? proposal.document.claims : restoredClaimTexts.map((text) => ({ text }));
          const summaryPoints = documentClaims.map((claim) => String(claim.text || "").trim()).filter(Boolean);
          const documentBody = destinations.map((destinationPath) => String(packet.operation.after_bytes && packet.operation.after_bytes[destinationPath] || "")).find(Boolean) || "";
          const claims = documentClaims
            .map((claim, index) => ({
              claim_id: `claim_${index + 1}`,
              text: String(claim.text || ""),
              origin: "ai_synthesis",
              citation_ids: citationIds,
              derived_from_claim_ids: [],
            }));
          return {
            review_id: packet.packet_id, destination, review_state: "pending", analysis_state: "complete",
            title: packet.summary || "지식 문서 검토", sources,
            summary_points: summaryPoints,
            document_body: documentBody,
            target_path: destinations[0] || "",
            claim_set: { claims, citations, disputes: [] },
            coverage: { complete: sources.length > 0, status: sources.length > 0 ? "완료" : "확인 필요" },
          };
        });
      const objectRows = Array.isArray(inboxState.object_review_proposals) ? inboxState.object_review_proposals
        .filter((proposal) => proposal && typeof proposal.handoff_id === "string" && proposal.target)
        .map((proposal) => ({ review_id: proposal.handoff_id, destination: "para_object", review_state: "pending", analysis_state: "complete", title: proposal.text || proposal.knowledge && proposal.knowledge.path || "PARA 전달", object_handoff: { handoff_id: proposal.handoff_id, target_path: proposal.target.path, target_revision: proposal.before && proposal.before.revision || "", before_bytes: proposal.before && proposal.before.bytes || "", before_diff: proposal.text ? [{ kind: "add", line: proposal.text }] : proposal.knowledge && proposal.knowledge.link ? [{ kind: "add", line: proposal.knowledge.link }] : [] } })) : [];
      const queued = inboxState && ["queued", "analyzing"].includes(inboxState.state) && /^[a-z][a-z0-9_-]{2,127}$/u.test(String(inboxState.source_id || ""))
        ? [{ review_id: inboxState.source_id, destination: "none", review_state: "pending", analysis_state: inboxState.state === "analyzing" ? "running" : "queued", title: inboxState.current_title || "분석 대기" }] : [];
      return [...pagePlanReviewItems, ...configured, ...fleetingRows, ...candidateRows, ...packetRows, ...objectRows, ...queued].filter((item, index, rows) => item && typeof item.review_id === "string" && /^[a-z][a-z0-9_-]{2,127}$/u.test(item.review_id) && rows.findIndex((row) => row && row.review_id === item.review_id) === index);
    };
    let llmWikiLifecycle;
    let knowledgeReviewWorkbench = null;
    const refreshReviewWorkbench = () => {
      if (knowledgeReviewWorkbench) knowledgeReviewWorkbench.update({ items: reviewItems() });
    };
    const applyBatchApproval = async ({ selected_operation_ids: selectedOperationIds, user_action: userAction }) => {
      if (userAction !== window.LLMWikiBatchApprovalAdapter.EXPLICIT_ACTION || !durableRecovery?.review) return { ok: false, reason: "explicit_user_approval_required", status: "review" };
      const outcomeById = new Map(durableRecovery.operation_outcomes.map((row) => [row.operation_id, row]));
      if (selectedOperationIds.every((id) => ["committed", "duplicate"].includes(outcomeById.get(id)?.status))) return { ok: true, status: "duplicate", write_counts: { canonical: 0, audit: 0, source: 0 }, results: [] };
      restoreDurableApprovalGroups();
      const allResults = [];
      const archiveReceipts = [...(durableRecovery.archive_receipts || [])];
      let canonicalWrites = 0;
      let auditWrites = 0;
      let sourceWrites = 0;
      for (const group of approvalGroups.values()) {
        const selectedForSource = selectedOperationIds.filter((id) => group.proposals.some((proposal) => proposal.operation.operation_id === id));
        if (selectedForSource.length === 0) continue;
        const matrixResult = window.LLMWikiBatchApprovalAdapter.preselectionMatrix(group, {
          allowedCandidateIds: Array.isArray(llmWikiControllerOptions.allowedCandidateIds) ? llmWikiControllerOptions.allowedCandidateIds : [],
          relatedCandidates: Array.isArray(llmWikiControllerOptions.relatedCandidates) ? llmWikiControllerOptions.relatedCandidates : [],
        });
        if (!matrixResult.ok) return { ok: false, reason: matrixResult.reason, status: "review" };
        const authorized = window.LLMWikiBatchApprovalAdapter.authorizeBatch(matrixResult.value, {
          selected_operation_ids: selectedForSource,
          user_action: userAction,
          run_id: durableRecovery.review.run_id,
        });
        if (!authorized.ok) return { ok: false, reason: authorized.reason, status: "review" };
        const applied = await window.LLMWikiBatchApprovalAdapter.applyBatch({ group, selection: authorized.value, vault: batchApprovalVault });
        if (!applied.ok) return { ok: false, reason: applied.reason, status: "review" };
        canonicalWrites += applied.value.write_counts.canonical;
        auditWrites += applied.value.write_counts.audit;
        for (const row of applied.value.results) {
          const durableRow = ["committed", "duplicate"].includes(row.status) ? { ...row, receipt_id: row.operation_id } : row;
          outcomeById.set(row.operation_id, durableRow);
          allResults.push(durableRow);
        }

        const aggregate = { results: group.proposals.map((proposal) => outcomeById.get(proposal.operation.operation_id) || { operation_id: proposal.operation.operation_id, status: "review" }) };
        const eligibility = window.LLMWikiBatchApprovalAdapter.archivalEligibility({ group, applyResult: aggregate });
        if (eligibility.eligible && !archiveReceipts.some((receipt) => receipt.source_id === group.source_id)) {
          const archived = await window.LLMWikiProcessedSourceService.archiveProcessed({ source_path: group.source_path, expected_sha256: group.content_hash, vault: batchApprovalVault });
          if (!archived.ok) return { ok: false, reason: archived.reason, status: "committed", results: allResults, write_counts: { canonical: canonicalWrites, audit: auditWrites, source: sourceWrites } };
          archiveReceipts.push({ source_id: group.source_id, ...archived.value });
          if (archived.value.status === "archived") sourceWrites += 1;
        }
      }
      const outcomes = durableRecovery.operation_outcomes.map((row) => ({ ...row, ...(outcomeById.get(row.operation_id) || {}) }));
      durableRecovery = await batchJobStore.saveRecoverySnapshot({ ...durableRecovery, operation_outcomes: outcomes, archive_receipts: archiveReceipts });
      const fullyResolved = outcomes.every((row) => ["committed", "duplicate"].includes(row.status));
      if (fullyResolved) await batchJobStore.setJobState(durableRecovery.selected_batch_id, "resolved");
      return { ok: true, status: sourceWrites > 0 ? "processed" : fullyResolved ? "committed" : "review", results: allResults, archive_receipts: archiveReceipts, write_counts: { canonical: canonicalWrites, audit: auditWrites, source: sourceWrites } };
    };
    llmWikiSession.bindings.applyBatchApproval = applyBatchApproval;
    const dispatchLifecycleAction = async (intent) => {
      let pending;
      const durableProposal = durableRecovery?.review?.proposals?.find((row) => row.packet_id === intent.packet_id)
        || durableRecovery?.review?.proposals?.find((row) => row.packet_id === intent.invalidated_packet_id)
        || null;
      const affectedOperationId = durableProposal?.operation_id || null;
      if (intent.action === "persist_review_selection") {
        if (!durableRecovery?.review || !Array.isArray(intent.operation_ids)) return { ok: false, status: "rejected", reason: "review_selection_unavailable" };
        durableRecovery = await batchJobStore.saveRecoverySnapshot({ ...durableRecovery, review: { ...durableRecovery.review, selected_operation_ids: [...new Set(intent.operation_ids)].sort() } });
        llmWikiLifecycle.update(lifecycleSnapshot());
        return { ok: true, status: "review", provider_calls: 0, write_counts: { canonical: 0, audit: 0, refresh: 0, git: 0 } };
      }
      if (["approve_risk", "approve_risk_batch"].includes(intent.action) && durableRecovery?.approval_sources) {
        const packetIds = intent.action === "approve_risk" ? [intent.packet_id] : Array.isArray(intent.selection_ids) ? intent.selection_ids : [];
        const operationIds = durableRecovery.review.proposals.filter((row) => packetIds.includes(row.packet_id)).map((row) => row.operation_id);
        pending = llmWikiRunController.applyPreparedBatchApproval({ user_action: window.LLMWikiBatchApprovalAdapter.EXPLICIT_ACTION, selected_operation_ids: operationIds });
      }
      else if (["approve_risk", "reject_risk", "approve_risk_batch", "request_risk_revision"].includes(intent.action)) pending = llmWikiRunController.dispatchRiskAction(intent);
      else if (intent.action === "resurfacing_feedback") pending = llmWikiRunController.recordResurfacingFeedback(intent);
      else if (intent.action === "approve") pending = llmWikiRunController.approve(intent);
      else if (intent.action === "cancel" && ["consent_required", "range_required"].includes(prodigyWikiController.getSnapshot().status)) pending = dispatchStartupIntent({ action: "cancel_golden_wiki" });
      else if (intent.action === "cancel") pending = llmWikiRunController.cancel(intent);
      else if (intent.action === "reload") pending = llmWikiRunController.reload(intent);
      else if (intent.action === "repair_audit") pending = llmWikiRunController.repairAudit(intent);
      else if (intent.action === "retry_refresh") pending = llmWikiRunController.retryRefresh(intent);
      else if (intent.action === "repacket_stale") pending = llmWikiRunController.repacketStale(intent);
      else if (intent.action === "reconfirm_stale") pending = llmWikiRunController.reconfirmStale(intent);
      else if (intent.action === "request_compensation") pending = llmWikiRunController.requestCompensation(intent);
      else if (intent.action === "confirm_compensation") pending = llmWikiRunController.confirmCompensation(intent);
      else if (intent.action === "retry_follow_up") pending = llmWikiRunController.retryOperationFollowUp(intent);
      else if (intent.action === "recover_operation") pending = llmWikiRunController.recoverOperation(intent);
      else pending = dispatchStartupIntent(intent);
      const fastLocalAction = ["select_source", "select_golden_scope", "open_golden_review", "set_provider_mode", "later", "open_ai_settings", "request_consent", "cancel"].includes(intent.action);
      if (!fastLocalAction && !["approve_risk", "reject_risk", "approve_risk_batch", "request_risk_revision"].includes(intent.action)) llmWikiLifecycle.update(lifecycleSnapshot());
      if (!fastLocalAction) {
        refreshReviewWorkbench();
        pokeMaintenance();
      }
      let response = await pending;
      if (durableRecovery?.review && response?.ok !== true && affectedOperationId) {
        const currentOutcome = durableRecovery.operation_outcomes.find((row) => row.operation_id === affectedOperationId);
        const reason = String(response?.reason || "");
        const invalidationReason = ["target_revision_mismatch", "source_revision_mismatch", "stale_source", "stale_source_revision"].includes(reason)
          ? "source_hash_changed"
          : ["packet_invalidated", "invalidated_batch_packet", "stale_risk_action", "risk_packet_snapshot_mismatch"].includes(reason)
            ? "packet_changed"
            : response?.invalidated_packet_id || reason.startsWith("repacket_") || ["typed_repacket_failed", "replacement_run_activation_failed"].includes(reason)
              ? "repacket_required" : null;
        if (invalidationReason && currentOutcome && !["committed", "duplicate"].includes(currentOutcome.status)) {
          await batchJobStore.invalidateRecoveryOperation({ operation_id: affectedOperationId, reason: invalidationReason });
          durableRecovery = batchJobStore.getRecoverySnapshot();
        }
      }
      if (durableRecovery?.review && response?.ok === true && ["approve_risk", "approve_risk_batch"].includes(intent.action) && !durableRecovery.approval_sources) {
        const selectedPacketIds = intent.action === "approve_risk" ? [intent.packet_id] : intent.selection_ids || [];
        const selectedOperationIds = durableRecovery.review.proposals.filter((row) => selectedPacketIds.includes(row.packet_id)).map((row) => row.operation_id);
        const outcomes = durableRecovery.operation_outcomes.map((row) => selectedOperationIds.includes(row.operation_id)
          ? { ...row, status: "committed", receipt_id: response.receipt?.packet_snapshot?.packet_id || response.receipt?.packet_id || response.committed?.receipt?.packet_id || row.receipt_id || "durable_commit_receipt" }
          : row);
        durableRecovery = await batchJobStore.saveRecoverySnapshot({ ...durableRecovery, operation_outcomes: outcomes });
      }
      if (durableRecovery?.review && response?.ok === true && intent.action === "request_risk_revision") {
        const packets = llmWikiRunController.getSnapshot().risk_packets || [];
        const packetByOperation = new Map(packets.map((packet) => [packet.operation.operation_id, packet]));
        const proposals = durableRecovery.review.proposals.map((row) => {
          const packet = packetByOperation.get(row.operation_id);
          return packet ? { operation_id: packet.operation.operation_id, packet_id: packet.packet_id, summary: packet.summary, serialized_operation: JSON.stringify(packet.operation), status: "review" } : row;
        });
        for (const packet of packets) if (!proposals.some((row) => row.operation_id === packet.operation.operation_id)) proposals.push({ operation_id: packet.operation.operation_id, packet_id: packet.packet_id, summary: packet.summary, serialized_operation: JSON.stringify(packet.operation), status: "review" });
        const outcomes = durableRecovery.operation_outcomes.map((row) => row.operation_id === affectedOperationId ? { operation_id: row.operation_id, status: "review", action: "retry" } : row);
        durableRecovery = await batchJobStore.saveRecoverySnapshot({ ...durableRecovery, review: { ...durableRecovery.review, selected_operation_ids: durableRecovery.review.selected_operation_ids.filter((id) => id !== affectedOperationId), proposals }, operation_outcomes: outcomes });
      }
      if (durableRecovery?.review && response?.ok === true && intent.action === "reject_risk") {
        const outcomes = durableRecovery.operation_outcomes.map((row) => ["committed", "duplicate"].includes(row.status)
          ? row
          : { ...row, status: "rejected", reason: "user_rejected" });
        durableRecovery = await batchJobStore.saveRecoverySnapshot({
          ...durableRecovery,
          review: { ...durableRecovery.review, selected_operation_ids: [], proposals: [] },
          operation_outcomes: outcomes,
          approval_sources: [],
        });
      }
      persistLlmWikiSessionView();
      KnowledgeExplorerHub.lastLlmWikiAction = { intent, response };
      llmWikiLifecycle.update(lifecycleSnapshot());
      if (!fastLocalAction) refreshReviewWorkbench();
      if (typeof llmWikiControllerOptions.onLifecycleAction === "function") llmWikiControllerOptions.onLifecycleAction({ intent, response });
      if (!fastLocalAction) pokeMaintenance();
      return response;
    };
    dispatchFleetingAction = () => {
      tabs.select("llmwiki");
      return dispatchLifecycleAction({ action: "review_fleeting" });
    };
    const requestRevisionGuidance = (packet) => {
      if (typeof llmWikiControllerOptions.requestRevisionGuidance === "function") return llmWikiControllerOptions.requestRevisionGuidance(packet);
      return new Promise((resolve) => {
        const modal = new obsidianRef.Modal(appRef);
        let settled = false;
        modal.onOpen = () => {
          modal.contentEl.empty();
          modal.contentEl.createEl("h2", { text: "수정 요청" });
          modal.contentEl.createEl("p", { text: "바꾸고 싶은 내용을 자연어로 적어 주세요." });
          const input = modal.contentEl.createEl("textarea", { attr: { "aria-label": "수정 요청 내용", rows: "5" } });
          const actions = modal.contentEl.createDiv({ attr: { class: "llmwiki-lifecycle__actions" } });
          const cancel = actions.createEl("button", { text: "취소", attr: { type: "button" } });
          const submit = actions.createEl("button", { text: "수정 요청 보내기", attr: { type: "button", "data-primary": "true" } });
          cancel.onclick = () => { if (!settled) { settled = true; resolve(""); } modal.close(); };
          submit.onclick = () => { const guidance = String(input.value || "").trim(); if (!guidance || settled) return; settled = true; resolve(guidance); modal.close(); };
        };
        modal.onClose = () => { if (!settled) { settled = true; resolve(""); } };
        modal.open();
      });
    };
    const resolveSourcePreview = async (item) => {
      const previewApi = window.LLMWikiSourcePreview;
      if (!previewApi || typeof previewApi.sourcePath !== "function" || typeof previewApi.resolvePreview !== "function") return { ok: false, reason: "SOURCE_PREVIEW_UNAVAILABLE" };
      const citation = {
        source_id: item && item.source_id,
        content_hash: item && item.content_hash,
        source_path: item && item.source_path,
        locators: [item && item.locator].filter(Boolean),
        evidence_quote: item && item.evidence_quote,
      };
      const sourcePath = previewApi.sourcePath(citation);
      if (!sourcePath) return { ok: false, reason: "SOURCE_PREVIEW_PATH_REQUIRED" };
      const file = appRef.vault.getAbstractFileByPath(sourcePath);
      if (!file) return { ok: false, reason: "SOURCE_PREVIEW_FILE_MISSING" };
      const sourceText = await appRef.vault.read(file);
      return previewApi.resolvePreview({ citation, source_text: sourceText });
    };
    const openSourceForEdit = async (preview) => {
      const sourcePath = preview && preview.source_path;
      const position = preview && preview.position;
      if (!sourcePath || !position || !Number.isSafeInteger(position.line) || !Number.isSafeInteger(position.ch)) return { ok: false, reason: "SOURCE_EDIT_POSITION_REQUIRED" };
      const file = appRef.vault.getAbstractFileByPath(sourcePath);
      if (!file) return { ok: false, reason: "SOURCE_EDIT_FILE_MISSING" };
      const leaf = appRef.workspace.getLeaf("tab");
      await leaf.setViewState({ type: "markdown", state: { file: sourcePath, mode: "source", source: true }, active: true });
      appRef.workspace.setActiveLeaf(leaf, { focus: true });
      const editor = leaf.view && leaf.view.editor;
      if (!editor || typeof editor.setCursor !== "function") return { ok: false, reason: "SOURCE_EDIT_EDITOR_UNAVAILABLE" };
      editor.setCursor(position);
      if (typeof editor.scrollIntoView === "function") editor.scrollIntoView({ from: position, to: position }, true);
      if (typeof editor.focus === "function") editor.focus();
      return { ok: true, source_path: sourcePath, position };
    };
    if (!sourceOptions.length) sourceOptions = await sourceOptionsReady;
    prodigyWikiController.dispatch({ type: "set_options", options: sourceOptions });
    const llmWikiLifecycleFrame = llmWikiPanel.createDiv({ attr: { class: "llmwiki-lifecycle-frame" } });
    llmWikiLifecycle = window.LLMWikiLifecycleView.mountLlmWikiLifecycleView({
      container: llmWikiLifecycleFrame,
      snapshot: lifecycleSnapshot(),
      onAction: dispatchLifecycleAction,
      requestRevisionGuidance,
      reviewView: window.LLMWikiRiskApprovalReviewView,
      reviewOptions: { onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath), onEditSource: openSourceForEdit, resolveSourcePreview }
    });
    const unsubscribeProdigyWikiLifecycle = prodigyWikiController.subscribe(() => {
      if (llmWikiLifecycle) llmWikiLifecycle.update(lifecycleSnapshot());
    });
    if (mountContext && mountContext.scope && typeof mountContext.scope.track === "function") {
      mountContext.scope.track(unsubscribeProdigyWikiLifecycle);
    }
    const storedPlanSnapshots = batchJobStore.listPlanSnapshots().filter((snapshot) => snapshot?.plan && snapshot?.inventory);
    if (storedPlanSnapshots.length > 0) {
      const selector = llmWikiPanel.createDiv({ attr: { class: "llmwiki-plan-source-selector" } });
      selector.createEl("strong", { text: "문서 계획 선택" });
      const buttons = selector.createDiv({ attr: { class: "llmwiki-lifecycle__actions" } });
      for (const snapshot of storedPlanSnapshots) {
        const sourcePath = snapshot.plan.source?.source_path || snapshot.source_id;
        const label = `${sourcePath.split("/").pop()?.replace(/\.md$/u, "")} · ${snapshot.plan.pages.length}개 문서`;
        const button = buttons.createEl("button", { text: label, attr: { type: "button",
          "data-active": documentPlanContext?.job_id === snapshot.job_id ? "true" : "false" } });
        button.onclick = () => openStoredDocumentPlan(snapshot.job_id);
      }
    }
    const reviewWorkbenchMount = llmWikiPanel.createDiv({ attr: { class: "knowledge-review-workbench-mount" } });
    knowledgeReviewWorkbench = window.KnowledgeExplorerController.mountKnowledgeReviewWorkbench({
      app: appRef,
      Modal: obsidianRef.Modal,
      container: reviewWorkbenchMount,
      items: reviewItems(),
      onOpenSource: (source) => P.openBeside(appRef, String(source.locator || "").split("#")[0]),
      onEditSource: openSourceForEdit,
      resolveSourcePreview,
      onOpenRelated: (targetPath) => P.openBeside(appRef, targetPath),
      onPlanToggle: (item) => dispatchDocumentPlanAction({
        action: "toggle_page",
        page_id: item.plan_page_id,
        expected_plan_hash: item.plan_hash,
      }),
      onPlanRename: (item, proposal) => dispatchDocumentPlanAction({
        action: "rename_page",
        page_id: item.plan_page_id,
        expected_plan_hash: item.plan_hash,
        title: proposal.suggested_title,
        purpose: proposal.suggested_purpose,
      }),
      onPlanApprove: () => compileDocumentPlan(),
      onPlanMerge: (pageIds) => mergeSelectedDocumentPages(pageIds),
      actions: {
        onSaveThought: ({ text, sources }) => window.KnowledgeFleetingStore.saveThought(appRef, { text, sources }),
        onCompleteFromCache: () => ({ ok: true, provider_count: 0 }),
        onApproveCanonical: () => ({ ok: false, reason: "canonical_packet_required" }),
        onApproveObject: () => ({ ok: false, reason: "object_handoff_apply_unavailable" }),
        onRetryReview: ({ review_id }) => typeof llmWikiControllerOptions.onReviewRetry === "function"
          ? llmWikiControllerOptions.onReviewRetry({ review_id })
          : dispatchLifecycleAction({ action: "reload", source_id: review_id }),
      },
    });
    const llmWikiReadService = window.LLMWikiWikiReadService.create({
      adapter: window.LLMWikiWikiReadAdapter,
      registry: window.KnowledgeExplorerRegistry,
      readBody: (request) => P.readSelectedNote(appRef, dvRef, request && request.path),
      collectSnapshot: async () => ({
        assets: dataSource.index(P.collectRecords(dataSource, dvRef)).assets,
        candidates: await window.KnowledgeCandidateStore.listCandidates(appRef, { status: "active" }),
        registry: window.KnowledgeExplorerRegistry
      })
    });
    if (losslessDataSource && losslessView) {
      const losslessEntry = llmWikiPanel.createDiv({ cls: "llmwiki-lossless-entry", attr: { "data-lossless-corpus-entry": "" } });
      losslessEntry.createEl("h3", { text: "무손실 장문 위키" });
      losslessEntry.createEl("p", { text: "원문 정보를 축소하지 않은 색인·주제·상세 문서를 탐색합니다." });
      try {
        const corpora = await losslessDataSource.list();
        for (const corpus of corpora) {
          const button = losslessEntry.createEl("button", { text: `${corpus.source_path.split("/").pop().replace(/\.md$/u, "")} · claim ${corpus.claims}개`,
            attr: { type: "button", "data-action": "open-lossless-corpus", "data-source-path": corpus.source_path } });
          button.onclick = () => losslessView.open(corpus.source_path);
        }
      } catch (error) {
        losslessEntry.createEl("p", { text: `무손실 위키를 불러오지 못했습니다: ${error?.message || "unknown_error"}`, attr: { role: "status" } });
      }
    }
    llmWikiWikiSurface = window.LLMWikiWikiSurface.mountLlmWikiWikiSurface({
      app: appRef,
      obsidian: obsidianRef,
      container: browsePanel,
      readAdapter: window.LLMWikiWikiReadAdapter,
      readService: llmWikiReadService,
      collectSnapshot: async () => ({
        assets: dataSource.index(P.collectRecords(dataSource, dvRef)).assets,
        candidates: await window.KnowledgeCandidateStore.listCandidates(appRef, { status: "active" }),
        registry: window.KnowledgeExplorerRegistry
      }),
      onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath)
    });
    llmWikiSession.bindings.wikiSurface = llmWikiWikiSurface;
    goldenPreviewWorkbench = window.LLMWikiGoldenPreviewWorkbench && window.LLMWikiGoldenPreviewWorkbench.mount({
      container: browsePanel,
      rows: goldenPreviewRows,
      reviewed: goldenPreviewReviewed,
      onOpen: (targetPath) => P.openBeside(appRef, targetPath),
      onReviewed: (row) => {
        KnowledgeExplorerHub.lastGoldenPreviewReview = Object.freeze({
          preview_id: row.preview_id,
          document_path: row.document_path,
          receipt_hash: row.receipt_hash,
          reviewed_at: new Date().toISOString(),
          boundary: "human_review_only",
        });
      },
    });
    if (goldenPreviewWorkbench) KnowledgeExplorerHub.goldenPreviewSnapshot = () => goldenPreviewWorkbench.snapshot();
    if (mountContext && mountContext.scope && typeof mountContext.scope.track === "function") {
      mountContext.scope.track(() => {
        if (llmWikiSession.bindings.wikiSurface === llmWikiWikiSurface) llmWikiSession.bindings.wikiSurface = null;
      });
    }

    // --- Active maintenance scheduling: real production start edge ---
    // Reads real Knowledge state through a snapshot provider (overridable via
    // KnowledgeExplorerHub.maintenanceSnapshotProvider for deterministic tests),
    // scans read-only, feeds actionable proposals through the quiet notification
    // policy, and surfaces any notice into a single in-flow badge inside
    // #knowledge-panel-llmwiki. Started exactly once per mount; disposed on
    // mount-scope teardown. Never mutates canonical knowledge.
    const buildMaintenanceSnapshot = KnowledgeExplorerHub.maintenanceSnapshotProvider || (() => {
      try {
        const assets = dataSource.index(P.collectRecords(dataSource, dvRef)).assets || [];
        const sourceIds = (row) => (Array.isArray(row && row.source_ids) && row.source_ids.length ? row.source_ids : (row && row.path ? [String(row.path)] : []));
        const idSeed = assets.map((row) => String((row && row.path) || "")).sort();
        const snapshotRevision = (window.LLMWikiHash && typeof window.LLMWikiHash.sha256 === "function")
          ? window.LLMWikiHash.sha256(JSON.stringify(idSeed))
          : String(idSeed.length);
        const canonicalDocuments = assets.map((row, index) => ({
          document_id: String((row && row.path) || "knowledge_asset_" + index),
          canonical_revision: snapshotRevision,
          source_ids: sourceIds(row)
        }));
        const brandL = window.LLMWikiKnowledgeLifecycle && window.LLMWikiKnowledgeLifecycle.createMaintenanceSnapshot;
        const brandR = window.LLMWikiRetrievalService && window.LLMWikiRetrievalService.createMaintenanceRetrievalRecord;
        const brandE = window.LLMWikiEvidenceContract && window.LLMWikiEvidenceContract.createMaintenanceEvidenceRecord;
        if (!brandL || !brandR || !brandE) return null;
        const l = brandL(JSON.stringify({ snapshot_revision: snapshotRevision, current_revision: snapshotRevision, canonical_documents: canonicalDocuments, triggers: [], feedback: [] }));
        const r = brandR(JSON.stringify({ snapshot_revision: snapshotRevision, candidates: canonicalDocuments.map((row) => ({ document_id: row.document_id, canonical_revision: row.canonical_revision })), denied_source_ids: [], hint_status: "advisory" }));
        const e = brandE(JSON.stringify({ snapshot_revision: snapshotRevision, records: [] }));
        if (!(l && l.ok && r && r.ok && e && e.ok)) return null;
        return { lifecycle: l.value, retrieval: r.value, evidence: e.value };
      } catch (_error) { return null; }
    });
    const injectedMaintenanceSchedule = typeof KnowledgeExplorerHub.maintenanceSchedule === "function"
      ? KnowledgeExplorerHub.maintenanceSchedule : null;
    const maintenanceSchedule = (onDue) => {
      if (injectedMaintenanceSchedule) {
        try {
          const stop = injectedMaintenanceSchedule(onDue);
          return typeof stop === "function" ? stop : () => {};
        } catch (_error) { return () => {}; }
      }
      if (typeof onDue === "function") { try { onDue(0); } catch (_error) { /* best-effort */ } } // deterministic initial scan on mount
      return () => {}; // state re-scans are driven by pokeMaintenance at lifecycle update sites
    };
    let maintenanceFollower = null;
    try {
      if (window.LLMWikiMaintenanceFollower && window.LLMWikiMaintenanceService && window.LLMWikiNotificationPolicy) {
        maintenanceFollower = window.LLMWikiMaintenanceFollower.create({
          maintenance: window.LLMWikiMaintenanceService,
          policyModule: window.LLMWikiNotificationPolicy,
          clock: (typeof KnowledgeExplorerHub.maintenanceClock === "function" ? KnowledgeExplorerHub.maintenanceClock : () => Date.now()),
          snapshots: buildMaintenanceSnapshot,
          schedule: maintenanceSchedule,
          surface: window.LLMWikiMaintenanceFollower.defaultNoticeSurface(llmWikiPanel)
        });
        maintenanceFollower.start();
        maintenanceTicker = () => { if (maintenanceFollower) { try { maintenanceFollower.tick(Date.now()); } catch (_error) { /* best-effort */ } } };
        if (mountContext && mountContext.scope && typeof mountContext.scope.track === "function") {
          mountContext.scope.track(() => {
            if (maintenanceFollower) { try { maintenanceFollower.dispose(); } catch (_error) { /* best-effort */ } }
            maintenanceFollower = null;
            maintenanceTicker = null;
          });
        }
        KnowledgeExplorerHub.maintenanceFollower = maintenanceFollower;
      }
    } catch (_error) { /* active maintenance scheduling is best-effort and non-fatal */ }

    KnowledgeExplorerHub.api = api;
    KnowledgeExplorerHub.tabs = tabs;
    if (KnowledgeExplorerHub._pendingFocus === "candidate-review") {
      KnowledgeExplorerHub._pendingFocus = "";
      tabs.select("zettelkasten");
      focusCandidateReview();
    }
    KnowledgeExplorerHub.model = model;
    KnowledgeExplorerHub.paraModel = paraModel;
    const inboxRef = appRef.vault.on && appRef.vault.on("create", (file) => {
      if (file && typeof file.path === "string" && file.path.startsWith("INBOX/") && !file.path.startsWith("INBOX/Processed/") && file.path.endsWith(".md")) refreshInboxViewFromQueue();
    });
    if (inboxRef && mountContext.scope && typeof mountContext.scope.track === "function") mountContext.scope.track(() => appRef.vault.offref && appRef.vault.offref(inboxRef));
    refreshInboxViewFromQueue();
    KnowledgeExplorerHub.fleetingReviewService = fleetingReviewService;
    KnowledgeExplorerHub.refreshFleetingReview = refreshFleetingSurface;
    KnowledgeExplorerHub.whenKnowledgeInboxSettled = () => inboxSettled;
    KnowledgeExplorerHub.llmWikiRunController = llmWikiRunController;
    KnowledgeExplorerHub.llmWikiLifecycle = llmWikiLifecycle;
    KnowledgeExplorerHub.dispatchLlmWikiAction = dispatchLifecycleAction;
    KnowledgeExplorerHub.llmWikiLifecycleSnapshot = lifecycleSnapshot;
    KnowledgeExplorerHub.llmWikiBrowse = llmWikiWikiSurface;
    KnowledgeExplorerHub.dataSource = dataSource;
    KnowledgeExplorerHub.llmWikiProductionMeasurements = () => {
      const lifecycle = llmWikiPanel.querySelector && llmWikiPanel.querySelector('[data-surface="llmwiki-lifecycle"]');
      const candidates = [mountPoint.closest && mountPoint.closest(".markdown-preview-view"), shell.root || shell.container, shell.body, lifecycle].filter(Boolean);
      const rows = candidates.map((node) => {
        const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : { overflowY: "visible" };
        return { class_name: String(node.className || ""), surface: node.getAttribute && node.getAttribute("data-surface"), overflow_y: style.overflowY, scroll_height: Number(node.scrollHeight || 0), client_height: Number(node.clientHeight || 0) };
      });
      return { scope: "active_llmwiki_lifecycle_scene", effective_vertical_owners: rows.filter((row) => ["auto", "scroll"].includes(row.overflow_y) && row.scroll_height > row.client_height).length, rows };
    };
    endMeasurement("dom_render", domRenderToken, { scope: "knowledge", status: "rendered" });
    const readinessSnapshot = shell && typeof shell.readinessSnapshot === "function"
      ? shell.readinessSnapshot("knowledge", {
          status: "deterministic",
          settled: true,
          enabledAction: { id: "knowledge.open", enabled: true }
        })
      : null;
    if (performance && readinessSnapshot) performance.markReady("knowledge", readinessSnapshot);
    return api;
  } catch (error) {
    if (mountContext && mountContext.scope && typeof mountContext.scope.dispose === "function") mountContext.scope.dispose();
    endMeasurement("data_scan", dataScanToken, { scope: "knowledge", status: "failed" });
    endMeasurement("projection", projectionToken, { scope: "knowledge", status: "failed" });
    endMeasurement("dom_render", domRenderToken, { scope: "knowledge", status: "failed" });
    if (performance && typeof performance.fail === "function") {
      performance.fail(error, { phase: "error", scope: "knowledge" });
    }
    KnowledgeExplorerHub.error = error;
    if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
      window.ProdigyWorkspaceNavigation.renderLoaderError(mountPoint, error, { title: "지식", message: "지식 탐색기를 불러오지 못했습니다.", retry });
    } else {
      mountPoint.empty();
      mountPoint.createEl("p", { text: "지식 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
    }
    return null;
  }
};

KnowledgeExplorerHub.openBeside = (targetPath) => {
  const P = window.KnowledgeExplorerHubProjection;
  return P ? P.openBeside(app, targetPath) : null;
};
KnowledgeExplorerHub.collectRecords = () => {
  const P = window.KnowledgeExplorerHubProjection;
  return P ? P.collectRecords(KnowledgeExplorerHub.dataSource, dv) : [];
};

if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
if (!window.ProdigyHubLoader || window.ProdigyHubLoader.version !== 2) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
const manifest = window.ProdigyWorkspaceManifest.get("knowledge");
try {
  await window.ProdigyHubLoader.mountWorkspace(app, manifest, {
    container: this.container,
    renderers: {
      knowledge: (mountContext) => KnowledgeExplorerHub.render({ app, dv, container: this.container, obsidian, mountContext })
    }
  });
} catch (error) {
  const preservesRequiredRecovery = window.ProdigyHubLoader && typeof window.ProdigyHubLoader.preserveRequiredRecovery === "function" && window.ProdigyHubLoader.preserveRequiredRecovery(error, this.container);
  if (!preservesRequiredRecovery) {
    KnowledgeExplorerHub.error = error;
    if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
      window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "지식", retry: error.retry });
    }
  }
}
```
