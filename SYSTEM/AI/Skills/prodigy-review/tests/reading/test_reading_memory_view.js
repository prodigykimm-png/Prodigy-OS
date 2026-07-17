"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { FakeElement, FakeModal, collectText, createApp, findByText, readingFile } = require("./reading_memory_view_fakes.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const VIEW_PATH = path.join(ROOT, "SYSTEM/Views/reading-memory-view.js");
const CARD_PATH = path.join(ROOT, "SYSTEM/Views/reading-card.js");
const core = require(path.join(ROOT, "SYSTEM/Views/reading-memory-core.js"));
const retrieval = require(path.join(ROOT, "SYSTEM/Views/reading-memory-retrieval.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/reading-memory-store.js"));

function source(title, author, topics, thought = "") {
  return ["---", "type: reading", `title: ${title}`, `author: ${author}`, `topics: [${topics.join(", ")}]`, "---", `# ${title}`, "## What I Learned", thought ? `- ${thought}` : ""].join("\n");
}

function loadView(notices = [], overrides = {}, preserveRuntime = false) {
  delete require.cache[require.resolve(VIEW_PATH)];
  if (!preserveRuntime) delete global.__prodigyReadingMemoryRuntime;
  global.obsidian = { Modal: FakeModal, Notice: class { constructor(message) { notices.push(message); } } };
  global.ReadingMemoryCore = core;
  global.ReadingMemoryRetrieval = overrides.retrieval || retrieval;
  global.ReadingMemoryStore = store;
  return require(VIEW_PATH);
}

async function testLoadAndIncrementalBuild() {
  const current = readingFile("PARA/PROJECTS/Reading/성공대화론.md", source("성공대화론", "데일 카네기", ["대화", "인간관계"]));
  const related = readingFile("PARA/PROJECTS/Reading/인간관계론.md", source("인간관계론", "데일 카네기", ["인간관계"], "먼저 이해하려고 질문한다."));
  const fixture = createApp([current, related]);
  const view = loadView();

  const firstLoad = view.loadForSource(fixture.app, current.path);
  const reloadedView = loadView([], {}, true);
  const [first, concurrent] = await Promise.all([firstLoad, reloadedView.loadForSource(fixture.app, current.path)]);
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0].author, "데일 카네기");
  assert.deepEqual(first.candidates[0].relation_labels, ["같은 주제", "같은 저자"]);
  assert.equal(first.candidates[0].evidence_line, "내 기록: 먼저 이해하려고 질문한다.");
  assert.deepEqual(concurrent.candidates, first.candidates);
  assert.equal(fixture.readCount(), 2, "concurrent opens and repeated script loads must share one build");

  const second = await view.loadForSource(fixture.app, current.path);
  assert.equal(second.build.counts.skipped, 2);
  assert.equal(second.build.counts.created, 0);
  assert.equal(JSON.parse(fixture.adapter.files.get("SYSTEM/AI/Memory/reading/index.json")).entries.length, 2);
}

async function testModalStatesAndNavigation() {
  const current = readingFile("PARA/PROJECTS/Reading/Current.md", source("Current", "Writer", ["집중"]));
  const related = readingFile("PARA/PROJECTS/Reading/Related.md", source("긴 한국어 제목이 줄바꿈되어야 하는 관련 독서 기록", "아주 긴 저자 이름", ["집중"], "집중 환경을 먼저 설계한다."));
  const originalCurrentContent = current.content;
  const fixture = createApp([current, related]);
  const notices = [];
  const view = loadView(notices);
  const modal = view.createModal(fixture.app, current.path);
  modal.open();
  assert.match(collectText(modal.contentEl), /관련 기록을 확인하고 있습니다/);
  await modal.loadPromise;
  const rendered = collectText(modal.contentEl);
  assert.match(rendered, /관련 기억/);
  assert.match(rendered, /이 책과 연결되는 이전 독서 기록/);
  assert.match(rendered, /같은 주제/);
  assert.match(rendered, /왜 표시되었나요/);
  const explain = findByText(modal.contentEl, "왜 표시되었나요?");
  await explain.onclick();
  assert.equal(explain.attr["aria-expanded"], "true");
  const open = findByText(modal.contentEl, "책 열기");
  await open.onclick();
  assert.equal(fixture.opens[0][0], related.path);
  assert.equal(fixture.opens[0][0].includes("SYSTEM/AI/Memory"), false);
  assert.equal(modal.opened, false);

  const refresh = findByText(modal.contentEl, "기억 새로고침");
  await refresh.onclick();
  await modal.loadPromise;
  assert.equal(JSON.parse(fixture.adapter.files.get("SYSTEM/AI/Memory/reading/index.json")).entries.length, 2);
  assert.equal(current.content, originalCurrentContent);

  fixture.files.delete(related.path);
  await open.onclick();
  assert.deepEqual(notices, ["원본 독서 기록을 찾을 수 없습니다."]);
  assert.equal(collectText(modal.contentEl).includes(related.path), false);
  const css = modal.contentEl.children.find((child) => child.tag === "style").text;
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /overflow-y:auto/);
  assert.match(css, /min-height:44px/);
}

async function testMalformedCandidateIsSkipped() {
  const current = readingFile("PARA/PROJECTS/Reading/Current.md", source("Current", "Writer", ["집중"]));
  const related = readingFile("PARA/PROJECTS/Reading/Related.md", source("Related", "Writer", ["집중"]));
  const fixture = createApp([current, related]);
  const malformedRetrieval = {
    retrieveReadingMemoryCandidates: () => [{
      source_path: "SYSTEM/AI/Memory/reading/entries/internal.json",
      title: "Internal",
      relation_types: ["shared_topic"],
      evidence: ["집중"],
    }],
  };
  const view = loadView([], { retrieval: malformedRetrieval });
  const result = await view.loadForSource(fixture.app, current.path);
  assert.deepEqual(result.candidates, []);
}

async function testEmptyUnavailableAndRetry() {
  const only = readingFile("PARA/PROJECTS/Reading/Only.md", source("Only", "Writer", ["고유 주제"]));
  const fixture = createApp([only]);
  const view = loadView();
  const empty = await view.loadForSource(fixture.app, only.path);
  assert.deepEqual(empty.candidates, []);
  const modal = view.createModal(fixture.app, only.path);
  modal.open();
  await modal.loadPromise;
  assert.match(collectText(modal.contentEl), /아직 연결할 만한 이전 독서 기록이 없습니다/);

  const failing = createApp([only]);
  failing.app.vault.read = async () => { throw new Error("sensitive/path stack"); };
  const failedModal = view.createModal(failing.app, only.path);
  failedModal.open();
  await failedModal.loadPromise;
  const failedText = collectText(failedModal.contentEl);
  assert.match(failedText, /관련 기억을 불러오지 못했습니다/);
  assert.equal(failedText.includes("sensitive/path"), false);
  failing.app.vault.read = async (file) => file.content;
  await findByText(failedModal.contentEl, "다시 시도").onclick();
  await failedModal.loadPromise;
  assert.match(collectText(failedModal.contentEl), /아직 연결할 만한/);
}

function testCardEntryPoint() {
  const calls = [];
  const context = {
    window: { prodigyDisplay: { statusInfo: () => ({ color: "#000" }) }, ReadingMemoryView: { openForSource: (...args) => calls.push(args) } },
    app: { metadataCache: { getFirstLinkpathDest: () => null }, vault: { getAbstractFileByPath: () => null }, workspace: { openLinkText: () => {} } },
    Notice: function Notice() {},
    console,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CARD_PATH, "utf8"), context);
  const root = new FakeElement();
  const pathValue = "PARA/PROJECTS/Reading/Legacy.md";
  context.window.renderReadingCard({ status: "reading", book_title: "Legacy", current_page: 20, file: { path: pathValue, name: "Legacy" } }, root, "hero");
  const button = findByText(root, "관련 기억");
  assert.ok(button, "Related Memory action must render");
  button.onclick({ preventDefault() {} });
  assert.equal(calls[0][1], pathValue);
  assert.equal(collectText(root).includes("20"), false);
}

async function main() {
  await testLoadAndIncrementalBuild();
  await testModalStatesAndNavigation();
  await testEmptyUnavailableAndRetry();
  await testMalformedCandidateIsSkipped();
  testCardEntryPoint();
  console.log("Reading Memory view runtime tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
