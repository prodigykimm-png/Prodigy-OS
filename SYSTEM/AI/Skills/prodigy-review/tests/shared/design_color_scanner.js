"use strict";

/**
 * Reusable design-color contract scanner.
 *
 * `SYSTEM/Views/design-tokens.js` is the only sanctioned raw-hex source; every other
 * raw hex in scanned product code is frozen by path + normalized hex multiset, so a
 * pure move or reformat passes while any added or changed value fails. Common chrome
 * must hold zero raw color and zero `ProdigyTokens.COLORS`. The compatibility design
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
  /^SYSTEM\/Views\/ai-inspector(-styles)?\.js$/,
  /^SYSTEM\/Views\/workspace-navigation\.js$/,
  /^SYSTEM\/Views\/workspace-(launcher|list)-view\.js$/,
  /^SYSTEM\/Views\/knowledge-workspace-tabs\.js$/
]);

const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RAW_COLOR_FN_RE = /\b(?:rgba?|hsla?)\s*\(/i;
const VALUE_HEADER_CELLS = Object.freeze(["값", "value", "색상값", "hex"]);

/** Regenerate only for an intended removal, via the test's `--print-baseline`. */
const LEGACY_RAW_HEX_BASELINE = Object.freeze({
  "SYSTEM/Views/auction-card.js": ["#22c55e", "#22c55e20", "#3b82f6", "#3b82f620"],
  "SYSTEM/Views/auction-day-view.js": ["#22c55e", "#22c55e", "#ef4444", "#ef4444"],
  "SYSTEM/Views/project-card.js": [
    "#3b82f6",
    "#555",
    "#555",
    "#8e8e93",
    "#8e8e93",
    "#a855f7",
    "#ef4444",
    "#f97316"
  ],
  "SYSTEM/Views/reading-card.js": ["#06b6d4", "#22c55e", "#8e8e93", "#eab308", "#f97316", "#ffffff"]
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

function assertTokenSourceIsOnlyRawHexOrigin(root, files) {
  assert.ok(
    normalizedHexes(readText(root, TOKENS_REL)).length > 0,
    TOKENS_REL + ": expected raw hex definitions in the sanctioned token source"
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
      offenders.push(relPath + ": raw hex outside " + TOKENS_REL + " (" + hexes.join(", ") + ")");
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
  const missingDocMarkers = ["region-collection-health", "region-decision-outcome"].filter(
    (marker) => !design.includes(marker)
  );
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
  assertTokenSourceIsOnlyRawHexOrigin(root, files);
  const chrome = assertCommonChromeIsTokenClean(root, files);
  assertThemeAliasesAllowed(root, chrome);
  assertRegionContractMarkers(root);
  assertDesignDocBoundary(root);
  return { files: files.length, chrome: chrome.length };
}

module.exports = {
  COMPAT_DESIGN_REL,
  LEGACY_RAW_HEX_BASELINE,
  REGION_FORBIDDEN_MARKERS,
  REGION_POPUP_REL,
  REGION_REQUIRED_MARKERS,
  ROOT_DESIGN_REL,
  TOKENS_REL,
  listJsFiles,
  normalizedHexes,
  readText,
  runContract
};
