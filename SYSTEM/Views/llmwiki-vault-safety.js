(function (root) {
  "use strict";

  const fs = typeof require === "function" ? require("node:fs") : null;
  const path = typeof require === "function" ? require("node:path") : null;
  const operationWriter = root.LLMWikiOperationWriter
    || (typeof require === "function" ? require("./llmwiki-operation-writer.js") : null);
  const mergeTransaction = root.LLMWikiMergeTransaction
    || (typeof require === "function" ? require("./llmwiki-merge-transaction.js") : null);
  const nodeTypes = typeof require === "function" ? require("node:util").types : null;

  const CANONICAL_PREFIX = "ZETA/PERMANENT/";
  const ADAPTERS = new WeakSet();

  function safetyError(code) { const error = new Error(code); error.code = code; return error; }
  function validCanonicalPath(value) {
    if (typeof value !== "string" || value !== value.trim() || !value.startsWith(CANONICAL_PREFIX) || !value.endsWith(".md")) return false;
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value) || /[\u0000-\u001f\u007f\\]/u.test(value)) return false;
    const segments = value.split("/");
    return segments.length >= 3 && segments.every((segment) => segment && segment !== "." && segment !== "..");
  }
  function inside(rootPath, targetPath) { return targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`); }
  function inspectRequest(value, fields, reason) {
    try {
      if (!value || typeof value !== "object" || Array.isArray(value) || nodeTypes?.isProxy?.(value)) throw safetyError(reason);
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw safetyError(reason);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors);
      if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) throw safetyError(reason);
      const snapshot = {};
      for (const key of fields) {
        const descriptor = descriptors[key];
        if (!descriptor || Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) throw safetyError(reason);
        snapshot[key] = descriptor.value;
      }
      return snapshot;
    } catch (error) { if (error && error.code === reason) throw error; throw safetyError(reason); }
  }

  function createVaultSafetyAdapter(options = {}) {
    if (!fs || !path || !operationWriter) throw safetyError("vault_safety_runtime_unavailable");
    const rootDir = options.rootDir;
    if (typeof rootDir !== "string" || !path.isAbsolute(rootDir)) throw safetyError("absolute_vault_root_required");
    let rootStat;
    try { rootStat = fs.lstatSync(rootDir); }
    catch (_error) { throw safetyError("vault_root_unavailable"); }
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw safetyError("unsafe_vault_root");
    const rootReal = fs.realpathSync(rootDir);

    function secureTarget(relativePath) {
      if (!validCanonicalPath(relativePath)) throw safetyError("invalid_canonical_path");
      const target = path.resolve(rootReal, ...relativePath.split("/"));
      if (!inside(rootReal, target)) throw safetyError("path_escape_forbidden");
      let current = rootReal;
      for (const segment of relativePath.split("/")) {
        current = path.join(current, segment);
        let stat;
        try { stat = fs.lstatSync(current); }
        catch (error) {
          if (error && error.code === "ENOENT") throw safetyError("canonical_target_missing");
          throw error;
        }
        if (stat.isSymbolicLink()) throw safetyError("symlink_path_forbidden");
      }
      const real = fs.realpathSync(target);
      if (!inside(rootReal, real)) throw safetyError("path_escape_forbidden");
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw safetyError("canonical_target_not_regular_file");
      return { target, stat };
    }

    function readCanonical(relativePath) {
      const secured = secureTarget(relativePath);
      return {
        path: relativePath,
        bytes: fs.readFileSync(secured.target, "utf8"),
        metadata: { mode: secured.stat.mode & 0o777, symlink: false, contained: true },
      };
    }

    function exactAtomicReplace(relativePath, expectedBytes, nextBytes, token, authorize) {
      const secured = secureTarget(relativePath);
      let currentBytes = fs.readFileSync(secured.target, "utf8");
      authorize(token, currentBytes);
      const tempPath = path.join(path.dirname(secured.target), `.${path.basename(secured.target)}.llmwiki-${token.authorization_hash.slice(0, 20)}.tmp`);
      let descriptor = null;
      try {
        descriptor = fs.openSync(tempPath, "wx", secured.stat.mode & 0o777);
        fs.writeFileSync(descriptor, nextBytes, "utf8");
        fs.fsyncSync(descriptor);
        fs.fchmodSync(descriptor, secured.stat.mode & 0o777);
        fs.closeSync(descriptor);
        descriptor = null;

        // This is the last operation before rename: reject external drift without replacing it.
        const beforeRename = secureTarget(relativePath);
        currentBytes = fs.readFileSync(beforeRename.target, "utf8");
        if (currentBytes !== expectedBytes) throw safetyError("stale_before_write");
        fs.renameSync(tempPath, secured.target);
        try {
          const directory = fs.openSync(path.dirname(secured.target), "r");
          try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
        } catch (_error) { /* Some filesystems do not support directory fsync; rename is already atomic. */ }
      } catch (error) {
        if (descriptor !== null) { try { fs.closeSync(descriptor); } catch (_closeError) {} }
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_cleanupError) {}
        throw error;
      }
      const verified = readCanonical(relativePath);
      if (verified.bytes !== nextBytes) throw safetyError("written_bytes_mismatch");
      return { ok: true, status: "replaced", path: relativePath, bytes: verified.bytes, metadata: verified.metadata };
    }

    function atomicReplace(request) {
      const mergeRequest = request && Object.hasOwn(request, "compensation_plan_hash");
      const fields = mergeRequest
        ? ["target_path", "expected_before_bytes", "expected_before_sha256", "expected_mode", "after_bytes", "after_sha256", "packet_hash", "authorization_hash", "compensation_plan_hash"]
        : ["target_path", "expected_before_bytes", "expected_before_sha256", "after_bytes", "after_sha256", "packet_hash", "authorization_hash", "compensation"];
      const value = inspectRequest(request, fields, "malformed_atomic_replace_request");
      const authorize = mergeRequest
        ? (token, currentBytes) => mergeTransaction.assertAtomicReplaceRequest(token, { bytes: currentBytes, metadata: { mode: secureTarget(value.target_path).stat.mode & 0o777 } })
        : operationWriter.assertAtomicReplaceRequest;
      return exactAtomicReplace(value.target_path, value.expected_before_bytes, value.after_bytes, request, authorize);
    }

    function restoreExact(request) {
      const mergeRequest = request && Object.hasOwn(request, "compensation_plan_hash");
      const fields = mergeRequest
        ? ["target_path", "expected_written_bytes", "expected_written_sha256", "expected_mode", "restore_bytes", "restore_sha256", "restore_mode", "packet_hash", "authorization_hash", "compensation_plan_hash"]
        : ["target_path", "expected_written_bytes", "expected_written_sha256", "restore_bytes", "restore_sha256", "packet_hash", "authorization_hash", "compensation"];
      const value = inspectRequest(request, fields, "malformed_restore_request");
      const authorize = mergeRequest
        ? (token, currentBytes) => mergeTransaction.assertRestoreRequest(token, { bytes: currentBytes, metadata: { mode: secureTarget(value.target_path).stat.mode & 0o777 } })
        : operationWriter.assertRestoreRequest;
      return exactAtomicReplace(value.target_path, value.expected_written_bytes, value.restore_bytes, request, authorize);
    }

    function recordMergeAudit(request) {
      mergeTransaction.assertAuditRequest(request);
      const auditDir = path.join(rootReal, ".llmwiki-audit");
      if (fs.existsSync(auditDir)) {
        const stat = fs.lstatSync(auditDir);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw safetyError("unsafe_audit_directory");
      } else fs.mkdirSync(auditDir, { mode: 0o700 });
      const target = path.join(auditDir, `${request.nonce}.merge-failure.json`);
      if (!inside(rootReal, target)) throw safetyError("path_escape_forbidden");
      fs.writeFileSync(target, `${JSON.stringify(request.audit, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return { ok: true, status: "recorded", path: target };
    }

    const adapter = Object.freeze({ readCanonical, atomicReplace, restoreExact, recordMergeAudit });
    ADAPTERS.add(adapter);
    return adapter;
  }

  function isVaultSafetyAdapter(value) { return Boolean(value && ADAPTERS.has(value)); }

  const api = Object.freeze({ CANONICAL_PREFIX, validCanonicalPath, createVaultSafetyAdapter, isVaultSafetyAdapter });
  root.LLMWikiVaultSafety = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
