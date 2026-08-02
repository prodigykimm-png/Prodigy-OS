---
cssclasses:
  - hide-properties_reading
---

# 지역 비교

```dataviewjs
if (!this.container) return;
this.container.empty();

window.app = app;
window.RegionExplorerHub = window.RegionExplorerHub || {};

const RegionExplorerHub = window.RegionExplorerHub;
if (RegionExplorerHub.resizeObserver && typeof RegionExplorerHub.resizeObserver.disconnect === "function") RegionExplorerHub.resizeObserver.disconnect();
RegionExplorerHub.resizeObserver = null;
const REGISTRY_INDEX_PATH = "SYSTEM/SCRIPTS/region-metrics-manifest-index.json";
const SCRIPTS_ROOT = "SYSTEM/SCRIPTS/";
RegionExplorerHub.modulePaths = [
  "SYSTEM/Views/design-tokens.js",
  "SYSTEM/Views/workspace-registry.js",
  "SYSTEM/Views/prodigy-workspace-state-store.js",
  "SYSTEM/Views/prodigy-app-shell.js",
  "SYSTEM/Views/workspace-navigation.js",
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
  const tFile = app.vault.getAbstractFileByPath(modulePath);
  if (!tFile) throw new Error(`Region Explorer 모듈을 찾을 수 없습니다: ${modulePath}`);
  const module = { exports: {} };
  const localRequire = typeof require === "function" ? require : fallbackRequire;
  const source = await app.vault.read(tFile);
  (new Function("module", "exports", "require", "window", "globalThis", source))(module, module.exports, localRequire, window, window);
  if (modulePath.endsWith("region-metrics-registry-core.js")) window.RegionMetricsRegistryCore = module.exports;
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

try {
  for (const modulePath of RegionExplorerHub.modulePaths) await loadReadOnlyModule(modulePath);
  const shell = window.ProdigyWorkspaceNavigation.mount(this.container, {
    app,
    workspaceId: "region",
    title: "지역 비교",
    context: { label: "지역 비교 문맥", items: ["읽기 전용", "최대 3개 지역 비교"] }
  });
  shell.body.setAttr("data-scroll-owner", "region-workspace-body");
  const explorerMount = shell.body.createDiv({ attr: { class: "region-workspace-content" } });
  const [projection, registry] = await Promise.all([
    window.RegionExplorerDataSource.loadRegionExplorer({
      vault: app.vault,
      metadataCache: app.metadataCache
    }),
    loadRegistry()
  ]);
  const coveredProjection = coverageProjection(projection, registry);
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
    window.prodigyAuctionRegionScope = { region_key: key, region_sido: sido, region_sigungu: sigungu };
    if (auctionPath) window.prodigyAuctionNavigationRequest = { region_sido: sido, region_sigungu: sigungu, auction_path: auctionPath };
    try {
      return await app.workspace.openLinkText("HUB/10 Auction", "HUB/15 Region.md", false);
    } catch (_error) {
      if (window.prodigyAuctionNavigationRequest && window.prodigyAuctionNavigationRequest.auction_path === auctionPath) delete window.prodigyAuctionNavigationRequest;
      explorer.setNotice("경매 워크스페이스를 열지 못했습니다. 다시 시도해 주세요.");
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
} catch (error) {
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "지역 비교" });
  } else {
    this.container.empty();
    this.container.createEl("p", { text: "지역 비교 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
}
```
