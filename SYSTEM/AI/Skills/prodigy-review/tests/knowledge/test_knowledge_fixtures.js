"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const fixtures = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/knowledge_explorer_fixtures.js"));
const fakes = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/knowledge_explorer_view_fakes.js"));

function assertSyntheticPathsOnly(catalog) {
  for (const record of fixtures.flattenCatalog(catalog)) {
    if (!record || typeof record !== "object") continue;
    if (record.source_path) {
      assert.match(record.source_path, /^SYNTHETIC\/knowledge-explorer\//);
      assert.equal(record.source_path.includes("/Users/"), false);
      assert.equal(record.source_path.includes("PARA/"), false);
      assert.equal(record.source_path.includes("DAILY/"), false);
    }
    if (record.content) {
      assert.equal(record.content.includes("/Users/"), false);
      assert.equal(record.content.includes("PARA/"), false);
      assert.equal(record.content.includes("DAILY/"), false);
    }
  }
}

function assertCatalogCoverage(catalog) {
  fixtures.assertKnowledgeFixtureCoverage(catalog);
  assert.ok(catalog.validatedKnowledge.some((item) => item.content.includes("검증된 지식")));
  assert.ok(catalog.legacyPermanentNotes.some((item) => item.content.includes("레거시 호환용 노트")));
  assert.ok(catalog.literatureResources.some((item) => item.type === "literature_note"));
  assert.ok(catalog.venues.some((item) => item.type === "venue"));
  assert.ok(catalog.auctionRegions.some((item) => item.type === "auction_region"));
  assert.ok(catalog.people.some((item) => item.type === "people"));
  assert.ok(catalog.projects.some((item) => item.type === "project"));
  assert.ok(catalog.journals.some((item) => item.type === "journal"));
  assert.ok(catalog.dailyNotes.some((item) => item.type === "daily_note"));
  assert.ok(catalog.malformed.some((item) => !/type:\s*/.test(item.content) || item.content.includes("unknown-domain")));
  assert.ok(catalog.brokenLinks.some((item) => item.content.includes("missing/nowhere")));
  assert.ok(catalog.duplicateLinks.some((item) => item.content.split("정호성").length > 2));
  assert.ok(catalog.emptyDomains.some((item) => item.content.includes("projection-only fallback case")));
  assert.ok(catalog.longKoreanLabels.some((item) => item.content.includes("아주 길고 길고 길고 길고 길고 길고 긴 한국어 제목")));
  assert.ok(catalog.unbrokenUrls.some((item) => item.content.includes("https://example.com/this/is/a/really/long/unbroken/url")));
  assert.ok(catalog.providerSuccess.some((item) => item.ok === true));
  assert.ok(catalog.providerFailure.some((item) => item.ok === false));
  assert.equal(catalog.containers.find((item) => item.id === "desktop").width > catalog.containers.find((item) => item.id === "narrow").width, true);
}

function assertCompletenessNegativeProbe(catalog, key) {
  const clone = fixtures.cloneCatalog(catalog);
  clone[key] = [];
  assert.throws(() => fixtures.assertKnowledgeFixtureCoverage(clone), new RegExp(`Missing required knowledge fixture case: ${key}`));
}

function assertHarnessStates() {
  const harness = fakes.createKnowledgeExplorerHarness({ container: "desktop" });
  assert.equal(harness.writes().length, 0);
  for (const state of ["rest", "focus", "selected", "loading", "empty", "error"]) {
    const render = harness.renderState(state, {
      focus: state === "focus" ? "domain-nav" : null,
      selected: state === "selected" ? "knowledge/validated-knowledge" : null,
      loading: state === "loading",
      empty: state === "empty",
      error: state === "error" ? "provider failed" : null
    });
    assert.equal(render.attr["data-mode"], state);
    assert.equal(harness.writes().length, 0);
    assert.equal(harness.collectText().length > 0, true);
    harness.reset();
    assert.equal(harness.state.mode, "rest");
    assert.equal(harness.state.focus, null);
    assert.equal(harness.state.selected, null);
    assert.equal(harness.state.loading, false);
    assert.equal(harness.state.empty, false);
    assert.equal(harness.state.error, null);
    assert.equal(harness.writes().length, 0);
  }
  const narrow = fakes.createKnowledgeExplorerHarness({ container: "narrow" });
  narrow.renderState("selected", { selected: "knowledge/long-korean-label" });
  assert.match(narrow.collectText(), /narrow/);
  assert.equal(narrow.writes().length, 0);
}

function main() {
  assertCatalogCoverage(fixtures.catalog);
  assertSyntheticPathsOnly(fixtures.catalog);
  assertHarnessStates();
  for (const key of [
    "malformed",
    "duplicateLinks",
    "emptyDomains",
    "longKoreanLabels",
    "providerFailure"
  ]) {
    assertCompletenessNegativeProbe(fixtures.catalog, key);
  }
  console.log("Knowledge fixture tests passed");
}

main();
