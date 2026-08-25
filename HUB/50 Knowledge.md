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
    if (!P || !window.KnowledgeExplorerRegistry || !window.KnowledgeAuthoringHubAdapter || !window.KnowledgeExplorerCore || !window.KnowledgeExplorerDataSource || !window.KnowledgeExplorerRelations || !window.KnowledgeExplorerHubAdapter || !window.KnowledgeExplorerBriefService || !window.KnowledgeExplorerBriefRender || !window.KnowledgeExplorerView || !window.LLMWikiRunController || !window.LLMWikiCompensationService || !window.LLMWikiLifecycleView || !window.LLMWikiProviderResponseSchema || !window.LLMWikiSourceRegistry || !window.LLMWikiSourceAdapters || !window.LLMWikiMigrationRollout || !window.LLMWikiInboxPrivacyBoundary || !window.LLMWikiProductionOperationProvider || !window.LLMWikiAnalysisScope || !window.LLMWikiChunkManifest || !window.LLMWikiChunkCoverageStore || !window.LLMWikiAnalysisCache || !window.LLMWikiInboxChunkOrchestrator || !window.LLMWikiIdentityResolution || !window.LLMWikiLifecycleRoutingContract || !window.LLMWikiInboxProposalMaterializer || !window.LLMWikiIncrementalAnalysisState || !window.LLMWikiInboxAutopilot || !window.LLMWikiWikiReadAdapter || !window.LLMWikiWikiReadService || !window.LLMWikiWikiSurface || !window.KnowledgeCommandController || !window.KnowledgeExplorerDetailModal || !window.KnowledgeExplorerController || !window.KnowledgeFleetingStore || !window.KnowledgeFleetingReviewState || !window.LLMWikiCanonicalTrust || !window.LLMWikiLifecycleMigrationFlows || !window.LLMWikiGitGateway) {
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
    const rolloutClosure = Object.freeze({
      path: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/final/completion-audit/final-confirmed/state-closure.json",
      sha256: "397d1eda1afaebe2eede3289ece2cd2c87f746bd6a3e434839d9d3b28bfb2713",
      auditPath: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/final/completion-audit/final-confirmed/completion-audit.json",
      auditSha256: "5f8bbddb785eb6164649aa92859b3f9bfc239733a0416e9dc1411e6731465546",
      phases: Object.freeze(["create", "update", "merge", "maintenance", "git", "resurfacing"]),
    });
    const defaultRolloutGateProvider = async (phase) => {
      if (!rolloutClosure.phases.includes(phase)) return null;
      const adapter = appRef && appRef.vault && appRef.vault.adapter;
      if (!adapter || typeof adapter.read !== "function" || !window.LLMWikiHash || typeof window.LLMWikiHash.sha256 !== "function") return null;
      let bytes;
      try { bytes = await adapter.read(rolloutClosure.path); } catch (_error) { return null; }
      if (typeof bytes !== "string" || window.LLMWikiHash.sha256(bytes) !== rolloutClosure.sha256) return null;
      let closure;
      try { closure = JSON.parse(bytes); } catch (_error) { return null; }
      const plan = closure && closure.plan;
      const audit = closure && closure.decisive_audit;
      const todo = closure && closure.todo;
      const gates = closure && closure.gates;
      const cleanup = closure && closure.cleanup;
      if (!closure || closure.schema !== "omo.start-work-state-closure/v1" || closure.event !== "plan-completed"
        || !plan || plan.completed !== 26 || plan.total !== 26 || plan.open !== 0 || plan.unchanged !== true
        || !audit || audit.path !== rolloutClosure.auditPath || audit.sha256 !== rolloutClosure.auditSha256 || audit.verdict !== "confirmed"
        || !todo || todo.open !== 0
        || !gates || !gates.full_llmwiki || gates.full_llmwiki.fail !== 0
        || !gates.F4 || gates.F4.verdict !== "confirmed" || !gates.F5 || gates.F5.verdict !== "confirmed"
        || !cleanup || cleanup.pass !== true || cleanup.resources_remaining !== 0) return null;
      return Object.freeze({ available: true, status: "green", receipt_id: `llmwiki-rollout:${phase}:${rolloutClosure.sha256}` });
    };
    const rolloutGateProvider = typeof llmWikiControllerOptions.rollout_gate_provider === "function"
      ? llmWikiControllerOptions.rollout_gate_provider : defaultRolloutGateProvider;
    let llmWikiConfig = await window.ProdigyConfigService.load(appRef);
    const configuredProviderOptions = async (config) => {
      const options = window.ProdigyConfigService.listAIProfileProviderOptions(config, "llmwiki", "direct");
      return Promise.all(options.map(async (option) => {
        const provider = config.providers && config.providers[option.provider_key];
        let configured = false;
        try { configured = await window.AIProviderService.isProviderConfigured(appRef, provider); } catch (_error) {}
        return Object.freeze({ ...option, configured });
      }));
    };
    let providerOptions = await configuredProviderOptions(llmWikiConfig);
    let selectedProviderMode = "direct";
    let selectedSource = null;
    let sourceOptions = [];
    let startupFailure = "";
    let providerSelectionFailure = "";
    let rolloutActivationFailure = "";
    let startupStatus = null;
    let selectedRunCommand = null;
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
    const productionOperationProvider = window.LLMWikiProductionOperationProvider.createProductionOperationProvider({ app: appRef, config: llmWikiConfig, getConfig: () => llmWikiConfig, getProviderMode: () => selectedProviderMode });
    const operationProvider = typeof llmWikiControllerOptions.operation_provider === "function" ? llmWikiControllerOptions.operation_provider : productionOperationProvider;
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
    const resolveProvider = (mode) => window.ProdigyConfigService.resolveAIProfileProviderKey(llmWikiConfig, "llmwiki", mode);
    const defaultRunCommand = async (sourcePath, providerMode) => {
      const option = sourceOptions.find((item) => item.path === sourcePath);
      const selectedProvider = resolveProvider(providerMode);
      if (!option || !selectedProvider || selectedProvider.ok !== true) return null;
      const source = await window.KnowledgeSourceStore.readSource(appRef, option.path);
      const body = String(source.body || "").trim();
      const contentHash = llmWikiHash.sha256(body);
      if (!body || contentHash !== option.content_hash || source.source_id !== option.source_id) return null;
      const now = new Date().toISOString();
      const runId = `run_${llmWikiHash.sha256(`${option.path}:${contentHash}`).slice(0, 24)}`;
      return {
        run_id: runId,
        sources: [{ selected: true, display_name: option.title, sensitivity: "public", confidence: "explicit", outbound_text: body, manifest: {
          source_id: option.source_id, content_hash: contentHash, requested_url: source.source_url, source_url: source.source_url,
          fetched_at: now, parser_version: "knowledge_literature_picker_v1", extracted_text_hash: contentHash,
          locator: option.path, refresh_revision: 1, raw_bytes: body,
          fetch_metadata: { requested_url: source.source_url, resolved_url: source.source_url, content_hash: contentHash }
        } }],
        source_scope: { allowed_source_ids: [option.source_id], allowed_locator_prefixes: ["ZETA/LITERATURE/"], allow_private_sources: false },
        retrieval: { query: option.title, mode: "literature", scope: { paths: ["ZETA/LITERATURE/"], types: ["literature_note"] }, snapshot: { snapshot_revision: contentHash, current_revision: contentHash, documents: [{ document_id: option.source_id, type: "literature_note", path: option.path, title: option.title, statement: body, source_ids: [option.source_id], citations: [{ source_id: option.source_id, locator: option.path }], updated: now, revision: contentHash }] } },
        proposal_request: { instruction: "선택한 Literature 자료만 근거로 create 제안을 만듭니다." },
        consent: { issued_at: now, nonce: `consent_${runId.slice(4)}_0001` },
        approval: { expires_at: new Date(Date.now() + 3600000).toISOString(), nonce: `approval_${runId.slice(4)}_0001` },
        advanced_settings: { provider_mode: providerMode, provider_key: selectedProvider.provider_key, timeout_ms: 60000 },
        canonical_defaults: { knowledge_domain: "reading", knowledge_topics: [], application_trigger: "선택한 자료를 사람이 승인할 때", application_contexts: ["reading"], connections: [], invalidation_conditions: ["선택 근거가 바뀌면 다시 검토한다."], summary: "" }
      };
    };
    const llmWikiTransport = async (normalized, requestOptions) => {
      const response = await window.LLMWikiAIProviderTransport.requestProposal({
        app: appRef,
        config: llmWikiConfig,
        normalized: { ...normalized, request_metadata: { ...(normalized.request_metadata || {}), provider_key: normalized.provider_key } },
        signal: requestOptions && requestOptions.signal,
        consent: requestOptions && requestOptions.consent,
        providerService: window.AIProviderService,
        validateProposalBundle: (bundle) => window.LLMWikiProposalBundle.validateProposalBundle(bundle),
        schema: window.LLMWikiProviderResponseSchema,
      });
      if (!response || response.ok !== true) {
        const error = new Error(response && response.message || "LLMWiki provider request failed.");
        error.code = response && response.code || "provider_unavailable";
        throw error;
      }
      return response.payload;
    };
    const rolloutStorage = llmWikiControllerOptions.rollout_storage || {
      async load() {
        try { return localStorage.getItem("prodigy.llmwiki.rollout-state.v1"); } catch (_error) { return null; }
      },
      async save(serialized) {
        try { localStorage.setItem("prodigy.llmwiki.rollout-state.v1", serialized); return true; } catch (_error) { throw new Error("rollout_persistence_unavailable"); }
      }
    };
    const llmWikiGitReceiptAuthority = window.LLMWikiOperationRunService.createPostEligibilityGitReceiptAuthority();
    const llmWikiGitService = window.LLMWikiGitAutomationAdapter.create({
      gateway: llmWikiControllerOptions.git_gateway || window.LLMWikiGitGateway,
      receiptAuthority: llmWikiGitReceiptAuthority,
    });
    const llmWikiRunController = window.LLMWikiRunController.createRunController({
      app: appRef,
      config: llmWikiConfig,
      transport: llmWikiTransport,
      enable_risk_review: true,
      operation_provider: operationProvider,
      operation_outcome_store: operationOutcomeStore,
      rollout_storage: rolloutStorage,
      rollout_gate_provider: rolloutGateProvider,
      migration_transaction_adapter: llmWikiControllerOptions.migration_transaction_adapter,
      migration_options: {
        ...(llmWikiControllerOptions.migration_options || {}),
        sourceAdapters: llmWikiControllerOptions.migration_source_adapters || window.LLMWikiSourceAdapters.createSourceAdapters(),
      },
      maintenance_action: llmWikiControllerOptions.maintenance_action,
      resurfacing_action: llmWikiControllerOptions.resurfacing_action,
      compensation_refresh: async () => {
        if (!llmWikiWikiSurface || typeof llmWikiWikiSurface.refresh !== "function") return { ok: false, reason: "refresh_surface_unavailable" };
        return llmWikiWikiSurface.refresh();
      },
      postEligibilityGitReceiptAuthority: llmWikiGitReceiptAuthority,
      postEligibilityGit: async (input) => {
        const receipt = llmWikiGitReceiptAuthority.mint(input);
        return llmWikiGitService.recordEligibleReceipt({ receipt, signal: input.signal });
      },
      operation_follow_ups: {
        async refresh() {
          if (!llmWikiWikiSurface || typeof llmWikiWikiSurface.refresh !== "function") return { ok: false, reason: "refresh_surface_unavailable" };
          try { await llmWikiWikiSurface.refresh(); return { ok: true }; } catch (_error) { return { ok: false, reason: "refresh_failed" }; }
        },
        async git(input) {
          return llmWikiGitService.recordEligibleReceipt({ receipt: input.trusted_receipt, guarded_entry: input.guarded_entry, signal: input.signal });
        }
      },
      ...llmWikiControllerOptions
    });
    await llmWikiRunController.initializeTask21();
    let inboxState = { state: "empty", total: 0, scanned_total: 0, eligible: 0, held: 0, processed: 0, succeeded: 0, failed: 0, current_path: "", current_title: "", source_id: "", reason: "", object_review_proposals: [] };
    let resolveInboxSettled = null;
    let inboxSettled = new Promise((resolve) => { resolveInboxSettled = resolve; });
    let inboxScanPromise = null;
    let inboxScanController = null;
    let inboxScanGeneration = 0;
    const inboxPrivacyDecisions = new Map();
    const inboxProposalMaterializer = window.LLMWikiInboxProposalMaterializer.createInboxProposalMaterializer({
      localIdentityIndex: Array.isArray(llmWikiControllerOptions.inboxLocalIdentityIndex) ? llmWikiControllerOptions.inboxLocalIdentityIndex : [],
      // Controller configuration is trusted local state. Copy it into this
      // Dataview realm before the Object resolver validates its exact records.
      localObjectIndex: Array.isArray(llmWikiControllerOptions.inboxLocalObjectIndex) ? JSON.parse(JSON.stringify(llmWikiControllerOptions.inboxLocalObjectIndex)) : [],
      localObjectRoutes: Array.isArray(llmWikiControllerOptions.inboxLocalObjectRoutes) ? llmWikiControllerOptions.inboxLocalObjectRoutes : [],
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
      return { ok: true, proposals: materialized.proposals, object_review_proposals };
    };
    const inboxRegistry = window.LLMWikiSourceRegistry.createSourceRegistry({ extractors: [
      { extractor_id: "extractor_markdown", extractor_version: "1.0.0", media_kinds: ["text/markdown"] },
      { extractor_id: "extractor_plain_text", extractor_version: "1.0.0", media_kinds: ["text/plain"] }
    ] });
    const inboxSourceAdapter = window.LLMWikiSourceAdapters.createSourceAdapters({ registry: inboxRegistry });
    const inboxIncrementalState = llmWikiControllerOptions.inboxIncrementalState
      || window.LLMWikiIncrementalAnalysisState.createIncrementalAnalysisState({ vault: appRef.vault });
    const inboxChunkOrchestrator = llmWikiControllerOptions.inboxChunkOrchestrator
      || window.LLMWikiInboxChunkOrchestrator.createInboxChunkOrchestrator({
        vault: appRef.vault,
        cache: llmWikiControllerOptions.inboxAnalysisCache,
        coverage: llmWikiControllerOptions.inboxChunkCoverageStore,
        proposals: llmWikiControllerOptions.inboxProposalStore,
      });
    KnowledgeExplorerHub.handoffCandidateToLlmWiki = async (candidate) => {
      tabs.select("llmwiki");
      const sourceInput = JSON.stringify({ source_kind: "knowledge_candidate", source_path: candidate.path, record: { ...candidate, type: "knowledge_candidate" } });
      const result = await llmWikiRunController.startMigrationDryRun({
        source_inputs: [sourceInput],
        classify: async (sourceSnapshot) => {
          const runId = `run_${sourceSnapshot.snapshot_id.replace(/^source_snapshot_/u, "")}`;
          const supplied = await operationProvider({ action: "candidate_handoff", run_id: runId, source_snapshot: sourceSnapshot, extracted_text: sourceSnapshot.content.text, outbound_allowed: true }, { signal: null });
          if (!supplied || supplied.ok === false) throw new Error(supplied && supplied.reason || "analysis_provider_unavailable");
          const providedOperation = supplied.operation || supplied;
          const parsed = window.LLMWikiOperationContract.isOperationRecord(providedOperation)
            ? { ok: true, value: providedOperation }
            : window.LLMWikiOperationContract.parseOperation(typeof providedOperation === "string" ? providedOperation : providedOperation && providedOperation.serialized_operation);
          if (!parsed || parsed.ok !== true) throw new Error(parsed && parsed.reason || "invalid_operation");
          return parsed.value;
        }
      });
      if (llmWikiLifecycle) llmWikiLifecycle.update(lifecycleSnapshot());
      return result;
    };
    const inboxAutopilot = window.LLMWikiInboxAutopilot.createInboxAutopilot({
      registry: inboxRegistry,
      sourceAdapter: inboxSourceAdapter,
      standingPolicy: {
        policy_version: "knowledge_inbox_policy_v1",
        provider_key: "direct",
        allowed_path_prefixes: ["INBOX/"],
        denied_path_prefixes: [],
        redaction_policy: "selected_source_text_only"
      },
      chunkOrchestrator: inboxChunkOrchestrator,
      analysisTransport: async (work) => {
        if (work.signal && work.signal.aborted) return { ok: false, reason: "provider_aborted" };
        if (typeof llmWikiControllerOptions.inboxAnalysisTransport === "function") return llmWikiControllerOptions.inboxAnalysisTransport(work, llmWikiRunController);
        const runId = `run_${work.snapshot.snapshot_id.replace(/^source_snapshot_/u, "")}`;
        const decision = inboxPrivacyDecisions.get(work.source_id);
        if (!decision || decision.outbound_allowed !== true) return { ok: false, reason: decision && decision.reason || "outbound_consent_required" };
        const supplied = await operationProvider({ action: "inbox_chunk_analysis", run_id: runId, changed_chunks: work.changed_chunks, outbound_allowed: true, external_research: 0, privacy_decision: decision.reason }, { signal: work.signal });
        if (work.signal && work.signal.aborted) return { ok: false, reason: "provider_aborted" };
        return supplied || { ok: false, reason: "analysis_provider_unavailable" };
      }
    });
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
          const extractedText = sourceBlocks.map((block) => `<!-- fleeting-block-id: ${block.block_id} -->\n## 생각 저장\n\n${block.text}`).join("\n\n");
          const contentHash = llmWikiHash.sha256(extractedText);
          const sourceId = `source_fleeting_${llmWikiHash.sha256(sourcePath).slice(0, 24)}`;
          const scope = window.LLMWikiAnalysisScope.createAnalysisScope({ source_id: sourceId, source_path: sourcePath, content_hash: contentHash, source_text: extractedText });
          const authority = window.LLMWikiAnalysisScope.createAnalysisRequestAuthority();
          const request = authority.begin(scope);
          const analyzed = await inboxChunkOrchestrator.analyze({
            source_id: sourceId,
            source_path: sourcePath,
            content_hash: contentHash,
            snapshot: { snapshot_id: `snapshot_${contentHash.slice(0, 24)}` },
            extracted_text: extractedText,
            authority,
            request,
            signal,
            provider: (work) => typeof llmWikiControllerOptions.fleetingAnalysisTransport === "function"
              ? llmWikiControllerOptions.fleetingAnalysisTransport(work, llmWikiRunController)
              : operationProvider({ action: "fleeting_review", run_id: `run_fleeting_${contentHash.slice(0, 24)}`, changed_chunks: work.changed_chunks, outbound_allowed: true, external_research: 0 }, { signal }),
          });
          if (!analyzed || analyzed.ok !== true) return { ok: false, reason: analyzed && analyzed.reason || "fleeting_analysis_failed", completed_block_ids: completedBlockIds, reviews };
          const source = { source_id: sourceId, source_path: sourcePath, content_hash: contentHash };
          const materialized = await materializeInboxProposals({ artifacts: analyzed.artifacts, source });
          if (!materialized.ok) return { ok: false, reason: materialized.reason || "local_materialization_failed", completed_block_ids: completedBlockIds, reviews };
          proposals.push(...materialized.proposals);
          for (const proposal of materialized.proposals) reviews.push({
            review_id: proposal.operation.operation_id,
            destination: proposal.decision.destination,
            title: proposal.title,
            proposal_input: { artifacts: analyzed.artifacts, source },
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
    const publishInbox = (next) => {
      inboxState = { ...next };
      if (typeof llmWikiLifecycle !== "undefined" && llmWikiLifecycle) llmWikiLifecycle.update(lifecycleSnapshot());
      if (typeof knowledgeReviewWorkbench !== "undefined" && knowledgeReviewWorkbench) knowledgeReviewWorkbench.update({ items: reviewItems() });
      pokeMaintenance();
      if (typeof llmWikiControllerOptions.onInboxState === "function") llmWikiControllerOptions.onInboxState({ ...inboxState });
      return { ok: true, status: inboxState.state, inbox: { ...inboxState } };
    };
    const settleInbox = (state) => {
      publishInbox(state);
      if (resolveInboxSettled) { resolveInboxSettled({ ...inboxState }); resolveInboxSettled = null; }
      return { ...inboxState };
    };
    const inboxMetadata = (file) => appRef.metadataCache && typeof appRef.metadataCache.getFileCache === "function"
      ? appRef.metadataCache.getFileCache(file)?.frontmatter || {} : {};
    const serializeInboxFile = async ({ file, decision }) => {
      const body = await appRef.vault.cachedRead(file);
      const analysisText = body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "");
      const sourceId = `source_${llmWikiHash.sha256(file.path).slice(0, 24)}`;
      const contentHash = llmWikiHash.sha256(analysisText);
      const input = JSON.stringify({ source_id: sourceId, source_path: file.path, modified_revision: contentHash, media_kind: "text/markdown", source_kind: "markdown", source_text: analysisText, text: analysisText, content_hash: contentHash, route_hint: decision.route, privacy_class: decision.privacy_class, provider_eligibility: decision.provider_eligibility });
      inboxPrivacyDecisions.set(sourceId, decision);
      const scope = window.LLMWikiAnalysisScope.createAnalysisScope({ source_id: sourceId, source_path: file.path, content_hash: contentHash, source_text: analysisText });
      return { source_id: sourceId, source_path: file.path, content_hash: contentHash, scope, input };
    };
    const scanInbox = (scanOptions = {}) => {
      if (inboxScanPromise && inboxScanController && !inboxScanController.signal.aborted) return inboxScanPromise;
      const forceAnalysis = scanOptions && scanOptions.force === true;
      const scanGeneration = inboxScanGeneration + 1;
      const scanController = new AbortController();
      inboxScanGeneration = scanGeneration;
      inboxScanController = scanController;
      inboxSettled = new Promise((resolve) => { resolveInboxSettled = resolve; });
      const activePromise = (async () => {
        const files = (appRef.vault.getMarkdownFiles ? appRef.vault.getMarkdownFiles() : [])
          .filter((file) => file && typeof file.path === "string" && file.path.startsWith("INBOX/") && file.path.endsWith(".md"))
          .sort((left, right) => left.path.localeCompare(right.path, "ko"));
        const classified = files.map((file) => {
          const decision = window.LLMWikiInboxPrivacyBoundary.classifyInboxSource({ source_path: file.path, metadata: inboxMetadata(file) });
          return { file, decision, title: file.path.split("/").pop() || "자료" };
        });
        const eligibleFiles = classified.filter(({ decision }) => decision.outbound_allowed === true);
        const discovery = { total: files.length, scanned_total: files.length, eligible: eligibleFiles.length, held: files.length - eligibleFiles.length, pending: 0, unchanged: 0, processed: 0, succeeded: 0, failed: 0, current_path: "", current_title: "", source_id: "", reason: "", message: "" };
        if (eligibleFiles.length === 0) {
          const state = settleInbox({ ...discovery, state: files.length ? "protected" : "empty" });
          return { ok: true, status: state.state, total: files.length, results: [] };
        }
        const preparedEntries = [];
        const resumedArtifacts = [];
        const resumedReviewProposals = [];
        const resumedObjectReviewProposals = [];
        let proposalRecoveryReason = "";
        let unchanged = 0;
        for (const entry of eligibleFiles) {
          const prepared = await serializeInboxFile(entry);
          const completed = !forceAnalysis && await inboxIncrementalState.isCompleted(prepared);
          if (completed) {
            unchanged += 1;
            const manifest = window.LLMWikiChunkManifest.createChunkManifest(prepared.scope);
            const restored = await inboxChunkOrchestrator.proposals.read(manifest);
            if (!restored.ok) proposalRecoveryReason = restored.reason || "corrupt_proposals_quarantined";
            else {
              resumedArtifacts.push(...restored.artifacts);
              const materialized = await materializeInboxProposals({ artifacts: restored.artifacts, source: prepared });
              if (!materialized.ok) proposalRecoveryReason = materialized.reason || "local_materialization_failed";
              else { resumedReviewProposals.push(...materialized.proposals); resumedObjectReviewProposals.push(...materialized.object_review_proposals); }
            }
          } else preparedEntries.push({ entry, prepared });
        }
        const base = { ...discovery, pending: preparedEntries.length, unchanged, proposal_pending: resumedArtifacts.length, proposal_complete: resumedArtifacts.length, proposal_blocked: 0, proposal_state: resumedArtifacts.length ? "resumable" : "empty" };
        if (preparedEntries.length === 0) {
          if (proposalRecoveryReason) {
            const state = settleInbox({ ...base, state: "blocked", proposal_blocked: resumedArtifacts.length || unchanged, proposal_state: "blocked", reason: proposalRecoveryReason });
            return { ok: false, status: state.state, total: files.length, results: [] };
          }
          if (resumedReviewProposals.length > 0 || resumedObjectReviewProposals.length > 0) {
            if (resumedReviewProposals.length > 0) {
              const runId = `run_inbox_${llmWikiHash.sha256(resumedReviewProposals.map((proposal) => proposal.operation.operation_id).sort().join(":" )).slice(0, 24)}`;
              const opened = llmWikiRunController.openPreparedRiskReview({ run_id: runId, proposals: resumedReviewProposals });
              if (!opened || opened.ok !== true) {
                const state = settleInbox({ ...base, state: "blocked", proposal_blocked: resumedReviewProposals.length, proposal_state: "blocked", reason: opened && opened.reason || "risk_review_unavailable" });
                return { ok: false, status: state.state, total: files.length, results: [] };
              }
            }
            const state = settleInbox({ ...base, state: "complete", proposal_pending: resumedReviewProposals.length + resumedObjectReviewProposals.length, proposal_complete: resumedArtifacts.length, proposal_state: "review", object_review_proposals: resumedObjectReviewProposals });
            return { ok: true, status: state.state, total: files.length, results: [] };
          }
          const state = settleInbox({ ...base, state: "up_to_date" });
          return { ok: true, status: state.state, total: files.length, results: [] };
        }
        publishInbox({ ...base, state: "queued" });
        const results = [];
        let succeeded = 0;
        let failed = 0;
        let failureReason = "";
        let failureMessage = "";
        const materializedProposals = [];
        const materializedObjectReviewProposals = [];
        const providerWideFailures = new Set([
          "analysis_failed",
          "analysis_provider_unavailable",
          "invalid_chunk_response",
          "analysis_state_write_failed",
          "configuration_unavailable",
          "provider_auth_required",
          "provider_quota_exhausted",
          "provider_tool_blocked",
          "provider_unavailable",
          "transport_unavailable",
        ]);
        for (const pendingEntry of preparedEntries) {
          if (scanController.signal.aborted || scanGeneration !== inboxScanGeneration) break;
          const { entry, prepared } = pendingEntry;
          const sourceId = prepared.source_id;
          publishInbox({ ...base, state: "analyzing", processed: results.length, succeeded, failed, current_path: entry.file.path, current_title: entry.title, source_id: sourceId });
          if (scanController.signal.aborted || scanGeneration !== inboxScanGeneration) break;
          let removeAbort = () => {};
          const aborted = new Promise((resolve) => {
            const onAbort = () => resolve({ ok: true, state: "cancelled", reason: "cancelled" });
            if (scanController.signal.aborted) onAbort();
            else {
              scanController.signal.addEventListener("abort", onAbort, { once: true });
              removeAbort = () => scanController.signal.removeEventListener("abort", onAbort);
            }
          });
          const dispatched = inboxAutopilot.dispatch(prepared.input, { signal: scanController.signal, force: forceAnalysis });
          const result = await Promise.race([dispatched, aborted]);
          removeAbort();
          if (scanController.signal.aborted || scanGeneration !== inboxScanGeneration) break;
          results.push(result);
          if (result && result.ok === true && result.state === "completed") {
            try {
              const analysis = result.analysis;
              await inboxIncrementalState.markCompleted({ scope: analysis.scope, manifest: analysis.manifest, coverage: analysis.coverage });
              const materialized = await materializeInboxProposals({ artifacts: analysis.artifacts, source: prepared });
              if (!materialized.ok) throw Object.assign(new Error(materialized.reason || "local_materialization_failed"), { code: "local_materialization_blocked" });
              materializedProposals.push(...materialized.proposals);
              materializedObjectReviewProposals.push(...materialized.object_review_proposals);
              succeeded += 1;
            } catch (error) {
              failed += 1;
              failureReason = error && error.code === "local_materialization_blocked" ? "local_materialization_blocked" : error && error.message === "local_materialization_required" ? "local_materialization_required" : "analysis_state_write_failed";
              failureMessage = "청크 분석 결과를 안전하게 저장하지 못해 자동 분석을 중단했습니다.";
              break;
            }
          }
          else if (!result || result.state !== "cancelled") {
            failed += 1;
            failureReason = result && typeof result.reason === "string" ? result.reason : "analysis_failed";
            failureMessage = result && typeof result.message === "string" ? result.message : "";
            if (providerWideFailures.has(failureReason)) break;
          }
        }
        if (scanController.signal.aborted || scanGeneration !== inboxScanGeneration) return { ok: false, status: "cancelled", total: files.length, results };
        if (failed === 0 && materializedProposals.length > 0) {
          const runId = `run_inbox_${llmWikiHash.sha256(materializedProposals.map((proposal) => proposal.operation.operation_id).sort().join(":" )).slice(0, 24)}`;
          const opened = llmWikiRunController.openPreparedRiskReview({ run_id: runId, proposals: materializedProposals });
          if (!opened || opened.ok !== true) { failed += materializedProposals.length; failureReason = opened && opened.reason || "risk_review_unavailable"; }
        }
        const finalState = failed === 0 ? "complete" : failureReason === "local_materialization_blocked" ? "blocked" : succeeded === 0 ? "error" : "partial";
        const state = settleInbox({ ...base, state: finalState, processed: results.length, succeeded, failed, proposal_pending: resumedArtifacts.length + succeeded, proposal_complete: resumedArtifacts.length + succeeded, proposal_blocked: failed, proposal_state: failed ? "blocked" : "resumable", reason: failed ? failureReason || "analysis_failed" : "", message: failed ? failureMessage : "", object_review_proposals: failed ? [] : materializedObjectReviewProposals });
        return { ok: failed === 0, status: state.state, total: files.length, results };
      })().finally(() => {
        if (scanGeneration === inboxScanGeneration) {
          inboxScanPromise = null;
          inboxScanController = null;
        }
      });
      inboxScanPromise = activePromise;
      return activePromise;
    };
    const startLlmWikiMigration = async (sourceInputs, action = "migration_dry_run") => {
      const result = await llmWikiRunController.startMigrationDryRun({
        source_inputs: sourceInputs,
        classify: async (sourceSnapshot) => {
          const runId = `run_${sourceSnapshot.snapshot_id.replace(/^source_snapshot_/u, "")}`;
          const supplied = await operationProvider({ action, run_id: runId, source_snapshot: sourceSnapshot, extracted_text: sourceSnapshot.content.text, outbound_allowed: true }, { signal: null });
          if (!supplied || supplied.ok === false) throw new Error(supplied && supplied.reason || "migration_provider_unavailable");
          const value = supplied.operation || supplied;
          const parsed = window.LLMWikiOperationContract.isOperationRecord(value) ? { ok: true, value }
            : window.LLMWikiOperationContract.parseOperation(typeof value === "string" ? value : value && value.serialized_operation);
          if (!parsed || parsed.ok !== true) throw new Error(parsed && parsed.reason || "invalid_operation");
          return parsed.value;
        }
      });
      if (llmWikiLifecycle) llmWikiLifecycle.update(lifecycleSnapshot());
      return result;
    };
    const scanExistingZetaMigration = async () => {
      const files = (appRef.vault.getMarkdownFiles ? appRef.vault.getMarkdownFiles() : []).filter((file) => file.path.startsWith("ZETA/PERMANENT/")).sort((a, b) => a.path.localeCompare(b.path));
      const inputs = [];
      for (const file of files) inputs.push(JSON.stringify({ source_kind: "markdown", source_path: file.path, text: await appRef.vault.cachedRead(file) }));
      return inputs.length ? startLlmWikiMigration(inputs, "existing_zeta_migration_dry_run") : { ok: false, status: "empty", reason: "existing_zeta_empty" };
    };
    const lifecycleSnapshot = () => {
      const snapshot = llmWikiRunController.getSnapshot();
      const directProvider = resolveProvider("direct");
      return {
        ...snapshot,
        ...(snapshot.provider_mode ? {} : { provider_mode: selectedProviderMode }),
        provider_key: directProvider && directProvider.ok === true ? directProvider.provider_key : "",
        provider_options: providerOptions,
        ...(providerSelectionFailure ? { provider_selection_error: providerSelectionFailure } : {}),
        ...(selectedSource ? { source_selection: { selected: true, display_name: selectedSource.title } } : {}),
        source_options: sourceOptions,
        ...(startupStatus ? { status: startupStatus } : {}),
        ...(startupFailure ? { status: "failed", reason: startupFailure } : {}),
        ...(rolloutActivationFailure ? { rollout_activation_failure: rolloutActivationFailure } : {}),
        inbox: { ...inboxState },
        fleeting: { ...fleetingReviewState },
        approval_packet: snapshot.approval_packet || (Array.isArray(snapshot.review_packets) ? snapshot.review_packets[0] || null : null)
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
      if (intent.action === "scan_inbox") return scanInbox();
      if (intent.action === "force_reanalyze_inbox") return scanInbox({ force: true });
      if (intent.action === "scan_migration") return scanExistingZetaMigration();
      if (intent.action === "cancel_inbox") {
        if (!["queued", "analyzing"].includes(inboxState.state) || !inboxScanPromise || !inboxScanController || inboxScanController.signal.aborted) return { ok: false, status: inboxState.state, reason: "inbox_scan_not_active" };
        const cancelledController = inboxScanController;
        const cancelledSourceId = inboxState.source_id;
        cancelledController.abort();
        inboxScanGeneration += 1;
        inboxScanPromise = null;
        inboxScanController = null;
        const cancelled = inboxAutopilot.cancel(cancelledSourceId);
        const cancelledState = settleInbox({ ...inboxState, state: "cancelled", current_path: "", current_title: "", reason: "cancelled" });
        const controllerState = llmWikiRunController.getSnapshot();
        const packet = Array.isArray(controllerState.risk_packets) ? controllerState.risk_packets[0] : null;
        if (packet) await llmWikiRunController.dispatchRiskAction({ action: "reject_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id });
        else {
          const operation = llmWikiRunController.getOperationSnapshot();
          if (["provider_pending", "review", "authorizing", "committing", "stale"].includes(operation.status)) await llmWikiRunController.cancelOperation({ action: "cancel" });
        }
        return { ...cancelled, status: "cancelled", inbox: cancelledState };
      }
      if (intent.action === "retry_inbox") return scanInbox();
      if (intent.action === "set_provider_mode") {
        if (!["direct", "omniroute"].includes(intent.provider_mode)) return { ok: false, status: "failed", reason: "invalid_provider_mode" };
        selectedProviderMode = intent.provider_mode;
        selectedRunCommand = null;
        startupFailure = "";
        return { ok: true, status: llmWikiRunController.getSnapshot().status, provider_mode: selectedProviderMode };
      }
      if (intent.action === "set_provider") {
        const operationStatus = llmWikiRunController.getSnapshot().status;
        if (["queued", "analyzing"].includes(inboxState.state) || ["running", "committing"].includes(operationStatus)) {
          return { ok: false, status: operationStatus, reason: "provider_selection_busy" };
        }
        const providerKey = String(intent.provider_key || "").trim();
        const option = providerOptions.find((item) => item.provider_key === providerKey);
        if (!option || option.configured !== true) return { ok: false, status: "failed", reason: "provider_selection_unavailable" };
        try {
          const profile = llmWikiConfig.aiProfiles.llmwiki;
          llmWikiConfig = await window.ProdigyConfigService.save(appRef, {
            config: {
              aiProfiles: {
                schema_version: llmWikiConfig.aiProfiles.schema_version,
                llmwiki: { ...profile, direct_provider_key: providerKey },
              },
            },
          });
          providerOptions = await configuredProviderOptions(llmWikiConfig);
          selectedProviderMode = "direct";
          selectedRunCommand = null;
          startupFailure = "";
          providerSelectionFailure = "";
          return { ok: true, status: llmWikiRunController.getSnapshot().status, provider_mode: "direct", provider_key: providerKey };
        } catch (_error) {
          providerSelectionFailure = "AI 제공자 선택을 저장하지 못했습니다.";
          return { ok: false, status: "failed", reason: "provider_selection_save_failed" };
        }
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
      const command = selectedRunCommand || await defaultRunCommand(selectedSource.path, selectedProviderMode);
      if (!command) {
        startupStatus = "selecting";
        startupFailure = "선택한 자료 또는 AI 제공자 설정을 확인해 주세요.";
        return { ok: false, status: "selecting", reason: "startup_command_unavailable" };
      }
      selectedRunCommand = command;
      KnowledgeExplorerHub.llmWikiSelectedRunCommand = command;
      startupFailure = "";
      startupStatus = null;
      return llmWikiRunController.startRun({ ...command, explicit_user_consent: intent.action === "start_run" });
    };
    const reviewItems = () => {
      const configured = Array.isArray(llmWikiControllerOptions.review_items) ? llmWikiControllerOptions.review_items : [];
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
      const packetRows = (Array.isArray(llmWikiRunController.getSnapshot().risk_packets) ? llmWikiRunController.getSnapshot().risk_packets : [])
        .filter((packet) => packet && typeof packet.packet_id === "string")
        .map((packet) => ({ review_id: packet.packet_id, destination: "canonical_knowledge", review_state: "pending", analysis_state: "complete", title: packet.summary || "정본 검토", sources: packet.provenance && Array.isArray(packet.provenance.sources) ? packet.provenance.sources : [] }));
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
    const dispatchLifecycleAction = async (intent) => {
      let pending;
      if (["approve_risk", "reject_risk", "approve_risk_batch", "request_risk_revision"].includes(intent.action)) pending = llmWikiRunController.dispatchRiskAction(intent);
      else if (intent.action === "enable_rollout_phase") pending = llmWikiRunController.enableRolloutPhase(intent);
      else if (intent.action === "review_migration") pending = llmWikiRunController.prepareMigrationPacket(intent);
      else if (intent.action === "approve_migration") pending = llmWikiRunController.approveMigration(intent);
      else if (["retry_migration_refresh", "retry_migration_git"].includes(intent.action)) pending = llmWikiRunController.retryMigrationFollowUp(intent);
      else if (intent.action === "migration_recovery") pending = llmWikiRunController.acknowledgeMigrationRecovery(intent);
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
      if (intent.action === "enable_rollout_phase") {
        if (response && response.ok === true) rolloutActivationFailure = "";
        else if (response && response.reason === "prior_rollout_gate_unavailable") rolloutActivationFailure = "이전 단계를 먼저 활성화해 주세요.";
        else if (response && response.reason === "rollout_persistence_failed") rolloutActivationFailure = "활성화 상태를 저장하지 못했습니다. 다시 시도해 주세요.";
        else if (response && response.reason === "unknown_rollout_phase") rolloutActivationFailure = "지원하지 않는 활성화 단계입니다.";
        else rolloutActivationFailure = "활성화 확인 자료를 검증하지 못했습니다. 완료 상태가 최신인지 확인한 뒤 다시 시도해 주세요.";
      }
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
      if (file && typeof file.path === "string" && file.path.startsWith("INBOX/") && file.path.endsWith(".md")) scanInbox();
    });
    if (inboxRef && mountContext.scope && typeof mountContext.scope.track === "function") mountContext.scope.track(() => appRef.vault.offref && appRef.vault.offref(inboxRef));
    scanInbox();
    KnowledgeExplorerHub.inboxAutopilot = inboxAutopilot;
    KnowledgeExplorerHub.fleetingReviewService = fleetingReviewService;
    KnowledgeExplorerHub.refreshFleetingReview = refreshFleetingSurface;
    KnowledgeExplorerHub.startLlmWikiMigration = startLlmWikiMigration;
    KnowledgeExplorerHub.scanExistingZetaMigration = scanExistingZetaMigration;
    KnowledgeExplorerHub.scanKnowledgeInbox = scanInbox;
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
