"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const modulePath = path.join(ROOT, "SYSTEM/Views/daily-reflection-modal.js");
const modalDependencyPaths = [
  "SYSTEM/Views/daily-reflection-modal-styles.js",
  "SYSTEM/Views/daily-reflection-modal-state.js",
  "SYSTEM/Views/daily-reflection-proposal-input-view.js",
  "SYSTEM/Views/daily-reflection-proposal-candidates-view.js",
  "SYSTEM/Views/daily-reflection-evidence-review-view.js",
  "SYSTEM/Views/daily-reflection-candidate-handoff-view.js",
  "SYSTEM/Views/daily-reflection-post-save.js"
].map((relative) => path.join(ROOT, relative));

function testNoModalFailsClosed() {
  const previousWindow = global.window;
  const previousModal = global.DailyReflectionModal;
  const previousOpener = global.openDailyReflectionProposalModal;
  const previousObsidian = global.obsidian;
  const notices = [];
  let confirmed = false;

  try {
    global.window = {
      Notice: class Notice {
        constructor(message) {
          notices.push(message);
        }
      },
      prompt: () => { throw new Error("fallback prompt must not run"); },
      confirm: () => { throw new Error("fallback confirmation must not run"); }
    };
    delete global.obsidian;
    delete global.DailyReflectionModal;
    delete global.openDailyReflectionProposalModal;
    delete require.cache[require.resolve(modulePath)];
    const modal = require(modulePath);

    assert.equal(global.openDailyReflectionProposalModal, modal.openProposeEvidenceModal);

    modal.openProposeEvidenceModal({}, "2026-07-20", async () => { confirmed = true; });

    assert.equal(confirmed, false);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /불러오지 못했습니다/);
  } finally {
    delete require.cache[require.resolve(modulePath)];
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousModal === undefined) delete global.DailyReflectionModal;
    else global.DailyReflectionModal = previousModal;
    if (previousOpener === undefined) delete global.openDailyReflectionProposalModal;
    else global.openDailyReflectionProposalModal = previousOpener;
    if (previousObsidian === undefined) delete global.obsidian;
    else global.obsidian = previousObsidian;
  }
}

function createElement(tag, options = {}) {
  const element = {
    tag,
    children: [],
    attributes: options.attr || {},
    text: options.text || "",
    style: {},
    disabled: false,
    value: "",
    checked: false,
    focused: false,
    empty() { this.children = []; },
    addClass() {},
    appendText(text) { this.text += text; },
    focus() { this.focused = true; },
    createEl(childTag, childOptions) {
      const child = createElement(childTag, childOptions);
      child.parent = this;
      this.children.push(child);
      return child;
    },
    setText(text) { this.text = text; },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  return element;
}

function findElement(element, predicate) {
  if (predicate(element)) return element;
  for (const child of element.children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function createProposal() {
  return {
    provider: "test-provider",
    model: "test-model",
    evidence_blocks: [{
      evidence_id: "daily-2026-07-20-e01",
      title: "증거",
      context: "업무",
      experience: "관찰",
      interpretation: "해석",
      next_experiment: "다음 실험"
    }],
    knowledge_candidates: [{ label: "후보", source_evidence_ids: ["daily-2026-07-20-e01"], confidence: "explicit" }],
    resource_candidates: [],
    object_linking_suggestions: [{ name: "프로젝트", existence: "existing", resolved_path: "PARA/PROJECTS/Project.md", wiki_link: "[[Project]]" }],
    pre_routing_suggestions: [],
    uncertainties: []
  };
}

function createModalHarness(onConfirm, options) {
  const previous = {
    window: global.window,
    notice: global.Notice,
    obsidian: global.obsidian,
    ai: global.DailyReflectionAI,
    providerService: global.ProjectWorkflowDraftService,
    quality: global.EvidenceQualityCore,
    handoff: global.DailyReflectionCandidateHandoffView,
    modal: global.DailyReflectionModal,
    opener: global.openDailyReflectionProposalModal
  };
  let instance;
  const notices = [];
  global.Notice = class Notice { constructor(message) { notices.push(message); } };
  global.window = { Notice: global.Notice };
  global.EvidenceQualityCore = require(path.join(ROOT, "SYSTEM/Views/evidence-quality-core.js"));
  global.ProjectWorkflowDraftService = {
    loadProviderConfig: async () => ({
      defaultProvider: "lm-studio",
      providers: {
        "lm-studio": {
          name: "LM Studio",
          model: "qwen/qwen3.5-9b",
          authMode: "none",
          models: [
            { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B Q4_K_M" },
            { id: "google/gemma-4-12b-qat", label: "Gemma 4 12B QAT" }
          ]
        }
      }
    }),
    listProviderModels: (_providerKey, config) => config.providers["lm-studio"].models,
    discoverProviderModels: async (_app, _providerKey, config) => config.providers["lm-studio"].models,
    saveProviderSettings: async (_app, settings) => settings.config
  };
  modalDependencyPaths.forEach((dependencyPath) => {
    delete require.cache[require.resolve(dependencyPath)];
    require(dependencyPath);
  });
  global.DailyReflectionAI = {
    generateProposal: async () => options && options.testProposal || createProposal(),
    selectEvidenceBlocks: (proposal, selectedIds) => proposal.evidence_blocks.filter((block) => selectedIds.includes(block.evidence_id))
  };
  global.obsidian = {
    Modal: class Modal {
      constructor() { this.contentEl = createElement("div"); }
      open() { instance = this; this.onOpen(); }
      close() { this.closed = true; this.onClose(); }
    }
  };
  delete global.DailyReflectionModal;
  delete global.openDailyReflectionProposalModal;
  delete require.cache[require.resolve(modulePath)];
  const modal = require(modulePath);
  modal.openProposeEvidenceModal({}, "2026-07-20", onConfirm, options);

  async function propose() {
    const reflection = findElement(instance.contentEl, (element) => element.tag === "textarea");
    reflection.value = "오늘의 관찰";
    reflection.oninput();
    const apply = findElement(instance.contentEl, (element) => element.text === "AI 적용");
    await apply.onclick();
  }
  function button(text) {
    const found = findElement(instance.contentEl, (element) => element.tag === "button" && (element.text === text || element.text.includes(text)));
    assert.ok(found, `expected ${text}; notices: ${notices.join(" | ")}`);
    return found;
  }
  function checkbox(label) {
    const found = findElement(instance.contentEl, (element) => element.tag === "input" && element.attributes["aria-label"] === label);
    assert.ok(found, `expected checkbox ${label}`);
    return found;
  }
  function restore() {
    delete require.cache[require.resolve(modulePath)];
    modalDependencyPaths.forEach((dependencyPath) => delete require.cache[require.resolve(dependencyPath)]);
    if (previous.window === undefined) delete global.window;
    else global.window = previous.window;
    if (previous.notice === undefined) delete global.Notice;
    else global.Notice = previous.notice;
    if (previous.obsidian === undefined) delete global.obsidian;
    else global.obsidian = previous.obsidian;
    if (previous.ai === undefined) delete global.DailyReflectionAI;
    else global.DailyReflectionAI = previous.ai;
    if (previous.providerService === undefined) delete global.ProjectWorkflowDraftService;
    else global.ProjectWorkflowDraftService = previous.providerService;
    if (previous.quality === undefined) delete global.EvidenceQualityCore;
    else global.EvidenceQualityCore = previous.quality;
    if (previous.handoff === undefined) delete global.DailyReflectionCandidateHandoffView;
    else global.DailyReflectionCandidateHandoffView = previous.handoff;
    if (previous.modal === undefined) delete global.DailyReflectionModal;
    else global.DailyReflectionModal = previous.modal;
    if (previous.opener === undefined) delete global.openDailyReflectionProposalModal;
    else global.openDailyReflectionProposalModal = previous.opener;
  }
  return { instance, notices, propose, button, checkbox, restore };
}

async function testSharedProviderSettingsSummaryRenders() {
  const harness = createModalHarness(async () => ({}));
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(harness.button("통합 설정 열기"));
    assert.ok(findElement(harness.instance.contentEl, (element) => String(element.text || "").includes("LM Studio")));
    assert.equal(findElement(harness.instance.contentEl, (element) => element.attributes.type === "password"), null);
  } finally {
    harness.restore();
  }
}

async function testEvidenceSavedCallbackContract() {
  const received = [];
  let callbackSawClosed;
  let success;
  success = createModalHarness(async () => ({ path: "DAILY/DAILY/2026-07-20.md" }), {
    onEvidenceSaved: (payload) => {
      callbackSawClosed = success.instance.closed;
      received.push(payload);
    }
  });
  try {
    await success.propose();
    let candidate = success.checkbox("후보 저장 후보 선택");
    assert.equal(candidate.checked, false, "candidate selection defaults to false");
    candidate.checked = true;
    candidate.onchange();
    success.button("다시 입력").onclick();
    await success.propose();
    candidate = success.checkbox("후보 저장 후보 선택");
    assert.equal(candidate.checked, false, "a regenerated proposal clears candidate selection");
    candidate.checked = true;
    candidate.onchange();
    await success.button("Evidence 승인·반영").onclick();
    assert.equal(received.length, 0, "Evidence confirmation alone must not save candidates");
    assert.notEqual(success.instance.closed, true, "candidate handoff remains a separate confirmation");
    await success.button("선택한 후보 저장").onclick();
    assert.equal(received.length, 1);
    assert.deepEqual(Object.keys(received[0]).sort(), [
      "proposal",
      "saveResult",
      "selectedEvidenceIds",
      "selectedKnowledgeCandidateIndexes",
      "selectedObjectPaths",
      "thinOverrides"
    ]);
    assert.deepEqual(received[0].selectedEvidenceIds, ["daily-2026-07-20-e01"]);
    assert.deepEqual(received[0].selectedKnowledgeCandidateIndexes, [0]);
    assert.deepEqual(received[0].selectedObjectPaths, ["PARA/PROJECTS/Project.md"]);
    assert.deepEqual(received[0].thinOverrides, {});
    assert.notEqual(callbackSawClosed, true, "the candidate callback runs before modal close");
    assert.equal(success.instance.closed, true, "the callback runs before the modal closes");
  } finally {
    success.restore();
  }

  const thinReceived = [];
  const thinProposal = createProposal();
  thinProposal.evidence_blocks[0] = { evidence_id: "daily-2026-07-20-e01", title: "보완 필요", experience: "짧은 기록" };
  const thin = createModalHarness(async () => ({}), {
    onEvidenceSaved: (payload) => thinReceived.push(payload),
    testProposal: thinProposal
  });
  try {
    await thin.propose();
    const improve = thin.button("Evidence 보완");
    improve.onclick();
    assert.equal(thinReceived.length, 0, "Evidence 보완 only navigates to the editable Evidence field");
    const selected = thin.checkbox("후보 저장 후보 선택");
    selected.checked = true;
    selected.onchange();
    await thin.button("Evidence 승인·반영").onclick();
    await thin.button("선택한 후보 저장").onclick();
    assert.equal(thinReceived.length, 0, "thin Evidence cannot hand off without human override");
    const override = thin.checkbox("daily-2026-07-20-e01 보완 필요 근거를 명시적으로 승인");
    override.checked = true;
    override.onchange();
    const note = findElement(thin.instance.contentEl, (element) => element.tag === "textarea" && element.attributes["aria-label"] === "daily-2026-07-20-e01 승인 사유");
    note.value = "짧지만 직접 확인했다.";
    note.oninput();
    await thin.button("선택한 후보 저장").onclick();
    assert.deepEqual(thinReceived[0].thinOverrides, { "daily-2026-07-20-e01": "짧지만 직접 확인했다." });
  } finally {
    thin.restore();
  }

  for (const result of [false, new Error("save failed")]) {
    let calls = 0;
    const harness = createModalHarness(async () => {
      if (result instanceof Error) throw result;
      return result;
    }, { onEvidenceSaved: () => { calls += 1; } });
    try {
      await harness.propose();
      await harness.button("Evidence 승인·반영").onclick();
      assert.equal(calls, 0, "a failed save must not notify the handoff consumer");
      assert.notEqual(harness.instance.closed, true, "a failed save leaves the review open");
    } finally {
      harness.restore();
    }
  }

  let cancelCalls = 0;
  const cancel = createModalHarness(async () => ({}), { onEvidenceSaved: () => { cancelCalls += 1; } });
  try {
    cancel.button("취소").onclick();
    assert.equal(cancelCalls, 0, "cancel must not notify the handoff consumer");
  } finally {
    cancel.restore();
  }

  let validationCalls = 0;
  const validation = createModalHarness(async () => ({}), { onEvidenceSaved: () => { validationCalls += 1; } });
  try {
    await validation.propose();
    assert.equal(validationCalls, 0, "an AI response must not notify the handoff consumer");
    validation.button("선택 해제").onclick();
    await validation.button("Evidence 승인·반영").onclick();
    assert.equal(validationCalls, 0, "validation failure must not notify the handoff consumer");
  } finally {
    validation.restore();
  }

  const legacy = createModalHarness(async () => undefined);
  try {
    await legacy.propose();
    await legacy.button("Evidence 승인·반영").onclick();
    assert.equal(legacy.instance.closed, true, "a legacy caller without options still saves and closes");
  } finally {
    legacy.restore();
  }
}

async function main() {
  testNoModalFailsClosed();
  await testSharedProviderSettingsSummaryRenders();
  await testEvidenceSavedCallbackContract();
  console.log("Daily Reflection modal extraction tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
