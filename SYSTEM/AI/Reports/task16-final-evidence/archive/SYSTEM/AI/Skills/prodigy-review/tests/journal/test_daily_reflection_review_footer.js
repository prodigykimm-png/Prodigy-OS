"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const quality = require(path.join(ROOT, "SYSTEM/Views/evidence-quality-core.js"));
const viewPath = path.join(ROOT, "SYSTEM/Views/daily-reflection-candidate-handoff-view.js");

function createElement(tag, options = {}) {
  return {
    tag,
    text: options.text || "",
    attributes: options.attr || {},
    children: [],
    value: "",
    checked: false,
    disabled: false,
    focused: false,
    style: {},
    empty() { this.children = []; },
    addClass() {},
    focus() { this.focused = true; },
    createEl(childTag, childOptions) {
      const child = createElement(childTag, childOptions);
      this.children.push(child);
      return child;
    }
  };
}

function findElement(element, predicate) {
  if (predicate(element)) return element;
  for (const child of element.children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function loadView() {
  const previous = {
    quality: global.EvidenceQualityCore,
    view: global.DailyReflectionCandidateHandoffView,
    ui: global.ProdigyUI
  };
  global.EvidenceQualityCore = quality;
  delete global.ProdigyUI;
  delete global.DailyReflectionCandidateHandoffView;
  delete require.cache[require.resolve(viewPath)];
  require(viewPath);
  return {
    view: global.DailyReflectionCandidateHandoffView,
    restore() {
      delete require.cache[require.resolve(viewPath)];
      if (previous.quality === undefined) delete global.EvidenceQualityCore;
      else global.EvidenceQualityCore = previous.quality;
      if (previous.view === undefined) delete global.DailyReflectionCandidateHandoffView;
      else global.DailyReflectionCandidateHandoffView = previous.view;
      if (previous.ui === undefined) delete global.ProdigyUI;
      else global.ProdigyUI = previous.ui;
    }
  };
}

function thinProposal() {
  return {
    evidence_blocks: [{ evidence_id: "daily-e01", title: "짧은 기록", experience: "기록했다." }],
    knowledge_candidates: [{ label: "후보", source_evidence_ids: ["daily-e01"] }]
  };
}

async function testRuntimeQualityAndHandoffControls() {
  const loaded = loadView();
  try {
    const card = createElement("div");
    const fields = { context: createElement("input"), interpretation: createElement("textarea"), next_experiment: createElement("textarea") };
    loaded.view.renderEvidenceQuality(card, thinProposal().evidence_blocks[0], fields);
    const improve = findElement(card, (element) => element.tag === "button" && element.text === "Evidence 보완");
    assert.ok(improve, "thin Evidence renders a Korean improvement action");
    improve.onclick();
    assert.equal(fields.context.focused, true, "improvement focuses the first missing Evidence field");

    const proposal = thinProposal();
    const state = loaded.view.createState();
    state.selectedIndexes.add(0);
    const root = createElement("div");
    const notices = [];
    const saves = [];
    let reviews = 0;
    let finishes = 0;
    const options = {
      contentEl: root,
      proposal,
      state,
      savedEvidence: { selectedEvidenceIds: ["daily-e01"], saveResult: {} },
      styleText: ".reflection-review-footer{display:flex}",
      onNotice: (message) => notices.push(message),
      onCancel: () => {},
      onImprove: () => {},
      onFinish: async () => { finishes += 1; },
      onSave: async (payload) => { saves.push(payload); return saves.length === 1 ? { blocked: [{ message: "보관됨" }] } : { saved: [{}] }; },
      onReview: () => { reviews += 1; },
    };
    loaded.view.renderHandoff(options);
    const footer = findElement(root, (element) => element.attributes.class === "reflection-review-footer");
    assert.deepEqual(footer.children.map((element) => element.text), ["취소", "완료", "선택한 후보 저장", "검증 대기 열기"]);
    const save = findElement(root, (element) => element.tag === "button" && element.text === "선택한 후보 저장");
    const review = findElement(root, (element) => element.tag === "button" && element.text === "검증 대기 열기");
    assert.equal(review.disabled, true);
    assert.match(save.attributes.class, /prodigy-btn-primary/, "the post-Evidence save control keeps primary-action semantics");
    assert.equal(save.disabled, false, "a selected Candidate enables the explicit save control");
    await save.onclick();
    assert.equal(saves.length, 0, "thin Evidence is blocked before a human override");
    assert.match(notices[0], /override 사유/);

    const override = findElement(root, (element) => element.attributes["aria-label"] === "daily-e01 보완 필요 근거를 명시적으로 승인");
    override.checked = true;
    override.onchange();
    const note = findElement(root, (element) => element.attributes["aria-label"] === "daily-e01 승인 사유");
    note.value = "직접 확인했다.";
    note.oninput();
    await save.onclick();
    assert.deepEqual(saves[0].selectedKnowledgeCandidateIndexes, [0]);
    assert.deepEqual(saves[0].thinOverrides, { "daily-e01": "직접 확인했다." });
    assert.equal(review.disabled, true, "review opens only after every selected candidate is saved");
    await save.onclick();
    assert.equal(review.disabled, false);
    review.onclick();
    assert.equal(reviews, 1);
    assert.equal(finishes, 0, "a blocked consumer response preserves the handoff state");
  } finally {
    loaded.restore();
  }
}

testRuntimeQualityAndHandoffControls()
  .then(() => console.log("Daily Reflection review footer integration tests passed"))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
