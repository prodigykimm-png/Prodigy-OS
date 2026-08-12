"use strict";

/*
 * Knowledge-use record UI test (Todo 10 view integration).
 *
 * Verifies that renderRecordBar creates checkboxes, a context input, and a
 * record button, and that clicking the button calls KnowledgeUseBodyStore
 * with the correct arguments. Also verifies that the bar is not rendered when
 * there are no knowledge records or when the store is unavailable.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

// Load the UI module (it attaches to globalThis).
require(path.join(ROOT, "SYSTEM/Views/knowledge-use-record-ui.js"));

function fakeElement(tag, options) {
  const opts = options || {};
  const element = {
    tag,
    attr: opts.attr || {},
    children: [],
    listeners: Object.create(null),
    parentNode: null,
    style: {},
    text: opts.text || "",
    textContent: opts.text || "",
    innerHTML: "",
    value: opts.attr && opts.attr.value ? String(opts.attr.value) : "",
    checked: false,
    disabled: false,
    onclick: null,
    createEl(childTag, childOptions) {
      const child = fakeElement(childTag, childOptions);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    createSpan(childOptions) { return this.createEl("span", childOptions); },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setText(value) { this.text = String(value); this.textContent = String(value); },
    empty() { this.children = []; this.text = ""; this.textContent = ""; this.innerHTML = ""; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); child.parentNode = null; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  };
  return element;
}

function findAll(element, predicate, result) {
  const found = result || [];
  if (predicate(element)) found.push(element);
  element.children.forEach((child) => findAll(child, predicate, found));
  return found;
}

// --- Test: no records → no bar ---
(function testNoRecords() {
  const parent = fakeElement("div");
  const result = globalThis.KnowledgeUseRecordUI.renderRecordBar(parent, {
    app: {},
    objectPath: "PARA/PROJECTS/Auction/test.md",
    objectType: "auction_case",
    knowledgeRecords: []
  });
  assert.equal(result, null, "No bar when knowledge records are empty");
  console.log("PASS: no records → no bar");
})();

// --- Test: no store → no bar ---
(function testNoStore() {
  const saved = globalThis.KnowledgeUseBodyStore;
  delete globalThis.KnowledgeUseBodyStore;
  const parent = fakeElement("div");
  const result = globalThis.KnowledgeUseRecordUI.renderRecordBar(parent, {
    app: {},
    objectPath: "PARA/PROJECTS/Auction/test.md",
    objectType: "auction_case",
    knowledgeRecords: [{ path: "50 Knowledge/test.md", title: "Test Knowledge" }]
  });
  assert.equal(result, null, "No bar when store is unavailable");
  if (saved) globalThis.KnowledgeUseBodyStore = saved;
  console.log("PASS: no store → no bar");
})();

// --- Test: renders checkboxes + input + button ---
(function testRendersUI() {
  // Provide a mock store.
  globalThis.KnowledgeUseBodyStore = { recordKnowledgeUse: async () => ({ status: "recorded" }) };
  const parent = fakeElement("div");
  const records = [
    { path: "50 Knowledge/a.md", title: "Knowledge A" },
    { path: "50 Knowledge/b.md", title: "Knowledge B" }
  ];
  const bar = globalThis.KnowledgeUseRecordUI.renderRecordBar(parent, {
    app: {},
    objectPath: "PARA/PROJECTS/Auction/test.md",
    objectType: "auction_case",
    knowledgeRecords: records
  });
  assert.ok(bar, "Bar element returned");

  const checkboxes = findAll(bar, (n) => n.tag === "input" && n.attr && n.attr.type === "checkbox");
  assert.equal(checkboxes.length, 2, "Two checkboxes for two records");

  const textInputs = findAll(bar, (n) => n.tag === "input" && n.attr && n.attr.type === "text");
  assert.equal(textInputs.length, 1, "One context text input");

  const buttons = findAll(bar, (n) => n.tag === "button");
  assert.equal(buttons.length, 1, "One record button");
  assert.equal(buttons[0].text, "기록", "Button text is '기록'");

  delete globalThis.KnowledgeUseBodyStore;
  console.log("PASS: renders checkboxes + input + button");
})();

// --- Test: button click calls store with correct args ---
(async function testButtonClick() {
  let capturedArgs = null;
  globalThis.KnowledgeUseBodyStore = {
    recordKnowledgeUse: async (app, objectPath, objectType, input) => {
      capturedArgs = { app, objectPath, objectType, input };
      return { status: "recorded" };
    }
  };
  const parent = fakeElement("div");
  const records = [{ path: "50 Knowledge/x.md", title: "Knowledge X" }];
  const bar = globalThis.KnowledgeUseRecordUI.renderRecordBar(parent, {
    app: { vault: {} },
    objectPath: "PARA/PROJECTS/Auction/my-auction.md",
    objectType: "auction_case",
    knowledgeRecords: records
  });

  // Find and check the checkbox.
  const cb = findAll(bar, (n) => n.tag === "input" && n.attr && n.attr.type === "checkbox")[0];
  cb.checked = true;

  // Find and fill the context input.
  const ctxInput = findAll(bar, (n) => n.tag === "input" && n.attr && n.attr.type === "text")[0];
  ctxInput.value = "입찰가 판단 근거";

  // Find and click the button.
  const btn = findAll(bar, (n) => n.tag === "button")[0];
  await btn.onclick({ preventDefault() {}, stopPropagation() {} });

  assert.ok(capturedArgs, "Store was called");
  assert.equal(capturedArgs.objectPath, "PARA/PROJECTS/Auction/my-auction.md");
  assert.equal(capturedArgs.objectType, "auction_case");
  assert.equal(capturedArgs.input.context, "입찰가 판단 근거");
  assert.deepEqual(capturedArgs.input.links, ["[[50 Knowledge/x]]"]);
  assert.match(capturedArgs.input.date, /^\d{4}-\d{2}-\d{2}$/, "Date is ISO format");

  delete globalThis.KnowledgeUseBodyStore;
  console.log("PASS: button click calls store with correct args");
})();

// --- Test: no selection → error message ---
(async function testNoSelection() {
  globalThis.KnowledgeUseBodyStore = { recordKnowledgeUse: async () => ({ status: "recorded" }) };
  const parent = fakeElement("div");
  const bar = globalThis.KnowledgeUseRecordUI.renderRecordBar(parent, {
    app: {},
    objectPath: "PARA/PROJECTS/Auction/test.md",
    objectType: "auction_case",
    knowledgeRecords: [{ path: "50 Knowledge/z.md", title: "Z" }]
  });

  const ctxInput = findAll(bar, (n) => n.tag === "input" && n.attr && n.attr.type === "text")[0];
  ctxInput.value = "some context";

  const btn = findAll(bar, (n) => n.tag === "button")[0];
  await btn.onclick({ preventDefault() {}, stopPropagation() {} });

  const statusEl = findAll(bar, (n) => n.tag === "div" && n.text && n.text.includes("선택"))[0];
  assert.ok(statusEl, "Error message shown when no checkbox selected");

  delete globalThis.KnowledgeUseBodyStore;
  console.log("PASS: no selection → error message");
})();

console.log("\nKnowledge-use record UI tests passed.");
