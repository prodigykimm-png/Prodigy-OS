"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VENUE_PATH = "PARA/RESOURCES/Venues/서울 스튜디오.md";

class Element {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.children = [];
    this.text = String(options.text || "");
    this.attr = Object.assign({}, options.attr || {});
    this.className = String(this.attr.class || "");
    this.hidden = false;
    this.value = "";
    this.style = {};
    this.scrollTop = 0;
    this.isConnected = true;
  }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  createEl(tag, options = {}) { const child = new Element(tag, options); child.parentElement = this; child.isConnected = this.isConnected; this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children.forEach((child) => { child.parentElement = null; child.isConnected = false; }); this.children = []; }
  insertBefore(child, anchor) {
    if (child.parentElement) child.remove();
    const index = anchor ? this.children.indexOf(anchor) : -1;
    child.parentElement = this;
    child.isConnected = this.isConnected;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    return child;
  }
  appendChild(child) { return this.insertBefore(child, null); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
    this.isConnected = false;
  }
  addClass(name) { this.className = `${this.className} ${name}`.trim(); }
  setText(value) { this.text = String(value == null ? "" : value); }
  setAttribute(name, value) { this.attr[name] = String(value); if (name === "class") this.className = String(value); }
  getAttribute(name) { return this.attr[name]; }
  focus() { global.document.activeElement = this; }
  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const matches = [];
    const visit = (node) => { if (className && node.className.split(/\s+/).includes(className)) matches.push(node); node.children.forEach(visit); };
    this.children.forEach(visit);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function venue(body = "") {
  return { type: "venue", title: "서울 스튜디오", name: "서울 스튜디오", path: VENUE_PATH, venue_category: "studio", address: "서울", connections: [], body, updated: "2026-08-10", journalLinks: [], meta: [], detail: "서울" };
}

test("Venue controller exposes one-mount loading, recovery, focus return, and stale-disposal seams", async () => {
  const previous = { document: global.document, ResizeObserver: global.ResizeObserver };
  const initial = deferred();
  let read = initial;
  let mode = "deferred";
  let disconnects = 0;
  const changes = [];
  global.document = { activeElement: null };
  global.ResizeObserver = class { observe() {} disconnect() { disconnects += 1; } };
  const app = { vault: {
    getAbstractFileByPath: () => ({ path: VENUE_PATH }),
    cachedRead: async () => {
      if (mode === "error") throw new Error("venue offline");
      return read.promise;
    }
  } };
  const host = new Element();
  host.clientWidth = 390;
  try {
    delete require.cache[require.resolve(path.join(ROOT, "SYSTEM/Views/venue-view.js"))];
    const view = require(path.join(ROOT, "SYSTEM/Views/venue-view.js"));
    const api = view.renderVenuesWorkspace({ app, container: host, items: [venue()], onReadStateChange: (change) => changes.push(change) });
    assert.ok(host.querySelector(".ppv-venue-read-loading"), "loading paints before the deferred Vault read settles");
    assert.equal(changes[0].phase, "loading");
    initial.resolve("# 현장 메모\n- 자연광");
    await api.hydrationReady;
    assert.ok(changes.some((change) => change.phase === "success" && change.path === VENUE_PATH));

    const list = host.querySelector(".ppv-venue-list-pane");
    const opener = host.querySelector(".ppv-venue-card");
    list.scrollTop = 137;
    opener.focus();
    opener.onclick({ preventDefault() {}, stopPropagation() {} });
    assert.equal(global.document.activeElement, host.querySelector(".ppv-venue-detail-title"));
    assert.equal(list.isConnected, false, "inactive Venue list controls must be parked outside the connected tree");
    host.querySelector(".ppv-venue-detail-back").onclick({ preventDefault() {}, stopPropagation() {} });
    assert.equal(global.document.activeElement, opener, "compact Back restores the exact opener");
    assert.equal(list.scrollTop, 137, "compact Back restores exact list scroll");
    assert.equal(list.isConnected, true);
    assert.equal(host.querySelector(".ppv-venue-detail-pane"), null, "inactive Venue detail controls must be parked outside the connected tree");

    mode = "error";
    await api.setData([venue()]);
    assert.ok(host.querySelector(".ppv-venue-read-error"));
    read = deferred();
    mode = "deferred";
    const retry = api.retryVenueRead(VENUE_PATH);
    assert.ok(host.querySelector(".ppv-venue-read-loading"), "retry loading is synchronous");
    read.resolve("");
    await retry;
    assert.ok(host.querySelector(".ppv-venue-read-empty"));

    const stale = deferred();
    read = stale;
    const pending = api.setData([venue()]);
    const countAtDestroy = changes.length;
    api.destroy();
    api.destroy();
    stale.resolve("stale body");
    await pending;
    assert.equal(changes.length, countAtDestroy, "destroy ignores stale terminal reads");
    assert.equal(disconnects, 1, "the observer disconnects exactly once");
    assert.equal(host.querySelector(".ppv-venue-card").onclick, null, "mount-owned handlers are released");
  } finally {
    global.document = previous.document;
    global.ResizeObserver = previous.ResizeObserver;
  }
});
