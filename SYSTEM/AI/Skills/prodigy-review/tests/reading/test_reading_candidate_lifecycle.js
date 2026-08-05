"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const workspace = require(path.join(ROOT, "SYSTEM/Views/reading-workspace-core.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/reading-view.js"));
const { FakeElement, collectText, findByText } = require("./reading_memory_view_fakes.js");

function candidate(overrides = {}) {
  return {
    type: "knowledge_candidate",
    candidate_id: "reading-candidate-1",
    status: "saved",
    title: "회상은 이해를 오래 남긴다",
    statement: "읽은 뒤 회상하면 이해가 오래 유지된다.",
    reason: "독서 세션에서 확인했다.",
    source_type: "reading_session",
    source_objects: ["[[PARA/RESOURCES/Reading/Sessions/2026-07-20 - Reading - Session]]"],
    confidence: "explicit",
    created: "2026-07-20T12:00:00+09:00",
    path: "PARA/RESOURCES/Knowledge/Candidates/회상.md",
    ...overrides
  };
}

function testCandidateProjectionPreservesLifecycleAndExcludesKnowledge() {
  // Given: canonical saved and legacy proposed Candidates plus a terminal Candidate.
  const saved = candidate();
  const legacy = candidate({
    candidate_id: "legacy-reading-candidate",
    status: "proposed",
    source_session: "[[PARA/PROJECTS/Reading/Sessions/legacy]]",
    source_objects: [],
    confidence: "low",
    path: "ZETA/FLEETING/Knowledge Candidates/legacy.md"
  });
  const rejected = candidate({ candidate_id: "rejected-reading-candidate", status: "rejected" });

  // When: Reading projects the shared lifecycle for its workspace summary.
  const projected = workspace.buildKnowledgeCandidates([saved, legacy, rejected]);

  // Then: both active shapes remain visible with their source session and quality availability,
  // while neither becomes Knowledge or history data.
  assert.equal(projected.empty, false);
  assert.equal(projected.items.length, 2);
  assert.deepEqual(projected.items.map((item) => item.status), ["saved", "proposed"]);
  assert.equal(projected.items[0].source_session, saved.source_objects[0]);
  assert.equal(projected.items[0].quality.status, "usable");
  assert.equal(projected.items[1].source_session, legacy.source_session);
  assert.equal(projected.items[1].quality.status, "thin");
  assert.equal(projected.counts_as_knowledge, false);
  assert.equal(projected.items.every((item) => item.counts_as_knowledge === false), true);
  assert.deepEqual(workspace.buildHistory([saved, legacy, rejected]).items, []);
}

function testDeferredCandidateStaysVisibleWithoutApprovalOrPromotion() {
  // Given: the shared Candidate contract keeps needs_more_evidence active and the
  // Reading store returns it for `status: "active"`.
  const saved = candidate();
  const deferred = candidate({
    candidate_id: "deferred-reading-candidate",
    status: "needs_more_evidence",
    confidence: "inferred",
    path: "PARA/RESOURCES/Knowledge/Candidates/보류.md"
  });

  // When: Reading projects the active lifecycle set for its workspace summary.
  const projected = workspace.buildKnowledgeCandidates([saved, deferred]);

  // Then: the deferred Candidate stays visible with its registry label, out of
  // Knowledge, and without any promotion or approval affordance.
  assert.equal(projected.items.length, 2);
  assert.deepEqual(projected.items.map((item) => item.status), ["saved", "needs_more_evidence"]);
  const deferredItem = projected.items.find((item) => item.status === "needs_more_evidence");
  assert.equal(deferredItem.status_label, "증거 보강");
  assert.equal(deferredItem.counts_as_knowledge, false);
  assert.equal(deferredItem.review_target, "HUB/50 Knowledge.md");
  assert.equal(Object.prototype.hasOwnProperty.call(deferredItem, "promotion_target"), false);
  assert.deepEqual(workspace.buildHistory([saved, deferred]).items, []);
}

async function testDeferredCandidateRendersDeferredLabelInReadingHistory() {
  // Given: the Reading store hands the view one deferred active Candidate.
  const root = new FakeElement("section");
  const previousStore = global.ReadingStore;
  const previousCore = global.ReadingCore;
  const previousWindow = global.window;
  global.ReadingCore = {};
  global.ReadingStore = {
    async listSessions() { return []; },
    async listCandidates() {
      return [candidate({ candidate_id: "deferred-view-candidate", status: "needs_more_evidence", confidence: "inferred" })];
    }
  };
  global.window = { Notice: function Notice() {} };

  try {
    // When: the Reading history surface renders that Candidate.
    await view.renderSessionHistory({ workspace: { async openLinkText() {} } }, root);
    const text = collectText(root);

    // Then: the deferred state is named instead of mislabeled as a fresh proposal,
    // and Reading still owns no approval control.
    assert.match(text, /증거 보강/);
    assert.equal(text.includes("제안됨"), false);
    assert.equal(text.includes("승인"), false);
  } finally {
    global.ReadingStore = previousStore;
    global.ReadingCore = previousCore;
    global.window = previousWindow;
  }
}

async function testReadingHistoryNavigatesToSharedInboxWithoutApprovalControls() {
  // Given: Reading can load a shared active Candidate but cannot itself approve it.
  const root = new FakeElement("section");
  const opened = [];
  const notices = [];
  const previousStore = global.ReadingStore;
  const previousCore = global.ReadingCore;
  const previousWindow = global.window;
  global.ReadingCore = {};
  global.ReadingStore = {
    async listSessions() { return []; },
    async listCandidates() { return [candidate()]; }
  };
  global.window = { Notice: function Notice(message) { notices.push(message); } };
  const app = { workspace: { async openLinkText(link) { opened.push(link); } } };

  try {
    // When: the Reading history surface renders and the review handoff is chosen.
    await view.renderSessionHistory(app, root);
    const text = collectText(root);
    await findByText(root, "Knowledge Explorer에서 검토").onclick();

    // Then: it shows source/quality context, delegates to the Explorer, and owns no approval UI.
    assert.match(text, /저장됨/);
    assert.match(text, /출처 세션/);
    assert.match(text, /근거 품질: 사용 가능/);
    assert.equal(text.includes("승인"), false);
    assert.equal(text.includes("거절"), false);
    assert.deepEqual(opened, ["HUB/50 Knowledge"]);

    // When: Explorer navigation is unavailable.
    await view.openKnowledgeExplorer({ workspace: {} });

    // Then: Reading gives a compact, recoverable route without mutating the Candidate.
    assert.deepEqual(notices, ["Knowledge Explorer를 열 수 없습니다. HUB/50 Knowledge.md에서 검토해 주세요."]);
  } finally {
    global.ReadingStore = previousStore;
    global.ReadingCore = previousCore;
    global.window = previousWindow;
  }
}

async function main() {
  testCandidateProjectionPreservesLifecycleAndExcludesKnowledge();
  testDeferredCandidateStaysVisibleWithoutApprovalOrPromotion();
  await testReadingHistoryNavigatesToSharedInboxWithoutApprovalControls();
  await testDeferredCandidateRendersDeferredLabelInReadingHistory();
  console.log("Reading Candidate lifecycle tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
