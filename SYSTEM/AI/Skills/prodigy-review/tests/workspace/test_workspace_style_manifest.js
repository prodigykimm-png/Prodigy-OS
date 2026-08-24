"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));
const manifestFixture = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json"));

const REQUIRED_STYLES = Object.freeze({
  reading: ["SYSTEM/Views/reading-styles.js"],
  workout: ["SYSTEM/Views/workout-styles.js"],
  project: ["SYSTEM/Views/project-styles.js"],
  knowledge: ["SYSTEM/Views/knowledge-styles.js"],
  personal: ["SYSTEM/Views/people-styles.js", "SYSTEM/Views/venue-styles.js"],
  journal: ["SYSTEM/Views/journal-styles.js"],
});
const HUB_PATHS = Object.freeze([
  "HUB/15 Region.md",
  "HUB/20 Reading.md",
  "HUB/30 Workout.md",
  "HUB/40 Project.md",
  "HUB/50 Knowledge.md",
  "HUB/60 Personal.md",
  "HUB/70 Journal.md",
]);

test("every non-Home workspace loads its owned style modules", () => {
  for (const [workspaceId, stylePaths] of Object.entries(REQUIRED_STYLES)) {
    const entry = manifest.get(workspaceId);
    for (const stylePath of stylePaths) {
      assert.ok(
        entry.required.includes(stylePath),
        `${workspaceId} manifest must load ${stylePath}`,
      );
      assert.ok(
        manifestFixture.entries[workspaceId].required.includes(stylePath),
        `${workspaceId} manifest fixture must load ${stylePath}`,
      );
    }
  }
});

test("RealObsidianHarness can open the Region workspace", () => {
  const harness = fs.readFileSync(
    path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js"),
    "utf8",
  );
  assert.match(harness, /\["region",\s*"HUB\/15 Region\.md"\]/);
  assert.match(harness, /trackedFilesUnder\("SYSTEM\/SCRIPTS"\)/);
  const regionHub = fs.readFileSync(path.join(ROOT, "HUB/15 Region.md"), "utf8");
  assert.match(regionHub, /"SYSTEM\/Views\/region-styles\.js"/);
});

test("compact and medium full-body workspaces delegate vertical scrolling to Obsidian", () => {
  const shell = fs.readFileSync(
    path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js"),
    "utf8",
  );
  assert.match(shell, /\[data-tier="compact"\],\s*\[data-tier="medium"\][\s\S]*data-workspace-id="workout"[\s\S]*data-workspace-id="knowledge"[\s\S]*data-workspace-id="personal"[\s\S]*data-workspace-id="region"[\s\S]*max-block-size:\s*none/);
  assert.match(shell, /data-workspace-id="region"[\s\S]*>\s*\.prodigy-app-shell-body\s*\{[\s\S]*overflow:\s*visible/);
  assert.match(shell, /data-tier="wide"[\s\S]*data-workspace-id="workout"[\s\S]*data-workspace-id="knowledge"[\s\S]*data-workspace-id="personal"[\s\S]*data-workspace-id="region"[\s\S]*max-block-size:\s*calc\(100dvb - var\(--header-height,\s*40px\)\)/);
  assert.match(shell, /\.markdown-preview-view\.prodigy-hub-note:has\([\s\S]*data-tier="wide"[\s\S]*data-workspace-id="region"[\s\S]*overflow-y:\s*hidden/);
});

test("every redesigned workspace opts into native Hub chrome", () => {
  for (const hubPath of HUB_PATHS) {
    const hub = fs.readFileSync(path.join(ROOT, hubPath), "utf8");
    assert.match(hub, /^cssclasses:\n(?:  - .+\n)*  - prodigy-hub-note$/m, hubPath);
  }
});
