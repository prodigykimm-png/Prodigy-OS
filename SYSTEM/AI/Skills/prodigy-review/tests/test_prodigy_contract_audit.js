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

function buildBaseFixture(label, options) {
  const opts = options || {};
  const root = makeFixtureRoot(label);

  writeFixtureFile(root, "SYSTEM/docs/13_Contract_Map.md", fixtureMap(REGION_ROW_OK));
  writeFixtureFile(root, "SYSTEM/docs/00_Constitution.md", "# Fixture Constitution\n");
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

  const cli = runCli(["--root", root, "--format", "json"]);
  assert.equal(cli.exitCode, 0);
  const parsed = JSON.parse(cli.stdout);
  assert.equal(parsed.status, "pass");
  assert.equal(parsed.errorCount, 0);
  console.log("PASS synthetic clean fixture");
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
    console.log("Contract audit tests passed (synthetic + live)");
  }
} finally {
  cleanupFixtures();
}
