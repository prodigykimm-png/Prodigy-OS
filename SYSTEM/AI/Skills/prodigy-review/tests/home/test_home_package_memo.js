"use strict";

// Pins that a repeat Home render within the memo window reuses the package, so
// Dataview's second block run does not repeat the vault scans and the Todoist
// round-trip, while an explicit refresh and a new day still rebuild.

const assert = require("node:assert/strict");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../../../../../../");

global.globalThis = global;
global.window = global;
global.obsidian = {};
global.Notice = class Notice { constructor(msg) { this.msg = msg; } };

global.app = {
  vault: {
    getAbstractFileByPath: () => null,
    read: async () => "",
    getMarkdownFiles: () => [],
    adapter: { mkdir: async () => {} }
  }
};
global.dv = { pages: () => ({ where: () => [] }) };

require(path.join(rootDir, "SYSTEM/Views/morning-context-core.js"));
require(path.join(rootDir, "SYSTEM/Views/home-view.js"));

let calls = 0;
global.MorningContextCore.buildMorningPackage = async () => {
  calls += 1;
  return { schema_version: "morning-package-v1", build: calls };
};

(async () => {
  const resolve = global.HomeView.resolveMorningPackage;
  assert.strictEqual(typeof resolve, "function", "resolveMorningPackage must be exported for testing");

  const first = await resolve(global.app, global.dv, "2026-07-16", "", false);
  const second = await resolve(global.app, global.dv, "2026-07-16", "", false);
  assert.strictEqual(calls, 1, "a repeat render on the same day must reuse the package");
  assert.strictEqual(first, second, "the memo must return the same package object");

  const forced = await resolve(global.app, global.dv, "2026-07-16", "", true);
  assert.strictEqual(calls, 2, "an explicit refresh must rebuild");
  assert.notStrictEqual(forced, second);

  const nextDay = await resolve(global.app, global.dv, "2026-07-17", "", false);
  assert.strictEqual(calls, 3, "a new day must rebuild");
  assert.notStrictEqual(nextDay, forced);

  const cachedAgain = await resolve(global.app, global.dv, "2026-07-17", "", false);
  assert.strictEqual(calls, 3, "the new day's package must then be reused");
  assert.strictEqual(cachedAgain, nextDay);

  console.log("Home morning package memo test passed");
})();
