"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = require(path.join(ROOT, "SYSTEM/Views/knowledge-direct-authoring-view.js"));

class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.text = "";
    this.attr = {};
    this.value = "";
    this.disabled = false;
    this.focused = false;
  }
  createEl(tag, options = {}) {
    const child = new FakeElement(tag);
    child.text = options.text || "";
    child.attr = options.attr || {};
    child.disabled = Boolean(options.disabled);
    this.children.push(child);
    return child;
  }
  createDiv(options = {}) { return this.createEl("div", options); }
  empty() { this.children = []; this.text = ""; }
  setText(value) { this.text = String(value || ""); }
  setAttr(name, value) { this.attr[name] = value; }
  addClass() {}
  focus() { this.focused = true; }
  click() {
    if (this.disabled || typeof this.onclick !== "function") return false;
    this.onclick({ preventDefault() {} });
    return true;
  }
}

function walk(node, predicate, result = []) {
  if (!node) return result;
  if (predicate(node)) result.push(node);
  for (const child of node.children || []) walk(child, predicate, result);
  return result;
}
function text(node) { return walk(node, () => true).map((item) => item.text).filter(Boolean).join(" "); }
function form(root) { return walk(root, (item) => item.tag === "form")[0] || null; }
function field(root, name) { return walk(root, (item) => item.attr && item.attr.name === name)[0] || null; }
function button(root, label) { return walk(root, (item) => item.tag === "button" && item.text === label)[0] || null; }
function pickerOption(root, value) { return walk(root, (item) => item.attr && item.attr["data-picker-option"] === value)[0] || null; }
function pickerSearch(root, name) { return walk(root, (item) => item.attr && item.attr["data-picker-search"] === name)[0] || null; }
function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
function pureLines(source) { return source.split("\n").filter((line) => line.trim() && !/^\s*\/\//.test(line)).length; }
function enter(root, name, value) {
  const input = field(root, name);
  assert.ok(input, `${name} is rendered before input`);
  input.value = value;
  input.oninput({ target: input });
}
function choose(root, name, values) {
  const input = field(root, name);
  assert.ok(input, `${name} is rendered before selection`);
  if (input.tag === "select") {
    if (values.length === 1) input.value = values[0];
    input.selectedOptions = values.map((value) => ({ value }));
    input.onchange({ target: input });
    return;
  }
  input.click();
  values.forEach((value) => {
    const option = pickerOption(root, value);
    assert.ok(option, `${name} option is rendered before selection`);
    option.click();
  });
}

function validDraft(overrides = {}) {
  return {
    title: "직접 공부한 설계 원칙",
    statement: "복잡한 변경은 작은 검증 경계로 나눈다.",
    body: "실패한 배포를 회고하며 단계별 검증을 기록했다.",
    reason: "직접 반복해 확인한 학습이다.",
    source_note: "2026-07-21 개인 설계 노트와 실습",
    suggested_domain: "coding",
    suggested_topics: ["typescript"],
    application_trigger: "다음 설계 검토 전",
    application_contexts: ["coding", "coding/typescript"],
    ...overrides
  };
}

function validate(input) {
  if (!String(input.source_note || "").trim()) throw new Error("직접 학습 출처 메모를 입력해 주세요.");
  if (input.suggested_domain === "coding" && !input.suggested_topics.length) throw new Error("세부 주제를 선택해 주세요.");
  if (input.application_contexts.some((item) => !["coding", "coding/typescript", "reading"].includes(item))) throw new Error("유효하지 않은 적용 맥락입니다. 다시 선택해 주세요.");
  return { ...input, source_type: "manual_study", status: "saved" };
}

function mount(options = {}) {
  const root = new FakeElement("section");
  const opener = new FakeElement("button");
  const calls = [];
  const controller = view.createDirectAuthoringController({
    app: {},
    validate: options.validate || validate,
    saveCandidate: options.saveCandidate || (async (_app, input) => { calls.push(input); return { ...input, path: "PARA/RESOURCES/Knowledge/Candidates/직접 공부한 설계 원칙.md" }; }),
    opener,
    regionOptions: options.regionOptions,
    onReview: options.onReview,
    initialValues: options.initialValues || validDraft()
  });
  const mounted = view.mountDirectAuthoringView(root, controller);
  return { root, opener, calls, controller, mounted };
}

function testLabelsFieldsAndNoAutomationSurface() {
  const fixture = mount();
  const rendered = text(fixture.root);
  for (const label of ["제목", "핵심 요약 (지식 문장)", "출처 주장", "내 해석", "재사용 가능한 지식", "상세 학습 맥락 (상세 학습 기록)", "제안 이유", "직접 학습 출처 메모", "지식 영역 (선택)", "적용 계기", "적용 맥락", "검증 대기에 저장"]) assert.ok(rendered.includes(label), `${label} renders`);
  for (const name of ["title", "statement", "source_claim", "my_interpretation", "reusable_knowledge", "body", "reason", "source_note", "suggested_domain", "suggested_topics", "application_trigger", "application_contexts"]) assert.ok(field(fixture.root, name), `${name} field renders`);
  assert.equal(field(fixture.root, "source_note").attr.required, "true");
  assert.equal(field(fixture.root, "statement").attr["aria-required"], "true");
  assert.equal(field(fixture.root, "suggested_domain").attr["aria-label"], "지식 영역 (선택)");
  assert.ok(button(fixture.root, "취소"));
  const source = ["knowledge-direct-authoring-view.js", "knowledge-direct-authoring-form.js"]
    .map((file) => fs.readFileSync(path.join(ROOT, "SYSTEM/Views", file), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /fetch\s*\(|requestUrl|provider|openai/i, "direct authoring has no automated service seam");
}

function testViewStaysBelowPureLocCeiling() {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-direct-authoring-view.js"), "utf8");
  assert.ok(pureLines(source) < 250, "lifecycle view stays below the 250 pure-LOC ceiling");
}

function testTopicfulTopiclessAndContextEditing() {
  const fixture = mount();
  assert.ok(field(fixture.root, "suggested_topics"));
  fixture.controller.setField("suggested_domain", "reading");
  fixture.mounted.render();
  assert.equal(field(fixture.root, "suggested_topics"), null, "topicless domain suppresses topic selector");
  assert.match(text(fixture.root), /세부 주제를 선택할 필요가 없습니다/);
  fixture.controller.setField("application_contexts", "reading\ncoding/typescript\nreading");
  assert.deepEqual(fixture.controller.values().application_contexts, ["reading", "coding/typescript"], "contexts are editable and duplicate-safe");
}
async function testGeneralDraftWithoutClassification() {
  const fixture = mount({
    initialValues: validDraft({
      suggested_domain: "",
      suggested_topics: [],
      application_contexts: [],
      source_claim: "관찰이나 자료가 실제로 말한 내용",
      my_interpretation: "핵심 요약을 내 경험으로 해석한 내용",
      reusable_knowledge: "다음 문제에도 적용할 절차"
    })
  });
  assert.match(text(fixture.root), /일반 메모/);
  assert.ok(field(fixture.root, "my_interpretation"));
  assert.ok(field(fixture.root, "reusable_knowledge"));
  assert.ok(field(fixture.root, "source_claim"));
  assert.equal(await fixture.controller.submit(), true);
  assert.equal(fixture.calls[0].suggested_domain, "");
  assert.deepEqual(fixture.calls[0].suggested_topics, []);
  assert.match(fixture.calls[0].reason, /## 내 해석/);
  assert.match(fixture.calls[0].reason, /## 재사용 가능한 지식/);
  assert.match(fixture.calls[0].reason, /## 출처 주장/);
}

function testTypingKeepsFocusAndPickersSupportSearchAndSelection() {
  const fixture = mount({
    initialValues: validDraft({ suggested_domain: "", suggested_topics: [], connections: [] }),
    regionOptions: [{ value: "[[PARA/RESOURCES/Auction Regions/서울특별시-중구]]", label: "서울특별시 중구" }]
  });
  const title = field(fixture.root, "title");
  title.value = "ㄱ";
  title.oninput({ target: title });
  title.value = "기록";
  title.oninput({ target: title });
  assert.equal(field(fixture.root, "title"), title, "normal typing keeps the existing title input mounted");
  assert.equal(fixture.controller.values().title, "기록", "normal typing does not lose the latest title value");

  choose(fixture.root, "suggested_domain", ["coding"]);
  assert.equal(fixture.controller.values().suggested_domain, "coding");
  const topicPicker = field(fixture.root, "suggested_topics");
  topicPicker.click();
  assert.ok(pickerSearch(fixture.root, "suggested_topics"), "topic picker opens a search field");
  pickerOption(fixture.root, "typescript").click();
  assert.deepEqual(fixture.controller.values().suggested_topics, ["typescript"]);

  const regionPicker = field(fixture.root, "connections");
  regionPicker.click();
  const regionSearch = pickerSearch(fixture.root, "connections");
  assert.ok(regionSearch, "region picker opens a search field");
  regionSearch.value = "중구";
  regionSearch.oninput({ target: regionSearch });
  assert.ok(pickerOption(fixture.root, "[[PARA/RESOURCES/Auction Regions/서울특별시-중구]]"), "region search keeps the matching option");
  pickerOption(fixture.root, "[[PARA/RESOURCES/Auction Regions/서울특별시-중구]]").click();
  assert.deepEqual(fixture.controller.values().connections, ["[[PARA/RESOURCES/Auction Regions/서울특별시-중구]]"]);
}

async function testRenderedInputEventsSubmitRetryCancelAndEscape() {
  const firstSave = deferred();
  const writes = [];
  const longBody = "긴 한국어 학습 기록을 실제 textarea 입력으로 보존한다. ".repeat(100);
  const fixture = mount({ initialValues: validDraft({ suggested_domain: "", suggested_topics: [], application_contexts: [] }), saveCandidate: async (_app, input) => {
    writes.push(input);
    return writes.length === 1 ? firstSave.promise : { path: "PARA/RESOURCES/Knowledge/Candidates/retry.md", status: "saved" };
  } });

  enter(fixture.root, "title", "렌더링 입력으로 바꾼 제목");
  enter(fixture.root, "statement", "렌더링된 입력 이벤트로 검증과 저장을 확인한다.");
  enter(fixture.root, "body", longBody);
  enter(fixture.root, "reason", "사람이 직접 학습하고 검토할 이유다.");
  enter(fixture.root, "source_note", "");
  form(fixture.root).onsubmit({ preventDefault() {} });
  await flush();
  assert.equal(writes.length, 0, "invalid rendered form never writes");
  assert.match(text(fixture.root), /출처 메모/);
  assert.equal(field(fixture.root, "source_note").focused, true, "invalid rendered input restores focus");

  enter(fixture.root, "source_note", "2026-07-21 렌더링 입력 실습 메모");
  choose(fixture.root, "suggested_domain", ["coding"]);
  choose(fixture.root, "suggested_topics", ["typescript"]);
  enter(fixture.root, "application_trigger", "다음 작성 전");
  enter(fixture.root, "application_contexts", "coding\ncoding/typescript");
  form(fixture.root).onsubmit({ preventDefault() {} });
  assert.equal(field(fixture.root, "title").disabled, true, "pending render disables inputs");
  assert.equal(button(fixture.root, "저장 중…").disabled, true, "pending render disables submit");
  assert.equal(button(fixture.root, "취소").disabled, true, "pending render disables cancel");
  await flush();
  assert.equal(writes.length, 1, "valid rendered form starts exactly one Candidate save");
  assert.equal(button(fixture.root, "저장 중…").click(), false, "disabled pending submit cannot be clicked");
  assert.equal(writes.length, 1, "pending submit click does not double save");
  firstSave.reject(new Error("vault unavailable"));
  await flush();
  assert.match(text(fixture.root), /저장하지 못했습니다/);
  assert.equal(button(fixture.root, "검증 대기에 저장").click(), true, "retry button handles a rendered click");
  await flush();
  assert.equal(writes.length, 2, "retry click saves once after a recoverable failure");
  assert.match(writes[1].reason, /## 학습 기록/);
  assert.match(writes[1].reason, /긴 한국어 학습 기록을 실제 textarea 입력으로 보존한다/);
  assert.ok(button(fixture.root, "검증 대기에서 검토"), "saved render exposes review-only action");

  const cancelled = mount({ initialValues: validDraft({ title: "" }) });
  enter(cancelled.root, "title", "저장하지 않을 렌더링 입력");
  assert.equal(button(cancelled.root, "취소").click(), true, "cancel button handles a rendered click");
  assert.match(text(cancelled.root), /작성 중인 내용/);
  assert.equal(cancelled.calls.length, 0, "dirty cancel never writes");
  form(cancelled.root).onkeydown({ key: "Escape", preventDefault() {} });
  assert.equal(cancelled.root.children.length, 0, "Escape confirms close after dirty cancel");
  assert.equal(cancelled.opener.focused, true, "Escape close restores opener focus");
}

async function testRenderedStaleModalCloseSuppressesLateSave() {
  class FakeModal {
    constructor() { this.contentEl = new FakeElement("div"); this.opened = false; }
    open() { this.opened = true; this.onOpen(); }
    close() { this.opened = false; if (this.onClose) this.onClose(); }
  }
  const late = deferred();
  let writes = 0;
  const modal = view.openDirectAuthoringModal({}, {
    Modal: FakeModal,
    initialValues: validDraft(),
    validate,
    saveCandidate: async () => { writes += 1; return late.promise; }
  });
  enter(modal.contentEl, "title", "닫힌 뒤에는 반영하지 않을 제목");
  form(modal.contentEl).onsubmit({ preventDefault() {} });
  await flush();
  assert.equal(writes, 1, "rendered modal submits one save before close");
  modal.close();
  late.resolve({ path: "PARA/RESOURCES/Knowledge/Candidates/late.md", status: "saved" });
  await flush();
  assert.equal(modal.contentEl.children.length, 0, "closed modal keeps stale result out of the DOM");
  assert.equal(modal.controller.state().saved, false, "closed modal suppresses stale saved state");
}

async function testValidationCancelSuccessAndNavigation() {
  let reviewCalls = 0;
  const fixture = mount({ onReview: async () => { reviewCalls += 1; } });
  fixture.controller.setField("source_note", "");
  assert.equal(await fixture.controller.submit(), false);
  assert.equal(fixture.calls.length, 0, "invalid input never writes");
  assert.match(fixture.controller.state().error, /출처 메모/);
  assert.equal(fixture.controller.state().focus, "source_note");
  fixture.mounted.render();
  assert.equal(field(fixture.root, "source_note").focused, true, "validation focuses the relevant field");
  assert.equal(walk(fixture.root, (item) => item.attr && item.attr.role === "alert").length, 1, "recoverable validation is announced accessibly");

  fixture.controller.setFields(validDraft());
  fixture.controller.setField("application_contexts", "coding/not_registered");
  assert.equal(await fixture.controller.submit(), false);
  assert.equal(fixture.calls.length, 0, "malformed context does not write");
  assert.equal(fixture.controller.state().focus, "application_contexts");
  fixture.controller.setField("application_contexts", "coding\ncoding/typescript");
  assert.equal(await fixture.controller.submit(), true);
  assert.equal(fixture.calls.length, 1, "submit writes exactly one candidate");
  assert.equal(fixture.calls[0].source_type, "manual_study");
  assert.equal(fixture.calls[0].status, "saved");
  assert.equal(fixture.calls[0].suggested_domain, "coding");
  assert.deepEqual(fixture.calls[0].application_contexts, ["coding", "coding/typescript"]);
  assert.match(fixture.controller.state().message, /검증 대기/);
  fixture.mounted.render();
  assert.ok(button(fixture.root, "검증 대기에서 검토"));
  await button(fixture.root, "검증 대기에서 검토").onclick({ preventDefault() {} });
  assert.equal(reviewCalls, 1);

  const cancelled = mount();
  assert.equal(cancelled.controller.cancel(), true);
  assert.equal(cancelled.calls.length, 0, "cancel with no changes has no write");
  assert.equal(cancelled.controller.state().mounted, false);
}

async function testUnavailableStorePreservesDraft() {
  const root = new FakeElement("section");
  const controller = view.createDirectAuthoringController({ app: {}, validate, initialValues: validDraft() });
  view.mountDirectAuthoringView(root, controller);
  assert.equal(await controller.submit(), false);
  assert.match(controller.state().error, /저장소/);
  assert.equal(controller.values().source_note, "2026-07-21 개인 설계 노트와 실습");
}

async function testLongKoreanContentAndModalCleanup() {
  class FakeModal {
    constructor() { this.contentEl = new FakeElement("div"); this.opened = false; }
    open() { this.opened = true; this.onOpen(); }
    close() { this.opened = false; if (this.onClose) this.onClose(); }
  }
  const opener = new FakeElement("button");
  const writes = [];
  const longBody = "긴 한국어 학습 기록을 안전하게 남깁니다. ".repeat(120);
  const modal = view.openDirectAuthoringModal({}, {
    Modal: FakeModal, opener, initialValues: validDraft({ body: longBody }), validate,
    saveCandidate: async (_app, candidate) => { writes.push(candidate); return { path: "PARA/RESOURCES/Knowledge/Candidates/긴 기록.md", status: "saved" }; }
  });
  assert.equal(modal.opened, true);
  assert.match(text(modal.contentEl), /직접 학습한 내용을 사람이 작성/);
  assert.equal(await modal.controller.submit(), true);
  assert.equal(writes.length, 1);
  assert.match(writes[0].reason, /## 학습 기록/);
  assert.match(writes[0].reason, /긴 한국어 학습 기록/);
  modal.close();
  assert.equal(modal.contentEl.children.length, 0, "modal close removes form nodes");
  assert.equal(opener.focused, true, "modal close restores the invoking control focus");
}

async function testPendingFailureRetryAndStaleSuppression() {
  const first = deferred();
  let writes = 0;
  const fixture = mount({ saveCandidate: async () => { writes += 1; return first.promise; } });
  const pending = fixture.controller.submit();
  assert.equal(fixture.controller.state().pending, true);
  assert.equal(await fixture.controller.submit(), false, "a second submit while pending is ignored");
  assert.equal(writes, 1, "double click has one save");
  first.reject(new Error("vault unavailable"));
  assert.equal(await pending, false);
  assert.equal(fixture.controller.state().pending, false);
  assert.match(fixture.controller.state().error, /저장하지 못했습니다/);
  assert.equal(fixture.controller.values().title, "직접 공부한 설계 원칙", "failure preserves values");

  fixture.controller.setSaveCandidate(async () => { writes += 1; return { path: "PARA/RESOURCES/Knowledge/Candidates/retry.md", status: "saved" }; });
  assert.equal(await fixture.controller.submit(), true);
  assert.equal(writes, 2, "retry performs one new writer request after a failed request");

  const late = deferred();
  const stale = mount({ saveCandidate: async () => late.promise });
  const staleSubmit = stale.controller.submit();
  stale.controller.unmount();
  late.resolve({ path: "PARA/RESOURCES/Knowledge/Candidates/late.md", status: "saved" });
  assert.equal(await staleSubmit, false, "unmounted completion is suppressed");
  assert.equal(stale.controller.state().saved, false);
}

function testEscapeDirtyCloseFocusAndCleanup() {
  const fixture = mount();
  fixture.controller.setField("title", "수정 중인 제목");
  let prevented = false;
  fixture.mounted.onKeydown({ key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(fixture.controller.state().mounted, true, "first Escape guards dirty form");
  assert.match(fixture.controller.state().error, /작성 중인 내용/);
  fixture.mounted.onKeydown({ key: "Escape", preventDefault() {} });
  assert.equal(fixture.controller.state().mounted, false, "second Escape confirms close");
  assert.equal(fixture.opener.focused, true, "close returns focus to opener");
  assert.equal(fixture.root.children.length, 0, "unmount cleans rendered DOM");
}

async function main() {
  testLabelsFieldsAndNoAutomationSurface();
  testViewStaysBelowPureLocCeiling();
  testTopicfulTopiclessAndContextEditing();
  testTypingKeepsFocusAndPickersSupportSearchAndSelection();
  await testRenderedInputEventsSubmitRetryCancelAndEscape();
  await testGeneralDraftWithoutClassification();
  await testRenderedStaleModalCloseSuppressesLateSave();
  await testValidationCancelSuccessAndNavigation();
  await testUnavailableStorePreservesDraft();
  await testPendingFailureRetryAndStaleSuppression();
  await testLongKoreanContentAndModalCleanup();
  testEscapeDirtyCloseFocusAndCleanup();
  console.log("Knowledge direct authoring view tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
