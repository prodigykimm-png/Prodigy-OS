(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const BUNDLE_VERSION = "llmwiki_proposal_bundle_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const KINDS = Object.freeze(["create", "update", "merge", "dispute", "abstain", "no_change"]);
  const CONFIDENCE = Object.freeze(["explicit", "inferred", "low"]);
  const DIFF_OPS = Object.freeze(["add", "revise", "preserve", "delete"]);
  const CAPTURE_TARGETS = Object.freeze(["zeta_literature", "zeta_fleeting", "knowledge_candidate"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function failure(field, reason) { return Object.freeze({ ok: false, field, reason }); }
  function success(value) { return Object.freeze({ ok: true, value: freeze(value) }); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (operationApi && typeof operationApi.isOperationRecord === "function" && operationApi.isOperationRecord(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function hashAvailable() { return Boolean(hashApi && typeof hashApi.sha256 === "function"); }
  function sha256(value) { return hashApi.sha256(String(value)); }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function uniq(list) {
    const seen = new Set();
    return list.filter((item) => { if (seen.has(item)) return false; seen.add(item); return true; });
  }
  function validId(value, field) {
    const id = trim(value);
    return ID.test(id) ? id : failure(field, `invalid_${field.replace(/.*\./u, "")}`);
  }
  function validHash(value, field) {
    const hash = trim(value);
    return HASH.test(hash) ? hash : failure(field, `invalid_${field.replace(/.*\./u, "")}`);
  }
  function safeLocator(value, field) {
    const locator = trim(value);
    const pathPart = locator.split("#", 1)[0];
    const segments = pathPart.split("/");
    const unsafe = !locator || /[\u0000-\u001f\u007f]/u.test(locator) || locator.includes("\\")
      || locator.includes("[[") || locator.includes("]]") || locator.startsWith("/")
      || /^[A-Za-z]:/u.test(locator) || segments.some((segment) => segment === "." || segment === "..");
    return unsafe ? failure(field, "invalid_locator") : locator;
  }
  function safePath(value, field) {
    const target = trim(value).replace(/\\/gu, "/");
    if (!target || target.startsWith("/") || target.includes("..") || target.includes("[[") || target.includes("]]")) {
      return failure(field, "invalid_target");
    }
    return target;
  }
  function url(value, field) {
    let parsed;
    try { parsed = new URL(trim(value)); } catch { return failure(field, "invalid_source_url"); }
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : failure(field, "invalid_source_url");
  }
  function citation(input, index) {
    if (!plain(input)) return failure(`source_citations.${index}`, "malformed_source_citation");
    const sourceId = validId(input.source_id, `source_citations.${index}.source_id`);
    if (plain(sourceId)) return sourceId;
    const contentHash = validHash(input.content_hash, `source_citations.${index}.content_hash`);
    if (plain(contentHash)) return contentHash;
    const sourceUrl = input.source_url === undefined || input.source_url === null ? null : url(input.source_url, `source_citations.${index}.source_url`);
    if (plain(sourceUrl)) return sourceUrl;
    const rawLocators = input.locators === undefined ? [input.locator] : input.locators;
    const list = Array.isArray(rawLocators) ? rawLocators : [rawLocators];
    if (list.length === 0) return failure(`source_citations.${index}.locator`, "source_locator_required");
    const locators = [];
    for (const item of list) {
      const locator = safeLocator(item, `source_citations.${index}.locator`);
      if (plain(locator)) return locator;
      locators.push(locator);
    }
    const confidence = trim(input.confidence);
    if (!CONFIDENCE.includes(confidence)) return failure(`source_citations.${index}.confidence`, "invalid_confidence");
    const archiveId = input.source_archive_id === undefined ? null : trim(input.source_archive_id);
    return { source_id: sourceId, content_hash: contentHash, source_url: sourceUrl, locators: uniq(locators), source_archive_id: archiveId || null, confidence };
  }
  function citations(value) {
    if (!Array.isArray(value) || value.length === 0) return failure("source_citations", "source_citation_required");
    const normalized = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const item = citation(value[index], index);
      if (plain(item) && item.ok === false) return item;
      const key = `${item.source_id}:${item.content_hash}:${item.locators.join("|")}`;
      if (!seen.has(key)) { seen.add(key); normalized.push(item); }
    }
    return normalized;
  }
  function claims(value, citationIds) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return failure("claims", "malformed_claims");
    return value.map((claim, index) => {
      if (!plain(claim) || !trim(claim.claim_id) || !trim(claim.text)) return failure(`claims.${index}`, "malformed_claim");
      const ids = Array.isArray(claim.source_ids) ? uniq(claim.source_ids.map(trim).filter(Boolean)) : [];
      if (ids.length === 0 || ids.some((id) => !citationIds.has(id))) return failure(`claims.${index}.source_ids`, "unsupported_claim");
      return { claim_id: trim(claim.claim_id), text: trim(claim.text), source_ids: ids };
    });
  }
  function diffEntries(value, citationIds) {
    if (!Array.isArray(value) || value.length === 0) return failure("diff", "diff_required");
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (!plain(item) || !DIFF_OPS.includes(trim(item.op)) || !trim(item.path).startsWith("/")) return failure(`diff.${index}`, "malformed_diff");
      if (trim(item.op) === "delete") return failure(`diff.${index}.op`, "delete_requires_dispute_or_supersession");
      const ids = Array.isArray(item.source_ids) ? uniq(item.source_ids.map(trim).filter(Boolean)) : [];
      if (ids.some((id) => !citationIds.has(id))) return failure(`diff.${index}.source_ids`, "unsupported_claim");
      result.push({ op: trim(item.op), path: trim(item.path), before: item.before ?? null, after: item.after ?? null, value: item.value ?? null, source_ids: ids });
    }
    return result;
  }
  function targets(value, field) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return failure(field, "affected_targets_must_be_list");
    const result = [];
    for (const item of value) {
      const target = safePath(item, field);
      if (plain(target)) return target;
      result.push(target);
    }
    return uniq(result);
  }
  function conflicts(value, citationIds) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return failure("conflicts", "malformed_conflicts");
    return value.map((item, index) => {
      if (!plain(item) || !trim(item.conflict_id) || !["unresolved", "superseded", "disputed"].includes(trim(item.status))) return failure(`conflicts.${index}`, "malformed_conflict");
      const ids = Array.isArray(item.source_ids) ? uniq(item.source_ids.map(trim).filter(Boolean)) : [];
      if (ids.length === 0 || ids.some((id) => !citationIds.has(id))) return failure(`conflicts.${index}.source_ids`, "unsupported_claim");
      return { conflict_id: trim(item.conflict_id), status: trim(item.status), claims: Array.isArray(item.claims) ? item.claims.map(trim) : [], source_ids: ids };
    });
  }
  function normalizeSourceIds(value, citationIds, field) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return failure(field, "malformed_source_ids");
    const ids = uniq(value.map(trim).filter(Boolean));
    return ids.some((id) => !citationIds.has(id)) ? failure(field, "unsupported_claim") : ids;
  }
  function normalizeClaimIds(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return failure("dispute.claim_ids", "malformed_claim_ids");
    const ids = uniq(value.map(trim).filter(Boolean));
    return ids.some((id) => !ID.test(id)) ? failure("dispute.claim_ids", "invalid_claim_id") : ids;
  }
  function normalizeSupersession(value, citationIds) {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") {
      if (trim(value) === "") return null;
      const target = safePath(value, "dispute.supersession");
      return plain(target) ? target : target;
    }
    if (!plain(value)) return failure("dispute.supersession", "malformed_supersession");
    const allowed = new Set(["relation", "target", "replacement", "reason", "source_ids", "claim_ids"]);
    for (const key of Object.keys(value)) if (!allowed.has(key)) return failure("dispute.supersession", "unknown_supersession_field");
    const relation = trim(value.relation || "supersedes");
    if (!["supersedes", "disputes"].includes(relation)) return failure("dispute.supersession.relation", "invalid_supersession_relation");
    const target = value.target === undefined || value.target === null || trim(value.target) === "" ? null : safePath(value.target, "dispute.supersession.target");
    if (plain(target)) return target;
    const replacement = value.replacement === undefined || value.replacement === null || trim(value.replacement) === "" ? null : safePath(value.replacement, "dispute.supersession.replacement");
    if (plain(replacement)) return replacement;
    if (!target && !replacement) return failure("dispute.supersession", "supersession_target_required");
    const sourceIds = normalizeSourceIds(value.source_ids, citationIds, "dispute.supersession.source_ids");
    if (plain(sourceIds) && sourceIds.ok === false) return sourceIds;
    const claimIds = normalizeClaimIds(value.claim_ids);
    if (plain(claimIds) && claimIds.ok === false) return claimIds;
    return { relation, target, replacement, reason: trim(value.reason), source_ids: sourceIds, claim_ids: claimIds };
  }
  function normalizeDispute(input, citationIds) {
    if (!plain(input)) return failure("dispute", "dispute_required");
    const allowed = new Set(["reason", "supersedes", "supersession", "source_ids", "claim_ids"]);
    for (const key of Object.keys(input)) if (!allowed.has(key)) return failure("dispute", "unknown_dispute_field");
    const reason = trim(input.reason);
    if (!reason) return failure("dispute.reason", "dispute_reason_required");
    const supersedes = input.supersedes === undefined || input.supersedes === null || trim(input.supersedes) === "" ? null : safePath(input.supersedes, "dispute.supersedes");
    if (plain(supersedes)) return supersedes;
    const supersession = normalizeSupersession(input.supersession, citationIds);
    if (plain(supersession) && supersession.ok === false) return supersession;
    const sourceIds = normalizeSourceIds(input.source_ids, citationIds, "dispute.source_ids");
    if (plain(sourceIds) && sourceIds.ok === false) return sourceIds;
    const claimIds = normalizeClaimIds(input.claim_ids);
    if (plain(claimIds) && claimIds.ok === false) return claimIds;
    return { reason, supersedes, supersession, source_ids: sourceIds, claim_ids: claimIds };
  }
  function hasFailure(list) { return Array.isArray(list) ? list.find((item) => plain(item) && item.ok === false) : list; }
  function normalizeProposal(input, runId) {
    if (!plain(input)) return failure("proposals", "malformed_proposal");
    const kind = trim(input.kind);
    if (!KINDS.includes(kind)) return failure("kind", "unknown_proposal_kind");
    const sourceCitations = citations(input.source_citations);
    if (plain(sourceCitations) && sourceCitations.ok === false) return sourceCitations;
    const citationIds = new Set(sourceCitations.map((item) => item.source_id));
    const confidence = trim(input.confidence);
    if (!CONFIDENCE.includes(confidence)) return failure("confidence", "invalid_confidence");
    const claimList = claims(input.claims, citationIds);
    const claimFailure = hasFailure(claimList);
    if (claimFailure) return claimFailure;
    const affectedTargets = targets(input.affected_targets, "affected_targets");
    if (plain(affectedTargets) && affectedTargets.ok === false) return affectedTargets;
    const target = input.target === undefined ? null : safePath(input.target, "target");
    if (plain(target)) return target;
    const targetRevision = input.target_revision === undefined ? null : validHash(input.target_revision, "target_revision");
    if (plain(targetRevision)) return targetRevision;
    const conflictList = conflicts(input.conflicts, citationIds);
    const conflictFailure = hasFailure(conflictList);
    if (conflictFailure) return conflictFailure;
    let operation = null;
    if (input.operation !== undefined) {
      if (!operationApi || typeof operationApi.parseOperation !== "function") return failure("operation", "operation_contract_unavailable");
      const parsed = operationApi.parseOperation(input.operation);
      if (!parsed || parsed.ok === false) return parsed || failure("operation", "malformed_operation");
      const expectedKind = kind === "no_change" ? "noop" : kind;
      if (parsed.value.kind !== expectedKind) return failure("operation.kind", "proposal_operation_kind_mismatch");
      operation = parsed.value;
    }
    const draft = { kind, title: trim(input.title), status: trim(input.status || (kind === "abstain" ? "abstain" : kind === "no_change" ? "no_change" : "proposed")), confidence, source_citations: sourceCitations, claims: claimList, affected_targets: affectedTargets, target, target_revision: targetRevision, conflicts: conflictList, abstention_reason: trim(input.abstention_reason), no_change_reason: trim(input.no_change_reason), write_intent: { target: "none", persistence: "none" } };
    if (operation) {
      draft.operation = operation;
      if (Object.hasOwn(input, "canonical_proposal")) draft.canonical_proposal = input.canonical_proposal;
    }
    if (kind === "create" && (target || input.diff !== undefined)) return failure("create", "create_target_or_diff_forbidden");
    if (kind === "update") { const diff = diffEntries(input.diff, citationIds); if (plain(diff) && diff.ok === false) return diff; Object.assign(draft, { diff }); }
    if (kind === "merge") {
      const sourceInputIds = Array.isArray(input.source_input_ids) ? uniq(input.source_input_ids.map(trim).filter(Boolean)) : [];
      const existingTargetIds = targets(input.existing_target_ids, "existing_target_ids");
      if (plain(existingTargetIds) && existingTargetIds.ok === false) return existingTargetIds;
      if (!target || !targetRevision || sourceInputIds.length < 2 || existingTargetIds.length < 2) return failure("merge", "malformed_merge");
      if (conflictList.length === 0) return failure("conflicts", "merge_requires_conflict_metadata_or_abstain");
      Object.assign(draft, { source_input_ids: sourceInputIds, existing_target_ids: existingTargetIds });
    }
    if ((kind === "update" || kind === "dispute") && (!target || !targetRevision)) return failure(kind, "target_revision_required");
    if (kind === "dispute") {
      const dispute = normalizeDispute(input.dispute, citationIds);
      if (plain(dispute) && dispute.ok === false) return dispute;
      Object.assign(draft, { dispute });
    }
    if (kind === "abstain" && !draft.abstention_reason) return failure("abstention_reason", "abstention_reason_required");
    if (kind === "no_change" && !draft.no_change_reason) return failure("no_change_reason", "no_change_reason_required");
    const payloadHash = sha256(stable(draft));
    const expectedId = `proposal_${sha256(`${runId}:${kind}:${payloadHash}`).slice(0, 24)}`;
    if (input.proposal_id !== undefined && trim(input.proposal_id) !== expectedId) return failure("proposal_id", "stale_or_unstable_proposal_id");
    return { ...draft, proposal_id: expectedId, payload_hash: payloadHash };
  }
  function normalizeBundle(input) {
    if (!plain(input)) return failure("bundle", "malformed_bundle");
    const runId = validId(input.run_id, "run_id");
    if (plain(runId)) return runId;
    if (!plain(input.validation_context)) return failure("validation_context", "validation_context_required");
    if (!Array.isArray(input.proposals) || input.proposals.length === 0) return failure("proposals", "proposal_required");
    const proposals = input.proposals.map((item) => normalizeProposal(item, runId));
    const bad = hasFailure(proposals);
    if (bad) return bad;
    const ids = new Map();
    for (const item of proposals) {
      if (ids.has(item.proposal_id)) return failure("proposal_id", ids.get(item.proposal_id) === item.payload_hash ? "duplicate_proposal" : "stale_payload_for_proposal_id");
      ids.set(item.proposal_id, item.payload_hash);
    }
    const envelope = { bundle_version: BUNDLE_VERSION, run_id: runId, validation_context: freeze({ ...input.validation_context, type: "logical_validation_context", persistence: "none" }), status: "proposed", proposals };
    return { ...envelope, canonical_serialization: stable(envelope), bundle_hash: sha256(stable(envelope)) };
  }
  function buildProposalBundle(input) {
    if (!hashAvailable()) return failure("hash", "hash_unavailable");
    const bundle = normalizeBundle(input);
    return plain(bundle) && bundle.ok === false ? bundle : success(bundle);
  }
  function serializeProposalBundle(bundle) { return typeof bundle?.canonical_serialization === "string" ? bundle.canonical_serialization : stable(bundle); }
  function hashProposalBundle(bundle) {
    if (!hashAvailable()) return failure("hash", "hash_unavailable");
    return typeof bundle?.bundle_hash === "string" ? bundle.bundle_hash : sha256(serializeProposalBundle(bundle));
  }
  function validateProposalBundle(input) { return buildProposalBundle(input); }
  function captureProposalBundle(bundle, options = {}) {
    if (!hashAvailable()) return failure("hash", "hash_unavailable");
    if (!plain(bundle) || !HASH.test(trim(bundle.bundle_hash))) return failure("bundle", "malformed_bundle");
    if (options.capture_requested !== true) return success({ captured: false, reason: "capture_not_requested" });
    const target = trim(options.target);
    if (target === "canonical_knowledge") return failure("target", "canonical_capture_forbidden");
    if (!CAPTURE_TARGETS.includes(target)) return failure("target", "invalid_capture_target");
    if (typeof options.writer !== "function") return failure("writer", "writer_callback_required");
    const captureId = `capture_${sha256(`${target}:${bundle.bundle_hash}`).slice(0, 24)}`;
    options.writer(freeze({ target, capture_id: captureId, bundle_hash: bundle.bundle_hash, bundle }));
    return success({ captured: true, target, capture_id: captureId, bundle_hash: bundle.bundle_hash });
  }
  const api = freeze({ BUNDLE_VERSION, KINDS, CONFIDENCE, buildProposalBundle, validateProposalBundle, serializeProposalBundle, hashProposalBundle, captureProposalBundle });
  root.LLMWikiProposalBundle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
