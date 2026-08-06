(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  const CANONICAL_PREFIX = "ZETA/PERMANENT/";
  const AUDIT_DIRECTORY = ".llmwiki-audit";
  const AUDIT_PREFIX = ".llmwiki-audit/";
  const HASH = /^[0-9a-f]{64}$/u;
  const NONCE = /^[A-Za-z0-9_-]{16,128}$/u;
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const MUTATION_FIELDS = new Set([
    "target_path", "before_bytes", "before_sha256", "after_bytes", "after_sha256", "allowed_properties",
    "source_citations", "live_revision", "packet_hash", "authorization_hash", "operation_id", "nonce", "audit",
  ]);
  const REPAIR_FIELDS = new Set([
    "audit_path", "target_path", "canonical_bytes", "prepared_audit_bytes", "final_audit_bytes",
  ]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function result(status, extras = {}) {
    return Object.freeze({
      ok: status === "committed" || status === "repaired" || status === "duplicate",
      status,
      write_counts: ZERO_WRITES,
      ...extras,
    });
  }
  function rejected(reason, extras = {}) { return result("rejected", { reason, ...extras }); }
  function sha256(value) { return hashApi && hashApi.sha256(String(value)); }
  function jsonBytes(value) { return `${JSON.stringify(value, null, 2)}\n`; }

  function validCanonicalPath(value) {
    if (typeof value !== "string" || value !== value.trim() || !value.startsWith(CANONICAL_PREFIX) || !value.endsWith(".md")) return false;
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value) || /[\u0000-\u001f\u007f\\]/u.test(value)) return false;
    const segments = value.split("/");
    return segments.length >= 3 && segments.every((segment) => segment && segment !== "." && segment !== "..");
  }

  function auditPath(nonce) {
    if (typeof nonce !== "string" || !NONCE.test(nonce)) return null;
    return `${AUDIT_PREFIX}${nonce}.json`;
  }

  function validAuditPath(value) {
    if (typeof value !== "string" || !value.startsWith(AUDIT_PREFIX) || !value.endsWith(".json")) return false;
    return auditPath(value.slice(AUDIT_PREFIX.length, -5)) === value;
  }

  function adapterError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function vaultReady(app) {
    const vault = app && app.vault;
    return Boolean(vault)
      && ["getAbstractFileByPath", "read", "create", "modify", "createFolder"]
        .every((method) => typeof vault[method] === "function");
  }

  function validMutation(value) {
    if (!plain(value) || !hashApi) return false;
    for (const key of Object.keys(value)) if (!MUTATION_FIELDS.has(key)) return false;
    if (!validCanonicalPath(value.target_path) || typeof value.before_bytes !== "string" || typeof value.after_bytes !== "string") return false;
    if (!HASH.test(value.before_sha256) || value.before_sha256 !== sha256(value.before_bytes)) return false;
    if (!HASH.test(value.after_sha256) || value.after_sha256 !== sha256(value.after_bytes)) return false;
    if (!HASH.test(value.packet_hash) || !HASH.test(value.authorization_hash) || !HASH.test(value.live_revision)) return false;
    if (typeof value.operation_id !== "string" || !value.operation_id || auditPath(value.nonce) === null) return false;
    if (!Array.isArray(value.allowed_properties) || !Array.isArray(value.source_citations) || !plain(value.audit)) return false;
    const audit = value.audit;
    return audit.result === "committed"
      && audit.target_path === value.target_path
      && audit.before_sha256 === value.before_sha256
      && audit.after_sha256 === value.after_sha256
      && audit.packet_hash === value.packet_hash
      && audit.authorization_hash === value.authorization_hash
      && audit.operation_id === value.operation_id
      && audit.nonce === value.nonce
      && typeof audit.committed_at === "string"
      && Number.isFinite(Date.parse(audit.committed_at));
  }

  function preparedRecord(mutation) {
    return {
      audit_adapter_version: "llmwiki_obsidian_audit_v1",
      result: "prepared",
      prepared_at: mutation.audit.committed_at,
      target_path: mutation.target_path,
      before_sha256: mutation.before_sha256,
      after_sha256: mutation.after_sha256,
      packet_hash: mutation.packet_hash,
      authorization_hash: mutation.authorization_hash,
      operation_id: mutation.operation_id,
      nonce: mutation.nonce,
      canonical_bytes: mutation.after_bytes,
      final_audit_sha256: sha256(jsonBytes(mutation.audit)),
    };
  }

  function rejectedRecord(mutation, reason) {
    return {
      ...clone(mutation.audit),
      result: "rejected",
      rejected_at: mutation.audit.committed_at,
      reason,
    };
  }

  function validFinalization(prepared, bytes) {
    if (!plain(prepared) || !plain(prepared.file) || !validAuditPath(prepared.file.path)
      || typeof prepared.bytes !== "string" || typeof bytes !== "string") return false;
    let preparedRecordValue;
    let finalRecordValue;
    try {
      preparedRecordValue = JSON.parse(prepared.bytes);
      finalRecordValue = JSON.parse(bytes);
    } catch (_error) {
      return false;
    }
    const resultKind = finalRecordValue && finalRecordValue.result;
    return plain(preparedRecordValue)
      && plain(finalRecordValue)
      && preparedRecordValue.result === "prepared"
      && (resultKind === "committed" || resultKind === "rejected")
      && prepared.file.path === auditPath(preparedRecordValue.nonce)
      && finalRecordValue.target_path === preparedRecordValue.target_path
      && finalRecordValue.before_sha256 === preparedRecordValue.before_sha256
      && finalRecordValue.after_sha256 === preparedRecordValue.after_sha256
      && finalRecordValue.packet_hash === preparedRecordValue.packet_hash
      && finalRecordValue.authorization_hash === preparedRecordValue.authorization_hash
      && finalRecordValue.operation_id === preparedRecordValue.operation_id
      && finalRecordValue.nonce === preparedRecordValue.nonce
      && (resultKind !== "committed" || sha256(bytes) === preparedRecordValue.final_audit_sha256)
      && (resultKind !== "rejected" || typeof finalRecordValue.reason === "string");
  }

  function repairPayload(mutation, preparedBytes) {
    return Object.freeze({
      audit_path: auditPath(mutation.nonce),
      target_path: mutation.target_path,
      canonical_bytes: mutation.after_bytes,
      prepared_audit_bytes: preparedBytes,
      final_audit_bytes: jsonBytes(mutation.audit),
    });
  }

  function validRepair(value) {
    if (!plain(value)) return false;
    for (const key of Object.keys(value)) if (!REPAIR_FIELDS.has(key)) return false;
    if (!validCanonicalPath(value.target_path) || typeof value.canonical_bytes !== "string") return false;
    if (typeof value.prepared_audit_bytes !== "string" || typeof value.final_audit_bytes !== "string") return false;
    let prepared;
    let finalAudit;
    try {
      prepared = JSON.parse(value.prepared_audit_bytes);
      finalAudit = JSON.parse(value.final_audit_bytes);
    } catch (_error) {
      return false;
    }
    return plain(prepared)
      && plain(finalAudit)
      && prepared.result === "prepared"
      && finalAudit.result === "committed"
      && value.audit_path === auditPath(prepared.nonce)
      && prepared.target_path === value.target_path
      && prepared.canonical_bytes === value.canonical_bytes
      && prepared.after_sha256 === sha256(value.canonical_bytes)
      && prepared.final_audit_sha256 === sha256(value.final_audit_bytes)
      && finalAudit.target_path === value.target_path
      && finalAudit.after_sha256 === prepared.after_sha256
      && finalAudit.packet_hash === prepared.packet_hash
      && finalAudit.authorization_hash === prepared.authorization_hash
      && finalAudit.operation_id === prepared.operation_id
      && finalAudit.nonce === prepared.nonce;
  }

  function createObsidianAdapter(app) {
    if (!vaultReady(app)) throw adapterError("app_vault_unavailable");
    const vault = app.vault;

    async function readEntry(filePath) {
      const file = vault.getAbstractFileByPath(filePath);
      if (!file) return { file: null, bytes: null };
      return { file, bytes: await vault.read(file) };
    }

    async function readBytes(targetPath) {
      if (!validCanonicalPath(targetPath)) throw adapterError("invalid_canonical_path");
      const entry = await readEntry(targetPath);
      return entry.file ? entry.bytes : null;
    }

    async function readReceipt(nonce) {
      const filePath = auditPath(nonce);
      if (!filePath) throw adapterError("invalid_audit_nonce");
      const entry = await readEntry(filePath);
      if (!entry.file) return null;
      try { return JSON.parse(entry.bytes); }
      catch (_error) { throw adapterError("malformed_audit_record"); }
    }

    async function prepareAudit(mutation) {
      if (!validMutation(mutation)) return rejected("malformed_mutation");
      const filePath = auditPath(mutation.nonce);
      if (vault.getAbstractFileByPath(filePath)) return rejected("audit_prepare_conflict");
      if (!vault.getAbstractFileByPath(AUDIT_DIRECTORY)) {
        try { await vault.createFolder(AUDIT_DIRECTORY); }
        catch (_error) { return rejected("audit_prepare_failed"); }
      }
      const bytes = jsonBytes(preparedRecord(mutation));
      try {
        const file = await vault.create(filePath, bytes);
        return { ok: true, status: "prepared", file, bytes };
      } catch (_error) {
        return rejected("audit_prepare_failed");
      }
    }

    async function finalizeAudit(prepared, bytes) {
      if (!validFinalization(prepared, bytes)) {
        return rejected("malformed_audit_finalize");
      }
      try {
        await vault.modify(prepared.file, bytes);
        return { ok: true, status: "finalized" };
      } catch (_error) {
        return rejected("audit_finalize_failed", { write_counts: { ...ZERO_WRITES, audit: 1 } });
      }
    }

    async function createCanonical(targetPath, bytes) {
      if (!validCanonicalPath(targetPath) || typeof bytes !== "string") throw adapterError("invalid_canonical_write");
      return vault.create(targetPath, bytes);
    }

    async function modifyCanonical(file, bytes) {
      if (!plain(file) || !validCanonicalPath(file.path) || typeof bytes !== "string") throw adapterError("invalid_canonical_write");
      await vault.modify(file, bytes);
      return file;
    }

    async function commitExact(mutation) {
      if (!validMutation(mutation)) return rejected("malformed_mutation");
      const live = await readEntry(mutation.target_path);
      const create = mutation.before_bytes === "";
      if ((create && live.file) || (!create && (!live.file || live.bytes !== mutation.before_bytes))) {
        return rejected("target_revision_mismatch");
      }

      const prepared = await prepareAudit(mutation);
      if (!prepared.ok) return prepared;

      try {
        if (create) await createCanonical(mutation.target_path, mutation.after_bytes);
        else await modifyCanonical(live.file, mutation.after_bytes);
      } catch (_error) {
        const rejection = await finalizeAudit(prepared, jsonBytes(rejectedRecord(mutation, "canonical_write_failed")));
        return rejected("canonical_write_failed", {
          write_counts: { ...ZERO_WRITES, audit: 1 },
          audit_status: rejection.ok ? "rejected" : "rejection_pending",
        });
      }

      const finalized = await finalizeAudit(prepared, jsonBytes(mutation.audit));
      if (!finalized.ok) {
        return result("committed_audit_pending", {
          reason: "audit_finalize_failed",
          write_counts: { ...ZERO_WRITES, canonical: 1, audit: 1 },
          target_path: mutation.target_path,
          repair: repairPayload(mutation, prepared.bytes),
        });
      }
      return result("committed", {
        write_counts: { ...ZERO_WRITES, canonical: 1, audit: 1 },
        target_path: mutation.target_path,
      });
    }

    async function repairAudit(repair) {
      if (!validRepair(repair)) return rejected("malformed_repair");
      const auditEntry = await readEntry(repair.audit_path);
      if (!auditEntry.file) return rejected("prepared_audit_missing");
      if (auditEntry.bytes === repair.final_audit_bytes) return result("duplicate");
      if (auditEntry.bytes !== repair.prepared_audit_bytes) return rejected("prepared_audit_mismatch");
      const canonicalEntry = await readEntry(repair.target_path);
      if (!canonicalEntry.file || canonicalEntry.bytes !== repair.canonical_bytes) return rejected("canonical_bytes_mismatch");
      try {
        await vault.modify(auditEntry.file, repair.final_audit_bytes);
      } catch (_error) {
        return rejected("audit_repair_failed");
      }
      return result("repaired", { write_counts: { ...ZERO_WRITES, audit: 1 } });
    }

    return Object.freeze({
      readBytes,
      readReceipt,
      createCanonical,
      modifyCanonical,
      prepareAudit,
      finalizeAudit,
      repairAudit,
      commitExact,
    });
  }

  function resolveObsidianAdapter(app) {
    if (!vaultReady(app)) return { ok: false, status: "runtime_unavailable", reason: "app_vault_unavailable" };
    return { ok: true, status: "ready", adapter: createObsidianAdapter(app) };
  }

  const api = Object.freeze({
    CANONICAL_PREFIX,
    AUDIT_DIRECTORY,
    auditPath,
    createObsidianAdapter,
    resolveObsidianAdapter,
  });
  root.LLMWikiObsidianAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
