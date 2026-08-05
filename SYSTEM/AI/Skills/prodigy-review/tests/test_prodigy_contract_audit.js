#!/usr/bin/env node
"use strict";

// Contract audit tests.
// Synthetic fixtures use independent expected values (never re-reading audit constants).
// The live repository assertion is intentionally strict: it stays red until the known
// Task 3 (docs sibling links) and Task 6 (Region workspaceId) defects are fixed.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const AUDIT_SCRIPT = path.join(VAULT_ROOT, "SYSTEM/SCRIPTS/prodigy-contract-audit.js");
const SYNTHETIC_ONLY = process.argv.includes("--synthetic-only");
const CONSTITUTION_PATH = "SYSTEM/docs/00_Constitution.md";
const CONSTITUTION_BASELINE_COMMIT = "b4db0df98e003589efa6ef4e0a2ec57545713eb8";
const APPROVED_ARTICLE_8_ANNOTATION = "> **용어:** 현재 UI 구현에서 Homepage는 Home과 동의어로 사용됨.";

const audit = require(AUDIT_SCRIPT);
const createdFixtures = [];

function makeFixtureRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-contract-audit-" + label + "-"));
  createdFixtures.push(root);
  return root;
}

function writeFixtureFile(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function fixtureMap(regionTemplateRow) {
  return [
    "# Fixture Contract Map",
    "",
    "## 계약 우선순위",
    "",
    "1. Constitution — `SYSTEM/docs/00_Constitution.md`",
    "2. Schema — `SYSTEM/Prodigy/Schema/`",
    "3. Template — `SYSTEM/TEMPLATE/FORMAT/`",
    "4. Hub — `HUB/`",
    "5. View — `SYSTEM/Views/`",
    "6. Test — `SYSTEM/AI/Skills/prodigy-review/tests/`",
    "",
    "## 표면 소유 경로 맵",
    "",
    "| Surface | WorkspaceId | Schema | Template | Hub | View | Test |",
    "|---|---|---|---|---|---|---|",
    "| Auction | auction | `SYSTEM/Prodigy/Schema/Auction_Case_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_auction_case.md` | `HUB/10 Auction.md` | `SYSTEM/Views/auction-card.js` | `SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_day.js` |",
    regionTemplateRow,
    ""
  ].join("\n");
}

const REGION_ROW_OK = "| Region | region | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_auction_region.md` | `HUB/15 Region.md` | `SYSTEM/Views/region-explorer-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/auction/test_region_explorer_view.js` |";

function fixtureContractHierarchyAdr(decisionItems) {
  return ["# Fixture ADR", "", "## Decision", ""].concat(decisionItems, ["", "## Consequences", "", "없음", ""]).join("\n");
}

const ADR_CANONICAL_ROOT_ITEM = [
  "4. **Root `DESIGN.md`**는 UI 구현의 canonical contract이다.",
  "   - 모든 View는 이를 따른다."
].join("\n");

const ADR_COMPATIBILITY_ITEM = [
  "5. **`SYSTEM/docs/DESIGN.md`**는 별도 역할을 한다:",
  "   - Root `DESIGN.md`와의 호환성 설명 제공",
  "   - UI contract 자체를 정의하지 않음"
].join("\n");

function buildBaseFixture(label, options) {
  const opts = options || {};
  const root = makeFixtureRoot(label);

  writeFixtureFile(root, "SYSTEM/docs/13_Contract_Map.md", fixtureMap(REGION_ROW_OK));
  writeFixtureFile(root, "SYSTEM/docs/00_Constitution.md", "# Fixture Constitution\n");
  writeFixtureFile(root, "DESIGN.md", "# Fixture Root UI Contract\n");
  writeFixtureFile(root, "SYSTEM/docs/DESIGN.md", "# Fixture Token Registry\n");
  writeFixtureFile(
    root,
    "SYSTEM/docs/ADR/ADR-007-contract-source-hierarchy.md",
    fixtureContractHierarchyAdr(
      opts.adrDecisionItems || [ADR_CANONICAL_ROOT_ITEM, ADR_COMPATIBILITY_ITEM]
    )
  );
  writeFixtureFile(
    root,
    "SYSTEM/docs/01_Architecture.md",
    "# Fixture Architecture\n\n> 상세 원칙: [00_Constitution.md](" + (opts.architectureLink || "00_Constitution.md") + ")\n"
  );
  writeFixtureFile(
    root,
    "SYSTEM/Prodigy/Schema/Auction_Case_Schema.md",
    "# Auction Case Schema\n\n```yaml\ntype: auction_case\n```\n"
  );
  writeFixtureFile(
    root,
    "SYSTEM/Prodigy/Schema/Core_Property_Schema.md",
    "# Core Property Schema\n\n허용값: `auction_case` · `auction_region`\n"
  );
  writeFixtureFile(root, "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md", "---\ntype: auction_case\n---\n");
  if (!opts.omitRegionTemplate) {
    writeFixtureFile(root, "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md", "---\ntype: auction_region\n---\n");
  }
  writeFixtureFile(
    root,
    "HUB/10 Auction.md",
    "# Auction\n\n```js\nwindow.ProdigyWorkspaceNavigation.mount(container, { app, workspaceId: \"auction\", title: \"경매\" });\n```\n"
  );
  writeFixtureFile(
    root,
    "HUB/15 Region.md",
    "# Region\n\n```js\nwindow.ProdigyWorkspaceNavigation.mount(container, {\n  app,\n  workspaceId: \"" +
      (opts.regionHubWorkspaceId || "region") +
      "\",\n  title: \"지역\"\n});\n```\n"
  );
  writeFixtureFile(
    root,
    "SYSTEM/Views/workspace-registry.js",
    [
      "(function (root) {",
      "  \"use strict\";",
      "  var ITEMS = [",
      "    { id: \"auction\", label: \"경매\", path: \"HUB/10 Auction.md\" },",
      "    { id: \"region\", label: \"지역\", path: \"HUB/15 Region.md\" }",
      "  ];",
      "  root.ProdigyWorkspaceRegistry = { items: function () { return ITEMS.slice(); } };",
      "})(globalThis);",
      ""
    ].join("\n")
  );
  writeFixtureFile(root, "SYSTEM/Views/auction-card.js", "\"use strict\";\n");
  writeFixtureFile(root, "SYSTEM/Views/region-explorer-view.js", "\"use strict\";\n");
  writeFixtureFile(root, "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_day.js", "\"use strict\";\n");
  writeFixtureFile(root, "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_region_explorer_view.js", "\"use strict\";\n");
  return root;
}

function codesOf(result) {
  return result.errors.map((error) => error.code).sort();
}

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [AUDIT_SCRIPT].concat(args), { encoding: "utf8" });
    return { exitCode: 0, stdout };
  } catch (error) {
    return { exitCode: error.status, stdout: error.stdout || "" };
  }
}

// GIVEN a synthetic clean fixture whose every mapped path exists, links resolve
// sibling-relative, templates match their schema, and hub ids match the registry
// WHEN the audit runs over that fixture root
// THEN it reports pass with zero errors and exit code 0 through the CLI boundary
(function givenCleanFixture() {
  const root = buildBaseFixture("clean", {});
  const result = audit.auditRepository({ root });

  assert.equal(result.status, "pass", "clean fixture must pass: " + JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  assert.equal(result.surfaces.length, 2);
  assert.deepEqual(result.surfaces.map((surface) => surface.surface), ["Auction", "Region"]);
  assert.deepEqual(audit.LEGACY_ALIAS_ALLOWLIST, []);
  assert.deepEqual(result.uiContract.canonicalTargets, ["DESIGN.md"]);
  assert.deepEqual(result.uiContract.compatibilityTargets, ["SYSTEM/docs/DESIGN.md"]);

  const cli = runCli(["--root", root, "--format", "json"]);
  assert.equal(cli.exitCode, 0);
  const parsed = JSON.parse(cli.stdout);
  assert.equal(parsed.status, "pass");
  assert.equal(parsed.errorCount, 0);
  assert.deepEqual(parsed.uiContract.canonicalTargets, ["DESIGN.md"]);
  console.log("PASS synthetic clean fixture");
})();

// GIVEN a fixture whose contract hierarchy ADR declares two canonical UI-contract targets
// WHEN the audit runs
// THEN the exact-one canonical rule fails machine-readably on canonical_ui_contract_mismatch
(function givenTwoCanonicalUiTargets() {
  const root = buildBaseFixture("two-canonical", {
    adrDecisionItems: [
      ADR_CANONICAL_ROOT_ITEM,
      "5. **`SYSTEM/docs/DESIGN.md`**도 UI 구현의 canonical contract이다."
    ]
  });
  const result = audit.auditRepository({ root });

  assert.equal(result.status, "fail");
  assert.deepEqual(codesOf(result), ["canonical_ui_contract_mismatch", "canonical_ui_contract_mismatch"]);
  const exactlyOne = result.errors.find((error) => /exactly one canonical/.test(error.message));
  assert.deepEqual(exactlyOne.actual, ["DESIGN.md", "SYSTEM/docs/DESIGN.md"]);
  assert.equal(exactlyOne.expected, "DESIGN.md");
  const compatibility = result.errors.find((error) => error.path === "SYSTEM/docs/DESIGN.md");
  assert.equal(compatibility.actual, "canonical");
  assert.equal(compatibility.expected, "compatibility-only");
  console.log("PASS synthetic two canonical UI-contract targets");
})();

// GIVEN a fixture whose ADR declares no canonical UI-contract target
// WHEN the audit runs
// THEN the missing canonical target is reported with the same stable code
(function givenMissingCanonicalUiTarget() {
  const root = buildBaseFixture("no-canonical", { adrDecisionItems: [ADR_COMPATIBILITY_ITEM] });
  const result = audit.auditRepository({ root });

  assert.equal(result.status, "fail");
  assert.deepEqual(codesOf(result), ["canonical_ui_contract_mismatch"]);
  assert.deepEqual(result.errors[0].actual, []);
  assert.equal(result.errors[0].path, "SYSTEM/docs/ADR/ADR-007-contract-source-hierarchy.md");

  const unreadableRoot = buildBaseFixture("no-adr", {});
  fs.rmSync(path.join(unreadableRoot, "SYSTEM/docs/ADR/ADR-007-contract-source-hierarchy.md"));
  const unreadable = audit.auditRepository({ root: unreadableRoot });
  assert.equal(unreadable.status, "fail");
  assert.deepEqual(codesOf(unreadable), ["canonical_ui_contract_mismatch"]);
  assert.equal(unreadable.uiContract, null);
  console.log("PASS synthetic missing canonical UI-contract target");
})();

// GIVEN a synthetic bad fixture with exactly three planted defects:
//   a missing Region Template file, a broken sibling link `docs/00_Constitution.md`
//   inside SYSTEM/docs/01_Architecture.md, and HUB/15 Region.md mounting workspaceId "auction"
// WHEN the audit runs over that fixture root
// THEN the three defects surface as three distinct error codes with exact offending paths
(function givenBadFixture() {
  const root = buildBaseFixture("bad", {
    omitRegionTemplate: true,
    architectureLink: "docs/00_Constitution.md",
    regionHubWorkspaceId: "auction"
  });
  const result = audit.auditRepository({ root });

  assert.equal(result.status, "fail");
  assert.deepEqual(codesOf(result), ["broken_internal_link", "missing_mapped_path", "workspace_id_mismatch"]);

  const missing = result.errors.find((error) => error.code === "missing_mapped_path");
  assert.equal(missing.path, "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md");
  assert.equal(missing.surface, "Region");
  assert.equal(missing.layer, "Template");

  const broken = result.errors.find((error) => error.code === "broken_internal_link");
  assert.equal(broken.path, "SYSTEM/docs/01_Architecture.md");
  assert.equal(broken.link, "docs/00_Constitution.md");
  assert.equal(broken.resolved, "SYSTEM/docs/docs/00_Constitution.md");
  assert.equal(broken.line, 3);

  const mismatch = result.errors.find((error) => error.code === "workspace_id_mismatch");
  assert.equal(mismatch.path, "HUB/15 Region.md");
  assert.equal(mismatch.expected, "region");
  assert.equal(mismatch.actual, "auction");

  const cli = runCli(["--root", root, "--format", "json"]);
  assert.equal(cli.exitCode, 1);
  const parsed = JSON.parse(cli.stdout);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.errorCount, 3);
  assert.deepEqual(parsed.errors.map((error) => error.code).sort(), [
    "broken_internal_link",
    "missing_mapped_path",
    "workspace_id_mismatch"
  ]);
  console.log("PASS synthetic bad fixture (3 distinct error codes)");
})();

// GIVEN a synthetic fixture whose Template type is absent from its paired Schema
// WHEN the audit runs
// THEN the schema-to-template link failure is reported on its own code
(function givenSchemaTemplateBreak() {
  const root = buildBaseFixture("schema-link", {});
  writeFixtureFile(root, "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md", "---\ntype: renamed_case\n---\n");
  const result = audit.auditRepository({ root });

  assert.equal(result.status, "fail");
  assert.deepEqual(codesOf(result), ["schema_template_link_missing"]);
  const error = result.errors[0];
  assert.equal(error.path, "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md");
  assert.equal(error.type, "renamed_case");
  assert.equal(error.schema, "SYSTEM/Prodigy/Schema/Auction_Case_Schema.md");
  console.log("PASS synthetic schema-template link break");
})();

// GIVEN malformed and absent contract map inputs
// WHEN the audit parses them
// THEN it fails loudly with a machine-readable parse error instead of silent success
(function givenMalformedMap() {
  const missingRoot = makeFixtureRoot("nomap");
  const missingResult = audit.auditRepository({ root: missingRoot });
  assert.equal(missingResult.status, "fail");
  assert.deepEqual(codesOf(missingResult), ["contract_map_unreadable"]);

  const malformedRoot = buildBaseFixture("malformed", {});
  writeFixtureFile(malformedRoot, "SYSTEM/docs/13_Contract_Map.md", "# Broken map\n\nno table here\n");
  const malformedResult = audit.auditRepository({ root: malformedRoot });
  assert.equal(malformedResult.status, "fail");
  assert.deepEqual(codesOf(malformedResult), ["contract_map_parse_error"]);

  const truncatedRoot = buildBaseFixture("truncated", {});
  writeFixtureFile(
    truncatedRoot,
    "SYSTEM/docs/13_Contract_Map.md",
    fixtureMap("| Region | region | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` |")
  );
  const truncatedResult = audit.auditRepository({ root: truncatedRoot });
  assert.equal(truncatedResult.status, "fail");
  assert.deepEqual(codesOf(truncatedResult), ["contract_map_parse_error"]);

  const cli = runCli(["--root", malformedRoot, "--format", "json"]);
  assert.equal(cli.exitCode, 1);
  assert.equal(JSON.parse(cli.stdout).status, "fail");
  console.log("PASS malformed / missing contract map handling");
})();

function readArticleSection(text, articleNumber) {
  const lines = text.split("\n");
  const startIndex = lines.findIndex((line) => new RegExp("^#\\s+Article " + articleNumber + "\\s+—").test(line));
  assert.notEqual(startIndex, -1, "Article " + articleNumber + " heading not found");
  const collected = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    if (index > startIndex && /^#\s+Article\s+\d+\s+—/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected;
}

function normalizeSection(sectionLines) {
  return sectionLines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "" && line !== "---")
    .join("\n");
}

function baselineConstitution() {
  return execFileSync("git", ["show", CONSTITUTION_BASELINE_COMMIT + ":" + CONSTITUTION_PATH], {
    cwd: VAULT_ROOT,
    encoding: "utf8"
  });
}

// GIVEN the protected Constitution articles at the approved baseline commit
// WHEN the current working-tree Constitution is normalized and compared per article
// THEN only the one approved Article 8 Homepage/Home terminology annotation may differ
function assertProtectedArticlesStable() {
  const baselineText = baselineConstitution();
  const currentText = fs.readFileSync(path.join(VAULT_ROOT, CONSTITUTION_PATH), "utf8");

  [3, 8, 9, 14].forEach((articleNumber) => {
    const baseline = normalizeSection(readArticleSection(baselineText, articleNumber));
    const currentLines = readArticleSection(currentText, articleNumber);
    const annotationCount = currentLines.filter((line) => line.trim() === APPROVED_ARTICLE_8_ANNOTATION).length;
    const current = normalizeSection(
      currentLines.filter((line) => line.trim() !== APPROVED_ARTICLE_8_ANNOTATION)
    );

    assert.equal(
      current,
      baseline,
      "Article " + articleNumber + " changed beyond the approved terminology annotation"
    );
    assert.equal(
      annotationCount,
      articleNumber === 8 ? 1 : 0,
      "unexpected terminology annotation count in Article " + articleNumber
    );
  });

  const article3 = normalizeSection(readArticleSection(currentText, 3));
  assert.ok(
    article3.indexOf("`physical iPhone` 실기기에서 사용자가 직접 확인한 경우에만 `user-evidence-only gate`를 통과한다") !== -1,
    "Article 3 physical-device evidence wording is missing"
  );
  const article8 = normalizeSection(readArticleSection(currentText, 8));
  assert.ok(
    article8.indexOf("통계, 그래프, ROI 등 분석 정보는 Homepage에서 보여주지 않는다") !== -1,
    "Article 8 Home analytics prohibition is missing"
  );
  console.log("PASS protected Constitution articles stable vs baseline (3, 8, 9, 14)");
}

function cleanupFixtures() {
  createdFixtures.forEach((root) => {
    assert.ok(root.startsWith(os.tmpdir()), "refusing to remove non-temp fixture: " + root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  console.log("CLEANUP removed " + createdFixtures.length + " temp fixture root(s)");
}

try {
  if (SYNTHETIC_ONLY) {
    console.log("Contract audit synthetic tests passed");
  } else {
    // GIVEN the live repository
    // WHEN the audit runs over the real vault root
    // THEN it must be clean. This stays red until Task 3 and Task 6 land their fixes.
    const live = audit.auditRepository({ root: VAULT_ROOT });
    assert.equal(
      live.status,
      "pass",
      "live contract audit failed:\n" + JSON.stringify(live.errors, null, 2)
    );
    assert.deepEqual(live.uiContract.canonicalTargets, [audit.CANONICAL_UI_CONTRACT_PATH]);
    assert.deepEqual(live.uiContract.compatibilityTargets, [audit.COMPATIBILITY_UI_CONTRACT_PATH]);
    assertProtectedArticlesStable();
    console.log("Contract audit tests passed (synthetic + live)");
  }
} finally {
  cleanupFixtures();
}
