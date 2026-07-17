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

  // --- search ---
  assert.equal(core.matchPeopleSearch(person, ""), true);
  assert.equal(core.matchPeopleSearch(person, "김대"), true);
  assert.equal(core.matchPeopleSearch(person, "철도"), true);
  assert.equal(core.matchPeopleSearch(person, "담당"), true);
  assert.equal(core.matchPeopleSearch(person, "없는단어xyz"), false);

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

  // filters
  const withRel = people.map((p) => core.enrichPersonWithContext(
    Object.assign({}, p, { relationship: p.name === "김대리" ? "동료" : "" }),
    index
  ));
  const fRel = core.filterPeopleList(withRel, { filter: "relationship" });
  assert.ok(fRel.every((p) => p.relationship));

  const fCompany = core.filterPeopleList(
    people.map((p) => core.enrichPersonWithContext(
      Object.assign({}, p, { company: p.name === "김대리" ? "공사" : "" }),
      index
    )),
    { filter: "company" }
  );
  assert.ok(fCompany.every((p) => p.company));

  const fLink = core.filterPeopleList(
    people.map((p) => core.enrichPersonWithContext(p, index)),
    { filter: "recent_link" }
  );
  assert.ok(fLink.every((p) => p.linked_count > 0));

  // sort: people before legacy
  const mixed = core.sortPeopleList([
    core.enrichPersonWithContext(legacy, {}),
    core.enrichPersonWithContext(person, index)
  ]);
  assert.equal(mixed[0].is_legacy, false);

  // --- Personal hub wiring ---
  const personal = read("HUB/60 Personal.md");
  assert.match(personal, /사람과 관계/);
  assert.match(personal, /중요한 사람을 찾고/);
  assert.match(personal, /buildPeopleWorkspaceModel/);
  assert.match(personal, /renderPeopleWorkspace/);
  assert.match(personal, /지속 영역/);
  assert.match(personal, /collectSourcePages/);
  assert.equal(personal.includes("HUB/People.md"), false);
  assert.equal(/미접촉|잠재 고객|인맥 관리|연락 관리/.test(personal), false);

  // --- View exports ---
  assert.equal(typeof view.renderPeopleWorkspace, "function");

  // --- No CRM schema / home / PRE changes required ---
  const engine = read("SYSTEM/Views/object-engine-core.js");
  assert.match(engine, /people|journal/); // still non-breaking

  const foundation = read("SYSTEM/AI/Skills/prodigy-review/tests/people/test_people_foundation.js");
  assert.match(foundation, /CANONICAL_TYPE/);

  console.log("People workspace tests passed");
}

main();
