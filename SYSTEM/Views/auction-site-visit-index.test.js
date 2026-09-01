"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const indexApi = require("./auction-site-visit-index.js");

function fakeApp() {
  let content = null;
  const file = { path: indexApi.STORE_PATH };
  return {
    vault: {
      getAbstractFileByPath(path) {
        return path === indexApi.STORE_PATH && content !== null ? file : null;
      },
      getFiles() {
        throw new Error("Region read must never scan Auction files");
      },
      async create(path, value) {
        assert.equal(path, indexApi.STORE_PATH);
        content = value;
        return file;
      },
      async createFolder() {},
      async read(target) {
        assert.equal(target, file);
        return content;
      },
      async process(target, transform) {
        assert.equal(target, file);
        content = transform(content);
      }
    },
    readStore() {
      return content;
    }
  };
}

function page() {
  return {
    case_number: "2025타경2391(2)",
    property_type: "오피스텔",
    region_sido: "부산광역시",
    region_sigungu: "부산진구",
    region_dong: "전포동",
    address: "부산광역시 부산진구 전포대로 186, 목연정엠팰리스 15층 1503호",
    file: { path: "PARA/PROJECTS/Auction/부산-2025타경2391_2.md", name: "부산-2025타경2391_2" }
  };
}

function state() {
  return {
    version: 2,
    startedAt: "2026-07-18T06:19:39.460Z",
    finishedAt: "",
    checklist: { Parking: "unset", "Management Office": "unset" },
    checklistNotes: {},
    notes: ["관리소장 이종면", "010 1234 5678", "사람이 거주하는 것 같음", "주차가 부족해 보임"],
    unexpected: [],
    photos: []
  };
}

test("site visit index stores a sanitized meaningful projection and replaces one path incrementally", async () => {
  const app = fakeApp();
  const record = indexApi.recordFromPage(page(), state(), { mtime: 123 });

  assert.equal(record.status, "draft");
  assert.equal(record.region_key, "부산광역시-부산진구");
  assert.equal(record.region_dong, "전포동");
  assert.equal(record.has_contact, true);
  assert.deepEqual(record.management_contact, {
    name: "관리소장 이종면",
    phone: "010-1234-5678",
    note: ""
  });
  assert.equal(record.summary_lines.some((line) => /010|1234|5678/.test(line)), false);
  assert.equal(record.summary_lines.some((line) => /이종면/.test(line)), false);
  assert.equal(record.building_name, "목연정엠팰리스");

  await indexApi.syncRecord(app, page(), state(), { mtime: 123 });
  await indexApi.syncRecord(app, page(), { ...state(), notes: ["주차 재확인 필요"] }, { mtime: 124 });
  const visits = await indexApi.readRegionVisits(app, "부산광역시-부산진구");
  assert.equal(visits.length, 1);
  assert.deepEqual(visits[0].summary_lines, ["주차 재확인 필요"]);
  assert.equal(visits[0].source_mtime, 124);
});

test("site visit index v2 prefers explicit management contact and migrates v1 stores", () => {
  const explicit = {
    ...state(),
    managementContact: { name: "관리사무소", phone: "0518191091", note: "평일 연락" }
  };
  const record = indexApi.recordFromPage(page(), explicit, { mtime: 123 });
  assert.deepEqual(record.management_contact, {
    name: "관리사무소",
    phone: "051-819-1091",
    note: "평일 연락"
  });

  const migrated = indexApi.migrateIndex({
    schema_version: 1,
    updated_at: null,
    records: {
      [record.source_path]: { ...record, management_contact: undefined }
    }
  });
  assert.equal(migrated.schema_version, 2);
  assert.equal(migrated.records[record.source_path].management_contact, null);
});

test("site visit index omits empty drafts and removes a prior projection without scanning", async () => {
  const app = fakeApp();
  await indexApi.syncRecord(app, page(), state(), { mtime: 123 });
  const empty = { ...state(), notes: [] };
  await indexApi.syncRecord(app, page(), empty, { mtime: 125 });

  const visits = await indexApi.readRegionVisits(app, "부산광역시-부산진구");
  assert.deepEqual(visits, []);
  const stored = JSON.parse(app.readStore());
  assert.deepEqual(stored.records, {});
});

test("explicit backfill parses existing state comments but Region reads only the persisted index", async () => {
  const content = [
    "---",
    "type: auction_case",
    "case_number: 2025타경2391(2)",
    "property_type: 오피스텔",
    "region_sido: 부산광역시",
    "region_sigungu: 부산진구",
    "region_dong: 전포동",
    "address: 부산광역시 부산진구 전포대로 186, 목연정엠팰리스 15층 1503호",
    "---",
    "# 현장 방문",
    "<!-- PRODIGY_SITE_VISIT_STATE",
    `v1:${encodeURIComponent(JSON.stringify(state()))}`,
    "-->"
  ].join("\n");
  const record = indexApi.recordFromContent(page().file.path, content, { mtime: 123 });
  assert.equal(record.region_key, "부산광역시-부산진구");
  assert.equal(record.source_path, page().file.path);
});
