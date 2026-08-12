#!/usr/bin/env node
"use strict";

// Contract audit tests.
// Synthetic fixtures use independent expected values for repository contracts.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const AUDIT_SCRIPT = path.join(VAULT_ROOT, "SYSTEM/SCRIPTS/prodigy-contract-audit.js");
const SYNTHETIC_ONLY = process.argv.includes("--synthetic-only");
const CONSTITUTION_PATH = "SYSTEM/docs/00_Constitution.md";
const BASELINE_MANIFEST_PATH = "SYSTEM/SCRIPTS/prodigy-contract-baseline.json";
const FIXTURE_EXCEPTION = "> fixture terminology exception";
const FIXTURE_ARTICLES = {
  3: ["# Article 3 — Fixture", "Article three body.", "required article three sentinel."],
  8: ["# Article 8 — Fixture", "Article eight body.", FIXTURE_EXCEPTION, "Article eight continuation.", "required article eight sentinel."],
  9: ["# Article 9 — Fixture", "Article nine body."],
  14: ["# Article 14 — Fixture", "Article fourteen body."]
};

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

function fixtureConstitution(overrides) {
  const changed = overrides || {};
  return [3, 8, 9, 14]
    .map((article) => (changed[article] || FIXTURE_ARTICLES[article]).join("\n"))
    .join("\n\n---\n\n") + "\n";
}

function fixtureManifest(constitutionText, overrides) {
  const opts = overrides || {};
  const articles = [3, 8, 9, 14].map((article) => {
    const lines = audit.protectedArticleLines(constitutionText, article);
    const normalizedText = audit.normalizeProtectedText(
      lines.filter((line) => !(article === 8 && audit.normalizeProtectedText([line]) === FIXTURE_EXCEPTION))
    );
    return { article, normalizedText, sha256: audit.sha256(normalizedText) };
  });
  return Object.assign({
    schemaVersion: 1,
    documentPath: CONSTITUTION_PATH,
    normalizationVersion: 1,
    articles,
    requiredFragments: [
      { article: 3, text: "required article three sentinel." },
      { article: 8, text: "required article eight sentinel." }
    ],
    exceptionPolicy: {
      article: 8,
      exactText: FIXTURE_EXCEPTION,
      occurrences: 1,
      afterNormalizedLine: "Article eight body.",
      beforeNormalizedLine: "Article eight continuation."
    }
  }, opts);
}

function writeFixtureManifest(root, constitutionText, overrides) {
  writeFixtureFile(root, BASELINE_MANIFEST_PATH, JSON.stringify(fixtureManifest(constitutionText, overrides), null, 2) + "\n");
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
  const constitutionText = opts.constitutionText || fixtureConstitution();
  writeFixtureFile(root, CONSTITUTION_PATH, constitutionText);
  if (!opts.omitBaselineManifest) writeFixtureManifest(root, constitutionText, opts.manifestOverrides);
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
    "# Region\n\n```js\nwindow.__prodigyMeasurementEntry = { workspaceId: \"region\" };\nwindow.ProdigyWorkspaceNavigation.mount(container, {\n  app,\n  workspaceId: \"" +
      (opts.regionHubWorkspaceId || "region") +
      "\",\n  context: { label: \"balanced ) string\", action: () => nestedCall() },\n  title: \"지역\"\n});\n```\n"
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

  assert.equal(fs.existsSync(path.join(root, ".git")), false, "clean fixture must not depend on Git metadata");
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

// Workspace mount validation must inspect the balanced navigation call itself, preserve
// duplicate records, and require the contract map and registry to identify the same route.
(function givenWorkspaceMountFailures() {
  const regionPath = "HUB/15 Region.md";
  const prefix = [
    "# Region",
    "",
    'The string `ProdigyWorkspaceNavigation.mount(fake, { workspaceId: "auction" })` is prose.',
    "",
    "```text",
    'ProdigyWorkspaceNavigation.mount(fake, { workspaceId: "auction" });',
    "```",
    "",
    "```js",
    'window.__prodigyMeasurementEntry = { workspaceId: "region" };',
    'const mountExample = \'ProdigyWorkspaceNavigation.mount(fake, { workspaceId: "auction" })\';'
  ].join("\n") + "\n";
  const suffix = "\n```\n";
  const mount = (idExpression) => [
    "window.ProdigyWorkspaceNavigation.mount(container, {",
    "  app,",
    "  workspaceId: " + idExpression + ",",
    '  context: { label: "a ) in a string", action: () => nestedCall() },',
    '  title: "지역"',
    "});"
  ].join("\n");
  const cases = [
    { label: "region-as-auction", source: prefix + mount('"auction"') + suffix, actual: "auction" },
    { label: "duplicate-same", source: prefix + mount('"region"') + "\n" + mount('"region"') + suffix, actual: ["region", "region"] },
    { label: "duplicate-different", source: prefix + mount('"region"') + "\n" + mount('"auction"') + suffix, actual: ["region", "auction"] },
    { label: "missing", source: prefix + "void 0;" + suffix, actual: [] },
    { label: "missing-id", source: prefix + "window.ProdigyWorkspaceNavigation.mount(container, { app });" + suffix, actual: null },
    { label: "empty-id", source: prefix + mount('""') + suffix, actual: "" },
    { label: "malformed-id", source: prefix + mount('"Region!"') + suffix, actual: "Region!" },
    { label: "dynamic-id", source: prefix + mount('"reg" + "ion"') + suffix, actual: null },
    { label: "unknown-route", source: prefix + mount('"unknown"') + suffix, actual: "unknown" },
  ];
  cases.forEach((testCase) => {
    const root = buildBaseFixture("workspace-" + testCase.label, {});
    writeFixtureFile(root, regionPath, testCase.source);
    const result = audit.auditRepository({ root });
    assert.deepEqual(codesOf(result), ["workspace_id_mismatch"], testCase.label);
    assert.deepEqual(result.errors[0].actual, testCase.actual, testCase.label);
  });

  const callWithOptions = (options) => "window.ProdigyWorkspaceNavigation.mount(container, " + options + ");";
  const semanticOverrideCases = [
    ["duplicate-bare", '{ workspaceId: "region", workspaceId: "auction" }'],
    ["duplicate-quoted", '{ workspaceId: "region", "workspaceId": "auction" }'],
    ["duplicate-computed", '{ workspaceId: "region", ["workspaceId"]: "auction" }'],
    ["computed-only", '{ ["workspaceId"]: "region" }'],
    ["escaped-quoted-duplicate", '{ workspaceId: "region", "workspace\\u0049d": "auction" }'],
    ["dynamic-computed", '{ workspaceId: "region", [identityKey]: "auction" }'],
    ["spread-before", '{ ...defaults, workspaceId: "region" }'],
    ["spread-after", '{ workspaceId: "region", ...overrides }'],
    ["logical-and", 'enabled && { workspaceId: "region" }'],
    ["logical-or", '{ workspaceId: "region" } || { workspaceId: "auction" }'],
    ["conditional", 'enabled ? { workspaceId: "region" } : { workspaceId: "auction" }'],
    ["getter", '{ get workspaceId() { return "auction"; }, workspaceId: "region" }'],
    ["method", '{ workspaceId() { return "auction"; }, workspaceId: "region" }'],
    ["escaped-bare-key", '{ worksp\\u0061ceId: "auction", workspaceId: "region" }'],
  ];
  semanticOverrideCases.forEach(([label, options]) => {
    const root = buildBaseFixture("workspace-semantic-" + label, {});
    writeFixtureFile(root, regionPath, prefix + callWithOptions(options) + suffix);
    const result = audit.auditRepository({ root });
    assert.deepEqual(codesOf(result), ["workspace_id_mismatch"], label);
    assert.equal(result.errors[0].reason, "mount_workspace_id_unreadable", label);
    assert.equal(result.errors[0].actual, null, label);
  });

  const malformedEscapes = [
    ["short-hex", '{ workspaceId: "\\x7" }'],
    ["short-unicode", '{ workspaceId: "\\u072" }'],
    ["empty-code-point", '{ workspaceId: "\\u{}region" }'],
    ["large-code-point", '{ workspaceId: "\\u{110000}region" }'],
    ["legacy-octal", '{ workspaceId: "\\162egion" }'],
    ["legacy-eight", '{ workspaceId: "\\8region" }'],
    ["legacy-nine", '{ workspaceId: "\\9region" }'],
  ];
  malformedEscapes.forEach(([label, options]) => {
    const root = buildBaseFixture("workspace-escape-" + label, {});
    writeFixtureFile(root, regionPath, prefix + callWithOptions(options) + suffix);
    const result = audit.auditRepository({ root });
    assert.deepEqual(codesOf(result), ["workspace_id_mismatch"], label);
    assert.equal(result.errors[0].actual, null, label);
  });

  const lineContinuedRegion = '{ workspaceId: "re' + "\\" + "\n" + 'gion" }';
  [
    '{ "workspaceId": "region" }',
    '{ workspaceId: "\\x72egion" }',
    '{ workspaceId: "\\u0072egion" }',
    '{ workspaceId: "\\u{72}egion" }',
    '{ workspaceId: "r\\egion" }',
    "{ 'workspaceId': '\\x72\\u0065\\u{67}ion' }",
    lineContinuedRegion,
  ].forEach((options, index) => {
    const root = buildBaseFixture("workspace-valid-escaped-" + index, {});
    writeFixtureFile(root, regionPath, prefix + callWithOptions(options) + suffix);
    const result = audit.auditRepository({ root });
    assert.equal(result.status, "pass", options + ": " + JSON.stringify(result.errors));
  });

  const decodedMismatchRoot = buildBaseFixture("workspace-decoded-mismatch", {});
  writeFixtureFile(decodedMismatchRoot, regionPath, prefix + callWithOptions('{ workspaceId: "\\x61uction" }') + suffix);
  const decodedMismatch = audit.auditRepository({ root: decodedMismatchRoot });
  assert.deepEqual(codesOf(decodedMismatch), ["workspace_id_mismatch"]);
  assert.equal(decodedMismatch.errors[0].actual, "auction");

  const registryRoot = buildBaseFixture("workspace-registry-map-disagreement", {});
  const registryPath = path.join(registryRoot, "SYSTEM/Views/workspace-registry.js");
  const registrySource = fs.readFileSync(registryPath, "utf8").replace(
    '{ id: "region", label: "지역", path: "HUB/15 Region.md" }',
    '{ id: "region", label: "지역", path: "HUB/10 Auction.md" }'
  );
  fs.writeFileSync(registryPath, registrySource, "utf8");
  const disagreement = audit.auditRepository({ root: registryRoot });
  assert.ok(codesOf(disagreement).includes("workspace_id_mismatch"));
  assert.equal(disagreement.errors.find((error) => error.surface === "Region").actual, "HUB/10 Auction.md");
  console.log("PASS workspace mount fail-closed matrix and valid metadata-prefixed route");
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

// Protected-contract fixtures exercise the real audit rather than a test-only Git comparison.
(function givenProtectedSectionDrift() {
  const root = buildBaseFixture("protected-drift", {});
  const changed = fixtureConstitution({ 9: ["# Article 9 — Fixture", "Drifted article nine body."] });
  writeFixtureFile(root, CONSTITUTION_PATH, changed);
  const result = audit.auditRepository({ root });
  assert.deepEqual(codesOf(result), ["protected_contract_section_drift"]);
  assert.equal(result.errors[0].article, 9);
  console.log("PASS protected section drift");
})();

(function givenExceptionPolicyViolations() {
  const cases = [
    { label: "missing", lines: ["# Article 8 — Fixture", "Article eight body.", "Article eight continuation.", "required article eight sentinel."] },
    { label: "duplicate", lines: ["# Article 8 — Fixture", "Article eight body.", FIXTURE_EXCEPTION, FIXTURE_EXCEPTION, "Article eight continuation.", "required article eight sentinel."] },
    { label: "altered", lines: ["# Article 8 — Fixture", "Article eight body.", FIXTURE_EXCEPTION + " altered", "Article eight continuation.", "required article eight sentinel."] },
    { label: "moved", lines: ["# Article 8 — Fixture", FIXTURE_EXCEPTION, "Article eight body.", "Article eight continuation.", "required article eight sentinel."] }
  ];
  cases.forEach((testCase) => {
    const root = buildBaseFixture("exception-" + testCase.label, {});
    writeFixtureFile(root, CONSTITUTION_PATH, fixtureConstitution({ 8: testCase.lines }));
    const result = audit.auditRepository({ root });
    assert.ok(codesOf(result).includes("protected_contract_exception_mismatch"), testCase.label);
    assert.equal(result.errors.filter((error) => error.code === "protected_contract_exception_mismatch").length, 1);
  });
  console.log("PASS missing / duplicate / altered / moved exception");
})();

(function givenMissingAndMalformedManifest() {
  const missingRoot = buildBaseFixture("manifest-missing", { omitBaselineManifest: true });
  assert.ok(codesOf(audit.auditRepository({ root: missingRoot })).includes("protected_contract_manifest_unreadable"));

  const invalidJsonRoot = buildBaseFixture("manifest-invalid-json", {});
  writeFixtureFile(invalidJsonRoot, BASELINE_MANIFEST_PATH, "{ not json\n");
  assert.ok(codesOf(audit.auditRepository({ root: invalidJsonRoot })).includes("protected_contract_manifest_malformed"));

  const malformedRoot = buildBaseFixture("manifest-malformed", {});
  const malformed = fixtureManifest(fixtureConstitution());
  delete malformed.normalizationVersion;
  writeFixtureFile(malformedRoot, BASELINE_MANIFEST_PATH, JSON.stringify(malformed));
  assert.ok(codesOf(audit.auditRepository({ root: malformedRoot })).includes("protected_contract_manifest_malformed"));
  console.log("PASS missing / malformed protected-contract manifest");
})();

(function givenManifestTextHashMismatch() {
  const root = buildBaseFixture("manifest-integrity", {});
  const manifest = fixtureManifest(fixtureConstitution());
  manifest.articles.find((entry) => entry.article === 14).normalizedText += "\nchanged without matching hash";
  writeFixtureFile(root, BASELINE_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  const result = audit.auditRepository({ root });
  assert.deepEqual(codesOf(result), ["protected_contract_manifest_integrity"]);
  assert.equal(result.errors[0].article, 14);
  console.log("PASS protected-contract text / hash mismatch");
})();

(function givenStaleThenExplicitlyUpdatedBaseline() {
  const root = buildBaseFixture("explicit-update", {});
  const updated = fixtureConstitution({ 14: ["# Article 14 — Fixture", "Explicitly revised article fourteen body."] });
  writeFixtureFile(root, CONSTITUTION_PATH, updated);
  assert.ok(codesOf(audit.auditRepository({ root })).includes("protected_contract_section_drift"));

  writeFixtureManifest(root, updated);
  const accepted = audit.auditRepository({ root });
  assert.equal(accepted.status, "pass", JSON.stringify(accepted.errors));
  console.log("PASS stale baseline fails and explicit fixture update passes");
})();

(function givenIndependentRequiredFragmentFailures() {
  [
    { article: 3, replacement: ["# Article 3 — Fixture", "Article three body.", "removed required three wording."] },
    { article: 8, replacement: ["# Article 8 — Fixture", "Article eight body.", FIXTURE_EXCEPTION, "Article eight continuation.", "removed required eight wording."] }
  ].forEach((testCase) => {
    const root = buildBaseFixture("required-" + testCase.article, {});
    const updated = fixtureConstitution({ [testCase.article]: testCase.replacement });
    writeFixtureFile(root, CONSTITUTION_PATH, updated);
    writeFixtureManifest(root, updated);
    const result = audit.auditRepository({ root });
    assert.deepEqual(codesOf(result), ["protected_contract_required_fragment_missing"]);
    assert.equal(result.errors[0].article, testCase.article);
  });
  console.log("PASS independent Article 3 / Article 8 required fragments");
})();

(function givenDuplicateProtectedArticleHeadings() {
  [3, 8, 9, 14].forEach((article) => {
    const root = buildBaseFixture("duplicate-article-" + article, {});
    fs.appendFileSync(path.join(root, CONSTITUTION_PATH), "\n# Article " + article + " — Duplicate\nshadow body\n", "utf8");
    const result = audit.auditRepository({ root });
    assert.deepEqual(codesOf(result), ["protected_contract_article_heading_mismatch"], "duplicate Article " + article);
    const error = result.errors[0];
    assert.equal(error.article, article);
    assert.equal(error.actual, 2);
  });
  console.log("PASS duplicate protected Article headings fail closed");
})();

(function givenFencedArticleLookalike() {
  const fenced = fixtureConstitution({
    9: ["# Article 9 — Fixture", "Article nine body.", "```md", "# Article 3 — not a heading", "```"]
  });
  const root = buildBaseFixture("fenced-article-lookalike", { constitutionText: fenced });
  const result = audit.auditRepository({ root });
  assert.equal(result.status, "pass", JSON.stringify(result.errors));
  console.log("PASS fenced Article lookalike ignored");
})();

(function givenProtectedFileSymlinksAndEscapes() {
  const cases = [
    {
      label: "manifest-file-symlink",
      relPath: BASELINE_MANIFEST_PATH,
      content: JSON.stringify(fixtureManifest(fixtureConstitution()), null, 2) + "\n",
      expectedRole: "manifest"
    },
    {
      label: "document-file-symlink",
      relPath: CONSTITUTION_PATH,
      content: fixtureConstitution(),
      expectedRole: "document"
    }
  ];
  cases.forEach((testCase) => {
    const root = buildBaseFixture(testCase.label, {});
    const outside = makeFixtureRoot(testCase.label + "-outside");
    const outsideFile = path.join(outside, "protected-file");
    fs.writeFileSync(outsideFile, testCase.content, "utf8");
    fs.rmSync(path.join(root, testCase.relPath));
    fs.symlinkSync(outsideFile, path.join(root, testCase.relPath));
    const result = audit.auditRepository({ root });
    assert.deepEqual(codesOf(result), ["protected_contract_file_unsafe"], testCase.label);
    assert.equal(result.errors[0].role, testCase.expectedRole);
  });

  const manifestRoot = buildBaseFixture("manifest-parent-escape", { omitBaselineManifest: true });
  const manifestOutside = makeFixtureRoot("manifest-parent-escape-outside");
  fs.writeFileSync(
    path.join(manifestOutside, path.basename(BASELINE_MANIFEST_PATH)),
    JSON.stringify(fixtureManifest(fixtureConstitution()), null, 2) + "\n",
    "utf8"
  );
  fs.symlinkSync(manifestOutside, path.join(manifestRoot, "SYSTEM/SCRIPTS"));
  let result = audit.auditRepository({ root: manifestRoot });
  assert.deepEqual(codesOf(result), ["protected_contract_file_unsafe"], "manifest parent realpath escape");
  assert.equal(result.errors[0].role, "manifest");

  const documentRoot = buildBaseFixture("document-parent-escape", {});
  const documentOutside = makeFixtureRoot("document-parent-escape-outside");
  fs.cpSync(path.join(documentRoot, "SYSTEM/docs"), documentOutside, { recursive: true });
  fs.rmSync(path.join(documentRoot, "SYSTEM/docs"), { recursive: true });
  fs.symlinkSync(documentOutside, path.join(documentRoot, "SYSTEM/docs"));
  result = audit.auditRepository({ root: documentRoot });
  assert.deepEqual(codesOf(result), ["protected_contract_file_unsafe"], "document parent realpath escape");
  assert.equal(result.errors[0].role, "document");
  console.log("PASS protected manifest/document symlinks and realpath escapes fail closed");
})();

(function givenInternalHorizontalRuleDrift() {
  const baseline = fixtureConstitution({
    9: ["# Article 9 — Fixture", "Article nine before rule.", "Article nine after rule."]
  });
  const root = buildBaseFixture("internal-horizontal-rule", { constitutionText: baseline });
  const changed = fixtureConstitution({
    9: ["# Article 9 — Fixture", "Article nine before rule.", "---", "Article nine after rule."]
  });
  writeFixtureFile(root, CONSTITUTION_PATH, changed);
  const result = audit.auditRepository({ root });
  assert.deepEqual(codesOf(result), ["protected_contract_section_drift"]);
  assert.equal(result.errors[0].article, 9);
  console.log("PASS internal protected-Article horizontal rule is significant");
})();

(function givenUnknownManifestPropertiesAtEveryLevel() {
  const cases = [
    { label: "root", mutate: (manifest) => { manifest.unknownRoot = true; } },
    { label: "article", mutate: (manifest) => { manifest.articles[0].unknownArticle = true; } },
    { label: "fragment", mutate: (manifest) => { manifest.requiredFragments[0].unknownFragment = true; } },
    { label: "exception", mutate: (manifest) => { manifest.exceptionPolicy.unknownException = true; } }
  ];
  cases.forEach((testCase) => {
    const root = buildBaseFixture("unknown-manifest-key-" + testCase.label, {});
    const manifest = fixtureManifest(fixtureConstitution());
    testCase.mutate(manifest);
    writeFixtureFile(root, BASELINE_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
    const result = audit.auditRepository({ root });
    assert.deepEqual(codesOf(result), ["protected_contract_manifest_malformed"], testCase.label);
  });
  console.log("PASS unknown manifest properties rejected at every schema level");
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
    // THEN every mapped and protected contract must be clean.
    const live = audit.auditRepository({ root: VAULT_ROOT });
    assert.equal(
      live.status,
      "pass",
      "live contract audit failed:\n" + JSON.stringify(live.errors, null, 2)
    );
    assert.deepEqual(live.uiContract.canonicalTargets, [audit.CANONICAL_UI_CONTRACT_PATH]);
    assert.deepEqual(live.uiContract.compatibilityTargets, [audit.COMPATIBILITY_UI_CONTRACT_PATH]);
    assert.deepEqual(live.protectedContract.articles, [3, 8, 9, 14]);
    console.log("Contract audit tests passed (synthetic + live)");
  }
} finally {
  cleanupFixtures();
}
