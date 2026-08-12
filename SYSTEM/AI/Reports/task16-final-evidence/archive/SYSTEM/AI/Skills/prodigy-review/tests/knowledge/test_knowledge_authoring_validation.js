"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const validation = require(path.join(ROOT, "SYSTEM/Views/knowledge-authoring-validation.js"));

function testExtractedValidationExportsProtectAuthoringBoundary() {
  // Given: data that must remain safe before authoring orchestration can consume it.
  const title = "검증 가능한 자료";
  const validLink = "[[ZETA/LITERATURE/검증 가능한 자료]]";

  // When: the extracted pure validation API normalizes each boundary value.
  const safeTitle = validation.safeTitle(title, "source_title");
  const sourceUrl = validation.url("https://example.com/knowledge", "source_url");
  const literatureLink = validation.canonicalLiteratureLink(validLink, "source_objects");

  // Then: canonical values survive and malformed path, link, and URL inputs cannot bypass the guard.
  assert.equal(safeTitle, title);
  assert.equal(sourceUrl, "https://example.com/knowledge");
  assert.equal(literatureLink, validLink);
  assert.throws(() => validation.safeTitle("[[ZETA/LITERATURE/injected]]", "source_title"), /safe title text/);
  assert.throws(() => validation.canonicalLiteratureLink("[[ZETA/LITERATURE/../escape]]"), /학습 자료 출처를 하나만 선택/);
  assert.throws(() => validation.url("<file-uri>/private/source"), /유효하지 않은 출처 URL/);
}

function main() {
  testExtractedValidationExportsProtectAuthoringBoundary();
  console.log("Knowledge authoring validation tests passed");
}

main();
