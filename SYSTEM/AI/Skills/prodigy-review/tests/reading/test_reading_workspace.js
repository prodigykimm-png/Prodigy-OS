"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.text = "";
    this.attr = {};
    this.style = {};
    this.hidden = false;
    this.clientWidth = 0;
  }

  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = options.text || "";
    child.attr = options.attr || {};
    child.hidden = Object.prototype.hasOwnProperty.call(child.attr, "hidden");
    this.children.push(child);
    return child;
  }

  empty() {
    this.children = [];
    this.text = "";
  }

  setAttr(name, value) {
    this.attr[name] = value;
  }

  setAttribute(name, value) {
    this.attr[name] = value;
  }

  removeAttribute(name) {
    delete this.attr[name];
  }
}

function findAll(node, predicate, found = []) {
  if (node && predicate(node)) found.push(node);
  for (const child of (node && node.children) || []) findAll(child, predicate, found);
  return found;
}

function main() {
  try { load("SYSTEM/Views/object-lifecycle-core.js"); } catch (_e) { /* optional */ }
  const engine = load("SYSTEM/Views/object-engine-core.js");
  const checklist = load("SYSTEM/Views/reading-checklist-core.js");
  load("SYSTEM/Views/reading-strategy-core.js");
  const workspace = load("SYSTEM/Views/reading-workspace-core.js");
  const readingView = load("SYSTEM/Views/reading-view.js");
  const tokens = load("SYSTEM/Views/design-tokens.js");
  const launcher = load("SYSTEM/Views/workspace-launcher-core.js");

  // --- Responsive list/detail: explicit logical width, progress-only model preserved ---
  assert.equal(typeof readingView.mountResponsiveWorkspace, "function", "reading responsive workspace mount is missing");
  const responsiveModel = Object.freeze({
    today: Object.freeze({ object: Object.freeze({ title: "Atomic Habits", progress: "50%" }) }),
    continue_reading: Object.freeze({ empty: true, items: Object.freeze([]) })
  });
  const modelBeforeResize = JSON.stringify(responsiveModel);
  const responsiveRoot = new FakeElement("section");
  const responsive = readingView.mountResponsiveWorkspace({
    container: responsiveRoot,
    model: responsiveModel,
    logicalWidth: tokens.BREAKPOINTS.wide,
    renderList(parent) { parent.createEl("p", { text: "독서 목록" }); },
    renderDetail(parent) { parent.createEl("p", { text: "이어 읽기" }); }
  });
  const visiblePaneCount = () => findAll(
    responsiveRoot,
    (node) => node.attr["data-reading-pane"] && !node.hidden
  ).length;
  assert.equal(responsiveRoot.attr["data-reading-layout"], "wide");
  assert.equal(visiblePaneCount(), 2);
  responsive.setLogicalWidth(tokens.BREAKPOINTS.medium - 1);
  assert.equal(responsiveRoot.attr["data-reading-layout"], "compact");
  assert.equal(visiblePaneCount(), 1);
  assert.equal(JSON.stringify(responsiveModel), modelBeforeResize);
  assert.equal(responsiveModel.today.object.progress, "50%");

  // --- Empty states ---
  const emptyModel = workspace.buildWorkspaceModel([], {});
  assert.equal(emptyModel.today.empty, true);
  assert.match(emptyModel.today.message, /읽는 책|여기에 표시/);
  assert.equal(emptyModel.continue_reading.empty, true);
  assert.match(emptyModel.continue_reading.message, /이어 읽을 책|읽는 중/);
  assert.equal(emptyModel.waiting_review.empty, true);
  assert.equal(emptyModel.waiting_review.message, "읽을 복기 대상이 없습니다.");
  assert.equal(emptyModel.knowledge_candidates.empty, true);
  assert.equal(emptyModel.knowledge_candidates.message, "지식 후보가 없습니다.");
  assert.equal(emptyModel.knowledge_candidates.reserved, true);

  // --- Runtime integration: single session, continue target ---
  const session = engine.createRuntimeSession({});
  const pages = [
    {
      type: "reading",
      status: "reading",
      path: "PARA/PROJECTS/Reading/atomic.md",
      title: "Atomic Habits",
      author: "James Clear",
      next_action: "Ch.3 읽기",
      progress: 50,
      reading_strategy: "practical"
    },
    {
      type: "reading",
      status: "reviewing",
      path: "PARA/PROJECTS/Reading/thinking.md",
      title: "Thinking Fast",
      author: "Kahneman",
      next_action: "복기 작성"
    },
    {
      type: "reading",
      status: "completed",
      path: "PARA/PROJECTS/Reading/done.md",
      title: "Done Book",
      finished: "2026-07-10",
      rating: 5
    },
    {
      type: "reading",
      status: "queue",
      path: "PARA/PROJECTS/Reading/queue.md",
      title: "Queued"
    }
  ];

  const model = workspace.buildWorkspaceModel(pages, { session });
  assert.equal(model.runtime_ok, true);
  assert.ok(model.states.length === 4);

  // Today's Reading — one primary from Runtime
  assert.equal(model.today.empty, false);
  assert.equal(model.today.object.title, "Atomic Habits");
  assert.equal(model.today.object.author, "James Clear");
  assert.equal(model.today.object.progress, "50%");
  assert.equal(model.today.object.continue_action, "이어 읽기");
  assert.ok(model.today.reason);
  assert.match(model.today.reason, /Runtime|독서|Object/);

  // Continue strip: single active book → do not duplicate hero
  assert.equal(model.continue_reading.empty, true);
  assert.equal(model.continue_reading.single_hero, true);
  assert.match(model.continue_reading.message, /다른 책|오늘의 독서/);

  // Engine continue_target still exists for Runtime; strip just hides hero dup
  const summary = engine.buildWorkspaceSummary(model.states, "reading", {});
  assert.ok(summary.continue_target);
  assert.match(summary.continue_target.object_path || summary.continue_target.label || "", /atomic|Atomic/i);

  // Multi-book: strip shows other reading books, not the hero
  const multiPages = pages.concat([
    {
      type: "reading",
      status: "reading",
      path: "PARA/PROJECTS/Reading/deep.md",
      title: "Deep Work",
      author: "Newport",
      next_action: "Ch.2",
      progress: 20
    }
  ]);
  const multi = workspace.buildWorkspaceModel(multiPages, { session });
  assert.equal(multi.today.empty, false);
  assert.equal(multi.continue_reading.empty, false);
  assert.equal(multi.continue_reading.hero_excluded, true);
  assert.ok(Array.isArray(multi.continue_reading.items));
  assert.ok(multi.continue_reading.items.every((it) => !/Atomic Habits/i.test(it.title || "")));
  assert.ok(multi.continue_reading.items.some((it) => /Deep Work/i.test(it.title || "")));

  // Reading Guide — common + practical domain
  assert.equal(model.reading_guide.empty, false);
  assert.equal(model.reading_guide.strategy, "practical");
  assert.equal(model.reading_guide.known, true);
  assert.equal(model.reading_guide.common, true);
  assert.equal(model.reading_guide.domain, true);
  assert.ok(model.reading_guide.prompts.length >= 3);
  assert.ok(model.reading_guide.prompts.length <= 5);
  assert.ok(model.reading_guide.reason);
  assert.match(model.reading_guide.reason, /전략|공통|실용/);

  // Reading Checklist — common spine + domain, never auto-complete
  assert.equal(model.reading_checklist.empty, false);
  assert.equal(model.reading_checklist.strategy, "practical");
  assert.equal(model.reading_checklist.auto_complete, false);
  assert.ok(model.reading_checklist.items.length >= 4);
  assert.ok(model.reading_checklist.items.every((i) => i.checked === false));
  assert.match(model.reading_checklist.reason, /전략|공통|실용/);

  // Reflection — max 3, common critique + domain apply
  assert.equal(model.reflection.empty, false);
  assert.ok(model.reflection.prompts.length <= 3);
  assert.ok(model.reflection.prompts.length >= 1);
  assert.match(model.reflection.prompts.map((p) => p.label).join(" "), /의의|맞는가|이해|적용/);
  assert.match(model.reflection.reason, /전략|공통|실용/);

  // Waiting Review — Runtime reviewing / needs_review
  assert.equal(model.waiting_review.empty, false);
  assert.ok(model.waiting_review.items.some((i) => i.title.includes("Thinking") || i.path.includes("thinking")));
  model.waiting_review.items.forEach((item) => {
    assert.ok(item.reason, "every review card must explain itself");
  });

  // Focus path remains hero; strip is empty (no hero duplicate)
  assert.equal(model.focus_path, "PARA/PROJECTS/Reading/atomic.md");
  assert.equal(model.continue_reading.focus_path, "PARA/PROJECTS/Reading/atomic.md");
  assert.equal(model.continue_reading.empty, true);
  // Multi-book strip carries next_action / progress on non-hero items
  assert.ok(multi.continue_reading.next_action || (multi.continue_reading.items && multi.continue_reading.items[0]));
  if (multi.continue_reading.items && multi.continue_reading.items[0]) {
    assert.ok(multi.continue_reading.items[0].object_path.includes("deep"));
  }

  // Finish soon — high progress reading books
  const finishPages = pages.concat([{
    type: "reading",
    status: "reading",
    path: "PARA/PROJECTS/Reading/almost.md",
    title: "Almost Done",
    progress: 90,
    next_action: "마지막 장"
  }]);
  const finishModel = workspace.buildWorkspaceModel(finishPages, { session: engine.createRuntimeSession({}) });
  assert.equal(finishModel.finish_soon.empty, false);
  assert.ok(finishModel.finish_soon.items.some((i) => i.title === "Almost Done" || i.progress_number >= 75));
  finishModel.finish_soon.items.forEach((item) => {
    assert.ok(item.reason);
    assert.ok(item.progress_number >= workspace.FINISH_PROGRESS_MIN);
  });

  // Queue ready
  assert.equal(model.queue_ready.empty, false);
  assert.ok(model.queue_ready.items.some((i) => i.title === "Queued"));

  // Stale reading surface exists (may be empty without old updated dates)
  assert.ok(model.stale_reading);
  assert.ok(Array.isArray(model.stale_reading.items));

  // Connection chips helper
  const chips = workspace.parseConnectionChips(["[[민지선]]", "PARA/RESOURCES/CONTACTS/윤채연.md"], 5);
  assert.ok(chips.length >= 2);
  assert.ok(chips.some((c) => c.label.includes("민지선") || c.name.includes("민지선")));

  // Checklist progress helper
  const qa = workspace.summarizeChecklistProgress({
    items: { a: "checked", b: "unchecked", c: "not_applicable" }
  }, 3);
  assert.equal(qa.checked, 2);
  assert.equal(qa.total, 3);
  assert.match(qa.label, /질답/);

  // Progress helpers
  assert.equal(workspace.progressNumber({ progress: 75 }), 75);
  assert.equal(workspace.progressNumber({ progress: "0" }), null);
  assert.equal(workspace.normalizeProgressStep(48), 50);

  // shareRuntimeModel alias
  const shared = workspace.shareRuntimeModel(pages, { session: engine.createRuntimeSession({}) });
  assert.equal(shared.schema_version, model.schema_version);
  assert.equal(shared.runtime_ok, true);

  // History — completed only
  assert.equal(model.history.empty, false);
  assert.ok(model.history.items.some((i) => i.title === "Done Book"));
  assert.ok(!model.history.items.some((i) => i.title === "Queued"));

  // Knowledge candidates placeholder — never fabricate
  assert.equal(model.knowledge_candidates.items.length, 0);

  // --- Explainability on Runtime-derived cards ---
  assert.ok(model.today.reason);
  // Single-book continue is empty (no hero dup) but must explain why
  assert.ok(model.continue_reading.message || model.continue_reading.reason);
  assert.ok(model.reading_guide.reason);
  assert.ok(model.waiting_review.items.every((i) => i.reason && String(i.reason).trim()));
  // Multi-book strip items are explainable
  if (multi.continue_reading.items) {
    multi.continue_reading.items.forEach((it) => {
      assert.ok(it.reason || it.title);
    });
  }

  // --- Unknown book_type: no silent guess → Generic Strategy ---
  const unknown = workspace.resolveStrategyDirect({ title: "Something", category: "자기계발" });
  assert.equal(unknown.known, false);
  assert.ok(unknown.strategy === "generic" || unknown.strategy === "unknown");

  const known = workspace.resolveStrategyDirect({ book_type: "philosophy" });
  assert.equal(known.known, true);
  assert.equal(known.strategy, "philosophy");

  // Guide with unknown type uses Generic Strategy
  const unknownPages = [{
    type: "reading",
    status: "reading",
    path: "PARA/PROJECTS/Reading/u.md",
    title: "Unknown Type Book"
  }];
  const um = workspace.buildWorkspaceModel(unknownPages, { session: engine.createRuntimeSession({}) });
  assert.equal(um.reading_guide.empty, false);
  assert.equal(um.reading_guide.strategy, "generic");
  assert.equal(um.reading_guide.domain, false);
  assert.ok(um.reading_guide.prompts.length >= 3);
  assert.ok(um.reading_checklist.empty === false);
  assert.equal(um.reading_checklist.strategy, "generic");
  assert.ok(um.reading_checklist.items.every((i) => String(i.id).includes("common")));
  assert.ok(um.reading_guide.reason);

  // --- Session memo: evaluate once ---
  const s2 = engine.createRuntimeSession({});
  const a = s2.evaluateObject(pages[0]);
  const b = s2.evaluateObject(pages[0]);
  assert.equal(a, b);

  const model2 = workspace.buildWorkspaceModel(pages, { session: s2 });
  assert.equal(model2.states[0], a);

  // --- Launcher compatibility: still builds reading card from same objects ---
  const cards = launcher.buildLauncherCards({
    pkg: {
      context: {
        auctions: [],
        reading: pages.filter((p) => p.status === "reading" || p.status === "reviewing"),
        projects: []
      }
    },
    journalStatus: { status: "empty" },
    workoutSnapshot: null
  });
  const readingCard = cards.find((c) => c.id === "reading");
  assert.ok(readingCard);
  assert.equal(readingCard.empty, false);
  assert.match(String(readingCard.title || readingCard.detail || ""), /Atomic|Habits|Ch\.3|읽기|Resume|이어/i);

  // --- Home hub still references engine (not redesigned) ---
  const homeHub = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
  assert.match(homeHub, /object-engine-core\.js|HomeView|workspace-launcher/i);

  // --- Reading hub: card-first + Runtime/Strategy power (no full workspace wall) ---
  const readingHub = fs.readFileSync(path.join(ROOT, "HUB/20 Reading.md"), "utf8");
  assert.match(readingHub, /reading-workspace-core\.js/);
  assert.match(readingHub, /reading-strategy-core\.js/);
  assert.match(readingHub, /object-engine-core\.js/);
  assert.match(readingHub, /reading-card\.js/);
  assert.match(readingHub, /renderReadingCard/);
  assert.match(readingHub, /이어 읽기|읽는 중/);
  assert.match(readingHub, /이어 읽을 책|읽는 중|진행 중/);
  assert.match(readingHub, /읽을 복기 대상이 없습니다/);
  assert.match(readingHub, /오래 방치/);
  assert.match(readingHub, /완독 임박/);
  assert.match(readingHub, /오늘 읽기|이 책 포커스/);
  assert.match(readingHub, /shareRuntimeModel|__readingWorkspaceModel/);
  assert.match(readingHub, /stale_reading|finish_soon/);
  assert.match(readingHub, /ProdigyAdaptiveControls\.AdaptiveActionBar/);
  assert.match(readingHub, /mountResponsiveWorkspace/);
  assert.match(readingHub, /ProdigyTokens\.BREAKPOINTS\.wide/);
  assert.doesNotMatch(readingHub, /window\.innerWidth|globalThis\.innerWidth/);
  // Card-first: do not mount full progressive wall on hub
  assert.equal(/ReadingWorkspaceView\.renderWorkspace/.test(readingHub), false);
  assert.equal(readingHub.includes("reading-workspace-view.js"), false);
  assert.equal(workspace.EMPTY.knowledge, "지식 후보가 없습니다.");
  assert.match(workspace.EMPTY.continue, /이어 읽을 책/);
  assert.match(workspace.EMPTY.today, /읽는 책|여기에 표시/);
  assert.equal(workspace.EMPTY.review, "읽을 복기 대상이 없습니다.");
  assert.equal(workspace.EMPTY.stale, "오래 방치된 독서가 없습니다.");
  assert.equal(workspace.EMPTY.finish, "완독 임박 책이 없습니다.");
  assert.equal(workspace.LABELS.today, "오늘의 독서");
  assert.equal(workspace.LABELS.continue, "이어 읽기");
  assert.equal(workspace.LABELS.guide, "독서 질답");
  assert.equal(workspace.LABELS.checklist, "독서 체크리스트");
  assert.equal(workspace.LABELS.reflection, "성찰");
  assert.equal(workspace.LABELS.review, "복기 대기");
  assert.equal(workspace.LABELS.knowledge, "지식 후보");
  assert.equal(workspace.LABELS.history, "기록");
  assert.equal(workspace.LABELS.reason, "이유");
  assert.equal(workspace.LABELS.stale, "오래 방치");
  assert.equal(workspace.LABELS.finish, "완독 임박");
  assert.equal(workspace.LABELS.quickSession, "빠른 기록");

  // --- No schema / property / runtime mutation in workspace core ---
  const wsSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/reading-workspace-core.js"), "utf8");
  assert.equal(wsSrc.includes("processFrontMatter"), false);
  assert.equal(wsSrc.includes("vault.modify"), false);
  assert.equal(wsSrc.includes("fetch("), false);
  assert.match(wsSrc, /ObjectEngine|createRuntimeSession|buildWorkspaceSummary/);

  // --- Card source: next_action / minimal session / people chips / focus ---
  const cardSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/reading-card.js"), "utf8");
  assert.match(cardSrc, /reading-next-action|next_action/);
  assert.match(cardSrc, /오늘 읽기|openSessionModal/);
  assert.equal(cardSrc.includes("빠른 기록"), false, "card should not dual-path session buttons");
  assert.match(cardSrc, /parseConnectionChips|reading-people-chips/);
  assert.match(cardSrc, /reading-qa-progress|질답/);
  assert.match(cardSrc, /reading-memory-preview|관련 기억/);
  assert.match(cardSrc, /is-focus|focus_path/);
  assert.match(cardSrc, /읽기 시작/);

  // --- Minimal session modal (one memo, not a form wall) ---
  const viewSrc = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/reading-view.js"), "utf8");
  assert.match(viewSrc, /grid-template-columns:minmax\(min\(18rem,100%\),4fr\) minmax\(min\(22rem,100%\),6fr\)/);
  assert.doesNotMatch(viewSrc, /grid-template-columns:[^;]*,minmax\(0,/);
  assert.match(viewSrc, /openSessionModal|saveQuickSession/);
  assert.match(viewSrc, /한 줄 메모/);
  assert.match(viewSrc, /한 줄이면 충분/);
  assert.match(viewSrc, /더 보기/);
  // Full field wall removed from default surface
  assert.equal(/fieldInput\(contentEl,\s*"시작 페이지"/.test(viewSrc), false);
  assert.equal(/fieldInput\(contentEl,\s*"종료 페이지"/.test(viewSrc), false);
  assert.equal(/fieldInput\(contentEl,\s*"핵심 내용"/.test(viewSrc), false);

  // --- Operating Guide documents flow ---
  const guide = fs.readFileSync(path.join(ROOT, "SYSTEM/docs/11_Operating_Guide.md"), "utf8");
  assert.match(guide, /Reading Dashboard|Reading Strategy|카드/);
  assert.match(guide, /Object Engine Runtime/);
  assert.match(guide, /독서 질답/);
  assert.match(guide, /성찰/);
  assert.match(guide, /복기/);
  assert.match(guide, /한 줄|오늘 읽기|완독 임박|오래 방치/);

  // Checklist still available for guide questions
  assert.ok(checklist.selectQuestions);
  const pq = checklist.selectQuestions({ reading_strategy: "practical", source_path: "PARA/PROJECTS/Reading/x.md" });
  assert.ok(pq.questions.length >= 3);

  // STRATEGY_GUIDE covers mission strategies (compat surface)
  for (const key of ["practical", "philosophy", "history", "science", "literature", "social_science"]) {
    assert.ok(workspace.STRATEGY_GUIDE[key], key);
    assert.ok(workspace.STRATEGY_GUIDE[key].length >= 2);
  }

  // --- Manual registration: downstream Memory/Questions/Review pass ---
  // A manually registered book (with reading_format) still works with workspace model
  const manualPages = [{
    type: "reading",
    status: "reading",
    path: "PARA/PROJECTS/Reading/manual-book.md",
    title: "수동 등록 책",
    author: "저자",
    reading_format: "ebook",
    identifier: "978-89-01-23456-7",
    publisher: "출판사",
    source_url: "https://example.com/book",
    next_action: "1장 읽기",
    progress: 10
  }];
  const manualModel = workspace.buildWorkspaceModel(manualPages, { session: engine.createRuntimeSession({}) });
  assert.equal(manualModel.today.empty, false);
  assert.equal(manualModel.today.object.title, "수동 등록 책");
  // Reading guide works for manually registered book
  assert.equal(manualModel.reading_guide.empty, false);
  assert.ok(manualModel.reading_guide.prompts.length >= 3);
  // Checklist works
  assert.equal(manualModel.reading_checklist.empty, false);
  assert.ok(manualModel.reading_checklist.items.length >= 4);
  // Review surface exists
  assert.ok(manualModel.waiting_review);

  // --- Invalid URL/date/enum preserves input and creates nothing ---
  global.obsidian = {
    Modal: class {},
    Notice: class {},
    stringifyYaml(value) {
      return Object.entries(value)
        .map(([key, item]) => `${key}: ${item === null ? "" : JSON.stringify(item)}`)
        .join("\n");
    },
  };
  const bookCreate = load("SYSTEM/Views/reading-book-create.js");
  const invalidInputs = [
    { title: "책", source_url: "not-a-url" },
    { title: "책", publish_date: "2024-13-01" },
    { title: "책", reading_format: "magazine" },
    { title: "", reading_format: "book" },
  ];
  for (const input of invalidInputs) {
    const { errors, values } = bookCreate.validateManualInput(input);
    assert.ok(errors.length > 0, `expected errors for ${JSON.stringify(input)}`);
    // Original input preserved in values
    if (input.source_url) assert.equal(values.source_url, input.source_url);
    if (input.publish_date) assert.equal(values.publish_date, input.publish_date);
    if (input.reading_format && input.reading_format !== "book") {
      assert.equal(values.reading_format, input.reading_format);
    }
  }
  // buildManualReadingContent throws and creates nothing on invalid input
  const templateContent = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_reading.md"), "utf8");
  for (const input of invalidInputs) {
    assert.throws(() => bookCreate.buildManualReadingContent(templateContent, input));
  }

  // --- reading-view.js exposes manual registration modal ---
  assert.match(viewSrc, /openManualRegistrationModal/);
  assert.match(viewSrc, /수동 등록/);
  assert.match(viewSrc, /네트워크 없이/);

  console.log("Reading workspace tests passed");
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

main();
