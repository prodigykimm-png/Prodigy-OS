"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const adapter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-adapter.js"));
const surfaceApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-surface.js"));
const stylesApi = require(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"));
const { createTrustedFixture } = require("./fixtures/llmwiki-canonical-v2-trust-fixture.js");

function fakeDocument() {
  let document;
  const make = (tag) => {
    const element = {
      tagName: tag,
      children: [],
      attributes: {},
      ownerDocument: document,
      textContent: "",
      value: "",
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter((item) => item !== child); },
      createEl(childTag, options) {
        const child = make(childTag);
        const config = options || {};
        if (config.text !== undefined) child.textContent = String(config.text);
        Object.entries(config.attr || {}).forEach(([key, value]) => {
          if (value !== undefined) child.setAttribute(key, value);
        });
        if (config.disabled) child.disabled = true;
        this.appendChild(child);
        return child;
      },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      removeAttribute(key) { delete this.attributes[key]; },
      empty() { this.children = []; this.textContent = ""; },
      focus() { this.focused = true; },
    };
    return element;
  };
  document = {
    head: make("head"),
    createElement: make,
    getElementById() { return null; },
  };
  return { document, container: make("div") };
}

function legacyAsset() {
  return { source_path: "ZETA/PERMANENT/alpha.md", path: "ZETA/PERMANENT/alpha.md", type: "knowledge", title: "Alpha", mtime: 10, frontmatter: { type: "knowledge", knowledge_domain: "coding", knowledge_topics: ["ai"] } };
}

function snapshot() {
  return adapter.buildSnapshot({
    registry,
    collection_revision: "surface-fixture",
    assets: [legacyAsset()],
    candidates: [{ type: "knowledge_candidate", path: "PARA/RESOURCES/Knowledge/Candidates/pending.md", title: "Pending", statement: "Pending statement", suggested_domain: "coding", suggested_topics: ["ai"], status: "saved", mtime: 20 }],
  });
}

async function snapshotWithTrustedRow() {
  const genuine = await createTrustedFixture();
  const current = adapter.buildSnapshot({
    registry,
    collection_revision: genuine.revision,
    assets: [genuine.row, legacyAsset()],
    candidates: [{ type: "knowledge_candidate", path: "PARA/RESOURCES/Knowledge/Candidates/pending.md", title: "Pending", statement: "Pending statement", suggested_domain: "coding", suggested_topics: ["ai"], status: "saved", mtime: 20 }],
  });
  assert.equal(current.counts.verified, 1, JSON.stringify(current.counts));
  assert.equal(current.rows.find((row) => row.trust === "verified").path, genuine.path);
  assert.equal(current.rows.find((row) => row.trust === "maintenance" && row.path === "ZETA/PERMANENT/alpha.md") !== undefined, true, "legacy knowledge row without finalized authority stays maintenance");
  return { genuine, current };
}

function descendants(root) {
  return [root, ...(root && Array.isArray(root.children) ? root.children.flatMap(descendants) : [])];
}

test("clicking a verified canonical v2 result opens hydrated detail in an Obsidian modal while legacy rows stay excluded", async () => {
  const { genuine, current } = await snapshotWithTrustedRow();
  const { document, container } = fakeDocument();
  const modals = [];
  class FakeModal {
    constructor() {
      this.modalEl = document.createElement("div");
      this.contentEl = document.createElement("div");
      this.modalEl.appendChild(this.contentEl);
      modals.push(this);
    }
    open() {
      this.opened = true;
      if (typeof this.onOpen === "function") this.onOpen();
    }
    close() {
      this.opened = false;
      if (typeof this.onClose === "function") this.onClose();
    }
  }
  const readService = {
    browseRead(input) {
      return adapter.browseRead({ ...input, registry });
    },
    hydrateBody(input) {
      return Promise.resolve({ ok: true, status: "ready", path: input.path, body: "popup body", writer_count: 0, provider_count: 0 });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({
      app: {},
      container,
      snapshot: current,
      readAdapter: adapter,
      readService,
      obsidian: { Modal: FakeModal },
    });
    surface.setMode("verified");
    assert.equal(descendants(container).some((node) => typeof node.textContent === "string" && node.textContent.includes("Alpha")), false, "legacy row is never rendered as a verified result");
    const resultButton = descendants(container).find((node) => node.attributes && node.attributes.class === "llmwiki-wiki-surface__result");
    assert.ok(resultButton);
    resultButton.onclick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(modals.length, 1);
    assert.equal(modals[0].opened, true);
    const modalText = descendants(modals[0].contentEl).map((node) => node.textContent).filter(Boolean).join(" ");
    assert.match(modalText, /Fixture authority/u);
    assert.match(modalText, /popup body/u);
    assert.equal(descendants(container).some((node) => node.attributes && node.attributes["data-component"] === "WikiDetailPane"), false);
    modals[0].close();
    assert.equal(surface.getState().selection.path, null);
  } finally {
    global.document = previousDocument;
  }
});

test("compact modal keeps its sticky close footer inside the native dialog", () => {
  const { document } = fakeDocument();
  stylesApi.ensureStyles(document);
  const css = document.head.children.find((node) => node.attributes && node.attributes["data-knowledge-styles"] !== undefined).textContent;
  assert.match(css, /\.llmwiki-wiki-detail-modal__article\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[^}]*max-block-size:\s*80vh;/u);
  assert.doesNotMatch(css, /\.llmwiki-wiki-detail-modal__article\s*\{\s*max-block-size:\s*(?:8[1-9]|9\d|100)vh/u);
});

test("fourth-tab browse surface renders read-only facets, selection, and hydrated detail", async () => {
  const { document, container } = fakeDocument();
  const current = snapshot();
  let browseCalls = 0;
  let hydrationCalls = 0;
  const readService = {
    browseRead(input) {
      browseCalls += 1;
      return adapter.browseRead({ ...input, registry });
    },
    hydrateBody(input) {
      hydrationCalls += 1;
      return Promise.resolve({ ok: true, status: "ready", path: input.path, body: "read-only body", writer_count: 0, provider_count: 0 });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: current, readAdapter: adapter, readService });
    assert.equal(surface.getState().status, "ready");
    const pending = surface.setMode("pending");
    assert.equal(pending.status, "ready");
    assert.equal(pending.result.rows[0].trust, "pending");
    assert.equal(pending.result.writer_count, 0);
    assert.equal(pending.result.provider_count, 0);

    const selected = surface.select("PARA/RESOURCES/Knowledge/Candidates/pending.md");
    assert.equal(selected.selection.path, "PARA/RESOURCES/Knowledge/Candidates/pending.md");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(surface.getState().bodyState, "ready");
    assert.equal(surface.getState().body, "read-only body");
    const queried = surface.setQuery("pending");
    assert.equal(queried.selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    surface.select("PARA/RESOURCES/Knowledge/Candidates/pending.md");
    await new Promise((resolve) => setImmediate(resolve));
    const modeChanged = surface.setMode("verified");
    assert.equal(modeChanged.selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    assert.ok(browseCalls >= 2);
    assert.equal(hydrationCalls, 2);
    assert.equal(current.writer_count, 0);
    assert.equal(current.provider_count, 0);
  } finally {
    global.document = previousDocument;
  }
});
test("inactive Knowledge tab does not retain zero-sized native controls and remounts from retained state when shown", () => {
  const { document, container } = fakeDocument();
  const panel = { hidden: true };
  container.closest = () => panel;
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: snapshot(), readAdapter: adapter });
    assert.equal(container.children.length, 0);
    panel.hidden = false;
    surface.update({ status: "ready" });
    assert.equal(container.children.length, 1);
    assert.equal(surface.getState().status, "ready");
    surface.destroy();
  } finally {
    global.document = previousDocument;
  }
});

test("facet changes clear detail selection and stale reads render an explicit stale state", async () => {
  const { document, container } = fakeDocument();
  const current = snapshot();
  const staleService = {
    browseRead() {
      return {
        ok: true,
        value: {
          status: "stale",
          reason: "stale_snapshot",
          total: 0,
          rows: [],
          facets: { domains: [], topics: [] },
          selection: { domain: "", topic: "", mode: "verified", path: null, detail_state: "rest" },
        },
      };
    },
    hydrateBody() {
      return Promise.resolve({ ok: false, status: "stale", reason: "stale_snapshot" });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: current, readAdapter: adapter, readService: staleService });
    assert.equal(surface.setFacet("domain", "coding").selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    assert.equal(surface.setQuery("changed").status, "stale");
    assert.equal(surface.getState().status, "stale");
  } finally {
    global.document = previousDocument;
  }
});
test("late hydration cannot repopulate cleared selection after a mode change", async () => {
  const { document, container } = fakeDocument();
  const current = snapshot();
  let resolveBody;
  const delayedService = {
    browseRead(input) {
      return adapter.browseRead({ ...input, registry });
    },
    hydrateBody() {
      return new Promise((resolve) => { resolveBody = resolve; });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: current, readAdapter: adapter, readService: delayedService });
    surface.select("PARA/RESOURCES/Knowledge/Candidates/pending.md");
    assert.equal(surface.getState().bodyState, "loading");
    const changed = surface.setMode("pending");
    assert.equal(changed.selection.path, null);
    assert.equal(changed.bodyState, "empty");
    resolveBody({ ok: true, status: "ready", body: "late body", writer_count: 0, provider_count: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(surface.getState().selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    assert.equal(surface.getState().body, null);
  } finally {
    global.document = previousDocument;
  }
});
