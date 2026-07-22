"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MODULE_PATH = path.join(ROOT, "SYSTEM/Views/knowledge-explorer-relations.js");
const relations = fs.existsSync(MODULE_PATH) ? require(MODULE_PATH) : {};
const knowledgeFixtures = require("./knowledge_explorer_fixtures.js");

function record(sourcePath, frontmatter, content = "", extra = {}) {
  return {
    source_path: sourcePath,
    source_mtime: extra.source_mtime || 0,
    content,
    frontmatter: { ...frontmatter },
    ...extra
  };
}

function fixture() {
  return [
    record("ZETA/Coding/Main.md", {
      type: "knowledge",
      title: "Main",
      knowledge_domain: "coding",
      knowledge_topics: ["typescript"],
      connections: ["[[PARA/People/Alice|앨리스]]", "[[PARA/Projects/App]]", "[[Missing/Ghost]]"]
    }, "Body-only link [[PARA/Should-Not-Read.md]].", {
      source_mtime: 300,
      file: { outlinks: [{ path: "PARA/People/Alice.md" }, { path: "PARA/Reading/Book.md" }] }
    }),
    record("PARA/People/Alice.md", {
      type: "people",
      title: "Alice",
      connections: ["[[ZETA/Coding/Main]]"]
    }),
    record("PARA/Projects/App.md", {
      type: "project",
      title: "App",
      knowledge_topics: ["typescript", "react"]
    }, "[[ZETA/Coding/Main]]", { file: { outlinks: ["[[ZETA/Coding/Main]]"] } }),
    record("PARA/Reading/Book.md", {
      type: "reading",
      title: "Book",
      knowledge_topics: ["typescript"]
    }, "[[ZETA/Coding/Main]]"),
    record("DAILY/DAILY/2026-07-20.md", {
      type: "daily_note",
      title: "2026-07-20"
    }),
    record("DAILY/DAILY/2026-07-19.md", {
      type: "journal",
      title: "2026-07-19"
    }, "Body-only journal mention [[ZETA/Coding/Main]].", { file: { outlinks: ["[[ZETA/Coding/Main]]"] } }),
    record("ZETA/Coding/Second.md", {
      type: "knowledge",
      title: "Second",
      knowledge_domain: "coding",
      knowledge_topics: ["react"],
      connections: ["[[PARA/Projects/App]]"]
    }, "", { source_mtime: 200 }),
    record("ZETA/Unknown.md", {
      type: "knowledge",
      title: "Unknown",
      knowledge_domain: "unknown",
      knowledge_topics: []
    }, "", { source_mtime: 100 })
  ];
}

function relationFrom(model, sourcePath, targetPath) {
  return model.relations_by_source[sourcePath].find((item) => item.target_path === targetPath);
}

// Given: the Task 7 relation module does not exist or has no projection entry point.
// When: its public surface is inspected.
// Then: a single pure projection function must be available.
assert.equal(typeof relations.projectRelations, "function");

{
  // Given: the shared frozen Knowledge Explorer fixture catalog.
  const sources = knowledgeFixtures.flattenCatalog(knowledgeFixtures.catalog);
  const before = JSON.stringify(sources);

  // When: its complete mixed record set is projected.
  const result = relations.projectRelations(sources);

  // Then: it stays immutable and its duplicate and broken cases remain usable.
  assert.equal(JSON.stringify(sources), before);
  const duplicate = result.relations_by_source["SYNTHETIC/knowledge-explorer/links/duplicate.md"];
  assert.equal(duplicate.filter((item) => item.target_path.endsWith("people/정호성.md")).length, 1);
  const broken = result.relations_by_source["SYNTHETIC/knowledge-explorer/links/broken.md"][0];
  assert.deepEqual({ clickable: broken.clickable, warning: broken.warning }, { clickable: false, warning: "broken_link" });
}

{
  // Given: duplicate aliases and conflicting connection/outlink/backlink facts.
  const sources = fixture();
  const before = JSON.stringify(sources);

  // When: relations are projected.
  const result = relations.projectRelations(sources);

  // Then: canonical target paths deduplicate to the strongest deterministic reason.
  const alice = relationFrom(result, "ZETA/Coding/Main.md", "PARA/People/Alice.md");
  assert.deepEqual(
    { reason: alice.reason, label: alice.provenance_label, category: alice.category, clickable: alice.clickable },
    { reason: "connection", label: "connections", category: "People", clickable: true }
  );
  assert.equal(result.relations_by_source["ZETA/Coding/Main.md"].filter((item) => item.target_path === alice.target_path).length, 1);
  assert.equal(JSON.stringify(sources), before, "projection must not mutate source records");
}

{
  // Given: direct links, inverse explicit links, and an unlinked Daily note.
  // When: relations are projected.
  const result = relations.projectRelations(fixture());

  // Then: categories and rank order are stable, while Journal is link-only.
  const main = result.relations_by_source["ZETA/Coding/Main.md"];
  assert.deepEqual(main.map((item) => item.reason), ["connection", "connection", "connection", "direct_outlink", "backlink"]);
  assert.deepEqual(main.map((item) => item.category), ["Other", "People", "Projects", "Reading", "Journal"]);
  assert.ok(main.some((item) => item.target_path === "DAILY/DAILY/2026-07-19.md"));
  assert.ok(!main.some((item) => item.target_path === "DAILY/DAILY/2026-07-20.md"));
  assert.ok(!main.some((item) => item.target_path === "PARA/Should-Not-Read.md"));
  assert.ok(main.every((item) => item.source_path === "ZETA/Coding/Main.md" && item.provenance_source_path));
}

{
  // Given: a missing target and malformed wikilinks.
  const sources = fixture();
  sources[0].frontmatter.connections.push("[[unterminated", "[[   ]]", 7);

  // When: relations are projected.
  const result = relations.projectRelations(sources);

  // Then: broken links are warnings and cannot be opened.
  const broken = relationFrom(result, "ZETA/Coding/Main.md", "Missing/Ghost.md");
  assert.equal(broken.clickable, false);
  assert.equal(broken.warning, "broken_link");
  assert.ok(result.warnings.some((item) => item.code === "malformed_link"));
  assert.ok(result.warnings.some((item) => item.code === "broken_link" && item.target_path === "Missing/Ghost.md"));
}

{
  // Given: two domain-local Knowledge sources and explicit related topics.
  // When: factual brief signals are derived from the explicit graph.
  const result = relations.projectRelations(fixture());
  const coding = result.signals_by_domain.coding;

  // Then: recency, link counts, repeated topics, and unclassified items remain factual.
  assert.deepEqual(coding.recent_additions.map((item) => item.source_path), ["ZETA/Coding/Main.md", "ZETA/Coding/Second.md"]);
  assert.deepEqual(coding.explicit_link_frequency[0], {
    target_path: "PARA/Projects/App.md",
    title: "App",
    mentions: 2
  });
  assert.deepEqual(coding.repeated_related_topics, [{ topic: "typescript", mentions: 2 }]);
  assert.deepEqual(result.signals_by_domain.unclassified.unclassified_items, [{
    source_path: "ZETA/Unknown.md",
    title: "Unknown",
    reason: "unclassified_domain"
  }]);
  assert.doesNotMatch(JSON.stringify(result), /\b(?:used|applied|validated)\b/i);
}

{
  // Given: a path that tries to escape the Vault and a backlink to a missing origin.
  const sources = fixture();
  sources[0].backlinks = ["[[../../../escape]]", "[[Missing/Origin]]"];

  // When: backlinks are projected.
  const result = relations.projectRelations(sources);

  // Then: unsafe targets are rejected and missing backlink origins stay non-clickable.
  assert.ok(result.warnings.some((item) => item.code === "unsafe_path"));
  const missingOrigin = relationFrom(result, "ZETA/Coding/Main.md", "Missing/Origin.md");
  assert.deepEqual(
    { reason: missingOrigin.reason, clickable: missingOrigin.clickable, provenance: missingOrigin.provenance_source_path },
    { reason: "backlink", clickable: false, provenance: "Missing/Origin.md" }
  );
}

{
  // Given: one explicitly linked target for every supported display category.
  const targets = [
    ["ZETA/K.md", "knowledge", "Knowledge"],
    ["ZETA/R.md", "literature_note", "Resources"],
    ["PARA/P.md", "people", "People"],
    ["PARA/X.md", "project", "Projects"],
    ["DAILY/DAILY/J.md", "journal", "Journal"],
    ["PARA/Reading/B.md", "reading", "Reading"],
    ["MISC/O.md", "unknown", "Other"]
  ];
  const source = record("ZETA/Source.md", {
    type: "knowledge",
    title: "Source",
    knowledge_domain: "coding",
    connections: targets.map(([target]) => `[[${target}]]`)
  });

  // When: the explicit connections are categorized.
  const result = relations.projectRelations([
    source,
    ...targets.map(([target, type]) => record(target, { type, title: target }))
  ]);

  // Then: every target is assigned to exactly the documented category.
  assert.deepEqual(
    result.relations_by_source["ZETA/Source.md"].map((item) => [item.target_path, item.category]),
    targets.map(([target, , category]) => [target, category]).sort((left, right) => left[0].localeCompare(right[0], "en"))
  );
}

{
  // Given: an Evidence body containing a link but no explicit file-link metadata.
  const evidence = record("PARA/Evidence/E.md", { type: "evidence", title: "E" }, "[[ZETA/K.md]]");
  const knowledge = record("ZETA/K.md", { type: "knowledge", title: "K", knowledge_domain: "coding" });

  // When: relations are projected without parsing Evidence prose.
  const result = relations.projectRelations([evidence, knowledge]);

  // Then: the body-only Evidence mention creates no relation or backlink.
  assert.deepEqual(result.relations_by_source["PARA/Evidence/E.md"], []);
  assert.deepEqual(result.relations_by_source["ZETA/K.md"], []);
}

console.log("Knowledge Explorer relation tests passed");
