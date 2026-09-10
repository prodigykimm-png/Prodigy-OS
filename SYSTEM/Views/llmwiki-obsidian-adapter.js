(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const mergeTransactionApi = root.LLMWikiMergeTransaction
    || (typeof require === "function" ? require("./llmwiki-merge-transaction.js") : null);

  const CANONICAL_PREFIX = "ZETA/PERMANENT/";
  const AUDIT_DIRECTORY = ".llmwiki-audit";
  const AUDIT_PREFIX = ".llmwiki-audit/";
  const IMMUTABLE_AUDIT_DIRECTORY = `${AUDIT_DIRECTORY}/immutable`;
  const IMMUTABLE_AUDIT_HEAD_PATH = `${IMMUTABLE_AUDIT_DIRECTORY}/head.json`;
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const NONCE = /^[A-Za-z0-9_-]{16,128}$/u;
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const FINALIZED_AUTHORITIES = new WeakSet();
  const AUTHORITY_DATA = new WeakMap();
  const MUTATION_FIELDS = new Set([
    "target_path", "before_bytes", "before_sha256", "after_bytes", "after_sha256", "allowed_properties",
    "source_citations", "live_revision", "packet_hash", "authorization_hash", "operation_id", "nonce", "audit",
  ]);
  const REPAIR_FIELDS = new Set([
    "audit_path", "target_path", "canonical_bytes", "prepared_audit_bytes", "final_audit_bytes",
  ]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cloneFrozen(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(cloneFrozen));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneFrozen(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function immutableHash(value) { const copy = clone(value); delete copy.audit_hash; return sha256(stable(copy)); }
  function result(status, extras = {}) {
    return Object.freeze({
      ok: status === "committed" || status === "repaired" || status === "duplicate" || status === "appended" || status === "restored" || status === "replaced",
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
  function immutableAuditPath(auditHash) {
    return typeof auditHash === "string" && HASH.test(auditHash)
      ? `${IMMUTABLE_AUDIT_DIRECTORY}/${auditHash}.json`
      : null;
  }
  function immutableAuditEntries(vault) {
    if (typeof vault.getFiles !== "function") return [];
    return vault.getFiles().filter((file) => file.path.startsWith(`${IMMUTABLE_AUDIT_DIRECTORY}/`) && file.path.endsWith(".json") && file.path !== IMMUTABLE_AUDIT_HEAD_PATH);
  }
  function immutableAuditHead(value) {
    return plain(value)
      && value.continuity_version === "llmwiki_immutable_audit_head_v1"
      && (value.head_hash === null || HASH.test(value.head_hash))
      && Number.isInteger(value.count) && value.count >= 0;
  }
  function validV2Authority(value, binding) {
    return plain(value)
      && value.schema_version === 2
      && value.canonical_id === binding.canonical_id
      && value.canonical_sha256 === binding.revision
      && HASH.test(value.claim_set_hash)
      && HASH.test(value.promotion_receipt_hash)
      && plain(value.claim_set) && value.claim_set.claim_set_hash === value.claim_set_hash
      && plain(value.promotion_receipt)
      && Array.isArray(value.sources) && value.sources.length > 0
      && Array.isArray(value.relations)
      && typeof value.ai_enrichment_status === "string" && value.ai_enrichment_status
      && value.status === "active";
  }

  function mergeFailureAuditPath(nonce) {
    if (typeof nonce !== "string" || !NONCE.test(nonce)) return null;
    return `${AUDIT_PREFIX}${nonce}.merge-failure.json`;
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
      writer_identity: "llmwiki_deterministic_writer_v1",
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
    const dataAdapter = vault.adapter;
    const directImmutableStorage = Boolean(dataAdapter
      && ["exists", "mkdir", "read", "write", "list"].every((method) => typeof dataAdapter[method] === "function"));
    async function readImmutableEntry(filePath) {
      if (!directImmutableStorage) return readEntry(filePath);
      if (!await dataAdapter.exists(filePath)) return { file: null, bytes: null };
      return { file: { path: filePath }, bytes: await dataAdapter.read(filePath) };
    }
    async function immutableAuditPaths() {
      if (!directImmutableStorage) return immutableAuditEntries(vault).map((file) => file.path);
      if (!await dataAdapter.exists(IMMUTABLE_AUDIT_DIRECTORY)) return [];
      const listed = await dataAdapter.list(IMMUTABLE_AUDIT_DIRECTORY);
      return (Array.isArray(listed?.files) ? listed.files : [])
        .filter((filePath) => filePath.startsWith(`${IMMUTABLE_AUDIT_DIRECTORY}/`) && filePath.endsWith(".json") && filePath !== IMMUTABLE_AUDIT_HEAD_PATH);
    }
    async function ensureImmutableAuditDirectories() {
      for (const directory of [AUDIT_DIRECTORY, IMMUTABLE_AUDIT_DIRECTORY]) {
        if (directImmutableStorage) {
          if (!await dataAdapter.exists(directory)) await dataAdapter.mkdir(directory);
        } else if (!vault.getAbstractFileByPath(directory)) await vault.createFolder(directory);
      }
    }
    async function writeImmutableEntry(filePath, bytes) {
      if (directImmutableStorage) return dataAdapter.write(filePath, bytes);
      const entry = await readEntry(filePath);
      return entry.file ? vault.modify(entry.file, bytes) : vault.create(filePath, bytes);
    }

    async function readBytes(targetPath) {
      if (!validCanonicalPath(targetPath)) throw adapterError("invalid_canonical_path");
      const entry = await readEntry(targetPath);
      return entry.file ? entry.bytes : null;
    }

    async function readSourceBytes(sourcePath) {
      if (typeof sourcePath !== "string" || !sourcePath.endsWith(".md") || sourcePath.startsWith("/")
        || sourcePath.includes("\\") || /[\x00-\x1f]/u.test(sourcePath) || sourcePath.split("/").some(p => p === ".." || p === "." || !p)) throw adapterError("invalid_source_path");
      return (await readEntry(sourcePath)).bytes;
    }

    function validateNewWikiLinks(before, after, targetPath) {
      const links = bytes => [...String(bytes).matchAll(/\[\[([^\]\n]+)\]\]/gu)].map(match => match[1].split("|")[0].split("#")[0].trim()).filter(Boolean);
      const prior = new Set(links(before));
      for (const link of new Set(links(after))) {
        if (prior.has(link)) continue;
        if (link.startsWith("/") || link.includes("\\") || link.split("/").some(part => part === ".." || part === ".")) return rejected("invalid_source_path");
        const direct = link.endsWith(".md") ? link : `${link}.md`;
        const resolved = app.metadataCache?.getFirstLinkpathDest?.(link, targetPath)
          || vault.getAbstractFileByPath(direct);
        const matches = resolved ? [resolved] : (typeof vault.getFiles === "function" ? vault.getFiles().filter(file => file.extension === "md" && file.basename === link) : []);
        if (direct !== targetPath && matches.length !== 1) return rejected("link_target_missing");
      }
      return { ok: true };
    }

    async function readCanonical(targetPath) {
      const bytes = await readBytes(targetPath);
      if (bytes === null) throw adapterError("canonical_target_missing");
      return { path: targetPath, bytes, revision: sha256(bytes), metadata: { mode: 0o644, symlink: false, contained: true } };
    }

    function mergeAuthority() {
      const api = root.LLMWikiMergeTransaction || mergeTransactionApi;
      if (!api) throw adapterError("merge_transaction_runtime_unavailable");
      return api;
    }

    async function atomicReplace(request) {
      const operationCore = root.LLMWikiOperationWriterCore || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);
      if (!request || !validCanonicalPath(request.target_path)) throw adapterError("unbranded_merge_replace_request");
      const entry = await readEntry(request.target_path);
      if (!entry.file) throw adapterError("canonical_target_missing");
      if (operationCore && operationCore.isReplaceRequest(request)) {
        for (const citation of request.source_citations || []) {
          const bytes = await readSourceBytes(citation.locators[0].split("#")[0]);
          if (typeof bytes !== "string" || sha256(bytes) !== citation.content_hash) throw adapterError("stale_source");
        }
        operationCore.assertAtomicReplaceRequest(request, (await readEntry(request.target_path)).bytes);
      }
      else mergeAuthority().assertAtomicReplaceRequest(request, { bytes: entry.bytes, metadata: { mode: 0o644 } });
      const links = validateNewWikiLinks(entry.bytes, request.after_bytes, request.target_path);
      if (!links.ok) throw adapterError(links.reason);
      await vault.modify(entry.file, request.after_bytes);
      const verified = await readEntry(request.target_path);
      if (!verified.file || verified.bytes !== request.after_bytes) throw adapterError("written_bytes_mismatch");
      return { ok: true, status: "replaced", path: request.target_path };
    }

    async function replaceCompensationExact(request) {
      if (!plain(request) || !validCanonicalPath(request.path)
        || typeof request.expected_bytes !== "string" || typeof request.next_bytes !== "string"
        || !HASH.test(request.expected_revision)) {
        return rejected("malformed_compensation_replace");
      }
      const entry = await readEntry(request.path);
      if (!entry.file) return rejected("canonical_target_missing");
      if (entry.bytes !== request.expected_bytes || sha256(entry.bytes) !== request.expected_revision) {
        return rejected("stale_compensation_revision");
      }
      await vault.modify(entry.file, request.next_bytes);
      const verified = await readEntry(request.path);
      if (!verified.file || verified.bytes !== request.next_bytes) return rejected("written_bytes_mismatch");
      return result("replaced", { path: request.path, revision: sha256(verified.bytes) });
    }

    async function restoreExact(request) {
      const operationCore = root.LLMWikiOperationWriterCore || (typeof require === "function" ? require("./llmwiki-operation-writer-core.js") : null);
      if (!request || !validCanonicalPath(request.target_path)) throw adapterError("unbranded_merge_restore_request");
      const entry = await readEntry(request.target_path);
      if (!entry.file) throw adapterError("canonical_target_missing");
      if (operationCore && operationCore.isRestoreRequest(request)) operationCore.assertRestoreRequest(request, entry.bytes);
      else mergeAuthority().assertRestoreRequest(request, { bytes: entry.bytes, metadata: { mode: 0o644 } });
      await vault.modify(entry.file, request.restore_bytes);
      const verified = await readEntry(request.target_path);
      if (!verified.file || verified.bytes !== request.restore_bytes) throw adapterError("restore_verify_failed");
      return { ok: true, status: "restored", path: request.target_path };
    }

    async function recordMergeAudit(request) {
      mergeAuthority().assertAuditRequest(request);
      const filePath = mergeFailureAuditPath(request.nonce);
      if (!filePath || vault.getAbstractFileByPath(filePath)) return rejected("merge_audit_conflict");
      if (!vault.getAbstractFileByPath(AUDIT_DIRECTORY)) await vault.createFolder(AUDIT_DIRECTORY);
      await vault.create(filePath, jsonBytes(request.audit));
      return { ok: true, status: "recorded", path: filePath };
    }

    async function readAuditEntry(filePath) {
      const entry = await readEntry(filePath);
      if (entry.file || !directImmutableStorage) return entry;
      let exists = false;
      try { exists = await dataAdapter.exists(filePath); } catch (_ignored) {}
      if (!exists) return entry;
      return { file: { path: filePath }, bytes: await dataAdapter.read(filePath) };
    }
    async function writeAuditBytes(file, bytes) {
      if (directImmutableStorage && file && typeof file.path === "string") {
        await dataAdapter.write(file.path, bytes);
        return;
      }
      await vault.modify(file, bytes);
    }
    async function readReceipt(nonce) {
      const filePath = auditPath(nonce);
      if (!filePath) throw adapterError("invalid_audit_nonce");
      const entry = await readAuditEntry(filePath);
      if (!entry.file) return null;
      try { return JSON.parse(entry.bytes); }
      catch (_error) { throw adapterError("malformed_audit_record"); }
    }

    async function prepareAudit(mutation) {
      if (!validMutation(mutation)) return rejected("malformed_mutation");
      const filePath = auditPath(mutation.nonce);
      const bytes = jsonBytes(preparedRecord(mutation));
      const existing = await readAuditEntry(filePath);
      if (existing.file) {
        // A restart may find the write-ahead record without a canonical write.
        // Reuse only the exact original mutation, including its audit timestamp.
        if (existing.bytes !== bytes) return rejected("audit_prepare_conflict");
        return { ok: true, status: "prepared", file: existing.file, bytes };
      }
      try {
        await ensureVaultDirectory(AUDIT_DIRECTORY);
        let file;
        if (directImmutableStorage) {
          await dataAdapter.write(filePath, bytes);
          file = { path: filePath };
        } else {
          file = await vault.create(filePath, bytes);
        }
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
        await writeAuditBytes(prepared.file, bytes);
        return { ok: true, status: "finalized" };
      } catch (_error) {
        return rejected("audit_finalize_failed", { write_counts: { ...ZERO_WRITES, audit: 1 } });
      }
    }

    async function ensureVaultDirectory(directory) {
      if (vault.getAbstractFileByPath(directory)) return;
      try {
        await vault.createFolder(directory);
        return;
      } catch (error) {
        if (vault.getAbstractFileByPath(directory)) return;
        if (directImmutableStorage) {
          try {
            if (await dataAdapter.exists(directory)) return;
          } catch (_ignored) {}
        }
        throw error;
      }
    }
    async function createCanonical(targetPath, bytes) {
      if (!validCanonicalPath(targetPath) || typeof bytes !== "string") throw adapterError("invalid_canonical_write");
      const segments = targetPath.split("/");
      for (let depth = 1; depth < segments.length; depth += 1) {
        await ensureVaultDirectory(segments.slice(0, depth).join("/"));
      }
      return vault.create(targetPath, bytes);
    }

    async function modifyCanonical(file, bytes) {
      if (!plain(file) || !validCanonicalPath(file.path) || typeof bytes !== "string") throw adapterError("invalid_canonical_write");
      await vault.modify(file, bytes);
      return file;
    }

    async function commitExact(mutation, options = {}) {
      if (!validMutation(mutation)) return rejected("malformed_mutation");
      const live = await readEntry(mutation.target_path);
      const create = mutation.before_bytes === "";
      if ((create && live.file) || (!create && (!live.file || live.bytes !== mutation.before_bytes))) {
        return rejected("target_revision_mismatch");
      }

      const links = validateNewWikiLinks(mutation.before_bytes, mutation.after_bytes, mutation.target_path);
      if (!links.ok) return links;
      const prepared = await prepareAudit(mutation);
      if (!prepared.ok) return prepared;

      try {
        if (options.revalidateSources) for (const citation of mutation.source_citations) {
          const bytes = await readSourceBytes(citation.locators[0].split("#")[0]);
          if (typeof bytes !== "string" || sha256(bytes) !== citation.content_hash) throw adapterError("stale_source");
        }
        const current = await readEntry(mutation.target_path);
        if (create ? Boolean(current.file) : !current.file || current.bytes !== mutation.before_bytes) throw adapterError("target_revision_mismatch");
        const currentLinks = validateNewWikiLinks(mutation.before_bytes, mutation.after_bytes, mutation.target_path);
        if (!currentLinks.ok) throw adapterError(currentLinks.reason);
        if (create) await createCanonical(mutation.target_path, mutation.after_bytes);
        else await modifyCanonical(current.file, mutation.after_bytes);
      } catch (error) {
        const reason = ["stale_source", "target_revision_mismatch", "link_target_missing"].includes(error.code) ? error.code : "canonical_write_failed";
        if (reason === "canonical_write_failed") {
          // The save may have succeeded before its acknowledgement was lost.
          // Keep the write-ahead record; recovery inspects exact bytes, not the error.
          const observed = await readEntry(mutation.target_path);
          if (observed.bytes === mutation.after_bytes) return result("committed_audit_pending", {
            reason, write_counts: { ...ZERO_WRITES, canonical: 1, audit: 1 },
            target_path: mutation.target_path, repair: repairPayload(mutation, prepared.bytes),
          });
        }
        const rejection = await finalizeAudit(prepared, jsonBytes(rejectedRecord(mutation, reason)));
        return rejected(reason, {
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
      const auditEntry = await readAuditEntry(repair.audit_path);
      if (!auditEntry.file) return rejected("prepared_audit_missing");
      if (auditEntry.bytes !== repair.final_audit_bytes && auditEntry.bytes !== repair.prepared_audit_bytes) return rejected("prepared_audit_mismatch");
      const canonicalEntry = await readEntry(repair.target_path);
      if (!canonicalEntry.file || canonicalEntry.bytes !== repair.canonical_bytes) return rejected("canonical_bytes_mismatch");
      if (auditEntry.bytes === repair.final_audit_bytes) return result("duplicate");
      try {
        await writeAuditBytes(auditEntry.file, repair.final_audit_bytes);
      } catch (_error) {
        return rejected("audit_repair_failed");
      }
      return result("repaired", { write_counts: { ...ZERO_WRITES, audit: 1 } });
    }

    async function appendImmutableAudit(request) {
      const immutablePath = plain(request) && typeof request.audit_bytes === "string"
        ? immutableAuditPath(request.audit_hash)
        : null;
      if (!immutablePath || typeof request.audit_id !== "string" || !request.audit_id
        || !Number.isInteger(request.audit_count) || request.audit_count < 1
        || (request.previous_audit_hash !== null && !HASH.test(request.previous_audit_hash))) {
        return rejected("malformed_immutable_audit");
      }
      let audit;
      try { audit = JSON.parse(request.audit_bytes); }
      catch (_error) { return rejected("malformed_immutable_audit"); }
      if (!plain(audit) || audit.audit_hash !== request.audit_hash || audit.audit_id !== request.audit_id
        || audit.audit_count !== request.audit_count || audit.previous_audit_hash !== request.previous_audit_hash) {
        return rejected("immutable_audit_request_mismatch");
      }
      const existing = await readImmutableEntry(immutablePath);
      if (existing.file) return rejected("immutable_audit_replay");
      const continuity = await readImmutableAuditContinuity();
      if (!continuity.ok) return continuity;
      if (request.previous_audit_hash !== continuity.head_hash || request.audit_count !== continuity.count + 1) {
        return rejected("immutable_audit_continuity_mismatch");
      }
      for (const filePath of await immutableAuditPaths()) {
        const entry = await readImmutableEntry(filePath);
        try {
          if (entry.bytes && JSON.parse(entry.bytes).audit_id === request.audit_id) return rejected("immutable_audit_replay");
        } catch (_error) { return rejected("immutable_audit_record_malformed"); }
      }
      try { await ensureImmutableAuditDirectories(); }
      catch (_error) { return rejected("immutable_audit_directory_failed"); }
      try {
        await writeImmutableEntry(immutablePath, request.audit_bytes);
        const nextHead = jsonBytes({
          continuity_version: "llmwiki_immutable_audit_head_v1",
          head_hash: request.audit_hash,
          count: request.audit_count,
        });
        await writeImmutableEntry(IMMUTABLE_AUDIT_HEAD_PATH, nextHead);
        return result("appended", { audit_path: immutablePath, write_counts: { ...ZERO_WRITES, audit: 2 } });
      } catch (_error) {
        return rejected("immutable_audit_head_update_failed");
      }
    }

    async function readImmutableAuditContinuity() {
      const head = await readImmutableEntry(IMMUTABLE_AUDIT_HEAD_PATH);
      const entries = await immutableAuditPaths();
      if (!head.file) {
        return entries.length
          ? rejected("immutable_audit_continuity_missing")
          : { ok: true, head_hash: null, count: 0 };
      }
      let value;
      try { value = JSON.parse(head.bytes); }
      catch (_error) { return rejected("immutable_audit_continuity_invalid"); }
      if (!immutableAuditHead(value)) return rejected("immutable_audit_continuity_invalid");
      if (entries.length !== value.count) return rejected("immutable_audit_continuity_gap");
      return { ok: true, head_hash: value.head_hash, count: value.count };
    }

    // Explicit apply recovery only. Read/query paths never repair storage.
    async function repairImmutableAuditHead(binding) {
      if (!plain(binding) || !HASH.test(binding.packet_hash) || !HASH.test(binding.authorization_hash)
        || !HASH.test(binding.revision) || !validCanonicalPath(binding.target_path)) return rejected("invalid_resurfacing_binding");
      const continuity = await readImmutableAuditContinuity();
      if (continuity.ok) return { ok: true, status: "duplicate" };
      if (!["immutable_audit_continuity_gap", "immutable_audit_continuity_missing"].includes(continuity.reason)) return continuity;
      const headEntry = await readImmutableEntry(IMMUTABLE_AUDIT_HEAD_PATH);
      let head;
      if (continuity.reason === "immutable_audit_continuity_missing" && !headEntry.file && headEntry.bytes === null) {
        // First append persisted one record before creating its head. The same
        // exact binding and full chain checks below must authorize recovery.
        head = { continuity_version: "llmwiki_immutable_audit_head_v1", head_hash: null, count: 0 };
      } else {
        try { head = JSON.parse(headEntry.bytes); } catch (_) { return rejected("immutable_audit_continuity_invalid"); }
      }
      if (!immutableAuditHead(head)) return rejected("immutable_audit_continuity_invalid");
      const paths = await immutableAuditPaths();
      if (paths.length !== head.count + 1) return rejected("immutable_audit_continuity_gap");
      const records = [];
      for (const path of paths) {
        let audit;
        try { audit = JSON.parse((await readImmutableEntry(path)).bytes); } catch (_) { return rejected("immutable_audit_record_malformed"); }
        if (!plain(audit) || audit.audit_hash !== immutableHash(audit)) return rejected("immutable_audit_record_mismatch");
        records.push(audit);
      }
      records.sort((a,b) => a.audit_count - b.audit_count);
      let previous = null;
      for (const [index, audit] of records.entries()) {
        if (audit.audit_count !== index + 1 || audit.previous_audit_hash !== previous) return rejected("immutable_audit_continuity_mismatch");
        previous = audit.audit_hash;
      }
      if (head.count && records[head.count - 1].audit_hash !== head.head_hash) return rejected("immutable_audit_continuity_mismatch");
      const orphan = records[head.count];
      const match = orphan.resurfacing_bindings?.find(row => row.path === binding.target_path && row.revision === binding.revision
        && row.packet_hash === binding.packet_hash && row.authorization_hash === binding.authorization_hash);
      if (!match || orphan.packet_hash !== binding.packet_hash) return rejected("immutable_audit_replay");
      const final = await readReceipt(match.nonce);
      if (!final || final.result !== "committed" || final.packet_hash !== binding.packet_hash
        || final.authorization_hash !== binding.authorization_hash || sha256(jsonBytes(final)) !== match.final_audit_sha256) return rejected("immutable_audit_record_mismatch");
      const live = await readCanonical(binding.target_path);
      if (live.revision !== binding.revision) return rejected("stale_before_write");
      // Another writer must not have advanced the head while we inspected it.
      if ((await readImmutableEntry(IMMUTABLE_AUDIT_HEAD_PATH)).bytes !== headEntry.bytes) return rejected("immutable_audit_continuity_mismatch");
      try { await writeImmutableEntry(IMMUTABLE_AUDIT_HEAD_PATH, jsonBytes({ continuity_version: "llmwiki_immutable_audit_head_v1", head_hash: orphan.audit_hash, count: orphan.audit_count })); }
      catch (_) { return rejected("immutable_audit_head_update_failed"); }
      return { ok: true, status: "repaired" };
    }

    async function readImmutableAudit(auditHash) {
      const filePath = immutableAuditPath(auditHash);
      if (!filePath) return null;
      const entry = await readImmutableEntry(filePath);
      return entry.file ? entry.bytes : null;
    }

    async function readFinalizedCanonicalAuthorities() {
      const continuity = await readImmutableAuditContinuity();
      if (!continuity.ok || continuity.count < 1 || !HASH.test(continuity.head_hash)) return Object.freeze([]);
      const entries = [];
      for (const filePath of await immutableAuditPaths()) {
        const entry = await readImmutableEntry(filePath);
        let audit;
        try { audit = JSON.parse(entry.bytes); } catch (_) { return Object.freeze([]); }
        if (!plain(audit) || audit.audit_type !== "canonical_committed" || audit.audit_version !== "llmwiki_immutable_compensation_audit_v1"
          || !HASH.test(audit.audit_hash) || audit.audit_hash !== immutableHash(audit)
          || !Number.isInteger(audit.audit_count) || !Array.isArray(audit.resurfacing_bindings)) return Object.freeze([]);
        entries.push(audit);
      }
      entries.sort((a, b) => a.audit_count - b.audit_count);
      let previous = null;
      const usedNonce = new Set(), authorities = [];
      const authorityIndexByCanonical = new Map();
      for (const [index, audit] of entries.entries()) {
        if (audit.audit_count !== index + 1 || audit.previous_audit_hash !== previous) return Object.freeze([]);
        previous = audit.audit_hash;
        const boundInThisAudit = new Set();
        for (const binding of audit.resurfacing_bindings) {
          if (!plain(binding) || !ID.test(binding.canonical_id) || !validCanonicalPath(binding.path) || !HASH.test(binding.revision)
            || auditPath(binding.nonce) === null || !HASH.test(binding.final_audit_sha256)
            || !HASH.test(binding.packet_hash) || !HASH.test(binding.authorization_hash)
            || binding.packet_hash !== audit.packet_hash || usedNonce.has(binding.nonce) || boundInThisAudit.has(binding.canonical_id)) return Object.freeze([]);
          const finalized = await readAuditEntry(auditPath(binding.nonce));
          if (!finalized.file || sha256(finalized.bytes) !== binding.final_audit_sha256) return Object.freeze([]);
          let finalAudit;
          try { finalAudit = JSON.parse(finalized.bytes); } catch (_) { return Object.freeze([]); }
          if (!plain(finalAudit) || finalAudit.result !== "committed" || finalAudit.canonical_id !== binding.canonical_id
            || finalAudit.target_path !== binding.path || finalAudit.after_sha256 !== binding.revision
            || finalAudit.nonce !== binding.nonce || finalAudit.packet_hash !== binding.packet_hash
            || finalAudit.authorization_hash !== binding.authorization_hash || !HASH.test(finalAudit.before_sha256)
            || !HASH.test(finalAudit.live_revision) || !HASH.test(finalAudit.consent_hash)
            || !Array.isArray(finalAudit.source_ids) || typeof finalAudit.committed_at !== "string" || !Number.isFinite(Date.parse(finalAudit.committed_at))) return Object.freeze([]);
          const v2Authority = audit.canonical_v2_authority;
          if (v2Authority !== undefined && !validV2Authority(v2Authority, binding)) return Object.freeze([]);
          const authority = Object.freeze({});
          const authorityData = cloneFrozen({
            canonical_id: binding.canonical_id,
            path: binding.path,
            revision: binding.revision,
            nonce: binding.nonce,
            packet_hash: binding.packet_hash,
            authorization_hash: binding.authorization_hash,
            immutable_audit_hash: audit.audit_hash,
            ...(v2Authority ? { canonical_v2_authority: v2Authority } : {}),
          });
          FINALIZED_AUTHORITIES.add(authority);
          AUTHORITY_DATA.set(authority, authorityData);
          usedNonce.add(binding.nonce); boundInThisAudit.add(binding.canonical_id);
          const existingIndex = authorityIndexByCanonical.get(binding.canonical_id);
          if (existingIndex === undefined) {
            authorityIndexByCanonical.set(binding.canonical_id, authorities.length);
            authorities.push(authority);
          } else {
            // A later finalized commit supersedes the earlier revision of the same canonical identity.
            authorities[existingIndex] = authority;
          }
        }
      }
      if (entries.length !== continuity.count || previous !== continuity.head_hash) return Object.freeze([]);
      return Object.freeze(authorities);
    }

    return Object.freeze({
      readBytes,
      readCanonical,
      readSourceBytes,
      validateNewWikiLinks,
      readReceipt,
      createCanonical,
      modifyCanonical,
      atomicReplace,
      replaceCompensationExact,
      restoreExact,
      recordMergeAudit,
      prepareAudit,
      finalizeAudit,
      repairAudit,
      appendImmutableAudit,
      readImmutableAuditContinuity,
      repairImmutableAuditHead,
      readImmutableAudit,
      readFinalizedCanonicalAuthorities,
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
    IMMUTABLE_AUDIT_DIRECTORY,
    IMMUTABLE_AUDIT_HEAD_PATH,
    auditPath,
    immutableAuditPath,
    mergeFailureAuditPath,
    createObsidianAdapter,
    resolveObsidianAdapter,
    isFinalizedCanonicalAuthority: function (value) { return Boolean(value) && FINALIZED_AUTHORITIES.has(value); },
    finalizedCanonicalAuthorityData: function (value) {
      return FINALIZED_AUTHORITIES.has(value) ? cloneFrozen(AUTHORITY_DATA.get(value)) : null;
    },
  });
  root.LLMWikiObsidianAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
