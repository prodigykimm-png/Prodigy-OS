"use strict";

/**
 * AppShell container-tier contract (Todo 5).
 *
 * The layout tier must come from the MEASURED stable shell-owner width
 * (compact <=640, medium 641-1068, wide >=1069) resolved through the canonical
 * CONTAINER_TIERS token, never from window.innerWidth or a private breakpoint.
 * The tier must exist before the first ResizeObserver delivery, zero-width
 * deliveries must not overwrite it, and the observer must dispose cleanly.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const SHELL_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js");
const TOKENS_PATH = path.join(ROOT, "SYSTEM/Views/design-tokens.js");
const tokens = require(TOKENS_PATH);

const EXPECTED_TIERS = Object.freeze({
  430: "compact",
  834: "medium",
  1023: "medium",
  1032: "medium",
  1068: "medium",
  1069: "wide",
  1376: "wide",
  1440: "wide",
});

// ---- fake DOM ---------------------------------------------------------------

const createdObservers = [];

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.target = null;
    this.disconnected = false;
    this.fired = [];
    createdObservers.push(this);
  }
  observe(target) {
    this.target = target;
    this.fire();
  }
  fire(width = 0) {
    if (!this.target) return;
    const rectWidth = typeof this.target.getBoundingClientRect === "function"
      ? this.target.getBoundingClientRect().width
      : width;
    const entry = { target: this.target, contentRect: { width: rectWidth } };
    this.fired.push(entry);
    this.callback([entry], this);
  }
  disconnect() { this.disconnected = true; }
}

class FakeElement {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.textContent = "";
    this.children = [];
    this.attr = Object.assign({}, (options && options.attr) || {});
    this.style = {};
    this.offsetWidth = 0;
    this.scrollTop = 0;
    this._rectWidth = 0;
    this.isConnected = true;
    this.parentElement = null;
  }
  createEl(tag, options) {
    const child = new FakeElement(tag, options);
    this.children.push(child);
    return child;
  }
  empty() { this.children = []; }
  setAttribute(name, value) { this.attr[name] = String(value); }
  removeAttribute(name) { delete this.attr[name]; }
  getAttribute(name) { return this.attr[name] === undefined ? null : String(this.attr[name]); }
  getBoundingClientRect() { return { width: this._rectWidth, height: 100 }; }
  querySelectorAll() { return []; }
  remove() { this.removed = true; }
  setMeasuredWidth(width) { this._rectWidth = width; this.offsetWidth = width; }
}

function buildGlobal() {
  createdObservers.length = 0;
  global.ResizeObserver = FakeResizeObserver;
  delete global.MutationObserver;
  delete global.addEventListener;
  global.ProdigyTokens = tokens;
}

function loadShell() {
  delete require.cache[require.resolve(SHELL_PATH)];
  return require(SHELL_PATH);
}

function mountShell(options = {}) {
  buildGlobal();
  const shell = loadShell();
  const container = new FakeElement("div");
  container.setMeasuredWidth(Number(options.width) || 0);
  const mounted = shell.AppShell(container, {
    workspaceId: options.workspaceId || "knowledge",
    title: "지식",
    context: options.context,
  });
  return { shell, container, mounted, observers: createdObservers, body: mounted.body };
}

function tierObserver(observers, owner) {
  return observers.find((observer) => observer.target === owner);
}

function shellCssSource() {
  return fs.readFileSync(SHELL_PATH, "utf8");
}

// ---- RED/GREEN mutation helpers ----------------------------------------------

function assertTierFromMeasuredWidth() {
  const { mounted, container, observers } = mountShell({ width: 834 });
  const observer = tierObserver(observers, container);
  assert.ok(observer, "AppShell must own a ResizeObserver on the stable shell owner");
  for (const [width, expected] of Object.entries(EXPECTED_TIERS)) {
    container.setMeasuredWidth(Number(width));
    observer.fire(Number(width));
    assert.equal(
      mounted.element.getAttribute("data-tier"),
      expected,
      `${width}px owner must select the ${expected} tier from the canonical CONTAINER_TIERS contract`,
    );
  }
}

function assertViewportDoesNotOverruleContainer() {
  const { mounted, container, observers } = mountShell({ width: 500 });
  const observer = tierObserver(observers, container);
  container.setMeasuredWidth(500); // compact container
  observer.fire(500);

  // A phone body inside a wide desktop window must STAY compact. If the tier
  // logic ever fell back to window.innerWidth, a wide viewport here would flip
  // the tier to wide even though the container only measured 500px.
  global.innerWidth = 1440;
  observer.fire(500);
  assert.equal(mounted.element.getAttribute("data-tier"), "compact");
  delete global.innerWidth;
}

function assertOneScrollOwner() {
  const css = shellCssSource();
  assert.match(css, /\.prodigy-app-shell\s*\{[^}]*overflow:\s*hidden/, "shell is the clipping viewport");
  assert.match(css, /\.prodigy-app-shell-body\s*\{[^}]*overflow:\s*auto/, "body owns the single scroll");
  assert.match(css, /\.prodigy-app-shell-body\s*\{[^}]*overflow-x:\s*hidden/, "no horizontal page overflow");
}

function assertSafeAreaToolbarClearance() {
  const css = shellCssSource();
  assert.ok(css.includes("env(safe-area-inset-bottom, 0px)"), "AppShell must read the iPhone safe-area inset through env()");
  assert.ok(css.includes("--prodigy-safe-area-bottom"), "AppShell must expose the buffered safe-area bottom token");
  assert.ok(css.includes("--prodigy-mobile-toolbar-clearance"), "AppShell must budget a mobile toolbar clearance token");
  assert.ok(css.includes("--ke-mobile-toolbar-height"), "AppShell mobile clearance must account for the floating Obsidian toolbar");
  const calcMatches = css.match(/--prodigy-mobile-toolbar-clearance:\s*calc\([^}]*\)/);
  assert.ok(
    calcMatches && calcMatches[0].includes("var(--prodigy-safe-area-bottom)"),
    "bottom clearance must consume the safe-area env() inset through the buffered token",
  );
}

function assertConditionalContextBar() {
  const emptyContext = mountShell({});
  assert.equal(emptyContext.mounted.contextBar, null, "no context bar when there is no content or action");
  assert.equal(
    emptyContext.mounted.element.children.some((child) => child.tag === "div" && String(child.attr.class || "").includes("prodigy-context-bar")),
    false,
    "AppShell must not render a hidden/empty context bar for quiet chrome",
  );

  const filledContext = mountShell({ context: { items: ["오늘은 판단이 2건 있는 날입니다."], actions: [{ label: "홈" }] } });
  assert.ok(filledContext.mounted.contextBar, "a context bar with content must appear");

  const actionOnlyContext = mountShell({ context: { actions: [{ label: "홈" }] } });
  assert.equal(actionOnlyContext.mounted.element.attr["data-context-placement"], "inline");
  assert.match(actionOnlyContext.mounted.contextBar.attr.class, /prodigy-context-bar-inline/);
}

function assertObserverDisposed() {
  const { mounted, container, observers } = mountShell({ width: 834 });
  const observer = tierObserver(observers, container);
  assert.ok(observer, "tier observer exists before dispose");
  assert.equal(observer.disconnected, false, "observers start connected");
  mounted.dispose();
  assert.equal(observer.disconnected, true, "tier observer must be disconnected on shell disposal");
}

test("AppShell container tiers resolve from the measured owner width via CONTAINER_TIERS", () => {
  assert.deepEqual(
    { compactMax: tokens.CONTAINER_TIERS.compact.max, mediumMax: tokens.CONTAINER_TIERS.medium.max, wideMin: tokens.CONTAINER_TIERS.wide.min },
    { compactMax: 640, mediumMax: 1068, wideMin: 1069 },
  );
  assertTierFromMeasuredWidth();
});

test("AppShell owns a stable tier before observer delivery and ignores transient zero widths", () => {
  const { mounted, container, observers } = mountShell({ width: 834 });
  const observer = tierObserver(observers, container);

  assert.equal(mounted.element.getAttribute("data-tier"), "medium", "first paint must already own the measured tier");
  container.setMeasuredWidth(0);
  observer.fire(0);
  assert.equal(mounted.element.getAttribute("data-tier"), "medium", "zero-width delivery must preserve the last valid tier");
});

test("Viewport width never overrules the measured container tier", () => {
  assertViewportDoesNotOverruleContainer();
});

test("AppShell keeps exactly one scroll owner on the body", () => {
  assertOneScrollOwner();
});

test("Mobile toolbar clearance budgets the iPhone safe area through env()", () => {
  assertSafeAreaToolbarClearance();
});

test("ContextBar appears only when it has content or actions (quiet chrome)", () => {
  assertConditionalContextBar();
});

test("Tier measurement observer disposes cleanly with the shell", () => {
  assertObserverDisposed();
});

test("AppShell preserves body scroll when the same workspace remounts", () => {
  buildGlobal();
  const shell = loadShell();
  const container = new FakeElement("div");
  container.setMeasuredWidth(1200);
  const first = shell.AppShell(container, {
    workspaceId: "auction",
    title: "경매",
  });
  first.body.scrollTop = 720;

  const second = shell.AppShell(container, {
    workspaceId: "auction",
    title: "경매",
  });

  assert.equal(
    second.body.scrollTop,
    720,
    "frontmatter-triggered Auction remounts must keep the user's current position",
  );
});

test("AppShell chrome layout follows measured tiers instead of private viewport widths", () => {
  const source = fs.readFileSync(SHELL_PATH, "utf8");
  assert.match(source, /\.prodigy-app-shell\[data-tier="compact"\][^}]*>\s*\.prodigy-workspace-bar\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(source, /\.prodigy-app-shell\[data-tier="medium"\][^}]*>\s*\.prodigy-workspace-bar\s*\{[^}]*flex-direction:\s*row/s);
  assert.match(source, /\.prodigy-app-shell\[data-tier="medium"\][^}]*\.prodigy-workspace-switcher\s*\{[^}]*inline-size:\s*auto/s);
  assert.match(source, /\.prodigy-app-shell\[data-tier="medium"\][^}]*\{[^}]*--prodigy-mobile-toolbar-clearance:\s*0px/s);
});
