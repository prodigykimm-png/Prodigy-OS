(function (root) {
  "use strict";

  const storeApi = root.WorkoutStore || (typeof require === "function" ? require("./workout-store.js") : null);

  const HEALTH_BASE = "SYSTEM/AI/Memory/workout/health";
  const HEALTH_KINDS = {
    nutritionEntries: "nutrition-entries",
    nutritionImports: "nutrition-imports",
    runActivities: "run-activities",
    runImports: "run-imports",
    preferences: "preferences",
  };

  function validId(id) { return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(String(id || "")); }

  /**
   * Generic indexed JSON store — extracted from createWorkoutStore internals.
   * config: { basePath, indexSchema, kinds: { kindName: folderName }, idFields: { kindName: idField } }
   */
  function createIndexedJsonStore(adapter, config) {
    const base = String(config.basePath || "").replace(/\/$/, "");
    const indexPath = `${base}/index.json`;
    const kinds = config.kinds || {};
    const idFields = config.idFields || {};
    const indexSchema = config.indexSchema || "prodigy-index-v1";

    let writeChain = Promise.resolve();
    const enqueue = (fn) => {
      const run = writeChain.then(fn, fn);
      writeChain = run.then(() => undefined, () => undefined);
      return run;
    };

    function emptyIndex() {
      const idx = { schema_version: indexSchema };
      for (const kind of Object.keys(kinds)) idx[kind] = [];
      return idx;
    }

    async function readIndexRaw() {
      if (!(await adapter.exists(indexPath))) return emptyIndex();
      try { return JSON.parse(await adapter.read(indexPath)); } catch (_e) { return emptyIndex(); }
    }

    async function ensureFolder(folder) {
      let current = "";
      for (const part of folder.split("/")) {
        if (!part) continue;
        current = current ? `${current}/${part}` : part;
        if (!(await adapter.exists(current))) await adapter.mkdir(current);
      }
    }

    async function writeJson(target, value) {
      await ensureFolder(target.split("/").slice(0, -1).join("/"));
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
        try {
          if (await adapter.exists(target)) { await adapter.write(target, content); }
          else { await adapter.rename(temporary, target); }
        } catch (_renameErr) { await adapter.write(target, content); }
        if (await adapter.exists(temporary)) await adapter.remove(temporary);
        if (hadTarget && await adapter.exists(backup)) await adapter.remove(backup);
      } catch (error) {
        try { if (await adapter.exists(backup) && !(await adapter.exists(target))) await adapter.rename(backup, target); } catch (_e) { /* best effort */ }
        try { if (await adapter.exists(temporary)) await adapter.remove(temporary); } catch (_e) { /* best effort */ }
        throw error;
      }
    }

    async function readJsonFile(target, fallback) {
      if (!(await adapter.exists(target))) return fallback !== undefined ? fallback : null;
      try { return JSON.parse(await adapter.read(target)); } catch (_e) { return fallback !== undefined ? fallback : null; }
    }

    function filePath(kind, id) {
      if (!kinds[kind]) throw new Error(`Unknown kind: ${kind}`);
      if (!validId(id)) throw new Error("Invalid derived identifier.");
      return `${base}/${kinds[kind]}/${id}.json`;
    }

    function idField(kind) { return idFields[kind] || "id"; }

    let activeTouched = null;
    async function saveDirect(kind, id, value) {
      if (activeTouched) { activeTouched.add(indexPath); activeTouched.add(filePath(kind, id)); }
      const index = await readIndexRaw();
      await writeJson(filePath(kind, id), value);
      if (!Array.isArray(index[kind])) index[kind] = [];
      if (!index[kind].includes(id)) index[kind].push(id);
      index[kind].sort();
      await writeJson(indexPath, index);
      return value;
    }

    async function removeDirect(kind, id) {
      if (activeTouched) { activeTouched.add(indexPath); activeTouched.add(filePath(kind, id)); }
      const index = await readIndexRaw();
      await adapter.remove(filePath(kind, id));
      index[kind] = (index[kind] || []).filter((item) => item !== id);
      await writeJson(indexPath, index);
    }

    async function snapshotIndexedFiles() {
      const index = await readIndexRaw();
      const paths = [indexPath];
      for (const kind of Object.keys(kinds)) for (const id of index[kind] || []) paths.push(filePath(kind, id));
      const files = new Map();
      for (const target of paths) files.set(target, await adapter.exists(target) ? await adapter.read(target) : null);
      return { index, files };
    }

    async function restoreIndexedFiles(snapshot, touched) {
      const current = await readIndexRaw();
      const paths = new Set([indexPath, ...snapshot.files.keys(), ...(touched || [])]);
      for (const kind of Object.keys(kinds)) for (const id of current[kind] || []) paths.add(filePath(kind, id));
      for (const target of paths) {
        const before = snapshot.files.has(target) ? snapshot.files.get(target) : null;
        if (before === null) { if (await adapter.exists(target)) await adapter.remove(target); }
        else await adapter.write(target, before);
        for (const suffix of [".tmp", ".backup"]) if (await adapter.exists(target + suffix)) await adapter.remove(target + suffix);
      }
    }

    const transactional = {
      basePath: base,
      readIndex: readIndexRaw,
      read: (kind, id) => readJsonFile(filePath(kind, id)),
      list: async (kind) => {
        const index = await readIndexRaw(); const items = [];
        for (const id of index[kind] || []) { const value = await readJsonFile(filePath(kind, id)); if (value) items.push(value); }
        return items;
      },
      save: saveDirect,
      remove: removeDirect,
      async upsertImported(kind, items, sourceField, keyField) {
        const results = [];
        for (const item of items) {
          const source = String(item[sourceField] || ""), key = String(item[keyField] || "");
          if (!source || !key) { results.push({ created: false, id: "", skipped: true, reason: "missing source/key" }); continue; }
          const existing = await transactional.list(kind);
          const match = existing.find((entry) => String(entry[sourceField] || "") === source && String(entry[keyField] || "") === key);
          const id = match ? match[idField(kind)] : item[idField(kind)];
          if (!id || !validId(id)) { results.push({ created: false, id: "", skipped: true, reason: "invalid id" }); continue; }
          await saveDirect(kind, id, { ...item, [idField(kind)]: id });
          results.push({ created: !match, id });
        }
        return results;
      }
    };

    return {
      adapter,
      basePath: base,
      readIndex: readIndexRaw,
      async transaction(callback, options) {
        return enqueue(async () => {
          const snapshot = await snapshotIndexedFiles(); const touched = new Set(); activeTouched = touched;
          try {
            const value = await callback(transactional);
            activeTouched = null;
            return options && options.retainRollback
              ? { value, rollback: () => enqueue(() => restoreIndexedFiles(snapshot, touched)) }
              : value;
          } catch (error) { activeTouched = null; try { await restoreIndexedFiles(snapshot, touched); } catch (restoreError) { error.restoreError = restoreError; } throw error; }
        });
      },

      async save(kind, id, value) {
        return enqueue(() => saveDirect(kind, id, value));
      },

      async read(kind, id) {
        return readJsonFile(filePath(kind, id));
      },

      async list(kind) {
        const index = await readIndexRaw();
        const items = [];
        for (const id of index[kind] || []) {
          const value = await readJsonFile(filePath(kind, id));
          if (value) items.push(value);
        }
        return items;
      },

      async remove(kind, id) {
        return enqueue(() => removeDirect(kind, id));
      },

      /**
       * Upsert by (source, source_key) — imported rows only.
       * Returns { created: boolean, id: string }
       */
      async upsertImported(kind, items, sourceField, keyField) {
        const results = [];
        for (const item of items) {
          const source = String(item[sourceField] || "");
          const key = String(item[keyField] || "");
          if (!source || !key) { results.push({ created: false, id: "", skipped: true, reason: "missing source/key" }); continue; }
          const existing = await this.list(kind);
          const match = existing.find((e) => String(e[sourceField] || "") === source && String(e[keyField] || "") === key);
          if (match) {
            const id = match[idField(kind)];
            await this.save(kind, id, { ...item, [idField(kind)]: id });
            results.push({ created: false, id });
          } else {
            const id = item[idField(kind)];
            if (!id || !validId(id)) { results.push({ created: false, id: "", skipped: true, reason: "invalid id" }); continue; }
            await this.save(kind, id, item);
            results.push({ created: true, id });
          }
        }
        return results;
      },
    };
  }

  /**
   * Health store — separate from strength index.
   * Root: SYSTEM/AI/Memory/workout/health/
   */
  function createHealthStore(adapter, basePath) {
    return createIndexedJsonStore(adapter, {
      basePath: basePath || HEALTH_BASE,
      indexSchema: "prodigy-workout-health-index-v1",
      kinds: HEALTH_KINDS,
      idFields: {
        nutritionEntries: "entry_id",
        nutritionImports: "import_id",
        runActivities: "activity_id",
        runImports: "import_id",
        preferences: "pref_id",
      },
    });
  }

  const api = { HEALTH_BASE, HEALTH_KINDS, createIndexedJsonStore, createHealthStore, validId };
  root.WorkoutHealthStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
