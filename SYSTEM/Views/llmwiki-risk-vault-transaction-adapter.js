(function (root) {
  "use strict";

  const ZERO = Object.freeze({ canonical: 0, audit: 0, refresh: 0, git: 0 });
  const ADAPTERS = new WeakSet();
  const CANONICAL_PREFIX = "ZETA/PERMANENT/";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function frozen(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(frozen));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozen(item)])));
  }
  function counts(canonical = 0, audit = 0) { return frozen({ ...ZERO, canonical, audit }); }
  function result(status, details = {}) { return frozen({ ok: ["committed", "duplicate", "restored", "recorded"].includes(status), status, write_counts: details.write_counts || counts(), ...details }); }
  function sameState(left, right) {
    if (left.exists !== right.exists || left.encoding !== right.encoding || left.mode !== right.mode || left.symlink !== right.symlink) return false;
    if (!left.exists) return true;
    if (typeof left.sha256 === "string" && typeof right.sha256 === "string") return left.sha256 === right.sha256;
    return left.size === right.size && left.mtime === right.mtime;
  }

  function createRiskVaultTransactionAdapter(options = {}) {
    const packetApi = options.packetApi || root.LLMWikiRiskApprovalPacket;
    const writeSetApi = options.writeSetApi || root.LLMWikiRiskWriteSet;
    const hashApi = root.LLMWikiHash;
    const vault = options.app?.vault;
    const storage = vault?.adapter;
    if (!packetApi || !writeSetApi || !hashApi) throw new Error("risk_transaction_contract_unavailable");
    if (!vault || typeof vault.getAbstractFileByPath !== "function" || typeof vault.read !== "function" || typeof vault.modify !== "function" || typeof vault.create !== "function") throw new Error("app_vault_unavailable");
    if (typeof vault.getFiles !== "function" || typeof vault.on !== "function" || typeof vault.offref !== "function") throw new Error("independent_vault_observer_unavailable");
    const preflights = new WeakMap();
    const committed = new WeakMap();
    const audits = new Map();
    let boundary = null;
    let observing = false;

    function hiddenPath(filePath) { return typeof filePath === "string" && filePath.startsWith("."); }
    function hiddenStorageAvailable() {
      return storage && ["exists", "read", "write", "remove", "mkdir"].every((name) => typeof storage[name] === "function");
    }
    async function pathExists(filePath) {
      if (hiddenPath(filePath) && hiddenStorageAvailable()) return Boolean(await storage.exists(filePath));
      return Boolean(vault.getAbstractFileByPath(filePath));
    }
    async function ensureFolder(filePath) {
      if (hiddenPath(filePath) && hiddenStorageAvailable()) {
        if (!await storage.exists(filePath)) await storage.mkdir(filePath);
        return;
      }
      if (!vault.getAbstractFileByPath(filePath)) await vault.createFolder(filePath);
    }
    async function writeText(filePath, bytes) {
      if (hiddenPath(filePath) && hiddenStorageAvailable()) {
        await storage.write(filePath, bytes);
        return;
      }
      await vault.create(filePath, bytes);
    }

    function modeOf(file, filePath) {
      if (!file) return null;
      if (typeof vault.mode === "function") return vault.mode(filePath);
      if (Number.isSafeInteger(file.stat?.mode)) return file.stat.mode & 0o777;
      return 0o644;
    }
    function textPath(filePath) { return /\.(?:md|txt|json|js|css|html|xml|csv|yaml|yml)$/iu.test(filePath); }
    async function readState(filePath, options = {}) {
      if (hiddenPath(filePath) && hiddenStorageAvailable()) {
        if (!await storage.exists(filePath)) return absentState(filePath);
        const bytes = await storage.read(filePath);
        return frozen({ path: filePath, exists: true, encoding: "text", bytes, sha256: hashApi.sha256(bytes), size: bytes.length, mtime: 0, mode: 0o644, symlink: false, restorable: true });
      }
      const file = vault.getAbstractFileByPath(filePath);
      if (!file) return absentState(filePath);
      const encoding = textPath(filePath) ? "text" : "binary";
      const size = Number(file.stat?.size || 0);
      const mtime = Number(file.stat?.mtime || 0);
      if (encoding === "binary" && options.retainBytes === false) {
        return frozen({ path: filePath, exists: true, encoding, bytes: null, sha256: null, size, mtime, mode: modeOf(file, filePath), symlink: Boolean(file?.stat?.symlink), restorable: false });
      }
      let bytes;
      if (encoding === "text") bytes = await vault.read(file);
      else {
        if (typeof vault.readBinary !== "function") throw new Error("independent_binary_inventory_unavailable");
        bytes = Array.from(new Uint8Array(await vault.readBinary(file)));
      }
      const digest = encoding === "text" ? hashApi.sha256(bytes) : hashApi.sha256Bytes(Uint8Array.from(bytes));
      return frozen({ path: filePath, exists: true, encoding, bytes, sha256: digest, size, mtime, mode: modeOf(file, filePath), symlink: Boolean(file?.stat?.symlink), restorable: true });
    }
    function absentState(filePath) { return frozen({ path: filePath, exists: false, encoding: null, bytes: null, sha256: null, size: 0, mtime: 0, mode: null, symlink: false, restorable: true }); }
    async function inventory() {
      const files = vault.getFiles();
      if (!Array.isArray(files)) throw new Error("independent_vault_inventory_unavailable");
      const rows = new Map();
      for (const file of files.slice().sort((a, b) => String(a?.path).localeCompare(String(b?.path)))) {
        if (!file || typeof file.path !== "string") throw new Error("invalid_vault_inventory_entry");
        rows.set(file.path, await readState(file.path, { retainBytes: textPath(file.path) }));
      }
      return rows;
    }
    async function setMode(filePath, mode) { if (mode !== null && typeof vault.setMode === "function") await vault.setMode(filePath, mode); }
    async function restoreState(prior) {
      if (hiddenPath(prior.path) && hiddenStorageAvailable()) {
        const live = await storage.exists(prior.path);
        if (!prior.exists && live) await storage.remove(prior.path);
        else if (prior.exists) {
          if (prior.restorable === false || typeof prior.bytes !== "string") throw new Error("independent_restoration_bytes_unavailable");
          await storage.write(prior.path, prior.bytes);
        }
        const verified = await readState(prior.path);
        if (!sameState(verified, prior)) throw new Error("independent_restoration_verify_failed");
        return;
      }
      const live = vault.getAbstractFileByPath(prior.path);
      if (!prior.exists) {
        if (live) {
          if (typeof vault.delete !== "function") throw new Error("vault_delete_unavailable_for_compensation");
          await vault.delete(live, true);
        }
      } else {
        if (prior.restorable === false) throw new Error("independent_restoration_bytes_unavailable");
        if (prior.encoding === "binary") {
          const binary = Uint8Array.from(prior.bytes).buffer;
          if (live) {
            if (typeof vault.modifyBinary !== "function") throw new Error("vault_binary_restore_unavailable");
            await vault.modifyBinary(live, binary);
          } else {
            if (typeof vault.createBinary !== "function") throw new Error("vault_binary_restore_unavailable");
            await vault.createBinary(prior.path, binary);
          }
        } else if (live) await vault.modify(live, prior.bytes);
        else await vault.create(prior.path, prior.bytes);
        await setMode(prior.path, prior.mode);
      }
      const verified = await readState(prior.path);
      if (!sameState(verified, prior)) throw new Error("independent_restoration_verify_failed");
    }
    function eventPath(value) { return value && typeof value.path === "string" ? value.path : typeof value === "string" ? value : null; }
    async function observeExact(allowedPaths, mutation) {
      if (observing) return { ok: false, reason: "vault_transaction_locked" };
      observing = true;
      const events = new Set();
      const refs = [];
      const record = (file) => { const filePath = eventPath(file); if (filePath) events.add(filePath); };
      const rename = (file, oldPath) => { record(file); if (typeof oldPath === "string") events.add(oldPath); };
      try {
        refs.push(vault.on("create", record), vault.on("modify", record), vault.on("delete", record), vault.on("rename", rename));
        const before = await inventory();
        let value = null; let mutationError = null;
        try { value = await mutation(); } catch (error) { mutationError = error; }
        const after = await inventory();
        const candidates = new Set([...before.keys(), ...after.keys(), ...events]);
        const changed = [...candidates].filter((filePath) => {
          const prior = before.get(filePath) || absentState(filePath);
          const next = after.get(filePath) || absentState(filePath);
          return !sameState(prior, next) || events.has(filePath) && (filePath.startsWith(CANONICAL_PREFIX) || prior.exists || next.exists);
        }).sort();
        const allowed = [...new Set(allowedPaths)].sort();
        const unexpected = changed.filter((filePath) => !allowed.includes(filePath));
        if (mutationError || unexpected.length) {
          const failures = [];
          for (const filePath of changed.slice().reverse()) {
            try { await restoreState(before.get(filePath) || absentState(filePath)); }
            catch (error) { failures.push({ path: filePath, reason: error.message || "restore_failed" }); }
          }
          return { ok: false, reason: failures.length ? "independent_restoration_failed" : unexpected.length ? "unexpected_touched_path" : mutationError.message || "vault_mutation_failed", actual_paths: changed, unexpected_paths: unexpected, restoration_failures: failures, restoration_verified: failures.length === 0 };
        }
        return { ok: true, value, actual_paths: changed, before, after };
      } finally {
        for (const ref of refs) if (ref !== undefined && ref !== null) vault.offref(ref);
        observing = false;
      }
    }
    function packetSet(packet) { return writeSetApi.packetPaths(packet, packetApi); }
    function checkBoundary(packet, expected) {
      if (!boundary) return true;
      return writeSetApi.samePaths(boundary.packet_write_sets?.[packet.packet_id], expected) && expected.every((filePath) => boundary.allowed_write_set.includes(filePath));
    }
    function itemAuditPath(packet) { return `.llmwiki-audit/risk-items/${packet.packet_id}.json`; }

    async function beginExactSet(request) {
      if (!plain(request) || !Array.isArray(request.allowed_write_set) || !plain(request.packet_write_sets)) return result("rejected", { reason: "invalid_write_set_boundary" });
      boundary = frozen({ batch_identity: request.batch_identity || null, allowed_write_set: [...request.allowed_write_set], packet_write_sets: request.packet_write_sets });
      return result("recorded");
    }
    async function preflight(packet) {
      const verified = packetApi.verifyRiskApprovalPacket(packet);
      if (!verified.ok) return result("rejected", { reason: verified.reason });
      const expected = packetSet(packet);
      if (!checkBoundary(packet, expected)) return result("rejected", { reason: "write_set_boundary_mismatch" });
      if (await pathExists(itemAuditPath(packet))) return result("rejected", { reason: "item_audit_conflict" });
      const before = {};
      for (const filePath of expected) before[filePath] = await readState(filePath);
      const operation = packet.operation;
      for (const target of operation.destination_ids) {
        const prior = before[target];
        const expectedBefore = Object.hasOwn(operation.before_bytes, target) ? operation.before_bytes[target] : null;
        if (expectedBefore === null ? prior.exists : !prior.exists || prior.bytes !== expectedBefore || prior.sha256 !== operation.base_revisions[target]) return result("rejected", { reason: "target_revision_mismatch", path: target });
        if (prior.symlink) return result("rejected", { reason: "symlink_target_rejected", path: target });
      }
      for (const effect of [...operation.effects.deprecations, ...operation.effects.supersessions]) {
        const prior = before[effect.destination_id];
        if (!prior.exists || prior.bytes !== effect.before_bytes || prior.sha256 !== effect.target_revision || prior.symlink) return result("rejected", { reason: "effect_revision_mismatch", path: effect.destination_id });
      }
      const snapshot = frozen({ expected_paths: expected, before_states: before });
      preflights.set(packet, snapshot);
      return result("recorded", { snapshot });
    }
    async function writeItemAudit(packet, snapshot) {
      const filePath = itemAuditPath(packet);
      await ensureFolder(".llmwiki-audit");
      await ensureFolder(".llmwiki-audit/risk-items");
      const bytes = `${JSON.stringify({ audit_version: "llmwiki_risk_item_audit_v1", packet_id: packet.packet_id, packet_hash: packet.packet_hash, operation_id: packet.operation.operation_id, canonical_paths: snapshot.expected_paths, result: "committed" }, null, 2)}\n`;
      await writeText(filePath, bytes);
      if ((await readState(filePath)).bytes !== bytes) throw new Error("item_audit_verify_failed");
      return filePath;
    }
    async function directCommit(packet, snapshot) {
      if (packet.operation.effects.deprecations.length || packet.operation.effects.supersessions.length || packet.operation.kind === "merge") throw new Error("dedicated_operation_writer_required");
      for (const target of snapshot.expected_paths) {
        const prior = snapshot.before_states[target]; const after = packet.operation.after_bytes[target];
        if (typeof after !== "string") throw new Error("missing_after_bytes");
        if (prior.exists) await vault.modify(vault.getAbstractFileByPath(target), after); else await vault.create(target, after);
      }
      return { expected_after_bytes: packet.operation.after_bytes };
    }
    async function commit(packet) {
      if (committed.has(packet)) return result("duplicate", { receipt: committed.get(packet) });
      const snapshot = preflights.get(packet);
      if (!snapshot) return result("rejected", { reason: "preflight_required" });
      for (const target of snapshot.expected_paths) if (!sameState(await readState(target), snapshot.before_states[target])) return result("rejected", { reason: "target_revision_mismatch" });
      const auditPath = itemAuditPath(packet);
      const executor = options.executors?.[packet.operation.kind];
      const observed = await observeExact([...snapshot.expected_paths, auditPath], async () => {
        const writerReceipt = executor ? await executor({ packet, snapshot }) : await directCommit(packet, snapshot);
        await writeItemAudit(packet, snapshot);
        const expectedAfter = plain(writerReceipt.expected_after_bytes) ? writerReceipt.expected_after_bytes : packet.operation.after_bytes;
        const afterStates = {};
        for (const target of snapshot.expected_paths) {
          const after = await readState(target);
          if (!after.exists || typeof expectedAfter[target] !== "string" || after.bytes !== expectedAfter[target]) throw new Error("written_bytes_mismatch");
          if (snapshot.before_states[target].exists && after.mode !== snapshot.before_states[target].mode) throw new Error("written_mode_mismatch");
          afterStates[target] = after;
        }
        return { writerReceipt, afterStates };
      });
      if (!observed.ok) return result("failed", { reason: observed.reason, actual_touched_paths: observed.actual_paths, unexpected_touched_paths: observed.unexpected_paths, compensation_verified: observed.restoration_verified, compensation_failures: observed.restoration_failures, write_counts: counts() });
      const writerReceipt = observed.value.writerReceipt || {};
      const afterStates = observed.value.afterStates;
      const actualCanonical = observed.actual_paths.filter((filePath) => filePath.startsWith(CANONICAL_PREFIX));
      const receipt = frozen({ packet_id: packet.packet_id, expected_paths: snapshot.expected_paths, actual_touched_paths: actualCanonical, independently_observed_paths: observed.actual_paths, audit_touched_paths: [auditPath], before_states: snapshot.before_states, after_states: afterStates, writer_receipt: writerReceipt, observer: "vault_events_plus_full_inventory" });
      committed.set(packet, receipt);
      return result("committed", { write_counts: counts(snapshot.expected_paths.length, 1), receipt });
    }
    async function compensate(packet, receipt) {
      if (!receipt || !plain(receipt.before_states)) return result("rejected", { reason: "compensation_receipt_required" });
      const allowed = [...Object.keys(receipt.before_states), ...(receipt.audit_touched_paths || [])];
      const observed = await observeExact(allowed, async () => {
        for (const auditPath of [...(receipt.audit_touched_paths || [])].sort().reverse()) await restoreState(absentState(auditPath));
        for (const target of Object.keys(receipt.before_states).sort().reverse()) await restoreState(receipt.before_states[target]);
      });
      if (!observed.ok) return result("failed", { reason: observed.reason, restoration_failures: observed.restoration_failures });
      committed.delete(packet);
      return result("restored", { receipt: frozen({ packet_id: packet.packet_id, restored_paths: Object.keys(receipt.before_states).sort(), independently_verified: true, independently_observed_paths: observed.actual_paths }) });
    }
    async function auditBatch(audit) {
      const auditId = audit?.batch_identity;
      if (typeof auditId !== "string" || !auditId) return result("rejected", { reason: "invalid_batch_audit" });
      if (audits.has(auditId)) return result("duplicate", { receipt: audits.get(auditId) });
      const filePath = `.llmwiki-audit/risk-batches/${auditId}.json`;
      if (await pathExists(filePath)) return result("rejected", { reason: "batch_audit_conflict" });
      const bytes = `${JSON.stringify(audit, null, 2)}\n`;
      const observed = await observeExact([filePath], async () => {
        await ensureFolder(".llmwiki-audit");
        await ensureFolder(".llmwiki-audit/risk-batches");
        await writeText(filePath, bytes);
      });
      if (!observed.ok) return result("failed", { reason: observed.reason });
      const verified = await readState(filePath);
      if (!verified.exists || verified.bytes !== bytes) return result("failed", { reason: "batch_audit_verify_failed" });
      const receipt = frozen({ path: filePath, sha256: verified.sha256, independently_observed_paths: observed.actual_paths });
      audits.set(auditId, receipt);
      return result("recorded", { write_counts: counts(0, 1), receipt });
    }
    function resetBoundary() { boundary = null; }

    const adapter = Object.freeze({ beginExactSet, preflight, commit, compensate, auditBatch, resetBoundary });
    ADAPTERS.add(adapter);
    return adapter;
  }
  function isRiskVaultTransactionAdapter(value) { return Boolean(value && ADAPTERS.has(value)); }

  const api = Object.freeze({ createRiskVaultTransactionAdapter, isRiskVaultTransactionAdapter });
  root.LLMWikiRiskVaultTransactionAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
