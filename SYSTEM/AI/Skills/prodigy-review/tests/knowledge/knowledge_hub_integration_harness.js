"use strict";

const fs = require("node:fs");
const { webcrypto } = require("node:crypto");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB_PATH = path.join(ROOT, "HUB/50 Knowledge.md");
const HUB_SOURCE = fs.readFileSync(HUB_PATH, "utf8");
function hubModulePaths() {
  const manifest = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json")).entries.knowledge;
  return Object.freeze(manifest.required.concat(manifest.optional));
}
const HUB_MODULE_PATHS = hubModulePaths();
const LEGACY_MODULE_PATHS = [
  "SYSTEM/Views/design-tokens.js",
  "SYSTEM/Views/workspace-registry.js",
  "SYSTEM/Views/prodigy-workspace-state-store.js",
  "SYSTEM/Views/prodigy-app-shell.js",
  "SYSTEM/Views/workspace-navigation.js",
  "SYSTEM/Views/knowledge-workspace-route.js",
  "SYSTEM/Views/display-registry.js",
  "SYSTEM/Views/knowledge-explorer-registry.js",
  "SYSTEM/Views/knowledge-authoring-validation.js",
  "SYSTEM/Views/knowledge-authoring-core.js",
  "SYSTEM/Views/knowledge-candidate-core.js",
  "SYSTEM/Views/evidence-quality-core.js",
  "SYSTEM/Views/knowledge-candidate-store.js",
  "SYSTEM/Views/knowledge-candidate-view.js",
  "SYSTEM/Views/knowledge-candidate-hub-adapter.js",
  "SYSTEM/Views/knowledge-direct-authoring-form.js",
  "SYSTEM/Views/knowledge-direct-authoring-view.js",
  "SYSTEM/Views/knowledge-source-authoring-form.js",
  "SYSTEM/Views/knowledge-source-store.js",
  "SYSTEM/Views/knowledge-source-authoring-view.js",
  "SYSTEM/Views/knowledge-source-fetch-service.js",
  "SYSTEM/Views/knowledge-source-batch-policy.js",
  "SYSTEM/Views/knowledge-source-batch-service.js",
  "SYSTEM/Views/knowledge-source-batch-state.js",
  "SYSTEM/Views/knowledge-source-batch-controller.js",
  "SYSTEM/Views/knowledge-source-batch-render.js",
  "SYSTEM/Views/knowledge-source-batch-view.js",
  "SYSTEM/Views/prodigy-config-service.js",
  "SYSTEM/Views/project-workflow-draft-service.js",
  "SYSTEM/Views/knowledge-authoring-hub-adapter.js",
  "SYSTEM/Views/knowledge-explorer-hub-projection.js",
  "SYSTEM/Views/knowledge-explorer-core.js",
  "SYSTEM/Views/knowledge-explorer-data-source.js",
  "SYSTEM/Views/knowledge-explorer-relations.js",
  "SYSTEM/Views/knowledge-explorer-hub-adapter.js",
  "SYSTEM/Views/knowledge-explorer-brief-core.js",
  "SYSTEM/Views/knowledge-explorer-brief-policy.js",
  "SYSTEM/Views/knowledge-explorer-brief-service.js",
  "SYSTEM/Views/knowledge-explorer-brief.js",
  "SYSTEM/Views/knowledge-explorer-brief-render.js",
  "SYSTEM/Views/knowledge-explorer-state.js",
  "SYSTEM/Views/knowledge-explorer-responsive.js",
  "SYSTEM/Views/knowledge-explorer-render.js",
  "SYSTEM/Views/knowledge-explorer-view.js",
  "SYSTEM/Views/llmwiki-hash.js",
  "SYSTEM/Views/llmwiki-proposal-bundle.js",
  "SYSTEM/Views/llmwiki-source-lineage.js",
  "SYSTEM/Views/llmwiki-query-readonly.js",
  "SYSTEM/Views/llmwiki-provider-contract.js",
  "SYSTEM/Views/llmwiki-outbound-consent.js",
  "SYSTEM/Views/llmwiki-run-state.js",
  "SYSTEM/Views/llmwiki-canonical-packet.js",
  "SYSTEM/Views/llmwiki-approval-review-commit.js",
  "SYSTEM/Views/llmwiki-merge-transaction.js",
  "SYSTEM/Views/llmwiki-deterministic-commit.js",
  "SYSTEM/Views/llmwiki-approval-review-view.js",
  "SYSTEM/Views/llmwiki-obsidian-adapter.js",
  "SYSTEM/Views/llmwiki-derived-refresh.js",
  "SYSTEM/Views/llmwiki-run-controller.js",
  "SYSTEM/Views/llmwiki-lifecycle-view.js",
  "SYSTEM/Views/llmwiki-ui-recovery.js",
  "SYSTEM/Views/llmwiki-provider-response-schema.js",
  "SYSTEM/Views/llmwiki-ai-runtime-transport.js",
  "SYSTEM/Views/llmwiki-wiki-read-adapter.js",
  "SYSTEM/Views/llmwiki-wiki-read-service.js",
  "SYSTEM/Views/llmwiki-wiki-surface.js",
  "SYSTEM/Views/knowledge-workspace-tabs.js",
  "SYSTEM/Views/para-object-creator-service.js",
  "SYSTEM/Views/knowledge-para-projection.js",
  "SYSTEM/Views/knowledge-para-view.js"
];
const MODULE_PATHS = HUB_MODULE_PATHS;
void LEGACY_MODULE_PATHS;

const { FakeElement } = require("./knowledge_explorer_view_fakes.js");
const { catalog, flattenCatalog } = require("./knowledge_explorer_fixtures.js");

function extractDataviewJs(source) {
  const match = source.match(/```dataviewjs\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error("Knowledge hub DataviewJS block not found.");
  return match[1];
}

function toList(value) {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return values.flatMap((item) => {
    if (!item) return [];
    if (typeof item === "string") return [item];
    if (typeof item === "object") {
      const raw = item.path || item.file || item.link || item.target || "";
      return raw ? [String(raw)] : [];
    }
    return [String(item)];
  });
}

function toPage(doc) {
  if (!doc || typeof doc.source_path !== "string" || !doc.source_path.trim()) return null;
  const frontmatter = { ...(doc.frontmatter || {}) };
  const pathValue = doc.source_path;
  const name = pathValue.split("/").pop().replace(/\.md$/i, "");
  return {
    ...frontmatter,
    frontmatter,
    source_path: pathValue,
    path: pathValue,
    title: doc.title || frontmatter.title || name,
    type: doc.type || frontmatter.type || "",
    content: doc.content || "",
    file: {
      path: pathValue,
      name,
      mtime: doc.source_mtime || 1,
      outlinks: toList(frontmatter.connections),
      inlinks: []
    },
    connections: toList(frontmatter.connections),
    outlinks: toList(frontmatter.connections),
    backlinks: []
  };
}

function buildPages() {
  return flattenCatalog(catalog).map(toPage).filter(Boolean);
}

function createVault(files) {
  const fileMap = new Map(Object.entries(files));
  const modes = new Map([...fileMap.keys()].map((filePath) => [filePath, 0o644]));
  const directories = new Set();
  const listeners = new Map(["create", "modify", "delete", "rename"].map((name) => [name, new Set()]));
  const touched = [];
  const readPaths = [];
  const fileFor = (filePath) => fileMap.has(filePath) ? { path: filePath, stat: { mode: modes.get(filePath) || 0o644 } } : directories.has(filePath) ? { path: filePath, children: [] } : null;
  const emit = (name, ...args) => { for (const listener of listeners.get(name) || []) listener(...args); };
  return {
    touched,
    readPaths,
    adapter: {
      async read(filePath) {
        if (!fileMap.has(filePath)) throw new Error(`Missing file: ${filePath}`);
        return fileMap.get(filePath);
      },
    },
    getAbstractFileByPath: fileFor,
    getFiles() { return [...fileMap.keys()].sort().map(fileFor); },
    getMarkdownFiles() { return [...fileMap.keys()].filter((filePath) => filePath.endsWith(".md")).sort().map(fileFor); },
    on(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); return { name, listener }; },
    offref(ref) { if (ref) listeners.get(ref.name)?.delete(ref.listener); },
    async read(file) {
      const filePath = typeof file === "string" ? file : file && file.path;
      if (!fileMap.has(filePath)) throw new Error(`Missing file: ${filePath}`);
      readPaths.push(filePath);
      return fileMap.get(filePath);
    },
    async cachedRead(file) { return this.read(file); },
    async createFolder(filePath) { directories.add(filePath); },
    async create(filePath, bytes) { if (fileMap.has(filePath)) throw new Error("file_exists"); fileMap.set(filePath, bytes); modes.set(filePath, 0o644); touched.push(["create", filePath]); const file = fileFor(filePath); emit("create", file); return file; },
    async modify(file, bytes) { const filePath = typeof file === "string" ? file : file?.path; if (!fileMap.has(filePath)) throw new Error("missing_file"); fileMap.set(filePath, bytes); touched.push(["modify", filePath]); emit("modify", fileFor(filePath)); return fileFor(filePath); },
    async delete(file) { const filePath = typeof file === "string" ? file : file?.path; fileMap.delete(filePath); modes.delete(filePath); touched.push(["delete", filePath]); emit("delete", { path: filePath }); },
    async rename(file, nextPath) { const oldPath = file.path; const bytes = fileMap.get(oldPath); const mode = modes.get(oldPath); fileMap.delete(oldPath); modes.delete(oldPath); fileMap.set(nextPath, bytes); modes.set(nextPath, mode); touched.push(["rename", oldPath, nextPath]); emit("rename", fileFor(nextPath), oldPath); },
    mode(filePath) { return modes.get(filePath) || 0o644; },
    async setMode(filePath, mode) { modes.set(filePath, mode); }
  };
}

function createWorkspace() {
  const leaves = [];
  const calls = [];
  return {
    leaves,
    calls,
    getLeaf(mode) {
      calls.push(["getLeaf", mode]);
      const leaf = {
        mode,
        opened: [],
        async openFile(file) {
          this.opened.push(file.path);
          return file;
        }
      };
      leaves.push(leaf);
      return leaf;
    },
    async openLinkText(linkText, sourcePath, mode) {
      calls.push(["openLinkText", linkText, sourcePath, mode]);
      return { linkText, sourcePath, mode };
    }
  };
}

function createDv(pages, readCounts, bodyLoadError) {
  const pageList = pages.slice();
  const pageIndex = new Map(pageList.map((page) => [page.path, page]));
  return {
    pages() {
      return { array: () => pageList.slice() };
    },
    io: {
      async load(filePath) {
        readCounts.body += 1;
        if (bodyLoadError) throw bodyLoadError;
        return pageIndex.get(filePath)?.content || "";
      }
    }
  };
}

function task21RolloutStorage() {
  const phases = ["create", "update", "merge", "maintenance", "git", "resurfacing"];
  let serialized = JSON.stringify({ version: "llmwiki_rollout_state_v1", enabled_phases: phases, gate_receipts: Object.fromEntries(phases.map((phase) => [phase, { available: true, status: "green", receipt_id: `fixture_${phase}` }])) });
  return { async load() { return serialized; }, async save(next) { serialized = next; return true; } };
}

function createSandbox({ pages, omittedModulePaths = [], bodyLoadError = null, extraFiles = {}, llmWikiControllerOptions = null }) {
  const files = {
    "SYSTEM/Views/prodigy-workspace-manifest.js": fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"), "utf8"),
    "SYSTEM/Views/prodigy-hub-loader.js": fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-hub-loader.js"), "utf8")
  };
  for (const modulePath of MODULE_PATHS) {
    if (omittedModulePaths.includes(modulePath)) continue;
    files[modulePath] = fs.readFileSync(path.join(ROOT, modulePath), "utf8");
  }
  Object.assign(files, extraFiles);
  for (const page of pages) {
    if (page && page.path) files[page.path] = page.content || "";
  }
  const readCounts = { body: 0 };
  // Mirrors production inboxMetadata(): frontmatter of the raw markdown body.
  const metadataCache = {
    getFileCache(file) {
      const body = String((file && file.path ? files[file.path] : undefined) || "");
      if (!body.startsWith("---\n")) return { frontmatter: {} };
      const end = body.indexOf("\n---", 4);
      if (end < 0) return { frontmatter: {} };
      const frontmatter = {};
      for (const line of body.slice(4, end).split("\n")) {
        const separator = line.indexOf(":");
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
        if (key) frontmatter[key] = value === "true" ? true : value === "false" ? false : value;
      }
      return { frontmatter };
    },
  };
  const app = { vault: createVault(files), workspace: createWorkspace(), metadataCache };
  const container = new FakeElement("section");
  const windowObject = {};
  const openedModals = [];
  class FakeModal {
    constructor() {
      this.contentEl = new FakeElement("section");
      this.closed = false;
      openedModals.push(this);
    }
    open() { if (typeof this.onOpen === "function") this.onOpen(); }
    close() {
      if (this.closed) return;
      this.closed = true;
      if (typeof this.onClose === "function") this.onClose();
    }
  }
  const sandbox = { app, dv: createDv(pages, readCounts, bodyLoadError), obsidian: { Modal: FakeModal }, container, console, URL, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, AbortController, crypto: webcrypto, setTimeout, clearTimeout };
  const controllerOptions = { ...(llmWikiControllerOptions || {}) };
  if (!controllerOptions.rollout_storage) controllerOptions.rollout_storage = task21RolloutStorage();
  sandbox.KnowledgeExplorerHub = { llmWikiControllerOptions: controllerOptions };
  // Browser modules intentionally use either window or globalThis. Model that identity in the VM.
  sandbox.window = sandbox;
  sandbox.document = undefined;
  return { sandbox, app, container, windowObject: sandbox, readCounts, openedModals };
}

async function executeHub(runtime) {
  const { sandbox, container } = runtime;
  const code = extractDataviewJs(HUB_SOURCE);
  const script = new vm.Script(`(async function () {\n${code}\n}).call({ container });`, {
    filename: "HUB/50 Knowledge.md"
  });
  const result = script.runInNewContext(sandbox);
  if (result && typeof result.then === "function") await result;
}

function runtimeResult(runtime) {
  const { app, container, windowObject, readCounts, openedModals } = runtime;
  return { app, container, window: windowObject, readCounts, openedModals, runtime };
}

async function runHub({ pages, omittedModulePaths = [], bodyLoadError = null, extraFiles = {}, llmWikiControllerOptions = null }) {
  const runtime = createSandbox({ pages, omittedModulePaths, bodyLoadError, extraFiles, llmWikiControllerOptions });
  await executeHub(runtime);
  return runtimeResult(runtime);
}

async function remountHub(runtime) {
  if (!runtime || !runtime.sandbox || !runtime.container) throw new TypeError("invalid_hub_runtime");
  const loader = runtime.sandbox.ProdigyHubLoader;
  if (!loader || typeof loader.disposeWorkspace !== "function") throw new TypeError("hub_loader_dispose_unavailable");
  loader.disposeWorkspace(runtime.container);
  runtime.container.empty();
  await executeHub(runtime);
  return runtimeResult(runtime);
}

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function firstElement(root, tag, predicate) {
  return walk(root, (node) => node.tag === tag && (!predicate || predicate(node)))[0] || null;
}

module.exports = { buildPages, firstElement, runHub, remountHub, MODULE_PATHS, HUB_MODULE_PATHS };
