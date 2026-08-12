"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("./real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const UI_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-ui.js");
const APP_SHELL_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js");
const CONTROLS_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-adaptive-controls.js");
const LAUNCHER_PATH = path.join(ROOT, "SYSTEM/Views/workspace-launcher-view.js");

class ClassList {
  constructor(owner) { this.owner = owner; this.names = new Set(); }
  add(...names) { names.forEach((name) => this.names.add(name)); this.owner.attributes.class = [...this.names].join(" "); }
}

class Element {
  constructor(tag = "div", options = {}) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.classList = new ClassList(this);
    this.hidden = false;
    this.disabled = false;
    this.textContent = options.text || "";
    Object.entries(options.attr || {}).forEach(([name, value]) => this.setAttribute(name, value));
  }
  createEl(tag, options) { const child = new Element(tag, options); child.parent = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === "class") String(value).split(/\s+/).filter(Boolean).forEach((item) => this.classList.names.add(item)); }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name]; }
  focus() { global.document.activeElement = this; }
  empty() { this.children = []; }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  appendChild(child) {
    if (child.parent) child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }
  closest(selector) { return selector === ".workspace-leaf-content" ? this.leafOwner || null : null; }
  querySelectorAll(selector) {
    const matches = [];
    const interactive = /button|\[href\]|input|select|textarea|\[tabindex\]/;
    const visit = (node) => {
      if (node !== this && interactive.test(selector) && (/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(node.tagName) || node.attributes.href || node.attributes.tabindex !== undefined) && !node.disabled && node.attributes.tabindex !== "-1") matches.push(node);
      node.children.forEach(visit);
    };
    visit(this);
    return matches;
  }
}

function loadFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function installDocument() {
  const styles = new Map();
  global.document = {
    activeElement: null,
    head: { appendChild(element) { styles.set(element.id, element); } },
    createElement(tag) { return new Element(tag); },
    getElementById(id) { return styles.get(id) || null; }
  };
  return styles;
}

function key(key, options = {}) {
  return { key, shiftKey: !!options.shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
}

test("owned shared controls reset native Obsidian chrome and retain 44px targets at every matrix width", () => {
  const styles = installDocument();
  global.ProdigyUI = loadFresh(UI_PATH);
  global.ProdigyAppShell = loadFresh(APP_SHELL_PATH);
  global.ProdigyAdaptiveControls = loadFresh(CONTROLS_PATH);
  global.WorkspaceLauncherView = loadFresh(LAUNCHER_PATH);
  global.ProdigyAdaptiveControls.AdaptiveTabs(new Element(), { tabs: [] });
  global.WorkspaceLauncherView.render({ container: new Element(), cards: [] });
  global.ProdigyAppShell.AppShell(new Element(), { workspaceId: "home", title: "홈", context: { actions: [{ label: "새로고침" }] } });
  const css = [...styles.values()].map((style) => style.textContent).join("\n");

  for (const selector of [".prodigy-btn", ".prodigy-workspace-switcher", ".prodigy-context-action", ".prodigy-adaptive-tab", ".prodigy-action-bar button", ".prodigy-bottom-sheet button", ".prodigy-launcher-actions .prodigy-btn"]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = new RegExp(`${escaped}(?=\\s|,|\\{)[^\\{]*\\{([^}]*)\\}`, "m").exec(css);
    assert.ok(rule, `${selector} has an owned component rule`);
    assert.match(rule[1], /min-(?:block-size|height):\s*(?:min\()?var\(--ke-(?:touch-target|control-height),?\s*44px\)/, `${selector} keeps a 44px block target`);
    assert.match(rule[1], /box-shadow:\s*none/, `${selector} clears native Obsidian chrome`);
  }
  assert.doesNotMatch(css, /box-shadow:\s*none\s*!important/i, "owned chrome suppression uses exact box-shadow:none without !important");
  assert.doesNotMatch(css, /(?:^|,)\s*(?:button|input|select|textarea)\s*(?:,|\{)/m, "native resets stay inside owned Prodigy scopes");
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /word-break:\s*keep-all/);
  for (const width of [390, 834, 1068, 1440]) assert.ok(width >= 390 && /min-inline-size:\s*min\(/.test(css));
});

test("one leaf owns one visible AppShell and stale disposal cannot retain or remove an interactive root", () => {
  installDocument();
  const shellApi = loadFresh(APP_SHELL_PATH);
  const leaf = new Element();
  const firstHost = new Element();
  const secondHost = new Element();
  firstHost.leafOwner = leaf;
  secondHost.leafOwner = leaf;
  leaf.appendChild(firstHost);
  leaf.appendChild(secondHost);
  const first = shellApi.AppShell(firstHost, { workspaceId: "home", title: "홈" });
  const second = shellApi.AppShell(secondHost, { workspaceId: "reading", title: "독서" });
  const shells = (node) => (node.getAttribute("class") || "").split(/\s+/).includes("prodigy-app-shell") ? 1 + node.children.reduce((sum, child) => sum + shells(child), 0) : node.children.reduce((sum, child) => sum + shells(child), 0);
  assert.equal(shells(leaf), 1);
  assert.equal(firstHost.children.length, 0, "replacement removes the prior interactive root");
  assert.equal(second.element.getAttribute("data-workspace-id"), "reading");
  assert.equal(first.dispose(), false, "stale owner disposal is inert");
  assert.equal(shells(leaf), 1);
  assert.equal(second.dispose(), true);
  assert.equal(shells(leaf), 0);
});

test("adaptive tabs and sheet preserve keyboard activation, Escape, focus trap, and return", () => {
  installDocument();
  const controls = loadFresh(CONTROLS_PATH);
  const host = new Element();
  const changes = [];
  const tabs = controls.AdaptiveTabs(host, { activeId: "a", onChange: (id) => changes.push(id), tabs: [
    { id: "a", label: "사람", panel: new Element() },
    { id: "b", label: "장소", panel: new Element() }
  ] });
  const first = tabs.element.children[0];
  const second = tabs.element.children[1];
  first.onkeydown(key("ArrowRight"));
  assert.equal(tabs.getActiveTab(), "b");
  assert.equal(global.document.activeElement, second);
  assert.deepEqual(changes, ["b"]);

  const opener = new Element("button");
  opener.focus();
  const sheet = controls.BottomSheet(host, { title: "추가 작업" });
  const extra = sheet.body.createEl("button", { attr: { type: "button" } });
  assert.equal(host.children.includes(sheet.element), false, "closed sheet controls are detached from the interactive tree");
  sheet.open(opener);
  assert.equal(host.children.includes(sheet.element), true);
  const close = sheet.panel.children[0].children[1];
  assert.equal(global.document.activeElement, close);
  const backwards = key("Tab", { shiftKey: true });
  sheet.element.onkeydown(backwards);
  assert.equal(backwards.prevented, true);
  assert.equal(global.document.activeElement, extra);
  const escape = key("Escape");
  sheet.element.onkeydown(escape);
  assert.equal(sheet.element.hidden, true);
  assert.equal(host.children.includes(sheet.element), false);
  assert.equal(global.document.activeElement, opener);
  assert.equal(sheet.element.children[0].tagName, "DIV", "the non-focusable backdrop is not reported as a zero-size button");
});

test("focused real Obsidian AppShell receipts have one active root and zero shared control offenders", { timeout: 240000 }, async (t) => {
  const harness = await RealObsidianHarness.start("shared-controls", { protectedSnapshot: snapshotProtected() });
  const rows = [];
  try {
    for (const [width, zoom] of [[390, 1], [834, 1], [1068, 1], [1440, 1], [390, 2]]) {
      for (const workspaceId of ["home", "reading"]) {
        await harness.evaluate(`(async()=>{const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:'empty',state:{}});return true})()`);
        await harness.openWorkspace(workspaceId);
        const receipt = await harness.capture(workspaceId, width, "light", zoom, false, "normal");
        const shared = Object.values(receipt.offenders).flat().filter((offender) => {
          const terminal = String(offender.selector || "").split(" > ").at(-1);
          return /\.prodigy-(?:workspace-bar|workspace-switcher|context-bar|context-action)(?:[.:]|$)/u.test(terminal);
        });
        assert.equal(receipt.navigation.matches, true, `${workspaceId}/${width}/${zoom}: active production note`);
        assert.equal(receipt.shell.count, 1, `${workspaceId}/${width}/${zoom}: one visible active shell`);
        assert.deepEqual(shared, [], `${workspaceId}/${width}/${zoom}: zero shared offenders`);
        if (zoom === 1) assert.deepEqual(receipt.keyboard.failures, [], `${workspaceId}/${width}/${zoom}: keyboard progression`);
        assert.equal(receipt.resourceRecovery.present, false, `${workspaceId}/${width}/${zoom}: no recovery residue`);
        rows.push({ workspaceId, width, zoom, overflow: receipt.offenders.overflow.length, targetSize: receipt.offenders.targetSize.length, chromeShadow: receipt.offenders.chromeShadow.length, shared: shared.length });
      }
    }
    for (const workspaceId of ["home", "reading"]) {
      await harness.evaluate(`(async()=>{const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:'empty',state:{}});return true})()`);
      await harness.openWorkspace(workspaceId);
      const disposed = await harness.evaluate(`(()=>{const leaf=document.querySelector('.workspace-leaf-content[data-type="markdown"]');const shell=leaf&&leaf.querySelector('.prodigy-app-shell');const block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine');const result=block&&window.ProdigyHubLoader.disposeWorkspace(block);return{result:result===true,shells:leaf?leaf.querySelectorAll('.prodigy-app-shell').length:0,current:Boolean(block&&window.ProdigyHubLoader.currentWorkspace(block))}})()`);
      assert.deepEqual(disposed, { result: true, shells: 0, current: false }, `${workspaceId}: disposal leaves zero interactive shells`);
    }
    t.diagnostic(JSON.stringify(rows));
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true, "focused fixture remains read-only");
    assert.equal(cleanup.protectedContinuity.exact, true, "protected Obsidian/Aside identities remain unchanged");
    assert.equal(cleanup.removed, true, "focused runtime is removed");
    assert.equal(cleanup.portReusable, true, "focused CDP port is reusable");
  }
});

test("launcher emits deterministic normal and empty structure without changing navigation behavior", async () => {
  installDocument();
  const opened = [];
  global.ProdigyUI = loadFresh(UI_PATH);
  global.ProdigyWorkspaceNavigation = { openPath: async (_app, target) => { opened.push(target); return { ok: true }; } };
  const launcher = loadFresh(LAUNCHER_PATH);
  const host = new Element();
  launcher.render({ container: host, app: {}, cards: [
    { name: "독서", path: "HUB/20 Reading.md", actionVerb: "열기", contextLabel: "Continue", title: "한글 제목", detail: "이어 읽기", empty: false },
    { name: "개인", path: "HUB/60 Personal.md", actionVerb: "열기", contextLabel: "대기", detail: "없음", empty: true }
  ] });
  const root = host.children[0];
  assert.equal(root.getAttribute("data-state"), "success");
  const cards = root.children[2].children;
  assert.equal(cards[0].getAttribute("data-state"), undefined);
  assert.equal(cards[1].getAttribute("data-state"), "empty");
  const firstAction = cards[0].children.at(-1).children[0];
  firstAction.onclick({ stopPropagation() {} });
  await Promise.resolve();
  assert.deepEqual(opened, ["HUB/20 Reading.md"]);
});

test.after(() => {
  delete global.document;
  delete global.ProdigyUI;
  delete global.ProdigyAppShell;
  delete global.ProdigyAdaptiveControls;
  delete global.WorkspaceLauncherView;
  delete global.ProdigyWorkspaceNavigation;
});
