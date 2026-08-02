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

// Consume an exact Auction handoff once. Each status section reports when it has
// rendered, then this session-only runtime reveals and focuses the matching card.
const auctionNavigationRequest = window.prodigyAuctionNavigationRequest && typeof window.prodigyAuctionNavigationRequest === "object"
  ? window.prodigyAuctionNavigationRequest
  : null;
delete window.prodigyAuctionNavigationRequest;
window.ProdigyAuctionNavigationFocus = null;
if (auctionNavigationRequest && typeof auctionNavigationRequest.auction_path === "string" && auctionNavigationRequest.auction_path.trim()) {
  const targetPath = auctionNavigationRequest.auction_path.trim();
  const expectedSections = new Set(["bidding", "watching", "reviewing", "won", "lost", "skipped", "archived"]);
  const renderedSections = new Set();
  let completed = false;
  let fallbackScheduled = false;
  const locate = () => {
    if (completed || typeof document === "undefined") return false;
    const card = Array.from(document.querySelectorAll("[data-auction-path]")).find((element) => element.getAttribute("data-auction-path") === targetPath);
    if (!card) return false;
    const collapsed = typeof card.closest === "function" ? card.closest("details") : null;
    if (collapsed) collapsed.open = true;
    card.setAttribute("data-navigation-focus", "true");
    if (typeof card.scrollIntoView === "function") card.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof card.focus === "function") {
      try { card.focus({ preventScroll: true }); }
      catch (_) { card.focus(); }
    }
    completed = true;
    window.setTimeout(() => card.removeAttribute("data-navigation-focus"), 1800);
    window.ProdigyAuctionNavigationFocus = null;
    return true;
  };
  const scheduleLocate = () => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(locate);
    else window.setTimeout(locate, 0);
  };
  const markSection = (status) => {
    if (completed) return;
    if (expectedSections.has(status)) renderedSections.add(status);
    scheduleLocate();
    if (renderedSections.size === expectedSections.size && !fallbackScheduled) {
      fallbackScheduled = true;
      window.setTimeout(() => {
        if (locate()) return;
        completed = true;
        window.ProdigyAuctionNavigationFocus = null;
        if (typeof Notice !== "undefined") new Notice("선택한 경매 카드가 현재 필터에 보이지 않습니다. 지역 필터와 카드 상태를 확인해 주세요.");
      }, 120);
    }
  };
  window.ProdigyAuctionNavigationFocus = Object.freeze({ targetPath, markSection });
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

try {
  await loadProdigyScript("SYSTEM/Views/design-tokens.js");
  await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
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
  await loadProdigyScript("SYSTEM/Views/auction-region-packet.js");
  await loadProdigyScript("SYSTEM/Views/region-decision-view-model.js");
  await loadProdigyScript("SYSTEM/Views/region-collection-health-core.js");
  await loadProdigyScript("SYSTEM/Views/auction-decision-mirror-core.js");
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
  window.ProdigyWorkspaceNavigation.mount(container, {
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
} catch (err) {
  const failedStage = err && err.prodigyLoadPath ? err.prodigyLoadPath : activeLoadPath;
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(container, err, { title: "경매", failedStage });
  } else {
    container.empty();
    container.createEl("p", { text: "경매 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
  return;
}
```

[[15 Region|지역 비교]] — 기존 지역 Object의 지표와 근거를 읽기 전용으로 비교합니다.

# 🎯 오늘

```dataviewjs
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
  attr: { style: `display:grid;grid-template-columns:${compactDashboard ? '1fr' : '1fr 1fr'};gap:12px;margin-bottom:8px;` }
});

// Left Box: Actions Needed
const statsBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.2);' }
});
statsBox.createEl('div', { text: '🎯 오늘 할 일', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

const addStatItem = (parent, label, count, color, isHighlight) => {
  const row = parent.createEl('div', { attr: { style: 'display:flex;justify-content:space-between;align-items:center;font-size:0.85em;' } });
  row.createEl('span', { text: label, attr: { style: 'color:var(--text-normal); font-weight: 550;' } });
  row.createEl('span', {
    text: `${count}건`,
    attr: {
      style: `font-weight:bold;color:${color};background:${isHighlight ? color+'15' : 'transparent'};padding:${isHighlight ? '2px 6px' : '0'};border-radius:4px;`
    }
  });
};

addStatItem(statsBox, '🔥 오늘 입찰', todayBiddingCount, '#ef4444', todayBiddingCount > 0);
addStatItem(statsBox, '⚠️ 임장 미완료', pendingSiteVisitsCount, '#3b82f6', pendingSiteVisitsCount > 0);
addStatItem(statsBox, '⚠️ 예상입찰가 누락', missingExpectedCount, '#eab308', missingExpectedCount > 0);

// Right Box: Monthly Progress
const progressBox = mainBox.createEl('div', {
  attr: { style: 'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;box-shadow: 0 4px 8px rgba(0,0,0,0.2);' }
});
progressBox.createEl('div', { text: '✨ 이번 달 진행 현황', attr: { style: 'font-weight:bold;font-size:0.95em;color:var(--text-accent);border-bottom:1px solid var(--background-modifier-border);padding-bottom:4px;' } });

addStatItem(progressBox, '🏆 이번 달 낙찰', wonThisMonthCount, '#22c55e', wonThisMonthCount > 0);
addStatItem(progressBox, '🔄 이번 달 복기 완료', reviewsCompletedThisMonthCount, '#f97316', reviewsCompletedThisMonthCount > 0);

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
      attr: {
        style: "margin:8px 0 4px;padding:10px 12px;border-radius:10px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);"
      }
    });
    contBox.createEl("div", {
      text: "▶ 계속",
      attr: { style: "font-weight:800;font-size:0.88em;color:var(--text-accent);margin-bottom:4px;" }
    });
    if (cont) {
      contBox.createEl("div", {
        text: cont.label || "경매 물건",
        attr: { style: "font-weight:700;font-size:0.92em;" }
      });
      contBox.createEl("div", {
        text: cont.action || "",
        attr: { style: "font-size:0.84em;color:var(--text-muted);margin-top:2px;" }
      });
      if (cont.reason) {
        contBox.createEl("div", {
          text: cont.reason,
          attr: { style: "font-size:0.78em;color:var(--text-faint);margin-top:4px;" }
        });
      }
    } else {
      contBox.createEl("div", {
        text: "진행 중인 작업이 없습니다.",
        attr: { style: "font-size:0.85em;color:var(--text-muted);font-style:italic;" }
      });
    }
  }
} catch (_engineErr) {
  // Engine optional — Today stats remain
}
```

---

# 📅 입찰 일정

```dataviewjs
// Bid Calendar: time navigation only (does not edit Objects)
const run = () => {
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
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 입찰 일정 캘린더를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

# 경매 진행 현황

```js-engine
const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
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
  attr: { style: 'display: flex; gap: 8px; justify-content: space-around; align-items: center; background: var(--background-secondary); padding: 12px; border-radius: 10px; border: 1px solid var(--background-modifier-border); overflow-x: auto;' }
});

const makeStep = (parent, label, count, color) => {
  const step = parent.createEl('div', {
    attr: { style: `display: flex; flex-direction: column; align-items: center; background: var(--background-modifier-hover); border: 1px solid ${color}; border-radius: 6px; padding: 4px 8px; min-width: 70px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); flex-shrink: 0;` }
  });
  step.createEl('span', { text: label, attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: bold; white-space: nowrap;' } });
  step.createEl('span', { text: String(count), attr: { style: `font-size: 1.1em; font-weight: bold; color: ${color};` } });
  return step;
};

const makeGroup = (parent) => {
  return parent.createEl('div', {
    attr: { style: 'display: flex; flex-direction: column; gap: 6px;' }
  });
};

const makeArrow = (parent) => {
  parent.createEl('div', {
    text: '→',
    attr: { style: 'font-size: 1.2em; color: var(--text-muted); font-weight: bold;' }
  });
};

const display = window.prodigyDisplay;
const statusStep = (status) => {
  const info = display.statusInfo(status);
  return `${info.icon} ${info.label}`.trim();
};

makeStep(pipelineBox, statusStep('watching'), counts.watching, '#888');
makeArrow(pipelineBox);
makeStep(pipelineBox, statusStep('bidding'), counts.bidding, '#3b82f6');
makeArrow(pipelineBox);

const grp1 = makeGroup(pipelineBox);
makeStep(grp1, statusStep('won'), counts.won, '#22c55e');
makeStep(grp1, statusStep('lost'), counts.lost, '#ef4444');

makeArrow(pipelineBox);
makeStep(pipelineBox, statusStep('reviewing'), counts.reviewing, '#f97316');
makeArrow(pipelineBox);

const grp2 = makeGroup(pipelineBox);
makeStep(grp2, statusStep('skipped'), counts.skipped, '#666');
makeStep(grp2, statusStep('archived'), counts.archived, '#555');
```

---

## ⚖️ 입찰 예정

```dataviewjs
const run = () => {
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
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 👀 관심

```dataviewjs
const run = () => {
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
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 🔄 복기 대기

```dataviewjs
// Post-result queue: won/lost before reviewing, reviewing in progress, skipped before archive
const run = () => {
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
    attr: {
      style: "background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:12px;margin:4px 0 12px;box-shadow:0 2px 6px rgba(0,0,0,0.08);"
    }
  });
  box.createEl("div", {
    text: "🔄 복기 대기",
    attr: { style: "font-weight:800;font-size:0.95em;color:var(--text-accent);margin-bottom:6px;" }
  });
  box.createEl("div", {
    text: "결과 기록 후 닫을 일. 새 Property 없이 기존 status만 사용합니다.",
    attr: { style: "font-size:0.78em;color:var(--text-muted);margin-bottom:10px;line-height:1.4;" }
  });
  if (!queue.length) {
    box.createEl("div", {
      text: "복기 대기 물건이 없습니다.",
      attr: { style: "font-size:0.85em;color:var(--text-muted);font-style:italic;padding:6px 0;" }
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
      attr: {
        style: "display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 0;border-top:1px solid var(--background-modifier-border);"
      }
    });
    const left = row.createEl("div", { attr: { style: "min-width:0;flex:1 1 auto;" } });
    left.createEl("div", {
      text: item.case_number || item.title,
      attr: { style: "font-weight:700;font-size:0.92em;" }
    });
    left.createEl("div", {
      text: `${statusLabel(item.status)} · ${stageLabel[item.stage] || item.stage}`,
      attr: { style: "font-size:0.78em;color:var(--text-muted);margin-top:2px;" }
    });
    left.createEl("div", {
      text: item.reason,
      attr: { style: "font-size:0.82em;color:var(--text-normal);margin-top:4px;line-height:1.4;" }
    });
    const actions = row.createEl("div", {
      attr: { style: "display:flex;gap:6px;flex-wrap:wrap;align-items:center;" }
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
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 복기 대기 큐를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 🔄 복기 중

```dataviewjs
const run = () => {
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
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

---

## 🏆 낙찰

```dataviewjs
const run = () => {
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
      summaryText: "🏆 낙찰 물건 목록",
      summaryColor: "#22c55e",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("won");
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

## 💔 패찰

```dataviewjs
const run = () => {
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
      summaryText: "💔 패찰 물건 목록",
      summaryColor: "#ef4444",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("lost");
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

## ❌ 입찰 포기

```dataviewjs
const run = () => {
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
      summaryColor: "#666666",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("skipped");
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```

## 📦 보관

```dataviewjs
const run = () => {
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
      summaryText: "📦 보관 물건 목록",
      summaryColor: "var(--text-muted)",
      sortField: "auction_datetime",
      sortOrder: "desc"
    });
    window.ProdigyAuctionNavigationFocus?.markSection("archived");
    return true;
  }
  return false;
};
if (!run()) {
  this.container.empty();
  this.container.createEl("span", {
    text: "⌛ 대시보드 리소스를 불러오는 중...",
    attr: { style: "color: var(--text-muted); font-size: 0.82em; font-style: italic; margin: 4px 0; display: block;" }
  });
  const t = setInterval(() => { if (run()) clearInterval(t); }, 100);
  setTimeout(() => clearInterval(t), 10000);
}
```
```
