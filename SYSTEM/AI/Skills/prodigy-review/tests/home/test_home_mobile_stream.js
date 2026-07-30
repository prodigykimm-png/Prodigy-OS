"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const WORKSPACE_REGISTRY = require(path.join(ROOT, "SYSTEM/Views/workspace-registry.js"));
const WORKSPACE_BAR_CORE = require(path.join(ROOT, "SYSTEM/Views/home-workspace-bar-core.js"));
const LONG_KOREAN_LABEL = "가".repeat(40);
const LONG_URL = "https://example.test/" + "a".repeat(200);

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

  toString() {
    return Array.from(this.names).join(" ");
  }
}

class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.style = {};
    this.classList = new ClassList(this);
    this.onclick = null;
    this.disabled = Boolean(options.disabled);
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
      if (key === "style") {
        this.attributes.style = String(value);
        return;
      }
      this.attributes[key] = String(value);
    });
  }

  createEl(tagName, options = {}) {
    const child = new FakeElement(tagName, options);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  createDiv(options = {}) {
    return this.createEl("div", options);
  }

  createSpan(options = {}) {
    return this.createEl("span", options);
  }

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

  hasClass(name) {
    return this.classList.contains(name);
  }

  textTree() {
    return [this.textContent, ...this.children.map((child) => child.textTree())].filter(Boolean).join(" ");
  }

  findAll(predicate, found = []) {
    if (predicate(this)) found.push(this);
    this.children.forEach((child) => child.findAll(predicate, found));
    return found;
  }
}

function installDocument() {
  const styleElements = new Map();
  global.document = {
    body: new FakeElement("body"),
    documentElement: new FakeElement("html"),
    head: {
      appendChild(element) {
        styleElements.set(element.id, element);
      }
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    getElementById(id) {
      return styleElements.get(id) || null;
    }
  };
  global.window = global;
  delete global.window.visualViewport;
  global.ResizeObserver = undefined;
  global.Notice = class Notice {
    constructor(message) {
      this.message = message;
    }
  };
  return styleElements;
}

function clearModules() {
  [
    "SYSTEM/Views/home-styles.js",
    "SYSTEM/Views/home-view.js"
  ].forEach((modulePath) => {
    const resolved = require.resolve(path.join(ROOT, modulePath));
    delete require.cache[resolved];
  });
  delete global.HomeStyles;
  delete global.HomeView;
}

function cssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : "";
}

function installHomeDependencies({ registryAvailable = true, registryItems = null } = {}) {
  global.ProdigyTokens = {};
  global.ProdigyUI = { ensureStyles() {} };
  global.MorningContextCore = {
    getTodayIsoDate: () => "2026-07-28",
    getWeekId: () => "2026-W31",
    getDaypart: () => "morning",
    buildMorningPackage: async () => ({
      local_date: "2026-07-28",
      day_of_week: "화",
      warnings: [],
      context: {
        todoist: { todayCount: 2, overdueCount: 1 },
        projects: [
          {
            name: LONG_KOREAN_LABEL,
            title: LONG_KOREAN_LABEL,
            status: "doing",
            path: LONG_URL,
            next_action: "다음 행동"
          }
        ],
        auctions: [],
        reading: [],
        continue_candidates: [
          {
            type: "project",
            name: LONG_KOREAN_LABEL,
            status: "doing",
            path: LONG_URL,
            next_action: LONG_URL
          }
        ],
        risks: [
          {
            label: LONG_KOREAN_LABEL,
            reason: LONG_URL,
            workspace_label: "프로젝트",
            dashboard_path: "HUB/40 Project.md",
            attention_level: "high"
          }
        ],
        review_inbox: [],
        recent_reflections: [],
        yesterday_review: null
      }
    }),
    generateDeterministicFallback: () => ({
      schema_version: "morning-result-v1",
      brief_mode: "rule_based",
      brief: "규칙 기반 브리프\n" + LONG_URL + "\n표시되면 안 되는 세 번째 줄",
      focus: [
        {
          id: "focus-1",
          label: LONG_KOREAN_LABEL,
          source_type: "project",
          object_path: LONG_URL,
          next_action: LONG_URL
        }
      ]
    }),
    selectFocusItems: ({ focusItems }) => focusItems
  };
  global.MorningBriefService = {
    generateMorningResult: async () => global.MorningContextCore.generateDeterministicFallback()
  };
  global.MorningCache = {
    getDailyCache: async () => ({
      pkg: null,
      result: global.MorningContextCore.generateDeterministicFallback()
    }),
    getApprovedFocus: async () => ({
      focus: [
        {
          id: "approved-1",
          label: LONG_KOREAN_LABEL,
          source_type: "project",
          object_path: LONG_URL,
          next_action: LONG_URL
        }
      ]
    }),
    getPinnedFocus: async () => null,
    checkIsStale: () => false,
    clearPinnedFocus: async () => {},
    saveApprovedFocus: async (_app, _date, focus) => ({ focus }),
    saveDailyCache: async () => {},
    clearApprovedFocus: async () => {}
  };
  global.MorningBriefContext = {
    buildMorningBriefContext: () => ({
      engine_ok: true,
      continue_by_workspace: {
        project: {
          label: LONG_KOREAN_LABEL,
          workspace: "project",
          action: LONG_URL,
          object_path: LONG_URL,
          dashboard_path: "HUB/40 Project.md",
          status: "doing"
        }
      },
      engine_states: {}
    }),
    toHomeRiskItems: () => [
      {
        label: LONG_KOREAN_LABEL,
        reason: LONG_URL,
        workspace: "project",
        workspace_label: "프로젝트",
        dashboard_path: "HUB/40 Project.md",
        attention_level: "high",
        evidence: [LONG_URL]
      }
    ]
  };
  global.JournalStore = { loadReview: async () => ({ status: "empty", blocks: [], fields: {} }) };
  global.WorkspaceLauncherCore = {
    loadWorkoutSnapshot: async () => null,
    buildLauncherCards: () => [
      { id: "project", name: "프로젝트", title: LONG_KOREAN_LABEL, detail: LONG_URL, path: "HUB/40 Project.md", actionVerb: "계속" }
    ]
  };
  global.WorkspaceLauncherView = {
    render({ container, cards }) {
      const card = container.createEl("div", { attr: { class: "prodigy-launcher-card" } });
      card.createEl("div", { text: cards[0].title });
      card.createEl("div", { text: cards[0].detail });
      card.createEl("button", { text: cards[0].actionVerb, attr: { type: "button" } });
    }
  };
  if (registryAvailable) {
    const items = Array.isArray(registryItems)
      ? registryItems
      : [{ id: "project", icon: "P", label: LONG_KOREAN_LABEL, path: LONG_URL }];
    global.ProdigyWorkspaceRegistry = {
      items: () => items.slice(),
      launcherItems: () => items.filter((item) => item.launcher !== false),
      find: (id) => items.find((item) => item.id === id) || null
    };
  } else {
    delete global.ProdigyWorkspaceRegistry;
  }
}

function createApp({ mobile }) {
  const openedPaths = [];
  return {
    isMobile: mobile,
    openedPaths,
    vault: {
      getAbstractFileByPath: () => ({ path: "fixture.md" }),
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

async function renderHomeAtWidth(width, {
  mobile = false,
  registryAvailable = true,
  registryItems = null,
  workspaceBarSelection = null
} = {}) {
  clearModules();
  installDocument();
  installHomeDependencies({ registryAvailable, registryItems });
  global.window.innerWidth = width;
  require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
  const home = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  const container = new FakeElement("div");
  container.workspaceLeaf = new FakeElement("div", { clientWidth: width });
  const app = createApp({ mobile });
  await home.renderHome({
    app,
    dv: {},
    container,
    workspaceBarSelection
  });
  return { app, container, css: global.document.getElementById("prodigy-home-styles").textContent };
}

async function renderHomeWithContainerOnlyWidth(width) {
  clearModules();
  installDocument();
  installHomeDependencies();
  global.window.innerWidth = 1440;
  require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
  const home = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  const container = new FakeElement("div", { clientWidth: width });
  await home.renderHome({ app: createApp({ mobile: false }), dv: {}, container });
  return container;
}

async function renderHomeWithDocumentOnlyWidth(width) {
  clearModules();
  installDocument();
  installHomeDependencies();
  global.document.documentElement.clientWidth = width;
  global.document.body.clientWidth = width;
  global.window.innerWidth = 1440;
  global.window.visualViewport = { width };
  require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
  const home = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  const container = new FakeElement("div");
  await home.renderHome({ app: createApp({ mobile: false }), dv: {}, container });
  return container;
}

function topLevelSections(container) {
  const stack = container.findAll((element) => element.hasClass("home-mc-stack"))[0];
  return stack.children
    .filter((child) => child.hasClass("home-card") || child.tagName === "DETAILS")
    .map((child) => {
      if (child.tagName === "DETAILS") return "Fold";
      const text = child.textTree();
      if (/모닝 브리프/.test(text)) return "Morning Brief";
      if (/오늘의 집중/.test(text)) return "Today's Focus";
      if (/이어하기/.test(text)) return "Continue";
      if (/Micro Log|마이크로 로그/.test(text)) return "Micro Log";
      if (/주의가 필요함/.test(text)) return "Needs Attention";
      if (/빠른 실행/.test(text)) return "Quick Actions";
      if (/런처|프로젝트/.test(text) && child.hasClass("home-launcher-mount")) return "Launcher";
      if (/시스템 상태/.test(text)) return "System Status";
      return text.slice(0, 24);
    });
}

function foldedSections(container) {
  const fold = container.findAll((element) => element.hasClass("home-secondary-fold"))[0];
  assert.ok(fold, "compact Home exposes a secondary fold");
  const body = fold.findAll((element) => element.hasClass("home-secondary-fold-body"))[0];
  assert.ok(body, "compact fold has a body");
  return body.children.map((child) => {
    if (child.hasClass("home-launcher-mount")) return "Launcher";
    const text = child.textTree();
    if (/주의가 필요함/.test(text)) return "Needs Attention";
    if (/빠른 실행/.test(text)) return "Quick Actions";
    if (/런처|프로젝트/.test(text)) return "Launcher";
    if (/시스템 상태/.test(text)) return "System Status";
    if (/Todoist/.test(text)) return "Todoist";
    return text.slice(0, 24);
  });
}

async function testCompactQuickStreamOrder() {
  // Given: a narrow Home render at a 390px-equivalent width
  const { container } = await renderHomeAtWidth(390, { mobile: false });

  // When: the compact stream is inspected
  // Then: it is one Home, ordered for quick review before folded secondary chrome
  assert.equal(container.hasClass("home-compact"), true);
  assert.equal(container.findAll((element) => element.hasClass("prodigy-home")).length, 1);
  assert.deepEqual(topLevelSections(container), [
    "Morning Brief",
    "Today's Focus",
    "Continue",
    "Micro Log",
    "Fold"
  ]);
  assert.deepEqual(foldedSections(container), [
    "Needs Attention",
    "Quick Actions",
    "Launcher",
    "System Status"
  ]);
  const briefText = container.findAll((element) => element.hasClass("home-brief-text"))[0];
  assert.equal(briefText.textContent.split("\n").length, 2);
  assert.equal(briefText.textContent.includes("표시되면 안 되는 세 번째 줄"), false);
}

async function testCompactWorkspaceBarSingleRowContract() {
  // Given: canonical workspaces and an explicit compact-width bar selection
  const { app, container } = await renderHomeAtWidth(390, {
    registryItems: WORKSPACE_REGISTRY.items(),
    workspaceBarSelection: {
      pinnedIds: ["workout", "auction"],
      recentId: "project"
    }
  });

  // When: the compact workspace bar structure is inspected
  const rows = container.findAll((element) => element.hasClass("home-ws-dock-row"));

  // Then: exactly one non-wrapping, non-scrolling row exposes pinned 2 + recent 1 + all
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attributes["data-row-count"], "1");
  assert.equal(rows[0].attributes["data-wrap"], "nowrap");
  assert.equal(rows[0].attributes["data-horizontal-scroll"], "false");
  const buttons = rows[0].children.filter((element) => element.tagName === "BUTTON");
  assert.deepEqual(
    buttons.map((button) => button.attributes["data-workspace"]),
    ["workout", "auction", "project", "all"]
  );
  assert.equal(buttons[0].attributes["aria-label"], "운동 워크스페이스 열기");
  buttons[0].onclick();
  assert.deepEqual(app.openedPaths, ["HUB/30 Workout.md"]);
}

function testWorkspaceBarPinnedOrder() {
  // Given: two pinned workspace ids in user-defined order
  const selection = { pinnedIds: ["workout", "auction"], recentIds: ["project"] };

  // When: the pure hybrid-bar model is built from the canonical registry
  const model = WORKSPACE_BAR_CORE.buildWorkspaceBarModel(WORKSPACE_REGISTRY, selection);

  // Then: pinned order is preserved before the recent workspace
  assert.deepEqual(model.directItems.map((item) => item.id), ["workout", "auction", "project"]);
}

function testWorkspaceBarRecentDeduplication() {
  // Given: the newest recent workspace is already pinned and an older recent remains
  const selection = {
    pinnedIds: ["auction", "project"],
    recentIds: ["project", "reading", "workout"]
  };

  // When: the pure hybrid-bar model excludes pinned duplicates
  const model = WORKSPACE_BAR_CORE.buildWorkspaceBarModel(WORKSPACE_REGISTRY, selection);

  // Then: the first non-pinned recent workspace occupies the recent slot
  assert.deepEqual(model.directItems.map((item) => item.id), ["auction", "project", "reading"]);
}

function testWorkspaceBarMissingRecentFallback() {
  // Given: two pinned workspaces and no recent history
  const selection = { pinnedIds: ["auction", "project"], recentIds: [] };

  // When: the pure hybrid-bar model is built
  const model = WORKSPACE_BAR_CORE.buildWorkspaceBarModel(WORKSPACE_REGISTRY, selection);

  // Then: the first remaining registry workspace fills the recent slot gracefully
  assert.deepEqual(model.directItems.map((item) => item.id), ["auction", "project", "knowledge"]);
}

function testWorkspaceBarRetainsAllRegistryEntries() {
  // Given: the canonical registry
  // When: the pure hybrid-bar model is built
  const model = WORKSPACE_BAR_CORE.buildWorkspaceBarModel(WORKSPACE_REGISTRY, {
    pinnedIds: ["auction", "project"],
    recentIds: ["reading"]
  });

  // Then: the bottom-sheet projection retains every registry id in registry order
  assert.deepEqual(
    model.sheetItems.map((item) => item.id),
    WORKSPACE_REGISTRY.items().map((item) => item.id)
  );
  assert.equal(model.sheetItems.every((item) => item.accessibleLabel.length > item.label.length), true);
}

function testWorkoutRemainsReachable() {
  // Given: Workout is outside the three direct slots
  const model = WORKSPACE_BAR_CORE.buildWorkspaceBarModel(WORKSPACE_REGISTRY, {
    pinnedIds: ["auction", "project"],
    recentIds: ["reading"]
  });

  // When: all bottom-sheet entries are inspected
  const workout = model.sheetItems.find((item) => item.id === "workout");

  // Then: Workout remains a fully labelled route to its existing dashboard
  assert.deepEqual(workout, {
    id: "workout",
    kind: "workspace",
    label: "운동",
    path: "HUB/30 Workout.md",
    accessibleLabel: "운동 워크스페이스 열기"
  });
}

async function testDesktopParityAndCompactPredicate() {
  // Given: desktop and compact Home widths
  const desktop = await renderHomeAtWidth(1024);
  const compact = await renderHomeAtWidth(430);
  const mobile = await renderHomeAtWidth(1024, { mobile: true });
  const containerOnlyCompact = await renderHomeWithContainerOnlyWidth(390);
  const documentOnlyCompact = await renderHomeWithDocumentOnlyWidth(390);

  // When: availability and compact predicates are inspected
  // Then: desktop retains full content while narrow/app mobile uses compact mode
  assert.equal(desktop.container.hasClass("home-compact"), false);
  assert.equal(compact.container.hasClass("home-compact"), true);
  assert.equal(mobile.container.hasClass("home-compact"), true);
  assert.equal(containerOnlyCompact.hasClass("home-compact"), true);
  assert.equal(documentOnlyCompact.hasClass("home-compact"), true);
  assert.ok(desktop.container.textTree().includes("Todoist"));
  assert.ok(desktop.container.textTree().includes("주의가 필요함"));
  assert.ok(desktop.container.textTree().includes("빠른 실행"));
  assert.ok(desktop.container.textTree().includes("시스템 상태"));
}

async function testDesktopWorkspaceShortcutsRemainVisible() {
  // Given: desktop Home with a workspace registry and long item labels
  const { container, css } = await renderHomeAtWidth(1024);

  // When: the visible shortcut surface is inspected
  // Then: desktop has an obvious Home-owned workspace shortcut surface above lower launcher chrome
  assert.equal(container.hasClass("home-compact"), false);
  const shortcutSurface = container.findAll((element) => element.hasClass("home-ws-dock"))[0];
  assert.ok(shortcutSurface, "desktop Home must render a workspace shortcut surface");
  assert.equal(shortcutSurface.textTree().includes("워크스페이스 바로가기"), true);
  assert.equal(shortcutSurface.textTree().includes(LONG_KOREAN_LABEL), true);
  assert.equal(shortcutSurface.findAll((element) => element.tagName === "BUTTON").length >= 1, true);
  assert.match(cssRule(css, ".prodigy-home .home-ws-dock"), /display:\s*block/);
  assert.doesNotMatch(cssRule(css, ".prodigy-home .home-ws-dock"), /display:\s*none/);
}

async function testDesktopWorkspaceShortcutFallbackWhenRegistryUnavailable() {
  // Given: desktop Home before the workspace registry is available
  const { container } = await renderHomeAtWidth(1024, { registryAvailable: false });

  // When: the shortcut surface is inspected
  // Then: it shows Korean recoverable workspace links instead of silently rendering nothing
  const shortcutSurface = container.findAll((element) => element.hasClass("home-ws-dock"))[0];
  assert.ok(shortcutSurface, "desktop Home must render fallback workspace shortcuts");
  assert.match(shortcutSurface.textTree(), /워크스페이스 바로가기/);
  assert.match(shortcutSurface.textTree(), /기본 바로가기|프로젝트/);
  assert.equal(shortcutSurface.findAll((element) => element.tagName === "BUTTON").length >= 1, true);
}

async function testDesktopNarrowDesktopStateDoesNotDropFocusContinue() {
  // Given: Home is rendered through desktop, narrow, then desktop widths
  const desktopBefore = await renderHomeAtWidth(1024);
  const narrow = await renderHomeAtWidth(390);
  const desktopAfter = await renderHomeAtWidth(1024);

  // Then: compact state does not leak and Focus/Continue remain available across the transition
  assert.equal(desktopBefore.container.hasClass("home-compact"), false);
  assert.equal(narrow.container.hasClass("home-compact"), true);
  assert.equal(desktopAfter.container.hasClass("home-compact"), false);
  [desktopBefore.container, narrow.container, desktopAfter.container].forEach((container) => {
    const text = container.textTree();
    assert.equal(text.includes("오늘의 집중"), true);
    assert.equal(text.includes("이어하기"), true);
    assert.equal(text.includes(LONG_KOREAN_LABEL), true);
  });
}

async function testFocusAndTouchContracts() {
  // Given: compact Home CSS and rendered controls
  const { container, css } = await renderHomeAtWidth(375);
  const buttons = container.findAll((element) => element.tagName === "BUTTON");

  // When: focus order and touch CSS are inspected
  // Then: buttons remain in DOM order and compact primary controls never override to min-height:0
  assert.ok(buttons.length >= 6);
  assert.match(buttons.map((button) => button.textTree()).join(" > "), /새 Object.*새로고침.*브리핑 다시 생성.*워크스페이스 열기/s);
  assert.doesNotMatch(buttons.map((button) => button.textTree()).join(" > "), /일기 쓰기|AI 분류/);
  assert.doesNotMatch(css, /home-compact[\s\S]*min-height:\s*0\s*!important/);
  assert.match(css, /home-compact[\s\S]*min-height:\s*var\(--ke-touch-target\)/);
  assert.match(css, /:focus-visible[\s\S]*outline:\s*2px solid var\(--(?:ke-color-accent|text-accent)\)/);
}

async function testResponsiveTextMotionAndOverflowContracts() {
  // Given: compact Home rendered at required widths with long CJK labels and an unbroken URL
  const widths = [320, 375, 390, 430];
  for (const width of widths) {
    const { container, css } = await renderHomeAtWidth(width);

    // When: classes and CSS contracts are inspected
    // Then: no nested vertical scroll contract is introduced and long text can wrap safely
    assert.equal(container.hasClass("home-compact"), true);
    assert.equal(container.style.width, `${Math.max(280, width - 16)}px`);
    assert.equal(container.textTree().includes(LONG_KOREAN_LABEL), true);
    assert.equal(container.textTree().includes(LONG_URL), true);
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /word-break:\s*keep-all/);
    assert.doesNotMatch(css, /home-compact[\s\S]*overflow-y:\s*(auto|scroll)/);
    assert.doesNotMatch(css, /home-ws-dock-row[\s\S]*overflow-x:\s*auto/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  }
}

async function main() {
  testWorkspaceBarPinnedOrder();
  testWorkspaceBarRecentDeduplication();
  testWorkspaceBarMissingRecentFallback();
  testWorkspaceBarRetainsAllRegistryEntries();
  testWorkoutRemainsReachable();
  await testCompactQuickStreamOrder();
  await testCompactWorkspaceBarSingleRowContract();
  await testDesktopParityAndCompactPredicate();
  await testDesktopWorkspaceShortcutsRemainVisible();
  await testDesktopWorkspaceShortcutFallbackWhenRegistryUnavailable();
  await testDesktopNarrowDesktopStateDoesNotDropFocusContinue();
  await testFocusAndTouchContracts();
  await testResponsiveTextMotionAndOverflowContracts();
  console.log("Home mobile quick stream tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
