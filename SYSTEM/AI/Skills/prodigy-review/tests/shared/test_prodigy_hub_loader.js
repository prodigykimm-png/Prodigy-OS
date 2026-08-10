"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const LOADER_PATH = path.join(ROOT, "SYSTEM/Views/prodigy-hub-loader.js");

function loadFreshLoader() {
  delete require.cache[require.resolve(LOADER_PATH)];
  delete global.ProdigyHubLoader;
  return require(LOADER_PATH);
}

function createApp(modules, options = {}) {
  const files = new Map(Object.entries(modules));
  const reads = [];
  const missing = new Set(options.missing || []);
  const readDelays = options.readDelays || {};
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
        const delay = readDelays[tFile.path] || 0;
        const promise = new Promise((resolve) => {
          setTimeout(() => resolve(source), delay);
        });
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

test("Given a missing required module, When loadManifest runs, Then it returns required failure without throwing and still loads optional modules", async () => {
  const loader = loadFreshLoader();
  loader.resetLoaded();
  global.__hubEvents = [];
  const app = createApp({ "A.js": moduleSource("A"), "C.js": moduleSource("C") });

  const result = await loader.loadManifest(app, {
    required: ["A.js", "missing.js"],
    optional: ["C.js"]
  });

  assert.deepEqual(global.__hubEvents, ["A", "C"]);
  assert.deepEqual(result.loaded, ["A.js", "C.js"]);
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

  assert.deepEqual(global.__hubEvents, ["A", "C"]);
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
  assert.deepEqual(failed.loaded, ["A.js", "C.js"]);
  assert.equal(failed.required_failures.length, 1);
  app.setModule("B.js", moduleSource("B"));
  const stillCached = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });
  assert.equal(stillCached.required_failures.length, 1);
  assert.deepEqual(global.__hubEvents, ["A", "C"]);
  const retryResult = loader.retry(["B.js"]);
  const recovered = await loader.loadManifest(app, { required: ["A.js", "B.js"], optional: ["C.js"] });

  assert.deepEqual(retryResult.invalidated, ["B.js"]);
  assert.deepEqual(global.__hubEvents, ["A", "C", "B"]);
  assert.deepEqual(recovered.loaded, ["B.js"]);
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

  assert.deepEqual(missing.loaded, ["A.js", "C.js"]);
  assert.deepEqual(missing.required_failures.map((failure) => failure.path), ["B.js"]);
  assert.deepEqual(retryResult.invalidated, ["B.js"]);
  assert.deepEqual(global.__hubEvents, ["A", "C", "B"]);
  assert.deepEqual(recovered.loaded, ["B.js"]);
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
  }, { readDelays: { "B.js": 10 } });

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
  const app = createApp({ "A.js": throwingModuleSource("TOP_SECRET") }, { readDelays: { "A.js": 20 } });

  const older = loader.loadManifest(app, { required: ["A.js"], optional: [] });
  await Promise.resolve();
  app.setModule("A.js", moduleSource("A"));
  loader.retry(["A.js"]);
  const newer = await loader.loadManifest(app, { required: ["A.js"], optional: [] });
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

  assert.deepEqual(retryResult.invalidated, []);
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
  assert.equal(result.required_failures.length, 2);
  assert.deepEqual(result.required_failures.map((failure) => failure.path), ["A.js", "<invalid>"]);
  assert.equal(result.optional_failures.length, 1);
  assert.deepEqual(result.optional_failures.map((failure) => failure.path), ["<invalid>"]);
  assert.deepEqual(malformedManifest.required_failures.map((failure) => failure.path), ["<invalid>"]);
  assert.deepEqual(nonArrayManifest.required_failures.map((failure) => failure.path), ["<invalid>"]);
  assert.deepEqual(nonArrayManifest.optional_failures.map((failure) => failure.path), ["<invalid>"]);
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

test("Given a mount scope with timers, listeners, observers, and custom cleanup, When disposed twice, Then every resource is released once and guarded callbacks stop", async () => {
  const lifecycle = require(path.join(ROOT, "SYSTEM/Views/prodigy-mount-lifecycle.js"));
  const listeners = [];
  const observer = { disconnectCount: 0, disconnect() { this.disconnectCount += 1; } };
  const host = {
    addEventListener(type, handler) { listeners.push({ type, handler }); },
    removeEventListener(type, handler) {
      const index = listeners.findIndex((item) => item.type === type && item.handler === handler);
      if (index !== -1) listeners.splice(index, 1);
    }
  };
  const scope = lifecycle.createMountScope(host);
  let intervalTicks = 0;
  let cleanups = 0;
  scope.listen("change", () => {});
  scope.observe(observer);
  scope.track(() => { cleanups += 1; });
  scope.interval(() => { intervalTicks += 1; }, 1);
  const guarded = scope.guard(() => { intervalTicks += 100; });

  await new Promise((resolve) => setTimeout(resolve, 5));
  const beforeDispose = intervalTicks;
  assert.equal(beforeDispose > 0, true);
  assert.equal(scope.signal.aborted, false);
  scope.dispose();
  scope.dispose();
  guarded();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(scope.signal.aborted, true);
  assert.equal(scope.disposed, true);
  assert.equal(intervalTicks, beforeDispose);
  assert.equal(listeners.length, 0);
  assert.equal(observer.disconnectCount, 1);
  assert.equal(cleanups, 1);
});
