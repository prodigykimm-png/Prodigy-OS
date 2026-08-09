---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
```dataviewjs
window.app = app;
window.KnowledgeExplorerHub = window.KnowledgeExplorerHub || {};

const KnowledgeExplorerHub = window.KnowledgeExplorerHub;
KnowledgeExplorerHub.modulePaths = [
  "SYSTEM/Views/design-tokens.js",
  "SYSTEM/Views/workspace-registry.js",
  "SYSTEM/Views/prodigy-workspace-state-store.js",
  "SYSTEM/Views/prodigy-app-shell.js",
  "SYSTEM/Views/workspace-navigation.js",
  "SYSTEM/Views/display-registry.js",
  "SYSTEM/Views/knowledge-explorer-registry.js",
  "SYSTEM/Views/knowledge-authoring-validation.js",
  "SYSTEM/Views/knowledge-authoring-core.js",
  "SYSTEM/Views/knowledge-candidate-core.js",
  "SYSTEM/Views/evidence-quality-core.js",
  "SYSTEM/Views/knowledge-candidate-store.js",
  "SYSTEM/Views/knowledge-candidate-view.js",
  "SYSTEM/Views/knowledge-candidate-hub-adapter.js",
  "SYSTEM/Views/knowledge-direct-authoring-form.js",
  "SYSTEM/Views/knowledge-direct-authoring-view.js",
  "SYSTEM/Views/knowledge-source-authoring-form.js",
  "SYSTEM/Views/knowledge-source-store.js",
  "SYSTEM/Views/knowledge-source-authoring-view.js",
  "SYSTEM/Views/knowledge-source-fetch-service.js",
  "SYSTEM/Views/knowledge-source-batch-policy.js",
  "SYSTEM/Views/knowledge-source-batch-service.js",
  "SYSTEM/Views/knowledge-source-batch-state.js",
  "SYSTEM/Views/knowledge-source-batch-controller.js",
  "SYSTEM/Views/knowledge-source-batch-render.js",
  "SYSTEM/Views/knowledge-source-batch-view.js",
  "SYSTEM/Views/ai-provider-error-policy.js",
  "SYSTEM/Views/ai-provider-fallback.js",
  "SYSTEM/Views/ai-provider-service.js",
  "SYSTEM/Views/prodigy-config-service.js",
  "SYSTEM/Views/project-workflow-draft-service.js",
  "SYSTEM/Views/knowledge-authoring-hub-adapter.js",
  "SYSTEM/Views/knowledge-explorer-hub-projection.js",
  "SYSTEM/Views/knowledge-explorer-core.js",
  "SYSTEM/Views/knowledge-explorer-data-source.js",
  "SYSTEM/Views/knowledge-explorer-relations.js",
  "SYSTEM/Views/knowledge-explorer-hub-adapter.js",
  "SYSTEM/Views/knowledge-explorer-brief-core.js",
  "SYSTEM/Views/knowledge-explorer-brief-policy.js",
  "SYSTEM/Views/knowledge-explorer-brief-service.js",
  "SYSTEM/Views/knowledge-explorer-brief.js",
  "SYSTEM/Views/knowledge-explorer-brief-render.js",
  "SYSTEM/Views/knowledge-explorer-state.js",
  "SYSTEM/Views/knowledge-explorer-responsive.js",
  "SYSTEM/Views/knowledge-explorer-render.js",
  "SYSTEM/Views/knowledge-explorer-view.js",
  "SYSTEM/Views/llmwiki-hash.js",
  "SYSTEM/Views/llmwiki-proposal-bundle.js",
  "SYSTEM/Views/llmwiki-source-lineage.js",
  "SYSTEM/Views/llmwiki-query-readonly.js",
  "SYSTEM/Views/llmwiki-provider-contract.js",
  "SYSTEM/Views/llmwiki-librarian-pipeline.js",
  "SYSTEM/Views/llmwiki-outbound-consent.js",
  "SYSTEM/Views/llmwiki-run-state.js",
  "SYSTEM/Views/llmwiki-canonical-packet.js",
  "SYSTEM/Views/llmwiki-approval-review-commit.js",
  "SYSTEM/Views/llmwiki-deterministic-commit.js",
  "SYSTEM/Views/llmwiki-approval-review-view.js",
  "SYSTEM/Views/llmwiki-obsidian-adapter.js",
  "SYSTEM/Views/llmwiki-derived-refresh.js",
  "SYSTEM/Views/llmwiki-run-controller.js",
  "SYSTEM/Views/llmwiki-lifecycle-view.js",
  "SYSTEM/Views/llmwiki-ui-recovery.js",
  "SYSTEM/Views/llmwiki-provider-response-schema.js",
  "SYSTEM/Views/llmwiki-ai-provider-transport.js",
  "SYSTEM/Views/llmwiki-wiki-read-adapter.js",
  "SYSTEM/Views/llmwiki-wiki-read-service.js",
  "SYSTEM/Views/llmwiki-wiki-surface.js",
  "SYSTEM/Views/knowledge-workspace-tabs.js",
  "SYSTEM/Views/para-object-creator-service.js",
  "SYSTEM/Views/knowledge-para-projection.js",
  "SYSTEM/Views/knowledge-para-view.js"
];

const loadProdigyScript = async (modulePath) => {
  const tFile = app.vault.getAbstractFileByPath(modulePath);
  if (!tFile) throw new Error(`Missing module: ${modulePath}`);
  (new Function(await app.vault.read(tFile)))();
};

KnowledgeExplorerHub.render = async ({ app: hubApp, dv: hubDv, container, obsidian: hubObsidian }) => {
  const mountPoint = container;
  if (!mountPoint) throw new Error("Missing hub container.");
  const appRef = hubApp || app;
  const dvRef = hubDv || dv;
  const obsidianRef = hubObsidian || obsidian;
  const retry = () => KnowledgeExplorerHub.render({ app: appRef, dv: dvRef, container: mountPoint, obsidian: obsidianRef });

  mountPoint.empty();
  try {
    for (const modulePath of KnowledgeExplorerHub.modulePaths) await loadProdigyScript(modulePath);
    const shell = window.ProdigyWorkspaceNavigation.mount(mountPoint, { app: appRef, workspaceId: "knowledge", title: "지식" });
    const workspaceBody = shell.body;
    const P = window.KnowledgeExplorerHubProjection;
    if (!P || !window.KnowledgeExplorerRegistry || !window.KnowledgeAuthoringHubAdapter || !window.KnowledgeExplorerCore || !window.KnowledgeExplorerDataSource || !window.KnowledgeExplorerRelations || !window.KnowledgeExplorerHubAdapter || !window.KnowledgeExplorerBriefService || !window.KnowledgeExplorerBriefRender || !window.KnowledgeExplorerView || !window.LLMWikiRunController || !window.LLMWikiLifecycleView || !window.LLMWikiProviderResponseSchema || !window.LLMWikiWikiReadAdapter || !window.LLMWikiWikiReadService || !window.LLMWikiWikiSurface) {
      throw new Error("Knowledge Explorer modules failed to load.");
    }
    const dataSource = window.KnowledgeExplorerDataSource.createKnowledgeExplorerDataSource({
      registry: window.KnowledgeExplorerRegistry,
      schemaVersion: window.KnowledgeExplorerCore.SCHEMA_VERSION,
      readBody: (asset) => P.readSelectedNote(appRef, dvRef, asset && asset.path)
    });
    const records = P.collectRecords(dataSource, dvRef);
    const relationRecords = P.collectRelationRecords(dvRef);
    const snapshot = JSON.stringify(records);
    const relationSnapshot = JSON.stringify(relationRecords);
    const model = window.KnowledgeExplorerCore.projectKnowledgeExplorer(records, window.KnowledgeExplorerRegistry);
    const relationsModel = window.KnowledgeExplorerRelations.projectRelations(relationRecords);
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
        class: "knowledge-workspace-role-panel",
        "data-workspace-role": "knowledge-building",
        "aria-label": "제텔카스텐 지식 구축 역할",
        style: "margin:0 0 12px;padding:14px;border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);"
      }
    });
    zettelRolePanel.createEl("div", {
      text: "지식 구축",
      attr: { class: "knowledge-explorer-meta", style: "font-weight:700;color:var(--text-accent);" }
    });
    zettelRolePanel.createEl("h2", {
      text: "제텔카스텐",
      attr: { style: "margin:2px 0 4px;font-size:1.15em;" }
    });
    zettelRolePanel.createEl("p", {
      text: "생각과 자료를 원자적 지식으로 만들고, 연결하고, 사람의 검토를 거쳐 보존합니다.",
      attr: { class: "knowledge-explorer-meta", style: "margin:0;" }
    });

    const growthPanel = zettelPanel.createDiv({
      attr: {
        class: "knowledge-growth-summary",
        "data-workspace-role": "knowledge-growth",
        "aria-label": "지식 축적 현황",
        style: "margin:0 0 14px;padding:12px;border:1px solid var(--background-modifier-border);border-radius:10px;"
      }
    });
    growthPanel.createEl("h3", { text: "지식 축적 현황", attr: { style: "margin:0 0 8px;font-size:.95em;" } });
    const growthStats = growthPanel.createDiv({
      attr: { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;" }
    });
    [
      ["knowledge", "영구 지식", model.totals && model.totals.knowledge, "사람이 승인한 영구 지식"],
      ["resources", "자료·맥락", model.totals && model.totals.resources, "문헌·연결 자료"],
      ["pending", "검증 대기", candidateCount, "승인 전 후보"],
      ["relations", "연결 관계", relationCount, "지식·자료를 잇는 탐색 경로"]
    ].forEach(([key, label, value, hint]) => {
      const card = growthStats.createDiv({
        attr: {
          class: "knowledge-growth-stat",
          "data-growth-key": key,
          style: "min-width:0;padding:8px;border-radius:8px;background:var(--background-secondary);"
        }
      });
      card.createEl("div", { text: label, attr: { class: "knowledge-explorer-meta" } });
      card.createEl("strong", { text: String(Number(value) || 0), attr: { style: "display:block;font-size:1.2em;" } });
      card.createEl("small", { text: hint, attr: { class: "knowledge-explorer-meta" } });
    });
    growthPanel.createEl("p", {
      text: recentKnowledge.length
        ? `최근 쌓인 지식: ${recentKnowledge.map((asset) => asset.title).join(" · ")}`
        : "아직 영구 지식이 없습니다. 검증을 통과한 지식이 이곳에 쌓입니다.",
      attr: { class: "knowledge-explorer-meta", style: "margin:8px 0 0;" }
    });
    const reviewPanel = zettelPanel.createDiv({
      attr: {
        class: "knowledge-candidate-review-launcher",
        "data-workspace-role": "knowledge-review",
        "aria-label": "승인 전 후보 검토",
        style: "margin:0 0 14px;padding:12px;border:1px solid var(--interactive-accent);border-radius:10px;background:var(--background-secondary);"
      }
    });
    reviewPanel.createEl("h3", { text: "승인 전 후보 검토", attr: { style: "margin:0 0 4px;font-size:.95em;" } });
    reviewPanel.createEl("p", {
      text: "후보를 열어 제목·지식 문장·도메인·주제를 확인한 뒤 승인·보류·반려합니다.",
      attr: { class: "knowledge-explorer-meta", style: "margin:0 0 8px;" }
    });
    const reviewButton = reviewPanel.createEl("button", {
      text: "검증 대기 열기",
      attr: { type: "button", class: "knowledge-explorer-button", "aria-label": "검증 대기 열기" }
    });
    reviewButton.onclick = () => {
      if (api && typeof api.dispatch === "function") api.dispatch({ type: "focus-pane", focusPane: "detail" });
      if (explorerMount && typeof explorerMount.scrollIntoView === "function") explorerMount.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const authoringMount = zettelPanel.createDiv({ attr: { class: "knowledge-authoring-hub-mount" } });
    const explorerMount = zettelPanel.createDiv({ attr: { class: "knowledge-explorer-hub-mount" } });
    KnowledgeExplorerHub.authoringActions = window.KnowledgeAuthoringHubAdapter.mountKnowledgeAuthoringActions(authoringMount, {
      app: appRef,
      onReload: retry
    });
    const api = window.KnowledgeExplorerView.mountKnowledgeExplorer({
      app: appRef,
      container: explorerMount,
      model,
      surfaceState,
      onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath),
      briefService,
      hydrateAsset: dataSource.hydrate,
      ...candidateConfig
    });

    // PARA 탭: 연결된 승인 지식만
    const paraPanel = tabs.getPanel("para");
    const paraModel = window.KnowledgeParaProjection.projectParaKnowledge(records, relationRecords);
    window.KnowledgeParaView.renderParaPanel(paraPanel, paraModel, {
      app: appRef,
      onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath),
      onCreated: () => retry()
    });

    // LLMWiki lifecycle tab: provider-backed proposal flow remains consent-first.
    const llmWikiPanel = tabs.getPanel("llmwiki");
    const browsePanel = tabs.getPanel("llmwiki-browse");
    const llmWikiControllerOptions = { ...(KnowledgeExplorerHub.llmWikiControllerOptions || {}) };
    const llmWikiConfig = await window.ProdigyConfigService.load(appRef);
    let selectedProviderMode = "direct";
    let selectedSource = null;
    let sourceOptions = [];
    let startupFailure = "";
    let startupStatus = null;
    let selectedRunCommand = null;
    const llmWikiHash = window.LLMWikiHash;
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
    const llmWikiRunController = window.LLMWikiRunController.createRunController({
      app: appRef,
      config: llmWikiConfig,
      transport: llmWikiTransport,
      ...llmWikiControllerOptions
    });
    const lifecycleSnapshot = () => {
      const snapshot = llmWikiRunController.getSnapshot();
      return {
        ...snapshot,
        ...(snapshot.provider_mode ? {} : { provider_mode: selectedProviderMode }),
        ...(selectedSource ? { source_selection: { selected: true, display_name: selectedSource.title } } : {}),
        source_options: sourceOptions,
        ...(startupStatus ? { status: startupStatus } : {}),
        ...(startupFailure ? { status: "failed", reason: startupFailure } : {}),
        approval_packet: Array.isArray(snapshot.review_packets) ? snapshot.review_packets[0] || null : null
      };
    };
    const dispatchStartupIntent = async (intent) => {
      if (!intent || typeof intent.action !== "string") return { ok: false, status: "failed", reason: "malformed_action" };
      if (intent.action === "set_provider_mode") {
        if (!["direct", "omniroute"].includes(intent.provider_mode)) return { ok: false, status: "failed", reason: "invalid_provider_mode" };
        selectedProviderMode = intent.provider_mode;
        selectedRunCommand = null;
        startupFailure = "";
        return { ok: true, status: llmWikiRunController.getSnapshot().status, provider_mode: selectedProviderMode };
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
      startupFailure = "";
      startupStatus = null;
      return llmWikiRunController.startRun({ ...command, explicit_user_consent: intent.action === "start_run" });
    };
    let llmWikiLifecycle;
    const dispatchLifecycleAction = async (intent) => {
      let pending;
      if (intent.action === "approve") pending = llmWikiRunController.approve(intent);
      else if (intent.action === "cancel") pending = llmWikiRunController.cancel(intent);
      else if (intent.action === "reload") pending = llmWikiRunController.reload(intent);
      else if (intent.action === "repair_audit") pending = llmWikiRunController.repairAudit(intent);
      else if (intent.action === "retry_refresh") pending = llmWikiRunController.retryRefresh(intent);
      else if (intent.action === "repacket_stale") pending = llmWikiRunController.repacketStale(intent);
      else if (intent.action === "reconfirm_stale") pending = llmWikiRunController.reconfirmStale(intent);
      else pending = dispatchStartupIntent(intent);
      llmWikiLifecycle.update(lifecycleSnapshot());
      const response = await pending;
      llmWikiLifecycle.update(lifecycleSnapshot());
      return response;
    };
    llmWikiLifecycle = window.LLMWikiLifecycleView.mountLlmWikiLifecycleView({
      container: llmWikiPanel,
      snapshot: lifecycleSnapshot(),
      onAction: dispatchLifecycleAction,
      reviewView: window.LLMWikiApprovalReviewView,
      reviewOptions: { onOpenBeside: (targetPath) => P.openBeside(appRef, targetPath) }
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
    const llmWikiWikiSurface = window.LLMWikiWikiSurface.mountLlmWikiWikiSurface({
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

    KnowledgeExplorerHub.api = api;
    KnowledgeExplorerHub.tabs = tabs;
    KnowledgeExplorerHub.model = model;
    KnowledgeExplorerHub.paraModel = paraModel;
    KnowledgeExplorerHub.llmWikiRunController = llmWikiRunController;
    KnowledgeExplorerHub.llmWikiLifecycle = llmWikiLifecycle;
    KnowledgeExplorerHub.llmWikiBrowse = llmWikiWikiSurface;
    KnowledgeExplorerHub.dataSource = dataSource;
    return api;
  } catch (error) {
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

await KnowledgeExplorerHub.render({ app, dv, container: this.container, obsidian });
```
