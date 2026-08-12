"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const LOADER_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-hub-loader.js");
const WORKOUT_HUB_PATH = path.join(ROOT, "HUB/30 Workout.md");

function loadFreshLoader() {
  delete require.cache[require.resolve(LOADER_PATH)];
  delete global.ProdigyHubLoader;
  return require(LOADER_PATH);
}

function createApp(modules, options = {}) {
  const files = new Map(Object.entries(modules));
  const unresolved = new Set(options.unresolved || []);
  return {
    vault: {
      getAbstractFileByPath(modulePath) {
        if (unresolved.has(modulePath) || !files.has(modulePath)) return null;
        return { path: modulePath };
      },
      read(tFile) {
        return Promise.resolve(files.get(tFile.path));
      }
    },
    resolveModule(modulePath, source) {
      files.set(modulePath, source);
      unresolved.delete(modulePath);
    }
  };
}

function readWorkoutHub() {
  return fs.readFileSync(WORKOUT_HUB_PATH, "utf8");
}

test("Given a module that has not synced to this device, When loadManifest runs, Then the failure is classified sync_pending rather than a code error", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const app = createApp(
    { "SYSTEM/Views/workout-core.js": "globalThis.__syncEvents=['core'];" },
    { unresolved: ["SYSTEM/Views/workout-fit-parser.js"] }
  );

  const result = await loader.loadManifest(app, {
    required: ["SYSTEM/Views/workout-core.js"],
    optional: ["SYSTEM/Views/workout-fit-parser.js"]
  });

  assert.deepEqual(result.loaded, ["SYSTEM/Views/workout-core.js"]);
  assert.equal(result.optional_failures.length, 1);
  const failure = result.optional_failures[0];
  assert.equal(failure.path, "SYSTEM/Views/workout-fit-parser.js");
  assert.equal(failure.code, "sync_pending");
  assert.match(failure.summary, /동기화/);
  assert.equal(result.sync_pending, true);
  delete global.__syncEvents;
});

test("Given a module that exists but throws, When loadManifest runs, Then it is not misreported as a sync problem", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const app = createApp({ "SYSTEM/Views/workout-core.js": "throw new Error('boom');" });

  const result = await loader.loadManifest(app, {
    required: ["SYSTEM/Views/workout-core.js"],
    optional: []
  });

  assert.equal(result.required_failures.length, 1);
  assert.equal(result.required_failures[0].code, "throw");
  assert.equal(result.sync_pending, false);
});

test("Given a sync_pending module that later arrives, When retry invalidates it, Then the recovered module loads without reloading prior successes", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__syncEvents = [];
  const app = createApp(
    { "SYSTEM/Views/workout-core.js": "globalThis.__syncEvents.push('core');" },
    { unresolved: ["SYSTEM/Views/workout-fit-parser.js"] }
  );

  const pending = await loader.loadManifest(app, {
    required: ["SYSTEM/Views/workout-core.js"],
    optional: ["SYSTEM/Views/workout-fit-parser.js"]
  });
  assert.equal(pending.sync_pending, true);

  app.resolveModule("SYSTEM/Views/workout-fit-parser.js", "globalThis.__syncEvents.push('fit');");
  loader.retry(["SYSTEM/Views/workout-fit-parser.js"]);
  const recovered = await loader.loadManifest(app, {
    required: ["SYSTEM/Views/workout-core.js"],
    optional: ["SYSTEM/Views/workout-fit-parser.js"]
  });

  assert.deepEqual(recovered.loaded, ["SYSTEM/Views/workout-fit-parser.js"]);
  assert.deepEqual(recovered.optional_failures, []);
  assert.equal(recovered.sync_pending, false);
  assert.deepEqual(global.__syncEvents, ["core", "fit"]);
  delete global.__syncEvents;
});

test("Given the Workout hub, When it loads modules, Then it mounts the closed shared contract and keeps visible recovery", () => {
  const hub = readWorkoutHub();

  assert.match(hub, /SYSTEM\/Views\/prodigy-hub-loader\.js/);
  assert.match(hub, /ProdigyHubLoader\.mountWorkspace/);
  assert.match(hub, /renderers:\s*\{\s*workout:\s*renderWorkout/);
  assert.match(hub, /renderLoaderError/);
  assert.match(hub, /동기화/);
  assert.match(hub, /prodigy-workout-hub-adoption-styles/);
  assert.doesNotMatch(hub, /@media\([^)]*(?:600|767)px/);
  assert.match(hub, /:focus-visible/);
  assert.match(hub, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(hub, /Workout resource not found/);
});

test("Given the Workout hub fails to load, When the error surface renders, Then it offers a retry path and names sync as the likely cause", () => {
  const hub = readWorkoutHub();

  assert.match(hub, /renderLoaderError/);
  assert.match(hub, /retry:/);
  assert.match(hub, /동기화/);
});

test("Given a consumer module captured a dependency as null on first load, When retry re-runs the manifest, Then the consumer is re-executed and sees the arrived dependency", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  delete global.__dep;
  delete global.__consumerSawDep;

  const app = createApp(
    {
      "consumer.js": "globalThis.__consumerSawDep = Boolean(globalThis.__dep);",
      "dep.js": "globalThis.__dep = { ready: true };"
    },
    { unresolved: ["dep.js"] }
  );

  const first = await loader.loadManifest(app, { required: ["consumer.js", "dep.js"], optional: [] });
  assert.equal(first.sync_pending, true);
  assert.equal(global.__consumerSawDep, false);

  app.resolveModule("dep.js", "globalThis.__dep = { ready: true };");
  loader.retry(["dep.js", "consumer.js"], { rerun_loaded: true });
  await loader.loadManifest(app, { required: ["dep.js", "consumer.js"], optional: [] });

  assert.equal(global.__consumerSawDep, true);
  delete global.__dep;
  delete global.__consumerSawDep;
});
