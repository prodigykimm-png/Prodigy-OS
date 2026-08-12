(function (root) {
  "use strict";
  if (root.CaptureStateContract && root.CaptureStateContract.implementation_version === "capture_state_v4") {
    if (typeof module !== "undefined" && module.exports) module.exports = root.CaptureStateContract;
    return;
  }

  const CAPTURE_STATES = Object.freeze(["capture_started", "ai_proposal", "human_review", "human_confirmed", "object_committed", "rejected", "cancelled", "no_change", "stale", "conflict", "error"]);
  const CAPTURE_EVENTS = Object.freeze(["propose", "begin_review", "confirm", "commit", "reject", "cancel", "mark_no_change", "mark_stale", "mark_conflict", "fail"]);
  const TERMINAL_STATES = Object.freeze(["object_committed", "rejected", "cancelled", "no_change", "stale", "conflict", "error"]);
  const OPERATIONS = Object.freeze(["create", "update"]);
  const HASH = /^[0-9a-f]{64}$/;
  const TRANSITIONS = deepFreeze({
    capture_started: { propose: "ai_proposal", cancel: "cancelled", mark_stale: "stale", fail: "error" },
    ai_proposal: { begin_review: "human_review", cancel: "cancelled", mark_no_change: "no_change", mark_stale: "stale", mark_conflict: "conflict", fail: "error" },
    human_review: { confirm: "human_confirmed", reject: "rejected", cancel: "cancelled", mark_no_change: "no_change", mark_stale: "stale", mark_conflict: "conflict", fail: "error" },
    human_confirmed: { commit: "object_committed", cancel: "cancelled", mark_stale: "stale", mark_conflict: "conflict", fail: "error" },
    object_committed: {}, rejected: {}, cancelled: {}, no_change: {}, stale: {}, conflict: {}, error: {}
  });
  const issuedAuthorities = new WeakSet();
  const trustedIntents = new WeakMap();
  const boundConfirmations = new WeakMap();
  const consumedIntents = new WeakSet();
  const consumedConfirmations = new WeakSet();
  const activeOwners = new WeakSet();
  const CAPABILITY_TTL_MS = 5000;
  let capabilitySequence = 0;

  function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.keys(value).forEach((key) => deepFreeze(value[key])); return Object.freeze(value); }
  function clone(value) { if (value === undefined) throw new Error("Capture data cannot contain undefined values."); let text; try { text = JSON.stringify(value); } catch (_) { throw new Error("Capture data must be serializable."); } if (text === undefined) throw new Error("Capture data must be serializable."); return JSON.parse(text); }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function required(value, name) { const text = clean(value); if (!text) throw new Error(`${name} is required.`); return text; }
  function timestamp(value, name) { const text = required(value, name); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) throw new Error(`${name} must be an explicit UTC timestamp.`); return text; }
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function stable(value) { if (value === undefined) throw new Error("Capture payload cannot contain undefined."); if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; throw new Error("Capture payload must be JSON-compatible."); }
  function sha256(value) { if (typeof require === "function") { try { return require("node:crypto").createHash("sha256").update(String(value), "utf8").digest("hex"); } catch (_) { /* browser */ } } const bytes = unescape(encodeURIComponent(String(value))); const words = []; const bitLength = bytes.length * 8; for (let i = 0; i < bytes.length; i += 1) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8); words[bitLength >> 5] |= 0x80 << (24 - bitLength % 32); words[((bitLength + 64 >> 9) << 4) + 15] = bitLength; const K = [], H = []; const primes = []; for (let n = 2; primes.length < 64; n += 1) { if (!primes.some((p) => n % p === 0)) { primes.push(n); if (H.length < 8) H.push((Math.sqrt(n) * 0x100000000) | 0); K.push((Math.cbrt(n) * 0x100000000) | 0); } } const w = new Array(64); for (let offset = 0; offset < words.length; offset += 16) { const old = H.slice(); for (let i = 0; i < 64; i += 1) { const x = w[i - 15], y = w[i - 2]; w[i] = i < 16 ? (words[offset + i] | 0) : (((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3)) + w[i - 7] + ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ (y >>> 10)) + w[i - 16]) | 0; const e = H[4], a = H[0]; const t1 = (H[7] + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & H[5]) ^ (~e & H[6])) + K[i] + w[i]) | 0; const t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]))) | 0; H.unshift((t1 + t2) | 0); H[4] = (H[4] + t1) | 0; H.pop(); } for (let i = 0; i < 8; i += 1) H[i] = (H[i] + old[i]) | 0; } return H.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join(""); }
  function hashPayload(target, payload) { return sha256(stable({ target_path: validateTargetPath(target), payload })); }
  function validateTargetPath(value) { const target = required(value, "target_path").replace(/\\/g, "/"); if (target.startsWith("/") || target.includes("../") || target.includes("\0") || !/\.(md|json)$/i.test(target)) throw new Error("target_path must be a vault-relative Markdown or JSON path."); return target; }
  function noUnknown(value, path) { if (value === undefined) throw new Error(`Unknown value is forbidden at ${path}.`); if (typeof value === "string" && /^(unknown|inferred|n\/a|tbd|미상|알\s*수\s*없음)$/i.test(value.trim())) throw new Error(`Unknown value is forbidden at ${path}.`); if (Array.isArray(value)) value.forEach((item, i) => noUnknown(item, `${path}[${i}]`)); else if (plain(value)) Object.keys(value).forEach((key) => noUnknown(value[key], `${path}.${key}`)); }
  function rollback(value, operation) { const input = value || {}; const before = required(input.before_revision, "rollback_identity.before_revision").toLowerCase(); if (operation === "create" && before !== "absent") throw new Error("Create rollback identity must use before_revision: absent."); if (operation === "update" && !HASH.test(before)) throw new Error("Update rollback identity requires an exact before_revision hash."); return deepFreeze({ rollback_id: required(input.rollback_id, "rollback_identity.rollback_id"), before_revision: before }); }
  function evidence(value) { if (!Array.isArray(value) || !value.length) throw new Error("source_evidence is required."); return value.map((item, i) => deepFreeze({ source_id: required(item && item.source_id, `source_evidence[${i}].source_id`), locator: required(item && item.locator, `source_evidence[${i}].locator`) })); }

  function createProposal(input) {
    const source = input || {};
    if (Object.hasOwn(source, "payload_hash")) throw new Error("Caller-supplied payload_hash is forbidden; Capture computes it internally.");
    const operation = clean(source.operation); if (!OPERATIONS.includes(operation)) throw new Error(`Unknown Capture operation: ${operation || "(empty)"}.`);
    const target = validateTargetPath(source.target_path); const payload = clone(source.payload); noUnknown(payload, "payload"); const payloadHash = hashPayload(target, payload);
    const sourceEvidence = evidence(source.source_evidence); const seed = sha256(stable({ operation, target, payload_hash: payloadHash, source_evidence: sourceEvidence }));
    return deepFreeze({ contract_version: "capture_approval_v3", proposal_id: `capture_proposal_${seed.slice(0,24)}`, state: "capture_started", operation, target_path: target, payload_hash: payloadHash, payload, source_evidence: sourceEvidence, rollback_identity: rollback(source.rollback_identity, operation), approval_evidence: { review: null, confirmation: null }, authorization: null, write_receipt: null, terminal_evidence: null });
  }
  function validateRecord(record) { if (!record || record.contract_version !== "capture_approval_v3") throw new Error("Invalid Capture contract version."); parseState(record.state); if (hashPayload(record.target_path, record.payload) !== record.payload_hash) throw new Error("Capture payload binding mismatch."); rollback(record.rollback_identity, record.operation); return record; }
  function parseState(value) { const state = clean(value); if (!CAPTURE_STATES.includes(state)) throw new Error(`Unknown Capture state: ${state || "(empty)"}.`); return state; }
  function parseEvent(value) { const event = clean(value && value.type); if (!CAPTURE_EVENTS.includes(event)) throw new Error(`Unknown Capture event: ${event || "(empty)"}.`); return event; }
  function apply(record, type, patch) { validateRecord(record); const nextState = TRANSITIONS[record.state] && TRANSITIONS[record.state][type]; if (!nextState) throw new Error(`Invalid Capture transition: ${record.state} -> ${type}.`); return deepFreeze(Object.assign({}, record, patch || {}, { state: nextState })); }
  function systemTransition(record, event) { const type = parseEvent(event); if (["propose", "begin_review", "confirm", "commit"].includes(type)) throw new Error("Trusted review or writer transition required."); const terminal = ["cancel", "reject", "mark_no_change", "mark_stale", "mark_conflict", "fail"].includes(type) ? deepFreeze({ event: type, actor_type: "system", actor_id: "capture-system", occurred_at: timestamp(event.occurred_at, "occurred_at"), reason: required(event.reason || type, "reason") }) : record.terminal_evidence; return apply(record, type, { terminal_evidence: terminal }); }
  function writerTransition(record, event) { const type = parseEvent(event); if (type === "commit") return apply(record, type, { write_receipt: deepFreeze(clone(event.receipt)) }); throw new Error("Unknown writer transition."); }
  function trustedEvent(event) {
    if (!event || event.isTrusted !== true) return false;
    if (typeof root.Event === "function" && !(event instanceof root.Event)) return false;
    return event.type === "click" || (event.type === "keydown" && (event.key === "Enter" || event.key === " "));
  }
  function fresh(capturedAt) { const age = Date.now() - capturedAt; if (age > CAPABILITY_TTL_MS || age < -1000) throw new Error("Trusted explicit interaction expired."); }
  function activateTrustedOwner(owner) {
    if (!owner || typeof owner !== "object") throw new Error("Trusted mount owner is required.");
    activeOwners.add(owner); return true;
  }
  function deactivateTrustedOwner(owner) { if (!owner || typeof owner !== "object") return false; return activeOwners.delete(owner); }
  function assertActiveOwner(owner) { if (!owner || !activeOwners.has(owner)) throw new Error("Trusted mount owner is inactive or disposed."); }
  function createTrustedIntent(event, actionId, sessionId, owner) {
    assertActiveOwner(owner);
    if (!trustedEvent(event)) throw new Error("A trusted explicit interaction is required.");
    const action = required(actionId, "action_id"); const session = required(sessionId, "session_id");
    const eventTime = Number(event.timeStamp); const capturedAt = Number.isFinite(eventTime) && eventTime > 1e12 ? eventTime : Date.now(); fresh(capturedAt);
    const intentId = sha256(`${action}:${session}:${capturedAt}:${++capabilitySequence}`).slice(0,24);
    const intent = Object.freeze({ kind: "capture_ui_intent_v2", action_id: action, session_id: session });
    trustedIntents.set(intent, { action_id: action, session_id: session, captured_at: capturedAt, capability_id: intentId, owner: owner, human_id: required(owner.human_id, "human_id") });
    return intent;
  }
  function consumeIntent(intent, owner, binding) {
    const proof = trustedIntents.get(intent);
    if (!proof || consumedIntents.has(intent)) throw new Error("Trusted UI intent is forged or already consumed.");
    if (proof.owner !== owner) throw new Error("Trusted mount owner binding mismatch.");
    assertActiveOwner(owner); fresh(proof.captured_at);
    if (required(binding && binding.action_id, "action_id") !== proof.action_id) throw new Error("Capture action binding mismatch.");
    if (required(binding && binding.session_id, "session_id") !== proof.session_id) throw new Error("Capture session binding mismatch.");
    consumedIntents.add(intent); return proof;
  }
  function beginTrustedReview(record, intent, binding, owner, currentRevision) {
    validateRecord(record); const proof = consumeIntent(intent, owner, binding);
    const occurredAt = new Date(proof.captured_at).toISOString();
    const proposed = apply(record, "propose");
    return apply(proposed, "begin_review", { approval_evidence: { review: deepFreeze({ review_id: `review_${proof.capability_id}`, reviewer_type: "human", reviewer_id: proof.human_id, reviewed_at: occurredAt, session_id: proof.session_id, proposal_id: record.proposal_id, target_path: record.target_path, payload_hash: record.payload_hash, current_revision: currentRevision == null ? "absent" : String(currentRevision) }), confirmation: null } });
  }
  function decideTrustedReview(record, intent, binding, owner, decision) {
    validateRecord(record); if (record.state !== "human_review") throw new Error("Capture decision requires human_review.");
    const proof = consumeIntent(intent, owner, binding); const type = decision === "reject" ? "reject" : decision === "cancel" ? "cancel" : "";
    if (!type) throw new Error("Unknown human review decision.");
    return apply(record, type, { terminal_evidence: deepFreeze({ event: type, actor_type: "human", actor_id: proof.human_id, occurred_at: new Date(proof.captured_at).toISOString(), reason: type, review_id: record.approval_evidence.review.review_id }) });
  }
  function bindTrustedConfirmation(intent, record, binding, owner) {
    validateRecord(record); if (record.state !== "human_review" || !record.approval_evidence.review) throw new Error("Capture confirmation requires a rendered human_review record.");
    const proof = consumeIntent(intent, owner, binding);
    if (proof.session_id !== record.approval_evidence.review.session_id) throw new Error("Capture review session binding mismatch.");
    const capability = Object.freeze({ kind: "capture_ui_confirmation_capability_v3", action_id: proof.action_id, session_id: proof.session_id });
    boundConfirmations.set(capability, Object.assign({}, proof, { review_id: record.approval_evidence.review.review_id, proposal_id: record.proposal_id, target_path: record.target_path, payload_hash: record.payload_hash }));
    return capability;
  }
  function authorizeTrustedConfirmation(record, capability, actionId, sessionId, owner) {
    const proof = boundConfirmations.get(capability); validateRecord(record);
    if (!proof) throw new Error("Trusted confirmation capability is required; plain JSON and copies are forbidden.");
    if (proof.owner !== owner) throw new Error("Trusted mount owner binding mismatch."); assertActiveOwner(owner);
    if (consumedConfirmations.has(capability)) throw new Error("Trusted confirmation capability was already consumed."); fresh(proof.captured_at);
    if (required(actionId, "action_id") !== proof.action_id) throw new Error("Capture action binding mismatch.");
    if (required(sessionId, "session_id") !== proof.session_id) throw new Error("Capture session binding mismatch.");
    const review = record.approval_evidence.review;
    if (!review || proof.review_id !== review.review_id || record.proposal_id !== proof.proposal_id || record.target_path !== proof.target_path || record.payload_hash !== proof.payload_hash) throw new Error("Capture review/proposal/target/payload binding mismatch.");
    consumedConfirmations.add(capability); const occurredAt = new Date(proof.captured_at).toISOString();
    const confirmed = apply(record, "confirm", { approval_evidence: { review, confirmation: deepFreeze({ confirmation_id: `confirmation_${proof.capability_id}`, review_id: review.review_id, confirmer_type: "human", confirmer_id: proof.human_id, confirmed_at: occurredAt, session_id: proof.session_id, proposal_id: record.proposal_id, target_path: record.target_path, payload_hash: record.payload_hash, current_revision: review.current_revision }) } });
    const authorized = deepFreeze(Object.assign({}, confirmed, { authorization: { authorization_id: `authorization_${proof.capability_id}`, authorized_at: occurredAt, session_id: proof.session_id, review_id: review.review_id, proposal_id: record.proposal_id, target_path: record.target_path, payload_hash: record.payload_hash, rollback_id: record.rollback_identity.rollback_id } }));
    issuedAuthorities.add(authorized); return authorized;
  }
  function assertWriteAuthority(record) { validateRecord(record); if (record.state !== "human_confirmed" || !issuedAuthorities.has(record)) throw new Error("Capture write requires trusted human_confirmed authority."); const auth = record.authorization; if (!auth || auth.proposal_id !== record.proposal_id || auth.target_path !== record.target_path || auth.payload_hash !== record.payload_hash || auth.rollback_id !== record.rollback_identity.rollback_id) throw new Error("Capture write authorization binding is invalid."); return true; }

  const api = Object.freeze({ implementation_version: "capture_state_v4", contract_version: "capture_approval_v3", CAPABILITY_TTL_MS, CAPTURE_STATES, CAPTURE_EVENTS, TERMINAL_STATES, OPERATIONS, TRANSITIONS, stable, sha256, hashPayload, parseState, parseEvent, createProposal, validateRecord, systemTransition, writerTransition, activateTrustedOwner, deactivateTrustedOwner, createTrustedIntent, beginTrustedReview, decideTrustedReview, bindTrustedConfirmation, authorizeTrustedConfirmation, assertWriteAuthority });
  root.CaptureStateContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
