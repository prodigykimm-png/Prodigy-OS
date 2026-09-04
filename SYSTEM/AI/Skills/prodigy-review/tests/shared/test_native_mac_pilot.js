"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("Mac Home renders one source list and grouped rows instead of floating cards", () => {
  const sections = read("SYSTEM/Views/home-sections.js");
  const styles = read("SYSTEM/Views/home-styles.js");

  assert.match(sections, /home-native-sidebar-label/);
  assert.match(sections, /home-native-sidebar-group/);
  assert.match(styles, /\.prodigy-home\.home-wide \.home-ws-dock[\s\S]*?border-radius:\s*var\(--ke-radius-none\)/);
  assert.match(styles, /\.prodigy-home\.home-wide \.home-native-group[\s\S]*?border-block-end:\s*var\(--ke-border-width\)\s+solid\s+var\(--ke-color-border\)/);
  assert.match(styles, /\.prodigy-home\.home-wide \.home-card[\s\S]*?border-radius:\s*var\(--ke-radius-none\)[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.prodigy-app-shell\[data-workspace-id="home"\][\s\S]*?\.prodigy-workspace-title\s*\{[\s\S]*?display:\s*none/);
});

test("iPad Home places workspace shortcuts after the main content", () => {
  const styles = read("SYSTEM/Views/home-styles.js");
  const view = read("SYSTEM/Views/home-view.js");

  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.prodigy-home \.home-mc-stack\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?grid-template-areas:[\s\S]*?"capture"[\s\S]*?"action"[\s\S]*?"context"[\s\S]*?"microlog"[\s\S]*?"fold"[\s\S]*?"dock";/,
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.prodigy-home \.home-ws-dock-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(var\(--ke-touch-target\),\s*1fr\)\)/,
  );
  assert.match(
    view,
    /syncWorkspaceDockPosition[\s\S]*?variant === "medium"[\s\S]*?stack\.appendChild\(workspaceDock\)[\s\S]*?stack\.insertBefore\(workspaceDock,\s*stack\.firstElementChild\)/,
  );
});

test("Prodigy Home owns Home while legacy Home Tab views remain loadable", () => {
  const plugins = JSON.parse(read(".obsidian/community-plugins.json"));
  const homepage = JSON.parse(read(".obsidian/plugins/homepage/data.json"));
  const homeTab = JSON.parse(read(".obsidian/plugins/home-tab/data.json"));
  const appConfig = JSON.parse(read(".obsidian/app.json"));
  const mobileWorkspace = read(".obsidian/workspace-mobile.json");

  assert.ok(plugins.includes("homepage"), "Homepage must remain enabled");
  assert.ok(plugins.includes("home-tab"), "Home Tab must remain available for persisted legacy views");
  assert.equal(homeTab.replaceNewTabs, false, "Home Tab must not replace new tabs with OmniSearch");
  assert.doesNotMatch(mobileWorkspace, /"type":\s*"home-tab-view"/);
  assert.equal(homepage.homepages["Main Homepage"].value, "HUB/00 Home");
  assert.equal(homepage.homepages["Main Homepage"].openOnStartup, true);
  assert.equal(appConfig.openBehavior, "file:HUB/00 Home.md");
});

test("iPad Auction expands briefing and places compact status counts beneath it", () => {
  const styles = read("SYSTEM/Views/auction-hub-styles.js");

  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.auction-native-overview\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.auction-hub-pipeline\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.auction-hub-pipeline-arrow\s*\{[\s\S]*?display:\s*none/,
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.auction-native-detail-body\s*\{[\s\S]*?gap:\s*0/,
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="medium"\] \.auction-hub-pipeline-section\s*\{[\s\S]*?margin-block-start:\s*0/,
  );
});

test("Mac Auction keeps briefing and calendar above sectioned work queues", () => {
  const hub = read("HUB/10 Auction.md");
  const scenes = read("SYSTEM/Views/auction-native-scenes.js");
  const styles = read("SYSTEM/Views/auction-hub-styles.js");

  assert.match(hub, /loadWorkspaceBootstrap\(["']SYSTEM\/Views\/auction-native-scenes\.js["']\)/);
  assert.match(hub, /ProdigyAuctionNativeScenes\.mount\(\{[\s\S]*?body:\s*auctionShell\.body/);
  assert.match(hub, /ProdigyAuctionNativeScenes\.register\("today",\s*this\.container\)/);
  assert.match(hub, /ProdigyAuctionNativeScenes\.register\("bidding",\s*this\.container\)/);
  assert.match(hub, /ProdigyAuctionNativeScenes\.register\("watching",\s*this\.container\)/);
  assert.match(hub, /ProdigyAuctionNativeScenes\.register\("calendar",\s*this\.container\)/);
  assert.match(scenes, /const overview = create\(home,\s*"div",\s*"auction-native-overview"\)/);
  assert.match(scenes, /const detailPane = create\(overview,\s*"section",\s*"auction-native-detail-pane"\)/);
  assert.match(scenes, /const calendarPane = create\(overview,\s*"section",\s*"auction-native-calendar-pane"\)/);
  assert.match(scenes, /const workPane = create\(home,\s*"section",\s*"auction-native-work-pane"\)/);
  assert.ok(scenes.indexOf("const calendarPane") < scenes.indexOf("const workPane"));
  assert.match(scenes, /"auction-native-pane-title",\s*"입찰 달력"/);
  assert.match(scenes, /createWorkGroup\(workBody,\s*"입찰 예정"\)/);
  assert.match(scenes, /createWorkGroup\(workBody,\s*"관심"\)/);
  assert.match(scenes, /createWorkGroup\(workBody,\s*"복기"\)/);
  assert.match(scenes, /const group = create\(parent,\s*"details",\s*"auction-native-work-group"\)/);
  assert.match(scenes, /group\.open = true/);
  assert.match(scenes, /create\(group,\s*"summary",\s*"auction-native-work-group-title",\s*label\)/);
  assert.match(scenes, /kind === "bidding"\)\s*state\.biddingBody\.appendChild\(container\)/);
  assert.match(scenes, /kind === "watching"\)\s*state\.watchingBody\.appendChild\(container\)/);
  assert.match(scenes, /kind === "pipeline"\)\s*state\.detailBody\.appendChild\(container\)/);
  assert.match(scenes, /state\.reviewBody\.appendChild\(container\)/);
  assert.doesNotMatch(scenes, /navButton\(tablist,\s*"달력"/);
  assert.doesNotMatch(scenes, /setHidden\(state\.calendar/);
  assert.doesNotMatch(scenes, /let state\s*=\s*null/);
  assert.match(scenes, /const states\s*=\s*new WeakMap\(\)/);
  assert.match(scenes, /const resolveState\s*=\s*\(container\)/);
  assert.match(styles, /\.auction-native-app[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(scenes, /auction-native-source-list/);
  assert.match(styles, /\.auction-native-overview\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.auction-native-work-pane\s*\{[\s\S]*?border-block-start:/);
  assert.match(styles, /\.auction-native-work-group-title::after[\s\S]*?content:\s*"▾"/);
  assert.match(styles, /\.auction-native-work-group:not\(\[open\]\) > \.auction-native-work-group-title::after[\s\S]*?content:\s*"▸"/);
});

test("Auction adopts briefing and calendar registered before shell mount", () => {
  const scenes = read("SYSTEM/Views/auction-native-scenes.js");
  const marker = scenes.indexOf('container.setAttribute("data-native-section", kind)');
  const stateLookup = scenes.indexOf("const state = resolveState(container)");

  assert.ok(marker >= 0 && marker < stateLookup);
  assert.match(scenes, /view\?\.querySelectorAll\?\.\("\[data-native-section\]"\)/);
  assert.match(scenes, /register\(container\.getAttribute\("data-native-section"\),\s*container\)/);
});

test("Mac Auction gives canonical cards the primary content width", () => {
  const scenes = read("SYSTEM/Views/auction-native-scenes.js");
  const styles = read("SYSTEM/Views/auction-hub-styles.js");

  assert.match(scenes, /"auction-native-pane-title",\s*"오늘의 물건"/);
  assert.match(scenes, /"section",\s*"auction-native-detail-pane"/);
  assert.match(scenes, /"h2",\s*"auction-native-pane-title",\s*"주요 브리핑"/);
  assert.ok(scenes.indexOf("const detailPane") < scenes.indexOf("const workPane"));
  assert.match(styles, /\.auction-native-home\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.auction-native-work-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.auction-native-detail-pane \.auction-hub-section\.auction-hub-today\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /\.auction-native-detail-pane \.auction-hub-stat-grid\s*\{[\s\S]*?display:\s*block\s*!important/);
  assert.match(styles, /\.auction-native-detail-pane \.auction-native-sidebar\s*\{[\s\S]*?inline-size:\s*100%[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.auction-native-detail-pane \.auction-hub-section\.auction-hub-today\s*\{[\s\S]*?border:\s*0\s*!important/);
  assert.match(styles, /\.auction-native-detail-pane \.auction-native-sidebar-title\s*\{[\s\S]*?display:\s*none/);
  assert.ok(scenes.indexOf("const workPane") < scenes.indexOf("const biddingBody"));
  assert.doesNotMatch(scenes, /auction-native-summary-toggle/);
  assert.doesNotMatch(styles, /\.auction-native-home\s*\{[\s\S]*?5fr[\s\S]*?7fr/);
});

test("Auction briefing replaces Continue with a compact pipeline", () => {
  const hub = read("HUB/10 Auction.md");
  const styles = read("SYSTEM/Views/auction-hub-styles.js");

  assert.doesNotMatch(hub, /attr:\s*\{\s*class:\s*"auction-hub-continue"\s*\}/);
  assert.doesNotMatch(hub, /pipelineDisclosure/);
  assert.match(hub, /class:\s*"auction-hub-pipeline-heading"/);
  assert.match(hub, /class:\s*"auction-hub-pipeline auction-hub-pipeline-compact"/);
  assert.match(styles, /\.auction-hub-pipeline\.auction-hub-pipeline-compact\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.auction-hub-pipeline-compact \.auction-hub-pipeline-arrow\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.auction-hub-pipeline-compact \.auction-hub-pipeline-group\s*\{[\s\S]*?display:\s*contents/);
  assert.doesNotMatch(hub, /\$\{info\.icon\}|❌/u);
});

test("Mobile Auction keeps a compact delete action beside D-day and Naver", () => {
  const card = read("SYSTEM/Views/auction-card.js");
  const styles = read("SYSTEM/Views/auction-hub-styles.js");
  const badges = card.indexOf("const rightBadges = titleRow.createEl");
  const deletion = card.indexOf('window.ProdigyUI.button(rightBadges, "삭제"');

  assert.ok(badges >= 0 && deletion > badges);
  assert.match(card, /const mobileDdayStr = ddayStr\.replace\(/);
  assert.match(card, /text:\s*isMobile\s*\?\s*mobileDdayStr\s*:\s*ddayStr/);
  assert.match(styles, /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-title-row\s*\{[\s\S]*?align-items:\s*flex-start/);
  assert.match(styles, /\.auction-card \.auction-card-delete\s*\{[\s\S]*?inline-size:\s*var\(--ke-touch-target,\s*44px\)\s*!important[\s\S]*?font-size:\s*0\s*!important/);
  assert.match(styles, /\.auction-card \.auction-card-delete::before\s*\{[\s\S]*?content:\s*"×"/);
  assert.match(styles, /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-external-link\s*\{[\s\S]*?min-block-size:\s*28px/);
  assert.match(styles, /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-badges\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
});

test("Mobile Auction preserves the pre-Apple compact card flow", () => {
  const card = read("SYSTEM/Views/auction-card.js");
  const styles = read("SYSTEM/Views/auction-hub-styles.js");

  assert.match(card, /auction-card-original-layout/);
  assert.match(card, /\.auction-card-original-layout\.is-mobile\s*\{[\s\S]*?padding:\s*8px/);
  assert.match(card, /\.auction-card-original-layout\.is-mobile\s*\{[\s\S]*?gap:\s*2px/);
  assert.match(card, /\.auction-card-original-layout\.is-mobile \.auction-card-title-link\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(card, /\.auction-card-original-layout\.is-mobile \.auction-card-detail-row,[\s\S]*?line-height:\s*1\.25/);
  assert.match(card, /\.auction-card-original-layout\.is-mobile \[role="button"\]\s*\{[\s\S]*?min-block-size:\s*var\(--ke-touch-target,\s*44px\)\s*!important/);
  assert.match(card, /\.auction-card-original-layout\.is-mobile \.auction-region-inline-action,[\s\S]*?min-block-size:\s*var\(--ke-touch-target,\s*44px\)\s*!important/);
  assert.match(card, /\.auction-card-original-layout\.is-mobile \.auction-card-actions button\s*\{[\s\S]*?min-block-size:\s*var\(--ke-touch-target,\s*44px\)\s*!important/);
  assert.match(styles, /\.auction-card button,[\s\S]*?min-block-size:\s*var\(--ke-touch-target,\s*44px\)\s*!important/);
  assert.doesNotMatch(card, /🏆|❌|🚫/u);
  assert.doesNotMatch(
    styles,
    /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-finance-row,[\s\S]*?display:\s*grid/
  );
  assert.doesNotMatch(
    styles,
    /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-finance-group,[\s\S]*?inline-size:\s*100%/
  );
  assert.doesNotMatch(
    styles,
    /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-actions\s*\{[\s\S]*?inline-size:\s*100%/
  );
});

test("Mobile closed Auction aligns result and profit analysis in one row", () => {
  const styles = read("SYSTEM/Views/auction-hub-styles.js");

  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-finance-row:has\(\.auction-card-finance-group-income\)\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="compact"\] \.auction-card-finance-row:has\(\.auction-card-finance-group-income\) \.auction-card-finance-group\s*\{[\s\S]*?min-inline-size:\s*0/
  );
});

test("Integrated calendar preserves the canonical renderer without a separate scene", () => {
  const hub = read("HUB/10 Auction.md");

  assert.doesNotMatch(hub, /revealAuctionCalendar|revealAfterOwnerSettles/);
  assert.doesNotMatch(hub, /scrollOwner\.scrollTo\(\{\s*top:\s*scrollOwner\.scrollHeight/);
  assert.match(hub, /auctionNativeSceneController\?\.focusCalendar\(\)/);
  assert.match(hub, /window\.BidCalendarView\.render\(\{/);
});

test("Mac native controls use one quiet typographic hierarchy", () => {
  const home = read("SYSTEM/Views/home-styles.js");
  const auction = read("SYSTEM/Views/auction-hub-styles.js");

  assert.match(home, /\.prodigy-home\.home-wide \.home-title\s*\{[\s\S]*?font-size:\s*var\(--ke-type-heading\)/);
  assert.match(home, /\.prodigy-home\.home-wide \.home-toolbar-utility[\s\S]*?font-size:\s*var\(--ke-type-label\)/);
  assert.match(auction, /\.auction-native-source-row\s*\{[\s\S]*?font-size:\s*var\(--ke-type-body(?:,\s*15px)?\)/);
  assert.match(auction, /\.auction-native-pane-title\s*\{[\s\S]*?font-size:\s*var\(--ke-type-heading(?:,\s*20px)?\)/);
  assert.doesNotMatch(`${home}\n${auction}`, /letter-spacing:\s*-\d/);
  assert.doesNotMatch(auction, /--ke-tracking-display/);
  assert.match(auction, /\.auction-hub-stat-row\.is-primary \.auction-hub-stat-value[\s\S]*?letter-spacing:\s*0/);
  assert.doesNotMatch(auction, /--ke-color-(?:secondary-)?label/);
});

test("Auction native shell suppresses duplicate document chrome and keeps filters readable", () => {
  const dashboard = read("SYSTEM/Views/shared-dashboard.js");
  const styles = read("SYSTEM/Views/auction-hub-styles.js");
  const base = read(".obsidian/snippets/base.css");

  assert.match(dashboard, /class:\s*"auction-filter-bar"/);
  assert.match(dashboard, /class:\s*"auction-filter-search"/);
  assert.match(dashboard, /class:\s*"auction-filter-selects"/);
  assert.match(styles, /\.auction-native-filter-body \.auction-filter-bar[\s\S]*?display:\s*grid\s*!important/);
  assert.match(styles, /\.prodigy-app-shell:is\(\[data-tier="medium"\],\[data-tier="wide"\]\) \.auction-native-filter-body \.auction-filter-bar[\s\S]*?grid-template-columns:\s*minmax\(14rem,\s*1\.4fr\)\s+repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.prodigy-app-shell:is\(\[data-tier="medium"\],\[data-tier="wide"\]\) \.auction-native-filter-body \.auction-filter-search[\s\S]*?grid-column:\s*1/);
  assert.match(styles, /\.auction-native-filter-body \.auction-filter-selects[\s\S]*?repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(
    styles,
    /\.prodigy-app-shell:is\(\[data-tier="medium"\],\[data-tier="wide"\]\) \.auction-native-filter-body[\s\S]*?position:\s*sticky[\s\S]*?inset-block-start:\s*0/,
  );
  assert.match(
    styles,
    /\.prodigy-app-shell\[data-tier="compact"\] \.auction-native-filter-body[\s\S]*?position:\s*static/,
  );
  assert.doesNotMatch(styles, /\.prodigy-app-shell\[data-workspace-id="auction"\]:has\(\.auction-native-app\) \.prodigy-context-bar[\s\S]*?display:\s*none/);
  assert.match(styles, /\.markdown-preview-view\.prodigy-hub-note:has\(\.auction-native-app\)[\s\S]*?>\s*:not\(\.markdown-preview-pusher\):not\(\.el-pre:has\(\.auction-native-app\)\)[\s\S]*?display:\s*none/);
  assert.doesNotMatch(base, /body:has\([^)]*prodigy-hub-note[^)]*\) \.(?:workspace-ribbon|status-bar)/);
  assert.match(base, /\.workspace-leaf\.mod-active:has\(\.markdown-preview-view\.prodigy-hub-note\) \.view-header/);
});

test("Auction integrated workspace remains instance-safe and keeps a Home escape", () => {
  const scenes = read("SYSTEM/Views/auction-native-scenes.js");
  const styles = read("SYSTEM/Views/auction-hub-styles.js");

  assert.match(scenes, /states\s*=\s*(?:runtime\.states|new WeakMap\(\))/);
  assert.match(scenes, /states\.set\(app,\s*state\)/);
  assert.match(scenes, /const state\s*=\s*resolveState\(container\)/);
  assert.match(scenes, /focusCalendar:\s*\(\)\s*=>\s*focusCalendar\(state\)/);
  assert.doesNotMatch(scenes, /textContent\?\.trim\(\)\s*===\s*"홈"/);
  assert.doesNotMatch(styles, /\.prodigy-context-bar[\s\S]*?display:\s*none/);
  assert.doesNotMatch(read("SYSTEM/Views/home-styles.js"), /(?:^|\n)\s*\.(?:workspace-list|workspace-row|workspace-label|workspace-arrow|continue-row)\b/m);
});

test("Auction AppShell retains vertical scroll container across medium and wide tiers", () => {
  const shell = read("SYSTEM/Views/prodigy-app-shell.js");

  assert.match(
    shell,
    /\.prodigy-app-shell\[data-workspace-id="auction"\]\s*\{[\s\S]*?overflow:\s*hidden\s*!important;/,
  );
  assert.match(
    shell,
    /\.prodigy-app-shell\[data-workspace-id="auction"\]\s*>\s*\.prodigy-app-shell-body\s*\{[\s\S]*?overflow-y:\s*auto\s*!important;/,
  );
});
