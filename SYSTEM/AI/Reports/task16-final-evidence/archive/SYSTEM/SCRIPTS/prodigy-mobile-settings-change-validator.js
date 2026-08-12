#!/usr/bin/env node
"use strict";

/**
 * Validator for the Wave 3 user-owned Obsidian settings evidence contract.
 *
 * This module never reads or writes the Vault settings sources.  It validates
 * a redacted, synthetic change receipt and (when supplied) reads only the
 * byte-exact backup named by that receipt.  The two source paths below are
 * deliberately frozen: a receipt for any other path is rejected.
 */

const fs = require("node:fs");
const path = require("node:path");

const FROZEN_SETTINGS_PATHS = Object.freeze([
  ".obsidian/community-plugins.json",
  ".obsidian/workspace-mobile.json",
]);
const TARGET_PATHS = FROZEN_SETTINGS_PATHS;
const HEX_SHA256 = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const JSON_POINTER = /^(?:|(?:\/(?:[^~]|~[01])*))+$/u;
const SAFE_BACKUP_FILE = /^.+$/u;

const REQUIRED_FIELDS = Object.freeze([
  "schema_version",
  "receipt_type",
  "change_id",
  "target_path",
  "configuration_id",
  "campaign_id",
  "json_pointer",
  "structural_anchor",
  "preimage_sha256",
  "preimage_bytes",
  "before",
  "after",
  "proposed_postimage_sha256",
  "backup_path",
  "backup_sha256",
  "backup_bytes",
  "backup_read_back",
  "identity",
  "dependency",
  "user_purpose",
  "approval",
  "diff",
  "rollback",
  "observed_impact",
]);

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  ...REQUIRED_FIELDS,
  "postimage_sha256",
  "configuration_digest",
  "campaign_digest",
  "configuration_sha256",
  "campaign_sha256",
  "postimage_bytes",
  "created_at",
  "source",
  "redaction",
  "notes",
]);

const SECRET_KEY = /(authorization|bearer|cookie|credential|password|passwd|private[_-]?key|secret|token|api[_-]?key|access[_-]?key)/iu;
const SECRET_VALUE = /(-----BEGIN [^-]+ KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|pk)[-_][A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{16,})/u;
const USER_CONTENT_KEY = /^(?:content|body|note|user_?content|raw_?text|vault_?text|markdown)$/iu;
const PHYSICAL_CLAIM_KEYS = /(physical|mobile).*(claim|success|verified|pass)|(?:claim|success|verified|pass).*(physical|mobile)/iu;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function sha256(bytes) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function addError(errors, code, message, field) {
  errors.push({ code, message, ...(field ? { field } : {}) });
}

function checkObjectKeys(errors, value, allowed, field) {
  if (!isObject(value)) return;
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) addError(errors, "unknown_field", `unknown field: ${field}.${key}`, `${field}.${key}`);
  });
}
function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validIdentifier(value) {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function validateSha(errors, value, field) {
  if (typeof value !== "string" || !HEX_SHA256.test(value)) {
    addError(errors, "invalid_sha256", `${field} must be a lowercase SHA-256 digest`, field);
    return false;
  }
  return true;
}

function validatePointer(errors, value, field) {
  if (typeof value !== "string" || !JSON_POINTER.test(value)) {
    addError(errors, "invalid_json_pointer", `${field} must be an RFC 6901 JSON pointer`, field);
    return false;
  }
  return true;
}

function walkValues(value, visit, stack = []) {
  visit(value, stack);
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkValues(child, visit, stack.concat(String(index))));
  } else if (isObject(value)) {
    Object.keys(value).forEach((key) => walkValues(value[key], visit, stack.concat(key)));
  }
}

function validateRedactedProjection(errors, projection, field) {
  if (!isObject(projection)) {
    addError(errors, "projection_required", `${field} must be a redacted object projection`, field);
    return;
  }
  walkValues(projection, (value, stack) => {
    const key = stack[stack.length - 1] || "";
    if (SECRET_KEY.test(key) && typeof value === "string" && value !== "[redacted]" && value !== "[REDACTED]") {
      addError(errors, "unredacted_secret", `${field}.${stack.join(".")} contains a secret-like field`, field);
    }
    if (typeof value === "string" && SECRET_VALUE.test(value)) {
      addError(errors, "unredacted_secret", `${field}.${stack.join(".")} contains a secret-like value`, field);
    }
  });
}
function validateReceiptSecretBoundary(errors, receipt) {
  walkValues(receipt, (value, stack) => {
    const key = stack[stack.length - 1] || "";
    if (SECRET_KEY.test(key) && typeof value === "string" && value !== "[redacted]" && value !== "[REDACTED]") {
      addError(errors, "unredacted_secret", `${stack.join(".")} contains a secret-like field`, stack.join("."));
    }
    if (USER_CONTENT_KEY.test(key)) {
      addError(errors, "unredacted_user_content", `${stack.join(".")} contains user/note content`, stack.join("."));
    }
    if (typeof value === "string" && SECRET_VALUE.test(value)) {
      addError(errors, "unredacted_secret", `${stack.join(".")} contains a secret-like value`, stack.join("."));
    }
  });
}

function getProjectionArray(projection, keys) {
  if (!isObject(projection)) return null;
  for (const key of keys) {
    if (Array.isArray(projection[key])) return projection[key];
  }
  return null;
}

function pluginEntries(projection) {
  const keys = ["enabled_plugin_ids", "plugin_ids", "plugins", "enabledPlugins", "enabled_plugins"];
  let values = getProjectionArray(projection, keys);
  if (!values && isObject(projection)) {
    const mapKey = keys.find((key) => isObject(projection[key]));
    if (mapKey) {
      values = Object.entries(projection[mapKey]).map(([id, entry]) => (isObject(entry) ? { plugin_id: id, ...entry } : { plugin_id: id, enabled: entry }));
    }
  }
  if (!values) return null;
  return values.map((entry) => {
    if (typeof entry === "string") return { id: entry };
    if (isObject(entry)) {
      return {
        id: entry.plugin_id || entry.id || entry.name || null,
        version: entry.version || entry.version_id || null,
        enabled: entry.enabled,
      };
    }
    return { id: null };
  });
}

function leafEntries(projection) {
  const values = getProjectionArray(projection, ["tabs", "leaves", "leaf_identity", "leafIdentities", "tab_order", "leaf_ids", "open_leaf_ids"]);
  const directLeafLike = Array.isArray(values) && values.every((entry) => typeof entry === "string" || (isObject(entry) && !Array.isArray(entry.children) && (entry.leaf_id !== undefined || entry.identity !== undefined || (entry.id !== undefined && entry.type !== "tabs"))));
  if (values && directLeafLike) {
    return values.map((entry) => {
      if (typeof entry === "string") return { id: entry, file: null, type: null };
      if (isObject(entry)) {
        const state = isObject(entry.state) && isObject(entry.state.state) ? entry.state.state : {};
        return {
          id: entry.leaf_id || entry.id || entry.identity || null,
          file: entry.file || entry.path || state.file || null,
          type: entry.type || entry.view_type || entry.state_type || null,
        };
      }
      return { id: null, file: null, type: null };
    });
  }

  const entries = [];
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    if (value.type === "leaf" || value.leaf_id !== undefined) {
      const state = isObject(value.state) && isObject(value.state.state) ? value.state.state : {};
      entries.push({
        id: value.leaf_id || value.id || value.identity || null,
        file: value.file || value.path || state.file || null,
        type: value.view_type || value.state_type || (value.type === "leaf" ? state.type || null : value.type || null),
      });
    }
    Object.entries(value).forEach(([key, child]) => {
      if (key !== "id" && key !== "leaf_id" && key !== "identity") visit(child);
    });
  }
  visit(projection);
  return entries.length > 0 ? entries : null;
}

function assertPluginProjection(errors, before, after, identity, diff) {
  const beforeEntries = pluginEntries(before);
  const afterEntries = pluginEntries(after);
  const pluginId = identity.plugin_id || (isObject(identity.plugin) && identity.plugin.plugin_id) || identity.id;
  if (!nonEmptyText(pluginId)) {
    addError(errors, "plugin_identity_required", "plugin settings receipts require identity.plugin_id", "identity");
  }

  if (beforeEntries && afterEntries) {
    const beforeIds = beforeEntries.map((entry) => entry.id);
    const afterIds = afterEntries.map((entry) => entry.id);
    if (beforeEntries.some((entry) => !nonEmptyText(entry.id)) || afterEntries.some((entry) => !nonEmptyText(entry.id))) {
      addError(errors, "plugin_identity_invalid", "plugin projections must contain plugin identities", "before");
    }
    const removed = beforeIds.filter((id) => !afterIds.includes(id));
    if (removed.length > 0) {
      addError(errors, "plugin_disable_or_delete", "a settings receipt may not silently disable or delete a plugin", "diff");
    }
    const commonBefore = beforeIds.filter((id) => afterIds.includes(id));
    const commonAfter = afterIds.filter((id) => beforeIds.includes(id));
    if (commonBefore.join("\u0000") !== commonAfter.join("\u0000")) {
      addError(errors, "plugin_order_changed", "existing plugin identities must retain their order", "diff");
    }
    const changedVersions = beforeEntries.filter((entry) => entry.id && afterEntries.some((next) => next.id === entry.id && next.version !== entry.version));
    if (changedVersions.length > 0) {
      addError(errors, "plugin_update_forbidden", "a settings receipt may not silently update a plugin", "diff");
    }
    const added = afterIds.filter((id) => !beforeIds.includes(id));
    if (added.length !== 1 || added[0] !== pluginId) {
      addError(errors, "plugin_change_ambiguous", "exactly the approved plugin identity may be added", "diff");
    }
  } else if (diff && /(remove|delete|disable|update|reorder|close)/iu.test(JSON.stringify(diff))) {
    addError(errors, "plugin_mutation_forbidden", "plugin disable, delete, update, or reorder is not an approved one-variable change", "diff");
  }
}

function assertMobileProjection(errors, before, after, identity, diff) {
  const beforeLeaves = leafEntries(before);
  const afterLeaves = leafEntries(after);
  const leafId = identity.leaf_id || (isObject(identity.leaf) && (identity.leaf.leaf_id || identity.leaf.id)) || identity.id;
  if (!nonEmptyText(leafId)) {
    addError(errors, "leaf_identity_required", "mobile workspace receipts require identity.leaf_id", "identity");
  }

  if (beforeLeaves && afterLeaves) {
    const beforeIds = beforeLeaves.map((entry) => entry.id);
    const afterIds = afterLeaves.map((entry) => entry.id);
    if (beforeIds.some((id) => !nonEmptyText(id)) || afterIds.some((id) => !nonEmptyText(id))) {
      addError(errors, "leaf_identity_invalid", "mobile projections must contain leaf identities", "before");
    }
    if (beforeIds.length !== afterIds.length || beforeIds.join("\u0000") !== afterIds.join("\u0000")) {
      addError(errors, "tab_order_or_closure_changed", "mobile tab identity, order, and count must be unchanged", "diff");
    }
    const filesChanged = beforeLeaves.filter((entry, index) => {
      const next = afterLeaves[index];
      return next && entry.id === next.id && entry.file !== next.file;
    });
    if (filesChanged.length > 0) {
      addError(errors, "leaf_identity_changed", "mobile leaf file identity must be unchanged", "diff");
    }
    if (!beforeIds.includes(leafId) || !afterIds.includes(leafId)) {
      addError(errors, "leaf_identity_missing", "the approved mobile leaf must exist in both projections", "identity");
    }
  } else if (diff && /(remove|delete|close|reorder|tab[_ -]?order)/iu.test(JSON.stringify(diff))) {
    addError(errors, "tab_mutation_forbidden", "closing, deleting, or reordering mobile tabs is not approved", "diff");
  }
}

function validateBackup(errors, receipt, options) {
  const backupPathValue = receipt.backup_path;
  if (typeof backupPathValue !== "string" || !SAFE_BACKUP_FILE.test(backupPathValue) || !path.isAbsolute(backupPathValue)) {
    addError(errors, "backup_must_be_external_absolute", "backup_path must be an absolute external path", "backup_path");
    return;
  }
  const backupPath = path.resolve(backupPathValue);
  const vaultRoot = path.resolve(options.vaultRoot || options.vault_root || options.root || process.cwd());
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : null;
  if (isWithin(backupPath, vaultRoot) || (repoRoot && isWithin(backupPath, repoRoot))) {
    addError(errors, "backup_inside_vault", "byte-exact backups must be outside the Vault/repository", "backup_path");
  }
  if (/(?:^|[\\/])\.obsidian(?:[\\/]|$)/u.test(backupPath)) {
    addError(errors, "backup_inside_obsidian", "a backup may not be stored in .obsidian", "backup_path");
  }
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
    addError(errors, "backup_missing", "backup_path does not name a readable file", "backup_path");
    return;
  }
  const bytes = fs.readFileSync(backupPath);
  const actualHash = sha256(bytes);
  if (Number.isInteger(receipt.backup_bytes) && bytes.length !== receipt.backup_bytes) {
    addError(errors, "backup_bytes_mismatch", "backup byte count does not match backup_bytes", "backup_bytes");
  }
  if (actualHash !== receipt.backup_sha256) {
    addError(errors, "backup_hash_mismatch", "backup bytes do not match backup_sha256", "backup_sha256");
  }
  if (actualHash !== receipt.preimage_sha256) {
    addError(errors, "backup_not_preimage", "external backup must be byte-exact preimage bytes", "backup_sha256");
  }

  const readBack = receipt.backup_read_back;
  checkObjectKeys(errors, readBack, new Set(["path", "sha256", "bytes", "matches_backup", "verified"]), "backup_read_back");
  if (!isObject(readBack)) {
    addError(errors, "backup_read_back_required", "backup_read_back proof is required", "backup_read_back");
    return;
  }
  if (readBack.verified !== true || readBack.matches_backup !== true) {
    addError(errors, "backup_read_back_unverified", "backup read-back must be explicitly verified", "backup_read_back");
  }
  if (readBack.path !== backupPathValue && path.resolve(String(readBack.path || "")) !== backupPath) {
    addError(errors, "backup_read_back_path_mismatch", "backup read-back path must match backup_path", "backup_read_back.path");
  }
  if (readBack.sha256 !== receipt.backup_sha256 || readBack.sha256 !== actualHash) {
    addError(errors, "backup_read_back_hash_mismatch", "backup read-back hash must match the bytes", "backup_read_back.sha256");
  }
  if (readBack.bytes !== bytes.length) {
    addError(errors, "backup_read_back_bytes_mismatch", "backup read-back byte count must match the bytes", "backup_read_back.bytes");
  }
}

function validateApproval(errors, receipt) {
  const approval = receipt.approval;
  if (!isObject(approval) || approval.approved !== true) {
    addError(errors, "approval_required", "explicit approval evidence is required", "approval");
    return;
  }
  if (!nonEmptyText(approval.approved_by) || !nonEmptyText(approval.approved_at)) {
    addError(errors, "approval_identity_required", "approval must identify the approver and timestamp", "approval");
  }
  if (!(nonEmptyText(approval.evidence) || isObject(approval.evidence) || Array.isArray(approval.evidence))) {
    addError(errors, "approval_evidence_required", "approval evidence must be recorded", "approval.evidence");
  }
  if (hasOwn(approval, "change_id") && approval.change_id !== receipt.change_id) {
    addError(errors, "approval_change_mismatch", "approval evidence must bind to change_id", "approval.change_id");
  }
  if (approval.target_path !== undefined && approval.target_path !== receipt.target_path) {
    addError(errors, "approval_target_mismatch", "approval evidence must bind to target_path", "approval.target_path");
  }
  if (approval.preimage_sha256 !== receipt.preimage_sha256) {
    addError(errors, "approval_preimage_mismatch", "approval evidence must bind to preimage_sha256", "approval.preimage_sha256");
  }
  if (approval.proposed_postimage_sha256 !== receipt.proposed_postimage_sha256) {
    addError(errors, "approval_postimage_mismatch", "approval evidence must bind to proposed_postimage_sha256", "approval.proposed_postimage_sha256");
  }
}

function validateRollback(errors, receipt) {
  const rollback = receipt.rollback;
  if (!isObject(rollback)) {
    addError(errors, "rollback_required", "rollback proof is required", "rollback");
    return;
  }
  if (rollback.status !== "verified") {
    addError(errors, "rollback_not_verified", "rollback status must be verified", "rollback.status");
  }
  if (rollback.expected_sha256 !== receipt.preimage_sha256 || rollback.actual_sha256 !== receipt.preimage_sha256) {
    addError(errors, "rollback_hash_mismatch", "rollback expected and actual hashes must equal preimage_sha256", "rollback");
  }
  if (rollback.hash_equal !== true || rollback.verified !== true) {
    addError(errors, "rollback_hash_not_equal", "rollback hash equality must be explicitly verified", "rollback");
  }
  if (hasOwn(rollback, "configuration_id") && rollback.configuration_id !== receipt.configuration_id) {
    addError(errors, "mixed_configuration_id", "rollback configuration_id differs from the receipt", "rollback.configuration_id");
  }
  if (hasOwn(rollback, "campaign_id") && rollback.campaign_id !== receipt.campaign_id) {
    addError(errors, "mixed_campaign_id", "rollback campaign_id differs from the receipt", "rollback.campaign_id");
  }
}

function validateObservedImpact(errors, receipt) {
  const impact = receipt.observed_impact;
  if (!isObject(impact)) {
    addError(errors, "observed_impact_required", "observed_impact is required", "observed_impact");
    return;
  }
  let physicalMarker = false;
  walkValues(impact, (value, stack) => {
    const key = stack[stack.length - 1] || "";
    if (PHYSICAL_CLAIM_KEYS.test(key)) {
      physicalMarker = true;
      if (value === true || value === "success" || value === "verified" || value === "passed") {
        addError(errors, "physical_evidence_unclaimed", "physical mobile success may not be claimed by a settings receipt", `observed_impact.${stack.join(".")}`);
      }
    }
    if (key === "configuration_id" && value !== receipt.configuration_id) {
      addError(errors, "mixed_configuration_id", "observed impact configuration_id differs from the receipt", `observed_impact.${stack.join(".")}`);
    }
    if (key === "campaign_id" && value !== receipt.campaign_id) {
      addError(errors, "mixed_campaign_id", "observed impact campaign_id differs from the receipt", `observed_impact.${stack.join(".")}`);
    }
  });
  if (!physicalMarker && impact.physical_mobile_status === undefined && impact.physical_evidence_claimed === undefined && impact.physical_mobile_claimed === undefined) {
    addError(errors, "physical_boundary_required", "observed_impact must explicitly leave physical mobile evidence unclaimed", "observed_impact");
  }
  if (impact.physical_mobile_claimed === true || impact.physical_evidence_claimed === true) {
    addError(errors, "physical_evidence_unclaimed", "physical mobile success may not be claimed by a settings receipt", "observed_impact");
  }
}

function validateConsistency(errors, receipt) {
  const configValues = new Set();
  const campaignValues = new Set();
  const configDigests = new Set();
  const campaignDigests = new Set();
  walkValues(receipt, (value, stack) => {
    const key = stack[stack.length - 1] || "";
    if (key === "configuration_id" && typeof value === "string") configValues.add(value);
    if (key === "campaign_id" && typeof value === "string") campaignValues.add(value);
    if (key === "configuration_digest" && typeof value === "string") configDigests.add(value);
    if (key === "campaign_digest" && typeof value === "string") campaignDigests.add(value);
  });
  if (configValues.size > 1) addError(errors, "mixed_configuration_id", "receipt contains mixed configuration IDs", "configuration_id");
  if (campaignValues.size > 1) addError(errors, "mixed_campaign_id", "receipt contains mixed campaign IDs", "campaign_id");
  if (configDigests.size > 1) addError(errors, "mixed_configuration_digest", "receipt contains mixed configuration digests", "configuration_digest");
  if (campaignDigests.size > 1) addError(errors, "mixed_campaign_digest", "receipt contains mixed campaign digests", "campaign_digest");
}

function validateDiff(errors, receipt) {
  const diff = receipt.diff;
  if (!isObject(diff)) {
    addError(errors, "diff_required", "an exact diff is required", "diff");
    return;
  }
  if (receipt.preimage_sha256 === receipt.proposed_postimage_sha256) {
    addError(errors, "no_effective_change", "preimage and proposed postimage hashes must differ for a settings change", "proposed_postimage_sha256");
  }
  if (diff.ambiguous === true || diff.variable_count !== 1) {
    addError(errors, "multi_variable_or_ambiguous_diff", "settings comparisons must contain exactly one unambiguous variable", "diff");
  }
  const changes = Array.isArray(diff.changes) ? diff.changes : [];
  if (changes.length !== 1) {
    addError(errors, "multi_variable_or_ambiguous_diff", "diff.changes must contain exactly one change", "diff.changes");
  } else {
    const change = changes[0];
    const changedPath = change && (change.path || change.json_pointer || change.pointer);
    if (changedPath !== receipt.json_pointer) {
      addError(errors, "diff_pointer_mismatch", "the exact diff path must match json_pointer", "diff.changes[0].path");
    }
    if (change.operation && !["add", "replace"].includes(change.operation)) {
      addError(errors, "forbidden_diff_operation", "only an approved add or replace operation is supported", "diff.changes[0].operation");
    }
    if (change.ambiguous === true || change.variable_count !== undefined && change.variable_count !== 1) {
      addError(errors, "multi_variable_or_ambiguous_diff", "the declared change is ambiguous", "diff.changes[0]");
    }
  }
  if (diff.path !== undefined && diff.path !== receipt.json_pointer) {
    addError(errors, "diff_pointer_mismatch", "diff.path must match json_pointer", "diff.path");
  }
  const text = JSON.stringify(diff);
  if (/(?:disable|delete|remove|update|close|reorder|tab[_ -]?order)/iu.test(text)) {
    if (receipt.target_path === ".obsidian/community-plugins.json") {
      addError(errors, "forbidden_settings_mutation", "plugin disable/delete/update/reorder is forbidden", "diff");
    } else {
      addError(errors, "forbidden_settings_mutation", "mobile tab close/delete/reorder is forbidden", "diff");
    }
  }
}

function validateSettingsChange(receipt, options = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(receipt)) {
    return { ok: false, valid: false, errors: [{ code: "receipt_object_required", message: "receipt must be an object" }], warnings };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!hasOwn(receipt, field)) addError(errors, "required_field_missing", `missing required field: ${field}`, field);
  }
  for (const field of Object.keys(receipt)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(field)) addError(errors, "unknown_field", `unknown receipt field: ${field}`, field);
  }

  if (receipt.schema_version !== 1) addError(errors, "schema_version", "schema_version must be 1", "schema_version");
  if (receipt.receipt_type !== "obsidian-settings-change") addError(errors, "receipt_type", "receipt_type must be obsidian-settings-change", "receipt_type");
  for (const field of ["change_id", "configuration_id", "campaign_id"]) {
    if (!validIdentifier(receipt[field])) addError(errors, "invalid_identifier", `${field} must be a stable identifier`, field);
  }
  if (receipt.configuration_id === receipt.campaign_id) addError(errors, "configuration_campaign_must_differ", "configuration_id and campaign_id must be distinct", "campaign_id");

  if (typeof receipt.target_path !== "string" || !FROZEN_SETTINGS_PATHS.includes(receipt.target_path) || path.isAbsolute(receipt.target_path) || receipt.target_path.includes("..")) {
    addError(errors, "target_path_not_frozen", "target_path must be one of the two frozen relative .obsidian settings sources", "target_path");
  }
  validatePointer(errors, receipt.json_pointer, "json_pointer");
  if (!isObject(receipt.structural_anchor)) {
    addError(errors, "structural_anchor_required", "structural_anchor is required", "structural_anchor");
  } else {
    if (!["plugin", "mobile_leaf"].includes(receipt.structural_anchor.kind)) addError(errors, "structural_anchor_kind", "structural_anchor.kind must identify a plugin or mobile leaf", "structural_anchor.kind");
    if (!nonEmptyText(receipt.structural_anchor.path)) addError(errors, "structural_anchor_path", "structural_anchor.path is required", "structural_anchor.path");
    if (!nonEmptyText(receipt.structural_anchor.identity)) addError(errors, "structural_anchor_identity", "structural_anchor.identity is required", "structural_anchor.identity");
  }
  validateSha(errors, receipt.preimage_sha256, "preimage_sha256");
  if (hasOwn(receipt, "configuration_digest")) validateSha(errors, receipt.configuration_digest, "configuration_digest");
  if (hasOwn(receipt, "campaign_digest")) validateSha(errors, receipt.campaign_digest, "campaign_digest");
  if (hasOwn(receipt, "configuration_sha256")) validateSha(errors, receipt.configuration_sha256, "configuration_sha256");
  if (hasOwn(receipt, "campaign_sha256")) validateSha(errors, receipt.campaign_sha256, "campaign_sha256");
  if (!Number.isInteger(receipt.preimage_bytes) || receipt.preimage_bytes < 0) addError(errors, "invalid_byte_count", "preimage_bytes must be a non-negative integer", "preimage_bytes");
  validateRedactedProjection(errors, receipt.before, "before");
  validateRedactedProjection(errors, receipt.after, "after");
  validateSha(errors, receipt.proposed_postimage_sha256, "proposed_postimage_sha256");
  if (hasOwn(receipt, "postimage_sha256")) {
    validateSha(errors, receipt.postimage_sha256, "postimage_sha256");
    if (receipt.postimage_sha256 !== receipt.proposed_postimage_sha256) {
      addError(errors, "postimage_proposal_mismatch", "postimage_sha256 must equal proposed_postimage_sha256 when both are recorded", "postimage_sha256");
    }
  }
  if (hasOwn(receipt, "postimage_bytes") && (!Number.isInteger(receipt.postimage_bytes) || receipt.postimage_bytes < 0)) addError(errors, "invalid_byte_count", "postimage_bytes must be a non-negative integer", "postimage_bytes");
  validateSha(errors, receipt.backup_sha256, "backup_sha256");
  if (!Number.isInteger(receipt.backup_bytes) || receipt.backup_bytes < 0) addError(errors, "invalid_byte_count", "backup_bytes must be a non-negative integer", "backup_bytes");
  validateReceiptSecretBoundary(errors, receipt);

  validateBackup(errors, receipt, options);
  if (!isObject(receipt.identity)) addError(errors, "identity_required", "plugin/leaf identity is required", "identity");
  else if (receipt.target_path === ".obsidian/community-plugins.json") {
    if (receipt.structural_anchor && receipt.structural_anchor.kind !== "plugin") addError(errors, "structural_anchor_target_mismatch", "community-plugins receipts require a plugin anchor", "structural_anchor.kind");
    assertPluginProjection(errors, receipt.before, receipt.after, receipt.identity, receipt.diff);
  } else if (receipt.target_path === ".obsidian/workspace-mobile.json") {
    if (receipt.structural_anchor && receipt.structural_anchor.kind !== "mobile_leaf") addError(errors, "structural_anchor_target_mismatch", "workspace-mobile receipts require a mobile leaf anchor", "structural_anchor.kind");
    assertMobileProjection(errors, receipt.before, receipt.after, receipt.identity, receipt.diff);
  }

  if (!(nonEmptyText(receipt.dependency) || (Array.isArray(receipt.dependency) && receipt.dependency.length > 0))) addError(errors, "dependency_required", "dependency is required", "dependency");
  if (!nonEmptyText(receipt.user_purpose)) addError(errors, "user_purpose_required", "user_purpose is required", "user_purpose");
  validateApproval(errors, receipt);
  validateDiff(errors, receipt);
  validateRollback(errors, receipt);
  validateObservedImpact(errors, receipt);
  validateConsistency(errors, receipt);

  const expectedConfiguration = options.configurationId || options.configuration_id;
  const expectedCampaign = options.campaignId || options.campaign_id;
  if (expectedConfiguration && receipt.configuration_id !== expectedConfiguration) addError(errors, "configuration_id_mismatch", "receipt configuration_id does not match the requested campaign", "configuration_id");
  if (expectedCampaign && receipt.campaign_id !== expectedCampaign) addError(errors, "campaign_id_mismatch", "receipt campaign_id does not match the requested campaign", "campaign_id");

  return { ok: errors.length === 0, valid: errors.length === 0, errors, warnings, receipt };
}

function validateReceipt(receipt, options = {}) {
  return validateSettingsChange(receipt, options);
}
function validateChange(receipt, options = {}) {
  return validateSettingsChange(receipt, options);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`unable to read JSON receipt ${filePath}: ${error.message}`);
  }
}

function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    process.stdout.write("Usage: node SYSTEM/SCRIPTS/prodigy-mobile-settings-change-validator.js <receipt.json> [--vault-root <path>]\n");
    process.exit(args.length === 0 ? 1 : 0);
  }
  const receiptPath = path.resolve(args[0]);
  const vaultIndex = args.indexOf("--vault-root");
  const vaultRoot = vaultIndex >= 0 ? args[vaultIndex + 1] : process.cwd();
  let receipt;
  try {
    receipt = loadJson(receiptPath);
  } catch (error) {
    process.stderr.write(`REJECT: ${error.message}\n`);
    process.exit(1);
  }
  const result = validateSettingsChange(receipt, { vaultRoot });
  if (result.ok) {
    process.stdout.write("ACCEPT: validated one-variable Obsidian settings change receipt\n");
    process.exit(0);
  }
  result.errors.forEach((error) => process.stderr.write(`REJECT: ${error.code}: ${error.message}\n`));
  process.stderr.write(`\n${result.errors.length} rejection(s) total\n`);
  process.exit(1);
}

if (require.main === module) cli();

module.exports = {
  FROZEN_SETTINGS_PATHS,
  TARGET_PATHS,
  REQUIRED_FIELDS,
  validateSettingsChange,
  validateReceipt,
  loadJson,
  sha256,
  validate: validateSettingsChange,
  validateChange,
};
