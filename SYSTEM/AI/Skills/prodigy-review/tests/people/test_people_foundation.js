"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/people-core.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/people-store.js"));

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  // --- Canonical constants ---
  assert.equal(core.CANONICAL_TYPE, "people");
  assert.equal(core.LEGACY_TYPE, "contact");
  assert.equal(core.PEOPLE_FOLDER, "PARA/RESOURCES/CONTACTS");
  assert.equal(core.PEOPLE_TEMPLATE, "SYSTEM/TEMPLATE/FORMAT/template_people.md");
  assert.equal(core.DISPLAY_LABEL, "사람");
  assert.equal(core.LINK_FIELD, "connections");

  // --- Type helpers ---
  assert.equal(core.isPeopleType("people"), true);
  assert.equal(core.isPeopleType("contact"), false);
  assert.equal(core.isLegacyContactType("contact"), true);
  assert.equal(core.isPeopleOrLegacy("people"), true);
  assert.equal(core.isPeopleOrLegacy("contact"), true);
  assert.equal(core.classifyPeopleType("contact"), "legacy_contact");
  assert.equal(core.classifyPeopleType("people"), "people");

  // --- Path / name ---
  assert.equal(core.peoplePath("홍길동"), "PARA/RESOURCES/CONTACTS/홍길동.md");
  assert.equal(core.safeName("  A / B  "), "A B");
  assert.throws(() => core.safeName(""), /이름/);
  assert.throws(
    () => core.resolveCreatePath("홍길동", ["PARA/RESOURCES/CONTACTS/홍길동.md"]),
    /이미 있습니다/
  );
  assert.equal(
    core.resolveCreatePath("홍길동", ["PARA/RESOURCES/CONTACTS/다른사람.md"]),
    "PARA/RESOURCES/CONTACTS/홍길동.md"
  );

  // --- Template produces people, never contact ---
  const template = read("SYSTEM/TEMPLATE/FORMAT/template_people.md");
  assert.match(template, /^type:\s*people\s*$/m);
  assert.equal(/type:\s*contact\b/i.test(template), false);
  assert.match(template, /# 관계/);
  assert.match(template, /# 핵심 상호작용/);
  assert.match(template, /# 연결된 Object/);
  assert.match(template, /connections/);
  assert.match(template, /dataview/i);

  const rendered = core.renderPeopleContent(template, "테스트 인물");
  assert.match(rendered, /^type:\s*people\s*$/m);
  assert.equal(/type:\s*contact\b/i.test(rendered), false);
  assert.match(rendered, /# 테스트 인물/);

  // Stale contact template forced to people
  const forced = core.renderPeopleContent("---\ntype: contact\nstatus: active\n---\n\n# \n", "강제");
  assert.match(forced, /type:\s*people/);
  assert.equal(/type:\s*contact\b/i.test(forced), false);

  // --- Display registry ---
  const registry = read("SYSTEM/Views/display-registry.js");
  assert.match(registry, /people:\s*Object\.freeze\(\{\s*label:\s*"사람"/);
  assert.match(registry, /contact:\s*Object\.freeze\(\{\s*label:\s*"사람"/);
  assert.match(registry, /relationship:\s*"관계"/);
  assert.match(registry, /last_contact:\s*"최근 연락"/);

  // Runtime display mapping
  global.window = {};
  // eslint-disable-next-line no-eval
  eval(registry);
  assert.equal(global.window.prodigyDisplay.type("people"), "사람");
  assert.equal(global.window.prodigyDisplay.type("contact"), "사람");
  assert.equal(global.window.prodigyDisplay.property("relationship"), "관계");

  // --- Cross-object linking field on templates ---
  for (const file of [
    "SYSTEM/TEMPLATE/FORMAT/template_project.md",
    "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md",
    "SYSTEM/TEMPLATE/FORMAT/template_reading.md",
    "SYSTEM/TEMPLATE/FORMAT/template_daily_note.md"
  ]) {
    assert.match(read(file), /connections/, `${file} should declare connections`);
  }

  // --- Linked object discovery (pure) ---
  const groups = core.discoverLinkedObjects([
    {
      path: "PARA/PROJECTS/운송예산.md",
      type: "project",
      title: "운송예산",
      connections: ["[[테스트 인물]]"]
    },
    {
      path: "DAILY/DAILY/2026-07-10.md",
      type: "journal",
      title: "2026-07-10",
      body: "오늘 [[테스트 인물]] 과 통화"
    },
    {
      path: "PARA/PROJECTS/Auction/a.md",
      type: "auction_case",
      title: "김포",
      outlinks: ["PARA/RESOURCES/CONTACTS/테스트 인물.md"]
    },
    {
      path: "PARA/PROJECTS/Reading/book.md",
      type: "reading",
      title: "책",
      connections: " unrelated "
    }
  ], { path: "PARA/RESOURCES/CONTACTS/테스트 인물.md", name: "테스트 인물" });

  assert.equal(groups.project.length, 1);
  assert.equal(groups.journal.length, 1);
  assert.equal(groups.auction_case.length, 1);
  assert.equal(groups.reading.length, 0);

  // --- Create path (fake vault) ---
  const created = [];
  const fakeApp = {
    vault: {
      getFiles: () => [],
      getAbstractFileByPath: (p) => {
        if (p === core.PEOPLE_TEMPLATE) return { path: p };
        return null;
      },
      read: async () => template,
      createFolder: async () => {},
      create: async (p, content) => {
        created.push({ path: p, content });
        return { path: p };
      }
    }
  };

  return store.createPeople(fakeApp, "새 사람").then((result) => {
    assert.equal(result.path, "PARA/RESOURCES/CONTACTS/새 사람.md");
    assert.match(result.content, /type:\s*people/);
    assert.equal(/type:\s*contact\b/i.test(result.content), false);
    assert.equal(created.length, 1);

    // Duplicate protection
    const fakeAppDup = {
      vault: {
        getFiles: () => [{ path: "PARA/RESOURCES/CONTACTS/새 사람.md" }],
        getAbstractFileByPath: (p) => (p === core.PEOPLE_TEMPLATE ? { path: p } : null),
        read: async () => template,
        createFolder: async () => {},
        create: async () => { throw new Error("should not create"); }
      }
    };
    return store.createPeople(fakeAppDup, "새 사람").then(
      () => { throw new Error("expected duplicate error"); },
      (err) => { assert.match(String(err.message), /이미 있습니다/); }
    );
  }).then(() => {
    // --- Personal hub ---
    const personal = read("HUB/60 Personal.md");
    assert.match(personal, /people-core\.js/);
    assert.match(personal, /people-store\.js/);
    assert.match(personal, /people-view\.js/);
    assert.match(personal, /type === "people" \|\| p\.type === "contact"/);
    assert.match(personal, /사람 추가/);
    assert.match(personal, /openCreateFlow/);
    assert.equal(personal.includes("dv.table"), false);

    // --- QuickAdd ---
    const quickadd = read(".obsidian/plugins/quickadd/data.json");
    assert.match(quickadd, /사람 추가/);
    assert.match(quickadd, /template_people\.md/);
    assert.match(quickadd, /PARA\/RESOURCES\/CONTACTS/);
    assert.equal(quickadd.includes("Create Contact"), false);

    // --- Lifecycle treats people as non-operational ---
    const lifecycle = read("SYSTEM/Views/object-lifecycle-core.js");
    assert.match(lifecycle, /"people"/);
    assert.match(lifecycle, /"contact"/);

    // --- Schema / docs mention people ---
    const schema = read("SYSTEM/Prodigy/Schema/Core_Property_Schema.md");
    assert.match(schema, /`people`/);
    assert.match(schema, /contact.*레거시|레거시.*contact/);

    const objectModel = read("SYSTEM/docs/03_Object_Model.md");
    assert.match(objectModel, /People/);

    const guide = read("SYSTEM/docs/11_Operating_Guide.md");
    assert.match(guide, /People \(사람\)/);
    assert.match(guide, /type: `people`|type: people|`people`/);

    // No accidental people dashboard / timeline / follow-up product
    assert.equal(fs.existsSync(path.join(ROOT, "HUB/65 People.md")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "SYSTEM/Views/people-dashboard.js")), false);

    console.log("People foundation tests passed");
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
