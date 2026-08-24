"use strict";

/**
 * Reusable design-color contract scanner.
 *
 * `SYSTEM/Views/design-tokens.js` owns only the approved alpha literals and common
 * chrome owns no raw palette; every residual domain raw hex is frozen by path + normalized hex multiset, so a
 * pure move or reformat passes while any added or changed value fails. Common chrome
 * also must hold zero `ProdigyTokens.COLORS`. The compatibility design
 * doc must point at the canonical root contract without duplicating token values.
 * Every check fails closed when a required source is missing or unreadable.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TOKENS_REL = "SYSTEM/Views/design-tokens.js";
const REGION_POPUP_REL = "SYSTEM/Views/region-intelligence-popup-view.js";
const ROOT_DESIGN_REL = "DESIGN.md";
const COMPAT_DESIGN_REL = "SYSTEM/docs/DESIGN.md";

const PRODUCT_CODE_DIRS = Object.freeze(["SYSTEM/Views", "SYSTEM/SCRIPTS", "SYSTEM/Prodigy", "HUB"]);

/** Matched against scanned paths; matches are held to the zero-raw-color rule. */
const COMMON_CHROME_PATTERNS = Object.freeze([
  /^SYSTEM\/Views\/prodigy-app-shell\.js$/,
  /^SYSTEM\/Views\/prodigy-ui\.js$/,
  /^SYSTEM\/Views\/ai-inspector(-styles)?\.js$/,
  /^SYSTEM\/Views\/workspace-navigation\.js$/,
  /^SYSTEM\/Views\/workspace-(launcher|list)-view\.js$/,
  /^SYSTEM\/Views\/shared-dashboard\.js$/,
  /^SYSTEM\/Views\/knowledge-use-record-ui\.js$/,
  /^SYSTEM\/Views\/knowledge-workspace-tabs\.js$/
]);

const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RAW_COLOR_FN_RE = /\b(?:rgba?|hsla?)\s*\(/i;
const RAW_COLOR_VALUE_RE = /\b(?:rgba?|hsla?)\s*\([^)]*\)/gi;
const SHARED_PRESENTATION_RESIDUALS = Object.freeze([
  "SYSTEM/Views/shared-dashboard.js",
  "SYSTEM/Views/knowledge-use-record-ui.js",
  "SYSTEM/Views/workspace-list-view.js"
]);
const VALUE_HEADER_CELLS = Object.freeze(["값", "value", "색상값", "hex"]);

/** Regenerate only for an intended removal, via the test's `--print-baseline`. */
const LEGACY_RAW_HEX_BASELINE = Object.freeze({
  "SYSTEM/Views/auction-day-view.js": [],
  "SYSTEM/Views/reading-card.js": []
});

const LEGACY_RAW_FUNCTION_BASELINE = Object.freeze({
  "SYSTEM/Views/auction-day-view.js": [],
  "SYSTEM/Views/bid-calendar-view.js": [],
  "SYSTEM/Views/prodigy-doctor.js": [
    "rgba(239,68,68,0.1)",
    "rgba(34,197,94,0.1)"
  ],
  "SYSTEM/Views/reading-card.js": []
});

const REGION_REQUIRED_MARKERS = Object.freeze([
  "region-collection-health",
  "region-decision-outcome",
  "region-decision-row",
  "region-outcome-summary",
  "region-outcome-note",
  "region-trust-badges"
]);

const REGION_FORBIDDEN_MARKERS = Object.freeze([
  "region-score",
  "region_score",
  "regionScore",
  "region-recommendation",
  "recommendation_label",
  "recommendedBid",
  "recommended_bid",
  "suggested-bid",
  "suggested_bid",
  "suggestedBid",
  "forecast-price",
  "forecast_price",
  "forecastPrice",
  "priceForecast"
]);

function readText(root, relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function exists(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function listJsFiles(root) {
  const found = [];
  for (const dir of PRODUCT_CODE_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const child = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(child);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          found.push(path.relative(root, child).split(path.sep).join("/"));
        }
      }
    }
  }
  return found.sort();
}

function normalizedHexes(content) {
  const matches = content.match(RAW_HEX_RE) || [];
  return matches.map((hex) => hex.toLowerCase()).sort();
}

function normalizedColorFunctions(content) {
  const matches = content.match(RAW_COLOR_VALUE_RE) || [];
  return matches.map((value) => value.replace(/\s+/g, "").toLowerCase()).sort();
}

function isCommonChrome(relPath) {
  return COMMON_CHROME_PATTERNS.some((pattern) => pattern.test(relPath));
}

function sameMultiset(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function hasTokenValueTable(markdown) {
  return markdown.split("\n").some((line) => {
    if (!line.trim().startsWith("|")) return false;
    return line
      .split("|")
      .map((cell) => cell.replace(/[`*\s]/g, "").toLowerCase())
      .some((cell) => VALUE_HEADER_CELLS.includes(cell));
  });
}

function assertScopeUsable(root) {
  const files = listJsFiles(root);
  assert.ok(files.length > 0, "product-code scope is empty: root is malformed or unreadable (" + root + ")");
  assert.ok(exists(root, TOKENS_REL), "missing sanctioned token source: " + TOKENS_REL);
  return files;
}

function assertTokenSourceIsSemantic(root, files) {
  const tokenSource = readText(root, TOKENS_REL);
  const approvedAlphaHex = new Set([
    "#000000", "#0066cc", "#0071e3", "#007aff", "#0a84ff", "#1d1d1f", "#272729",
    "#2997ff", "#424245", "#7a7a7a", "#cccccc", "#d2d2d7",
    "#e0e0e0", "#f0f0f0", "#f5f5f7", "#fafafc", "#ffffff"
  ]);
  const unapprovedTokenHex = normalizedHexes(tokenSource).filter((hex) => !approvedAlphaHex.has(hex));
  assert.deepEqual(unapprovedTokenHex, [], TOKENS_REL + ": unapproved alpha color literal");
  const tokenColorFunctions = normalizedColorFunctions(tokenSource);
  assert.deepEqual(
    tokenColorFunctions,
    tokenColorFunctions.length ? ["rgba(0,0,0,0.22)"] : [],
    TOKENS_REL + ": only the image-shadow color function is allowed"
  );
  const requiredSemanticVariables = [
    "--background-primary",
    "--background-secondary",
    "--background-modifier-border",
    "--text-normal",
    "--text-muted",
    "--text-on-accent",
    "--text-success",
    "--text-warning",
    "--text-error"
  ];
  const missingSemanticVariables = requiredSemanticVariables.filter((name) => !tokenSource.includes(`var(${name}`));
  assert.deepEqual(
    missingSemanticVariables,
    [],
    TOKENS_REL + ": missing Obsidian semantic roles: " + missingSemanticVariables.join(", ")
  );

  const missingLegacy = Object.keys(LEGACY_RAW_HEX_BASELINE).filter((rel) => !exists(root, rel));
  assert.deepEqual(
    missingLegacy,
    [],
    "frozen legacy baseline references missing files: " + missingLegacy.join(", ")
  );

  const offenders = [];
  for (const relPath of files) {
    if (relPath === TOKENS_REL) continue;
    const hexes = normalizedHexes(readText(root, relPath));
    if (hexes.length === 0) continue;
    const baseline = LEGACY_RAW_HEX_BASELINE[relPath];
    if (!baseline) {
      offenders.push(relPath + ": unapproved residual raw hex (" + hexes.join(", ") + ")");
      continue;
    }
    if (!sameMultiset(hexes, baseline.slice().sort())) {
      offenders.push(
        relPath +
          ": frozen legacy raw-hex baseline drift\n    expected: " +
          baseline.slice().sort().join(", ") +
          "\n    actual:   " +
          hexes.join(", ")
      );
    }
  }
  assert.deepEqual(offenders, [], "raw-hex contract violations:\n  " + offenders.join("\n  "));

  const missingFunctionLegacy = Object.keys(LEGACY_RAW_FUNCTION_BASELINE).filter((rel) => !exists(root, rel));
  assert.deepEqual(
    missingFunctionLegacy,
    [],
    "frozen legacy color-function baseline references missing files: " + missingFunctionLegacy.join(", ")
  );
  const functionOffenders = [];
  for (const relPath of files) {
    if (relPath === TOKENS_REL) continue;
    const values = normalizedColorFunctions(readText(root, relPath));
    const baseline = LEGACY_RAW_FUNCTION_BASELINE[relPath];
    if (!baseline && values.length > 0) {
      functionOffenders.push(relPath + ": unapproved residual color function (" + values.join(", ") + ")");
    } else if (baseline && !sameMultiset(values, baseline.slice().sort())) {
      functionOffenders.push(relPath + ": frozen legacy color-function baseline drift");
    }
  }
  assert.deepEqual(functionOffenders, [], "raw color-function contract violations:\n  " + functionOffenders.join("\n  "));
}

function assertCommonChromeIsTokenClean(root, files) {
  const chrome = files.filter(isCommonChrome);
  assert.ok(chrome.length > 0, "no common chrome modules discovered in product-code scope");

  const offenders = [];
  for (const relPath of chrome) {
    const content = readText(root, relPath);
    const hexes = normalizedHexes(content);
    if (hexes.length > 0) {
      offenders.push(relPath + ": raw hex in common chrome (" + hexes.slice(0, 5).join(", ") + ")");
    }
    if (content.includes("ProdigyTokens.COLORS")) {
      offenders.push(relPath + ": ProdigyTokens.COLORS in common chrome");
    }
  }
  assert.deepEqual(offenders, [], "common chrome violations:\n  " + offenders.join("\n  "));
  return chrome;
}

function assertThemeAliasesAllowed(root, chrome) {
  const aliasUsers = chrome.filter((relPath) => {
    const content = readText(root, relPath);
    return content.includes("var(--text-accent)") || content.includes("var(--ke-");
  });
  assert.ok(
    aliasUsers.length > 0,
    "expected at least one common chrome module to use allowed var(--text-accent) or --ke-* aliases"
  );
}

function assertSharedPresentationResiduals(root, overrides = {}) {
  const offenders = [];
  for (const relPath of SHARED_PRESENTATION_RESIDUALS) {
    assert.ok(exists(root, relPath), "missing shared presentation graph: " + relPath);
    const content = Object.hasOwn(overrides, relPath) ? overrides[relPath] : readText(root, relPath);
    const rules = [
      [/(?:linear|radial|conic)-gradient\s*\(/i, "decorative gradient"],
      [/(?:box|text)-shadow\s*:/i, "shared chrome shadow"],
      [/color-mix\s*\(/i, "local color mix"],
      [/url\s*\(\s*["']?https?:/i, "remote presentation asset"],
      [/font-size\s*:\s*[0-9.]/i, "private type size"],
      [/border-radius\s*:\s*[0-9.]/i, "private radius"],
      [/@media[^\n{]*\b(?:600|768|760|767|900)px/i, "private breakpoint"]
    ];
    for (const [pattern, label] of rules) if (pattern.test(content)) offenders.push(relPath + ": " + label);
    if (!content.includes("var(--ke-")) offenders.push(relPath + ": no canonical shared token consumption");
    if (!/(?:--ke-touch-target|--ke-control-height)/.test(content)) offenders.push(relPath + ": no 44px control role");
  }
  assert.deepEqual(offenders, [], "shared presentation residual violations:\n  " + offenders.join("\n  "));
}

function assertRegionContractMarkers(root) {
  assert.ok(
    exists(root, REGION_POPUP_REL),
    "Region popup source absent, failing closed: " + REGION_POPUP_REL
  );
  const content = readText(root, REGION_POPUP_REL);

  const missing = REGION_REQUIRED_MARKERS.filter((marker) => !content.includes(marker));
  assert.deepEqual(missing, [], "Region popup missing required markers: " + missing.join(", "));

  const present = REGION_FORBIDDEN_MARKERS.filter((marker) => content.includes(marker));
  assert.deepEqual(present, [], "Region popup contains forbidden markers: " + present.join(", "));
}

/** Delegation rule: pointer + bounded exception allowed, duplicated token values never. */
function assertDesignDocBoundary(root) {
  assert.ok(exists(root, ROOT_DESIGN_REL), "missing canonical UI contract: " + ROOT_DESIGN_REL);
  const design = readText(root, ROOT_DESIGN_REL);
  const missingDocMarkers = [
    "Authoritative alpha contract",
    "canonical Action, Focus, and On-dark Action roles",
    "ProdigyTokens.ACCENTS",
    "4 / 8 / 12 / 17 / 24 / 32 / 48 / 80px",
    "419 / 640 / 735 / 833 / 1023 / 1068 / 1440px",
    ".prodigy-full-bleed",
    ".prodigy-utility-card",
    ".prodigy-configurator-chip",
    "region-collection-health",
    "region-decision-outcome"
  ].filter((marker) => !design.includes(marker));
  assert.doesNotMatch(design, /planned visual target/i, ROOT_DESIGN_REL + " still describes the shipped alpha as planned");
  assert.deepEqual(
    missingDocMarkers,
    [],
    ROOT_DESIGN_REL + " missing Region contract markers: " + missingDocMarkers.join(", ")
  );

  assert.ok(exists(root, COMPAT_DESIGN_REL), "missing compatibility appendix: " + COMPAT_DESIGN_REL);
  const compat = readText(root, COMPAT_DESIGN_REL);
  const offenders = [];
  if (!/\]\(\.\.\/\.\.\/DESIGN\.md\)/.test(compat)) {
    offenders.push("no relative pointer link to the canonical ../../DESIGN.md");
  }
  if (!compat.includes("ProdigyTokens.COLORS")) {
    offenders.push("no bounded ProdigyTokens.COLORS legacy exception");
  }
  if (!compat.includes(TOKENS_REL)) {
    offenders.push("no pointer to the sanctioned token source " + TOKENS_REL);
  }
  if (compat.includes("잔여 예외")) {
    offenders.push("still advertises retired domain palette exceptions");
  }
  const compatHexes = normalizedHexes(compat);
  if (compatHexes.length > 0) {
    offenders.push("duplicates raw hex token values (" + compatHexes.slice(0, 5).join(", ") + ")");
  }
  if (RAW_COLOR_FN_RE.test(compat)) {
    offenders.push("duplicates rgb/hsl color values");
  }
  if (hasTokenValueTable(compat)) {
    offenders.push("duplicates a token value table (value column present)");
  }
  assert.deepEqual(
    offenders,
    [],
    COMPAT_DESIGN_REL + " is not a delegating compatibility appendix:\n  " + offenders.join("\n  ")
  );
}

function runContract(root) {
  const files = assertScopeUsable(root);
  assertTokenSourceIsSemantic(root, files);
  const chrome = assertCommonChromeIsTokenClean(root, files);
  assertThemeAliasesAllowed(root, chrome);
  assertSharedPresentationResiduals(root);
  assertRegionContractMarkers(root);
  assertDesignDocBoundary(root);
  return { files: files.length, chrome: chrome.length };
}

module.exports = {
  COMPAT_DESIGN_REL,
  LEGACY_RAW_FUNCTION_BASELINE,
  LEGACY_RAW_HEX_BASELINE,
  REGION_FORBIDDEN_MARKERS,
  REGION_POPUP_REL,
  REGION_REQUIRED_MARKERS,
  ROOT_DESIGN_REL,
  SHARED_PRESENTATION_RESIDUALS,
  TOKENS_REL,
  assertSharedPresentationResiduals,
  listJsFiles,
  normalizedColorFunctions,
  normalizedHexes,
  readText,
  runContract
};
