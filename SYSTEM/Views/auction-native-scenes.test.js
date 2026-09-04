"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => this.values.add(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tag = "div", view = null) {
    this.tagName = tag.toUpperCase();
    this.view = view;
    this.children = [];
    this.classList = new FakeClassList();
    this.attributes = {};
    this.listeners = new Map();
    this.parentElement = null;
    this.textContent = "";
    this.value = "";
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag, this.view);
    if (options.text) child.textContent = options.text;
    Object.entries(options.attr || {}).forEach(([name, value]) => child.setAttribute(name, value));
    this.appendChild(child);
    return child;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    child.view = this.view;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    child.view = this.view;
    this.children.unshift(child);
    return child;
  }

  empty() {
    this.children = [];
  }

  contains(candidate) {
    return this.children.includes(candidate);
  }

  closest(selector) {
    return selector === ".markdown-preview-view" ? this.view : null;
  }

  querySelectorAll() {
    return [];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") String(value).split(/\s+/).forEach((item) => this.classList.add(item));
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }
}

const existingFile = { path: "PARA/PROJECTS/Auction/옥션 워크스페이스 메모.md" };
const writes = [];
const app = {
  vault: {
    getAbstractFileByPath(path) {
      return path === existingFile.path ? existingFile : null;
    },
    async cachedRead(file) {
      assert.strictEqual(file, existingFile);
      return "보증금 준비 일정 확인";
    },
    async modify(file, content) {
      writes.push({ method: "modify", file, content });
    },
    async create(path, content) {
      writes.push({ method: "create", path, content });
      return { path };
    }
  }
};

const scenes = require("./auction-native-scenes.js");

(async () => {
  assert.equal(
    scenes.MEMO_PATH,
    "PARA/PROJECTS/Auction/옥션 워크스페이스 메모.md",
    "workspace memo must remain a normal searchable Markdown note"
  );

  const view = new FakeElement("div");
  view.view = view;
  const body = new FakeElement("div", view);
  const controller = scenes.mount({ body, app });
  await controller.memo.ready;

  assert.equal(controller.memo.textarea.value, "보증금 준비 일정 확인");
  assert.equal(controller.memo.textarea.attributes.placeholder, "오늘 확인할 물건, 입찰 전략, 준비할 일을 적어보세요.");
  assert.equal(controller.memo.textarea.attributes["aria-label"], "옥션 빠른 메모");

  controller.memo.textarea.value = "입찰표와 보증금 수표 다시 확인";
  await controller.memo.flush();
  assert.deepEqual(writes, [{
    method: "modify",
    file: existingFile,
    content: "입찰표와 보증금 수표 다시 확인"
  }]);

  const missingApp = {
    vault: {
      getAbstractFileByPath() {
        return null;
      },
      async create(path, content) {
        writes.push({ method: "create", path, content });
        return { path };
      }
    }
  };
  await scenes.writeMemo(missingApp, "새 메모");
  assert.deepEqual(writes.at(-1), {
    method: "create",
    path: scenes.MEMO_PATH,
    content: "새 메모"
  });

  const styles = fs.readFileSync(require.resolve("./auction-hub-styles.js"), "utf8");
  assert.match(
    styles,
    /\.auction-native-detail-body\s*\{[^}]*grid-template-columns:\s*minmax\(250px,\s*0\.78fr\)\s+minmax\(0,\s*1\.22fr\)/s,
    "briefing detail body must reserve the circled right-hand space for the memo"
  );
  assert.match(
    styles,
    /\.auction-native-detail-body\s*>\s*\.auction-native-memo\s*\{[^}]*grid-column:\s*2/s,
    "memo must sit to the right of the briefing stats"
  );
  assert.match(
    styles,
    /\.auction-native-detail-body\s*>\s*\.auction-hub-pipeline-section\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s,
    "pipeline must remain below both briefing columns"
  );
  assert.match(
    styles,
    /\.auction-native-work-pane\s*\{[^}]*padding-block-start:\s*var\(--ke-space-4,\s*17px\)/s,
    "the calendar-to-work transition must use one compact spacing step",
  );

  console.log("auction native memo tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
