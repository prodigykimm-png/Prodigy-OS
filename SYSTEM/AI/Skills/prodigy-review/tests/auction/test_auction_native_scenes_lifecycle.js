"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MODULE_PATH = path.join(ROOT, "SYSTEM/Views/auction-native-scenes.js");

class FakeClassList {
  constructor(owner, initial = "") {
    this.owner = owner;
    this.values = new Set(String(initial).split(/\s+/u).filter(Boolean));
  }
  add(...names) {
    names.forEach((name) => this.values.add(name));
    this.owner.className = [...this.values].join(" ");
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tag = "div", options = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attr = { ...((options && options.attr) || {}) };
    this.className = this.attr.class || "";
    this.classList = new FakeClassList(this, this.className);
    this.textContent = options && options.text || "";
    this.isConnected = true;
  }
  createEl(tag, options) {
    const child = new FakeElement(tag, options);
    this.appendChild(child);
    return child;
  }
  appendChild(child) {
    if (child.parentElement) child.parentElement.removeChild(child);
    child.parentElement = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }
  prepend(child) {
    if (child.parentElement) child.parentElement.removeChild(child);
    child.parentElement = this;
    child.isConnected = this.isConnected;
    this.children.unshift(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentElement = null;
    child.isConnected = false;
    return child;
  }
  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }
  empty() {
    [...this.children].forEach((child) => this.removeChild(child));
  }
  contains(candidate) {
    return candidate === this || this.children.some((child) => child.contains(candidate));
  }
  setAttribute(name, value) {
    this.attr[name] = String(value);
    if (name === "class") {
      this.className = String(value);
      this.classList = new FakeClassList(this, this.className);
    }
  }
  getAttribute(name) {
    return this.attr[name] === undefined ? null : String(this.attr[name]);
  }
  matches(selector) {
    if (selector === ".markdown-preview-view") return this.classList.contains("markdown-preview-view");
    if (selector === ".auction-native-app") return this.classList.contains("auction-native-app");
    if (selector === "[data-native-section]") return this.getAttribute("data-native-section") !== null;
    return false;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) found.push(child);
        visit(child);
      });
    };
    visit(this);
    return found;
  }
}

function loadScenes(resetRuntime = true) {
  delete global.ProdigyAuctionNativeScenes;
  if (resetRuntime) delete global.__prodigyAuctionNativeScenesRuntime;
  global.window = global;
  delete require.cache[require.resolve(MODULE_PATH)];
  require(MODULE_PATH);
  return global.ProdigyAuctionNativeScenes;
}

test("Auction native scene preserves early section registration across module reevaluation", () => {
  const scenes = loadScenes();
  const view = new FakeElement("div", { attr: { class: "markdown-preview-view" } });
  const body = view.createEl("main");
  const today = view.createEl("div");

  assert.equal(scenes.register("today", today), false, "early Dataview block may run before scene mount");
  const reloadedScenes = loadScenes(false);
  const mounted = reloadedScenes.mount({ body });
  assert.ok(mounted.element.contains(today), "module reevaluation must retain the early section registry");
  assert.equal(mounted.element.querySelectorAll("[data-native-section]").length, 1);
});

test("Auction native scene immediately recovers a tagged section rendered before registry initialization", () => {
  const scenes = loadScenes();
  const view = new FakeElement("div", { attr: { class: "markdown-preview-view" } });
  const body = view.createEl("main");
  const today = view.createEl("div", { attr: { "data-native-section": "today" } });
  today.classList.add("auction-native-scene-section");

  const mounted = scenes.mount({ body });
  assert.ok(mounted.element.contains(today), "mount must recover existing tagged Dataview roots without waiting for rerender");
  assert.equal(mounted.element.querySelectorAll("[data-native-section]").length, 1);
});

test("Auction native scene reuses a live mount and preserves registered sections across body replacement", () => {
  const scenes = loadScenes();
  const view = new FakeElement("div", { attr: { class: "markdown-preview-view" } });
  const firstBody = view.createEl("main");
  const first = scenes.mount({ body: firstBody });
  const today = view.createEl("div");
  const calendar = view.createEl("div");

  assert.equal(scenes.register("today", today), true);
  assert.equal(scenes.register("calendar", calendar), true);
  assert.ok(first.element.contains(today));
  assert.ok(first.element.contains(calendar));

  const reused = scenes.mount({ body: firstBody });
  assert.strictEqual(reused, first, "same live body must reuse the scene controller");
  assert.ok(reused.element.contains(today));
  assert.ok(reused.element.contains(calendar));

  const secondBody = view.createEl("main");
  const remounted = scenes.mount({ body: secondBody });
  assert.notStrictEqual(remounted, first);
  assert.ok(remounted.element.contains(today), "today survives shell body replacement");
  assert.ok(remounted.element.contains(calendar), "calendar survives shell body replacement");
  assert.equal(secondBody.querySelectorAll(".auction-native-app").length, 1);
});

test("Auction native scene replaces a rerendered section without duplicating the kind", () => {
  const scenes = loadScenes();
  const view = new FakeElement("div", { attr: { class: "markdown-preview-view" } });
  const body = view.createEl("main");
  const mounted = scenes.mount({ body });
  const firstCalendar = view.createEl("div");
  const nextCalendar = view.createEl("div");

  assert.equal(scenes.register("calendar", firstCalendar), true);
  assert.equal(scenes.register("calendar", nextCalendar), true);
  const calendars = mounted.element.querySelectorAll("[data-native-section]")
    .filter((element) => element.getAttribute("data-native-section") === "calendar");
  assert.deepEqual(calendars, [nextCalendar]);
  assert.equal(firstCalendar.isConnected, false);
});
