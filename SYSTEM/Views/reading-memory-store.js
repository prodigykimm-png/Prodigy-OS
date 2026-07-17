(function (root) {
  "use strict";

  const core = root.ReadingMemoryCore || (typeof require === "function" ? require("./reading-memory-core.js") : null);
  const BASE_PATH = "SYSTEM/AI/Memory/reading";

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
      async exists(relativePath) {
        try {
          await fs.access(resolve(relativePath));
          return true;
        } catch (error) {
          if (error.code === "ENOENT") return false;
          throw error;
        }
      },
      async read(relativePath) { return fs.readFile(resolve(relativePath), "utf8"); },
      async write(relativePath, content) {
        const target = resolve(relativePath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, "utf8");
      },
      async mkdir(relativePath) { await fs.mkdir(resolve(relativePath), { recursive: true }); },
      async remove(relativePath) {
        try { await fs.unlink(resolve(relativePath)); } catch (error) { if (error.code !== "ENOENT") throw error; }
      },
      async rename(from, to) { await fs.rename(resolve(from), resolve(to)); },
    };
  }

  function createObsidianAdapter(app) {
    if (!app || !app.vault || !app.vault.adapter) throw new Error("Obsidian Vault adapter is unavailable.");
    const adapter = app.vault.adapter;
    const wrapped = {
      exists: (path) => adapter.exists(path),
      read: (path) => adapter.read(path),
      write: (path, content) => adapter.write(path, content),
      mkdir: async (path) => {
        if (!(await adapter.exists(path))) await adapter.mkdir(path);
      },
      remove: async (path) => {
        if (await adapter.exists(path)) await adapter.remove(path);
      },
      rename: null,
    };
    if (typeof adapter.rename === "function") {
      wrapped.atomicWrite = async (targetPath, content) => {
        const temporaryPath = `${targetPath}.tmp`;
        const backupPath = `${targetPath}.backup`;
        if (await adapter.exists(temporaryPath)) await adapter.remove(temporaryPath);
        if (await adapter.exists(backupPath)) await adapter.remove(backupPath);
        await adapter.write(temporaryPath, content);
        const hadTarget = await adapter.exists(targetPath);
        if (hadTarget) await adapter.rename(targetPath, backupPath);
        try {
          await adapter.rename(temporaryPath, targetPath);
          if (hadTarget) await adapter.remove(backupPath);
        } catch (error) {
          if (hadTarget && await adapter.exists(backupPath)) await adapter.rename(backupPath, targetPath);
          if (await adapter.exists(temporaryPath)) await adapter.remove(temporaryPath);
          throw error;
        }
      };
    }
    return wrapped;
  }

  async function ensureFolder(adapter, folderPath) {
    let current = "";
    for (const part of String(folderPath || "").split("/")) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) await adapter.mkdir(current);
    }
  }

  async function writeJson(adapter, targetPath, value) {
    const folder = targetPath.split("/").slice(0, -1).join("/");
    await ensureFolder(adapter, folder);
    const content = `${JSON.stringify(value, null, 2)}\n`;
    if (adapter.atomicWrite) {
      await adapter.atomicWrite(targetPath, content);
      return;
    }
    if (!adapter.rename) {
      await adapter.write(targetPath, content);
      return;
    }
    const temporaryPath = `${targetPath}.tmp`;
    await adapter.write(temporaryPath, content);
    try {
      await adapter.rename(temporaryPath, targetPath);
    } catch (error) {
      await adapter.remove(temporaryPath);
      throw error;
    }
  }

  async function readJson(adapter, targetPath) {
    if (!(await adapter.exists(targetPath))) return null;
    const content = await adapter.read(targetPath);
    try {
      return JSON.parse(content);
    } catch (_error) {
      return null;
    }
  }

  function entryPathFor(basePath, id) {
    const value = String(id || "");
    if (!/^reading-[0-9a-f]{16}$/.test(value)) throw new Error("Reading Memory entry ID is invalid.");
    return `${basePath}/entries/${value}.json`;
  }

  function isValidIndexEntry(item) {
    if (!item || !core) return false;
    const sourcePath = core.normalizePath(item.source_path);
    return core.isEligibleReadingPath(sourcePath)
      && item.id === core.stableSourceId(sourcePath)
      && typeof item.source_hash === "string";
  }

  function createReadingMemoryStore(adapter, basePath = BASE_PATH) {
    const normalized = String(basePath || BASE_PATH).replace(/\/$/, "");
    return {
      adapter,
      basePath: normalized,
      indexPath: `${normalized}/index.json`,
      statePath: `${normalized}/state/reading-memory-state.json`,
      entryPath: (id) => entryPathFor(normalized, id),
      readIndex() { return readJson(adapter, this.indexPath); },
      readEntry(id) { return readJson(adapter, this.entryPath(id)); },
      writeEntry(id, entry) { return writeJson(adapter, this.entryPath(id), entry); },
      removeEntry(id) { return adapter.remove(this.entryPath(id)); },
      writeIndex(index) { return writeJson(adapter, this.indexPath, index); },
      writeState(state) { return writeJson(adapter, this.statePath, state); },
    };
  }

  function emptyCounts() {
    return { created: 0, updated: 0, skipped: 0, removed: 0, failed: 0, ignored: 0 };
  }

  async function buildReadingMemory({ sources, store }) {
    if (!core) throw new Error("ReadingMemoryCore is unavailable.");
    if (!store || !store.adapter) throw new Error("Reading memory store is required.");
    const counts = emptyCounts();
    const failures = [];
    const previousIndex = await store.readIndex();
    const indexedEntries = Array.isArray(previousIndex && previousIndex.entries) ? previousIndex.entries : [];
    const previousEntries = indexedEntries.filter((item) => {
      if (isValidIndexEntry(item)) return true;
      counts.failed += 1;
      failures.push({
        source_path: core.normalizePath(item && item.source_path),
        message: "Malformed Reading Memory index entry was ignored.",
      });
      return false;
    });
    const previousByPath = new Map(previousEntries.map((item) => [core.normalizePath(item.source_path), item]));
    const currentByPath = new Map();
    for (const source of [...(sources || [])].sort((a, b) => core.normalizePath(a.source_path).localeCompare(core.normalizePath(b.source_path), "ko"))) {
      const sourcePath = core.normalizePath(source && source.source_path);
      if (!core.isEligibleReadingPath(sourcePath)) {
        counts.ignored += 1;
        continue;
      }
      if (!currentByPath.has(sourcePath)) currentByPath.set(sourcePath, source);
    }

    const nextEntries = [];
    for (const [sourcePath, source] of currentByPath) {
      const id = core.stableSourceId(sourcePath);
      const previous = previousByPath.get(sourcePath);
      try {
        const entry = core.projectReadingSource(source);
        const stored = previous && previous.source_hash === entry.source_hash ? await store.readEntry(id) : null;
        if (stored && stored.schema_version === core.SCHEMA_VERSION && stored.source_hash === entry.source_hash) {
          counts.skipped += 1;
        } else {
          await store.writeEntry(id, entry);
          if (previous) counts.updated += 1;
          else counts.created += 1;
        }
        nextEntries.push({ id, source_path: sourcePath, source_hash: entry.source_hash, title: entry.title });
      } catch (error) {
        counts.failed += 1;
        failures.push({ source_path: sourcePath, message: String(error && error.message ? error.message : error) });
        if (previous) nextEntries.push(previous);
      }
    }

    for (const previous of previousEntries) {
      const sourcePath = core.normalizePath(previous.source_path);
      if (currentByPath.has(sourcePath)) continue;
      try {
        await store.removeEntry(previous.id);
        counts.removed += 1;
      } catch (error) {
        counts.failed += 1;
        failures.push({ source_path: sourcePath, message: String(error && error.message ? error.message : error) });
        nextEntries.push(previous);
      }
    }

    nextEntries.sort((a, b) => a.source_path.localeCompare(b.source_path, "ko"));
    const index = { schema_version: core.SCHEMA_VERSION, entries: nextEntries };
    const state = { schema_version: core.SCHEMA_VERSION, counts, failures };
    await store.writeIndex(index);
    await store.writeState(state);
    return { counts, failures, index };
  }

  const api = {
    BASE_PATH,
    buildReadingMemory,
    createNodeAdapter,
    createObsidianAdapter,
    createReadingMemoryStore,
  };

  root.ReadingMemoryStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
