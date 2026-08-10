---
cssclasses:
  - hide-properties_reading
---

# 지역 비교

```dataviewjs
if (!this.container) return;
this.container.empty();

window.app = app;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "region"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "region" };
const OPTIONAL_MEASUREMENT_PATHS = new Set([
  "SYSTEM/Views/prodigy-performance-recorder.js",
  "SYSTEM/Views/prodigy-workspace-readiness.js",
  "SYSTEM/Views/prodigy-performance-exporter.js",
  "SYSTEM/Views/prodigy-workspace-measurement.js"
]);
const recordMeasurementFailure = (path, error) => {
  const failure = {
    path,
    code: error && error.code ? String(error.code) : "measurement_load_failed",
    message: error && error.message ? String(error.message).slice(0, 240) : "measurement module unavailable"
  };
  window.__prodigyMeasurementLoadFailures = (window.__prodigyMeasurementLoadFailures || []).concat(failure);
  if (window.prodigyDebugMode === true && console && console.warn) console.warn("선택적 성능 측정 모듈 미로드:", failure);
};
window.RegionExplorerHub = window.RegionExplorerHub || {};

const RegionExplorerHub = window.RegionExplorerHub;
if (RegionExplorerHub.resizeObserver && typeof RegionExplorerHub.resizeObserver.disconnect === "function") RegionExplorerHub.resizeObserver.disconnect();
RegionExplorerHub.resizeObserver = null;
const REGISTRY_INDEX_PATH = "SYSTEM/SCRIPTS/region-metrics-manifest-index.json";
const SOURCE_SUPPORT_MATRIX_PATH = "SYSTEM/SCRIPTS/region-provider-support-matrix.json";
const SCRIPTS_ROOT = "SYSTEM/SCRIPTS/";
RegionExplorerHub.modulePaths = [
  "SYSTEM/Views/prodigy-performance-recorder.js",
  "SYSTEM/Views/prodigy-workspace-readiness.js",
  "SYSTEM/Views/prodigy-performance-exporter.js",
  "SYSTEM/Views/prodigy-workspace-measurement.js",
  "SYSTEM/Views/design-tokens.js",
  "SYSTEM/Views/workspace-registry.js",
  "SYSTEM/Views/prodigy-workspace-state-store.js",
  "SYSTEM/Views/prodigy-app-shell.js",
  "SYSTEM/Views/workspace-navigation.js",
  "SYSTEM/SCRIPTS/region-source-mois-command-core.js",
  "SYSTEM/SCRIPTS/region-source-snapshot-core.js",
  "SYSTEM/SCRIPTS/region-source-ledger-read-core.js",
  "SYSTEM/SCRIPTS/region-metrics-registry-core.js",
  "SYSTEM/Views/region-explorer-projection.js",
  "SYSTEM/Views/region-explorer-data-source.js",
  "SYSTEM/Views/region-explorer-state.js",
  "SYSTEM/Views/region-explorer-view.js",
  "SYSTEM/Views/auction-region-core.js",
  "SYSTEM/Views/region-collection-health-core.js",
  "SYSTEM/Views/region-decision-context-core.js",
  "SYSTEM/Views/region-decision-view-model.js",
  "SYSTEM/Views/auction-decision-mirror-core.js",
  "SYSTEM/Views/region-intelligence-popup-store.js",
  "SYSTEM/Views/region-intelligence-popup-core.js",
  "SYSTEM/Views/region-intelligence-popup-view.js"
];
RegionExplorerHub.regionExperienceModulePaths = [
  "SYSTEM/Views/region-experience-contract.js",
  "SYSTEM/Views/journal-core.js",
  "SYSTEM/Views/region-experience-store.js",
  "SYSTEM/Views/ai-provider-response.js",
  "SYSTEM/Views/ai-provider-schema.js",
  "SYSTEM/Views/ai-provider-error-policy.js",
  "SYSTEM/Views/ai-provider-fallback.js",
  "SYSTEM/Views/codex-exec-service.js",
  "SYSTEM/Views/antigravity-exec-service.js",
  "SYSTEM/Views/ai-provider-service.js",
  "SYSTEM/Views/prodigy-config-service.js",
  "SYSTEM/Views/project-workflow-draft-service.js",
  "SYSTEM/Views/region-experience-provider-endpoint-guard.js",
  "SYSTEM/Views/region-experience-ai.js",
  "SYSTEM/Views/journal-store.js",
  "SYSTEM/Views/daily-reflection-knowledge-handoff.js",
  "SYSTEM/Views/knowledge-explorer-registry.js",
  "SYSTEM/Views/knowledge-candidate-core.js",
  "SYSTEM/Views/evidence-quality-core.js",
  "SYSTEM/Views/knowledge-candidate-store.js",
  "SYSTEM/Views/region-experience-handoff.js",
  "SYSTEM/Views/region-experience-modal.js"
];

const fallbackRequire = (moduleName) => {
  if (moduleName === "node:path") {
    return {
      posix: { isAbsolute: (value) => String(value || "").startsWith("/") },
      win32: { isAbsolute: (value) => /^[A-Za-z]:[\\/]/.test(String(value || "")) }
    };
  }
  throw new Error(`지원하지 않는 Region Explorer 모듈: ${moduleName}`);
};

const loadReadOnlyModule = async (modulePath) => {
  const optional = OPTIONAL_MEASUREMENT_PATHS.has(modulePath);
  try {
    const tFile = app.vault.getAbstractFileByPath(modulePath);
    if (!tFile) {
      const missing = new Error(`Region Explorer 모듈을 찾을 수 없습니다: ${modulePath}`);
      missing.code = "sync_pending";
      if (optional) {
        recordMeasurementFailure(modulePath, missing);
        return null;
      }
      throw missing;
    }
    const module = { exports: {} };
    const localRequire = typeof require === "function" ? require : fallbackRequire;
    const source = await app.vault.read(tFile);
    const evaluate = () => (new Function("module", "exports", "require", "window", "globalThis", source))(module, module.exports, localRequire, window, window);
    const session = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.session;
    if (session && typeof session.measureModule === "function") await session.measureModule(modulePath, evaluate);
    else evaluate();
    if (modulePath.endsWith("region-metrics-registry-core.js")) window.RegionMetricsRegistryCore = module.exports;
    if (modulePath.endsWith("region-source-mois-command-core.js")) window.RegionSourceMoisCommandCore = module.exports;
    if (modulePath.endsWith("region-source-snapshot-core.js")) window.RegionSourceSnapshotCore = module.exports;
    if (modulePath.endsWith("region-source-ledger-read-core.js")) window.RegionSourceLedgerReadCore = module.exports;
    return module.exports;
  } catch (error) {
    if (optional) {
      recordMeasurementFailure(modulePath, error);
      return null;
    }
    throw error;
  }
};

const regionExperienceModuleRevision = () => RegionExplorerHub.regionExperienceModulePaths.map((modulePath) => {
  const tFile = app.vault.getAbstractFileByPath(modulePath);
  const modifiedAt = tFile && tFile.stat && Number.isFinite(tFile.stat.mtime) ? tFile.stat.mtime : "missing";
  return `${modulePath}:${modifiedAt}`;
}).join("|");

const loadRegionExperienceModules = async () => {
  const revision = regionExperienceModuleRevision();
  if (RegionExplorerHub.regionExperienceModulesReady && RegionExplorerHub.regionExperienceModulesRevision === revision) return RegionExplorerHub.regionExperienceModulesReady;
  const loading = (async () => {
    for (const modulePath of RegionExplorerHub.regionExperienceModulePaths) await loadReadOnlyModule(modulePath);
    if (typeof window.openRegionExperienceModal !== "function") throw new Error("지역 경험 모달을 불러오지 못했습니다.");
  })();
  RegionExplorerHub.regionExperienceModulesReady = loading;
  RegionExplorerHub.regionExperienceModulesRevision = revision;
  try {
    await loading;
  } catch (error) {
    if (RegionExplorerHub.regionExperienceModulesReady === loading) {
      RegionExplorerHub.regionExperienceModulesReady = null;
      RegionExplorerHub.regionExperienceModulesRevision = null;
    }
    throw error;
  }
};

const loadRegistry = async () => {
  const indexFile = app.vault.getAbstractFileByPath(REGISTRY_INDEX_PATH);
  if (!indexFile) throw new Error("Region Explorer registry를 찾을 수 없습니다.");
  const indexText = await app.vault.read(indexFile);
  const index = JSON.parse(indexText);
  const manifestTexts = {};
  for (const entry of Array.isArray(index.manifests) ? index.manifests : []) {
    const manifestPath = window.RegionMetricsRegistryCore.validateManifestPath(entry && entry.manifest_path);
    const manifestFile = app.vault.getAbstractFileByPath(`${SCRIPTS_ROOT}${manifestPath}`);
    if (!manifestFile) throw new Error(`Region Explorer manifest를 찾을 수 없습니다: ${manifestPath}`);
    manifestTexts[manifestPath] = await app.vault.read(manifestFile);
  }
  return window.RegionMetricsRegistryCore.loadRegistry(indexText, manifestTexts);
};

const loadSourceSupportMatrix = async () => {
  const matrixFile = app.vault.getAbstractFileByPath(SOURCE_SUPPORT_MATRIX_PATH);
  if (!matrixFile) throw new Error("Region source support matrix를 찾을 수 없습니다.");
  return JSON.parse(await app.vault.read(matrixFile));
};

const coverageProjection = (projection, registry) => {
  const rows = Array.isArray(projection && projection.rows) ? projection.rows : [];
  const validKeys = new Set(rows.map((row) => row && row.identity && row.identity.region_key).filter(Boolean));
  const excludedKeys = new Set(Array.isArray(projection && projection.excluded_region_keys) ? projection.excluded_region_keys : []);
  const coverageRows = (Array.isArray(registry && registry.regions) ? registry.regions : []).filter((region) => !validKeys.has(region.region_key)).map((region) => ({
    identity: { path: null, region_key: region.region_key, sido: region.sido, sigungu: region.sigungu, title: region.title },
    metrics: {}, history: { snapshots: [] }, research: {},
    provenance: { metrics_as_of: null, verification_status: null, freshness: { availability: "기준일 없음" } },
    land_price: {}, is_coverage_placeholder: true,
    diagnostics: [{ code: "no_valid_region_object", message: excludedKeys.has(region.region_key) ? "등록된 지역에 유효한 Region Object가 없습니다. type Frontmatter가 auction_region이어야 합니다. 이 화면은 읽기 전용입니다." : "등록된 지역에 유효한 Region Object가 없습니다. 이 화면은 읽기 전용입니다." }]
  }));
  return { ...projection, rows: [...rows, ...coverageRows] };
};

const coverageNotice = (parent, projection) => {
  const usableRows = Array.isArray(projection && projection.rows)
    ? projection.rows.filter((row) => row && !row.is_coverage_placeholder && row.identity && row.identity.region_key && row.identity.sido && row.identity.sigungu)
    : [];
  if (usableRows.length) return;
  parent.createEl("p", {
    text: "읽을 수 있는 지역 Object가 없습니다. 등록된 지역 범위와 Frontmatter(type, 시도, 시군구)를 확인하세요. 이 화면은 읽기 전용입니다.",
    attr: {
      role: "status",
      style: "margin:0 0 12px;padding:10px 12px;border-left:2px solid var(--text-muted);background:var(--background-secondary);color:var(--text-muted);"
    }
  });
};

const validExperienceRegions = (projection) => {
  const rows = Array.isArray(projection && projection.rows) ? projection.rows : [];
  const seen = new Set();
  return rows.map((row) => {
    const identity = row && row.identity;
    const regionKey = identity && typeof identity.region_key === "string" ? identity.region_key.trim() : "";
    const sido = identity && typeof identity.sido === "string" ? identity.sido.trim() : "";
    const sigungu = identity && typeof identity.sigungu === "string" ? identity.sigungu.trim() : "";
    const path = `PARA/RESOURCES/Auction Regions/${regionKey}.md`;
    const hasMalformedHistory = Array.isArray(row && row.diagnostics) && row.diagnostics.some((item) => item && (item.code === "malformed_history" || item.code === "invalid_history_snapshot"));
    if (!row || row.is_coverage_placeholder || hasMalformedHistory || !regionKey || !sido || !sigungu || regionKey !== `${sido}-${sigungu}` || identity.path !== path || seen.has(regionKey)) return null;
    seen.add(regionKey);
    return { type: "auction_region", region_key: regionKey, region_sido: sido, region_sigungu: sigungu, path, wiki_link: `[[${path.slice(0, -3)}]]` };
  }).filter(Boolean);
};

const emptySourceLedgerModel = (message) => ({
  schema_version: 1,
  status: "unavailable",
  snapshot_count: 0,
  verified_count: 0,
  ready_count: 0,
  blocked_count: 0,
  invalid_count: 1,
  covered_region_count: 0,
  latest_reference_period: null,
  latest_collected_at: null,
  evidence_by_region: {},
  errors: [{ code: "source_ledger_unavailable", path: null, message }]
});

const loadSourceLedger = async (registry) => {
  try {
    return await window.RegionSourceLedgerReadCore.loadFromVault({
      vault: app.vault,
      support_matrix: await loadSourceSupportMatrix(),
      region_registry: registry && registry.regions
    });
  } catch (error) {
    return emptySourceLedgerModel(error && error.message ? error.message : "공식 원문 상태를 읽지 못했습니다.");
  }
};

const attachSourceEvidence = (projection, sourceLedger) => {
  const evidenceByRegion = sourceLedger && sourceLedger.evidence_by_region && typeof sourceLedger.evidence_by_region === "object" ? sourceLedger.evidence_by_region : {};
  return {
    ...projection,
    rows: (Array.isArray(projection && projection.rows) ? projection.rows : []).map((row) => ({
      ...row,
      source_evidence: Array.isArray(evidenceByRegion[row && row.identity && row.identity.region_key]) ? evidenceByRegion[row.identity.region_key] : []
    }))
  };
};

let sourceLedgerMount = null;
const renderSourceLedgerStatus = (sourceLedger) => {
  if (!sourceLedgerMount) return null;
  sourceLedgerMount.empty();
  const panel = sourceLedgerMount.createEl("section", {
    attr: { class: "region-explorer-summary", "aria-label": "공식 원문 근거 상태" }
  });
  panel.createEl("h3", { text: "공식 원문 근거" });
  const model = sourceLedger || emptySourceLedgerModel("공식 원문 상태를 읽지 못했습니다.");
  if (model.status === "empty") {
    panel.createEl("p", { text: "아직 수집된 공식 원문이 없습니다. 공식 원문 수집에서 명령을 복사해 데스크톱 터미널에서 실행하세요.", attr: { class: "region-explorer-meta" } });
  } else if (model.status === "unavailable") {
    panel.createEl("p", { text: "공식 원문 원장을 읽을 수 없습니다. 명령을 실행한 Vault와 현재 Vault가 같은지 확인하세요.", attr: { class: "region-explorer-diagnostics", role: "status" } });
  } else {
    panel.createEl("p", {
      text: `검증된 투영 가능 원문 ${Number(model.ready_count) || 0}건 · 연결 지역 ${Number(model.covered_region_count) || 0}개 · 기준월 ${model.latest_reference_period || "자료 없음"}`,
      attr: { class: "region-explorer-meta" }
    });
    panel.createEl("p", {
      text: `현재 표시 원문 ${Number(model.snapshot_count) || 0}건 · 검증 완료 ${Number(model.verified_count) || 0}건 · 투영 차단 ${Number(model.blocked_count) || 0}건`,
      attr: { class: "region-explorer-meta" }
    });
  }
  if (Number(model.invalid_count) > 0) panel.createEl("p", {
    text: `검증 실패 ${Number(model.invalid_count)}건은 지역 근거와 비교에 사용하지 않습니다.`,
    attr: { class: "region-explorer-diagnostics", role: "status" }
  });
  return panel;
};

let sourceCommandMount = null;
let sourceCommandReturnFocus = null;
const renderMoisCollectionGuide = (event) => {
  sourceCommandReturnFocus = event && event.currentTarget && typeof event.currentTarget.focus === "function"
    ? event.currentTarget
    : null;
  if (!sourceCommandMount) return null;
  sourceCommandMount.empty();
  const panel = sourceCommandMount.createEl("section", {
    attr: {
      class: "region-explorer-controls",
      "aria-label": "공식 원문 수집 안내"
    }
  });
  panel.createEl("h3", { text: "공식 원문 수집" });
  panel.createEl("p", {
    text: "행정안전부 주민등록 CSV를 원문 원장에 보존합니다. 이 화면은 네트워크나 프로세스를 실행하지 않으며, 아래 명령을 데스크톱 터미널에서 실행합니다.",
    attr: { class: "region-explorer-meta" }
  });
  panel.createEl("p", {
    text: "현재 대상: 서울·경기·인천·부산 83개 시·군·구 · Region Object 자동 수정 없음",
    attr: { class: "region-explorer-meta" }
  });

  const periodControl = panel.createDiv({ attr: { class: "region-explorer-control" } });
  periodControl.createEl("label", { text: "자료 기준월", attr: { for: "region-source-mois-period" } });
  const periodInput = periodControl.createEl("input", {
    attr: { id: "region-source-mois-period", type: "month", required: "true", "aria-label": "자료 기준월" }
  });

  const publishedControl = panel.createDiv({ attr: { class: "region-explorer-control" } });
  publishedControl.createEl("label", { text: "공식 공표 시각 (UTC ISO)", attr: { for: "region-source-mois-published-at" } });
  const publishedInput = publishedControl.createEl("input", {
    attr: {
      id: "region-source-mois-published-at",
      type: "text",
      required: "true",
      placeholder: "2026-06-20T00:00:00.000Z",
      "aria-label": "공식 공표 시각 UTC ISO"
    }
  });

  const registryControl = panel.createDiv({ attr: { class: "region-explorer-control" } });
  registryControl.createEl("label", { text: "수집 범위", attr: { for: "region-source-mois-registry" } });
  const registryInput = registryControl.createEl("select", { attr: { id: "region-source-mois-registry", "aria-label": "수집 범위" } });
  registryInput.createEl("option", { text: "확장 범위 · 83개 지역", attr: { value: "expansion", selected: "selected" } });
  registryInput.createEl("option", { text: "파일럿 · 서울·부산 41개 지역", attr: { value: "pilot" } });

  const command = panel.createEl("textarea", {
    attr: { readonly: "true", rows: "4", class: "region-source-command", "aria-label": "MOIS 공식 원문 수집 명령" }
  });
  command.value = "기간과 공표 시각을 입력한 뒤 명령을 생성하세요.";
  const status = panel.createEl("p", { text: "공식 공표 시각은 원문 제공 화면에서 확인해 입력하세요.", attr: { role: "status", class: "region-source-command-status" } });
  const actions = panel.createDiv({ attr: { class: "region-explorer-row-actions" } });
  const build = actions.createEl("button", { text: "명령 생성", attr: { type: "button", class: "region-explorer-button" } });
  const copy = actions.createEl("button", { text: "명령 복사", attr: { type: "button", class: "region-explorer-button" } });
  copy.disabled = true;
  const close = actions.createEl("button", { text: "닫기", attr: { type: "button", class: "region-explorer-button" } });

  const buildCommand = () => {
    const api = window.RegionSourceMoisCommandCore;
    if (!api || typeof api.buildCommand !== "function") {
      status.setText("공식 원문 명령 모듈을 불러오지 못했습니다.");
      status.setAttr("class", "region-source-command-status is-error");
      status.setAttr("role", "alert");
      return;
    }
    try {
      const vaultRoot = app?.vault?.adapter?.basePath || "";
      command.value = api.buildCommand({
        vault_root: vaultRoot,
        period: periodInput.value,
        published_at: publishedInput.value,
        registry: registryInput.value
      });
      copy.disabled = false;
      status.setText("명령이 준비되었습니다. 데스크톱 터미널에서 실행하세요.");
      status.setAttr("class", "region-source-command-status");
      status.setAttr("role", "status");
    } catch (error) {
      command.value = "";
      copy.disabled = true;
      status.setText(error && error.message ? error.message : "입력값을 확인해 주세요.");
      status.setAttr("class", "region-source-command-status is-error");
      status.setAttr("role", "alert");
    }
  };
  build.onclick = buildCommand;
  copy.onclick = async () => {
    if (!command.value || copy.disabled) return;
    if (!window.navigator?.clipboard?.writeText) {
      status.setText("이 환경에서는 클립보드를 사용할 수 없습니다. 명령을 직접 선택해 복사하세요.");
      status.setAttr("class", "region-source-command-status is-error");
      status.setAttr("role", "alert");
      command.focus?.();
      command.select?.();
      return;
    }
    try {
      await window.navigator.clipboard.writeText(command.value);
      status.setText("명령을 클립보드에 복사했습니다.");
      status.setAttr("class", "region-source-command-status");
      status.setAttr("role", "status");
    } catch (error) {
      status.setText(`클립보드 복사에 실패했습니다. 명령을 직접 선택해 복사하세요${error && error.message ? ` · ${error.message}` : ""}.`);
      status.setAttr("class", "region-source-command-status is-error");
      status.setAttr("role", "alert");
      command.focus?.();
      command.select?.();
    }
  };
  close.onclick = () => {
    sourceCommandMount.empty();
    const returnFocus = sourceCommandReturnFocus;
    sourceCommandReturnFocus = null;
    if (returnFocus && returnFocus.isConnected !== false) {
      try { returnFocus.focus({ preventScroll: true }); }
      catch (_) { returnFocus.focus(); }
    }
  };
  periodInput.focus?.();
  return panel;
};

const initializeRegionWorkspace = async () => {
  let performance = null;
  const phaseTokens = { dataScan: null, projection: null, domRender: null };
  const endPhase = (phase, status) => {
    const token = phaseTokens[phase];
    phaseTokens[phase] = null;
    if (!performance || !token || typeof performance.end !== "function") return;
    performance.end(token, { scope: "region", status });
  };
  const failMeasurement = (error) => {
    endPhase("dataScan", "failed");
    endPhase("projection", "failed");
    endPhase("domRender", "failed");
    if (performance && typeof performance.fail === "function") {
      performance.fail(error, { phase: "error", scope: "region" });
    }
  };
  try {
  for (const modulePath of RegionExplorerHub.modulePaths) await loadReadOnlyModule(modulePath);
  const shell = window.ProdigyWorkspaceNavigation.mount(this.container, {
    app,
    workspaceId: "region",
    title: "지역 비교",
    context: {
      label: "지역 비교 문맥",
      items: ["읽기 전용", "최대 3개 지역 비교"],
      actions: [{ label: "공식 원문 수집", onClick: renderMoisCollectionGuide }]
    }
  });
  performance = shell.performance;
  phaseTokens.dataScan = performance && performance.start("data_scan", { scope: "region" });
  shell.body.setAttr("data-scroll-owner", "region-workspace-body");
  sourceLedgerMount = shell.body.createDiv({ attr: { class: "region-source-ledger-mount" } });
  sourceCommandMount = shell.body.createDiv({ attr: { class: "region-source-command-mount" } });
  const explorerMount = shell.body.createDiv({ attr: { class: "region-workspace-content" } });
  const [projection, registry] = await Promise.all([
    window.RegionExplorerDataSource.loadRegionExplorer({
      vault: app.vault,
      metadataCache: app.metadataCache
    }),
    loadRegistry()
  ]);
  const sourceLedger = await loadSourceLedger(registry);
  renderSourceLedgerStatus(sourceLedger);
  endPhase("dataScan", "loaded");
  phaseTokens.projection = performance && performance.start("projection", { scope: "region" });
  const coveredProjection = attachSourceEvidence(coverageProjection(projection, registry), sourceLedger);
  endPhase("projection", "projected");
  let explorer = null;
  let activeRegionExperienceModal = null;
  let regionExperienceOpening = null;
  const focusLaunchButtonAfterClose = (launchButton) => {
    const focus = () => {
      if (activeRegionExperienceModal || regionExperienceOpening || !launchButton || launchButton.isConnected === false || typeof launchButton.focus !== "function") return;
      try { launchButton.focus({ preventScroll: true }); }
      catch (_) { launchButton.focus(); }
    };
    if (typeof window.setTimeout === "function") window.setTimeout(() => window.setTimeout(focus, 0), 0);
    else if (typeof queueMicrotask === "function") queueMicrotask(focus);
  };
  const openRegionExperience = ({ selectedRegionKeys, returnFocus } = {}) => {
    const regions = validExperienceRegions(coveredProjection);
    const selectedKeys = Array.isArray(selectedRegionKeys) ? selectedRegionKeys : [];
    const selected = regions.filter((region) => selectedKeys.includes(region.region_key));
    if (!regions.length) {
      const hasMalformedHistory = Array.isArray(coveredProjection.rows) && coveredProjection.rows.some((row) => Array.isArray(row && row.diagnostics) && row.diagnostics.some((item) => item && (item.code === "malformed_history" || item.code === "invalid_history_snapshot")));
      explorer.setNotice(hasMalformedHistory ? "지표 히스토리가 올바르지 않은 Region Object에는 경험을 추가할 수 없습니다. 이력을 확인해 주세요." : "유효한 Region Object가 없습니다. Frontmatter와 파일 경로를 확인해 주세요.");
      return Promise.resolve(null);
    }
    if (selected.length !== selectedKeys.length) {
      explorer.setNotice("선택한 지역은 유효한 Region Object가 아닙니다. 다른 권역을 선택해 주세요.");
      return Promise.resolve(null);
    }
    if (regionExperienceOpening) return regionExperienceOpening;
    let opening;
    opening = (async () => {
      try {
        await loadRegionExperienceModules();
        const modal = window.openRegionExperienceModal(app, {
          regions,
          selectedRegions: selected.length === 1 ? selected : [],
          returnFocus
        });
        if (!modal || typeof modal !== "object") throw new Error("지역 경험 모달을 열지 못했습니다.");
        activeRegionExperienceModal = modal;
        const previousClose = modal.onClose;
        modal.onClose = function (...args) {
          const previousReturnFocus = this.returnFocus;
          this.returnFocus = null;
          try { return typeof previousClose === "function" ? previousClose.apply(this, args) : undefined; }
          finally {
            this.returnFocus = previousReturnFocus;
            if (activeRegionExperienceModal === modal) activeRegionExperienceModal = null;
            if (regionExperienceOpening === opening) regionExperienceOpening = null;
            focusLaunchButtonAfterClose(returnFocus);
          }
        };
        return modal;
      } catch (_error) {
        if (regionExperienceOpening === opening) regionExperienceOpening = null;
        activeRegionExperienceModal = null;
        explorer.setNotice("지역 경험 기능을 불러오지 못했습니다. 다시 시도해 주세요.");
        return null;
      }
    })();
    regionExperienceOpening = opening;
    return opening;
  };
const openRegionAuctions = async ({ regionKey, row, regionIdentity } = {}) => {
    const identity = { ...(regionIdentity || {}), ...((row && row.identity) || {}) };
    const firstText = (...values) => values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
    const sido = firstText(identity.sido, row && row.region_sido, regionIdentity && regionIdentity.sido);
    const sigungu = firstText(identity.sigungu, row && row.region_sigungu, regionIdentity && regionIdentity.sigungu);
    const key = typeof regionKey === "string" ? regionKey.trim() : "";
    const auctionPath = typeof (row && row.path) === "string"
      ? row.path.trim()
      : typeof (row && row.file && row.file.path) === "string"
        ? row.file.path.trim()
        : "";
    if (!key || !sido || !sigungu) {
      explorer.setNotice("시·도와 시·군·구가 확인되는 지역만 경매 목록으로 이동할 수 있습니다.");
      return null;
    }
    if (!app.workspace || typeof app.workspace.openLinkText !== "function") {
      explorer.setNotice("경매 워크스페이스를 열 수 없습니다. Obsidian 창을 다시 시도해 주세요.");
      return null;
    }
    const handoffId = `auction-region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const scope = { region_key: key, region_sido: sido, region_sigungu: sigungu };
    window.prodigyAuctionRegionScope = scope;
    const request = {
      request_id: handoffId,
      status: "pending",
      created_at: new Date().toISOString(),
      region_sido: sido,
      region_sigungu: sigungu,
      auction_path: auctionPath || null
    };
    window.prodigyAuctionNavigationRequest = request;
    try {
      const result = await app.workspace.openLinkText("HUB/10 Auction", "HUB/15 Region.md", false);
      if (window.prodigyAuctionNavigationRequest === request) {
        request.status = "opened";
        request.updated_at = new Date().toISOString();
      }
      return result;
    } catch (error) {
      if (window.prodigyAuctionNavigationRequest === request) {
        request.status = "error";
        request.error = String(error && error.message ? error.message : error);
        request.updated_at = new Date().toISOString();
      }
      explorer.setNotice("경매 워크스페이스를 열지 못했습니다. 같은 지역 요청을 유지한 채 다시 시도해 주세요.");
      return null;
    }
};
  const auctionRowsForRegion = () => {
    const dataview = app.plugins?.plugins?.dataview?.api;
    if (!dataview || typeof dataview.pages !== "function") return [];
    const pages = dataview.pages('"PARA/PROJECTS/Auction"');
    const cases = pages && typeof pages.where === "function" ? pages.where((page) => page && page.type === "auction_case") : pages;
    if (cases && typeof cases.array === "function") return cases.array();
    if (Array.isArray(cases)) return cases;
    return [];
  };
  const openRegionDetail = async ({ regionKey, row, returnFocus } = {}) => {
    const identity = row && row.identity || {};
    const sido = typeof identity.sido === "string" ? identity.sido.trim() : "";
    const sigungu = typeof identity.sigungu === "string" ? identity.sigungu.trim() : "";
    const key = typeof regionKey === "string" ? regionKey.trim() : "";
    if (!key || !sido || !sigungu) {
      explorer.setNotice("시·도와 시·군·구가 확인되는 지역만 상세 화면을 열 수 있습니다.");
      return null;
    }
    try {
      const result = await window.RegionIntelligencePopupCore.openPopupForApp(app, key, { auctionRows: auctionRowsForRegion(), now: new Date() });
      if (!result.ok) throw new Error(result.error || "지역 상세 화면을 열지 못했습니다.");
      return window.RegionIntelligencePopupView.openOverlay(result.state, {
        returnFocus,
        onOpenAuction: (auctionRow) => openRegionAuctions({ regionKey: key, row: auctionRow, regionIdentity: { sido, sigungu } })
      });
    } catch (_error) {
      explorer.setNotice("지역 상세 화면을 열지 못했습니다. 다시 시도해 주세요.");
      return null;
    }
  };
  phaseTokens.domRender = performance && performance.start("dom_render", { scope: "region" });
  const initialLogicalWidth = explorerMount.clientWidth > 0 ? explorerMount.clientWidth : window.ProdigyTokens.BREAKPOINTS.wide;
  explorer = window.RegionExplorerView.mountRegionExplorer({
    container: explorerMount,
    projection: coveredProjection,
    logicalWidth: initialLogicalWidth,
    onAddRegionExperience: openRegionExperience,
    onViewRegionDetail: openRegionDetail,
    onViewRegionAuctions: openRegionAuctions
  });
  if (typeof window.ResizeObserver === "function") {
    RegionExplorerHub.resizeObserver = new window.ResizeObserver((entries) => {
      const logicalWidth = entries && entries[0] && entries[0].contentRect && entries[0].contentRect.width;
      if (Number.isFinite(logicalWidth)) explorer.setLogicalWidth(logicalWidth);
    });
    RegionExplorerHub.resizeObserver.observe(explorerMount);
  }
  coverageNotice(explorerMount, coveredProjection);
  endPhase("domRender", "rendered");
  if (performance && typeof shell.readinessSnapshot === "function") {
    const snapshot = shell.readinessSnapshot("region", {
      status: "deterministic",
      settled: true,
      enabledAction: { id: "region.open", enabled: true }
    });
    if (snapshot) performance.markReady("region", snapshot);
  }
} catch (error) {
  failMeasurement(error);
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, {
      title: "지역 비교",
      message: "Region Object와 공식 원문은 읽기 전용입니다. 모듈을 준비하지 못했지만 다시 시도할 수 있습니다.",
      retry: () => window.ProdigyRegionWorkspaceRetry()
    });
  } else {
    this.container.empty();
    const errorBox = this.container.createEl("p", { text: "지역 비교 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
    const retry = errorBox.createEl("button", { text: "다시 시도", attr: { type: "button" } });
    retry.onclick = () => window.ProdigyRegionWorkspaceRetry();
  }
}
};
window.ProdigyRegionWorkspaceRetry = initializeRegionWorkspace;
await initializeRegionWorkspace();
```
