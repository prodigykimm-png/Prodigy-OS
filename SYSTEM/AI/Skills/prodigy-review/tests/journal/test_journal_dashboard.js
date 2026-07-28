"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const viewPath = path.join(ROOT, "SYSTEM/Views/journal-view.js");

function createElement(tag, options = {}) {
  return {
    tag,
    text: options.text || "",
    attributes: options.attr || {},
    children: [],
    style: {},
    disabled: false,
    empty() { this.children = []; },
    addClass() {},
    setText(text) { this.text = text; },
    setAttribute(name, value) { this.attributes[name] = value; },
    createEl(childTag, childOptions) {
      const child = createElement(childTag, childOptions);
      this.children.push(child);
      return child;
    }
  };
}

function findAll(element, predicate, found = []) {
  if (predicate(element)) found.push(element);
  element.children.forEach((child) => findAll(child, predicate, found));
  return found;
}

function review(status, blockCount = 1) {
  const blocks = Array.from({ length: blockCount }, (_, index) => ({
    evidence_id: `daily-2026-07-20-e${String(index + 1).padStart(2, "0")}`,
    title: `촬영 기록 ${index + 1}`,
    experience: `촬영을 진행했다 ${index + 1}.`,
    legacy: false
  }));
  return {
    path: "DAILY/DAILY/2026-07-20.md",
    exists: true,
    status,
    statusLabel: status === "complete" ? "완료" : "작성 중",
    fields: { reflection: "오늘 기록", change: status === "complete" ? "변화" : "", next_experiment: status === "complete" ? "다음 실험" : "" },
    blocks
  };
}

function loadDashboardHarness({ failCommit = false, blockCount = 1, status = "partial" } = {}) {
  const previous = {
    window: global.window,
    JournalCore: global.JournalCore,
    JournalStore: global.JournalStore,
    ProdigyUI: global.ProdigyUI,
    openDailyReflectionProposalModal: global.openDailyReflectionProposalModal
  };
  const container = createElement("div");
  const modalCalls = [];
  const commitCalls = [];
  const completionCalls = [];
  let currentReview = review(status, blockCount);

  global.window = {};
  global.JournalCore = { todayIsoDate: () => "2026-07-20" };
  global.JournalStore = {
    loadReview: async () => currentReview,
    listRecentReviews: async () => [],
    mergeProposedEvidenceAtCommit: async (_app, _date, proposed, options) => {
      commitCalls.push({ proposed, options });
      if (failCommit) throw new Error("저장 실패");
      const deleted = new Set((options && options.deleteEvidenceIds) || []);
      currentReview = review("complete", 0);
      currentReview.blocks = currentReview.blocks
        .concat(review("partial", blockCount).blocks.filter((block) => !deleted.has(block.evidence_id)))
        .concat(proposed);
      return currentReview;
    },
    appendEvidenceBlock: async () => currentReview,
    markDailyComplete: async (_app, date) => {
      completionCalls.push(date);
      currentReview = review("complete", blockCount);
      return currentReview;
    },
    ensureDailyNote: async () => ({ path: currentReview.path })
  };
  global.ProdigyUI = {
    ensureStyles() {},
    button(parent, text, options = {}) {
      return parent.createEl("button", {
        text,
        attr: { type: "button", class: `prodigy-btn${options.primary ? " prodigy-btn-primary" : ""}` }
      });
    }
  };
  global.openDailyReflectionProposalModal = (...args) => modalCalls.push(args);
  delete require.cache[require.resolve(viewPath)];
  const journalView = require(viewPath);

  return {
    container,
    modalCalls,
    commitCalls,
    completionCalls,
    journalView,
    async render() { await journalView.renderDashboard({}, container); },
    restore() {
      delete require.cache[require.resolve(viewPath)];
      Object.entries(previous).forEach(([key, value]) => {
        if (value === undefined) delete global[key];
        else global[key] = value;
      });
    }
  };
}

async function testManualDailyCompletionAction() {
  const harness = loadDashboardHarness({ status: "partial" });
  try {
    await harness.render();
    const complete = findAll(harness.container, (element) => element.tag === "button" && element.text === "작성 완료")[0];
    assert.ok(complete, "a Daily in progress exposes a direct human completion action");
    await complete.onclick();
    assert.deepEqual(harness.completionCalls, ["2026-07-20"], "the action closes the selected Daily, not an implicit current date");
    assert.equal(findAll(harness.container, (element) => element.tag === "button" && element.text === "작성 완료").length, 0, "a completed Daily no longer offers the completion action");
    assert.ok(findAll(harness.container, (element) => element.text === "완료").length, "the selected Daily rerenders as completed");
  } finally {
    harness.restore();
  }
}

async function testLiteralNewlinesRenderAsLines() {
  const harness = loadDashboardHarness();
  try {
    await harness.render();
    assert.equal(global.JournalDashboardView.displayText("첫 줄\\n둘째 줄"), "첫 줄\n둘째 줄");
  } finally {
    harness.restore();
  }
}

async function testCurrentEvidenceCompletionAction() {
  const harness = loadDashboardHarness({ blockCount: 10 });
  try {
    await harness.render();
    const actions = findAll(harness.container, (element) => element.tag === "button");
    const complete = actions.find((element) => element.text === "일기 쓰기");
    const classify = actions.find((element) => element.text === "AI 분류");
    assert.ok(complete, "every Daily exposes an explicit diary writing action");
    assert.ok(classify, "every Daily exposes an explicit AI classification action");
    assert.match(complete.attributes.class, /prodigy-btn-primary/, "diary writing is the primary current-day action");
    assert.equal(actions.some((element) => /지식/.test(element.text)), false, "Knowledge approval is not presented as the Daily completion action");
    const todayCard = findAll(harness.container, (element) => element.attributes.class === "journal-card")[0];
    const primaryActions = todayCard.children.findIndex((element) => element.attributes.class === "journal-primary-actions prodigy-btn-row");
    const preview = todayCard.children.findIndex((element) => element.attributes.class === "journal-preview");
    assert.ok(primaryActions >= 0 && primaryActions < preview, "the Evidence confirmation action stays above a long block list");

    complete.onclick();
    assert.equal(harness.modalCalls.length, 1, "the completion action opens the existing Daily Evidence flow");
    const [, , confirmEvidence] = harness.modalCalls[0];
    await confirmEvidence([{ evidence_id: "daily-2026-07-20-e01", title: "촬영 기록", experience: "촬영을 진행했다.", change: "변화", next_experiment: "다음 실험" }]);

    const afterConfirm = findAll(harness.container, (element) => element.tag === "button");
    assert.ok(afterConfirm.some((element) => element.text === "일기 쓰기"), "a completed Daily still allows a new diary entry");
    assert.ok(findAll(harness.container, (element) => element.text === "완료").length, "the rerendered current Daily shows completion after Evidence confirmation succeeds");
  } finally {
    harness.restore();
  }
}

async function testFailedEvidenceConfirmationKeepsCompletionAction() {
  const harness = loadDashboardHarness({ failCommit: true });
  try {
    await harness.render();
    const complete = findAll(harness.container, (element) => element.tag === "button" && element.text === "일기 쓰기")[0];
    complete.onclick();
    const [, , confirmEvidence] = harness.modalCalls[0];
    await assert.rejects(
      () => confirmEvidence([{ evidence_id: "daily-2026-07-20-e01", title: "촬영 기록", experience: "촬영을 진행했다." }]),
      /저장 실패/
    );
    assert.ok(findAll(harness.container, (element) => element.tag === "button" && element.text === "일기 쓰기").length, "a failed Evidence save keeps the diary entry action available");
    assert.ok(findAll(harness.container, (element) => element.text === "작성 중").length, "the dashboard does not claim completion on a failed Evidence save");
  } finally {
    harness.restore();
  }
}

async function testStagedEvidenceDeletionWaitsForEvidenceConfirmation() {
  const harness = loadDashboardHarness({ blockCount: 10 });
  try {
    await harness.render();
    const remove = findAll(harness.container, (element) => element.tag === "button" && element.attributes["aria-label"] === "촬영 기록 1 삭제")[0];
    assert.ok(remove, "every visible Evidence block exposes an accessible Korean delete control");
    await remove.onclick();
    assert.equal(harness.commitCalls.length, 0, "staging a delete never writes the Daily note");
    assert.equal(findAll(harness.container, (element) => element.text === "촬영 기록 1").length, 0, "a staged delete is reflected in the current dashboard review state");
    assert.ok(findAll(harness.container, (element) => element.text === "삭제 취소").length, "the user can restore a staged delete before confirmation");

    const complete = findAll(harness.container, (element) => element.tag === "button" && element.text === "일기 쓰기")[0];
    complete.onclick();
    assert.equal(harness.commitCalls.length, 0, "opening then cancelling the review flow leaves the Daily note unwritten");
    const [, , confirmEvidence] = harness.modalCalls[0];
    await confirmEvidence([{ evidence_id: "daily-2026-07-20-e11", title: "새 기록", experience: "새 Evidence" }]);
    assert.equal(harness.commitCalls.length, 1, "Evidence confirmation performs the single pending write");
    assert.deepEqual(harness.commitCalls[0].options.deleteEvidenceIds, ["daily-2026-07-20-e01"], "the confirmed write carries the staged deletion atomically");
    assert.equal(findAll(harness.container, (element) => element.text === "촬영 기록 1").length, 0, "the confirmed dashboard no longer renders the deleted Evidence");
  } finally {
    harness.restore();
  }
}

async function testFailedConfirmationPreservesStagedDeleteWithoutWriting() {
  const harness = loadDashboardHarness({ failCommit: true, blockCount: 2 });
  try {
    await harness.render();
    await findAll(harness.container, (element) => element.attributes["aria-label"] === "촬영 기록 1 삭제")[0].onclick();
    findAll(harness.container, (element) => element.tag === "button" && element.text === "일기 쓰기")[0].onclick();
    const [, , confirmEvidence] = harness.modalCalls[0];
    await assert.rejects(() => confirmEvidence([{ evidence_id: "daily-2026-07-20-e03", title: "새 기록", experience: "새 Evidence" }]), /저장 실패/);
    assert.equal(harness.commitCalls.length, 1, "a failed confirmation attempts no follow-up write");
    assert.equal(findAll(harness.container, (element) => element.text === "작성 중").length, 1, "a failed confirmation never claims Evidence completion");
    assert.equal(findAll(harness.container, (element) => element.text === "촬영 기록 1").length, 0, "the staged deletion remains review-local after an error");
  } finally {
    harness.restore();
  }
}

async function testCompletedEvidenceCanConfirmAStagedDelete() {
  const harness = loadDashboardHarness({ blockCount: 1, status: "complete" });
  try {
    await harness.render();
    assert.ok(findAll(harness.container, (element) => element.text === "일기 쓰기").length, "a completed Daily keeps the diary writing action");
    await findAll(harness.container, (element) => element.attributes["aria-label"] === "촬영 기록 1 삭제")[0].onclick();
    const confirm = findAll(harness.container, (element) => element.tag === "button" && element.text === "증거 변경 검토")[0];
    assert.ok(confirm, "a staged delete re-exposes the Evidence confirmation action for a completed Daily");
    confirm.onclick();
    const [, , confirmEvidence] = harness.modalCalls[0];
    await confirmEvidence([{ evidence_id: "daily-2026-07-20-e02", title: "대체 기록", experience: "대체 Evidence" }]);
    assert.deepEqual(harness.commitCalls[0].options.deleteEvidenceIds, ["daily-2026-07-20-e01"]);
  } finally {
    harness.restore();
  }
}

Promise.resolve()
  .then(testLiteralNewlinesRenderAsLines)
  .then(testManualDailyCompletionAction)
  .then(testCurrentEvidenceCompletionAction)
  .then(testFailedEvidenceConfirmationKeepsCompletionAction)
  .then(testStagedEvidenceDeletionWaitsForEvidenceConfirmation)
  .then(testFailedConfirmationPreservesStagedDeleteWithoutWriting)
  .then(testCompletedEvidenceCanConfirmAStagedDelete)
  .then(() => console.log("Journal dashboard completion tests passed"))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
