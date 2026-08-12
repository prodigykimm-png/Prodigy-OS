"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MODULE = path.join(ROOT, "SYSTEM/Views/prodigy-workspace-state-adapters.js");

class CustomEvent {
  constructor(type, options) { this.type = type; this.detail = options.detail; this.bubbles = options.bubbles; }
}
class Element {
  constructor(tag = "div", options = {}, parent = null) {
    this.tagName = tag.toUpperCase();
    this.parentElement = parent;
    this.children = [];
    this.attributes = Object.assign({}, options.attr || {});
    this.textContent = options.text || "";
    this.disabled = false;
    this.events = [];
    this.ownerDocument = parent && parent.ownerDocument || { defaultView: { CustomEvent } };
    this.classList = { add: (...names) => { const current = String(this.attributes.class || "").split(/\s+/).filter(Boolean); this.attributes.class = [...new Set(current.concat(names))].join(" "); } };
  }
  createEl(tag, options = {}) { const child = new Element(tag, options, this); this.children.push(child); return child; }
  get firstElementChild() { return this.children[0] || null; }
  insertBefore(child, before) { this.children = this.children.filter((item) => item !== child); const index = this.children.indexOf(before); child.parentElement = this; this.children.splice(index < 0 ? this.children.length : index, 0, child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  remove() { if (!this.parentElement) return; this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; }
  dispatchEvent(event) { this.events.push(event); if (event.bubbles && this.parentElement) this.parentElement.dispatchEvent(event); return true; }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
  focus(options) { this.ownerDocument.activeElement = this; this.focusOptions = options; }
  countOwner(workspaceId) { return (this.attributes["data-prodigy-state-owner"] === workspaceId ? 1 : 0) + this.children.reduce((sum, child) => sum + child.countOwner(workspaceId), 0); }
}

function installUI() {
  global.ProdigyUI = {
    button(parent, text, options = {}) {
      const button = parent.createEl("button", { text, attr: { class: "prodigy-btn", type: "button" } });
      if (options.state) button.setAttribute("data-state", options.state);
      if (options.selected) button.setAttribute("aria-pressed", "true");
      if (options.disabled) button.disabled = true;
      button.onclick = options.onClick || null;
      return button;
    },
    StatusLine(parent, options) {
      return parent.createEl("div", { text: options.text, attr: { class: "prodigy-status-line", role: "status", "data-state": options.state, "aria-busy": options.busy ? "true" : "false" } });
    },
    InlineError(parent, options) {
      const error = parent.createEl("div", { attr: { class: "prodigy-inline-error", role: "alert", "data-state": "error" } });
      error.createEl("span", { text: options.message });
      const retry = error.createEl("button", { text: options.retryLabel, attr: { type: "button", class: "prodigy-btn" } });
      retry.onclick = options.onRetry;
      return error;
    }
  };
}
function fresh() { delete require.cache[require.resolve(MODULE)]; delete global.ProdigyWorkspaceStateAdapters; installUI(); return require(MODULE); }
function fixture(workspaceId, generation, nonce, state, extra = {}) { return Object.assign({ workspaceId, generation, nonce, state }, extra); }

for (const workspaceId of ["home", "auction"]) {
  test(`${workspaceId}: one mount owner transitions exclusively and disposes cleanly`, () => {
    const api = fresh();
    const adapter = api.createAdapter({ workspaceId, generation: 7, nonce: `${workspaceId}:mount` });
    api.register(workspaceId, adapter);
    const claim = api.claim(workspaceId);
    const body = new Element("main");
    const existingControl = body.createEl("button", { text: "기존 콘텐츠" });
    const controller = api.createController({ workspaceId, body, claim });
    assert.equal(body.children[0].attributes["data-prodigy-state-owner"], workspaceId, "state owner precedes existing controls in keyboard order");
    assert.equal(body.children[1], existingControl);
    const settled = [];
    controller.subscribe((detail) => settled.push(detail));

    assert.equal(body.countOwner(workspaceId), 1);
    assert.equal(controller.current().state, "normal");
    const sequence = [
      fixture(workspaceId, 7, "selected", "selected", { selection: { label: "선택" } }),
      fixture(workspaceId, 7, "normal-1", "normal"),
      fixture(workspaceId, 7, "disabled", "disabled", { disabled: { reason: "사용 불가" } }),
      fixture(workspaceId, 7, "normal-2", "normal"),
      fixture(workspaceId, 7, "loading", "loading"),
      fixture(workspaceId, 7, "normal-3", "normal"),
      fixture(workspaceId, 7, "error", "error", { error: { message: "실패" }, recovery: { nonce: "recovered" } }),
    ];
    sequence.forEach((next) => {
      const frozen = controller.transition(next);
      assert.equal(Object.isFrozen(frozen), true);
      assert.equal(Object.isFrozen(frozen.selection || frozen.disabled || frozen.error || frozen), true);
      assert.equal(body.countOwner(workspaceId), 1);
      assert.equal(controller.current().nonce, next.nonce);
      assert.equal(body.children[0].attributes["data-prodigy-state-generation"], "7");
      assert.equal(body.children[0].attributes["data-prodigy-state-nonce"], next.nonce);
    });
    const errorOwner = body.children[0];
    assert.equal(errorOwner.attributes.class.includes("prodigy-required-recovery"), true);
    const retry = errorOwner.children.find((child) => child.tagName === "BUTTON");
    retry.focus();
    retry.onclick();
    assert.equal(controller.current().state, "normal", "retry routes through adapter reset");
    assert.equal(body.ownerDocument.activeElement, body.children[0], "recovery moves focus to the replacement status owner");
    assert.equal(body.children[0].attributes.tabindex, "-1");
    assert.deepEqual(body.children[0].focusOptions, { preventScroll: true });
    controller.transition(fixture(workspaceId, 7, "empty", "empty"));
    controller.reset({ nonce: "final-normal" });
    assert.equal(controller.current().state, "normal");
    assert.equal(settled.at(-1).nonce, "final-normal");
    assert.equal(settled.every((detail) => Object.isFrozen(detail) && detail.generation === 7), true);

    controller.transition(fixture(workspaceId, 7, "selected-final", "selected", { selection: { label: "선택" } }));
    assert.equal(body.children[0].tagName, "BUTTON");
    assert.equal(body.children[0].attributes["aria-selected"], "true");
    controller.transition(fixture(workspaceId, 7, "disabled-final", "disabled", { disabled: { reason: "잠김" } }));
    assert.equal(body.children[0].disabled, true);
    assert.equal(body.children[0].attributes["aria-disabled"], "true");

    assert.equal(controller.dispose(), true);
    assert.equal(controller.dispose(), false);
    assert.deepEqual(adapter.stats(), { subscribers: 0, claimed: true, disposed: true });
    assert.equal(body.countOwner(workspaceId), 0);
    assert.throws(() => controller.reset(), /disposed/);
    assert.throws(() => adapter.transition(fixture(workspaceId, 7, "late", "normal")), /disposed/);
  });
}

test("registry is closed and rejects duplicate, wrong-workspace, stale generation and nonce", () => {
  const api = fresh();
  const home = api.createAdapter({ workspaceId: "home", generation: 2, nonce: "initial" });
  api.register("home", home);
  assert.throws(() => api.register("home", api.createAdapter({ workspaceId: "home", generation: 2 })), /duplicate/);
  assert.throws(() => api.register("auction", home), /exact/);
  assert.throws(() => api.register("reading", home), /unsupported/);
  const claim = api.claim("home");
  const controller = api.createController({ workspaceId: "home", body: new Element("main"), claim });
  assert.throws(() => controller.transition(fixture("auction", 2, "wrong", "normal")), /workspaceId/);
  assert.throws(() => controller.transition(fixture("home", 1, "old-generation", "normal")), /generation/);
  controller.transition(fixture("home", 2, "once", "normal"));
  assert.throws(() => controller.transition(fixture("home", 2, "once", "empty")), /nonce/);
  controller.dispose();
});

test("Home and Auction claim only a pre-registered exact adapter; normal mounts remain inert", () => {
  const navigation = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/workspace-navigation.js"), "utf8");
  const home = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
  const auction = fs.readFileSync(path.join(ROOT, "HUB/10 Auction.md"), "utf8");
  const homeView = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
  assert.match(navigation, /stateAdapter[\s\S]*createController/);
  assert.match(home, /ProdigyWorkspaceStateAdapters\.claim\("home"\)/);
  assert.match(auction, /ProdigyWorkspaceStateAdapters\.claim\("auction"\)/);
  assert.doesNotMatch(homeView, /home-state-fixtures|Home 표시 상태 범례/);
});
