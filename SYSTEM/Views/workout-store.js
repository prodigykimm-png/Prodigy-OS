(function (root) {
  "use strict";

  const BASE_PATH = "SYSTEM/AI/Memory/workout";
  const KINDS = { programs: "programs", runs: "program-runs", sessions: "sessions", imports: "imports" };

  function validId(id) { return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(String(id || "")); }

  function createNodeAdapter(rootPath) {
    const fs = require("node:fs/promises");
    const path = require("node:path");
    const base = path.resolve(rootPath);
    const resolve = (relativePath) => {
      const target = path.resolve(base, String(relativePath || ""));
      if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error("Path escapes the adapter root.");
      return target;
    };
    return {
      // Node rename can replace; keep optional atomic path for tests.
      preferDirectWrite: false,
      async exists(relativePath) { try { await fs.access(resolve(relativePath)); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } },
      async read(relativePath) { return fs.readFile(resolve(relativePath), "utf8"); },
      async write(relativePath, content) { const target = resolve(relativePath); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content, "utf8"); },
      async mkdir(relativePath) { await fs.mkdir(resolve(relativePath), { recursive: true }); },
      async remove(relativePath) { try { await fs.unlink(resolve(relativePath)); } catch (error) { if (error.code !== "ENOENT") throw error; } },
      async rename(from, to) { await fs.rename(resolve(from), resolve(to)); },
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
      await adapter.write(target, content);
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
    try { return JSON.parse(await adapter.read(target)); } catch (_error) { return fallback; }
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

    async function save(kind, id, value) {
      return enqueue(async () => {
        const index = await readIndex();
        await writeJson(adapter, filePath(kind, id), value);
        if (!Array.isArray(index[kind])) index[kind] = [];
        if (!index[kind].includes(id)) index[kind].push(id);
        index[kind].sort();
        await writeJson(adapter, indexPath, index);
        return value;
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

    return {
      adapter,
      basePath: base,
      readIndex,
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
    };
  }

  const api = { BASE_PATH, createNodeAdapter, createObsidianAdapter, createWorkoutStore };
  root.WorkoutStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
