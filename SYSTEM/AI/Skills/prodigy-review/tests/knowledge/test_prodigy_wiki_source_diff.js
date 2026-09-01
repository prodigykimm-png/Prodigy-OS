"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const artifactContract = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-artifact-contract.js"));
const diffApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-source-diff.js"));

function source(text) {
  return {
    source_id: "source_outline_test",
    source_path: "INBOX/Outline Test.md",
    source_revision: hash.sha256(text),
    source_text: text,
  };
}
function outline(text) {
  return artifactContract.createSourceOutline(source(text));
}
function text(parts) {
  return `${parts.join("\n\n")}\n`;
}

test("stable heading keys survive inserted preamble and sibling headings", () => {
  const beforeText = text([
    "# Root",
    "root body",
    "## Alpha",
    "alpha body",
    "## Beta",
    "beta body",
  ]);
  const afterText = text([
    "새 머리말",
    "# Root",
    "root body",
    "## New",
    "new body",
    "## Alpha",
    "alpha body",
    "## Beta",
    "beta body",
  ]);
  const prior = outline(beforeText);
  const current = outline(afterText);
  const priorKeys = Object.fromEntries(prior.rows.map((row) => [row.heading, row.range_key]));
  const currentKeys = Object.fromEntries(current.rows.map((row) => [row.heading, row.range_key]));

  assert.equal(currentKeys.Root, priorKeys.Root);
  assert.equal(currentKeys.Alpha, priorKeys.Alpha);
  assert.equal(currentKeys.Beta, priorKeys.Beta);
  const diff = diffApi.compareSourceOutlines({
    previous_outline: prior,
    current_source: source(afterText),
  });
  assert.deepEqual(diff.changes.filter((row) => row.kind === "added").map((row) => row.heading), ["New"]);
  assert.equal(diff.changes.some((row) => row.heading === "Alpha" && row.kind === "modified"), false);
  assert.equal(diff.provider_count, 0);
  assert.equal(diff.writer_count, 0);
});

test("outline diff separates modified added removed and moved ranges without parent cascades", () => {
  const beforeText = text([
    "# Root",
    "root body",
    "## Alpha",
    "alpha body",
    "## Beta",
    "beta body",
    "## Removed",
    "removed body",
  ]);
  const afterText = text([
    "# Root",
    "root body",
    "## Beta",
    "beta body",
    "## Alpha",
    "alpha changed",
    "## Added",
    "added body",
  ]);
  const diff = diffApi.compareSourceOutlines({
    previous_outline: outline(beforeText),
    current_source: source(afterText),
  });
  const rows = Object.fromEntries(diff.changes.map((row) => [row.heading, row.kind]));

  assert.equal(rows.Root, undefined);
  assert.equal(rows.Alpha, "modified");
  assert.equal(rows.Beta, "moved");
  assert.equal(rows.Removed, "removed");
  assert.equal(rows.Added, "added");
  assert.equal(diff.summary.modified, 1);
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.removed, 1);
  assert.equal(diff.summary.moved, 1);
  assert.equal(diff.changes.find((row) => row.heading === "Removed").exact_target, false);
  assert.ok(diff.changes.find((row) => row.heading === "Removed").fallback_range_key);
});

test("citation-span impact maps refresh and rebind artifacts without touching unrelated entries", () => {
  const beforeText = text([
    "# Root",
    "root body",
    "## Alpha",
    "alpha evidence",
    "## Beta",
    "beta evidence",
  ]);
  const afterText = text([
    "# Root",
    "root body",
    "## Beta",
    "beta evidence",
    "## Alpha",
    "alpha changed evidence",
  ]);
  const prior = outline(beforeText);
  const alpha = prior.rows.find((row) => row.heading === "Alpha");
  const beta = prior.rows.find((row) => row.heading === "Beta");
  const entry = (id, range, kind = "topic_article") => ({
    artifact_id: `prodigy_artifact_${id.repeat(24).slice(0, 24)}`,
    source_id: "source_outline_test",
    source_path: "INBOX/Outline Test.md",
    source_revision: prior.source_revision,
    document_kind: kind,
    status: "current",
    navigation_manifest: {
      sections: [{
        citations: [{
          citation_id: `citation_${id}`,
          span: { start: range.start, end: range.end },
          evidence_quote: beforeText.slice(range.start, range.end),
        }],
      }],
    },
  });
  const entries = [
    entry("a", { start: alpha.start, end: alpha.end }),
    entry("b", { start: beta.start, end: beta.end }),
    entry("c", { start: 0, end: 4 }),
  ];
  const diff = diffApi.compareSourceOutlines({
    previous_outline: prior,
    current_source: source(afterText),
  });
  const affected = diffApi.assessAffectedArtifacts({ diff, entries });

  assert.deepEqual(affected.refresh_artifact_ids, [entries[0].artifact_id]);
  assert.deepEqual(affected.rebind_artifact_ids, [entries[1].artifact_id]);
  assert.deepEqual(affected.unaffected_artifact_ids, [entries[2].artifact_id]);
  assert.equal(affected.provider_count, 0);
  assert.equal(affected.writer_count, 0);
});

test("cross-parent identical section is relocated locally while deleted evidence never becomes exact", () => {
  const beforeText = text([
    "# First",
    "first body",
    "## Shared",
    "same evidence",
    "# Second",
    "second body",
  ]);
  const afterText = text([
    "# First",
    "first body",
    "# Second",
    "second body",
    "## Shared",
    "same evidence",
  ]);
  const diff = diffApi.compareSourceOutlines({
    previous_outline: outline(beforeText),
    current_source: source(afterText),
  });
  const shared = diff.changes.find((row) => row.heading === "Shared");
  assert.equal(shared.kind, "moved");
  assert.equal(shared.rebind_only, true);
  assert.equal(shared.exact_target, true);
});
