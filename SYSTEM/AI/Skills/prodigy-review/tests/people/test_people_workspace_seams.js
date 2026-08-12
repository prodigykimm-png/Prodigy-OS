"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/people-core.js"));
const contextRender = require(path.join(ROOT, "SYSTEM/Views/people-context-render.js"));
const workspaceModel = require(path.join(ROOT, "SYSTEM/Views/people-workspace-model.js"));
const workspaceEvents = require(path.join(ROOT, "SYSTEM/Views/people-workspace-events.js"));

const PERSON_PATH = "PARA/RESOURCES/CONTACTS/강은지.md";

function person(body = "") {
  return {
    path: PERSON_PATH,
    type: "people",
    name: "강은지",
    relationship: "친구",
    body
  };
}

class Element {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.children = [];
    this.text = String(options.text || "");
    this.attr = Object.assign({}, options.attr || {});
    this.className = String(this.attr.class || "");
    this.hidden = false;
    this.value = "";
    this.style = {};
    this.parentElement = null;
    this.isConnected = true;
    this.classList = { add: (name) => this.addClass(name), remove: (name) => this.removeClass(name) };
  }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  createEl(tag, options = {}) { const child = new Element(tag, options); child.parentElement = this; child.isConnected = this.isConnected; this.children.push(child); return child; }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children.forEach((child) => { child.parentElement = null; child.isConnected = false; }); this.children = []; }
  insertBefore(child, anchor) {
    if (child.parentElement) child.remove();
    const index = anchor ? this.children.indexOf(anchor) : -1;
    child.parentElement = this;
    child.isConnected = this.isConnected;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    return child;
  }
  appendChild(child) { return this.insertBefore(child, null); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
    this.isConnected = false;
  }
  addClass(name) { this.className = `${this.className} ${name}`.trim(); }
  removeClass(name) { this.className = this.className.split(/\s+/).filter((item) => item && item !== name).join(" "); }
  setText(value) { this.text = String(value == null ? "" : value); }
  setAttribute(name, value) { this.attr[name] = String(value); if (name === "class") this.className = String(value); }
  focus() { global.document.activeElement = this; }
  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const matches = [];
    const visit = (node) => {
      if (className && node.className.split(/\s+/).includes(className)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("People workspace model projects explicit context and preserves the selected source metadata", () => {
  const model = workspaceModel.create({
    core,
    typedKnowledgeRow: contextRender.row,
    rawPeople: [person("# 메모\n- CJK 줄바꿈 맥락")],
    sourcePages: [{
      path: "ZETA/PERMANENT/확인.md",
      type: "knowledge",
      title: "확인",
      connections: [`[[${PERSON_PATH}]]`],
      source_refs: ["DAILY/DAILY/2026-08-10.md"]
    }]
  });
  const projected = model.rebuild({ query: "강은지", filter: "all", sort: "name_asc" });
  assert.equal(projected.shown, 1);
  assert.equal(projected.people[0].path, PERSON_PATH);
  assert.equal(projected.people[0].linked_all.length, 1);
  assert.equal(projected.people[0].linked_all[0].context_kind, "approved");
  assert.deepEqual(projected.people[0].linked_all[0].source_refs, ["DAILY/DAILY/2026-08-10.md"]);
});

test("People workspace model exposes loading success, empty, error, retry, and fresh setData states", async () => {
  let mode = "success";
  const rows = [person("")];
  const app = {
    vault: {
      getAbstractFileByPath: (filePath) => filePath === PERSON_PATH ? { path: filePath } : null,
      cachedRead: async () => {
        if (mode === "error") throw new Error("sync unavailable");
        return mode === "empty" ? "" : "# 메모\n- 다시 읽음";
      }
    }
  };
  const model = workspaceModel.create({ core, app, typedKnowledgeRow: contextRender.row, rawPeople: rows, sourcePages: [] });
  assert.equal(await model.hydrate(), true);
  assert.equal(model.getReadState(PERSON_PATH).status, "success");

  mode = "error";
  model.setData([person("")], []);
  assert.equal(await model.hydrate(), true);
  assert.equal(model.getReadState(PERSON_PATH).status, "error");
  assert.match(model.getReadState(PERSON_PATH).error, /sync unavailable/);

  mode = "empty";
  assert.equal(await model.retry(PERSON_PATH), true);
  assert.equal(model.getReadState(PERSON_PATH).status, "empty");
});

test("People workspace renders loading before initial hydration settles and removes it on success without losing focus or selection", async () => {
  const pending = deferred();
  const previousDocument = global.document;
  global.document = { activeElement: null };
  const host = new Element();
  const raw = [person("")];
  const app = { vault: {
    getAbstractFileByPath: () => ({ path: PERSON_PATH }),
    cachedRead: async () => pending.promise
  } };
  try {
    const view = require(path.join(ROOT, "SYSTEM/Views/people-view.js"));
    const api = view.renderPeopleWorkspace({ app, container: host, rawPeople: raw, sourcePages: [], logicalWidth: 767 });
    const search = host.querySelector(".ppw-search");
    const listPane = host.querySelector(".ppw-list-pane");
    search.value = "강은지";
    search.focus();
    api.selectPerson(PERSON_PATH);
    assert.ok(host.querySelectorAll(".ppw-read-loading").length >= 1, "loading must be visible before the subscribed body read settles");
    assert.match(host.textContent, /본문을 불러오는 중/);
    pending.resolve("# 메모\n- 수화 완료");
    await api.hydrationReady;
    assert.equal(host.querySelectorAll(".ppw-read-loading").length, 0, "loading must be removed after success");
    assert.match(listPane.textContent, /수화 완료/, "parked list retains the hydrated card state");
    assert.equal(api.getState().selectedPath, PERSON_PATH);
    assert.equal(global.document.activeElement, search);
    api.destroy();
  } finally {
    global.document = previousDocument;
  }
});

test("People single-pane list/detail navigation moves focus to detail and restores the exact opener and list scroll", () => {
  const previousDocument = global.document;
  global.document = { activeElement: null, getElementById: () => ({ textContent: "" }) };
  const host = new Element();
  try {
    const view = require(path.join(ROOT, "SYSTEM/Views/people-view.js"));
    const api = view.renderPeopleWorkspace({ container: host, rawPeople: [person("# 메모\n- 포커스 영수증")], sourcePages: [], logicalWidth: 390 });
    const listPane = host.querySelector(".ppw-list-pane");
    const opener = host.querySelector(".ppw-name");
    listPane.scrollTop = 137;
    opener.focus();
    opener.onclick({ preventDefault() {} });
    assert.equal(global.document.activeElement, host.querySelector(".ppw-detail-title"));
    assert.equal(listPane.isConnected, false, "inactive list controls must be parked outside the connected tree");
    host.querySelector(".ppw-detail-back").onclick();
    assert.equal(global.document.activeElement, opener);
    assert.equal(listPane.scrollTop, 137);
    assert.equal(listPane.isConnected, true);
    assert.equal(host.querySelector(".ppw-detail-pane"), null, "inactive detail controls must be parked outside the connected tree");
    api.destroy();
  } finally {
    global.document = previousDocument;
  }
});

test("People retry renders loading before awaiting and transitions through error to empty on an exact state signal", async () => {
  let mode = "error";
  let retryRead = null;
  let resolveEmpty;
  const stateListeners = [];
  const host = new Element();
  const raw = [person("")];
  const app = { vault: {
    getAbstractFileByPath: () => ({ path: PERSON_PATH }),
    cachedRead: async () => {
      if (mode === "error") throw new Error("offline fixture");
      return retryRead.promise;
    }
  } };
  const view = require(path.join(ROOT, "SYSTEM/Views/people-view.js"));
  const api = view.renderPeopleWorkspace({
    app, container: host, rawPeople: raw, sourcePages: [], logicalWidth: 767,
    onReadStateChange: (change) => stateListeners.slice().forEach((listener) => listener(change))
  });
  await api.hydrationReady;
  assert.ok(host.querySelectorAll(".ppw-read-error").length >= 1);
  mode = "empty";
  retryRead = deferred();
  const emptySignal = new Promise((resolve) => {
    resolveEmpty = (change) => { if (change.phase === "empty" && change.path === PERSON_PATH) resolve(change); };
    stateListeners.push(resolveEmpty);
  });
  const retry = api.retryPersonRead(PERSON_PATH);
  assert.ok(host.querySelectorAll(".ppw-read-loading").length >= 1, "retry loading must render synchronously before the Vault promise settles");
  assert.equal(host.querySelectorAll(".ppw-read-error").length, 0, "stale error must collapse while retry is loading");
  retryRead.resolve("");
  await Promise.all([retry, emptySignal]);
  assert.equal(host.querySelectorAll(".ppw-read-loading").length, 0);
  assert.ok(host.querySelectorAll(".ppw-read-empty").length >= 1);
  api.destroy();
});

test("People workspace event scope disposes observers and handlers exactly once", () => {
  let disconnects = 0;
  let observes = 0;
  class Observer {
    observe() { observes += 1; }
    disconnect() { disconnects += 1; }
  }
  const target = { onclick: null };
  const events = workspaceEvents.create();
  const handler = () => {};
  events.property(target, "onclick", handler);
  events.observe(Observer, target, () => {});
  assert.equal(target.onclick, handler);
  assert.equal(observes, 1);
  events.dispose();
  events.dispose();
  assert.equal(target.onclick, null);
  assert.equal(disconnects, 1);
  assert.equal(events.isDisposed(), true);
});

test("People card projection preserves interaction, memo, context filter, and empty list semantics", () => {
  const card = contextRender.card({
    path: PERSON_PATH,
    last_contact: "2026-08-10",
    linked_count: 2,
    interaction_lines: ["긴 한글 상호작용 맥락", "두 번째 사건", "숨김"],
    memo_lines: ["메모 하나", "메모 둘", "메모 셋", "숨김"],
    linked_all: [{ bucket: "project", title: "프로젝트" }, { bucket: "journal", title: "일지" }]
  }, {
    contextType: { [PERSON_PATH]: "project" },
    expanded: { [PERSON_PATH]: true }
  }, core);
  assert.deepEqual(card.eventLines, ["긴 한글 상호작용 맥락", "두 번째 사건"]);
  assert.deepEqual(card.memoLines, ["메모 하나", "메모 둘", "메모 셋"]);
  assert.equal(card.allLinked.length, 1);
  assert.equal(card.expanded, true);
  assert.equal(card.subText, "최근 연락 2026-08-10 · 연결된 기록 2개");
  assert.equal(contextRender.card({ path: "empty.md" }, {}, core).subText, "연결된 기록 없음");
});

test("People context renderer retains exact candidate review metadata and CJK-safe labels", () => {
  const row = contextRender.row({
    candidate_path: "PARA/RESOURCES/Knowledge/Candidates/검토.md",
    candidate_id: "candidate-1",
    title: "검토 후보",
    status: "pending",
    quality: "needs_review",
    source_refs: ["DAILY/DAILY/2026-08-10.md"]
  });
  assert.equal(row.context_kind, "candidate");
  assert.equal(row.review_target, row.candidate_path);
  assert.match(contextRender.label(row), /검토 후보 · 검증 대기 · pending · needs_review/);
  const attrs = {};
  contextRender.applyMetadata({ setAttribute: (key, value) => { attrs[key] = value; } }, row);
  assert.equal(attrs["data-candidate-id"], "candidate-1");
  assert.equal(attrs["data-review-target"], row.candidate_path);
});
