---
cssclasses:
  - hide-properties_reading
card_region: 전체지역
card_type: 전체종류
card_sort: dday_asc
---
```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Expose globals for external scripts
// Last reload: 2026-07-12T16:22:00
window.obsidian = obsidian;
window.app = app;
const ensureAuctionHubStyles = () => {
  if (typeof document === "undefined" || !document.head) return;
  const styleId = "prodigy-auction-hub-adoption-styles";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `
    .auction-hub-shell,
    .auction-hub-section {
      min-inline-size: 0;
      word-break: keep-all;
      overflow-wrap: anywhere;
    }
    .auction-hub-shell *,
    .auction-hub-section * {
      box-sizing: border-box;
      min-inline-size: 0;
    }
    .auction-hub-shell [data-scroll-owner="auction-workspace-body"] {
      scroll-padding-block-end: var(--prodigy-mobile-toolbar-clearance, 0px);
    }
    .auction-hub-status {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ke-space-3, 8px);
      min-inline-size: 0;
      margin-block: var(--ke-space-2, 4px);
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-body, .84rem);
      line-height: var(--ke-leading-body, 1.45);
      overflow-wrap: anywhere;
    }
    .auction-hub-status > * {
      min-inline-size: 0;
      max-inline-size: 100%;
      overflow-wrap: anywhere;
    }
    .auction-hub-stat-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ke-space-4, 12px);
      margin-block-end: var(--ke-space-3, 8px);
      min-inline-size: 0;
    }
    .auction-hub-stat-panel,
    .auction-hub-continue,
    .auction-hub-review-queue,
    .auction-hub-pipeline {
      min-inline-size: 0;
      padding: var(--ke-space-4, 12px);
      border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
      border-radius: var(--ke-radius-panel, 8px);
      background: var(--ke-color-surface-secondary, var(--background-secondary));
      overflow-wrap: anywhere;
    }
    .auction-hub-stat-panel {
      display: flex;
      flex-direction: column;
      gap: var(--ke-space-2, 4px);
    }
    .auction-hub-stat-heading {
      padding-block-end: var(--ke-space-2, 4px);
      border-block-end: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
      color: var(--ke-color-accent, var(--text-accent));
      font-size: var(--ke-type-heading, .92rem);
      font-weight: 700;
      line-height: var(--ke-leading-body, 1.45);
    }
    .auction-hub-stat-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ke-space-3, 8px);
      min-inline-size: 0;
      color: var(--ke-color-text, var(--text-normal));
      font-size: var(--ke-type-body, .84rem);
      line-height: var(--ke-leading-body, 1.45);
    }
    .auction-hub-stat-row > * {
      min-inline-size: 0;
      overflow-wrap: anywhere;
    }
    .auction-hub-stat-label {
      font-weight: 600;
    }
    .auction-hub-stat-value {
      flex: 0 0 auto;
      padding: var(--ke-space-1, 2px) var(--ke-space-2, 4px);
      border-radius: var(--ke-radius-control, 4px);
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .auction-hub-stat-value.is-highlight { background: var(--ke-color-hover, var(--background-modifier-hover)); }
    .auction-hub-stat-value.tone-error { color: var(--ke-color-error, var(--text-error)); }
    .auction-hub-stat-value.tone-accent { color: var(--ke-color-accent, var(--text-accent)); }
    .auction-hub-stat-value.tone-success { color: var(--text-success, var(--ke-color-accent, var(--text-accent))); }
    .auction-hub-stat-value.tone-warning { color: var(--text-warning, var(--ke-color-accent, var(--text-accent))); }
    .auction-hub-stat-value.tone-muted { color: var(--ke-color-muted, var(--text-muted)); }
    .auction-hub-continue {
      margin-block: var(--ke-space-3, 8px);
    }
    .auction-hub-continue-heading {
      margin-block-end: var(--ke-space-2, 4px);
      color: var(--ke-color-accent, var(--text-accent));
      font-size: var(--ke-type-heading, .92rem);
      font-weight: 800;
      line-height: var(--ke-leading-body, 1.45);
    }
    .auction-hub-continue-title {
      display: block;
      min-inline-size: 0;
      font-size: var(--ke-type-heading, .92rem);
      font-weight: 700;
      line-height: var(--ke-leading-body, 1.45);
      overflow-wrap: anywhere;
    }
    .auction-hub-continue-action {
      margin-block-start: var(--ke-space-1, 2px);
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-body, .84rem);
    }
    .auction-hub-continue-reason {
      margin-block-start: var(--ke-space-2, 4px);
      color: var(--text-faint, var(--ke-color-muted, var(--text-muted)));
      font-size: var(--ke-type-label, .72rem);
    }
    .auction-hub-pipeline {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: var(--ke-space-3, 8px);
      overflow-wrap: anywhere;
    }
    .auction-hub-pipeline-step {
      display: flex;
      flex: 0 1 auto;
      flex-direction: column;
      align-items: center;
      gap: var(--ke-space-1, 2px);
      min-inline-size: 4.5rem;
      max-inline-size: 100%;
      padding: var(--ke-space-2, 4px) var(--ke-space-3, 8px);
      border: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
      border-radius: var(--ke-radius-control, 4px);
      background: var(--ke-color-hover, var(--background-modifier-hover));
      overflow-wrap: anywhere;
    }
    .auction-hub-pipeline-label {
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-label, .72rem);
      font-weight: 700;
      line-height: var(--ke-leading-control, 1.35);
      text-align: center;
      white-space: normal;
    }
    .auction-hub-pipeline-count {
      font-size: var(--ke-type-heading, .92rem);
      font-weight: 700;
      line-height: var(--ke-leading-control, 1.35);
    }
    .auction-hub-pipeline-step.tone-error { border-color: var(--ke-color-error, var(--text-error)); }
    .auction-hub-pipeline-step.tone-accent { border-color: var(--ke-color-accent, var(--text-accent)); }
    .auction-hub-pipeline-step.tone-success { border-color: var(--text-success, var(--ke-color-accent, var(--text-accent))); }
    .auction-hub-pipeline-step.tone-warning { border-color: var(--text-warning, var(--ke-color-accent, var(--text-accent))); }
    .auction-hub-pipeline-step.tone-muted { border-color: var(--ke-color-muted, var(--text-muted)); }
    .auction-hub-pipeline-count.tone-error { color: var(--ke-color-error, var(--text-error)); }
    .auction-hub-pipeline-count.tone-accent { color: var(--ke-color-accent, var(--text-accent)); }
    .auction-hub-pipeline-count.tone-success { color: var(--text-success, var(--ke-color-accent, var(--text-accent))); }
    .auction-hub-pipeline-count.tone-warning { color: var(--text-warning, var(--ke-color-accent, var(--text-accent))); }
    .auction-hub-pipeline-count.tone-muted { color: var(--ke-color-muted, var(--text-muted)); }
    .auction-hub-pipeline-arrow {
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-heading, .92rem);
      font-weight: 700;
    }
    .auction-hub-pipeline-group {
      display: flex;
      flex-direction: column;
      gap: var(--ke-space-2, 4px);
      min-inline-size: 0;
    }
    .auction-hub-review-queue {
      margin-block: var(--ke-space-2, 4px) var(--ke-space-4, 12px);
    }
    .auction-hub-review-heading {
      margin-block-end: var(--ke-space-2, 4px);
      color: var(--ke-color-accent, var(--text-accent));
      font-size: var(--ke-type-heading, .92rem);
      font-weight: 800;
    }
    .auction-hub-review-copy {
      margin-block-end: var(--ke-space-3, 8px);
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-label, .72rem);
      line-height: var(--ke-leading-body, 1.45);
    }
    .auction-hub-review-empty {
      padding-block: var(--ke-space-2, 4px);
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-body, .84rem);
      font-style: italic;
    }
    .auction-hub-review-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--ke-space-3, 8px);
      min-inline-size: 0;
      padding-block: var(--ke-space-4, 12px);
      border-block-start: var(--ke-border-width, 1px) solid var(--ke-color-border, var(--background-modifier-border));
    }
    .auction-hub-review-detail {
      flex: 1 1 14rem;
      min-inline-size: 0;
    }
    .auction-hub-review-detail > * {
      min-inline-size: 0;
      overflow-wrap: anywhere;
    }
    .auction-hub-review-meta {
      margin-block-start: var(--ke-space-1, 2px);
      color: var(--ke-color-muted, var(--text-muted));
      font-size: var(--ke-type-label, .72rem);
    }
    .auction-hub-review-reason {
      margin-block-start: var(--ke-space-2, 4px);
      color: var(--ke-color-text, var(--text-normal));
      font-size: var(--ke-type-body, .84rem);
      line-height: var(--ke-leading-body, 1.45);
    }
    .auction-hub-review-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ke-space-2, 4px);
      min-inline-size: 0;
    }
    .auction-hub-review-actions > * {
      min-inline-size: 0;
      max-inline-size: 100%;
    }
    .auction-hub-shell button:focus-visible,
    .auction-hub-section button:focus-visible {
      outline: 2px solid var(--ke-color-accent, var(--text-accent));
      outline-offset: 2px;
    }
    @media (max-width: 767px) {
      .auction-hub-stat-grid {
        grid-template-columns: 1fr;
      }
      .auction-hub-pipeline {
        justify-content: flex-start;
      }
      .auction-hub-shell button,
      .auction-hub-section button {
        min-block-size: var(--ke-touch-target, 44px);
        height: auto;
      }
      .auction-hub-review-actions {
        inline-size: 100%;
      }
      .auction-hub-review-actions > button {
        flex: 1 1 12rem;
        min-block-size: var(--ke-touch-target, 44px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .auction-hub-shell *,
      .auction-hub-section * {
        scroll-behavior: auto !important;
        transition: none !important;
        animation: none !important;
        transform: none !important;
      }
    }
  `;
};

// Mount-scoped, bounded readiness polling shared by every Auction section. A
// section may stay pending while optional scripts arrive, but it can never keep
// a detached timer alive or leave the user with an unbounded spinner.
window.ProdigyAuctionLifecycle = window.ProdigyAuctionLifecycle || (() => {
  const active = new WeakMap();
  const mounted = (container) => {
    if (!container || container.isConnected === false) return false;
    const doc = container.ownerDocument;
    return !doc || !doc.documentElement || typeof doc.documentElement.contains !== "function"
      || doc.documentElement.contains(container);
  };
  const findStatus = (container) => container && typeof container.querySelector === "function"
    ? container.querySelector("[data-auction-loader-status]")
    : null;
  const renderStatus = (state, message, terminal) => {
    if (!mounted(state.container)) return;
    let status = findStatus(state.container);
    if (!status && typeof state.container.createEl === "function") {
      status = state.container.createEl("div", {
        attr: {
          "data-auction-loader-status": "true",
          role: terminal ? "alert" : "status",
          class: "auction-hub-status",
        }
      });
    }
    if (!status) return;
    if (typeof status.empty === "function") status.empty();
    else status.textContent = "";
    if (typeof status.createEl !== "function") {
      status.textContent = message;
      return;
    }
    if (typeof status.setAttr === "function") status.setAttr("role", terminal ? "alert" : "status");
    else if (typeof status.setAttribute === "function") status.setAttribute("role", terminal ? "alert" : "status");
    status.createEl("span", { text: message });
    if (terminal) {
      const retry = status.createEl("button", { text: "다시 시도", attr: { type: "button", class: "prodigy-btn prodigy-btn-chip" } });
      retry.onclick = () => state.retry();
      const cancel = status.createEl("button", { text: "중단", attr: { type: "button", class: "prodigy-btn prodigy-btn-chip" } });
      cancel.onclick = () => {
        state.dispose();
        renderStatus(state, "불러오기를 중단했습니다.", false);
      };
    }
  };
  const clear = (state) => {
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.observer && typeof state.observer.disconnect === "function") state.observer.disconnect();
    state.observer = null;
  };
  const start = (config = {}) => {
    const container = config.container;
    if (!container || typeof config.run !== "function") return { dispose() {} };
    const prior = active.get(container);
    if (prior && typeof prior.dispose === "function") prior.dispose();
    const state = {
      container,
      config: { ...config },
      attempts: 0,
      timer: null,
      observer: null,
      disposed: false,
      rendered: false,
      retry: () => start(state.config),
      dispose: () => {
        if (state.disposed) return;
        state.disposed = true;
        clear(state);
        if (active.get(container) === state) active.delete(container);
      }
    };
    active.set(container, state);
    const finish = (result) => {
      if (result === true) {
        state.rendered = true;
        clear(state);
        if (active.get(container) === state) active.delete(container);
        return true;
      }
      return false;
    };
    const attempt = () => {
      if (state.disposed || !mounted(container)) {
        state.dispose();
        return;
      }
      state.attempts += 1;
      let result = false;
      try {
        result = config.run() === true;
      } catch (error) {
        state.error = error;
      }
      if (finish(result)) return;
      if (!state.rendered && !findStatus(container)) {
        renderStatus(state, `${config.label || "Auction"} 리소스를 불러오는 중...`, false);
      }
      if (state.attempts >= (Number(config.maxAttempts) || 100)) {
        renderStatus(state, `${config.label || "Auction"}을 불러오지 못했습니다. ${state.error?.message || "필수 리소스가 준비되지 않았습니다."}`, true);
        state.dispose();
        return;
      }
      state.timer = window.setTimeout(attempt, Number(config.interval) || 100);
    };
    if (typeof MutationObserver === "function" && container.ownerDocument?.body) {
      state.observer = new MutationObserver(() => {
        if (!mounted(container)) state.dispose();
      });
      state.observer.observe(container.ownerDocument.body, { childList: true, subtree: true });
    }
    attempt();
    return Object.freeze({ dispose: state.dispose, retry: state.retry });
  };
  return Object.freeze({
    start,
    dispose(container) {
      const state = active.get(container);
      if (state) state.dispose();
    }
  });
})();

// Consume one exact Auction handoff only after every destination section has
// reported readiness. Until then the request and scope stay replayable.
const auctionNavigationRequest = window.prodigyAuctionNavigationRequest && typeof window.prodigyAuctionNavigationRequest === "object"
  ? window.prodigyAuctionNavigationRequest
  : null;
const auctionRegionScope = window.prodigyAuctionRegionScope && typeof window.prodigyAuctionRegionScope === "object"
  ? window.prodigyAuctionRegionScope
  : null;
const expectedSections = new Set(["bidding", "watching", "reviewing", "won", "lost", "skipped", "archived"]);
const renderedSections = new Set();
let navigationAcknowledged = false;
const setNavigationStatus = (status, error) => {
  if (!auctionNavigationRequest) return;
  try {
    auctionNavigationRequest.status = status;
    auctionNavigationRequest.updated_at = new Date().toISOString();
    if (error) auctionNavigationRequest.error = String(error && error.message ? error.message : error);
  } catch (_) {
    // A caller may freeze its request object; preserving it is safer than failing load.
  }
};
const acknowledgeNavigation = () => {
  if (navigationAcknowledged || renderedSections.size !== expectedSections.size) return;
  navigationAcknowledged = true;
  setNavigationStatus("consumed");
  if (window.prodigyAuctionNavigationRequest === auctionNavigationRequest) delete window.prodigyAuctionNavigationRequest;
  if (auctionRegionScope && window.prodigyAuctionRegionScope === auctionRegionScope) window.prodigyAuctionRegionScope = null;
  window.prodigyAuctionNavigationReceipt = Object.freeze({
    request_id: auctionNavigationRequest && auctionNavigationRequest.request_id || null,
    status: "consumed",
    consumed_at: new Date().toISOString()
  });
};
setNavigationStatus("loading");
window.ProdigyAuctionNavigationFocus = null;
if (auctionNavigationRequest && typeof auctionNavigationRequest.auction_path === "string" && auctionNavigationRequest.auction_path.trim()) {
  const targetPath = auctionNavigationRequest.auction_path.trim();
  let focusCompleted = false;
  let fallbackScheduled = false;
  const locate = () => {
    if (focusCompleted || typeof document === "undefined") return false;
    const card = Array.from(document.querySelectorAll("[data-auction-path]")).find((element) => element.getAttribute("data-auction-path") === targetPath);
    if (!card) return false;
    const collapsed = typeof card.closest === "function" ? card.closest("details") : null;
    if (collapsed) collapsed.open = true;
    card.setAttribute("data-navigation-focus", "true");
    if (typeof card.scrollIntoView === "function") {
      const reduceMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
    if (typeof card.focus === "function") {
      try { card.focus({ preventScroll: true }); }
      catch (_) { card.focus(); }
    }
    focusCompleted = true;
    window.setTimeout(() => card.removeAttribute("data-navigation-focus"), 1800);
    return true;
  };
  const scheduleLocate = () => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(locate);
    else window.setTimeout(locate, 0);
  };
  const markSection = (status) => {
    if (expectedSections.has(status)) renderedSections.add(status);
    scheduleLocate();
    if (renderedSections.size === expectedSections.size) {
      acknowledgeNavigation();
      if (!fallbackScheduled) {
        fallbackScheduled = true;
        window.setTimeout(() => {
          if (locate()) return;
          focusCompleted = true;
          window.ProdigyAuctionNavigationFocus = null;
          if (typeof Notice !== "undefined") new Notice("선택한 경매 카드가 현재 필터에 보이지 않습니다. 지역 필터와 카드 상태를 확인해 주세요.");
        }, 120);
      }
    }
  };
  window.ProdigyAuctionNavigationFocus = Object.freeze({ targetPath, markSection });
} else if (auctionRegionScope) {
  // Scope-only opens still clear once all sections have consumed the destination.
  window.ProdigyAuctionNavigationFocus = Object.freeze({ markSection: (status) => {
    if (expectedSections.has(status)) renderedSections.add(status);
    acknowledgeNavigation();
  } });
}

// Dynamic script loader helper
let activeLoadPath = "로더 시작";
const loadProdigyScript = async (path) => {
  activeLoadPath = path;
  const tFile = app.vault.getAbstractFileByPath(path);
  if (!tFile) throw new Error(`필수 스크립트 파일이 없습니다: ${path}`);
  const content = await app.vault.read(tFile);
  try {
    (new Function(content))();
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.prodigyLoadPath = path;
    throw wrapped;
  }
};

ensureAuctionHubStyles();
const initializeAuctionWorkspace = async () => {
  setNavigationStatus("loading");
  try {
  await loadProdigyScript("SYSTEM/Views/design-tokens.js");
  await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-recorder.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-readiness.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-performance-exporter.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-measurement.js");
  await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
  await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
  await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
  await loadProdigyScript("SYSTEM/Views/shared-dashboard.js");
  await loadProdigyScript("SYSTEM/Views/site-visit-data.js");
  await loadProdigyScript("SYSTEM/Views/site-visit-workflow.js");
  activeLoadPath = "site-visit-workflow 초기화";
  if (window.prodigySiteVisitReady) await window.prodigySiteVisitReady;
  await loadProdigyScript("SYSTEM/Views/auction-region-core.js");
  await loadProdigyScript("SYSTEM/Views/region-explorer-projection.js");
  await loadProdigyScript("SYSTEM/Views/region-decision-context-core.js");
  await loadProdigyScript("SYSTEM/Views/region-decision-view-model.js");
  await loadProdigyScript("SYSTEM/Views/region-collection-health-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-decision-mirror-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-decision-support-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-ai-decision-support-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-ai-decision-support.js");
  await loadProdigyScript("SYSTEM/Views/auction-region-packet.js");
  await loadProdigyScript("SYSTEM/Views/region-intelligence-popup-store.js");
  await loadProdigyScript("SYSTEM/Views/region-intelligence-popup-core.js");
  await loadProdigyScript("SYSTEM/Views/region-intelligence-popup-view.js");
  await loadProdigyScript("SYSTEM/Views/decision-packet-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-decision-packet.js");
  await loadProdigyScript("SYSTEM/Views/decision-packet-reasons.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-use-body-core.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-use-body-store.js");
  await loadProdigyScript("SYSTEM/Views/knowledge-use-record-ui.js");
  await loadProdigyScript("SYSTEM/Views/auction-card-price-projection.js");
  await loadProdigyScript("SYSTEM/Views/auction-learning-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-outcome-writer.js");
  await loadProdigyScript("SYSTEM/Views/real-estate-source-runtime.js");
  await loadProdigyScript("SYSTEM/Views/auction-source-approval-writer.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-response.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-schema.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-error-policy.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-fallback.js");
  await loadProdigyScript("SYSTEM/Views/codex-exec-service.js");
  await loadProdigyScript("SYSTEM/Views/antigravity-exec-service.js");
  await loadProdigyScript("SYSTEM/Views/ai-context-envelope.js");
  await loadProdigyScript("SYSTEM/Views/ai-provider-service.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-config-service.js");
  await loadProdigyScript("SYSTEM/Views/auction-ai-provider-resolver.js");
  await loadProdigyScript("SYSTEM/Views/auction-real-estate-research-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-real-estate-source-runner.js");
  await loadProdigyScript("SYSTEM/Views/auction-real-estate-research.js");
  // Snapshot the full Dataview index once for this dashboard render. Cards and
  // Auction Day only consume this immutable context; they never re-query Vault.
  activeLoadPath = "Dataview 결정 패킷 인덱스";
  const packetDataview = app.plugins?.plugins?.dataview?.api;
  const packetPages = packetDataview && typeof packetDataview.pages === "function"
    ? packetDataview.pages("").array()
    : [];
  window.AuctionDecisionPacketDashboardContext = window.AuctionDecisionPacket
    ? window.AuctionDecisionPacket.createDashboardContext(packetPages)
    : null;
  window.AuctionDecisionMirrorDashboardContext = window.AuctionDecisionMirrorCore
    ? window.AuctionDecisionMirrorCore.snapshotAuctionCases(packetPages)
    : null;
  await loadProdigyScript("SYSTEM/Views/auction-card.js");
  await loadProdigyScript("SYSTEM/Views/bid-calendar-core.js");
  await loadProdigyScript("SYSTEM/Views/bid-calendar-view.js");
  await loadProdigyScript("SYSTEM/Views/auction-day-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-day-view.js");
  activeLoadPath = "워크스페이스 탐색 UI";
  const regionScope = window.prodigyAuctionRegionScope && typeof window.prodigyAuctionRegionScope === "object"
    ? window.prodigyAuctionRegionScope
    : null;
  const auctionShell = window.ProdigyWorkspaceNavigation.mount(container, {
    app,
    workspaceId: "auction",
    title: "경매",
    context: {
      label: "현재 문맥",
      items: regionScope && regionScope.region_sido && regionScope.region_sigungu
        ? [`지역 필터 · ${regionScope.region_sido} ${regionScope.region_sigungu}`]
        : []
    }
  });
  if (auctionShell.element && auctionShell.element.classList) auctionShell.element.classList.add("auction-hub-shell");
  if (auctionShell.body) {
    if (typeof auctionShell.body.setAttr === "function") auctionShell.body.setAttr("data-scroll-owner", "auction-workspace-body");
    else if (typeof auctionShell.body.setAttribute === "function") auctionShell.body.setAttribute("data-scroll-owner", "auction-workspace-body");
  }
  setNavigationStatus("ready");
} catch (err) {
  setNavigationStatus("error", err);
  const failedStage = err && err.prodigyLoadPath ? err.prodigyLoadPath : activeLoadPath;
  window.ProdigyAuctionWorkspaceRetry = initializeAuctionWorkspace;
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(container, err, {
      title: "경매",
      failedStage,
      message: "필수 리소스를 준비하지 못했습니다. 같은 지역 요청을 유지한 채 다시 시도하세요.",
      retry: () => window.ProdigyAuctionWorkspaceRetry()
    });
  } else {
    container.empty();
    const errorBox = container.createEl("p", { text: "경매 워크스페이스를 불러오지 못했습니다.", attr: { class: "auction-hub-status", role: "alert" } });
    const retry = errorBox.createEl("button", { text: "다시 시도", attr: { type: "button" } });
    retry.onclick = () => window.ProdigyAuctionWorkspaceRetry();
  }
}
};
window.ProdigyAuctionWorkspaceRetry = initializeAuctionWorkspace;
await initializeAuctionWorkspace();
```

[[15 Region|지역 비교]] — 기존 지역 Object의 지표와 근거를 읽기 전용으로 비교합니다.

# 오늘

```dataviewjs
if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-today");
// Calculate counts and progress stats
let todayBiddingCount = 0;
let pendingSiteVisitsCount = 0;
let missingExpectedCount = 0;
let wonThisMonthCount = 0;
let reviewsCompletedThisMonthCount = 0;

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth(); // 0-11
const todayStr = `${currentYear}-${String(currentMonth+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const cases = dv.pages('"PARA/PROJECTS/Auction"').where(p => p.type === "auction_case");
const toPlainArray = (value) => {
  if (!value) return [];
  if (typeof value.array === "function") return value.array();
  if (Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  return [];
};
const responsiveTokens = window.ProdigyTokens;
const dashboardLogicalWidth = this.container.clientWidth > 0
  ? this.container.clientWidth
  : responsiveTokens.BREAKPOINTS.wide;
const compactDashboard = dashboardLogicalWidth < responsiveTokens.BREAKPOINTS.medium;

toPlainArray(cases).forEach(p => {
  // 1. Today Bidding
  if (p.status === "bidding" && p.auction_datetime) {
    const cleanStr = String(p.auction_datetime).split(' ')[0].split('T')[0];
    if (cleanStr === todayStr) {
      todayBiddingCount++;
    }
  }
  
  // 2. Today's Site Visits (Bidding status and site_visit_date is empty)
  if (p.status === "bidding") {
    const svd = p.site_visit_date;
    if (!svd || svd === "정보 없음" || String(svd).trim() === "") {
      pendingSiteVisitsCount++;
    }
  }
  
  // 3. Missing Expected Bid (Bidding status and expected_bid is missing)
  if (p.status === "bidding") {
    const exp = p.expected_bid;
    if (!exp || exp === "정보 없음" || String(exp).trim() === "") {
      missingExpectedCount++;
    }
  }
  
  // 4. Won This Month (Won status updated in the current month)
  if (p.status === "won" && p.updated) {
    const date = new Date(p.updated);
    if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
      wonThisMonthCount++;
    }
  }
  
  // 5. Reviews Completed This Month (Archived status updated in the current month)
  if (p.status === "archived" && p.updated) {
    const date = new Date(p.updated);
    if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
      reviewsCompletedThisMonthCount++;
    }
  }
});

const mainBox = this.container.createEl('div', {
  attr: { class: "auction-hub-stat-grid" }
});

// Left Box: Actions Needed
const statsBox = mainBox.createEl('div', {
  attr: { class: "auction-hub-stat-panel" }
});
statsBox.createEl('div', { text: '오늘 할 일', attr: { class: "auction-hub-stat-heading" } });

const addStatItem = (parent, label, count, color, isHighlight) => {
  const row = parent.createEl('div', { attr: { class: "auction-hub-stat-row" } });
  row.createEl('span', { text: label, attr: { class: "auction-hub-stat-label" } });
  row.createEl('span', {
    text: `${count}건`,
    attr: { class: `auction-hub-stat-value tone-${color}${isHighlight ? " is-highlight" : ""}` }
  });
};

addStatItem(statsBox, '오늘 입찰', todayBiddingCount, 'error', todayBiddingCount > 0);
addStatItem(statsBox, '임장 미완료', pendingSiteVisitsCount, 'accent', pendingSiteVisitsCount > 0);
addStatItem(statsBox, '예상입찰가 누락', missingExpectedCount, 'warning', missingExpectedCount > 0);

// Right Box: Monthly Progress
const progressBox = mainBox.createEl('div', {
  attr: { class: "auction-hub-stat-panel" }
});
progressBox.createEl('div', { text: '이번 달 진행 현황', attr: { class: "auction-hub-stat-heading" } });

addStatItem(progressBox, '이번 달 낙찰', wonThisMonthCount, 'success', wonThisMonthCount > 0);
addStatItem(progressBox, '이번 달 복기 완료', reviewsCompletedThisMonthCount, 'warning', reviewsCompletedThisMonthCount > 0);

// Continue target from Object Engine Runtime (same as Launcher; no layout redesign)
try {
  if (window.ObjectEngine && window.ObjectEngine.evaluateObjects && window.ObjectEngine.buildWorkspaceSummary) {
    const pages = toPlainArray(cases).map(p => Object.assign({}, p, {
      type: p.type || "auction_case",
      path: (p.file && p.file.path) || p.path || "",
      name: p.case_number || (p.file && p.file.name) || p.name || ""
    }));
    const states = window.ObjectEngine.evaluateObjects(pages);
    const summary = window.ObjectEngine.buildWorkspaceSummary(states, "auction", {});
    const cont = summary && summary.continue_target;
    const contBox = this.container.createEl("div", {
      attr: { class: "auction-hub-continue" }
    });
    contBox.createEl("div", {
      text: "▶ 계속",
      attr: { class: "auction-hub-continue-heading" }
    });
    if (cont) {
      contBox.createEl("div", {
        text: cont.label || "경매 물건",
        attr: { class: "auction-hub-continue-title" }
      });
      contBox.createEl("div", {
        text: cont.action || "",
        attr: { class: "auction-hub-continue-action" }
      });
      if (cont.reason) {
        contBox.createEl("div", {
          text: cont.reason,
          attr: { class: "auction-hub-continue-reason" }
        });
      }
    } else {
      contBox.createEl("div", {
        text: "진행 중인 작업이 없습니다.",
        attr: { class: "auction-hub-review-empty" }
      });
    }
  }
} catch (_engineErr) {
  // Engine optional — Today stats remain
}
```

---

# 입찰 일정

```dataviewjs
// Bid Calendar: time navigation only (does not edit Objects)
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-calendar");
  if (window.BidCalendarCore && window.BidCalendarView) {
    this.container.empty();
    const pages = dv.pages('"PARA/PROJECTS/Auction"')
      .where(p => p.type === "auction_case")
      .array();
    window.BidCalendarView.render({
      container: this.container,
      pages,
      app: app,
      now: new Date()
    });
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "입찰 일정 캘린더",
  run
});
```

---

# 경매 진행 현황

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
if (container.classList) container.classList.add("auction-hub-section", "auction-hub-pipeline-section");
container.empty();

const files = app.vault.getFiles().filter(f =>
  f.path.startsWith("PARA/PROJECTS/Auction/") && f.extension === "md"
);

if (!window.prodigyDisplay) {
  const registryFile = app.vault.getAbstractFileByPath("SYSTEM/Views/display-registry.js");
  if (!registryFile) throw new Error("Display Registry 파일을 찾을 수 없습니다.");
  const registrySource = await app.vault.read(registryFile);
  (new Function(registrySource))();
}

const counts = { watching: 0, bidding: 0, skipped: 0, won: 0, lost: 0, reviewing: 0, archived: 0 };

files.forEach(f => {
  const c = app.metadataCache.getFileCache(f);
  const fm = c?.frontmatter;
  if (fm?.type === "auction_case") {
    if (counts[fm.status] !== undefined) {
      counts[fm.status]++;
    }
  }
});

const pipelineBox = container.createEl('div', {
  attr: { class: "auction-hub-pipeline" }
});

const makeStep = (parent, label, count, color) => {
  const step = parent.createEl('div', {
    attr: { class: `auction-hub-pipeline-step tone-${color}` }
  });
  step.createEl('span', { text: label, attr: { class: "auction-hub-pipeline-label" } });
  step.createEl('span', { text: String(count), attr: { class: `auction-hub-pipeline-count tone-${color}` } });
  return step;
};

const makeGroup = (parent) => {
  return parent.createEl('div', {
    attr: { class: "auction-hub-pipeline-group" }
  });
};

const makeArrow = (parent) => {
  parent.createEl('div', {
    text: '→',
    attr: { class: "auction-hub-pipeline-arrow" }
  });
};

const display = window.prodigyDisplay;
const statusStep = (status) => {
  const info = display.statusInfo(status);
  return `${info.icon} ${info.label}`.trim();
};

makeStep(pipelineBox, statusStep('watching'), counts.watching, 'muted');
makeArrow(pipelineBox);
makeStep(pipelineBox, statusStep('bidding'), counts.bidding, 'accent');
makeArrow(pipelineBox);

const grp1 = makeGroup(pipelineBox);
makeStep(grp1, statusStep('won'), counts.won, 'success');
makeStep(grp1, statusStep('lost'), counts.lost, 'error');

makeArrow(pipelineBox);
makeStep(pipelineBox, statusStep('reviewing'), counts.reviewing, 'warning');
makeArrow(pipelineBox);

const grp2 = makeGroup(pipelineBox);
makeStep(grp2, statusStep('skipped'), counts.skipped, 'muted');
makeStep(grp2, statusStep('archived'), counts.archived, 'muted');
```

---

## 입찰 예정

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-bidding");
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    const logicalWidth = this.container.clientWidth > 0
      ? this.container.clientWidth
      : window.ProdigyTokens.BREAKPOINTS.wide;
    window.renderDashboardSection({
      dv: dv,
      status: "bidding",
      type: "auction_case",
      container: this.container,
      renderer: (page, target) => window.renderAuctionCard(page, target, {
        decisionPacketContext: window.AuctionDecisionPacketDashboardContext,
        logicalWidth
      }),
      emptyMessage: "해당 조건의 입찰 예정 물건이 없습니다.",
      sortField: "auction_datetime",
      sortOrder: "asc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("bidding");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "입찰 예정",
  run
});
```

---

## 관심

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-watching");
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    const logicalWidth = this.container.clientWidth > 0
      ? this.container.clientWidth
      : window.ProdigyTokens.BREAKPOINTS.wide;
    window.renderDashboardSection({
      dv: dv,
      status: "watching",
      type: "auction_case",
      container: this.container,
      renderer: (page, target) => window.renderAuctionCard(page, target, {
        decisionPacketContext: window.AuctionDecisionPacketDashboardContext,
        logicalWidth
      }),
      emptyMessage: "해당 조건의 검토 중인 물건이 없습니다.",
      sortField: "auction_datetime",
      sortOrder: "asc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("watching");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "관심",
  run
});
```

---

## 복기 대기

```dataviewjs
// Post-result queue: won/lost before reviewing, reviewing in progress, skipped before archive
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-review-queue");
  if (!window.AuctionDayCore || !window.AuctionDayCore.buildReviewQueue) return false;
  this.container.empty();
  const pages = dv.pages('"PARA/PROJECTS/Auction"')
    .where(p => p.type === "auction_case")
    .array()
    .map(p => Object.assign({}, p, {
      type: p.type || "auction_case",
      path: (p.file && p.file.path) || p.path || "",
      file: p.file
    }));
  const queue = window.AuctionDayCore.buildReviewQueue(pages);
  const box = this.container.createEl("div", {
    attr: { class: "auction-hub-review-queue" }
  });
  box.createEl("div", {
    text: "복기 대기",
    attr: { class: "auction-hub-review-heading" }
  });
  box.createEl("div", {
    text: "결과 기록 후 닫을 일. 새 Property 없이 기존 status만 사용합니다.",
    attr: { class: "auction-hub-review-copy" }
  });
  if (!queue.length) {
    box.createEl("div", {
      text: "복기 대기 물건이 없습니다.",
      attr: { class: "auction-hub-review-empty" }
    });
    return true;
  }
  const stageLabel = {
    pending_review: "복기 시작 전",
    in_progress: "복기 중",
    pending_close: "보관 전"
  };
  const statusLabel = (s) => (window.prodigyDisplay && window.prodigyDisplay.status)
    ? window.prodigyDisplay.status(s)
    : s;
  queue.forEach((item) => {
    const row = box.createEl("div", {
      attr: { class: "auction-hub-review-row" }
    });
    const left = row.createEl("div", { attr: { class: "auction-hub-review-detail" } });
    left.createEl("div", {
      text: item.case_number || item.title,
      attr: { class: "auction-hub-continue-title" }
    });
    left.createEl("div", {
      text: `${statusLabel(item.status)} · ${stageLabel[item.stage] || item.stage}`,
      attr: { class: "auction-hub-review-meta" }
    });
    left.createEl("div", {
      text: item.reason,
      attr: { class: "auction-hub-review-reason" }
    });
    const actions = row.createEl("div", {
      attr: { class: "auction-hub-review-actions" }
    });
    const openBtn = actions.createEl("button", {
      text: "원본 열기",
      attr: { type: "button", class: "prodigy-btn" }
    });
    openBtn.onclick = () => app.workspace.openLinkText(item.path, item.path, false);
    if (item.stage === "pending_review" && item.next_status === "reviewing") {
      const startBtn = actions.createEl("button", {
        text: "복기 시작",
        attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" }
      });
      startBtn.onclick = async () => {
        try {
          startBtn.disabled = true;
          const tFile = app.vault.getAbstractFileByPath(item.path);
          if (!tFile) throw new Error("Object를 찾을 수 없습니다.");
          const today = window.AuctionDayCore.isoToday();
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = "reviewing";
            fm.updated = today;
          });
          if (typeof Notice !== "undefined") new Notice("복기를 시작했습니다.");
          // Dataview will refresh on metadata change
        } catch (err) {
          if (typeof Notice !== "undefined") new Notice(err.message || String(err));
          startBtn.disabled = false;
        }
      };
    } else if (item.stage === "in_progress" || item.stage === "pending_close") {
      const archBtn = actions.createEl("button", {
        text: item.stage === "pending_close" ? "보관" : "복기 완료·보관",
        attr: { type: "button", class: "prodigy-btn" }
      });
      archBtn.onclick = async () => {
        try {
          archBtn.disabled = true;
          const tFile = app.vault.getAbstractFileByPath(item.path);
          if (!tFile) throw new Error("Object를 찾을 수 없습니다.");
          const today = window.AuctionDayCore.isoToday();
          await app.fileManager.processFrontMatter(tFile, (fm) => {
            fm.status = "archived";
            fm.updated = today;
            if (!fm.review_date) fm.review_date = today;
          });
          if (typeof Notice !== "undefined") new Notice("보관으로 옮겼습니다.");
        } catch (err) {
          if (typeof Notice !== "undefined") new Notice(err.message || String(err));
          archBtn.disabled = false;
        }
      };
    }
  });
  return true;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "복기 대기 큐",
  run
});
```

---

## 복기 중

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-reviewing");
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "reviewing",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 복기 중인 물건이 없습니다.",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("reviewing");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "복기 중",
  run
});
```

---

## 낙찰

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-won");
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "won",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 낙찰 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "낙찰 물건 목록",
      summaryColor: "var(--text-success, var(--text-accent))",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("won");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "낙찰",
  run
});
```

## 패찰

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-lost");
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "lost",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 패찰 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "패찰 물건 목록",
      summaryColor: "var(--text-error)",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("lost");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "패찰",
  run
});
```

## ❌ 입찰 포기

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-skipped");
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "skipped",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 입찰 포기 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "❌ 입찰 포기 물건 목록",
      summaryColor: "var(--text-muted)",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("skipped");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "입찰 포기",
  run
});
```

## 보관

```dataviewjs
const run = () => {
  if (this.container.classList) this.container.classList.add("auction-hub-section", "auction-hub-archived");
  if (window.renderDashboardSection && window.renderAuctionCard) {
    this.container.empty();
    window.renderDashboardSection({
      dv: dv,
      status: "archived",
      type: "auction_case",
      container: this.container,
      renderer: window.renderAuctionCard,
      emptyMessage: "해당 조건의 보관 물건이 없습니다.",
      isCollapsed: true,
      summaryText: "보관 물건 목록",
      summaryColor: "var(--ke-color-muted, var(--text-muted))",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("archived");
    return true;
  }
  return false;
};
window.ProdigyAuctionLifecycle.start({
  container: this.container,
  label: "보관",
  run
});
```
```
