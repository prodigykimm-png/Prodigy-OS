"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const viewApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-index-view.js"));
const indexApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-index.js"));
const { mountRoot, walk } = require("./llmwiki_lifecycle_view_fixture.js");

function row(id, lifecycle, title, tags) {
  const citation = {
    citation_id: `citation_${id}`,
    source_path: `INBOX/${id}.md`,
    content_hash: "a".repeat(64),
    locators: [`INBOX/${id}.md#0-4`],
    evidence_quote: "근거",
  };
  return {
    artifact_id: `prodigy_artifact_${id.repeat(24).slice(0, 24)}`,
    artifact_receipt_hash: "b".repeat(64),
    document_path: `PARA/RESOURCES/Prodigy Wiki/${id}.md`,
    document_hash: "c".repeat(64),
    document_kind: "topic_article",
    title,
    purpose: `${title} 목적`,
    source_id: `source_${id}`,
    source_path: `INBOX/${id}.md`,
    source_title: `${id}`,
    source_revision: "a".repeat(64),
    observed_source_revision: lifecycle === "stale" ? "d".repeat(64) : "a".repeat(64),
    scope: null,
    reviewed_at: "2026-09-01T01:00:00.000Z",
    trust_tier: "prodigy_reviewed",
    canonical_published: false,
    lifecycle,
    tags,
    headings: [`${title} 핵심`],
    index_terms: tags,
    navigation_manifest: {
      sections: [{
        section_id: `section_${id}`,
        heading: `${title} 핵심`,
        citations: [citation],
        paragraphs: [],
      }],
    },
    source_outline: { rows: [] },
    search_text: `${title} ${id} ${tags.join(" ")}`.toLowerCase(),
    related_artifact_ids: [],
  };
}

function index() {
  const current = row("a", "current", "질문 중심 독서", ["reading"]);
  const stale = row("b", "stale", "입찰가 판단", ["real_estate", "bidding"]);
  return {
    index_version: indexApi.VERSION,
    index_revision: "e".repeat(64),
    rows: [current, stale],
    groups: [
      { term: "bidding", artifact_ids: [stale.artifact_id] },
      { term: "reading", artifact_ids: [current.artifact_id] },
      { term: "real_estate", artifact_ids: [stale.artifact_id] },
    ],
    counts: { current: 1, stale: 1, history: 0, total: 2 },
    provider_count: 0,
    writer_count: 0,
  };
}

test("reviewed Wiki index surface searches current entries and exposes stale mode separately", () => {
  const mounted = mountRoot();
  const opened = [];
  const inspected = [];
  const surface = viewApi.mount({
    container: mounted.root,
    index: index(),
    onOpenDocument: (value) => opened.push(["document", value]),
    onOpenSource: (value) => opened.push(["source", value]),
    onOpenCitation: (value) => opened.push(["citation", value.citation_id]),
    onInspectChanges: (value) => inspected.push(value.artifact_id),
  });

  assert.equal(walk(mounted.root, (node) => node.getAttribute("data-reviewed-wiki-row")).length, 1);
  assert.equal(walk(mounted.root, (node) => node.getAttribute("data-reviewed-wiki-lifecycle") === "current").length, 1);
  surface.setQuery("질문");
  assert.equal(surface.getState().result.total, 1);
  surface.setQuery("없는 항목");
  assert.equal(surface.getState().result.total, 0);
  surface.setQuery("");
  surface.setMode("stale");
  assert.equal(surface.getState().result.rows[0].title, "입찰가 판단");
  assert.equal(walk(mounted.root, (node) => node.getAttribute("data-reviewed-wiki-lifecycle") === "stale").length, 1);

  const documentButton = walk(mounted.root, (node) => node.getAttribute("data-action") === "open-reviewed-wiki")[0];
  const sourceButton = walk(mounted.root, (node) => node.getAttribute("data-action") === "open-reviewed-source")[0];
  const citationButton = walk(mounted.root, (node) => node.getAttribute("data-action") === "open-reviewed-citation")[0];
  const inspectButton = walk(mounted.root, (node) => node.getAttribute("data-action") === "inspect-reviewed-changes")[0];
  assert.equal(inspectButton.getAttribute("data-primary"), "true");
  documentButton.onclick();
  sourceButton.onclick();
  citationButton.onclick();
  inspectButton.onclick();
  assert.deepEqual(opened, [
    ["document", "PARA/RESOURCES/Prodigy Wiki/b.md"],
    ["source", "INBOX/b.md"],
    ["citation", "citation_b"],
  ]);
  assert.deepEqual(inspected, [index().rows[1].artifact_id]);
});

test("index surface updates from a new catalog revision without losing active filters", () => {
  const mounted = mountRoot();
  const surface = viewApi.mount({ container: mounted.root, index: index() });
  surface.setMode("stale");
  surface.setQuery("입찰");
  const next = {
    ...index(),
    index_revision: "f".repeat(64),
    rows: index().rows.map((value) => value.lifecycle === "stale"
      ? { ...value, title: "새 입찰가 판단", search_text: "새 입찰가 판단 bidding" }
      : value),
  };
  surface.update(next);
  assert.equal(surface.getState().mode, "stale");
  assert.equal(surface.getState().query, "입찰");
  assert.equal(surface.getState().result.rows[0].title, "새 입찰가 판단");
});
