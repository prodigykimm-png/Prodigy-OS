"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-native-scenes.js"), "utf8");

class FakeElement {
  constructor(tag, className = "") {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.isConnected = false;
    this.open = false;
    this.listeners = new Map();
    this.classList = {
      add: (...names) => {
        const current = new Set(this.className.split(/\s+/u).filter(Boolean));
        names.forEach((name) => current.add(name));
        this.className = [...current].join(" ");
      },
      contains: (name) => this.className.split(/\s+/u).includes(name)
    };
  }
  createEl(tag, options = {}) {
    const child = new FakeElement(tag, options.attr && options.attr.class || "");
    child.textContent = options.text || "";
    return this.appendChild(child);
  }
  appendChild(child) {
    if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((candidate) => candidate !== child);
    child.parentElement = this;
    this.children.push(child);
    child.setConnected(this.isConnected);
    return child;
  }
  setConnected(value) {
    this.isConnected = Boolean(value);
    this.children.forEach((child) => child.setConnected(value));
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    (this.listeners.get(event.type) || []).forEach((listener) => listener.call(this, event));
    return true;
  }
  empty() {
    this.children.forEach((child) => {
      child.parentElement = null;
      child.setConnected(false);
    });
    this.children = [];
  }
  contains(target) {
    return target === this || this.children.some((child) => child.contains(target));
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (selector === ".markdown-preview-view" && node.classList.contains("markdown-preview-view")) return node;
      node = node.parentElement;
    }
    return null;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (selector === ".auction-native-app" && child.classList.contains("auction-native-app")) matches.push(child);
        if (selector === "[data-native-section]" && child.getAttribute("data-native-section")) matches.push(child);
        if (selector === ".auction-native-list-body" && child.classList.contains("auction-native-list-body")) matches.push(child);
        if (selector === ".auction-native-filter-body" && child.classList.contains("auction-native-filter-body")) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }
}

test("detached bidding block is adopted when Obsidian connects it after shell mount", () => {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.active = true;
      observers.push(this);
    }
    observe() {}
    disconnect() { this.active = false; }
  }

  const documentRoot = new FakeElement("body");
  documentRoot.setConnected(true);
  const view = documentRoot.appendChild(new FakeElement("div", "markdown-preview-view"));
  const shellBody = view.appendChild(new FakeElement("div", "prodigy-app-shell-body"));
  const detachedBidding = new FakeElement("div");
  const sandbox = {
    console,
    document: { body: documentRoot, documentElement: documentRoot },
    MutationObserver: FakeMutationObserver
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SOURCE, { filename: "auction-native-scenes.js" }).runInContext(sandbox);

  assert.equal(sandbox.ProdigyAuctionNativeScenes.register("bidding", detachedBidding), false);
  let connectedEvents = 0;
  detachedBidding.addEventListener("prodigy-auction-section-connected", () => {
    connectedEvents += 1;
  });
  sandbox.ProdigyAuctionNativeScenes.mount({ body: shellBody });
  assert.equal(detachedBidding.parentElement, null);

  view.appendChild(detachedBidding);
  observers.filter((observer) => observer.active).forEach((observer) => observer.callback([{ addedNodes: [detachedBidding] }]));

  assert.equal(detachedBidding.getAttribute("data-native-section"), "bidding");
  assert.ok(detachedBidding.parentElement.classList.contains("auction-native-list-body"));
  assert.equal(detachedBidding.parentElement.parentElement.open, true);
  assert.equal(connectedEvents, 1, "late adoption must notify the deferred renderer exactly once");
  assert.equal(observers.some((observer) => observer.active), false);

  const filter = view.appendChild(new FakeElement("div", "auction-filter-bar"));
  assert.equal(sandbox.ProdigyAuctionNativeScenes.register("filters", filter), true);
  assert.ok(
    filter.parentElement.classList.contains("auction-native-filter-body"),
    "the filter must stay above every Auction work group",
  );
});
