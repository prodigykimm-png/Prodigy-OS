"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { FakeElement, FakeModal, collectText, createApp, findByText, readingFile } = require("./reading_memory_view_fakes.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CORE_PATH = path.join(ROOT, "SYSTEM/Views/reading-checklist-core.js");
const STORE_PATH = path.join(ROOT, "SYSTEM/Views/reading-checklist-store.js");
const VIEW_PATH = path.join(ROOT, "SYSTEM/Views/reading-checklist-view.js");
const CARD_PATH = path.join(ROOT, "SYSTEM/Views/reading-card.js");
const core = require(CORE_PATH);
const storeApi = require(STORE_PATH);

function source(overrides = {}) {
  return {
    source_path: "PARA/PROJECTS/Reading/책.md",
    id: "book-1",
    title: "책",
    status: "reading",
    ...overrides,
  };
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function testRegistryAndSelection() {
  const allIds = [];
  for (const [type, questions] of Object.entries(core.QUESTION_REGISTRY)) {
    assert.ok(questions.length >= 2, `${type} must have questions`);
    questions.forEach((question) => {
      assert.ok(question.id && question.label && question.hint);
      assert.ok(question.phase, `${question.id} needs phase`);
      allIds.push(question.id);
    });
  }
  assert.equal(new Set(allIds).size, allIds.length, "question IDs must be globally unique");

  const untyped = core.selectQuestions(source({ category: "한국 소설" }));
  assert.equal(untyped.type, "universal");
  assert.equal(untyped.domain, false);
  assert.ok(untyped.phases.length === 3);
  assert.ok(untyped.phases.every((p) => p.questions.length >= 1));
  assert.ok(untyped.questions.some((q) => q.phase === "before"));
  assert.ok(untyped.questions.some((q) => q.phase === "during"));
  assert.ok(untyped.questions.some((q) => q.phase === "after"));
  assert.match(untyped.phases[0].label, /읽기 전|구조/);

  const practical = core.selectQuestions(source({ reading_strategy: "practical" }));
  assert.equal(practical.type, "practical");
  assert.equal(practical.domain, true);
  assert.ok(practical.questions.some((q) => String(q.id).startsWith("common_")));
  assert.ok(practical.questions.some((q) => String(q.id).startsWith("practical_")));
  assert.deepEqual(core.selectQuestions(source({ reading_strategy: "practical" })), practical);

  assert.equal(core.resolveExplicitBookType(source({ category: "심리학" })).known, false);
  assert.equal(core.resolveBookType(source({ book_type: "philosophy" })).type, "philosophy");
}

function testReadingGuideNoteUpsert() {
  const question = core.QUESTION_REGISTRY.universal[0];
  const canonical = "---\ntype: reading\n---\n# Book\n\n## Key Takeaways\n\n- existing\n\n## Review\n\n- keep\n";
  const inserted = core.upsertReadingGuideNote(canonical, question, "첫 메모\n두 번째 줄");
  assert.match(inserted, /### 독서 질답/);
  assert.match(inserted, new RegExp(`reading-guide-note:${question.id}`));
  assert.match(inserted, /- 첫 메모/);
  const updated = core.upsertReadingGuideNote(inserted, question, "수정한 메모");
  assert.equal((updated.match(new RegExp(`reading-guide-note:${question.id}`, "g")) || []).length, 1);
  assert.match(updated, /수정한 메모/);
}

async function testStateStore() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-reading-checklist-"));
  try {
    const store = storeApi.createChecklistStore(storeApi.createNodeAdapter(tempRoot));
    const selected = core.selectQuestions(source({ reading_strategy: "practical" }));
    const initial = storeApi.createState(source(), selected);
    initial.drafts[selected.questions[0].id] = "임시 생각";
    await store.write(initial.state_id, initial);
    assert.equal((await store.read(initial.state_id)).drafts[selected.questions[0].id], "임시 생각");
    await store.remove(initial.state_id);
    assert.equal(await store.read(initial.state_id), null);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function loadView(modals, notices = []) {
  delete require.cache[require.resolve(VIEW_PATH)];
  class TrackingModal extends FakeModal { open() { modals.push(this); super.open(); } }
  global.obsidian = { Modal: TrackingModal, Notice: class { constructor(message) { notices.push(message); } } };
  global.ReadingChecklistCore = core;
  global.ReadingChecklistStore = storeApi;
  global.ReadingMemoryStore = require(path.join(ROOT, "SYSTEM/Views/reading-memory-store.js"));
  return require(VIEW_PATH);
}

async function testModalAndPersistence() {
  const file = readingFile("PARA/PROJECTS/Reading/성공대화론.md", "---\ntype: reading\nstatus: reading\n---\n# 성공대화론\n");
  const fixture = createApp([file]);
  fixture.app.vault.modify = async (target, content) => { target.content = content; };
  const modals = [];
  const notices = [];
  const view = loadView(modals, notices);
  const input = source({
    source_path: file.path,
    id: "success-talk",
    title: "성공대화론",
    reading_strategy: "practical",
  });
  const modal = view.createModal(fixture.app, input);
  modal.open();
  await modal.loadPromise;
  let rendered = collectText(modal.contentEl);
  assert.match(rendered, /독서 질답/);
  // Top phase tabs — one phase visible at a time
  assert.match(rendered, /읽기 전/);
  assert.match(rendered, /읽는 중/);
  assert.match(rendered, /읽은 후/);
  assert.match(rendered, /전략 · 공통 \+ 실용|공통 \+ 실용/);
  assert.equal(modal.activePhaseId, "before");
  assert.match(rendered, /구조 파악|종류와 주제|한두 문장/);
  // During-phase content should not all be on screen at once
  assert.equal(rendered.includes("핵심 용어 의미를 파악해 합의했는가"), false);
  const beforeTabs = descendants(modal.contentEl).filter((item) => item.text && String(item.text).includes("읽기 전"));
  assert.ok(beforeTabs.length >= 1);
  // Switch to during — only that phase's fields
  const duringTab = descendants(modal.contentEl).find((item) => item.text && /^읽는 중/.test(String(item.text)));
  assert.ok(duringTab);
  duringTab.onclick();
  rendered = collectText(modal.contentEl);
  assert.equal(modal.activePhaseId, "during");
  assert.match(rendered, /핵심 용어|명제|논증/);
  let textareas = descendants(modal.contentEl).filter((item) => item.tag === "textarea");
  assert.ok(textareas.length >= 3, "active phase questions should show answer fields");
  assert.ok(textareas.length < 12, "should not dump every phase's fields at once");
  assert.equal(findByText(modal.contentEl, "메모"), null);
  assert.equal(findByText(modal.contentEl, "해당 없음"), null);

  // Back to before for answer save
  const beforeTab = descendants(modal.contentEl).find((item) => item.text && /^읽기 전/.test(String(item.text)));
  beforeTab.onclick();
  assert.equal(modal.activePhaseId, "before");
  const firstQuestion = modal.data.selection.phases.find((p) => p.id === "before").questions[0];
  textareas = descendants(modal.contentEl).filter((item) => item.tag === "textarea");
  const firstInput = textareas[0];
  firstInput.value = "이 책은 대화의 원칙에 관한 글이다";
  firstInput.oninput();
  await new Promise((r) => setTimeout(r, 500));
  let draftState = JSON.parse(fixture.adapter.files.get(modal.data.store.pathFor(modal.data.id)));
  assert.equal(draftState.drafts[firstQuestion.id], "이 책은 대화의 원칙에 관한 글이다");

  // Single bottom save — not per-question
  const saveButtons = descendants(modal.contentEl).filter((item) => item.text === "노트에 저장");
  assert.equal(saveButtons.length, 1, "only one save control at the bottom");
  await saveButtons[0].onclick();
  assert.match(file.content, /## Key Takeaways/);
  assert.match(file.content, new RegExp(`reading-guide-note:${firstQuestion.id}`));
  assert.match(file.content, /대화의 원칙/);
  assert.ok(notices.some((m) => m.includes("저장")));

  const reopened = view.createModal(fixture.app, input);
  reopened.open();
  await reopened.loadPromise;
  // default tab is before — draft should fill first field
  const reInput = descendants(reopened.contentEl).find((item) => item.tag === "textarea");
  assert.match(reInput.value, /대화의 원칙/);
  reInput.value = "수정된 생각";
  reInput.oninput();
  await new Promise((r) => setTimeout(r, 500));
  const reSave = descendants(reopened.contentEl).filter((item) => item.text === "노트에 저장");
  assert.equal(reSave.length, 1);
  await reSave[0].onclick();
  assert.match(file.content, /수정된 생각/);

  const reset = findByText(reopened.contentEl, "임시 답 초기화");
  reset.onclick();
  const confirm = modals.at(-1);
  assert.match(collectText(confirm.contentEl), /임시 답을 초기화할까요/);
  await findByText(confirm.contentEl, "초기화 확인").onclick();
  assert.deepEqual(reopened.data.state.drafts, {});
  assert.match(file.content, /수정된 생각/, "reset must preserve the canonical Reading note");

  await findByText(modal.contentEl, "책 열기").onclick();
  assert.equal(fixture.opens[0][0], file.path);
}

async function testFallbackAndUnavailable() {
  const file = readingFile("PARA/PROJECTS/Reading/Unknown.md", "# Unknown");
  const fixture = createApp([file]);
  const modals = [];
  const view = loadView(modals);
  const modal = view.createModal(fixture.app, source({ source_path: file.path, id: "unknown", category: "미분류" }));
  modal.open();
  await modal.loadPromise;
  const text = collectText(modal.contentEl);
  assert.match(text, /읽기 전/);
  assert.match(text, /종류와 주제를 어떻게 분류|구조 파악/);
  assert.equal(findByText(modal.contentEl, "메모"), null);

  const missing = view.createModal(fixture.app, source({ source_path: "PARA/PROJECTS/Reading/없음.md" }));
  missing.open();
  await missing.loadPromise;
  assert.match(collectText(missing.contentEl), /책 정보를 확인할 수 없습니다|불러오지 못했습니다/);
}

function testCardEntryPointAndMemoryRegression() {
  const guideCalls = [];
  const memoryCalls = [];
  const context = {
    window: {
      prodigyDisplay: { statusInfo: () => ({ color: "#000" }) },
      ReadingChecklistView: { openForSource: (...args) => guideCalls.push(args) },
      ReadingMemoryView: { openForSource: (...args) => memoryCalls.push(args) },
    },
    app: {
      metadataCache: { getFirstLinkpathDest: () => null },
      vault: { getAbstractFileByPath: () => null },
      workspace: { openLinkText: () => {} },
      fileManager: { processFrontMatter: async () => {} },
    },
    Notice: function Notice() {},
    console,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CARD_PATH, "utf8"), context);
  const root = new FakeElement();
  const pathValue = "PARA/PROJECTS/Reading/Legacy.md";
  context.window.renderReadingCard({
    id: "legacy",
    status: "reading",
    book_title: "Legacy",
    progress: 50,
    category: "철학",
    file: { path: pathValue, name: "Legacy" },
  }, root, "hero");
  const guide = findByText(root, "독서 질답");
  const memory = findByText(root, "관련 기억");
  assert.ok(guide && memory);
  guide.onclick({ preventDefault() {}, stopPropagation() {} });
  memory.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(guideCalls[0][1].source_path, pathValue);
  assert.equal(memoryCalls[0][1], pathValue);
}

async function main() {
  testRegistryAndSelection();
  testReadingGuideNoteUpsert();
  await testStateStore();
  await testModalAndPersistence();
  await testFallbackAndUnavailable();
  testCardEntryPointAndMemoryRegression();
  console.log("Reading Checklist runtime tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
