"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/workspace-registry.js"));
const workspaceBarCore = require(path.join(ROOT, "SYSTEM/Views/home-workspace-bar-core.js"));
const HOME_SECTIONS_PATH = path.join(ROOT, "SYSTEM/Views/home-sections.js");
const workspaceManifestFixture = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json")).entries;
const workspaceManifests = { get: (workspaceId) => workspaceManifestFixture[workspaceId] };

class ShellElement {
  constructor() {
    this.attributes = {};
    this.style = { setProperty: () => {} };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  createEl() { return new ShellElement(); }
}

function browserNavigation() {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workspace-navigation.js"), "utf8");
  const browserRoot = {
    ProdigyTokens: {
      BREAKPOINTS: { medium: 768, wide: 1024 },
      CONTROL_HEIGHTS: { workspaceBar: 48, actionBar: 52, touchTarget: 44 }
    },
    ProdigyWorkspaceRegistry: registry,
    ProdigyAppShell: {
      AppShell: () => ({ element: new ShellElement(), body: new ShellElement() })
    }
  };
  vm.runInNewContext(source, browserRoot);
  return browserRoot.ProdigyWorkspaceNavigation;
}

class DockElement {
  constructor(tagName = "div", options = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = Object.assign({}, options.attr || {});
    this.textContent = options.text || "";
    this.children = [];
    this.onclick = null;
  }
  createEl(tagName, options) { const child = new DockElement(tagName, options); this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.focused = true; }
  keydown(key) { if ((key === "Enter" || key === " ") && this.tagName === "BUTTON" && typeof this.onclick === "function") this.onclick(); }
  findByClass(className, found = []) {
    if (String(this.attributes.class || "").split(/\s+/).includes(className)) found.push(this);
    this.children.forEach((child) => child.findByClass(className, found));
    return found;
  }
}

function evaluateHomeSections(source) {
  const browserRoot = {};
  browserRoot.globalThis = browserRoot;
  vm.runInNewContext(source, browserRoot);
  return browserRoot.HomeSections;
}

function assertDockContract(sectionsApi) {
  const parent = new DockElement();
  const opened = [];
  const coreCalls = [];
  const observedCore = {
    buildWorkspaceBarModel(inputRegistry, selection) {
      coreCalls.push({ inputRegistry, selection });
      assert.equal(inputRegistry, registry, "Home dock must consume the live workspace registry identity");
      return workspaceBarCore.buildWorkspaceBarModel(inputRegistry, selection);
    }
  };
  const adaptiveControls = {
    BottomSheet(sheetParent, options) {
      const body = sheetParent.createEl("div", { attr: { class: "prodigy-bottom-sheet" } });
      return {
        body,
        open() { options.onOpen(); },
        close() { options.onClose(); }
      };
    }
  };
  const selection = { pinnedIds: ["workout", "auction"], recentId: "project" };
  sectionsApi.renderWorkspaceDock({
    parent,
    workspaceBarCore: observedCore,
    registry,
    selection,
    controlHeight: 48,
    adaptiveControls,
    openPath: (target) => opened.push(target)
  });
  assert.equal(coreCalls.length, 1, "Home dock must derive one model through HomeWorkspaceBarCore");
  const expected = workspaceBarCore.buildWorkspaceBarModel(registry, selection);
  const dockButtons = parent.findByClass("home-ws-dock-btn");
  assert.deepEqual(dockButtons.map((button) => button.attributes["data-workspace"]), expected.barItems.map((item) => item.id));
  assert.equal(dockButtons.every((button) => button.tagName === "BUTTON"), true, "dock controls remain keyboard-native buttons");
  dockButtons[0].onclick();
  dockButtons[1].keydown("Enter");
  dockButtons[2].keydown(" ");
  assert.deepEqual(opened, expected.directItems.map((item) => item.path), "click, Enter, and Space navigate through live registry paths");
  dockButtons.at(-1).onclick();
  const sheetButtons = parent.findByClass("home-workspace-sheet-btn");
  assert.deepEqual(sheetButtons.map((button) => button.attributes["data-workspace"]), registry.items().map((item) => item.id));
  sheetButtons[0].keydown("Enter");
  assert.equal(opened.at(-1), registry.items()[0].path);
}

function assertDockMutationsRed() {
  const source = fs.readFileSync(HOME_SECTIONS_PATH, "utf8");
  const liveCall = "core.buildWorkspaceBarModel(registry, opts.selection || {})";
  assert.ok(source.includes(liveCall), "mutation sentinel must bind the production dock model call");
  assertDockContract(evaluateHomeSections(source));

  const bypassed = source.replace(liveCall, "core.buildWorkspaceBarModel({ items: function () { return []; }, launcherItems: function () { return []; } }, opts.selection || {})");
  assert.throws(() => assertDockContract(evaluateHomeSections(bypassed)), /live workspace registry identity/);

  const hardcoded = source.replace(liveCall, "({ layout: { rowCount: 1, wrap: false, horizontalScroll: false }, barItems: [{ id: 'all', kind: 'overflow', label: '전체', path: '', accessibleLabel: '전체' }], sheetItems: [] })");
  assert.throws(() => assertDockContract(evaluateHomeSections(hardcoded)), /derive one model through HomeWorkspaceBarCore/);
}

function assertMeasurementIndependentMount() {
  const navigation = browserNavigation();
  const stateStore = { setActiveWorkspace: () => {} };

  const withoutMeasurement = navigation.mount(new ShellElement(), {
    app: {},
    workspaceId: "home",
    title: "홈",
    stateStore
  });
  assert.ok(withoutMeasurement, "Home mounts when the browser measurement module is unavailable");
  assert.equal(withoutMeasurement.performance.available, false);
  assert.equal(withoutMeasurement.element.attributes["data-prodigy-measurement"], "unavailable");
  assert.equal(withoutMeasurement.performance.reason, "measurement_module_unavailable");

  const marks = [];
  const suppliedMeasurement = {
    available: true,
    mark: (event, fields) => marks.push({ event, fields }),
    dispose: () => true
  };
  const withMeasurement = navigation.mount(new ShellElement(), {
    app: {},
    workspaceId: "home",
    title: "홈",
    stateStore,
    performanceSession: suppliedMeasurement
  });
  assert.equal(withMeasurement.performance, suppliedMeasurement, "an explicitly supplied measurement session remains supported");
  assert.equal(withMeasurement.element.attributes["data-prodigy-measurement"], "available");
  assert.equal(marks.length, 1);
  assert.equal(marks[0].event, "shell_mounted");
  assert.equal(marks[0].fields.scope, "home");
  assert.equal(marks[0].fields.status, "mounted");
}

assert.deepEqual(
  registry.items().map((item) => item.id),
  ["auction", "knowledge", "project", "reading", "workout", "journal", "personal"],
  "the compact Home dock has an explicit route for every current workspace"
);
assert.equal(registry.find("knowledge").path, "HUB/50 Knowledge.md");
assert.equal(registry.find("personal").path, "HUB/60 Personal.md");
assert.equal(registry.find("missing"), null);

const home = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
const homeManifest = workspaceManifests.get("home");
assert.ok(homeManifest.required.includes("SYSTEM/Views/workspace-registry.js"), "Home loads the shared workspace registry before rendering the dock");
assert.ok(homeManifest.required.includes("SYSTEM/Views/workspace-navigation.js"), "Home loads shared workspace navigation");
assert.match(home, /ProdigyWorkspaceNavigation\.mount/, "Home mounts the shared shell");
assert.doesNotMatch(
  home,
  /prodigy-(?:performance-recorder|workspace-readiness|performance-exporter|workspace-measurement)\.js/,
  "Home mount must remain independent from the measurement preload chain"
);
assertDockMutationsRed();

[
  "HUB/10 Auction.md",
  "HUB/15 Region.md",
  "HUB/20 Reading.md",
  "HUB/30 Workout.md",
  "HUB/40 Project.md",
  "HUB/50 Knowledge.md",
  "HUB/60 Personal.md",
  "HUB/70 Journal.md"
].forEach((relative) => {
  const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
  const record = registry.items().find((item) => item.path === relative);
  const dependencies = relative === "HUB/15 Region.md" ? source : workspaceManifests.get(record.id).required.concat(workspaceManifests.get(record.id).optional).join("\n");
  assert.match(dependencies, /workspace-navigation\.js/, relative + " loads shared Home navigation");
  assert.match(source, /ProdigyWorkspaceNavigation\.mount/, relative + " mounts a visible Home return action");
  assert.match(dependencies, /prodigy-performance-recorder\.js/, relative + " loads performance recorder");
  assert.match(dependencies, /prodigy-workspace-readiness\.js/, relative + " loads readiness predicates");
  assert.match(dependencies, /prodigy-performance-exporter\.js/, relative + " loads external receipt exporter");
  assert.match(dependencies, /prodigy-workspace-measurement\.js/, relative + " loads production measurement bridge");
});

assertMeasurementIndependentMount();
console.log("Workspace navigation contract tests passed");
