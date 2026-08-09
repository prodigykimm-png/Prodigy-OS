(function (root) {
  "use strict";

  const core = root.ReadingChecklistCore || (typeof require === "function" ? require("./reading-checklist-core.js") : null);
  const BASE_PATH = "SYSTEM/AI/Memory/reading/checklists";

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
      async exists(relativePath) { try { await fs.access(resolve(relativePath)); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } },
      async read(relativePath) { return fs.readFile(resolve(relativePath), "utf8"); },
      async write(relativePath, content) { const target = resolve(relativePath); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content, "utf8"); },
      async mkdir(relativePath) { await fs.mkdir(resolve(relativePath), { recursive: true }); },
      async remove(relativePath) { try { await fs.unlink(resolve(relativePath)); } catch (error) { if (error.code !== "ENOENT") throw error; } },
      async rename(from, to) { await fs.rename(resolve(from), resolve(to)); },
    };
  }

  function createObsidianAdapter(app) {
    if (root.ReadingMemoryStore && typeof root.ReadingMemoryStore.createObsidianAdapter === "function") {
      return root.ReadingMemoryStore.createObsidianAdapter(app);
    }
    if (!app || !app.vault || !app.vault.adapter) throw new Error("Obsidian Vault adapter is unavailable.");
    const adapter = app.vault.adapter;
    return {
      exists: (path) => adapter.exists(path), read: (path) => adapter.read(path), write: (path, content) => adapter.write(path, content),
      mkdir: async (path) => { if (!(await adapter.exists(path))) await adapter.mkdir(path); },
      remove: async (path) => { if (await adapter.exists(path)) await adapter.remove(path); },
      rename: typeof adapter.rename === "function" ? (from, to) => adapter.rename(from, to) : null,
    };
  }

  async function ensureFolder(adapter, folderPath) {
    let current = "";
    for (const part of String(folderPath || "").split("/")) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) await adapter.mkdir(current);
    }
  }

  async function readJson(adapter, path) {
    if (!(await adapter.exists(path))) return null;
    try { return JSON.parse(await adapter.read(path)); } catch (_error) { return null; }
  }

  async function writeJson(adapter, path, value) {
    await ensureFolder(adapter, path.split("/").slice(0, -1).join("/"));
    const content = `${JSON.stringify(value, null, 2)}\n`;
    if (typeof adapter.atomicWrite === "function") { await adapter.atomicWrite(path, content); return; }
    if (!adapter.rename) { await adapter.write(path, content); return; }
    const temporary = `${path}.tmp`;
    await adapter.write(temporary, content);
    try { await adapter.rename(temporary, path); } catch (error) { await adapter.remove(temporary); throw error; }
  }

  function statePath(basePath, id) {
    if (!/^checklist-[0-9a-f]{16}$/.test(String(id || ""))) throw new Error("Checklist state ID is invalid.");
    return `${basePath}/${id}.json`;
  }

  function createChecklistStore(adapter, basePath = BASE_PATH) {
    const normalized = String(basePath || BASE_PATH).replace(/\/$/, "");
    return {
      adapter,
      basePath: normalized,
      pathFor(id) { return statePath(normalized, id); },
      read(id) { return readJson(adapter, this.pathFor(id)); },
      write(id, value) { return writeJson(adapter, this.pathFor(id), value); },
      remove(id) { return adapter.remove(this.pathFor(id)); },
    };
  }

  function createState(source, selection, previous = null) {
    if (!core) throw new Error("ReadingChecklistCore is unavailable.");
    const id = core.stableSourceId(source);
    const previousItems = previous && previous.items && typeof previous.items === "object" ? previous.items : {};
    const previousDrafts = previous && previous.drafts && typeof previous.drafts === "object" ? previous.drafts : {};
    const previousQuestions = previous && previous.questions && typeof previous.questions === "object" ? previous.questions : {};
    const items = {};
    const drafts = {};
    selection.questions.forEach((question) => { items[question.id] = core.normalizeState(previousItems[question.id]); });
    selection.questions.forEach((question) => {
      const draft = String(previousDrafts[question.id] || "").trim();
      if (draft) drafts[question.id] = draft;
    });
    return {
      schema_version: core.SCHEMA_VERSION,
      state_id: id,
      source_path: core.normalizePath(source.source_path || (source.file && source.file.path)),
      object_id: String(source.id || ""),
      strategy: selection.type,
    items,
    drafts,
    questions: previousQuestions,
    updated_at: previous && previous.updated_at ? previous.updated_at : "",
    };
  }

  const api = { BASE_PATH, createChecklistStore, createNodeAdapter, createObsidianAdapter, createState };
  root.ReadingChecklistStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
