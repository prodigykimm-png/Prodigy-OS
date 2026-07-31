#!/usr/bin/env node
"use strict";

/**
 * Enforces the design color contract: `SYSTEM/Views/design-tokens.js` is the only
 * sanctioned raw-hex source, and every other raw-hex occurrence in scanned product
 * code is frozen by path + normalized hex multiset. A pure move or reformat of the
 * same colors therefore passes, while any added or changed value fails.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

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

/** Regenerate only for an intended removal, via `--print-baseline`. */
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

function assertScopeUsable(root) {
  const files = listJsFiles(root);
  assert.ok(
    files.length > 0,
    "product-code scope is empty: root is malformed or unreadable (" + root + ")"
  );
  assert.ok(exists(root, TOKENS_REL), "missing sanctioned token source: " + TOKENS_REL);
  return files;
}

function assertTokenSourceIsOnlyRawHexOrigin(root, files) {
  const tokens = readText(root, TOKENS_REL);
  assert.ok(
    normalizedHexes(tokens).length > 0,
    TOKENS_REL + ": expected raw hex definitions in the sanctioned token source"
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

function assertLegacyBaselineFilesStillPresent(root) {
  const missing = Object.keys(LEGACY_RAW_HEX_BASELINE).filter((relPath) => !exists(root, relPath));
  assert.deepEqual(missing, [], "frozen legacy baseline references missing files: " + missing.join(", "));
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

/** Returns pending handoff notes rather than asserting, so this stays stable pre-docs-worker. */
function checkDesignDocMarkers(root) {
  assert.ok(exists(root, ROOT_DESIGN_REL), "missing canonical UI contract: " + ROOT_DESIGN_REL);
  const design = readText(root, ROOT_DESIGN_REL);
  const missingRegionDocMarkers = ["region-collection-health", "region-decision-outcome"].filter(
    (marker) => !design.includes(marker)
  );
  assert.deepEqual(
    missingRegionDocMarkers,
    [],
    ROOT_DESIGN_REL + " missing Region contract markers: " + missingRegionDocMarkers.join(", ")
  );

  const pending = [];
  if (!exists(root, COMPAT_DESIGN_REL)) {
    pending.push(COMPAT_DESIGN_REL + " absent (docs worker handoff)");
    return pending;
  }
  const compat = readText(root, COMPAT_DESIGN_REL);
  if (!/DESIGN\.md/.test(compat)) {
    pending.push(COMPAT_DESIGN_REL + " has no structural pointer to the canonical DESIGN.md");
  }
  if (!compat.includes("ProdigyTokens")) {
    pending.push(COMPAT_DESIGN_REL + " token table has no ProdigyTokens reference");
  }
  return pending;
}

function runContract(root) {
  const files = assertScopeUsable(root);
  assertLegacyBaselineFilesStillPresent(root);
  assertTokenSourceIsOnlyRawHexOrigin(root, files);
  const chrome = assertCommonChromeIsTokenClean(root, files);
  assertThemeAliasesAllowed(root, chrome);
  assertRegionContractMarkers(root);
  return { files: files.length, chrome: chrome.length, docPending: checkDesignDocMarkers(root) };
}


const tempRoots = [];

function makeFixtureRoot(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-color-guard-" + label + "-"));
  tempRoots.push(dir);
  return dir;
}

function writeFile(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function copyFromVault(root, relPath) {
  writeFile(root, relPath, readText(VAULT_ROOT, relPath));
}

function buildPassingFixture(label) {
  const root = makeFixtureRoot(label);
  copyFromVault(root, TOKENS_REL);
  copyFromVault(root, REGION_POPUP_REL);
  copyFromVault(root, ROOT_DESIGN_REL);
  copyFromVault(root, COMPAT_DESIGN_REL);
  writeFile(
    root,
    "SYSTEM/Views/prodigy-app-shell.js",
    '"use strict";\nconst style = "color: var(--text-accent); gap: var(--ke-space-3, 8px)";\n'
  );
  writeFile(
    root,
    "SYSTEM/Views/ai-inspector.js",
    '"use strict";\nconst cls = "prodigy-ai-inspector";\n'
  );
  for (const [relPath, hexes] of Object.entries(LEGACY_RAW_HEX_BASELINE)) {
    writeFile(
      root,
      relPath,
      '"use strict";\nconst legacy = [' + hexes.map((hex) => '"' + hex + '"').join(", ") + "];\n"
    );
  }
  return root;
}

function expectFail(label, mutate) {
  const root = buildPassingFixture(label);
  mutate(root);
  let failed = false;
  let message = "";
  try {
    runContract(root);
  } catch (error) {
    failed = true;
    message = error && error.message ? String(error.message).split("\n")[0] : "";
  }
  assert.ok(failed, "mutation emitted false success: " + label);
  return message;
}

function expectPass(label, mutate) {
  const root = buildPassingFixture(label);
  if (mutate) mutate(root);
  runContract(root);
  return label;
}

function cleanupTempRoots() {
  for (const dir of tempRoots) {
    if (dir.startsWith(os.tmpdir()) && dir.includes("prodigy-color-guard-")) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  tempRoots.length = 0;
}


function printBaseline() {
  const generated = {};
  for (const relPath of listJsFiles(VAULT_ROOT)) {
    if (relPath === TOKENS_REL) continue;
    const hexes = normalizedHexes(readText(VAULT_ROOT, relPath));
    if (hexes.length > 0) generated[relPath] = hexes;
  }
  process.stdout.write(JSON.stringify(generated, null, 2) + "\n");
}

function main() {
  if (process.argv.includes("--print-baseline")) {
    printBaseline();
    return;
  }

  const results = [];

  results.push("fixture-baseline-passes: " + expectPass("fixture-baseline"));

  results.push(
    "legacy-exact-baseline-accepted: " +
      expectPass("legacy-exact", (root) => {
        const relPath = "SYSTEM/Views/project-card.js";
        const hexes = LEGACY_RAW_HEX_BASELINE[relPath];
        writeFile(root, relPath, '"use strict";\n// reordered, same multiset\nconst c = [' +
          hexes.slice().reverse().map((hex) => '"' + hex + '"').join(", ") + "];\n");
      })
  );

  results.push(
    "theme-alias-accepted: " +
      expectPass("theme-alias", (root) => {
        writeFile(
          root,
          "SYSTEM/Views/ai-inspector-styles.js",
          '"use strict";\nconst s = "outline: 2px solid var(--text-accent); padding: var(--ke-space-2, 4px)";\n'
        );
      })
  );

  results.push(
    "common-raw-hex-rejected: " +
      expectFail("common-hex", (root) => {
        writeFile(
          root,
          "SYSTEM/Views/prodigy-app-shell.js",
          '"use strict";\nconst s = "color: #ff0000; outline: 1px solid var(--text-accent)";\n'
        );
      })
  );

  results.push(
    "common-prodigy-tokens-colors-rejected: " +
      expectFail("common-tokens", (root) => {
        writeFile(
          root,
          "SYSTEM/Views/prodigy-app-shell.js",
          '"use strict";\nconst c = ProdigyTokens.COLORS.success;\nconst s = "color: var(--text-accent)";\n'
        );
      })
  );

  results.push(
    "legacy-added-hex-rejected: " +
      expectFail("legacy-added", (root) => {
        const relPath = "SYSTEM/Views/reading-card.js";
        const hexes = LEGACY_RAW_HEX_BASELINE[relPath].concat(["#123456"]);
        writeFile(root, relPath, '"use strict";\nconst c = [' +
          hexes.map((hex) => '"' + hex + '"').join(", ") + "];\n");
      })
  );

  results.push(
    "legacy-changed-hex-rejected: " +
      expectFail("legacy-changed", (root) => {
        const relPath = "SYSTEM/Views/auction-card.js";
        const hexes = LEGACY_RAW_HEX_BASELINE[relPath].slice();
        hexes[0] = "#00ff00";
        writeFile(root, relPath, '"use strict";\nconst c = [' +
          hexes.map((hex) => '"' + hex + '"').join(", ") + "];\n");
      })
  );

  results.push(
    "unlisted-file-hex-rejected: " +
      expectFail("unlisted-hex", (root) => {
        writeFile(root, "SYSTEM/Views/brand-new-card.js", '"use strict";\nconst c = "#abcdef";\n');
      })
  );

  results.push(
    "region-source-absent-rejected: " +
      expectFail("region-absent", (root) => {
        fs.rmSync(path.join(root, REGION_POPUP_REL));
      })
  );

  for (const marker of REGION_REQUIRED_MARKERS) {
    expectFail("region-missing-" + marker, (root) => {
      const content = readText(root, REGION_POPUP_REL).split(marker).join("region-removed-marker");
      writeFile(root, REGION_POPUP_REL, content);
    });
  }
  results.push(
    "region-required-marker-removal-rejected: " + REGION_REQUIRED_MARKERS.length + " markers"
  );

  for (const marker of REGION_FORBIDDEN_MARKERS) {
    expectFail("region-forbidden-" + marker, (root) => {
      const content = readText(root, REGION_POPUP_REL) + '\nconst banned = "' + marker + '";\n';
      writeFile(root, REGION_POPUP_REL, content);
    });
  }
  results.push(
    "region-forbidden-marker-rejected: " + REGION_FORBIDDEN_MARKERS.length + " markers"
  );

  results.push(
    "empty-root-rejected: " +
      expectFail("empty-root", (root) => {
        fs.rmSync(path.join(root, "SYSTEM"), { recursive: true, force: true });
        fs.rmSync(path.join(root, ROOT_DESIGN_REL), { force: true });
      })
  );
  results.push(
    "missing-token-source-rejected: " +
      expectFail("no-token-source", (root) => {
        fs.rmSync(path.join(root, TOKENS_REL));
      })
  );
  results.push(
    "nonexistent-root-rejected: " +
      (function () {
        let failed = false;
        try {
          runContract(path.join(os.tmpdir(), "prodigy-color-guard-does-not-exist-" + Date.now()));
        } catch (error) {
          failed = true;
        }
        assert.ok(failed, "nonexistent root emitted false success");
        return "ok";
      })()
  );

  const live = runContract(VAULT_ROOT);

  for (const line of results) console.log("  PASS " + line);
  console.log(
    "  LIVE scanned=" + live.files + " js files, common chrome=" + live.chrome + " modules"
  );
  if (live.docPending.length > 0) {
    console.log("  PENDING doc handoff (Task 3 docs worker):");
    for (const note of live.docPending) console.log("    - " + note);
  } else {
    console.log("  DOCS canonical/compatibility markers present");
  }
  console.log("Design color contract: OK");
}

try {
  main();
} finally {
  cleanupTempRoots();
}
