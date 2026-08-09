"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../..");
const store = require(path.join(ROOT, "SYSTEM/Views/venue-store.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/venue-view.js"));
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");

function venue(overrides = {}) {
  return {
    type: "venue",
    path: "PARA/RESOURCES/Venues/서울 카페.md",
    title: "서울 카페",
    venue_category: "cafe",
    address: "서울 강남구",
    connections: ["[[ZETA/PERMANENT/재사용 지식]]"],
    body: "## 소개\n조용한 작업 공간\n\n## 메모\n예약 필요",
    journalLinks: ["DAILY/DAILY/2026-07-20.md"],
    updated: "2026-07-20T09:00:00Z",
    ...overrides
  };
}

function walk(node, predicate, result = []) {
  if (!node) return result;
  if (predicate(node)) result.push(node);
  (node.children || []).forEach((child) => walk(child, predicate, result));
  return result;
}

function testVenueModel() {
  const input = [
    venue(),
    venue({
      path: "PARA/RESOURCES/Venues/산책 공원.md",
      title: "산책 공원",
      venue_category: "park",
      address: "서울 마포구",
      connections: [],
      body: "## 방문 정보\n주말 방문",
      journalLinks: [],
      updated: "2026-07-19T09:00:00Z"
    }),
    { type: "people", path: "PARA/RESOURCES/CONTACTS/누군가.md", title: "누군가" }
  ];
  const before = JSON.stringify(input);
  const model = store.buildVenueWorkspaceModel(input, {});

  assert.equal(model.total, 2);
  assert.equal(model.shown, 2);
  assert.deepEqual(model.counts.connections, { all: 2, connected: 1, unconnected: 1 });
  assert.deepEqual(model.counts.journals, { all: 2, with_journal: 1, without_journal: 1 });
  assert.equal(model.venues[0].title, "산책 공원");
  assert.equal(JSON.stringify(input), before, "workspace projection must not mutate input");

  const searched = store.buildVenueWorkspaceModel(input, { query: "강남" });
  assert.equal(searched.shown, 1);
  assert.equal(searched.venues[0].title, "서울 카페");
  const connected = store.buildVenueWorkspaceModel(input, { connection: "connected" });
  assert.deepEqual(connected.venues.map((item) => item.title), ["서울 카페"]);
  const noMatch = store.buildVenueWorkspaceModel(input, { query: "없는 장소" });
  assert.equal(noMatch.no_match, true);
  assert.match(noMatch.empty_hint, /일치하는 장소/);

  const recent = store.buildVenueWorkspaceModel(input, { sort: "recent" });
  assert.equal(recent.venues[0].title, "서울 카페");
  assert.notEqual(store.venueFingerprint(input), store.venueFingerprint(input.concat(venue({
    path: "PARA/RESOURCES/Venues/새 장소.md",
    title: "새 장소"
  }))));
}

function testVenueViewWorkspace() {
  const container = new FakeElement("section");
  const api = view.renderVenuesWorkspace({ container, items: [venue()] });
  assert.ok(api);
  assert.match(collectText(container), /장소|이름·분류·주소·본문·연결 검색|서울 카페/);
  assert.equal(walk(container, (node) => node.attr && node.attr["aria-label"] === "장소 검색").length, 1);
  assert.equal(walk(container, (node) => node.attr && node.attr["aria-label"] === "장소 분류 필터").length, 1);
  assert.equal(api.getModel().total, 1);
  api.selectVenue("PARA/RESOURCES/Venues/서울 카페.md");
  assert.match(collectText(container), /조용한 작업 공간|관련 저널|연결된 Object/);
  api.setData([venue({ title: "변경된 장소", path: "PARA/RESOURCES/Venues/변경된 장소.md" })]);
  assert.match(collectText(container), /변경된 장소/);
}
function testRelatedJournalMatching() {
  const files = [
    { path: "DAILY/DAILY/2026-07-20.md" },
    { path: "DAILY/DAILY/2026-07-21.md" },
    { path: "DAILY/DAILY/2026-07-22.md" },
    { path: "DAILY/DAILY/2026-07-23.md" }
  ];
  const cache = {
    [files[0].path]: { links: [{ path: "PARA/RESOURCES/Venues/서울 카페" }] },
    [files[1].path]: { frontmatter: { connections: ["[[서울 카페]]"] } },
    [files[2].path]: { links: [{ path: "PARA/RESOURCES/Venues/서울 카페 별관" }] },
    [files[3].path]: { frontmatter: { connections: ["[[다른 서울 카페]]"] } }
  };
  const app = {
    vault: { getFiles: () => files },
    metadataCache: { getFileCache: (file) => cache[file.path] }
  };
  assert.deepEqual(
    view.collectRelatedJournals(app, "PARA/RESOURCES/Venues/서울 카페.md"),
    [files[0].path, files[1].path]
  );
}

async function testVenueWriteBoundary() {
  const app = {
    vault: {
      getAbstractFileByPath: (filePath) => ({ path: filePath }),
      read: async () => "---\ntype: people\n---\n"
    },
    metadataCache: { getFileCache: () => ({ frontmatter: { type: "people" } }) }
  };
  await assert.rejects(
    () => store.updateVenueProperties(app, "PARA/RESOURCES/CONTACTS/not-a-venue.md", { address: "x" }),
    /Venues 폴더/
  );
  await assert.rejects(
    () => store.updateVenueProperties(app, "PARA/RESOURCES/Venues/not-a-venue.md", { address: "x" }),
    /type: venue/
  );
  await assert.rejects(
    () => store.deleteVenue(app, "PARA/RESOURCES/Venues/not-a-venue.md"),
    /type: venue/
  );
  await assert.rejects(
    () => store.buildVenuePreviewModel(app, "PARA/RESOURCES/Venues/not-a-venue.md"),
    /type: venue/
  );
}

async function main() {
  testVenueModel();
  testVenueViewWorkspace();
  testRelatedJournalMatching();
  await testVenueWriteBoundary();
  console.log("Venue workspace tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
