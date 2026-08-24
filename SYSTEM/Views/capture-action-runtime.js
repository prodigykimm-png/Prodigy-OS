(function (root) {
  "use strict";
  if (root.CaptureActionRuntime && root.CaptureActionRuntime.runtime_version === "capture_runtime_v4") {
    if (typeof module !== "undefined" && module.exports) module.exports = root.CaptureActionRuntime;
    return;
  }

  const CAPABILITY_TTL_MS = 5000;
  const documentOwners = new WeakMap();
  const intentOwners = new WeakMap();
  const capabilityOwners = new WeakMap();
  let pendingInteraction = null;
  let ownerSequence = 0;

  function contract() { const value = root.CaptureStateContract || (typeof require === "function" ? require("./capture-state-contract.js") : null); if (!value) throw new Error("CaptureStateContract is unavailable."); return value; }
  function writer() { const value = root.CaptureAuthorizedWriter || (typeof require === "function" ? require("./capture-authorized-writer.js") : null); if (!value) throw new Error("CaptureAuthorizedWriter is unavailable."); return value; }
  function isTrustedEvent(event) {
    if (!event || event.isTrusted !== true) return false;
    if (typeof root.Event === "function" && !(event instanceof root.Event)) return false;
    if (event.type === "click") return true;
    return event.type === "keydown" && (event.key === "Enter" || event.key === " ");
  }
  function eventBelongsToOwner(event, owner) {
    if (!owner.active) return false;
    if (owner.root === owner.document) return true;
    return Boolean(event && event.target && owner.root && typeof owner.root.contains === "function" && owner.root.contains(event.target));
  }
  function observeDocument(record, event) {
    if (!isTrustedEvent(event)) return;
    pendingInteraction = null;
    let selected = null;
    record.owners.forEach((owner) => { if (eventBelongsToOwner(event, owner)) selected = owner; });
    if (selected) pendingInteraction = { event, owner: selected, used: false };
  }
  function inertOwner() { return Object.freeze({ active: false, session_id: null, dispose() { return false; } }); }

  /** Register trusted interaction observation under an explicit mount scope. */
  function mountTrustedInteractions(options) {
    const input = options || {};
    const documentRef = input.document || (input.root && input.root.ownerDocument) || null;
    const mountRoot = input.root || null;
    const scope = input.scope || null;
    if (!documentRef || !mountRoot || typeof documentRef.addEventListener !== "function" || typeof documentRef.removeEventListener !== "function") return inertOwner();
    if (!scope || typeof scope.track !== "function" || (scope.signal && scope.signal.aborted) || scope.disposed === true) return inertOwner();

    let record = documentOwners.get(documentRef);
    if (!record) {
      record = { document: documentRef, owners: new Set(), click: null, keydown: null };
      record.click = (event) => observeDocument(record, event);
      record.keydown = (event) => observeDocument(record, event);
      let clickRegistered = false;
      try {
        documentRef.addEventListener("click", record.click, true); clickRegistered = true;
        documentRef.addEventListener("keydown", record.keydown, true);
      } catch (error) {
        if (clickRegistered) documentRef.removeEventListener("click", record.click, true);
        throw error;
      }
      documentOwners.set(documentRef, record);
    }
    const token = Object.freeze({ kind: "capture_mount_owner_v1", id: `capture_mount_${++ownerSequence}`, session_id: String(input.session_id || `mount-${ownerSequence}`), human_id: `local-human@${String(input.session_id || `mount-${ownerSequence}`)}` });
    const owner = { token, root: mountRoot, document: documentRef, record, active: true, handle: null };
    record.owners.add(owner);
    function dispose() {
      if (!owner.active) return false;
      owner.active = false;
      if (pendingInteraction && pendingInteraction.owner === owner) pendingInteraction = null;
      contract().deactivateTrustedOwner(token);
      record.owners.delete(owner);
      if (!record.owners.size) {
        documentRef.removeEventListener("click", record.click, true);
        documentRef.removeEventListener("keydown", record.keydown, true);
        if (documentOwners.get(documentRef) === record) documentOwners.delete(documentRef);
      }
      return true;
    }
    owner.handle = Object.freeze({ get active() { return owner.active; }, session_id: token.session_id, dispose });
    try { contract().activateTrustedOwner(token); scope.track(dispose); }
    catch (error) { dispose(); throw error; }
    return owner.handle;
  }

  function stable(value) { return contract().stable(value); }
  function sha256(value) { return contract().sha256(value); }
  function hashCanonical(value) { return sha256(stable(value)); }
  function hashPayload(target, payload) { return contract().hashPayload(target, payload); }

  /** Consume one trusted event observed for one live mount. */
  function humanConfirmation(actionId, sessionId, callerActorMetadata) {
    if (callerActorMetadata !== undefined) throw new Error("Caller actor metadata is forbidden; trusted UI owns actor identity.");
    const action = String(actionId || "").trim(); const session = String(sessionId || "").trim();
    if (!action || !session) throw new Error("Capture action and session binding are required.");
    const pending = pendingInteraction; pendingInteraction = null;
    if (!pending || pending.used || !pending.owner.active || !isTrustedEvent(pending.event)) throw new Error("A trusted explicit interaction from a live mount is required.");
    pending.used = true;
    const intent = contract().createTrustedIntent(pending.event, action, session, pending.owner.token);
    intentOwners.set(intent, pending.owner);
    return intent;
  }

  function bindTrustedConfirmation(intent, proposal, binding) {
    const owner = intentOwners.get(intent);
    if (!owner || !owner.active) throw new Error("Trusted mount owner is inactive or disposed.");
    const capability = contract().bindTrustedConfirmation(intent, proposal, binding, owner.token);
    capabilityOwners.set(capability, owner);
    return capability;
  }

  async function prepareProposal(input) {
    if (!input || typeof input.readRevision !== "function") throw new Error("Capture proposal requires a revision reader.");
    if (Object.hasOwn(input, "payload_hash")) throw new Error("Caller-supplied payload_hash is forbidden.");
    const target = String(input.target_path || ""); const observed = await input.readRevision(target);
    const operation = input.operation || (observed == null ? "create" : "update");
    const payloadHash = hashPayload(target, input.payload);
    return contract().createProposal({
      operation, target_path: target, payload: input.payload,
      source_evidence: [{ source_id: String(input.source_id || "explicit-human-input"), locator: String(input.locator || `ui:${input.action_id}`) }],
      rollback_identity: { rollback_id: `capture_rollback_${sha256(stable({ target, payload_hash: payloadHash, operation })).slice(0,24)}`, before_revision: observed == null ? "absent" : String(observed) }
    });
  }

  async function prepareHumanReview(input, human) {
    const proposal = await prepareProposal(input);
    const owner = intentOwners.get(human);
    if (!owner || !owner.active) throw new Error("Trusted mount owner is inactive or disposed.");
    return contract().beginTrustedReview(proposal, human, { action_id: input.action_id, session_id: human.session_id }, owner.token, proposal.rollback_identity.before_revision);
  }

  async function executeHumanConfirmed(input, adapter) {
    const proposal = input && input.proposal;
    contract().validateRecord(proposal);
    const owner = capabilityOwners.get(input && input.human);
    if (!owner || !owner.active) throw new Error("Trusted mount owner is inactive or disposed.");
    const authorized = contract().authorizeTrustedConfirmation(proposal, input.human, input.action_id, input.session_id, owner.token);
    return writer().writeAuthorizedCapture(authorized, adapter);
  }

  function decideHumanReview(review, human, actionId, decision) {
    const owner = intentOwners.get(human);
    if (!owner || !owner.active) throw new Error("Trusted mount owner is inactive or disposed.");
    return contract().decideTrustedReview(review, human, { action_id: actionId, session_id: human.session_id }, owner.token, decision);
  }

  async function confirmHumanReview(review, human, actionId, adapter) {
    const confirmation = bindTrustedConfirmation(human, review, { action_id: actionId, session_id: human && human.session_id });
    return executeHumanConfirmed({ proposal: review, human: confirmation, action_id: actionId, session_id: confirmation.session_id }, adapter);
  }

  function renderReview(container, review, handlers) {
    contract().validateRecord(review);
    if (!container || typeof container.createDiv !== "function" || review.state !== "human_review") throw new Error("Capture review requires a rendered human_review container.");
    const controls = handlers || {}; if (typeof container.empty === "function") container.empty();
    const panel = container.createDiv({ attr: { class: "capture-human-review", "data-capture-state": "human_review", role: "region", "aria-label": "Capture 변경 내용 검토", style: "max-width:100%;min-width:0;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:10px;" } });
    panel.createEl("h3", { text: "생성 확인", attr: { style: "margin:0 0 4px;font-size:var(--ke-type-title, 1.1em);" } });
    const payload = review.payload || {};
    const displayName = payload.name || payload.title || review.target_path.split("/").pop().replace(/\.md$/i, "");
    const card = panel.createDiv({ attr: { class: "prodigy-utility-card", style: "padding:12px 14px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control, 8px);background:var(--background-secondary, var(--background-primary));" } });
    card.createEl("div", { text: `「${displayName}」 생성을 진행할까요?`, attr: { style: "font-weight:700;font-size:var(--ke-type-body, 1em);margin-bottom:6px;" } });
    card.createEl("div", { text: `대상 파일: ${review.target_path}`, attr: { style: "font-size:var(--ke-type-label, 0.85em);color:var(--text-muted);" } });

    const metaDetails = panel.createEl("details", { attr: { style: "font-size:var(--ke-type-label, 0.8em);color:var(--text-muted);margin:4px 0;" } });
    metaDetails.createEl("summary", { text: "기술 메타데이터 (SHA-256 / Proposal)", attr: { style: "cursor:pointer;" } });
    const metaBody = metaDetails.createDiv({ attr: { style: "margin-top:6px;padding:8px;background:var(--background-primary);border-radius:var(--ke-radius-control, 4px);border:1px solid var(--background-modifier-border);" } });
    metaBody.createEl("p", { text: `상태: ${review.state} · 작업: ${review.operation}`, attr: { class: "capture-review-state", style: "margin:2px 0;" } });
    metaBody.createEl("p", { text: `대상: ${review.target_path}`, attr: { class: "capture-review-target", style: "margin:2px 0;" } });
    metaBody.createEl("pre", { text: stable(review.payload), attr: { class: "capture-review-payload", tabindex: "0", "aria-label": "정확한 Capture payload", style: "max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;max-height:120px;font-size:0.85em;" } });
    metaBody.createEl("p", { text: `제안: ${review.proposal_id}`, style: "margin:2px 0;" });
    metaBody.createEl("p", { text: `SHA-256: ${review.payload_hash}`, style: "margin:2px 0;" });
    metaBody.createEl("p", { text: `현재 revision / conflict 기준: ${review.approval_evidence.review.current_revision}`, style: "margin:2px 0;" });

    const actions = panel.createDiv({ attr: { class: "capture-review-actions", style: "display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:8px;" } });
    const add = (label, name, primary) => { const button = actions.createEl("button", { text: label, attr: { type: "button", class: primary ? "mod-cta" : "", style: "min-height:38px;padding:6px 16px;border-radius:var(--ke-radius-control, 8px);" } }); button.onclick = (event) => controls[name] && controls[name](event, review); return button; };
    const rendered = Object.freeze({ panel, confirm: add("확인", "confirm", true), reject: add("거절", "reject", false), cancel: add("취소", "cancel", false) });
    if (rendered.confirm && typeof rendered.confirm.focus === "function") rendered.confirm.focus();
    return rendered;
  }

  function requestReviewConfirmation(review, actionId) {
    const Modal = root.obsidian && root.obsidian.Modal || root.Modal;
    if (typeof Modal !== "function") return Promise.reject(new Error("Rendered Capture review UI is unavailable."));
    return new Promise((resolve) => {
      class CaptureReviewModal extends Modal {
        onOpen() {
          this.scope = { track(fn) { (this._cleanups = this._cleanups || []).push(fn); }, dispose() { (this._cleanups || []).splice(0).reverse().forEach(fn => { try { fn(); } catch (_) {} }); } };
          mountTrustedInteractions({ root: this.contentEl, document: this.contentEl.ownerDocument || root.document || (typeof document !== "undefined" ? document : null), scope: this.scope, session_id: String(actionId || "capture-review") });
          renderReview(this.contentEl, review, {
            confirm: () => { const human = humanConfirmation(actionId, review.approval_evidence.review.session_id); this.close(); resolve(human); },
            reject: () => { decideHumanReview(review, humanConfirmation(actionId, review.approval_evidence.review.session_id), actionId, "reject"); this.close(); resolve(null); },
            cancel: () => { decideHumanReview(review, humanConfirmation(actionId, review.approval_evidence.review.session_id), actionId, "cancel"); this.close(); resolve(null); }
          });
        }
        onClose() {
          if (this.scope && typeof this.scope.dispose === "function") this.scope.dispose();
          if (this.contentEl && typeof this.contentEl.empty === "function") this.contentEl.empty();
        }
      }
      new CaptureReviewModal(root.app).open();
    });
  }

  const api = Object.freeze({ runtime_version: "capture_runtime_v4", CAPABILITY_TTL_MS, mountTrustedInteractions, stable, sha256, hashCanonical, hashPayload, humanConfirmation, bindTrustedConfirmation, prepareProposal, prepareHumanReview, executeHumanConfirmed, confirmHumanReview, decideHumanReview, renderReview, requestReviewConfirmation });
  root.CaptureActionRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
