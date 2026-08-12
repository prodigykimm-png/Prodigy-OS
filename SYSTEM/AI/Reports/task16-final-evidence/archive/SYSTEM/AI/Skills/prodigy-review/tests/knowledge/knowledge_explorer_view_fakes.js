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
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = options.text || "";
    child.attr = options.attr || {};
    child.style = options.style || {};
    child.hidden = Boolean(options.hidden);
    child.disabled = Boolean(options.disabled);
    this.children.push(child);
    return child;
  }

  createDiv(options = {}) {
    return this.createEl("div", options);
  }

  createSpan(options = {}) {
    return this.createEl("span", options);
  }

  empty() {
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
    this.text = String(value ?? "");
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
