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

function createVersionedApp(modules) {
  const files = new Map(Object.entries(modules));
  const versions = new Map([...files.keys()].map((key) => [key, 1]));
  const reads = [];
  return {
    vault: {
      getAbstractFileByPath(modulePath) {
        if (!files.has(modulePath)) return null;
        return { path: modulePath, stat: { mtime: versions.get(modulePath), size: Buffer.byteLength(files.get(modulePath), "utf8") } };
      },
      read(tFile) {
        reads.push(tFile.path);
        return Promise.resolve(files.get(tFile.path));
      },
    },
    reads,
    setModule(modulePath, source) {
      files.set(modulePath, source);
      versions.set(modulePath, (versions.get(modulePath) || 0) + 1);
    },
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
  assert.equal(loader.version, 2);
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

test("Given a loaded real Obsidian file changes mtime, When the Hub renders again, Then the new module replaces the stale cached provider", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createVersionedApp({ "A.js": moduleSource("old-provider") });

  await loader.loadManifest(app, { required: ["A.js"], optional: [] });
  app.setModule("A.js", moduleSource("new-provider"));
  const refreshed = await loader.loadManifest(app, { required: ["A.js"], optional: [] });
  const cached = await loader.loadManifest(app, { required: ["A.js"], optional: [] });

  assert.deepEqual(global.__hubEvents, ["old-provider", "new-provider"]);
  assert.deepEqual(app.reads, ["A.js", "A.js"]);
  assert.deepEqual(refreshed.loaded, ["A.js"]);
  assert.deepEqual(cached.loaded, []);
  assert.deepEqual(cached.required_failures, []);
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

test("Given a required Home seam evaluated without its global, When the renderer requests recovery, Then the shared loader re-evaluates only that required path", async () => {
  const manifests = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));
  const manifest = manifests.get("home");
  const modules = Object.fromEntries(manifest.required.map((modulePath) => [modulePath, ""]));
  const registryPath = "SYSTEM/Views/home-model.js";
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

// ---- Task 7: unified workspace readiness probe (checkReadiness) ----
const DOCTOR_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-doctor.js");
const MANIFEST_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js");

function freshDoctor() {
  delete require.cache[require.resolve(DOCTOR_PATH)];
  delete global.ProdigyDoctor;
  return require(DOCTOR_PATH);
}

function freshManifestApi() {
  delete require.cache[require.resolve(MANIFEST_PATH)];
  delete global.ProdigyWorkspaceManifest;
  return require(MANIFEST_PATH);
}

function readinessApp(files, versions) {
  const store = new Map(Object.entries(files));
  const mtimes = new Map(Object.keys(files).map((key) => [key, (versions && versions[key]) || 1]));
  return {
    vault: {
      getAbstractFileByPath(modulePath) {
        if (!store.has(modulePath)) return null;
        return { path: modulePath, stat: { mtime: mtimes.get(modulePath), size: store.get(modulePath).length } };
      },
      read(tFile) { return Promise.resolve(store.get(tFile.path)); }
    },
    setModule(modulePath, source) { store.set(modulePath, source); mtimes.set(modulePath, (mtimes.get(modulePath) || 0) + 1); },
    removeModule(modulePath) { store.delete(modulePath); }
  };
}

function auctionFiles(manifests, omit = []) {
  const manifest = manifests.get("auction");
  const files = {};
  for (const modulePath of manifest.required.concat(manifest.optional)) {
    if (omit.includes(modulePath)) continue;
    files[modulePath] = `globalThis.__healthProbe = "${modulePath}";`;
  }
  return files;
}

test("Given a missing required module, When checkReadiness runs, Then it blocks with actionable Korean copy naming the module", () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const manifests = freshManifestApi();
  const missing = "SYSTEM/Views/auction-card.js";
  const app = readinessApp(auctionFiles(manifests, [missing]));

  const result = loader.checkReadiness(app, "auction");
  const auction = result.results.auction;

  assert.equal(result.blocked, true);
  assert.equal(auction.ready, false);
  assert.equal(auction.blocked, true);
  assert.equal(auction.reasonCode, "SYNC_PENDING");
  assert.deepEqual(auction.missingRequired, [missing]);
  assert.match(auction.message, /필수 모듈 1개를 불러오지 못했습니다/);
  assert.ok(auction.message.includes(missing), "Korean copy must name what is missing");
  assert.match(auction.message, /동기화/);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(auction), true);
});

test("Given a missing optional module, When checkReadiness runs, Then it stays ready with observable degradation and no substitution", () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const manifests = freshManifestApi();
  const missing = "SYSTEM/Views/auction-key-value-snapshot.js";
  const app = readinessApp(auctionFiles(manifests, [missing]));

  const result = loader.checkReadiness(app, "auction");
  const auction = result.results.auction;

  assert.equal(auction.ready, true);
  assert.equal(auction.blocked, false);
  assert.equal(auction.degraded, true);
  assert.equal(auction.reasonCode, "READY");
  assert.deepEqual(auction.degradedOptional, [missing]);
  assert.match(auction.message, /선택 모듈 없이 계속합니다/);
  assert.ok(auction.message.includes(missing));
  assert.match(auction.message, /핵심 기능은 정상 동작합니다/);
  const probed = auction.modules.map((entry) => entry.path);
  assert.equal(probed.filter((entry) => entry === missing).length, 1, "missing path is reported verbatim, never substituted");
  assert.equal(new Set(probed).size, probed.length, "every probed path appears exactly once");
});

test("Given a cached module whose file version moved, When checkReadiness runs, Then stale cache is never reported as current", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const manifests = freshManifestApi();
  const home = manifests.get("home");
  const throwing = "SYSTEM/Views/home-model.js";
  const files = {};
  global.__hubEvents = [];
  for (const modulePath of home.required) files[modulePath] = moduleSource(modulePath);
  const app = readinessApp(files);
  const probe = loader.checkReadiness(app, "home");
  assert.equal(probe.results.home.modules.find((entry) => entry.path === throwing).state, "present");

  await loader.loadManifest(app, { required: home.required, optional: [] });
  assert.equal(loader.isLoaded(throwing), true);
  app.setModule(throwing, moduleSource("new-home-model"));

  const stale = loader.checkReadiness(app, "home");
  const entry = stale.results.home.modules.find((item) => item.path === throwing);
  assert.equal(entry.cached, false, "moved file version must drop the cached flag");
  assert.equal(entry.state, "stale");
  assert.deepEqual(stale.results.home.staleModules, [throwing]);
  assert.equal(stale.results.home.ready, true, "present-but-stale still probes live and stays ready");

  const clone = loader.checkReadiness(app, { workspaceId: "stale-probe", host: "dataviewjs", required: ["A.js"], optional: [], renderer: "probe" });
  assert.equal(clone.results["stale-probe"].reasonCode, "INVALID_MANIFEST", "unregistered manifest identity must not pass as a workspace");
  delete global.__hubEvents;
});

test("Given a required module that throws during evaluation, When checkReadiness runs, Then it reports REQUIRED_MISSING instead of sync copy", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const manifests = freshManifestApi();
  const auction = manifests.get("auction");
  const failing = "SYSTEM/Views/auction-card.js";
  const files = {};
  for (const modulePath of auction.required) {
    files[modulePath] = modulePath === failing ? throwingModuleSource("TOP_SECRET") : moduleSource(modulePath);
  }
  const app = readinessApp(files);

  const failed = await loader.loadManifest(app, { required: auction.required, optional: [] });
  assert.deepEqual(failed.required_failures.map((failure) => failure.path), [failing]);

  const probe = loader.checkReadiness(app, "auction");
  assert.equal(probe.results.auction.ready, false);
  assert.equal(probe.results.auction.blocked, true);
  assert.equal(probe.results.auction.reasonCode, "REQUIRED_MISSING");
  assert.ok(probe.results.auction.message.includes(failing), "Korean copy still names the throwing module");
  assert.ok(!probe.results.auction.message.includes("TOP_SECRET"), "raw evaluation errors never surface");
  assert.match(probe.results.auction.message, /필수 모듈 1개를 불러오지 못했습니다/);
  const entry = probe.results.auction.modules.find((item) => item.path === failing);
  assert.equal(entry.state, "failed");
  delete global.__hubEvents;
});

test("Given malformed checkReadiness targets, When probing, Then every case is a typed state and never a throw", () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  const app = createApp({});

  assert.equal(loader.checkReadiness(app, "no-such-workspace").results["no-such-workspace"].reasonCode, "UNKNOWN_WORKSPACE");
  assert.equal(loader.checkReadiness(null, "auction").results.auction.reasonCode, "UNAVAILABLE");
  assert.match(loader.checkReadiness(app, "no-such-workspace").results["no-such-workspace"].message, /알 수 없는 작업 공간/);
});

// ---- Task 7: Doctor unified health surface ----
function doctorApp(overrides = {}) {
  return {
    plugins: {
      manifests: overrides.manifests || {},
      enabledPlugins: overrides.enabledPlugins || new Set(),
      getPlugin: overrides.getPlugin || (() => null)
    },
    vault: overrides.vault || null
  };
}

test("Given custom plugins in mixed states, When Doctor checks them, Then each reports installed/enabled with its label", () => {
  const doctor = freshDoctor();
  const app = doctorApp({
    manifests: { "prodigy-ai-runtime": { version: "0.2.0" }, "prodigy-llm-wiki": { version: "0.1.0" } },
    enabledPlugins: new Set(["prodigy-ai-runtime"])
  });

  const results = doctor.checkCustomPlugins(app);
  assert.deepEqual(results.map((entry) => [entry.id, entry.status]), [
    ["prodigy-ai-runtime", "정상"],
    ["prodigy-llm-wiki", "비활성"],
    ["prodigy-vault-assistant", "미설치"]
  ]);
  assert.ok(results.every((entry) => typeof entry.label === "string" && entry.label.length > 0));
  assert.equal(Object.isFrozen(results), true);
});

test("Given runtime status shapes, When Doctor reads provider state, Then only labels surface and raw values never leak", () => {
  const doctor = freshDoctor();
  const secret = "TOP_SECRET_PROVIDER_VALUE_9f8e";
  const ready = doctor.checkProviderRuntime(doctorApp({
    getPlugin: (id) => id === "prodigy-ai-runtime"
      ? { api: { getStatus: () => ({ status: "ready", provider_label: "Demo Provider", model_label: "demo-v1", token: secret }) } }
      : null
  }));
  assert.equal(ready.state, "ready");
  assert.equal(ready.configured, true);
  assert.equal(ready.providerLabel, "Demo Provider");
  assert.equal(ready.detail, "설정됨");
  assert.ok(!JSON.stringify(ready).includes(secret), "allowlisted labels only; unknown fields never surface");

  const missing = doctor.checkProviderRuntime(doctorApp({}));
  assert.equal(missing.state, "missing_plugin");
  assert.equal(missing.configured, false);

  const notConfigured = doctor.checkProviderRuntime(doctorApp({
    getPlugin: () => ({ api: { getStatus: () => ({ status: "failed", error_code: "configuration_missing", detail: secret }) } })
  }));
  assert.equal(notConfigured.state, "not_configured");
  assert.equal(notConfigured.configured, false);
  assert.ok(!JSON.stringify(notConfigured).includes(secret), "raw provider errors never surface");

  const throwing = doctor.checkProviderRuntime(doctorApp({
    getPlugin: () => { throw new Error(secret); }
  }));
  assert.equal(throwing.state, "unavailable");
  assert.ok(!JSON.stringify(throwing).includes(secret));

  const absent = doctor.checkProviderRuntime(null);
  assert.equal(absent.state, "unavailable");
  assert.equal(absent.configured, null);
});

test("Given review snapshots, When Doctor summarizes, Then pending/interrupted counts roll up and garbage stays typed", () => {
  const doctor = freshDoctor();
  const reviewAttrs = doctor.summarizeReview({ pending_count: 2 }, [{ status: "interrupted" }, { status: "review_ready" }, { status: "interrupted" }]);
  assert.deepEqual([reviewAttrs.state, reviewAttrs.pending, reviewAttrs.interrupted], ["attention", 2, 2]);

  const clean = doctor.summarizeReview({ pending_count: 0 }, []);
  assert.deepEqual([clean.state, clean.pending, clean.interrupted], ["ok", 0, 0]);

  for (const garbage of [null, undefined, 42, "nope", { pending_count: -1 }, { pending_count: "many" }]) {
    const typed = doctor.summarizeReview(garbage, null);
    assert.equal(typed.state, "unavailable");
    assert.equal(typed.pending, null);
  }
  const badOps = doctor.summarizeReview({ pending_count: 0 }, [{ nope: true }]);
  assert.equal(badOps.interrupted, null);
  assert.equal(badOps.state, "unavailable");

  const corrupt = doctor.summarizeReview({ status: "blocked", reason: "corrupt_fleeting_review_state", pending_count: 0 }, []);
  assert.equal(corrupt.pending, null, "an unreadable state file must not report its zero as a count");
  assert.equal(corrupt.state, "unavailable");
});

test("Given a corrupt fleeting state file, When Doctor reads health details, Then review is unavailable and the vault is untouched", async () => {
  const doctor = freshDoctor();
  const writes = [];
  const vault = {
    getMarkdownFiles: () => [],
    getAbstractFileByPath: (lookup) => lookup === "SYSTEM/PRIVATE/llmwiki-fleeting-review-state.json" ? { path: lookup } : null,
    read: () => Promise.resolve("corrupt{{{"),
    cachedRead: () => Promise.resolve("corrupt{{{"),
    create: (pathname) => { writes.push(["create", pathname]); return Promise.resolve({ path: pathname }); },
    modify: (file) => { writes.push(["modify", file && file.path]); return Promise.resolve(); }
  };
  const health = await doctor.readHealthDetails({ vault, plugins: { manifests: {}, enabledPlugins: new Set() } }, {
    operations: [], quarantine: [], release: { verdict: "pass" }
  });
  assert.equal(health.review.state, "unavailable");
  assert.equal(health.review.pending, null);
  assert.deepEqual(writes, [], "corrupt input still causes zero vault writes");
});

test("Given quarantine and release inputs, When Doctor summarizes, Then counts and verdicts stay typed without paths or errors", () => {
  const doctor = freshDoctor();
  const quar = doctor.summarizeQuarantine([{ status: "quarantined" }, { status: "active" }, { status: "quarantined" }]);
  assert.deepEqual([quar.state, quar.count], ["attention", 2]);
  assert.deepEqual([doctor.summarizeQuarantine([]).state, doctor.summarizeQuarantine([]).count], ["ok", 0]);
  assert.equal(doctor.summarizeQuarantine(null).state, "unavailable");
  assert.equal(doctor.summarizeQuarantine("garbage").state, "unavailable");

  const released = doctor.summarizeRelease({ verdict: "pass", path: "/Users/someone/secret/receipt.json" });
  assert.equal(released.state, "ok");
  assert.ok(!JSON.stringify(released).includes("/Users/"), "machine paths never surface");

  const failed = doctor.summarizeRelease({ status: "failed", error: "raw stack TOP_SECRET" });
  assert.equal(failed.state, "failed");
  assert.ok(!JSON.stringify(failed).includes("TOP_SECRET"), "raw errors never surface");
  assert.equal(doctor.summarizeRelease(null).state, "unavailable");
});

test("Given mixed health inputs, When Doctor collects health, Then the overall rollup is frozen and diagnosable", () => {
  const doctor = freshDoctor();
  const app = doctorApp({
    manifests: { "prodigy-ai-runtime": { version: "0.2.0" } },
    enabledPlugins: new Set(["prodigy-ai-runtime"]),
    getPlugin: () => ({ api: { getStatus: () => ({ status: "ready" }) } })
  });
  const health = doctor.collectHealth(app, {
    fleeting: { pending_count: 0 },
    operations: [],
    quarantine: [],
    release: { verdict: "pass" }
  });
  assert.ok(["ready", "degraded"].includes(health.overall), "missing custom plugins degrade, never block");
  assert.equal(health.provider.state, "ready");
  assert.equal(health.review.state, "ok");
  assert.equal(health.quarantine.state, "ok");
  assert.equal(health.release.state, "ok");
  assert.equal(Object.isFrozen(health), true);

  const blocked = doctor.collectHealth(doctorApp({}), {
    fleeting: null, operations: null, quarantine: null, release: null,
    workspaceId: "no-such-workspace"
  });
  assert.equal(blocked.review.state, "unavailable");
  assert.equal(blocked.quarantine.state, "unavailable");
  assert.equal(blocked.release.state, "unavailable");
});

function fakeDomNode(tag, options) {
  const node = {
    tag, children: [], text: "", attrs: {},
    createEl(childTag, childOptions) { const child = fakeDomNode(childTag, childOptions); node.children.push(child); return child; },
    setAttribute(key, value) { node.attrs[key] = value; },
    empty() { node.children = []; node.text = ""; }
  };
  Object.defineProperty(node, "textContent", { get() { return node.text; }, set(value) { node.text = String(value); } });
  if (options && options.text !== undefined) node.text = String(options.text);
  return node;
}

function renderedText(node) {
  const parts = [node.text];
  for (const child of node.children) parts.push(renderedText(child));
  return parts.join("\n");
}

test("Given the Doctor surface, When rendered, Then all six health areas appear with no secret and no machine path", () => {
  const doctor = freshDoctor();
  const container = fakeDomNode("div");
  const app = doctorApp({
    manifests: { "prodigy-ai-runtime": { version: "0.2.0" } },
    enabledPlugins: new Set(["prodigy-ai-runtime"]),
    getPlugin: () => ({ api: { getStatus: () => ({ status: "ready", provider_label: "Demo", error_detail: "TOP_SECRET_RENDER_LEAK" }) } })
  });
  const section = doctor.renderDoctor(container, app, {
    health: doctor.collectHealth(app, {
      fleeting: { pending_count: 1 },
      operations: [{ status: "interrupted" }],
      quarantine: { count: 0 },
      release: { verdict: "pass", path: "/Users/someone/Dusk/private.json" }
    })
  });

  assert.ok(section, "renderDoctor returns the section");
  const text = renderedText(container);
  for (const heading of ["작업 공간 상태", "전체", "사용 플러그인", "AI 연결", "검토", "격리", "최근 릴리스"]) {
    assert.ok(text.includes(heading), "health surface shows " + heading);
  }
  assert.ok(!text.includes("TOP_SECRET_RENDER_LEAK"));
  assert.ok(!text.includes("/Users/"));
});

test("Given vault fleeting blocks, When Doctor reads health details, Then pending count is live and the vault is untouched", async () => {
  const doctor = freshDoctor();
  const writes = [];
  const blockText = "unreviewed thought";
  const crypto = require("node:crypto");
  const digest = crypto.createHash("sha256").update(blockText).digest("hex");
  const vault = {
    getMarkdownFiles: () => [{ path: "ZETA/FLEETING/note.md" }],
    getAbstractFileByPath: (lookup) => lookup === "ZETA/FLEETING/note.md" ? { path: lookup } : null,
    read: (file) => Promise.resolve("<!-- fleeting-block-id: probe-block -->\n" + blockText + "\n"),
    cachedRead: (file) => Promise.resolve("<!-- fleeting-block-id: probe-block -->\n" + blockText + "\n"),
    create: (pathname) => { writes.push(["create", pathname]); return Promise.resolve({ path: pathname }); },
    modify: (file) => { writes.push(["modify", file && file.path]); return Promise.resolve(); }
  };
  const health = await doctor.readHealthDetails({ vault, plugins: { manifests: {}, enabledPlugins: new Set() } }, {
    operations: [], quarantine: [], release: { verdict: "pass" }
  });
  assert.equal(health.review.pending, 1, "live fleeting pending count, digest " + digest.slice(0, 12));
  assert.equal(health.review.state, "attention");
  assert.deepEqual(writes, [], "detail reader performs zero vault writes");
});
