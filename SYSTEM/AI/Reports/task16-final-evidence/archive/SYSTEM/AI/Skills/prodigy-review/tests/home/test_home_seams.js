"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../..");
const model = require(path.join(ROOT, "SYSTEM/Views/home-model.js"));
const controller = require(path.join(ROOT, "SYSTEM/Views/home-controller.js"));
const sections = require(path.join(ROOT, "SYSTEM/Views/home-sections.js"));

class Element {
  constructor(tag, options = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attributes = Object.assign({}, options.attr || {});
    this.textContent = options.text || "";
    this.onclick = null;
  }
  createEl(tag, options) { const child = new Element(tag, options); child.parent = this; this.children.push(child); return child; }
  textTree() { return [this.textContent, ...this.children.map((child) => child.textTree())].filter(Boolean).join(" "); }
}

function testModelSelectorsAndStates() {
  const focusKeys = { [model.dedupeKeyFor("./PARA//Book.md", "reading", "책")]: true };
  const cards = model.buildContinueCards({
    focusKeys,
    continueByWorkspace: {},
    candidates: [
      { type: "reading", name: "책", path: "PARA/BOOK.MD", status: "reading" },
      { type: "project", name: "완료", path: "done.md", status: "completed" },
      { type: "project", name: "계속", path: "next.md", status: "doing", next_action: "다음 행동" }
    ],
    workspacePathFor: (workspace) => `HUB/${workspace}.md`,
    getSourceTypeLabel: (workspace) => workspace
  });
  assert.deepEqual(cards.map((card) => card.title), ["계속"]);
  assert.equal(model.clampBriefLines("하나\\n둘\n셋", 2), "하나\n둘");
  assert.equal(model.clampBriefLines("", 2), "오늘 우선순위를 정리했습니다.");
  assert.equal(model.getHomeVariant(390, false, { medium: 768, wide: 1200 }), "compact");
  assert.equal(model.getHomeVariant(900, false, { medium: 768, wide: 1200 }), "medium");
  assert.equal(model.getHomeVariant(1440, false, { medium: 768, wide: 1200 }), "wide");
  assert.deepEqual(model.sanitizeFocusList([null, { id: "manual" }, { id: "gone", object_path: "gone.md" }], () => false), [{ id: "manual" }]);

  const risks = model.filterAttentionRisks([
    { label: "관심 경매", object_path: "PARA/Auction/watch.md", workspace: "auction" },
    { label: "입찰 경매", object_path: "PARA/Auction/bid.md", workspace: "auction" },
    { label: "프로젝트", object_path: "project.md", workspace: "project" }
  ], [{ path: "PARA/Auction/watch.md", status: "watching" }], (status) => status === "bidding");
  assert.deepEqual(risks.map((risk) => risk.label), ["입찰 경매", "프로젝트"]);
}

function testRenderingSelectorsAndActions() {
  const parent = new Element("div");
  const opened = [];
  sections.renderContinueSection({ parent, cards: [{ title: "한글 이어하기", workspace_label: "독서", next_action: "10쪽", object_path: "book.md" }], openPath: (target) => opened.push(target) });
  const row = parent.children[0].children[1].children[0];
  assert.equal(row.tagName, "BUTTON");
  assert.equal(row.attributes.type, "button");
  assert.equal(row.attributes.class, "continue-row");
  assert.equal(row.attributes["aria-label"], "한글 이어하기 이어하기");
  row.onclick();
  assert.deepEqual(opened, ["book.md"]);

  const empty = new Element("div");
  sections.renderContinueSection({ parent: empty, cards: [], openPath() {} });
  assert.match(empty.textTree(), /이어할 항목이 없습니다.*오늘은 새 출발입니다/);

  const failed = new Element("div");
  const result = sections.safeRenderRegion({
    parent: failed,
    label: "테스트",
    debug: true,
    render() { throw new Error("bad input"); }
  });
  assert.equal(result, null);
  assert.equal(failed.children[0].attributes.role, "alert");
  assert.match(failed.textTree(), /테스트 영역을 표시하지 못했습니다.*bad input/);
}

async function testControllerRoutingAndDisposal() {
  const listeners = [];
  const document = {
    addEventListener(_type, handler) { listeners.push(handler); },
    removeEventListener(_type, handler) { const index = listeners.indexOf(handler); if (index >= 0) listeners.splice(index, 1); }
  };
  const opens = [];
  const container = {};
  controller.bindCreatorShortcut({ container, document, app: "app", pkg: "pkg", getCreator: () => ({ open: (...args) => opens.push(args) }) });
  controller.bindCreatorShortcut({ container, document, getCreator: () => null });
  assert.equal(listeners.length, 1);
  let prevented = 0;
  listeners[0]({ key: "n", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target: {}, preventDefault() { prevented += 1; }, stopPropagation() {} });
  assert.equal(prevented, 1);
  assert.deepEqual(opens, [["app", { pkg: "pkg" }]]);
  listeners[0]({ key: "n", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target: { tagName: "INPUT" }, preventDefault() { prevented += 1; }, stopPropagation() {} });
  assert.equal(prevented, 1);

  let disconnected = 0;
  container.__prodigyHomeResizeObserver = { disconnect() { disconnected += 1; } };
  controller.disposeHome(container, document);
  controller.disposeHome(container, document);
  assert.equal(listeners.length, 0);
  assert.equal(disconnected, 1);

  const routed = [];
  const openPath = controller.createPathOpener({ app: "app", container: "mount", navigation: { openPath: (...args) => { routed.push(args); return "ok"; } } });
  assert.equal(openPath("HUB/x.md"), "ok");
  assert.deepEqual(routed[0].slice(0, 2), ["app", "HUB/x.md"]);
  assert.equal(routed[0][2].title, "홈");

  let retry;
  const failed = controller.createPathOpener({ app: {}, container: "mount", navigation: { renderOpenError(_container, _error, options) { retry = options.retry; } } });
  assert.deepEqual(await failed("bad.md"), { ok: false, path: "bad.md" });
  assert.equal(typeof retry, "function");
}

async function testStorageContract() {
  const cache = require(path.join(ROOT, "SYSTEM/Views/morning-cache.js"));
  const files = new Map();
  const writes = [];
  const app = { vault: {
    getAbstractFileByPath(target) { return files.has(target) ? { path: target } : null; },
    async createFolder(target) { files.set(target, ""); },
    async create(target, text) { files.set(target, text); writes.push(["create", target, text]); return { path: target }; },
    async modify(file, text) { files.set(file.path, text); writes.push(["modify", file.path, text]); },
    async read(file) { return files.get(file.path); },
    adapter: { async mkdir(target) { files.set(target, ""); } }
  } };
  const date = "2026-08-10";
  await cache.saveDailyCache(app, date, { context: { projects: [] } }, { brief: "규칙 기반" });
  const approved = await cache.saveApprovedFocus(app, date, [{ id: "f1", label: "집중" }], false);
  assert.equal(approved.edited_by_human, false);
  assert.deepEqual(await cache.getDailyCache(app, date), {
    pkg: { context: { projects: [] } },
    result: { brief: "규칙 기반" }
  });
  assert.deepEqual((await cache.getApprovedFocus(app, date)).focus, [{ id: "f1", label: "집중" }]);
  assert.deepEqual(writes.map((write) => write[1]), [
    `SYSTEM/AI/Skills/prodigy-review/runs/morning/${date}/morning-package-${date}.json`,
    `SYSTEM/AI/Skills/prodigy-review/runs/morning/${date}/morning-result-${date}.json`,
    `SYSTEM/AI/Skills/prodigy-review/runs/morning/${date}/approved-focus-${date}.json`
  ]);
  writes.forEach((write) => assert.match(write[2], /\n$/));
}

async function main() {
  testModelSelectorsAndStates();
  testRenderingSelectorsAndActions();
  await testControllerRoutingAndDisposal();
  await testStorageContract();
  console.log("Home seam module tests passed");
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
