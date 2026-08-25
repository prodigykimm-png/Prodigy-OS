"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const DESIGN_TOKENS = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

const AUCTION_PATH = "PARA/PROJECTS/Auction/a.md";
const PATHLESS_TITLE = "리팩터 정리";
// iPhone receipt 11:05 — the same Reading Object appeared in Focus and Continue.
const RECEIPT_TITLE = "데일 카네기 인간관계론";
const RECEIPT_PATH = "PARA/PROJECTS/Reading/" + RECEIPT_TITLE + ".md";

class ClassList {
  constructor(owner) {
    this.owner = owner;
    this.names = new Set();
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
    this.owner.attributes.class = Array.from(this.names).join(" ");
  }

  contains(name) {
    return this.names.has(name);
  }

  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.names.has(name) : Boolean(force);
    if (shouldAdd) this.names.add(name);
    else this.names.delete(name);
    this.owner.attributes.class = Array.from(this.names).join(" ");
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.style = {
      setProperty(name, value) { this[name] = String(value); },
      getPropertyValue(name) { return typeof this[name] === "string" ? this[name] : ""; },
      removeProperty(name) { delete this[name]; }
    };
    this.classList = new ClassList(this);
    this.onclick = null;
    this.open = false;
    this.textContent = "";
    this.text = "";
    this.clientWidth = options.clientWidth || 0;
    if (options.text) this.setText(options.text);
    if (options.attr) this.applyAttr(options.attr);
  }

  setText(value) {
    this.textContent = String(value);
    this.text = String(value);
  }

  applyAttr(attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === "class") {
        String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
        return;
      }
      this.attributes[key] = String(value);
    });
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }

  removeAttribute(name) { delete this.attributes[name]; }

  focus() { if (global.document) global.document.activeElement = this; }

  createEl(tagName, options = {}) {
    const child = new FakeElement(tagName, options);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  createDiv(options = {}) { return this.createEl("div", options); }

  createSpan(options = {}) { return this.createEl("span", options); }

  empty() {
    this.children = [];
    this.textContent = "";
    this.text = "";
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  closest(selector) {
    if (selector === ".workspace-leaf-content") return this.workspaceLeaf || null;
    return null;
  }

  getBoundingClientRect() {
    return { width: this.clientWidth, height: 0, top: 0, left: 0, right: this.clientWidth, bottom: 0 };
  }

  hasClass(name) { return this.classList.contains(name); }

  textTree() {
    return [this.textContent, ...this.children.map((child) => child.textTree())]
      .filter(Boolean)
      .join(" ");
  }

  findAll(predicate, found = []) {
    if (predicate(this)) found.push(this);
    this.children.forEach((child) => child.findAll(predicate, found));
    return found;
  }
}

function installDocument() {
  const styleElements = new Map();
  const keydownListeners = [];
  global.document = {
    activeElement: null,
    body: new FakeElement("body"),
    documentElement: new FakeElement("html"),
    head: {
      appendChild(element) { styleElements.set(element.id, element); }
    },
    createElement(tagName) { return new FakeElement(tagName); },
    getElementById(id) { return styleElements.get(id) || null; },
    keydownListeners,
    addEventListener(type, handler) {
      if (type === "keydown") keydownListeners.push(handler);
    },
    removeEventListener(type, handler) {
      if (type !== "keydown") return;
      const at = keydownListeners.indexOf(handler);
      if (at >= 0) keydownListeners.splice(at, 1);
    },
    dispatchKeydown(event) {
      keydownListeners.slice().forEach((handler) => handler(event));
    }
  };
  global.window = global;
  delete global.window.visualViewport;
  global.ResizeObserver = undefined;
  global.Notice = class Notice {
    constructor(message) { this.message = message; }
  };
}

function clearModules() {
  [
    "SYSTEM/Views/prodigy-adaptive-controls.js",
    "SYSTEM/Views/home-styles.js",
    "SYSTEM/Views/home-view.js",
    "SYSTEM/Views/workspace-launcher-view.js"
  ].forEach((modulePath) => {
    const resolved = require.resolve(path.join(ROOT, modulePath));
    delete require.cache[resolved];
  });
  delete global.HomeStyles;
  delete global.HomeView;
  delete global.WorkspaceLauncherView;
  delete global.ProdigyAdaptiveControls;
}

function installHomeDependencies(fixture) {
  const options = fixture || {};
  global.ProdigyTokens = DESIGN_TOKENS;
  global.ProdigyUI = { ensureStyles() {} };

  const focusAuctionWithCanonicalPath = {
    id: "focus-auction",
    label: "김포 오피스텔",
    source_type: "auction",
    object_path: AUCTION_PATH,
    next_action: "관리비 확인"
  };
  const focusProjectWithoutPath = {
    id: "focus-pathless",
    label: PATHLESS_TITLE,
    source_type: "project",
    next_action: "구조 정리"
  };
  const continueSameAuctionDenormalizedPath = {
    type: "auction",
    name: "김포 오피스텔",
    status: "bidding",
    path: "./PARA/PROJECTS/AUCTION/A.MD",
    next_action: "관리비 확인"
  };
  const continueSameProjectDenormalizedTitle = {
    type: "project",
    name: "  리팩터  정리 ",
    status: "doing",
    next_action: "구조 정리"
  };
  const continueUniqueSurvivor = {
    type: "reading",
    name: "Atomic Habits",
    status: "reading",
    path: "PARA/PROJECTS/Reading/book.md",
    next_action: "10페이지"
  };
  const continueCompletedMustStayHidden = {
    type: "project",
    name: "완료된 프로젝트",
    status: "completed",
    path: "PARA/PROJECTS/done.md"
  };

  const approvedFocus = options.focus === undefined
    ? [focusAuctionWithCanonicalPath, focusProjectWithoutPath]
    : options.focus;

  const candidates = options.continueCandidates === undefined
    ? [
      continueSameAuctionDenormalizedPath,
      continueSameProjectDenormalizedTitle,
      continueUniqueSurvivor,
      continueCompletedMustStayHidden
    ]
    : options.continueCandidates;

  global.MorningContextCore = {
    getTodayIsoDate: () => "2026-07-28",
    getYesterdayIsoDate: () => "2026-07-27",
    getWeekId: () => "2026-W31",
    getDaypart: () => "morning",
    buildMorningPackage: async () => ({
      local_date: "2026-07-28",
      day_of_week: "화",
      warnings: [],
      context: {
        todoist: { todayCount: 0, overdueCount: 0, todayTasks: [], overdueTasks: [] },
        projects: [],
        auctions: [{ name: "김포 오피스텔", status: "bidding", path: AUCTION_PATH }],
        reading: [],
        continue_candidates: candidates,
        risks: [],
        review_inbox: [],
        recent_reflections: [],
        yesterday_review: null
      }
    }),
    generateDeterministicFallback: () => ({
      schema_version: "morning-result-v1",
      brief_mode: "rule_based",
      brief: "규칙 기반 브리프",
      focus: approvedFocus.slice()
    }),
    selectFocusItems: (args) => ((args && args.focusItems) || []).slice()
  };

  global.MorningBriefService = {
    generateMorningResult: async () => global.MorningContextCore.generateDeterministicFallback()
  };

  global.MorningCache = {
    getDailyCache: async () => ({
      pkg: null,
      result: global.MorningContextCore.generateDeterministicFallback()
    }),
    getApprovedFocus: async () => (approvedFocus.length ? { focus: approvedFocus.slice() } : null),
    getPinnedFocus: async () => null,
    checkIsStale: () => false,
    clearPinnedFocus: async () => {},
    saveApprovedFocus: async (_app, _date, list) => ({ focus: list }),
    saveDailyCache: async () => {},
    clearApprovedFocus: async () => {}
  };

  global.MorningBriefContext = {
    buildMorningBriefContext: () => ({
      engine_ok: true,
      continue_by_workspace: options.continueByWorkspace === undefined
        ? {
          auction: {
            label: "김포 오피스텔",
            workspace: "auction",
            action: "관리비 확인",
            object_path: AUCTION_PATH,
            dashboard_path: "HUB/10 Auction.md",
            status: "bidding"
          }
        }
        : options.continueByWorkspace,
      engine_states: {}
    }),
    toHomeRiskItems: () => []
  };

  global.JournalStore = { loadReview: async () => ({ status: "empty", blocks: [], fields: {} }) };
  const creatorOpens = [];
  global.ObjectCreatorView = {
    opens: creatorOpens,
    open() { creatorOpens.push(Date.now()); }
  };

  global.WorkspaceLauncherCore = {
    loadWorkoutSnapshot: async () => null,
    buildLauncherCards: () => (options.launcherCards === undefined
      ? [
        {
          id: "project",
          icon: "P",
          name: "프로젝트",
          title: "Auction Calendar MVP",
          detail: "Launcher 연결",
          contextLabel: "진행 중",
          path: "HUB/40 Project.md",
          actionVerb: "계속",
          empty: false
        },
        {
          id: "reading",
          icon: "R",
          name: "독서",
          title: "",
          detail: "읽는 중인 책이 없습니다.",
          contextLabel: "비어 있음",
          path: "HUB/20 Reading.md",
          actionVerb: "둘러보기",
          empty: true
        }
      ]
      : options.launcherCards)
  };

  const items = [
    { id: "auction", icon: "A", label: "경매", path: "HUB/10 Auction.md" },
    { id: "reading", icon: "R", label: "독서", path: "HUB/20 Reading.md" },
    { id: "project", icon: "P", label: "프로젝트", path: "HUB/40 Project.md" }
  ];
  global.ProdigyWorkspaceRegistry = {
    items: () => items.slice(),
    launcherItems: () => items.slice(),
    find: (id) => items.find((item) => item.id === id) || null
  };
}

function createApp() {
  const openedPaths = [];
  return {
    isMobile: false,
    openedPaths,
    vault: {
      getAbstractFileByPath: (target) => ({ path: target }),
      read: async () => "",
      createFolder: async () => {},
      create: async (createdPath) => ({ path: createdPath })
    },
    workspace: {
      openLinkText(openedPath) { openedPaths.push(openedPath); },
      getLeaf: () => ({ view: { contentEl: new FakeElement("div") } })
    },
    commands: { executeCommandById: () => false }
  };
}

async function renderHomeAtWidth(width, fixture) {
  clearModules();
  installDocument();
  installHomeDependencies(fixture);
  global.window.innerWidth = width;
  require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
  require(path.join(ROOT, "SYSTEM/Views/workspace-launcher-view.js"));
  const home = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  const container = new FakeElement("div");
  container.workspaceLeaf = new FakeElement("div", { clientWidth: width });
  const app = createApp();
  await home.renderHome({ app, dv: {}, container });
  return {
    app,
    container,
    css: global.document.getElementById("prodigy-home-styles").textContent
  };
}

function regionOrder(container) {
  const stack = container.findAll((element) => element.hasClass("home-mc-stack"))[0];
  assert.ok(stack, "Home renders one Mission Control stack");
  return stack.children.map((child) => {
    if (child.hasClass("quick-capture-row")) return "Capture";
    if (child.hasClass("home-action-queue")) return "Action Queue";
    if (child.hasClass("home-context-details")) return "Context";
    if (child.hasClass("home-micro-log-slot")) return "Micro Log";
    if (child.hasClass("home-secondary-fold")) return "Fold";
    return null;
  }).filter(Boolean);
}

function findCardByLabel(container, pattern) {
  return container.findAll((element) => element.hasClass("home-card")
    && pattern.test(element.textTree()))[0] || null;
}

function continueRowTexts(container) {
  const card = findCardByLabel(container, /이어하기/);
  if (!card) return [];
  return card.findAll((element) => element.hasClass("continue-row")).map((row) => row.textTree());
}

function focusRowTexts(container) {
  const card = findCardByLabel(container, /오늘의 집중/);
  if (!card) return [];
  return card.findAll((element) => element.hasClass("focus-row")).map((row) => row.textTree());
}

function creatorButtons(container) {
  return container.findAll((element) => element.tagName === "BUTTON"
    && /새 Object/.test(String(element.textContent || "")));
}

function launcherCardEls(container) {
  return container.findAll((element) => element.hasClass("prodigy-launcher-card"));
}

function cssRule(css, selector) {
  const target = selector.trim().replace(/\s*\{$/, "") + " {";
  const index = css.indexOf(target);
  if (index < 0) return "";
  const open = index + target.length - 1;
  const close = css.indexOf("}", open + 1);
  return close < 0 ? "" : css.slice(open + 1, close);
}

async function testRegionOrderAtEveryWidth() {
  // Given: the same fixture rendered compact, medium, and wide
  for (const width of [390, 900, 1440]) {
    const rendered = await renderHomeAtWidth(width);

    // When: the primary stack order is inspected
    // Then: Brief to Focus to Continue to Micro Log stays linear before folded chrome
    assert.deepEqual(
      regionOrder(rendered.container),
      ["Capture", "Action Queue", "Context", "Micro Log", "Fold"],
      `width ${width} keeps the linear action-first Mission Control order`
    );
  }
}

async function testFocusCanonicalPathExcludedFromContinue() {
  // Given: an approved Focus auction that also arrives from both Continue sources
  const { container } = await renderHomeAtWidth(1440);

  // When: Focus and Continue rows are compared
  const focusText = focusRowTexts(container).join(" | ");
  const rows = continueRowTexts(container);

  // Then: the auction renders only in Focus
  assert.match(focusText, /김포 오피스텔/, "approved auction stays in Focus");
  assert.equal(
    rows.some((row) => /김포 오피스텔/.test(row)),
    false,
    "Focus canonical object_path is excluded from Continue"
  );
}

async function testPathlessFocusKeyExcludedFromContinue() {
  // Given: a pathless Focus project item repeated in Continue with denormalized whitespace
  const { container } = await renderHomeAtWidth(1440);

  // When: Continue rows are inspected
  const rows = continueRowTexts(container);

  // Then: the normalized workspace+title key removes the duplicate
  assert.match(focusRowTexts(container).join(" | "), /리팩터 정리/);
  assert.equal(
    rows.some((row) => /리팩터/.test(row)),
    false,
    "pathless Focus items dedupe by normalized workspace+title"
  );
}

async function testContinueKeepsUniqueAndHidesCompleted() {
  // Given: one unique Continue candidate plus one completed Object
  const { container } = await renderHomeAtWidth(1440);

  // When: surviving Continue rows are inspected
  const rows = continueRowTexts(container);

  // Then: only the unique open Object remains; completed semantics are unchanged
  assert.equal(rows.length, 1, "exactly the unique Continue candidate survives");
  assert.match(rows[0], /Atomic Habits/);
  assert.equal(rows.some((row) => /완료된 프로젝트/.test(row)), false);
}

async function testPathlessDifferentWorkspaceIsNotDeduped() {
  // Given: the same title in a different workspace than the pathless Focus item
  const { container } = await renderHomeAtWidth(1440, {
    continueByWorkspace: {},
    continueCandidates: [
      { type: "reading", name: PATHLESS_TITLE, status: "reading", next_action: "읽기" }
    ]
  });

  // When: Continue rows are inspected
  const rows = continueRowTexts(container);

  // Then: workspace is part of the pathless key, so the row survives
  assert.equal(rows.length, 1, "pathless key is workspace-scoped, not title-only");
  assert.match(rows[0], /리팩터 정리/);
}

async function testContinueEmptyState() {
  // Given: every Continue candidate is already displayed in Focus
  const { container } = await renderHomeAtWidth(1440, {
    continueCandidates: [
      { type: "auction", name: "김포 오피스텔", status: "bidding", path: AUCTION_PATH }
    ],
    continueByWorkspace: {}
  });

  // When: the Continue card is inspected
  const card = findCardByLabel(container, /이어하기/);

  // Then: the canonical empty state renders instead of a duplicate row
  assert.ok(card, "Continue region still renders");
  assert.equal(continueRowTexts(container).length, 0);
  assert.match(card.textTree(), /이어할 항목이 없습니다/);
  assert.match(card.textTree(), /오늘은 새 출발입니다/);
}

async function testFocusEmptyStateKeepsApprovalSemantics() {
  // Given: no approved Focus and no suggestions
  const { container } = await renderHomeAtWidth(1440, {
    focus: [],
    continueCandidates: [
      { type: "reading", name: "Atomic Habits", status: "reading", path: "PARA/PROJECTS/Reading/book.md" }
    ],
    continueByWorkspace: {}
  });

  // When: Focus and Continue are inspected
  const focusCard = findCardByLabel(container, /오늘의 집중/);

  // Then: Focus shows its empty state and Continue is not suppressed
  assert.match(focusCard.textTree(), /아직 제안된 집중 항목이 없습니다/);
  assert.equal(focusCard.textTree().includes("승인됨"), false);
  assert.equal(continueRowTexts(container).length, 1);
}

async function testExactlyOneVisibleCreatorInTopToolbar() {
  // Given: a full Home render including the embedded Launcher
  const { container } = await renderHomeAtWidth(1440);

  // When: every visible creator control is counted
  const buttons = creatorButtons(container);

  // Then: exactly one lives in the top toolbar and Quick Actions has none
  assert.equal(buttons.length, 1, "Home shows exactly one visible creator button");
  const toolbar = container.findAll((element) => element.hasClass("home-toolbar"))[0];
  assert.ok(toolbar, "Home renders a top toolbar");
  assert.equal(creatorButtons(toolbar).length, 1, "the single creator lives in the top toolbar");
  assert.equal(buttons[0].attributes.title, "새 Object (⌘/Ctrl+N)");

  const quickActions = container.findAll((element) => element.hasClass("home-quick-actions"))[0];
  assert.ok(quickActions, "Quick Actions region still renders");
  assert.equal(creatorButtons(quickActions).length, 0, "Quick Actions has no creator");
  assert.match(quickActions.textTree(), /오늘 Daily/);
  assert.match(quickActions.textTree(), /검색/);

  const launcherMount = container.findAll((element) => element.hasClass("home-launcher-mount"))[0];
  assert.ok(launcherMount, "embedded Launcher renders");
  assert.equal(creatorButtons(launcherMount).length, 0, "embedded Launcher receives showCreator:false");
}

async function testKeyboardCreatorShortcutPreserved() {
  // Given: a rendered Home with the global creator shortcut registered
  await renderHomeAtWidth(1440);
  const before = global.ObjectCreatorView.opens.length;

  // When: Cmd+N and then Ctrl+N are dispatched on the fake document
  let prevented = 0;
  const press = (modifier, target) => global.document.dispatchKeydown({
    key: "n",
    metaKey: modifier === "meta",
    ctrlKey: modifier === "ctrl",
    altKey: false,
    shiftKey: false,
    target: target || global.document.body,
    preventDefault() { prevented += 1; },
    stopPropagation() {}
  });
  press("meta");
  press("ctrl");

  // Then: each press opens the creator exactly once
  assert.equal(global.ObjectCreatorView.opens.length - before, 2, "Cmd/Ctrl+N still opens the creator");
  assert.equal(prevented, 2, "the shortcut is claimed once per press, so no duplicate handler runs");

  // And: typing inside an input is ignored
  const input = new FakeElement("input");
  press("meta", input);
  assert.equal(global.ObjectCreatorView.opens.length - before, 2, "editable targets keep their own Cmd+N");
}

async function testIphoneReceiptReadingDuplicateEliminated() {
  // Given: the 11:05 iPhone receipt shape — one Reading Object in approved Focus and both Continue sources
  const focusReading = {
    id: "focus-reading",
    label: RECEIPT_TITLE,
    source_type: "reading",
    object_path: RECEIPT_PATH,
    next_action: "3장 읽기"
  };
  const { container } = await renderHomeAtWidth(390, {
    focus: [focusReading],
    continueByWorkspace: {
      reading: {
        label: RECEIPT_TITLE,
        workspace: "reading",
        action: "3장 읽기",
        object_path: RECEIPT_PATH,
        dashboard_path: "HUB/20 Reading.md",
        status: "reading"
      }
    },
    continueCandidates: [
      { type: "reading", name: RECEIPT_TITLE, status: "reading", path: RECEIPT_PATH, next_action: "3장 읽기" }
    ]
  });

  // When: every rendered row mentioning the receipt title is counted
  const focusHits = focusRowTexts(container).filter((row) => row.includes(RECEIPT_TITLE));
  const continueHits = continueRowTexts(container).filter((row) => row.includes(RECEIPT_TITLE));

  // Then: the receipt regression is gone — the book renders once, in Focus only
  assert.equal(focusHits.length, 1, "the receipt book stays in Focus");
  assert.equal(continueHits.length, 0, "the receipt book no longer duplicates into Continue");
}

async function testMalformedPathAndTitleDoNotLeakDuplicates() {
  // Given: whitespace-only titles, doubled slashes, and NFD Korean in Continue payloads
  const nfdTitle = RECEIPT_TITLE.normalize("NFD");
  const { container } = await renderHomeAtWidth(1440, {
    focus: [{ id: "f", label: RECEIPT_TITLE, source_type: "reading", object_path: RECEIPT_PATH }],
    continueByWorkspace: {},
    continueCandidates: [
      { type: "reading", name: "   ", status: "reading", path: "   " },
      { type: "reading", name: RECEIPT_TITLE, status: "reading", path: ".//PARA//PROJECTS/Reading//" + RECEIPT_TITLE + ".md" },
      { type: "reading", name: nfdTitle, status: "reading" }
    ]
  });

  // When: surviving Continue rows are inspected
  const rows = continueRowTexts(container);

  // Then: blank titles never render and the denormalized path duplicate is removed
  assert.equal(rows.some((row) => /PARA/.test(row)), false, "raw paths never render as rows");
  assert.equal(
    rows.filter((row) => row.includes(RECEIPT_TITLE)).length,
    0,
    "path normalization removes the doubled-slash duplicate"
  );
  assert.ok(rows.length <= 1, "at most the unicode-variant row survives, never the exact duplicate");
}

async function testRerenderDoesNotAccumulateCreatorsOrDuplicates() {
  // Given: a stale first render of Home
  const first = await renderHomeAtWidth(1440);
  assert.equal(creatorButtons(first.container).length, 1);

  // When: the same container is rendered again with the module cache untouched
  const home = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  await home.renderHome({ app: createApp(), dv: {}, container: first.container });

  // Then: no creator or duplicate row accumulates across renders
  assert.equal(creatorButtons(first.container).length, 1, "rerender keeps exactly one creator");
  assert.equal(
    continueRowTexts(first.container).some((row) => /김포 오피스텔/.test(row)),
    false,
    "dedupe state is rebuilt per render, not leaked or lost"
  );
}

async function testStandaloneLauncherKeepsCreator() {
  // Given: the Launcher rendered standalone (not embedded in Home)
  clearModules();
  installDocument();
  installHomeDependencies();
  const launcherView = require(path.join(ROOT, "SYSTEM/Views/workspace-launcher-view.js"));
  const container = new FakeElement("div");

  // When: render is called without showCreator
  launcherView.render({
    container,
    app: createApp(),
    cards: global.WorkspaceLauncherCore.buildLauncherCards({})
  });

  // Then: the standalone Launcher still exposes its creator
  assert.equal(creatorButtons(container).length, 1, "standalone Launcher keeps its creator");

  // And: showCreator:false suppresses it without dropping cards
  const embedded = new FakeElement("div");
  launcherView.render({
    container: embedded,
    app: createApp(),
    cards: global.WorkspaceLauncherCore.buildLauncherCards({}),
    showCreator: false
  });
  assert.equal(creatorButtons(embedded).length, 0);
  assert.equal(launcherCardEls(embedded).length, 2);
}

async function testLauncherEmptyCardVisibilityByWidth() {
  // Given: Launcher cards where one context card is empty
  const compact = await renderHomeAtWidth(390);
  const medium = await renderHomeAtWidth(900);
  const wide = await renderHomeAtWidth(1440);

  // When: rendered Launcher cards are counted per width
  const compactCards = launcherCardEls(compact.container);
  const mediumCards = launcherCardEls(medium.container);
  const wideCards = launcherCardEls(wide.container);

  // Then: compact hides the empty card while medium/wide keep the context card
  assert.equal(compactCards.length, 1, "compact hides empty Launcher cards");
  assert.equal(compactCards.some((card) => card.hasClass("is-empty")), false);
  assert.equal(mediumCards.length, 2, "medium keeps the empty context card");
  assert.equal(wideCards.length, 2, "wide keeps the empty context card");
  assert.equal(wideCards.some((card) => card.hasClass("is-empty")), true);
}

async function testLauncherAllEmptyCompactStillRendersRegion() {
  // Given: every Launcher card is empty at compact width
  const { container } = await renderHomeAtWidth(390, {
    launcherCards: [
      {
        id: "reading",
        icon: "R",
        name: "독서",
        title: "",
        detail: "읽는 중인 책이 없습니다.",
        contextLabel: "비어 있음",
        path: "HUB/20 Reading.md",
        actionVerb: "둘러보기",
        empty: true
      }
    ]
  });

  // When: the Launcher mount is inspected
  const mount = container.findAll((element) => element.hasClass("home-launcher-mount"))[0];

  // Then: no empty cards render, and the region degrades without an error label
  assert.equal(launcherCardEls(container).length, 0);
  assert.equal(/표시하지 못했습니다|불러오지 못했습니다/.test(mount.textTree()), false);
}

async function testNoAnalyticsAndActionQueueLayout() {
  // Given: a wide Home render
  const { container, css } = await renderHomeAtWidth(1440);
  const homeText = container.textTree();

  // When: layout CSS and copy are inspected
  // Then: the base flow is one column and wide Home adds only a workspace sidebar
  assert.match(cssRule(css, ".home-grid {"), /grid-template-columns:\s*1fr/);
  assert.match(cssRule(css, ".prodigy-home.home-wide .home-mc-stack {"), /grid-template-columns:\s*260px\s+minmax\(0,\s*1fr\)/);
  assert.equal(/통계|그래프|차트|analytics/i.test(homeText), false);
}

async function main() {
  const tests = [
    testRegionOrderAtEveryWidth,
    testFocusCanonicalPathExcludedFromContinue,
    testPathlessFocusKeyExcludedFromContinue,
    testContinueKeepsUniqueAndHidesCompleted,
    testPathlessDifferentWorkspaceIsNotDeduped,
    testContinueEmptyState,
    testFocusEmptyStateKeepsApprovalSemantics,
    testExactlyOneVisibleCreatorInTopToolbar,
    testKeyboardCreatorShortcutPreserved,
    testIphoneReceiptReadingDuplicateEliminated,
    testMalformedPathAndTitleDoNotLeakDuplicates,
    testRerenderDoesNotAccumulateCreatorsOrDuplicates,
    testStandaloneLauncherKeepsCreator,
    testLauncherEmptyCardVisibilityByWidth,
    testLauncherAllEmptyCompactStillRendersRegion,
    testNoAnalyticsAndActionQueueLayout
  ];
  const failures = [];
  for (const test of tests) {
    try {
      await test();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failures.push({ name: test.name, message: (error && error.message) || String(error) });
      console.log(`FAIL ${test.name}: ${(error && error.message) || error}`);
    }
  }
  if (failures.length) {
    throw new Error(`${failures.length} Home flow scenario(s) failed: ${failures.map((f) => f.name).join(", ")}`);
  }
  console.log("Home flow dedupe tests passed");
}

main().catch((error) => {
  console.error("Home flow dedupe test failure:", error && error.message ? error.message : error);
  process.exit(1);
});
