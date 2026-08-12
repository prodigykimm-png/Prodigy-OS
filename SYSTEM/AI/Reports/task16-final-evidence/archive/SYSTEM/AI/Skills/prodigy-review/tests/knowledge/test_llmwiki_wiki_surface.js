"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const adapter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-adapter.js"));
const surfaceApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-surface.js"));

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

function snapshot() {
  return adapter.buildSnapshot({
    registry,
    collection_revision: "surface-fixture",
    assets: [{ source_path: "ZETA/PERMANENT/alpha.md", path: "ZETA/PERMANENT/alpha.md", type: "knowledge", title: "Alpha", mtime: 10, frontmatter: { type: "knowledge", knowledge_domain: "coding", knowledge_topics: ["ai"] } }],
    candidates: [{ type: "knowledge_candidate", path: "PARA/RESOURCES/Knowledge/Candidates/pending.md", title: "Pending", statement: "Pending statement", suggested_domain: "coding", suggested_topics: ["ai"], status: "saved", mtime: 20 }],
  });
}

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
