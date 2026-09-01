"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const HOME_VIEW_PATH = path.join(ROOT, "SYSTEM/Views/home-view.js");
const HOME_STYLES_PATH = path.join(ROOT, "SYSTEM/Views/home-styles.js");
const MANIFEST_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js");

function freshManifest() {
  delete require.cache[require.resolve(MANIFEST_PATH)];
  delete global.ProdigyWorkspaceManifest;
  return require(MANIFEST_PATH).get("home");
}

function main() {
  const source = fs.readFileSync(HOME_VIEW_PATH, "utf8");
  const styles = fs.readFileSync(HOME_STYLES_PATH, "utf8");
  const manifest = freshManifest();

  assert.equal(
    manifest.required.includes("SYSTEM/Views/morning-brief-service.js")
      || manifest.optional.includes("SYSTEM/Views/morning-brief-service.js"),
    false,
    "Home must not load the removed Morning Brief provider service."
  );
  assert.doesNotMatch(
    source,
    /\b(?:generateMorningBrief|MorningBriefService)\b/u,
    "Home must not retain a Morning Brief provider call seam."
  );
  assert.doesNotMatch(
    source,
    /MorningCache\.(?:getDailyCache|saveDailyCache|checkIsStale)\b/u,
    "Home must not cache removed provider-generated Morning results."
  );
  assert.doesNotMatch(
    source,
    /\bresult\.focus\b|\bcached\.result\b/u,
    "Home queues must not consume hidden Morning Brief focus results."
  );
  assert.doesNotMatch(
    source,
    /home-brief(?:-|\b)/u,
    "Home must not render the removed Morning Brief surface."
  );
  assert.doesNotMatch(
    styles,
    /\.home-brief(?:-|\b)/u,
    "Home styles must not retain removed Morning Brief selectors."
  );

  console.log("Home Morning Brief removal test passed");
}

main();
