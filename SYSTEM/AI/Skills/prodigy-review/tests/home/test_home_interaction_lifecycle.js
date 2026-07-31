"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HOME_PATH = path.join(ROOT, "SYSTEM/Views/home-view.js");

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
    const active = force === undefined ? !this.names.has(name) : Boolean(force);
    if (active) this.names.add(name);
    else this.names.delete(name);
    this.owner.attributes.class = Array.from(this.names).join(" ");
    return active;
  }
}

class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = {};
    this.children = [];
    this.parent = null;
    this.parentElement = null;
    this.clientWidth = options.clientWidth || 0;
    this.textContent = "";
    this.text = "";
    this.onclick = null;
    this.open = false;
    this.style = {
      setProperty(name, value) { this[name] = String(value); }
    };
    this.classList = new ClassList(this);
    if (options.text) this.setText(options.text);
    if (options.attr) this.applyAttr(options.attr);
  }

  setText(value) {
    this.textContent = String(value);
    this.text = String(value);
  }

  applyAttr(attributes) {
    Object.entries(attributes).forEach(([name, value]) => {
      if (name === "class") {
        String(value).split(/\s+/).filter(Boolean).forEach((className) => this.classList.add(className));
      } else {
        this.attributes[name] = String(value);
      }
    });
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  createEl(tagName, options = {}) {
    const child = new FakeElement(tagName, options);
    child.parent = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
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
    this.parentElement = null;
  }

  closest(selector) {
    if (selector === ".workspace-leaf-content") return this.workspaceLeaf || null;
    return null;
  }

  getBoundingClientRect() {
    return { width: this.clientWidth };
  }

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

  click() {
    const event = {
      target: this,
      currentTarget: this,
      propagationStopped: false,
      preventDefault() {},
      stopPropagation() { this.propagationStopped = true; }
    };
    let current = this;
    while (current && !event.propagationStopped) {
      event.currentTarget = current;
      if (typeof current.onclick === "function") current.onclick(event);
      current = current.parent;
    }
  }
}

function installRuntime() {
  const keydownListeners = [];
  const observers = [];
  global.document = {
    body: new FakeElement("body"),
    documentElement: new FakeElement("html", { clientWidth: 1440 }),
    addEventListener(type, handler) {
      if (type === "keydown") keydownListeners.push(handler);
    },
    removeEventListener(type, handler) {
      if (type !== "keydown") return;
      const index = keydownListeners.indexOf(handler);
      if (index >= 0) keydownListeners.splice(index, 1);
    },
    dispatchKeydown(event) {
      keydownListeners.slice().forEach((handler) => handler(event));
    }
  };
  global.window = global;
  global.window.innerWidth = 1440;
  global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnectCount = 0;
      this.observed = [];
      observers.push(this);
    }

    observe(element) {
      this.observed.push(element);
    }

    disconnect() {
      this.disconnectCount += 1;
    }
  };
  global.Notice = class Notice {};
  return { keydownListeners, observers };
}

function installDependencies() {
  global.ProdigyTokens = {
    BREAKPOINTS: { medium: 768, wide: 1024 },
    CONTROL_HEIGHTS: { workspaceBar: 48 }
  };
  global.HomeStyles = { ensureHomeStyles() {} };
  global.ProdigyWorkspaceRegistry = {
    items: () => [],
    find: () => null
  };
  global.HomeWorkspaceBarCore = {
    buildWorkspaceBarModel: () => ({
      barItems: [],
      sheetItems: [],
      layout: { rowCount: 1, wrap: false, horizontalScroll: false }
    })
  };
  global.ProdigyAdaptiveControls = {};
  global.ProjectTodoistAdapter = { getTodoistToken: async () => "" };
  global.MorningContextCore = {
    getTodayIsoDate: () => "2026-07-31",
    getWeekId: () => "2026-W31",
    getDaypart: () => "morning",
    buildMorningPackage: async () => ({
      local_date: "2026-07-31",
      day_of_week: "목",
      warnings: [],
      context: {
        todoist: { todayCount: 0, overdueCount: 0 },
        projects: [],
        auctions: [],
        reading: [],
        continue_candidates: [],
        risks: [],
        review_inbox: [],
        yesterday_review: null
      }
    }),
    generateDeterministicFallback: () => ({
      brief_mode: "rule_based",
      brief: "규칙 기반 브리프",
      focus: []
    }),
    selectFocusItems: ({ focusItems }) => (focusItems || []).slice()
  };
  global.MorningBriefService = {
    generateMorningResult: async () => global.MorningContextCore.generateDeterministicFallback()
  };
  global.MorningCache = {
    getDailyCache: async () => ({ pkg: null, result: global.MorningContextCore.generateDeterministicFallback() }),
    getApprovedFocus: async () => null,
    getPinnedFocus: async () => null,
    checkIsStale: () => false,
    saveDailyCache: async () => {},
    clearApprovedFocus: async () => {}
  };
  global.MorningBriefContext = {
    buildMorningBriefContext: () => ({
      engine_ok: true,
      engine_states: {},
      continue_by_workspace: {
        reading: {
          label: "Atomic Habits",
          workspace: "reading",
          action: "10페이지 읽기",
          object_path: "PARA/PROJECTS/Reading/Atomic Habits.md",
          dashboard_path: "HUB/20 Reading.md",
          status: "reading"
        }
      }
    }),
    toHomeRiskItems: () => []
  };
  global.JournalStore = { loadReview: async () => ({ status: "empty", fields: {} }) };
  global.WorkspaceLauncherCore = {
    loadWorkoutSnapshot: async () => null,
    buildLauncherCards: () => []
  };
  global.WorkspaceLauncherView = { render() {} };
  global.ObjectCreatorView = {
    opens: 0,
    open() { this.opens += 1; }
  };
}

function createApp() {
  const openedPaths = [];
  return {
    isMobile: false,
    openedPaths,
    vault: {
      getAbstractFileByPath: (target) => ({ path: target }),
      read: async () => ""
    },
    workspace: {
      openLinkText(target) { openedPaths.push(target); },
      getLeaf: () => null
    },
    commands: { executeCommandById: () => false }
  };
}

async function createRenderedHome() {
  delete require.cache[require.resolve(HOME_PATH)];
  delete global.HomeView;
  const runtime = installRuntime();
  installDependencies();
  const home = require(HOME_PATH);
  const container = new FakeElement("div", { clientWidth: 1440 });
  container.workspaceLeaf = new FakeElement("div", { clientWidth: 1440 });
  const app = createApp();
  const lifecycle = await home.renderHome({ app, dv: {}, container });
  return { app, container, home, lifecycle, runtime };
}

function dispatchCreatorShortcut(target) {
  global.document.dispatchKeydown({
    key: "n",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target,
    preventDefault() {},
    stopPropagation() {}
  });
}

async function testRenderRerenderDisposeOwnsGlobalResources() {
  // Given: Home has completed one render with one listener and one observer.
  const fixture = await createRenderedHome();
  assert.equal(fixture.runtime.keydownListeners.length, 1);
  assert.equal(fixture.runtime.observers.length, 1);

  // When: the same container rerenders and the latest lifecycle is disposed.
  const lifecycle = await fixture.home.renderHome({ app: fixture.app, dv: {}, container: fixture.container });
  assert.equal(fixture.runtime.keydownListeners.length, 1, "rerender must retain exactly one keydown listener");
  assert.equal(fixture.runtime.observers.length, 2);
  assert.equal(fixture.runtime.observers[0].disconnectCount, 1, "rerender must disconnect the previous observer");
  assert.equal(typeof lifecycle?.dispose, "function", "renderHome must return an explicit dispose handle");
  lifecycle.dispose();

  // Then: neither global resource survives disposal.
  assert.equal(fixture.runtime.keydownListeners.length, 0, "dispose must remove the keydown listener");
  assert.equal(fixture.runtime.observers[1].disconnectCount, 1, "dispose must disconnect the active observer");
}

async function testCreatorShortcutIgnoresEditableTargets() {
  // Given: Home owns the creator shortcut and each target represents an editing surface.
  const fixture = await createRenderedHome();
  const editable = new FakeElement("div", { attr: { contenteditable: "true" } });
  const editableChild = editable.createEl("span");
  const targets = [
    new FakeElement("input"),
    new FakeElement("textarea"),
    new FakeElement("select"),
    editableChild
  ];

  // When: Cmd+N originates from each editing surface.
  targets.forEach(dispatchCreatorShortcut);

  // Then: Home does not claim any of those keystrokes.
  assert.equal(global.ObjectCreatorView.opens, 0, "input, textarea, select, and contenteditable keep Cmd+N");
  fixture.home.disposeHome(fixture.container);
}

async function testContinueUsesContextualNativeControl() {
  // Given: one Continue item is rendered.
  const fixture = await createRenderedHome();
  const row = fixture.container.findAll((element) => element.classList.contains("continue-row"))[0];
  const buttons = row.findAll((element) => element.tagName === "BUTTON");

  // When: the Continue control semantics are inspected.
  // Then: one native button exposes its action and Object context.
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].attributes.type, "button");
  assert.match(buttons[0].attributes["aria-label"] || "", /Atomic Habits.*이어하기|이어하기.*Atomic Habits/);
  fixture.home.disposeHome(fixture.container);
}

async function testContinueHasOneActivationPath() {
  // Given: one Continue row and its native action.
  const fixture = await createRenderedHome();
  const row = fixture.container.findAll((element) => element.classList.contains("continue-row"))[0];
  const button = row.findAll((element) => element.tagName === "BUTTON")[0];

  // When: the native action is activated once.
  assert.equal(row.onclick, null, "the non-semantic row must not be a second activation target");
  button.click();

  // Then: navigation occurs exactly once.
  assert.deepEqual(fixture.app.openedPaths, ["HUB/20 Reading.md"]);
  fixture.home.disposeHome(fixture.container);
}

async function main() {
  const scenarios = [
    testRenderRerenderDisposeOwnsGlobalResources,
    testCreatorShortcutIgnoresEditableTargets,
    testContinueUsesContextualNativeControl,
    testContinueHasOneActivationPath
  ];
  const failures = [];
  for (const scenario of scenarios) {
    try {
      await scenario();
      console.log(`PASS ${scenario.name}`);
    } catch (error) {
      failures.push(scenario.name);
      console.error(`FAIL ${scenario.name}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} Home interaction lifecycle scenario(s) failed`);
  console.log("Home interaction lifecycle tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
