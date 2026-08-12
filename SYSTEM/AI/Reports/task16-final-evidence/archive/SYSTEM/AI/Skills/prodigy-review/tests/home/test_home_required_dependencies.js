"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MANIFEST_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js");
const LOADER_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-hub-loader.js");
const FIXTURE_PATH = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json");
const HOME_VIEW_PATH = path.join(ROOT, "SYSTEM/Views/home-view.js");
const REQUIRED_SEAMS = Object.freeze([
  "SYSTEM/Views/home-model.js",
  "SYSTEM/Views/home-controller.js",
  "SYSTEM/Views/home-sections.js"
]);

function assertHomeSeamOrder(entry) {
  const required = entry && entry.required || [];
  const homeViewIndex = required.indexOf("SYSTEM/Views/home-view.js");
  assert.ok(homeViewIndex >= 0, "Home view must remain required");
  const indexes = REQUIRED_SEAMS.map((modulePath) => {
    assert.equal(required.filter((candidate) => candidate === modulePath).length, 1, `${modulePath} must be required exactly once`);
    assert.equal((entry.optional || []).includes(modulePath), false, `${modulePath} must never be optional`);
    return required.indexOf(modulePath);
  });
  assert.deepEqual(indexes, [homeViewIndex - 3, homeViewIndex - 2, homeViewIndex - 1], "Home seams must load in model/controller/sections order immediately before home-view");
}

function testManifestMutationsRed() {
  delete require.cache[require.resolve(MANIFEST_PATH)];
  delete global.ProdigyWorkspaceManifest;
  const production = require(MANIFEST_PATH).get("home");
  const frozen = require(FIXTURE_PATH).entries.home;
  assertHomeSeamOrder(production);
  assertHomeSeamOrder(frozen);
  assert.deepEqual(JSON.parse(JSON.stringify(production)), frozen);

  const omitted = { ...frozen, required: frozen.required.filter((modulePath) => modulePath !== REQUIRED_SEAMS[1]) };
  assert.throws(() => assertHomeSeamOrder(omitted), /home-controller\.js must be required exactly once/);

  const reorderedPaths = frozen.required.slice();
  const modelIndex = reorderedPaths.indexOf(REQUIRED_SEAMS[0]);
  const controllerIndex = reorderedPaths.indexOf(REQUIRED_SEAMS[1]);
  [reorderedPaths[modelIndex], reorderedPaths[controllerIndex]] = [reorderedPaths[controllerIndex], reorderedPaths[modelIndex]];
  assert.throws(() => assertHomeSeamOrder({ ...frozen, required: reorderedPaths }), /model\/controller\/sections order/);

  const source = fs.readFileSync(HOME_VIEW_PATH, "utf8");
  REQUIRED_SEAMS.forEach((modulePath) => {
    assert.equal(source.includes(`loadOptionalProdigyScript(app, "${modulePath}"`), false, `${modulePath} is loader-owned, not dynamically optional`);
  });
}

class Node {
  constructor(options = {}) {
    this.children = [];
    this.parentElement = null;
    this.attributes = Object.assign({}, options.attr || {});
    this.listeners = new Map();
    this.textContent = options.text || "";
  }
  createEl(_tag, options) { const child = new Node(options); child.parentElement = this; this.children.push(child); return child; }
  empty() { this.children.forEach((child) => { child.parentElement = null; }); this.children = []; this.textContent = ""; }
  remove() { if (!this.parentElement) return; this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type, callback) { if (this.listeners.get(type) === callback) this.listeners.delete(type); }
}

async function testMissingRequiredRecovery() {
  const manifests = global.ProdigyWorkspaceManifest || require(MANIFEST_PATH);
  const manifest = manifests.get("home");
  for (const missingPath of REQUIRED_SEAMS) {
    delete require.cache[require.resolve(LOADER_PATH)];
    delete global.ProdigyHubLoader;
    const loader = require(LOADER_PATH);
    loader.resetLoaded();
    const files = new Map(manifest.required.map((modulePath) => [modulePath, ""]));
    files.delete(missingPath);
    const reads = [];
    const app = { vault: {
      getAbstractFileByPath(modulePath) { return files.has(modulePath) ? { path: modulePath } : null; },
      async read(file) { reads.push(file.path); return files.get(file.path); }
    } };
    const host = new Node();
    let rendererCalls = 0;
    let recoveryError;
    try {
      await loader.mountWorkspace(app, manifest, { container: host, renderers: { home() { rendererCalls += 1; } } });
    } catch (error) {
      recoveryError = error;
    }
    assert.ok(recoveryError && recoveryError.prodigyRequiredRecovery, `${missingPath} must use structured required recovery`);
    assert.equal(recoveryError.failure.path, missingPath);
    assert.equal(rendererCalls, 0, "renderer must not run with a missing required Home seam");
    assert.equal(host.children[0].attributes.class, "prodigy-required-recovery");

    files.set(missingPath, "");
    const mounted = await recoveryError.retry();
    assert.ok(mounted && mounted.manifest === manifest, `${missingPath} retry must mount Home`);
    assert.equal(rendererCalls, 1);
    assert.equal(reads.filter((modulePath) => modulePath === missingPath).length, 1, "retry reads the restored seam exactly once");
    manifest.required.filter((modulePath) => modulePath !== missingPath).forEach((modulePath) => {
      assert.equal(reads.filter((readPath) => readPath === modulePath).length, 1, `${modulePath} remains cached across seam retry`);
    });
    mounted.dispose();
  }
}

async function main() {
  testManifestMutationsRed();
  await testMissingRequiredRecovery();
  console.log("Home required dependency tests passed");
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
