"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");
const DATA_PATH = path.join(ROOT, "SYSTEM/Views/site-visit-data.js");
const WORKFLOW_PATH = path.join(ROOT, "SYSTEM/Views/site-visit-workflow.js");

function loadData() {
  const sandbox = { console, decodeURIComponent, encodeURIComponent, JSON, Date };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(DATA_PATH, "utf8"), { filename: DATA_PATH }).runInContext(sandbox);
  return sandbox.prodigySiteVisit;
}

test("site visit records meaningful evidence without requiring every checklist rating", () => {
  const data = loadData();
  const state = data.createState("오피스텔");

  assert.equal(data.hasMeaningfulEvidence(state), false);
  assert.equal(data.isComplete(state), false);
  state.notes.push("주차가 부족해 보임");
  assert.equal(data.hasMeaningfulEvidence(state), true);
  assert.equal(data.isComplete(state), true, "a useful memo is enough to record the visit");

  const rated = data.createState("아파트");
  rated.checklist.Parking = "low";
  assert.equal(data.isComplete(rated), true, "one observed checklist item is enough");
});

test("site visit property priorities distinguish officetel and lodging without losing shared checks", () => {
  const data = loadData();

  assert.equal(data.normalizeType("오피스텔"), "officetel");
  assert.equal(data.normalizeType("숙박시설(생활숙박시설)"), "lodging");
  assert.equal(data.normalizeType("아파트"), "apartment");

  const officetel = data.priorityItemsFor("오피스텔");
  const lodging = data.priorityItemsFor("생활숙박시설");
  assert.ok(officetel.length >= 5 && officetel.length <= 7);
  assert.ok(lodging.length >= 5 && lodging.length <= 7);
  assert.ok(officetel.includes("Parking Type"));
  assert.ok(officetel.includes("Management Fee"));
  assert.ok(lodging.includes("Front Desk Operation"));
  assert.ok(lodging.includes("Fire Evacuation"));
  assert.ok(data.commonItems.includes("Parking"));
});

test("site visit state migrates only management-adjacent legacy phone notes", () => {
  const data = loadData();
  const legacy = data.createState("오피스텔");
  legacy.version = 2;
  legacy.notes = ["관리소장 이종면", "010 3557 4261", "사람이 거주하는 것 같음", "주차가 부족해 보임"];
  delete legacy.managementContact;

  const migrated = data.reconcileState(legacy, "오피스텔");
  assert.equal(migrated.version, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.managementContact)), {
    name: "관리소장 이종면",
    phone: "010-3557-4261",
    note: ""
  });
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.notes)), ["사람이 거주하는 것 같음", "주차가 부족해 보임"]);

  const unrelated = data.createState("오피스텔");
  unrelated.notes = ["중개사 인터뷰", "010 9999 0000"];
  delete unrelated.managementContact;
  assert.equal(data.reconcileState(unrelated, "오피스텔").managementContact.phone, "");
});

test("site visit workflow exposes memo first and optional accessible rating groups", () => {
  const source = fs.readFileSync(WORKFLOW_PATH, "utf8");

  assert.doesNotMatch(source, /모든 항목에 상\/중\/하\/해당 없음을 선택해주세요/);
  assert.match(source, /현장 기록 저장/);
  assert.match(source, /확인한 항목/);
  assert.match(source, /createEl\("details"/);
  assert.match(source, /createEl\("fieldset"/);
  assert.match(source, /createEl\("legend"/);
  assert.match(source, /type:\s*"radio"/);
  assert.match(source, /aria-live/);
  assert.match(source, /관리사무소 연락처/);
  assert.match(source, /\["phone",\s*"전화번호",[\s\S]*?"tel"\]/);
  assert.doesNotMatch(source, /app\.vault\.getFiles\(\)[\s\S]*?PRODIGY_SITE_VISIT_STATE/);
  assert.match(source, /AuctionSiteVisitIndex[\s\S]*?readIndex/);
});
