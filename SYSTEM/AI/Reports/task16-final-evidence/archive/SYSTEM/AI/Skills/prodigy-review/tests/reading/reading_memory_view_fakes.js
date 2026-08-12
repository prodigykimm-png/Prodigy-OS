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
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = options.text || "";
    child.attr = options.attr || {};
    this.children.push(child);
    return child;
  }

  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; this.text = ""; }
  addClass(name) { this.classNames.push(name); }
  setText(value) { this.text = String(value || ""); }
  setAttr(name, value) { this.attr[name] = value; }
}

class FakeModal {
  constructor(app) {
    this.app = app;
    this.contentEl = new FakeElement("div");
    this.titleEl = new FakeElement("div");
    this.modalEl = new FakeElement("div");
    this.opened = false;
  }

  open() {
    this.opened = true;
    if (this.onOpen) this.onOpen();
  }

  close() {
    this.opened = false;
    if (this.onClose) this.onClose();
  }
}

function collectText(element) {
  return [element.text, ...element.children.flatMap(collectText)].filter(Boolean).join(" ");
}

function findByText(element, text) {
  if (element.text === text) return element;
  for (const child of element.children) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function createMemoryAdapter() {
  const files = new Map();
  const folders = new Set();
  return {
    files,
    async exists(target) { return files.has(target) || folders.has(target); },
    async read(target) {
      if (!files.has(target)) throw new Error(`Missing ${target}`);
      return files.get(target);
    },
    async write(target, content) { files.set(target, content); },
    async mkdir(target) { folders.add(target); },
    async remove(target) { files.delete(target); },
    async rename(from, to) {
      if (!files.has(from)) throw new Error(`Missing ${from}`);
      files.set(to, files.get(from));
      files.delete(from);
    },
  };
}

function readingFile(path, content, mtime = 1) {
  return { path, basename: path.split("/").pop().replace(/\.md$/i, ""), extension: "md", stat: { mtime }, content };
}

function createApp(readingFiles) {
  const adapter = createMemoryAdapter();
  const files = new Map(readingFiles.map((file) => [file.path, file]));
  const opens = [];
  let readCount = 0;
  const app = {
    vault: {
      adapter,
      getMarkdownFiles: () => [...files.values()],
      getAbstractFileByPath: (target) => files.get(target) || null,
      read: async (file) => { readCount += 1; return file.content; },
    },
    metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    workspace: { openLinkText: async (...args) => { opens.push(args); } },
  };
  return { app, adapter, files, opens, readCount: () => readCount };
}

module.exports = {
  FakeElement,
  FakeModal,
  collectText,
  createApp,
  findByText,
  readingFile,
};
