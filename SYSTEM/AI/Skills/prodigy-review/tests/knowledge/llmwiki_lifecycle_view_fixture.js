"use strict";

class FixtureDocument {
  constructor() {
    this.activeElement = null;
    this.roots = [];
  }

  attach(root) {
    if (!this.roots.includes(root)) this.roots.push(root);
    root.ownerDocument = this;
    return root;
  }

  createElement(tag) {
    return new FixtureElement(tag, this);
  }

  getElementById(id) {
    return this.roots.flatMap((root) => walk(root, (node) => node.getAttribute("id") === id))[0] || null;
  }
}

class FixtureElement {
  constructor(tag = "div", ownerDocument = null) {
    this.tag = tag;
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.text = "";
    this.attr = {};
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.focused = false;
  }

  get firstChild() { return this.children[0] || null; }
  get tagName() { return this.tag.toUpperCase(); }
  get textContent() { return this.text; }
  set textContent(value) { this.text = String(value ?? ""); }

  createEl(tag, options = {}) {
    const child = new FixtureElement(tag, this.ownerDocument);
    child.text = options.text === undefined ? "" : String(options.text);
    for (const [name, value] of Object.entries(options.attr || {})) child.setAttribute(name, value);
    child.disabled = Boolean(options.disabled);
    if (child.disabled) child.setAttribute("disabled", "");
    this.appendChild(child);
    return child;
  }

  createDiv(options = {}) { return this.createEl("div", options); }
  createSpan(options = {}) { return this.createEl("span", options); }

  appendChild(child) {
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  empty() {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.text = "";
  }

  setAttr(name, value) { this.setAttribute(name, value); }
  setAttribute(name, value) {
    this.attr[name] = String(value);
    if (name === "open") this.open = true;
    if (name === "disabled") this.disabled = true;
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attr, name) ? this.attr[name] : null; }
  removeAttribute(name) {
    delete this.attr[name];
    if (name === "open") this.open = false;
    if (name === "disabled") this.disabled = false;
  }

  focus() {
    if (this.ownerDocument && this.ownerDocument.activeElement) this.ownerDocument.activeElement.focused = false;
    this.focused = true;
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { return walk(this, (node) => matches(node, selector)); }
}

function matches(node, selector) {
  const tagMatch = selector.match(/^[a-z][a-z0-9-]*/i);
  if (tagMatch && node.tag !== tagMatch[0].toLowerCase()) return false;
  const attributes = [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
  return attributes.every(([, name, value]) => {
    const actual = node.getAttribute(name);
    return value === undefined ? actual !== null : actual === value;
  });
}

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function collectText(node, options = {}) {
  if (!node) return "";
  if (options.excludeDetails && node.tag === "details") return "";
  if (options.excludeStyles && node.tag === "style") return "";
  return [node.text, ...(node.children || []).map((child) => collectText(child, options))]
    .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function click(node) {
  if (!node || node.disabled) return false;
  if (node.tag === "input" && node.getAttribute("type") === "checkbox") node.checked = !node.checked;
  if (node.tag === "input" && node.getAttribute("type") === "radio") {
    const name = node.getAttribute("name");
    let root = node;
    while (root.parentElement) root = root.parentElement;
    for (const peer of walk(root, (candidate) => candidate.tag === "input" && candidate.getAttribute("type") === "radio" && candidate.getAttribute("name") === name)) {
      peer.checked = peer === node;
    }
  }
  if (node.tag === "summary" && node.parentElement && node.parentElement.tag === "details") {
    node.parentElement.open = !node.parentElement.open;
    if (node.parentElement.open) node.parentElement.setAttribute("open", "");
    else node.parentElement.removeAttribute("open");
  }
  if (typeof node.onclick === "function") node.onclick({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node });
  else if (node.tag !== "summary") return false;
  if (node.tag === "input" && typeof node.onchange === "function") node.onchange({ currentTarget: node, target: node });
  return true;
}

function keydown(node, key) {
  if (!node) return false;
  let defaultPrevented = false;
  let propagationStopped = false;
  const event = {
    key,
    target: node,
    get defaultPrevented() { return defaultPrevented; },
    preventDefault() { defaultPrevented = true; },
    stopPropagation() { propagationStopped = true; },
  };
  for (let current = node; current && !propagationStopped; current = current.parentElement) {
    if (typeof current.onkeydown === "function") {
      event.currentTarget = current;
      current.onkeydown(event);
    }
  }
  if (!defaultPrevented && ["Enter", " "].includes(key) && ["button", "summary"].includes(node.tag)) click(node);
  return true;
}

function serialize(node) {
  if (!node) return "";
  const attrs = Object.entries(node.attr || {}).sort(([left], [right]) => left.localeCompare(right));
  const state = [node.disabled ? "disabled" : "", node.checked ? "checked" : "", node.open ? "open" : ""].filter(Boolean).join(",");
  return `<${node.tag}${attrs.map(([name, value]) => ` ${name}=${JSON.stringify(value)}`).join("")}${state ? ` data-fixture-state=${JSON.stringify(state)}` : ""}>${node.text || ""}${(node.children || []).map(serialize).join("")}</${node.tag}>`;
}

function mountRoot() {
  const document = new FixtureDocument();
  const root = document.attach(new FixtureElement("div", document));
  return { document, root };
}

function snapshot(status, overrides = {}) {
  return {
    status,
    source_selection: {
      selected: status !== "idle",
      display_name: "긴 한국어 자료 이름이 자연스럽게 줄바꿈되는 초보자 검토 자료",
    },
    provider_mode: "direct",
    packet_hash: "a".repeat(64),
    revision: "b".repeat(64),
    provider_id: "provider_internal_fixture",
    links: {
      canonical: { path: "SYNTHETIC/Knowledge/검토 결과.md" },
      audit: { path: "SYNTHETIC/Audit/검토 결과.json" },
    },
    ...overrides,
  };
}

function action(root, name) {
  return walk(root, (node) => node.getAttribute && node.getAttribute("data-action") === name)[0] || null;
}

module.exports = { FixtureDocument, FixtureElement, action, click, collectText, keydown, mountRoot, serialize, snapshot, walk };
