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
          selectedSource: null,
          selectedRunCommand: null,
          sourceOptions: [],
          startupStatus: null,
          startupFailure: "",
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
    if (!P || !window.KnowledgeExplorerRegistry || !window.KnowledgeAuthoringHubAdapter || !window.KnowledgeExplorerCore || !window.KnowledgeExplorerDataSource || !window.KnowledgeExplorerRelations || !window.KnowledgeExplorerHubAdapter || !window.KnowledgeExplorerBriefService || !window.KnowledgeExplorerBriefRender || !window.KnowledgeExplorerView || !window.LLMWikiRunController || !window.LLMWikiCompensationService || !window.LLMWikiLifecycleView || !window.LLMWikiProviderResponseSchema || !window.LLMWikiSourceRegistry || !window.LLMWikiSourceAdapters || !window.LLMWikiMigrationRollout || !window.LLMWikiInboxPrivacyBoundary || !window.LLMWikiAnalysisScope || !window.LLMWikiChunkManifest || !window.LLMWikiChunkCoverageStore || !window.LLMWikiAnalysisCache || !window.LLMWikiIdentityResolution || !window.LLMWikiLifecycleRoutingContract || !window.LLMWikiDocumentAssembler || !window.LLMWikiInboxProposalMaterializer || !window.LLMWikiIncrementalAnalysisState || !window.LLMWikiWikiReadAdapter || !window.LLMWikiWikiReadService || !window.LLMWikiWikiSurface || !window.KnowledgeCommandController || !window.KnowledgeExplorerDetailModal || !window.KnowledgeExplorerController || !window.KnowledgeFleetingStore || !window.KnowledgeFleetingReviewState || !window.LLMWikiCanonicalTrust || !window.LLMWikiLifecycleMigrationFlows || !window.LLMWikiGitGateway || !window.LLMWikiBatchAnalyzer || !window.LLMWikiBatchProvider || !window.LLMWikiBatchJobStore || !window.LLMWikiInboxDiscoveryQueue || !window.LLMWikiBatchApprovalAdapter || !window.LLMWikiProcessedSourceService || !window.LLMWikiAnalysisCache || !window.LLMWikiChunkCoverageStore) {
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
    let selectedSource = llmWikiSession.viewState.selectedSource || null;
    let sourceOptions = Array.isArray(llmWikiSession.viewState.sourceOptions) ? llmWikiSession.viewState.sourceOptions : [];
    let startupFailure = llmWikiSession.viewState.startupFailure || "";
    let providerSelectionFailure = llmWikiSession.viewState.providerSelectionFailure || "";
    let startupStatus = llmWikiSession.viewState.startupStatus || null;
    let selectedRunCommand = llmWikiSession.viewState.selectedRunCommand || null;
    const persistLlmWikiSessionView = () => {
      llmWikiSession.viewState = {
        ...llmWikiSession.viewState,
        selectedProviderMode,
        selectedSource,
        selectedRunCommand,
        sourceOptions,
        startupStatus,
        startupFailure,
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
    const eligibleSources = async () => {
      const files = appRef && appRef.vault && typeof appRef.vault.getMarkdownFiles === "function" ? appRef.vault.getMarkdownFiles() : [];
      const options = [];
      for (const file of files) {
        if (!file || typeof file.path !== "string" || !file.path.startsWith("ZETA/LITERATURE/") || !file.path.endsWith(".md")) continue;
        try {
          const source = await window.KnowledgeSourceStore.readSource(appRef, file.path);
          const sensitivity = String(source.sensitivity || source.source_kind || "").trim();
          const body = String(source.body || "").trim();
          if (!validSourceId(source.source_id) || !["public", "synthetic"].includes(sensitivity) || !/^https?:\/\//u.test(String(source.source_url || "")) || !body) continue;
          options.push(Object.freeze({ path: file.path, title: String(source.source_title || file.basename || file.path).trim(), source_id: source.source_id, content_hash: llmWikiHash.sha256(body) }));
        } catch (_error) {}
      }
      return options.sort((left, right) => left.title.localeCompare(right.title, "ko"));
    };
    const resolveProvider = (mode) => window.ProdigyConfigService.resolveAIProfileProviderKey(llmWikiSession.bindings.config, "llmwiki", mode);
    // Task 11 cutover: selected-source/Literature runs enter the same canonical
    // one-source batch as INBOX runs. No librarian pipeline, no second transport.
    const defaultBatchCommand = async (sourcePath) => {
      const option = sourceOptions.find((item) => item.path === sourcePath);
      if (!option) return null;
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
        await appRef.vault.modify(file, JSON.stringify({ schema_version: 2, jobs: {}, packs: {}, legacy: [], recovery: null }));
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
    const compactArtifactsFromHits = (hits) => hits.map((hit) => Object.freeze({
      chunk_key: hit.artifact.semantic_id,
      outcome: hit.artifact.outcome,
      // Provider artifacts carry string claims; the local materializer contract
      // carries typed { text } claims. Pure local mapping, no authority change.
      items: JSON.parse(JSON.stringify(hit.artifact.items)).map((item) => ({ ...item, claims: (item.claims || []).map((claim) => typeof claim === "string" ? { text: claim } : claim) })),
    }));
    // One canonical composition: analyzer artifacts -> local materialization ->
    // typed lifecycle proposals. Zero writes; approval stays on the retained
    // controller surface.
    const runCanonicalBatch = async ({ sources, candidates = [], signal, explicitRetry = false, retryIntentId = null }) => {
      if (!batchAnalyzer) return { ok: false, reason: "provider_selection_unavailable", provider_calls: 0 };
      const analyzed = await batchAnalyzer.analyze({ sources, candidates, signal, explicit_retry: explicitRetry, ...(retryIntentId ? { retry_intent_id: retryIntentId } : {}) });
      const providerCalls = analyzed.metrics ? analyzed.metrics.provider_calls : 0;
      if (!analyzed.ok || analyzed.state !== "review_ready") return { ok: false, reason: analyzed.reason || analyzed.state || "batch_analysis_failed", provider_calls: providerCalls, job_id: analyzed.job_id, batch_id: analyzed.batch_id };
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
        const artifacts = compactArtifactsFromHits(lookup.hits);
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
    const configuredRelatedCandidates = Array.isArray(llmWikiControllerOptions.relatedCandidates) ? llmWikiControllerOptions.relatedCandidates : [];
    const configuredAllowedCandidateIds = Array.isArray(llmWikiControllerOptions.allowedCandidateIds) ? llmWikiControllerOptions.allowedCandidateIds : [];
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
    const DOCUMENT_REVIEW_CONTRACT = window.LLMWikiDocumentAssembler.CONTRACT_VERSION;
    const repacketLegacyDocumentReview = async () => {
      if (!durableRecovery?.review?.proposals?.length || durableRecovery.review.document_contract_version === DOCUMENT_REVIEW_CONTRACT) {
        return { ok: true, status: "not_required", provider_calls: 0 };
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
        ...(providerSelectionFailure ? { provider_selection_error: providerSelectionFailure } : {}),
        ...(selectedSource ? { source_selection: { selected: true, display_name: selectedSource.title } } : {}),
        source_options: sourceOptions,
        ...(startupStatus ? { status: startupStatus } : {}),
        ...(startupFailure ? { status: "failed", reason: startupFailure } : {}),
        ...(durableProcessed && !startupFailure ? { status: "processed", reason: "" } : {}),
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
        startupFailure = "";
        return { ok: true, status: llmWikiRunController.getSnapshot().status, provider_mode: selectedProviderMode };
      }
      if (intent.action === "set_provider") {
        return { ok: false, status: "failed", reason: "action_unavailable" };
      }
      if (intent.action === "select_source" && !intent.source_path) {
        sourceOptions = await eligibleSources();
        startupStatus = "selecting";
        startupFailure = sourceOptions.length ? "" : "선택할 수 있는 Literature 자료가 없습니다. ZETA/LITERATURE의 공개 자료를 확인해 주세요.";
        return { ok: sourceOptions.length > 0, status: "selecting", source_options: sourceOptions };
      }
      if (intent.action === "select_source") {
        sourceOptions = sourceOptions.length ? sourceOptions : await eligibleSources();
        const option = sourceOptions.find((item) => item.path === intent.source_path);
        if (!option) {
          startupStatus = "selecting";
          startupFailure = "선택한 Literature 자료를 확인할 수 없습니다. 목록에서 다시 선택해 주세요.";
          return { ok: false, status: "selecting", reason: "unknown_source" };
        }
        selectedSource = option;
        selectedRunCommand = null;
        startupStatus = "selecting";
        startupFailure = "";
        return { ok: true, status: "selecting", source: option };
      }
      if (!["request_consent", "start_run"].includes(intent.action)) return { ok: false, status: "failed", reason: "action_unavailable" };
      if (!selectedSource) {
        startupStatus = "selecting";
        startupFailure = "먼저 Literature 자료를 하나 선택해 주세요.";
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
      const command = selectedRunCommand || await defaultBatchCommand(selectedSource.path);
      if (!command) {
        startupStatus = "selecting";
        startupFailure = "선택한 자료 또는 AI 제공자 설정을 확인해 주세요.";
        return { ok: false, status: "selecting", reason: "startup_command_unavailable" };
      }
      selectedRunCommand = command;
      KnowledgeExplorerHub.llmWikiSelectedRunCommand = command;
      providerSelectionFailure = "";
      startupFailure = "";
      startupStatus = null;
      return llmWikiRunController.startRun({ ...command, explicit_user_consent: intent.action === "start_run" });
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
            claim_set: { claims, citations, disputes: [] },
            coverage: { complete: sources.length > 0, status: sources.length > 0 ? "완료" : "확인 필요" },
          };
        });
      const objectRows = Array.isArray(inboxState.object_review_proposals) ? inboxState.object_review_proposals
        .filter((proposal) => proposal && typeof proposal.handoff_id === "string" && proposal.target)
        .map((proposal) => ({ review_id: proposal.handoff_id, destination: "para_object", review_state: "pending", analysis_state: "complete", title: proposal.text || proposal.knowledge && proposal.knowledge.path || "PARA 전달", object_handoff: { handoff_id: proposal.handoff_id, target_path: proposal.target.path, target_revision: proposal.before && proposal.before.revision || "", before_bytes: proposal.before && proposal.before.bytes || "", before_diff: proposal.text ? [{ kind: "add", line: proposal.text }] : proposal.knowledge && proposal.knowledge.link ? [{ kind: "add", line: proposal.knowledge.link }] : [] } })) : [];
      const queued = inboxState && ["queued", "analyzing"].includes(inboxState.state) && /^[a-z][a-z0-9_-]{2,127}$/u.test(String(inboxState.source_id || ""))
        ? [{ review_id: inboxState.source_id, destination: "none", review_state: "pending", analysis_state: inboxState.state === "analyzing" ? "running" : "queued", title: inboxState.current_title || "분석 대기" }] : [];
      return [...configured, ...fleetingRows, ...candidateRows, ...packetRows, ...objectRows, ...queued].filter((item, index, rows) => item && typeof item.review_id === "string" && /^[a-z][a-z0-9_-]{2,127}$/u.test(item.review_id) && rows.findIndex((row) => row && row.review_id === item.review_id) === index);
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
      if (!["approve_risk", "reject_risk", "approve_risk_batch", "request_risk_revision"].includes(intent.action)) llmWikiLifecycle.update(lifecycleSnapshot());
      refreshReviewWorkbench();
      pokeMaintenance();
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
      persistLlmWikiSessionView();
      KnowledgeExplorerHub.lastLlmWikiAction = { intent, response };
      llmWikiLifecycle.update(lifecycleSnapshot());
      refreshReviewWorkbench();
      if (typeof llmWikiControllerOptions.onLifecycleAction === "function") llmWikiControllerOptions.onLifecycleAction({ intent, response });
      pokeMaintenance();
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
    const llmWikiLifecycleFrame = llmWikiPanel.createDiv({ attr: { class: "llmwiki-lifecycle-frame" } });
    llmWikiLifecycle = window.LLMWikiLifecycleView.mountLlmWikiLifecycleView({
      container: llmWikiLifecycleFrame,
      snapshot: lifecycleSnapshot(),
      onAction: dispatchLifecycleAction,
      requestRevisionGuidance,
      reviewView: window.LLMWikiRiskApprovalReviewView,
      reviewOptions: { onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath) }
    });
    const reviewWorkbenchMount = llmWikiPanel.createDiv({ attr: { class: "knowledge-review-workbench-mount" } });
    knowledgeReviewWorkbench = window.KnowledgeExplorerController.mountKnowledgeReviewWorkbench({
      app: appRef,
      Modal: obsidianRef.Modal,
      container: reviewWorkbenchMount,
      items: reviewItems(),
      onOpenSource: (source) => P.openBeside(appRef, String(source.locator || "").split("#")[0]),
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
