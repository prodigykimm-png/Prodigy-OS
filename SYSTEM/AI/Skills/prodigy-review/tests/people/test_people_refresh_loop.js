"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB_PATH = "HUB/60 Personal.md";
const core = require(path.join(ROOT, "SYSTEM/Views/people-core.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/people-view.js"));
const adaptiveControls = require(path.join(ROOT, "SYSTEM/Views/prodigy-adaptive-controls.js"));

class FakeElement {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.children = [];
    this.parentElement = null;
    this.attr = Object.assign({}, options.attr || {});
    this.className = String(this.attr.class || "");
    this.text = String(options.text || "");
    this.value = "";
    this.hidden = false;
    this.scrollTop = 0;
    this.clientWidth = 767;
    this.style = { setProperty() {} };
    this.classList = {
      add: (name) => this.addClass(name),
      remove: (name) => this.removeClass(name)
    };
  }

  get parentNode() { return this.parentElement; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this.text = String(value == null ? "" : value); }
  createEl(tag, options = {}) { return this.appendChild(new FakeElement(tag, options)); }
  createDiv(options = {}) { return this.createEl("div", options); }
  appendChild(child) {
    if (child.parentElement) child.parentElement.removeChild(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    if (global.document && child.contains(global.document.activeElement)) global.document.activeElement = null;
    this.children = this.children.filter((item) => item !== child);
    if (child.parentElement === this) child.parentElement = null;
    return child;
  }
  contains(candidate) {
    if (!candidate) return false;
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }
  empty() {
    if (global.document && this.contains(global.document.activeElement)) global.document.activeElement = null;
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = [];
  }
  addClass(name) {
    const names = new Set(this.className.split(/\s+/).filter(Boolean));
    names.add(name);
    this.className = Array.from(names).join(" ");
  }
  removeClass(name) {
    this.className = this.className.split(/\s+/).filter((item) => item && item !== name).join(" ");
  }
  setText(value) { this.text = String(value == null ? "" : value); }
  setAttribute(name, value) {
    this.attr[name] = String(value);
    if (name === "class") this.className = String(value);
  }
  getAttribute(name) { return this.attr[name]; }
  focus() { global.document.activeElement = this; }
  scrollIntoView() {}
  closest(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    for (let node = this; node; node = node.parentElement) {
      if (className && node.className.split(/\s+/).includes(className)) return node;
    }
    return null;
  }
  querySelectorAll(selector) {
    const classMatch = selector.match(/^\.([\w-]+)/);
    const pathMatch = selector.match(/\[data-path="([^"]+)"\]/);
    const tag = classMatch ? "" : selector.toLowerCase();
    const matches = [];
    const visit = (node) => {
      const hasClass = !classMatch || node.className.split(/\s+/).includes(classMatch[1]);
      const hasPath = !pathMatch || node.attr["data-path"] === pathMatch[1];
      const hasTag = !tag || node.tag === tag;
      if (hasClass && hasPath && hasTag) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeClock {
  constructor() { this.tasks = []; }
  setInterval(callback, milliseconds) {
    this.tasks.push({ callback, milliseconds, elapsed: 0 });
  }
  async tick(milliseconds) {
    for (const task of this.tasks) {
      task.elapsed += milliseconds;
      while (task.elapsed >= task.milliseconds) {
        task.elapsed -= task.milliseconds;
        await task.callback();
      }
    }
  }
}

function dataArray(items) {
  return {
    array: () => items.slice(),
    where: (predicate) => dataArray(items.filter(predicate)),
    sort: (selector, direction) => {
      const sorted = items.slice().sort((a, b) => String(selector(a)).localeCompare(String(selector(b)), "ko"));
      return dataArray(direction === "desc" ? sorted.reverse() : sorted);
    }
  };
}

function hubSource() {
  return fs.readFileSync(path.join(ROOT, HUB_PATH), "utf8");
}

function hubProgram() {
  const match = hubSource().match(/```dataviewjs\n([\s\S]*?)\n```/);
  assert.ok(match, "Personal DataviewJS block must exist");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction("app", "obsidian", "dv", match[1]);
}

test("Given 189 people and six unchanged 2.5-second reruns, When Personal stays open, Then one mount retains user state and explicit refresh still repaints", async () => {
  const people = Array.from({ length: 189 }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return {
      path: `PARA/RESOURCES/CONTACTS/QA-PERSON-${number}.md`,
      type: "people",
      name: `가상 사람 ${number}`,
      relationship: "회사",
      company: "가상 조직",
      role: "검증 대상",
      last_contact: "",
      body: `# 메모\n- 합성 행 ${number}`
    };
  });
  const files = people.map((person) => ({
    path: person.path,
    extension: "md",
    basename: person.name,
    name: `${person.name}.md`
  }));
  const byPath = new Map(people.map((person) => [person.path, person]));
  const pages = people.map((person) => Object.assign({}, person, {
    file: { path: person.path, name: person.name, outlinks: [] }
  }));
  const storageValues = new Map();
  const sessionStorage = {
    getItem: (key) => storageValues.has(key) ? storageValues.get(key) : null,
    setItem: (key, value) => storageValues.set(key, String(value)),
    removeItem: (key) => storageValues.delete(key)
  };
  let indexTouches = 0;
  let mountCount = 0;
  let renderCount = 0;
  let refresh = null;
  let latestWorkspaceApi = null;
  const app = {
    plugins: { plugins: { dataview: { api: { index: { touch: async () => { indexTouches += 1; } } } } } },
    vault: {
      getFiles: () => files,
      getAbstractFileByPath: (filePath) => ({ path: filePath }),
      read: async (file) => byPath.get(file.path)?.body || "",
      cachedRead: async (file) => byPath.get(file.path)?.body || ""
    },
    workspace: {}
  };
  const dv = {
    io: { load: async (filePath) => byPath.get(filePath)?.body || "" },
    pages: (query) => dataArray(query.includes("CONTACTS") ? pages : [])
  };
  const host = new FakeElement("div", { attr: { class: "workspace-leaf-content" } });
  const fakeDocument = {
    activeElement: null,
    getElementById: () => null,
    createElement: () => ({ id: "", textContent: "" }),
    head: { appendChild() {} }
  };
  const previousDocument = global.document;
  const previousSessionStorage = global.sessionStorage;
  const previousWindow = global.window;
  global.document = fakeDocument;
  global.window = global;
  global.sessionStorage = sessionStorage;
  global.PeopleCore = core;
  global.ProdigyAdaptiveControls = adaptiveControls;
  global.PeopleStyles = {
    ensureWorkspaceStyles() {},
    responsiveContract: () => ({ compactMax: 767, mediumMin: 768, wideMin: 1024, actionBarHeight: 52, touchTarget: 44 })
  };
  global.PeopleView = Object.assign({}, view, {
    ensureWorkspaceStyles() {},
    renderPeopleWorkspace(options) {
      renderCount += 1;
      refresh = options.onRefresh;
      latestWorkspaceApi = view.renderPeopleWorkspace(options);
      return latestWorkspaceApi;
    }
  });
  global.ProdigyWorkspaceNavigation = {
    mount(container) {
      mountCount += 1;
      const element = container.createEl("section", { attr: { class: "prodigy-app-shell" } });
      const body = element.createEl("main", { attr: { class: "prodigy-app-shell-body" } });
      return { element, body };
    },
    renderLoaderError(_container, error) { throw error; }
  };
  global.ProdigyListWorkspace = { render: ({ container }) => container.createEl("div") };
  delete global.__prodigyPersonalRenderGuard;

  const run = hubProgram();
  const root = host.createDiv({ attr: { class: "block-language-dataviewjs" } });
  const rerun = async () => {
    await run.call({ container: root }, app, {}, dv);
    await new Promise((resolve) => setImmediate(resolve));
  };

  try {
    await rerun();
    const shell = host.querySelector(".prodigy-app-shell");
    const api = latestWorkspaceApi;
    const input = shell.querySelector(".ppw-search");
    input.value = "가상";
    input.oninput();
    shell.querySelectorAll(".ppw-filter").find((item) => item.textContent === "회사").onclick();
    shell.querySelectorAll(".ppw-sort").find((item) => item.textContent === "가나다 ↓").onclick();
    const initialCards = shell.querySelectorAll(".ppw-card");
    const tailPath = initialCards.at(-1).attr["data-path"];
    api.selectPerson(tailPath);
    const scrollOwner = shell.querySelector(".prodigy-app-shell-body");
    scrollOwner.scrollTop = 42189;
    input.focus();
    const expectedState = Object.assign({}, api.getState());
    const clock = new FakeClock();
    clock.setInterval(rerun, 2500);

    await clock.tick(6 * 2500);

    const guardStore = global.__prodigyPersonalRenderGuard;
    const afterTicks = guardStore instanceof WeakMap ? guardStore.get(host) : guardStore;
    const cardsAfterTicks = shell.querySelectorAll(".ppw-card");
    assert.equal(mountCount, 1, "unchanged reruns must keep one App Shell mount");
    assert.equal(renderCount, 1, "unchanged fingerprints must not repaint People DOM");
    assert.equal(indexTouches, 0, "snapshot reads must not touch the Dataview index");
    assert.equal(host.querySelector(".prodigy-app-shell") === shell, true, "unchanged reruns must retain the shell node");
    assert.equal(afterTicks.workspaceApi, api);
    assert.deepEqual(api.getState(), expectedState);
    assert.equal(scrollOwner.scrollTop, 42189);
    assert.equal(global.document.activeElement === input, true, "unchanged reruns must retain the focused search input");
    assert.equal(shell.querySelector(".ppw-search") === input, true, "unchanged reruns must retain the search DOM node");
    assert.equal(cardsAfterTicks.length, 189);
    assert.equal(cardsAfterTicks.at(-1).attr["data-path"], tailPath);

    await refresh();

    const forceGuardStore = global.__prodigyPersonalRenderGuard;
    const afterForce = forceGuardStore instanceof WeakMap ? forceGuardStore.get(host) : forceGuardStore;
    assert.equal(mountCount, 1, "force refresh must reuse the App Shell");
    assert.equal(renderCount, 2, "explicit refresh must bypass the unchanged fingerprint guard");
    assert.notEqual(afterForce.workspaceApi, api, "force refresh must produce a fresh workspace render");
    assert.deepEqual(afterForce.workspaceApi.getState(), expectedState);
    assert.equal(afterForce.shellElement.querySelectorAll(".ppw-card").length, 189);
    assert.equal(afterForce.shellElement.querySelectorAll(".ppw-card").at(-1).attr["data-path"], tailPath);
    console.log(JSON.stringify({ ticks: 6, interval_ms: 2500, rows: 189, mounts: mountCount, unchanged_renders: 1, forced_renders: renderCount, index_touches: indexTouches, state: expectedState, scroll_top: scrollOwner.scrollTop, focus_retained: true, tail_path: tailPath }));
  } finally {
    delete global.__prodigyPersonalRenderGuard;
    delete global.PeopleCore;
    delete global.PeopleStyles;
    delete global.PeopleView;
    delete global.ProdigyWorkspaceNavigation;
    delete global.ProdigyListWorkspace;
    delete global.ProdigyAdaptiveControls;
    global.document = previousDocument;
    global.sessionStorage = previousSessionStorage;
    global.window = previousWindow;
  }
});
