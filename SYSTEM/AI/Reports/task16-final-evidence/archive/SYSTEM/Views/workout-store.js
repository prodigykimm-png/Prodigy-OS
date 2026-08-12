(function (root) {
  "use strict";

  const BASE_PATH = "SYSTEM/AI/Memory/workout";
  const KINDS = { programs: "programs", runs: "program-runs", sessions: "sessions", imports: "imports" };

  function validId(id) { return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(String(id || "")); }

  function createNodeAdapter(rootPath, options = {}) {
    const fs = require("node:fs/promises");
    const constants = require("node:fs").constants;
    const path = require("node:path");
    const base = path.resolve(rootPath);
    const fsSync = require("node:fs");
    try { if (fsSync.lstatSync(base).isSymbolicLink()) throw new Error("Workout adapter root cannot be a symlink."); }
    catch (error) { if (error.code !== "ENOENT") throw error; fsSync.mkdirSync(base, { recursive: true }); }
    const ready = Promise.resolve(fsSync.realpathSync(base));
    const lexical = (relativePath) => {
      const target = path.resolve(base, String(relativePath || ""));
      if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error("Path escapes the adapter root.");
      return target;
    };
    async function secure(relativePath, allowMissingLeaf) {
      const realBase = await ready; const target = lexical(relativePath); const relative = path.relative(base, target);
      let current = base;
      for (const part of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        try {
          const stat = await fs.lstat(current);
          if (stat.isSymbolicLink()) throw new Error("Workout adapter symlink path is forbidden.");
          const real = await fs.realpath(current);
          if (real !== realBase && !real.startsWith(`${realBase}${path.sep}`)) throw new Error("Workout adapter real path escapes its root.");
        } catch (error) {
          if (error.code === "ENOENT" && allowMissingLeaf) break;
          throw error;
        }
      }
      return target;
    }
    async function noFollowRead(target) { const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); try { return await handle.readFile("utf8"); } finally { await handle.close(); } }
    async function noFollowWrite(target, content) { const handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW || 0), 0o600); try { await handle.writeFile(content, "utf8"); } finally { await handle.close(); } }
    async function parentIdentity(target) {
      const identities = [];
      let current = base;
      for (const part of path.relative(base, path.dirname(target)).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Workout adapter parent identity is forbidden.");
        identities.push({ path: current, dev: stat.dev, ino: stat.ino });
      }
      return identities;
    }
    async function mutate(operation, target, callback) {
      const before = await parentIdentity(target);
      if (typeof options.beforeMutation === "function") await options.beforeMutation({ operation, target });
      await secure(path.relative(base, path.dirname(target)), false);
      const after = await parentIdentity(target);
      if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("Workout adapter parent identity was replaced.");
      const value = await callback();
      const finalIdentity = await parentIdentity(target);
      if (JSON.stringify(finalIdentity) !== JSON.stringify(before)) throw new Error("Workout adapter parent identity changed during mutation.");
      return value;
    }
    return {
      preferDirectWrite: false,
      async exists(relativePath) { try { await secure(relativePath, false); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } },
      async read(relativePath) { return noFollowRead(await secure(relativePath, false)); },
      async write(relativePath, content) { const target = lexical(relativePath); await secure(path.relative(base, path.dirname(target)), true); await fs.mkdir(path.dirname(target), { recursive: true }); await secure(relativePath, true); await mutate("write", target, () => noFollowWrite(target, content)); },
      async mkdir(relativePath) { const target = lexical(relativePath); await secure(path.relative(base, path.dirname(target)), true); await fs.mkdir(path.dirname(target), { recursive: true }); await mutate("mkdir", target, () => fs.mkdir(target)); await secure(relativePath, false); },
      async remove(relativePath) { try { const target = await secure(relativePath, false); const stat = await fs.lstat(target); if (stat.isDirectory()) throw new Error("Workout adapter removes files only."); await mutate("remove", target, () => fs.unlink(target)); } catch (error) { if (error.code !== "ENOENT") throw error; } },
      async rename(from, to) { const source = await secure(from, false); const target = lexical(to); await secure(path.relative(base, path.dirname(target)), false); await secure(to, true); await mutate("rename", target, async () => { await secure(from, false); await fs.rename(source, target); }); await secure(to, false); },
      async list(relativePath) { try { const target = await secure(relativePath, false); const entries = await fs.readdir(target, { withFileTypes: true }); if (entries.some((entry) => entry.isSymbolicLink())) throw new Error("Workout adapter symlink entry is forbidden."); return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(); } catch (error) { if (error.code === "ENOENT") return []; throw error; } },
    };
  }

  function createObsidianAdapter(app) {
    if (!app || !app.vault || !app.vault.adapter) throw new Error("Obsidian Vault adapter is unavailable.");
    const source = app.vault.adapter;
    return {
      // Obsidian rename throws "Destination file already exists!" and does not overwrite.
      // Direct write is the reliable path (also safer with iCloud concurrent access).
      preferDirectWrite: true,
      exists: (path) => source.exists(path),
      read: (path) => source.read(path),
      write: (path, value) => source.write(path, value),
      mkdir: async (path) => { if (!(await source.exists(path))) await source.mkdir(path); },
      remove: async (path) => { if (await source.exists(path)) await source.remove(path); },
      rename: typeof source.rename === "function" ? (from, to) => source.rename(from, to) : null,
      list: typeof source.list === "function" ? async (folder) => { const value = await source.list(folder); return (value && value.files || []).map((item) => item.slice(folder.length + 1)).filter((item) => item && !item.includes("/")).sort(); } : null,
    };
  }

  async function ensureFolder(adapter, folder) {
    let current = "";
    for (const part of folder.split("/")) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) await adapter.mkdir(current);
    }
  }

  /**
   * Write JSON safely.
   * - Obsidian: direct write (rename-to-existing fails with Destination file already exists!)
   * - Node: optional temp+rename when preferDirectWrite is false
   */
  async function writeJson(adapter, target, value) {
    await ensureFolder(adapter, target.split("/").slice(0, -1).join("/"));
    const content = `${JSON.stringify(value, null, 2)}\n`;

    if (!adapter.rename || adapter.preferDirectWrite) {
      const existed = await adapter.exists(target);
      const before = existed ? await adapter.read(target) : null;
      try { await adapter.write(target, content); }
      catch (error) {
        try {
          if (existed) await adapter.write(target, before);
          else if (await adapter.exists(target)) await adapter.remove(target);
        } catch (restoreError) {
          error.restoreError = restoreError;
        }
        throw error;
      }
      return;
    }

    const temporary = `${target}.tmp`;
    const backup = `${target}.backup`;
    try {
      if (await adapter.exists(temporary)) await adapter.remove(temporary);
      if (await adapter.exists(backup)) await adapter.remove(backup);
      await adapter.write(temporary, content);
      const hadTarget = await adapter.exists(target);
      if (hadTarget) await adapter.rename(target, backup);
      // If target reappeared or rename-over is refused, fall back to direct write.
      try {
        if (await adapter.exists(target)) {
          await adapter.write(target, content);
        } else {
          await adapter.rename(temporary, target);
        }
      } catch (_renameErr) {
        await adapter.write(target, content);
      }
      if (await adapter.exists(temporary)) await adapter.remove(temporary);
      if (hadTarget && await adapter.exists(backup)) await adapter.remove(backup);
    } catch (error) {
      try {
        if (await adapter.exists(backup) && !(await adapter.exists(target))) {
          await adapter.rename(backup, target);
        }
      } catch (_restoreErr) { /* best effort */ }
      try {
        if (await adapter.exists(temporary)) await adapter.remove(temporary);
      } catch (_tmpErr) { /* best effort */ }
      throw error;
    }
  }

  async function readJson(adapter, target, fallback = null) {
    if (!(await adapter.exists(target))) return fallback;
    let bytes;
    try { bytes = await adapter.read(target); }
    catch (error) { throw error; }
    try { return JSON.parse(bytes); }
    catch (_error) {
      const error = new Error(`저장된 Workout JSON이 손상되어 읽기를 중단했습니다: ${target}`);
      error.code = "CORRUPT_PERSISTED_JSON";
      error.path = target;
      throw error;
    }
  }

  function createWorkoutStore(adapter, basePath = BASE_PATH) {
    const base = String(basePath || BASE_PATH).replace(/\/$/, "");
    const indexPath = `${base}/index.json`;
    // Serialize all mutations — concurrent saveProgram() was racing on index.json rename.
    let writeChain = Promise.resolve();
    const enqueue = (fn) => {
      const run = writeChain.then(fn, fn);
      writeChain = run.then(() => undefined, () => undefined);
      return run;
    };

    const filePath = (kind, id) => {
      if (!KINDS[kind] || !validId(id)) throw new Error("Invalid derived identifier.");
      return `${base}/${KINDS[kind]}/${id}.json`;
    };

    async function readIndex() {
      return await readJson(adapter, indexPath, {
        schema_version: "prodigy-workout-index-v1",
        programs: [],
        runs: [],
        sessions: [],
        imports: []
      });
    }

    let activeTouched = null;
    async function saveDirect(kind, id, value) {
      if (activeTouched) { activeTouched.add(indexPath); activeTouched.add(filePath(kind, id)); }
      const index = await readIndex();
      await writeJson(adapter, filePath(kind, id), value);
      if (!Array.isArray(index[kind])) index[kind] = [];
      if (!index[kind].includes(id)) index[kind].push(id);
      index[kind].sort();
      await writeJson(adapter, indexPath, index);
      return value;
    }

    async function save(kind, id, value) {
      return enqueue(() => saveDirect(kind, id, value));
    }

    async function transaction(callback, options) {
      return enqueue(async () => {
        const index = await readIndex();
        const paths = [indexPath];
        for (const kind of Object.keys(KINDS)) for (const id of index[kind] || []) paths.push(filePath(kind, id));
        const before = new Map();
        for (const target of paths) before.set(target, await adapter.exists(target) ? await adapter.read(target) : null);
        const touched = new Set(); activeTouched = touched;
        try {
          const value = await callback({ saveProgram: (item) => saveDirect("programs", item.id, item) });
          activeTouched = null;
          return options && options.retainRollback
            ? { value, rollback: () => enqueue(async () => {
              const current = await readIndex(); const affected = new Set([...paths, ...touched]);
              for (const kind of Object.keys(KINDS)) for (const id of current[kind] || []) affected.add(filePath(kind, id));
              for (const target of affected) {
                const bytes = before.has(target) ? before.get(target) : null;
                if (bytes === null) { if (await adapter.exists(target)) await adapter.remove(target); }
                else await adapter.write(target, bytes);
              }
            }) }
            : value;
        } catch (error) {
          activeTouched = null;
          try {
            const current = await readIndex(); const affected = new Set([...paths, ...touched]);
            for (const kind of Object.keys(KINDS)) for (const id of current[kind] || []) affected.add(filePath(kind, id));
            for (const target of affected) {
              const bytes = before.has(target) ? before.get(target) : null;
              if (bytes === null) { if (await adapter.exists(target)) await adapter.remove(target); }
              else await adapter.write(target, bytes);
              for (const suffix of [".tmp", ".backup"]) if (await adapter.exists(target + suffix)) await adapter.remove(target + suffix);
            }
          } catch (restoreError) { error.restoreError = restoreError; }
          throw error;
        }
      });
    }

    async function list(kind) {
      const index = await readIndex();
      const items = [];
      for (const id of index[kind] || []) {
        const value = await readJson(adapter, filePath(kind, id));
        if (value) items.push(value);
      }
      return items;
    }

    async function remove(kind, id) {
      return enqueue(async () => {
        const index = await readIndex();
        await adapter.remove(filePath(kind, id));
        index[kind] = (index[kind] || []).filter((item) => item !== id);
        await writeJson(adapter, indexPath, index);
      });
    }

    async function rebuildIndex() {
      return enqueue(async () => {
        if (typeof adapter.list !== "function") throw new Error("Workout index rebuild requires adapter.list.");
        const rebuilt = { schema_version: "prodigy-workout-index-v1", programs: [], runs: [], sessions: [], imports: [] };
        for (const kind of Object.keys(KINDS)) {
          const names = await adapter.list(`${base}/${KINDS[kind]}`);
          for (const name of names) {
            if (!name.endsWith(".json")) continue;
            const id = name.slice(0, -5);
            if (!validId(id)) throw new Error(`Invalid persisted Workout identifier: ${name}`);
            await readJson(adapter, filePath(kind, id));
            rebuilt[kind].push(id);
          }
          rebuilt[kind].sort();
        }
        await writeJson(adapter, indexPath, rebuilt);
        return rebuilt;
      });
    }

    return {
      adapter,
      basePath: base,
      readIndex,
      transaction,
      saveProgram: (value) => save("programs", value.id, value),
      saveRun: (value) => save("runs", value.run_id, value),
      saveSession: (value) => save("sessions", value.session_id, value),
      listPrograms: () => list("programs"),
      listRuns: () => list("runs"),
      listSessions: () => list("sessions"),
      readProgram: (id) => readJson(adapter, filePath("programs", id)),
      readRun: (id) => readJson(adapter, filePath("runs", id)),
      readSession: (id) => readJson(adapter, filePath("sessions", id)),
      deleteDerived: remove,
      rebuildIndex,
    };
  }

  const api = { BASE_PATH, createNodeAdapter, createObsidianAdapter, createWorkoutStore };
  root.WorkoutStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
