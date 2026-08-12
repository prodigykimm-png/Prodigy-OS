"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../..");
class FakeEvent { constructor() { this.type = "click"; this.isTrusted = true; this.timeStamp = Date.now(); } }
const listeners = new Map();
global.Event = FakeEvent;
global.document = { addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); } };
const contract = require(path.join(ROOT, "SYSTEM/Views/capture-state-contract.js"));
const writer = require(path.join(ROOT, "SYSTEM/Views/capture-authorized-writer.js"));
const runtime = require(path.join(ROOT, "SYSTEM/Views/capture-action-runtime.js"));
const captureOwner = runtime.mountTrustedInteractions({ root: global.document, document: global.document, scope: { track() {} }, session_id: "capture-state-test" });

function intent(action, session) { listeners.get("click")(new FakeEvent()); return runtime.humanConfirmation(action, session); }
function proposalInput(target, payload = { type: "people", name: "Alice", phone: "" }, before = null) {
  return { action_id: "state-test", operation: before ? "update" : "create", target_path: target, payload, source_id: "state-test", locator: "test:explicit", readRevision: async () => before };
}
async function proposal(target, payload, before) {
  const input = proposalInput(target, payload, before);
  return runtime.prepareHumanReview(input, intent("state-test", `review-${target}`));
}
function bind(uiIntent, record, action = "state-test") { return runtime.bindTrustedConfirmation(uiIntent, record, { action_id: action, session_id: uiIntent.session_id }); }
function adapter(before = null, options = {}) {
  let revision = before; let value = null; let calls = 0;
  return {
    get calls() { return calls; },
    readRevision: async () => revision,
    writeCanonical: async (request) => {
      writer.assertCanonicalWriteRequest(request, options.toctou || revision);
      calls += 1;
      if (options.error) throw options.error;
      value = request.payload; revision = runtime.hashCanonical(value);
      return { path: options.path || request.target_path, revision: options.revision || revision };
    },
    readCanonical: async (target) => ({ path: target, revision, value })
  };
}
async function execute(record, _session, io) {
  const session = record.approval_evidence.review.session_id;
  const capability = bind(intent("state-test", session), record);
  return runtime.executeHumanConfirmed({ proposal: record, human: capability, action_id: "state-test", session_id: session }, io);
}
async function main() {
  assert.deepEqual(contract.CAPTURE_STATES, ["capture_started", "ai_proposal", "human_review", "human_confirmed", "object_committed", "rejected", "cancelled", "no_change", "stale", "conflict", "error"]);
  assert.equal(contract.TRANSITIONS.human_review.confirm, "human_confirmed");
  assert.equal(contract.TRANSITIONS.human_confirmed.commit, "object_committed");
  const started = await runtime.prepareProposal(proposalInput("PARA/RESOURCES/CONTACTS/Alice.md"));
  assert.equal(started.state, "capture_started");
  const proposed = await proposal("PARA/RESOURCES/CONTACTS/Alice.md");
  assert.equal(proposed.state, "human_review");
  assert.equal(Object.isFrozen(proposed), true);
  assert.equal(proposed.payload_hash, runtime.hashPayload(proposed.target_path, proposed.payload));
  assert.match(proposed.approval_evidence.review.review_id, /^review_/);
  assert.equal(proposed.approval_evidence.review.reviewer_type, "human");
  assert.equal(proposed.approval_evidence.review.reviewer_id, "local-human@capture-state-test");
  assert.equal(proposed.approval_evidence.review.proposal_id, proposed.proposal_id);
  assert.equal(proposed.approval_evidence.review.target_path, proposed.target_path);
  assert.equal(proposed.approval_evidence.review.payload_hash, proposed.payload_hash);
  assert.equal(proposed.approval_evidence.review.current_revision, "absent");

  const io = adapter();
  const result = await execute(proposed, "happy-session", io);
  assert.equal(result.record.state, "object_committed");
  assert.equal(io.calls, 1);
  assert.equal(result.receipt.target_path, proposed.target_path);
  assert.equal(result.receipt.payload_hash, proposed.payload_hash);
  assert.equal(result.receipt.approval_evidence.review.reviewer_type, "human");
  assert.equal(result.receipt.approval_evidence.confirmation.confirmer_type, "human");
  assert.equal(result.receipt.approval_evidence.confirmation.confirmer_id, proposed.approval_evidence.review.reviewer_id);
  assert.equal(result.receipt.approval_evidence.confirmation.review_id, proposed.approval_evidence.review.review_id);
  assert.equal(result.receipt.approval_evidence.confirmation.proposal_id, proposed.proposal_id);
  assert.equal(result.receipt.approval_evidence.confirmation.target_path, proposed.target_path);
  assert.equal(result.receipt.approval_evidence.confirmation.payload_hash, proposed.payload_hash);
  assert.equal(result.receipt.approval_evidence.confirmation.current_revision, "absent");
  assert.equal(result.receipt.authorization_id.startsWith("authorization_"), true);
  assert.deepEqual(result.receipt.rollback_identity, proposed.rollback_identity);
  assert.equal(Object.hasOwn(result.receipt, "payload"), false);
  assert.equal(JSON.stringify(result.receipt).includes("phone"), false);

  for (const [type, state] of [["cancel", "cancelled"], ["mark_no_change", "no_change"], ["mark_stale", "stale"], ["mark_conflict", "conflict"], ["fail", "error"]]) {
    const record = await proposal(`ZETA/FLEETING/${state}.md`, { title: state });
    const terminal = contract.systemTransition(record, { type, occurred_at: new Date().toISOString(), reason: state });
    assert.equal(terminal.state, state);
    const denied = adapter();
    await assert.rejects(() => writer.writeAuthorizedCapture(terminal, denied), /human_confirmed authority/i);
    assert.equal(denied.calls, 0);
  }

  const rejectedReview = await proposal("ZETA/FLEETING/rejected.md", { title: "rejected" });
  const rejectedSession = rejectedReview.approval_evidence.review.session_id;
  const rejected = runtime.decideHumanReview(rejectedReview, intent("state-test", rejectedSession), "state-test", "reject");
  assert.equal(rejected.state, "rejected");
  assert.equal(adapter().calls, 0);

  assert.throws(() => contract.parseState("approved"), /unknown capture state/i);
  assert.throws(() => contract.systemTransition(proposed, { type: "confirm", occurred_at: new Date().toISOString(), reason: "forged" }), /trusted review/i);
  assert.equal(contract.installApprovalBroker, undefined, "approval broker is not public");

  const staleBefore = "1".repeat(64);
  const staleProposal = await proposal("ZETA/FLEETING/stale-write.md", { title: "stale" }, staleBefore);
  const staleIo = adapter("2".repeat(64));
  const stale = await execute(staleProposal, "stale-session", staleIo);
  assert.equal(stale.record.state, "stale");
  assert.equal(stale.receipt, null);
  assert.equal(staleIo.calls, 0);

  const conflictProposal = await proposal("ZETA/FLEETING/conflict.md", { title: "conflict" });
  const conflictIo = adapter(); conflictIo.detectConflict = async () => ({ conflict: true, reason: "fixture" });
  const conflict = await execute(conflictProposal, "conflict-session", conflictIo);
  assert.equal(conflict.record.state, "conflict");
  assert.equal(conflictIo.calls, 0);

  const errorProposal = await proposal("ZETA/FLEETING/error-write.md", { title: "error" });
  const errorIo = adapter(null, { error: new Error("disk unavailable") });
  await assert.rejects(() => execute(errorProposal, "error-session", errorIo), (error) => {
    assert.match(error.message, /disk unavailable/);
    assert.equal(error.capture_record.state, "error");
    assert.equal(error.capture_record.rollback_identity.rollback_id, errorProposal.rollback_identity.rollback_id);
    return true;
  });
  assert.equal(errorIo.calls, 1, "one failed attempt and no retry");

  const bypassProposal = await proposal("ZETA/FLEETING/bypass.md", { title: "bypass" });
  const bypassSession = bypassProposal.approval_evidence.review.session_id;
  const bypassCapability = bind(intent("state-test", bypassSession), bypassProposal);
  let bypassCalls = 0;
  const bypass = await runtime.executeHumanConfirmed({ proposal: bypassProposal, human: bypassCapability, action_id: "state-test", session_id: bypassSession }, {
    readRevision: async () => null,
    writeCanonical: async (request) => { bypassCalls += 1; return { path: request.target_path, revision: "3".repeat(64) }; },
    readCanonical: async (target) => ({ path: target, revision: "3".repeat(64), bytes: "not-authorized" })
  });
  assert.equal(bypass.record.state, "conflict");
  assert.equal(bypass.receipt, null);
  assert.equal(bypassCalls, 1, "adapter mutation is never accepted without expected-revision assertion");

  console.log("Capture approval state machine passed: 1 happy write, terminal/stale/conflict zero writes, no retries.");
}
main().finally(() => captureOwner.dispose()).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
