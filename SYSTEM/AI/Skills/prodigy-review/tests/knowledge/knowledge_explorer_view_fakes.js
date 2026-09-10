"use strict";

class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.text = "";
    this.attr = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.classNames = [];
    this.focused = false;
    this.parentElement = null;
    this.value = "";
  }

  get parentNode() { return this.parentElement; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.empty(); this.text = String(value); }
  appendChild(child) {
    child.parentElement?.removeChild(child);
    child.parentElement = this; child.ownerDocument = this.ownerDocument;
    this.children.push(child); return child;
  }
  removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentElement = null; return child; }
  remove() { this.parentElement?.removeChild(this); }
  getAttribute(name) { return Object.hasOwn(this.attr, name) ? String(this.attr[name]) : null; }
  setAttribute(name, value) { this.setAttr(name, value); }
  removeAttribute(name) { delete this.attr[name]; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = node => {
      const tag = selector.match(/^[a-z][a-z0-9-]*/iu)?.[0];
      if (tag && node.tag !== tag) return false;
      const cls = selector.match(/^\.([\w-]+)/u)?.[1];
      if (cls && !String(node.attr.class || "").split(" ").includes(cls)) return false;
      return [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/gu)].every(([, name, value]) => value === undefined ? node.getAttribute(name) !== null : node.getAttribute(name) === value);
    };
    const walk = node => node.children.flatMap(child => [...(matches(child) ? [child] : []), ...walk(child)]);
    return walk(this);
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = options.text || "";
    child.attr = options.attr || {};
    child.style = options.style || {};
    child.hidden = Boolean(options.hidden);
    child.disabled = Boolean(options.disabled);
    child.value = options.attr?.value || "";
    this.appendChild(child);
    return child;
  }

  createDiv(options = {}) {
    return this.createEl("div", options);
  }

  createSpan(options = {}) {
    return this.createEl("span", options);
  }

  empty() {
    this.children.forEach(child => child.parentElement = null);
    this.children = [];
    this.text = "";
  }

  addClass(name) {
    if (!this.classNames.includes(name)) this.classNames.push(name);
  }

  removeClass(name) {
    this.classNames = this.classNames.filter((entry) => entry !== name);
  }

  setText(value) {
    this.empty(); this.text = String(value ?? "");
  }

  setAttr(name, value) {
    this.attr[name] = value;
  }

  focus() {
    this.focused = true;
  }
}

function collectText(element) {
  if (!element) return "";
  return [element.text, ...element.children.map(collectText)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function findByText(element, text) {
  if (!element) return null;
  if (element.text === text) return element;
  for (const child of element.children) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function createMemoryAdapter() {
  const files = new Map();
  const writes = [];
  return {
    files,
    writes,
    async exists(target) {
      return files.has(target);
    },
    async read(target) {
      if (!files.has(target)) throw new Error(`Missing ${target}`);
      return files.get(target);
    },
    async write(target, content) {
      writes.push({ target, content });
      files.set(target, content);
    },
    async mkdir() {},
    async remove(target) {
      files.delete(target);
    }
  };
}

function createKnowledgeExplorerHarness(options = {}) {
  const adapter = createMemoryAdapter();
  const root = new FakeElement("section");
  const state = {
    mode: "rest",
    focus: null,
    selected: null,
    loading: false,
    empty: false,
    error: null
  };

  function reset() {
    state.mode = "rest";
    state.focus = null;
    state.selected = null;
    state.loading = false;
    state.empty = false;
    state.error = null;
    root.empty();
    render();
  }

  function render() {
    root.empty();
    root.setAttr("data-mode", state.mode);
    root.setAttr("data-loading", String(state.loading));
    root.setAttr("data-empty", String(state.empty));
    root.setAttr("data-error", state.error ? "true" : "false");
    root.setAttr("data-selected", state.selected || "");
    root.setAttr("data-focus", state.focus || "");
    const frame = root.createDiv({ attr: { "data-mode": state.mode } });
    frame.addClass("knowledge-explorer-state");
    frame.setAttr("data-loading", String(state.loading));
    frame.setAttr("data-empty", String(state.empty));
    frame.setAttr("data-error", state.error ? "true" : "false");
    frame.setAttr("data-selected", state.selected || "");
    frame.setAttr("data-focus", state.focus || "");
    const label = state.error ? `error:${state.error}` : state.loading ? "loading" : state.empty ? "empty" : state.selected ? `selected:${state.selected}` : `rest:${state.mode}`;
    frame.createSpan({ text: label });
    frame.createSpan({ text: options.container || "desktop" });
    return root;
  }

  function setState(nextState) {
    Object.assign(state, nextState);
    return render();
  }

  function renderState(mode, overrides = {}) {
    return setState({ mode, ...overrides });
  }

  return {
    adapter,
    root,
    state,
    renderState,
    reset,
    setState,
    writes: () => adapter.writes.slice(),
    collectText: () => collectText(root)
  };
}

module.exports = {
  FakeElement,
  collectText,
  createKnowledgeExplorerHarness,
  createMemoryAdapter,
  findByText
};
