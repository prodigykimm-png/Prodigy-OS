(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;
  const hashApi = root.LLMWikiHash;
  const bundleApi = root.LLMWikiProposalBundle || (typeof require === "function" ? require("./llmwiki-proposal-bundle.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);

  const PACKET_VERSION = "llmwiki_approval_packet_v1";
  const TRUST_STATE = "proposal_unverified";
  const APPROVAL_STATE = "requires_human_approval";
  const KNOWLEDGE_PREFIX = "PARA/RESOURCES/Knowledge/";
  const ACTION_FIELDS = Object.freeze({
    approve_selected: new Set(["action", "packet_hash", "selection_ids", "rejected_ids"]),
    approve_all: new Set(["action", "packet_hash"]),
    evidence_more: new Set(["action", "packet_hash"]),
    reject: new Set(["action", "packet_hash"]),
    edit_then_approve: new Set(["action", "packet_hash", "selection_ids", "edits"]),
  });
  const EDIT_FIELDS = new Set(["title", "claims", "diff", "dispute", "abstention_reason", "no_change_reason"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function clone(value) {
    if (operationApi?.isOperationRecord?.(value)) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    const result = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    for (const [key, item] of Object.entries(value)) Object.defineProperty(result, key, { value: clone(item), enumerable: true, writable: true, configurable: true });
    return result;
  }
  function freeze(value) {
    if (operationApi?.isOperationRecord?.(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) {
    if (hashApi && typeof hashApi.sha256 === "function") return hashApi.sha256(String(value));
    if (!crypto) throw new Error("crypto unavailable");
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function fail(field, reason, extras = {}) {
    return freeze({ ok: false, field, reason, write_counters: writeCounters(), ...(plain(extras) ? extras : {}) });
  }
  function writeCounters() {
    return {
      canonical: 0,
      audit: 0,
      refresh: 0,
      candidate: 0,
      object: 0,
      people: 0,
      venue: 0,
      index: 0,
      memory: 0,
      feedback: 0,
      provider: 0,
      network: 0,
      git: 0,
      validation_workspace: 0,
    };
  }
  function uniqueSorted(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(trim).filter(Boolean))].sort();
  }
  function hasDuplicate(values) {
    if (!Array.isArray(values)) return false;
    const seen = new Set();
    for (const value of values) {
      const id = trim(value);
      if (seen.has(id)) return true;
      seen.add(id);
    }
    return false;
  }
  function startsKnowledgePath(value) {
    return typeof value === "string" && value.startsWith(KNOWLEDGE_PREFIX) && !value.includes("..") && !value.includes("[[") && !value.includes("]]");
  }
  function citationEvidence(citation) {
    return {
      source_id: citation.source_id,
      content_hash: citation.content_hash,
      source_url: citation.source_url || null,
      locators: Array.isArray(citation.locators) ? citation.locators.slice() : [citation.locator].filter(Boolean),
      source_archive_id: citation.source_archive_id || null,
      confidence: citation.confidence,
    };
  }
  function hasFailure(value) { return plain(value) && value.ok === false; }

  function normalizeBundle(envelope) {
    if (!plain(envelope) || !plain(envelope.proposal_bundle)) return fail("bundle", "malformed_bundle");
    const bundle = envelope.proposal_bundle;
    const validatedOperations = new Map();
    if (Array.isArray(bundle.proposals)) {
      for (const proposal of bundle.proposals) {
        if (!plain(proposal) || !Object.hasOwn(proposal, "operation")) continue;
        if (!operationApi || typeof operationApi.parseOperation !== "function") return fail("operation", "operation_contract_unavailable");
        const parsed = operationApi.parseOperation(proposal.operation);
        if (!parsed || parsed.ok === false) return parsed || fail("operation", "malformed_operation");
        validatedOperations.set(proposal, parsed.value);
      }
    }
    const proposals = Array.isArray(bundle.proposals) ? bundle.proposals.map((proposal) => {
      if (!plain(proposal)) return proposal;
      const copy = clone(proposal);
      if (validatedOperations.has(proposal)) copy.operation = validatedOperations.get(proposal);
      if (copy.target === null) delete copy.target;
      if (copy.target_revision === null) delete copy.target_revision;
      delete copy.proposal_id;
      return copy;
    }) : bundle.proposals;
    if (Array.isArray(proposals)) {
      for (const proposal of proposals) {
        if (!plain(proposal) || !Array.isArray(proposal.source_citations) || proposal.source_citations.length === 0) {
          return fail("source_citations", "source_citation_required");
        }
        for (const citation of proposal.source_citations) {
          const locators = citation && citation.locators === undefined ? [citation.locator].filter(Boolean) : citation && citation.locators;
          if (!Array.isArray(locators) || locators.length === 0) return fail("source_citations.locators", "source_locator_required");
        }
        const targetFailure = validateKnowledgeTargets(proposal);
        if (targetFailure) return targetFailure;
      }
    }
    const built = bundleApi && typeof bundleApi.validateProposalBundle === "function"
      ? bundleApi.validateProposalBundle({
        run_id: bundle.run_id || envelope.run_id,
        validation_context: bundle.validation_context,
        proposals,
      })
      : null;
    if (!built || built.ok === false) return built || fail("bundle", "malformed_bundle");
    return built.value;
  }

  function validateKnowledgeTargets(proposal) {
    if (proposal.target && !startsKnowledgePath(proposal.target)) return fail("target", "unauthorized_target");
    for (const target of proposal.affected_targets || []) {
      if (!startsKnowledgePath(target)) return fail("affected_targets", "unauthorized_target");
    }
    for (const target of proposal.existing_target_ids || []) {
      if (!startsKnowledgePath(target)) return fail("existing_target_ids", "unauthorized_target");
    }
    return null;
  }

  function renderedDiff(proposal) {
    if (proposal.kind === "create") {
      return [{ op: "add", path: "/", before: null, after: proposal.title, value: clone(proposal), source_ids: proposal.source_citations.map((item) => item.source_id) }];
    }
    if (proposal.kind === "update") return clone(proposal.diff || []);
    if (proposal.kind === "merge") {
      return [
        { op: "preserve", path: "/existing_target_ids", before: null, after: clone(proposal.existing_target_ids || []), value: null, source_ids: clone(proposal.source_input_ids || []) },
        { op: "revise", path: "/target", before: clone(proposal.existing_target_ids || []), after: proposal.target, value: null, source_ids: clone(proposal.source_input_ids || []) },
      ];
    }
    if (proposal.kind === "dispute") {
      return [{ op: "preserve", path: "/dispute", before: null, after: clone(proposal.dispute || null), value: null, source_ids: uniqueSorted((proposal.source_citations || []).map((item) => item.source_id)) }];
    }
    if (proposal.kind === "no_change") {
      return [{ op: "preserve", path: "/", before: null, after: proposal.no_change_reason, value: null, source_ids: uniqueSorted((proposal.source_citations || []).map((item) => item.source_id)) }];
    }
    return [];
  }

  function reviewedPayload(proposal) {
    const payload = clone(proposal);
    delete payload.payload_hash;
    return payload;
  }

  function renderOperation(runId, proposal, index) {
    const payload = reviewedPayload(proposal);
    const operationHashSeed = `${runId}:${index}:${proposal.proposal_id}:${proposal.payload_hash}`;
    const operationId = `operation_${sha256(operationHashSeed).slice(0, 24)}`;
    const affected = uniqueSorted([
      ...(proposal.affected_targets || []),
      ...(proposal.target ? [proposal.target] : []),
      ...(proposal.existing_target_ids || []),
    ]).filter(startsKnowledgePath);
    const operation = {
      operation_id: operationId,
      proposal_id: proposal.proposal_id,
      proposal_kind: proposal.kind,
      title: proposal.title,
      status: proposal.status,
      confidence: proposal.confidence,
      payload_hash: proposal.payload_hash,
      reviewed_payload: payload,
      write_intent: { target: "none", persistence: "none" },
      rollback_identity: {
        rollback_id: `rollback_${sha256(`rollback:${operationHashSeed}`).slice(0, 24)}`,
        target_revision: proposal.target_revision || null,
        target: proposal.target || null,
      },
      affected_canonical_files: affected,
      evidence: proposal.source_citations.map(citationEvidence),
      source_citations: proposal.source_citations.map(citationEvidence),
      conflicts: clone(proposal.conflicts || []),
      diff: renderedDiff(proposal),
    };
    if (proposal.operation) operation.operation_contract = clone(proposal.operation);
    if (proposal.kind === "abstain") operation.non_write_reason = proposal.abstention_reason;
    if (proposal.kind === "no_change") operation.non_write_reason = proposal.no_change_reason;
    if (proposal.kind === "dispute") operation.dispute_or_supersession = clone(proposal.dispute);
    return operation;
  }

  function packetBody(envelope, bundle) {
    const runId = trim(bundle.run_id || envelope.run_id);
    const operations = bundle.proposals.map((proposal, index) => renderOperation(runId, proposal, index));
    let createExposed = false;
    for (const operation of operations) {
      if (operation.operation_contract?.conflicts?.some((conflict) => conflict.status === "unresolved")) {
        operation.authorization_state = "non_authorizable";
        operation.authorization_reason = "unresolved_conflict";
        operation.authorization_label = "충돌 해결 필요";
      } else if (operation.proposal_kind === "create" && !createExposed) {
        operation.authorization_state = "authorizable";
        operation.authorization_reason = "phase_1_create_only";
        operation.authorization_label = "승인 가능";
        createExposed = true;
      } else if (["create", "update", "merge", "dispute"].includes(operation.proposal_kind)) {
        operation.authorization_state = "non_authorizable";
        operation.authorization_reason = "phase_1_create_only";
        operation.authorization_label = "후속 단계에서 지원";
      } else {
        operation.authorization_state = "no_write";
        operation.authorization_reason = operation.non_write_reason;
        operation.authorization_label = "쓰기 없음";
        operation.write_outcome = "no_write";
      }
    }
    const conflicts = [];
    for (const proposal of bundle.proposals) {
      for (const conflict of proposal.conflicts || []) conflicts.push(clone(conflict));
      for (const conflict of proposal.operation?.conflicts || []) conflicts.push(clone(conflict));
    }
    const unresolved = uniqueSorted(conflicts.filter((conflict) => conflict.status === "unresolved").map((conflict) => conflict.conflict_id));
    const selectionAllowlist = operations
      .filter((operation) => operation.authorization_state === "authorizable")
      .map((operation) => operation.operation_id)
      .sort();
    return {
      packet_version: PACKET_VERSION,
      run_id: runId,
      provider: { ...(plain(envelope.provider_metadata) ? clone(envelope.provider_metadata) : {}), run_id: runId, mode: trim(envelope.provider_metadata && envelope.provider_metadata.mode) || "direct" },
      trust_state: TRUST_STATE,
      approval_state: APPROVAL_STATE,
      authorization_scope: {
        exact_payload_only: true,
        writer_invoked: false,
        allowed_target_prefix: KNOWLEDGE_PREFIX,
      },
      validation_workspace: "none",
      bundle_hash: bundle.bundle_hash,
      bundle_serialization_hash: sha256(bundle.canonical_serialization || stable(bundle)),
      operations,
      selection_allowlist: selectionAllowlist,
      conflicts,
      unresolved_conflict_ids: unresolved,
      write_counters: writeCounters(),
    };
  }

  function attachPacketHash(body) {
    const canonical = stable(body);
    const packetHash = sha256(canonical);
    return { ...body, packet_hash: packetHash, canonical_serialization: canonical };
  }

  function buildApprovalPacket(envelope) {
    const bundle = normalizeBundle(envelope);
    if (hasFailure(bundle)) return bundle;
    for (const proposal of bundle.proposals) {
      const targetFailure = validateKnowledgeTargets(proposal);
      if (targetFailure) return targetFailure;
      if (!Array.isArray(proposal.source_citations) || proposal.source_citations.length === 0) {
        return fail("source_citations", "source_citation_required");
      }
      for (const citation of proposal.source_citations) {
        if (!Array.isArray(citation.locators) || citation.locators.length === 0) {
          return fail("source_citations.locators", "source_locator_required");
        }
      }
    }
    return ok(attachPacketHash(packetBody(envelope, bundle)));
  }

  function canonicalPacketForVerification(packet) {
    if (!plain(packet)) return null;
    const body = clone(packet);
    delete body.packet_hash;
    delete body.canonical_serialization;
    return attachPacketHash(body);
  }

  function verifyPacket(packet) {
    const recomputed = canonicalPacketForVerification(packet);
    if (!recomputed || recomputed.packet_hash !== packet.packet_hash) return fail("packet", "packet_tampered");
    return recomputed;
  }

  function validateActionShape(action) {
    if (!plain(action)) return fail("action", "malformed_action");
    const name = trim(action.action);
    if (!Object.hasOwn(ACTION_FIELDS, name)) return fail("action", "unknown_action");
    for (const key of Object.keys(action)) {
      if (!ACTION_FIELDS[name].has(key)) return fail(key, "unknown_action_field");
    }
    return name;
  }

  function operationMaps(packet) {
    const operations = new Map();
    for (const operation of packet.operations || []) operations.set(operation.operation_id, operation);
    const allowlist = new Set(packet.selection_allowlist || []);
    return { operations, allowlist };
  }

  function validatePacketHash(packet, action) {
    if (trim(action.packet_hash) !== packet.packet_hash) return fail("packet_hash", "stale_packet_hash");
    return null;
  }

  function validateSelection(packet, action) {
    if (!Array.isArray(action.selection_ids) || action.selection_ids.length === 0) return fail("selection_ids", "selection_required");
    if (hasDuplicate(action.selection_ids)) return fail("selection_ids", "duplicate_selection");
    const selection = uniqueSorted(action.selection_ids);
    const { operations, allowlist } = operationMaps(packet);
    if (selection.some((id) => !operations.has(id))) return fail("selection_ids", "unknown_operation");
    if (selection.some((id) => (operations.get(id).conflicts || []).some((conflict) => conflict && conflict.status === "unresolved"))) return fail("conflicts", "unresolved_conflict");
    if (selection.some((id) => !allowlist.has(id))) return fail("selection_ids", "non_authorizable_operation");
    return selection;
  }

  function payloadFor(operation, editedPayload) {
    return {
      operation_id: operation.operation_id,
      proposal_id: operation.proposal_id,
      proposal_kind: operation.proposal_kind,
      payload_hash: editedPayload ? sha256(stable(editedPayload)) : operation.payload_hash,
      reviewed_payload: editedPayload ? clone(editedPayload) : clone(operation.reviewed_payload),
    };
  }

  function authorization(action, packet, selection, editedPayloads = new Map()) {
    const { operations } = operationMaps(packet);
    const selectedPayloads = selection.map((id) => payloadFor(operations.get(id), editedPayloads.get(id)));
    const authBody = { action, packet_hash: packet.packet_hash, selection_set: selection, selected_payloads: selectedPayloads };
    return { authorization_hash: sha256(stable(authBody)), selected_payloads: selectedPayloads };
  }

  function successfulAction(value) {
    return ok({ ...value, write_counters: writeCounters() });
  }

  function approveSelected(packet, action) {
    const selection = validateSelection(packet, action);
    if (hasFailure(selection)) return selection;
    const rejected = uniqueSorted(action.rejected_ids || []);
    const { operations } = operationMaps(packet);
    for (const id of rejected) if (!operations.has(id)) return fail("rejected_ids", "unknown_operation");
    const auth = authorization("approve_selected", packet, selection);
    return successfulAction({
      action: "approve_selected",
      status: "authorized",
      packet_hash: packet.packet_hash,
      selection_set: selection,
      rejected_set: rejected,
      reason: "approved_selected_exact_payload",
      authorization_hash: auth.authorization_hash,
      authorization: auth,
    });
  }

  function approveAll(packet) {
    const selection = uniqueSorted(packet.selection_allowlist);
    if (selection.length !== 1) return fail("selection_allowlist", "authorizable_create_required");
    const { operations } = operationMaps(packet);
    const selected = operations.get(selection[0]);
    if (!selected || selected.proposal_kind !== "create") return fail("selection_allowlist", "authorizable_create_required");
    if ((selected.conflicts || []).some((conflict) => conflict && conflict.status === "unresolved")) return fail("conflicts", "unresolved_conflict");
    const auth = authorization("approve_all", packet, selection);
    return successfulAction({
      action: "approve_all",
      status: "authorized",
      packet_hash: packet.packet_hash,
      selection_set: selection,
      rejected_set: [],
      reason: "approved_all_exact_payload",
      authorization_hash: auth.authorization_hash,
      authorization: auth,
    });
  }

  function explicitNoWrite(packet, action, status) {
    return successfulAction({
      action,
      status,
      packet_hash: packet.packet_hash,
      selection_set: [],
      rejected_set: [],
      reason: action,
      write_outcome: "no_write",
    });
  }

  function validateEditPatch(patch, original) {
    if (!plain(patch)) return fail("edits.patch", "malformed_edit");
    for (const key of Object.keys(patch)) if (!EDIT_FIELDS.has(key)) return fail(`edits.patch.${key}`, "unauthorized_property");
    const next = clone(original);
    for (const [key, value] of Object.entries(patch)) next[key] = clone(value);
    for (const entry of next.diff || []) {
      if (!plain(entry) || typeof entry.path !== "string" || !entry.path.startsWith("/")) return fail("edits.diff", "malformed_diff");
      if (entry.path.startsWith("/frontmatter/") && entry.path !== "/frontmatter/type") return fail("edits.diff.path", "unauthorized_property");
      if (Array.isArray(entry.source_ids)) {
        const citationIds = new Set((next.source_citations || []).map((item) => item.source_id));
        for (const sourceId of entry.source_ids) if (sourceId && !citationIds.has(sourceId)) return fail("edits.diff.source_ids", "unsupported_claim");
      }
    }
    if (next.target && !startsKnowledgePath(next.target)) return fail("edits.target", "unauthorized_target");
    for (const target of next.affected_targets || []) if (!startsKnowledgePath(target)) return fail("edits.affected_targets", "unauthorized_target");
    return next;
  }

  function editThenApprove(packet, action) {
    const selection = validateSelection(packet, action);
    if (hasFailure(selection)) return selection;
    if (!Array.isArray(action.edits) || action.edits.length === 0) return fail("edits", "edit_required");
    if (hasDuplicate(action.edits.map((edit) => edit && edit.operation_id))) return fail("edits.operation_id", "duplicate_selection");
    const selected = new Set(selection);
    const { operations } = operationMaps(packet);
    const editedPayloads = new Map();
    const editedDiffs = [];
    for (const edit of action.edits) {
      if (!plain(edit) || !selected.has(trim(edit.operation_id)) || !operations.has(trim(edit.operation_id))) return fail("edits.operation_id", "unknown_operation");
      const operation = operations.get(trim(edit.operation_id));
      const before = operation.reviewed_payload;
      const after = validateEditPatch(edit.patch, before);
      if (hasFailure(after)) return after;
      const beforeHash = sha256(stable(before));
      const afterHash = sha256(stable(after));
      editedPayloads.set(operation.operation_id, after);
      editedDiffs.push({
        operation_id: operation.operation_id,
        before_payload_hash: beforeHash,
        after_payload_hash: afterHash,
        patch: clone(edit.patch),
      });
    }
    const auth = authorization("edit_then_approve", packet, selection, editedPayloads);
    const edited = selection.filter((id) => editedPayloads.has(id)).map((id) => ({
      operation_id: id,
      payload_hash: sha256(stable(editedPayloads.get(id))),
      payload: clone(editedPayloads.get(id)),
    }));
    const newPacketHash = sha256(stable({ original_packet_hash: packet.packet_hash, action: "edit_then_approve", selection_set: selection, edited_payloads: edited, authorization_hash: auth.authorization_hash }));
    return successfulAction({
      action: "edit_then_approve",
      status: "authorized",
      original_packet_hash: packet.packet_hash,
      packet_hash: newPacketHash,
      selection_set: selection,
      rejected_set: [],
      reason: "approved_edited_exact_payload",
      edited_payloads: edited,
      edited_diffs: editedDiffs,
      authorization_hash: auth.authorization_hash,
      authorization: auth,
    });
  }

  function applyApprovalAction(packet, action) {
    const actionName = validateActionShape(action);
    if (hasFailure(actionName)) return actionName;
    const verified = verifyPacket(packet);
    if (hasFailure(verified)) return verified;
    const stale = validatePacketHash(packet, action);
    if (stale) return stale;
    if (actionName === "approve_selected") return approveSelected(packet, action);
    if (actionName === "approve_all") return approveAll(packet);
    if (actionName === "evidence_more") return explicitNoWrite(packet, "evidence_more", "needs_more_evidence");
    if (actionName === "reject") return explicitNoWrite(packet, "reject", "rejected");
    if (actionName === "edit_then_approve") return fail("action", "edit_requires_repacket", { status: "non_committable" });
    return fail("action", "unknown_action");
  }

  const api = freeze({ PACKET_VERSION, buildApprovalPacket, applyApprovalAction });
  root.LLMWikiApprovalPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
