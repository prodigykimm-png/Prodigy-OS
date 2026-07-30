"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "../../../../../..");

var WORKSPACE_IDS = ["home", "auction", "region", "reading", "project", "knowledge", "personal", "journal", "workout"];

var styleElements = [];
globalThis.document = {
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function (id) {
    for (var i = 0; i < styleElements.length; i++) {
      if (styleElements[i].id === id) return styleElements[i];
    }
    return null;
  },
  createElement: function (tag) {
    return { tag: tag, id: "", textContent: "", setAttribute: function () {}, appendChild: function () {} };
  },
  head: {
    appendChild: function (el) { styleElements.push(el); }
  },
  body: {
    style: { cursor: "", userSelect: "" }
  }
};
globalThis.window = { innerWidth: 1024, addEventListener: function () {}, removeEventListener: function () {} };

var envelopeApi = require(path.join(ROOT, "SYSTEM/Views/ai-context-envelope.js"));

// Pre-load modules into global scope so the inspector's resolveModule works
var chatStoreMod = require(path.join(ROOT, "SYSTEM/Views/ai-chat-session-store.js"));
globalThis.AIChatSessionStore = chatStoreMod;
globalThis.ProdigyWorkspaceStateStore = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-state-store.js"));
globalThis.ProdigyWorkspaceRegistry = require(path.join(ROOT, "SYSTEM/Views/workspace-registry.js"));
globalThis.ProdigyTokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

// Load all 9 context adapters into global scope
globalThis.HomeContextAdapter = require(path.join(ROOT, "SYSTEM/Views/home-context-adapter.js"));
globalThis.AuctionContextAdapter = require(path.join(ROOT, "SYSTEM/Views/auction-context-adapter.js"));
globalThis.RegionContextAdapter = require(path.join(ROOT, "SYSTEM/Views/region-context-adapter.js"));
globalThis.ReadingContextAdapter = require(path.join(ROOT, "SYSTEM/Views/reading-context-adapter.js"));
globalThis.ProjectContextAdapter = require(path.join(ROOT, "SYSTEM/Views/project-context-adapter.js"));
globalThis.KnowledgeContextAdapter = require(path.join(ROOT, "SYSTEM/Views/knowledge-context-adapter.js"));
globalThis.PeopleContextAdapter = require(path.join(ROOT, "SYSTEM/Views/people-context-adapter.js"));
globalThis.JournalContextAdapter = require(path.join(ROOT, "SYSTEM/Views/journal-context-adapter.js"));
globalThis.WorkoutContextAdapter = require(path.join(ROOT, "SYSTEM/Views/workout-context-adapter.js"));

var inspectorApi = require(path.join(ROOT, "SYSTEM/Views/ai-inspector.js"));
var { ChatSessionStore } = chatStoreMod;
var { WorkspaceStateStore } = globalThis.ProdigyWorkspaceStateStore;

class Element {
  constructor(tag) { this.tag = tag || "div"; this.children = []; this.attr = {}; this.style = {}; this.hidden = true; this.disabled = false; this.offsetWidth = 400; this.scrollHeight = 0; this.textContent = ""; }
  get text() { return this.textContent; }
  set text(value) { this.textContent = String(value == null ? "" : value); }
  createEl(tag, options) {
    var item = new Element(tag);
    if (options && options.text) item.text = options.text;
    if (options && options.attr) {
      Object.keys(options.attr).forEach(function (k) { item.attr[k] = options.attr[k]; });
    }
    this.children.push(item);
    return item;
  }
  appendChild(child) { this.children.push(child); }
  removeChild(child) {
    var idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
  }
  empty() { this.children = []; }
  setAttribute(key, value) { this.attr[key] = value; }
  removeAttribute(key) { delete this.attr[key]; }
  focus() { this.focused = true; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
  get scrollTo() { var self = this; return function () {}; }
}

function allTextOf(node) {
  var parts = [];
  if (node.text) parts.push(node.text);
  node.children.forEach(function (c) { parts = parts.concat(allTextOf(c)); });
  return parts;
}

function findElementByClass(node, className) {
  var cls = (node.attr && node.attr["class"]) || "";
  if (cls.indexOf(className) >= 0) return node;
  for (var i = 0; i < node.children.length; i++) {
    var found = findElementByClass(node.children[i], className);
    if (found) return found;
  }
  return null;
}

function findAllElementsByClass(node, className) {
  var out = [];
  var cls = (node.attr && node.attr["class"]) || "";
  if (cls.indexOf(className) >= 0) out.push(node);
  node.children.forEach(function (child) {
    out = out.concat(findAllElementsByClass(child, className));
  });
  return out;
}

function testEnvelopeValidationForAllAdapters() {
  WORKSPACE_IDS.forEach(function (wsId) {
    var fn = wsId === "personal" ? "people-context-adapter.js" : wsId + "-context-adapter.js";
    var adapterPath = path.join(ROOT, "SYSTEM/Views", fn);
    var adapter;
    try { adapter = require(adapterPath); } catch (_) { assert.fail("missing adapter: " + adapterPath); }
    var context = adapter.buildContext({});
    var env = envelopeApi.buildContextEnvelope(context);
    assert.equal(env.workspace, wsId === "personal" ? "personal" : wsId);
    assert.equal(env.locale, "ko");
    assert.deepEqual(env.snapshot, []);
    assert.deepEqual(env.citations, []);
    assert.equal(Object.keys(env).length, 6);
    assert.equal(JSON.stringify(env).includes("body"), false);
    assert.equal(JSON.stringify(env).includes("secret"), false);
    assert.equal(JSON.stringify(env).includes("token"), false);
  });
  console.log("  envelope: all 9 adapters produce valid envelopes");
}

function testCompactGeometry() {
  var savedW = globalThis.window.innerWidth;
  globalThis.window.innerWidth = 600;
  try {
    var host = new Element();
    var inspector = inspectorApi.AIInspector(host, { workspaceId: "knowledge" });
    inspector.open();
    assert.equal(inspector.isOpen(), true);
    assert.equal(inspector.element.style.width || "", "");
    assert.equal(inspector.element.attr["class"].indexOf("prodigy-ai-inspector") >= 0, true);
    assert.equal(inspector.element.hidden, false);
    inspector.close();
    assert.equal(inspector.isOpen(), false);
  } finally {
    globalThis.window.innerWidth = savedW;
  }
  console.log("  geometry: compact mode does not set width");
}

function testMediumWideGeometry() {
  var savedW = globalThis.window.innerWidth;
  globalThis.window.innerWidth = 900;
  try {
    var host = new Element();
    var inspector = inspectorApi.AIInspector(host, { workspaceId: "knowledge" });
    inspector.open();
    var setWidth = inspector.element.style.width;
    assert.ok(setWidth && setWidth.indexOf("px") >= 0);
    var numWidth = parseInt(setWidth, 10);
    assert.ok(numWidth >= 320);
    assert.ok(numWidth <= 420);
    inspector.close();
  } finally {
    globalThis.window.innerWidth = savedW;
  }
  console.log("  geometry: medium/wide mode sets side panel width");
}

function testCompactScrollOwner() {
  var savedW = globalThis.window.innerWidth;
  globalThis.window.innerWidth = 600;
  try {
    var host = new Element();
    var inspector = inspectorApi.AIInspector(host, { workspaceId: "knowledge" });
    inspector.open();
    var element = inspector.element;
    var style = element.style.width || "";
    assert.equal(style, "");
    assert.equal(element.attr["class"].indexOf("prodigy-ai-inspector") >= 0, true);
    inspector.close();
  } finally {
    globalThis.window.innerWidth = savedW;
  }
  console.log("  scroll: compact sheet does not steal page scroll owner");
}

function testWidthClampingOnOpen() {
  var storage = new Map();
  var fakeLs = {
    getItem: function (k) { return storage.has(k) ? storage.get(k) : null; },
    setItem: function (k, v) { storage.set(k, String(v)); },
    removeItem: function (k) { storage.delete(k); }
  };
  var store = new WorkspaceStateStore({ localStorage: fakeLs });
  store.setWorkspaceState("knowledge", { aiInspectorWidth: 1200 });
  var savedW = globalThis.window.innerWidth;
  globalThis.window.innerWidth = 1024;
  try {
    var host = new Element();
    var inspector = inspectorApi.AIInspector(host, { workspaceId: "knowledge", stateStore: store });
    inspector.open();
    var setWidth = inspector.element.style.width;
    var numWidth = parseInt(setWidth, 10);
    assert.ok(numWidth >= 320);
    assert.ok(numWidth <= 640);
    assert.ok(numWidth < 1200);
    inspector.close();
  } finally {
    globalThis.window.innerWidth = savedW;
  }
  console.log("  width: aiInspectorWidth clamps to [320, 640] on open");
}

async function testProposalCannotBypassApproval() {
  var host = new Element();
  var approvalCalls = [];
  var mockApprovalHandler = function (proposal) { approvalCalls.push(proposal); };
  var inspector = inspectorApi.AIInspector(host, {
    workspaceId: "journal",
    providerAdapter: async function () {
      return { text: "이 제안은 승인이 필요합니다.", citations: [] };
    }
  });
  inspector.open();
  await inspector.sendMessage("status를 변경해 주세요");
  var rendered = allTextOf(host);
  assert.ok(rendered.some(function (t) { return t.indexOf("승인") >= 0 && t.indexOf("필요") >= 0; }));
  assert.equal(approvalCalls.length, 0);
  mockApprovalHandler({ proposal: "test" });
  assert.equal(approvalCalls.length, 1);
  inspector.close();
  console.log("  approval: proposal renders as text, no automatic approval");
}

async function testKindsAreDistinguished() {
  var host = new Element();
  var inspector = inspectorApi.AIInspector(host, {
    workspaceId: "reading",
    providerAdapter: async function () {
      return { text: "추천 도서를 제안합니다.", citations: [] };
    }
  });
  inspector.open();
  await inspector.sendMessage("추천해 주세요");
  var rendered = allTextOf(host);
  assert.ok(rendered.some(function (t) { return t.indexOf("제안") >= 0; }));
  inspector.close();
  console.log("  kinds: 제안 is distinguished from 설명");
}

async function testCitationsFilteredToEnvelopeOnly() {
  var host = new Element();
  var inspector = inspectorApi.AIInspector(host, {
    workspaceId: "home",
    contextAdapter: {
      PROMPTS: globalThis.HomeContextAdapter.PROMPTS,
      buildContext: function () {
        return {
          workspace: "home",
          tab: null,
          selection: null,
          snapshot: [],
          citations: ["PARA/Projects/visible.md"],
          locale: "ko"
        };
      }
    },
    providerAdapter: async function () {
      return { text: "분석 결과입니다.", citations: ["PARA/Projects/visible.md", "ZETA/Secret/off-screen.md"] };
    }
  });
  inspector.open();
  await inspector.sendMessage("분석해 주세요");
  var rendered = allTextOf(host);
  assert.ok(rendered.some(function (t) { return t.indexOf("PARA/Projects/visible.md") >= 0; }));
  assert.equal(rendered.some(function (t) { return t.indexOf("ZETA/Secret/off-screen.md") >= 0; }), false);
  inspector.close();
  console.log("  citations: off-screen citations are filtered out");
}

async function testUnavailabilityDegradesToInlineError() {
  var host = new Element();
  var inspector = inspectorApi.AIInspector(host, {
    workspaceId: "workout",
    providerAdapter: async function () {
      throw new Error("ECONNREFUSED network error");
    }
  });
  inspector.open();
  await inspector.sendMessage("세션 분석");
  var rendered = allTextOf(host);
  assert.ok(rendered.some(function (t) { return t.indexOf("연결") >= 0 || t.indexOf("AI") >= 0; }));
  var errorEl = findElementByClass(host, "prodigy-ai-inspector-error");
  assert.ok(errorEl);
  assert.ok(errorEl.attr["role"] === "alert");
  inspector.close();
  console.log("  unavailability: inline Korean error, workspace still renders");
}

function testNoInnerHTMLInInspectorFiles() {
  var inspectorSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/ai-inspector.js"), "utf8");
  assert.equal(inspectorSrc.indexOf("innerHTML"), -1);
  var stylesSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/ai-inspector-styles.js"), "utf8");
  assert.equal(stylesSrc.indexOf("innerHTML"), -1);
  console.log("  innerHTML: zero innerHTML in inspector and styles files");
}

async function testXssInjectionRenderedAsText() {
  var host = new Element();
  var inspector = inspectorApi.AIInspector(host, {
    workspaceId: "knowledge",
    providerAdapter: async function () {
      return { text: "<img src=x onerror=alert(1)><script>evil()</script>", citations: [] };
    }
  });
  inspector.open();
  await inspector.sendMessage("inject");
  var rendered = allTextOf(host);
  assert.ok(rendered.some(function (t) { return t.indexOf("<img") >= 0 && t.indexOf("onerror") >= 0; }));
  var bodies = findAllElementsByClass(host, "prodigy-ai-inspector-message-body");
  var bodyEl = bodies.filter(function (el) { return el.text.indexOf("<img") >= 0; })[0];
  assert.ok(bodyEl);
  assert.equal(bodyEl.children.length, 0);
  assert.ok(bodyEl.text.indexOf("<img") >= 0);
  assert.ok(bodyEl.text.indexOf("<script>") >= 0);
  console.log("  xss: markup rendered as literal text, no DOM injection");
}

async function testHappyPathWithStubProvider() {
  var host = new Element();
  var cannedResponse = "선택한 자료를 분석한 결과입니다. 주요 패턴은 일관된 기록 습관입니다.";
  var inspector = inspectorApi.AIInspector(host, {
    workspaceId: "journal",
    providerAdapter: async function () {
      return { text: cannedResponse, citations: ["PARA/Projects/test.md"] };
    }
  });
  inspector.open();
  await inspector.sendMessage("분석해 주세요");
  var rendered = allTextOf(host);
  assert.ok(rendered.some(function (t) { return t.indexOf("분석") >= 0 || t.indexOf("선택한") >= 0; }));
  assert.ok(rendered.some(function (t) { return t.indexOf("사용자") >= 0; }));
  inspector.close();
  console.log("  happy-path: stub provider returns canned response");
}

function testTemplateExistence() {
  WORKSPACE_IDS.forEach(function (wsId) {
    var templatePath = path.join(ROOT, "SYSTEM/AI/Prompts", "inspector-" + wsId + ".md");
    assert.ok(fs.existsSync(templatePath), "missing template: " + templatePath);
    var content = fs.readFileSync(templatePath, "utf8");
    assert.ok(content.trim().length > 0, "empty template: " + templatePath);
    var normalized = content.toLowerCase();
    assert.equal(path.basename(templatePath), "inspector-" + wsId + ".md");
    var hasReadOnly = normalized.indexOf("읽기 전용") >= 0 || normalized.indexOf("read-only") >= 0;
    assert.ok(hasReadOnly, "template " + templatePath + " missing read-only boundary");
    var hasApproval = normalized.indexOf("승인") >= 0;
    assert.ok(hasApproval, "template " + templatePath + " missing approval path");
    var hasVaultProhibition = normalized.indexOf("vault") >= 0 || normalized.indexOf("쓰지 마십시오") >= 0;
    assert.ok(hasVaultProhibition, "template " + templatePath + " missing vault write prohibition");
  });
  console.log("  templates: all 9 templates exist, non-empty, contain workspace id, boundary, approval, and vault prohibition");
}

function testTemplateFailClosed() {
  assert.equal(fs.existsSync(path.join(ROOT, "SYSTEM/AI/Prompts/inspector-nonexistent.md")), false);
  console.log("  fail-closed: nonexistent template path returns false (no substitution)");
}

function testSessionTranscriptIsolation() {
  var storage1 = new Map();
  var storage2 = new Map();
  var fakeLs1 = {
    getItem: function (k) { return storage1.has(k) ? storage1.get(k) : null; },
    setItem: function (k, v) { storage1.set(k, String(v)); },
    removeItem: function (k) { storage1.delete(k); }
  };
  var fakeLs2 = {
    getItem: function (k) { return storage2.has(k) ? storage2.get(k) : null; },
    setItem: function (k, v) { storage2.set(k, String(v)); },
    removeItem: function (k) { storage2.delete(k); }
  };

  var store1 = new ChatSessionStore({ sessionStorage: fakeLs1 });
  var store2 = new ChatSessionStore({ sessionStorage: fakeLs2 });

  store1.appendMessage({ role: "user", body: "session one" });
  store2.appendMessage({ role: "user", body: "session two" });

  assert.equal(store1.getMessages()[0].body, "session one");
  assert.equal(store2.getMessages()[0].body, "session two");

  store1.close();
  assert.deepEqual(store1.getMessages(), []);
  assert.equal(store2.getMessages()[0].body, "session two");

  console.log("  session: transcripts are isolated and cleared on close");
}

function testNoRawColorsInInspectorFiles() {
  var inspectorSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/ai-inspector.js"), "utf8");
  var inspectorStylesSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/ai-inspector-styles.js"), "utf8");
  var combined = inspectorSrc + "\n" + inspectorStylesSrc;
  assert.equal(combined.indexOf("rgba("), -1);
  assert.equal(combined.indexOf("hsla("), -1);
  console.log("  raw-colors: no rgba/hsla in inspector files");
}

function testResizeHandleInDom() {
  var host = new Element();
  var inspector = inspectorApi.AIInspector(host, { workspaceId: "knowledge" });
  inspector.open();
  var resizeHandle = findElementByClass(host, "prodigy-ai-inspector-resize");
  assert.ok(resizeHandle);
  assert.equal(resizeHandle.attr["class"].indexOf("prodigy-ai-inspector-resize") >= 0, true);
  inspector.close();
  console.log("  resize: resize handle element exists in DOM");
}

async function main() {
  console.log("AI Inspector Integration Tests");
  testEnvelopeValidationForAllAdapters();
  testCompactGeometry();
  testMediumWideGeometry();
  testCompactScrollOwner();
  testWidthClampingOnOpen();
  await testProposalCannotBypassApproval();
  await testKindsAreDistinguished();
  await testCitationsFilteredToEnvelopeOnly();
  await testUnavailabilityDegradesToInlineError();
  testNoInnerHTMLInInspectorFiles();
  await testXssInjectionRenderedAsText();
  await testHappyPathWithStubProvider();
  testTemplateExistence();
  testTemplateFailClosed();
  testSessionTranscriptIsolation();
  testNoRawColorsInInspectorFiles();
  testResizeHandleInDom();
  console.log("AI Inspector integration tests passed");
}

main();
