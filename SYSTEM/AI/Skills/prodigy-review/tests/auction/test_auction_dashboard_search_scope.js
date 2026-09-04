"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/shared-dashboard.js"), "utf8");

class Element {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.children = [];
    this.textContent = options.text || "";
    this.value = options.value || options.attr?.value || "";
    this.attr = { ...(options.attr || {}) };
    this.classList = { contains: () => false };
    this.isConnected = true;
    this.open = false;
  }

  createEl(tag, options = {}) {
    const child = new Element(tag, options);
    this.children.push(child);
    return child;
  }

  empty() {
    this.children = [];
  }
}

function descendants(element) {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function dataArray(items) {
  const values = [...items];
  values.where = (predicate) => dataArray(values.filter(predicate));
  values.sort = (key, order = "asc") => dataArray([...values].sort((left, right) => {
    const a = String(key(left));
    const b = String(key(right));
    return order === "desc" ? b.localeCompare(a) : a.localeCompare(b);
  }));
  values.array = () => [...values];
  return values;
}

function auctionStateStore(initial = {}) {
  let state = {
    filters: { card_region: "전체지역", card_type: "전체종류" },
    sort: { bidding: "dday_asc", watching: "dday_asc" },
    ...initial,
  };
  return {
    getWorkspaceState: () => state,
    setWorkspaceState: (_workspaceId, patch) => {
      state = {
        ...state,
        ...patch,
        filters: { ...state.filters, ...(patch.filters || {}) },
        sort: { ...state.sort, ...(patch.sort || {}) },
      };
      return state;
    },
  };
}

function renderAuctionStatus(status, query) {
  const pages = [
    { type: "auction_case", status: "watching", case_number: "2025타경5458", file: { name: "watching", ctime: 1, mtime: 1 } },
    { type: "auction_case", status: "bidding", case_number: "2025타경9999", file: { name: "bidding", ctime: 2, mtime: 2 } },
  ];
  const container = new Element();
  const rendered = [];
  const sandbox = {
    console,
    window: {
      prodigyAuctionWorkspaceStateStore: auctionStateStore({
        filters: {
          card_region: "전체지역",
          card_type: "전체종류",
          search: query,
        },
      }),
    },
    document: { body: { classList: { contains: () => false } } },
    app: {},
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "SYSTEM/Views/shared-dashboard.js" });
  sandbox.window.renderDashboardSection({
    dv: {
      current: () => ({}),
      pages: () => dataArray(pages),
    },
    status,
    type: "auction_case",
    container,
    renderer: (page) => rendered.push(page.case_number),
    emptyMessage: "없음",
    sortField: "auction_datetime",
    sortOrder: "asc",
  });
  return rendered;
}

test("auction search only filters the bidding section that exposes its input", () => {
  assert.deepEqual(renderAuctionStatus("watching", "not-a-case"), ["2025타경5458"]);
  assert.deepEqual(renderAuctionStatus("bidding", "9999"), ["2025타경9999"]);
  assert.deepEqual(renderAuctionStatus("bidding", "not-a-case"), []);
});

test("Auction filters resolve the shared Navigation store before AppShell exposes its global", () => {
  const store = auctionStateStore();
  const container = new Element();
  const sandbox = {
    console,
    window: {
      ProdigyWorkspaceNavigation: { getStateStore: () => store },
    },
    document: {
      body: { classList: { contains: () => false } },
      contains: () => true,
    },
    app: {},
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "SYSTEM/Views/shared-dashboard.js" });

  const rendered = sandbox.window.renderDashboardSection({
    dv: {
      current: () => ({}),
      pages: () => dataArray([
        { type: "auction_case", status: "watching", case_number: "초기 사건", file: { name: "초기", ctime: 1, mtime: 1 } },
      ]),
    },
    status: "watching",
    type: "auction_case",
    container,
    renderer: (page, target) => target.createEl("article", { text: page.case_number }),
    emptyMessage: "없음",
  });

  assert.equal(rendered, true);
  assert.equal(descendants(container).some((element) => element.tag === "article"), true);
});

test("auction region filter redraws cards before persistence completes", () => {
  const pages = [
    { type: "auction_case", status: "bidding", region_sido: "서울", case_number: "서울 사건", file: { name: "서울", ctime: 1, mtime: 1 } },
    { type: "auction_case", status: "bidding", region_sido: "부산", case_number: "부산 사건", file: { name: "부산", ctime: 2, mtime: 2 } },
  ];
  const container = new Element();
  let persistenceCalls = 0;
  let workspaceState = {
    filters: { card_region: "전체지역", card_type: "전체종류" },
    sort: { bidding: "dday_asc" },
  };
  const stateStore = {
    getWorkspaceState: () => workspaceState,
    setWorkspaceState: (_workspaceId, patch) => {
      workspaceState = {
        ...workspaceState,
        ...patch,
        filters: { ...workspaceState.filters, ...(patch.filters || {}) },
        sort: { ...workspaceState.sort, ...(patch.sort || {}) },
      };
      return workspaceState;
    },
  };
  const sandbox = {
    console,
    window: { prodigyAuctionWorkspaceStateStore: stateStore },
    document: {
      body: { classList: { contains: () => false } },
      contains: () => true,
    },
    app: {
      workspace: { getActiveFile: () => ({ path: "HUB/10 Auction.md" }) },
      vault: { getAbstractFileByPath: () => ({ path: "HUB/10 Auction.md" }) },
      fileManager: { processFrontMatter: () => { persistenceCalls += 1; } },
    },
    setTimeout,
    clearTimeout,
  };
  sandbox.window.app = sandbox.app;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "SYSTEM/Views/shared-dashboard.js" });
  sandbox.window.renderDashboardSection({
    dv: {
      current: () => ({ file: { path: "HUB/10 Auction.md" }, card_region: "서울" }),
      pages: () => dataArray(pages),
    },
    status: "bidding",
    type: "auction_case",
    container,
    renderer: (page, target) => target.createEl("article", { text: page.case_number }),
    emptyMessage: "없음",
    sortField: "auction_datetime",
    sortOrder: "asc",
  });
  const regionSelect = descendants(container).find((element) => element.tag === "select");
  const filterSummary = descendants(container).find((element) =>
    String(element.attr.class || "").split(/\s+/).includes("auction-filter-summary"));
  const resetButton = descendants(container).find((element) =>
    String(element.attr.class || "").split(/\s+/).includes("auction-filter-reset"));
  assert.ok(regionSelect, "the bidding toolbar must render its region filter");
  assert.equal(filterSummary?.textContent, "입찰 예정 2건");
  assert.ok(resetButton, "filter toolbar must expose a reset action");
  assert.equal(
    regionSelect.children.find((option) => option.selected)?.value,
    "전체지역",
    "Workspace UI state must outrank legacy frontmatter",
  );

  regionSelect.value = "부산";
  void regionSelect.onchange();
  assert.equal(workspaceState.filters.card_region, "부산");
  assert.equal(persistenceCalls, 0, "filter changes must not write Hub-note frontmatter");

  const visibleCards = descendants(container)
    .filter((element) => element.tag === "article")
    .map((element) => element.textContent);
  assert.deepEqual(
    visibleCards,
    ["부산 사건"],
    "filter selection must redraw from in-memory state without waiting for frontmatter persistence",
  );
  assert.equal(filterSummary.textContent, "부산 · 입찰 예정 1건");

  const sortSelect = descendants(container).filter((element) => element.tag === "select")[2];
  sortSelect.value = "dday_desc";
  sortSelect.onchange();
  assert.equal(workspaceState.sort.bidding, "dday_desc");
  assert.equal(workspaceState.filters.card_region, "부산", "sort updates must preserve filter state");
  assert.equal(persistenceCalls, 0);

  const searchInput = descendants(container).find((element) => element.tag === "input");
  searchInput.value = "서울";
  searchInput.oninput();
  assert.equal(workspaceState.filters.search, "서울");
  assert.equal(descendants(container).filter((element) => element.tag === "article").length, 0);
  assert.equal(filterSummary.textContent, "부산 · 검색 서울 · 입찰 예정 0건");

  resetButton.onclick();
  assert.equal(workspaceState.filters.card_region, "전체지역");
  assert.equal(workspaceState.filters.search, "");
  assert.equal(searchInput.value, "");
  assert.equal(descendants(container).filter((element) => element.tag === "article").length, 2);
  assert.equal(filterSummary.textContent, "입찰 예정 2건");
});

test("auction section renders after a transiently detached Dataview container reconnects", () => {
  const container = new Element();
  container.isConnected = false;
  let connectionCallback = null;
  const sandbox = {
    console,
    window: {
      prodigyAuctionWorkspaceStateStore: auctionStateStore(),
      __prodigyAuctionMountScope: {
        observe(_target, _options, callback) {
          connectionCallback = callback;
          return { disconnect() {} };
        },
      },
    },
    document: {
      body: { classList: { contains: () => false } },
      documentElement: {},
      contains: (candidate) => candidate.isConnected,
    },
    app: {},
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "SYSTEM/Views/shared-dashboard.js" });
  const initialResult = sandbox.window.renderDashboardSection({
    dv: {
      current: () => ({}),
      pages: () => dataArray([
        { type: "auction_case", status: "watching", case_number: "재연결 사건", file: { name: "재연결", ctime: 1, mtime: 1 } },
      ]),
    },
    status: "watching",
    type: "auction_case",
    container,
    renderer: (page, target) => target.createEl("article", { text: page.case_number }),
    emptyMessage: "없음",
  });
  assert.equal(initialResult, false, "a deferred section must not report lifecycle completion");
  assert.equal(descendants(container).some((element) => element.tag === "article"), false);
  assert.equal(typeof connectionCallback, "function", "detached render must subscribe to the exact reconnect event");

  container.isConnected = true;
  connectionCallback();

  assert.deepEqual(
    descendants(container)
      .filter((element) => element.tag === "article")
      .map((element) => element.textContent),
    ["재연결 사건"],
  );
});

test("a manual refresh that beats the reconnect event cancels the pending observer", () => {
  const container = new Element();
  container.isConnected = false;
  let observerHandle = null;
  let renderCalls = 0;
  const sandbox = {
    console,
    window: {
      prodigyAuctionWorkspaceStateStore: auctionStateStore(),
      __prodigyAuctionMountScope: {
        observe() {
          observerHandle = {
            disconnected: false,
            disconnect() { this.disconnected = true; },
          };
          return observerHandle;
        },
      },
    },
    document: {
      body: { classList: { contains: () => false } },
      documentElement: {},
      contains: (candidate) => candidate.isConnected,
    },
    app: {},
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "SYSTEM/Views/shared-dashboard.js" });
  sandbox.window.renderDashboardSection({
    dv: {
      current: () => ({}),
      pages: () => dataArray([
        { type: "auction_case", status: "watching", case_number: "재연결 사건", file: { name: "재연결", ctime: 1, mtime: 1 } },
      ]),
    },
    status: "watching",
    type: "auction_case",
    container,
    renderer: () => { renderCalls += 1; },
    emptyMessage: "없음",
  });
  assert.ok(observerHandle);

  container.isConnected = true;
  sandbox.window.__prodigyRefreshAuctionDashboard();

  assert.equal(renderCalls, 1);
  assert.equal(observerHandle.disconnected, true, "a successful refresh must retire the stale reconnect observer");
});

test("collapsed Auction status lists render cards only while opened", () => {
  const container = new Element();
  const sandbox = {
    console,
    window: {
      prodigyAuctionWorkspaceStateStore: auctionStateStore(),
    },
    document: {
      body: { classList: { contains: () => false } },
      contains: () => true,
    },
    app: {},
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "SYSTEM/Views/shared-dashboard.js" });
  sandbox.window.renderDashboardSection({
    dv: {
      current: () => ({}),
      pages: () => dataArray([
        { type: "auction_case", status: "skipped", case_number: "포기 1", file: { name: "1", ctime: 1, mtime: 1 } },
        { type: "auction_case", status: "skipped", case_number: "포기 2", file: { name: "2", ctime: 2, mtime: 2 } },
      ]),
    },
    status: "skipped",
    type: "auction_case",
    container,
    renderer: (page, target) => target.createEl("article", { text: page.case_number }),
    emptyMessage: "없음",
    isCollapsed: true,
    summaryText: "입찰 포기 물건 목록",
  });
  const disclosure = descendants(container).find((element) => element.tag === "details");
  assert.ok(disclosure);
  assert.equal(descendants(container).some((element) => element.tag === "article"), false);

  disclosure.open = true;
  disclosure.ontoggle();
  assert.equal(descendants(container).filter((element) => element.tag === "article").length, 2);

  disclosure.open = false;
  disclosure.ontoggle();
  assert.equal(descendants(container).some((element) => element.tag === "article"), false);
});
