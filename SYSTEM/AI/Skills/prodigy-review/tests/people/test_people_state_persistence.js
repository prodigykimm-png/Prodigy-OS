"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB_PATH = path.join(ROOT, "HUB/60 Personal.md");
const CORE_PATH = path.join(ROOT, "SYSTEM/Views/people-core.js");

function hubSource() {
  return fs.readFileSync(HUB_PATH, "utf8");
}

test("Given Dataview re-runs the Personal block on its refresh interval, When it re-renders, Then the hub restores query, filter, and sort from a durable store instead of resetting", () => {
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

test("Given Dataview reruns the block every 2.5s, When nothing the user cares about changed, Then the hub skips the repaint instead of rebuilding the DOM", () => {
  const hub = hubSource();

  assert.match(hub, /shouldSkipRepaint|__prodigyPersonalRenderGuard/, "허브가 불필요한 재렌더를 건너뛰는 가드를 가져야 한다");
  assert.match(hub, /fingerprint|signature/i, "무엇이 바뀌었는지 비교할 지표가 있어야 한다");
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
