"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const DESIGN_TOKENS = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

const AUCTION_PATH = "PARA/PROJECTS/Auction/a.md";

class ClassList {
  constructor(owner) {
    this.owner = owner;
    this.names = new Set();
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
    this.owner.attributes.class = Array.from(this.names).join(" ");
  }

  contains(name) { return this.names.has(name); }

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

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

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

  ancestors() {
    const chain = [];
    let node = this.parent;
    while (node) {
      chain.push(node);
      node = node.parent;
    }
    return chain;
  }
}

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.closed = false;
    FakeResizeObserver.instances.push(this);
  }

  observe(target) { this.observed.push(target); }

  disconnect() {
    this.closed = true;
    this.observed = [];
  }
}
FakeResizeObserver.instances = [];

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
  FakeResizeObserver.instances = [];
  global.ResizeObserver = FakeResizeObserver;
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

  const focusAuction = {
    id: "focus-auction",
    label: "김포 오피스텔",
    source_type: "auction",
    object_path: AUCTION_PATH,
    next_action: "관리비 확인"
  };

  const approvedFocus = options.focus === undefined ? [focusAuction] : options.focus;
  const candidates = options.continueCandidates === undefined
    ? [
      { type: "auction", name: "김포 오피스텔", status: "bidding", path: "./PARA/PROJECTS/AUCTION/A.MD" },
      { type: "reading", name: "Atomic Habits", status: "reading", path: "PARA/PROJECTS/Reading/book.md", next_action: "10페이지" },
      { type: "project", name: "감사 개선 계획", status: "doing", path: "PARA/PROJECTS/audit.md", next_action: "Task 8 마감" }
    ]
    : options.continueCandidates;

  global.MorningContextCore = {
    getTodayIsoDate: () => "2026-07-31",
    getYesterdayIsoDate: () => "2026-07-30",
    getWeekId: () => "2026-W31",
    getDaypart: () => "morning",
    buildMorningPackage: async () => ({
      local_date: "2026-07-31",
      day_of_week: "금",
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
      continue_by_workspace: options.continueByWorkspace === undefined ? {} : options.continueByWorkspace,
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
    buildLauncherCards: () => [
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
      }
    ]
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

function loadHome() {
  require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
  require(path.join(ROOT, "SYSTEM/Views/workspace-launcher-view.js"));
  return require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
}

async function mountHome(width, fixture) {
  clearModules();
  installDocument();
  installHomeDependencies(fixture);
  global.window.innerWidth = width;
  const home = loadHome();
  const container = new FakeElement("div");
  container.workspaceLeaf = new FakeElement("div", { clientWidth: width });
  const app = createApp();
  await home.renderHome({ app, dv: {}, container });
  return { home, app, container };
}

const INTERACTIVE_TAGS = new Set(["BUTTON", "A", "SUMMARY", "INPUT", "TEXTAREA", "SELECT"]);

function activationHandlers(element) {
  return typeof element.onclick === "function" ? 1 : 0;
}

function auditInteractiveSemantics(rootElement) {
  const problems = [];
  rootElement.findAll(() => true).forEach((element) => {
    if (!activationHandlers(element)) return;
    if (!INTERACTIVE_TAGS.has(element.tagName)) {
      problems.push(`non_semantic_activation:${element.tagName}.${element.attributes.class || ""}`);
      return;
    }
    const clickableAncestor = element.ancestors().find((ancestor) => activationHandlers(ancestor));
    if (clickableAncestor) {
      problems.push(`double_activation:${clickableAncestor.tagName}>${element.tagName}`);
    }
    if (element.tagName === "BUTTON") {
      const nestedButton = element.ancestors().find((ancestor) => ancestor.tagName === "BUTTON");
      if (nestedButton) problems.push("nested_button:BUTTON>BUTTON");
    }
  });
  return problems;
}

function accessibleName(element) {
  const label = element.attributes["aria-label"] || element.attributes.title || "";
  if (String(label).trim()) return String(label).trim();
  return String(element.textTree() || "").trim();
}

function continueRows(container) {
  return container.findAll((element) => element.hasClass("continue-row"));
}

function creatorButtons(container) {
  return container.findAll((element) => element.tagName === "BUTTON"
    && /새 Object/.test(String(element.textContent || "")));
}

function pressCreatorShortcut(options = {}) {
  let prevented = 0;
  global.document.dispatchKeydown({
    key: options.key || "n",
    metaKey: options.modifier !== "ctrl",
    ctrlKey: options.modifier === "ctrl",
    altKey: false,
    shiftKey: false,
    target: options.target || global.document.body,
    preventDefault() { prevented += 1; },
    stopPropagation() {}
  });
  return prevented;
}

async function testContinueRowsAreSemanticSingleActions() {
  // Given: Home rendered with three Continue candidates
  const { container } = await mountHome(1440);
  const rows = continueRows(container);

  // When: each Continue row is inspected as a control
  assert.ok(rows.length >= 2, "fixture renders multiple Continue rows");

  // Then: the row itself is the single native activation target with an accessible name
  rows.forEach((row) => {
    assert.ok(
      row.tagName === "BUTTON" || row.tagName === "A",
      `Continue row must be a native button/link, got ${row.tagName}`
    );
    if (row.tagName === "BUTTON") {
      assert.equal(row.attributes.type, "button", "Continue button declares type=button");
    }
    assert.ok(accessibleName(row).length > 0, "Continue row exposes an accessible name");
    assert.match(accessibleName(row), /이어하기/, "accessible name names the action");
    const inner = row.findAll((element) => element !== row && activationHandlers(element));
    assert.equal(inner.length, 0, "no second activation target lives inside the row");
    const innerButtons = row.findAll((element) => element !== row && element.tagName === "BUTTON");
    assert.equal(innerButtons.length, 0, "no button is nested inside the row button");
  });
}

async function testNoClickableDivAnywhereOnHome() {
  // Given: a full Home render
  const { container } = await mountHome(1440);

  // When: every element carrying an activation handler is audited
  const problems = auditInteractiveSemantics(container);

  // Then: activation only lives on native controls, once per control
  assert.deepEqual(problems, [], `Home interaction audit found: ${problems.join(", ")}`);
}

async function testAuditDetectsClickableDivAndDoubleActivation() {
  // Given: the adversarial fixture the plan requires to fail
  const fixtureRoot = new FakeElement("div");
  const badRow = fixtureRoot.createEl("div", { attr: { class: "continue-row" } });
  badRow.onclick = () => {};
  const nested = badRow.createEl("button", { text: "이어하기" });
  nested.onclick = () => {};

  // When: the same oracle used on the real render audits it
  const problems = auditInteractiveSemantics(fixtureRoot);

  // Then: both the clickable div and the double activation are reported
  assert.ok(
    problems.some((problem) => problem.startsWith("non_semantic_activation:DIV")),
    "clickable div is rejected"
  );
  assert.ok(
    problems.some((problem) => problem.startsWith("double_activation:DIV>BUTTON")),
    "row click plus button click is rejected"
  );
}

async function testActivationOpensTargetOnce() {
  // Given: Home rendered with a unique Continue candidate
  const { container, app } = await mountHome(1440);
  const row = continueRows(container).find((element) => /Atomic Habits/.test(element.textTree()));
  assert.ok(row, "the reading candidate renders a Continue row");

  // When: the row control is activated once
  const before = app.openedPaths.length;
  row.onclick({ stopPropagation() {} });

  // Then: exactly one navigation happens
  assert.equal(app.openedPaths.length - before, 1, "one activation opens exactly one target");
}

async function testRerenderKeepsOwnedListenersAndDisconnectsPreviousObserver() {
  // Given: a mounted Home with one shortcut listener, one capture-trust listener, and one observer
  const { home, container } = await mountHome(1440);
  assert.equal(global.document.keydownListeners.length, 2, "first render registers one shortcut and one capture keydown listener");
  assert.equal(FakeResizeObserver.instances.length, 1, "first render creates one ResizeObserver");

  // When: the same container is rendered twice more
  await home.renderHome({ app: createApp(), dv: {}, container });
  await home.renderHome({ app: createApp(), dv: {}, container });

  // Then: exactly two owned listeners remain and every earlier observer is disconnected
  assert.equal(global.document.keydownListeners.length, 2, "rerender removes both prior listeners before registering replacements");
  assert.equal(FakeResizeObserver.instances.length, 3, "each render owns its observer");
  assert.deepEqual(
    FakeResizeObserver.instances.map((observer) => observer.closed),
    [true, true, false],
    "previous observers are disconnected, only the latest stays live"
  );

  // And: one press still opens the creator exactly once
  const before = global.ObjectCreatorView.opens.length;
  const prevented = pressCreatorShortcut();
  assert.equal(global.ObjectCreatorView.opens.length - before, 1, "no duplicate handler runs after rerender");
  assert.equal(prevented, 1, "the shortcut is claimed once per press");
}

async function testDisposeReleasesBothResources() {
  // Given: a mounted Home exposing a dispose boundary
  const { home, container } = await mountHome(1440);
  const dispose = typeof home.disposeHome === "function"
    ? () => home.disposeHome(container)
    : container.__prodigyHomeDispose;
  assert.equal(typeof dispose, "function", "Home exposes a dispose boundary for mount removal");

  // When: the mount is disposed
  dispose();

  // Then: no document listener and no live observer remains
  assert.equal(global.document.keydownListeners.length, 0, "dispose removes the document keydown listener");
  assert.deepEqual(
    FakeResizeObserver.instances.map((observer) => observer.closed),
    [true],
    "dispose disconnects the ResizeObserver"
  );

  // And: the shortcut is inert after dispose
  const before = global.ObjectCreatorView.opens.length;
  pressCreatorShortcut();
  assert.equal(global.ObjectCreatorView.opens.length, before, "disposed Home no longer answers Cmd+N");

  // And: dispose is idempotent
  dispose();
  assert.equal(global.document.keydownListeners.length, 0, "second dispose stays at zero listeners");
}

async function testShortcutIgnoresEditableTargets() {
  // Given: a mounted Home
  await mountHome(1440);
  const before = global.ObjectCreatorView.opens.length;

  // When: Cmd/Ctrl+N is pressed while an editable target has focus
  const input = new FakeElement("input");
  const textarea = new FakeElement("textarea");
  const select = new FakeElement("select");
  const editable = new FakeElement("div");
  editable.isContentEditable = true;
  const editableByAttr = new FakeElement("div", { attr: { contenteditable: "true" } });

  let prevented = 0;
  [input, textarea, select, editable, editableByAttr].forEach((target) => {
    prevented += pressCreatorShortcut({ target });
    prevented += pressCreatorShortcut({ target, modifier: "ctrl" });
  });

  // Then: editable targets keep their own Cmd/Ctrl+N
  assert.equal(global.ObjectCreatorView.opens.length, before, "editable targets never open the creator");
  assert.equal(prevented, 0, "the shortcut does not preventDefault inside editable targets");

  // And: a non-editable target still works
  assert.equal(pressCreatorShortcut(), 1, "body-level Cmd+N still claims the shortcut");
  assert.equal(global.ObjectCreatorView.opens.length - before, 1, "creator opens for non-editable targets");
}

async function testTask7BehaviorPreserved() {
  // Given: Home rendered with the Focus auction duplicated in Continue
  const { container } = await mountHome(1440);

  // When: creator buttons and Continue rows are counted
  const rows = continueRows(container).map((row) => row.textTree());

  // Then: Task 7 dedupe and single-creator guarantees still hold
  assert.equal(creatorButtons(container).length, 1, "exactly one visible creator button remains");
  assert.equal(
    rows.some((row) => /김포 오피스텔/.test(row)),
    false,
    "the approved Focus auction is still excluded from Continue"
  );
  assert.equal(rows.length, 2, "the two unique candidates still render");
}

const TESTS = [
  ["Continue rows are semantic single actions", testContinueRowsAreSemanticSingleActions],
  ["no clickable div anywhere on Home", testNoClickableDivAnywhereOnHome],
  ["audit rejects clickable div and double activation", testAuditDetectsClickableDivAndDoubleActivation],
  ["activation opens exactly one target", testActivationOpensTargetOnce],
  ["rerender keeps owned listeners and disconnects previous observer", testRerenderKeepsOwnedListenersAndDisconnectsPreviousObserver],
  ["dispose releases listener and observer", testDisposeReleasesBothResources],
  ["shortcut ignores editable targets", testShortcutIgnoresEditableTargets],
  ["Task 7 dedupe and single creator preserved", testTask7BehaviorPreserved]
];

async function main() {
  let failures = 0;
  for (const [name, fn] of TESTS) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  console.log(`${TESTS.length - failures}/${TESTS.length} home interaction lifecycle checks passed`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
