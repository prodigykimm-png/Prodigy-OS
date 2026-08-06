"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HUB_PATH = path.join(ROOT, "HUB/50 Knowledge.md");
const HUB_SOURCE = fs.readFileSync(HUB_PATH, "utf8");
function hubModulePaths(source) {
  const match = source.match(/KnowledgeExplorerHub\.modulePaths\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error("Knowledge hub module list not found.");
  return Object.freeze([...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]));
}
const HUB_MODULE_PATHS = hubModulePaths(HUB_SOURCE);
const MODULE_PATHS = [
  "SYSTEM/Views/design-tokens.js",
  "SYSTEM/Views/workspace-registry.js",
  "SYSTEM/Views/prodigy-workspace-state-store.js",
  "SYSTEM/Views/prodigy-app-shell.js",
  "SYSTEM/Views/workspace-navigation.js",
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
  "SYSTEM/Views/ai-provider-error-policy.js",
  "SYSTEM/Views/ai-provider-fallback.js",
  "SYSTEM/Views/codex-exec-service.js",
  "SYSTEM/Views/antigravity-exec-service.js",
  "SYSTEM/Views/ai-provider-service.js",
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
  "SYSTEM/Views/llmwiki-librarian-pipeline.js",
  "SYSTEM/Views/llmwiki-outbound-consent.js",
  "SYSTEM/Views/llmwiki-run-state.js",
  "SYSTEM/Views/llmwiki-canonical-packet.js",
  "SYSTEM/Views/llmwiki-approval-review-commit.js",
  "SYSTEM/Views/llmwiki-deterministic-commit.js",
  "SYSTEM/Views/llmwiki-approval-review-view.js",
  "SYSTEM/Views/llmwiki-obsidian-adapter.js",
  "SYSTEM/Views/llmwiki-derived-refresh.js",
  "SYSTEM/Views/llmwiki-run-controller.js",
  "SYSTEM/Views/llmwiki-lifecycle-view.js",
  "SYSTEM/Views/knowledge-workspace-tabs.js",
  "SYSTEM/Views/para-object-creator-service.js",
  "SYSTEM/Views/knowledge-para-projection.js",
  "SYSTEM/Views/knowledge-para-view.js"
];

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
  return {
    getMarkdownFiles() {
      return [...fileMap.keys()].filter((filePath) => filePath.endsWith(".md")).map((path) => ({ path }));
    },
    getAbstractFileByPath(filePath) {
      return fileMap.has(filePath) ? { path: filePath } : null;
    },
    async read(file) {
      const filePath = typeof file === "string" ? file : file && file.path;
      if (!fileMap.has(filePath)) throw new Error(`Missing file: ${filePath}`);
      return fileMap.get(filePath);
    },
    async cachedRead(file) {
      return this.read(file);
    }
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

function createSandbox({ pages, omittedModulePaths = [], bodyLoadError = null, approvalPacket = null, hubOptions = {} }) {
  const files = {};
  for (const modulePath of MODULE_PATHS) {
    if (omittedModulePaths.includes(modulePath)) continue;
    files[modulePath] = fs.readFileSync(path.join(ROOT, modulePath), "utf8");
  }
  for (const page of pages) {
    if (page && page.path) files[page.path] = page.content || "";
  }
  const readCounts = { body: 0 };
  const app = { vault: createVault(files), workspace: createWorkspace() };
  const container = new FakeElement("section");
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
  const sandbox = {
    app,
    dv: createDv(pages, readCounts, bodyLoadError),
    obsidian: { Modal: FakeModal },
    container,
    console,
    URL,
    require, Buffer, AbortController, setTimeout, clearTimeout,
    ...(approvalPacket ? { KnowledgeExplorerHub: { approvalPacket, ...hubOptions } } : {})
  };
  // Browser modules intentionally use either window or globalThis. Model that identity in the VM.
  sandbox.window = sandbox;
  sandbox.document = undefined;
  return { sandbox, app, container, windowObject: sandbox, readCounts, openedModals };
}

async function runHub({ pages, omittedModulePaths = [], bodyLoadError = null, approvalPacket = null, hubOptions = {} }) {
  const { sandbox, app, container, windowObject, readCounts, openedModals } = createSandbox({ pages, omittedModulePaths, bodyLoadError, approvalPacket, hubOptions });
  const code = extractDataviewJs(HUB_SOURCE);
  const script = new vm.Script(`(async function () {\n${code}\n}).call({ container });`, {
    filename: "HUB/50 Knowledge.md"
  });
  const result = script.runInNewContext(sandbox);
  if (result && typeof result.then === "function") await result;
  return { app, container, window: windowObject, readCounts, openedModals };
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

module.exports = { buildPages, firstElement, runHub, MODULE_PATHS, HUB_MODULE_PATHS };
