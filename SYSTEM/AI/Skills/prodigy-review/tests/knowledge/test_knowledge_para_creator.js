"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// In-memory Obsidian vault fake. Records every create/createFolder so tests
// can prove exactly what was (and was not) written.
function makeFakeApp(existing) {
  const files = new Map();
  (existing || []).forEach((p) => files.set(p, ""));
  const created = [];
  const folders = [];
  return {
    created,
    folders,
    files,
    vault: {
      getAbstractFileByPath: (p) => (files.has(p) ? { path: p } : null),
      create: async (p, content) => {
        files.set(p, content);
        created.push({ path: p, content });
        return { path: p };
      },
      createFolder: async (p) => {
        folders.push(p);
        files.set(p, "");
        return { path: p };
      },
      read: async (p) => files.get(p) || ""
    },
    workspace: {
      openLinkText: async () => {},
      getLeaf: () => ({ openFile: async () => {} })
    }
  };
}

async function main() {
  const service = load("SYSTEM/Views/para-object-creator-service.js");
  load("SYSTEM/Views/object-creator-core.js");
  const core = globalThis.ObjectCreatorCore;
  assert.ok(service, "ParaObjectCreatorService must load");
  assert.ok(core, "ObjectCreatorCore must load");

  // --- Action surface: Area, Documentation, Literature, Project (no generic resource) ---
  const ids = service.ACTIONS.map((a) => a.id);
  assert.deepEqual(ids.slice().sort(), ["area", "documentation", "literature", "project"]);
  assert.ok(!ids.includes("resource"), "must NOT expose a generic resource type");
  // Only Area and Documentation are written by this service.
  assert.deepEqual(
    service.ACTIONS.filter((a) => a.writes).map((a) => a.id).sort(),
    ["area", "documentation"]
  );

  // --- Exact paths and types ---
  assert.equal(service.AREA_FOLDER, "PARA/AREAS");
  assert.equal(service.DOCUMENTATION_FOLDER, "PARA/RESOURCES/DOCUMENTATIONS");

  // Area: PARA/AREAS/<Name>/2. <Name>.md, type area_family
  {
    const app = makeFakeApp();
    const res = await service.createArea(app, "  Autonomous Vehicle AI Ethics  ");
    assert.equal(res.ok, true);
    assert.equal(res.type, "area_family");
    assert.equal(res.path, "PARA/AREAS/Autonomous Vehicle AI Ethics/2. Autonomous Vehicle AI Ethics.md");
    assert.equal(app.created.length, 1, "exactly one file written");
    assert.match(app.created[0].content, /^type: area_family$/m);
    assert.match(app.created[0].content, /^area: Autonomous Vehicle AI Ethics$/m);
    assert.ok(app.folders.includes("PARA/AREAS/Autonomous Vehicle AI Ethics"), "area folder created");
  }

  // Documentation: PARA/RESOURCES/DOCUMENTATIONS/<Name>.md, type documentation_note
  {
    const app = makeFakeApp();
    const res = await service.createDocumentation(app, "Safety Protocols");
    assert.equal(res.ok, true);
    assert.equal(res.type, "documentation_note");
    assert.equal(res.path, "PARA/RESOURCES/DOCUMENTATIONS/Safety Protocols.md");
    assert.equal(app.created.length, 1, "exactly one file written");
    assert.match(app.created[0].content, /^type: documentation_note$/m);
    assert.equal(app.folders.length, 0, "documentation needs no new folder");
  }

  // --- Both entry points use the SAME service (zero duplicate writer) ---
  // The Object Creator core must route area/documentation through ParaObjectCreatorService,
  // not reimplement the write. Prove by source inspection + behavior.
  const coreSrc = read("SYSTEM/Views/object-creator-core.js");
  assert.match(coreSrc, /ParaObjectCreatorService/, "core references shared service");
  assert.match(coreSrc, /para\.createArea/, "core delegates Area to service");
  assert.match(coreSrc, /para\.createDocumentation/, "core delegates Documentation to service");
  // Core must not itself build area/documentation frontmatter (no duplicate persistence).
  assert.ok(!/type: area_family/.test(coreSrc), "core must not write area frontmatter directly");
  assert.ok(!/type: documentation_note/.test(coreSrc), "core must not write documentation frontmatter directly");

  // Behavioral proof: core.launchExistingCreator("area") writes via the service path.
  {
    const app = makeFakeApp();
    const res = await core.launchExistingCreator(app, "area", "Green Data Center Initiative");
    assert.equal(res.ok, true);
    assert.equal(res.path, "PARA/AREAS/Green Data Center Initiative/2. Green Data Center Initiative.md");
    assert.equal(app.created.length, 1);
    assert.match(app.created[0].content, /^type: area_family$/m);
  }
  {
    const app = makeFakeApp();
    const res = await core.launchExistingCreator(app, "documentation", "Transparency Strategies");
    assert.equal(res.ok, true);
    assert.equal(res.path, "PARA/RESOURCES/DOCUMENTATIONS/Transparency Strategies.md");
    assert.equal(app.created.length, 1);
    assert.match(app.created[0].content, /^type: documentation_note$/m);
  }

  // --- Delegation boundaries: Literature and Project are NOT written here ---
  {
    let wizardOpened = null;
    const prevWizard = globalThis.openProjectWizard;
    globalThis.openProjectWizard = (opts) => { wizardOpened = opts; };
    try {
      const app = makeFakeApp();
      const res = await service.executeAction("project", app, "Auction Calendar MVP");
      assert.equal(res.ok, true);
      assert.equal(res.deferred, true, "project is delegated, not written");
      assert.equal(app.created.length, 0, "project writes nothing via this service");
      assert.ok(wizardOpened, "project wizard opened");
      assert.equal(wizardOpened.initialProjectName, "Auction Calendar MVP");
    } finally {
      globalThis.openProjectWizard = prevWizard;
    }
  }
  {
    // Literature delegates to existing knowledge authoring; writes nothing here.
    const app = makeFakeApp();
    const res = await service.executeAction("literature", app, "Some Paper");
    assert.equal(res.ok, true);
    assert.equal(res.deferred, true, "literature is delegated, not written");
    assert.equal(app.created.length, 0, "literature writes nothing via this service");
  }

  // --- Reading handoff opens a prefilled manual modal, never auto-search ---
  {
    const app = makeFakeApp();
    let opened = false;
    const prevRBC = globalThis.ReadingBookCreate;
    globalThis.ReadingBookCreate = { open: () => { opened = true; } };
    try {
      const res = await service.executeAction("reading", app, "Atomic Habits");
      assert.equal(res.ok, true);
      assert.equal(res.deferred, true);
      assert.equal(opened, true, "reading manual modal opened");
      assert.equal(app.created.length, 0, "reading handoff writes nothing here");
    } finally {
      globalThis.ReadingBookCreate = prevRBC;
    }
    // Service source must not call the search-based reader.
    const svcSrc = read("SYSTEM/Views/para-object-creator-service.js");
    assert.ok(!/createReadingObject\(/.test(svcSrc), "no auto-search Reading");
    assert.match(svcSrc, /ReadingBookCreate/, "reading handoff uses ReadingBookCreate");
  }

  // --- Failure preservation: collision and invalid title write nothing ---
  {
    // Collision: existing area file → throw, no new write.
    const app = makeFakeApp(["PARA/AREAS/Dup Area/2. Dup Area.md"]);
    await assert.rejects(
      () => service.createArea(app, "Dup Area"),
      /이미 존재하는 영역/
    );
    assert.equal(app.created.length, 0, "collision writes nothing");
  }
  {
    const app = makeFakeApp(["PARA/RESOURCES/DOCUMENTATIONS/Dup Doc.md"]);
    await assert.rejects(
      () => service.createDocumentation(app, "Dup Doc"),
      /이미 존재하는 문서/
    );
    assert.equal(app.created.length, 0, "collision writes nothing");
  }
  {
    // Invalid (empty) title → throw, no write, input preserved (nothing mutated).
    const app = makeFakeApp();
    await assert.rejects(() => service.createArea(app, "   "), /제목을 입력해 주세요/);
    await assert.rejects(() => service.createDocumentation(app, ""), /제목을 입력해 주세요/);
    assert.equal(app.created.length, 0, "invalid title writes nothing");
  }
  {
    // Unknown action → throw.
    const app = makeFakeApp();
    await assert.rejects(() => service.executeAction("resource", app, "x"), /알 수 없는 PARA 액션/);
    assert.equal(app.created.length, 0);
  }

  // --- Empty state: PARA projection reports no connected knowledge (fail-closed) ---
  const projection = load("SYSTEM/Views/knowledge-para-projection.js");
  {
    const model = projection.projectParaKnowledge([], []);
    assert.equal(model.total_links, 0);
    assert.equal(model.total_sources, 0);
    assert.equal(model.links.length, 0);
  }
  {
    // A knowledge record with NO connections must not appear (fail-closed).
    const records = [{ path: "ZETA/PERMANENT/Note A.md", type: "knowledge", title: "Note A" }];
    const model = projection.projectParaKnowledge(records, []);
    assert.equal(model.total_knowledge, 1, "knowledge indexed");
    assert.equal(model.total_links, 0, "no connections → no links");
  }
  {
    // Candidate / literature_note / venue / auction_region are NOT verified knowledge.
    const records = [
      { path: "ZETA/CANDIDATE/c.md", type: "knowledge_candidate", title: "C" },
      { path: "ZETA/LITERATURE/l.md", type: "literature_note", title: "L" },
      { path: "PARA/RESOURCES/VENUES/v.md", type: "venue", title: "V" },
      { path: "PARA/PROJECTS/Auction/r.md", type: "auction_region", title: "R" }
    ];
    const model = projection.projectParaKnowledge(records, []);
    assert.equal(model.total_knowledge, 0, "non-verified types excluded from knowledge index");
  }
  {
    // A verified knowledge note explicitly connected from a Project IS surfaced.
    const records = [{ path: "ZETA/PERMANENT/Note A.md", type: "knowledge", title: "Note A" }];
    const relations = [{
      path: "PARA/PROJECTS/Proj/2. Proj.md",
      type: "project",
      title: "Proj",
      connections: ["[[Note A]]"]
    }];
    const model = projection.projectParaKnowledge(records, relations);
    assert.equal(model.total_links, 1);
    assert.equal(model.links[0].knowledge_path, "ZETA/PERMANENT/Note A");
    assert.equal(model.links[0].source_type, "project");
    assert.deepEqual(model.source_type_counts, { project: 1 });
    assert.deepEqual(model.link_counts.by_source, { "PARA/PROJECTS/Proj/2. Proj.md": 1 });
    assert.equal(projection.getSourceDetail(model, "PARA/PROJECTS/Proj/2. Proj.md").link_count, 1);
  }

  // --- PARA view exposes actions + empty-state rendering ---
  const viewSrc = read("SYSTEM/Views/knowledge-para-view.js");
  assert.match(viewSrc, /knowledge-para-search/, "view renders PARA search");
  assert.match(viewSrc, /knowledge-para-source-filter/, "view renders source filter");
  assert.match(viewSrc, /knowledge-para-selected-detail/, "view renders selected detail");
  assert.match(viewSrc, /renderParaActions/, "view renders PARA creator actions");
  assert.match(viewSrc, /ParaObjectCreatorService/, "view uses shared service");
  assert.match(viewSrc, /연결된 지식 없음/, "view has fail-closed empty state");

  // --- HUB wiring loads the service and passes app to the PARA view ---
  const hub = read("HUB/50 Knowledge.md");
  assert.match(hub, /para-object-creator-service\.js/, "hub loads the shared service");
  // Service must load before the view that consumes it.
  assert.ok(
    hub.indexOf("para-object-creator-service.js") < hub.indexOf("knowledge-para-view.js"),
    "service loads before para view"
  );

  // --- Zero duplicate writer guarantee across the whole owned surface ---
  // Exactly one module builds area_family frontmatter; exactly one builds documentation_note.
  const ownedWriters = [
    "SYSTEM/Views/para-object-creator-service.js",
    "SYSTEM/Views/object-creator-core.js",
    "SYSTEM/Views/knowledge-para-view.js"
  ].map(read);
  const areaWriters = ownedWriters.filter((s) => /type: area_family/.test(s)).length;
  const docWriters = ownedWriters.filter((s) => /type: documentation_note/.test(s)).length;
  assert.equal(areaWriters, 1, "exactly one area_family writer");
  assert.equal(docWriters, 1, "exactly one documentation_note writer");

  console.log("Knowledge PARA creator tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
