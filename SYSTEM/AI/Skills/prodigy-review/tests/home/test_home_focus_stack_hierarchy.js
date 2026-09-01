"use strict";

// Todo 6 — Home as a Quiet Editorial Focus Stack.
// Focused RED/GREEN for the semantic narrative order and the three-tier
// composition contract. No Aside / CDP / Keychain is launched: this is a
// pure DOM + CSS source-contract harness over the real Home modules.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const STYLES_PATH = path.join(ROOT, "SYSTEM/Views/home-styles.js");
const DESIGN_TOKENS = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

const LONG_KOREAN_LABEL = "가".repeat(40);
const LONG_URL = "https://example.test/" + "a".repeat(200);
const RENDER_WIDTHS = [
  { width: 430, tier: "compact", viewport: 932 },
  { width: 1000, tier: "medium", viewport: 1376 },
  { width: 1280, tier: "wide", viewport: 932 }
];

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
      getPropertyValue(name) { return typeof this[name] === "string" ? this[name] : ""; }
    };
    this.classList = new ClassList(this);
    this.onclick = null;
    this.open = false;
    this.textContent = "";
    this.text = "";
    this.clientWidth = options.clientWidth || 0;
    if (options.text) {
      this.textContent = String(options.text);
      this.text = String(options.text);
    }
    if (options.attr) this.applyAttr(options.attr);
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
  global.document = {
    activeElement: null,
    body: new FakeElement("body"),
    documentElement: new FakeElement("html"),
    head: { appendChild(element) { styleElements.set(element.id, element); } },
    createElement(tagName) { return new FakeElement(tagName); },
    getElementById(id) { return styleElements.get(id) || null; }
  };
  global.window = global;
  delete global.window.visualViewport;
  global.ResizeObserver = undefined;
  global.Notice = class Notice {
    constructor(message) { this.message = message; }
  };
}

function clearModules() {
  ["SYSTEM/Views/prodigy-adaptive-controls.js", "SYSTEM/Views/home-styles.js", "SYSTEM/Views/home-view.js"]
    .forEach((modulePath) => {
      delete require.cache[require.resolve(path.join(ROOT, modulePath))];
    });
  delete global.HomeStyles;
  delete global.HomeView;
  delete global.ProdigyAdaptiveControls;
}

function installHomeDependencies() {
  global.ProdigyTokens = DESIGN_TOKENS;
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
        todoist: { todayCount: 0, overdueCount: 0, todayTasks: [], overdueTasks: [] },
        projects: [],
        auctions: [],
        reading: [],
        continue_candidates: [
          { type: "reading", name: LONG_KOREAN_LABEL, status: "reading", path: LONG_URL, next_action: LONG_URL }
        ],
        risks: [],
        review_inbox: [],
        recent_reflections: [],
        yesterday_review: null
      }
    }),
    generateDeterministicFallback: () => ({
      schema_version: "morning-result-v1",
      brief_mode: "rule_based",
      brief: "오늘 우선순위를 정리했습니다.",
      focus: [{ id: "f1", label: LONG_KOREAN_LABEL, source_type: "project", object_path: LONG_URL, next_action: LONG_URL }]
    }),
    selectFocusItems: (args) => ((args && args.focusItems) || []).slice()
  };
  global.MorningBriefService = {
    generateMorningResult: async () => global.MorningContextCore.generateDeterministicFallback()
  };
  global.MorningCache = {
    getDailyCache: async () => ({ pkg: null, result: global.MorningContextCore.generateDeterministicFallback() }),
    getApprovedFocus: async () => ({
      focus: [{ id: "approved-1", label: LONG_KOREAN_LABEL, source_type: "project", object_path: LONG_URL, next_action: LONG_URL }]
    }),
    getPinnedFocus: async () => null,
    checkIsStale: () => false,
    clearPinnedFocus: async () => {},
    saveApprovedFocus: async (_app, _date, focus) => ({ focus }),
    saveDailyCache: async () => {},
    clearApprovedFocus: async () => {}
  };
  global.MorningBriefContext = {
    buildMorningBriefContext: () => ({ engine_ok: true, continue_by_workspace: {}, engine_states: {} }),
    toHomeRiskItems: () => []
  };
  global.JournalStore = { loadReview: async () => ({ status: "empty", blocks: [], fields: {} }) };
  global.WorkspaceLauncherCore = { loadWorkoutSnapshot: async () => null, buildLauncherCards: () => [] };
  global.WorkspaceLauncherView = { render() {} };
  global.ProdigyWorkspaceRegistry = { items: () => [], find: () => null };
}

function createApp() {
  return {
    isMobile: false,
    vault: {
      getAbstractFileByPath: () => ({ path: "fixture.md" }),
      read: async () => "",
      createFolder: async () => {},
      create: async (createdPath) => ({ path: createdPath })
    },
    workspace: {
      openLinkText() {},
      getLeaf: () => ({ view: { contentEl: new FakeElement("div") } })
    },
    commands: { executeCommandById: () => false }
  };
}

async function renderHomeAtWidth(width) {
  clearModules();
  installDocument();
  installHomeDependencies();
  global.window.innerWidth = width;
  require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
  const home = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
  const container = new FakeElement("div");
  container.workspaceLeaf = new FakeElement("div", { clientWidth: width });
  await home.renderHome({ app: createApp(), dv: {}, container });
  return { container, css: global.document.getElementById("prodigy-home-styles").textContent };
}

function ruleBody(source, selector) {
  const index = source.indexOf(selector);
  if (index < 0) return "";
  const open = source.indexOf("{", index);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

function narrativeOrder(container) {
globalThis.stack = container.findAll((element) => element.hasClass("home-mc-stack"))[0];
globalThis.roles = [];
  stack.children.forEach((child) => {
    if (child.hasClass("quick-capture-row")) roles.push("Capture");
    else if (child.hasClass("home-action-queue")) roles.push("ActionQueue");
    else if (child.hasClass("home-context-details")) roles.push("Context");
    else if (child.hasClass("home-micro-log-slot")) roles.push("MicroLog");
    else if (child.hasClass("home-secondary-fold")) roles.push("Disclosure");
  });
  return roles;
}

test("Home action queue — semantic DOM order stays stable at every tier", async () => {
  for (const { width, tier } of RENDER_WIDTHS) {
    const { container } = await renderHomeAtWidth(width);
    assert.equal(container.hasClass(`home-${tier}`), true, `${width}px renders as ${tier}`);
globalThis.actions = container.findAll((element) => element.hasClass("home-action-button"));
    assert.ok(actions.length >= 1, `${tier} exposes at least one ranked action`);
    assert.equal(actions[0].tagName, "BUTTON", "the ranked action uses a native button");
    assert.deepEqual(narrativeOrder(container), ["Capture", "ActionQueue", "Context", "MicroLog", "Disclosure"]);
  }
});

test("Home action queue — top action stays inside the queue before context", async () => {
  const { container } = await renderHomeAtWidth(1280);
globalThis.stack = container.findAll((element) => element.hasClass("home-mc-stack"))[0];
globalThis.queue = stack.children.find((child) => child.hasClass("home-action-queue"));
globalThis.context = stack.children.find((child) => child.hasClass("home-context-details"));
globalThis.action = queue.findAll((element) => element.hasClass("home-action-button"))[0];
globalThis.node = action.parent;
  while (node && node !== queue && node !== stack) node = node.parent;
  assert.equal(node, queue, "the top action remains inside the ranked queue");
  assert.equal(stack.children.indexOf(context), stack.children.indexOf(queue) + 1, "collapsed context follows the queue");
});

test("Todo 6 — wide composes one native sidebar beside one grouped content column", () => {
  const source = fs.readFileSync(STYLES_PATH, "utf8");
  const wide = ruleBody(source, ".prodigy-home.home-wide .home-mc-stack {");
  assert.match(wide, /display:\s*grid/, "wide Home must compose on a grid");
  assert.match(
    wide,
    /grid-template-columns\s*:\s*260px\s+minmax\(0,\s*1fr\)/i,
    "wide grid must use a native 260px sidebar and one stable content column"
  );
});

test("Home action queue — medium uses one content column with workspace shortcuts last", () => {
globalThis.source = fs.readFileSync(STYLES_PATH, "utf8");
globalThis.medium = ruleBody(source, ".prodigy-home.home-medium .home-mc-stack {");
  assert.match(medium, /display:\s*grid/, "medium Home must compose on a grid");
  assert.match(
    medium,
    /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/,
    "medium Home must let the main content use the available width"
  );
  assert.match(
    medium,
    /grid-template-areas:[\s\S]*"capture"[\s\S]*"action"[\s\S]*"context"[\s\S]*"microlog"[\s\S]*"fold"[\s\S]*"dock"/,
    "medium workspace shortcuts must follow the current action queue"
  );
});

test("Todo 6 — compact stays a single-column narrative", () => {
  const source = fs.readFileSync(STYLES_PATH, "utf8");
  const compact = ruleBody(source, ".prodigy-home.home-compact .home-mc-stack,");
  const anyCompact = ruleBody(source, ".prodigy-home.home-compact .home-mc-stack {");
  const combined = compact + " " + anyCompact;
  // Compact must remain one flow column: no two-column grid template on the stack.
  assert.doesNotMatch(combined, /grid-template-columns\s*:.*(?:1fr\s+1fr|repeat\s*\(\s*2|8fr|4fr)/);
});

test("Home action queue — compact exposes capture and ranked action before context", async () => {
  const { container } = await renderHomeAtWidth(430);
  assert.deepEqual(narrativeOrder(container), ["Capture", "ActionQueue", "Context", "MicroLog", "Disclosure"]);
globalThis.queue = container.findAll((element) => element.hasClass("home-action-queue"))[0];
globalThis.firstRow = queue.findAll((element) => element.hasClass("home-action-row"))[0];
globalThis.action = firstRow.findAll((element) => element.hasClass("home-action-button"))[0];
  assert.equal(action.tagName, "BUTTON");
  assert.equal(action.hasClass("action-btn-primary"), true, "the first ranked action is primary");
globalThis.context = container.findAll((element) => element.hasClass("home-context-details"))[0];
  assert.equal(context.open, false, "legacy context remains collapsed by default");
});

test("Home action queue — approved focus remains and hidden proposals stay absent", async () => {
globalThis.approved = await renderHomeAtWidth(1000);
  assert.ok(approved.container.findAll((element) => element.hasClass("home-action-button"))[0]);

  clearModules();
  installDocument();
  installHomeDependencies();
  global.MorningCache.getApprovedFocus = async () => null;
  global.window.innerWidth = 1000;
  require(path.join(ROOT, "SYSTEM/Views/home-styles.js"));
globalThis.home = require(path.join(ROOT, "SYSTEM/Views/home-view.js"));
globalThis.container = new FakeElement("div");
  container.workspaceLeaf = new FakeElement("div", { clientWidth: 1000 });
  await home.renderHome({ app: createApp(), dv: {}, container });
globalThis.proposal = container.findAll((element) => element.attributes["data-action-kind"] === "focus_proposal")[0];
  assert.equal(proposal, undefined, "unapproved generated focus never enters the deterministic queue");
  assert.ok(container.findAll((element) => element.hasClass("home-action-button"))[0], "real-state queue actions remain available");
});

test("Todo 6 — source contract holds for error, long-Korean, 200% zoom, and reduced motion", () => {
  const source = fs.readFileSync(STYLES_PATH, "utf8");
  const view = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");

  // Region/error recovery stays a real, wrapped surface (no silent collapse).
  assert.match(view, /home-region-error/, "Home keeps an explicit region-error surface");
  assert.match(source, /overflow-wrap:\s*anywhere/, "long/Korean copy can wrap without horizontal overflow");
  assert.match(view, /safeRenderRegion/, "each Home section is bounded by an error-recovering region");

  // 200% zoom / reflow: no viewport-unit type sizes that would explode on zoom.
  assert.doesNotMatch(source, /font-size\s*:[^;]*(?:vw|vh|vmin|vmax)/, "no viewport-unit type under 200% zoom");

  // Reduced motion: transitions and transforms are removed.
  assert.match(source, /prefers-reduced-motion:\s*reduce/, "reduced-motion contract is declared");

  // The only transforms allowed are the shared one-event activation scale.
  assert.match(source, /scale\(0\.95\)/, "activation uses the shared pressed scale");
});
