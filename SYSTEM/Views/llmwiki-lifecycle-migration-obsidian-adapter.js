(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const AUDIT_ROOT = ".llmwiki-audit";
  const STATE_ROOT = `${AUDIT_ROOT}/lifecycle`;
  const ADAPTERS = new WeakSet();
  const LOCKS = new WeakMap();

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) { return Object.freeze(value); }
  function sha256(value) { return hashApi.sha256(String(value)); }
  function statePath(nonce) { return `${STATE_ROOT}/${nonce}.json`; }
  function validNonce(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value); }

  function createProductionAdapter(app) {
    const vault = app && app.vault;
    if (!vault || ["getAbstractFileByPath", "read", "create", "modify", "createFolder"].some((name) => typeof vault[name] !== "function")) throw new Error("production_vault_required");
    if (!LOCKS.has(vault)) LOCKS.set(vault, new Set());
    const locks = LOCKS.get(vault);
    const data = vault.adapter;
    const directAudit = Boolean(data && ["exists", "read", "write", "list", "mkdir", "remove"].every((name) => typeof data[name] === "function"));

    async function readPath(filePath) {
      if (directAudit && filePath.startsWith(`${AUDIT_ROOT}/`)) return await data.exists(filePath) ? data.read(filePath) : null;
      const file = vault.getAbstractFileByPath(filePath);
      return file ? await vault.read(file) : null;
    }
    async function ensureFolder(folder) {
      let current = "";
      for (const part of folder.split("/")) {
        current = current ? `${current}/${part}` : part;
        if (directAudit && current.startsWith(AUDIT_ROOT)) {
          if (!await data.exists(current)) await data.mkdir(current);
        } else if (!vault.getAbstractFileByPath(current)) {
          try { await vault.createFolder(current); }
          catch (_error) { if (!vault.getAbstractFileByPath(current)) throw _error; }
        }
      }
    }
    async function writePath(filePath, bytes) {
      const folder = filePath.split("/").slice(0, -1).join("/");
      if (folder) await ensureFolder(folder);
      if (directAudit && filePath.startsWith(`${AUDIT_ROOT}/`)) return data.write(filePath, bytes);
      const file = vault.getAbstractFileByPath(filePath);
      return file ? vault.modify(file, bytes) : vault.create(filePath, bytes);
    }
    async function removePath(filePath) {
      if (directAudit && filePath.startsWith(`${AUDIT_ROOT}/`)) { if (await data.exists(filePath)) await data.remove(filePath); return; }
      const file = vault.getAbstractFileByPath(filePath);
      if (!file) return;
      if (typeof vault.delete === "function") return vault.delete(file, true);
      if (data && typeof data.remove === "function") return data.remove(filePath);
      throw new Error("vault_delete_required");
    }
    async function listedAuditPaths() {
      const paths = typeof vault.getFiles === "function" ? vault.getFiles().map((file) => file.path).filter((filePath) => filePath.startsWith(`${AUDIT_ROOT}/`)) : [];
      if (!directAudit || !await data.exists(AUDIT_ROOT)) return paths;
      const stack = [AUDIT_ROOT];
      while (stack.length) {
        const listed = await data.list(stack.pop());
        for (const filePath of listed?.files || []) paths.push(filePath);
        for (const folder of listed?.folders || []) stack.push(folder);
      }
      return [...new Set(paths)];
    }
    async function reserve(nonce, planDigest, authorizationHash) {
      if (!validNonce(nonce) || typeof planDigest !== "string" || typeof authorizationHash !== "string") return freeze({ ok: false, reason: "invalid_reservation" });
      if (locks.has(nonce)) return freeze({ ok: false, reason: "nonce_in_progress" });
      locks.add(nonce);
      const filePath = statePath(nonce);
      try {
        const existingBytes = await readPath(filePath);
        if (existingBytes !== null) {
          let existing;
          try { existing = JSON.parse(existingBytes); }
          catch (_error) { locks.delete(nonce); return freeze({ ok: false, reason: "malformed_nonce_state" }); }
          locks.delete(nonce);
          if (existing.status === "committed" && existing.plan_digest === planDigest && existing.authorization_hash === authorizationHash) return freeze({ ok: true, status: "duplicate", receipt: existing.receipt });
          return freeze({ ok: false, reason: existing.status === "reserved" ? "nonce_in_progress" : "nonce_replay_conflict" });
        }
        const reservation = { state_version: "llmwiki_lifecycle_nonce_v1", status: "reserved", nonce, plan_digest: planDigest, authorization_hash: authorizationHash };
        await writePath(filePath, `${JSON.stringify(reservation, null, 2)}\n`);
        return freeze({ ok: true, status: "reserved", reservation: freeze(reservation) });
      } catch (_error) {
        locks.delete(nonce);
        return freeze({ ok: false, reason: "nonce_reserve_failed" });
      }
    }
    async function commit(reservation, receipt) {
      if (!plain(reservation) || !validNonce(reservation.nonce) || !locks.has(reservation.nonce)) return freeze({ ok: false, reason: "unowned_reservation" });
      const current = await readPath(statePath(reservation.nonce));
      let parsed;
      try { parsed = JSON.parse(current); } catch (_error) { return freeze({ ok: false, reason: "reservation_lost" }); }
      if (parsed.status !== "reserved" || parsed.plan_digest !== reservation.plan_digest || parsed.authorization_hash !== reservation.authorization_hash) return freeze({ ok: false, reason: "reservation_lost" });
      const committed = { ...reservation, status: "committed", receipt, receipt_hash: sha256(JSON.stringify(receipt)) };
      try { await writePath(statePath(reservation.nonce), `${JSON.stringify(committed, null, 2)}\n`); }
      catch (_error) { return freeze({ ok: false, reason: "nonce_commit_failed" }); }
      locks.delete(reservation.nonce);
      return freeze({ ok: true, status: "committed" });
    }
    async function abort(reservation) {
      if (!plain(reservation) || !validNonce(reservation.nonce)) return freeze({ ok: false, reason: "invalid_reservation" });
      try { await removePath(statePath(reservation.nonce)); }
      catch (_error) { locks.delete(reservation.nonce); return freeze({ ok: false, reason: "nonce_abort_failed" }); }
      locks.delete(reservation.nonce);
      return freeze({ ok: true, status: "aborted" });
    }
    async function snapshot(targetPaths) {
      const declaredPaths = [...new Set(targetPaths)].sort();
      let auditPaths;
      try { auditPaths = (await listedAuditPaths()).sort(); }
      catch (_error) {
        return freeze({ ok: false, reason: "snapshot_discovery_failed", snapshot: freeze({ snapshot_version: "llmwiki_lifecycle_snapshot_v2", complete: false, declared_paths: freeze(declaredPaths), audit_namespace: freeze({ complete: false, present_paths: freeze([]) }), entries: freeze({}) }) });
      }
      const paths = [...new Set([...declaredPaths, ...auditPaths])].sort();
      const entries = Object.fromEntries(paths.map((filePath) => [filePath, freeze({ state: "unknown" })]));
      for (const filePath of paths) {
        try {
          const bytes = await readPath(filePath);
          entries[filePath] = bytes === null
            ? freeze({ state: "confirmed_absent" })
            : freeze({ state: "present", bytes, sha256: sha256(bytes) });
        } catch (_error) {
          return freeze({ ok: false, reason: "snapshot_read_failed", snapshot: freeze({ snapshot_version: "llmwiki_lifecycle_snapshot_v2", complete: false, declared_paths: freeze(declaredPaths), audit_namespace: freeze({ complete: true, present_paths: freeze(auditPaths) }), entries: freeze(entries) }) });
        }
      }
      return freeze({ ok: true, snapshot: freeze({ snapshot_version: "llmwiki_lifecycle_snapshot_v2", complete: true, declared_paths: freeze(declaredPaths), audit_namespace: freeze({ complete: true, present_paths: freeze(auditPaths) }), entries: freeze(entries) }) });
    }
    async function restore(snapshotValue, reservation) {
      if (!plain(snapshotValue) || snapshotValue.snapshot_version !== "llmwiki_lifecycle_snapshot_v2" || snapshotValue.complete !== true
        || !plain(snapshotValue.entries) || !plain(snapshotValue.audit_namespace) || snapshotValue.audit_namespace.complete !== true
        || !Array.isArray(snapshotValue.declared_paths) || !Array.isArray(snapshotValue.audit_namespace.present_paths)) return freeze({ ok: false, reason: "incomplete_snapshot" });
      const manifestPaths = [...new Set([...snapshotValue.declared_paths, ...snapshotValue.audit_namespace.present_paths])].sort();
      if (manifestPaths.some((filePath) => !Object.hasOwn(snapshotValue.entries, filePath)
        || !["present", "confirmed_absent"].includes(snapshotValue.entries[filePath]?.state))) return freeze({ ok: false, reason: "incomplete_snapshot" });
      let currentAuditPaths;
      try { currentAuditPaths = await listedAuditPaths(); }
      catch (_error) { return freeze({ ok: false, reason: "restore_discovery_failed" }); }
      try {
        for (const filePath of currentAuditPaths) {
          if (filePath === statePath(reservation.nonce)) continue;
          if (!snapshotValue.audit_namespace.present_paths.includes(filePath)) await removePath(filePath);
        }
        for (const filePath of manifestPaths) {
          if (filePath === statePath(reservation.nonce)) continue;
          const entry = snapshotValue.entries[filePath];
          if (entry.state === "confirmed_absent") await removePath(filePath);
          else await writePath(filePath, entry.bytes);
        }
      } catch (_error) { return freeze({ ok: false, reason: "restore_failed" }); }
      for (const filePath of manifestPaths) {
        if (filePath === statePath(reservation.nonce)) continue;
        const entry = snapshotValue.entries[filePath];
        const bytes = await readPath(filePath);
        if ((entry.state === "confirmed_absent" && bytes !== null)
          || (entry.state === "present" && (bytes !== entry.bytes || sha256(bytes) !== entry.sha256))) return freeze({ ok: false, reason: "restore_verify_failed" });
      }
      return freeze({ ok: true, status: "restored" });
    }
    async function readExact(filePath) { return readPath(filePath); }

    const adapter = freeze({ app, reserve, commit, abort, snapshot, restore, readExact, statePath });
    ADAPTERS.add(adapter);
    return adapter;
  }

  function isProductionAdapter(value) { return Boolean(value && ADAPTERS.has(value)); }
  const api = Object.freeze({ AUDIT_ROOT, STATE_ROOT, createProductionAdapter, isProductionAdapter });
  root.LLMWikiLifecycleMigrationObsidianAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
