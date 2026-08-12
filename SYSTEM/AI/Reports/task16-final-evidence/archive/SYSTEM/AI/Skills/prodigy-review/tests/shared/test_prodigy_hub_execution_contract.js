"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const contract = require(path.join(ROOT, "SYSTEM/Views/prodigy-hub-execution-contract.js"));

function moduleEntry(pathname, evaluator, extra = {}) {
  return {
    path: pathname,
    required: extra.required === undefined ? true : extra.required,
    evaluator,
    exports: extra.exports || [],
    ready: extra.ready || { kind: "global", name: evaluator + ":ready" },
    requires: extra.requires || [],
    order_after: extra.order_after || [],
    side_effects: extra.side_effects || [],
    retry: extra.retry || { enabled: true, max_attempts: 2 }
  };
}

test("Given proven module metadata, When the execution contract is validated, Then all explicit ABI kinds and lifecycle metadata are retained", () => {
  const input = {
    schema_version: 1,
    modules: [
      moduleEntry("SYSTEM/Views/region-core.js", "global_iife", { exports: ["RegionCore"], ready: { kind: "global", name: "RegionCore" }, side_effects: ["global_registration"] }),
      moduleEntry("SYSTEM/Views/common-core.js", "commonjs_bridge", { requires: ["SYSTEM/Views/region-core.js"], order_after: ["SYSTEM/Views/region-core.js"], exports: ["create"], ready: { kind: "module_exports" }, side_effects: { global_registration: false } }),
      moduleEntry("SYSTEM/Views/auction-adapter.js", "local_adapter", { requires: ["SYSTEM/Views/common-core.js"], order_after: ["SYSTEM/Views/common-core.js"], ready: { kind: "adapter_ready" }, retry: { enabled: false, stale_policy: "report" } })
    ]
  };

  const result = contract.validateExecutionContract(input);

  assert.equal(result.ok, true);
  assert.equal(result.valid, true);
  assert.deepEqual(result.value.modules.map((item) => item.evaluator), ["global_iife", "commonjs_bridge", "local_adapter"]);
  assert.deepEqual(result.value.modules[1].requires, ["SYSTEM/Views/region-core.js"]);
  assert.deepEqual(result.value.modules[2].retry, { enabled: false, stale_policy: "report" });
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.modules), true);
});

test("Given a module path without an explicit evaluator, When the contract is validated, Then it fails closed without inspecting source or extension", () => {
  const result = contract.validateExecutionContract({
    schema_version: 1,
    modules: [{
      path: "SYSTEM/Views/looks-commonjs.cjs",
      required: true,
      exports: [],
      ready: { kind: "unknown" },
      requires: [],
      order_after: [],
      side_effects: [],
      retry: { enabled: false }
    }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === "explicit_evaluator_required"), true);
});

test("Given unsafe paths, duplicate order, unknown dependencies, and invalid retry metadata, When validation runs, Then no executable contract is produced", () => {
  const result = contract.validateExecutionContract({
    schema_version: 1,
    modules: [
      moduleEntry("../unsafe.js", "global_iife", { requires: ["missing.js"], order_after: ["missing.js"], retry: { enabled: true, max_attempts: -1 } }),
      moduleEntry("same.js", "global_iife"),
      moduleEntry("same.js", "global_iife")
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === "safe_path_required"), true);
  assert.equal(result.errors.some((item) => item.code === "unknown_dependency"), true);
  assert.equal(result.errors.some((item) => item.code === "non_negative_integer"), true);
  assert.throws(() => contract.createExecutionContract({ schema_version: 1, modules: [] }), /Invalid Hub execution contract/);
});

test("Given a validated contract, When a module is looked up, Then the lookup is explicit and unknown modules remain rejected", () => {
  const value = contract.createExecutionContract({
    schema_version: 1,
    modules: [moduleEntry("SYSTEM/Views/a.js", "global_iife")]
  });

  assert.equal(contract.moduleFor(value, "SYSTEM/Views/a.js").ok, true);
  assert.equal(contract.moduleFor(value, "SYSTEM/Views/missing.js").ok, false);
  assert.equal(contract.safePath("SYSTEM/Views/a.js"), "SYSTEM/Views/a.js");
  assert.equal(contract.safePath("/absolute.js"), "");
});
