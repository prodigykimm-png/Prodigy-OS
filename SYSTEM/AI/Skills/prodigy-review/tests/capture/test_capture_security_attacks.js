"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../..");

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.isTrusted = options.isTrusted === true;
    this.timeStamp = options.timeStamp == null ? Date.now() : options.timeStamp;
    this.key = options.key || "";
  }
}
const listeners = new Map();
const previousEvent = global.Event;
const previousDocument = global.document;
global.Event = FakeEvent;
global.document = {
  addEventListener(type, listener) { listeners.set(type, listener); },
  removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); }
};

const contract = require(path.join(ROOT, "SYSTEM/Views/capture-state-contract.js"));
const writer = require(path.join(ROOT, "SYSTEM/Views/capture-authorized-writer.js"));
const runtime = require(path.join(ROOT, "SYSTEM/Views/capture-action-runtime.js"));
const captureCleanups = [];
const captureOwner = runtime.mountTrustedInteractions({ root: global.document, document: global.document, scope: { track(cleanup) { captureCleanups.push(cleanup); } }, session_id: "capture-security-test" });

function dispatchTrusted(type = "click", options = {}) {
  const event = new FakeEvent(type, { isTrusted: true, ...options });
  const listener = listeners.get(type);
  assert.equal(typeof listener, "function", `trusted ${type} listener installed`);
  listener(event);
  return event;
}
function proposalInput(overrides = {}) {
  return {
    action_id: "security-create",
    operation: "create",
    target_path: "ZETA/FLEETING/security.md",
    payload: { type: "fleeting_note", title: "Security" },
    source_id: "security-test",
    locator: "test:explicit-click",
    readRevision: async () => null,
    ...overrides
  };
}
async function reviewedProposal(overrides = {}, session = "session-a") {
  dispatchTrusted();
  const human = runtime.humanConfirmation("security-create", session);
  return runtime.prepareHumanReview(proposalInput(overrides), human);
}
async function trustedApproval(proposal, action = "security-create", session) {
  const boundSession = session || proposal.approval_evidence.review.session_id;
  dispatchTrusted();
  const intent = runtime.humanConfirmation(action, boundSession);
  return runtime.bindTrustedConfirmation(intent, proposal, { action_id: action, session_id: boundSession });
}
function memoryAdapter(options = {}) {
  let revision = options.before == null ? null : options.before;
  let calls = 0;
  let content = null;
  let lastRequest = null;
  return {
    get calls() { return calls; },
    get lastRequest() { return lastRequest; },
    async readRevision() { return revision; },
    async writeCanonical(request) {
      lastRequest = request;
      writer.assertCanonicalWriteRequest(request, revision);
      calls += 1;
      content = request.payload;
      revision = runtime.hashCanonical(content);
      if (options.returnPath) return { path: options.returnPath, revision };
      if (options.returnRevision) return { path: request.target_path, revision: options.returnRevision };
      return { path: request.target_path, revision };
    },
    async readCanonical(target) {
      if (options.rereadRevision) return { path: target, revision: options.rereadRevision, value: content };
      return { path: target, revision, value: content };
    }
  };
}

async function main() {
  assert.equal(runtime.sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(runtime.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

  const proposal = await reviewedProposal();
  assert.equal(proposal.payload_hash, runtime.hashPayload(proposal.target_path, proposal.payload));
  assert.notEqual(proposal.payload_hash, runtime.hashCanonical(proposal.payload), "target participates in payload binding");
  assert.throws(() => contract.createProposal({ ...proposalInput(), payload_hash: "f".repeat(64), rollback_identity: { rollback_id: "x", before_revision: "absent" }, source_evidence: [{ source_id: "x", locator: "x" }] }), /caller-supplied payload_hash/i);
  assert.equal(contract.installApprovalBroker, undefined, "approval broker is not a public API");
  assert.throws(() => contract.createTrustedIntent({ type: "click", isTrusted: true }, "security-create", "session-a"), /trusted explicit interaction|mount owner/i);

  assert.throws(() => runtime.humanConfirmation("security-create", "session-a"), /trusted explicit interaction/i);
  const fakeListener = listeners.get("click");
  fakeListener(new FakeEvent("click", { isTrusted: false }));
  assert.throws(() => runtime.humanConfirmation("security-create", "session-a"), /trusted explicit interaction/i);

  dispatchTrusted("click", { timeStamp: Date.now() - runtime.CAPABILITY_TTL_MS - 1 });
  assert.throws(() => runtime.humanConfirmation("security-create", "session-a"), /expired/i);

  const approval = await trustedApproval(proposal);
  const copied = JSON.parse(JSON.stringify(approval));
  const ioCopied = memoryAdapter();
  await assert.rejects(() => runtime.executeHumanConfirmed({ proposal, human: copied, action_id: "security-create", session_id: "session-a" }, ioCopied), /trusted confirmation capability|mount owner/i);
  assert.equal(ioCopied.calls, 0);

  const otherProposal = await reviewedProposal({ target_path: "ZETA/FLEETING/other.md" });
  const crossIo = memoryAdapter();
  await assert.rejects(() => runtime.executeHumanConfirmed({ proposal: otherProposal, human: approval, action_id: "security-create", session_id: "session-a" }, crossIo), /proposal|target|binding/i);
  assert.equal(crossIo.calls, 0);

  const sessionIo = memoryAdapter();
  await assert.rejects(() => trustedApproval(proposal, "security-create", "session-b"), /session/i);
  assert.equal(sessionIo.calls, 0);

  const modelIo = memoryAdapter();
  dispatchTrusted();
  assert.throws(() => runtime.humanConfirmation("security-create", "session-model", { actor: "model" }), /caller actor|actor metadata/i);
  assert.equal(modelIo.calls, 0);

  const forgedAuthorityIo = memoryAdapter();
  const forgedAuthority = Object.freeze({ ...proposal, state: "human_confirmed", authorization: { authorization_id: "forged" } });
  await assert.rejects(() => writer.writeAuthorizedCapture(forgedAuthority, forgedAuthorityIo), /trusted human_confirmed/i);
  assert.equal(forgedAuthorityIo.calls, 0);

  const goodApproval = await trustedApproval(proposal);
  const goodIo = memoryAdapter();
  const written = await runtime.executeHumanConfirmed({ proposal, human: goodApproval, action_id: "security-create", session_id: "session-a" }, goodIo);
  assert.equal(written.record.state, "object_committed");
  assert.equal(goodIo.calls, 1);
  assert.equal(Object.hasOwn(written.receipt, "payload"), false);
  assert.throws(() => writer.assertCanonicalWriteRequest(goodIo.lastRequest, written.receipt.written_revision), /already consumed/i);
  await assert.rejects(() => runtime.executeHumanConfirmed({ proposal, human: goodApproval, action_id: "security-create", session_id: "session-a" }, memoryAdapter()), /consumed/i);

  // Deterministic concurrency barrier: both approvals are valid; one adapter call wins.
  const concurrentProposal = await reviewedProposal({ target_path: "ZETA/FLEETING/concurrent.md" }, "concurrent-a");
  const approvalA = await trustedApproval(concurrentProposal, "security-create", "concurrent-a");
  const approvalB = await trustedApproval(concurrentProposal, "security-create", "concurrent-a");
  let releaseWrite;
  const barrier = new Promise((resolve) => { releaseWrite = resolve; });
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  let concurrentCalls = 0;
  let concurrentRevision = null;
  let concurrentValue = null;
  const concurrentAdapter = {
    readRevision: async () => concurrentRevision,
    writeCanonical: async (request) => {
      writer.assertCanonicalWriteRequest(request, concurrentRevision);
      concurrentCalls += 1;
      entered();
      await barrier;
      concurrentValue = request.payload;
      concurrentRevision = runtime.hashCanonical(concurrentValue);
      return { path: request.target_path, revision: concurrentRevision };
    },
    readCanonical: async (target) => ({ path: target, revision: concurrentRevision, value: concurrentValue })
  };
  const first = runtime.executeHumanConfirmed({ proposal: concurrentProposal, human: approvalA, action_id: "security-create", session_id: "concurrent-a" }, concurrentAdapter);
  await enteredPromise;
  const second = await runtime.executeHumanConfirmed({ proposal: concurrentProposal, human: approvalB, action_id: "security-create", session_id: "concurrent-a" }, concurrentAdapter);
  releaseWrite();
  const firstResult = await first;
  assert.equal(firstResult.record.state, "object_committed");
  assert.ok(["conflict", "stale"].includes(second.record.state));
  assert.equal(concurrentCalls, 1);

  const wrongPathProposal = await reviewedProposal({ target_path: "ZETA/FLEETING/wrong-path.md" });
  const wrongPathIo = memoryAdapter({ returnPath: "ZETA/FLEETING/elsewhere.md" });
  const wrongPath = await runtime.executeHumanConfirmed({ proposal: wrongPathProposal, human: await trustedApproval(wrongPathProposal), action_id: "security-create", session_id: "session-a" }, wrongPathIo);
  assert.equal(wrongPath.record.state, "conflict");
  assert.equal(wrongPath.receipt, null);
  assert.equal(wrongPathIo.calls, 1, "wrong returned path is one attempted canonical mutation and zero accepted committed writes");

  const wrongHashProposal = await reviewedProposal({ target_path: "ZETA/FLEETING/wrong-hash.md" });
  const wrongHashIo = memoryAdapter({ returnRevision: "0".repeat(64) });
  const wrongHash = await runtime.executeHumanConfirmed({ proposal: wrongHashProposal, human: await trustedApproval(wrongHashProposal), action_id: "security-create", session_id: "session-a" }, wrongHashIo);
  assert.equal(wrongHash.record.state, "conflict");
  assert.equal(wrongHash.receipt, null);
  assert.equal(wrongHashIo.calls, 1, "wrong returned revision is one attempted canonical mutation and zero accepted committed writes");

  const rereadProposal = await reviewedProposal({ target_path: "ZETA/FLEETING/reread-mismatch.md" });
  const rereadIo = memoryAdapter({ rereadRevision: "9".repeat(64) });
  const rereadMismatch = await runtime.executeHumanConfirmed({ proposal: rereadProposal, human: await trustedApproval(rereadProposal), action_id: "security-create", session_id: "session-a" }, rereadIo);
  assert.equal(rereadMismatch.record.state, "conflict");
  assert.equal(rereadMismatch.receipt, null);
  assert.equal(rereadIo.calls, 1, "reread mismatch is one attempted canonical mutation and zero accepted committed writes");

  // TOCTOU inside mutation boundary: expected revision assertion rejects before canonical call.
  const before = "1".repeat(64);
  const updateProposal = await reviewedProposal({ operation: "update", target_path: "ZETA/FLEETING/update.md", readRevision: async () => before });
  const updateApproval = await trustedApproval(updateProposal);
  let toctouCalls = 0;
  const changed = "2".repeat(64);
  const toctou = await runtime.executeHumanConfirmed({ proposal: updateProposal, human: updateApproval, action_id: "security-create", session_id: "session-a" }, {
    readRevision: async () => before,
    writeCanonical: async (request) => { writer.assertCanonicalWriteRequest(request, changed); toctouCalls += 1; },
    readCanonical: async () => ({ path: updateProposal.target_path, revision: changed })
  });
  assert.equal(toctou.record.state, "conflict");
  assert.equal(toctouCalls, 0);

  console.log("Capture security attacks passed: forged=0 expired=0 cross=0 reused=0 concurrent=1 TOCTOU=0 accepted writes.");
}

main().finally(() => {
  captureOwner.dispose();
  global.Event = previousEvent;
  global.document = previousDocument;
}).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
