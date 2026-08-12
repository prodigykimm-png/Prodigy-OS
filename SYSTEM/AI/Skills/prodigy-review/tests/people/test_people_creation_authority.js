"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/people-core.js"));
const runtime = require(path.join(ROOT, "SYSTEM/Views/capture-action-runtime.js"));
const VIEW_PATH = path.join(ROOT, "SYSTEM/Views/people-view.js");

function evaluatePeopleView(source, peopleStore) {
  const context = {
    globalThis: null,
    module: { exports: {} },
    exports: {},
    require,
    Date,
    setTimeout,
    clearTimeout,
    PeopleCore: {},
    PeopleStore: peopleStore,
    CaptureActionRuntime: runtime
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "people-view.mutation.js" });
  return context.module.exports;
}

function adapterFixture(scenario) {
  const calls = { adapter: 0, direct: 0, writes: 0 };
  const peopleStore = {
    async createPeopleWithCapture(_app, name, human) {
      calls.adapter += 1;
      assert.ok(human && human.confirmation_id, "Capture adapter receives explicit human confirmation");
      if (scenario !== "confirmed") throw new Error(`People Capture write stopped: ${scenario}`);
      calls.writes += 1;
      return { path: `${core.PEOPLE_FOLDER}/${name}.md`, name, capture: { record: { state: "written" } } };
    },
    // Deliberately permissive: a direct-call mutation writes instead of relying on Store fail-closed behavior.
    async createPeople(_app, name) {
      calls.direct += 1;
      calls.writes += 1;
      return { path: `${core.PEOPLE_FOLDER}/${name}.md`, name };
    },
    async readPeopleNote() { throw new Error("preview unavailable in authority fixture"); }
  };
  return { calls, peopleStore };
}

async function invoke(api, scenario) {
  const name = scenario === "empty" ? "" : "권한 검증";
  return api.createAndOpen({ workspace: { openLinkText: async () => true } }, name, {
    human: { confirmation_id: `people-view-${scenario}` }
  });
}

async function assertProductionCallsite() {
  const source = fs.readFileSync(VIEW_PATH, "utf8");
  for (const scenario of ["confirmed", "reject", "stale", "conflict", "duplicate", "empty"]) {
    const fixture = adapterFixture(scenario);
    const api = evaluatePeopleView(source, fixture.peopleStore);
    if (scenario === "confirmed") {
      const result = await invoke(api, scenario);
      assert.equal(result.capture.record.state, "written");
      assert.equal(fixture.calls.writes, 1, "confirmed creation performs one adapter-authorized write");
    } else {
      await assert.rejects(() => invoke(api, scenario), new RegExp(scenario, "i"));
      assert.equal(fixture.calls.writes, 0, `${scenario} creation performs zero writes`);
    }
    assert.equal(fixture.calls.adapter, 1, `${scenario} creation enters the Capture adapter exactly once`);
    assert.equal(fixture.calls.direct, 0, `${scenario} creation never calls the direct writer`);
  }
}

async function assertDirectCallMutationTurnsRed() {
  const source = fs.readFileSync(VIEW_PATH, "utf8");
  const mutated = source.replace("root.PeopleStore.createPeopleWithCapture(", "root.PeopleStore.createPeople(");
  assert.notEqual(mutated, source, "mutation fixture must replace the production adapter call");
  const fixture = adapterFixture("confirmed");
  const api = evaluatePeopleView(mutated, fixture.peopleStore);
  await invoke(api, "confirmed");
  assert.equal(fixture.calls.direct, 1, "permissive direct Store mutation really writes and does not fail closed");
  assert.equal(fixture.calls.writes, 1, "mutation reaches a physical-write-capable fake Store");
  assert.throws(
    () => assert.equal(fixture.calls.adapter, 1, "People view must invoke the Capture adapter exactly once"),
    /Capture adapter exactly once/,
    "mutation must RED for missing Capture authority, not for Store rejection"
  );
}

(async () => {
  await assertProductionCallsite();
  await assertDirectCallMutationTurnsRed();
  console.log("People creation authority tests passed: confirmed=1; reject/stale/conflict/duplicate/empty=0; permissive direct-call mutation=RED(authority).");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
