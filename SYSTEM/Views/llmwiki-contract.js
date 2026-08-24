(function (root) {
  "use strict";

  const CONTRACT_VERSION = "llmwiki_trust_contract_v1";
  const PROPOSAL_VERSION = "llmwiki_proposal_v1";
  const OPERATIONS = Object.freeze(["query/read", "ingest", "propose", "approve"]);
  const PROPOSAL_KINDS = Object.freeze(["create", "update", "merge", "dispute", "abstain", "no_change"]);
  const OPERATION_STATUSES = Object.freeze(["completed", "rejected", "failed", "aborted"]);
  const PROPOSAL_STATUSES = Object.freeze(["proposed", "approved", "rejected", "stale", "abstain", "no_change"]);
  const WRITE_TARGETS = Object.freeze(["none", "run_context", "source_archive", "canonical_knowledge"]);
  const PERSISTENCE_MODES = Object.freeze(["none", "ephemeral", "persistent"]);
  const PROVENANCE_ACTORS = Object.freeze(["system", "human", "llm"]);
  const PRIVACY_CLASSES = Object.freeze(["public", "internal", "private"]);
  const PROVIDER_ELIGIBILITY = Object.freeze(["direct", "omniroute"]);
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const PROVENANCE_KEYS = new Set([
    "actor", "source_ids", "source_archive_ids", "source_url", "locators", "basis_hash", "snapshot_revision", "proposal_ids"
  ]);
  const OPERATION_KEYS = new Set(["contract_version", "operation_id", "run_id", "operation", "status", "provenance", "write_intent", "approval"]);
  const PROPOSAL_KEYS = new Set(["contract_version", "proposal_id", "run_id", "kind", "proposal_kind", "status", "provenance", "payload_hash", "target_knowledge", "affected_knowledge", "write_intent"]);

  function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function isFailure(value) { return plainObject(value) && value.ok === false; }
  function trimmed(value) { return typeof value === "string" ? value.trim() : ""; }
  function reject(field, reason) { return Object.freeze({ ok: false, field, reason }); }
  function success(value) { return Object.freeze({ ok: true, value: freezeValue(value) }); }
  function freezeValue(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
    if (!plainObject(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  }
  function safeId(value, field) {
    const id = trimmed(value);
    return ID.test(id) ? id : reject(field, "invalid_stable_id");
  }
  function stableList(value, field) {
    if (!Array.isArray(value) || value.length === 0) return reject(field, "provenance_required");
    const result = [];
    const seen = new Set();
    for (const entry of value) {
      const id = safeId(entry, field);
      if (typeof id !== "string") return id;
      if (!seen.has(id)) { seen.add(id); result.push(id); }
    }
    return result;
  }
  function locatorList(value) {
    if (!Array.isArray(value) || value.length === 0) return reject("provenance.locators", "provenance_required");
    const result = [];
    const seen = new Set();
    for (const entry of value) {
      const locator = trimmed(entry);
      const pathPart = locator.split("#", 1)[0];
      const segments = pathPart.split("/");
      const unsafe = !locator
        || /[\u0000-\u001f\u007f]/u.test(locator)
        || locator.includes("\\")
        || locator.includes("[[")
        || locator.includes("]]")
        || locator.startsWith("/")
        || /^[A-Za-z]:/u.test(locator)
        || segments.some((segment) => segment === "." || segment === "..");
      if (unsafe) return reject("provenance.locators", "invalid_locator");
      if (!seen.has(locator)) { seen.add(locator); result.push(locator); }
    }
    return result;
  }
  function hash(value, field, reason = "invalid_hash") { return HASH.test(trimmed(value)) ? trimmed(value) : reject(field, reason); }
  function resolvedUrl(value) {
    let parsed;
    try { parsed = new URL(trimmed(value)); } catch { return reject("provenance.source_url", "invalid_source_url"); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return reject("provenance.source_url", "invalid_source_url");
    }
    return parsed.href;
  }
  function optionalValue(value) { return value === null || value === undefined || value === "" ? null : value; }

  function validateProvenance(input, options = {}) {
    if (!plainObject(input)) return reject("provenance", "malformed_provenance");
    for (const key of Object.keys(input)) if (!PROVENANCE_KEYS.has(key)) return reject("provenance", "unknown_provenance_field");
    const actor = trimmed(input.actor);
    if (!PROVENANCE_ACTORS.includes(actor)) return reject("provenance.actor", "invalid_actor");
    const sourceIds = input.source_ids === undefined ? [] : stableList(input.source_ids, "provenance.source_ids");
    if (isFailure(sourceIds) && options.requireSource) return sourceIds;
    const archiveIds = input.source_archive_ids === undefined ? [] : stableList(input.source_archive_ids, "provenance.source_archive_ids");
    if (isFailure(archiveIds) && options.requireArchive) return archiveIds;
    const locators = input.locators === undefined ? [] : locatorList(input.locators);
    if (isFailure(locators) && options.requireLocator) return locators;
    const basisHash = input.basis_hash === undefined ? null : hash(input.basis_hash, "provenance.basis_hash", "invalid_basis_hash");
    if (options.requireBasis && (isFailure(basisHash) || basisHash === null)) {
      return isFailure(basisHash) ? basisHash : reject("provenance.basis_hash", "provenance_required");
    }
    const snapshot = input.snapshot_revision === undefined ? null : hash(input.snapshot_revision, "provenance.snapshot_revision", "invalid_snapshot_revision");
    if (options.requireSnapshot && (isFailure(snapshot) || snapshot === null)) {
      return isFailure(snapshot) ? snapshot : reject("provenance.snapshot_revision", "provenance_required");
    }
    const proposalIds = input.proposal_ids === undefined ? [] : stableList(input.proposal_ids, "provenance.proposal_ids");
    if (isFailure(proposalIds) && options.requireProposal) return proposalIds;
    let sourceUrl = null;
    if (input.source_url !== undefined && input.source_url !== null && input.source_url !== "") {
      sourceUrl = resolvedUrl(input.source_url);
      if (isFailure(sourceUrl)) return sourceUrl;
    }
    if (options.requireSource && sourceIds.length === 0 && archiveIds.length === 0) return reject("provenance", "provenance_required");
    if (options.requireArchive && archiveIds.length === 0) return reject("provenance.source_archive_ids", "source_archive_required");
    if (options.requireLocator && locators.length === 0) return reject("provenance.locators", "provenance_required");
    if (options.requireProposal && proposalIds.length === 0) return reject("provenance.proposal_ids", "proposal_required");
    return {
      actor, source_ids: sourceIds, source_archive_ids: archiveIds, source_url: sourceUrl,
      locators, basis_hash: basisHash, snapshot_revision: snapshot, proposal_ids: proposalIds
    };
  }

  function validateSourceAccess(input) {
    if (!plainObject(input)) return reject("source_access", "malformed_source_access");
    const privacyClass = trimmed(input.privacy_class);
    if (!PRIVACY_CLASSES.includes(privacyClass)) return reject("privacy_class", "invalid_privacy_class");
    if (!Array.isArray(input.provider_eligibility)) return reject("provider_eligibility", "invalid_provider_eligibility");
    const providers = [];
    for (const value of input.provider_eligibility) {
      const provider = trimmed(value);
      if (!PROVIDER_ELIGIBILITY.includes(provider)) return reject("provider_eligibility", "invalid_provider_eligibility");
      if (!providers.includes(provider)) providers.push(provider);
    }
    if (privacyClass === "private" && providers.length > 0) return reject("provider_eligibility", "private_provider_forbidden");
    return success({ privacy_class: privacyClass, provider_eligibility: providers });
  }

  function validateWriteIntent(intent, allowedTargets) {
    if (!plainObject(intent)) return reject("write_intent", "write_intent_required");
    const target = trimmed(intent.target);
    const persistence = trimmed(intent.persistence);
    if (!WRITE_TARGETS.includes(target) || !PERSISTENCE_MODES.includes(persistence)) return reject("write_intent", "write_forbidden");
    if (!allowedTargets.includes(target)) return reject("write_intent", "write_forbidden");
    const validPair = (target === "none" && persistence === "none")
      || (target === "run_context" && persistence === "ephemeral")
      || (target === "source_archive" && persistence === "persistent")
      || (target === "canonical_knowledge" && persistence === "persistent");
    return validPair ? { target, persistence } : reject("write_intent", "write_forbidden");
  }

  function validateApproval(input) {
    if (!plainObject(input)) return reject("approval", "human_approval_required");
    const fields = ["approval_id", "approver", "decision", "proposal_id", "payload_hash", "approved_at"];
    if (fields.some((field) => !Object.hasOwn(input, field))) return reject("approval", "human_approval_required");
    if (safeId(input.approval_id, "approval.approval_id").ok === false) return reject("approval", "invalid_approval_id");
    if (trimmed(input.approver) !== "human" || trimmed(input.decision) !== "approved") return reject("approval", "human_approval_required");
    if (safeId(input.proposal_id, "approval.proposal_id").ok === false) return reject("approval", "invalid_approval_id");
    if (!HASH.test(trimmed(input.payload_hash)) || !Number.isFinite(Date.parse(trimmed(input.approved_at)))) return reject("approval", "invalid_approval");
    return { approval_id: trimmed(input.approval_id), approver: "human", decision: "approved", proposal_id: trimmed(input.proposal_id), payload_hash: trimmed(input.payload_hash), approved_at: trimmed(input.approved_at) };
  }

  function validateOperation(input, trustedContext = {}) {
    if (!plainObject(input)) return reject("operation", "malformed_operation");
    for (const key of Object.keys(input)) if (!OPERATION_KEYS.has(key)) return reject("operation", "unknown_operation_field");
    if (trimmed(input.contract_version) !== CONTRACT_VERSION) return reject("contract_version", "unsupported_contract_version");
    const operation = trimmed(input.operation);
    if (!OPERATIONS.includes(operation)) return reject("operation", "unknown_operation");
    const operationId = safeId(input.operation_id, "operation_id");
    if (typeof operationId !== "string") return operationId;
    const runId = safeId(input.run_id, "run_id");
    if (typeof runId !== "string") return runId;
    const status = trimmed(input.status);
    if (!OPERATION_STATUSES.includes(status)) return reject("status", "invalid_status");
    const requirements = { requireSource: true, requireBasis: operation !== "query/read", requireSnapshot: operation === "query/read", requireArchive: operation === "ingest", requireProposal: operation === "approve" };
    const provenance = validateProvenance(input.provenance, requirements);
    if (isFailure(provenance)) return provenance;
    if (operation === "query/read") {
      if (!plainObject(trustedContext) || !Object.hasOwn(trustedContext, "currentSnapshotRevision")) {
        return reject("trusted_context.currentSnapshotRevision", "trusted_snapshot_required");
      }
      const currentSnapshot = hash(trustedContext.currentSnapshotRevision, "trusted_context.currentSnapshotRevision", "invalid_current_snapshot_revision");
      if (isFailure(currentSnapshot)) return currentSnapshot;
      if (provenance.snapshot_revision !== currentSnapshot) return reject("provenance.snapshot_revision", "stale_snapshot_revision");
    }
    const allowedTargets = operation === "query/read" ? ["none"] : operation === "ingest" ? ["source_archive"] : operation === "propose" ? ["none", "run_context"] : ["canonical_knowledge"];
    const writeIntent = validateWriteIntent(input.write_intent, allowedTargets);
    if (isFailure(writeIntent)) return writeIntent;
    if (operation === "approve") {
      if (status !== "completed") return reject("status", "approval_must_complete");
      const approval = validateApproval(input.approval);
      if (isFailure(approval)) return approval;
      if (!provenance.proposal_ids.includes(approval.proposal_id) || provenance.basis_hash !== approval.payload_hash) return reject("approval", "approval_payload_mismatch");
      return success({ contract_version: CONTRACT_VERSION, operation_id: operationId, run_id: runId, operation, status, provenance, write_intent: writeIntent, approval });
    }
    return success({ contract_version: CONTRACT_VERSION, operation_id: operationId, run_id: runId, operation, status, provenance, write_intent: writeIntent });
  }

  function safePath(value, field) {
    const path = trimmed(value).replace(/\\/g, "/");
    if (!path || path.startsWith("/") || path.includes("..") || path.includes("[[") || path.includes("]].")) return reject(field, "invalid_target");
    return path;
  }
  function pathList(value, field) {
    if (!Array.isArray(value)) return reject(field, "affected_must_be_list");
    const result = []; const seen = new Set();
    for (const item of value) {
      const target = safePath(item, field);
      if (typeof target !== "string") return target;
      if (!seen.has(target)) { seen.add(target); result.push(target); }
    }
    return result;
  }

  function validateProposal(input) {
    if (!plainObject(input)) return reject("proposal", "malformed_proposal");
    for (const key of Object.keys(input)) if (!PROPOSAL_KEYS.has(key)) return reject("proposal", "unknown_proposal_field");
    if (trimmed(input.contract_version) !== PROPOSAL_VERSION) return reject("contract_version", "unsupported_contract_version");
    const proposalId = safeId(input.proposal_id, "proposal_id");
    if (typeof proposalId !== "string") return proposalId;
    const runId = safeId(input.run_id, "run_id");
    if (typeof runId !== "string") return runId;
    const kind = trimmed(input.kind || input.proposal_kind);
    if (input.kind !== undefined && input.proposal_kind !== undefined && trimmed(input.kind) !== trimmed(input.proposal_kind)) return reject("kind", "kind_alias_mismatch");
    if (!PROPOSAL_KINDS.includes(kind)) return reject("kind", "unknown_proposal_kind");
    const status = trimmed(input.status);
    if (!PROPOSAL_STATUSES.includes(status)) return reject("status", "invalid_status");
    if (["abstain", "no_change"].includes(kind) ? status !== kind : !["proposed", "approved", "rejected", "stale"].includes(status)) return reject("status", "status_kind_mismatch");
    const provenance = validateProvenance(input.provenance, { requireSource: true, requireBasis: true, requireLocator: true });
    if (isFailure(provenance)) return provenance;
    const payloadHash = hash(input.payload_hash, "payload_hash", "invalid_payload_hash");
    if (typeof payloadHash !== "string") return payloadHash;
    const writeIntent = validateWriteIntent(input.write_intent, ["none", "run_context"]);
    if (isFailure(writeIntent)) return writeIntent;
    const targetValue = optionalValue(input.target_knowledge);
    const target = targetValue === null ? null : safePath(targetValue, "target_knowledge");
    if (isFailure(target)) return target;
    const affected = pathList(input.affected_knowledge, "affected_knowledge");
    if (isFailure(affected)) return affected;
    if (["create", "abstain", "no_change"].includes(kind) && (target !== null || affected.length > 0)) return reject("target_knowledge", "target_forbidden");
    if (["update", "dispute"].includes(kind) && (!target || affected.length > 0)) return reject("target_knowledge", "single_target_required");
    if (kind === "merge" && (!target || affected.length < 2 || !affected.includes(target))) return reject("affected_knowledge", "merge_requires_target_and_two_affected");
    return success({ contract_version: PROPOSAL_VERSION, proposal_id: proposalId, run_id: runId, kind, status, provenance, payload_hash: payloadHash, target_knowledge: target, affected_knowledge: affected, write_intent: writeIntent });
  }

  const api = Object.freeze({
    CONTRACT_VERSION, PROPOSAL_VERSION, OPERATIONS, PROPOSAL_KINDS, OPERATION_STATUSES, PROPOSAL_STATUSES,
    WRITE_TARGETS, PERSISTENCE_MODES, PRIVACY_CLASSES, PROVIDER_ELIGIBILITY,
    validateOperation, validateCapability: validateOperation, validateSourceAccess,
    validateProposal, validateChangeProposal: validateProposal, validateWriteIntent,
  });
  root.LLMWikiContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
