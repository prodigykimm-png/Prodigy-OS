"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const LOADER_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-hub-loader.js");

function loadFreshLoader() {
  delete require.cache[require.resolve(LOADER_PATH)];
  delete global.ProdigyHubLoader;
  return require(LOADER_PATH);
}

function loadMutatedLoader(mutate) {
  const source = mutate(fs.readFileSync(LOADER_PATH, "utf8"));
  const compiled = new Module(LOADER_PATH, module);
  compiled.filename = LOADER_PATH;
  compiled.paths = Module._nodeModulePaths(path.dirname(LOADER_PATH));
  delete global.ProdigyHubLoader;
  compiled._compile(source, LOADER_PATH);
  return compiled.exports;
}

function createApp(modules, options = {}) {
  const files = new Map(Object.entries(modules));
  const reads = [];
  const missing = new Set(options.missing || []);
  const pendingReads = new Map();
  const app = {
    vault: {
      getAbstractFileByPath(modulePath) {
        if (missing.has(modulePath) || !files.has(modulePath)) return null;
        return { path: modulePath };
      },
      read(tFile) {
        reads.push(tFile.path);
        const source = files.get(tFile.path);
        const promise = Promise.resolve(source);
        pendingReads.set(tFile.path, promise);
        return promise;
      }
    },
    setModule(modulePath, source) {
      files.set(modulePath, source);
      missing.delete(modulePath);
    },
    removeModule(modulePath) {
      files.delete(modulePath);
      missing.add(modulePath);
    },
    reads
  };
  return app;
}

function createHeldReadApp(modules) {
  const files = new Map(Object.entries(modules));
  const reads = [];
  const heldReads = [];
  return {
    vault: {
      getAbstractFileByPath(modulePath) {
        if (!files.has(modulePath)) return null;
        return { path: modulePath };
      },
      read(tFile) {
        reads.push(tFile.path);
        const source = files.get(tFile.path);
        let resolveRead;
        const promise = new Promise((resolve) => { resolveRead = resolve; });
        heldReads.push({ path: tFile.path, source, resolve: () => resolveRead(source) });
        return promise;
      }
    },
    reads,
    heldReads,
    setModule(modulePath, source) {
      files.set(modulePath, source);
    }
  };
}

function moduleSource(label) {
  return `globalThis.__hubEvents.push("${label}");`;
}

function throwingModuleSource(secret) {
  return `throw new Error("boom ${secret}");`;
}

function manifestFailureShape(failure, expectedPath) {
  assert.equal(failure.path, expectedPath);
  assert.equal(typeof failure.summary, "string");
  assert.match(failure.summary, /로드 실패|없습니다|실행 실패|입력 오류/);
  assert.doesNotMatch(failure.summary, /TOP_SECRET|globalThis\.__hubEvents|throw new Error/);
}

test("Given legacy loadScripts, When a missing module appears between valid modules, Then observable execution stays sequential and rejects after continuing", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "B.js": moduleSource("B")
  });

  await assert.rejects(
    () => loader.loadScripts(app, ["A.js", "missing.js", "B.js"]),
    (err) => {
      assert.match(err.message, /Hub loader: 1개 모듈 로드 실패/);
      assert.deepEqual(err.errors.map((failure) => failure.path), ["missing.js"]);
      return true;
    }
  );

  assert.deepEqual(global.__hubEvents, ["A", "B"]);
  assert.deepEqual(app.reads, ["A.js", "B.js"]);
  assert.equal(loader.isLoaded("A.js"), true);
  assert.equal(loader.isLoaded("B.js"), true);
  delete global.__hubEvents;
});

test("Given required and optional manifest paths, When loadManifest runs, Then modules execute once in required-before-optional order", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "B.js": moduleSource("B"),
    "C.js": moduleSource("C")
  });

  const result = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });

  assert.deepEqual(global.__hubEvents, ["A", "B", "C"]);
  assert.deepEqual(result.loaded, ["A.js", "B.js", "C.js"]);
  assert.deepEqual(result.required_failures, []);
  assert.deepEqual(result.optional_failures, []);
  assert.equal(Number.isInteger(result.attempt_id), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.loaded), true);
  delete global.__hubEvents;
});

test("Given duplicate required and optional paths, When loadManifest runs, Then duplicates are suppressed across the manifest", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "B.js": moduleSource("B"),
    "C.js": moduleSource("C")
  });

  const result = await loader.loadManifest(app, {
    required: ["A.js", "B.js", "A.js"],
    optional: ["B.js", "C.js", "C.js"]
  });

  assert.deepEqual(global.__hubEvents, ["A", "B", "C"]);
  assert.deepEqual(app.reads, ["A.js", "B.js", "C.js"]);
  assert.deepEqual(result.loaded, ["A.js", "B.js", "C.js"]);
  delete global.__hubEvents;
});

test("Given a missing optional module, When loadManifest runs, Then it reports optional failure and preserves loaded required modules", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({ "A.js": moduleSource("A"), "C.js": moduleSource("C") });

  const result = await loader.loadManifest(app, {
    required: ["A.js"],
    optional: ["missing.js", "C.js"]
  });

  assert.deepEqual(global.__hubEvents, ["A", "C"]);
  assert.deepEqual(result.loaded, ["A.js", "C.js"]);
  assert.deepEqual(result.required_failures, []);
  assert.equal(result.optional_failures.length, 1);
  manifestFailureShape(result.optional_failures[0], "missing.js");
  delete global.__hubEvents;
});

test("Given a missing required module, When loadManifest runs, Then it returns a safe failure and does not start optional work", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({ "A.js": moduleSource("A"), "C.js": moduleSource("C") });

  const result = await loader.loadManifest(app, {
    required: ["A.js", "missing.js"],
    optional: ["C.js"]
  });

  assert.deepEqual(global.__hubEvents, ["A"]);
  assert.deepEqual(result.loaded, ["A.js"]);
  assert.equal(result.required_failures.length, 1);
  manifestFailureShape(result.required_failures[0], "missing.js");
  assert.deepEqual(result.optional_failures, []);
  delete global.__hubEvents;
});

test("Given a module throws during evaluation, When loadManifest runs, Then the structured failure exposes path and safe summary only", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "throw.js": throwingModuleSource("TOP_SECRET"),
    "C.js": moduleSource("C")
  });

  const result = await loader.loadManifest(app, {
    required: ["A.js", "throw.js"],
    optional: ["C.js"]
  });

  assert.deepEqual(global.__hubEvents, ["A"]);
  assert.equal(result.required_failures.length, 1);
  manifestFailureShape(result.required_failures[0], "throw.js");
  delete global.__hubEvents;
});

test("Given a failed module is restored, When retry invalidates the path, Then only that module executes on the next manifest load", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "B.js": throwingModuleSource("TOP_SECRET"),
    "C.js": moduleSource("C")
  });

  const failed = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });
  assert.deepEqual(failed.loaded, ["A.js"]);
  assert.equal(failed.required_failures.length, 1);
  app.setModule("B.js", moduleSource("B"));
  const stillCached = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });
  assert.equal(stillCached.required_failures.length, 1);
  assert.deepEqual(global.__hubEvents, ["A"]);
  const retryResult = loader.retry(["B.js"]);
  const recovered = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });

  assert.deepEqual(retryResult.invalidated, ["B.js"]);
  assert.deepEqual(global.__hubEvents, ["A", "B", "C"]);
  assert.deepEqual(recovered.loaded, ["B.js", "C.js"]);
  assert.deepEqual(recovered.required_failures, []);
  assert.deepEqual(recovered.optional_failures, []);
  delete global.__hubEvents;
});

test("Given a missing required module is restored, When retry invalidates the path, Then the recovered module executes without reloading prior successes", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "C.js": moduleSource("C")
  });

  const missing = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });
  app.setModule("B.js", moduleSource("B"));
  const retryResult = loader.retry(["B.js"]);
  const recovered = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });

  assert.deepEqual(missing.loaded, ["A.js"]);
  assert.deepEqual(missing.required_failures.map((failure) => failure.path), ["B.js"]);
  assert.deepEqual(retryResult.invalidated, ["B.js"]);
  assert.deepEqual(global.__hubEvents, ["A", "B", "C"]);
  assert.deepEqual(recovered.loaded, ["B.js", "C.js"]);
  assert.deepEqual(recovered.required_failures, []);
  delete global.__hubEvents;
});

test("Given concurrent callers request the same module, When loadManifest runs in parallel, Then read and evaluation are de-duplicated in flight", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "B.js": moduleSource("B"),
    "C.js": moduleSource("C")
  });

  const [first, second] = await Promise.all([
    loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] }),
    loader.loadManifest(app, { required: ["B.js"], optional: ["C.js"] })
  ]);

  assert.deepEqual(global.__hubEvents, ["A", "B", "C"]);
  assert.deepEqual(app.reads, ["A.js", "B.js", "C.js"]);
  assert.deepEqual(first.required_failures, []);
  assert.deepEqual(second.required_failures, []);
  delete global.__hubEvents;
});

test("Given an older failed attempt resolves after a newer retry succeeds, When both finish, Then stale failure state does not overwrite the newer loaded state", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createHeldReadApp({ "A.js": throwingModuleSource("TOP_SECRET") });

  const older = loader.loadManifest(app, { required: ["A.js"], optional: [] });
  await Promise.resolve();
  app.setModule("A.js", moduleSource("A"));
  loader.retry(["A.js"]);
  const newerPromise = loader.loadManifest(app, { required: ["A.js"], optional: [] });
  await Promise.resolve();
  app.heldReads[1].resolve();
  const newer = await newerPromise;
  app.heldReads[0].resolve();
  const olderResult = await older;
  const afterStale = await loader.loadManifest(app, { required: ["A.js"], optional: [] });

  assert.deepEqual(newer.loaded, ["A.js"]);
  assert.deepEqual(newer.required_failures, []);
  assert.equal(olderResult.required_failures.length, 1);
  assert.equal(loader.isLoaded("A.js"), true);
  assert.deepEqual(afterStale.required_failures, []);
  assert.deepEqual(global.__hubEvents, ["A"]);
  delete global.__hubEvents;
});

test("Given an in-flight read is retried before it resolves, When newer source succeeds and older valid source resolves later, Then only newer source executes and stale result is not loaded", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createHeldReadApp({ "A.js": moduleSource("old") });

  const older = loader.loadManifest(app, { required: ["A.js"], optional: [] });
  await Promise.resolve();
  assert.deepEqual(app.reads, ["A.js"]);
  app.setModule("A.js", moduleSource("new"));
  const retryResult = loader.retry(["A.js"]);
  const newer = loader.loadManifest(app, { required: ["A.js"], optional: [] });
  await Promise.resolve();
  assert.deepEqual(app.reads, ["A.js", "A.js"]);
  app.heldReads[1].resolve();
  const newerResult = await newer;
  app.heldReads[0].resolve();
  const olderResult = await older;
  const cachedResult = await loader.loadManifest(app, { required: ["A.js"], optional: [] });

  assert.deepEqual(retryResult.invalidated, ["A.js"]);
  assert.deepEqual(global.__hubEvents, ["new"]);
  assert.deepEqual(newerResult.loaded, ["A.js"]);
  assert.deepEqual(newerResult.required_failures, []);
  assert.deepEqual(olderResult.loaded, []);
  assert.deepEqual(olderResult.required_failures.map((failure) => failure.path), ["A.js"]);
  assert.equal(loader.isLoaded("A.js"), true);
  assert.deepEqual(cachedResult.loaded, []);
  assert.deepEqual(cachedResult.required_failures, []);
  delete global.__hubEvents;
});

test("Given one failed cached path and one loaded path, When retry receives both, Then it invalidates failed entries only", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({
    "A.js": moduleSource("A"),
    "B.js": throwingModuleSource("TOP_SECRET")
  });

  const failed = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: [] });
  assert.deepEqual(failed.loaded, ["A.js"]);
  const retryResult = loader.retry(["A.js", "B.js", "missing.js"]);
  app.setModule("B.js", moduleSource("B"));
  const recovered = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: [] });

  assert.deepEqual(retryResult.invalidated, ["B.js"]);
  assert.deepEqual(global.__hubEvents, ["A", "B"]);
  assert.deepEqual(recovered.loaded, ["B.js"]);
  assert.deepEqual(recovered.required_failures, []);
  delete global.__hubEvents;
});

test("Given malformed manifest inputs, When loadManifest runs, Then it fails closed with structured required failure", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const app = createApp({});

  const result = await loader.loadManifest(app, { required: ["A.js", ""], optional: [null] });
  const malformedManifest = await loader.loadManifest(app, null);
  const nonArrayManifest = await loader.loadManifest(app, { required: "A.js", optional: "C.js" });

  assert.deepEqual(result.loaded, []);
  assert.equal(result.required_failures.length, 1);
  assert.deepEqual(result.required_failures.map((failure) => failure.path), ["A.js"]);
  assert.equal(result.optional_failures.length, 0);
  assert.deepEqual(malformedManifest.required_failures.map((failure) => failure.path), ["<invalid>"]);
  assert.deepEqual(nonArrayManifest.required_failures.map((failure) => failure.path), ["<invalid>"]);
  assert.deepEqual(nonArrayManifest.optional_failures, []);
});

test("Given legacy loadScript, When a module is already loaded, Then the API resolves without reading or executing it again", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({ "A.js": moduleSource("A") });

  await loader.loadScript(app, "A.js");
  await loader.loadScript(app, "A.js");

  assert.deepEqual(global.__hubEvents, ["A"]);
  assert.deepEqual(app.reads, ["A.js"]);
  assert.equal(loader.isLoaded("A.js"), true);
  delete global.__hubEvents;
});
test("Given optional recorder hooks, When modules load, Then evaluation and outcome hooks stay ordered and source-independent", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const events = [];
  const app = createApp({ "A.js": moduleSource("A") });
  const recorder = {
    onModuleEvaluationStart(event) { events.push([event.type, event.path, Object.prototype.hasOwnProperty.call(event, "content")]); },
    onModuleEvaluationEnd(event) { events.push([event.type, event.path, event.ok]); },
    onLoadOutcome(event) { events.push([event.type, event.path, event.outcome, event.code || null]); }
  };

  const result = await loader.loadManifest(app, { required: ["A.js"], optional: [] }, { recorder, attempt_id: 44 });

  assert.deepEqual(result.loaded, ["A.js"]);
  assert.deepEqual(events, [
    ["module_evaluation_start", "A.js", false],
    ["module_evaluation_end", "A.js", true],
    ["load_outcome", "A.js", "loaded", null]
  ]);
  delete global.__hubEvents;
});

test("Given a cached module and a failed module, When retry is requested, Then recorder observes cache, retry, and fresh evaluation without changing loaded order", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const events = [];
  const app = createApp({ "A.js": moduleSource("A"), "B.js": throwingModuleSource("secret") });
  const recorder = {
    onLoadOutcome(event) { events.push(["outcome", event.path, event.outcome, event.cached]); },
    onRetry(event) { events.push(["retry", event.paths, event.invalidated]); },
    onModuleEvaluationStart(event) { events.push(["start", event.path]); }
  };

  await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: [] }, { recorder });
  await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: [] }, { recorder });
  app.setModule("B.js", moduleSource("B"));
  const retry = loader.retry(["B.js"], { recorder });
  const recovered = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: [] }, { recorder });

  assert.deepEqual(retry.invalidated, ["B.js"]);
  assert.deepEqual(recovered.loaded, ["B.js"]);
  assert.deepEqual(events.filter((event) => event[0] === "retry"), [["retry", ["B.js"], ["B.js"]]]);
  assert.equal(events.some((event) => event[0] === "outcome" && event[1] === "A.js" && event[2] === "cached" && event[3] === true), true);
  assert.equal(events.filter((event) => event[0] === "start" && event[1] === "B.js").length, 2);
  delete global.__hubEvents;
});

test("Given a pending and then stale attempt, When retry changes the module version, Then recorder receives specialized status hooks without source data", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const events = [];
  const app = createHeldReadApp({ "A.js": moduleSource("old") });
  const recorder = {
    onSyncPending(event) { events.push(["sync_pending", event.path, Object.prototype.hasOwnProperty.call(event, "content")]); },
    onStale(event) { events.push(["stale", event.path, event.code]); },
    onLoadOutcome(event) { events.push(["outcome", event.path, event.outcome]); }
  };

  const pendingApp = createApp({});
  const pending = await loader.loadManifest(pendingApp, { required: ["missing.js"], optional: [] }, { recorder });
  const older = loader.loadManifest(app, { required: ["A.js"], optional: [] }, { recorder });
  await Promise.resolve();
  loader.retry(["A.js"], { recorder });
  app.heldReads[1] && app.heldReads[1].resolve();
  const newer = loader.loadManifest(app, { required: ["A.js"], optional: [] }, { recorder });
  await Promise.resolve();
  if (app.heldReads[1]) app.heldReads[1].resolve();
  if (app.heldReads[0]) app.heldReads[0].resolve();
  await Promise.all([older, newer]);

  assert.equal(pending.sync_pending, true);
  assert.deepEqual(events.filter((event) => event[0] === "sync_pending"), [["sync_pending", "missing.js", false]]);
  assert.equal(events.some((event) => event[0] === "stale" && event[1] === "A.js"), true);
});

test("Given a mount scope with timers, listeners, observers, and custom cleanup, When disposed twice, Then every resource is released once and guarded callbacks stop", () => {
  const lifecycle = require(path.join(ROOT, "SYSTEM/Views/prodigy-mount-lifecycle.js"));
  const listeners = [];
  const intervals = new Map();
  const timeouts = new Map();
  let nextTimer = 1;
  const observer = { disconnectCount: 0, disconnect() { this.disconnectCount += 1; } };
  const host = {
    addEventListener(type, handler) { listeners.push({ type, handler }); },
    removeEventListener(type, handler) {
      const index = listeners.findIndex((item) => item.type === type && item.handler === handler);
      if (index !== -1) listeners.splice(index, 1);
    },
    setInterval(callback) { const id = nextTimer++; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback) { const id = nextTimer++; timeouts.set(id, callback); return id; },
    clearTimeout(id) { timeouts.delete(id); }
  };
  const scope = lifecycle.createMountScope(host);
  let intervalTicks = 0;
  let cleanups = 0;
  scope.listen("change", () => {});
  scope.observe(observer);
  scope.track(() => { cleanups += 1; });
  scope.interval(() => { intervalTicks += 1; }, 1);
  scope.timeout(() => { intervalTicks += 1000; }, 1);
  const guarded = scope.guard(() => { intervalTicks += 100; });

  intervals.forEach((callback) => callback());
  const beforeDispose = intervalTicks;
  assert.equal(beforeDispose, 1);
  assert.equal(scope.signal.aborted, false);
  scope.dispose();
  scope.dispose();
  guarded();
  intervals.forEach((callback) => callback());

  assert.equal(scope.signal.aborted, true);
  assert.equal(scope.disposed, true);
  assert.equal(intervalTicks, beforeDispose);
  assert.equal(intervals.size, 0);
  assert.equal(timeouts.size, 0);
  assert.equal(listeners.length, 0);
  assert.equal(observer.disconnectCount, 1);
  assert.equal(cleanups, 1);
});

test("Given an optional measurement module is missing, When a workspace mount settles, Then the historical bounded failure ledger is preserved", async () => {
  const manifests = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));
  const manifest = manifests.get("workout");
  const modules = Object.fromEntries(manifest.required.concat(manifest.optional).map((modulePath) => [modulePath, ""]));
  delete modules["SYSTEM/Views/prodigy-workspace-measurement.js"];
  const loader = loadFreshLoader();
  loader.resetLoaded();
  delete global.__prodigyMeasurementLoadFailures;
  const app = createApp(modules);
  const host = { empty() {}, createEl() { return { addEventListener() {}, removeEventListener() {}, setAttribute() {} }; } };
  const mounted = await loader.mountWorkspace(app, manifest, { container: host, renderers: { workout() {} } });
  await mounted.optional_ready;
  assert.deepEqual(global.__prodigyMeasurementLoadFailures.map(({ path, code }) => ({ path, code })), [{
    path: "SYSTEM/Views/prodigy-workspace-measurement.js",
    code: "sync_pending"
  }]);
  delete global.__prodigyMeasurementLoadFailures;
});

test("Given a required registry evaluated without its global, When the renderer requests recovery, Then the shared loader re-evaluates only that required path", async () => {
  const manifests = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));
  const manifest = manifests.get("home");
  const modules = Object.fromEntries(manifest.required.map((modulePath) => [modulePath, ""]));
  const registryPath = "SYSTEM/Views/display-registry.js";
  const loader = loadFreshLoader();
  loader.resetLoaded();
  delete global.__displayRecovered;
  const app = createApp(modules);
  const originalRead = app.vault.read;
  app.vault.read = (file) => {
    if (file.path !== registryPath) return originalRead(file);
    app.reads.push(file.path);
    const count = app.reads.filter((item) => item === registryPath).length;
    return Promise.resolve(count === 1 ? "" : "globalThis.__displayRecovered = true;");
  };
  const host = { empty() {}, createEl() { return { addEventListener() {}, removeEventListener() {}, setAttribute() {} }; } };
  await loader.mountWorkspace(app, manifest, { container: host, renderers: { home: async (context) => {
    if (!global.__displayRecovered) await context.reloadRequired(registryPath);
  } } });
  assert.equal(global.__displayRecovered, true);
  assert.equal(app.reads.filter((item) => item === registryPath).length, 2);
  assert.equal(app.reads.filter((item) => item !== registryPath).length, manifest.required.length - 1);
  delete global.__displayRecovered;
});

test("a session present before loading instruments actual loader evaluation through measureModule", async () => {
  const loader = loadFreshLoader();
  const measured = [];
  global.__prodigyMeasurementEntry = {
    workspaceId: "auction",
    session: { available: true, measureModule(modulePath, operation) { measured.push(modulePath); return operation(); } }
  };
  const app = createApp({ "required.js": "required", "optional.js": "optional" });
  const result = await loader.loadManifest(app, { required: ["required.js"], optional: ["optional.js"] }, { evaluate() {} });
  assert.deepEqual(result.required_failures, []);
  assert.deepEqual(result.optional_failures, []);
  assert.deepEqual(measured, ["required.js", "optional.js"]);
  delete global.__prodigyMeasurementEntry;
});

test("global-IIFE evaluation does not inherit Obsidian's CommonJS require", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const previousGlobalRequire = global.require;
  global.require = function unexpectedObsidianRequire() { throw new Error("plugin-relative require must stay unreachable"); };
  delete global.__globalIifeLoaded;
  try {
    const app = createApp({ "global-iife.js": "if (typeof require !== 'undefined') require('./wrong-plugin-relative-path.js'); globalThis.__globalIifeLoaded = true;" });
    const result = await loader.loadManifest(app, { required: ["global-iife.js"], optional: [] });
    assert.deepEqual(result.required_failures, []);
    assert.equal(global.__globalIifeLoaded, true);
  } finally {
    if (previousGlobalRequire === undefined) delete global.require; else global.require = previousGlobalRequire;
    delete global.__globalIifeLoaded;
  }
});

test("two exact block containers in one markdown leaf have one CAS shell owner and stale disposal cannot remove it", async () => {
  async function scenario(loader) {
    loader.resetLoaded();
    const owner = {};
    const shells = [];
    const container = (identity) => ({ identity, closest(selector) { return selector === ".workspace-leaf-content" ? owner : null; } });
    const firstContainer = container("first");
    const secondContainer = container("second");
    const app = createApp({});
    global.ProdigyWorkspaceManifest = { validate() { return true; } };
    const manifest = { workspaceId: "home", host: "dataviewjs", required: [], optional: [], renderer: "home" };
    const options = (host) => ({ container: host, renderers: { home() {
      const shell = { owner: host.identity };
      shells.push(shell);
      return { dispose() { const index = shells.indexOf(shell); if (index >= 0) shells.splice(index, 1); } };
    } } });
    const first = await loader.mountWorkspace(app, manifest, options(firstContainer));
    const second = await loader.mountWorkspace(app, manifest, options(secondContainer));
    assert.equal(second, first, "same-generation replacement adopts the live mount identity");
    assert.equal(first.scope.disposed, false, "replacement processor cannot abort the live owner");
    assert.deepEqual(shells.map((shell) => shell.owner), ["first"]);
    assert.equal(loader.currentWorkspace(secondContainer), null, "replacement container never gains disposal authority");
    assert.equal(loader.disposeWorkspace(secondContainer), false, "replacement disposal cannot remove the current shell");
    assert.deepEqual(shells.map((shell) => shell.owner), ["first"]);
    assert.equal(loader.disposeWorkspace(firstContainer), true);
    assert.deepEqual(shells, []);
  }

  try {
    await scenario(loadFreshLoader());
    const containerOwned = loadMutatedLoader((source) => source.replace("var owner = mountOwner(container);", "var owner = container;"));
    await assert.rejects(() => scenario(containerOwned), /same-generation replacement adopts the live mount identity|Expected values to be strictly equal/,
      "toggling stable-leaf ownership back to transient containers must be RED");
  } finally {
    delete global.ProdigyWorkspaceManifest;
    delete global.ProdigyHubLoader;
  }
});

test("same-Hub block replacement reconnects exactly once while a real file change still disposes", async () => {
  async function scenario(loader) {
    loader.resetLoaded();
    global.ProdigyWorkspaceManifest = { validate() { return true; } };
    let activePath = "HUB/00 Home.md";
    let observer = null;
    const owner = {
      isConnected: true,
      contains(node) { return node.parentElement === this; },
      appendChild(node) { node.parentElement = this; node.isConnected = true; return node; },
    };
    const documentRef = {
      body: owner,
      defaultView: { MutationObserver: class {
        constructor(callback) { this.callback = callback; observer = this; }
        observe() {}
        disconnect() {}
      } },
    };
    const container = { ownerDocument: documentRef, parentElement: owner, isConnected: true, closest() { return owner; } };
    const app = {
      vault: { getAbstractFileByPath() { return null; }, read() { return Promise.resolve(""); } },
      workspace: {
        getActiveFile() { return { path: activePath }; },
        on() { return null; },
        offref() {},
      },
    };
    const manifest = { workspaceId: "home", host: "dataviewjs", required: [], optional: [], renderer: "home" };
    const mounted = await loader.mountWorkspace(app, manifest, { container, renderers: { home() { return {}; } } });
    assert.ok(observer, "production removal observer installed");

    container.parentElement = null;
    container.isConnected = false;
    observer.callback([]);
    assert.equal(container.parentElement, owner, "same active Hub reconnects its exact block");
    assert.equal(container.isConnected, true);
    assert.equal(mounted.scope.disposed, false);

    activePath = "HUB/10 Auction.md";
    container.parentElement = null;
    container.isConnected = false;
    observer.callback([]);
    assert.equal(mounted.scope.disposed, true, "real navigation disposes instead of reconnecting stale UI");
  }

  try {
    await scenario(loadFreshLoader());
    const reconnectRemoved = loadMutatedLoader((source) => source.replace("if (container.isConnected === false || !nextOwner.contains(container)) nextOwner.appendChild(container);", "if (container.isConnected === false || !nextOwner.contains(container)) return;"));
    await assert.rejects(() => scenario(reconnectRemoved), /same active Hub reconnects its exact block/,
      "removing the production reconnect transfer must make the lifecycle test RED");
  } finally {
    delete global.ProdigyWorkspaceManifest;
    delete global.ProdigyHubLoader;
  }
});

test("mount closure joins late optional modules and every returned optional callback promise before publication", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.ProdigyWorkspaceManifest = { validate() { return true; } };
  delete global.__prodigyMeasurementEntry;
  let resolveOptional;
  const optionalRead = new Promise((resolve) => { resolveOptional = resolve; });
  const app = { vault: {
    getAbstractFileByPath: (modulePath) => ({ path: modulePath }),
    read: (file) => file.path === "measurement.js" ? optionalRead : Promise.resolve("required")
  } };
  const manifest = { workspaceId: "auction", host: "dataviewjs", required: ["required.js"], optional: ["measurement.js"], renderer: "auction" };
  const container = {};
  let rendererRan = false;
  let signalRendererStarted;
  const rendererStarted = new Promise((resolve) => { signalRendererStarted = resolve; });
  let optionalResult = null;
  let releaseCallback;
  let signalCallbackStarted;
  let published = false;
  const callbackPending = new Promise((resolve) => { releaseCallback = resolve; });
  const callbackStarted = new Promise((resolve) => { signalCallbackStarted = resolve; });
  const mountPromise = loader.mountWorkspace(app, manifest, {
    container,
    evaluate(_source, modulePath) {
      if (modulePath === "measurement.js") global.__prodigyMeasurementEntry = { workspaceId: "auction", session: { available: true, measureModule(_path, operation) { return operation(); } } };
    },
    renderers: { auction(context) { rendererRan = true; signalRendererStarted(); context.onOptionalReady(async (result) => { optionalResult = result; signalCallbackStarted(); await callbackPending; published = true; }); return {}; } }
  });
  await rendererStarted;
  assert.equal(rendererRan, true);
  assert.equal(optionalResult, null);
  resolveOptional("measurement");
  await callbackStarted;
  assert.deepEqual(optionalResult.optional_failures, []);
  assert.equal(published, false, "mount cannot publish while a returned callback promise is pending");
  releaseCallback();
  const mounted = await mountPromise;
  assert.equal(published, true);
  let observerDisconnects = 0;
  mounted.scope.observe({ disconnect() { observerDisconnects += 1; } });
  assert.throws(() => mounted.onOptionalReady(() => {}), /registration is sealed/, "registration after producer seal is a violation");
  mounted.dispose();
  assert.equal(observerDisconnects, 1, "fallback mount scope owns observer disposal");
  delete global.__prodigyMeasurementEntry;
  delete global.ProdigyWorkspaceManifest;
});
