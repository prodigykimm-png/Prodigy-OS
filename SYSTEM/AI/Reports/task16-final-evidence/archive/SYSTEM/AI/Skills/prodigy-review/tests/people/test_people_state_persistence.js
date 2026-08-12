"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB_PATH = path.join(ROOT, "HUB/60 Personal.md");
const CORE_PATH = path.join(ROOT, "SYSTEM/Views/people-core.js");
const VIEW_PATH = path.join(ROOT, "SYSTEM/Views/people-view.js");

function hubSource() {
  return fs.readFileSync(HUB_PATH, "utf8");
}

test("Given Dataview re-runs the Personal block after an index change, When it re-renders, Then the hub restores query, filter, and sort from a durable store instead of resetting", () => {
  const hub = hubSource();

  assert.match(hub, /PeopleCore\.readWorkspaceState|readWorkspaceState/, "허브가 지속 상태를 읽어야 한다");
  assert.match(hub, /PeopleCore\.writeWorkspaceState|writeWorkspaceState/, "허브가 상태 변경을 저장해야 한다");
});

test("Given the persisted state contract, When it round-trips, Then query, filter, sort, and selectedPath survive and unknown keys are dropped", () => {
  delete require.cache[require.resolve(CORE_PATH)];
  const core = require(CORE_PATH);

  assert.equal(typeof core.readWorkspaceState, "function");
  assert.equal(typeof core.writeWorkspaceState, "function");

  const store = new Map();
  const storage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); }
  };

  core.writeWorkspaceState(storage, {
    query: "강은지",
    filter: "friend",
    sort: "name_desc",
    selectedPath: "PARA/RESOURCES/CONTACTS/강은지.md",
    injected: "should-not-survive"
  });

  const restored = core.readWorkspaceState(storage);
  assert.equal(restored.query, "강은지");
  assert.equal(restored.filter, "friend");
  assert.equal(restored.sort, "name_desc");
  assert.equal(restored.selectedPath, "PARA/RESOURCES/CONTACTS/강은지.md");
  assert.equal("injected" in restored, false, "허용 목록 밖 키가 통과하면 안 된다");
});

test("Given a corrupt or absent persisted payload, When the hub reads it, Then it falls back to defaults without throwing", () => {
  delete require.cache[require.resolve(CORE_PATH)];
  const core = require(CORE_PATH);

  const broken = {
    getItem() { return "{not json"; },
    setItem() {},
    removeItem() {}
  };
  const empty = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };

  for (const storage of [broken, empty, null, undefined]) {
    const restored = core.readWorkspaceState(storage);
    assert.equal(restored.query, "");
    assert.equal(restored.filter, "all");
    assert.equal(restored.sort, "name_asc");
    assert.equal(restored.selectedPath, "");
  }
});

test("Given Dataview reruns the block after an index change, When nothing the user cares about changed, Then the hub skips the repaint instead of rebuilding the DOM", () => {
  const hub = hubSource();

  const reuseDecision = hub.indexOf("canReuseWorkspace");
  const firstRootClear = hub.indexOf("rootEl.empty()");

  assert.ok(reuseDecision >= 0, "허브가 기존 Personal DOM/API 재사용 여부를 판단해야 한다");
  assert.ok(firstRootClear > reuseDecision, "기존 DOM을 비우기 전에 재사용 여부를 먼저 판단해야 한다");
  assert.match(hub, /guard\.shellElement/, "재실행 사이에 기존 App Shell DOM을 보관해야 한다");
  assert.match(hub, /rootEl\.appendChild\(guard\.shellElement\)/, "Dataview가 컨테이너를 교체해도 기존 App Shell을 재부착해야 한다");
  assert.match(hub, /guard\.workspaceApi/, "검색·필터 상태를 가진 기존 workspace API를 재사용해야 한다");
  assert.match(hub, /fingerprint|signature/i, "무엇이 바뀌었는지 비교할 지표가 있어야 한다");
});

test("Given a persisted Personal search, When the workspace is rebuilt after a Dataview refresh, Then the visible search field restores the query", () => {
  const view = fs.readFileSync(VIEW_PATH, "utf8");

  assert.match(
    view,
    /searchInput\.value\s*=\s*state\.query/,
    "검색 모델만 복원하고 입력창 값을 비워 두면 사용자는 첫 화면으로 초기화됐다고 보게 된다"
  );
});

test("Given a people fingerprint, When the underlying data is unchanged, Then the computed signature is stable and changes only with real edits", () => {
  delete require.cache[require.resolve(CORE_PATH)];
  const core = require(CORE_PATH);

  assert.equal(typeof core.peopleFingerprint, "function");

  const a = [{ path: "b.md", name: "김나래", body: "메모" }, { path: "a.md", name: "강은지", body: "" }];
  const sameUnordered = [{ path: "a.md", name: "강은지", body: "" }, { path: "b.md", name: "김나래", body: "메모" }];
  const edited = [{ path: "a.md", name: "강은지", body: "" }, { path: "b.md", name: "김나래", body: "메모 수정" }];

  assert.equal(core.peopleFingerprint(a), core.peopleFingerprint(sameUnordered), "순서만 다른 동일 데이터는 같은 지문이어야 한다");
  assert.notEqual(core.peopleFingerprint(a), core.peopleFingerprint(edited), "본문이 바뀌면 지문이 달라져야 한다");
  assert.equal(core.peopleFingerprint([]), core.peopleFingerprint([]));
  assert.equal(typeof core.peopleFingerprint(null), "string");
});
