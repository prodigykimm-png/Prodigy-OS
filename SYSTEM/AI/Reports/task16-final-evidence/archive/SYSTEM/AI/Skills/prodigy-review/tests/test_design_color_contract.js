#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scanner = require("./shared/design_color_scanner.js");

const {
  COMPAT_DESIGN_REL,
  LEGACY_RAW_FUNCTION_BASELINE,
  LEGACY_RAW_HEX_BASELINE,
  REGION_FORBIDDEN_MARKERS,
  REGION_POPUP_REL,
  REGION_REQUIRED_MARKERS,
  ROOT_DESIGN_REL,
  SHARED_PRESENTATION_RESIDUALS,
  TOKENS_REL,
  listJsFiles,
  normalizedHexes,
  readText,
  runContract
} = scanner;

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

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

function hexArrayModule(hexes) {
  return '"use strict";\nconst c = [' + hexes.map((hex) => '"' + hex + '"').join(", ") + "];\n";
}

function buildPassingFixture(label) {
  const root = makeFixtureRoot(label);
  copyFromVault(root, TOKENS_REL);
  copyFromVault(root, REGION_POPUP_REL);
  copyFromVault(root, ROOT_DESIGN_REL);
  copyFromVault(root, COMPAT_DESIGN_REL);
  for (const relPath of SHARED_PRESENTATION_RESIDUALS) copyFromVault(root, relPath);
  writeFile(
    root,
    "SYSTEM/Views/prodigy-app-shell.js",
    '"use strict";\nconst style = "color: var(--text-accent); gap: var(--ke-space-3, 8px)";\n'
  );
  writeFile(
    root,
    "SYSTEM/Views/prodigy-ui.js",
    '"use strict";\nconst style = "color: var(--ke-color-text);";\n'
  );
  writeFile(
    root,
    "SYSTEM/Views/ai-inspector.js",
    '"use strict";\nconst cls = "prodigy-ai-inspector";\n'
  );
  for (const [relPath, hexes] of Object.entries(LEGACY_RAW_HEX_BASELINE)) {
    writeFile(root, relPath, hexArrayModule(hexes));
  }
  for (const [relPath, values] of Object.entries(LEGACY_RAW_FUNCTION_BASELINE)) {
    const prefix = fs.existsSync(path.join(root, relPath)) ? readText(root, relPath) : '"use strict";\n';
    writeFile(root, relPath, prefix + "\nconst f = [" + values.map((value) => '"' + value + '"').join(", ") + "];\n");
  }
  return root;
}

function expectFail(label, mutate) {
  const root = buildPassingFixture(label);
  mutate(root);
  let failed = false;
  try {
    runContract(root);
  } catch (error) {
    failed = true;
  }
  assert.ok(failed, "mutation emitted false success: " + label);
  return label;
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

const PASS_CASES = Object.freeze({
  "fixture-baseline": null,
  "legacy-exact-multiset-reordered": (root) => {
    const relPath = "SYSTEM/Views/reading-card.js";
    writeFile(
      root,
      relPath,
      hexArrayModule(LEGACY_RAW_HEX_BASELINE[relPath].slice().reverse())
        + "\nconst f = [" + LEGACY_RAW_FUNCTION_BASELINE[relPath].map((value) => '"' + value + '"').join(", ") + "];\n"
    );
  },
  "theme-alias-in-common-chrome": (root) => {
    writeFile(
      root,
      "SYSTEM/Views/ai-inspector-styles.js",
      '"use strict";\nconst s = "outline: 2px solid var(--text-accent); padding: var(--ke-space-2, 4px)";\n'
    );
  }
});

const FAIL_CASES = Object.freeze({
  "common-raw-hex": (root) => {
    writeFile(
      root,
      "SYSTEM/Views/prodigy-app-shell.js",
      '"use strict";\nconst s = "color: #ff0000; outline: 1px solid var(--text-accent)";\n'
    );
  },
  "common-raw-color-function": (root) => {
    writeFile(
      root,
      "SYSTEM/Views/prodigy-app-shell.js",
      '"use strict";\nconst s = "color: rgb(1,2,3);";\n'
    );
  },
  "common-prodigy-tokens-colors": (root) => {
    writeFile(
      root,
      "SYSTEM/Views/prodigy-app-shell.js",
      '"use strict";\nconst c = ProdigyTokens.COLORS.success;\nconst s = "color: var(--text-accent)";\n'
    );
  },
  "prodigy-ui-legacy-color-alias": (root) => {
    writeFile(
      root,
      "SYSTEM/Views/prodigy-ui.js",
      '"use strict";\nconst c = ProdigyTokens.COLORS.warning;\n'
    );
  },
  "legacy-added-color-function": (root) => {
    const relPath = "SYSTEM/Views/prodigy-doctor.js";
    appendTo(root, relPath, '\nconst added = "rgba(1,2,3,0.5)";\n');
  },
  "legacy-added-hex": (root) => {
    const relPath = "SYSTEM/Views/reading-card.js";
    writeFile(root, relPath, hexArrayModule(LEGACY_RAW_HEX_BASELINE[relPath].concat(["#123456"])));
  },
  "legacy-changed-hex": (root) => {
    const relPath = "SYSTEM/Views/auction-day-view.js";
    const hexes = LEGACY_RAW_HEX_BASELINE[relPath].slice();
    hexes[0] = "#00ff00";
    writeFile(root, relPath, hexArrayModule(hexes));
  },
  "unlisted-file-hex": (root) => {
    writeFile(root, "SYSTEM/Views/brand-new-card.js", hexArrayModule(["#abcdef"]));
  },
  "legacy-baseline-file-removed": (root) => {
    fs.rmSync(path.join(root, "SYSTEM/Views/reading-card.js"));
  },
  "region-source-absent": (root) => {
    fs.rmSync(path.join(root, REGION_POPUP_REL));
  },
  "compat-doc-absent": (root) => {
    fs.rmSync(path.join(root, COMPAT_DESIGN_REL));
  },
  "compat-doc-raw-hex": (root) => {
    appendTo(root, COMPAT_DESIGN_REL, "\n색상 success 는 #22c55e 이다.\n");
  },
  "compat-doc-rgb-value": (root) => {
    appendTo(root, COMPAT_DESIGN_REL, "\n그림자 sm 은 rgba(0,0,0,0.06) 이다.\n");
  },
  "compat-doc-token-value-table": (root) => {
    appendTo(root, COMPAT_DESIGN_REL, "\n| 토큰 | 값 | 용도 |\n|---|---|---|\n| success | 초록 | 완료 |\n");
  },
  "compat-doc-pointer-removed": (root) => {
    writeFile(
      root,
      COMPAT_DESIGN_REL,
      "# 부록\n\nProdigyTokens.COLORS 는 레거시입니다. " + TOKENS_REL + " 를 보십시오.\n"
    );
  },
  "compat-doc-exception-removed": (root) => {
    writeFile(root, COMPAT_DESIGN_REL, "# 부록\n\n[루트 계약](../../DESIGN.md) 을 보십시오.\n");
  },
  "root-design-absent": (root) => {
    fs.rmSync(path.join(root, ROOT_DESIGN_REL));
  },
  "empty-root": (root) => {
    fs.rmSync(path.join(root, "SYSTEM"), { recursive: true, force: true });
    fs.rmSync(path.join(root, ROOT_DESIGN_REL), { force: true });
  },
  "missing-token-source": (root) => {
    fs.rmSync(path.join(root, TOKENS_REL));
  },
  "unreadable-token-source": (root) => {
    const abs = path.join(root, TOKENS_REL);
    fs.rmSync(abs);
    fs.mkdirSync(abs);
  }
});

function appendTo(root, relPath, extra) {
  writeFile(root, relPath, readText(root, relPath) + extra);
}

function runRegionMarkerMutations() {
  for (const marker of REGION_REQUIRED_MARKERS) {
    expectFail("region-missing-" + marker, (root) => {
      writeFile(
        root,
        REGION_POPUP_REL,
        readText(root, REGION_POPUP_REL).split(marker).join("region-removed-marker")
      );
    });
  }
  for (const marker of REGION_FORBIDDEN_MARKERS) {
    expectFail("region-forbidden-" + marker, (root) => {
      appendTo(root, REGION_POPUP_REL, '\nconst banned = "' + marker + '";\n');
    });
  }
  return REGION_REQUIRED_MARKERS.length + REGION_FORBIDDEN_MARKERS.length;
}

function runNonexistentRootMutation() {
  let failed = false;
  try {
    runContract(path.join(os.tmpdir(), "prodigy-color-guard-does-not-exist-" + Date.now()));
  } catch (error) {
    failed = true;
  }
  assert.ok(failed, "nonexistent root emitted false success");
}

function main() {
  if (process.argv.includes("--print-baseline")) {
    printBaseline();
    return;
  }

  for (const [label, mutate] of Object.entries(PASS_CASES)) {
    console.log("  PASS accepted: " + expectPass(label, mutate));
  }
  for (const [label, mutate] of Object.entries(FAIL_CASES)) {
    console.log("  PASS rejected: " + expectFail(label, mutate));
  }
  console.log("  PASS rejected: " + runRegionMarkerMutations() + " Region marker mutations");
  runNonexistentRootMutation();
  console.log("  PASS rejected: nonexistent-root");

  const live = runContract(VAULT_ROOT);
  console.log("  LIVE scanned=" + live.files + " js files, common chrome=" + live.chrome + " modules");
  console.log("Design color contract: OK");
}

try {
  main();
} finally {
  cleanupTempRoots();
}
