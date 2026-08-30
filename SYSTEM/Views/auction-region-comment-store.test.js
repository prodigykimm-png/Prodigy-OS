"use strict";

const assert = require("node:assert/strict");
const store = require("./auction-region-comment-store.js");

const first = {
  id: "comment-1",
  region_key: "부산광역시-북구",
  comment: "구포역 방향은 철도와 간선도로 접면을 함께 본다.",
  created_at: "2026-08-30T13:30:00.000Z",
  source_case_path: "PARA/PROJECTS/Auction/부산-2025타경101214.md"
};
const second = {
  id: "comment-2",
  region_key: "부산광역시-북구",
  scope: "admin_dong",
  admin_dong: "구포2동",
  comment: "같은 북구라도 화명권과 구포권은 생활권을 나눠 본다.",
  created_at: "2026-08-30T13:31:00.000Z",
  source_case_path: "PARA/PROJECTS/Auction/부산-2025타경5458.md"
};
const other = {
  id: "comment-3",
  region_key: "부산광역시-사하구",
  comment: "사하구 코멘트",
  created_at: "2026-08-30T13:32:00.000Z",
  source_case_path: "PARA/PROJECTS/Auction/부산-2025타경758.md"
};

let data = store.emptyStore();
data = store.appendComment(data, first);
data = store.appendComment(data, second);
data = store.appendComment(data, other);
assert.equal(data.comments.length, 3);
assert.deepEqual(store.commentsForRegion(data, "부산광역시-북구").map((item) => item.id), ["comment-1"]);
assert.deepEqual(store.commentsForScope(data, "부산광역시-북구", "admin_dong", "구포2동").map((item) => item.id), ["comment-2"]);
assert.deepEqual(store.commentsForScope(data, "부산광역시-북구", "admin_dong", "구포1동"), []);
assert.deepEqual(store.commentsForRegion(data, "부산광역시-사하구").map((item) => item.id), ["comment-3"]);
assert.equal(store.appendComment(data, first), data, "같은 id는 중복 저장하지 않는다");
const migrated = store.migrateStore({ schema_version: 1, comments: [{ ...first }] });
assert.equal(migrated.schema_version, 2);
assert.equal(migrated.comments[0].scope, "sigungu");
assert.equal(migrated.comments[0].admin_dong, null);
assert.throws(() => store.normalizeComment({ ...first, scope: "admin_dong", admin_dong: "" }), /행정동/);
assert.throws(() => store.normalizeComment({ ...first, comment: "" }), /입력하세요/);
assert.throws(() => store.normalizeComment({ ...first, region_key: "북구" }), /식별자/);
assert.throws(() => store.normalizeComment({ ...first, source_case_path: "bad\npath" }), /경로/);

(async () => {
  const files = new Map([[store.STORE_PATH, JSON.stringify({ schema_version: 1, comments: [{ ...first }] })]]);
  const file = { path: store.STORE_PATH };
  const app = { vault: {
    getAbstractFileByPath: (path) => files.has(path) ? file : null,
    read: async () => files.get(store.STORE_PATH),
    create: async (path, content) => { files.set(path, content); return file; },
    process: async (_file, callback) => { files.set(store.STORE_PATH, callback(files.get(store.STORE_PATH))); }
  } };
  const saved = await store.saveComment(app, second);
  assert.equal(saved.id, "comment-2");
  const duplicate = await store.saveComment(app, second);
  assert.equal(duplicate.id, "comment-2", "중복 id 저장도 해당 코멘트를 반환한다");
  const persisted = JSON.parse(files.get(store.STORE_PATH));
  assert.equal(persisted.schema_version, 2);
  assert.equal(persisted.comments.length, 2);
  assert.equal(persisted.comments[0].scope, "sigungu");
  assert.equal((await store.readScopedComments(app, "부산광역시-북구", "admin_dong", "구포2동"))[0].id, "comment-2");
  console.log("auction region comment store tests: PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
