"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/workspace-registry.js"));

assert.deepEqual(
  registry.items().map((item) => item.id),
  ["auction", "knowledge", "project", "reading", "workout", "journal", "personal"],
  "the compact Home dock has an explicit route for every current workspace"
);
assert.equal(registry.find("knowledge").path, "HUB/50 Knowledge.md");
assert.equal(registry.find("personal").path, "HUB/60 Personal.md");
assert.equal(registry.find("missing"), null);

const home = fs.readFileSync(path.join(ROOT, "HUB/00 Home.md"), "utf8");
assert.match(home, /workspace-registry\.js/, "Home loads the shared workspace registry before rendering the dock");
const homeView = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/home-view.js"), "utf8");
assert.match(homeView, /registry\.items\(\)/, "the compact Home dock reads its items from the registry");

[
  "HUB/10 Auction.md",
  "HUB/20 Reading.md",
  "HUB/30 Workout.md",
  "HUB/40 Project.md",
  "HUB/50 Knowledge.md",
  "HUB/60 Personal.md",
  "HUB/70 Journal.md"
].forEach((relative) => {
  const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
  assert.match(source, /workspace-navigation\.js/, relative + " loads shared Home navigation");
  assert.match(source, /ProdigyWorkspaceNavigation\.mount/, relative + " mounts a visible Home return action");
});

console.log("Workspace navigation contract tests passed");
