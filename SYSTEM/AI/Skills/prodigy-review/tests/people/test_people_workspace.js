"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/people-core.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/people-view.js"));

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

class RenderElement {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.text = options.text || "";
    this.children = [];
    this.attr = Object.assign({}, options.attr || {});
    this.className = this.attr.class || "";
    this.hidden = false;
    this.style = {};
  }

  createEl(tag, options = {}) {
    const child = new RenderElement(tag, options);
    this.children.push(child);
    return child;
  }

  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; }
  addClass(name) { this.className = `${this.className} ${name}`.trim(); }
  removeClass(name) { this.className = this.className.split(/\s+/).filter((item) => item && item !== name).join(" "); }
  setText(value) { this.text = String(value == null ? "" : value); }
  setAttribute(name, value) {
    this.attr[name] = String(value);
    if (name === "class") this.className = String(value);
  }

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

function main() {
  // --- normalizePersonRecord ---
  const person = core.normalizePersonRecord({
    path: "PARA/RESOURCES/CONTACTS/김대리.md",
    type: "people",
    name: "김대리",
    relationship: "회사 동료",
    company: "한국철도공사",
    role: "담당자",
    last_contact: "",
    body: "운송예산"
  });
  assert.equal(person.name, "김대리");
  assert.equal(person.is_legacy, false);
  assert.equal(person.last_contact, "");
  assert.match(person.meta_line || [person.relationship, person.company, person.role].join(" · "), /회사 동료/);

  const legacy = core.normalizePersonRecord({
    path: "PARA/RESOURCES/CONTACTS/Elon Musk.md",
    type: "contact",
    name: "Elon Musk",
    company: "SpaceX",
    title: "CEO"
  });
  assert.equal(legacy.is_legacy, true);
  assert.equal(legacy.role, "CEO");

  // last_contact never from mtime
  const noGuess = core.normalizePersonRecord({
    path: "PARA/RESOURCES/CONTACTS/A.md",
    type: "people",
    name: "A",
    last_contact: "",
    file: { mtime: new Date("2020-01-01") }
  });
  assert.equal(noGuess.last_contact, "");

  // --- memo lines for dashboard glance ---
  const memoNote = [
    "---",
    "type: people",
    "relationship: 학교",
    "---",
    "",
    "# 전태현",
    "",
    "# 메모",
    "*사실 중심의 장기 맥락.*",
    "- 8월 29일 결혼",
    "- 주말 연락 선호",
    "",
    "# 핵심 상호작용",
    "- [[2026-07-16]] 청첩장"
  ].join("\n");
  const memoLines = core.extractMemoLines(memoNote);
  assert.deepEqual(memoLines, ["8월 29일 결혼", "주말 연락 선호"]);
  const withMemo = core.normalizePersonRecord({
    path: "PARA/RESOURCES/CONTACTS/전태현.md",
    type: "people",
    name: "전태현",
    body: memoNote
  });
  assert.equal(withMemo.memo_count, 2);
  assert.equal(withMemo.memo_preview[0], "8월 29일 결혼");
  assert.equal(core.matchPeopleSearch(withMemo, "결혼"), true);

  // remove memo line
  const afterDel = core.removeMemoLineFromContent(memoNote, { text: "8월 29일 결혼" });
  assert.equal(afterDel.removed, "8월 29일 결혼");
  assert.deepEqual(core.extractMemoLines(afterDel.content), ["주말 연락 선호"]);
  const afterDelIdx = core.removeMemoLineFromContent(memoNote, { index: 1 });
  assert.equal(afterDelIdx.removed, "주말 연락 선호");
  assert.deepEqual(core.extractMemoLines(afterDelIdx.content), ["8월 29일 결혼"]);
  assert.throws(() => core.removeMemoLineFromContent(memoNote, { text: "없는 메모" }), /찾지/);

  // --- search ---
  assert.equal(core.matchPeopleSearch(person, ""), true);
  assert.equal(core.matchPeopleSearch(person, "김대"), true);
  assert.equal(core.matchPeopleSearch(person, "철도"), true);
  assert.equal(core.matchPeopleSearch(person, "담당"), true);
  assert.equal(core.matchPeopleSearch(person, "없는단어xyz"), false);

  // macOS/iCloud may retain contact filenames as NFD while the Korean IME
  // supplies NFC input. They are visually identical and must search alike.
  const nfdName = "강은지".normalize("NFD");
  const nfdPerson = core.normalizePersonRecord({
    path: `PARA/RESOURCES/CONTACTS/${nfdName}.md`,
    type: "people",
    name: nfdName
  });
  assert.equal(
    core.matchPeopleSearch(nfdPerson, "강은지"),
    true,
    "NFC Korean search must find an NFD-backed contact name"
  );
  const nfdSearchModel = core.buildPeopleWorkspaceModel(
    [nfdPerson],
    [],
    { query: "강은지", filter: "all" }
  );
  assert.equal(nfdSearchModel.shown, 1);
  assert.deepEqual(nfdSearchModel.people[0].search_match_hints, ["이름"]);
  assert.equal(
    core.matchPeopleSearch(nfdPerson, "ㄱㅏㅇㅇㅡㄴㅈㅣ"),
    true,
    "raw Korean jamo from the workspace input must find the completed name"
  );

  // --- link index (one-pass) ---
  const people = [
    core.normalizePersonRecord({ path: "PARA/RESOURCES/CONTACTS/김대리.md", type: "people", name: "김대리" }),
    core.normalizePersonRecord({ path: "PARA/RESOURCES/CONTACTS/정호성.md", type: "people", name: "정호성" })
  ];
  const sources = [
    {
      path: "PARA/PROJECTS/운송예산.md",
      type: "project",
      title: "3차 운송예산 편성",
      connections: ["[[김대리]]"],
      outlinks: [],
      body: "",
      mtime: new Date("2026-07-15T12:00:00").getTime()
    },
    {
      path: "DAILY/DAILY/2026-07-16.md",
      type: "journal",
      title: "2026-07-16",
      connections: [],
      outlinks: ["PARA/RESOURCES/CONTACTS/김대리.md"],
      body: "오늘 [[김대리]] 와 통화",
      mtime: new Date("2026-07-16T12:00:00").getTime()
    },
    {
      path: "PARA/PROJECTS/Auction/a.md",
      type: "auction_case",
      title: "김포 물건",
      connections: ["[[정호성]]"],
      mtime: new Date("2026-07-10T12:00:00").getTime()
    },
    {
      path: "PARA/PROJECTS/Reading/book.md",
      type: "reading",
      title: "Atomic Habits",
      body: "추천 [[김대리]]",
      mtime: new Date("2026-07-01T12:00:00").getTime()
    },
    {
      path: "ZETA/PERMANENT/침착한 확인.md",
      type: "knowledge",
      title: "침착한 확인",
      connections: ["[[PARA/RESOURCES/CONTACTS/김대리.md]]"],
      mtime: new Date("2026-07-02T12:00:00").getTime()
    },
    {
      path: "PARA/RESOURCES/Knowledge/Candidates/촬영 후보.md",
      type: "knowledge_candidate",
      title: "촬영 후보",
      outlinks: ["PARA/RESOURCES/CONTACTS/김대리.md"],
      mtime: new Date("2026-07-03T12:00:00").getTime()
    },
    {
      path: "PARA/RESOURCES/CONTACTS/김대리.md",
      type: "people",
      title: "김대리",
      body: "self should not index"
    }
  ];

  const index = core.buildPeopleLinkIndex(people, sources);
  assert.ok(index["PARA/RESOURCES/CONTACTS/김대리.md"]);
  const kimLinks = index["PARA/RESOURCES/CONTACTS/김대리.md"];
  assert.ok(kimLinks.length >= 3);
  // de-dupe self
  assert.equal(kimLinks.some((x) => x.path.includes("CONTACTS/김대리")), false);
  // most recent first
  assert.equal(kimLinks[0].path, "DAILY/DAILY/2026-07-16.md");
  // relation label is related context, not interaction
  assert.equal(kimLinks[0].relation_label, "관련 기록");
  assert.ok(kimLinks.some((x) => x.bucket === "knowledge" && x.type_label === "지식"));
  assert.ok(kimLinks.some((x) => x.bucket === "knowledge_candidate" && x.type_label === "검증 대기"));
  assert.ok(core.filterContextItems(kimLinks, "knowledge").every((x) => x.bucket === "knowledge"));

  const preview = core.recentContextForPerson("PARA/RESOURCES/CONTACTS/김대리.md", index, 2);
  assert.equal(preview.length, 2);

  // --- workspace model ---
  const model = core.buildPeopleWorkspaceModel(people, sources, { query: "", filter: "all", maxPreview: 3 });
  assert.equal(model.total, 2);
  assert.equal(model.empty, false);
  const kim = model.people.find((p) => p.name === "김대리");
  assert.ok(kim);
  assert.ok(kim.linked_count >= 3);
  assert.ok(kim.recent_context.length <= 3);
  assert.ok(kim.recent_context.length >= 1);

  // search
  const m2 = core.buildPeopleWorkspaceModel(people, sources, { query: "정호", filter: "all" });
  assert.equal(m2.shown, 1);
  assert.equal(m2.people[0].name, "정호성");

  const m3 = core.buildPeopleWorkspaceModel(people, sources, { query: "없는사람zzz", filter: "all" });
  assert.equal(m3.no_match, true);
  assert.equal(m3.shown, 0);

  // filters — relationship categories
  assert.ok(core.WORKSPACE_FILTERS.some((f) => f.id === "지인"));
  assert.ok(core.WORKSPACE_FILTERS.some((f) => f.id === "회사"));
  assert.ok(core.WORKSPACE_FILTERS.some((f) => f.id === "unset"));
  const withRel = people.map((p) => core.enrichPersonWithContext(
    Object.assign({}, p, { relationship: p.name === "김대리" ? "회사" : "학교" }),
    index
  ));
  const fCompanyCat = core.filterPeopleList(withRel, { filter: "회사" });
  assert.equal(fCompanyCat.length, 1);
  assert.equal(fCompanyCat[0].name, "김대리");
  const fSchool = core.filterPeopleList(withRel, { filter: "학교" });
  assert.equal(fSchool.length, 1);
  assert.equal(fSchool[0].name, "정호성");
  const fUnset = core.filterPeopleList(
    people.map((p) => core.enrichPersonWithContext(
      Object.assign({}, p, { relationship: p.name === "김대리" ? "한국해양대 동기" : "지인" }),
      index
    )),
    { filter: "unset" }
  );
  assert.ok(fUnset.every((p) => !core.isKnownRelationshipType(p.relationship) || !p.relationship));
  assert.ok(fUnset.some((p) => p.name === "김대리"));

  const fLink = core.filterPeopleList(
    people.map((p) => core.enrichPersonWithContext(p, index)),
    { filter: "recent_link" }
  );
  assert.ok(fLink.every((p) => p.linked_count > 0));

  // sort 가나다 + 손볼 사람
  assert.ok(core.WORKSPACE_SORTS.some((s) => s.id === "name_asc"));
  assert.ok(core.WORKSPACE_SORTS.some((s) => s.id === "attention"));
  const nameList = [
    core.normalizePersonRecord({ path: "a.md", type: "people", name: "홍길동" }),
    core.normalizePersonRecord({ path: "b.md", type: "people", name: "김대리" }),
    core.normalizePersonRecord({ path: "c.md", type: "people", name: "정호성" })
  ];
  const asc = core.sortPeopleList(nameList, { sort: "name_asc" }).map((p) => p.name);
  assert.deepEqual(asc, ["김대리", "정호성", "홍길동"]);
  const desc = core.sortPeopleList(nameList, { sort: "name_desc" }).map((p) => p.name);
  assert.deepEqual(desc, ["홍길동", "정호성", "김대리"]);
  const modelAsc = core.buildPeopleWorkspaceModel(nameList, [], { sort: "name_asc" });
  assert.equal(modelAsc.sort, "name_asc");
  assert.equal(modelAsc.people[0].name, "김대리");
  const touch = [
    core.normalizePersonRecord({ path: "x.md", type: "people", name: "가", last_contact: "2026-07-01" }),
    core.normalizePersonRecord({ path: "y.md", type: "people", name: "나", last_contact: "" }),
    core.normalizePersonRecord({ path: "z.md", type: "people", name: "다", last_contact: "2025-01-01" })
  ];
  const att = core.sortPeopleList(touch, { sort: "attention" }).map((p) => p.name);
  assert.deepEqual(att, ["나", "다", "가"]); // empty first, then oldest

  // interaction extract + remove
  const eventNote = [
    "---", "type: people", "---", "",
    "# 핵심 상호작용",
    "- [[2026-07-16]] 회의",
    "- [[2026-07-10]] 통화",
    "",
    "# 메모",
    "- 메모1"
  ].join("\n");
  assert.deepEqual(core.extractInteractionLines(eventNote), ["[[2026-07-16]] 회의", "[[2026-07-10]] 통화"]);
  const delEv = core.removeInteractionLineFromContent(eventNote, { index: 0 });
  assert.match(delEv.removed, /회의/);
  assert.equal(core.extractInteractionLines(delEv.content).length, 1);
  assert.ok(core.WORKSPACE_FILTERS.some((f) => f.id === "legacy"));
  assert.ok(core.WORKSPACE_FILTERS.some((f) => f.id === "no_contact"));
  assert.equal(core.filterContextItems(
    [{ bucket: "project", title: "A" }, { bucket: "journal", title: "B" }],
    "project"
  ).length, 1);

  // --- Personal hub wiring ---
  const personal = read("HUB/60 Personal.md");
  assert.match(personal, /사람과 관계/);
  assert.match(personal, /관계|원본 노트|미리보기/);
  assert.match(personal, /buildPeopleWorkspaceModel/);
  assert.match(personal, /renderPeopleWorkspace/);
  assert.match(personal, /장소/);
  assert.match(personal, /paintPlaces|renderVenuesWorkspace/);
  assert.match(personal, /setOnSelect/);
  assert.match(personal, /if \(tabId !== "places"\) return/);
  assert.match(personal, /장소를 불러오는 중/);
  assert.equal(personal.includes("await paintPlaces();"), false, "Places must not block the default People tab");
  assert.match(personal, /collectSourcePages/);
  assert.equal(personal.includes("HUB/People.md"), false);
  assert.equal(/미접촉|잠재 고객|인맥 관리|연락 관리/.test(personal), false);

  // Given explicit logical widths, the Personal workspace must render list/detail
  // together only at the canonical wide tier and keep one visible pane at compact.
  const tokens = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));
  const styles = require(path.join(ROOT, "SYSTEM/Views/people-styles.js"));
  const responsive = styles.responsiveContract();
  assert.equal(tokens.BREAKPOINTS.medium, 768);
  assert.equal(tokens.BREAKPOINTS.wide, 1024);
  assert.equal(tokens.CONTROL_HEIGHTS.actionBar, 52);
  assert.equal(tokens.CONTROL_HEIGHTS.touchTarget, 44);
  assert.equal(responsive.compactMax, tokens.BREAKPOINTS.medium - 1);
  assert.equal(responsive.wideMin, tokens.BREAKPOINTS.wide);
  assert.equal(responsive.actionBarHeight, tokens.CONTROL_HEIGHTS.actionBar);
  assert.equal(responsive.touchTarget, tokens.CONTROL_HEIGHTS.touchTarget);
  assert.equal(/max-width:\s*600px/.test(read("SYSTEM/Views/people-styles.js")), false);
  assert.equal(view.resolvePeoplePaneLayout(1023).paneMode, "single-pane");
  assert.equal(view.resolvePeoplePaneLayout(1024).paneMode, "two-pane");

  const responsiveModel = core.buildPeopleWorkspaceModel([
    core.normalizePersonRecord({
      path: "PARA/RESOURCES/CONTACTS/QA-THROWAWAY-반응형.md",
      type: "people",
      name: "QA 반응형",
      body: "# 핵심 상호작용\n- 서로의 판단 근거를 먼저 확인한다."
    })
  ], [], {});
  const wideHost = new RenderElement();
  view.renderPeopleWorkspace({ container: wideHost, model: responsiveModel, logicalWidth: 1280 });
  const wideLayout = wideHost.querySelector(".ppw-master-detail");
  assert.equal(wideLayout.attr["data-pane-mode"], "two-pane");
  assert.equal(wideHost.querySelector(".ppw-list-pane").hidden, false);
  assert.equal(wideHost.querySelector(".ppw-detail-pane").hidden, false);
  assert.equal(wideHost.querySelectorAll(".ppw-detail-section").length, 2);

  const compactHost = new RenderElement();
  const compactWorkspace = view.renderPeopleWorkspace({ container: compactHost, model: responsiveModel, logicalWidth: 767 });
  const compactLayout = compactHost.querySelector(".ppw-master-detail");
  assert.equal(compactLayout.attr["data-pane-mode"], "single-pane");
  assert.equal(compactHost.querySelector(".ppw-list-pane").hidden, false);
  assert.equal(compactHost.querySelector(".ppw-detail-pane").hidden, true);
  compactWorkspace.selectPerson("PARA/RESOURCES/CONTACTS/QA-THROWAWAY-반응형.md");
  assert.equal(compactHost.querySelector(".ppw-list-pane").hidden, true);
  assert.equal(compactHost.querySelector(".ppw-detail-pane").hidden, false);
  compactHost.querySelector(".ppw-detail-back").onclick();
  assert.equal(compactHost.querySelector(".ppw-list-pane").hidden, false);
  assert.equal(compactHost.querySelector(".ppw-detail-pane").hidden, true);

  // --- Person preview model (popup) ---
  const noteBody = [
    "---",
    "type: people",
    "relationship: 동료",
    "company: 공사",
    "role: 담당",
    "last_contact: 2026-07-16",
    "---",
    "",
    "# 김대리",
    "",
    "# 관계",
    "회사 동료로 운송예산 업무를 함께한다.",
    "",
    "# 핵심 상호작용",
    "- [[2026-07-16]] 회의",
    "",
    "# 메모",
    "- 주말에만 연락 가능",
    "",
    "# 연결된 Object",
    "```dataview",
    "LIST",
    "```"
  ].join("\n");
  const personPreview = core.buildPersonPreviewModel("PARA/RESOURCES/CONTACTS/김대리.md", noteBody);
  assert.equal(personPreview.name, "김대리");
  assert.match(personPreview.meta_line, /동료/);
  assert.equal(personPreview.properties.company, "공사");
  assert.equal(personPreview.last_contact, "2026-07-16");
  // Editable popup always exposes fixed section slots
  assert.equal(personPreview.sections.length, core.EDITABLE_SECTIONS.length);
  assert.ok(personPreview.sections.some((s) => s.title === "관계"));
  assert.ok(personPreview.sections.some((s) => s.title === "핵심 상호작용"));
  assert.deepEqual(personPreview.editable_sections, core.EDITABLE_SECTIONS.slice());
  // template guidance stripped from displayBody
  const interact = personPreview.sections.find((s) => s.title === "핵심 상호작용");
  assert.ok(interact);
  assert.match(interact.displayBody, /회의/);
  assert.equal(/인덱스만|형식:/.test(interact.displayBody || ""), false);
  // empty template note → slots present but empty
  const emptyNote = "---\ntype: people\n---\n\n# 관계\n*안내 문구입니다. 둡니다.*\n-\n\n# 메모\n-\n";
  const emptyPrev = core.buildPersonPreviewModel("PARA/RESOURCES/CONTACTS/X.md", emptyNote);
  assert.equal(emptyPrev.sections.length, core.EDITABLE_SECTIONS.length);
  assert.ok(emptyPrev.sections.every((s) => s.isEmpty));
  // 연결된 Object is not an editable slot
  const withDv = core.buildPersonPreviewModel("PARA/RESOURCES/CONTACTS/Y.md", [
    "---", "type: people", "---", "",
    "# 관계", "동료", "",
    "# 연결된 Object", "```dataview", "LIST", "```"
  ].join("\n"));
  assert.equal(withDv.sections.some((s) => /연결/.test(s.title)), false);
  const relFilled = withDv.sections.find((s) => s.title === "관계");
  assert.ok(relFilled);
  assert.match(relFilled.displayBody, /동료/);

  // --- applyPersonPreviewEdits ---
  const edited = core.applyPersonPreviewEdits(noteBody, {
    properties: { company: "새회사", role: "팀장", last_contact: "2026-07-17" },
    sections: {
      "관계": "업데이트된 관계 설명",
      "메모": "- 새 메모 한 줄"
    }
  });
  assert.match(edited, /company:\s*새회사/);
  assert.match(edited, /role:\s*팀장/);
  assert.match(edited, /last_contact:\s*2026-07-17/);
  assert.match(edited, /# 관계\n업데이트된 관계 설명/);
  assert.match(edited, /# 메모\n- 새 메모 한 줄/);
  assert.match(edited, /# 핵심 상호작용\n- \[\[2026-07-16\]\] 회의/); // untouched section kept
  assert.match(edited, /type:\s*people/);
  // unknown section titles ignored
  const ignoreUnknown = core.applyPersonPreviewEdits(noteBody, {
    sections: { "비밀구역": "should not appear" }
  });
  assert.equal(/비밀구역/.test(ignoreUnknown), false);

  // --- deletePeople (store) ---
  let deletedPath = null;
  const delApp = {
    vault: {
      getAbstractFileByPath: (p) => (p === "PARA/RESOURCES/CONTACTS/지울사람.md" ? { path: p } : null),
      trash: async (file) => { deletedPath = file.path; },
      delete: async () => { throw new Error("should prefer trash"); }
    }
  };
  return require(path.join(ROOT, "SYSTEM/Views/people-store.js")).deletePeople(
    delApp,
    "PARA/RESOURCES/CONTACTS/지울사람.md"
  ).then((res) => {
    assert.equal(res.path, "PARA/RESOURCES/CONTACTS/지울사람.md");
    assert.equal(deletedPath, "PARA/RESOURCES/CONTACTS/지울사람.md");
    assert.equal(res.trashed, true);
    return require(path.join(ROOT, "SYSTEM/Views/people-store.js")).deletePeople(
      delApp,
      "PARA/PROJECTS/not-people.md"
    ).then(
      () => { throw new Error("should reject non-contacts path"); },
      (err) => { assert.match(String(err.message), /Contacts|사람/); }
    );
  }).then(() => {
  // --- View exports + editable preview wiring ---
  assert.equal(typeof view.renderPeopleWorkspace, "function");
  assert.equal(typeof view.openPersonPreview, "function");
  assert.equal(typeof view.openDeletePersonFlow, "function");
  const peopleViewSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/people-view.js"), "utf8");
  assert.match(peopleViewSrc, /openDeletePersonFlow/);
  assert.match(peopleViewSrc, /사람 삭제|삭제할까요/);
  assert.match(peopleViewSrc, /ppw-trash|🗑️/);
  assert.match(peopleViewSrc, /이 사람 노트를 삭제/);
  assert.match(peopleViewSrc, /savePeopleNote/);
  assert.match(peopleViewSrc, /ppw-edit-textarea/);
  assert.match(peopleViewSrc, /ppw-modal/);
  assert.match(peopleViewSrc, /관계 맥락/);
  // Workspace CSS moved out of people-view.js into people-styles.js (ab1f852).
  // The view now delegates injection, so assert the narrow-screen width rule
  // where it actually lives — deleting it must still turn this test red.
  assert.match(peopleViewSrc, /PeopleStyles/);
  const peopleStylesSrc = read("SYSTEM/Views/people-styles.js");
  const compactBlock = peopleStylesSrc.match(/@media\s*\(max-width:\s*\$\{compactMax\}px\)\s*\{[\s\S]*?\n\}/);
  assert.ok(compactBlock, "people-styles.js must keep a compact-screen media block");
  const compactModal = compactBlock[0].match(/\.modal\.ppw-modal\s*\{[^}]*\}/);
  assert.ok(compactModal, "compact media block must size .ppw-modal to the narrow viewport");
  assert.match(compactModal[0], /width:\s*calc\(100vw - 10px\)/);
  assert.match(compactModal[0], /max-width:\s*calc\(100vw - 10px\)/);
  assert.match(peopleViewSrc, /renderRelationshipPicker|ppw-rel-chip/);
  // Finder input lives in a native Modal, outside the Dataview-owned DOM.
  assert.equal(typeof view.openPeopleFinder, "function");
  assert.match(peopleViewSrc, /class PeopleFinderModal extends Modal/);
  assert.match(peopleViewSrc, /btn\(headerActions, "사람 찾기"/);
  assert.match(peopleViewSrc, /this\.resultsEl\.empty\(\)/);
  assert.match(peopleViewSrc, /oncompositionstart/);
  assert.match(peopleViewSrc, /paintPreview\(\)/);
  assert.match(peopleViewSrc, /핵심 상호작용/);
  assert.match(peopleViewSrc, /최근 맥락/);
  assert.match(peopleViewSrc, /관계 맥락 열기/);
  assert.match(peopleViewSrc, /ppw-finder-layout/);
  assert.ok(core.RELATIONSHIP_TYPES.includes("지인"));
  const peopleStoreSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/people-store.js"), "utf8");
  assert.match(peopleStoreSrc, /async function savePeopleNote/);
  assert.match(peopleStoreSrc, /applyPersonPreviewEdits/);

  // --- No CRM schema / home / PRE changes required ---
  const engine = read("SYSTEM/Views/object-engine-core.js");
  assert.match(engine, /people|journal/); // still non-breaking

  const foundation = read("SYSTEM/AI/Skills/prodigy-review/tests/people/test_people_foundation.js");
  assert.match(foundation, /CANONICAL_TYPE/);

  console.log("People workspace tests passed");
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
