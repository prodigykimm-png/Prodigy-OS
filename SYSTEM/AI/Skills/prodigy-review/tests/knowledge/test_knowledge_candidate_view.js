"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = global.window || {};
require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-core.js"));
require(path.join(ROOT, "SYSTEM/Views/evidence-quality-core.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-view.js"));
const { FakeElement, collectText, findByText } = require("./knowledge_explorer_view_fakes.js");

function candidate(overrides = {}) {
  return {
    type: "knowledge_candidate", candidate_id: "candidate-1", status: "saved", title: "근거 기반 검토", statement: "사람이 검토한 문장", reason: "Daily Evidence에서 제안됨",
    source_type: "daily_evidence", source_evidence_ids: ["daily-2026-07-20-e01"], source_objects: ["[[DAILY/2026-07-20]]"], confidence: "explicit",
    suggested_domain: "coding", suggested_topics: ["typescript"], approval_note: "", promotion_target: "", promoted_knowledge: "", created: "2026-07-20T12:00:00+09:00", updated: "2026-07-20T12:00:00+09:00",
    evidence_quality: { status: "usable" }, path: "PARA/RESOURCES/Knowledge/Candidates/근거 기반 검토.md", ...overrides
  };
}

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function button(root, label) {
  return walk(root, (node) => node.tag === "button" && node.text === label)[0] || null;
}

function input(root, name) {
  return walk(root, (node) => ["input", "textarea"].includes(node.tag) && node.attr && node.attr.name === name)[0] || null;
}

function click(node) {
  let prevented = false;
  node.onclick({ preventDefault() { prevented = true; } });
  return prevented;
}

function testSeparateActiveInboxAndReadableMetadata() {
  const root = new FakeElement("section");
  const actions = [];
  view.renderCandidateInbox(root, {
    candidates: [candidate(), candidate({ candidate_id: "candidate-proposed", status: "proposed", title: "기존 독서 후보" }), candidate({ candidate_id: "candidate-rejected", status: "rejected", title: "종료 후보" })],
    onAction: (action) => actions.push(action)
  });

  const text = collectText(root);
  assert.match(text, /검증 대기 2/);
  assert.match(text, /근거 기반 검토/);
  assert.match(text, /Daily Evidence: daily-2026-07-20-e01/);
  assert.match(text, /출처 Object: \[\[DAILY\/2026-07-20\]\]/);
  assert.match(text, /신뢰도: 명시적/);
  assert.match(text, /제안 경로: 코딩 · typescript/);
  assert.match(text, /근거 품질: 사용 가능/);
  assert.doesNotMatch(text, /종료 후보/);
  assert.ok(findByText(root, "승인"));
  assert.ok(findByText(root, "보류"));
  assert.ok(findByText(root, "반려"));
  assert.equal(click(button(root, "보류")), true);
  assert.deepEqual(actions, [{ type: "defer", candidateId: "candidate-1" }]);
}

function testLoadingEmptyErrorDisabledAndThinRequirements() {
  const loading = new FakeElement("section");
  view.renderCandidateInbox(loading, { phase: "loading" });
  assert.match(collectText(loading), /불러오는 중/);

  const empty = new FakeElement("section");
  view.renderCandidateInbox(empty, { candidates: [] });
  assert.match(collectText(empty), /검토할 활성 후보가 없습니다/);

  const error = new FakeElement("section");
  view.renderCandidateInbox(error, { phase: "error", error: "vault failure", onAction() {} });
  assert.match(collectText(error), /후보를 불러오지 못했습니다/);
  assert.doesNotMatch(collectText(error), /vault failure/);
  assert.ok(button(error, "다시 시도"));

  const disabled = new FakeElement("section");
  view.renderCandidateInbox(disabled, { candidates: [candidate()], disabled: true });
  assert.equal(button(disabled, "승인").disabled, true);

  const thin = new FakeElement("section");
  view.renderCandidateInbox(thin, { candidates: [candidate({ evidence_quality: { status: "thin" } })] });
  assert.match(collectText(thin), /명시적 override와 승인 사유가 필요합니다/);
  assert.ok(input(thin, "thin_override"));
  assert.ok(input(thin, "approval_note"));
}

function testEditAndKeyboardActionsExposeHumanConfirmation() {
  const root = new FakeElement("section");
  const actions = [];
  view.renderCandidateInbox(root, {
    candidates: [candidate()],
    drafts: { "candidate-1": { title: "수정한 제목", statement: "수정한 문장", knowledge_domain: "coding", knowledge_topics: ["typescript"], topics_confirmed: true, approval_note: "사람이 확인함", thin_override: false } },
    onAction: (action) => actions.push(action)
  });
  const approve = button(root, "승인");
  let prevented = false;
  approve.onkeydown({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "approve");
  assert.equal(actions[0].candidateId, "candidate-1");
  assert.deepEqual(actions[0].draft, { title: "수정한 제목", statement: "수정한 문장", knowledge_domain: "coding", knowledge_topics: ["typescript"], topics_confirmed: true, approval_note: "사람이 확인함", thin_override: false });
}

async function testStoreActionsPreserveStateRetryAndTerminalRemoval() {
  let attempts = 0;
  const opened = [];
  const controller = view.createCandidateInboxController({
    app: {}, candidateInbox: { candidates: [candidate()] },
    candidateStore: {
      async approveCandidate(_app, _path, request) {
        attempts += 1;
        assert.equal(request.topics_confirmed, true);
        if (attempts === 1) throw new Error("write failed");
        return { path: "ZETA/PERMANENT/수정한 제목.md" };
      },
      async rejectCandidate() { return candidate({ status: "rejected" }); }
    },
    onOpenBeside: async (target) => opened.push(target)
  });
  const draft = { title: "수정한 제목", statement: "수정한 문장", knowledge_domain: "coding", knowledge_topics: ["typescript"], topics_confirmed: true, approval_note: "사람이 확인함", thin_override: false };

  await controller.renderOptions(false).onAction({ type: "approve", candidateId: "candidate-1", draft });
  await Promise.resolve();
  assert.equal(controller.state().error, true);
  assert.equal(controller.state().candidates.length, 1, "failed approval keeps the candidate and edit state");
  controller.renderOptions(false).onRetry();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(attempts, 2, "retry repeats the same candidate writer request once");
  assert.deepEqual(opened, ["ZETA/PERMANENT/수정한 제목.md"]);
  assert.equal(controller.state().candidates.length, 0, "successful approval removes active candidate from Inbox");

  const terminal = view.createCandidateInboxController({ app: {}, candidateInbox: { candidates: [candidate()] }, candidateStore: { async rejectCandidate() { return candidate({ status: "rejected" }); } } });
  terminal.renderOptions(false).onAction({ type: "reject", candidateId: "candidate-1" });
  await Promise.resolve();
  assert.equal(terminal.state().candidates.length, 0, "terminal rejection removes the candidate");
  terminal.renderOptions(false).onAction({ type: "reject", candidateId: "candidate-1" });
  await Promise.resolve();
  assert.equal(terminal.state().candidates.length, 0, "a removed terminal candidate cannot submit again");
}

async function testApprovalDelegatesEmptyTopicRejectionToStore() {
  let calls = 0;
  const controller = view.createCandidateInboxController({
    app: {}, candidateInbox: { candidates: [candidate()] },
    candidateStore: { async approveCandidate() { calls += 1; throw new Error("Knowledge 제목, 문장, Domain, Topics를 확인해 주세요."); } }
  });

  controller.renderOptions(false).onAction({
    type: "approve", candidateId: "candidate-1",
    draft: { title: "제목", statement: "문장", knowledge_domain: "coding", knowledge_topics: [], topics_confirmed: true, approval_note: "", thin_override: false }
  });
  await Promise.resolve();

  assert.equal(calls, 1, "shared Store must receive and reject the empty Topics request");
  assert.equal(controller.state().error, true);
  assert.equal(controller.state().candidates.length, 1);
}

async function main() {
  testSeparateActiveInboxAndReadableMetadata();
  testLoadingEmptyErrorDisabledAndThinRequirements();
  testEditAndKeyboardActionsExposeHumanConfirmation();
  await testStoreActionsPreserveStateRetryAndTerminalRemoval();
  await testApprovalDelegatesEmptyTopicRejectionToStore();
  console.log("Knowledge candidate view tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
