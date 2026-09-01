"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const indexApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-index.js"));

function entry(id, overrides = {}) {
  const artifactId = `prodigy_artifact_${hash.sha256(id).slice(0, 24)}`;
  const sourcePath = overrides.source_path || `INBOX/${id} 자료.md`;
  const sourceRevision = overrides.source_revision || hash.sha256(`${id} source`);
  return {
    artifact_id: artifactId,
    artifact_receipt_hash: hash.sha256(`${id} receipt`),
    document_path: `PARA/RESOURCES/Prodigy Wiki/${id}/${id}.md`,
    document_hash: hash.sha256(`${id} document`),
    source_id: `source_${id}`,
    source_path: sourcePath,
    source_revision: sourceRevision,
    scope: null,
    document_kind: "topic_article",
    title: `${id} Wiki`,
    logical_id: hash.sha256(`${id} logical`),
    trust_tier: "prodigy_reviewed",
    navigation_manifest: {
      navigation_version: "prodigy_wiki_navigation_v1",
      title: `${id} Wiki`,
      purpose: `${id} 판단을 정리한다.`,
      tags: overrides.tags || ["reading"],
      sections: [{
        section_id: `section_${id}`,
        heading: overrides.heading || `${id} 핵심`,
        claim_ids: [`claim_${id}`],
        citations: [],
        paragraphs: [],
      }],
    },
    source_outline: { rows: [] },
    reviewed_at: overrides.reviewed_at || "2026-09-01T01:00:00.000Z",
    supersedes: [],
    status: overrides.status || "current",
    canonical_published: false,
    ...overrides,
  };
}

function snapshot(entries) {
  return {
    version: "prodigy_wiki_reviewed_store_v1",
    revision: hash.sha256(JSON.stringify(entries.map((row) => row.artifact_id))),
    entries,
    current_entries: entries.filter((row) => row.status === "current"),
    issues: [],
  };
}

test("reviewed index groups current source-bound artifacts without mixing canonical Knowledge", () => {
  const alpha = entry("alpha", { tags: ["reading", "personal_growth"], heading: "질문 독서" });
  const beta = entry("beta", { tags: ["reading"], heading: "메모 독서" });
  const forgedCanonical = entry("canonical", {
    trust_tier: "verified",
    document_path: "PARA/RESOURCES/Knowledge/정본.md",
    canonical_published: true,
  });
  const projected = indexApi.projectReviewedIndex(snapshot([beta, forgedCanonical, alpha]), {
    source_revisions: {
      [alpha.source_path]: alpha.source_revision,
      [beta.source_path]: beta.source_revision,
    },
  });

  assert.equal(projected.rows.length, 2);
  assert.deepEqual(projected.rows.map((row) => row.artifact_id), [alpha.artifact_id, beta.artifact_id]);
  assert.deepEqual(projected.groups.map((group) => group.term), ["personal_growth", "reading"]);
  assert.deepEqual(projected.groups.find((group) => group.term === "reading").artifact_ids, [
    alpha.artifact_id,
    beta.artifact_id,
  ]);
  assert.equal(projected.rows.every((row) => row.trust_tier === "prodigy_reviewed"), true);
  assert.equal(projected.rows.some((row) => row.document_path.startsWith("PARA/RESOURCES/Knowledge/")), false);
  assert.deepEqual(projected.counts, { current: 2, stale: 0, history: 0, total: 2 });
  assert.equal(projected.provider_count, 0);
  assert.equal(projected.writer_count, 0);
});

test("index marks source revision drift and preserves superseded history without default surfacing", () => {
  const current = entry("current", { tags: ["reading"] });
  const stale = entry("stale", { tags: ["personal_growth"] });
  const history = entry("history", { status: "superseded", tags: ["reading"] });
  const projected = indexApi.projectReviewedIndex(snapshot([history, stale, current]), {
    source_revisions: {
      [current.source_path]: current.source_revision,
      [stale.source_path]: hash.sha256("changed"),
      [history.source_path]: history.source_revision,
    },
  });

  assert.deepEqual(projected.counts, { current: 1, stale: 1, history: 1, total: 3 });
  assert.deepEqual(indexApi.queryReviewedIndex(projected, {}).rows.map((row) => row.artifact_id), [
    current.artifact_id,
  ]);
  assert.deepEqual(indexApi.queryReviewedIndex(projected, { mode: "stale" }).rows.map((row) => row.artifact_id), [
    stale.artifact_id,
  ]);
  assert.deepEqual(indexApi.queryReviewedIndex(projected, { mode: "history" }).rows.map((row) => row.artifact_id), [
    history.artifact_id,
  ]);
});

test("index search covers title source tags and sections with byte-stable projection", () => {
  const alpha = entry("alpha", {
    title: "질문 중심 독서",
    source_path: "INBOX/독서 수업.md",
    tags: ["reading"],
    heading: "읽기 전 질문",
  });
  const beta = entry("beta", {
    title: "경매 입찰",
    source_path: "INBOX/투자 수업.md",
    tags: ["real_estate", "bidding"],
    heading: "입찰가 판단",
  });
  const options = {
    source_revisions: {
      [alpha.source_path]: alpha.source_revision,
      [beta.source_path]: beta.source_revision,
    },
  };
  const first = indexApi.projectReviewedIndex(snapshot([alpha, beta]), options);
  const reordered = indexApi.projectReviewedIndex(snapshot([beta, alpha]), options);

  assert.equal(first.index_revision, reordered.index_revision);
  assert.deepEqual(first.rows, reordered.rows);
  assert.deepEqual(indexApi.queryReviewedIndex(first, { query: "독서 수업" }).rows.map((row) => row.title), ["질문 중심 독서"]);
  assert.deepEqual(indexApi.queryReviewedIndex(first, { query: "입찰가" }).rows.map((row) => row.title), ["경매 입찰"]);
  assert.deepEqual(indexApi.queryReviewedIndex(first, { term: "reading" }).rows.map((row) => row.title), ["질문 중심 독서"]);
});
