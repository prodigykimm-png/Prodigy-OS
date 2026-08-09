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

  // --- Quick-edit whitelist ---
  assert.deepEqual(core.QUICK_EDIT_FIELDS, [
    "relationship", "company", "role", "last_contact", "phone", "email"
  ]);
  // relationship = short category, not free narrative
  assert.ok(core.RELATIONSHIP_TYPES.includes("지인"));
  assert.ok(core.RELATIONSHIP_TYPES.includes("회사"));
  assert.equal(core.isKnownRelationshipType("지인"), true);
  assert.equal(core.isKnownRelationshipType("한국해양대학교 13학번 동기"), false);
  assert.equal(core.normalizeRelationshipType("  학교  "), "학교");
  const picked = core.pickQuickEditValues({
    type: "people",
    relationship: "회사",
    company: "Acme",
    title: "CTO",
    notes: "should not appear",
    next_action: "no"
  });
  assert.equal(picked.relationship, "회사");
  assert.equal(picked.company, "Acme");
  assert.equal(picked.role, "CTO");
  assert.equal(Object.prototype.hasOwnProperty.call(picked, "notes"), false);
  const merged = core.applyQuickEditValues(
    { type: "contact", company: "Old", relationship: "" },
    { company: "New", relationship: "친구", type: "people", status: "hacked" }
  );
  assert.equal(merged.type, "contact");
  assert.equal(merged.company, "New");
  assert.equal(merged.relationship, "친구");
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "status"), false);
  const sanitized = core.sanitizeQuickEditUpdates({ company: "X", type: "people", body: "no" });
  assert.deepEqual(Object.keys(sanitized).sort(), ["company"]);
  const sanRel = core.sanitizeQuickEditUpdates({ relationship: "  지인  " });
  assert.equal(sanRel.relationship, "지인");

  // --- Interaction / 사건 index lines ---
  assert.equal(
    core.formatInteractionLine({ date: "2026-07-16", insight: "전태현 청모" }),
    "- [[2026-07-16]] 전태현 청모"
  );
  assert.equal(
    core.formatInteractionLine({ date: "2026-07-16", source: "[[운송예산 회의]]", insight: "범위 먼저" }),
    "- 2026-07-16 | [[운송예산 회의]] | 범위 먼저"
  );
  assert.throws(() => core.formatInteractionLine({ date: "2026-07-16", insight: "" }), /한 줄/);
  const withSection = [
    "---",
    "type: people",
    "last_contact: ",
    "---",
    "",
    "# 정호성",
    "",
    "# 핵심 상호작용",
    "*인덱스만*",
    "- YYYY-MM-DD | [[원본 Object]] | ",
    "",
    "# 메모",
    "- "
  ].join("\n");
  const afterAppend = core.appendInteractionToContent(
    withSection,
    core.formatInteractionLine({ date: "2026-07-16", insight: "전태현 청모" })
  );
  assert.match(afterAppend, /- \[\[2026-07-16\]\] 전태현 청모/);
  assert.equal(/- YYYY-MM-DD/.test(afterAppend), false);
  const withLast = core.upsertLastContactInContent(afterAppend, "2026-07-16");
  assert.match(withLast, /last_contact:\s*2026-07-16/);

  // --- Memo lines go under # 메모, not interaction ---
  assert.equal(core.formatMemoLine({ text: "청모 통해 알게 됨" }), "- 청모 통해 알게 됨");
  assert.throws(() => core.formatMemoLine({ text: "" }), /메모/);
  const withMemoSection = [
    "---",
    "type: people",
    "---",
    "",
    "# 메모",
    "*사실 중심의 장기 맥락.*",
    "- ",
    "",
    "# 나의 성찰",
    "- "
  ].join("\n");
  const afterMemo = core.appendMemoToContent(
    withMemoSection,
    core.formatMemoLine({ text: "주말에만 연락 가능" })
  );
  assert.match(afterMemo, /# 메모[\s\S]*- 주말에만 연락 가능/);
  assert.match(afterMemo, /# 나의 성찰/);
  assert.equal(afterMemo.includes("# 핵심 상호작용"), false);

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
  // Person Object names never include honorifics / job titles
  assert.equal(core.safeName("최진웅 대표"), "최진웅");
  assert.equal(core.safeName("최진웅 대표님"), "최진웅");
  assert.equal(core.safeName("정호성님"), "정호성");
  assert.equal(core.safeName("Dr. Kim"), "Kim");
  assert.equal(core.stripPersonHonorifics("윤채연 씨"), "윤채연");
  // Nickname-like stump must not collapse to a single syllable
  assert.equal(core.safeName("김대리"), "김대리");
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
  const titleOnly = core.discoverLinkedObjects([
    { path: "PARA/PROJECTS/제목만.md", type: "project", title: "테스트 인물", connections: [], outlinks: [], body: "" }
  ], { path: "PARA/RESOURCES/CONTACTS/테스트 인물.md", name: "테스트 인물" });
  assert.equal(titleOnly.other.length, 0, "a page title alone is not an explicit People link");

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
  }).then(async () => {
    // --- Quick-edit read/update (fake vault + processFrontMatter) ---
    let fm = {
      type: "people",
      relationship: "동료",
      company: "OldCo",
      role: "",
      last_contact: "",
      phone: "",
      email: ""
    };
    const personPath = "PARA/RESOURCES/CONTACTS/편집대상.md";
    const editApp = {
      vault: {
        getAbstractFileByPath: (p) => (p === personPath ? { path: p } : null),
        read: async () => `---\ntype: people\nrelationship: 동료\ncompany: OldCo\nrole: \nlast_contact: \nphone: \nemail: \n---\n\n# 편집대상\n`
      },
      metadataCache: {
        getFileCache: () => ({ frontmatter: Object.assign({}, fm) })
      },
      fileManager: {
        processFrontMatter: async (_file, mutator) => {
          mutator(fm);
        }
      }
    };
    const before = await store.readPeopleProperties(editApp, personPath);
    assert.equal(before.values.company, "OldCo");
    const saved = await store.updatePeopleProperties(editApp, personPath, {
      company: "NewCo",
      relationship: "멘토",
      type: "contact",
      notes: "ignored"
    });
    assert.equal(saved.values.company, "NewCo");
    assert.equal(saved.values.relationship, "멘토");
    assert.equal(fm.type, "people");
    assert.equal(Object.prototype.hasOwnProperty.call(fm, "notes"), false);

    // --- Personal hub + People workspace ---
    const personal = read("HUB/60 Personal.md");
    assert.match(personal, /people-core\.js/);
    assert.match(personal, /people-store\.js/);
    assert.match(personal, /people-view\.js/);
    assert.match(personal, /PARA\/RESOURCES\/CONTACTS\//);
    assert.match(personal, /app\.vault\.getFiles/);
    assert.match(personal, /사람과 관계/);
    assert.match(personal, /renderPeopleWorkspace/);
    assert.match(personal, /buildPeopleWorkspaceModel/);
    assert.equal(personal.includes("dv.table"), false);
    assert.equal(personal.includes("원본 열기"), false);

    const listView = read("SYSTEM/Views/workspace-list-view.js");
    assert.match(listView, /item\.actions/);
    assert.match(listView, /workspace-list-row-actions/);
    assert.match(listView, /openBeside/);
    assert.match(listView, /workspace-list-name/);

    const peopleView = read("SYSTEM/Views/people-view.js");
    assert.match(peopleView, /openPersonPreview/);
    assert.match(peopleView, /openAddInteractionFlow/);
    assert.match(peopleView, /openAddMemoFlow/);
    assert.match(peopleView, /renderPeopleWorkspace/);
    assert.match(peopleView, /사람 추가/);
    assert.match(peopleView, /사건 추가/);
    assert.match(peopleView, /메모 추가/);
    assert.match(peopleView, /최근 맥락/);
    assert.match(peopleView, /ppw-context-toggle|나머지/);
    assert.match(peopleView, /ppw-memo|memo_preview/);
    assert.match(peopleView, /openRemoveMemoFlow|ppw-memo-del/);
    assert.match(peopleView, /openRemoveInteractionFlow|interaction_preview|ppw-events/);
    assert.match(peopleView, /showUndoToast|ppw-undo-toast/);
    assert.match(peopleView, /_renderListSection|ppw-edit-line-list/);
    assert.match(peopleView, /metaKey|ctrlKey|ArrowDown|focusPath|ppw-card-flash/);
    assert.match(peopleView, /본문 관계로 옮기기|ppw-ctx-type|검색 일치/);
    assert.match(read("SYSTEM/Views/people-core.js"), /extractMemoLines|extractInteractionLines/);
    assert.match(read("SYSTEM/Views/people-core.js"), /removeMemoLineFromContent|removeInteractionLineFromContent/);
    assert.match(read("SYSTEM/Views/people-core.js"), /attention|emptyFilterHint|filterContextItems/);
    assert.match(read("SYSTEM/Views/people-store.js"), /async function removeMemo|removeInteraction|rawLine/);
    assert.match(read("HUB/60 Personal.md"), /dv\.io\.load|getAbstractFileByPath/);
    assert.match(peopleView, /hydratePeopleBodies/);
    // Name opens popup; no separate 관계 / 빠른 수정 / 관련 기록 보기 card buttons
    assert.match(peopleView, /openPerson\(person\.path\)|openPersonPreview/);
    assert.equal(/btn\(actions, "관계"/.test(peopleView), false);
    assert.equal(/btn\(actions, "빠른 수정"/.test(peopleView), false);
    assert.equal(/btn\(actions, "관련 기록/.test(peopleView), false);
    assert.equal(/btn\(actions, "사람 열기"/.test(peopleView), false);
    assert.match(peopleView, /__prodigyPeopleSideLeaf|PEOPLE_SIDE_LEAF/);
    assert.match(peopleView, /isLeafStillOpen|openFile/);
    assert.match(peopleView, /QUICK_EDIT_FIELDS|relationship/);

    // appendKeyInteraction store path
    let body = withSection;
    const interactApp = {
      vault: {
        getAbstractFileByPath: (p) => (p === "PARA/RESOURCES/CONTACTS/정호성.md" ? { path: p } : null),
        read: async () => body,
        modify: async (_f, next) => { body = next; }
      },
      fileManager: {
        processFrontMatter: async (_f, mutator) => {
          // no-op for test body path
        }
      }
    };
    const added = await store.appendKeyInteraction(interactApp, "PARA/RESOURCES/CONTACTS/정호성.md", {
      date: "2026-07-16",
      insight: "전태현 청모"
    });
    assert.match(added.line, /전태현 청모/);
    assert.match(body, /- \[\[2026-07-16\]\] 전태현 청모/);
    assert.match(body, /last_contact:\s*2026-07-16/);

    let memoBody = withMemoSection;
    const memoApp = {
      vault: {
        getAbstractFileByPath: (p) => (p === "PARA/RESOURCES/CONTACTS/메모인.md" ? { path: p } : null),
        read: async () => memoBody,
        modify: async (_f, next) => { memoBody = next; }
      }
    };
    const memoAdded = await store.appendMemo(memoApp, "PARA/RESOURCES/CONTACTS/메모인.md", {
      text: "청모 통해 알게 됨"
    });
    assert.match(memoAdded.line, /청모 통해/);
    assert.match(memoBody, /# 메모[\s\S]*- 청모 통해 알게 됨/);
    assert.equal(/last_contact:\s*2026-07-16/.test(memoBody), false);

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
