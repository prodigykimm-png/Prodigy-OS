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

async function testReadingHistoryShowsOnlyThreeRecentSessions() {
  // Given: Reading has more session records than the compact recent list should show.
  const root = new FakeElement("section");
  let requestedLimit = 0;
  let candidateReads = 0;
  const previousStore = global.ReadingStore;
  const previousCore = global.ReadingCore;
  const previousWindow = global.window;
  global.ReadingCore = {};
  global.ReadingStore = {
    async listSessions(_app, limit) {
      requestedLimit = limit;
      return [
        { date: "2026-08-05", book_title: "다섯째", reading_range: "5장", path: "sessions/5.md" },
        { date: "2026-08-04", book_title: "넷째", reading_range: "4장", path: "sessions/4.md" },
        { date: "2026-08-03", book_title: "셋째", reading_range: "3장", path: "sessions/3.md" },
        { date: "2026-08-02", book_title: "둘째", reading_range: "2장", path: "sessions/2.md" },
        { date: "2026-08-01", book_title: "첫째", reading_range: "1장", path: "sessions/1.md" }
      ];
    },
    async listCandidates() {
      candidateReads += 1;
      return [candidate()];
    }
  };
  global.window = { Notice: function Notice() {} };

  try {
    // When: the Reading history surface renders.
    await view.renderSessionHistory({ workspace: { async openLinkText() {} } }, root);
    const text = collectText(root);

    // Then: Reading owns only the three newest execution records, not the Candidate inbox.
    assert.equal(requestedLimit, 3);
    assert.equal(candidateReads, 0);
    assert.equal((text.match(/세션 열기/g) || []).length, 3);
    assert.match(text, /다섯째/);
    assert.match(text, /셋째/);
    assert.equal(text.includes("둘째"), false);
    assert.equal(text.includes("후보: 근거"), false);
  } finally {
    global.ReadingStore = previousStore;
    global.ReadingCore = previousCore;
    global.window = previousWindow;
  }
}

async function testReadingHistoryKeepsCandidateCreationAsTheHandoff() {
  // Given: Reading has one completed session and a Candidate already owned by Knowledge.
  const root = new FakeElement("section");
  const previousStore = global.ReadingStore;
  const previousCore = global.ReadingCore;
  const previousWindow = global.window;
  global.ReadingCore = {};
  global.ReadingStore = {
    async listSessions() {
      return [{
        date: "2026-08-05",
        book_title: "생각을 만드는 독서",
        reading_range: "1장",
        path: "PARA/RESOURCES/Reading/Sessions/session.md"
      }];
    },
    async listCandidates() { return [candidate()]; }
  };
  global.window = { Notice: function Notice() {} };

  try {
    // When: the Reading history surface renders.
    await view.renderSessionHistory({ workspace: { async openLinkText() {} } }, root);
    const text = collectText(root);

    // Then: it keeps the creation handoff but does not duplicate Knowledge's review queue.
    assert.ok(findByText(root, "지식 후보 만들기"));
    assert.equal(text.includes("Knowledge Explorer에서 검토"), false);
    assert.equal(text.includes("후보: 근거"), false);
  } finally {
    global.ReadingStore = previousStore;
    global.ReadingCore = previousCore;
    global.window = previousWindow;
  }
}

async function main() {
  testCandidateProjectionPreservesLifecycleAndExcludesKnowledge();
  testDeferredCandidateStaysVisibleWithoutApprovalOrPromotion();
  await testReadingHistoryShowsOnlyThreeRecentSessions();
  await testReadingHistoryKeepsCandidateCreationAsTheHandoff();
  console.log("Reading Candidate lifecycle tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
